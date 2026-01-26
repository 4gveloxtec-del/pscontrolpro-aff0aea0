-- Add welcome cooldown and first contact fallback suppression to bot_engine_config
ALTER TABLE public.bot_engine_config
ADD COLUMN IF NOT EXISTS welcome_cooldown_hours integer DEFAULT 24,
ADD COLUMN IF NOT EXISTS suppress_fallback_first_contact boolean DEFAULT true;

-- Add comment for documentation
COMMENT ON COLUMN public.bot_engine_config.welcome_cooldown_hours IS 'Hours before sending welcome message again to same contact (default 24h)';
COMMENT ON COLUMN public.bot_engine_config.suppress_fallback_first_contact IS 'If true, do not send fallback/error message on first contact - only after user has interacted once';