-- 1. Criar menu RAIZ principal
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
  header_message,
  footer_message
)
VALUES (
  '63f2d73c-1632-4ff0-a03c-42992e63d0fa',
  'menu_principal',
  'Menu Principal',
  'Menu inicial do bot',
  'submenu',
  true,
  true,
  1,
  '📋',
  'Olá! 👋 Bem-vindo! Como posso ajudar você hoje?',
  'Digite o número da opção desejada:'
)
ON CONFLICT DO NOTHING;

-- 2. Desbloquear TODAS as sessões travadas para este seller
UPDATE public.bot_sessions 
SET locked = false, updated_at = NOW() 
WHERE seller_id = '63f2d73c-1632-4ff0-a03c-42992e63d0fa';

-- 3. Limpar sessões antigas do número de teste
DELETE FROM public.bot_sessions 
WHERE user_id LIKE '%998518865%' 
  AND updated_at < NOW() - INTERVAL '30 minutes';

-- 4. Atualizar menus existentes para vincular ao menu raiz
UPDATE public.bot_engine_dynamic_menus 
SET parent_menu_id = (
  SELECT id FROM public.bot_engine_dynamic_menus 
  WHERE seller_id = '63f2d73c-1632-4ff0-a03c-42992e63d0fa' 
  AND is_root = true 
  LIMIT 1
)
WHERE seller_id = '63f2d73c-1632-4ff0-a03c-42992e63d0fa' 
AND is_root = false;