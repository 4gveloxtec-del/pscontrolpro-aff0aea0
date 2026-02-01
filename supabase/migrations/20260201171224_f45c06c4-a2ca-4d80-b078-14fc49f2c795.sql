-- =====================================================================
-- LIMPEZA DO SISTEMA LEGADO DE MENUS DINÂMICOS
-- As tabelas bot_engine_dynamic_menus e bot_engine_menus foram descontinuadas
-- O chatbot agora usa EXCLUSIVAMENTE bot_engine_flows + nodes + edges
-- =====================================================================

-- 1. Limpar dados das tabelas legadas (mantém estrutura para evitar quebras de referência)
DELETE FROM public.bot_engine_dynamic_menus;
DELETE FROM public.bot_engine_menus;

-- 2. Adicionar comentário nas tabelas indicando que estão deprecadas
COMMENT ON TABLE public.bot_engine_dynamic_menus IS 'DEPRECATED: Tabela descontinuada. Use bot_engine_flows + nodes + edges. Mantida apenas para histórico.';
COMMENT ON TABLE public.bot_engine_menus IS 'DEPRECATED: Tabela descontinuada. Use bot_engine_flows + nodes + edges. Mantida apenas para histórico.';

-- 3. Remover função de criação de menus default se existir
DROP FUNCTION IF EXISTS public.create_default_dynamic_menus(uuid);

-- 4. Garantir que main_menu_key no bot_engine_config não é mais necessário
-- (manter coluna para compatibilidade, mas atualizar para null)
UPDATE public.bot_engine_config 
SET main_menu_key = NULL 
WHERE main_menu_key IS NOT NULL;