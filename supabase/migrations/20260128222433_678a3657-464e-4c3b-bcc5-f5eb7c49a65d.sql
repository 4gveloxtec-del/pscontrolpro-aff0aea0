-- Add mac_address column to reseller_device_apps for Reseller Apps (not Gerencia Apps)
ALTER TABLE public.reseller_device_apps ADD COLUMN IF NOT EXISTS mac_address text NULL;