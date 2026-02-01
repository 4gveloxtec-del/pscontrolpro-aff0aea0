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
import { 
  processStateTransition, 
  getStateMessage, 
  stateRequiresInput,
  updateSessionContext,
  STATE_MESSAGES,
  type StateTransitionResult 
} from "../_shared/bot-state-machine.ts";
import {
  isNavigationCommand,
  processNavigationSelection,
} from "../_shared/interactive-list.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// =====================================================================
// WHITELIST DE TELEFONES DE TESTE
// Números nesta lista ignoram cooldown de boas-vindas e outras travas
// =====================================================================
const TEST_WHITELIST_PHONES: string[] = [
  '5531998518865',  // Número de desenvolvimento/teste
  '31998518865',    // Mesmo número sem DDI
];

/**
 * Verifica se o telefone está na whitelist de testes
 */
function isPhoneWhitelisted(phone: string): boolean {
  const normalized = phone.replace(/\D/g, '');
  return TEST_WHITELIST_PHONES.some(w => {
    const wNorm = w.replace(/\D/g, '');
    return normalized === wNorm || 
           normalized.endsWith(wNorm) || 
           wNorm.endsWith(normalized);
  });
}

// =====================================================================
// SISTEMA DE DEBUG - LOGS ESTRUTURADOS PARA AMBIENTE DE TESTE
// =====================================================================

/**
 * Flag de debug - ativada via variável de ambiente BOT_DEBUG=true
 * Em produção deve estar desativada para não impactar performance
 */
const DEBUG_MODE = Deno.env.get("BOT_DEBUG") === "true";

/**
 * Estrutura de log de execução do chatbot
 * Captura o fluxo sem expor dados sensíveis
 */
interface DebugLogEntry {
  timestamp: string;
  phone_masked: string;  // Telefone mascarado (ex: 55***1234)
  seller_id_short: string;  // Apenas primeiros 8 chars do UUID
  current_state: string;
  input_normalized: string;  // Input sem dados sensíveis
  next_state: string;
  action_executed: string | null;
  response_preview: string;  // Apenas primeiros 50 chars
  processing_time_ms: number;
}

/**
 * Mascara telefone para log seguro
 */
function maskPhone(phone: string): string {
  if (!phone || phone.length < 8) return '***';
  return phone.slice(0, 2) + '***' + phone.slice(-4);
}

/**
 * Trunca seller_id para log
 */
function shortSellerId(sellerId: string): string {
  return sellerId?.substring(0, 8) || '???';
}

/**
 * Logger de debug - só executa se DEBUG_MODE=true
 */
function debugLog(entry: Partial<DebugLogEntry>): void {
  if (!DEBUG_MODE) return;
  
  const logEntry: DebugLogEntry = {
    timestamp: new Date().toISOString(),
    phone_masked: entry.phone_masked || '***',
    seller_id_short: entry.seller_id_short || '???',
    current_state: entry.current_state || 'UNKNOWN',
    input_normalized: entry.input_normalized?.substring(0, 50) || '',
    next_state: entry.next_state || entry.current_state || 'UNKNOWN',
    action_executed: entry.action_executed || null,
    response_preview: entry.response_preview?.substring(0, 50) || '',
    processing_time_ms: entry.processing_time_ms || 0,
  };
  
  console.log(`[BotDebug] 📊 EXECUTION LOG:`, JSON.stringify(logEntry, null, 2));
}

/**
 * Logger de transição de estado - só executa se DEBUG_MODE=true
 */
function debugStateTransition(
  phone: string,
  sellerId: string,
  fromState: string,
  toState: string,
  input: string,
  action: string | null
): void {
  if (!DEBUG_MODE) return;
  
  console.log(`[BotDebug] 🔄 STATE TRANSITION`);
  console.log(`[BotDebug] ├─ Phone: ${maskPhone(phone)}`);
  console.log(`[BotDebug] ├─ Seller: ${shortSellerId(sellerId)}`);
  console.log(`[BotDebug] ├─ From: ${fromState}`);
  console.log(`[BotDebug] ├─ To: ${toState}`);
  console.log(`[BotDebug] ├─ Input: "${input.substring(0, 30)}${input.length > 30 ? '...' : ''}"`);
  console.log(`[BotDebug] └─ Action: ${action || 'none'}`);
}

// =====================================================================
// TIPOS
// =====================================================================

interface BotInterceptRequest {
  seller_id: string;
  sender_phone: string;
  message_text: string;
  instance_name?: string;
  contact_name?: string; // Nome do contato (pushName do WhatsApp)
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

// NOTA: Interfaces MenuOption e DynamicMenu removidas - sistema legado descontinuado
// O chatbot agora usa EXCLUSIVAMENTE bot_engine_flows + nodes + edges

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
  // NOTA: "*" removido - ele serve como roteador para o bot, não como comando direto
  { keywords: ['voltar', 'anterior', 'retornar'], action: 'back_to_previous', priority: 90 },
  { keywords: ['inicio', 'início', 'começo', 'reiniciar', 'start', '00', '##'], action: 'back_to_start', priority: 90 },
  { keywords: ['menu', 'cardapio', 'opcoes', 'opções'], action: 'menu', priority: 80 },
  { keywords: ['sair', 'exit', 'encerrar', 'tchau', 'bye', 'fim'], action: 'sair', priority: 70 },
  { keywords: ['humano', 'atendente', 'pessoa', 'suporte', 'falar com alguem'], action: 'humano', priority: 60 },
];

