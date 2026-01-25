-- =====================================================================
-- ISOLAMENTO MULTI-TENANT DO BOT ENGINE
-- Garante separação total de dados entre revendedores
-- Estrutura compatível com cobrança por uso
-- =====================================================================

-- 1. TABELA DE MÉTRICAS DE USO (para billing)
CREATE TABLE IF NOT EXISTS public.bot_engine_usage_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL,
  period_start TIMESTAMP WITH TIME ZONE NOT NULL,
  period_end TIMESTAMP WITH TIME ZONE NOT NULL,
  
  -- Métricas de volume
  messages_received INTEGER DEFAULT 0,
  messages_sent INTEGER DEFAULT 0,
  sessions_created INTEGER DEFAULT 0,
  sessions_completed INTEGER DEFAULT 0,
  
  -- Métricas de engajamento
  avg_session_duration_seconds INTEGER DEFAULT 0,
  human_transfers INTEGER DEFAULT 0,
  
  -- Métricas de fluxos
  flows_executed INTEGER DEFAULT 0,
  nodes_processed INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraint para evitar duplicatas
  UNIQUE(seller_id, period_start, period_end)
);

-- 2. TABELA DE LOGS DE AUDITORIA (isolada por revendedor)
CREATE TABLE IF NOT EXISTS public.bot_engine_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL,
  
  -- Detalhes do evento
  event_type TEXT NOT NULL, -- 'session_start', 'message_in', 'message_out', 'flow_change', 'error', etc.
  event_category TEXT NOT NULL DEFAULT 'general', -- 'session', 'message', 'flow', 'config', 'security'
  
  -- Contexto
  session_id UUID,
  flow_id UUID,
  node_id UUID,
  contact_phone TEXT,
  
  -- Dados do evento
  event_data JSONB DEFAULT '{}',
  
  -- Metadados
  ip_address INET,
  user_agent TEXT,
  
  -- Timestamp
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_bot_usage_seller_period ON public.bot_engine_usage_metrics(seller_id, period_start);
CREATE INDEX IF NOT EXISTS idx_bot_audit_seller ON public.bot_engine_audit_log(seller_id);
CREATE INDEX IF NOT EXISTS idx_bot_audit_created ON public.bot_engine_audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_bot_audit_type ON public.bot_engine_audit_log(seller_id, event_type);

-- =====================================================================
-- 3. RLS POLICIES - ISOLAMENTO TOTAL
-- =====================================================================

