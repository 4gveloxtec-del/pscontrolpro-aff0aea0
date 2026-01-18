-- Tabela de configuração do sistema de autocura
CREATE TABLE public.system_health_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  is_enabled BOOLEAN DEFAULT true,
  check_interval_seconds INTEGER DEFAULT 300,
  auto_repair_enabled BOOLEAN DEFAULT true,
  max_repair_attempts INTEGER DEFAULT 3,
  notify_admin_on_critical BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Tabela de status atual de cada componente
CREATE TABLE public.system_health_status (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  component_name TEXT NOT NULL UNIQUE,
  component_type TEXT NOT NULL CHECK (component_type IN ('database', 'api', 'service', 'integration', 'edge_function')),
  status TEXT NOT NULL DEFAULT 'healthy' CHECK (status IN ('healthy', 'warning', 'critical', 'recovering', 'unknown')),
  last_check_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  last_error TEXT,
  consecutive_failures INTEGER DEFAULT 0,
  repair_attempts INTEGER DEFAULT 0,
  last_repair_at TIMESTAMP WITH TIME ZONE,
  last_repair_success BOOLEAN,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Tabela de logs de autocura
CREATE TABLE public.system_health_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  component_name TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('check', 'error_detected', 'repair_attempted', 'repair_success', 'repair_failed', 'fallback_activated', 'status_change', 'admin_action')),
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'low', 'medium', 'high', 'critical')),
  message TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  repair_action TEXT,
  was_auto_repaired BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Tabela de ações de reparo disponíveis
CREATE TABLE public.system_repair_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  component_name TEXT NOT NULL,
  action_name TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('restart', 'reconnect', 'clear_cache', 'reset_config', 'retry_operation', 'fallback')),
  action_config JSONB DEFAULT '{}',
  is_safe BOOLEAN DEFAULT true,
  requires_confirmation BOOLEAN DEFAULT false,
  max_daily_executions INTEGER DEFAULT 10,
  executions_today INTEGER DEFAULT 0,
  last_execution_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(component_name, action_name)
);

-- Inserir configuração padrão
INSERT INTO public.system_health_config (is_enabled, check_interval_seconds, auto_repair_enabled)
VALUES (true, 300, true);

-- Inserir componentes para monitoramento
INSERT INTO public.system_health_status (component_name, component_type, status) VALUES
  ('database_connection', 'database', 'healthy'),
  ('whatsapp_api', 'api', 'healthy'),
  ('evolution_api', 'integration', 'healthy'),
  ('chatbot_webhook', 'edge_function', 'healthy'),
  ('message_queue', 'service', 'healthy'),
  ('seller_instances', 'service', 'healthy'),
  ('authentication', 'service', 'healthy'),
  ('backup_service', 'service', 'healthy');

-- Inserir ações de reparo padrão
INSERT INTO public.system_repair_actions (component_name, action_name, action_type, is_safe) VALUES
  ('whatsapp_api', 'reconnect_instance', 'reconnect', true),
  ('whatsapp_api', 'restart_webhook', 'restart', true),
  ('evolution_api', 'refresh_connection', 'reconnect', true),
  ('message_queue', 'clear_stuck_messages', 'clear_cache', true),
  ('message_queue', 'retry_failed_messages', 'retry_operation', true),
  ('chatbot_webhook', 'reset_sessions', 'clear_cache', true),
  ('seller_instances', 'reconnect_disconnected', 'reconnect', true),
  ('database_connection', 'reconnect_pool', 'reconnect', true);

-- Enable RLS
ALTER TABLE public.system_health_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_health_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_health_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_repair_actions ENABLE ROW LEVEL SECURITY;

-- Policies - apenas admin pode ver/editar
CREATE POLICY "Admins can manage health config" ON public.system_health_config
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can view health status" ON public.system_health_status
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can view health logs" ON public.system_health_logs
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage repair actions" ON public.system_repair_actions
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Service role policies for edge functions
CREATE POLICY "Service role can manage health status" ON public.system_health_status
  FOR ALL USING (true);

CREATE POLICY "Service role can insert health logs" ON public.system_health_logs
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Service role can manage repair actions" ON public.system_repair_actions
  FOR ALL USING (true);

-- Índices para performance
CREATE INDEX idx_health_logs_created_at ON public.system_health_logs(created_at DESC);
CREATE INDEX idx_health_logs_component ON public.system_health_logs(component_name);
CREATE INDEX idx_health_logs_severity ON public.system_health_logs(severity);
CREATE INDEX idx_health_status_component ON public.system_health_status(component_name);

-- Trigger para updated_at
CREATE TRIGGER update_health_config_updated_at
  BEFORE UPDATE ON public.system_health_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_health_status_updated_at
  BEFORE UPDATE ON public.system_health_status
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_repair_actions_updated_at
  BEFORE UPDATE ON public.system_repair_actions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();