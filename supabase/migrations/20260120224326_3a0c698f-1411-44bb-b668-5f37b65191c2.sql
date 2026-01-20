-- Add instance_name column to whatsapp_global_config for admin chatbot detection
ALTER TABLE public.whatsapp_global_config 
ADD COLUMN IF NOT EXISTS instance_name TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.whatsapp_global_config.instance_name IS 'Nome da instância WhatsApp do admin para o chatbot interativo (opcional)';

-- Add admin_user_id to track which admin owns the config
ALTER TABLE public.whatsapp_global_config 
ADD COLUMN IF NOT EXISTS admin_user_id UUID REFERENCES auth.users(id);

COMMENT ON COLUMN public.whatsapp_global_config.admin_user_id IS 'ID do admin que configurou a API global';