-- Adicionar campo para template de resposta customizada na API
ALTER TABLE public.test_apis
ADD COLUMN IF NOT EXISTS custom_response_template TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS use_custom_response BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS last_test_response JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS last_test_at TIMESTAMPTZ DEFAULT NULL;

-- Comentários explicativos
COMMENT ON COLUMN public.test_apis.custom_response_template IS 'Template customizado da mensagem enviada ao cliente. Usa variáveis como {usuario}, {senha}, {vencimento}, {dns}';
COMMENT ON COLUMN public.test_apis.use_custom_response IS 'Se true, usa o custom_response_template ao invés da resposta bruta da API';
COMMENT ON COLUMN public.test_apis.last_test_response IS 'Última resposta recebida ao testar a API (para preview)';
COMMENT ON COLUMN public.test_apis.last_test_at IS 'Data/hora do último teste da API';