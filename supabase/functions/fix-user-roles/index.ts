import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Get token from header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Authorization required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user from token
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = user.id;
    const userEmail = user.email;

    console.log(`[fix-user-roles] Processing user: ${userEmail} (${userId})`);

    // Check if user already has a role
    const { data: existingRole } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();

    if (existingRole) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: "User already has role",
        role: existingRole.role 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if this is the first user (should be admin)
    const { count: roleCount } = await supabaseAdmin
      .from("user_roles")
      .select("*", { count: "exact", head: true });

    const isFirstUser = roleCount === 0;
    const roleToAssign = isFirstUser ? "admin" : "seller";

    console.log(`[fix-user-roles] Assigning role: ${roleToAssign} (isFirstUser: ${isFirstUser})`);

    // Create role
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: roleToAssign });

    if (roleError) {
      console.error("[fix-user-roles] Error creating role:", roleError);
      return new Response(JSON.stringify({ error: roleError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if profile exists
    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    if (!existingProfile) {
      // Get trial days from app_settings
      const { data: trialSetting } = await supabaseAdmin
        .from("app_settings")
        .select("value")
        .eq("key", "seller_trial_days")
        .maybeSingle();
      
      const trialDays = parseInt(trialSetting?.value || "5", 10);
      
      // Create profile
      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .insert({
          id: userId,
          email: userEmail,
          full_name: user.user_metadata?.full_name || userEmail?.split("@")[0],
          whatsapp: user.user_metadata?.whatsapp || null,
          subscription_expires_at: new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000).toISOString(),
          is_permanent: isFirstUser,
          is_active: true,
        });

      if (profileError) {
        console.error("[fix-user-roles] Error creating profile:", profileError);
        // Continue anyway, role was created
      } else {
        console.log("[fix-user-roles] Profile created successfully");
      }
    }

    // If seller, create default plans and templates
    if (roleToAssign === "seller") {
      try {
        await supabaseAdmin.rpc("create_default_plans_for_seller", { seller_uuid: userId });
        await supabaseAdmin.rpc("create_default_templates_for_seller", { seller_uuid: userId });
        console.log("[fix-user-roles] Default data created for seller");
      } catch (e) {
        console.log("[fix-user-roles] Could not create default data:", e);
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: `Role ${roleToAssign} assigned successfully`,
      role: roleToAssign,
      isFirstUser
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    console.error("[fix-user-roles] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});