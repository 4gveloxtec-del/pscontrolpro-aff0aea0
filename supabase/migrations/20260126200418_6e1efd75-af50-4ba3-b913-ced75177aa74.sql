-- Desbloquear sessões travadas
UPDATE public.bot_sessions 
SET locked = false, updated_at = NOW() - INTERVAL '35 seconds'
WHERE seller_id = '63f2d73c-1632-4ff0-a03c-42992e63d0fa';