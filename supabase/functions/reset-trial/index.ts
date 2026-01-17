import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create client with user's auth to get their identity
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Validate the token and get claims
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabaseUser.auth.getUser(token);
    
    if (claimsError || !claimsData?.user) {
      console.log('Auth error:', claimsError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const currentUserId = claimsData.user.id;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { user_id } = await req.json().catch(() => ({}));
    const targetUserId = user_id || currentUserId;

    // Check if current user is admin (can reset any user) or resetting own trial
    const { data: roleData } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', currentUserId)
      .maybeSingle();

    const isAdmin = roleData?.role === 'admin';

    // Only admin can reset other users' trials
    if (targetUserId !== currentUserId && !isAdmin) {
      return new Response(JSON.stringify({ error: 'Only admins can reset other users trials' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update the profile's created_at to now
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({ created_at: new Date().toISOString() })
      .eq('id', targetUserId);

    if (updateError) {
      console.log('Update error:', updateError);
      return new Response(JSON.stringify({ error: updateError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Trial reset successfully for user:', targetUserId);
    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Trial period reset to 5 days from now' 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});