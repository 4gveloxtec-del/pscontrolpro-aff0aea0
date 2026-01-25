/**
 * BOT ENGINE - Edge Function de Interceptação
 * 
 * Fluxo de execução para cada mensagem:
 * 1. lockSession(userId)
 * 2. parseInput(userId, message)
 * 3. Verificar comandos globais
 * 4. Executar executeAction se necessário
 * 5. Atualizar state e stack
 * 6. sendMessage
 * 7. unlockSession(userId)
 * 
 * ⚠️ NÃO substitui o webhook - apenas intercepta quando necessário
 */

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

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

interface ParsedInput {
  original: string;
  normalized: string;
  isNumber: boolean;
  number: number | null;
  isCommand: boolean;
  command: string | null;
  args: string[];
  keywords: string[];
}

interface ActionResult {
  success: boolean;
  newState?: string;
  response?: string;
  clearStack?: boolean;
  popStack?: boolean;
}

// =====================================================================
// COMANDOS GLOBAIS - REGRAS UNIVERSAIS DE NAVEGAÇÃO
// =====================================================================

/**
 * Comandos universais que funcionam em QUALQUER estado/fluxo:
 * 
 * "0"  → Retorna ao previous_state (menu anterior)
 * "#"  → Retorna ao START (menu inicial)
 * "00" → Mesmo que "#" (alternativa)
 * "##" → Mesmo que "#" (alternativa)
 */
const GLOBAL_COMMANDS = [
  // NAVEGAÇÃO UNIVERSAL (prioridade máxima)
  { keywords: ['0'], action: 'back_to_previous', priority: 100 },
  { keywords: ['#'], action: 'back_to_start', priority: 100 },
  
  // Comandos por texto
  { keywords: ['voltar', 'anterior', 'retornar', '*'], action: 'back_to_previous', priority: 90 },
  { keywords: ['inicio', 'início', 'começo', 'reiniciar', 'start', '00', '##'], action: 'back_to_start', priority: 90 },
  { keywords: ['menu', 'cardapio', 'opcoes', 'opções'], action: 'menu', priority: 80 },
  { keywords: ['sair', 'exit', 'encerrar', 'tchau', 'bye', 'fim'], action: 'sair', priority: 70 },
  { keywords: ['humano', 'atendente', 'pessoa', 'suporte', 'falar com alguem'], action: 'humano', priority: 60 },
];

// =====================================================================
// SISTEMA ANTI-DUPLICAÇÃO - LOCK ATÔMICO
// =====================================================================

/**
 * Timeout máximo para considerar um lock como "stale" (abandonado)
 * Se o lock existir há mais tempo que isso, considera como abandonado
 */
const LOCK_TIMEOUT_MS = 30000; // 30 segundos

/**
 * 1. lockSession - Bloqueia a sessão de forma ATÔMICA
 * 
 * Fluxo:
 * - Se locked = true E não expirado → IGNORAR (retorna false)
 * - Se locked = false OU expirado → definir locked = true (retorna true)
 * 
 * Usa UPDATE com WHERE para garantir atomicidade
 */
