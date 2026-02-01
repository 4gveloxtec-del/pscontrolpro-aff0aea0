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
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json().catch(() => ({}));
    const sellerId = body.seller_id || "c4f9e3be-13ce-4648-9d88-9b1cccd4a67e";

    // 1. Verificar config do bot
    const { data: botConfig, error: botError } = await supabase
      .from('bot_engine_config')
      .select('*')
      .eq('seller_id', sellerId)
      .maybeSingle();

    // 2. Verificar instância WhatsApp
    const { data: whatsappInstance, error: waError } = await supabase
      .from('whatsapp_seller_instances')
      .select('*')
      .eq('seller_id', sellerId)
      .maybeSingle();

    // 3. Verificar config global Evolution API
    const { data: globalConfig, error: globalError } = await supabase
      .from('whatsapp_global_config')
      .select('*')
      .eq('is_active', true)
      .maybeSingle();

    // 4. Verificar fluxos ativos (ÚNICA FONTE AGORA)
    const { data: flows, error: flowsError } = await supabase
      .from('bot_engine_flows')
      .select('*')
      .eq('seller_id', sellerId)
      .eq('is_active', true);

    // 5. Verificar nós do fluxo principal
    const mainFlow = flows?.find(f => f.is_default) || flows?.[0];
    let nodes: any[] = [];
    let edges: any[] = [];
    
    if (mainFlow) {
      const { data: nodesData } = await supabase
        .from('bot_engine_nodes')
        .select('id, name, node_type, is_entry_point')
        .eq('flow_id', mainFlow.id)
        .eq('seller_id', sellerId);
      nodes = nodesData || [];
      
      const { data: edgesData } = await supabase
        .from('bot_engine_edges')
        .select('id, source_node_id, target_node_id, condition_type, condition_value')
        .eq('flow_id', mainFlow.id)
        .eq('seller_id', sellerId);
      edges = edgesData || [];
    }

    const diagnostic = {
      seller_id: sellerId,
      system_version: "FLOWS_ONLY_V3",
      bot_engine_config: {
        exists: !!botConfig,
        is_enabled: botConfig?.is_enabled || false,
        welcome_message: botConfig?.welcome_message?.substring(0, 100) + '...' || null,
        fallback_message: botConfig?.fallback_message || null,
        use_text_menus: botConfig?.use_text_menus || false,
        error: botError?.message || null,
      },
      whatsapp_instance: {
        exists: !!whatsappInstance,
        instance_name: whatsappInstance?.instance_name || null,
        is_connected: whatsappInstance?.is_connected || false,
        error: waError?.message || null,
      },
      global_config: {
        exists: !!globalConfig,
        api_url: globalConfig?.api_url || null,
        has_token: !!globalConfig?.api_token,
        error: globalError?.message || null,
      },
      flows: {
        count: flows?.length || 0,
        list: flows?.map((f: any) => ({ 
          id: f.id, 
          name: f.name, 
          trigger_type: f.trigger_type,
          is_default: f.is_default,
          is_template: f.is_template,
        })) || [],
        error: flowsError?.message || null,
      },
      main_flow: mainFlow ? {
        id: mainFlow.id,
        name: mainFlow.name,
        nodes_count: nodes.length,
        edges_count: edges.length,
        entry_point: nodes.find((n: any) => n.is_entry_point)?.name || nodes.find((n: any) => n.node_type === 'start')?.name || 'NOT_FOUND',
        nodes_preview: nodes.slice(0, 10).map((n: any) => `${n.name || n.id.substring(0,8)} (${n.node_type})`),
      } : null,
      legacy_info: "⚠️ Menus Dinâmicos V2 (bot_engine_dynamic_menus) e Menus Legado (bot_engine_menus) foram REMOVIDOS. Use apenas Fluxos (bot_engine_flows + nodes + edges).",
      diagnosis: (() => {
        if (!botConfig) {
          return "❌ CRÍTICO: Configuração do BotEngine não encontrada!";
        }
        if (!botConfig.is_enabled) {
          return "⚠️ BotEngine está DESABILITADO. Ative em Chatbot > Configuração.";
        }
        if (!whatsappInstance?.is_connected) {
          return "⚠️ WhatsApp não conectado.";
        }
        if (!globalConfig) {
          return "❌ Configuração global do WhatsApp não encontrada.";
        }
        if ((flows?.length || 0) === 0) {
          return "⚠️ Nenhum fluxo ativo. Vá em Chatbot > Fluxos e crie/ative um fluxo.";
        }
        if (nodes.length === 0) {
          return "⚠️ Fluxo sem nós. Adicione nós ao fluxo principal.";
        }
        if (edges.length === 0) {
          return "⚠️ Fluxo sem transições. Conecte os nós com edges.";
        }
        return "✅ Tudo configurado! Sistema usando APENAS fluxos (sem menus legados).";
      })(),
    };

    return new Response(JSON.stringify(diagnostic, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
