-- Add instance_link column for simplified reseller registration
ALTER TABLE public.whatsapp_seller_instances 
ADD COLUMN IF NOT EXISTS instance_link TEXT;

-- Add webhook_configured flag to track auto-configuration status
ALTER TABLE public.whatsapp_seller_instances 
ADD COLUMN IF NOT EXISTS webhook_auto_configured BOOLEAN DEFAULT false;

-- Add auto_configured_at timestamp
ALTER TABLE public.whatsapp_seller_instances 
ADD COLUMN IF NOT EXISTS auto_configured_at TIMESTAMP WITH TIME ZONE;

-- Add configuration_error to store any errors during auto-config
ALTER TABLE public.whatsapp_seller_instances 
ADD COLUMN IF NOT EXISTS configuration_error TEXT;

-- Comment explaining the instance_link field
COMMENT ON COLUMN public.whatsapp_seller_instances.instance_link IS 'URL/link da instância WhatsApp do revendedor (ex: https://evolutionapi.sanplaymovie.shop/sandelrodrig ou apenas sandelrodrig)';