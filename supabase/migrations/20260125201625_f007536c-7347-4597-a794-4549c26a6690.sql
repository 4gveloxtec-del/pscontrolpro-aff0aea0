-- Adicionar campos à tabela bot_sessions existente
ALTER TABLE public.bot_sessions
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS previous_state TEXT DEFAULT 'INICIO',
ADD COLUMN IF NOT EXISTS context JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS last_interaction TIMESTAMPTZ DEFAULT now();

-- Criar índice para busca por phone
CREATE INDEX IF NOT EXISTS idx_bot_sessions_phone ON public.bot_sessions(phone);

-- Criar índice para busca por seller + phone
CREATE INDEX IF NOT EXISTS idx_bot_sessions_seller_phone ON public.bot_sessions(seller_id, phone);

-- Atualizar phone com user_id para registros existentes (se user_id contiver o telefone)
UPDATE public.bot_sessions 
SET phone = user_id 
WHERE phone IS NULL AND user_id IS NOT NULL;

-- Atualizar last_interaction com updated_at para registros existentes
UPDATE public.bot_sessions 
SET last_interaction = updated_at 
WHERE last_interaction IS NULL;

-- Criar trigger para atualizar previous_state automaticamente
CREATE OR REPLACE FUNCTION public.update_bot_session_previous_state()
RETURNS TRIGGER AS $$
BEGIN
  -- Se o state mudou, guardar o antigo como previous_state
  IF OLD.state IS DISTINCT FROM NEW.state THEN
    NEW.previous_state := OLD.state;
  END IF;
  
  -- Atualizar last_interaction
  NEW.last_interaction := now();
  NEW.updated_at := now();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Remover trigger existente se houver
DROP TRIGGER IF EXISTS trigger_update_bot_session_previous_state ON public.bot_sessions;

-- Criar trigger
CREATE TRIGGER trigger_update_bot_session_previous_state
BEFORE UPDATE ON public.bot_sessions
FOR EACH ROW
EXECUTE FUNCTION public.update_bot_session_previous_state();

-- Comentários para documentação
COMMENT ON COLUMN public.bot_sessions.phone IS 'Número de telefone do usuário (normalizado)';
COMMENT ON COLUMN public.bot_sessions.previous_state IS 'Estado anterior para navegação de volta';
COMMENT ON COLUMN public.bot_sessions.context IS 'Contexto JSON da conversa (variáveis, dados temporários)';
COMMENT ON COLUMN public.bot_sessions.last_interaction IS 'Timestamp da última interação do usuário';
COMMENT ON COLUMN public.bot_sessions.locked IS 'Flag para evitar processamento paralelo de mensagens';