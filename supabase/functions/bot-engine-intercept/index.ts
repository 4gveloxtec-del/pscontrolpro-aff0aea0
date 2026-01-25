/**
 * BOT ENGINE - Edge Function de Interceptação
 * 
 * Esta função é chamada pelo webhook existente para verificar
 * se o BotEngine deve processar a mensagem.
 * 
 * ⚠️ NÃO substitui o webhook - apenas intercepta quando necessário
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// =====================================================================
// TIPOS
// =====================================================================

interface BotInterceptRequest {
  seller_id: string;
  sender_phone: string;
  message_text: string;
  instance_name?: string;
}

interface BotInterceptResponse {
  intercepted: boolean;
  response?: string;
  new_state?: string;
  should_continue?: boolean;
  error?: string;
}

// =====================================================================
// COMANDOS GLOBAIS
// =====================================================================

const GLOBAL_COMMANDS = [
  { keywords: ['menu', 'cardapio', 'opcoes', 'opções'], action: 'menu' },
  { keywords: ['voltar', 'anterior', 'retornar', '*', '#'], action: 'voltar' },
  { keywords: ['inicio', 'início', 'começo', 'reiniciar', '00', '##'], action: 'inicio' },
  { keywords: ['sair', 'exit', 'encerrar', 'tchau', 'bye', 'fim'], action: 'sair' },
  { keywords: ['humano', 'atendente', 'pessoa', 'suporte', 'falar com alguem'], action: 'humano' },
];

function matchGlobalCommand(message: string): { action: string } | null {
  const normalized = message.toLowerCase().trim();
  for (const cmd of GLOBAL_COMMANDS) {
    for (const keyword of cmd.keywords) {
      if (normalized === keyword) {
        return { action: cmd.action };
      }
    }
  }
  return null;
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

    const input: BotInterceptRequest = await req.json();
    const { seller_id, sender_phone, message_text } = input;

    if (!seller_id || !sender_phone || !message_text) {
      return new Response(
        JSON.stringify({ intercepted: false, should_continue: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Normalizar telefone
    const userId = sender_phone.replace(/\D/g, '');
    console.log(`[BotIntercept] Checking message from ${userId} for seller ${seller_id}`);

    // Verificar se BotEngine está habilitado para este seller
    const { data: config } = await supabase
      .from('bot_engine_config')
      .select('is_enabled')
      .eq('seller_id', seller_id)
      .eq('is_enabled', true)
      .maybeSingle();

    if (!config) {
      // BotEngine não está habilitado - deixar fluxo seguir
      console.log(`[BotIntercept] BotEngine disabled for seller ${seller_id}`);
      return new Response(
        JSON.stringify({ intercepted: false, should_continue: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Buscar ou criar sessão
    let { data: session } = await supabase
      .from('bot_sessions')
      .select('*')
      .eq('user_id', userId)
      .eq('seller_id', seller_id)
      .maybeSingle();

    // Se não existe sessão, criar uma nova
    if (!session) {
      const { data: newSession, error: createError } = await supabase
        .from('bot_sessions')
        .insert({
          user_id: userId,
          seller_id: seller_id,
          state: 'INICIO',
          stack: [],
          locked: false,
        })
        .select()
        .single();

      if (createError) {
        console.error(`[BotIntercept] Failed to create session:`, createError);
        return new Response(
          JSON.stringify({ intercepted: false, should_continue: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      session = newSession;
      console.log(`[BotIntercept] Created new session for ${userId}`);
    }

    // Verificar se sessão está bloqueada
    if (session.locked) {
      console.log(`[BotIntercept] Session locked for ${userId}, skipping`);
      return new Response(
        JSON.stringify({ intercepted: false, should_continue: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log da mensagem recebida
    await supabase.from('bot_logs').insert({
      user_id: userId,
      seller_id: seller_id,
      message: message_text,
      from_user: true,
    });

    // Verificar comandos globais
    const globalCmd = matchGlobalCommand(message_text);
    
    if (globalCmd) {
      console.log(`[BotIntercept] Global command matched: ${globalCmd.action}`);
      
      let newState = session.state;
      let responseMessage = '';
      let newStack = session.stack || [];

      switch (globalCmd.action) {
        case 'menu':
          newState = 'MENU';
          newStack = [];
          responseMessage = '📋 Voltando ao menu principal...';
          break;

        case 'voltar':
          if (newStack.length > 0) {
            newStack = [...newStack];
            newStack.pop();
            newState = newStack[newStack.length - 1] || 'MENU';
          } else {
            newState = 'MENU';
          }
          responseMessage = '⬅️ Voltando...';
          break;

        case 'inicio':
          newState = 'INICIO';
          newStack = [];
          responseMessage = '🔄 Sessão reiniciada! Como posso ajudar?';
          break;

        case 'sair':
          newState = 'ENCERRADO';
          newStack = [];
          responseMessage = '👋 Sessão encerrada. Até logo!';
          break;

        case 'humano':
          newState = 'AGUARDANDO_HUMANO';
          responseMessage = '👤 Encaminhando para um atendente. Por favor, aguarde...';
          break;
      }

      // Atualizar sessão
      await supabase
        .from('bot_sessions')
        .update({
          state: newState,
          stack: newStack,
          updated_at: new Date().toISOString(),
        })
        .eq('id', session.id);

      // Log da resposta
      if (responseMessage) {
        await supabase.from('bot_logs').insert({
          user_id: userId,
          seller_id: seller_id,
          message: responseMessage,
          from_user: false,
        });
      }

      return new Response(
        JSON.stringify({
          intercepted: true,
          response: responseMessage,
          new_state: newState,
          should_continue: false,
        } as BotInterceptResponse),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Se estado é ENCERRADO ou AGUARDANDO_HUMANO, não interceptar
    if (['ENCERRADO', 'AGUARDANDO_HUMANO'].includes(session.state)) {
      console.log(`[BotIntercept] Session in ${session.state}, not intercepting`);
      return new Response(
        JSON.stringify({ intercepted: false, should_continue: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Se a mensagem começa com /, deixar o process-whatsapp-command tratar
    if (message_text.trim().startsWith('/')) {
      console.log(`[BotIntercept] Command detected, passing to existing handler`);
      return new Response(
        JSON.stringify({ intercepted: false, should_continue: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Por enquanto, não interceptar outras mensagens (deixar fluxo atual)
    // O BotEngine só processa comandos globais até que fluxos sejam configurados
    console.log(`[BotIntercept] No global command, passing through`);
    return new Response(
      JSON.stringify({ intercepted: false, should_continue: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[BotIntercept] Error:', error);
    return new Response(
      JSON.stringify({ 
        intercepted: false, 
        should_continue: true,
        error: error instanceof Error ? error.message : String(error),
      } as BotInterceptResponse),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
