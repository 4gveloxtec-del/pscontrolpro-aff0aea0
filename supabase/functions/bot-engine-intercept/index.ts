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
  STATE_MESSAGES,
  type StateTransitionResult 
} from "../_shared/bot-state-machine.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

interface MenuOption {
  label: string;
  target_menu?: string;
  target_state?: string;
  action?: string;
  keywords?: string[];
}

interface DynamicMenu {
  menu_key: string;
  title?: string;
  header_message?: string;
  footer_message?: string;
  options: MenuOption[];
  parent_menu_key?: string;
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
  // NOTA: "*" removido - ele serve como roteador para o bot, não como comando direto
  { keywords: ['voltar', 'anterior', 'retornar'], action: 'back_to_previous', priority: 90 },
  { keywords: ['inicio', 'início', 'começo', 'reiniciar', 'start', '00', '##'], action: 'back_to_start', priority: 90 },
  { keywords: ['menu', 'cardapio', 'opcoes', 'opções'], action: 'menu', priority: 80 },
  { keywords: ['sair', 'exit', 'encerrar', 'tchau', 'bye', 'fim'], action: 'sair', priority: 70 },
  { keywords: ['humano', 'atendente', 'pessoa', 'suporte', 'falar com alguem'], action: 'humano', priority: 60 },
];

// =====================================================================
// SISTEMA ANTI-DUPLICAÇÃO - LOCK ATÔMICO + HASH DE MENSAGEM
// =====================================================================

/**
 * Timeout máximo para considerar um lock como "stale" (abandonado)
 * Se o lock existir há mais tempo que isso, considera como abandonado
 */
const LOCK_TIMEOUT_MS = 30000; // 30 segundos

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
      .or(`locked.eq.false,updated_at.lt.${lockExpiry.toISOString()}`)
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
// MENUS DINÂMICOS V2 - TABELA bot_engine_dynamic_menus
// =====================================================================

interface DynamicMenuItemV2 {
  id: string;
  menu_key: string;
  title: string;
  description: string | null;
  emoji: string | null;
  section_title: string | null;
  menu_type: 'submenu' | 'flow' | 'command' | 'link' | 'message';
  target_menu_key: string | null;
  target_flow_id: string | null;
  target_command: string | null;
  target_url: string | null;
  target_message: string | null;
  display_order: number;
  is_active: boolean;
  is_root: boolean;
  show_back_button: boolean;
  back_button_text: string | null;
  header_message: string | null;
  footer_message: string | null;
  parent_menu_id: string | null;
}

/**
 * Busca menu raiz (is_root = true) do revendedor
 */
async function getRootMenuV2(
  supabase: SupabaseClient,
  sellerId: string
): Promise<DynamicMenuItemV2 | null> {
  const { data, error } = await supabase
    .from('bot_engine_dynamic_menus')
    .select('*')
    .eq('seller_id', sellerId)
    .eq('is_root', true)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !data) {
    console.log(`[BotIntercept] No root menu found for seller ${sellerId}`);
    return null;
  }

  return data as DynamicMenuItemV2;
}

/**
 * Busca menu por menu_key
 */
async function getMenuByKeyV2(
  supabase: SupabaseClient,
  sellerId: string,
  menuKey: string
): Promise<DynamicMenuItemV2 | null> {
  const { data, error } = await supabase
    .from('bot_engine_dynamic_menus')
    .select('*')
    .eq('seller_id', sellerId)
    .eq('menu_key', menuKey)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as DynamicMenuItemV2;
}

/**
 * Busca todos os itens de um menu (filhos diretos)
 */
async function getMenuItemsV2(
  supabase: SupabaseClient,
  sellerId: string,
  parentMenuId: string | null
): Promise<DynamicMenuItemV2[]> {
  let query = supabase
    .from('bot_engine_dynamic_menus')
    .select('*')
    .eq('seller_id', sellerId)
    .eq('is_active', true)
    .order('display_order', { ascending: true })
    .order('title', { ascending: true });

  if (parentMenuId) {
    query = query.eq('parent_menu_id', parentMenuId);
  } else {
    query = query.is('parent_menu_id', null);
  }

  const { data, error } = await query;

  if (error || !data) {
    return [];
  }

  return data as DynamicMenuItemV2[];
}

/**
 * Busca menu pai de um menu
 */
