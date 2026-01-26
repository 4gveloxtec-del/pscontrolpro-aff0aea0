/**
 * BOT ENGINE - Tipos para Sistema de Menus Dinâmicos
 * Estrutura flexível para gerenciamento de menus e submenus
 */

// Tipos de ação do menu
export type DynamicMenuType = 
  | 'submenu'   // Abre outro menu
  | 'flow'      // Chama um fluxo do bot engine
  | 'command'   // Executa um comando
  | 'link'      // Abre link externo
  | 'message';  // Envia mensagem simples

// Interface principal do menu dinâmico
export interface DynamicMenu {
  id: string;
  seller_id: string;
  parent_menu_id: string | null;
  
  // Identificação
  menu_key: string;
  title: string;
  description: string | null;
  
  // Tipo e destino
  menu_type: DynamicMenuType;
  target_menu_key: string | null;
  target_flow_id: string | null;
  target_command: string | null;
  target_url: string | null;
  target_message: string | null;
  
  // Visual
  emoji: string | null;
  section_title: string | null;
  
  // Ordenação e status
  display_order: number;
  is_active: boolean;
  is_root: boolean;
  
  // Navegação
  show_back_button: boolean;
  back_button_text: string | null;
  
  // Mensagens
  header_message: string | null;
  footer_message: string | null;
  
  // Metadados
  created_at: string;
  updated_at: string;
}

// Menu com filhos (para árvore)
export interface DynamicMenuWithChildren extends DynamicMenu {
  children: DynamicMenuWithChildren[];
}

// Tipos para criação/atualização
export type CreateDynamicMenu = Omit<DynamicMenu, 'id' | 'seller_id' | 'created_at' | 'updated_at'>;
export type UpdateDynamicMenu = Partial<Omit<DynamicMenu, 'id' | 'seller_id' | 'created_at' | 'updated_at'>>;

// Opções de tipo de menu para UI
export const MENU_TYPE_OPTIONS: { value: DynamicMenuType; label: string; description: string }[] = [
  { value: 'submenu', label: 'Abrir Submenu', description: 'Navega para outro menu' },
  { value: 'flow', label: 'Executar Fluxo', description: 'Inicia um fluxo do bot' },
  { value: 'command', label: 'Executar Comando', description: 'Executa um comando específico' },
  { value: 'link', label: 'Abrir Link', description: 'Envia um link externo' },
  { value: 'message', label: 'Enviar Mensagem', description: 'Envia uma mensagem de texto' },
];

// Interface para item de lista do WhatsApp
export interface WhatsAppListItem {
  title: string;
  description?: string;
  rowId: string;
}

// Interface para seção de lista do WhatsApp
export interface WhatsAppListSection {
  title: string;
  rows: WhatsAppListItem[];
}

// Interface para mensagem de lista do WhatsApp
export interface WhatsAppListMessage {
  title: string;
  description?: string;
  buttonText: string;
  footerText?: string;
  sections: WhatsAppListSection[];
}

/**
 * Converte menus dinâmicos para formato de lista do WhatsApp
 */
export function convertMenusToWhatsAppList(
  menus: DynamicMenu[],
  headerMessage?: string,
  footerMessage?: string
): WhatsAppListMessage {
  // Agrupar por seção
  const sections = new Map<string, WhatsAppListItem[]>();
  
  for (const menu of menus) {
    const sectionTitle = menu.section_title || 'Opções';
    
    if (!sections.has(sectionTitle)) {
      sections.set(sectionTitle, []);
    }
    
    sections.get(sectionTitle)!.push({
      title: menu.emoji ? `${menu.emoji} ${menu.title}` : menu.title,
      description: menu.description || undefined,
      rowId: menu.menu_key,
    });
  }
  
  return {
    title: headerMessage || 'Menu',
    buttonText: 'Ver Opções',
    footerText: footerMessage,
    sections: Array.from(sections.entries()).map(([title, rows]) => ({
      title,
      rows,
    })),
  };
}
