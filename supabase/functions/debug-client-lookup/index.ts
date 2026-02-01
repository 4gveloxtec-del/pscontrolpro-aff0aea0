import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Debug function to find a client by name and check its properties
 * Query params:
 * - client_name: partial name to search (e.g., "Demetrius")
 * - seller_name: optional seller name to filter
 * - seller_id: optional seller_id to filter directly
 * - list_recent: if true, lists most recent clients for a seller
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const url = new URL(req.url);
    const clientName = url.searchParams.get('client_name') || '';
    const sellerName = url.searchParams.get('seller_name') || '';
    const sellerId = url.searchParams.get('seller_id') || '';
    const listRecent = url.searchParams.get('list_recent') === 'true';

    console.log(`[debug-client-lookup] Searching for client: "${clientName}", seller: "${sellerName}", sellerId: "${sellerId}", listRecent: ${listRecent}`);

    // If listing recent clients for a seller
    if (listRecent && (sellerId || sellerName)) {
      let targetSellerId = sellerId;
      
      // Find seller by name if not provided ID
      if (!targetSellerId && sellerName) {
        const { data: sellers } = await supabase
          .from('profiles')
          .select('id, full_name')
          .or(`full_name.ilike.%${sellerName}%,company_name.ilike.%${sellerName}%`)
          .limit(1);
        
        if (sellers && sellers.length > 0) {
          targetSellerId = sellers[0].id;
        }
      }
      
      if (!targetSellerId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Seller not found' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get total count
      const { count: totalCount } = await supabase
        .from('clients')
        .select('id', { count: 'exact', head: true })
        .eq('seller_id', targetSellerId);

      // Get archived count
      const { count: archivedCount } = await supabase
        .from('clients')
        .select('id', { count: 'exact', head: true })
        .eq('seller_id', targetSellerId)
        .eq('is_archived', true);

      // Get 20 most recent clients
      const { data: recentClients, error } = await supabase
        .from('clients')
        .select('id, name, phone, is_archived, created_at, expiration_date, category, plan_name')
        .eq('seller_id', targetSellerId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;

      return new Response(
        JSON.stringify({
          success: true,
          seller_id: targetSellerId,
          total_clients: totalCount || 0,
          archived_clients: archivedCount || 0,
          active_clients: (totalCount || 0) - (archivedCount || 0),
          recent_20_clients: recentClients?.map(c => ({
            id: c.id,
            name: c.name,
            phone: c.phone,
            is_archived: c.is_archived,
            created_at: c.created_at,
            expiration_date: c.expiration_date,
            category: c.category,
            plan_name: c.plan_name,
          })) || [],
        }, null, 2),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 1. Search for clients matching the name (case insensitive)
    let clientQuery = supabase
      .from('clients')
      .select(`
        id, 
        name, 
        phone, 
        seller_id, 
        is_archived, 
        archived_at,
        created_at,
        expiration_date,
        plan_name,
        server_name,
        category,
        is_test
      `)
      .ilike('name', `%${clientName}%`)
      .limit(20);

    const { data: clients, error: clientsError } = await clientQuery;

    if (clientsError) {
      throw new Error(`Error finding clients: ${clientsError.message}`);
    }

    // 2. Get seller info for each client
    const sellerIds = [...new Set(clients?.map(c => c.seller_id) || [])];
    const { data: sellers } = await supabase
      .from('profiles')
      .select('id, full_name, company_name')
      .in('id', sellerIds);

    const sellerMap = new Map(sellers?.map(s => [s.id, s]) || []);

    // 3. Enrich client data with seller info
    const enrichedClients = (clients || []).map(client => ({
      ...client,
      seller_info: sellerMap.get(client.seller_id) || null,
    }));

    // 4. Check if there are any archived clients
    const archivedClients = enrichedClients.filter(c => c.is_archived === true);
    const activeClients = enrichedClients.filter(c => !c.is_archived);

    // 5. If seller_name is provided, filter results
    let filteredClients = enrichedClients;
    if (sellerName) {
      filteredClients = enrichedClients.filter(c => {
        const seller = c.seller_info;
        if (!seller) return false;
        return (
          seller.full_name?.toLowerCase().includes(sellerName.toLowerCase()) ||
          seller.company_name?.toLowerCase().includes(sellerName.toLowerCase())
        );
      });
    }

    const result = {
      success: true,
      search_term: clientName,
      seller_filter: sellerName || 'none',
      total_found: enrichedClients.length,
      active_clients: activeClients.length,
      archived_clients: archivedClients.length,
      filtered_by_seller: filteredClients.length,
      clients: filteredClients.map(c => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        is_archived: c.is_archived,
        archived_at: c.archived_at,
        created_at: c.created_at,
        expiration_date: c.expiration_date,
        plan_name: c.plan_name,
        server_name: c.server_name,
        category: c.category,
        is_test: c.is_test,
        seller_id: c.seller_id,
        seller_name: c.seller_info?.full_name || 'Unknown',
        seller_company: c.seller_info?.company_name || '',
      })),
      all_sellers_with_matches: [...new Set(enrichedClients.map(c => c.seller_info?.full_name || 'Unknown'))],
    };

    console.log(`[debug-client-lookup] Found ${result.total_found} clients, ${result.archived_clients} archived`);

    return new Response(
      JSON.stringify(result, null, 2),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[debug-client-lookup] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
