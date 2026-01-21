/**
 * CHATBOT V3 - List Message + Navegação Passo a Passo
 * 
 * PRINCÍPIOS:
 * 1. Menus enviados como LIST MESSAGE (WhatsApp interativo)
 * 2. Navegação passo a passo com pilha (stack)
 * 3. "Voltar" retorna UMA etapa por vez
 * 4. Anti-repetição: não reenvia mesma mensagem
 * 5. Atendimento humano bloqueia respostas automáticas
 * 
 * VARIÁVEIS DE CONTROLE:
 * - current_menu_key: passo atual
 * - previous_menu_key: passo anterior
 * - last_sent_menu_key: último passo enviado (anti-repetição)
 * - navigation_stack: pilha completa de navegação
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ========== TYPES ==========
interface ChatbotConfig {
  is_enabled: boolean;
  fallback_message: string;
  welcome_message: string;
  response_delay_min: number;
  response_delay_max: number;
  typing_enabled: boolean;
  ignore_groups: boolean;
  use_list_message: boolean;
  list_button_text: string;
}

interface Menu {
  id: string;
  menu_key: string;
  list_id: string;
  title: string;
  message_text: string;
  image_url: string | null;
  parent_menu_key: string | null;
  sort_order?: number;
}

interface MenuOption {
  id: string;
  menu_id: string;
  option_number: number;
  option_text: string;
  list_id: string;
  keywords: string[];
  target_menu_key: string | null;
  action_type: string;
  action_response: string | null;
  sort_order?: number;
}

interface GlobalTrigger {
  id: string;
  trigger_name: string;
  keywords: string[];
  action_type: string;
  target_menu_key: string | null;
  response_text: string | null;
  priority: number;
  sort_order?: number;
}

interface Contact {
  id: string;
  phone: string;
  name: string | null;
  current_menu_key: string;
  previous_menu_key: string | null;
  last_sent_menu_key: string | null;
  navigation_stack: string[];
  awaiting_human: boolean;
  interaction_count: number;
}

interface Variable {
  variable_key: string;
  variable_value: string;
}

interface GlobalApiConfig {
  api_url: string;
  api_token: string;
}

// ========== UTILITY FUNCTIONS ==========

function normalizeApiUrl(url: string): string {
  return url.replace(/\/manager\/?$/i, "").replace(/\/+$/, "");
}

/**
 * Normalização robusta de telefone para Evolution API
 * Gera múltiplos formatos para retry automático
 */
function formatPhone(phone: string): string {
  let formatted = (phone || "").replace(/\D/g, "").split("@")[0];
  
  // Remove zeros iniciais errados
  if (formatted.startsWith("550")) {
    formatted = "55" + formatted.substring(3);
  }
  
  // Brasil: adiciona 55 se não tiver
  if (!formatted.startsWith("55") && (formatted.length === 10 || formatted.length === 11)) {
    formatted = `55${formatted}`;
  }
  
  // Fix: números brasileiros com 9º dígito faltando (celular)
  // Se tem 12 dígitos (55 + DDD + 8 dígitos), adiciona o 9
  if (formatted.startsWith("55") && formatted.length === 12) {
    const ddd = formatted.substring(2, 4);
    const number = formatted.substring(4);
    // DDDs de celular que precisam do 9
    if (!number.startsWith("9") && parseInt(ddd) >= 11) {
      formatted = `55${ddd}9${number}`;
    }
  }
  
  return formatted;
}

/**
 * Gera variações de formato para retry automático
 * Evita duplicidade usando Set
 */
function getPhoneVariations(phone: string): string[] {
  const base = formatPhone(phone);
  const variations = new Set<string>();
  
  // Formato principal
  variations.add(base);
  
  // Com sufixo JID (alguns Evolution APIs precisam)
  variations.add(`${base}@s.whatsapp.net`);
  
  // Sem código de país (para números internacionais mal formatados)
  if (base.startsWith("55") && base.length >= 12) {
    variations.add(base.substring(2));
  }
  
  // Brasil: tenta com/sem 9º dígito
  if (base.startsWith("55") && base.length === 13) {
    // Remover 9º dígito (55 + DDD + 9 + 8 dígitos -> 55 + DDD + 8 dígitos)
    const without9 = base.substring(0, 4) + base.substring(5);
    variations.add(without9);
  } else if (base.startsWith("55") && base.length === 12) {
    // Adicionar 9º dígito
    const ddd = base.substring(2, 4);
    const number = base.substring(4);
    if (!number.startsWith("9")) {
      variations.add(`55${ddd}9${number}`);
    }
  }
  
  return Array.from(variations);
}

function extractPhone(remoteJid: string): string {
  return remoteJid.split("@")[0].replace(/\D/g, "");
}

function isGroupMessage(remoteJid: string): boolean {
  return remoteJid.includes("@g.us");
}

function getRandomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1) + min) * 1000;
}

function replaceVariables(text: string, variables: Variable[]): string {
  if (!text || !variables) return text;
  let result = text;
  for (const v of variables) {
    const regex = new RegExp(`\\{${v.variable_key}\\}`, "gi");
    result = result.replace(regex, v.variable_value || "");
  }
  return result;
}

