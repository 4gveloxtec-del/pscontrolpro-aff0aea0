-- Adiciona campo panel_id para vincular Apps do Revendedor a um painel (servidor com panel_url)
ALTER TABLE public.reseller_device_apps 
ADD COLUMN IF NOT EXISTS panel_id UUID REFERENCES public.servers(id) ON DELETE SET NULL;

-- Criar índice para melhor performance nas buscas
CREATE INDEX IF NOT EXISTS idx_reseller_device_apps_panel_id ON public.reseller_device_apps(panel_id);

-- Comentário explicativo
COMMENT ON COLUMN public.reseller_device_apps.panel_id IS 'ID do painel (servidor) vinculado ao app. Opcional. Quando preenchido, exibe link clicável para o painel na listagem de clientes.';