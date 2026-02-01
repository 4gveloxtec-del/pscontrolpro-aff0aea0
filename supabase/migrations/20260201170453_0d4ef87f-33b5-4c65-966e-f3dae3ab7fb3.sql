-- Buscar nós e edges do fluxo MENU_PRINCIPAL para entender estrutura atual
-- Primeiro, vou listar os nós existentes

-- 1. Atualizar INPUT_MENU_PRINCIPAL para NÃO validar e NÃO ter fallback
UPDATE public.bot_engine_nodes 
SET 
  config = jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          COALESCE(config, '{}'::jsonb),
          '{validation_type}',
          '"text"'::jsonb
        ),
        '{validation_options}',
        '[]'::jsonb
      ),
      '{skip_validation}',
      'true'::jsonb
    ),
    '{silent_on_invalid}',
    'true'::jsonb
  ),
  updated_at = now()
WHERE flow_id = 'ed9a6856-8977-4e65-8bf5-8545c3a40654'
  AND node_type = 'input'
  AND seller_id = 'c4f9e3be-13ce-4648-9d88-9b1cccd4a67e';

-- 2. Remover todas as edges de fallback/default do CONDITION do menu principal
-- Primeiro identificar o nó de condição
DELETE FROM public.bot_engine_edges
WHERE flow_id = 'ed9a6856-8977-4e65-8bf5-8545c3a40654'
  AND seller_id = 'c4f9e3be-13ce-4648-9d88-9b1cccd4a67e'
  AND (
    condition_type = 'always' 
    OR condition_type = 'default'
    OR condition_type IS NULL
    OR label ILIKE '%fallback%'
    OR label ILIKE '%default%'
    OR label ILIKE '%outro%'
    OR label ILIKE '%else%'
  )
  -- Mas manter edges que saem do START ou MESSAGE para o próximo nó
  AND source_node_id IN (
    SELECT id FROM public.bot_engine_nodes 
    WHERE flow_id = 'ed9a6856-8977-4e65-8bf5-8545c3a40654'
    AND node_type = 'condition'
  );

-- 3. Garantir que apenas as edges de 1-5 existam no CONDITION
-- Vamos buscar o ID do nó de condição
WITH condition_node AS (
  SELECT id FROM public.bot_engine_nodes 
  WHERE flow_id = 'ed9a6856-8977-4e65-8bf5-8545c3a40654'
    AND node_type = 'condition'
    AND seller_id = 'c4f9e3be-13ce-4648-9d88-9b1cccd4a67e'
  LIMIT 1
)
UPDATE public.bot_engine_edges
SET condition_type = 'equals'
WHERE flow_id = 'ed9a6856-8977-4e65-8bf5-8545c3a40654'
  AND seller_id = 'c4f9e3be-13ce-4648-9d88-9b1cccd4a67e'
  AND source_node_id IN (SELECT id FROM condition_node)
  AND condition_value IN ('1', '2', '3', '4', '5');

-- 4. Remover edge que faz loop de volta para MESSAGE_MENU_PRINCIPAL
DELETE FROM public.bot_engine_edges
WHERE flow_id = 'ed9a6856-8977-4e65-8bf5-8545c3a40654'
  AND seller_id = 'c4f9e3be-13ce-4648-9d88-9b1cccd4a67e'
  AND target_node_id IN (
    SELECT id FROM public.bot_engine_nodes 
    WHERE flow_id = 'ed9a6856-8977-4e65-8bf5-8545c3a40654'
    AND name = 'MESSAGE_MENU_PRINCIPAL'
  )
  AND source_node_id != (
    SELECT id FROM public.bot_engine_nodes 
    WHERE flow_id = 'ed9a6856-8977-4e65-8bf5-8545c3a40654'
    AND node_type = 'start'
    LIMIT 1
  );

-- 5. Atualizar configuração global para NÃO ter fallback automático
UPDATE public.bot_engine_config 
SET 
  fallback_message = NULL,
  suppress_fallback_first_contact = true,
  updated_at = now()
WHERE seller_id = 'c4f9e3be-13ce-4648-9d88-9b1cccd4a67e';