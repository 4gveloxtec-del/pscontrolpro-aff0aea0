-- Adicionar campo de histórico de navegação para suportar "voltar"
ALTER TABLE public.bot_engine_sessions 
ADD COLUMN IF NOT EXISTS navigation_history UUID[] DEFAULT '{}';

-- Adicionar campo para identificar qual comando ativou o bot
ALTER TABLE public.bot_engine_sessions 
ADD COLUMN IF NOT EXISTS trigger_command TEXT;

-- Adicionar campo para armazenar contexto externo (ex: dados da API existente)
ALTER TABLE public.bot_engine_sessions 
ADD COLUMN IF NOT EXISTS external_context JSONB DEFAULT '{}';