async function getParentMenuV2(
  supabase: SupabaseClient,
  sellerId: string,
  childMenuId: string
): Promise<DynamicMenuItemV2 | null> {
  const { data: child } = await supabase
    .from('bot_engine_dynamic_menus')
    .select('parent_menu_id')
    .eq('id', childMenuId)
    .maybeSingle();

  if (!child?.parent_menu_id) {
    return null;
  }

  const { data: parent } = await supabase
    .from('bot_engine_dynamic_menus')
    .select('*')
    .eq('id', child.parent_menu_id)
    .maybeSingle();

  return parent as DynamicMenuItemV2 | null;
}

/**
 * Renderiza menu dinâmico como texto formatado para WhatsApp
 */
function renderMenuAsTextV2(
  items: DynamicMenuItemV2[],
  headerMessage?: string,
  footerMessage?: string,
  showBackButton: boolean = true,
  backButtonText: string = '⬅️ Voltar'
): string {
  const lines: string[] = [];

  // Header
  if (headerMessage) {
    lines.push(headerMessage);
    lines.push('');
  }

  // Agrupar por seção
  const sections = new Map<string, DynamicMenuItemV2[]>();
  for (const item of items) {
    const section = item.section_title || 'Opções';
    if (!sections.has(section)) {
      sections.set(section, []);
    }
    sections.get(section)!.push(item);
  }

  // Renderizar seções
  let itemIndex = 1;
  for (const [sectionTitle, sectionItems] of sections) {
    if (sections.size > 1) {
      lines.push(`📌 *${sectionTitle}*`);
    }
    
    for (const item of sectionItems) {
      const emoji = item.emoji ? `${item.emoji} ` : '';
      lines.push(`*${itemIndex}* - ${emoji}${item.title}`);
      if (item.description) {
        lines.push(`   └ ${item.description}`);
      }
      itemIndex++;
    }
    lines.push('');
  }

  // Navegação
  lines.push('────────────');
  if (showBackButton) {
    lines.push(`*0* - ${backButtonText}`);
  }
  lines.push('*#* - Menu Principal');

  // Footer
  if (footerMessage) {
    lines.push('');
    lines.push(footerMessage);
  }

  return lines.join('\n');
}

/**
 * Processa seleção do usuário em um menu V2
 * Suporta: número, menu_key, texto parcial
 */
async function processMenuSelectionV2(
  supabase: SupabaseClient,
  sellerId: string,
  parentMenuId: string | null,
  userInput: string
): Promise<{
  found: boolean;
  menuType?: 'submenu' | 'flow' | 'command' | 'link' | 'message';
  targetMenuKey?: string;
  targetFlowId?: string;
  targetCommand?: string;
  targetUrl?: string;
  targetMessage?: string;
  parentMenuId?: string;
}> {
  const items = await getMenuItemsV2(supabase, sellerId, parentMenuId);
  
  if (items.length === 0) {
    return { found: false };
  }

  const normalized = userInput.toLowerCase().trim();

  // 1. Verificar por número
  const inputNumber = parseInt(normalized, 10);
  if (!isNaN(inputNumber) && inputNumber >= 1 && inputNumber <= items.length) {
    const item = items[inputNumber - 1];
    return {
      found: true,
      menuType: item.menu_type,
      targetMenuKey: item.target_menu_key || undefined,
      targetFlowId: item.target_flow_id || undefined,
      targetCommand: item.target_command || undefined,
      targetUrl: item.target_url || undefined,
      targetMessage: item.target_message || undefined,
      parentMenuId: item.parent_menu_id || undefined,
    };
  }

  // 2. Verificar por menu_key exato
  const byKey = items.find(item => item.menu_key.toLowerCase() === normalized);
  if (byKey) {
    return {
      found: true,
      menuType: byKey.menu_type,
      targetMenuKey: byKey.target_menu_key || undefined,
      targetFlowId: byKey.target_flow_id || undefined,
      targetCommand: byKey.target_command || undefined,
      targetUrl: byKey.target_url || undefined,
      targetMessage: byKey.target_message || undefined,
      parentMenuId: byKey.parent_menu_id || undefined,
    };
  }

  // 3. Verificar por título parcial
  const byTitle = items.find(item => 
    item.title.toLowerCase().includes(normalized) ||
    normalized.includes(item.title.toLowerCase())
  );
  if (byTitle) {
    return {
      found: true,
      menuType: byTitle.menu_type,
      targetMenuKey: byTitle.target_menu_key || undefined,
      targetFlowId: byTitle.target_flow_id || undefined,
      targetCommand: byTitle.target_command || undefined,
      targetUrl: byTitle.target_url || undefined,
      targetMessage: byTitle.target_message || undefined,
      parentMenuId: byTitle.parent_menu_id || undefined,
    };
  }

  return { found: false };
}

