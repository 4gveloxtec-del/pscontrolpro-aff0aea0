-- Índices otimizados para buscas de duplicidade de testes
-- Melhora performance em verificações frequentes antes de gerar testes

-- Índice composto para busca de duplicidade por telefone e seller
CREATE INDEX IF NOT EXISTS idx_test_generation_log_phone_seller 
ON public.test_generation_log(seller_id, sender_phone);

-- Índice composto para busca de clientes de teste por telefone
CREATE INDEX IF NOT EXISTS idx_clients_test_phone_seller 
ON public.clients(seller_id, phone) 
WHERE is_test = true;

-- Índice para busca de configuração ativa por API
CREATE INDEX IF NOT EXISTS idx_test_integration_config_active 
ON public.test_integration_config(seller_id, api_id) 
WHERE is_active = true;

-- Comentários explicativos
COMMENT ON INDEX idx_test_generation_log_phone_seller IS 'Otimiza verificação de duplicidade de testes por telefone';
COMMENT ON INDEX idx_clients_test_phone_seller IS 'Otimiza busca de clientes de teste por telefone';
COMMENT ON INDEX idx_test_integration_config_active IS 'Otimiza busca de configuração ativa por API';