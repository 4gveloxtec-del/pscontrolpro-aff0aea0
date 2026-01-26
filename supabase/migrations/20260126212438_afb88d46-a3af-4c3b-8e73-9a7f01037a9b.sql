-- CORREÇÃO URGENTE: Restaurar número correto do WhatsApp do admin
-- O número correto é 5531998518865, não 553173004131

UPDATE public.whatsapp_seller_instances
SET 
  connected_phone = '5531998518865',
  session_valid = true,
  last_evolution_state = 'connection.update'
WHERE seller_id = '63f2d73c-1632-4ff0-a03c-42992e63d0fa';