function normalizeInput(input: string): { text: string; number: number | null; listId: string | null } {
  const trimmed = input.toLowerCase().trim();
  
  // Detectar se é um ID de List Message (começa com lm_)
  if (trimmed.startsWith("lm_")) {
    return { text: trimmed, number: null, listId: trimmed };
  }
  
  // Mapeamento de emojis para números
  const emojiMap: Record<string, string> = {
    "1️⃣": "1", "2️⃣": "2", "3️⃣": "3", "4️⃣": "4", "5️⃣": "5",
    "6️⃣": "6", "7️⃣": "7", "8️⃣": "8", "9️⃣": "9", "0️⃣": "0",
  };
  
  for (const [emoji, num] of Object.entries(emojiMap)) {
    if (trimmed.includes(emoji)) {
      return { text: trimmed, number: parseInt(num), listId: null };
    }
  }
  
  const numMatch = trimmed.match(/^(\d+)/);
  if (numMatch) {
    return { text: trimmed, number: parseInt(numMatch[1]), listId: null };
  }
  
  return { text: trimmed, number: null, listId: null };
}

function matchesKeywords(text: string, keywords: string[]): boolean {
  if (!keywords || keywords.length === 0) return false;
  const normalizedText = text.toLowerCase().trim();
  return keywords.some(kw => normalizedText.includes(kw.toLowerCase()));
}

function normalizeKeyword(kw: string): string {
  return (kw || "").toLowerCase().trim();
}

function getBestKeywordMatchLength(text: string, keywords: string[]): number {
  if (!keywords || keywords.length === 0) return 0;
  const t = text.toLowerCase().trim();
  let best = 0;
  for (const kw of keywords) {
    const k = normalizeKeyword(kw);
    if (!k) continue;
    if (t.includes(k)) best = Math.max(best, k.length);
  }
  return best;
}

function pickBestTrigger(
  triggers: GlobalTrigger[],
  normalizedText: string,
  listId: string | null
): { winner: GlobalTrigger | null; matchedBy: "list" | "keyword" | null; contenders: GlobalTrigger[] } {
  const contenders = triggers.filter(t => {
    const byList = !!listId && listId === `lm_${t.trigger_name}`;
    const byKw = matchesKeywords(normalizedText, t.keywords);
    return byList || byKw;
  });

  if (contenders.length === 0) return { winner: null, matchedBy: null, contenders: [] };

  // Ordenação determinística + específica:
  // 1) match por listId vence keyword
  // 2) maior prioridade
  // 3) keyword mais longa (evita gatilho genérico ganhar)
  // 4) trigger_name para estabilidade
  const sorted = [...contenders].sort((a, b) => {
    const aByList = !!listId && listId === `lm_${a.trigger_name}`;
    const bByList = !!listId && listId === `lm_${b.trigger_name}`;
    if (aByList !== bByList) return aByList ? -1 : 1;

    const pr = (b.priority ?? 0) - (a.priority ?? 0);
    if (pr !== 0) return pr;

    const aLen = getBestKeywordMatchLength(normalizedText, a.keywords);
    const bLen = getBestKeywordMatchLength(normalizedText, b.keywords);
    if (aLen !== bLen) return bLen - aLen;

    return (a.trigger_name || "").localeCompare(b.trigger_name || "");
  });

  const winner = sorted[0];
  const matchedBy: "list" | "keyword" = (!!listId && listId === `lm_${winner.trigger_name}`) ? "list" : "keyword";

  return { winner, matchedBy, contenders: sorted };
}

function dedupeByKey<T extends { id: string }>(
  items: T[],
  keyFn: (i: T) => string,
  preferenceFn: (i: T) => number
): { deduped: T[]; duplicates: Array<{ key: string; ids: string[] }> } {
  const map = new Map<string, T>();
  const dup = new Map<string, string[]>();

  for (const item of items) {
    const key = keyFn(item);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, item);
      continue;
    }

    dup.set(key, [...(dup.get(key) || [existing.id]), item.id]);

    // menor preferenceFn vence
    if (preferenceFn(item) < preferenceFn(existing)) {
      map.set(key, item);
    }
  }

  return {
    deduped: Array.from(map.values()),
    duplicates: Array.from(dup.entries()).map(([key, ids]) => ({ key, ids })),
  };
}

function pickBestOptionByKeyword(normalizedText: string, options: MenuOption[]): MenuOption | null {
  const matches = options
    .map(o => ({
      o,
      bestLen: getBestKeywordMatchLength(normalizedText, o.keywords || []),
    }))
    .filter(x => x.bestLen > 0);

  if (matches.length === 0) return null;

  matches.sort((a, b) => {
    // keyword mais longa primeiro
    if (a.bestLen !== b.bestLen) return b.bestLen - a.bestLen;

    // menor sort_order primeiro (mais "no topo" na configuração)
    const aOrder = a.o.sort_order ?? 0;
    const bOrder = b.o.sort_order ?? 0;
    if (aOrder !== bOrder) return aOrder - bOrder;

    // por último, menor option_number
    if (a.o.option_number !== b.o.option_number) return a.o.option_number - b.o.option_number;

    return a.o.id.localeCompare(b.o.id);
  });

  return matches[0].o;
}

