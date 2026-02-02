import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Corrige usuários que têm role mas não têm profile.
 * Isso pode acontecer quando o trigger handle_new_user falha parcialmente.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get trial days from settings
    const { data: trialSetting } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'seller_trial_days')
      .maybeSingle();
    
    const trialDays = parseInt(trialSetting?.value || '5', 10);

    // Get all auth users
    const { data: authUsersData } = await supabase.auth.admin.listUsers();
    const authUsers = authUsersData?.users || [];

    // Get all profiles
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id');

    const profileIds = new Set(profiles?.map(p => p.id) || []);

    // Get all roles
    const { data: roles } = await supabase
      .from('user_roles')
      .select('user_id, role');

    const roleMap: Record<string, string> = {};
    roles?.forEach(r => { roleMap[r.user_id] = r.role; });

    // Find auth users without profiles
    const usersWithoutProfiles = authUsers.filter(u => !profileIds.has(u.id));

    const fixed: { email: string; profile_created: boolean; role_created: boolean; error?: string }[] = [];

    for (const user of usersWithoutProfiles) {
      const result: { email: string; profile_created: boolean; role_created: boolean; error?: string } = {
        email: user.email || 'unknown',
        profile_created: false,
        role_created: false
      };

      try {
        // Check if user has role
        const existingRole = roleMap[user.id];
        const isAdmin = existingRole === 'admin';

        // Create profile
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: user.id,
            email: user.email,
            full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Usuário',
            whatsapp: user.user_metadata?.whatsapp || null,
            subscription_expires_at: isAdmin ? null : new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000).toISOString(),
            is_permanent: isAdmin,
            is_active: true
          });

        if (profileError) {
          result.error = profileError.message;
        } else {
          result.profile_created = true;
          console.log(`[fix-missing-profiles] Created profile for ${user.email}`);

          // If user is seller, create default data
          if (existingRole === 'seller') {
            try {
              await supabase.rpc('create_default_plans_for_seller', { seller_uuid: user.id });
              await supabase.rpc('create_default_templates_for_seller', { seller_uuid: user.id });
            } catch (e) {
              console.log(`[fix-missing-profiles] Could not create default data for ${user.email}:`, e);
            }
          }
        }

        // Create role if doesn't exist
        if (!existingRole) {
          const { error: roleError } = await supabase
            .from('user_roles')
            .insert({ user_id: user.id, role: 'seller' });

          if (!roleError) {
            result.role_created = true;
            console.log(`[fix-missing-profiles] Created seller role for ${user.email}`);
          }
        }

      } catch (e) {
        result.error = e instanceof Error ? e.message : String(e);
      }

      fixed.push(result);
    }

    return new Response(
      JSON.stringify({
        success: true,
        users_without_profiles: usersWithoutProfiles.length,
        fixed,
        message: fixed.length > 0 
          ? `✅ Corrigidos ${fixed.filter(f => f.profile_created).length} de ${usersWithoutProfiles.length} usuários`
          : '✅ Nenhum usuário para corrigir'
      }, null, 2),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[fix-missing-profiles] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
