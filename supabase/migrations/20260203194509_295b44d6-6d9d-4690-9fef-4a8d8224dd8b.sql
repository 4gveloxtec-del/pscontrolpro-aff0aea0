-- Etapa 4: Índices GIN para Busca 360 otimizada
-- Habilitar extensão pg_trgm para busca por similaridade
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Índice GIN para busca por nome (campo mais buscado)
CREATE INDEX IF NOT EXISTS idx_clients_name_trgm 
ON public.clients USING gin (name gin_trgm_ops);

-- Índice GIN para busca por login
CREATE INDEX IF NOT EXISTS idx_clients_login_trgm 
ON public.clients USING gin (login gin_trgm_ops);

-- Índice GIN para busca por plano
CREATE INDEX IF NOT EXISTS idx_clients_plan_name_trgm 
ON public.clients USING gin (plan_name gin_trgm_ops);

-- Índice GIN para busca por categoria
CREATE INDEX IF NOT EXISTS idx_clients_category_trgm 
ON public.clients USING gin (category gin_trgm_ops);

-- Índice GIN para busca por notas
CREATE INDEX IF NOT EXISTS idx_clients_notes_trgm 
ON public.clients USING gin (notes gin_trgm_ops);

-- Índice composto para filtro seller_id + is_archived (otimiza WHERE comum)
CREATE INDEX IF NOT EXISTS idx_clients_seller_archived 
ON public.clients (seller_id, is_archived);

-- Função para busca 360 server-side com todos os campos
CREATE OR REPLACE FUNCTION public.search_clients_360(
  p_seller_id UUID,
  p_search_term TEXT,
  p_limit INT DEFAULT 200
)
RETURNS TABLE (
  id UUID,
  seller_id UUID,
  name TEXT,
  phone TEXT,
  email TEXT,
  login TEXT,
  login_2 TEXT,
  expiration_date DATE,
  plan_name TEXT,
  category TEXT,
  is_archived BOOLEAN,
  created_at TIMESTAMPTZ
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.seller_id,
    c.name,
    c.phone,
    c.email,
    c.login,
    c.login_2,
    c.expiration_date,
    c.plan_name,
    c.category,
    c.is_archived,
    c.created_at
  FROM clients c
  WHERE c.seller_id = p_seller_id
    AND (
      c.name ILIKE '%' || p_search_term || '%'
      OR c.phone ILIKE '%' || p_search_term || '%'
      OR c.email ILIKE '%' || p_search_term || '%'
      OR c.plan_name ILIKE '%' || p_search_term || '%'
      OR c.category ILIKE '%' || p_search_term || '%'
      OR c.notes ILIKE '%' || p_search_term || '%'
      -- Login é criptografado, mas mantemos para busca parcial
      OR c.login ILIKE '%' || p_search_term || '%'
      OR c.login_2 ILIKE '%' || p_search_term || '%'
    )
  ORDER BY c.expiration_date DESC
  LIMIT p_limit;
END;
$$;