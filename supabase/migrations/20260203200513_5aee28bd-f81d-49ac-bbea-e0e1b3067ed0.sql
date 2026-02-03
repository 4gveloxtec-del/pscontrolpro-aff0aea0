-- ============================================================
-- PASSO 1: Adicionar colunas de busca normalizadas na tabela clients
-- Essas colunas armazenam versões lowercase/normalizadas dos campos
-- para permitir busca rápida sem descriptografia
-- ============================================================

-- Adicionar colunas de busca (se não existirem)
ALTER TABLE public.clients 
ADD COLUMN IF NOT EXISTS login_search TEXT,
ADD COLUMN IF NOT EXISTS login2_search TEXT,
ADD COLUMN IF NOT EXISTS paid_apps_email_search TEXT,
ADD COLUMN IF NOT EXISTS phone_search TEXT;

-- Criar índices para busca rápida
CREATE INDEX IF NOT EXISTS idx_clients_name_lower ON public.clients (LOWER(name));
CREATE INDEX IF NOT EXISTS idx_clients_login_search ON public.clients (login_search);
CREATE INDEX IF NOT EXISTS idx_clients_login2_search ON public.clients (login2_search);
CREATE INDEX IF NOT EXISTS idx_clients_paid_apps_email_search ON public.clients (paid_apps_email_search);
CREATE INDEX IF NOT EXISTS idx_clients_phone_search ON public.clients (phone_search);

-- Índice composto para busca 360 otimizada
CREATE INDEX IF NOT EXISTS idx_clients_search_360_v2 ON public.clients (seller_id, is_archived) 
INCLUDE (name, login_search, login2_search, phone_search, paid_apps_email_search);

-- ============================================================
-- Função SQL otimizada para Busca 360 usando colunas normalizadas
-- ============================================================
CREATE OR REPLACE FUNCTION public.search_clients_360_v2(
  p_seller_id UUID,
  p_search_term TEXT,
  p_limit INTEGER DEFAULT 50
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
  created_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_term TEXT;
  v_term_digits TEXT;
BEGIN
  -- Normalizar termo de busca
  v_term := LOWER(TRIM(p_search_term));
  -- Extrair apenas dígitos para busca por telefone
  v_term_digits := REGEXP_REPLACE(v_term, '\D', '', 'g');
  
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
    AND c.is_archived = false
    AND (
      -- Busca por nome (case insensitive)
      LOWER(c.name) LIKE '%' || v_term || '%'
      -- Busca por email
      OR LOWER(c.email) LIKE '%' || v_term || '%'
      -- Busca por login normalizado (sem descriptografia!)
      OR c.login_search LIKE '%' || v_term || '%'
      -- Busca por login_2 normalizado
      OR c.login2_search LIKE '%' || v_term || '%'
      -- Busca por email de apps pagos
      OR c.paid_apps_email_search LIKE '%' || v_term || '%'
      -- Busca por telefone normalizado
      OR c.phone_search LIKE '%' || v_term_digits || '%'
      -- Busca por plano
      OR LOWER(c.plan_name) LIKE '%' || v_term || '%'
      -- Busca por categoria
      OR LOWER(c.category) LIKE '%' || v_term || '%'
      -- Busca por notas
      OR LOWER(c.notes) LIKE '%' || v_term || '%'
    )
  ORDER BY c.expiration_date DESC
  LIMIT p_limit;
END;
$$;

-- Comentários para documentação
COMMENT ON COLUMN public.clients.login_search IS 'Versão normalizada (lowercase) do login para busca. NÃO contém dados sensíveis.';
COMMENT ON COLUMN public.clients.login2_search IS 'Versão normalizada (lowercase) do login_2 para busca.';
COMMENT ON COLUMN public.clients.paid_apps_email_search IS 'Versão normalizada do paid_apps_email para busca.';
COMMENT ON COLUMN public.clients.phone_search IS 'Telefone normalizado (apenas dígitos) para busca.';