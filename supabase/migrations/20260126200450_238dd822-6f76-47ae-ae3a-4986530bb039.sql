-- Deletar completamente sessão do número de teste
DELETE FROM public.bot_sessions 
WHERE user_id LIKE '%973004131%' 
   OR user_id LIKE '%998518865%';

-- Resetar interaction_count para qualquer sessão restante do seller
UPDATE public.bot_sessions 
SET context = jsonb_set(COALESCE(context::jsonb, '{}'::jsonb), '{interaction_count}', '0'),
    locked = false,
    updated_at = NOW() - INTERVAL '2 hours'
WHERE seller_id = '63f2d73c-1632-4ff0-a03c-42992e63d0fa';