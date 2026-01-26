-- =====================================================================
-- SISTEMA DE MENUS DINÂMICOS DO BOT ENGINE
-- Estrutura flexível para gerenciamento de menus e submenus
-- =====================================================================

-- Tabela principal de menus
CREATE TABLE public.bot_engine_dynamic_menus (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_id UUID NOT NULL,
  
  -- Hierarquia
  parent_menu_id UUID REFERENCES public.bot_engine_dynamic_menus(id) ON DELETE CASCADE,
  
  -- Identificação
  menu_key TEXT NOT NULL, -- Chave única para identificação (ex: "main", "planos", "suporte")
  title TEXT NOT NULL, -- Título exibido no menu
  description TEXT, -- Descrição opcional para o item
  
  -- Tipo de ação
  menu_type TEXT NOT NULL DEFAULT 'submenu' CHECK (menu_type IN ('submenu', 'flow', 'command', 'link', 'message')),
  -- submenu: abre outro menu
  -- flow: chama um fluxo do bot engine
  -- command: executa um comando
  -- link: abre link externo
  -- message: envia mensagem simples
  
  -- Destino baseado no tipo
  target_menu_key TEXT, -- Para tipo 'submenu': key do menu destino
  target_flow_id UUID REFERENCES public.bot_engine_flows(id) ON DELETE SET NULL, -- Para tipo 'flow'
  target_command TEXT, -- Para tipo 'command': comando a executar
  target_url TEXT, -- Para tipo 'link': URL externa
  target_message TEXT, -- Para tipo 'message': mensagem a enviar
  
  -- Configuração visual
  emoji TEXT, -- Emoji opcional para o item
  section_title TEXT, -- Título da seção (para agrupar itens)
  
  -- Ordenação e status
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_root BOOLEAN NOT NULL DEFAULT false, -- Se é o menu raiz/inicial
  
  -- Navegação
  show_back_button BOOLEAN NOT NULL DEFAULT true, -- Mostrar opção de voltar
  back_button_text TEXT DEFAULT '⬅️ Voltar',
  
  -- Mensagens do menu
  header_message TEXT, -- Mensagem no topo do menu
  footer_message TEXT, -- Mensagem no rodapé
  
  -- Metadados
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Constraint única por seller + menu_key
  CONSTRAINT unique_seller_menu_key UNIQUE (seller_id, menu_key)
);

-- Índices para performance
CREATE INDEX idx_dynamic_menus_seller ON public.bot_engine_dynamic_menus(seller_id);
CREATE INDEX idx_dynamic_menus_parent ON public.bot_engine_dynamic_menus(parent_menu_id);
CREATE INDEX idx_dynamic_menus_type ON public.bot_engine_dynamic_menus(menu_type);
CREATE INDEX idx_dynamic_menus_active ON public.bot_engine_dynamic_menus(is_active);
CREATE INDEX idx_dynamic_menus_order ON public.bot_engine_dynamic_menus(seller_id, display_order);

-- Enable RLS
ALTER TABLE public.bot_engine_dynamic_menus ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Sellers can view their own menus"
ON public.bot_engine_dynamic_menus
FOR SELECT
USING (auth.uid() = seller_id);

CREATE POLICY "Sellers can create their own menus"
ON public.bot_engine_dynamic_menus
FOR INSERT
WITH CHECK (auth.uid() = seller_id);

CREATE POLICY "Sellers can update their own menus"
ON public.bot_engine_dynamic_menus
FOR UPDATE
USING (auth.uid() = seller_id);

CREATE POLICY "Sellers can delete their own menus"
ON public.bot_engine_dynamic_menus
FOR DELETE
USING (auth.uid() = seller_id);

-- Trigger para atualizar updated_at
CREATE TRIGGER update_dynamic_menus_updated_at
BEFORE UPDATE ON public.bot_engine_dynamic_menus
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================================
-- FUNÇÃO PARA BUSCAR ÁRVORE DE MENUS
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_menu_tree(p_seller_id UUID, p_parent_id UUID DEFAULT NULL)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_agg(
    json_build_object(
      'id', m.id,
      'menu_key', m.menu_key,
      'title', m.title,
      'description', m.description,
      'emoji', m.emoji,
      'menu_type', m.menu_type,
      'target_menu_key', m.target_menu_key,
      'target_flow_id', m.target_flow_id,
      'target_command', m.target_command,
      'target_url', m.target_url,
      'target_message', m.target_message,
      'section_title', m.section_title,
      'display_order', m.display_order,
      'is_active', m.is_active,
      'is_root', m.is_root,
      'show_back_button', m.show_back_button,
      'header_message', m.header_message,
      'footer_message', m.footer_message,
      'children', public.get_menu_tree(p_seller_id, m.id)
    )
    ORDER BY m.display_order, m.title
  )
  INTO result
  FROM public.bot_engine_dynamic_menus m
  WHERE m.seller_id = p_seller_id
    AND (
      (p_parent_id IS NULL AND m.parent_menu_id IS NULL)
      OR m.parent_menu_id = p_parent_id
    )
    AND m.is_active = true;

  RETURN COALESCE(result, '[]'::json);
END;
$$;