async function lockSession(
  supabase: SupabaseClient,
  userId: string,
  sellerId: string
): Promise<boolean> {
  const now = new Date();
  const lockExpiry = new Date(now.getTime() - LOCK_TIMEOUT_MS);

  // Primeiro, verificar se já existe uma sessão
  const { data: existing } = await supabase
    .from('bot_sessions')
    .select('locked, updated_at')
    .eq('user_id', userId)
    .eq('seller_id', sellerId)
    .maybeSingle();

  if (existing) {
    // Sessão existe - verificar se está bloqueada
    if (existing.locked) {
      const lockTime = new Date(existing.updated_at);
      
      // Se lock não expirou, ignorar mensagem (anti-duplicação)
      if (lockTime > lockExpiry) {
        console.log(`[BotIntercept] ❌ ANTI-DUPLICAÇÃO: Sessão bloqueada para ${userId}, ignorando mensagem`);
        return false;
      }
      
      // Lock expirou (stale) - pode ser um crash anterior
      console.log(`[BotIntercept] ⚠️ Lock stale detectado para ${userId}, renovando...`);
    }

    // Tentar adquirir lock de forma ATÔMICA
    // UPDATE só acontece se locked = false OU se lock expirou
    const { data: updated, error: updateError } = await supabase
      .from('bot_sessions')
      .update({
        locked: true,
        last_interaction: now.toISOString(),
        updated_at: now.toISOString()
      })
      .eq('user_id', userId)
      .eq('seller_id', sellerId)
      .or(`locked.eq.false,updated_at.lt.${lockExpiry.toISOString()}`)
      .select('id')
      .maybeSingle();

    if (updateError) {
      console.error(`[BotIntercept] lockSession update error:`, updateError);
      return false;
    }

    if (!updated) {
      // Outra instância pegou o lock primeiro
      console.log(`[BotIntercept] ❌ ANTI-DUPLICAÇÃO: Lock não adquirido para ${userId}, outra instância processando`);
      return false;
    }

    console.log(`[BotIntercept] ✅ Lock adquirido para ${userId}`);
    return true;
  }

  // Sessão não existe - criar nova com lock
  const { error: insertError } = await supabase
    .from('bot_sessions')
    .insert({
      user_id: userId,
      seller_id: sellerId,
      phone: userId,
      state: 'START',
      previous_state: 'START',
      stack: [],
      context: {},
      locked: true,
      last_interaction: now.toISOString(),
      updated_at: now.toISOString()
    });

  if (insertError) {
    // Se erro de duplicata, outra instância criou primeiro
    if (insertError.code === '23505') {
      console.log(`[BotIntercept] ❌ ANTI-DUPLICAÇÃO: Sessão criada por outra instância para ${userId}`);
      return false;
    }
    console.error(`[BotIntercept] lockSession insert error:`, insertError);
    return false;
  }

  console.log(`[BotIntercept] ✅ Nova sessão criada e bloqueada para ${userId}`);
  return true;
}

/**
 * 7. unlockSession - Desbloqueia a sessão
 * 
 * SEMPRE deve ser chamado após processamento, mesmo em caso de erro
 * Use try/finally para garantir execução
 */
