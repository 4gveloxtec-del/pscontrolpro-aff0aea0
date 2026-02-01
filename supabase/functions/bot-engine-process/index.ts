/**
 * BOT ENGINE - Edge Function de Processamento
 * Motor isolado para processar mensagens do chatbot
 * 
 * Esta função NÃO contém fluxos prontos - apenas infraestrutura.
 * Os fluxos são configurados nas tabelas bot_engine_*.
 */

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// =====================================================================
// TIPOS
// =====================================================================

interface BotEngineInput {
  seller_id: string;
  contact_phone: string;
  contact_name?: string;
  message_text: string;
  message_type?: string;
  metadata?: Record<string, unknown>;
}

interface BotEngineOutput {
  success: boolean;
  session_id?: string;
  responses: BotResponse[];
  session_status?: string;
  error?: string;
}

interface BotResponse {
  type: 'text' | 'image' | 'document' | 'buttons' | 'delay';
  content?: string;
  media_url?: string;
  buttons?: { id: string; text: string; value: string }[];
  delay_ms?: number;
}

interface BotNode {
  id: string;
  node_type: string;
  config: Record<string, unknown>;
  is_entry_point: boolean;
}

interface BotEdge {
  id: string;
  source_node_id: string;
  target_node_id: string;
  condition_type: string;
  condition_value?: string;
  priority: number;
}

interface BotSession {
  id: string;
  seller_id: string;
  flow_id: string | null;
  current_node_id: string | null;
  variables: Record<string, unknown>;
  status: string;
  awaiting_input: boolean;
  input_variable_name: string | null;
  ended_at?: string;
}

// =====================================================================
// FUNÇÕES AUXILIARES
// =====================================================================

function normalizePhone(phone: string): string {
  let digits = phone.replace(/\D/g, '');
  if (!digits.startsWith('55') && digits.length >= 10 && digits.length <= 11) {
    digits = '55' + digits;
  }
  return digits;
}

/**
 * Interpola variáveis no texto
 * Suporta múltiplos formatos:
 * - {{variavel}} - formato padrão
 * - {variavel} - formato simplificado
 * - %variavel% - formato legado
 * 
 * Variáveis especiais:
 * - {primeiro_nome} / {first_name} - primeiro nome do contato
 * - {nome} / {name} - nome completo do contato
 * - {empresa} / {company} - nome da empresa do revendedor
 * - {telefone} / {phone} - telefone do contato
 */
function interpolateVariables(text: string, variables: Record<string, unknown>): string {
  let result = text;
  
  // Primeiro, processar variáveis especiais de alias
  const aliases: Record<string, string[]> = {
    primeiro_nome: ['first_name', 'firstName'],
    nome: ['name', 'contact_name', 'contactName'],
    empresa: ['company', 'company_name', 'companyName'],
    telefone: ['phone', 'contact_phone', 'contactPhone'],
  };
  
  // Criar mapa expandido com todos os aliases
  const expandedVars: Record<string, unknown> = { ...variables };
  for (const [canonical, aliasList] of Object.entries(aliases)) {
    // Se já temos o valor canônico, propagar para aliases
    if (expandedVars[canonical] !== undefined) {
      for (const alias of aliasList) {
        if (expandedVars[alias] === undefined) {
          expandedVars[alias] = expandedVars[canonical];
        }
      }
    } else {
      // Tentar encontrar valor em qualquer alias
      for (const alias of aliasList) {
        if (expandedVars[alias] !== undefined) {
          expandedVars[canonical] = expandedVars[alias];
          break;
        }
      }
    }
  }
  
  // Extrair primeiro nome se temos nome completo
  if (expandedVars.nome && !expandedVars.primeiro_nome) {
    const fullName = String(expandedVars.nome);
    expandedVars.primeiro_nome = fullName.split(' ')[0];
    expandedVars.first_name = expandedVars.primeiro_nome;
  }
  
  // Substituir formato {{variavel}}
  result = result.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
    const value = expandedVars[varName];
    if (value === undefined || value === null) return match;
    return String(value);
  });
  
  // Substituir formato {variavel}
  result = result.replace(/\{(\w+)\}/g, (match, varName) => {
    const value = expandedVars[varName];
    if (value === undefined || value === null) return match;
    return String(value);
  });
  
  // Substituir formato %variavel%
  result = result.replace(/%(\w+)%/g, (match, varName) => {
    const value = expandedVars[varName];
    if (value === undefined || value === null) return match;
    return String(value);
  });
  
  return result;
}

