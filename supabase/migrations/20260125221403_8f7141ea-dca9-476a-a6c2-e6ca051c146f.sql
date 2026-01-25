-- Adicionar colunas para endpoints POST/GET na test_integration_config
ALTER TABLE public.test_integration_config 
ADD COLUMN IF NOT EXISTS post_endpoint TEXT,
ADD COLUMN IF NOT EXISTS get_endpoint TEXT,
ADD COLUMN IF NOT EXISTS api_key TEXT;

-- Comentários para documentação
COMMENT ON COLUMN public.test_integration_config.post_endpoint IS 'URL para criar testes via POST';
COMMENT ON COLUMN public.test_integration_config.get_endpoint IS 'URL para listar testes via GET';
COMMENT ON COLUMN public.test_integration_config.api_key IS 'Chave de autenticação para a API';