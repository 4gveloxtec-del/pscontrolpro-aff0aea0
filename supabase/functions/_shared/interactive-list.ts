/**
 * BOT ENGINE - Sistema de Lista Interativa do WhatsApp
 * Utilitários para gerar mensagens de lista compatíveis com Evolution API
 * 
 * ARQUITETURA:
 * - Cada opção tem um rowId IMUTÁVEL (baseado no menu_key)
 * - Textos e descrições são personalizáveis por revendedor
 * - Navegação (Voltar/Início) incluída como itens da lista
 */

// =====================================================================
// TIPOS PARA LISTA INTERATIVA
// =====================================================================

export interface InteractiveListRow {
  /** Texto principal da opção (editável pelo revendedor) */
  title: string;
  /** Descrição opcional (editável pelo revendedor) */
  description?: string;
  /** ID imutável - usado para identificar a seleção */
  rowId: string;
}

export interface InteractiveListSection {
  /** Título da seção */
  title: string;
  /** Linhas/opções da seção */
  rows: InteractiveListRow[];
}

export interface InteractiveListMessage {
  /** Título principal da mensagem (exibido no corpo) */
  title: string;
  /** Descrição/corpo da mensagem */
  description?: string;
  /** Texto do botão que abre a lista */
  buttonText: string;
  /** Texto do rodapé (opcional) */
  footerText?: string;
  /** Seções da lista */
  sections: InteractiveListSection[];
}

/**
 * Resposta estruturada do bot que pode ser texto ou lista interativa
 */
export interface BotStructuredResponse {
  /** Tipo de resposta */
  type: 'text' | 'list';
  /** Conteúdo texto (quando type = 'text') */
  text?: string;
  /** Dados da lista interativa (quando type = 'list') */
  list?: InteractiveListMessage;
}

// =====================================================================
// IDs IMUTÁVEIS DE NAVEGAÇÃO
// =====================================================================

/**
 * IDs de sistema reservados - NUNCA devem ser alterados
 * Revendedores podem alterar apenas os textos exibidos
 */
export const NAVIGATION_ROW_IDS = {
  /** Voltar ao menu anterior */
  BACK: '__nav_back__',
  /** Ir para o menu principal */
  HOME: '__nav_home__',
} as const;

export type NavigationRowId = typeof NAVIGATION_ROW_IDS[keyof typeof NAVIGATION_ROW_IDS];

// =====================================================================
// INTERFACE PARA ITENS DE MENU DINÂMICO
// =====================================================================

export interface DynamicMenuItemForList {
  id: string;
  menu_key: string;
  title: string;
  description: string | null;
  emoji: string | null;
  section_title: string | null;
  menu_type: 'submenu' | 'flow' | 'command' | 'link' | 'message';
  is_root: boolean;
  show_back_button: boolean;
  back_button_text: string | null;
  header_message: string | null;
  footer_message: string | null;
  parent_menu_id: string | null;
}

// =====================================================================
// FUNÇÕES DE RENDERIZAÇÃO
// =====================================================================

/**
 * Converte itens de menu dinâmico para Lista Interativa do WhatsApp
 * 
 * @param items - Itens do menu (filhos do menu atual)
 * @param menuConfig - Configurações do menu pai (header, footer, etc)
 * @param options - Opções adicionais
 */
export function renderMenuAsInteractiveList(
  items: DynamicMenuItemForList[],
  menuConfig: {
    title?: string;
    headerMessage?: string;
    footerMessage?: string;
    showBackButton?: boolean;
    backButtonText?: string;
    isRoot?: boolean;
  } = {},
  options: {
    buttonText?: string;
  } = {}
): InteractiveListMessage {
  const {
    title = 'Menu',
    headerMessage,
    footerMessage,
    showBackButton = true,
    backButtonText = 'Voltar',
    isRoot = false,
  } = menuConfig;
  
  const { buttonText = 'Ver Opções' } = options;
  
  // Agrupar itens por seção
  const sectionsMap = new Map<string, InteractiveListRow[]>();
  
  for (const item of items) {
    const sectionTitle = item.section_title || 'Opções';
    
    if (!sectionsMap.has(sectionTitle)) {
      sectionsMap.set(sectionTitle, []);
    }
    
    // Construir título com emoji
    const emoji = item.emoji ? `${item.emoji} ` : '';
    const rowTitle = `${emoji}${item.title}`.substring(0, 24); // Max 24 chars para título
    
    sectionsMap.get(sectionTitle)!.push({
      title: rowTitle,
      description: item.description?.substring(0, 72) || undefined, // Max 72 chars para descrição
      rowId: item.menu_key, // ID imutável baseado no menu_key
    });
  }
  
  // Converter Map para array de seções
  const sections: InteractiveListSection[] = Array.from(sectionsMap.entries()).map(
    ([sectionTitle, rows]) => ({
      title: sectionTitle.substring(0, 24), // Max 24 chars para título de seção
      rows,
    })
  );
  
  // Adicionar seção de navegação se necessário
  const navRows: InteractiveListRow[] = [];
  
  // Botão "Voltar" - exibido apenas se não é menu raiz
  if (showBackButton && !isRoot) {
    navRows.push({
      title: `⬅️ ${backButtonText}`.substring(0, 24),
      description: 'Retornar ao menu anterior',
      rowId: NAVIGATION_ROW_IDS.BACK,
    });
  }
  
  // Botão "Menu Principal" - sempre disponível (exceto no próprio menu raiz)
  if (!isRoot) {
    navRows.push({
      title: '🏠 Menu Principal',
      description: 'Voltar ao início',
      rowId: NAVIGATION_ROW_IDS.HOME,
    });
  }
  
  // Adicionar seção de navegação se houver itens
  if (navRows.length > 0) {
    sections.push({
      title: 'Navegação',
      rows: navRows,
    });
  }
  
  return {
    title: title.substring(0, 60), // Max 60 chars
    description: headerMessage?.substring(0, 1024) || undefined, // Max 1024 chars
    buttonText: buttonText.substring(0, 20), // Max 20 chars
    footerText: footerMessage?.substring(0, 60) || undefined, // Max 60 chars
    sections,
  };
}

