import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type AppRole = "admin" | "seller" | "user";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.log("[set-user-role] Missing authorization header");
      return new Response(JSON.stringify({ error: "Authorization required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate token using getClaims
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseUser.auth.getClaims(token);

    if (claimsError || !claimsData?.claims?.sub) {
      console.log("[set-user-role] Invalid token:", claimsError);
      return new Response(JSON.stringify({ error: "Invalid authentication" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const requestingUserId = claimsData.claims.sub;

    // Only admins can change roles
    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", requestingUserId)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      console.log("[set-user-role] Non-admin attempted to change role:", requestingUserId);
      return new Response(JSON.stringify({ error: "Only admins can change roles" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : null;
    const user_id = typeof body.user_id === "string" ? body.user_id.trim() : null;
    const role = (body.role as AppRole) ?? null;

    if (!role || !["admin", "seller", "user"].includes(role)) {
      return new Response(JSON.stringify({ error: "Invalid role. Must be admin, seller, or user" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let targetUserId = user_id;

    if (!targetUserId) {
      if (!email) {
        return new Response(JSON.stringify({ error: "email or user_id is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: profile, error: profileError } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("email", email)
        .maybeSingle();

      if (profileError || !profile?.id) {
        console.log("[set-user-role] User not found for email:", email);
        return new Response(JSON.stringify({ error: "User not found for email" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      targetUserId = profile.id;
    }

    // Upsert role
    const { error: upsertError } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: targetUserId, role }, { onConflict: "user_id" });

    if (upsertError) {
      // Fallback to update in case unique constraint differs
      const { error: updateError } = await supabaseAdmin
        .from("user_roles")
        .update({ role })
        .eq("user_id", targetUserId);

      if (updateError) {
        console.log("[set-user-role] Update error:", updateError);
        return new Response(JSON.stringify({ error: updateError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    console.log("[set-user-role] Role updated:", { targetUserId, role });
    return new Response(JSON.stringify({ success: true, user_id: targetUserId, role }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("[set-user-role] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
