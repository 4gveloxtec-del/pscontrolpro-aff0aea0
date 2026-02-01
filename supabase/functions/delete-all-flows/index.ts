import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse body for admin mode
    let body: { adminMode?: boolean; sellerId?: string } = {};
    try {
      body = await req.json();
    } catch {
      // No body is fine
    }

    const results: string[] = [];
    let targetSellerId: string | null = null;
    let isAdminMode = body.adminMode === true;

    // If adminMode, clean ALL sellers
    if (isAdminMode) {
      results.push("🔧 Modo Admin: Limpando TODOS os fluxos de TODOS os revendedores");
    } else {
      // Normal mode - requires auth
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Não autorizado" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error: userError } = await supabase.auth.getUser(token);
      
      if (userError || !user) {
        return new Response(JSON.stringify({ error: "Usuário não encontrado" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      targetSellerId = user.id;
    }

    // 1. Get flows (all or by seller)
    let flowsQuery = supabase.from("bot_engine_flows").select("id, name, seller_id");
    if (targetSellerId) {
      flowsQuery = flowsQuery.eq("seller_id", targetSellerId);
    }
    const { data: allFlows, error: flowsError } = await flowsQuery;

    if (flowsError) {
      throw new Error(`Erro ao buscar fluxos: ${flowsError.message}`);
    }

    results.push(`Encontrados ${allFlows?.length || 0} fluxos para deletar`);

    // 2. Delete all flows (edges, nodes, then flows)
    if (allFlows && allFlows.length > 0) {
      for (const flow of allFlows) {
        // Delete edges
        await supabase
          .from("bot_engine_edges")
          .delete()
          .eq("flow_id", flow.id);

        // Delete nodes
        await supabase
          .from("bot_engine_nodes")
          .delete()
          .eq("flow_id", flow.id);

        // Delete flow
        const { error: deleteError } = await supabase
          .from("bot_engine_flows")
          .delete()
          .eq("id", flow.id);

        if (deleteError) {
          results.push(`❌ Erro: "${flow.name}": ${deleteError.message}`);
        } else {
          results.push(`🗑️ "${flow.name}" deletado`);
        }
      }
    }

    // 3. Also clear any orphan sessions and message logs
    if (targetSellerId) {
      await supabase
        .from("bot_engine_message_log")
        .delete()
        .eq("seller_id", targetSellerId);

      await supabase
        .from("bot_engine_sessions")
        .delete()
        .eq("seller_id", targetSellerId);
    } else {
      // Admin mode: clear ALL
      await supabase
        .from("bot_engine_message_log")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");

      await supabase
        .from("bot_engine_sessions")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");
    }

    results.push("🧹 Sessões e logs limpos");

    return new Response(
      JSON.stringify({
        success: true,
        message: `${allFlows?.length || 0} fluxos deletados com sucesso!`,
        deleted_count: allFlows?.length || 0,
        details: results,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    console.error("Erro:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