// ========== API FUNCTIONS ==========

async function sendTypingStatus(
  config: GlobalApiConfig,
  instanceName: string,
  phone: string,
  durationMs: number
): Promise<boolean> {
  try {
    const baseUrl = normalizeApiUrl(config.api_url);
    const formattedPhone = formatPhone(phone);
    
    await fetch(`${baseUrl}/chat/sendPresence/${instanceName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: config.api_token,
      },
      body: JSON.stringify({
        number: formattedPhone,
        presence: "composing",
        delay: durationMs,
      }),
    });
    
    await new Promise(r => setTimeout(r, durationMs));
    return true;
  } catch {
    return false;
  }
}

/**
 * Envia mensagem de texto com retry automático em múltiplos formatos
 * Elimina erros 400 tentando variações de número
 */
async function sendTextMessage(
  config: GlobalApiConfig,
  instanceName: string,
  phone: string,
  text: string
): Promise<boolean> {
  const baseUrl = normalizeApiUrl(config.api_url);
  const variations = getPhoneVariations(phone);
  
  console.log(`[ChatbotV3] Sending text, will try ${variations.length} format(s)`);
  
  for (const formattedPhone of variations) {
    try {
      const response = await fetch(`${baseUrl}/message/sendText/${instanceName}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: config.api_token,
        },
        body: JSON.stringify({ number: formattedPhone, text }),
      });
      
      if (response.ok) {
        console.log(`[ChatbotV3] Success with format: ${formattedPhone.substring(0, 6)}***`);
        return true;
      }
      
      // Se não for erro 400, não tenta outros formatos (pode ser rate limit, etc)
      if (response.status !== 400) {
        const errorText = await response.text().catch(() => "");
        console.log(`[ChatbotV3] Non-400 error (${response.status}): ${errorText.substring(0, 100)}`);
        // Continua tentando outros formatos apenas para 400
        if (response.status >= 500) {
          // Erro do servidor, tenta próximo formato
          continue;
        }
        return false;
      }
      
      // 400 = formato errado, tenta próximo
      console.log(`[ChatbotV3] Format ${formattedPhone.substring(0, 6)}*** returned 400, trying next...`);
    } catch (error) {
      console.error(`[ChatbotV3] Network error for ${formattedPhone.substring(0, 6)}***:`, error);
      // Continua tentando outros formatos
    }
  }
  
  console.log(`[ChatbotV3] All ${variations.length} formats failed`);
  return false;
}

/**
 * Envia List Message (menu interativo do WhatsApp) com retry automático
 */
async function sendListMessage(
  config: GlobalApiConfig,
  instanceName: string,
  phone: string,
  title: string,
  description: string,
  buttonText: string,
  sections: Array<{
    title: string;
    rows: Array<{
      rowId: string;
      title: string;
      description?: string;
    }>;
  }>
): Promise<boolean> {
  const baseUrl = normalizeApiUrl(config.api_url);
  const variations = getPhoneVariations(phone);
  
  console.log(`[ChatbotV3] Sending list message, will try ${variations.length} format(s)`);
  
  const payload = {
    title: title.substring(0, 60),
    description: description.substring(0, 1024),
    buttonText: buttonText.substring(0, 20),
    footerText: "",
    sections: sections.map(s => ({
      title: s.title.substring(0, 24),
      rows: s.rows.map(r => ({
        rowId: r.rowId,
        title: r.title.substring(0, 24),
        description: (r.description || "").substring(0, 72),
      })),
    })),
  };
  
  for (const formattedPhone of variations) {
    try {
      const response = await fetch(`${baseUrl}/message/sendList/${instanceName}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: config.api_token,
        },
        body: JSON.stringify({ ...payload, number: formattedPhone }),
      });
      
      if (response.ok) {
        console.log(`[ChatbotV3] List success with format: ${formattedPhone.substring(0, 6)}***`);
        return true;
      }
      
      if (response.status !== 400) {
        // Erro não relacionado a formato, faz fallback para texto
        console.log(`[ChatbotV3] List message returned ${response.status}, falling back to text`);
        return await sendTextMessage(config, instanceName, phone, description);
      }
      
      console.log(`[ChatbotV3] List format ${formattedPhone.substring(0, 6)}*** returned 400, trying next...`);
    } catch (error) {
      console.error(`[ChatbotV3] List network error:`, error);
    }
  }
  
  // Fallback final: enviar como texto simples
  console.log(`[ChatbotV3] All list formats failed, falling back to text`);
  return await sendTextMessage(config, instanceName, phone, description);
}

async function sendImageMessage(
  config: GlobalApiConfig,
  instanceName: string,
  phone: string,
  text: string,
  imageUrl: string
): Promise<boolean> {
  try {
    const baseUrl = normalizeApiUrl(config.api_url);
    const formattedPhone = formatPhone(phone);
    
    const response = await fetch(`${baseUrl}/message/sendMedia/${instanceName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: config.api_token,
      },
      body: JSON.stringify({
        number: formattedPhone,
        mediatype: "image",
        media: imageUrl,
        caption: text,
      }),
    });
    
    return response.ok;
  } catch {
    return false;
  }
}

