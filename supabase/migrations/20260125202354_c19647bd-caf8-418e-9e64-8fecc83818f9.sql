-- Tabela para menus dinâmicos do BotEngine
CREATE TABLE IF NOT EXISTS public.bot_engine_menus (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_id UUID NOT NULL,
  menu_key TEXT NOT NULL,
  title TEXT,
  header_message TEXT,
  footer_message TEXT,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  parent_menu_key TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(seller_id, menu_key)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_bot_engine_menus_seller ON public.bot_engine_menus(seller_id);
CREATE INDEX IF NOT EXISTS idx_bot_engine_menus_key ON public.bot_engine_menus(seller_id, menu_key);

-- RLS
ALTER TABLE public.bot_engine_menus ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sellers can manage their own menus"
ON public.bot_engine_menus
FOR ALL
USING (auth.uid() = seller_id)
WITH CHECK (auth.uid() = seller_id);

-- Trigger para updated_at
CREATE TRIGGER update_bot_engine_menus_updated_at
BEFORE UPDATE ON public.bot_engine_menus
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Comentários explicativos
COMMENT ON TABLE public.bot_engine_menus IS 'Menus dinâmicos do BotEngine - permite criar menus e submenus baseados em JSON';
COMMENT ON COLUMN public.bot_engine_menus.menu_key IS 'Identificador único do menu (ex: MENU_PRINCIPAL, TESTE, PLANOS)';
COMMENT ON COLUMN public.bot_engine_menus.options IS 'Array de opções: [{label: string, target_menu?: string, target_state?: string, action?: string}]';
COMMENT ON COLUMN public.bot_engine_menus.parent_menu_key IS 'Menu pai para navegação de retorno automático';