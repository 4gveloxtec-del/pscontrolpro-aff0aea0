-- ============================================================
-- Módulo de Comandos de Teste por Revendedor
-- ============================================================

-- Tabela para APIs de teste cadastradas por Revendedor
CREATE TABLE public.test_apis (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  api_url TEXT NOT NULL,
  api_method TEXT NOT NULL DEFAULT 'GET',
  api_headers JSONB DEFAULT '{}'::jsonb,
  api_body_template JSONB DEFAULT NULL,
  response_path TEXT DEFAULT NULL, -- JSONPath para extrair resposta (ex: "data.login")
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(owner_id, name)
);

-- Tabela para comandos WhatsApp personalizados
CREATE TABLE public.whatsapp_commands (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  api_id UUID NOT NULL REFERENCES public.test_apis(id) ON DELETE CASCADE,
  command TEXT NOT NULL, -- ex: "/teste", "/gerar", "/starplay"
  description TEXT,
  response_template TEXT NOT NULL DEFAULT 'Resultado: {response}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(owner_id, command)
);

-- Tabela de logs de execução de comandos
CREATE TABLE public.command_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  command_id UUID REFERENCES public.whatsapp_commands(id) ON DELETE SET NULL,
  command_text TEXT NOT NULL,
  sender_phone TEXT NOT NULL,
  api_request JSONB,
  api_response JSONB,
  response_sent TEXT,
  success BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  execution_time_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_test_apis_owner ON public.test_apis(owner_id);
CREATE INDEX idx_whatsapp_commands_owner ON public.whatsapp_commands(owner_id);
CREATE INDEX idx_whatsapp_commands_command ON public.whatsapp_commands(owner_id, command);
CREATE INDEX idx_command_logs_owner ON public.command_logs(owner_id);
CREATE INDEX idx_command_logs_created ON public.command_logs(created_at DESC);

-- RLS para test_apis
ALTER TABLE public.test_apis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sellers can view their own test APIs"
  ON public.test_apis FOR SELECT
  USING (auth.uid() = owner_id);

CREATE POLICY "Sellers can create their own test APIs"
  ON public.test_apis FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Sellers can update their own test APIs"
  ON public.test_apis FOR UPDATE
  USING (auth.uid() = owner_id);

CREATE POLICY "Sellers can delete their own test APIs"
  ON public.test_apis FOR DELETE
  USING (auth.uid() = owner_id);

-- RLS para whatsapp_commands
ALTER TABLE public.whatsapp_commands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sellers can view their own commands"
  ON public.whatsapp_commands FOR SELECT
  USING (auth.uid() = owner_id);

CREATE POLICY "Sellers can create their own commands"
  ON public.whatsapp_commands FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Sellers can update their own commands"
  ON public.whatsapp_commands FOR UPDATE
  USING (auth.uid() = owner_id);

CREATE POLICY "Sellers can delete their own commands"
  ON public.whatsapp_commands FOR DELETE
  USING (auth.uid() = owner_id);

-- RLS para command_logs
ALTER TABLE public.command_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sellers can view their own command logs"
  ON public.command_logs FOR SELECT
  USING (auth.uid() = owner_id);

CREATE POLICY "Service role can insert command logs"
  ON public.command_logs FOR INSERT
  WITH CHECK (auth.role() = 'service_role' OR auth.uid() = owner_id);

-- Trigger para updated_at
CREATE TRIGGER update_test_apis_updated_at
  BEFORE UPDATE ON public.test_apis
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_whatsapp_commands_updated_at
  BEFORE UPDATE ON public.whatsapp_commands
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();