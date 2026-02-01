-- ============================================================
-- ORGANIZAÇÃO DE FLUXOS EM CATEGORIAS/PASTAS
-- ============================================================
-- Adiciona coluna 'category' para agrupar fluxos visualmente
-- Sem alterar lógica, apenas organização

-- Adicionar coluna category
ALTER TABLE public.bot_engine_flows
ADD COLUMN IF NOT EXISTS category TEXT DEFAULT NULL;

-- Comentário explicativo
COMMENT ON COLUMN public.bot_engine_flows.category IS 'Categoria/pasta para organização visual dos fluxos (ex: Fluxos IPTV)';

-- Atualizar os 10 fluxos IPTV para a categoria "Fluxos IPTV"
UPDATE public.bot_engine_flows
SET category = 'Fluxos IPTV'
WHERE seller_id = 'c4f9e3be-13ce-4648-9d88-9b1cccd4a67e'
  AND name IN (
    'MENU_PRINCIPAL',
    'PLANOS',
    'PLANO_MENSAL',
    'PLANO_TRIMESTRAL',
    'PLANO_SEMESTRAL',
    'PLANO_ANUAL',
    'TESTE_GRATIS',
    'RENOVAR',
    'ATENDIMENTO',
    'PS_CONTROL'
  )
  AND is_active = TRUE;

-- Manter backup e legado sem categoria (ou em "Arquivo")
UPDATE public.bot_engine_flows
SET category = 'Arquivo'
WHERE seller_id = 'c4f9e3be-13ce-4648-9d88-9b1cccd4a67e'
  AND name IN ('BACKUP_FLUXO_ATUAL', 'FLUXO_IPTV_LEGADO');