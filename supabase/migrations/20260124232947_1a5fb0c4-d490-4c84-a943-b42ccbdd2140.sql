-- =====================================================
-- MIGRATION: Circuit Breaker para Evolution API
-- 
-- Cria tabela para rastrear estado do circuit e fila de mensagens
-- quando a API está indisponível.
-- =====================================================

-- Tabela de estado do Circuit Breaker por seller
CREATE TABLE IF NOT EXISTS public.evolution_circuit_breaker (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Estado do circuit: closed (normal), open (bloqueado), half_open (testando)
  state TEXT NOT NULL DEFAULT 'closed' CHECK (state IN ('closed', 'open', 'half_open')),
  
  -- Contadores de falhas
  failure_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  
  -- Thresholds
  failure_threshold INTEGER NOT NULL DEFAULT 5,  -- Falhas para abrir
  success_threshold INTEGER NOT NULL DEFAULT 3,  -- Sucessos para fechar
  
  -- Timing
  last_failure_at TIMESTAMP WITH TIME ZONE,
  last_success_at TIMESTAMP WITH TIME ZONE,
  opened_at TIMESTAMP WITH TIME ZONE,  -- Quando abriu
  reset_timeout_ms INTEGER NOT NULL DEFAULT 30000,  -- 30s para tentar half_open
  
  -- Metadata
  last_error TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Um circuit por seller
  CONSTRAINT evolution_circuit_breaker_seller_unique UNIQUE (seller_id)
);

-- Fila de mensagens para quando o circuit está aberto
CREATE TABLE IF NOT EXISTS public.evolution_message_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Dados da mensagem
  phone TEXT NOT NULL,
  message TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'manual',  -- manual, expiration, renewal, etc
  
  -- Referência opcional ao cliente
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  
  -- Configuração da API (para quando tentar reenviar)
  config JSONB NOT NULL,  -- { api_url, instance_name }
  
  -- Status da fila
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'sent', 'failed', 'expired')),
  priority INTEGER NOT NULL DEFAULT 0,  -- Maior = mais urgente
  
  -- Retry tracking
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  next_retry_at TIMESTAMP WITH TIME ZONE,
  
  -- Resultado
  error_message TEXT,
  sent_at TIMESTAMP WITH TIME ZONE,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + INTERVAL '24 hours')
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_evolution_circuit_seller ON public.evolution_circuit_breaker(seller_id);
CREATE INDEX IF NOT EXISTS idx_evolution_queue_seller_status ON public.evolution_message_queue(seller_id, status);
CREATE INDEX IF NOT EXISTS idx_evolution_queue_retry ON public.evolution_message_queue(status, next_retry_at) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_evolution_queue_expires ON public.evolution_message_queue(expires_at) WHERE status = 'queued';

-- Enable RLS
ALTER TABLE public.evolution_circuit_breaker ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evolution_message_queue ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Sellers só veem seus próprios dados
CREATE POLICY "Users can view own circuit breaker" ON public.evolution_circuit_breaker
  FOR SELECT USING (auth.uid() = seller_id);

CREATE POLICY "Users can update own circuit breaker" ON public.evolution_circuit_breaker
  FOR UPDATE USING (auth.uid() = seller_id);

CREATE POLICY "Users can insert own circuit breaker" ON public.evolution_circuit_breaker
  FOR INSERT WITH CHECK (auth.uid() = seller_id);

CREATE POLICY "Users can view own message queue" ON public.evolution_message_queue
  FOR SELECT USING (auth.uid() = seller_id);

CREATE POLICY "Users can insert own message queue" ON public.evolution_message_queue
  FOR INSERT WITH CHECK (auth.uid() = seller_id);

CREATE POLICY "Users can update own message queue" ON public.evolution_message_queue
  FOR UPDATE USING (auth.uid() = seller_id);

CREATE POLICY "Users can delete own message queue" ON public.evolution_message_queue
  FOR DELETE USING (auth.uid() = seller_id);

-- Function para atualizar updated_at
CREATE OR REPLACE FUNCTION public.update_evolution_circuit_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_evolution_circuit_breaker_timestamp
  BEFORE UPDATE ON public.evolution_circuit_breaker
  FOR EACH ROW EXECUTE FUNCTION public.update_evolution_circuit_timestamp();

CREATE TRIGGER update_evolution_message_queue_timestamp
  BEFORE UPDATE ON public.evolution_message_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_evolution_circuit_timestamp();

-- Function para limpar mensagens expiradas (chamada por cron)
CREATE OR REPLACE FUNCTION public.cleanup_expired_evolution_queue()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  UPDATE public.evolution_message_queue
  SET status = 'expired', updated_at = now()
  WHERE status = 'queued' AND expires_at < now();
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;