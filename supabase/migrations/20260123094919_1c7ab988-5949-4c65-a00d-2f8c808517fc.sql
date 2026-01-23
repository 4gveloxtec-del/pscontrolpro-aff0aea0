-- Adicionar campo para marcar renovação via API (não duplicar notificação)
ALTER TABLE public.clients 
ADD COLUMN IF NOT EXISTS renewed_via_api BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS api_server_id TEXT; -- ID do cliente no servidor externo (para sincronizar exclusão)

-- Adicionar campos na config de integração para webhook de sincronização
ALTER TABLE public.test_integration_config
ADD COLUMN IF NOT EXISTS sync_webhook_url TEXT, -- URL para receber webhooks do servidor
ADD COLUMN IF NOT EXISTS sync_webhook_secret TEXT, -- Segredo para validar webhooks
ADD COLUMN IF NOT EXISTS detect_renewal_keywords TEXT[] DEFAULT ARRAY['renovado', 'renovação', 'renovacao', 'renewed', 'prorrogado', 'estendido'], -- Palavras-chave que indicam renovação na mensagem
ADD COLUMN IF NOT EXISTS detect_renewal_enabled BOOLEAN DEFAULT true, -- Se deve detectar renovação automática
ADD COLUMN IF NOT EXISTS sync_deletion_enabled BOOLEAN DEFAULT true; -- Se deve sincronizar exclusão

-- Criar tabela para log de sincronização
CREATE TABLE IF NOT EXISTS public.server_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  client_phone TEXT,
  sync_type TEXT NOT NULL, -- 'renewal', 'deletion', 'creation'
  source TEXT NOT NULL, -- 'webhook', 'message_detection', 'manual'
  server_response JSONB,
  success BOOLEAN DEFAULT true,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index para buscar por telefone rapidamente
CREATE INDEX IF NOT EXISTS idx_server_sync_log_phone ON public.server_sync_log(client_phone);
CREATE INDEX IF NOT EXISTS idx_server_sync_log_seller ON public.server_sync_log(seller_id);

-- RLS para server_sync_log
ALTER TABLE public.server_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sellers can view their own sync logs"
ON public.server_sync_log FOR SELECT
USING (auth.uid() = seller_id);

CREATE POLICY "Service role can insert sync logs"
ON public.server_sync_log FOR INSERT
WITH CHECK (true);

-- Comentários
COMMENT ON COLUMN public.clients.renewed_via_api IS 'Marca se a última renovação foi feita automaticamente via API do servidor';
COMMENT ON COLUMN public.clients.api_server_id IS 'ID do cliente no servidor externo para sincronização';
COMMENT ON COLUMN public.test_integration_config.detect_renewal_keywords IS 'Palavras-chave para detectar mensagem de renovação automática';
COMMENT ON COLUMN public.test_integration_config.detect_renewal_enabled IS 'Se deve detectar e sincronizar renovações automáticas via mensagem';