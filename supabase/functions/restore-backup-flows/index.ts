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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from token
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Usuário não encontrado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sellerId = user.id;
    const results: string[] = [];

    // 1. Find and DELETE IPTV flows FIRST (by category or name containing IPTV)
    const { data: iptvFlows, error: iptvError } = await supabase
      .from("bot_engine_flows")
      .select("id, name, category")
      .eq("seller_id", sellerId)
      .or("category.ilike.%iptv%,name.ilike.%iptv%,category.ilike.%fluxos iptv%");

    if (iptvError) {
      throw new Error(`Erro ao buscar fluxos IPTV: ${iptvError.message}`);
    }

    results.push(`Encontrados ${iptvFlows?.length || 0} fluxos IPTV para deletar`);

    // Delete IPTV flows (and their nodes/edges)
    if (iptvFlows && iptvFlows.length > 0) {
      for (const flow of iptvFlows) {
        // Delete edges first
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
          results.push(`❌ Erro ao deletar "${flow.name}": ${deleteError.message}`);
        } else {
          results.push(`🗑️ Fluxo IPTV "${flow.name}" deletado`);
        }
      }
    }

    // 2. Find flows in "backup" category - ORDER BY created_at to preserve original order
    const { data: backupFlows, error: backupError } = await supabase
      .from("bot_engine_flows")
      .select("id, name, category, created_at")
      .eq("seller_id", sellerId)
      .ilike("category", "%backup%")
      .order("created_at", { ascending: true });

    if (backupError) {
      throw new Error(`Erro ao buscar fluxos de backup: ${backupError.message}`);
    }

    results.push(`Encontrados ${backupFlows?.length || 0} fluxos na pasta backup`);

    // 3. Restore backup flows with correct priority order
    if (backupFlows && backupFlows.length > 0) {
      let priority = 100; // Start with high priority, decrement for each flow
      
      for (const flow of backupFlows) {
        const { error: updateError } = await supabase
          .from("bot_engine_flows")
          .update({
            is_active: true,
            category: null, // Move to root (no category)
            priority: priority,
            updated_at: new Date().toISOString(),
          })
          .eq("id", flow.id);

        if (updateError) {
          results.push(`❌ Erro ao restaurar "${flow.name}": ${updateError.message}`);
        } else {
          results.push(`✅ Fluxo "${flow.name}" restaurado (prioridade: ${priority})`);
        }
        
        priority -= 1; // Next flow gets lower priority (maintains creation order)
      }
    }

    // 4. Summary
    const summary = {
      iptv_deleted: iptvFlows?.length || 0,
      backup_restored: backupFlows?.length || 0,
    };

    return new Response(
      JSON.stringify({
        success: true,
        message: "Operação concluída com sucesso!",
        summary,
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
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
