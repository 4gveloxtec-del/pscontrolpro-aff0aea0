-- Criar bot_engine_config de forma isolada
INSERT INTO public.bot_engine_config (
  seller_id,
  is_enabled,
  welcome_message,
  fallback_message,
  session_expire_minutes,
  default_timeout_minutes,
  max_inactivity_minutes,
  suppress_fallback_first_contact,
  welcome_cooldown_hours,
  typing_simulation,
  auto_reply_delay_ms
)
VALUES (
  '63f2d73c-1632-4ff0-a03c-42992e63d0fa',
  true,
  'Olá! 👋 Bem-vindo! Como posso ajudar você hoje?

1️⃣ Teste Grátis
2️⃣ Já sou cliente
3️⃣ Planos e valores
4️⃣ Falar com atendente

Digite o número da opção desejada:',
  'Desculpe, não entendi. Por favor, digite um número válido ou # para voltar ao menu principal.',
  30,
  5,
  60,
  true,
  24,
  true,
  1500
)
ON CONFLICT (seller_id) DO UPDATE SET
  is_enabled = true,
  welcome_message = EXCLUDED.welcome_message,
  fallback_message = EXCLUDED.fallback_message,
  updated_at = NOW();