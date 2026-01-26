-- Corrigir o número do WhatsApp do administrador (Sandel) para o número correto
UPDATE public.whatsapp_seller_instances
SET connected_phone = '5531998518865',
    updated_at = NOW()
WHERE seller_id = '63f2d73c-1632-4ff0-a03c-42992e63d0fa';

-- Se a desconexão estiver travada, resetar o estado para permitir nova conexão
UPDATE public.whatsapp_seller_instances
SET last_evolution_state = NULL,
    session_valid = false
WHERE seller_id = '63f2d73c-1632-4ff0-a03c-42992e63d0fa'
  AND (last_evolution_state = 'logout_failed' OR last_evolution_state = 'logout_manual');