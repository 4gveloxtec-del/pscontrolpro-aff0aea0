import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify the user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Standardized logging
    const timestamp = new Date().toISOString();
    console.log(`[backup-data] timestamp=${timestamp} seller_id=${user.id} action=export_start status=processing`);

    // Fetch all user data including profiles and client_categories
    const [
      clientsResult,
      plansResult,
      serversResult,
      couponsResult,
      referralsResult,
      templatesResult,
      billsResult,
      panelsResult,
      panelClientsResult,
      messageHistoryResult,
      profilesResult,
      clientCategoriesResult
    ] = await Promise.all([
      supabase.from('clients').select('*').eq('seller_id', user.id),
      supabase.from('plans').select('*').eq('seller_id', user.id),
      supabase.from('servers').select('*').eq('seller_id', user.id),
      supabase.from('coupons').select('*').eq('seller_id', user.id),
      supabase.from('referrals').select('*').eq('seller_id', user.id),
      supabase.from('whatsapp_templates').select('*').eq('seller_id', user.id),
      supabase.from('bills_to_pay').select('*').eq('seller_id', user.id),
      supabase.from('shared_panels').select('*').eq('seller_id', user.id),
      supabase.from('panel_clients').select('*').eq('seller_id', user.id),
      supabase.from('message_history').select('*').eq('seller_id', user.id),
      supabase.from('profiles').select('*').eq('id', user.id),
      supabase.from('client_categories').select('*').eq('seller_id', user.id)
    ]);

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
        client_categories: clientCategoriesResult.data || []
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
        categories_count: (clientCategoriesResult.data || []).length
      }
    };

    console.log(`[backup-data] timestamp=${new Date().toISOString()} seller_id=${user.id} action=export_complete status=success details=${JSON.stringify(backup.stats)}`);

    return new Response(
      JSON.stringify(backup),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error(`[backup-data] timestamp=${new Date().toISOString()} action=export_error status=failed error=${error instanceof Error ? error.message : 'Unknown'}`);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
