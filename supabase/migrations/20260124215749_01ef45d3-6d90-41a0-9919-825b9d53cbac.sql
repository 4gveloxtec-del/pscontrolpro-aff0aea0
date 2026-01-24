-- Criar índices de performance (tabelas confirmadas)

-- Índice composto para filtrar clientes por vendedor e status de arquivamento
CREATE INDEX IF NOT EXISTS idx_clients_seller_archived ON public.clients(seller_id, is_archived);

-- Índice para consultas de vencimento (usado em notificações e relatórios)
CREATE INDEX IF NOT EXISTS idx_clients_expiration ON public.clients(expiration_date);

-- Índice para apps externos por vendedor
CREATE INDEX IF NOT EXISTS idx_external_apps_seller ON public.client_external_apps(seller_id);

-- Índices adicionais para queries frequentes
CREATE INDEX IF NOT EXISTS idx_clients_seller_expiration ON public.clients(seller_id, expiration_date);
CREATE INDEX IF NOT EXISTS idx_clients_is_paid ON public.clients(seller_id, is_paid);