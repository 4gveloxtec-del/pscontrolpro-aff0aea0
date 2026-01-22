-- Tornar external_app_id nullable para permitir apps fixos do sistema
ALTER TABLE public.client_external_apps 
ALTER COLUMN external_app_id DROP NOT NULL;

-- Adicionar coluna para armazenar o nome do app fixo (quando não é um app customizado)
ALTER TABLE public.client_external_apps 
ADD COLUMN IF NOT EXISTS fixed_app_name TEXT NULL;

-- Adicionar comentário para documentação
COMMENT ON COLUMN public.client_external_apps.fixed_app_name IS 'Nome do app fixo do sistema (quando external_app_id é null). Ex: CLOUDDY, IBO PRO, etc.';