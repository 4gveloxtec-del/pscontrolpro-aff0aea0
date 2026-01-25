-- Adicionar campos de integração na tabela clients
ALTER TABLE public.clients 
ADD COLUMN IF NOT EXISTS is_integrated boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS integration_origin text DEFAULT NULL;

-- Criar índice para buscas por integração
CREATE INDEX IF NOT EXISTS idx_clients_is_integrated ON public.clients(is_integrated) WHERE is_integrated = true;

-- Comentários para documentação
COMMENT ON COLUMN public.clients.is_integrated IS 'Indica se o cliente foi criado via API e participa da sincronização automática';
COMMENT ON COLUMN public.clients.integration_origin IS 'Origem da integração: api, webhook, manual';

-- Atualizar clientes existentes criados via API (renewed_via_api = true indica origem API)
UPDATE public.clients 
SET is_integrated = true, integration_origin = 'api'
WHERE renewed_via_api = true;