// ========== NAVIGATION FUNCTIONS ==========

/**
 * Atualiza a pilha de navegação ao avançar para novo menu
 */
function pushNavigation(
  currentStack: string[],
  currentMenuKey: string,
  _newMenuKey: string
): { newStack: string[]; previousKey: string } {
  // Adiciona o menu atual à pilha antes de navegar
  const newStack = [...currentStack, currentMenuKey];
  return {
    newStack,
    previousKey: currentMenuKey,
  };
}

/**
 * Volta um passo na navegação
 */
function popNavigation(
  currentStack: string[]
): { newStack: string[]; targetMenuKey: string } {
  if (currentStack.length === 0) {
    return { newStack: [], targetMenuKey: "main" };
  }
  
  const newStack = [...currentStack];
  const targetMenuKey = newStack.pop() || "main";
  
  return { newStack, targetMenuKey };
}

// ========== CORE LOGIC ==========

interface ProcessResult {
  response: string;
  imageUrl?: string;
  newMenuKey: string;
  previousMenuKey: string | null;
  newStack: string[];
  useListMessage: boolean;
  listMessageData?: {
    title: string;
    buttonText: string;
    sections: Array<{
      title: string;
      rows: Array<{
        rowId: string;
        title: string;
        description?: string;
      }>;
    }>;
  };
  triggerMatched?: string;
  isFallback: boolean;
  isHuman: boolean;
  shouldSend: boolean; // Anti-repetição
}

