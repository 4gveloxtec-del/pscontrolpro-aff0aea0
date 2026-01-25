/**
 * BOT ENGINE - Funções Core
 * Gerenciamento de estado, navegação, parsing e execução
 * 
 * ⚠️ Módulo isolado - não interfere em funções existentes
 */

import { supabase } from "@/integrations/supabase/client";

// =====================================================================
// TIPOS
// =====================================================================

export interface BotSessionState {
  id: string;
  user_id: string;
  seller_id: string;
  state: string;
  stack: string[];
  locked: boolean;
  created_at: string;
  updated_at: string;
}

export interface ParsedInput {
  original: string;
  normalized: string;
  isNumber: boolean;
  number: number | null;
  isCommand: boolean;
  command: string | null;
  args: string[];
  keywords: string[];
}

export interface ActionResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export type MessageType = 'text' | 'image' | 'document' | 'buttons' | 'list';

// =====================================================================
// STATE MANAGEMENT
// =====================================================================

/**
 * Obtém o estado atual do usuário
 */
export async function getState(userId: string, sellerId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('bot_sessions')
    .select('state')
    .eq('user_id', userId)
    .eq('seller_id', sellerId)
    .maybeSingle();

  if (error) {
    console.error('[BotEngine] getState error:', error);
    return null;
  }

  return data?.state || null;
}

/**
 * Define o estado do usuário
 */
export async function setState(userId: string, sellerId: string, state: string): Promise<boolean> {
  const { error } = await supabase
    .from('bot_sessions')
    .upsert({
      user_id: userId,
      seller_id: sellerId,
      state,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'user_id,seller_id'
    });

  if (error) {
    console.error('[BotEngine] setState error:', error);
    return false;
  }

  return true;
}

// =====================================================================
// STACK NAVIGATION
// =====================================================================

/**
 * Adiciona estado à pilha de navegação
 */
export async function pushStack(userId: string, sellerId: string, state: string): Promise<boolean> {
  // Buscar stack atual
  const { data } = await supabase
    .from('bot_sessions')
    .select('stack')
    .eq('user_id', userId)
    .eq('seller_id', sellerId)
    .maybeSingle();

  const currentStack = (data?.stack as string[]) || [];
  const newStack = [...currentStack, state];

  const { error } = await supabase
    .from('bot_sessions')
    .upsert({
      user_id: userId,
      seller_id: sellerId,
      stack: newStack,
      state,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'user_id,seller_id'
    });

  if (error) {
    console.error('[BotEngine] pushStack error:', error);
    return false;
  }

  return true;
}

/**
 * Remove e retorna o último estado da pilha
 */
export async function popStack(userId: string, sellerId: string): Promise<string | null> {
  // Buscar stack atual
  const { data } = await supabase
    .from('bot_sessions')
    .select('stack')
    .eq('user_id', userId)
    .eq('seller_id', sellerId)
    .maybeSingle();

  const currentStack = (data?.stack as string[]) || [];
  
  if (currentStack.length === 0) {
    return null;
  }

  const poppedState = currentStack.pop();
  const previousState = currentStack[currentStack.length - 1] || 'idle';

  const { error } = await supabase
    .from('bot_sessions')
    .update({
      stack: currentStack,
      state: previousState,
      updated_at: new Date().toISOString()
    })
    .eq('user_id', userId)
    .eq('seller_id', sellerId);

  if (error) {
    console.error('[BotEngine] popStack error:', error);
    return null;
  }

  return poppedState || null;
}

/**
 * Limpa toda a pilha de navegação
 */
export async function clearStack(userId: string, sellerId: string): Promise<boolean> {
  const { error } = await supabase
    .from('bot_sessions')
    .update({
      stack: [],
      state: 'idle',
      updated_at: new Date().toISOString()
    })
    .eq('user_id', userId)
    .eq('seller_id', sellerId);

  if (error) {
    console.error('[BotEngine] clearStack error:', error);
    return false;
  }

  return true;
}

// =====================================================================
// INPUT PARSING
// =====================================================================

/**
 * Interpreta a mensagem do usuário
 */
