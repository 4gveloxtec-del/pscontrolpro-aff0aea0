-- Criar fluxo de boas-vindas com trigger "first_message"
INSERT INTO public.bot_engine_flows (
  seller_id,
  name,
  description,
  trigger_type,
  trigger_keywords,
  is_active,
  is_default,
  priority
) VALUES (
  'c4f9e3be-13ce-4648-9d88-9b1cccd4a67e',
  'Boas-vindas',
  'Fluxo automático para primeira mensagem',
  'first_message',
  ARRAY[]::text[],
  true,
  true,
  100
) ON CONFLICT DO NOTHING;

-- Criar nó de entrada para o fluxo (mensagem de boas-vindas)
INSERT INTO public.bot_engine_nodes (
  flow_id,
  seller_id,
  node_type,
  name,
  config,
  position_x,
  position_y,
  is_entry_point
)
SELECT 
  f.id,
  f.seller_id,
  'send_message',
  'Mensagem de Boas-vindas',
  jsonb_build_object(
    'message', 'Olá! 👋 Seja bem-vindo(a)! Como posso ajudar você hoje?',
    'typing_delay', 1000
  ),
  100,
  100,
  true
FROM public.bot_engine_flows f
WHERE f.seller_id = 'c4f9e3be-13ce-4648-9d88-9b1cccd4a67e'
  AND f.name = 'Boas-vindas'
  AND f.trigger_type = 'first_message'
  AND NOT EXISTS (
    SELECT 1 FROM public.bot_engine_nodes n WHERE n.flow_id = f.id
  );