function evaluateCondition(
  conditionType: string,
  conditionValue: string | undefined,
  inputValue: string,
  variables: Record<string, unknown>
): boolean {
  switch (conditionType) {
    case 'always':
      return true;
    case 'equals':
      return inputValue.toLowerCase().trim() === (conditionValue || '').toLowerCase().trim();
    case 'contains':
      return inputValue.toLowerCase().includes((conditionValue || '').toLowerCase());
    case 'regex':
      try {
        return new RegExp(conditionValue || '', 'i').test(inputValue);
      } catch {
        return false;
      }
    case 'variable':
      if (!conditionValue) return false;
      const [varName, expectedValue] = conditionValue.split(':');
      const actualValue = variables[varName];
      if (expectedValue === undefined) {
        return actualValue !== undefined && actualValue !== null;
      }
      return String(actualValue).toLowerCase() === expectedValue.toLowerCase();
    default:
      return false;
  }
}

function findNextNode(
  currentNodeId: string,
  edges: BotEdge[],
  nodes: BotNode[],
  inputValue: string,
  variables: Record<string, unknown>
): BotNode | null {
  const outgoingEdges = edges
    .filter(e => e.source_node_id === currentNodeId)
    .sort((a, b) => b.priority - a.priority);
  
  for (const edge of outgoingEdges) {
    if (evaluateCondition(edge.condition_type, edge.condition_value, inputValue, variables)) {
      const targetNode = nodes.find(n => n.id === edge.target_node_id);
      if (targetNode) return targetNode;
    }
  }
  
  return null;
}

// =====================================================================
// PROCESSADOR DE NÓS
// =====================================================================

