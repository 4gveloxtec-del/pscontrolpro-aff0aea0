-- Tabela de servidores compartilhados (todos revendedores podem adicionar, ninguém pode remover)
-- Essa tabela substitui os "templates do admin" com uma abordagem colaborativa
CREATE TABLE IF NOT EXISTS public.shared_servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_normalized TEXT NOT NULL,
  icon_url TEXT,
  panel_url TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(name_normalized)
);

-- Habilitar RLS
ALTER TABLE public.shared_servers ENABLE ROW LEVEL SECURITY;

-- Política: Todos autenticados podem ver
CREATE POLICY "Authenticated users can view shared servers"
ON public.shared_servers FOR SELECT
TO authenticated
USING (true);

-- Política: Qualquer usuário autenticado pode inserir
CREATE POLICY "Authenticated users can insert shared servers"
ON public.shared_servers FOR INSERT
TO authenticated
WITH CHECK (true);

-- NÃO criar política de DELETE - revendedores não podem remover

-- Apenas admins podem remover (usando função has_role se existir)
CREATE POLICY "Only admins can delete shared servers"
ON public.shared_servers FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- Índice para busca rápida por nome normalizado
CREATE INDEX IF NOT EXISTS idx_shared_servers_name_normalized ON public.shared_servers(name_normalized);

-- Migrar dados existentes do default_server_icons para a nova tabela (se existirem)
INSERT INTO public.shared_servers (name, name_normalized, icon_url, panel_url, created_by)
SELECT 
  name,
  COALESCE(name_normalized, LOWER(REPLACE(name, ' ', ''))),
  icon_url,
  panel_url,
  NULL
FROM public.default_server_icons
ON CONFLICT (name_normalized) DO NOTHING;