/**
 * BOT ENGINE - Navegação
 * Controle de ir/voltar entre nós do fluxo
 */

import { supabase } from '@/integrations/supabase/client';

export interface NavigationState {
  sessionId: string;
  currentNodeId: string | null;
  history: string[];
  canGoBack: boolean;
}

/**
 * Navega para um nó específico, salvando o atual no histórico
 */
export async function navigateTo(
  sessionId: string,
  targetNodeId: string,
  currentNodeId: string | null
): Promise<NavigationState> {
  // Buscar sessão atual
  const { data: session, error: fetchError } = await supabase
    .from('bot_engine_sessions')
    .select('navigation_history, current_node_id')
    .eq('id', sessionId)
    .single();

  if (fetchError) throw fetchError;

  // Adicionar nó atual ao histórico (se existir)
  const rawHistory = session.navigation_history;
  const history: string[] = Array.isArray(rawHistory) ? rawHistory as string[] : [];
  if (currentNodeId && currentNodeId !== targetNodeId) {
    history.push(currentNodeId);
  }

  // Atualizar sessão
  const { error: updateError } = await supabase
    .from('bot_engine_sessions')
    .update({
      current_node_id: targetNodeId,
      navigation_history: history,
      last_activity_at: new Date().toISOString(),
    })
    .eq('id', sessionId);

  if (updateError) throw updateError;

  return {
    sessionId,
    currentNodeId: targetNodeId,
    history,
    canGoBack: history.length > 0,
  };
}

/**
 * Volta para o nó anterior no histórico
 */
export async function navigateBack(sessionId: string): Promise<NavigationState | null> {
  // Buscar sessão atual
  const { data: session, error: fetchError } = await supabase
    .from('bot_engine_sessions')
    .select('navigation_history, current_node_id')
    .eq('id', sessionId)
    .single();

  if (fetchError) throw fetchError;

  const rawHistory = session.navigation_history;
  const history: string[] = Array.isArray(rawHistory) ? [...rawHistory as string[]] : [];
  
  // Se não há histórico, não pode voltar
  if (history.length === 0) {
    return null;
  }

  // Remove último item do histórico e usa como novo nó atual
  const previousNodeId = history.pop();

  // Atualizar sessão
  const { error: updateError } = await supabase
    .from('bot_engine_sessions')
    .update({
      current_node_id: previousNodeId,
      navigation_history: history,
      last_activity_at: new Date().toISOString(),
    })
    .eq('id', sessionId);

  if (updateError) throw updateError;

  return {
    sessionId,
    currentNodeId: previousNodeId || null,
    history,
    canGoBack: history.length > 0,
  };
}

/**
 * Reseta navegação para o início do fluxo
 */
export async function navigateToStart(sessionId: string, entryNodeId: string): Promise<NavigationState> {
  const { error: updateError } = await supabase
    .from('bot_engine_sessions')
    .update({
      current_node_id: entryNodeId,
      navigation_history: [],
      last_activity_at: new Date().toISOString(),
    })
    .eq('id', sessionId);

  if (updateError) throw updateError;

  return {
    sessionId,
    currentNodeId: entryNodeId,
    history: [],
    canGoBack: false,
  };
}

/**
 * Verifica se pode voltar
 */
export async function canGoBack(sessionId: string): Promise<boolean> {
  const { data: session, error } = await supabase
    .from('bot_engine_sessions')
    .select('navigation_history')
    .eq('id', sessionId)
    .single();

  if (error) return false;
  
  const rawHistory = session.navigation_history;
  const history: string[] = Array.isArray(rawHistory) ? rawHistory as string[] : [];
  return history.length > 0;
}

/**
 * Obtém estado atual de navegação
 */
export async function getNavigationState(sessionId: string): Promise<NavigationState | null> {
  const { data: session, error } = await supabase
    .from('bot_engine_sessions')
    .select('navigation_history, current_node_id')
    .eq('id', sessionId)
    .single();

  if (error) return null;

  const rawHistory = session.navigation_history;
  const history: string[] = Array.isArray(rawHistory) ? rawHistory as string[] : [];
  
  return {
    sessionId,
    currentNodeId: session.current_node_id,
    history,
    canGoBack: history.length > 0,
  };
}
