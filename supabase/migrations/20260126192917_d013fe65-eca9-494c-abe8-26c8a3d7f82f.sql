-- Adicionar os menus restantes com tipos válidos
INSERT INTO public.bot_engine_dynamic_menus (
  seller_id,
  menu_key,
  title,
  description,
  menu_type,
  is_root,
  is_active,
  display_order,
  emoji,
  target_message
)
VALUES 
  ('63f2d73c-1632-4ff0-a03c-42992e63d0fa', 'planos', 'Planos e valores', 'Ver planos', 'message', false, true, 3, '💰', 'Entre em contato para conhecer nossos planos!'),
  ('63f2d73c-1632-4ff0-a03c-42992e63d0fa', 'suporte', 'Falar com atendente', 'Suporte humano', 'message', false, true, 4, '🙋', 'Um atendente irá falar com você em breve!')
ON CONFLICT DO NOTHING;