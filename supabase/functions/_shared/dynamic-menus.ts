/**
 * BOT ENGINE - Utilitários para Menus Dinâmicos
 * Funções compartilhadas para edge functions
 */

import { SupabaseClient } from "npm:@supabase/supabase-js@2";

// =====================================================================
// TIPOS
// =====================================================================

export interface DynamicMenuItem {
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

export interface WhatsAppListRow {
  title: string;
  description?: string;
  rowId: string;
}

export interface WhatsAppListSection {
  title: string;
  rows: WhatsAppListRow[];
}

export interface WhatsAppListMessage {
  title: string;
  description?: string;
  buttonText: string;
  footerText?: string;
  sections: WhatsAppListSection[];
}

export interface MenuSelectionResult {
  found: boolean;
  menuType?: 'submenu' | 'flow' | 'command' | 'link' | 'message';
  targetMenuKey?: string;
  targetFlowId?: string;
  targetCommand?: string;
  targetUrl?: string;
  targetMessage?: string;
  parentMenuId?: string;
}

// =====================================================================
// CARREGAR MENUS DO BANCO
// =====================================================================

/**
 * Busca o menu raiz (is_root = true) do seller
 */
export async function getRootMenu(
  supabase: SupabaseClient,
  sellerId: string
): Promise<DynamicMenuItem | null> {
  const { data, error } = await supabase
    .from('bot_engine_dynamic_menus')
    .select('*')
    .eq('seller_id', sellerId)
    .eq('is_root', true)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !data) {
    console.log(`[DynamicMenus] No root menu found for seller ${sellerId}`);
    return null;
  }

  return data as DynamicMenuItem;
}

/**
 * Busca menu por menu_key
 */
export async function getMenuByKey(
  supabase: SupabaseClient,
  sellerId: string,
  menuKey: string
): Promise<DynamicMenuItem | null> {
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

  return data as DynamicMenuItem;
}

/**
 * Busca todos os itens de um menu (filhos diretos)
 */
export async function getMenuItems(
  supabase: SupabaseClient,
  sellerId: string,
  parentMenuId: string | null
): Promise<DynamicMenuItem[]> {
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

  return data as DynamicMenuItem[];
}

/**
 * Busca menu pai de um menu
 */
export async function getParentMenu(
  supabase: SupabaseClient,
  sellerId: string,
  childMenuId: string
): Promise<DynamicMenuItem | null> {
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

  return parent as DynamicMenuItem | null;
}

// =====================================================================
// RENDERIZAÇÃO DE MENUS
// =====================================================================

/**
 * Renderiza menu como texto formatado para WhatsApp
 */
