-- Registrar a instância sanplay_c4f9 para o seller Sandel Rodrigues
INSERT INTO public.whatsapp_seller_instances (
  seller_id,
  instance_name,
  is_connected,
  connected_phone
)
VALUES (
  '63f2d73c-1632-4ff0-a03c-42992e63d0fa',
  'sanplay_c4f9',
  true,
  '553173004131'
)
ON CONFLICT (seller_id) DO UPDATE SET
  instance_name = 'sanplay_c4f9',
  is_connected = true,
  connected_phone = '553173004131',
  updated_at = NOW();