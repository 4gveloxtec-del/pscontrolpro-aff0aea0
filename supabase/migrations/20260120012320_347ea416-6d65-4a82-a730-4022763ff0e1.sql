-- Adicionar coluna plan_type à tabela profiles
-- 'manual' = Plano Manual (sem API WhatsApp)
-- 'whatsapp' = Plano WhatsApp (com API para envio automático)
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS plan_type TEXT DEFAULT 'manual';

-- Adicionar coluna para armazenar o preço do plano do revendedor
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS plan_price NUMERIC DEFAULT NULL;

-- Atualizar todos os revendedores existentes para terem o plano manual por padrão
UPDATE public.profiles
SET plan_type = 'manual'
WHERE plan_type IS NULL;