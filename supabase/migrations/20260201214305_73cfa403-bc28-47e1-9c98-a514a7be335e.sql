-- ETAPA 1 (Parte 3): Corrigir políticas restantes (com verificações)
-- ================================================================

-- 1. system_health_logs - Política já existe, apenas remover a permissiva
DROP POLICY IF EXISTS "Service role can insert health logs" ON public.system_health_logs;

-- 2. operational_alerts - Remover INSERT permissivo
DROP POLICY IF EXISTS "Service role can insert alerts" ON public.operational_alerts;

-- 3. test_generation_log - Substituir política permissiva
DROP POLICY IF EXISTS "Service role can insert" ON public.test_generation_log;
DROP POLICY IF EXISTS "Sellers can insert their test logs" ON public.test_generation_log;

CREATE POLICY "Sellers can insert their test logs"
  ON public.test_generation_log FOR INSERT
  WITH CHECK (auth.uid() = seller_id);

-- 4. server_sync_log - Substituir política permissiva
DROP POLICY IF EXISTS "Service role can insert sync logs" ON public.server_sync_log;
DROP POLICY IF EXISTS "Sellers can insert their sync logs" ON public.server_sync_log;

CREATE POLICY "Sellers can insert their sync logs"
  ON public.server_sync_log FOR INSERT
  WITH CHECK (auth.uid() = seller_id);

-- 5. push_subscriptions - Garantir políticas granulares
DROP POLICY IF EXISTS "Users can manage their own push subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Users can view their own push subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Users can insert their own push subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Users can update their own push subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Users can delete their own push subscriptions" ON public.push_subscriptions;

CREATE POLICY "Users can view their own push subscriptions"
  ON public.push_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own push subscriptions"
  ON public.push_subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own push subscriptions"
  ON public.push_subscriptions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own push subscriptions"
  ON public.push_subscriptions FOR DELETE
  USING (auth.uid() = user_id);