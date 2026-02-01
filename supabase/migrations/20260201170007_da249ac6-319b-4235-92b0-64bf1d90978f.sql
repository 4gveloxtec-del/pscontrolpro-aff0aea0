-- Atualizar mensagem de boas-vindas na configuração do bot
UPDATE public.bot_engine_config 
SET 
  welcome_message = '👋 Olá, {nome}! Seja bem-vindo(a) à {empresa} 🎬📺

Qualidade, estabilidade e o melhor do entretenimento para você!


Escolha uma opção abaixo 👇

1️⃣ Conhecer os Planos  
2️⃣ Teste Grátis 🎁  
3️⃣ Renovar Assinatura 🫰  
4️⃣ Suporte Técnico 🛠️  
5️⃣ Falar com Atendente 👨‍💻  
6️⃣ PS Control - Revenda ⭐ {NOVIDADE}',
  updated_at = now()
WHERE seller_id = 'c4f9e3be-13ce-4648-9d88-9b1cccd4a67e';

-- Atualizar o nó MESSAGE_MENU_PRINCIPAL no fluxo com a mesma mensagem
UPDATE public.bot_engine_nodes 
SET 
  config = jsonb_set(
    COALESCE(config, '{}'::jsonb),
    '{message_text}',
    '"👋 Olá, {nome}! Seja bem-vindo(a) à {empresa} 🎬📺\n\nQualidade, estabilidade e o melhor do entretenimento para você!\n\n\nEscolha uma opção abaixo 👇\n\n1️⃣ Conhecer os Planos  \n2️⃣ Teste Grátis 🎁  \n3️⃣ Renovar Assinatura 🫰  \n4️⃣ Suporte Técnico 🛠️  \n5️⃣ Falar com Atendente 👨‍💻  \n6️⃣ PS Control - Revenda ⭐ {NOVIDADE}"'::jsonb
  ),
  updated_at = now()
WHERE flow_id = 'ed9a6856-8977-4e65-8bf5-8545c3a40654'
  AND name = 'MESSAGE_MENU_PRINCIPAL'
  AND node_type = 'message';

-- Atualizar também o menu dinâmico V2 (main) se existir
UPDATE public.bot_engine_dynamic_menus
SET 
  header_message = '👋 Olá, {nome}! Seja bem-vindo(a) à {empresa} 🎬📺

Qualidade, estabilidade e o melhor do entretenimento para você!


Escolha uma opção abaixo 👇',
  updated_at = now()
WHERE menu_key = 'main' 
  AND seller_id = 'c4f9e3be-13ce-4648-9d88-9b1cccd4a67e';