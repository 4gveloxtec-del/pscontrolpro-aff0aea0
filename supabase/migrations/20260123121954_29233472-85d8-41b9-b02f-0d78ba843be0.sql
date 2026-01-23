-- Add logs_enabled column to test_integration_config
ALTER TABLE public.test_integration_config 
ADD COLUMN IF NOT EXISTS logs_enabled boolean DEFAULT true;

-- Add comment
COMMENT ON COLUMN public.test_integration_config.logs_enabled IS 'Se true, logs de comandos de teste são salvos';