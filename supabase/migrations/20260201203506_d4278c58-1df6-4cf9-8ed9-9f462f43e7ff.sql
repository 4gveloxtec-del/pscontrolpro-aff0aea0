-- Migração: Corrigir nós de menu existentes para usar estrutura compatível com o editor
-- Atualiza todos os nós que são entry_point e têm node_type='menu' para usar node_type='message' com config.message_type='menu'

UPDATE public.bot_engine_nodes
SET 
  node_type = 'message',
  name = COALESCE(
    CASE WHEN name = 'START' THEN '🌳 Menu Principal' ELSE name END,
    '🌳 Menu Principal'
  ),
  config = jsonb_set(
    COALESCE(config, '{}'::jsonb),
    '{message_type}',
    '"menu"'::jsonb
  ),
  updated_at = now()
WHERE 
  is_entry_point = true 
  AND node_type = 'menu'
  AND (config->>'message_type' IS NULL OR config->>'message_type' != 'menu');

-- Também atualizar nós que são menu mas não têm message_type definido
UPDATE public.bot_engine_nodes
SET 
  config = jsonb_set(
    COALESCE(config, '{}'::jsonb),
    '{message_type}',
    '"menu"'::jsonb
  ),
  updated_at = now()
WHERE 
  node_type = 'message'
  AND is_entry_point = true
  AND config->'menu_options' IS NOT NULL
  AND (config->>'message_type' IS NULL OR config->>'message_type' = '');