-- =====================================================================
-- SISTEMA DE MENUS DINÂMICOS MULTI-REVENDEDORES
-- =====================================================================

-- 1. Criar função para copiar menus base para novo revendedor
CREATE OR REPLACE FUNCTION public.create_default_dynamic_menus(p_seller_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_main_menu_id UUID;
  v_teste_menu_id UUID;
  v_cliente_menu_id UUID;
  v_como_funciona_id UUID;
  v_revendedor_menu_id UUID;
  v_suporte_menu_id UUID;
BEGIN
  -- =====================================================================
  -- MENU PRINCIPAL (ROOT)
  -- =====================================================================
  INSERT INTO bot_engine_dynamic_menus (
    seller_id, menu_key, title, description, menu_type, is_root, is_active, display_order,
    header_message, footer_message, show_back_button, emoji, section_title
  ) VALUES (
    p_seller_id, 'main', 'Menu Principal', 'Menu inicial do atendimento', 'submenu', true, true, 0,
    '👋 *Olá! Seja bem-vindo(a)!*

Selecione uma opção:', '_Digite o número ou clique na opção desejada._', false, NULL, NULL
  ) RETURNING id INTO v_main_menu_id;

  -- =====================================================================
  -- ITENS DO MENU PRINCIPAL
  -- =====================================================================
  
  -- 1. Teste Grátis
  INSERT INTO bot_engine_dynamic_menus (
    seller_id, parent_menu_id, menu_key, title, description, menu_type, is_active, display_order, emoji, section_title
  ) VALUES (
    p_seller_id, v_main_menu_id, 'teste_gratis', 'Teste Grátis', 'Solicite seu teste gratuito', 'submenu', true, 1, '🆓', 'Não sou cliente'
  ) RETURNING id INTO v_teste_menu_id;

  -- 2. Já sou cliente
  INSERT INTO bot_engine_dynamic_menus (
    seller_id, parent_menu_id, menu_key, title, description, menu_type, is_active, display_order, emoji, section_title
  ) VALUES (
    p_seller_id, v_main_menu_id, 'ja_sou_cliente', 'Já sou cliente', 'Acesse sua área de cliente', 'submenu', true, 2, '👤', 'Já sou cliente'
  ) RETURNING id INTO v_cliente_menu_id;

  -- 3. Como funciona
  INSERT INTO bot_engine_dynamic_menus (
    seller_id, parent_menu_id, menu_key, title, description, menu_type, is_active, display_order, emoji, section_title
  ) VALUES (
    p_seller_id, v_main_menu_id, 'como_funciona', 'Como funciona', 'Saiba mais sobre o serviço', 'submenu', true, 3, '❓', 'Informações'
  ) RETURNING id INTO v_como_funciona_id;

  -- 4. Quero ser revendedor
  INSERT INTO bot_engine_dynamic_menus (
    seller_id, parent_menu_id, menu_key, title, description, menu_type, is_active, display_order, emoji, section_title
  ) VALUES (
    p_seller_id, v_main_menu_id, 'quero_ser_revendedor', 'Quero ser Revendedor', 'Conheça nosso programa de revenda', 'submenu', true, 4, '💼', 'Informações'
  ) RETURNING id INTO v_revendedor_menu_id;

  -- 5. Suporte
  INSERT INTO bot_engine_dynamic_menus (
    seller_id, parent_menu_id, menu_key, title, description, menu_type, is_active, display_order, emoji, section_title
  ) VALUES (
    p_seller_id, v_main_menu_id, 'suporte', 'Suporte', 'Precisa de ajuda?', 'submenu', true, 5, '🛠️', 'Ajuda'
  ) RETURNING id INTO v_suporte_menu_id;

  -- =====================================================================
  -- SUBMENUS: TESTE GRÁTIS
  -- =====================================================================
  INSERT INTO bot_engine_dynamic_menus (seller_id, parent_menu_id, menu_key, title, description, menu_type, target_command, is_active, display_order, emoji, show_back_button, header_message)
  VALUES 
    (p_seller_id, v_teste_menu_id, 'solicitar_teste', 'Solicitar teste grátis', 'Peça seu teste agora', 'command', '/teste', true, 1, '✅', true, '🆓 *Teste Grátis*

Escolha uma opção:'),
    (p_seller_id, v_teste_menu_id, 'como_instalar', 'Como instalar o aplicativo', 'Instruções de instalação', 'message', NULL, true, 2, '📲', true, NULL),
    (p_seller_id, v_teste_menu_id, 'compatibilidade', 'Compatibilidade de aparelhos', 'Veja os dispositivos compatíveis', 'message', NULL, true, 3, '📱', true, NULL);

  -- Atualizar mensagens dos submenus de teste
  UPDATE bot_engine_dynamic_menus SET target_message = 'Para solicitar seu teste grátis, envie:
- Seu nome completo
- Modelo do aparelho

Aguarde nosso atendente! ⏳' WHERE seller_id = p_seller_id AND menu_key = 'solicitar_teste';

  UPDATE bot_engine_dynamic_menus SET target_message = '📲 *Como Instalar*

1️⃣ Baixe o aplicativo na loja
2️⃣ Abra e insira os dados enviados
3️⃣ Pronto! Aproveite!

_Dúvidas? Fale com o suporte._' WHERE seller_id = p_seller_id AND menu_key = 'como_instalar';

  UPDATE bot_engine_dynamic_menus SET target_message = '📱 *Aparelhos Compatíveis*

✅ Smart TV (Samsung, LG, etc.)
✅ TV Box Android
✅ Celular/Tablet Android
✅ iPhone/iPad
✅ Computador Windows/Mac
✅ Amazon Fire TV Stick

_Seu aparelho não está na lista? Consulte-nos!_' WHERE seller_id = p_seller_id AND menu_key = 'compatibilidade';

  -- =====================================================================
  -- SUBMENUS: JÁ SOU CLIENTE
  -- =====================================================================
  INSERT INTO bot_engine_dynamic_menus (seller_id, parent_menu_id, menu_key, title, description, menu_type, target_command, is_active, display_order, emoji, show_back_button, header_message)
  VALUES 
    (p_seller_id, v_cliente_menu_id, 'renovar_app', 'Renovar aplicativo', 'Renove seu plano', 'command', '/renovar', true, 1, '🔄', true, '👤 *Área do Cliente*

Escolha uma opção:'),
    (p_seller_id, v_cliente_menu_id, 'ver_validade', 'Ver validade', 'Consulte sua data de vencimento', 'command', '/validade', true, 2, '📅', true, NULL),
    (p_seller_id, v_cliente_menu_id, 'trocar_dispositivo', 'Trocar dispositivo', 'Altere o aparelho cadastrado', 'command', '/trocar', true, 3, '📱', true, NULL),
    (p_seller_id, v_cliente_menu_id, 'baixar_app', 'Baixar aplicativo', 'Link para download', 'message', NULL, true, 4, '⬇️', true, NULL),
    (p_seller_id, v_cliente_menu_id, 'recuperar_login', 'Recuperar login', 'Esqueceu seus dados?', 'command', '/recuperar', true, 5, '🔑', true, NULL);

  UPDATE bot_engine_dynamic_menus SET target_message = '⬇️ *Baixar Aplicativo*

Acesse o link abaixo para baixar:
🔗 [Link será configurado pelo revendedor]

_Após instalar, insira os dados enviados._' WHERE seller_id = p_seller_id AND menu_key = 'baixar_app';

  -- =====================================================================
  -- SUBMENUS: COMO FUNCIONA
  -- =====================================================================
  INSERT INTO bot_engine_dynamic_menus (seller_id, parent_menu_id, menu_key, title, description, menu_type, target_message, is_active, display_order, emoji, show_back_button, header_message)
  VALUES 
    (p_seller_id, v_como_funciona_id, 'o_que_e_iptv', 'O que é IPTV', 'Entenda o serviço', 'message', '📺 *O que é IPTV?*

IPTV é a transmissão de TV pela internet!

✅ Mais de 10.000 canais
✅ Filmes e séries on demand
✅ Qualidade Full HD e 4K
✅ Funciona em qualquer aparelho

_Muito mais que TV a cabo, por muito menos!_', true, 1, '📺', true, '❓ *Como Funciona*

Tire suas dúvidas:'),
    (p_seller_id, v_como_funciona_id, 'o_que_assistir', 'O que posso assistir', 'Conteúdo disponível', 'message', '🎬 *O que posso assistir?*

📺 Canais ao vivo (esportes, filmes, séries, infantil...)
🎬 Filmes lançamentos
📺 Séries completas
🎮 Canais de esportes 24h
👶 Canais infantis

_E muito mais!_', true, 2, '🎬', true, NULL),
    (p_seller_id, v_como_funciona_id, 'como_funciona_app', 'Como funciona o aplicativo', 'Uso do app', 'message', '📲 *Como funciona?*

1️⃣ Você recebe login e senha
2️⃣ Baixa o aplicativo
3️⃣ Insere os dados
4️⃣ Pronto! Assista onde quiser!

_Simples assim!_', true, 3, '📲', true, NULL),
    (p_seller_id, v_como_funciona_id, 'velocidade_internet', 'Velocidade de internet', 'Requisitos de conexão', 'message', '🌐 *Velocidade Necessária*

📺 SD: 5 Mbps
📺 HD: 10 Mbps
📺 Full HD: 15 Mbps
📺 4K: 25 Mbps

⚠️ Recomendamos conexão estável via cabo ou Wi-Fi 5GHz.', true, 4, '🌐', true, NULL);

  -- =====================================================================
  -- SUBMENUS: QUERO SER REVENDEDOR
  -- =====================================================================
  INSERT INTO bot_engine_dynamic_menus (seller_id, parent_menu_id, menu_key, title, description, menu_type, target_message, is_active, display_order, emoji, show_back_button, header_message)
  VALUES 
    (p_seller_id, v_revendedor_menu_id, 'planos_revenda', 'Planos para revenda', 'Opções de créditos', 'message', '💼 *Planos para Revenda*

💎 10 créditos - R$ XX
💎 25 créditos - R$ XX
💎 50 créditos - R$ XX
💎 100 créditos - R$ XX

_Os valores serão informados pelo atendente._', true, 1, '💎', true, '💼 *Seja um Revendedor*

Escolha uma opção:'),
    (p_seller_id, v_revendedor_menu_id, 'quanto_ganhar', 'Quanto posso ganhar', 'Potencial de lucro', 'message', '💰 *Quanto posso ganhar?*

Exemplo com margem de 100%:
• 10 vendas/mês = R$ XX
• 25 vendas/mês = R$ XX
• 50 vendas/mês = R$ XX

_Você define seu preço de venda!_', true, 2, '💰', true, NULL),
    (p_seller_id, v_revendedor_menu_id, 'painel_revendedor', 'Painel do revendedor', 'Recursos do painel', 'message', '🖥️ *Painel do Revendedor*

✅ Criar clientes automaticamente
✅ Gerenciar testes
✅ Renovar assinaturas
✅ Relatórios de vendas
✅ Suporte prioritário

_Tudo na palma da sua mão!_', true, 3, '🖥️', true, NULL),
    (p_seller_id, v_revendedor_menu_id, 'falar_comercial', 'Falar com comercial', 'Contato direto', 'command', '/atendente', true, 4, '👨‍💼', true, NULL);

  -- =====================================================================
  -- SUBMENUS: SUPORTE
  -- =====================================================================
  INSERT INTO bot_engine_dynamic_menus (seller_id, parent_menu_id, menu_key, title, description, menu_type, target_message, is_active, display_order, emoji, show_back_button, header_message)
  VALUES 
    (p_seller_id, v_suporte_menu_id, 'app_nao_abre', 'Aplicativo não abre', 'Problema ao abrir', 'message', '🔧 *Aplicativo não abre*

Tente estas soluções:

1️⃣ Feche e abra novamente
2️⃣ Limpe o cache do app
3️⃣ Reinicie o aparelho
4️⃣ Verifique sua internet

_Não funcionou? Fale com um atendente._', true, 1, '🔧', true, '🛠️ *Suporte Técnico*

Qual o seu problema?'),
    (p_seller_id, v_suporte_menu_id, 'travando_caindo', 'Travando ou caindo', 'Problemas de instabilidade', 'message', '⚠️ *Travando ou Caindo*

Possíveis causas:

📶 Internet instável
📱 Memória do aparelho cheia
🔄 App desatualizado

Soluções:
1️⃣ Teste outra rede de internet
2️⃣ Reinicie o modem
3️⃣ Limpe apps em segundo plano

_Persistindo, chame um atendente._', true, 2, '⚠️', true, NULL),
    (p_seller_id, v_suporte_menu_id, 'audio_legenda', 'Áudio ou legenda', 'Problemas de som/texto', 'message', '🔊 *Áudio ou Legenda*

Para ajustar:
1️⃣ Acesse o player
2️⃣ Clique no ícone de engrenagem ⚙️
3️⃣ Selecione áudio/legenda desejados

_Alguns conteúdos podem não ter todas as opções._', true, 3, '🔊', true, NULL),
    (p_seller_id, v_suporte_menu_id, 'financeiro', 'Financeiro', 'Pagamentos e cobranças', 'command', '/financeiro', true, 4, '💳', true, NULL),
    (p_seller_id, v_suporte_menu_id, 'falar_atendente', 'Falar com atendente', 'Atendimento humano', 'command', '/atendente', true, 5, '👨‍💻', true, NULL);

END;
$$;

-- 2. Atualizar a função handle_new_user para criar menus dinâmicos automaticamente
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  user_count INTEGER;
  trial_days INTEGER;
BEGIN
  -- Get trial days from settings (default 5 if not found)
  SELECT COALESCE(NULLIF(value, '')::integer, 5) INTO trial_days
  FROM public.app_settings
  WHERE key = 'seller_trial_days';
  
  IF trial_days IS NULL THEN
    trial_days := 5;
  END IF;

  -- Criar profile com WhatsApp
  INSERT INTO public.profiles (id, email, full_name, whatsapp, subscription_expires_at, is_permanent)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data ->> 'whatsapp',
    NOW() + (trial_days || ' days')::interval,
    false
  );

  -- Verificar se é o primeiro usuário
  SELECT COUNT(*) INTO user_count FROM public.user_roles;
  
  IF user_count = 0 THEN
    -- Primeiro usuário é admin permanente
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
    UPDATE public.profiles SET is_permanent = true WHERE id = NEW.id;
  ELSE
    -- Demais usuários são sellers
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'seller');
    -- Create default plans for new seller
    PERFORM create_default_plans_for_seller(NEW.id);
    -- Create default whatsapp templates for new seller
    PERFORM create_default_templates_for_seller(NEW.id);
    -- Create default dynamic menus for new seller
    PERFORM create_default_dynamic_menus(NEW.id);
  END IF;

  RETURN NEW;
END;
$function$;

-- 3. Garantir que RLS está ativo com políticas corretas
-- (A tabela e RLS já existem, apenas garantir políticas)
DO $$
BEGIN
  -- Verificar se a policy existe antes de criar
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'bot_engine_dynamic_menus' 
    AND policyname = 'Users can view own menus'
  ) THEN
    CREATE POLICY "Users can view own menus" ON public.bot_engine_dynamic_menus
      FOR SELECT USING (seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'bot_engine_dynamic_menus' 
    AND policyname = 'Users can create own menus'
  ) THEN
    CREATE POLICY "Users can create own menus" ON public.bot_engine_dynamic_menus
      FOR INSERT WITH CHECK (seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'bot_engine_dynamic_menus' 
    AND policyname = 'Users can update own menus'
  ) THEN
    CREATE POLICY "Users can update own menus" ON public.bot_engine_dynamic_menus
      FOR UPDATE USING (seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'bot_engine_dynamic_menus' 
    AND policyname = 'Users can delete own menus'
  ) THEN
    CREATE POLICY "Users can delete own menus" ON public.bot_engine_dynamic_menus
      FOR DELETE USING (seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;