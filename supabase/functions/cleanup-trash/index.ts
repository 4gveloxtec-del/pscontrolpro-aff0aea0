import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
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
        JSON.stringify({ error: 'Only admins can run cleanup' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Starting cleanup process...');

    const results = {
      expired_sellers: 0,
      inactive_sellers: 0,
      old_login_attempts: 0,
      old_messages: 0
    };

    // 1. Find expired sellers (subscription_expires_at passed and not permanent)
    const { data: expiredSellers, error: expiredError } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('is_permanent', false)
      .eq('is_active', true)
      .lt('subscription_expires_at', new Date().toISOString());

    if (expiredSellers && expiredSellers.length > 0) {
      // Deactivate expired sellers
      for (const seller of expiredSellers) {
        await supabase
          .from('profiles')
          .update({ is_active: false })
          .eq('id', seller.id);
        
        results.expired_sellers++;
        console.log('Deactivated expired seller:', seller.id);
      }
    }

    // 2. Find sellers inactive for more than 90 days (not permanent)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const { data: inactiveSellers, error: inactiveError } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('is_permanent', false)
      .eq('is_active', false)
      .lt('updated_at', ninetyDaysAgo.toISOString());

    if (inactiveSellers && inactiveSellers.length > 0) {
      for (const seller of inactiveSellers) {
        // Delete all seller data
        await Promise.all([
          supabase.from('panel_clients').delete().eq('seller_id', seller.id),
          supabase.from('message_history').delete().eq('seller_id', seller.id),
          supabase.from('referrals').delete().eq('seller_id', seller.id),
        ]);
        
        await supabase.from('clients').delete().eq('seller_id', seller.id);
        
        await Promise.all([
          supabase.from('plans').delete().eq('seller_id', seller.id),
          supabase.from('servers').delete().eq('seller_id', seller.id),
          supabase.from('coupons').delete().eq('seller_id', seller.id),
          supabase.from('whatsapp_templates').delete().eq('seller_id', seller.id),
          supabase.from('bills_to_pay').delete().eq('seller_id', seller.id),
          supabase.from('shared_panels').delete().eq('seller_id', seller.id),
        ]);

        // Delete the user from auth
        await supabase.auth.admin.deleteUser(seller.id);
        
        results.inactive_sellers++;
        console.log('Deleted inactive seller:', seller.id);
      }
    }

    // 3. Cleanup old login attempts (older than 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: loginAttemptsDeleted } = await supabase
      .from('login_attempts')
      .delete()
      .lt('attempt_at', oneDayAgo);
    
    results.old_login_attempts = loginAttemptsDeleted || 0;

    // 4. Cleanup old message history (older than 1 year)
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    
    const { count: messagesDeleted } = await supabase
      .from('message_history')
      .delete()
      .lt('sent_at', oneYearAgo.toISOString());
    
    results.old_messages = messagesDeleted || 0;

    console.log('Cleanup completed:', results);

    return new Response(
      JSON.stringify({ 
        success: true,
        results,
        message: 'Limpeza concluída com sucesso'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Cleanup error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