-- Habilitar RLS em todas as tabelas do BotEngine
ALTER TABLE public.bot_engine_usage_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_engine_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_engine_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_engine_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_engine_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_engine_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_engine_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_engine_message_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_engine_menus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_engine_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_logs ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- USAGE METRICS - Policies
-- =====================================================================
DROP POLICY IF EXISTS "Sellers view own usage metrics" ON public.bot_engine_usage_metrics;
CREATE POLICY "Sellers view own usage metrics" ON public.bot_engine_usage_metrics
  FOR SELECT USING (seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "System inserts usage metrics" ON public.bot_engine_usage_metrics;
CREATE POLICY "System inserts usage metrics" ON public.bot_engine_usage_metrics
  FOR INSERT WITH CHECK (seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "System updates usage metrics" ON public.bot_engine_usage_metrics;
CREATE POLICY "System updates usage metrics" ON public.bot_engine_usage_metrics
  FOR UPDATE USING (seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- =====================================================================
-- AUDIT LOG - Policies
-- =====================================================================
DROP POLICY IF EXISTS "Sellers view own audit logs" ON public.bot_engine_audit_log;
CREATE POLICY "Sellers view own audit logs" ON public.bot_engine_audit_log
  FOR SELECT USING (seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "System inserts audit logs" ON public.bot_engine_audit_log;
CREATE POLICY "System inserts audit logs" ON public.bot_engine_audit_log
  FOR INSERT WITH CHECK (seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- =====================================================================
-- CONFIG - Policies
-- =====================================================================
DROP POLICY IF EXISTS "Sellers manage own config" ON public.bot_engine_config;
CREATE POLICY "Sellers manage own config" ON public.bot_engine_config
  FOR ALL USING (seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- =====================================================================
-- FLOWS - Policies
-- =====================================================================
DROP POLICY IF EXISTS "Sellers manage own flows" ON public.bot_engine_flows;
CREATE POLICY "Sellers manage own flows" ON public.bot_engine_flows
  FOR ALL USING (seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- =====================================================================
-- NODES - Policies
-- =====================================================================
DROP POLICY IF EXISTS "Sellers manage own nodes" ON public.bot_engine_nodes;
CREATE POLICY "Sellers manage own nodes" ON public.bot_engine_nodes
  FOR ALL USING (seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- =====================================================================
-- EDGES - Policies
-- =====================================================================
DROP POLICY IF EXISTS "Sellers manage own edges" ON public.bot_engine_edges;
CREATE POLICY "Sellers manage own edges" ON public.bot_engine_edges
  FOR ALL USING (seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- =====================================================================
-- SESSIONS - Policies
-- =====================================================================
DROP POLICY IF EXISTS "Sellers manage own sessions" ON public.bot_engine_sessions;
CREATE POLICY "Sellers manage own sessions" ON public.bot_engine_sessions
  FOR ALL USING (seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- =====================================================================
-- MESSAGE LOG - Policies
-- =====================================================================
DROP POLICY IF EXISTS "Sellers view own message logs" ON public.bot_engine_message_log;
CREATE POLICY "Sellers view own message logs" ON public.bot_engine_message_log
  FOR ALL USING (seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- =====================================================================
-- MENUS - Policies
-- =====================================================================
DROP POLICY IF EXISTS "Sellers manage own menus" ON public.bot_engine_menus;
CREATE POLICY "Sellers manage own menus" ON public.bot_engine_menus
  FOR ALL USING (seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- =====================================================================
-- ACTIONS - Policies
-- =====================================================================
DROP POLICY IF EXISTS "Sellers manage own actions" ON public.bot_engine_actions;
CREATE POLICY "Sellers manage own actions" ON public.bot_engine_actions
  FOR ALL USING (seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- =====================================================================
-- BOT SESSIONS (legacy) - Policies
-- =====================================================================
DROP POLICY IF EXISTS "Sellers manage own bot sessions" ON public.bot_sessions;
CREATE POLICY "Sellers manage own bot sessions" ON public.bot_sessions
  FOR ALL USING (seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- =====================================================================
-- BOT LOGS (legacy) - Policies
-- =====================================================================
DROP POLICY IF EXISTS "Sellers manage own bot logs" ON public.bot_logs;
CREATE POLICY "Sellers manage own bot logs" ON public.bot_logs
  FOR ALL USING (seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- =====================================================================
-- 4. FUNÇÃO PARA INCREMENTAR MÉTRICAS DE USO
-- =====================================================================
CREATE OR REPLACE FUNCTION public.increment_bot_usage(
  p_seller_id UUID,
  p_metric TEXT,
  p_increment INTEGER DEFAULT 1
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_start TIMESTAMP WITH TIME ZONE;
  v_period_end TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Período mensal
  v_period_start := date_trunc('month', NOW());
  v_period_end := date_trunc('month', NOW()) + INTERVAL '1 month';
  
  -- Upsert métricas
  INSERT INTO bot_engine_usage_metrics (seller_id, period_start, period_end)
  VALUES (p_seller_id, v_period_start, v_period_end)
  ON CONFLICT (seller_id, period_start, period_end) DO NOTHING;
  
  -- Incrementar métrica específica
  EXECUTE format(
    'UPDATE bot_engine_usage_metrics SET %I = %I + $1, updated_at = NOW() 
     WHERE seller_id = $2 AND period_start = $3',
    p_metric, p_metric
  ) USING p_increment, p_seller_id, v_period_start;
END;
$$;

-- =====================================================================
-- 5. FUNÇÃO PARA REGISTRAR EVENTO DE AUDITORIA
-- =====================================================================
CREATE OR REPLACE FUNCTION public.log_bot_audit_event(
  p_seller_id UUID,
  p_event_type TEXT,
  p_event_category TEXT DEFAULT 'general',
  p_session_id UUID DEFAULT NULL,
  p_flow_id UUID DEFAULT NULL,
  p_node_id UUID DEFAULT NULL,
  p_contact_phone TEXT DEFAULT NULL,
  p_event_data JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO bot_engine_audit_log (
    seller_id, event_type, event_category,
    session_id, flow_id, node_id, contact_phone, event_data
  )
  VALUES (
    p_seller_id, p_event_type, p_event_category,
    p_session_id, p_flow_id, p_node_id, p_contact_phone, p_event_data
  )
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$;

-- =====================================================================
-- 6. FUNÇÃO PARA OBTER RESUMO DE USO (billing)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.get_bot_usage_summary(
  p_seller_id UUID,
  p_period_start TIMESTAMP WITH TIME ZONE DEFAULT date_trunc('month', NOW())
)
RETURNS TABLE (
  messages_received INTEGER,
  messages_sent INTEGER,
  sessions_created INTEGER,
  sessions_completed INTEGER,
  human_transfers INTEGER,
  flows_executed INTEGER,
  total_messages INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(m.messages_received, 0),
    COALESCE(m.messages_sent, 0),
    COALESCE(m.sessions_created, 0),
    COALESCE(m.sessions_completed, 0),
    COALESCE(m.human_transfers, 0),
    COALESCE(m.flows_executed, 0),
    COALESCE(m.messages_received, 0) + COALESCE(m.messages_sent, 0) as total_messages
  FROM bot_engine_usage_metrics m
  WHERE m.seller_id = p_seller_id
    AND m.period_start = p_period_start;
END;
$$;