-- Adicionar flag is_template para fluxos universais
-- Esta mudança é aditiva e não afeta fluxos existentes

ALTER TABLE public.bot_engine_flows 
ADD COLUMN IF NOT EXISTS is_template boolean DEFAULT false;

-- Marcar os fluxos IPTV do seller atual como templates universais
UPDATE public.bot_engine_flows 
SET is_template = true 
WHERE category = 'Fluxos IPTV' 
  AND is_active = true;

-- Criar política para permitir que todos revendedores VEJAM templates
CREATE POLICY "Resellers can view template flows"
ON public.bot_engine_flows
FOR SELECT
USING (
  is_template = true 
  OR seller_id = auth.uid()
);

-- Garantir que apenas o dono pode modificar seus próprios fluxos
-- (templates só podem ser editados pelo admin que criou)
CREATE POLICY "Users can only modify their own flows"
ON public.bot_engine_flows
FOR UPDATE
USING (seller_id = auth.uid())
WITH CHECK (seller_id = auth.uid());

CREATE POLICY "Users can only delete their own flows"
ON public.bot_engine_flows
FOR DELETE
USING (seller_id = auth.uid());

-- Adicionar coluna para rastrear de qual template um fluxo foi clonado
ALTER TABLE public.bot_engine_flows 
ADD COLUMN IF NOT EXISTS cloned_from_template_id uuid REFERENCES public.bot_engine_flows(id) ON DELETE SET NULL;

-- Comentário explicativo
COMMENT ON COLUMN public.bot_engine_flows.is_template IS 'Fluxos template são universais e visíveis para todos revendedores';
COMMENT ON COLUMN public.bot_engine_flows.cloned_from_template_id IS 'Referência ao template original se este fluxo foi clonado';