// =====================================================================
// COMPATIBILIDADE - MENUS ANTIGOS (bot_engine_menus)
// =====================================================================

/**
 * Busca menu dinâmico pelo menu_key (legado)
 */
async function getDynamicMenu(
  supabase: SupabaseClient,
  sellerId: string,
  menuKey: string
): Promise<DynamicMenu | null> {
  const { data: menu } = await supabase
    .from('bot_engine_menus')
    .select('*')
    .eq('seller_id', sellerId)
    .eq('menu_key', menuKey)
    .eq('is_active', true)
    .maybeSingle();

  if (!menu) return null;

  return {
    menu_key: menu.menu_key,
    title: menu.title,
    header_message: menu.header_message,
    footer_message: menu.footer_message,
    options: (menu.options as MenuOption[]) || [],
    parent_menu_key: menu.parent_menu_key,
  };
}

/**
 * Renderiza menu dinâmico como texto formatado (legado)
 */
function renderDynamicMenu(menu: DynamicMenu): string {
  const lines: string[] = [];

  // Header
  if (menu.header_message) {
    lines.push(menu.header_message);
    lines.push('');
  } else if (menu.title) {
    lines.push(`📋 *${menu.title}*`);
    lines.push('');
  }

  // Opções numeradas
  menu.options.forEach((opt, index) => {
    lines.push(`*${index + 1}* - ${opt.label}`);
  });

  // Navegação automática
  lines.push('');
  if (menu.parent_menu_key) {
    lines.push('*0* - Voltar');
  }
  lines.push('*#* - Menu Principal');

  // Footer
  if (menu.footer_message) {
    lines.push('');
    lines.push(menu.footer_message);
  }

  return lines.join('\n');
}

/**
 * Processa seleção do usuário em menu dinâmico (legado)
 */
async function processMenuSelection(
  supabase: SupabaseClient,
  sellerId: string,
  menu: DynamicMenu,
  parsed: ParsedInput
): Promise<{ targetMenu: string | null; targetState: string | null; action: string | null }> {
  // Se é número, usar como índice
  if (parsed.isNumber && parsed.number !== null) {
    const optIndex = parsed.number - 1;
    if (optIndex >= 0 && optIndex < menu.options.length) {
      const option = menu.options[optIndex];
      return {
        targetMenu: option.target_menu || null,
        targetState: option.target_state || null,
        action: option.action || null,
      };
    }
  }

  // Buscar por keyword/label
  for (const option of menu.options) {
    const labelLower = option.label.toLowerCase();
    
    // Match exato ou parcial no label
    if (parsed.normalized === labelLower || labelLower.includes(parsed.normalized)) {
      return {
        targetMenu: option.target_menu || null,
        targetState: option.target_state || null,
        action: option.action || null,
      };
    }

    // Match por keywords da opção
    if (option.keywords) {
      for (const kw of option.keywords) {
        if (parsed.normalized.includes(kw.toLowerCase())) {
          return {
            targetMenu: option.target_menu || null,
            targetState: option.target_state || null,
            action: option.action || null,
          };
        }
      }
    }
  }

  return { targetMenu: null, targetState: null, action: null };
}

/**
 * Busca mensagem do fluxo OU menu dinâmico baseado no estado atual
 * PRIORIDADE: bot_engine_dynamic_menus (V2) > bot_engine_menus (legado) > bot_engine_flows
 */
