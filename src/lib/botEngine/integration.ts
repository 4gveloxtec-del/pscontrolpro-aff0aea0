/**
 * BOT ENGINE - Integração com APIs Existentes
 * 
 * Este módulo fornece funções para chamar as APIs já existentes no sistema,
 * SEM modificar nenhuma delas. O BotEngine apenas as utiliza.
 */

import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

// =====================================================================
// TIPOS
// =====================================================================

export interface BotIntegrationContext {
  sellerId: string;
  sessionId: string;
  contactPhone: string;
  contactName?: string;
  variables: Record<string, unknown>;
}

export interface SendMessageParams {
  phone: string;
  message: string;
  instanceName: string;
  evolutionUrl: string;
  evolutionApiKey: string;
}

// =====================================================================
// FUNÇÕES DE INTEGRAÇÃO
// =====================================================================

/**
 * Busca configuração do WhatsApp do seller (usa tabela existente)
 */
export async function getSellerWhatsAppConfig(sellerId: string): Promise<{
  id: string;
  seller_id: string;
  instance_name: string;
  instance_link: string | null;
  is_connected: boolean | null;
} | null> {
  const { data, error } = await supabase
    .from('whatsapp_seller_instances')
    .select('id, seller_id, instance_name, instance_link, is_connected')
    .eq('seller_id', sellerId)
    .eq('is_connected', true)
    .limit(1);

  if (error) {
    console.error('[BotEngine Integration] Error fetching WhatsApp config:', error);
    return null;
  }

  if (!data || data.length === 0) return null;
  
  return data[0];
}

/**
 * Envia mensagem usando a Edge Function evolution-api existente
 */
export async function sendWhatsAppMessage(params: SendMessageParams): Promise<boolean> {
  try {
    const { data, error } = await supabase.functions.invoke('evolution-api', {
      body: {
        action: 'send_message',
        instanceName: params.instanceName,
        evolutionUrl: params.evolutionUrl,
        evolutionApiKey: params.evolutionApiKey,
        phone: params.phone,
        message: params.message,
      },
    });

    if (error) {
      console.error('[BotEngine Integration] Error sending message:', error);
      return false;
    }

    return data?.success || false;
  } catch (err) {
    console.error('[BotEngine Integration] Exception sending message:', err);
    return false;
  }
}

/**
 * Busca cliente pelo telefone (usa tabela existente)
 */
export async function findClientByPhone(sellerId: string, phone: string) {
  // Normalizar telefone
  let normalizedPhone = phone.replace(/\D/g, '');
  if (!normalizedPhone.startsWith('55') && normalizedPhone.length >= 10) {
    normalizedPhone = '55' + normalizedPhone;
  }

  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('seller_id', sellerId)
    .eq('phone', normalizedPhone)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[BotEngine Integration] Error finding client:', error);
    return null;
  }

  return data;
}

/**
 * Busca planos ativos do seller (usa tabela existente)
 */
export async function getSellerPlans(sellerId: string) {
  const { data, error } = await supabase
    .from('plans')
    .select('*')
    .eq('seller_id', sellerId)
    .eq('is_active', true)
    .order('price', { ascending: true });

  if (error) {
    console.error('[BotEngine Integration] Error fetching plans:', error);
    return [];
  }

  return data || [];
}

/**
 * Busca servidores do seller (usa tabela existente)
 */
export async function getSellerServers(sellerId: string) {
  const { data, error } = await supabase
    .from('servers')
    .select('*')
    .eq('seller_id', sellerId)
    .order('name', { ascending: true });

  if (error) {
    console.error('[BotEngine Integration] Error fetching servers:', error);
    return [];
  }

  return data || [];
}

/**
 * Salva contexto externo na sessão do bot
 */
export async function saveExternalContext(
  sessionId: string, 
  context: Record<string, unknown>
): Promise<boolean> {
  const { error } = await supabase
    .from('bot_engine_sessions')
    .update({
      external_context: context as Json,
      last_activity_at: new Date().toISOString(),
    })
    .eq('id', sessionId);

  if (error) {
    console.error('[BotEngine Integration] Error saving context:', error);
    return false;
  }

  return true;
}

/**
 * Recupera contexto externo da sessão
 */
export async function getExternalContext(sessionId: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from('bot_engine_sessions')
    .select('external_context')
    .eq('id', sessionId)
    .single();

  if (error) {
    console.error('[BotEngine Integration] Error getting context:', error);
    return null;
  }

  return (data?.external_context as Record<string, unknown>) || {};
}

/**
 * Chama o processador de comandos WhatsApp existente
 * Útil para quando o bot precisa executar um comando como /teste
 */
export async function executeExistingCommand(
  sellerId: string,
  senderPhone: string,
  commandText: string,
  instanceName: string
): Promise<{ success: boolean; response?: string; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('process-whatsapp-command', {
      body: {
        seller_id: sellerId,
        sender_phone: senderPhone,
        command_text: commandText,
        instance_name: instanceName,
      },
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: data?.success || false,
      response: data?.response,
      error: data?.error,
    };
  } catch (err) {
    return { 
      success: false, 
      error: err instanceof Error ? err.message : 'Unknown error' 
    };
  }
}

/**
 * Verifica se há sessão de bot ativa para um telefone
 */
export async function hasActiveBotSession(sellerId: string, phone: string): Promise<boolean> {
  let normalizedPhone = phone.replace(/\D/g, '');
  if (!normalizedPhone.startsWith('55') && normalizedPhone.length >= 10) {
    normalizedPhone = '55' + normalizedPhone;
  }

  const { data, error } = await supabase
    .from('bot_engine_sessions')
    .select('id')
    .eq('seller_id', sellerId)
    .eq('contact_phone', normalizedPhone)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  if (error) return false;
  return !!data;
}

/**
 * Processa mensagem através do BotEngine
 * Esta função pode ser chamada pelo webhook existente
 */
export async function processBotMessage(
  sellerId: string,
  contactPhone: string,
  messageText: string,
  contactName?: string,
  metadata?: Record<string, unknown>
): Promise<{
  success: boolean;
  responses: Array<{ type: string; content?: string }>;
  sessionId?: string;
  error?: string;
}> {
  try {
    const { data, error } = await supabase.functions.invoke('bot-engine-process', {
      body: {
        seller_id: sellerId,
        contact_phone: contactPhone,
        contact_name: contactName,
        message_text: messageText,
        metadata,
      },
    });

    if (error) {
      return { success: false, responses: [], error: error.message };
    }

    return {
      success: data?.success || false,
      responses: data?.responses || [],
      sessionId: data?.session_id,
      error: data?.error,
    };
  } catch (err) {
    return {
      success: false,
      responses: [],
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}