// =====================================================================
// INTERPOLAÇÃO DE VARIÁVEIS - MENSAGENS PERSONALIZADAS
// =====================================================================

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
function interpolateVariables(text: string, variables: Record<string, string | undefined>): string {
  let result = text;
  
  // Criar mapa expandido com aliases
  const expandedVars: Record<string, string | undefined> = { ...variables };
  
  // Aliases de variáveis
  const aliases: Record<string, string[]> = {
    primeiro_nome: ['first_name', 'firstName'],
    nome: ['name', 'contact_name', 'contactName'],
    empresa: ['company', 'company_name', 'companyName'],
    telefone: ['phone', 'contact_phone', 'contactPhone'],
  };
  
  // Propagar valores entre aliases
  for (const [canonical, aliasList] of Object.entries(aliases)) {
    if (expandedVars[canonical] !== undefined) {
      for (const alias of aliasList) {
        if (expandedVars[alias] === undefined) {
          expandedVars[alias] = expandedVars[canonical];
        }
      }
    } else {
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
    expandedVars.primeiro_nome = expandedVars.nome.split(' ')[0];
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

/**
 * Busca o perfil do revendedor para obter informações como nome da empresa
 */
async function fetchSellerProfile(
  supabase: SupabaseClient,
  sellerId: string
): Promise<{ company_name?: string; full_name?: string; pix_key?: string } | null> {
  try {
    const { data } = await supabase
      .from('profiles')
      .select('company_name, full_name, pix_key')
      .eq('id', sellerId)
      .maybeSingle();
    
    return data;
  } catch (error) {
    console.error('[BotIntercept] Error fetching seller profile:', error);
    return null;
  }
}

// =====================================================================
// SISTEMA ANTI-DUPLICAÇÃO - LOCK ATÔMICO + HASH DE MENSAGEM
// =====================================================================

/**
 * Timeout máximo para considerar um lock como "stale" (abandonado)
 * Se o lock existir há mais tempo que isso, considera como abandonado
 */
// Timeout do lock de sessão.
// IMPORTANTE: este lock existe para evitar processamento paralelo/duplicado.
// Não deve bloquear o usuário por muito tempo entre mensagens.
const LOCK_TIMEOUT_MS = 5000; // 5 segundos

/**
 * Janela de deduplicação para evitar processar a mesma mensagem múltiplas vezes
 */
const DEDUP_WINDOW_MS = 15000; // 15 segundos

/**
 * Gera hash simples de uma mensagem para deduplicação
 */
function generateMessageHash(userId: string, message: string, sellerId: string): string {
  const input = `${userId}:${sellerId}:${message}:${Math.floor(Date.now() / DEDUP_WINDOW_MS)}`;
  // Simple hash using charCodeAt
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(36);
}

// Cache local de mensagens processadas (em memória da instância da função)
const processedMessages = new Map<string, number>();

/**
 * Verifica se a mensagem já foi processada recentemente
 */
function isMessageDuplicate(userId: string, message: string, sellerId: string): boolean {
  const hash = generateMessageHash(userId, message, sellerId);
  const now = Date.now();
  
  // Limpar cache de entradas antigas (mais de 30s)
  for (const [key, timestamp] of processedMessages.entries()) {
    if (now - timestamp > 30000) {
      processedMessages.delete(key);
    }
  }
  
  // Verificar se já processamos
  if (processedMessages.has(hash)) {
    console.log(`[BotIntercept] ❌ DEDUP: Mensagem duplicada detectada (hash: ${hash})`);
    return true;
  }
  
  // Marcar como processada
  processedMessages.set(hash, now);
  return false;
}

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
    .select('locked, last_interaction, updated_at')
    .eq('user_id', userId)
    .eq('seller_id', sellerId)
    .maybeSingle();

  if (existing) {
    // Sessão existe - verificar se está bloqueada
    if (existing.locked) {
      // CRITICAL: usar last_interaction como referência do lock.
      // updated_at pode ser atualizado por outras rotinas sem liberar o lock.
      const lockTime = new Date((existing.last_interaction || existing.updated_at) as string);
      
      // Se lock não expirou, ignorar mensagem (anti-duplicação)
      if (lockTime > lockExpiry) {
        console.log(`[BotIntercept] ❌ LOCK ATIVO: Sessão bloqueada para ${userId}, ignorando mensagem duplicada`);
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
      // Expira o lock por last_interaction (e permite se estiver null)
      .or(`locked.eq.false,last_interaction.lt.${lockExpiry.toISOString()},last_interaction.is.null`)
      .select('id')
      .maybeSingle();

    if (updateError) {
      console.error(`[BotIntercept] lockSession update error:`, updateError);
      return false;
    }

    if (!updated) {
      // Outra instância pegou o lock primeiro
      console.log(`[BotIntercept] ❌ RACE CONDITION: Lock não adquirido para ${userId}, outra instância processando`);
      return false;
    }

    console.log(`[BotIntercept] ✅ Lock adquirido para ${userId}`);
    return true;
  }

  // Sessão não existe - criar nova com lock
  // IMPORTANTE: Iniciar interaction_count como 0 para primeira mensagem ser detectada corretamente
  const { error: insertError } = await supabase
    .from('bot_sessions')
    .insert({
      user_id: userId,
      seller_id: sellerId,
      phone: userId,
      state: 'START',
      previous_state: 'START',
      stack: [],
      context: { interaction_count: 0 },
      locked: true,
      last_interaction: now.toISOString(),
      updated_at: now.toISOString()
    });
  
  console.log(`[BotIntercept] 🆕 Creating new session for ${userId} with interaction_count: 0`);

  if (insertError) {
    // Se erro de duplicata, outra instância criou primeiro
    if (insertError.code === '23505') {
      console.log(`[BotIntercept] ❌ RACE CONDITION: Sessão criada por outra instância para ${userId}`);
      return false;
    }
    console.error(`[BotIntercept] lockSession insert error:`, insertError);
    return false;
  }

  console.log(`[BotIntercept] ✅ Nova sessão criada e bloqueada para ${userId}`);
  return true;
}

/**
 * Wrapper resiliente: tenta adquirir o lock algumas vezes antes de desistir.
 * Isso reduz casos de "already_processing" quando chegam eventos muito próximos.
 */
async function lockSessionWithRetry(
  supabase: SupabaseClient,
  userId: string,
  sellerId: string,
  options: { retries?: number; baseDelayMs?: number } = {}
): Promise<boolean> {
  const retries = options.retries ?? 2;
  const baseDelayMs = options.baseDelayMs ?? 250;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const locked = await lockSession(supabase, userId, sellerId);
    if (locked) return true;

    if (attempt < retries) {
      const delay = baseDelayMs * (attempt + 1);
      console.log(`[BotIntercept] ⏳ Lock retry in ${delay}ms (attempt ${attempt + 1}/${retries})`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  return false;
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
    case 'back_to_previous':
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

    case 'back_to_start':
      return {
        success: true,
        newState: 'START',
        clearStack: true,
      };

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

// =====================================================================
// SISTEMA DE FLUXOS - ÚNICA FONTE DE VERDADE
// As tabelas bot_engine_dynamic_menus e bot_engine_menus foram descontinuadas
// O chatbot agora usa EXCLUSIVAMENTE bot_engine_flows + nodes + edges
// =====================================================================

/**
 * Busca mensagem de um nó de fluxo baseado no estado atual
 * ÚNICA FONTE: bot_engine_flows + nodes
 */
async function getFlowMessage(
  supabase: SupabaseClient,
  sellerId: string,
  state: string,
  _useTextMenus: boolean = false
): Promise<string | null> {
  // Buscar fluxos ativos do vendedor
  const { data: flows } = await supabase
    .from('bot_engine_flows')
    .select('id, trigger_keywords')
    .eq('seller_id', sellerId)
    .eq('is_active', true)
    .order('priority', { ascending: false });

  if (!flows || flows.length === 0) return null;

  // Encontrar nó que corresponde ao estado
  for (const flow of flows) {
    const { data: nodes } = await supabase
      .from('bot_engine_nodes')
      .select('id, config, node_type, name')
      .eq('flow_id', flow.id)
      .eq('seller_id', sellerId);

    if (nodes) {
      // Procurar nó com name ou state_name correspondente
      const matchingNode = nodes.find((n) => {
        const config = n.config as Record<string, unknown> || {};
        return (
          n.name === state ||
          config.state_name === state || 
          config.menu_key === state ||
          (state === 'START' && n.node_type === 'start')
        );
      });

      if (matchingNode) {
        const config = matchingNode.config as Record<string, unknown> || {};
        return (config.message_text as string) || null;
      }
    }
  }

  return null;
}

/**
 * Processa entrada do usuário e determina próximo estado/resposta
 * ÚNICA FONTE: bot_engine_flows + nodes + edges + menu_options aninhados
 */
async function processUserInput(
  supabase: SupabaseClient,
  sellerId: string,
  currentState: string,
  parsed: ParsedInput,
  _currentStack: string[],
  _useTextMenus: boolean = false
): Promise<{ newState: string; response: string | null; pushToStack: boolean }> {
  
  // =========================================================
  // BUSCAR FLUXO ATIVO DO VENDEDOR
  // =========================================================
  const { data: flows } = await supabase
    .from('bot_engine_flows')
    .select('id')
    .eq('seller_id', sellerId)
    .eq('is_active', true)
    .order('priority', { ascending: false })
    .limit(1);

  if (!flows || flows.length === 0) {
    console.log(`[BotIntercept] No active flows for seller ${sellerId}`);
    return { newState: currentState, response: null, pushToStack: false };
  }

  const flowId = flows[0].id;

  // =========================================================
  // BUSCAR NÓ ATUAL BASEADO NO ESTADO
  // =========================================================
  const { data: allNodes } = await supabase
    .from('bot_engine_nodes')
    .select('id, config, node_type, name')
    .eq('flow_id', flowId)
    .eq('seller_id', sellerId);

  if (!allNodes || allNodes.length === 0) {
    return { newState: currentState, response: null, pushToStack: false };
  }

  // Encontrar nó atual por nome ou state_name
  // O state pode incluir caminho do submenu: "MenuPrincipal:submenu_1:submenu_2"
  const stateParts = currentState.split(':');
  const baseNodeName = stateParts[0];
  const submenuPath = stateParts.slice(1);
  
  const currentNode = allNodes.find((n) => {
    const config = n.config as Record<string, unknown> || {};
    return (
      n.name === baseNodeName ||
      config.state_name === baseNodeName ||
      (baseNodeName === 'START' && n.node_type === 'start')
    );
  });

  if (!currentNode) {
    // Se estado é START, buscar entry point
    if (baseNodeName === 'START') {
      const entryNode = allNodes.find(n => n.node_type === 'start') || 
                        allNodes.find(n => {
                          const cfg = n.config as Record<string, unknown> || {};
                          return cfg.is_entry_point === true;
                        });

      if (entryNode) {
        const config = entryNode.config as Record<string, unknown> || {};
        return { 
          newState: entryNode.name || 'START', 
          response: (config.message_text as string) || null,
          pushToStack: false
        };
      }
    }
    console.log(`[BotIntercept] No node found for state: ${currentState}`);
    return { newState: currentState, response: null, pushToStack: false };
  }

  // =========================================================
  // PROCESSAR MENU INTERATIVO (menu_options aninhados)
  // =========================================================
  const nodeConfig = currentNode.config as Record<string, unknown> || {};
  const menuOptions = nodeConfig.menu_options as Array<{
    id: string;
    title: string;
    emoji?: string;
    description?: string;
    action_type: string;
    submenu_options?: unknown[];
    message_text?: string;
    command?: string;
    target_flow_id?: string;
    target_node_id?: string;
  }>;
  
  if (menuOptions && menuOptions.length > 0) {
    console.log(`[BotIntercept] Processing menu options for node ${currentNode.name}, submenu path: [${submenuPath.join(', ')}]`);
    
    // Navegar até o submenu correto baseado no path
    let currentMenuOptions = menuOptions;
    for (const submenuId of submenuPath) {
      const parentOption = currentMenuOptions.find(opt => opt.id === submenuId);
      if (parentOption?.submenu_options) {
        currentMenuOptions = parentOption.submenu_options as typeof menuOptions;
      } else {
        console.log(`[BotIntercept] Submenu not found for path: ${submenuId}`);
        break;
      }
    }
    
    // Verificar se o input corresponde a uma opção
    // Aceita número (1, 2, 3...) ou ID da opção
    let selectedOption: typeof currentMenuOptions[0] | undefined;
    
    if (parsed.isNumber && parsed.number !== null) {
      // Seleção por número (1-indexed)
      const index = parsed.number - 1;
      if (index >= 0 && index < currentMenuOptions.length) {
        selectedOption = currentMenuOptions[index];
      }
    } else {
      // Seleção por texto (busca por título)
      selectedOption = currentMenuOptions.find(opt => 
        opt.title.toLowerCase() === parsed.normalized ||
        opt.id === parsed.normalized
      );
    }
    
    if (selectedOption) {
      console.log(`[BotIntercept] Selected menu option: ${selectedOption.title} (${selectedOption.action_type})`);
      
      switch (selectedOption.action_type) {
        case 'submenu': {
          // Navegar para o submenu - atualizar state com novo path
          const newPath = [...submenuPath, selectedOption.id];
          const newState = `${baseNodeName}:${newPath.join(':')}`;
          
          // Construir mensagem do submenu
          const subOptions = selectedOption.submenu_options as typeof menuOptions || [];
          const menuText = buildMenuText(
            selectedOption.title,
            nodeConfig.menu_header as string,
            subOptions,
            true // Mostrar botão voltar
          );
          
          console.log(`[BotIntercept] Navigating to submenu: ${newState}`);
          return { newState, response: menuText, pushToStack: true };
        }
        
        case 'message': {
          // Enviar mensagem e voltar ao menu atual
          const response = selectedOption.message_text || 'Mensagem recebida!';
          return { newState: currentState, response, pushToStack: false };
        }
        
        case 'command': {
          // Executar comando via delegação
          const command = selectedOption.command || '';
          console.log(`[BotIntercept] Delegating command: ${command}`);
          
          // Comandos que precisam de processamento especial
          if (command.toLowerCase().includes('teste') || command === '/teste') {
            // Gerar teste - delegar para o handler de teste
            return { 
              newState: 'GERANDO_TESTE', 
              response: '⏳ Gerando seu teste... aguarde um momento!',
              pushToStack: true
            };
          }
          
          // Para outros comandos, retornar mensagem indicando execução
          return { 
            newState: currentState, 
            response: `⚡ Comando "${command}" executado!`,
            pushToStack: false
          };
        }
        
        case 'transfer_human': {
          return { 
            newState: 'AGUARDANDO_HUMANO', 
            response: '👤 Você será atendido por um de nossos atendentes em breve. Aguarde!',
            pushToStack: true
          };
        }
        
        case 'end_session': {
          return { 
            newState: 'ENCERRADO', 
            response: '👋 Atendimento encerrado. Até logo!',
            pushToStack: false
          };
        }
        
        case 'goto_node': {
          const targetNode = allNodes.find(n => n.id === selectedOption.target_node_id);
          if (targetNode) {
            const targetConfig = targetNode.config as Record<string, unknown> || {};
            return { 
              newState: targetNode.name || 'START', 
              response: (targetConfig.message_text as string) || null,
              pushToStack: true
            };
          }
          break;
        }
        
        case 'goto_flow': {
          // TODO: Implementar navegação para outro fluxo
          console.log(`[BotIntercept] goto_flow not yet implemented: ${selectedOption.target_flow_id}`);
          return { newState: currentState, response: null, pushToStack: false };
        }
      }
    }
    
    // Verificar se é comando de voltar (0) dentro de submenu
    if (parsed.normalized === '0' && submenuPath.length > 0) {
      // Voltar um nível no submenu
      const newPath = submenuPath.slice(0, -1);
      const newState = newPath.length > 0 ? `${baseNodeName}:${newPath.join(':')}` : baseNodeName;
      
      // Reconstruir menu do nível anterior
      let parentMenuOptions = menuOptions;
      for (const submenuId of newPath) {
        const parentOption = parentMenuOptions.find(opt => opt.id === submenuId);
        if (parentOption?.submenu_options) {
          parentMenuOptions = parentOption.submenu_options as typeof menuOptions;
        }
      }
      
      const menuTitle = newPath.length > 0 
        ? parentMenuOptions[0]?.title || 'Menu'
        : (nodeConfig.menu_title as string) || 'Menu Principal';
      
      const menuText = buildMenuText(
        menuTitle,
        nodeConfig.menu_header as string,
        parentMenuOptions,
        newPath.length > 0
      );
      
      console.log(`[BotIntercept] Going back to: ${newState}`);
      return { newState, response: menuText, pushToStack: false };
    }
    
    // Opção não encontrada - verificar se deve ficar silencioso
    if (nodeConfig.silent_on_invalid) {
      console.log(`[BotIntercept] Invalid option, staying silent (silent_on_invalid=true)`);
      return { newState: currentState, response: null, pushToStack: false };
    }
    
    // Retornar mensagem de erro padrão
    console.log(`[BotIntercept] Invalid menu option: ${parsed.normalized}`);
    return { 
      newState: currentState, 
      response: 'Opção inválida. Por favor, escolha uma das opções do menu.',
      pushToStack: false
    };
  }

  // =========================================================
  // BUSCAR EDGES (TRANSIÇÕES) DO NÓ ATUAL
  // =========================================================
  const { data: edges } = await supabase
    .from('bot_engine_edges')
    .select('id, target_node_id, condition_type, condition_value, priority')
    .eq('source_node_id', currentNode.id)
    .eq('flow_id', flowId)
    .order('priority', { ascending: false });

  if (!edges || edges.length === 0) {
    // Sem transições definidas - aguardar silenciosamente (comportamento solicitado)
    console.log(`[BotIntercept] No edges from node ${currentNode.name || currentNode.id} - waiting silently`);
    return { newState: currentState, response: null, pushToStack: false };
  }

  // =========================================================
  // AVALIAR CONDIÇÕES PARA ENCONTRAR PRÓXIMO NÓ
  // =========================================================
  for (const edge of edges) {
    let matches = false;

    switch (edge.condition_type) {
      case 'always':
        matches = true;
        break;
      case 'equals':
        matches = parsed.normalized === (edge.condition_value || '').toLowerCase().trim();
        break;
      case 'number':
        matches = parsed.isNumber && parsed.number === parseInt(edge.condition_value || '0');
        break;
      case 'contains':
        matches = parsed.normalized.includes((edge.condition_value || '').toLowerCase());
        break;
      case 'regex':
        try {
          matches = new RegExp(edge.condition_value || '', 'i').test(parsed.original);
        } catch {
          matches = false;
        }
        break;
      default:
        // Tipo de condição não reconhecido - não faz match
        matches = false;
    }

    if (matches) {
      // Encontrar nó de destino nos nós já carregados
      const targetNode = allNodes.find(n => n.id === edge.target_node_id);

      if (targetNode) {
        const config = targetNode.config as Record<string, unknown> || {};
        const newState = targetNode.name || (config.state_name as string) || currentState;
        const response = (config.message_text as string) || null;

        console.log(`[BotIntercept] Transition: ${currentState} -> ${newState} (condition: ${edge.condition_type}=${edge.condition_value})`);

        return { 
          newState, 
          response,
          pushToStack: true
        };
      }
    }
  }

  // =========================================================
  // NENHUMA CONDIÇÃO ATENDIDA - SILÊNCIO (SEM FALLBACK)
  // =========================================================
  console.log(`[BotIntercept] No matching edge for input "${parsed.normalized}" - staying silent`);
  return { newState: currentState, response: null, pushToStack: false };
}

/**
 * Constrói texto de menu a partir das opções
 */
function buildMenuText(
  title: string,
  header: string | undefined,
  options: Array<{ title: string; emoji?: string; description?: string }>,
  showBackButton: boolean = false
): string {
  let text = header ? `${header}\n\n` : '';
  text += `*${title}*\n\n`;
  
  options.forEach((opt, index) => {
    const emoji = opt.emoji || `${index + 1}️⃣`;
    text += `${emoji} ${opt.title}`;
    if (opt.description) {
      text += ` - ${opt.description}`;
    }
    text += '\n';
  });
  
  if (showBackButton) {
    text += '\n0️⃣ Voltar';
  }
  
  return text.trim();
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
// SESSÃO OPERACIONAL (bot_engine_sessions)
// =====================================================================

/**
 * Garante que exista uma sessão ativa em bot_engine_sessions para o contato.
 * Isso alimenta a tela de “Sessões” do BotEngine (separada do bot_sessions que guarda navegação/stack).
 */
async function touchBotEngineSession(
  supabase: SupabaseClient,
  sellerId: string,
  contactPhone: string,
  meta: Record<string, unknown> = {}
): Promise<void> {
  const nowIso = new Date().toISOString();
  const phone = String(contactPhone || '').replace(/\D/g, '');
  if (!phone) return;

  // Buscar sessão ativa mais recente
  const { data: existing, error: selErr } = await supabase
    .from('bot_engine_sessions')
    .select('id, variables')
    .eq('seller_id', sellerId)
    .eq('contact_phone', phone)
    .eq('status', 'active')
    .order('last_activity_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (selErr) {
    console.error('[BotIntercept] touchBotEngineSession select error:', selErr);
  }

  if (existing?.id) {
    const mergedVars = {
      ...(existing.variables as Record<string, unknown> | null || {}),
      ...meta,
      phone,
    };
    const { error: updErr } = await supabase
      .from('bot_engine_sessions')
      .update({
        status: 'active',
        ended_at: null,
        last_activity_at: nowIso,
        variables: mergedVars,
      })
      .eq('id', existing.id);

    if (updErr) {
      console.error('[BotIntercept] touchBotEngineSession update error:', updErr);
    }
    return;
  }

  const { error: insErr } = await supabase
    .from('bot_engine_sessions')
    .insert({
      seller_id: sellerId,
      contact_phone: phone,
      status: 'active',
      started_at: nowIso,
      last_activity_at: nowIso,
      variables: { phone, ...meta },
    });

  if (insErr) {
    console.error('[BotIntercept] touchBotEngineSession insert error:', insErr);
  }
}

// =====================================================================
// FUNÇÕES AUXILIARES - INTEGRAÇÃO COM SISTEMA EXISTENTE
// =====================================================================

interface TestGenerationResult {
  success: boolean;
  username?: string;
  password?: string;
  dns?: string;
  expiration?: string;
  error?: string;
}

/**
 * Gera teste IPTV via API existente (create-test-client)
 * Reutiliza a infraestrutura já implementada
 */
async function generateTestForBot(
  supabase: SupabaseClient,
  sellerId: string,
  senderPhone: string,
  testType: 'tv' | 'celular',
  deviceInfo: string
): Promise<TestGenerationResult> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  
  console.log(`[BotIntercept] generateTestForBot - seller: ${sellerId}, phone: ${senderPhone}, type: ${testType}, device: ${deviceInfo}`);
  
  try {
    // Buscar configuração de teste ativa
    const { data: testConfig } = await supabase
      .from('test_integration_config')
      .select('*')
      .eq('seller_id', sellerId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (!testConfig) {
      console.log(`[BotIntercept] No test config found for seller ${sellerId}`);
      return { success: false, error: 'Configuração de teste não encontrada' };
    }
    
    if (!testConfig.post_endpoint) {
      console.log(`[BotIntercept] No POST endpoint configured`);
      return { success: false, error: 'Endpoint de teste não configurado' };
    }
    
    // Gerar credenciais
    const testCounter = (testConfig.test_counter || 0) + 1;
    const username = `${testConfig.client_name_prefix || 'teste'}${testCounter}`;
    const password = Math.random().toString(36).slice(-8);
    
    // Construir headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (testConfig.api_key) {
      headers['apikey'] = testConfig.api_key;
      headers['Authorization'] = `Bearer ${testConfig.api_key}`;
    }
    
    // Fazer requisição para API externa
    console.log(`[BotIntercept] Calling test API: ${testConfig.post_endpoint}`);
    
    const apiResponse = await fetch(testConfig.post_endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        action: 'usercreate',
        username,
        password,
        trial: 1,
        // Informações adicionais
        device_type: testType,
        device_info: deviceInfo,
        phone: senderPhone,
      }),
    });
    
    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      console.error(`[BotIntercept] API error: ${apiResponse.status} - ${errorText}`);
      return { success: false, error: `Erro na API: ${apiResponse.status}` };
    }
    
    const result = await apiResponse.json();
    console.log(`[BotIntercept] API response:`, JSON.stringify(result));
    
    // Atualizar contador
    await supabase
      .from('test_integration_config')
      .update({ test_counter: testCounter })
      .eq('id', testConfig.id);
    
    // Chamar create-test-client para registrar o cliente
    try {
      await fetch(`${supabaseUrl}/functions/v1/create-test-client`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          seller_id: sellerId,
          sender_phone: senderPhone,
          api_response: result,
          api_id: testConfig.api_id,
          server_id_override: testConfig.server_id,
        }),
      });
    } catch (e) {
      console.error(`[BotIntercept] Error calling create-test-client:`, e);
      // Não falha a operação, apenas log
    }
    
    // Calcular expiração (padrão: 2 horas)
    const durationHours = testConfig.default_duration_hours || 2;
    const expirationDate = new Date();
    expirationDate.setHours(expirationDate.getHours() + durationHours);
    const expirationStr = durationHours <= 24 
      ? `${durationHours} hora${durationHours > 1 ? 's' : ''}`
      : `${Math.floor(durationHours / 24)} dia${durationHours >= 48 ? 's' : ''}`;
    
    return {
      success: true,
      username: result.username || username,
      password: result.password || password,
      dns: result.dns || result.server_url || testConfig.dns,
      expiration: expirationStr,
    };
    
  } catch (error) {
    console.error(`[BotIntercept] generateTestForBot error:`, error);
    return { success: false, error: error instanceof Error ? error.message : 'Erro desconhecido' };
  }
}

