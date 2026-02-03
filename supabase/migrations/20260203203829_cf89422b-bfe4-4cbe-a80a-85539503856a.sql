-- Índices para otimização da listagem de clientes
-- Usar IF NOT EXISTS para evitar erros se já existirem

-- 1. Índice para ordenação por data de criação
CREATE INDEX IF NOT EXISTS idx_clients_created_at ON public.clients(created_at DESC);

-- 2. Índice para busca por nome
CREATE INDEX IF NOT EXISTS idx_clients_name ON public.clients(name);

-- 3. Índice composto para colunas de busca normalizadas
CREATE INDEX IF NOT EXISTS idx_clients_search ON public.clients(login_search, login2_search, phone_search);

-- 4. Índice para ordenação por expiração
CREATE INDEX IF NOT EXISTS idx_clients_expiration ON public.clients(expiration_datetime);