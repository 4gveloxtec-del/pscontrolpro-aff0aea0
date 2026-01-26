-- Fix admin WhatsApp instance with correct phone and instance name
UPDATE public.whatsapp_seller_instances
SET 
  connected_phone = '5531998518865',
  instance_name = 'Sandel',
  original_instance_name = 'Sandel',
  is_connected = true,
  session_valid = true,
  last_evolution_state = 'open',
  updated_at = now()
WHERE seller_id = '63f2d73c-1632-4ff0-a03c-42992e63d0fa';