export function parseInput(userId: string, message: string): ParsedInput {
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
  
  // Extrair palavras-chave (palavras significativas)
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

// =====================================================================
// ACTION EXECUTION
// =====================================================================

/**
 * Executa uma ação específica
 */
export async function executeAction(
  userId: string,
  sellerId: string,
  action: string,
  params: Record<string, unknown> = {}
): Promise<ActionResult> {
  try {
    console.log(`[BotEngine] Executing action: ${action}`, { userId, params });

    switch (action) {
      case 'goto':
        // Navegar para um estado
        const targetState = params.state as string;
        if (targetState) {
          await pushStack(userId, sellerId, targetState);
          return { success: true, data: { state: targetState } };
        }
        return { success: false, error: 'Estado não especificado' };

      case 'back':
        // Voltar ao estado anterior
        const previousState = await popStack(userId, sellerId);
        return { success: true, data: { state: previousState } };

      case 'home':
        // Voltar ao início
        await clearStack(userId, sellerId);
        await setState(userId, sellerId, 'main');
        return { success: true, data: { state: 'main' } };

      case 'set_variable':
        // Definir variável na sessão
        const varName = params.name as string;
        const varValue = params.value;
        // Armazenar variáveis em formato JSON no stack temporariamente
        // Isso pode ser expandido para uma tabela de variáveis se necessário
        return { success: true, data: { [varName]: varValue } };

      case 'api_call':
        // Chamar API externa (placeholder - implementar conforme necessário)
        const apiUrl = params.url as string;
        const apiMethod = (params.method as string) || 'GET';
        console.log(`[BotEngine] API call: ${apiMethod} ${apiUrl}`);
        return { success: true, data: { url: apiUrl, method: apiMethod } };

      case 'human':
        // Transferir para atendente humano
        await setState(userId, sellerId, 'human_transfer');
        return { success: true, data: { transferred: true } };

      case 'end':
        // Encerrar sessão
        await clearStack(userId, sellerId);
        await setState(userId, sellerId, 'ended');
        await unlockSession(userId, sellerId);
        return { success: true, data: { ended: true } };

      default:
        console.warn(`[BotEngine] Unknown action: ${action}`);
        return { success: false, error: `Ação desconhecida: ${action}` };
    }
  } catch (error) {
    console.error('[BotEngine] executeAction error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Erro ao executar ação' 
    };
  }
}

// =====================================================================
// MESSAGE LOGGING
// =====================================================================

/**
 * Registra mensagem no log
 */
export async function sendMessage(
  userId: string,
  sellerId: string,
  content: string,
  type: MessageType = 'text',
  fromUser: boolean = false
): Promise<boolean> {
  const { error } = await supabase
    .from('bot_logs')
    .insert({
      user_id: userId,
      seller_id: sellerId,
      message: content,
      from_user: fromUser
    });

  if (error) {
    console.error('[BotEngine] sendMessage error:', error);
    return false;
  }

  return true;
}

// =====================================================================
// SESSION LOCKING
// =====================================================================

/**
 * Bloqueia a sessão do usuário (previne processamento paralelo)
 */
export async function lockSession(userId: string, sellerId: string): Promise<boolean> {
  // Verificar se já está bloqueada
  const { data: existing } = await supabase
    .from('bot_sessions')
    .select('locked')
    .eq('user_id', userId)
    .eq('seller_id', sellerId)
    .maybeSingle();

  if (existing?.locked) {
    console.warn('[BotEngine] Session already locked:', userId);
    return false;
  }

  const { error } = await supabase
    .from('bot_sessions')
    .upsert({
      user_id: userId,
      seller_id: sellerId,
      locked: true,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'user_id,seller_id'
    });

  if (error) {
    console.error('[BotEngine] lockSession error:', error);
    return false;
  }

  return true;
}

/**
 * Desbloqueia a sessão do usuário
 */
export async function unlockSession(userId: string, sellerId: string): Promise<boolean> {
  const { error } = await supabase
    .from('bot_sessions')
    .update({
      locked: false,
      updated_at: new Date().toISOString()
    })
    .eq('user_id', userId)
    .eq('seller_id', sellerId);

  if (error) {
    console.error('[BotEngine] unlockSession error:', error);
    return false;
  }

  return true;
}

// =====================================================================
// HELPERS
// =====================================================================

/**
 * Obtém sessão completa do usuário
 */
export async function getSession(userId: string, sellerId: string): Promise<BotSessionState | null> {
  const { data, error } = await supabase
    .from('bot_sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('seller_id', sellerId)
    .maybeSingle();

  if (error) {
    console.error('[BotEngine] getSession error:', error);
    return null;
  }

  if (!data) return null;

  return {
    id: data.id,
    user_id: data.user_id,
    seller_id: data.seller_id,
    state: data.state,
    stack: (data.stack as string[]) || [],
    locked: data.locked,
    created_at: data.created_at,
    updated_at: data.updated_at
  };
}

/**
 * Obtém logs de mensagens do usuário
 */
export async function getMessageLogs(
  userId: string, 
  sellerId: string, 
  limit: number = 50
): Promise<{ message: string; from_user: boolean; created_at: string }[]> {
  const { data, error } = await supabase
    .from('bot_logs')
    .select('message, from_user, created_at')
    .eq('user_id', userId)
    .eq('seller_id', sellerId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[BotEngine] getMessageLogs error:', error);
    return [];
  }

  return data || [];
}
