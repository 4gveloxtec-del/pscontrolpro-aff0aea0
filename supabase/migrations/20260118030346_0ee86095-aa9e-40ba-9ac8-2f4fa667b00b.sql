-- Add download_url column to custom_products table for reseller apps
ALTER TABLE public.custom_products
ADD COLUMN IF NOT EXISTS download_url TEXT DEFAULT NULL;

COMMENT ON COLUMN public.custom_products.download_url IS 'Link de download do aplicativo (Android TV Box, Android TV, Celular Android)';