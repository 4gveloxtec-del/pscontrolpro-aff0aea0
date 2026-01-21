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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Starting instance block check...');

    // Call the database function to check and block expired instances
    const { data: blockedInstances, error: blockError } = await supabase
      .rpc('check_and_block_expired_instances');

    if (blockError) {
      console.error('Error blocking instances:', blockError);
      throw blockError;
    }

    console.log('Blocked instances:', blockedInstances);

    // Also check for instances that should be unblocked (seller renewed)
    const { data: sellersToUnblock, error: unblockCheckError } = await supabase
      .from('whatsapp_seller_instances')
      .select(`
        id,
        seller_id,
        instance_name,
        instance_blocked,
        profiles!inner(
          id,
          email,
          subscription_expires_at,
          is_permanent
        )
      `)
      .eq('instance_blocked', true);

    if (unblockCheckError) {
      console.error('Error checking instances to unblock:', unblockCheckError);
    }

    const unblocked: any[] = [];

    if (sellersToUnblock) {
      for (const instance of sellersToUnblock) {
        const profile = instance.profiles as any;
        const shouldUnblock = profile.is_permanent || 
          (profile.subscription_expires_at && new Date(profile.subscription_expires_at) > new Date());

        if (shouldUnblock) {
          const { error: unblockError } = await supabase
            .rpc('unblock_seller_instance', { p_seller_id: instance.seller_id });

          if (!unblockError) {
            unblocked.push({
              seller_id: instance.seller_id,
              seller_email: profile.email,
              instance_name: instance.instance_name,
            });
            console.log('Unblocked instance for seller:', instance.seller_id);
          }
        }
      }
    }

    const result = {
      success: true,
      timestamp: new Date().toISOString(),
      blocked: blockedInstances || [],
      unblocked,
      summary: {
        blocked_count: blockedInstances?.length || 0,
        unblocked_count: unblocked.length,
      },
    };

    console.log('Check completed:', result.summary);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Error in check-instance-blocks:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
