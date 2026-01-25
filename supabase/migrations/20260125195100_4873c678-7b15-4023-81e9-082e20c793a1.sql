-- =====================================================================
-- BOT ENGINE - TABELAS ADICIONAIS (ISOLADAS)
-- Novas tabelas para gerenciamento simplificado de estado e logs
-- =====================================================================

-- Tabela: bot_sessions (gerenciamento de estado do usuário)
CREATE TABLE public.bot_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  seller_id UUID NOT NULL,
  state TEXT NOT NULL DEFAULT 'idle',
  stack JSONB NOT NULL DEFAULT '[]'::jsonb,
  locked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices para bot_sessions
CREATE INDEX idx_bot_sessions_user_id ON public.bot_sessions(user_id);
CREATE INDEX idx_bot_sessions_seller_id ON public.bot_sessions(seller_id);
CREATE UNIQUE INDEX idx_bot_sessions_user_seller ON public.bot_sessions(user_id, seller_id);

-- RLS para bot_sessions
ALTER TABLE public.bot_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sellers can manage their bot_sessions"
  ON public.bot_sessions
  FOR ALL
  USING (seller_id = auth.uid())
  WITH CHECK (seller_id = auth.uid());

-- Trigger para updated_at em bot_sessions
CREATE TRIGGER update_bot_sessions_updated_at
  BEFORE UPDATE ON public.bot_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================================

-- Tabela: bot_logs (histórico de mensagens)
CREATE TABLE public.bot_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  seller_id UUID NOT NULL,
  message TEXT NOT NULL,
  from_user BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices para bot_logs
CREATE INDEX idx_bot_logs_user_id ON public.bot_logs(user_id);
CREATE INDEX idx_bot_logs_seller_id ON public.bot_logs(seller_id);
CREATE INDEX idx_bot_logs_created_at ON public.bot_logs(created_at DESC);

-- RLS para bot_logs
ALTER TABLE public.bot_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sellers can manage their bot_logs"
  ON public.bot_logs
  FOR ALL
  USING (seller_id = auth.uid())
  WITH CHECK (seller_id = auth.uid());