async function getFlowMessage(
  supabase: SupabaseClient,
  sellerId: string,
  state: string
): Promise<string | null> {
  // =========================================================
  // PRIORIDADE 1: Tentar menu dinâmico V2 (bot_engine_dynamic_menus)
  // =========================================================
  const menuV2 = await getMenuByKeyV2(supabase, sellerId, state);
  if (menuV2) {
    console.log(`[BotIntercept] Found V2 menu: ${state}`);
    const menuItems = await getMenuItemsV2(supabase, sellerId, menuV2.id);
    return renderMenuAsTextV2(
      menuItems,
      menuV2.header_message || undefined,
      menuV2.footer_message || undefined,
      menuV2.show_back_button,
      menuV2.back_button_text || '⬅️ Voltar'
    );
  }

  // =========================================================
  // PRIORIDADE 2: Tentar menu legado (bot_engine_menus)
  // =========================================================
  const dynamicMenu = await getDynamicMenu(supabase, sellerId, state);
  if (dynamicMenu) {
    console.log(`[BotIntercept] Found legacy menu: ${state}`);
    return renderDynamicMenu(dynamicMenu);
  }

  // =========================================================
  // PRIORIDADE 3: Buscar fluxo tradicional (bot_engine_flows)
  // =========================================================
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
      .select('id, config, node_type')
      .eq('flow_id', flow.id)
      .eq('seller_id', sellerId);

    if (nodes) {
      // Procurar nó com name ou state_name correspondente
      const matchingNode = nodes.find((n) => {
        const config = n.config as Record<string, unknown> || {};
        return (
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
 * PRIORIDADE: Menus V2 (bot_engine_dynamic_menus) > Menus legado > Fluxos tradicionais
 */
async function processUserInput(
  supabase: SupabaseClient,
  sellerId: string,
  currentState: string,
  parsed: ParsedInput,
  currentStack: string[]
): Promise<{ newState: string; response: string | null; pushToStack: boolean }> {
  
  // =========================================================
  // PRIORIDADE 0: Verificar menu dinâmico V2 (bot_engine_dynamic_menus)
  // =========================================================
  const currentMenuV2 = await getMenuByKeyV2(supabase, sellerId, currentState);
  
  if (currentMenuV2) {
    console.log(`[BotIntercept] Processing V2 dynamic menu: ${currentState}`);
    
    const menuItemsV2 = await getMenuItemsV2(supabase, sellerId, currentMenuV2.id);
    const selection = await processMenuSelectionV2(supabase, sellerId, currentMenuV2.id, parsed.original);
    
    if (selection.found) {
      // Determinar ação baseada no tipo
      switch (selection.menuType) {
        case 'submenu':
          if (selection.targetMenuKey) {
            const targetMenuV2 = await getMenuByKeyV2(supabase, sellerId, selection.targetMenuKey);
            if (targetMenuV2) {
              const targetItems = await getMenuItemsV2(supabase, sellerId, targetMenuV2.id);
              return {
                newState: selection.targetMenuKey,
                response: renderMenuAsTextV2(
                  targetItems,
                  targetMenuV2.header_message || undefined,
                  targetMenuV2.footer_message || undefined,
                  targetMenuV2.show_back_button,
                  targetMenuV2.back_button_text || '⬅️ Voltar'
                ),
                pushToStack: true,
              };
            }
          }
          break;
          
        case 'flow':
          if (selection.targetFlowId) {
            // Buscar mensagem do fluxo
            const flowResponse = await getFlowMessage(supabase, sellerId, selection.targetFlowId);
            return {
              newState: selection.targetFlowId,
              response: flowResponse,
              pushToStack: true,
            };
          }
          break;
          
        case 'command':
          // Comando técnico - deixar passar para handler existente
          if (selection.targetCommand) {
            console.log(`[BotIntercept] Menu action: execute command ${selection.targetCommand}`);
            // Não interceptar - deixar o sistema de comandos processar
            return {
              newState: currentState,
              response: null,
              pushToStack: false,
            };
          }
          break;
          
        case 'link':
          return {
            newState: currentState,
            response: `🔗 Acesse: ${selection.targetUrl}`,
            pushToStack: false,
          };
          
        case 'message':
          return {
            newState: currentState,
            response: selection.targetMessage || 'Mensagem não configurada.',
            pushToStack: false,
          };
      }
    }
    
    // Opção não reconhecida - mostrar menu novamente
    return {
      newState: currentState,
      response: `❌ Opção inválida. Digite o *número* da opção desejada.\n\n${renderMenuAsTextV2(
        menuItemsV2,
        currentMenuV2.header_message || undefined,
        currentMenuV2.footer_message || undefined,
        currentMenuV2.show_back_button,
        currentMenuV2.back_button_text || '⬅️ Voltar'
      )}`,
      pushToStack: false,
    };
  }

  // =========================================================
  // PRIORIDADE 0.5: Verificar se há menu ROOT V2 para START
  // =========================================================
  if (currentState === 'START') {
    const rootMenuV2 = await getRootMenuV2(supabase, sellerId);
    if (rootMenuV2) {
      const rootItems = await getMenuItemsV2(supabase, sellerId, rootMenuV2.id);
      return {
        newState: rootMenuV2.menu_key,
        response: renderMenuAsTextV2(
          rootItems,
          rootMenuV2.header_message || undefined,
          rootMenuV2.footer_message || undefined,
          rootMenuV2.show_back_button,
          rootMenuV2.back_button_text || '⬅️ Voltar'
        ),
        pushToStack: false,
      };
    }
  }

  // =========================================================
  // PRIORIDADE 1: Verificar menu dinâmico LEGADO no estado atual
  // =========================================================
  const currentMenu = await getDynamicMenu(supabase, sellerId, currentState);
  
  if (currentMenu) {
    console.log(`[BotIntercept] Processing legacy dynamic menu: ${currentState}`);
    
    const selection = await processMenuSelection(supabase, sellerId, currentMenu, parsed);
    
    if (selection.targetMenu) {
      // Navegar para submenu
      const targetMenu = await getDynamicMenu(supabase, sellerId, selection.targetMenu);
      if (targetMenu) {
        return {
          newState: selection.targetMenu,
          response: renderDynamicMenu(targetMenu),
          pushToStack: true,
        };
      }
    }
    
    if (selection.targetState) {
      // Navegar para estado específico (pode ser nó de fluxo ou outro menu)
      const response = await getFlowMessage(supabase, sellerId, selection.targetState);
      return {
        newState: selection.targetState,
        response,
        pushToStack: true,
      };
    }
    
    if (selection.action) {
      // Executar ação especial
      switch (selection.action) {
        case 'human':
        case 'humano':
          return {
            newState: 'AGUARDANDO_HUMANO',
            response: '👤 Aguarde, um atendente irá te atender em breve!',
            pushToStack: false,
          };
        case 'end':
        case 'sair':
          return {
            newState: 'ENCERRADO',
            response: '👋 Obrigado pelo contato! Até mais!',
            pushToStack: false,
          };
      }
    }
    
    // Opção não reconhecida - mostrar menu novamente com dica
    return {
      newState: currentState,
      response: `❌ Opção inválida. Digite o *número* da opção desejada.\n\n${renderDynamicMenu(currentMenu)}`,
      pushToStack: false,
    };
  }

  // =========================================================
  // PRIORIDADE 2: Verificar se START tem menu dinâmico LEGADO
  // =========================================================
  if (currentState === 'START') {
    const startMenu = await getDynamicMenu(supabase, sellerId, 'MENU_PRINCIPAL');
    if (startMenu) {
      return {
        newState: 'MENU_PRINCIPAL',
        response: renderDynamicMenu(startMenu),
        pushToStack: false,
      };
    }
  }

  // =========================================================
  // FALLBACK: Fluxo tradicional via bot_engine_flows
  // =========================================================
  const { data: flows } = await supabase
    .from('bot_engine_flows')
    .select('id')
    .eq('seller_id', sellerId)
    .eq('is_active', true)
    .order('priority', { ascending: false })
    .limit(1);

  if (!flows || flows.length === 0) {
    return { newState: currentState, response: null, pushToStack: false };
  }

  const flowId = flows[0].id;

  // Buscar nó atual baseado no estado
  const { data: currentNode } = await supabase
    .from('bot_engine_nodes')
    .select('id, config, node_type')
    .eq('flow_id', flowId)
    .eq('seller_id', sellerId)
    .filter('config->>state_name', 'eq', currentState)
    .maybeSingle();

  if (!currentNode) {
    if (currentState === 'START') {
      const { data: entryNode } = await supabase
        .from('bot_engine_nodes')
        .select('id, config')
        .eq('flow_id', flowId)
        .eq('is_entry_point', true)
        .maybeSingle();

      if (entryNode) {
        const config = entryNode.config as Record<string, unknown> || {};
        return { 
          newState: 'START', 
          response: (config.message_text as string) || null,
          pushToStack: false
        };
      }
    }
    return { newState: currentState, response: null, pushToStack: false };
  }

  // Buscar edges (transições) do nó atual
  const { data: edges } = await supabase
    .from('bot_engine_edges')
    .select('id, target_node_id, condition_type, condition_value, priority')
    .eq('source_node_id', currentNode.id)
    .eq('flow_id', flowId)
    .order('priority', { ascending: false });

  if (!edges || edges.length === 0) {
    return { newState: currentState, response: null, pushToStack: false };
  }

  // Avaliar condições para encontrar próximo nó
  for (const edge of edges) {
    let matches = false;

    switch (edge.condition_type) {
      case 'always':
        matches = true;
        break;
      case 'equals':
        matches = parsed.normalized === (edge.condition_value || '').toLowerCase();
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
    }

    if (matches) {
      const { data: targetNode } = await supabase
        .from('bot_engine_nodes')
        .select('id, config, node_type')
        .eq('id', edge.target_node_id)
        .maybeSingle();

      if (targetNode) {
        const config = targetNode.config as Record<string, unknown> || {};
        const newState = (config.state_name as string) || currentState;
        const response = (config.message_text as string) || null;

        return { 
          newState, 
          response,
          pushToStack: true
        };
      }
    }
  }

  return { newState: currentState, response: null, pushToStack: false };
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

    // =========================================================
    // PASSO 1: lockSession (ATÔMICO - previne processamento paralelo)
    // =========================================================
    const locked = await lockSession(supabase, userId, sellerId);
    if (!locked) {
      // Sessão já está sendo processada por outra instância
      console.log(`[BotIntercept] 🚫 Sessão já em processamento, ignorando para evitar resposta dupla`);
      return new Response(
        JSON.stringify({ intercepted: true, should_continue: false, already_processing: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
      const cooldownExpired = lastInteraction && (now.getTime() - lastInteraction.getTime() > cooldownMs);
      const shouldSendWelcome = isFirstContact || cooldownExpired;
      
      console.log(`[BotIntercept] ===============================================`);
      console.log(`[BotIntercept] WELCOME CHECK`);
      console.log(`[BotIntercept] - First contact: ${isFirstContact}`);
      console.log(`[BotIntercept] - Interaction count: ${interactionCount}`);
      console.log(`[BotIntercept] - Last interaction: ${lastInteraction?.toISOString() || 'never'}`);
      console.log(`[BotIntercept] - Cooldown expired: ${cooldownExpired}`);
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
        // PASSO 4b: PRIORIDADE MÁXIMA - MENUS DINÂMICOS V2
        // =========================================================
        // Verifica se existem menus dinâmicos configurados
        // Se sim, usa o sistema de menus V2 ao invés da máquina de estados
        // =========================================================
        
        const rootMenuV2 = await getRootMenuV2(supabase, sellerId);
        const hasMenusV2 = !!rootMenuV2;
        
        console.log(`[BotIntercept] ═══════════════════════════════════════════════════`);
        console.log(`[BotIntercept] MENU V2 CHECK`);
        console.log(`[BotIntercept] - Has root menu V2: ${hasMenusV2}`);
        if (rootMenuV2) {
          console.log(`[BotIntercept] - Root menu key: ${rootMenuV2.menu_key}`);
          console.log(`[BotIntercept] - Root menu title: ${rootMenuV2.title}`);
        }
        console.log(`[BotIntercept] ═══════════════════════════════════════════════════`);
        
        if (hasMenusV2) {
          // =========================================================
          // SISTEMA DE MENUS DINÂMICOS V2 ATIVO
          // =========================================================
          
          // Determinar em qual menu estamos (do contexto da sessão)
          const currentMenuKey = (session?.context as Record<string, unknown>)?.current_menu_key as string || rootMenuV2!.menu_key;
          const currentMenuV2 = await getMenuByKeyV2(supabase, sellerId, currentMenuKey);
          
          console.log(`[BotIntercept] V2 Menu Navigation - Current: ${currentMenuKey}`);
          
          // Se é primeira mensagem ou cooldown expirou, mostrar menu raiz
          if (shouldSendWelcome) {
            console.log(`[BotIntercept] ✅ SENDING DYNAMIC MENU V2 (first contact/cooldown)`);
            
            // Buscar itens do menu raiz (filhos diretos com parent_menu_id = rootMenuV2.id)
            const rootItems = await getMenuItemsV2(supabase, sellerId, rootMenuV2!.id);
            
            console.log(`[BotIntercept] ═══════════════════════════════════════════════════`);
            console.log(`[BotIntercept] ROOT MENU V2 ITEMS FETCH`);
            console.log(`[BotIntercept] - Root menu ID: ${rootMenuV2!.id}`);
            console.log(`[BotIntercept] - Root menu key: ${rootMenuV2!.menu_key}`);
            console.log(`[BotIntercept] - Items found: ${rootItems.length}`);
            if (rootItems.length > 0) {
              console.log(`[BotIntercept] - First 5 items:`, rootItems.slice(0, 5).map(i => `${i.menu_key}: ${i.title}`).join(', '));
            } else {
              console.log(`[BotIntercept] ⚠️ NO ITEMS FOUND - menu will be empty!`);
            }
            console.log(`[BotIntercept] ═══════════════════════════════════════════════════`);
            
            // Renderizar menu
            responseMessage = renderMenuAsTextV2(
              rootItems,
              rootMenuV2!.header_message || `Olá! 👋 Seja bem-vindo(a)!\n\nEscolha uma opção:`,
              rootMenuV2!.footer_message || undefined,
              false, // Não mostrar voltar no menu raiz
              rootMenuV2!.back_button_text || '⬅️ Voltar'
            );
            
            console.log(`[BotIntercept] Generated response (first 200 chars): "${responseMessage.substring(0, 200)}"`);
            
            newState = 'MENU_V2';
            
            // Atualizar sessão com contexto do menu V2
            const { error: upsertError } = await supabase
              .from('bot_sessions')
              .upsert({
                user_id: userId,
                seller_id: sellerId,
                phone: userId,
                state: 'MENU_V2',
                previous_state: 'START',
                stack: [],
                context: { 
                  interaction_count: 1,
                  current_menu_key: rootMenuV2!.menu_key,
                  current_menu_id: rootMenuV2!.id,
                  menu_v2_active: true,
                },
                locked: false,
                last_interaction: now.toISOString(),
                updated_at: now.toISOString()
              }, {
                onConflict: 'user_id,seller_id',
              });
            
            if (upsertError) {
              console.error(`[BotIntercept] Error upserting session:`, upsertError);
            } else {
              console.log(`[BotIntercept] Session upserted with menu V2 context`);
            }
            
          } else {
            // Processar navegação no menu V2
            console.log(`[BotIntercept] Processing V2 menu navigation - Input: "${message_text}"`);
            
            const currentMenuId = (session?.context as Record<string, unknown>)?.current_menu_id as string || rootMenuV2!.id;
            
            // Processar seleção do usuário
            const selection = await processMenuSelectionV2(supabase, sellerId, currentMenuId, message_text);
            
            console.log(`[BotIntercept] Selection result:`, JSON.stringify(selection));
            
            if (selection.found) {
              switch (selection.menuType) {
                case 'submenu':
                  // Navegar para submenu
                  if (selection.targetMenuKey) {
                    const targetMenu = await getMenuByKeyV2(supabase, sellerId, selection.targetMenuKey);
                    if (targetMenu) {
                      const menuItems = await getMenuItemsV2(supabase, sellerId, targetMenu.id);
                      
                      responseMessage = renderMenuAsTextV2(
                        menuItems,
                        targetMenu.header_message || `📌 *${targetMenu.title}*`,
                        targetMenu.footer_message || undefined,
                        targetMenu.show_back_button,
                        targetMenu.back_button_text || '⬅️ Voltar'
                      );
                      
                      newState = 'MENU_V2';
                      currentStack.push(currentMenuKey);
                      
                      // Atualizar contexto com novo menu
                      await supabase
                        .from('bot_sessions')
                        .update({
                          state: 'MENU_V2',
                          previous_state: currentState,
                          stack: currentStack,
                          context: {
                            ...(session?.context as Record<string, unknown> || {}),
                            interaction_count: interactionCount + 1,
                            current_menu_key: targetMenu.menu_key,
                            current_menu_id: targetMenu.id,
                            menu_v2_active: true,
                          },
                          last_interaction: now.toISOString(),
                        })
                        .eq('user_id', userId)
                        .eq('seller_id', sellerId);
                    }
                  }
                  break;
                  
                case 'message':
                  // Enviar mensagem simples
                  responseMessage = selection.targetMessage || 'Mensagem não configurada.';
                  break;
                  
                case 'link':
                  // Enviar link
                  responseMessage = selection.targetUrl 
                    ? `🔗 Acesse: ${selection.targetUrl}`
                    : 'Link não configurado.';
                  break;
                  
                case 'command':
                  // Executar comando - delegar para handler existente
                  if (selection.targetCommand) {
                    console.log(`[BotIntercept] Delegating to command: ${selection.targetCommand}`);
                    // Marcar para continuar processamento com o comando
                    await unlockSession(supabase, userId, sellerId);
                    return new Response(
                      JSON.stringify({ 
                        intercepted: false, 
                        should_continue: true,
                        delegate_command: selection.targetCommand,
                      }),
                      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    );
                  }
                  break;
                  
                case 'flow':
                  // Iniciar fluxo do BotEngine
                  if (selection.targetFlowId) {
                    console.log(`[BotIntercept] Starting flow: ${selection.targetFlowId}`);
                    // Buscar entry point do fluxo
                    const { data: entryNode } = await supabase
                      .from('bot_engine_nodes')
                      .select('id, config, node_type')
                      .eq('flow_id', selection.targetFlowId)
                      .eq('seller_id', sellerId)
                      .eq('is_entry_point', true)
                      .maybeSingle();
                    
                    if (entryNode) {
                      const nodeConfig = entryNode.config as Record<string, unknown> || {};
                      responseMessage = (nodeConfig.message_text as string) || 'Fluxo iniciado.';
                      newState = (nodeConfig.state_name as string) || 'FLOW_' + selection.targetFlowId.substring(0, 8);
                    }
                  }
                  break;
              }
            } else {
              // Opção não encontrada - mostrar menu atual novamente
              console.log(`[BotIntercept] Option not found, reshowing current menu`);
              
              if (currentMenuV2) {
                const menuItems = await getMenuItemsV2(supabase, sellerId, currentMenuV2.id);
                
                responseMessage = `❌ Opção inválida. Escolha uma das opções:\n\n` + renderMenuAsTextV2(
                  menuItems,
                  currentMenuV2.header_message || undefined,
                  currentMenuV2.footer_message || undefined,
                  currentMenuV2.show_back_button,
                  currentMenuV2.back_button_text || '⬅️ Voltar'
                );
              } else {
                // Fallback para menu raiz
                const rootItems = await getMenuItemsV2(supabase, sellerId, rootMenuV2!.id);
                responseMessage = renderMenuAsTextV2(
                  rootItems,
                  rootMenuV2!.header_message || `Escolha uma opção:`,
                  rootMenuV2!.footer_message || undefined,
                  false,
                  '⬅️ Voltar'
                );
              }
            }
            
            // Atualizar contagem de interações
            await supabase
              .from('bot_sessions')
              .update({
                context: {
                  ...(session?.context as Record<string, unknown> || {}),
                  interaction_count: interactionCount + 1,
                },
                last_interaction: now.toISOString(),
              })
              .eq('user_id', userId)
              .eq('seller_id', sellerId);
          }
          
        } else {
          // =========================================================
          // FALLBACK: MÁQUINA DE ESTADOS LEGADA (sem menus V2)
          // =========================================================
          
          if (shouldSendWelcome) {
            console.log(`[BotIntercept] ✅ SENDING WELCOME MESSAGE (legacy)`);
            console.log(`[BotIntercept] Message: "${welcomeMessage}"`);
            responseMessage = welcomeMessage;
            newState = 'START';
            
            const { error: upsertError } = await supabase
              .from('bot_sessions')
              .upsert({
                user_id: userId,
                seller_id: sellerId,
                phone: userId,
                state: 'START',
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
              console.log(`[BotIntercept] Session upserted successfully for ${userId}`);
            }
          } else {
            // Processar via máquina de estados
            console.log(`[BotIntercept] Processing via STATE MACHINE, current state: ${currentState}`);
            
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
            
            const updatedContext: Record<string, unknown> = {
              ...(session?.context as Record<string, unknown> || {}),
              interaction_count: interactionCount + 1,
              awaiting_input: stateResult.awaitingInput || false,
              input_variable_name: stateResult.inputVariableName || null,
            };
            
            if (isAwaitingInput && inputVariableName) {
              updatedContext[inputVariableName] = message_text;
              console.log(`[BotIntercept] Saved input: ${inputVariableName} = "${message_text}"`);
            }
            
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
