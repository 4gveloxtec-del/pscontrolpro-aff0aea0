-- Verificar se is_active está true para todos os menus
SELECT id, menu_key, title, is_root, is_active, parent_menu_id 
FROM public.bot_engine_dynamic_menus 
WHERE seller_id = '63f2d73c-1632-4ff0-a03c-42992e63d0fa'
ORDER BY is_root DESC, display_order ASC;