-- Add panel_url column to default_server_icons table
ALTER TABLE public.default_server_icons 
ADD COLUMN IF NOT EXISTS panel_url TEXT;