/**
 * Verifica se um rowId é um comando de navegação do sistema
 */
export function isNavigationCommand(rowId: string): boolean {
  return rowId === NAVIGATION_ROW_IDS.BACK || rowId === NAVIGATION_ROW_IDS.HOME;
}

/**
 * Processa seleção de navegação e retorna a ação correspondente
 */
export function processNavigationSelection(rowId: string): {
  action: 'back' | 'home' | null;
} {
  if (rowId === NAVIGATION_ROW_IDS.BACK) {
    return { action: 'back' };
  }
  if (rowId === NAVIGATION_ROW_IDS.HOME) {
    return { action: 'home' };
  }
  return { action: null };
}

/**
 * Cria uma resposta estruturada do tipo lista
 */
export function createListResponse(list: InteractiveListMessage): BotStructuredResponse {
  return {
    type: 'list',
    list,
  };
}

/**
 * Cria uma resposta estruturada do tipo texto
 */
export function createTextResponse(text: string): BotStructuredResponse {
  return {
    type: 'text',
    text,
  };
}

/**
 * Serializa uma resposta estruturada para transmissão
 * O formato permite identificar o tipo no connection-heartbeat
 */
export function serializeResponse(response: BotStructuredResponse): string {
  // Prefixo especial para identificar resposta estruturada
  return `__BOT_STRUCTURED__${JSON.stringify(response)}`;
}

/**
 * Deserializa uma resposta estruturada
 * Retorna null se não for uma resposta estruturada válida
 */
export function deserializeResponse(data: string): BotStructuredResponse | null {
  const PREFIX = '__BOT_STRUCTURED__';
  
  if (!data.startsWith(PREFIX)) {
    return null;
  }
  
  try {
    const json = data.substring(PREFIX.length);
    return JSON.parse(json) as BotStructuredResponse;
  } catch {
    return null;
  }
}

/**
 * Converte lista interativa para payload da Evolution API (sendList)
 */
/**
 * Converte lista interativa para payload da Evolution API (sendList)
 * 
 * IMPORTANTE: A Evolution API espera o campo "values" (não "sections")
 * Documentação: POST /message/sendList/{instance}
 */
export function toEvolutionApiPayload(
  list: InteractiveListMessage,
  phoneNumber: string
): {
  number: string;
  title: string;
  description?: string;
  buttonText: string;
  footerText?: string;
  values: Array<{
    title: string;
    rows: Array<{
      title: string;
      description?: string;
      rowId: string;
    }>;
  }>;
} {
  return {
    number: phoneNumber,
    title: list.title,
    description: list.description,
    buttonText: list.buttonText,
    footerText: list.footerText,
    // Evolution API usa "values" ao invés de "sections"
    values: list.sections.map(section => ({
      title: section.title,
      rows: section.rows.map(row => ({
        title: row.title,
        description: row.description,
        rowId: row.rowId,
      })),
    })),
  };
}

/**
 * Cria uma mensagem de erro como lista interativa
 * Útil para quando o usuário seleciona uma opção inválida
 */
export function createErrorListResponse(
  errorMessage: string,
  currentMenuItems: DynamicMenuItemForList[],
  menuConfig: {
    title?: string;
    headerMessage?: string;
    footerMessage?: string;
    showBackButton?: boolean;
    backButtonText?: string;
    isRoot?: boolean;
  } = {}
): BotStructuredResponse {
  const list = renderMenuAsInteractiveList(currentMenuItems, {
    ...menuConfig,
    headerMessage: `❌ ${errorMessage}\n\n${menuConfig.headerMessage || 'Escolha uma opção:'}`,
  });
  
  return createListResponse(list);
}
