/**
 * BOT ENGINE - Tipos TypeScript
 * Módulo isolado de infraestrutura para chatbots
 */

// =====================================================================
// TIPOS DE NÓS
// =====================================================================

export type BotNodeType = 
  | 'start'       // Nó inicial do fluxo
  | 'message'     // Envia mensagem
  | 'input'       // Aguarda input do usuário
  | 'condition'   // Avalia condição e ramifica
  | 'action'      // Executa ação (HTTP, variável, etc)
  | 'delay'       // Aguarda tempo
  | 'goto'        // Pula para outro fluxo
  | 'end';        // Finaliza sessão

export type BotTriggerType = 
  | 'keyword'       // Palavra-chave na mensagem
  | 'first_message' // Primeira mensagem do contato
  | 'webhook'       // Chamada externa
  | 'manual'        // Iniciado manualmente
  | 'default';      // Fallback quando nenhum trigger bate

export type BotConditionType = 
  | 'always'      // Sempre passa
  | 'equals'      // Valor exato
  | 'contains'    // Contém texto
  | 'regex'       // Expressão regular
  | 'expression'  // Expressão customizada
  | 'variable';   // Baseado em variável

export type BotSessionStatus = 
  | 'active'      // Em andamento
  | 'paused'      // Pausada (aguardando algo)
  | 'completed'   // Finalizada com sucesso
  | 'expired'     // Expirou por timeout
  | 'error';      // Erro durante execução

export type BotMessageDirection = 'inbound' | 'outbound';

export type BotActionType = 
  | 'http_request'       // Chamada HTTP
  | 'set_variable'       // Define variável
  | 'send_notification'  // Envia notificação push
  | 'transfer_human'     // Transfere para humano
  | 'end_session';       // Encerra sessão

// =====================================================================
// CONFIGURAÇÃO DO MOTOR
// =====================================================================

export type BotMediaType = 'none' | 'image' | 'video' | 'audio' | 'document';

export interface BotEngineConfig {
  id: string;
  seller_id: string;
  is_enabled: boolean;
  
  // Mensagens personalizadas
  welcome_message: string;
  welcome_media_url?: string;
  welcome_media_type: BotMediaType;
  fallback_message: string;
  inactivity_message: string;
  outside_hours_message: string;
  human_takeover_message: string;
  
  // Menu principal
  main_menu_key: string;
  
  // Modo de exibição de menus
  use_text_menus: boolean;  // Se true, envia menus como texto em vez de listas interativas
  
  // Timeouts e delays
  default_timeout_minutes: number;
  session_expire_minutes: number;
  max_inactivity_minutes: number;
  auto_reply_delay_ms: number;
  
  // Horário de funcionamento
  business_hours_enabled: boolean;
  business_hours_start: string; // TIME format "HH:MM"
  business_hours_end: string;   // TIME format "HH:MM"
  business_days: number[];      // 0=Dom, 1=Seg, 2=Ter, ..., 6=Sáb
  timezone: string;
  
  // Comportamento de primeiro contato
  welcome_cooldown_hours: number;         // Horas antes de reenviar boas-vindas (default 24)
  suppress_fallback_first_contact: boolean; // Não enviar erro no primeiro contato
  
  // Comportamento
  typing_simulation: boolean;
  human_takeover_enabled: boolean;
  
  // Fluxos e comandos
  enabled_flows: string[];      // IDs de fluxos habilitados (vazio = todos)
  disabled_commands: string[];  // Comandos globais desabilitados
  
  // Variáveis personalizadas
  custom_variables: Record<string, string>;
  
  // Metadados
  created_at: string;
  updated_at: string;
}

// =====================================================================
// FLUXOS
// =====================================================================

export interface BotFlow {
  id: string;
  seller_id: string;
  name: string;
  description?: string;
  trigger_type: BotTriggerType;
  trigger_keywords: string[];
  is_active: boolean;
  is_default: boolean;
  priority: number;
  category?: string | null; // Categoria/pasta para organização (ex: "Fluxos IPTV")
  /** Indica se é um template universal visível para todos os revendedores */
  is_template?: boolean;
  /** ID do template original se este fluxo foi clonado */
  cloned_from_template_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface BotFlowWithNodes extends BotFlow {
  nodes: BotNode[];
  edges: BotEdge[];
}

// =====================================================================
// NÓS
// =====================================================================

export interface BotNode {
  id: string;
  flow_id: string;
  seller_id: string;
  node_type: BotNodeType;
  name?: string;
  config: BotNodeConfig;
  position_x: number;
  position_y: number;
  is_entry_point: boolean;
  created_at: string;
  updated_at: string;
}

// Tipos de ação para opções de menu
export type MenuOptionActionType = 
  | 'submenu'         // Abre um submenu (menu filho)
  | 'message'         // Envia uma mensagem
  | 'command'         // Executa um comando (/teste, /renovar, etc)
  | 'goto_flow'       // Vai para outro fluxo
  | 'goto_node'       // Vai para outro nó no mesmo fluxo
  | 'transfer_human'  // Transfere para atendente
  | 'end_session';    // Encerra a sessão

// Opção individual de menu interativo
export interface BotMenuOption {
  id: string;
  emoji?: string;
  title: string;
  description?: string;
  action_type: MenuOptionActionType;
  // Dados específicos da ação
  submenu_options?: BotMenuOption[];  // Para submenu aninhado
  message_text?: string;              // Para action_type = 'message'
  command?: string;                   // Para action_type = 'command'
  target_flow_id?: string;            // Para action_type = 'goto_flow'
  target_node_id?: string;            // Para action_type = 'goto_node'
}

// Configurações específicas por tipo de nó
export interface BotNodeConfig {
  // Para 'message'
  message_text?: string;
  message_type?: 'text' | 'image' | 'document' | 'buttons' | 'menu';
  buttons?: BotButton[];
  media_url?: string;
  