async function processNode(
  node: BotNode,
  session: BotSession,
  nodes: BotNode[],
  edges: BotEdge[],
  inputValue: string,
  // deno-lint-ignore no-explicit-any
  _supabase: SupabaseClient<any>
): Promise<{ responses: BotResponse[]; nextNode: BotNode | null; sessionUpdates: Partial<BotSession> }> {
  const responses: BotResponse[] = [];
  let nextNode: BotNode | null = null;
  const sessionUpdates: Partial<BotSession> = {};
  const config = node.config || {};
  const variables = { ...session.variables };

  switch (node.node_type) {
    case 'start':
      // Apenas passa para o próximo nó
      nextNode = findNextNode(node.id, edges, nodes, inputValue, variables);
      break;

    case 'message':
      const messageText = config.message_text as string;
      if (messageText) {
        responses.push({
          type: config.message_type as 'text' || 'text',
          content: interpolateVariables(messageText, variables),
          media_url: config.media_url as string,
          buttons: config.buttons as BotResponse['buttons'],
        });
      }
      nextNode = findNextNode(node.id, edges, nodes, inputValue, variables);
      break;

    case 'input':
      const variableName = config.variable_name as string;
      if (session.awaiting_input && session.input_variable_name === variableName) {
        // Recebendo input do usuário
        variables[variableName] = inputValue;
        sessionUpdates.variables = variables;
        sessionUpdates.awaiting_input = false;
        sessionUpdates.input_variable_name = null;
        nextNode = findNextNode(node.id, edges, nodes, inputValue, variables);
      } else {
        // Pedir input ao usuário
        const promptMessage = config.prompt_message as string || 'Por favor, digite sua resposta:';
        responses.push({
          type: 'text',
          content: interpolateVariables(promptMessage, variables),
        });
        sessionUpdates.awaiting_input = true;
        sessionUpdates.input_variable_name = variableName;
        // Não avança para próximo nó - aguarda resposta
      }
      break;

    case 'condition':
      // Apenas avalia condições e determina próximo nó
      nextNode = findNextNode(node.id, edges, nodes, inputValue, variables);
      break;

    case 'action':
      const actionType = config.action_type as string;
      
      if (actionType === 'set_variable') {
        const varToSet = config.variable_to_set as string;
        const varValue = config.variable_value as string;
        if (varToSet) {
          variables[varToSet] = interpolateVariables(varValue || '', variables);
          sessionUpdates.variables = variables;
        }
      } else if (actionType === 'send_notification') {
        // Enviar notificação push/interna para o seller
        const notificationTitle = config.notification_title as string || 'Nova Notificação';
        const notificationBody = interpolateVariables(config.notification_body as string || '', variables);
        const notificationType = config.notification_type as string || 'bot_action';
        
        console.log(`[BotEngine] Sending notification: ${notificationTitle} - ${notificationBody}`);
        
        // Inserir notificação no banco (para push notifications)
        try {
          // Buscar telefone do contato da sessão
          const contactPhone = variables.phone as string || '';
          const contactName = variables.name as string || 'Cliente';
          
          // Chamar edge function de push notification
          const notifyResponse = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-push-notification`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`
            },
            body: JSON.stringify({
              seller_id: session.seller_id,
              title: notificationTitle,
              body: `${notificationBody}\n📱 ${contactName} (${contactPhone})`,
              data: {
                type: notificationType,
                contact_phone: contactPhone,
                contact_name: contactName,
                session_id: session.id
              }
            })
          });
          
          if (!notifyResponse.ok) {
            console.error('[BotEngine] Failed to send push notification:', await notifyResponse.text());
          } else {
            console.log('[BotEngine] Push notification sent successfully');
          }
        } catch (notifyError) {
          console.error('[BotEngine] Error sending notification:', notifyError);
        }
      } else if (actionType === 'http_request') {
        // TODO: Implementar chamadas HTTP
        console.log('[BotEngine] HTTP action not yet implemented');
      }
      
      nextNode = findNextNode(node.id, edges, nodes, inputValue, variables);
      break;

    case 'delay':
      const delaySeconds = config.delay_seconds as number || 1;
      responses.push({
        type: 'delay',
        delay_ms: delaySeconds * 1000,
      });
      nextNode = findNextNode(node.id, edges, nodes, inputValue, variables);
      break;

    case 'goto':
      // TODO: Implementar mudança de fluxo
      console.log('[BotEngine] GOTO node - changing flow');
      sessionUpdates.status = 'completed';
      break;

    case 'end':
      sessionUpdates.status = 'completed';
      sessionUpdates.ended_at = new Date().toISOString();
      const endMessage = config.end_message as string;
      if (endMessage) {
        responses.push({
          type: 'text',
          content: interpolateVariables(endMessage, variables),
        });
      }
      break;
  }

  return { responses, nextNode, sessionUpdates };
}