export function renderMenuAsText(
  items: DynamicMenuItem[],
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
  const sections = new Map<string, DynamicMenuItem[]>();
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
 * Converte menu para formato de lista interativa do WhatsApp
 */
export function renderMenuAsWhatsAppList(
  items: DynamicMenuItem[],
  title: string = 'Menu',
  description?: string,
  buttonText: string = 'Ver Opções',
  footerText?: string
): WhatsAppListMessage {
  // Agrupar por seção
  const sectionsMap = new Map<string, WhatsAppListRow[]>();
  
  for (const item of items) {
    const sectionTitle = item.section_title || 'Opções';
    
    if (!sectionsMap.has(sectionTitle)) {
      sectionsMap.set(sectionTitle, []);
    }
    
    const emoji = item.emoji ? `${item.emoji} ` : '';
    sectionsMap.get(sectionTitle)!.push({
      title: `${emoji}${item.title}`,
      description: item.description || undefined,
      rowId: item.menu_key,
    });
  }

  const sections: WhatsAppListSection[] = Array.from(sectionsMap.entries()).map(
    ([title, rows]) => ({ title, rows })
  );

  return {
    title,
    description,
    buttonText,
    footerText,
    sections,
  };
}

// =====================================================================
// PROCESSAMENTO DE SELEÇÃO
// =====================================================================

/**
 * Processa seleção do usuário em um menu
 * Suporta: número, menu_key, texto parcial
 */
export async function processMenuSelection(
  supabase: SupabaseClient,
  sellerId: string,
  parentMenuId: string | null,
  userInput: string
): Promise<MenuSelectionResult> {
  const items = await getMenuItems(supabase, sellerId, parentMenuId);
  
  if (items.length === 0) {
    return { found: false };
  }

  const normalized = userInput.toLowerCase().trim();

  // 1. Verificar por número
  const inputNumber = parseInt(normalized, 10);
  if (!isNaN(inputNumber) && inputNumber >= 1 && inputNumber <= items.length) {
    const item = items[inputNumber - 1];
    return createSelectionResult(item);
  }

  // 2. Verificar por menu_key exato
  const byKey = items.find(item => item.menu_key.toLowerCase() === normalized);
  if (byKey) {
    return createSelectionResult(byKey);
  }

  // 3. Verificar por título parcial
  const byTitle = items.find(item => 
    item.title.toLowerCase().includes(normalized) ||
    normalized.includes(item.title.toLowerCase())
  );
  if (byTitle) {
    return createSelectionResult(byTitle);
  }

  return { found: false };
}

function createSelectionResult(item: DynamicMenuItem): MenuSelectionResult {
  return {
    found: true,
    menuType: item.menu_type as MenuSelectionResult['menuType'],
    targetMenuKey: item.target_menu_key || undefined,
    targetFlowId: item.target_flow_id || undefined,
    targetCommand: item.target_command || undefined,
    targetUrl: item.target_url || undefined,
    targetMessage: item.target_message || undefined,
    parentMenuId: item.parent_menu_id || undefined,
  };
}

// =====================================================================
// NAVEGAÇÃO
// =====================================================================

/**
 * Obtém o menu a ser exibido baseado no estado atual
 */
export async function getMenuForState(
  supabase: SupabaseClient,
  sellerId: string,
  currentMenuKey: string | null
): Promise<{
  menu: DynamicMenuItem | null;
  items: DynamicMenuItem[];
}> {
  // Se não tem menu atual, buscar root
  if (!currentMenuKey) {
    const root = await getRootMenu(supabase, sellerId);
    if (!root) {
      return { menu: null, items: [] };
    }
    
    // Buscar itens do root
    const items = await getMenuItems(supabase, sellerId, root.id);
    return { menu: root, items };
  }

  // Buscar menu por key
  const menu = await getMenuByKey(supabase, sellerId, currentMenuKey);
  if (!menu) {
    // Fallback para root
    const root = await getRootMenu(supabase, sellerId);
    if (!root) {
      return { menu: null, items: [] };
    }
    const items = await getMenuItems(supabase, sellerId, root.id);
    return { menu: root, items };
  }

  // Buscar itens deste menu
  const items = await getMenuItems(supabase, sellerId, menu.id);
  return { menu, items };
}

/**
 * Processa entrada do usuário e determina próxima ação
 */
export async function processDynamicMenuInput(
  supabase: SupabaseClient,
  sellerId: string,
  currentMenuKey: string | null,
  userInput: string
): Promise<{
  action: 'show_menu' | 'show_submenu' | 'execute_flow' | 'execute_command' | 'show_message' | 'show_link' | 'back' | 'home' | 'invalid';
  menuKey?: string;
  flowId?: string;
  command?: string;
  message?: string;
  url?: string;
  responseText?: string;
}> {
  const normalized = userInput.toLowerCase().trim();

  // Comandos globais de navegação
  if (normalized === '0') {
    return { action: 'back' };
  }
  
  if (normalized === '#' || normalized === '00' || normalized === '##') {
    return { action: 'home' };
  }

  // Buscar menu atual
  const { menu, items } = await getMenuForState(supabase, sellerId, currentMenuKey);
  
  if (!menu || items.length === 0) {
    return { action: 'invalid', responseText: 'Menu não configurado.' };
  }

  // Processar seleção
  const selection = await processMenuSelection(supabase, sellerId, menu.id, userInput);

  if (!selection.found) {
    const menuText = renderMenuAsText(
      items,
      menu.header_message || undefined,
      menu.footer_message || undefined,
      menu.show_back_button,
      menu.back_button_text || '⬅️ Voltar'
    );
    return { 
      action: 'invalid', 
      responseText: `❌ Opção inválida. Digite o *número* da opção desejada.\n\n${menuText}` 
    };
  }

  // Determinar ação baseada no tipo
  switch (selection.menuType) {
    case 'submenu':
      return { 
        action: 'show_submenu', 
        menuKey: selection.targetMenuKey 
      };
    
    case 'flow':
      return { 
        action: 'execute_flow', 
        flowId: selection.targetFlowId 
      };
    
    case 'command':
      return { 
        action: 'execute_command', 
        command: selection.targetCommand 
      };
    
    case 'link':
      return { 
        action: 'show_link', 
        url: selection.targetUrl,
        message: `🔗 Acesse: ${selection.targetUrl}`
      };
    
    case 'message':
      return { 
        action: 'show_message', 
        message: selection.targetMessage 
      };
    
    default:
      return { action: 'invalid' };
  }
}
