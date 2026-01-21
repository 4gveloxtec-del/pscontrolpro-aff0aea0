-- =====================================================
-- SECURITY FIX: Políticas RLS para tabelas expostas
-- =====================================================

-- 1. admin_chatbot_contacts - Expondo telefones e nomes de clientes
-- Remover política permissiva e criar política restritiva
DROP POLICY IF EXISTS "Service role full access on admin_chatbot_contacts" ON public.admin_chatbot_contacts;

CREATE POLICY "Admins can view chatbot contacts"
ON public.admin_chatbot_contacts
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage chatbot contacts"
ON public.admin_chatbot_contacts
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 2. admin_chatbot_interactions - Expondo conversas privadas
DROP POLICY IF EXISTS "Service role full access on admin_chatbot_interactions" ON public.admin_chatbot_interactions;

CREATE POLICY "Admins can view chatbot interactions"
ON public.admin_chatbot_interactions
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage chatbot interactions"
ON public.admin_chatbot_interactions
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 3. admin_chatbot_config - Remover acesso público de leitura
DROP POLICY IF EXISTS "Anyone can view chatbot config" ON public.admin_chatbot_config;

CREATE POLICY "Only authenticated can view chatbot config"
ON public.admin_chatbot_config
FOR SELECT
TO authenticated
USING (true);

-- 4. system_repair_actions - Expondo configuração de infraestrutura
DROP POLICY IF EXISTS "Public read access" ON public.system_repair_actions;
DROP POLICY IF EXISTS "Anyone can view repair actions" ON public.system_repair_actions;

CREATE POLICY "Only admins can view repair actions"
ON public.system_repair_actions
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can manage repair actions"
ON public.system_repair_actions
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 5. system_health_status - Expondo status de vulnerabilidades
DROP POLICY IF EXISTS "Public read access" ON public.system_health_status;
DROP POLICY IF EXISTS "Anyone can view health status" ON public.system_health_status;

CREATE POLICY "Only admins can view health status"
ON public.system_health_status
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can manage health status"
ON public.system_health_status
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 6. system_health_config - Configuração sensível do sistema
DROP POLICY IF EXISTS "Public read access" ON public.system_health_config;
DROP POLICY IF EXISTS "Anyone can view health config" ON public.system_health_config;

CREATE POLICY "Only admins can view health config"
ON public.system_health_config
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can manage health config"
ON public.system_health_config
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 7. system_health_logs - Logs sensíveis do sistema
DROP POLICY IF EXISTS "Public read access" ON public.system_health_logs;
DROP POLICY IF EXISTS "Anyone can view health logs" ON public.system_health_logs;

CREATE POLICY "Only admins can view health logs"
ON public.system_health_logs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can manage health logs"
ON public.system_health_logs
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));