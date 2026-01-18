-- Add download_url column to server_apps table
ALTER TABLE public.server_apps
ADD COLUMN IF NOT EXISTS download_url TEXT DEFAULT NULL;

COMMENT ON COLUMN public.server_apps.download_url IS 'Link de download do aplicativo (Android TV Box, Android TV, Celular Android)';