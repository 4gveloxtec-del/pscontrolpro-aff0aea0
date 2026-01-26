-- 1) Corrigir telefone conectado da instância (faltava o '9' após o DDD)
UPDATE public.whatsapp_seller_instances
SET connected_phone = '5531973004131',
    is_connected = true,
    updated_at = NOW()
WHERE seller_id = '63f2d73c-1632-4ff0-a03c-42992e63d0fa';

-- 2) Limpar sessões antigas/travadas relacionadas a este teste
DELETE FROM public.bot_sessions
WHERE seller_id = '63f2d73c-1632-4ff0-a03c-42992e63d0fa'
  AND (user_id IN ('5531998518865', '5531973004131') OR user_id LIKE '%998518865%');

DELETE FROM public.bot_engine_sessions
WHERE seller_id = '63f2d73c-1632-4ff0-a03c-42992e63d0fa'
  AND (contact_phone IN ('5531998518865', '5531973004131') OR contact_phone LIKE '%998518865%');