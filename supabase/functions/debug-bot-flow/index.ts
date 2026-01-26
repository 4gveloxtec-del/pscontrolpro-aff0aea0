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
    const testPhone = body.test_phone || "5531973004131";
    const testMessage = body.test_message || "oi";

    const diagnostics: any = {
      seller_id: sellerId,
      test_phone: testPhone,
      test_message: testMessage,
      steps: [],
    };

    // PASSO 1: Verificar bot_engine_config
    diagnostics.steps.push("1. Checking bot_engine_config...");
    const { data: botConfig, error: botError } = await supabase
      .from('bot_engine_config')
      .select('*')
      .eq('seller_id', sellerId)
      .maybeSingle();

    diagnostics.bot_config = {
      exists: !!botConfig,
      is_enabled: botConfig?.is_enabled || false,
      welcome_message: botConfig?.welcome_message || null,
      fallback_message: botConfig?.fallback_message || null,
      error: botError?.message || null,
    };

    if (!botConfig) {
      diagnostics.error = "No bot_engine_config found for seller";
      return new Response(JSON.stringify(diagnostics, null, 2), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!botConfig.is_enabled) {
      diagnostics.error = "Bot is disabled (is_enabled = false)";
      return new Response(JSON.stringify(diagnostics, null, 2), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // PASSO 2: Verificar fluxos ativos
    diagnostics.steps.push("2. Checking active flows...");
    const { data: flows, error: flowsError } = await supabase
      .from('bot_engine_flows')
      .select('*')
      .eq('seller_id', sellerId)
      .eq('is_active', true);

    diagnostics.flows = {
      count: flows?.length || 0,
      list: flows?.map(f => ({
        id: f.id,
        name: f.name,
        trigger_type: f.trigger_type,
        trigger_keywords: f.trigger_keywords,
        is_default: f.is_default,
      })) || [],
      error: flowsError?.message || null,
    };

    // PASSO 3: Verificar sessão do usuário
    diagnostics.steps.push("3. Checking bot_sessions...");
    const { data: session, error: sessionError } = await supabase
      .from('bot_sessions')
      .select('*')
      .eq('user_id', testPhone)
      .eq('seller_id', sellerId)
      .maybeSingle();

    diagnostics.session = {
      exists: !!session,
      state: session?.state || null,
      last_interaction: session?.last_interaction || null,
      context: session?.context || null,
      error: sessionError?.message || null,
    };

    // PASSO 4: Simular lógica de boas-vindas
    diagnostics.steps.push("4. Checking welcome logic...");
    const now = new Date();
    const cooldownHours = botConfig.welcome_cooldown_hours || 24;
    const cooldownMs = cooldownHours * 60 * 60 * 1000;
    
    let shouldSendWelcome = false;
    let welcomeReason = "";

    if (!session) {
      shouldSendWelcome = true;
      welcomeReason = "No session exists (first contact)";
    } else {
      const interactionCount = (session.context as any)?.interaction_count || 0;
      const lastInteraction = session.last_interaction ? new Date(session.last_interaction) : null;
      const cooldownExpired = lastInteraction && (now.getTime() - lastInteraction.getTime() > cooldownMs);
      
      if (interactionCount === 0) {
        shouldSendWelcome = true;
        welcomeReason = "interaction_count = 0";
      } else if (cooldownExpired) {
        shouldSendWelcome = true;
        welcomeReason = `Cooldown expired (last: ${lastInteraction}, cooldown: ${cooldownHours}h)`;
      }
    }

    diagnostics.welcome_logic = {
      should_send_welcome: shouldSendWelcome,
      reason: welcomeReason,
      cooldown_hours: cooldownHours,
    };

    // PASSO 5: Verificar matching de fluxo
    diagnostics.steps.push("5. Checking flow matching...");
    let matchedFlow = null;
    const lowerMessage = testMessage.toLowerCase().trim();

    if (flows && flows.length > 0) {
      // Verificar first_message
      const firstMessageFlow = flows.find(f => f.trigger_type === 'first_message');
      if (firstMessageFlow && shouldSendWelcome) {
        matchedFlow = firstMessageFlow;
        diagnostics.flow_match = {
          matched: true,
          flow: firstMessageFlow.name,
          reason: "first_message trigger + should_send_welcome",
        };
      }

      // Verificar keyword
      if (!matchedFlow) {
        for (const flow of flows) {
          if (flow.trigger_type === 'keyword' && flow.trigger_keywords) {
            const keywords = flow.trigger_keywords as string[];
            if (keywords.some(k => lowerMessage.includes(k.toLowerCase()))) {
              matchedFlow = flow;
              diagnostics.flow_match = {
                matched: true,
                flow: flow.name,
                reason: `keyword matched: ${keywords.join(', ')}`,
              };
              break;
            }
          }
        }
      }

      // Fallback para default
      if (!matchedFlow) {
        const defaultFlow = flows.find(f => f.is_default);
        if (defaultFlow) {
          matchedFlow = defaultFlow;
          diagnostics.flow_match = {
            matched: true,
            flow: defaultFlow.name,
            reason: "default flow fallback",
          };
        }
      }
    }

    if (!matchedFlow) {
      diagnostics.flow_match = {
        matched: false,
        reason: "No flow matched (no first_message, no keyword match, no default)",
      };
    }

    // PASSO 6: Verificar nós do fluxo
    if (matchedFlow) {
      diagnostics.steps.push(`6. Checking nodes for flow: ${matchedFlow.name}...`);
      const { data: nodes, error: nodesError } = await supabase
        .from('bot_engine_nodes')
        .select('*')
        .eq('flow_id', matchedFlow.id);

      diagnostics.flow_nodes = {
        count: nodes?.length || 0,
        entry_point: nodes?.find(n => n.is_entry_point) || null,
        nodes: nodes?.map(n => ({
          id: n.id,
          type: n.node_type,
          name: n.name,
          is_entry_point: n.is_entry_point,
        })) || [],
        error: nodesError?.message || null,
      };

      if (!nodes || nodes.length === 0) {
        diagnostics.error = "Flow matched but has NO NODES configured!";
      } else if (!nodes.find(n => n.is_entry_point)) {
        diagnostics.error = "Flow has nodes but NO ENTRY POINT defined!";
      }
    }

    // PASSO 7: Simular bot-engine-intercept
    diagnostics.steps.push("7. Simulating bot-engine-intercept call...");
    try {
      const interceptPayload = {
        seller_id: sellerId,
        sender_phone: testPhone,  // CORRETO: usar sender_phone, não user_id
        message_text: testMessage,
        instance_name: "test_simulation",
      };

      const interceptResponse = await fetch(`${supabaseUrl}/functions/v1/bot-engine-intercept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify(interceptPayload),
      });

      const interceptResult = await interceptResponse.json();
      diagnostics.bot_intercept_response = {
        status: interceptResponse.status,
        result: interceptResult,
      };
      
      // PASSO 8: Verificar se bot gerou resposta e simular envio
      diagnostics.steps.push("8. Checking bot response and simulating WhatsApp send...");
      
      if (!interceptResult.intercepted) {
        diagnostics.final_verdict = "❌ BOT DID NOT INTERCEPT - Check bot_engine_config.is_enabled and flow triggers";
      } else if (!interceptResult.response) {
        diagnostics.final_verdict = "❌ BOT INTERCEPTED BUT NO RESPONSE - Check welcome_message or flow nodes";
      } else {
        diagnostics.final_verdict = `✅ BOT GENERATED RESPONSE: "${interceptResult.response}"`;
        
        // Tentar buscar config global e simular envio
        const { data: whatsappConfig } = await supabase
          .from('whatsapp_global_config')
          .select('api_url, api_token')
          .eq('is_active', true)
          .maybeSingle();
        
        diagnostics.whatsapp_config_available = !!whatsappConfig;
        
        if (whatsappConfig?.api_url && whatsappConfig?.api_token) {
          diagnostics.steps.push("9. WhatsApp config found - Would send message now!");
          diagnostics.would_send_to = testPhone;
          diagnostics.would_send_message = interceptResult.response;
        } else {
          diagnostics.final_verdict += " (⚠️ BUT WhatsApp global config NOT FOUND - message won't be sent)";
        }
      }
    } catch (error: any) {
      diagnostics.bot_intercept_response = {
        error: error.message,
      };
      diagnostics.final_verdict = `❌ BOT INTERCEPT FAILED: ${error.message}`;
    }

    // CONCLUSÃO
    diagnostics.steps.push("10. Diagnosis complete!");

    return new Response(JSON.stringify(diagnostics, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message, stack: error.stack }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});