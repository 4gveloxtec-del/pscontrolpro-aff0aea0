-- Ativar o Bot Engine para o seller (Sandel)
UPDATE public.bot_engine_config 
SET is_enabled = true,
    updated_at = now()
WHERE seller_id = '63f2d73c-1632-4ff0-a03c-42992e63d0fa';

-- Verificar se tem menus dinâmicos V2 configurados
SELECT id, menu_key, title, is_root, is_active 
FROM public.bot_engine_dynamic_menus 
WHERE seller_id = '63f2d73c-1632-4ff0-a03c-42992e63d0fa' 
AND is_active = true 
LIMIT 10;