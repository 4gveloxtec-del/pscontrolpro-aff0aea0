import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BATCH_SIZE = 500;
const GLOBAL_TIMEOUT_MS = 55000; // 55 seconds to stay under Deno's 60s limit

// Helper to fetch all records from a table with pagination
async function fetchAllPaginated(
  supabase: any,
  table: string,
  filter: { column: string; value: string }
): Promise<{ data: any[]; error: any }> {
  const allData: any[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq(filter.column, filter.value)
      .range(offset, offset + BATCH_SIZE - 1)
      .order('created_at', { ascending: true, nullsFirst: true });

    if (error) {
      return { data: [], error };
    }

    if (data && data.length > 0) {
      allData.push(...data);
      offset += BATCH_SIZE;
      hasMore = data.length === BATCH_SIZE;
    } else {
      hasMore = false;
    }
  }

  return { data: allData, error: null };
}

// Helper for tables that might not have created_at
async function fetchAllPaginatedSimple(
  supabase: any,
  table: string,
  filter: { column: string; value: string }
): Promise<{ data: any[]; error: any }> {
  const allData: any[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq(filter.column, filter.value)
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) {
      return { data: [], error };
    }

    if (data && data.length > 0) {
      allData.push(...data);
      offset += BATCH_SIZE;
      hasMore = data.length === BATCH_SIZE;
    } else {
      hasMore = false;
    }
  }

  return { data: allData, error: null };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Global timeout to prevent hanging
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GLOBAL_TIMEOUT_MS);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      clearTimeout(timeoutId);
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify the user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      clearTimeout(timeoutId);
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if aborted
    if (controller.signal.aborted) {
      throw new Error('Request timed out');
    }

    // Standardized logging
    const timestamp = new Date().toISOString();
    console.log(`[backup-data] timestamp=${timestamp} seller_id=${user.id} action=export_start status=processing batch_size=${BATCH_SIZE}`);

    const sellerId = user.id;
    const sellerFilter = { column: 'seller_id', value: sellerId };

    // Fetch all data in parallel with pagination
    // Group 1: Tables with seller_id and created_at
    const [
      clientsResult,
      plansResult,
      serversResult,
      couponsResult,
      referralsResult,
      templatesResult,
      billsResult,
      panelsResult,
      messageHistoryResult,
    ] = await Promise.all([
      fetchAllPaginated(supabase, 'clients', sellerFilter),
      fetchAllPaginated(supabase, 'plans', sellerFilter),
      fetchAllPaginated(supabase, 'servers', sellerFilter),
      fetchAllPaginated(supabase, 'coupons', sellerFilter),
      fetchAllPaginated(supabase, 'referrals', sellerFilter),
      fetchAllPaginated(supabase, 'whatsapp_templates', sellerFilter),
      fetchAllPaginated(supabase, 'bills_to_pay', sellerFilter),
      fetchAllPaginated(supabase, 'shared_panels', sellerFilter),
      fetchAllPaginated(supabase, 'message_history', sellerFilter),
    ]);

    // Check if aborted after first group
    if (controller.signal.aborted) {
      throw new Error('Request timed out after fetching primary data');
    }

    // Group 2: Tables that may not have created_at or have different structure
    const [
      panelClientsResult,
      profilesResult,
      clientCategoriesResult,
      externalAppsResult,
      clientExternalAppsResult,
      serverAppsResult,
      clientPremiumAccountsResult,
    ] = await Promise.all([
      fetchAllPaginatedSimple(supabase, 'panel_clients', sellerFilter),
      supabase.from('profiles').select('*').eq('id', sellerId),
      fetchAllPaginatedSimple(supabase, 'client_categories', sellerFilter),
      fetchAllPaginatedSimple(supabase, 'external_apps', sellerFilter),
      fetchAllPaginatedSimple(supabase, 'client_external_apps', sellerFilter),
      fetchAllPaginatedSimple(supabase, 'server_apps', sellerFilter),
      fetchAllPaginatedSimple(supabase, 'client_premium_accounts', sellerFilter),
    ]);

    clearTimeout(timeoutId);

    // Check for any errors
    const errors: string[] = [];
    if (clientsResult.error) errors.push(`clients: ${clientsResult.error.message}`);
    if (plansResult.error) errors.push(`plans: ${plansResult.error.message}`);
    if (serversResult.error) errors.push(`servers: ${serversResult.error.message}`);
    if (couponsResult.error) errors.push(`coupons: ${couponsResult.error.message}`);
    if (referralsResult.error) errors.push(`referrals: ${referralsResult.error.message}`);
    if (templatesResult.error) errors.push(`templates: ${templatesResult.error.message}`);
    if (billsResult.error) errors.push(`bills: ${billsResult.error.message}`);
    if (panelsResult.error) errors.push(`panels: ${panelsResult.error.message}`);
    if (messageHistoryResult.error) errors.push(`message_history: ${messageHistoryResult.error.message}`);
    if (panelClientsResult.error) errors.push(`panel_clients: ${panelClientsResult.error.message}`);
    if (clientCategoriesResult.error) errors.push(`client_categories: ${clientCategoriesResult.error.message}`);
    if (externalAppsResult.error) errors.push(`external_apps: ${externalAppsResult.error.message}`);
    if (clientExternalAppsResult.error) errors.push(`client_external_apps: ${clientExternalAppsResult.error.message}`);
    if (serverAppsResult.error) errors.push(`server_apps: ${serverAppsResult.error.message}`);
    if (clientPremiumAccountsResult.error) errors.push(`client_premium_accounts: ${clientPremiumAccountsResult.error.message}`);

    if (errors.length > 0) {
      console.error(`[backup-data] fetch_errors=${JSON.stringify(errors)}`);
    }

    const nowIso = new Date().toISOString();

    const backup = {
      version: '1.0',
      timestamp: nowIso,
      // Backward compatibility
      created_at: nowIso,
      user_id: user.id,
      user_email: user.email,

      user: {
        id: user.id,
        email: user.email,
      },

      data: {
        clients: clientsResult.data || [],
        plans: plansResult.data || [],
        servers: serversResult.data || [],
        coupons: couponsResult.data || [],
        referrals: referralsResult.data || [],
        whatsapp_templates: templatesResult.data || [],
        bills_to_pay: billsResult.data || [],
        shared_panels: panelsResult.data || [],
        panel_clients: panelClientsResult.data || [],
        message_history: messageHistoryResult.data || [],
        profiles: profilesResult.data || [],
        client_categories: clientCategoriesResult.data || [],
        external_apps: externalAppsResult.data || [],
        client_external_apps: clientExternalAppsResult.data || [],
        server_apps: serverAppsResult.data || [],
        client_premium_accounts: clientPremiumAccountsResult.data || [],
      },
      stats: {
        clients_count: (clientsResult.data || []).length,
        plans_count: (plansResult.data || []).length,
        servers_count: (serversResult.data || []).length,
        coupons_count: (couponsResult.data || []).length,
        templates_count: (templatesResult.data || []).length,
        panels_count: (panelsResult.data || []).length,
        referrals_count: (referralsResult.data || []).length,
        bills_count: (billsResult.data || []).length,
        message_history_count: (messageHistoryResult.data || []).length,
        profiles_count: (profilesResult.data || []).length,
        categories_count: (clientCategoriesResult.data || []).length,
        external_apps_count: (externalAppsResult.data || []).length,
        client_external_apps_count: (clientExternalAppsResult.data || []).length,
        server_apps_count: (serverAppsResult.data || []).length,
        client_premium_accounts_count: (clientPremiumAccountsResult.data || []).length,
      }
    };

    console.log(`[backup-data] timestamp=${new Date().toISOString()} seller_id=${user.id} action=export_complete status=success details=${JSON.stringify(backup.stats)}`);

    return new Response(
      JSON.stringify(backup),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    clearTimeout(timeoutId);
    
    const isTimeout = error instanceof Error && (
      error.name === 'AbortError' || 
      error.message.includes('timed out')
    );
    
    console.error(`[backup-data] timestamp=${new Date().toISOString()} action=export_error status=failed error=${error instanceof Error ? error.message : 'Unknown'} isTimeout=${isTimeout}`);
    
    return new Response(
      JSON.stringify({ 
        error: isTimeout 
          ? 'Backup timed out. Try exporting with fewer data or contact support.' 
          : (error instanceof Error ? error.message : 'Unknown error') 
      }),
      { status: isTimeout ? 504 : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
