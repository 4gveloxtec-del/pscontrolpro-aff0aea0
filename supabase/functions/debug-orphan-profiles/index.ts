import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Diagnóstico: encontra profiles que não têm role associada em user_roles
 * Isso identifica usuários que foram criados mas não aparecerão no Painel ADM
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get all profiles
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, email, full_name, created_at, is_active')
      .order('created_at', { ascending: false });

    if (profilesError) throw profilesError;

    // Get all auth users to compare
    const { data: authUsersData } = await supabase.auth.admin.listUsers();
    const authUsers = authUsersData?.users || [];

    // Get all user_roles
    const { data: roles, error: rolesError } = await supabase
      .from('user_roles')
      .select('user_id, role');

    if (rolesError) throw rolesError;

    // Create a set of user_ids that have roles
    const usersWithRoles = new Set(roles?.map(r => r.user_id) || []);

    // Find orphan profiles (profiles without roles)
    const orphanProfiles = profiles?.filter(p => !usersWithRoles.has(p.id)) || [];

    // Find orphan roles (roles without profiles)
    const profileIds = new Set(profiles?.map(p => p.id) || []);
    const orphanRoles = roles?.filter(r => !profileIds.has(r.user_id)) || [];

    // Find auth users without profiles
    const authUsersWithoutProfiles = authUsers.filter(u => !profileIds.has(u.id));

    // Find auth users without roles
    const authUsersWithoutRoles = authUsers.filter(u => !usersWithRoles.has(u.id));

    // Create role map for stats
    const roleMap: Record<string, string> = {};
    roles?.forEach(r => { roleMap[r.user_id] = r.role; });

    const stats = {
      total_auth_users: authUsers.length,
      total_profiles: profiles?.length || 0,
      total_roles: roles?.length || 0,
      orphan_profiles: orphanProfiles.length,
      orphan_roles: orphanRoles.length,
      auth_users_without_profiles: authUsersWithoutProfiles.length,
      auth_users_without_roles: authUsersWithoutRoles.length,
      admins: roles?.filter(r => r.role === 'admin').length || 0,
      sellers: roles?.filter(r => r.role === 'seller').length || 0,
      users: roles?.filter(r => (r.role as string) === 'user').length || 0,
    };

    return new Response(
      JSON.stringify({
        success: true,
        stats,
        all_auth_users: authUsers.map(u => ({
          id: u.id,
          email: u.email,
          created_at: u.created_at,
          has_profile: profileIds.has(u.id),
          has_role: usersWithRoles.has(u.id),
          role: roleMap[u.id] || null
        })),
        orphan_profiles: orphanProfiles.map(p => ({
          id: p.id,
          email: p.email,
          full_name: p.full_name,
          created_at: p.created_at,
          is_active: p.is_active
        })),
        auth_users_without_profiles: authUsersWithoutProfiles.map(u => ({
          id: u.id,
          email: u.email,
          created_at: u.created_at
        })),
        auth_users_without_roles: authUsersWithoutRoles.map(u => ({
          id: u.id,
          email: u.email,
          created_at: u.created_at
        })),
        message: orphanProfiles.length > 0 || authUsersWithoutProfiles.length > 0 || authUsersWithoutRoles.length > 0
          ? `⚠️ Problemas encontrados - verifique os detalhes`
          : '✅ Todos os usuários estão configurados corretamente.'
      }, null, 2),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[debug-orphan-profiles] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