/**
 * Busca planos cadastrados do revendedor
 */
async function fetchSellerPlans(
  supabase: SupabaseClient,
  sellerId: string
): Promise<string> {
  try {
    const { data: plans } = await supabase
      .from('plans')
      .select('name, price, duration_days, description')
      .eq('seller_id', sellerId)
      .eq('is_active', true)
      .order('price', { ascending: true })
      .limit(10);
    
    if (!plans || plans.length === 0) {
      return `_Nenhum plano cadastrado no momento._

Entre em contato para mais informações!`;
    }
    
    const plansList = plans.map((plan, index) => {
      const emoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '📦';
      const duration = plan.duration_days 
        ? `${plan.duration_days} dia${plan.duration_days > 1 ? 's' : ''}`
        : 'Mensal';
      const price = plan.price 
        ? `R$ ${Number(plan.price).toFixed(2).replace('.', ',')}`
        : 'Consulte';
      
      return `${emoji} *${plan.name}*
   💰 ${price} • ⏱️ ${duration}${plan.description ? `\n   _${plan.description}_` : ''}`;
    }).join('\n\n');
    
    return plansList;
    
  } catch (error) {
    console.error(`[BotIntercept] fetchSellerPlans error:`, error);
    return `_Erro ao carregar planos. Tente novamente._`;
  }
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

    // ═══════════════════════════════════════════════════════════════════
    // VALIDAÇÃO CRÍTICA - ISOLAMENTO MULTI-REVENDEDOR
    // ═══════════════════════════════════════════════════════════════════
    // seller_id é OBRIGATÓRIO para garantir que cada revendedor tenha
    // seu próprio fluxo de chatbot isolado. Sem seller_id, a mensagem
    // DEVE ser rejeitada para evitar cruzamento de dados.
    // ═══════════════════════════════════════════════════════════════════
    
    if (!seller_id) {
      console.error(`[BotIntercept] ❌ REJEITADO: seller_id OBRIGATÓRIO para isolamento multi-tenant`);
      return new Response(
        JSON.stringify({ 
          intercepted: false, 
          error: 'seller_id is required for multi-tenant isolation',
          should_continue: false 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (!sender_phone || !message_text) {
      console.error(`[BotIntercept] ❌ REJEITADO: sender_phone e message_text são obrigatórios`);
      return new Response(
        JSON.stringify({ intercepted: false, error: 'Missing required parameters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Normalizar identificadores
    let phone = sender_phone.replace(/\D/g, '');
    // Adicionar DDI 55 se necessário (números brasileiros)
    if (!phone.startsWith('55') && phone.length >= 10 && phone.length <= 11) {
      phone = '55' + phone;
      console.log(`[BotIntercept] Added DDI to phone: ${phone}`);
    }
    userId = phone;
    sellerId = seller_id;
    
    // Validar formato UUID do seller_id
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(sellerId)) {
      console.error(`[BotIntercept] ❌ REJEITADO: seller_id inválido: ${sellerId}`);
      return new Response(
        JSON.stringify({ intercepted: false, error: 'Invalid seller_id format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`[BotIntercept] ═══════════════════════════════════════════════════`);
    console.log(`[BotIntercept] 🔒 MULTI-TENANT MESSAGE - ISOLATED PROCESSING`);
    console.log(`[BotIntercept] Seller ID (partition key): ${sellerId}`);
    console.log(`[BotIntercept] Instance Name: ${input.instance_name || 'not provided'}`);
    console.log(`[BotIntercept] Sender Phone: ${phone}`);
    console.log(`[BotIntercept] Message: "${message_text?.substring(0, 100)}"`);
    console.log(`[BotIntercept] ═══════════════════════════════════════════════════`);

    // =========================================================
    // PASSO 0: VERIFICAÇÃO DE DUPLICAÇÃO EM MEMÓRIA (mais rápido)
    // =========================================================
    if (isMessageDuplicate(userId, message_text, sellerId)) {
      console.log(`[BotIntercept] 🚫 Mensagem duplicada ignorada (dedup em memória)`);
      return new Response(
        JSON.stringify({ intercepted: true, should_continue: false, deduplicated: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Timer para medir tempo de processamento (debug)
    const processingStartTime = DEBUG_MODE ? Date.now() : 0;
    
    // Verificar se BotEngine está habilitado e buscar config completa
    const { data: config, error: configError } = await supabase
      .from('bot_engine_config')
      .select('*')
      .eq('seller_id', sellerId)
      .eq('is_enabled', true)
      .maybeSingle();

    if (configError) {
      console.error(`[BotIntercept] Error fetching config:`, configError);
    }

    if (!config) {
      console.log(`[BotIntercept] BotEngine disabled or no config for seller ${sellerId}`);
      return new Response(
        JSON.stringify({ intercepted: false, should_continue: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[BotIntercept] Config found - is_enabled: ${config.is_enabled}, welcome_message: "${config.welcome_message?.substring(0, 30)}..."`);

    // Extrair configurações COM FALLBACKS ROBUSTOS
    // Usar mensagem da máquina de estados como padrão
    const defaultWelcomeMessage = STATE_MESSAGES.START.message;
    
    const welcomeMessage = config.welcome_message || defaultWelcomeMessage;
    const fallbackMessage = config.fallback_message || 'Desculpe, não entendi. Digite *menu* para ver as opções.';
    const welcomeCooldownHours = config.welcome_cooldown_hours ?? 24;
    const _suppressFallbackFirstContact = config.suppress_fallback_first_contact ?? true;
    const useTextMenus = config.use_text_menus ?? false;
    
    console.log(`[BotIntercept] Menu mode: ${useTextMenus ? 'TEXT' : 'INTERACTIVE_LIST'}`);

    // =========================================================
    // PASSO 1: lockSession (ATÔMICO - previne processamento paralelo)
    // =========================================================
    const locked = await lockSessionWithRetry(supabase, userId, sellerId);
    if (!locked) {
      // Em vez de ficar “mudo” (sem resposta), fazemos best-effort para destravar e seguir.
      // Dedup em memória já reduz o risco de duplicidade; aqui priorizamos responder ao usuário.
      console.warn(`[BotIntercept] ⚠️ Could not acquire lock for ${userId}. Forcing best-effort unlock and continuing.`);
      try {
        await supabase
          .from('bot_sessions')
          .update({ locked: false, updated_at: new Date().toISOString() })
          .eq('user_id', userId)
          .eq('seller_id', sellerId);
      } catch (unlockErr) {
        console.error(`[BotIntercept] ⚠️ best-effort unlock failed:`, unlockErr);
      }
    }

    try {
      // Buscar sessão atual (pode ter sido criada por lockSession)
      const { data: session } = await supabase
        .from('bot_sessions')
        .select('*')
        .eq('user_id', userId)
        .eq('seller_id', sellerId)
        .maybeSingle();

      // Contador de interações para determinar se é REALMENTE o primeiro contato
      // interactionCount = 0 significa que lockSession acabou de criar a sessão
      const interactionCount = (session?.context as Record<string, unknown>)?.interaction_count as number || 0;
      
      // isFirstContact: sessão não existe OU foi criada agora (interaction_count = 0)
      const isFirstContact = !session || interactionCount === 0;
      
      const lastInteraction = session?.last_interaction ? new Date(session.last_interaction) : null;
      const cooldownMs = welcomeCooldownHours * 60 * 60 * 1000;
      const now = new Date();
      
      // Verificar se deve enviar boas-vindas:
      // 1. É primeiro contato (sessão nova OU interaction_count = 0)
      // 2. OU cooldown expirou (última interação foi há mais de X horas)
      // 3. Para whitelist: se cooldown expirou (mesmo que seja menor), PODE reenviar boas-vindas
      //    MAS se já houve interação recente (< 5 min), não reenvia para permitir teste do fluxo
      const cooldownExpired = lastInteraction && (now.getTime() - lastInteraction.getTime() > cooldownMs);
      const isTestWhitelisted = isPhoneWhitelisted(userId);
      
      // Para whitelist, usar cooldown reduzido de 5 minutos para permitir reset rápido durante testes
      // Mas NÃO enviar boas-vindas se houve interação recente (permitir navegar no fluxo)
      const whitelistCooldownMs = 5 * 60 * 1000; // 5 minutos
      const whitelistCooldownExpired = isTestWhitelisted && lastInteraction && 
        (now.getTime() - lastInteraction.getTime() > whitelistCooldownMs);
      
      const shouldSendWelcome = isFirstContact || cooldownExpired || whitelistCooldownExpired;
      
      console.log(`[BotIntercept] ===============================================`);
      console.log(`[BotIntercept] WELCOME CHECK`);
      console.log(`[BotIntercept] - First contact: ${isFirstContact}`);
      console.log(`[BotIntercept] - Interaction count: ${interactionCount}`);
      console.log(`[BotIntercept] - Last interaction: ${lastInteraction?.toISOString() || 'never'}`);
      console.log(`[BotIntercept] - Cooldown expired: ${cooldownExpired}`);
      console.log(`[BotIntercept] - Test whitelisted: ${isTestWhitelisted}`);
      console.log(`[BotIntercept] - Whitelist cooldown (5min) expired: ${whitelistCooldownExpired}`);
      console.log(`[BotIntercept] - SHOULD SEND WELCOME: ${shouldSendWelcome}`);
      console.log(`[BotIntercept] - Welcome message: "${welcomeMessage?.substring(0, 50)}..."`);
      console.log(`[BotIntercept] ===============================================`);

      const currentState = session?.state || 'START';
      const previousState = session?.previous_state || 'START';
      let currentStack: string[] = (session?.stack as string[]) || [];

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
      // PASSO 3: Verificar comandos globais PRIMEIRO
      // =========================================================
      const globalCmd = matchGlobalCommand(parsed);
      
      let newState = currentState;
      let responseMessage: string | null = null;

      if (globalCmd) {
        console.log(`[BotIntercept] Global command matched: ${globalCmd.action}`);
        
        // =========================================================
        // PASSO 4a: executeAction para comando global
        // =========================================================
        const actionResult = executeAction(globalCmd.action, currentStack, previousState);

        if (actionResult.success && actionResult.newState) {
          newState = actionResult.newState;
          
          // Atualizar stack
          if (actionResult.clearStack) {
            currentStack = [];
          } else if (actionResult.popStack && currentStack.length > 0) {
            currentStack.pop();
          }

          // Buscar mensagem do estado destino no fluxo
          responseMessage = await getFlowMessage(supabase, sellerId, newState);
        }
      } else {
        // =========================================================
        // PASSO 4b: SISTEMA DE FLUXOS (ÚNICA FONTE)
        // Menus V2 foram removidos - usar apenas bot_engine_flows
        // =========================================================
        
        console.log(`[BotIntercept] Processing via FLOW SYSTEM (flows only)`);
        
        if (shouldSendWelcome) {
          console.log(`[BotIntercept] ✅ SENDING WELCOME MESSAGE WITH MENU`);
          
          // Buscar perfil do revendedor para variáveis
          const sellerProfile = await fetchSellerProfile(supabase, sellerId);
          const customVars = (config.custom_variables as Record<string, string>) || {};
          
          // Montar variáveis para interpolação
          const messageVars: Record<string, string | undefined> = {
            // Variáveis do contato (usa push_name se disponível, senão telefone)
            nome: input.contact_name || `Cliente ${userId.slice(-4)}`,
            primeiro_nome: input.contact_name ? input.contact_name.split(' ')[0] : `Cliente`,
            telefone: userId,
            phone: userId,
            // Variáveis do revendedor
            empresa: customVars.empresa || sellerProfile?.company_name || sellerProfile?.full_name || 'Sua Revenda',
            company: customVars.empresa || sellerProfile?.company_name || sellerProfile?.full_name || 'Sua Revenda',
            pix: sellerProfile?.pix_key || '',
            // Variáveis customizadas do config
            ...customVars,
          };
          
          console.log(`[BotIntercept] Interpolation vars:`, JSON.stringify(messageVars));
          
          // =========================================================
          // BUSCAR MENU DO FLUXO PARA ANEXAR À BOAS-VINDAS
          // Isso garante que a mensagem de boas-vindas já inclua o menu
          // em uma única mensagem, sem separação
          // =========================================================
          let menuText = '';
          let entryNodeName = 'START';
          
          // Buscar fluxo ativo
          const { data: activeFlows } = await supabase
            .from('bot_engine_flows')
            .select('id')
            .eq('seller_id', sellerId)
            .eq('is_active', true)
            .order('priority', { ascending: false })
            .limit(1);
          
          if (activeFlows && activeFlows.length > 0) {
            const flowId = activeFlows[0].id;
            
            // Buscar nó de entrada (start ou menu principal)
            const { data: entryNodes } = await supabase
              .from('bot_engine_nodes')
              .select('id, name, node_type, config')
              .eq('flow_id', flowId)
              .eq('seller_id', sellerId);
            
            if (entryNodes && entryNodes.length > 0) {
              // Encontrar entry point: start node ou is_entry_point=true
              const startNode = entryNodes.find(n => n.node_type === 'start') ||
                                entryNodes.find(n => (n.config as Record<string, unknown>)?.is_entry_point === true) ||
                                entryNodes[0];
              
              if (startNode) {
                entryNodeName = startNode.name || 'START';
                const nodeConfig = startNode.config as Record<string, unknown> || {};
                const menuOptions = nodeConfig.menu_options as Array<{
                  id: string;
                  title: string;
                  emoji?: string;
                  description?: string;
                }>;
                
                if (menuOptions && menuOptions.length > 0) {
                  // Construir texto do menu para anexar à boas-vindas
                  const menuHeader = nodeConfig.menu_header as string;
                  const menuTitle = nodeConfig.menu_title as string || '';
                  
                  // Montar menu formatado
                  menuText = '\n\n';
                  if (menuTitle) {
                    menuText += `*${menuTitle}*\n\n`;
                  }
                  
                  menuOptions.forEach((opt, index) => {
                    const emoji = opt.emoji || `${index + 1}️⃣`;
                    menuText += `${emoji} ${opt.title}`;
                    if (opt.description) {
                      menuText += ` - ${opt.description}`;
                    }
                    menuText += '\n';
                  });
                  
                  console.log(`[BotIntercept] Menu found with ${menuOptions.length} options, appending to welcome`);
                }
              }
            }
          }
          
          // Interpolar variáveis na mensagem de boas-vindas
          let finalMessage = interpolateVariables(welcomeMessage, messageVars);
          
          // UNIFICAR: Anexar menu à mensagem de boas-vindas (uma única mensagem)
          if (menuText) {
            finalMessage = finalMessage.trim() + menuText;
          }
          
          responseMessage = finalMessage;
          newState = entryNodeName;
          
          console.log(`[BotIntercept] Final unified message with menu: "${responseMessage.substring(0, 100)}..."`);
          
          const { error: upsertError } = await supabase
            .from('bot_sessions')
            .upsert({
              user_id: userId,
              seller_id: sellerId,
              phone: userId,
              state: entryNodeName,
              previous_state: 'START',
              stack: [],
              context: { interaction_count: 1 },
              locked: false,
              last_interaction: now.toISOString(),
              updated_at: now.toISOString()
            }, {
              onConflict: 'user_id,seller_id',
            });
          
          if (upsertError) {
            console.error(`[BotIntercept] Error upserting session:`, upsertError);
          } else {
            console.log(`[BotIntercept] Session upserted successfully for ${userId} at state ${entryNodeName}`);
          }
        } else {
          // =========================================================
          // PROCESSAR VIA SISTEMA DE FLUXOS
          // =========================================================
          console.log(`[BotIntercept] Processing input via FLOW-BASED system, current state: ${currentState}`);
          
          // Usar processUserInput que agora usa APENAS fluxos
          const flowResult = await processUserInput(
            supabase,
            sellerId,
            currentState,
            parsed,
            currentStack,
            useTextMenus
          );
          
          if (flowResult.response) {
            responseMessage = flowResult.response;
            newState = flowResult.newState;
            
            if (flowResult.pushToStack && currentState !== 'START') {
              currentStack.push(currentState);
            }
            
            // Atualizar sessão
            await supabase
              .from('bot_sessions')
              .update({
                state: newState,
                previous_state: currentState,
                stack: currentStack,
                context: {
                  ...(session?.context as Record<string, unknown> || {}),
                  interaction_count: interactionCount + 1,
                },
                last_interaction: now.toISOString(),
              })
              .eq('user_id', userId)
              .eq('seller_id', sellerId);
          } else {
            // Sem resposta do fluxo - verificar máquina de estados legada
            console.log(`[BotIntercept] No flow response, trying STATE MACHINE`);
            
            const isAwaitingInput = (session?.context as Record<string, unknown>)?.awaiting_input === true;
            const inputVariableName = (session?.context as Record<string, unknown>)?.input_variable_name as string | null;
            
            const stateResult = processStateTransition(
              currentState,
              message_text,
              session?.context as Record<string, unknown> || {}
            );
            
            console.log(`[BotIntercept] State transition result:`, JSON.stringify(stateResult));
            
            debugStateTransition(
              userId,
              sellerId,
              currentState,
              stateResult.newState,
              message_text,
              stateResult.shouldGenerateTest ? 'generate_test' : 
                stateResult.transferToHuman ? 'transfer_human' : null
            );
            
            newState = stateResult.newState;
            responseMessage = stateResult.response;
            
            let updatedContext: Record<string, unknown> = {
              ...(session?.context as Record<string, unknown> || {}),
              interaction_count: interactionCount + 1,
              awaiting_input: stateResult.awaitingInput || false,
              input_variable_name: stateResult.inputVariableName || null,
            };
            
            if (isAwaitingInput && inputVariableName) {
              updatedContext[inputVariableName] = message_text;
              console.log(`[BotIntercept] Saved input: ${inputVariableName} = "${message_text}"`);
            }

            // Atualizar contexto comportamental (welcome_sent, has_engaged, anti-spam de erro, etc.)
            updatedContext = updateSessionContext(
              updatedContext as unknown as Record<string, unknown>,
              stateResult,
              message_text,
              currentState
            ) as unknown as Record<string, unknown>;
            
            if (stateResult.shouldGenerateTest) {
              console.log(`[BotIntercept] 🧪 GENERATING TEST - Type: ${stateResult.testType}, Device: ${stateResult.deviceInfo}`);
              
              try {
                const testResult = await generateTestForBot(
                  supabase,
                  sellerId,
                  userId,
                  stateResult.testType || 'tv',
                  stateResult.deviceInfo || 'Não informado'
                );
                
                if (testResult.success) {
                  newState = 'TESTE_SUCESSO';
                  responseMessage = STATE_MESSAGES.TESTE_SUCESSO.message
                    .replace('{expiration}', testResult.expiration || '2 horas');
                    
                  if (testResult.username && testResult.password) {
                    responseMessage = `✅ *Teste gerado com sucesso!*

📋 *Seus dados de acesso:*
👤 Usuário: \`${testResult.username}\`
🔐 Senha: \`${testResult.password}\`
${testResult.dns ? `🌐 DNS: \`${testResult.dns}\`\n` : ''}
⏰ Expira em: ${testResult.expiration || '2 horas'}

Precisa de algo mais?
1️⃣ Voltar ao menu
0️⃣ Encerrar`;
                  }
                } else {
                  newState = 'TESTE_ERRO';
                  responseMessage = STATE_MESSAGES.TESTE_ERRO.message;
                  console.error(`[BotIntercept] Test generation failed:`, testResult.error);
                }
              } catch (testError) {
                console.error(`[BotIntercept] Test generation exception:`, testError);
                newState = 'TESTE_ERRO';
                responseMessage = STATE_MESSAGES.TESTE_ERRO.message;
              }
            }
            
            if (stateResult.transferToHuman) {
              console.log(`[BotIntercept] 👤 TRANSFER TO HUMAN requested`);
              updatedContext.support_requested = true;
              updatedContext.support_message = updatedContext.support_message || message_text;
              newState = 'AGUARDANDO_HUMANO';
              
              const ticketId = Date.now().toString(36).toUpperCase();
              responseMessage = responseMessage?.replace('{ticket_id}', ticketId);
            }
            
            if (newState === 'PLANOS') {
              const plansList = await fetchSellerPlans(supabase, sellerId);
              responseMessage = responseMessage?.replace('{plans_list}', plansList);
            }
            
            if (newState !== currentState && currentState !== 'START' && !['ENCERRADO', 'AGUARDANDO_HUMANO'].includes(newState)) {
              currentStack.push(currentState);
            }
            
            await supabase
              .from('bot_sessions')
              .update({
                state: newState,
                previous_state: currentState,
                context: updatedContext,
                last_interaction: now.toISOString(),
                stack: currentStack,
              })
              .eq('user_id', userId)
              .eq('seller_id', sellerId);
          }
        }
      }

      // =========================================================
      // PASSO 5: Atualizar state e stack se houve mudança
      // =========================================================
      if (newState !== currentState || responseMessage) {
        await supabase
          .from('bot_sessions')
          .update({
            state: newState,
            stack: currentStack,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId)
          .eq('seller_id', sellerId);

        console.log(`[BotIntercept] State updated: ${currentState} -> ${newState}, stack: [${currentStack.join(', ')}]`);
      }

      // =========================================================
      // PASSO 6: Log da resposta + DEBUG LOG COMPLETO
      // =========================================================
      const processingEndTime = DEBUG_MODE ? Date.now() : 0;
      
      if (responseMessage) {
        // Registrar/atualizar sessão operacional do BotEngine (para listagem/monitoramento)
        await touchBotEngineSession(supabase, sellerId, userId, {
          state: newState,
          source: 'bot-engine-intercept',
        });

        console.log(`[BotIntercept] ===============================================`);
        console.log(`[BotIntercept] FINAL RESPONSE TO SEND`);
        console.log(`[BotIntercept] Phone: ${userId}`);
        console.log(`[BotIntercept] Message: "${responseMessage}"`);
        console.log(`[BotIntercept] New state: ${newState}`);
        console.log(`[BotIntercept] ===============================================`);
        await logMessage(supabase, userId, sellerId, responseMessage, false);
        
        // DEBUG LOG: Resumo completo da execução
        debugLog({
          phone_masked: maskPhone(userId),
          seller_id_short: shortSellerId(sellerId),
          current_state: currentState,
          input_normalized: message_text,
          next_state: newState,
          action_executed: globalCmd?.action || (newState !== currentState ? 'state_transition' : null),
          response_preview: responseMessage,
          processing_time_ms: processingEndTime - processingStartTime,
        });
      }

      // =========================================================
      // PASSO 7: unlockSession
      // =========================================================
      await unlockSession(supabase, userId, sellerId);

      // Se temos resposta, interceptamos a mensagem
      if (responseMessage) {
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

      // Se não há fluxo configurado, deixar passar para handler existente
      console.log(`[BotIntercept] No flow response, passing to existing handlers`);
      return new Response(
        JSON.stringify({ 
          intercepted: false, 
          should_continue: true,
          new_state: newState,
        }),
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
