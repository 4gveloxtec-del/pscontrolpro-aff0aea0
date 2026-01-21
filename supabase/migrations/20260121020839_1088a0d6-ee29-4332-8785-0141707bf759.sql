-- =============================================
-- Corrigir políticas RLS com USING(true) / WITH CHECK(true)
-- Restringir operações de sistema ao service_role apenas
-- =============================================

-- 1. chatbot_send_logs: restringir INSERT ao service_role
DROP POLICY IF EXISTS "Service can insert logs" ON public.chatbot_send_logs;
DROP POLICY IF EXISTS "Service role can insert logs" ON public.chatbot_send_logs;
CREATE POLICY "Service role can insert logs"
  ON public.chatbot_send_logs
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- 2. system_health_logs: restringir INSERT ao service_role
DROP POLICY IF EXISTS "Service role can insert health logs" ON public.system_health_logs;
CREATE POLICY "Service role can insert health logs"
  ON public.system_health_logs
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- 3. system_health_status: restringir ALL ao service_role
DROP POLICY IF EXISTS "Service role can manage health status" ON public.system_health_status;
CREATE POLICY "Service role can manage health status"
  ON public.system_health_status
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 4. system_repair_actions: restringir ALL ao service_role
DROP POLICY IF EXISTS "Service role can manage repair actions" ON public.system_repair_actions;
CREATE POLICY "Service role can manage repair actions"
  ON public.system_repair_actions
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 5. connection_alerts: restringir ALL ao service_role (era "System can manage alerts")
DROP POLICY IF EXISTS "System can manage alerts" ON public.connection_alerts;
DROP POLICY IF EXISTS "Service role can manage alerts" ON public.connection_alerts;
CREATE POLICY "Service role can manage alerts"
  ON public.connection_alerts
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 6. connection_logs: garantir que INSERT só seja feito pelo service_role
DROP POLICY IF EXISTS "Service role can insert logs" ON public.connection_logs;
DROP POLICY IF EXISTS "Service role can insert connection logs" ON public.connection_logs;
CREATE POLICY "Service role can insert connection logs"
  ON public.connection_logs
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');