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
    
    // Get the authorization header to verify admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify the requesting user is an admin
    const token = authHeader.replace('Bearer ', '');
    const { data: { user: requestingUser }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !requestingUser) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if requesting user is admin
    const { data: roleData, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', requestingUser.id)
      .eq('role', 'admin')
      .single();

    if (roleError || !roleData) {
      return new Response(
        JSON.stringify({ error: 'Only admins can wipe data' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { confirmationCode } = await req.json();
    
    // Require confirmation code for safety
    if (confirmationCode !== 'APAGAR-TUDO') {
      return new Response(
        JSON.stringify({ error: 'Invalid confirmation code. Type APAGAR-TUDO to confirm.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Starting WIPE ALL DATA process...');
    console.log('Admin performing wipe: [REDACTED]');

    const results = {
      clients_deleted: 0,
      sellers_deleted: 0,
      related_data_deleted: 0
    };

    // Get all sellers except the admin performing the wipe
    const { data: sellersToDelete, error: sellersError } = await supabase
      .from('profiles')
      .select('id, email')
      .neq('id', requestingUser.id);

    if (sellersError) {
      throw new Error(`Error fetching sellers: ${sellersError.message}`);
    }

    console.log(`Found ${sellersToDelete?.length || 0} sellers to delete`);

    // Delete data for each seller
    for (const seller of (sellersToDelete || [])) {
      console.log(`Deleting data for seller: ${seller.email}`);

      // Delete all related data in correct order (respecting foreign keys)
      const deleteOperations = [
        // First level - no dependencies
        supabase.from('chatbot_send_logs').delete().eq('seller_id', seller.id),
        supabase.from('chatbot_interactions').delete().eq('seller_id', seller.id),
        supabase.from('chatbot_flow_sessions').delete().eq('seller_id', seller.id),
        supabase.from('client_notification_tracking').delete().eq('seller_id', seller.id),
        supabase.from('connection_logs').delete().eq('seller_id', seller.id),
        supabase.from('connection_alerts').delete().eq('seller_id', seller.id),
        supabase.from('message_queue').delete().eq('seller_id', seller.id),
        supabase.from('reseller_notification_tracking').delete().eq('admin_id', seller.id),
      ];
      
      await Promise.all(deleteOperations);

      // Second level - depends on clients
      await Promise.all([
        supabase.from('client_external_apps').delete().eq('seller_id', seller.id),
        supabase.from('client_premium_accounts').delete().eq('seller_id', seller.id),
        supabase.from('panel_clients').delete().eq('seller_id', seller.id),
        supabase.from('message_history').delete().eq('seller_id', seller.id),
        supabase.from('referrals').delete().eq('seller_id', seller.id),
      ]);

      // Third level - chatbot contacts (depends on clients)
      await supabase.from('chatbot_contacts').delete().eq('seller_id', seller.id);

      // Fourth level - clients
      const { count: clientCount } = await supabase
        .from('clients')
        .select('*', { count: 'exact', head: true })
        .eq('seller_id', seller.id);
      
      await supabase.from('clients').delete().eq('seller_id', seller.id);
      results.clients_deleted += clientCount || 0;

      // Fifth level - chatbot flow nodes (depends on flows)
      await supabase.from('chatbot_flow_nodes').delete().eq('seller_id', seller.id);
      
      // Sixth level - other data
      await Promise.all([
        supabase.from('chatbot_flows').delete().eq('seller_id', seller.id),
        supabase.from('chatbot_rules').delete().eq('seller_id', seller.id),
        supabase.from('chatbot_settings').delete().eq('seller_id', seller.id),
        supabase.from('chatbot_template_categories').delete().eq('seller_id', seller.id),
        supabase.from('chatbot_templates').delete().eq('seller_id', seller.id),
        supabase.from('server_apps').delete().eq('seller_id', seller.id),
        supabase.from('plans').delete().eq('seller_id', seller.id),
        supabase.from('servers').delete().eq('seller_id', seller.id),
        supabase.from('coupons').delete().eq('seller_id', seller.id),
        supabase.from('whatsapp_templates').delete().eq('seller_id', seller.id),
        supabase.from('bills_to_pay').delete().eq('seller_id', seller.id),
        supabase.from('shared_panels').delete().eq('seller_id', seller.id),
        supabase.from('client_categories').delete().eq('seller_id', seller.id),
        supabase.from('external_apps').delete().eq('seller_id', seller.id),
        supabase.from('custom_products').delete().eq('seller_id', seller.id),
        supabase.from('monthly_profits').delete().eq('seller_id', seller.id),
        supabase.from('whatsapp_seller_instances').delete().eq('seller_id', seller.id),
        supabase.from('seller_queue_settings').delete().eq('seller_id', seller.id),
        supabase.from('push_subscriptions').delete().eq('user_id', seller.id),
      ]);

      // Delete the user role
      await supabase.from('user_roles').delete().eq('user_id', seller.id);

      // Delete the profile
      await supabase.from('profiles').delete().eq('id', seller.id);

      // Delete the user from auth
      try {
        await supabase.auth.admin.deleteUser(seller.id);
        results.sellers_deleted++;
        console.log(`Deleted seller: ${seller.email}`);
      } catch (deleteAuthError) {
        console.error(`Error deleting auth user ${seller.email}:`, deleteAuthError);
      }
    }

    // Also delete admin's clients if requested (admin keeps their account)
    const { count: adminClientCount } = await supabase
      .from('clients')
      .select('*', { count: 'exact', head: true })
      .eq('seller_id', requestingUser.id);

    // Delete admin's client-related data
    await Promise.all([
      supabase.from('client_notification_tracking').delete().eq('seller_id', requestingUser.id),
      supabase.from('client_external_apps').delete().eq('seller_id', requestingUser.id),
      supabase.from('client_premium_accounts').delete().eq('seller_id', requestingUser.id),
      supabase.from('panel_clients').delete().eq('seller_id', requestingUser.id),
      supabase.from('message_history').delete().eq('seller_id', requestingUser.id),
      supabase.from('referrals').delete().eq('seller_id', requestingUser.id),
      supabase.from('chatbot_contacts').delete().eq('seller_id', requestingUser.id),
    ]);

    await supabase.from('clients').delete().eq('seller_id', requestingUser.id);
    results.clients_deleted += adminClientCount || 0;

    console.log('WIPE ALL DATA completed successfully');
    console.log(`Results: ${JSON.stringify(results)}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Todos os dados foram apagados com sucesso!',
        results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in wipe-all-data:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
