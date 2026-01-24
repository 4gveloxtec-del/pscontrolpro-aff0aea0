-- Add device compatibility and authentication type to server_apps table
ALTER TABLE public.server_apps 
ADD COLUMN IF NOT EXISTS compatible_devices JSONB DEFAULT '["smart_tv", "tv_box", "celular", "pc", "fire_stick", "projetor"]'::jsonb,
ADD COLUMN IF NOT EXISTS auth_type TEXT DEFAULT 'code' CHECK (auth_type IN ('code', 'user_password', 'provider_user_password')),
ADD COLUMN IF NOT EXISTS provider_name TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.server_apps.compatible_devices IS 'Array of compatible device types: smart_tv, tv_box, celular, pc, fire_stick, projetor';
COMMENT ON COLUMN public.server_apps.auth_type IS 'Authentication type: code, user_password, or provider_user_password';
COMMENT ON COLUMN public.server_apps.provider_name IS 'Provider name for provider_user_password auth type';

-- Create table for client server app credentials (storing app access per server)
CREATE TABLE IF NOT EXISTS public.client_server_app_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  server_id UUID REFERENCES public.servers(id) ON DELETE CASCADE NOT NULL,
  server_app_id UUID REFERENCES public.server_apps(id) ON DELETE CASCADE NOT NULL,
  seller_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  -- Authentication credentials (encrypted)
  auth_code TEXT, -- For code auth type
  username TEXT, -- For user_password and provider_user_password
  password TEXT, -- For user_password and provider_user_password (encrypted)
  provider TEXT, -- For provider_user_password
  -- Metadata
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, server_app_id)
);

-- Enable RLS
ALTER TABLE public.client_server_app_credentials ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own client server app credentials"
ON public.client_server_app_credentials FOR SELECT
USING (auth.uid() = seller_id);

CREATE POLICY "Users can insert their own client server app credentials"
ON public.client_server_app_credentials FOR INSERT
WITH CHECK (auth.uid() = seller_id);

CREATE POLICY "Users can update their own client server app credentials"
ON public.client_server_app_credentials FOR UPDATE
USING (auth.uid() = seller_id);

CREATE POLICY "Users can delete their own client server app credentials"
ON public.client_server_app_credentials FOR DELETE
USING (auth.uid() = seller_id);

-- Create trigger for updated_at
CREATE TRIGGER update_client_server_app_credentials_updated_at
BEFORE UPDATE ON public.client_server_app_credentials
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();