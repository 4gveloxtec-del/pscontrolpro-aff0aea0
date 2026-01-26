-- Verificar menus existentes e forçar um como raiz
-- Primeiro, vamos ver o que tem
SELECT id, menu_key, title, is_root, parent_menu_id 
FROM public.bot_engine_dynamic_menus 
WHERE seller_id = '63f2d73c-1632-4ff0-a03c-42992e63d0fa';