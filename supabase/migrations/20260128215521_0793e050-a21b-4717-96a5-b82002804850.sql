-- Add missing downloader_code column to reseller_device_apps table
-- This unifies the data model with custom_products (APP_REVENDEDOR prefix)

ALTER TABLE public.reseller_device_apps
ADD COLUMN IF NOT EXISTS downloader_code text NULL;

COMMENT ON COLUMN public.reseller_device_apps.downloader_code IS 'Código para download via app Downloader';