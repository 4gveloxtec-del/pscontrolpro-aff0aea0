-- Fix: permitir cooldown fracionário (segundos/minutos) no BotEngine
-- Atualmente welcome_cooldown_hours é INTEGER, o que quebra quando a UI envia 0.5, 0.01, etc.

ALTER TABLE public.bot_engine_config
  ALTER COLUMN welcome_cooldown_hours TYPE double precision
  USING welcome_cooldown_hours::double precision;

ALTER TABLE public.bot_engine_config
  ALTER COLUMN welcome_cooldown_hours SET DEFAULT 24;
