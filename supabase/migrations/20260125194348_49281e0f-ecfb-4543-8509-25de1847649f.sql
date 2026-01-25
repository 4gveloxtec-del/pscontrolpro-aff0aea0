-- =====================================================================
-- BOT ENGINE MODULE - Infraestrutura isolada para chatbots
-- Não contém fluxos prontos, apenas estrutura para construí-los
-- =====================================================================

-- 1. Configurações gerais do motor por revendedor
CREATE TABLE public.bot_engine_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_id UUID NOT NULL,
  is_enabled BOOLEAN DEFAULT false,
  default_timeout_minutes INTEGER DEFAULT 30,
  fallback_message TEXT DEFAULT 'Desculpe, não entendi. Digite *menu* para ver as opções.',
  session_expire_minutes INTEGER DEFAULT 60,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(seller_id)
);

-- 2. Definição de fluxos de conversa (estrutura, não conteúdo)
CREATE TABLE public.bot_engine_flows (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL DEFAULT 'keyword', -- keyword, webhook, manual, default
  trigger_keywords TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false, -- Fluxo padrão quando nenhum trigger bate
  priority INTEGER DEFAULT 0, -- Maior = mais prioritário
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 3. Nós do fluxo (cada passo da conversa)
CREATE TABLE public.bot_engine_nodes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  flow_id UUID NOT NULL REFERENCES public.bot_engine_flows(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL,
  node_type TEXT NOT NULL, -- start, message, input, condition, action, delay, end, goto
  name TEXT,
  config JSONB DEFAULT '{}', -- Configuração específica do tipo de nó
  position_x FLOAT DEFAULT 0,
  position_y FLOAT DEFAULT 0,
  is_entry_point BOOLEAN DEFAULT false, -- Primeiro nó do fluxo
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 4. Conexões entre nós (edges do grafo)
CREATE TABLE public.bot_engine_edges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  flow_id UUID NOT NULL REFERENCES public.bot_engine_flows(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL,
  source_node_id UUID NOT NULL REFERENCES public.bot_engine_nodes(id) ON DELETE CASCADE,
  target_node_id UUID NOT NULL REFERENCES public.bot_engine_nodes(id) ON DELETE CASCADE,
  condition_type TEXT DEFAULT 'always', -- always, equals, contains, regex, expression
  condition_value TEXT, -- Valor para comparação
  label TEXT, -- Rótulo visual da conexão
  priority INTEGER DEFAULT 0, -- Para múltiplas saídas, qual avaliar primeiro
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 5. Sessões ativas de conversa
CREATE TABLE public.bot_engine_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_id UUID NOT NULL,
  flow_id UUID REFERENCES public.bot_engine_flows(id) ON DELETE SET NULL,
  contact_phone TEXT NOT NULL,
  contact_name TEXT,
  current_node_id UUID REFERENCES public.bot_engine_nodes(id) ON DELETE SET NULL,
  variables JSONB DEFAULT '{}', -- Variáveis coletadas durante a conversa
  status TEXT DEFAULT 'active', -- active, paused, completed, expired, error
  awaiting_input BOOLEAN DEFAULT false,
  input_variable_name TEXT, -- Nome da variável que está aguardando input
  started_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  ended_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT
);

-- 6. Log de mensagens processadas pelo bot
CREATE TABLE public.bot_engine_message_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES public.bot_engine_sessions(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL,
  direction TEXT NOT NULL, -- inbound, outbound
  message_content TEXT,
  message_type TEXT DEFAULT 'text', -- text, image, audio, document, button_response
  node_id UUID REFERENCES public.bot_engine_nodes(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}',
  processed_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 7. Ações customizadas disponíveis
CREATE TABLE public.bot_engine_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_id UUID NOT NULL,
  name TEXT NOT NULL,
  action_type TEXT NOT NULL, -- http_request, set_variable, send_notification, transfer_human
  config JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- =====================================================================
-- ÍNDICES PARA PERFORMANCE
-- =====================================================================

CREATE INDEX idx_bot_engine_flows_seller ON public.bot_engine_flows(seller_id);
CREATE INDEX idx_bot_engine_flows_active ON public.bot_engine_flows(seller_id, is_active);
CREATE INDEX idx_bot_engine_nodes_flow ON public.bot_engine_nodes(flow_id);
CREATE INDEX idx_bot_engine_nodes_seller ON public.bot_engine_nodes(seller_id);
CREATE INDEX idx_bot_engine_edges_flow ON public.bot_engine_edges(flow_id);
CREATE INDEX idx_bot_engine_edges_source ON public.bot_engine_edges(source_node_id);
CREATE INDEX idx_bot_engine_sessions_seller ON public.bot_engine_sessions(seller_id);
CREATE INDEX idx_bot_engine_sessions_phone ON public.bot_engine_sessions(seller_id, contact_phone);
CREATE INDEX idx_bot_engine_sessions_active ON public.bot_engine_sessions(seller_id, status) WHERE status = 'active';
CREATE INDEX idx_bot_engine_message_log_session ON public.bot_engine_message_log(session_id);
CREATE INDEX idx_bot_engine_message_log_seller ON public.bot_engine_message_log(seller_id);

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================

ALTER TABLE public.bot_engine_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_engine_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_engine_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_engine_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_engine_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_engine_message_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_engine_actions ENABLE ROW LEVEL SECURITY;

-- Políticas para bot_engine_config
CREATE POLICY "Users can view own bot config" ON public.bot_engine_config
  FOR SELECT USING (auth.uid() = seller_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can insert own bot config" ON public.bot_engine_config
  FOR INSERT WITH CHECK (auth.uid() = seller_id);

CREATE POLICY "Users can update own bot config" ON public.bot_engine_config
  FOR UPDATE USING (auth.uid() = seller_id);

CREATE POLICY "Users can delete own bot config" ON public.bot_engine_config
  FOR DELETE USING (auth.uid() = seller_id);

-- Políticas para bot_engine_flows
CREATE POLICY "Users can view own flows" ON public.bot_engine_flows
  FOR SELECT USING (auth.uid() = seller_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can insert own flows" ON public.bot_engine_flows
  FOR INSERT WITH CHECK (auth.uid() = seller_id);

CREATE POLICY "Users can update own flows" ON public.bot_engine_flows
  FOR UPDATE USING (auth.uid() = seller_id);

CREATE POLICY "Users can delete own flows" ON public.bot_engine_flows
  FOR DELETE USING (auth.uid() = seller_id);

-- Políticas para bot_engine_nodes
CREATE POLICY "Users can view own nodes" ON public.bot_engine_nodes
  FOR SELECT USING (auth.uid() = seller_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can insert own nodes" ON public.bot_engine_nodes
  FOR INSERT WITH CHECK (auth.uid() = seller_id);

CREATE POLICY "Users can update own nodes" ON public.bot_engine_nodes
  FOR UPDATE USING (auth.uid() = seller_id);

CREATE POLICY "Users can delete own nodes" ON public.bot_engine_nodes
  FOR DELETE USING (auth.uid() = seller_id);

-- Políticas para bot_engine_edges
CREATE POLICY "Users can view own edges" ON public.bot_engine_edges
  FOR SELECT USING (auth.uid() = seller_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can insert own edges" ON public.bot_engine_edges
  FOR INSERT WITH CHECK (auth.uid() = seller_id);

CREATE POLICY "Users can update own edges" ON public.bot_engine_edges
  FOR UPDATE USING (auth.uid() = seller_id);

CREATE POLICY "Users can delete own edges" ON public.bot_engine_edges
  FOR DELETE USING (auth.uid() = seller_id);

-- Políticas para bot_engine_sessions
CREATE POLICY "Users can view own sessions" ON public.bot_engine_sessions
  FOR SELECT USING (auth.uid() = seller_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can insert own sessions" ON public.bot_engine_sessions
  FOR INSERT WITH CHECK (auth.uid() = seller_id);

CREATE POLICY "Users can update own sessions" ON public.bot_engine_sessions
  FOR UPDATE USING (auth.uid() = seller_id);

CREATE POLICY "Users can delete own sessions" ON public.bot_engine_sessions
  FOR DELETE USING (auth.uid() = seller_id);

-- Políticas para bot_engine_message_log
CREATE POLICY "Users can view own message logs" ON public.bot_engine_message_log
  FOR SELECT USING (auth.uid() = seller_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can insert own message logs" ON public.bot_engine_message_log
  FOR INSERT WITH CHECK (auth.uid() = seller_id);

-- Políticas para bot_engine_actions
CREATE POLICY "Users can view own actions" ON public.bot_engine_actions
  FOR SELECT USING (auth.uid() = seller_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can insert own actions" ON public.bot_engine_actions
  FOR INSERT WITH CHECK (auth.uid() = seller_id);

CREATE POLICY "Users can update own actions" ON public.bot_engine_actions
  FOR UPDATE USING (auth.uid() = seller_id);

CREATE POLICY "Users can delete own actions" ON public.bot_engine_actions
  FOR DELETE USING (auth.uid() = seller_id);

-- =====================================================================
-- TRIGGER PARA ATUALIZAR updated_at
-- =====================================================================

CREATE TRIGGER update_bot_engine_config_updated_at
  BEFORE UPDATE ON public.bot_engine_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_bot_engine_flows_updated_at
  BEFORE UPDATE ON public.bot_engine_flows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_bot_engine_nodes_updated_at
  BEFORE UPDATE ON public.bot_engine_nodes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_bot_engine_actions_updated_at
  BEFORE UPDATE ON public.bot_engine_actions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();