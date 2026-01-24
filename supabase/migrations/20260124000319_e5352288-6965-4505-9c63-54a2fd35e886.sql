-- Add default duration field for test configuration (in hours)
-- This allows configuring short tests (1-4 hours) typical for IPTV trials

ALTER TABLE public.test_integration_config 
ADD COLUMN IF NOT EXISTS default_duration_hours NUMERIC DEFAULT 2;

-- Add expiration_datetime to clients table to support hour-level precision
-- This is needed for short tests that expire in hours, not days
ALTER TABLE public.clients 
ADD COLUMN IF NOT EXISTS expiration_datetime TIMESTAMPTZ;

-- Add is_test flag to identify test clients
ALTER TABLE public.clients 
ADD COLUMN IF NOT EXISTS is_test BOOLEAN DEFAULT false;

-- Create index for efficient queries on test clients with datetime expiration
CREATE INDEX IF NOT EXISTS idx_clients_expiration_datetime 
ON public.clients(expiration_datetime) 
WHERE expiration_datetime IS NOT NULL AND is_test = true;

-- Add comment explaining the field
COMMENT ON COLUMN public.test_integration_config.default_duration_hours IS 'Default test duration in hours. Used when API does not return expiration. Common values: 1, 2, 4 hours for IPTV tests.';

COMMENT ON COLUMN public.clients.expiration_datetime IS 'Precise expiration timestamp for short tests (hours). Takes precedence over expiration_date for tests.';

COMMENT ON COLUMN public.clients.is_test IS 'Flag indicating this is a test client created via /teste command.';