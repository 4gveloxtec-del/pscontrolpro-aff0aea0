-- CRIAR MENU RAIZ (Principal) para o seller Sandel
-- Primeiro verificar se já existe para evitar duplicatas
INSERT INTO public.bot_engine_dynamic_menus (
  seller_id,
  menu_key,
  title,
  description,
  emoji,
  section_title,
  menu_type,
  display_order,
  is_active,
  is_root,
  show_back_button,
  header_message,
  footer_message
)
SELECT 
  '63f2d73c-1632-4ff0-a03c-42992e63d0fa',
  'menu_principal',
  'Menu Principal',
  'Selecione uma opção abaixo',
  '📋',
  NULL,
  'submenu',
  0,
  true,
  true, -- ESTE É O MENU RAIZ!
  false, -- Menu raiz não tem botão voltar
  '👋 *Olá! Seja bem-vindo(a)!*

Selecione uma opção:',
  '_Digite o número ou clique na opção desejada._'
WHERE NOT EXISTS (
  SELECT 1 FROM public.bot_engine_dynamic_menus 
  WHERE seller_id = '63f2d73c-1632-4ff0-a03c-42992e63d0fa' AND is_root = true
);

-- Atualizar os menus existentes para serem filhos do menu raiz
-- Primeiro pegar o ID do menu raiz
DO $$
DECLARE
  root_id UUID;
BEGIN
  SELECT id INTO root_id 
  FROM public.bot_engine_dynamic_menus 
  WHERE seller_id = '63f2d73c-1632-4ff0-a03c-42992e63d0fa' AND is_root = true
  LIMIT 1;
  
  IF root_id IS NOT NULL THEN
    -- Atualizar itens para serem filhos do menu raiz
    UPDATE public.bot_engine_dynamic_menus
    SET parent_menu_id = root_id
    WHERE seller_id = '63f2d73c-1632-4ff0-a03c-42992e63d0fa'
      AND is_root = false
      AND parent_menu_id IS NULL;
      
    RAISE NOTICE 'Menu raiz criado com ID: %', root_id;
  END IF;
END $$;

-- Adicionar mais itens ao menu raiz se não existirem
INSERT INTO public.bot_engine_dynamic_menus (
  seller_id,
  menu_key,
  title,
  description,
  emoji,
  section_title,
  menu_type,
  target_message,
  display_order,
  is_active,
  is_root,
  show_back_button,
  parent_menu_id
)
SELECT 
  '63f2d73c-1632-4ff0-a03c-42992e63d0fa',
  'teste_gratis',
  'Teste Grátis',
  'Solicite seu teste gratuito de 6 horas',
  '🆓',
  'Não sou cliente',
  'message',
  '🎁 *Teste Gratuito*

Para solicitar seu teste gratuito, envie:
/teste

Você receberá os dados de acesso em instantes!',
  1,
  true,
  false,
  true,
  (SELECT id FROM public.bot_engine_dynamic_menus WHERE seller_id = '63f2d73c-1632-4ff0-a03c-42992e63d0fa' AND is_root = true LIMIT 1)
WHERE NOT EXISTS (
  SELECT 1 FROM public.bot_engine_dynamic_menus 
  WHERE seller_id = '63f2d73c-1632-4ff0-a03c-42992e63d0fa' AND menu_key = 'teste_gratis'
);

-- Adicionar "Como funciona"
INSERT INTO public.bot_engine_dynamic_menus (
  seller_id,
  menu_key,
  title,
  description,
  emoji,
  section_title,
  menu_type,
  target_message,
  display_order,
  is_active,
  is_root,
  show_back_button,
  parent_menu_id
)
SELECT 
  '63f2d73c-1632-4ff0-a03c-42992e63d0fa',
  'como_funciona',
  'Como funciona',
  'Saiba mais sobre o serviço',
  '❓',
  'Informações',
  'message',
  '📺 *Como Funciona*

Nosso serviço oferece acesso a milhares de canais de TV, filmes e séries em alta qualidade.

✅ Funciona em Smart TVs, celulares, tablets e computadores
✅ Qualidade HD e Full HD
✅ Suporte técnico 24h
✅ Teste gratuito disponível

Para mais informações, fale com nosso atendimento!',
  10,
  true,
  false,
  true,
  (SELECT id FROM public.bot_engine_dynamic_menus WHERE seller_id = '63f2d73c-1632-4ff0-a03c-42992e63d0fa' AND is_root = true LIMIT 1)
WHERE NOT EXISTS (
  SELECT 1 FROM public.bot_engine_dynamic_menus 
  WHERE seller_id = '63f2d73c-1632-4ff0-a03c-42992e63d0fa' AND menu_key = 'como_funciona'
);

-- Adicionar "Quero ser Revendedor"
INSERT INTO public.bot_engine_dynamic_menus (
  seller_id,
  menu_key,
  title,
  description,
  emoji,
  section_title,
  menu_type,
  target_message,
  display_order,
  is_active,
  is_root,
  show_back_button,
  parent_menu_id
)
SELECT 
  '63f2d73c-1632-4ff0-a03c-42992e63d0fa',
  'revenda',
  'Quero ser Revendedor',
  'Conheça nosso programa de revenda',
  '💼',
  'Informações',
  'message',
  '💼 *Programa de Revenda*

Torne-se um revendedor e tenha sua própria renda extra!

✅ Margem de lucro atrativa
✅ Suporte completo ao revendedor
✅ Painel de gestão de clientes
✅ Material de divulgação

Entre em contato para saber mais sobre como se tornar um revendedor!',
  11,
  true,
  false,
  true,
  (SELECT id FROM public.bot_engine_dynamic_menus WHERE seller_id = '63f2d73c-1632-4ff0-a03c-42992e63d0fa' AND is_root = true LIMIT 1)
WHERE NOT EXISTS (
  SELECT 1 FROM public.bot_engine_dynamic_menus 
  WHERE seller_id = '63f2d73c-1632-4ff0-a03c-42992e63d0fa' AND menu_key = 'revenda'
);