async function unlockSession(
  supabase: SupabaseClient,
  userId: string,
  sellerId: string
): Promise<void> {
  try {
    const { error } = await supabase
      .from('bot_sessions')
      .update({
        locked: false,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('seller_id', sellerId);

    if (error) {
      console.error(`[BotIntercept] ⚠️ unlockSession error:`, error);
    } else {
      console.log(`[BotIntercept] 🔓 Sessão desbloqueada para ${userId}`);
    }
  } catch (err) {
    console.error(`[BotIntercept] ⚠️ unlockSession exception:`, err);
  }
}

/**
 * 2. parseInput - Interpreta a mensagem do usuário
 */
function parseInput(message: string): ParsedInput {
  const original = message;
  const normalized = message.toLowerCase().trim();
  
  // Verificar se é número
  const numericValue = parseInt(normalized, 10);
  const isNumber = !isNaN(numericValue) && /^\d+$/.test(normalized);
  
  // Verificar se é comando (começa com / ou !)
  const isCommand = /^[\/!]/.test(normalized);
  let command: string | null = null;
  let args: string[] = [];
  
  if (isCommand) {
    const parts = normalized.slice(1).split(/\s+/);
    command = parts[0] || null;
    args = parts.slice(1);
  }
  
  // Extrair palavras-chave
  const keywords = normalized
    .replace(/[^\w\sáéíóúâêîôûãõç]/gi, '')
    .split(/\s+/)
    .filter(word => word.length > 2);

  return {
    original,
    normalized,
    isNumber,
    number: isNumber ? numericValue : null,
    isCommand,
    command,
    args,
    keywords
  };
}

/**
 * 3. matchGlobalCommand - Verifica comandos globais
 */
function matchGlobalCommand(parsed: ParsedInput): { action: string } | null {
  for (const cmd of GLOBAL_COMMANDS) {
    for (const keyword of cmd.keywords) {
      if (parsed.normalized === keyword) {
        return { action: cmd.action };
      }
    }
  }
  return null;
}

/**
 * 4. executeAction - Executa a ação do comando
 */
/**
 * 4. executeAction - Executa a ação do comando
 * ⚠️ NÃO retorna mensagens - apenas muda estado/stack
 * As mensagens devem vir dos fluxos configurados nas tabelas bot_engine_*
 */
function executeAction(
  action: string, 
  currentStack: string[], 
  previousState: string
): ActionResult {
  switch (action) {
    // =========================================================
    // "0" → Retornar ao previous_state (menu anterior)
    // =========================================================
    case 'back_to_previous':
      // Usar previous_state do banco (trigger atualiza automaticamente)
      const backState = previousState || 'START';
      const stackAfterBack = [...currentStack];
      if (stackAfterBack.length > 0) {
        stackAfterBack.pop();
      }
      return {
        success: true,
        newState: backState,
        popStack: true,
      };

    // =========================================================
    // "#" → Retornar para o estado START (menu inicial)
    // =========================================================
    case 'back_to_start':
      return {
        success: true,
        newState: 'START',
        clearStack: true,
      };

    // =========================================================
    // Comandos adicionais
    // =========================================================
    case 'menu':
      return {
        success: true,
        newState: 'MENU',
        clearStack: true,
      };

    case 'sair':
      return {
        success: true,
        newState: 'ENCERRADO',
        clearStack: true,
      };

    case 'humano':
      return {
        success: true,
        newState: 'AGUARDANDO_HUMANO',
      };

    default:
      return { success: false };
  }
}

/**
 * 5. updateStateAndStack - Atualiza estado e pilha
 */
async function updateStateAndStack(
  supabase: SupabaseClient,
  userId: string,
  sellerId: string,
  newState: string,
  actionResult: ActionResult,
  currentStack: string[]
): Promise<string[]> {
  let updatedStack = [...currentStack];

  if (actionResult.clearStack) {
    updatedStack = [];
  } else if (actionResult.popStack && updatedStack.length > 0) {
    updatedStack.pop();
  }

  await supabase
    .from('bot_sessions')
    .update({
      state: newState,
      stack: updatedStack,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('seller_id', sellerId);

  console.log(`[BotIntercept] State updated to ${newState}, stack: [${updatedStack.join(', ')}]`);
  return updatedStack;
}

/**
 * 6. sendMessage - Registra mensagem no log
 */
async function logMessage(
  supabase: SupabaseClient,
  userId: string,
  sellerId: string,
  message: string,
  fromUser: boolean
): Promise<void> {
  await supabase.from('bot_logs').insert({
    user_id: userId,
    seller_id: sellerId,
    message,
    from_user: fromUser,
  });
}

// =====================================================================
// HANDLER PRINCIPAL
// =====================================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  let userId = '';
  let sellerId = '';

  try {
    const input: BotInterceptRequest = await req.json();
    const { seller_id, sender_phone, message_text } = input;

    if (!seller_id || !sender_phone || !message_text) {
      return new Response(
        JSON.stringify({ intercepted: false, should_continue: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Normalizar identificadores
    const phone = sender_phone.replace(/\D/g, '');
    userId = phone;
    sellerId = seller_id;
    
    console.log(`[BotIntercept] Processing message from ${phone} for seller ${sellerId}`);

    // Verificar se BotEngine está habilitado
    const { data: config } = await supabase
      .from('bot_engine_config')
      .select('is_enabled')
      .eq('seller_id', sellerId)
      .eq('is_enabled', true)
      .maybeSingle();

    if (!config) {
      console.log(`[BotIntercept] BotEngine disabled for seller ${sellerId}`);
      return new Response(
        JSON.stringify({ intercepted: false, should_continue: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // =========================================================
    // PASSO 1: lockSession
    // =========================================================
    const locked = await lockSession(supabase, userId, sellerId);
    if (!locked) {
      // Sessão já está sendo processada
      return new Response(
        JSON.stringify({ intercepted: false, should_continue: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    try {
      // Buscar sessão atual
      const { data: session } = await supabase
        .from('bot_sessions')
        .select('*')
        .eq('user_id', userId)
        .eq('seller_id', sellerId)
        .single();

      const currentState = session?.state || 'INICIO';
      const previousState = session?.previous_state || 'INICIO';
      const currentStack: string[] = (session?.stack as string[]) || [];
      const context = session?.context || {};

      // =========================================================
      // PASSO 2: parseInput
      // =========================================================
      const parsed = parseInput(message_text);
      console.log(`[BotIntercept] Parsed input:`, JSON.stringify(parsed));

      // Log da mensagem recebida
      await logMessage(supabase, userId, sellerId, message_text, true);

      // Se estado é ENCERRADO ou AGUARDANDO_HUMANO, não interceptar
      if (['ENCERRADO', 'AGUARDANDO_HUMANO'].includes(currentState)) {
        console.log(`[BotIntercept] Session in ${currentState}, passing through`);
        await unlockSession(supabase, userId, sellerId);
        return new Response(
          JSON.stringify({ intercepted: false, should_continue: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Se é comando do sistema (começa com /), deixar handler existente
      if (parsed.isCommand) {
        console.log(`[BotIntercept] System command detected, passing to existing handler`);
        await unlockSession(supabase, userId, sellerId);
        return new Response(
          JSON.stringify({ intercepted: false, should_continue: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // =========================================================
      // PASSO 3: Verificar comandos globais
      // =========================================================
      const globalCmd = matchGlobalCommand(parsed);

      if (!globalCmd) {
        // Não é comando global, deixar fluxo seguir
        console.log(`[BotIntercept] No global command matched, passing through`);
        await unlockSession(supabase, userId, sellerId);
        return new Response(
          JSON.stringify({ intercepted: false, should_continue: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`[BotIntercept] Global command matched: ${globalCmd.action}`);

      // =========================================================
      // PASSO 4: executeAction (com previousState para navegação "0")
      // =========================================================
      const actionResult = executeAction(globalCmd.action, currentStack, previousState);

      if (!actionResult.success) {
        await unlockSession(supabase, userId, sellerId);
        return new Response(
          JSON.stringify({ intercepted: false, should_continue: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // =========================================================
      // PASSO 5: Atualizar state e stack
      // =========================================================
      await updateStateAndStack(
        supabase,
        userId,
        sellerId,
        actionResult.newState || currentState,
        actionResult,
        currentStack
      );

      // =========================================================
      // PASSO 6: sendMessage (log da resposta)
      // =========================================================
      if (actionResult.response) {
        await logMessage(supabase, userId, sellerId, actionResult.response, false);
      }

      // =========================================================
      // PASSO 7: unlockSession
      // =========================================================
      await unlockSession(supabase, userId, sellerId);

      return new Response(
        JSON.stringify({
          intercepted: true,
          response: actionResult.response,
          new_state: actionResult.newState,
          should_continue: false,
        } as BotInterceptResponse),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (innerError) {
      // Garantir unlock mesmo em caso de erro
      await unlockSession(supabase, userId, sellerId);
      throw innerError;
    }

  } catch (error) {
    console.error('[BotIntercept] Error:', error);
    
    // Tentar unlock em caso de erro
    if (userId && sellerId) {
      try {
        await unlockSession(supabase, userId, sellerId);
      } catch { /* ignore */ }
    }

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
