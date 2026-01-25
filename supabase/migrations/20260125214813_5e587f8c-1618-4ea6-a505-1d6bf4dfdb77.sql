-- Adicionar coluna test_name na tabela test_generation_log
-- para armazenar o nome sequencial do teste (ex: Teste1, Teste2)
ALTER TABLE public.test_generation_log 
ADD COLUMN IF NOT EXISTS test_name TEXT;

-- Adicionar coluna server_id para rastrear qual servidor gerou o teste
ALTER TABLE public.test_generation_log 
ADD COLUMN IF NOT EXISTS server_id UUID REFERENCES public.servers(id) ON DELETE SET NULL;

-- Criar índice para busca por nome do teste
CREATE INDEX IF NOT EXISTS idx_test_generation_log_test_name 
ON public.test_generation_log(seller_id, test_name);

-- Criar índice para busca por servidor
CREATE INDEX IF NOT EXISTS idx_test_generation_log_server 
ON public.test_generation_log(seller_id, server_id);

-- Comentário explicativo
COMMENT ON COLUMN public.test_generation_log.test_name IS 'Nome sequencial do teste (ex: Teste1, Teste2) gerado com base no contador do servidor';
COMMENT ON COLUMN public.test_generation_log.server_id IS 'ID do servidor IPTV onde o teste foi gerado';