// =====================================================================
// HANDLER PRINCIPAL
// =====================================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const input: BotEngineInput = await req.json();
    const { seller_id, contact_phone, contact_name, message_text, message_type, metadata } = input;

    console.log(`[BotEngine] Processing message from ${contact_phone} for seller ${seller_id}`);

    // Normalizar telefone
    const normalizedPhone = normalizePhone(contact_phone);

    // Verificar se o motor está habilitado
    const { data: config } = await supabase
      .from('bot_engine_config')
      .select('*')
      .eq('seller_id', seller_id)
      .eq('is_enabled', true)
      .maybeSingle();

    if (!config) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'bot_disabled',
          responses: [],
        } as BotEngineOutput),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Buscar sessão ativa ou criar nova
    let { data: session } = await supabase
      .from('bot_engine_sessions')
      .select('*')
      .eq('seller_id', seller_id)
      .eq('contact_phone', normalizedPhone)
      .eq('status', 'active')
      .order('last_activity_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const allResponses: BotResponse[] = [];
    let flowId: string | null = null;

    if (!session) {
      // Nova conversa - encontrar fluxo apropriado
      const { data: flows } = await supabase
        .from('bot_engine_flows')
        .select('*')
        .eq('seller_id', seller_id)
        .eq('is_active', true)
        .order('priority', { ascending: false });

      if (!flows || flows.length === 0) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'no_flows',
            responses: [],
          } as BotEngineOutput),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Encontrar fluxo por keyword ou default
      let selectedFlow = null;
      const lowerMessage = message_text.toLowerCase().trim();
      
      for (const flow of flows) {
        if (flow.trigger_type === 'keyword' && flow.trigger_keywords) {
          const keywords = flow.trigger_keywords as string[];
          if (keywords.some(k => lowerMessage.includes(k.toLowerCase()))) {
            selectedFlow = flow;
            break;
          }
        }
      }

      // Fallback para fluxo default
      if (!selectedFlow) {
        selectedFlow = flows.find(f => f.is_default) || flows[0];
      }

      flowId = selectedFlow.id;

      // Criar nova sessão
      const { data: newSession, error: sessionError } = await supabase
        .from('bot_engine_sessions')
        .insert({
          seller_id,
          flow_id: flowId,
          contact_phone: normalizedPhone,
          contact_name,
          variables: { phone: normalizedPhone, name: contact_name || '' },
          status: 'active',
        })
        .select()
        .single();

      if (sessionError) {
        throw new Error(`Failed to create session: ${sessionError.message}`);
      }

      session = newSession;
      console.log(`[BotEngine] Created new session: ${session.id}`);
    } else {
      flowId = session.flow_id;
    }

    // Buscar nós e edges do fluxo
    const { data: nodes } = await supabase
      .from('bot_engine_nodes')
      .select('*')
      .eq('flow_id', flowId);

    const { data: edges } = await supabase
      .from('bot_engine_edges')
      .select('*')
      .eq('flow_id', flowId);

    if (!nodes || nodes.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'no_nodes',
          session_id: session.id,
          responses: [],
        } as BotEngineOutput),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determinar nó atual
    let currentNode: BotNode | null = null;
    
    if (session.current_node_id) {
      currentNode = nodes.find(n => n.id === session.current_node_id) || null;
    }
    
    if (!currentNode) {
      // Encontrar entry point
      currentNode = nodes.find(n => n.is_entry_point) 
        || nodes.find(n => n.node_type === 'start')
        || nodes[0];
    }

    // Registrar mensagem recebida
    await supabase.from('bot_engine_message_log').insert({
      session_id: session.id,
      seller_id,
      direction: 'inbound',
      message_content: message_text,
      message_type: message_type || 'text',
      node_id: currentNode?.id,
      metadata: metadata || {},
    });

    // Processar nós em sequência (máximo 10 para evitar loops infinitos)
    let iterations = 0;
    const maxIterations = 10;
    let sessionUpdates: Partial<BotSession> = {};

    while (currentNode && iterations < maxIterations) {
      iterations++;
      
      const result = await processNode(
        currentNode as BotNode,
        session as BotSession,
        nodes as BotNode[],
        (edges || []) as BotEdge[],
        message_text,
        supabase
      );

      allResponses.push(...result.responses);
      sessionUpdates = { ...sessionUpdates, ...result.sessionUpdates };

      // Atualizar variáveis da sessão para próximas iterações
      if (result.sessionUpdates.variables) {
        session.variables = result.sessionUpdates.variables;
      }

      // Se está aguardando input, parar processamento
      if (result.sessionUpdates.awaiting_input) {
        sessionUpdates.current_node_id = currentNode.id;
        break;
      }

      // Avançar para próximo nó
      currentNode = result.nextNode;
      
      if (currentNode) {
        sessionUpdates.current_node_id = currentNode.id;
      }

      // Se status mudou para não-ativo, parar
      if (result.sessionUpdates.status && result.sessionUpdates.status !== 'active') {
        break;
      }
    }

    // Atualizar sessão
    await supabase
      .from('bot_engine_sessions')
      .update({
        ...sessionUpdates,
        last_activity_at: new Date().toISOString(),
      })
      .eq('id', session.id);

    // Registrar respostas enviadas
    for (const response of allResponses.filter(r => r.type !== 'delay')) {
      await supabase.from('bot_engine_message_log').insert({
        session_id: session.id,
        seller_id,
        direction: 'outbound',
        message_content: response.content,
        message_type: response.type,
        node_id: sessionUpdates.current_node_id,
      });
    }

    console.log(`[BotEngine] Processed ${iterations} nodes, ${allResponses.length} responses`);

    return new Response(
      JSON.stringify({
        success: true,
        session_id: session.id,
        responses: allResponses,
        session_status: sessionUpdates.status || session.status,
      } as BotEngineOutput),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[BotEngine] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : String(error),
        responses: [],
      } as BotEngineOutput),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