function processMessage(
  messageText: string,
  contact: Contact | null,
  triggers: GlobalTrigger[],
  menus: Menu[],
  options: MenuOption[],
  config: ChatbotConfig,
  variables: Variable[]
): ProcessResult {
  const currentMenuKey = contact?.current_menu_key || "main";
  const currentStack = contact?.navigation_stack || [];
  const lastSentMenuKey = contact?.last_sent_menu_key || null;
  
  const { text: normalizedText, number: inputNumber, listId } = normalizeInput(messageText);
  
  // ========== VERIFICAR ATENDIMENTO HUMANO ==========
  if (contact?.awaiting_human) {
    // Apenas aceita "voltar" ou "início" durante atendimento humano
    const isBackCommand = matchesKeywords(normalizedText, ["voltar", "sair", "0", "*", "#"]) || 
                          listId === "lm_voltar";
    const isHomeCommand = matchesKeywords(normalizedText, ["inicio", "início", "menu", "00", "##"]) || 
                          listId === "lm_inicio";
    
    if (isHomeCommand) {
      // Voltar ao início
      const mainMenu = menus.find(m => m.menu_key === "main");
      if (mainMenu) {
        const menuOptions = options.filter(o => o.menu_id === mainMenu.id);
        return buildMenuResponse(
          mainMenu, 
          menuOptions, 
          config, 
          variables, 
          [], // Limpa a pilha
          null,
          lastSentMenuKey
        );
      }
    }
    
    if (isBackCommand) {
      const { newStack, targetMenuKey } = popNavigation(currentStack);
      const targetMenu = menus.find(m => m.menu_key === targetMenuKey);
      
      if (targetMenu) {
        const menuOptions = options.filter(o => o.menu_id === targetMenu.id);
        return buildMenuResponse(
          targetMenu, 
          menuOptions, 
          config, 
          variables, 
          newStack,
          currentMenuKey,
          lastSentMenuKey
        );
      }
    }
    
    // Ignorar outras mensagens em atendimento humano
    return {
      response: "",
      newMenuKey: currentMenuKey,
      previousMenuKey: contact?.previous_menu_key || null,
      newStack: currentStack,
      useListMessage: false,
      isFallback: false,
      isHuman: true,
      shouldSend: false,
    };
  }
  
  // ============================================================
  // ETAPA 3 — CONSOLIDAÇÃO DE GATILHOS E MENUS
  // Objetivo: uma entrada => UMA decisão (1 trigger OU 1 opção de menu)
  // - Prioriza triggers específicos (prioridade + keyword mais longa)
  // - Evita sobreposição de gatilhos genéricos
  // - Dedupe defensivo de menu_key / list_id (sem apagar dados)
  // ============================================================

  // Dedupe defensivo de menus por menu_key (apenas 1 menu raiz/"main" efetivo)
  const { deduped: dedupedMenus, duplicates: dupMenus } = dedupeByKey(
    menus,
    (m) => (m.menu_key || "").toLowerCase().trim(),
    (m) => (m.sort_order ?? 0)
  );
  if (dupMenus.length > 0) {
    console.log(`[ChatbotV3][WARN] Duplicate menu_key detected (active). Using lowest sort_order.`, dupMenus);
  }

  // Dedupe defensivo de options por list_id (List Message precisa ser único)
  const { deduped: dedupedOptions, duplicates: dupOptionsByListId } = dedupeByKey(
    options,
    (o) => (o.list_id || "").toLowerCase().trim(),
    (o) => (o.sort_order ?? 0)
  );
  if (dupOptionsByListId.length > 0) {
    console.log(`[ChatbotV3][WARN] Duplicate option list_id detected (active). Using lowest sort_order.`, dupOptionsByListId);
  }

  // ========== 1. GATILHOS GLOBAIS (apenas 1 vencedor) ==========
  const picked = pickBestTrigger(triggers, normalizedText, listId);
  if (picked.winner) {
    const trigger = picked.winner;
    if (picked.contenders.length > 1) {
      console.log(`[ChatbotV3][INFO] Multiple triggers matched. Winner=${trigger.trigger_name}`, {
        matchedBy: picked.matchedBy,
        contenders: picked.contenders.map(t => ({ name: t.trigger_name, priority: t.priority })),
      });
    }

    console.log(`[ChatbotV3] Trigger matched: ${trigger.trigger_name}`);

    // INÍCIO - Ir direto para menu principal (limpa pilha)
    if (trigger.trigger_name === "inicio" || trigger.action_type === "goto_home") {
      const mainMenu = dedupedMenus.find(m => m.menu_key === "main");
      if (mainMenu) {
        const menuOptions = dedupedOptions.filter(o => o.menu_id === mainMenu.id);
        return buildMenuResponse(
          mainMenu, 
          menuOptions, 
          config, 
          variables, 
          [], // Limpa a pilha completamente
          null,
          lastSentMenuKey
        );
      }
    }

    // VOLTAR - Navegação especial (volta um passo)
    if (trigger.trigger_name === "voltar" || trigger.action_type === "goto_previous") {
      const { newStack, targetMenuKey } = popNavigation(currentStack);
      const targetMenu = dedupedMenus.find(m => m.menu_key === targetMenuKey);
      
      if (targetMenu) {
        const menuOptions = dedupedOptions.filter(o => o.menu_id === targetMenu.id);
        return buildMenuResponse(
          targetMenu, 
          menuOptions, 
          config, 
          variables, 
          newStack,
          currentMenuKey,
          lastSentMenuKey
        );
      }
    }
    
    // MENU - Ir para menu específico
    if (trigger.action_type === "goto_menu" && trigger.target_menu_key) {
      const targetMenu = dedupedMenus.find(m => m.menu_key === trigger.target_menu_key);
      if (targetMenu) {
        // Se está indo para main, limpa a pilha
        let newStack = currentStack;
        let previousKey = contact?.previous_menu_key || null;
        
        if (trigger.target_menu_key === "main") {
          newStack = [];
          previousKey = null;
        } else {
          const nav = pushNavigation(currentStack, currentMenuKey, trigger.target_menu_key);
          newStack = nav.newStack;
          previousKey = nav.previousKey;
        }
        
        const menuOptions = dedupedOptions.filter(o => o.menu_id === targetMenu.id);
        return buildMenuResponse(
          targetMenu, 
          menuOptions, 
          config, 
          variables, 
          newStack,
          previousKey,
          lastSentMenuKey
        );
      }
    }
    
    // MENSAGEM - Resposta simples
    if (trigger.action_type === "message" && trigger.response_text) {
      return {
        response: replaceVariables(trigger.response_text, variables),
        newMenuKey: currentMenuKey,
        previousMenuKey: contact?.previous_menu_key || null,
        newStack: currentStack,
        useListMessage: false,
        triggerMatched: trigger.trigger_name,
        isFallback: false,
        isHuman: false,
        shouldSend: true,
      };
    }
    
    // HUMANO - Transferir para atendente
    if (trigger.action_type === "human") {
      return {
        response: "Aguarde, você será atendido por um de nossos atendentes. 👤",
        newMenuKey: currentMenuKey,
        previousMenuKey: contact?.previous_menu_key || null,
        newStack: currentStack,
        useListMessage: false,
        triggerMatched: trigger.trigger_name,
        isFallback: false,
        isHuman: true,
        shouldSend: true,
      };
    }
  }
  
  // ========== 2. ENCONTRAR MENU ATUAL ==========
  const currentMenu = dedupedMenus.find(m => m.menu_key === currentMenuKey) || dedupedMenus.find(m => m.menu_key === "main");
  if (!currentMenu) {
    return {
      response: replaceVariables(config.fallback_message, variables),
      newMenuKey: "main",
      previousMenuKey: null,
      newStack: [],
      useListMessage: false,
      isFallback: true,
      isHuman: false,
      shouldSend: true,
    };
  }
  
  const menuOptions = dedupedOptions
    .filter(o => o.menu_id === currentMenu.id)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  
  // ========== 3. MATCH POR LIST ID ==========
  if (listId) {
    const matchedOption = menuOptions.find(o => o.list_id === listId);
    if (matchedOption) {
      return handleOptionMatch(
        matchedOption, 
        dedupedMenus, 
        dedupedOptions,
        config, 
        variables, 
        currentMenuKey, 
        currentStack,
        lastSentMenuKey
      );
    }
    
    // Tentar encontrar em qualquer menu (opção global)
    const allOptions = dedupedOptions;
    const globalMatch = allOptions.find(o => o.list_id === listId);
    if (globalMatch) {
      return handleOptionMatch(
        globalMatch, 
        dedupedMenus, 
        dedupedOptions,
        config, 
        variables, 
        currentMenuKey, 
        currentStack,
        lastSentMenuKey
      );
    }
  }
  
  // ========== 4. MATCH POR NÚMERO ==========
  if (inputNumber !== null) {
    // 00 = Ir para início (menu principal)
    if (normalizedText === "00") {
      const mainMenu = dedupedMenus.find(m => m.menu_key === "main");
      if (mainMenu) {
        const targetOptions = dedupedOptions.filter(o => o.menu_id === mainMenu.id);
        return buildMenuResponse(
          mainMenu, 
          targetOptions, 
          config, 
          variables, 
          [], // Limpa pilha
          null,
          lastSentMenuKey
        );
      }
    }
    
    // 0 = Voltar um passo
    if (inputNumber === 0) {
      const { newStack, targetMenuKey } = popNavigation(currentStack);
      const targetMenu = dedupedMenus.find(m => m.menu_key === targetMenuKey);
      
      if (targetMenu) {
        const targetOptions = dedupedOptions.filter(o => o.menu_id === targetMenu.id);
        return buildMenuResponse(
          targetMenu, 
          targetOptions, 
          config, 
          variables, 
          newStack,
          currentMenuKey,
          lastSentMenuKey
        );
      }
    }
    
    const matchedOption = menuOptions.find(o => o.option_number === inputNumber);
    if (matchedOption) {
      return handleOptionMatch(
        matchedOption, 
        dedupedMenus, 
        dedupedOptions,
        config, 
        variables, 
        currentMenuKey, 
        currentStack,
        lastSentMenuKey
      );
    }
  }
  
  // ========== 5. MATCH POR KEYWORD ==========
  const bestKeywordOption = pickBestOptionByKeyword(normalizedText, menuOptions);
  if (bestKeywordOption) {
    return handleOptionMatch(
      bestKeywordOption,
      dedupedMenus,
      dedupedOptions,
      config,
      variables,
      currentMenuKey,
      currentStack,
      lastSentMenuKey
    );
  }
  
  // ========== 6. FALLBACK ==========
  console.log(`[ChatbotV3] No match found, sending fallback`);
  return {
    response: replaceVariables(config.fallback_message, variables),
    newMenuKey: currentMenuKey,
    previousMenuKey: contact?.previous_menu_key || null,
    newStack: currentStack,
    useListMessage: false,
    isFallback: true,
    isHuman: false,
    shouldSend: true,
  };
}

