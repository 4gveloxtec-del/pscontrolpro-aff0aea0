-- Atualizar mensagem de boas-vindas padrão para novos revendedores
ALTER TABLE public.bot_engine_config 
ALTER COLUMN welcome_message SET DEFAULT '👋 Olá, {primeiro_nome}! Seja bem-vindo(a) à {empresa} 🎬📺

Qualidade, estabilidade e o melhor do entretenimento para você!

Escolha uma opção abaixo 👇

1️⃣ Conhecer os Planos  
2️⃣ Teste Grátis 🎁  
3️⃣ Renovar Assinatura 🫰  
4️⃣ Suporte Técnico 🛠️  
5️⃣ Falar com Atendente 👨‍💻  
6️⃣ PS Control - Revenda ⭐';

-- Adicionar variável padrão {empresa} no custom_variables
ALTER TABLE public.bot_engine_config 
ALTER COLUMN custom_variables SET DEFAULT '{"empresa": "Sua Empresa IPTV"}'::jsonb;

-- Atualizar configs existentes que ainda não têm a variável empresa
UPDATE public.bot_engine_config 
SET custom_variables = COALESCE(custom_variables, '{}'::jsonb) || '{"empresa": "Minha Revenda"}'::jsonb
WHERE custom_variables IS NULL OR NOT (custom_variables ? 'empresa');