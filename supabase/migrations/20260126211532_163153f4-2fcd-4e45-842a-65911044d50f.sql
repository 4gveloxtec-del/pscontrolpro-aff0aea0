-- Ativar o menu raiz que estava desativado
UPDATE public.bot_engine_dynamic_menus
SET is_active = true, updated_at = NOW()
WHERE id = '2fe53851-5012-43ee-9669-c83a06b3e96b';