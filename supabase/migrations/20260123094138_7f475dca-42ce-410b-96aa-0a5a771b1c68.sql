-- Tabela para configuração de integração de testes por revendedor
CREATE TABLE IF NOT EXISTS public.test_integration_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  api_id UUID REFERENCES public.test_apis(id) ON DELETE SET NULL,
  
  -- Configuração do servidor destino
  server_id UUID REFERENCES public.servers(id) ON DELETE SET NULL,
  server_name TEXT,
  
  -- Mapeamento de campos da API para o cliente
  map_login_path TEXT DEFAULT 'username', -- JSONPath para extrair login
  map_password_path TEXT DEFAULT 'password', -- JSONPath para extrair senha
  map_dns_path TEXT DEFAULT 'dns', -- JSONPath para extrair DNS
  map_expiration_path TEXT DEFAULT 'expiresAtFormatted', -- JSONPath para extrair vencimento
  
  -- Categoria do cliente
  category TEXT DEFAULT 'IPTV',
  
  -- Prefixo para nome do cliente teste
  client_name_prefix TEXT DEFAULT 'Teste',
  
  -- Contador de testes criados
  test_counter INTEGER DEFAULT 0,
  
  -- Se deve criar cliente automaticamente
  auto_create_client BOOLEAN DEFAULT true,
  
  -- Se deve enviar mensagem de boas-vindas
  send_welcome_message BOOLEAN DEFAULT false,
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  CONSTRAINT unique_seller_api UNIQUE(seller_id, api_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_test_integration_seller ON public.test_integration_config(seller_id);
CREATE INDEX IF NOT EXISTS idx_test_integration_api ON public.test_integration_config(api_id);

-- RLS
ALTER TABLE public.test_integration_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sellers can view own config"
  ON public.test_integration_config FOR SELECT
  USING (auth.uid() = seller_id);

CREATE POLICY "Sellers can insert own config"
  ON public.test_integration_config FOR INSERT
  WITH CHECK (auth.uid() = seller_id);

CREATE POLICY "Sellers can update own config"
  ON public.test_integration_config FOR UPDATE
  USING (auth.uid() = seller_id);

CREATE POLICY "Sellers can delete own config"
  ON public.test_integration_config FOR DELETE
  USING (auth.uid() = seller_id);

-- Tabela para log de testes gerados (para não duplicar clientes)
CREATE TABLE IF NOT EXISTS public.test_generation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  api_id UUID REFERENCES public.test_apis(id) ON DELETE SET NULL,
  sender_phone TEXT NOT NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  
  -- Dados do teste retornados pela API
  api_response JSONB,
  username TEXT,
  password TEXT,
  dns TEXT,
  expiration_date DATE,
  
  -- Status
  client_created BOOLEAN DEFAULT false,
  error_message TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_test_log_seller ON public.test_generation_log(seller_id);
CREATE INDEX IF NOT EXISTS idx_test_log_phone ON public.test_generation_log(sender_phone);
CREATE INDEX IF NOT EXISTS idx_test_log_created ON public.test_generation_log(created_at DESC);

-- RLS
ALTER TABLE public.test_generation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sellers can view own logs"
  ON public.test_generation_log FOR SELECT
  USING (auth.uid() = seller_id);

CREATE POLICY "Service role can insert"
  ON public.test_generation_log FOR INSERT
  WITH CHECK (true);

-- Trigger para updated_at
CREATE TRIGGER update_test_integration_config_updated_at
  BEFORE UPDATE ON public.test_integration_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();