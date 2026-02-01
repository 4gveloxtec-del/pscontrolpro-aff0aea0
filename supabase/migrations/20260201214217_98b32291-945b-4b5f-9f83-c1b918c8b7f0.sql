-- ETAPA 1 (Parte 2): Corrigir políticas RLS problemáticas restantes
-- ================================================================

-- 1. connection_alerts - Muito permissivo
DROP POLICY IF EXISTS "System can manage alerts" ON public.connection_alerts;

-- Sellers podem ver seus próprios alertas, admin pode ver todos
CREATE POLICY "Sellers can view their connection alerts"
  ON public.connection_alerts FOR SELECT
  USING (seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Sellers can manage their connection alerts"
  ON public.connection_alerts FOR ALL
  USING (seller_id = auth.uid())
  WITH CHECK (seller_id = auth.uid());

-- 2. system_health_status - Restringir ao admin
DROP POLICY IF EXISTS "Service role can manage health status" ON public.system_health_status;

CREATE POLICY "Admins can view system health"
  ON public.system_health_status FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- 3. system_repair_actions - Restringir ao admin
DROP POLICY IF EXISTS "Service role can manage repair actions" ON public.system_repair_actions;

CREATE POLICY "Admins can view repair actions"
  ON public.system_repair_actions FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- 4. shared_servers - Manter SELECT público mas restringir INSERT/UPDATE/DELETE
DROP POLICY IF EXISTS "Anyone can insert shared servers" ON public.shared_servers;
DROP POLICY IF EXISTS "Anyone can update shared servers" ON public.shared_servers;
DROP POLICY IF EXISTS "Anyone can delete shared servers" ON public.shared_servers;

-- Apenas admin pode gerenciar servidores compartilhados
CREATE POLICY "Admins can manage shared servers"
  ON public.shared_servers FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));