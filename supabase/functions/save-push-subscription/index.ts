import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[save-push-subscription] Request received');
    
    const authHeader = req.headers.get('Authorization');
    console.log('[save-push-subscription] Auth header present:', !!authHeader);
    
    if (!authHeader) {
      console.error('[save-push-subscription] No authorization header');
      throw new Error('No authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    console.log('[save-push-subscription] Supabase URL:', supabaseUrl ? 'present' : 'missing');
    console.log('[save-push-subscription] Service Role Key:', serviceRoleKey ? 'present' : 'missing');
    
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    console.log('[save-push-subscription] Auth result - User:', user?.id, 'Error:', authError?.message);
    
    if (authError || !user) {
      console.error('[save-push-subscription] Unauthorized:', authError?.message);
      throw new Error('Unauthorized');
    }

    const body = await req.json();
    const { subscription, action } = body;
    console.log('[save-push-subscription] Action:', action, 'Subscription endpoint:', subscription?.endpoint?.substring(0, 50));

    if (action === 'unsubscribe') {
      // Remove subscription
      const { error: deleteError } = await supabaseAdmin
        .from('push_subscriptions')
        .delete()
        .eq('user_id', user.id)
        .eq('endpoint', subscription.endpoint);

      if (deleteError) {
        console.error('[save-push-subscription] Delete error:', deleteError);
        throw new Error(`Error removing subscription: ${deleteError.message}`);
      }

      console.log('[save-push-subscription] Subscription removed for user:', user.id);
      return new Response(JSON.stringify({ success: true, action: 'unsubscribed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Subscribe - save or update subscription
    const { endpoint, keys } = subscription;
    console.log('[save-push-subscription] Keys present - p256dh:', !!keys?.p256dh, 'auth:', !!keys?.auth);
    
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      console.error('[save-push-subscription] Invalid subscription object');
      throw new Error('Invalid subscription object');
    }

    // Upsert subscription (update if exists, insert if not)
    const { data: upsertData, error: upsertError } = await supabaseAdmin
      .from('push_subscriptions')
      .upsert({
        user_id: user.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,endpoint'
      })
      .select();

    if (upsertError) {
      console.error('[save-push-subscription] Upsert error:', upsertError);
      throw new Error(`Error saving subscription: ${upsertError.message}`);
    }

    console.log('[save-push-subscription] Subscription saved for user:', user.id, 'Data:', upsertData);
    return new Response(JSON.stringify({ success: true, action: 'subscribed' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('[save-push-subscription] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: message === 'Unauthorized' ? 401 : 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
