import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Debug function to check client data integrity for a seller
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
    const sellerName = url.searchParams.get('seller_name') || 'SANDEL';

    // Find seller
    const { data: sellers } = await supabase
      .from('profiles')
      .select('id, full_name, company_name, created_at')
      .or(`full_name.ilike.%${sellerName}%,company_name.ilike.%${sellerName}%`)
      .limit(1);

    const seller = sellers?.[0];
    if (!seller) {
      return new Response(
        JSON.stringify({ success: false, error: 'Seller not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get total clients count
    const { count: totalClients } = await supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('seller_id', seller.id);

    // Get archived clients count
    const { count: archivedClients } = await supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('seller_id', seller.id)
      .eq('is_archived', true);

    // Check notification tracking (to see if there were ever clients)
    const { count: notificationCount } = await supabase
      .from('client_notification_tracking')
      .select('id', { count: 'exact', head: true })
      .eq('seller_id', seller.id);

    // Check sent_messages table
    const { count: sentMessagesCount } = await supabase
      .from('sent_messages')
      .select('id', { count: 'exact', head: true })
      .eq('seller_id', seller.id);

    // Check billing_reminders
    const { count: billingRemindersCount } = await supabase
      .from('billing_reminders')
      .select('id', { count: 'exact', head: true })
      .eq('seller_id', seller.id);

    // Check client_external_apps
    const { count: externalAppsCount } = await supabase
      .from('client_external_apps')
      .select('id', { count: 'exact', head: true })
      .eq('seller_id', seller.id);

    // Check client_premium_accounts
    const { count: premiumAccountsCount } = await supabase
      .from('client_premium_accounts')
      .select('id', { count: 'exact', head: true })
      .eq('seller_id', seller.id);

    // Check plans
    const { count: plansCount } = await supabase
      .from('plans')
      .select('id', { count: 'exact', head: true })
      .eq('seller_id', seller.id);

    // Check servers
    const { count: serversCount } = await supabase
      .from('servers')
      .select('id', { count: 'exact', head: true })
      .eq('seller_id', seller.id);

    // Get last 5 operations from any log tables
    const { data: recentLogs } = await supabase
      .from('command_logs')
      .select('id, command_text, created_at, success')
      .eq('owner_id', seller.id)
      .order('created_at', { ascending: false })
      .limit(5);

    // Check if there's a backup job
    const { data: backupJobs } = await supabase
      .from('backup_import_jobs')
      .select('id, status, created_at, modules, restored')
      .eq('admin_id', seller.id)
      .order('created_at', { ascending: false })
      .limit(3);

    const result = {
      success: true,
      seller: {
        id: seller.id,
        name: seller.full_name,
        company: seller.company_name,
        created_at: seller.created_at,
      },
      data_summary: {
        total_clients: totalClients || 0,
        archived_clients: archivedClients || 0,
        notification_tracking_records: notificationCount || 0,
        sent_messages: sentMessagesCount || 0,
        billing_reminders: billingRemindersCount || 0,
        external_apps: externalAppsCount || 0,
        premium_accounts: premiumAccountsCount || 0,
        plans: plansCount || 0,
        servers: serversCount || 0,
      },
      has_historical_data: (notificationCount || 0) > 0 || (sentMessagesCount || 0) > 0,
      recent_command_logs: recentLogs || [],
      backup_jobs: backupJobs || [],
      diagnosis: '',
    };

    // Diagnosis
    if (result.data_summary.total_clients === 0) {
      if (result.has_historical_data) {
        result.diagnosis = '⚠️ ANOMALIA: Seller tem histórico de notificações/mensagens mas ZERO clientes. Possível perda de dados ou exclusão em massa.';
      } else if (result.data_summary.plans > 0 || result.data_summary.servers > 0) {
        result.diagnosis = '⚠️ Seller tem planos/servidores configurados mas nenhum cliente ainda. Pode ser uma conta nova ou dados foram apagados.';
      } else {
        result.diagnosis = 'ℹ️ Conta parece nova - nenhum cliente, plano ou servidor cadastrado.';
      }
    } else {
      result.diagnosis = `✅ Seller tem ${result.data_summary.total_clients} cliente(s) no banco de dados.`;
    }

    return new Response(
      JSON.stringify(result, null, 2),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[debug-seller-integrity] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