  // Para 'menu' interativo (novo!)
  menu_title?: string;
  menu_header?: string;
  menu_footer?: string;
  menu_options?: BotMenuOption[];
  show_back_button?: boolean;
  back_button_text?: string;
  silent_on_invalid?: boolean;  // Não responder se opção inválida
  
  // Para 'input'
  variable_name?: string;
  validation_type?: 'text' | 'number' | 'email' | 'phone' | 'date' | 'option';
  validation_options?: string[];
  error_message?: string;
  
  // Para 'condition'
  condition_variable?: string;
  
  // Para 'action'
  action_type?: BotActionType;
  http_url?: string;
  http_method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  http_headers?: Record<string, string>;
  http_body?: string;
  variable_to_set?: string;
  variable_value?: string;
  notification_title?: string;
  notification_body?: string;
  
  // Para 'delay'
  delay_seconds?: number;
  
  // Para 'goto'
  target_flow_id?: string;
  
  // Metadados genéricos
  [key: string]: unknown;
}

export interface BotButton {
  id: string;
  text: string;
  value: string;
}

// =====================================================================
// CONEXÕES (EDGES)
// =====================================================================

export interface BotEdge {
  id: string;
  flow_id: string;
  seller_id: string;
  source_node_id: string;
  target_node_id: string;
  condition_type: BotConditionType;
  condition_value?: string;
  label?: string;
  priority: number;
  created_at: string;
}

// =====================================================================
// SESSÕES
// =====================================================================

export interface BotSession {
  id: string;
  seller_id: string;
  flow_id?: string;
  contact_phone: string;
  contact_name?: string;
  current_node_id?: string;
  variables: Record<string, unknown>;
  status: BotSessionStatus;
  awaiting_input: boolean;
  input_variable_name?: string;
  started_at: string;
  last_activity_at: string;
  ended_at?: string;
  error_message?: string;
}

// =====================================================================
// LOG DE MENSAGENS
// =====================================================================

export interface BotMessageLog {
  id: string;
  session_id?: string;
  seller_id: string;
  direction: BotMessageDirection;
  message_content?: string;
  message_type: string;
  node_id?: string;
  metadata: Record<string, unknown>;
  processed_at: string;
}

// =====================================================================
// AÇÕES CUSTOMIZADAS
// =====================================================================

export interface BotAction {
  id: string;
  seller_id: string;
  name: string;
  action_type: BotActionType;
  config: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// =====================================================================
// TIPOS DE ENTRADA/SAÍDA DO MOTOR
// =====================================================================

export interface BotEngineInput {
  seller_id: string;
  contact_phone: string;
  contact_name?: string;
  message_text: string;
  message_type?: string;
  metadata?: Record<string, unknown>;
}

export interface BotEngineOutput {
  success: boolean;
  session_id?: string;
  responses: BotEngineResponse[];
  session_status?: BotSessionStatus;
  error?: string;
}

export interface BotEngineResponse {
  type: 'text' | 'image' | 'document' | 'buttons' | 'delay';
  content?: string;
  media_url?: string;
  buttons?: BotButton[];
  delay_ms?: number;
}

// =====================================================================
// TIPOS PARA CRIAÇÃO/ATUALIZAÇÃO
// =====================================================================

export type CreateBotFlow = Pick<BotFlow, 'name'> & Partial<Omit<BotFlow, 'id' | 'seller_id' | 'created_at' | 'updated_at'>>;
export type UpdateBotFlow = Partial<Omit<BotFlow, 'id' | 'seller_id' | 'created_at' | 'updated_at'>>;

export type CreateBotNode = Omit<BotNode, 'id' | 'created_at' | 'updated_at'>;
export type UpdateBotNode = Partial<Omit<BotNode, 'id' | 'flow_id' | 'seller_id' | 'created_at' | 'updated_at'>>;

export type CreateBotEdge = Omit<BotEdge, 'id' | 'created_at'>;
export type UpdateBotEdge = Partial<Omit<BotEdge, 'id' | 'flow_id' | 'seller_id' | 'created_at'>>;

export type CreateBotAction = Omit<BotAction, 'id' | 'created_at' | 'updated_at'>;
export type UpdateBotAction = Partial<Omit<BotAction, 'id' | 'seller_id' | 'created_at' | 'updated_at'>>;
