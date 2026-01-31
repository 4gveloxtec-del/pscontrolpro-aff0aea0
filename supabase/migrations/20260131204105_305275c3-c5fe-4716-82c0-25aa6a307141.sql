-- Add provider_code field to server_apps for partnership apps
ALTER TABLE public.server_apps 
ADD COLUMN IF NOT EXISTS provider_code TEXT;