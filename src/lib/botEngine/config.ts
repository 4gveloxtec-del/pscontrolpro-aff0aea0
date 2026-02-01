/**
 * BOT ENGINE - Gerenciamento de Configuração por Revendedor
 * 
 * Funções utilitárias para carregar e validar configurações do bot
 * de forma dinâmica por seller_id.
 */

import { supabase } from '@/integrations/supabase/client';
import type { BotEngineConfig } from './types';

// =====================================================================
// CACHE LOCAL (opcional, para reduzir consultas)
// =====================================================================

const configCache = new Map<string, { config: BotEngineConfig; cachedAt: number }>();
const CACHE_TTL_MS = 60_000; // 1 minuto

// =====================================================================
// CARREGAMENTO DE CONFIGURAÇÃO
// =====================================================================

/**
 * Carrega configuração do bot para um seller específico
 * Usa cache local para otimizar consultas frequentes
 */
export async function loadBotConfig(sellerId: string): Promise<BotEngineConfig | null> {
  // Verificar cache
  const cached = configCache.get(sellerId);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.config;
  }

  const { data, error } = await supabase
    .from('bot_engine_config')
    .select('*')
    .eq('seller_id', sellerId)
    .maybeSingle();

  if (error) {
    console.error('[BotConfig] Error loading config:', error);
    return null;
  }

  if (data) {
    // Normalizar dados do banco para o tipo correto
    const config = normalizeConfig(data);
    configCache.set(sellerId, { config, cachedAt: Date.now() });
    return config;
  }

  return null;
}

/**
 * Invalida cache de configuração para um seller
 */
export function invalidateConfigCache(sellerId?: string): void {
  if (sellerId) {
    configCache.delete(sellerId);
  } else {
    configCache.clear();
  }
}

/**
 * Normaliza dados do banco para o tipo BotEngineConfig
 */
function normalizeConfig(data: Record<string, unknown>): BotEngineConfig {
  return {
    id: data.id as string,
    seller_id: data.seller_id as string,
    is_enabled: data.is_enabled as boolean ?? false,
    
    // Mensagens
    welcome_message: data.welcome_message as string ?? 'Olá! 👋 Seja bem-vindo(a)!',
    welcome_media_url: data.welcome_media_url as string | undefined,
    welcome_media_type: (data.welcome_media_type as 'none' | 'image' | 'video' | 'audio' | 'document') ?? 'none',
    fallback_message: data.fallback_message as string ?? 'Desculpe, não entendi.',
    inactivity_message: data.inactivity_message as string ?? 'Sessão encerrada por inatividade.',
    outside_hours_message: data.outside_hours_message as string ?? 'Estamos fora do horário.',
    human_takeover_message: data.human_takeover_message as string ?? 'Transferindo para atendente...',
    
    // Menu
    main_menu_key: data.main_menu_key as string ?? 'main',
    
    // Modo de exibição de menus
    use_text_menus: data.use_text_menus as boolean ?? false,
    
    // Timeouts
    default_timeout_minutes: data.default_timeout_minutes as number ?? 30,
    session_expire_minutes: data.session_expire_minutes as number ?? 60,
    max_inactivity_minutes: data.max_inactivity_minutes as number ?? 30,
    auto_reply_delay_ms: data.auto_reply_delay_ms as number ?? 500,
    
    // Horário
    business_hours_enabled: data.business_hours_enabled as boolean ?? false,
    business_hours_start: data.business_hours_start as string ?? '08:00',
    business_hours_end: data.business_hours_end as string ?? '22:00',
    business_days: data.business_days as number[] ?? [1, 2, 3, 4, 5, 6],
    timezone: data.timezone as string ?? 'America/Sao_Paulo',
    
    // Comportamento de primeiro contato
    welcome_cooldown_hours: data.welcome_cooldown_hours as number ?? 24,
    suppress_fallback_first_contact: data.suppress_fallback_first_contact as boolean ?? true,
    
    // Comportamento
    typing_simulation: data.typing_simulation as boolean ?? true,
    human_takeover_enabled: data.human_takeover_enabled as boolean ?? true,
    
    // Fluxos
    enabled_flows: data.enabled_flows as string[] ?? [],
    disabled_commands: data.disabled_commands as string[] ?? [],
    custom_variables: data.custom_variables as Record<string, string> ?? {},
    
    // Metadados
    created_at: data.created_at as string,
    updated_at: data.updated_at as string,
  };
}

