-- Tabela para armazenar ícones customizados do menu admin
CREATE TABLE public.admin_menu_icons (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  menu_key TEXT NOT NULL UNIQUE, -- Chave do menu (ex: 'dashboard', 'sellers')
  icon_url TEXT NOT NULL, -- URL do ícone customizado
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.admin_menu_icons ENABLE ROW LEVEL SECURITY;

-- Política: Apenas admins podem ler
CREATE POLICY "Admins can view menu icons"
ON public.admin_menu_icons
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);

-- Política: Apenas admins podem inserir
CREATE POLICY "Admins can insert menu icons"
ON public.admin_menu_icons
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);

-- Política: Apenas admins podem atualizar
CREATE POLICY "Admins can update menu icons"
ON public.admin_menu_icons
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);

-- Política: Apenas admins podem deletar
CREATE POLICY "Admins can delete menu icons"
ON public.admin_menu_icons
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);

-- Trigger para atualizar updated_at
CREATE TRIGGER update_admin_menu_icons_updated_at
BEFORE UPDATE ON public.admin_menu_icons
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Comentário da tabela
COMMENT ON TABLE public.admin_menu_icons IS 'Armazena ícones customizados para o menu do painel admin';