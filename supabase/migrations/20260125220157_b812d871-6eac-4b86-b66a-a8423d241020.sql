-- Adicionar coluna para rastrear notificação de 20 minutos
ALTER TABLE public.test_generation_log 
ADD COLUMN IF NOT EXISTS notified_20min BOOLEAN DEFAULT false;

-- Adicionar coluna expiration_datetime para precisão em horas/minutos
-- (alguns registros podem ter apenas expiration_date sem hora)
ALTER TABLE public.test_generation_log 
ADD COLUMN IF NOT EXISTS expiration_datetime TIMESTAMPTZ;

-- Índice para busca eficiente de testes que precisam de alerta
CREATE INDEX IF NOT EXISTS idx_test_generation_log_pending_alerts 
ON public.test_generation_log(seller_id, expiration_datetime) 
WHERE notified_20min = false AND client_created = true;

-- Comentários
COMMENT ON COLUMN public.test_generation_log.notified_20min IS 'Indica se o alerta de 20 minutos foi enviado';
COMMENT ON COLUMN public.test_generation_log.expiration_datetime IS 'Data/hora exata de expiração do teste';