function buildMenuResponse(
  menu: Menu,
  menuOptions: MenuOption[],
  config: ChatbotConfig,
  variables: Variable[],
  newStack: string[],
  previousMenuKey: string | null,
  lastSentMenuKey: string | null
): ProcessResult {
  const sortedOptions = [...menuOptions].sort((a, b) => a.option_number - b.option_number);
  
  // Anti-repetição: verificar se já enviou este menu
  const shouldSend = lastSentMenuKey !== menu.menu_key;
  
  // Construir List Message data
  const rows = sortedOptions.map(opt => ({
    rowId: opt.list_id,
    title: `${opt.option_number}. ${opt.option_text}`,
    description: opt.action_type === "human" ? "Falar com atendente" : undefined,
  }));
  
  // Adicionar opção Voltar se não for menu principal
  if (menu.menu_key !== "main") {
    // Sempre adiciona "Voltar" se há pilha
    if (newStack.length > 0) {
      rows.push({
        rowId: "lm_voltar",
        title: "0. Voltar",
        description: "Retornar ao menu anterior",
      });
    }
    
    // Sempre adiciona "Início" se não estamos no main
    rows.push({
      rowId: "lm_inicio",
      title: "00. Menu Principal",
      description: "Voltar ao início",
    });
  }
  
  return {
    response: replaceVariables(menu.message_text, variables),
    imageUrl: menu.image_url || undefined,
    newMenuKey: menu.menu_key,
    previousMenuKey: previousMenuKey,
    newStack: newStack,
    useListMessage: config.use_list_message && rows.length > 0,
    listMessageData: {
      title: menu.title,
      buttonText: config.list_button_text || "📋 Ver opções",
      sections: [{
        title: "Opções",
        rows: rows,
      }],
    },
    isFallback: false,
    isHuman: false,
    shouldSend: shouldSend,
  };
}

