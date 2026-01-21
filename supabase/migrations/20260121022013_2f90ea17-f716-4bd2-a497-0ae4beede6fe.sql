-- =============================================
-- Corrigir políticas RLS para permitir service_role gerenciar contatos
-- do chatbot do revendedor (necessário para o webhook funcionar)
-- =============================================

-- 1. seller_chatbot_contacts: permitir service_role gerenciar contatos
DROP POLICY IF EXISTS "Service role can manage seller contacts" ON public.seller_chatbot_contacts;
CREATE POLICY "Service role can manage seller contacts"
  ON public.seller_chatbot_contacts
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 2. seller_chatbot_settings: permitir service_role ler configurações
DROP POLICY IF EXISTS "Service role can read seller settings" ON public.seller_chatbot_settings;
CREATE POLICY "Service role can read seller settings"
  ON public.seller_chatbot_settings
  FOR SELECT
  USING (auth.role() = 'service_role');

-- 3. seller_chatbot_menu: permitir service_role ler menus
DROP POLICY IF EXISTS "Service role can read seller menus" ON public.seller_chatbot_menu;
CREATE POLICY "Service role can read seller menus"
  ON public.seller_chatbot_menu
  FOR SELECT
  USING (auth.role() = 'service_role');

-- 4. seller_chatbot_variables: permitir service_role ler variáveis
DROP POLICY IF EXISTS "Service role can read seller variables" ON public.seller_chatbot_variables;
CREATE POLICY "Service role can read seller variables"
  ON public.seller_chatbot_variables
  FOR SELECT
  USING (auth.role() = 'service_role');

-- 5. seller_chatbot_keywords: permitir service_role ler keywords
DROP POLICY IF EXISTS "Service role can read seller keywords" ON public.seller_chatbot_keywords;
CREATE POLICY "Service role can read seller keywords"
  ON public.seller_chatbot_keywords
  FOR SELECT
  USING (auth.role() = 'service_role');

-- 6. Adicionar campo menu_enabled se não existir (para consistência)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'seller_chatbot_settings' 
    AND column_name = 'menu_enabled'
  ) THEN
    ALTER TABLE public.seller_chatbot_settings 
    ADD COLUMN menu_enabled BOOLEAN DEFAULT true;
  END IF;
END $$;