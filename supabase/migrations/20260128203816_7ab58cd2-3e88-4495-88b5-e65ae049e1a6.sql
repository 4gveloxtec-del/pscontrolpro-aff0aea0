-- Habilitar BotEngine para o admin testar
UPDATE public.bot_engine_config
SET is_enabled = true
WHERE seller_id = '63f2d73c-1632-4ff0-a03c-42992e63d0fa';