function handleOptionMatch(
  option: MenuOption,
  menus: Menu[],
  allOptions: MenuOption[],
  config: ChatbotConfig,
  variables: Variable[],
  currentMenuKey: string,
  currentStack: string[],
  lastSentMenuKey: string | null
): ProcessResult {
  console.log(`[ChatbotV3] Option matched: ${option.option_number} - ${option.option_text}`);
  
  switch (option.action_type) {
    case "menu":
      if (option.target_menu_key) {
        const targetMenu = menus.find(m => m.menu_key === option.target_menu_key);
        if (targetMenu) {
          const nav = pushNavigation(currentStack, currentMenuKey, option.target_menu_key);
          const menuOptions = allOptions.filter(o => o.menu_id === targetMenu.id);
          
          return buildMenuResponse(
            targetMenu, 
            menuOptions, 
            config, 
            variables, 
            nav.newStack,
            nav.previousKey,
            lastSentMenuKey
          );
        }
      }
      break;
      
    case "message":
      return {
        response: replaceVariables(option.action_response || "Mensagem recebida!", variables),
        newMenuKey: currentMenuKey,
        previousMenuKey: currentStack[currentStack.length - 1] || null,
        newStack: currentStack,
        useListMessage: false,
        isFallback: false,
        isHuman: false,
        shouldSend: true,
      };
      
    case "human":
      return {
        response: replaceVariables(option.action_response || "Aguarde, você será atendido por um de nossos atendentes. 👤", variables),
        newMenuKey: currentMenuKey,
        previousMenuKey: currentStack[currentStack.length - 1] || null,
        newStack: currentStack,
        useListMessage: false,
        isFallback: false,
        isHuman: true,
        shouldSend: true,
      };
      
    case "end":
      return {
        response: replaceVariables(option.action_response || "Obrigado pelo contato! Até a próxima. 👋", variables),
        newMenuKey: "main",
        previousMenuKey: null,
        newStack: [],
        useListMessage: false,
        isFallback: false,
        isHuman: false,
        shouldSend: true,
      };
  }
  
  return {
    response: replaceVariables(config.fallback_message, variables),
    newMenuKey: currentMenuKey,
    previousMenuKey: currentStack[currentStack.length - 1] || null,
    newStack: currentStack,
    useListMessage: false,
    isFallback: true,
    isHuman: false,
    shouldSend: true,
  };
}

