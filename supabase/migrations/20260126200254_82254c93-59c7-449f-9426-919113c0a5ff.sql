-- LIMPEZA AGRESSIVA: Remover TODAS as sessões do número de teste
DELETE FROM public.bot_sessions 
WHERE user_id LIKE '%998518865%';

-- Desbloquear todas as sessões do seller
UPDATE public.bot_sessions 
SET locked = false, updated_at = NOW() 
WHERE seller_id = '63f2d73c-1632-4ff0-a03c-42992e63d0fa';

-- Também limpar bot_engine_sessions (tabela nova)
DELETE FROM public.bot_engine_sessions 
WHERE contact_phone LIKE '%998518865%';

-- Desbloquear todas
UPDATE public.bot_engine_sessions 
SET status = 'active', last_activity_at = NOW() - INTERVAL '1 hour'
WHERE seller_id = '63f2d73c-1632-4ff0-a03c-42992e63d0fa';