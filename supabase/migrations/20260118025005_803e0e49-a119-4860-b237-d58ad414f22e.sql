-- Add download_url column to external_apps table
ALTER TABLE public.external_apps
ADD COLUMN IF NOT EXISTS download_url TEXT DEFAULT NULL;

COMMENT ON COLUMN public.external_apps.download_url IS 'Link de download do aplicativo para enviar ao cliente';