// ========== MAIN HANDLER ==========

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ========== DIAGNOSTIC ENDPOINTS ==========
    if (req.method === "GET") {
      const url = new URL(req.url);
      
      if (url.searchParams.get("ping") === "true") {
        return new Response(
          JSON.stringify({ status: "ok", version: "3.1.0", features: ["list_message", "navigation_stack", "anti_repeat"] }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      if (url.searchParams.get("diagnose") === "true") {
        const { data: configs } = await supabase.from("chatbot_v3_config").select("user_id, is_enabled, use_list_message");
        const { data: menus } = await supabase.from("chatbot_v3_menus").select("user_id, menu_key, list_id").limit(20);
        const { data: triggers } = await supabase.from("chatbot_v3_triggers").select("user_id, trigger_name").limit(20);
        
        return new Response(
          JSON.stringify({
            status: "diagnostic",
            version: "3.1.0",
            configs: configs?.length || 0,
            menus: menus?.slice(0, 5) || [],
            triggers: triggers?.slice(0, 5) || [],
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ status: "ok", version: "3.1.0", usage: "POST webhook payload" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ========== PARSE WEBHOOK PAYLOAD ==========
    let payload: any;
    try {
      payload = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const event = payload.event || payload.type || "";
    const instanceName = payload.instance || payload.instanceName || payload.data?.instance?.instanceName || "";
    
    // Verificar evento de mensagem
    const messageEvents = ["messages.upsert", "message", "message.received"];
    const isMessageEvent = messageEvents.some(e => event.toLowerCase().includes(e.toLowerCase()));
    
    if (!isMessageEvent) {
      return new Response(
        JSON.stringify({ status: "ignored", reason: "Not a message event" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extrair dados da mensagem
    const message = payload.data || payload.message || payload.messages?.[0];
    const remoteJid = message?.key?.remoteJid;
    const fromMe = message?.key?.fromMe === true;
    const pushName = message?.pushName || "";
    
    if (!remoteJid || !instanceName) {
      return new Response(
        JSON.stringify({ status: "ignored", reason: "No remoteJid or instance" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extrair texto - incluindo seleção de List Message
    let messageText = 
      message?.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
      message?.message?.listResponseMessage?.selectedRowId ||
      message?.message?.conversation ||
      message?.message?.extendedTextMessage?.text ||
      "";
    
    if (!messageText) {
      return new Response(
        JSON.stringify({ status: "ignored", reason: "No text content" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const phone = extractPhone(remoteJid);

    // ========== FIND USER BY INSTANCE ==========
    let userId: string | null = null;
    
    const { data: sellerInstance } = await supabase
      .from("whatsapp_seller_instances")
      .select("seller_id")
      .ilike("instance_name", instanceName)
      .maybeSingle();
    
    if (sellerInstance) {
      userId = sellerInstance.seller_id;
    } else {
      const { data: globalConfig } = await supabase
        .from("whatsapp_global_config")
        .select("admin_user_id, instance_name")
        .eq("is_active", true)
        .maybeSingle();
      
      if (globalConfig && globalConfig.instance_name?.toLowerCase() === instanceName.toLowerCase()) {
        userId = globalConfig.admin_user_id;
      }
    }
    
    if (!userId) {
      return new Response(
        JSON.stringify({ status: "error", reason: "Instance not found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ========== LOAD CHATBOT DATA ==========
    const [
      { data: config },
      { data: menus },
      { data: options },
      { data: triggers },
      { data: variables },
      { data: contact },
      { data: globalApiConfig },
    ] = await Promise.all([
      supabase.from("chatbot_v3_config").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("chatbot_v3_menus").select("*").eq("user_id", userId).eq("is_active", true),
      supabase.from("chatbot_v3_options").select("*").eq("user_id", userId).eq("is_active", true),
      supabase.from("chatbot_v3_triggers").select("*").eq("user_id", userId).eq("is_active", true),
      supabase.from("chatbot_v3_variables").select("variable_key, variable_value").eq("user_id", userId),
      supabase.from("chatbot_v3_contacts").select("*").eq("user_id", userId).eq("phone", phone).maybeSingle(),
      supabase.from("whatsapp_global_config").select("api_url, api_token").eq("is_active", true).maybeSingle(),
    ]);

    if (!config?.is_enabled) {
      return new Response(
        JSON.stringify({ status: "ignored", reason: "Chatbot disabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (config.ignore_groups && isGroupMessage(remoteJid)) {
      return new Response(
        JSON.stringify({ status: "ignored", reason: "Group message" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (fromMe) {
      return new Response(
        JSON.stringify({ status: "ignored", reason: "Own message" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!globalApiConfig) {
      return new Response(
        JSON.stringify({ status: "error", reason: "API not configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Criar contato se não existir
    if (!contact) {
      await supabase
        .from("chatbot_v3_contacts")
        .insert({
          user_id: userId,
          phone,
          name: pushName,
          current_menu_key: "main",
          previous_menu_key: null,
          last_sent_menu_key: null,
          navigation_stack: [],
          last_message_at: new Date().toISOString(),
          interaction_count: 1,
        });
    }

    // ========== PROCESS MESSAGE ==========
    const result = processMessage(
      messageText,
      contact as Contact | null,
      triggers || [],
      menus || [],
      options || [],
      config as ChatbotConfig,
      variables || []
    );

    // ========== ANTI-REPETIÇÃO ==========
    if (!result.shouldSend) {
      console.log(`[ChatbotV3] Anti-repeat: skipping duplicate message for menu ${result.newMenuKey}`);
      return new Response(
        JSON.stringify({ status: "skipped", reason: "Anti-repeat", menuKey: result.newMenuKey }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ========== SEND RESPONSE ==========
    if (config.typing_enabled) {
      const typingDuration = getRandomDelay(config.response_delay_min, config.response_delay_max);
      await sendTypingStatus(globalApiConfig, instanceName, phone, typingDuration);
    } else {
      await new Promise(r => setTimeout(r, getRandomDelay(config.response_delay_min, config.response_delay_max)));
    }

    let sent = false;
    
    if (result.useListMessage && result.listMessageData) {
      sent = await sendListMessage(
        globalApiConfig,
        instanceName,
        phone,
        result.listMessageData.title,
        result.response,
        result.listMessageData.buttonText,
        result.listMessageData.sections
      );
    } else if (result.imageUrl) {
      sent = await sendImageMessage(globalApiConfig, instanceName, phone, result.response, result.imageUrl);
    } else if (result.response) {
      sent = await sendTextMessage(globalApiConfig, instanceName, phone, result.response);
    }

    // ========== UPDATE DATABASE ==========
    const now = new Date().toISOString();
    
    await supabase
      .from("chatbot_v3_contacts")
      .upsert({
        user_id: userId,
        phone,
        name: pushName || contact?.name,
        current_menu_key: result.newMenuKey,
        previous_menu_key: result.previousMenuKey,
        last_sent_menu_key: result.newMenuKey,
        navigation_stack: result.newStack,
        last_message_at: now,
        last_response_at: now,
        awaiting_human: result.isHuman,
        interaction_count: (contact?.interaction_count || 0) + 1,
      }, {
        onConflict: "user_id,phone",
      });

    // Log
    await supabase.from("chatbot_v3_logs").insert({
      user_id: userId,
      contact_phone: phone,
      incoming_message: messageText,
      response_sent: result.response.substring(0, 1000),
      menu_key: result.newMenuKey,
      trigger_matched: result.triggerMatched || null,
      was_fallback: result.isFallback,
    });

    return new Response(
      JSON.stringify({
        status: sent ? "sent" : "failed",
        menuKey: result.newMenuKey,
        previousMenuKey: result.previousMenuKey,
        stackSize: result.newStack.length,
        useListMessage: result.useListMessage,
        triggerMatched: result.triggerMatched,
        isFallback: result.isFallback,
        isHuman: result.isHuman,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("[ChatbotV3] Error:", error);
    return new Response(
      JSON.stringify({ status: "error", message: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