// =====================================================================
// VERIFICAÇÃO DE HORÁRIO DE FUNCIONAMENTO
// =====================================================================

/**
 * Verifica se o bot está dentro do horário de funcionamento
 */
export function isWithinBusinessHours(config: BotEngineConfig): boolean {
  if (!config.business_hours_enabled) return true;
  
  // Criar data no timezone configurado
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('pt-BR', {
    timeZone: config.timezone,
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
  });
  
  const parts = formatter.formatToParts(now);
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0');
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0');
  
  // Converter dia da semana (JavaScript: 0=Dom, 6=Sáb) para nosso formato (1=Seg, 7=Dom)
  const jsDay = now.getDay();
  const currentDay = jsDay === 0 ? 7 : jsDay;
  
  // Verificar dia
  if (!config.business_days.includes(currentDay)) {
    return false;
  }
  
  // Verificar hora
  const [startH, startM] = config.business_hours_start.split(':').map(Number);
  const [endH, endM] = config.business_hours_end.split(':').map(Number);
  
  const currentMinutes = hour * 60 + minute;
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;
  
  // Lidar com horário que cruza meia-noite
  if (endMinutes < startMinutes) {
    return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
  }
  
  return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
}

/**
 * Verifica se um fluxo está habilitado para o seller
 */
export function isFlowEnabled(config: BotEngineConfig, flowId: string): boolean {
  // Se enabled_flows está vazio, todos os fluxos estão habilitados
  if (!config.enabled_flows || config.enabled_flows.length === 0) {
    return true;
  }
  return config.enabled_flows.includes(flowId);
}

/**
 * Verifica se um comando global está desabilitado
 */
export function isCommandDisabled(config: BotEngineConfig, command: string): boolean {
  if (!config.disabled_commands || config.disabled_commands.length === 0) {
    return false;
  }
  return config.disabled_commands.includes(command.toLowerCase());
}

/**
 * Substitui variáveis personalizadas em uma mensagem
 */
export function replaceCustomVariables(
  message: string, 
  config: BotEngineConfig,
  extraVars?: Record<string, string>
): string {
  let result = message;
  
  // Substituir variáveis do config
  if (config.custom_variables) {
    for (const [key, value] of Object.entries(config.custom_variables)) {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'gi'), value);
    }
  }
  
  // Substituir variáveis extras
  if (extraVars) {
    for (const [key, value] of Object.entries(extraVars)) {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'gi'), value);
    }
  }
  
  return result;
}

// =====================================================================
// CONFIGURAÇÃO PADRÃO
// =====================================================================

/**
 * Retorna configuração padrão para novos sellers
 * Mensagem de boas-vindas com menu de opções padrão
 */
export function getDefaultConfig(sellerId: string): Partial<BotEngineConfig> {
  return {
    seller_id: sellerId,
    is_enabled: false,
    welcome_message: `Olá! 👋 Seja bem-vindo!

Escolha uma opção:
1️⃣ Testar IPTV
2️⃣ Ver Planos
3️⃣ Suporte`,
    welcome_media_type: 'none',
    fallback_message: 'Desculpe, não entendi. Digite *menu* para ver as opções.',
    main_menu_key: 'main',
    use_text_menus: false,
    business_hours_enabled: false,
    business_hours_start: '08:00',
    business_hours_end: '22:00',
    business_days: [1, 2, 3, 4, 5, 6], // Seg-Sáb
    timezone: 'America/Sao_Paulo',
    welcome_cooldown_hours: 24,
    suppress_fallback_first_contact: true,
    auto_reply_delay_ms: 500,
    typing_simulation: true,
    max_inactivity_minutes: 30,
    session_expire_minutes: 60,
    human_takeover_enabled: true,
    enabled_flows: [],
    disabled_commands: [],
    custom_variables: {},
  };
}
