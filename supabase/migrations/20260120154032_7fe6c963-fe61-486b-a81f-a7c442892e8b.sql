-- Adicionar coluna plan_period à tabela profiles para filtrar revendedores por período de assinatura
-- Valores: 'mensal', 'trimestral', 'semestral', 'anual', 'vitalicio'
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS plan_period TEXT DEFAULT NULL;

-- Criar índice para melhorar performance de filtros
CREATE INDEX IF NOT EXISTS idx_profiles_plan_period ON public.profiles(plan_period);
CREATE INDEX IF NOT EXISTS idx_profiles_plan_type ON public.profiles(plan_type);

-- Atualizar planos existentes baseado na duração calculada (diferença entre subscription_expires_at e created_at ou última renovação)
-- Para revendedores com datas definidas, tentar inferir o período
UPDATE public.profiles
SET plan_period = CASE
  WHEN is_permanent = true THEN 'vitalicio'
  WHEN subscription_expires_at IS NOT NULL AND subscription_expires_at > NOW() THEN
    CASE
      WHEN EXTRACT(DAY FROM (subscription_expires_at - COALESCE(updated_at, created_at))) <= 35 THEN 'mensal'
      WHEN EXTRACT(DAY FROM (subscription_expires_at - COALESCE(updated_at, created_at))) <= 95 THEN 'trimestral'
      WHEN EXTRACT(DAY FROM (subscription_expires_at - COALESCE(updated_at, created_at))) <= 185 THEN 'semestral'
      WHEN EXTRACT(DAY FROM (subscription_expires_at - COALESCE(updated_at, created_at))) <= 370 THEN 'anual'
      ELSE 'vitalicio'
    END
  ELSE NULL
END
WHERE plan_period IS NULL;