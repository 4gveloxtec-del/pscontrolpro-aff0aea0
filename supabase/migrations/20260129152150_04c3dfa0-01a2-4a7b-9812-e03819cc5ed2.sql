-- Adicionar template "Vence Hoje" para todos os revendedores que ainda não possuem
-- Isso garante que todos tenham o template de cobrança do dia do vencimento

INSERT INTO public.whatsapp_templates (seller_id, name, type, message, is_default)
SELECT 
  p.id as seller_id,
  'Cobrança - Vence Hoje' as name,
  'collection' as type,
  'Olá {nome}! 🔴

Seu plano vence *HOJE*!

📅 Vencimento: {data_vencimento}
📦 Plano: {plano}
💰 Valor: R$ {valor}

Renove agora para não perder o acesso aos seus serviços!

Chave PIX: {pix}

Qualquer dúvida estou à disposição! 🙏' as message,
  true as is_default
FROM public.profiles p
WHERE p.id IN (
  SELECT DISTINCT seller_id FROM public.clients
)
AND NOT EXISTS (
  SELECT 1 FROM public.whatsapp_templates wt 
  WHERE wt.seller_id = p.id 
  AND (
    LOWER(wt.name) LIKE '%vence hoje%' 
    OR LOWER(wt.name) LIKE '%expira hoje%'
    OR LOWER(wt.name) LIKE '%hoje%cobrança%'
    OR LOWER(wt.name) LIKE '%cobrança%hoje%'
  )
);

-- Atualizar a função create_default_templates_for_seller para incluir o novo template
CREATE OR REPLACE FUNCTION public.create_default_templates_for_seller(seller_uuid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Template de Boas-vindas IPTV
  INSERT INTO whatsapp_templates (seller_id, name, type, message, is_default)
  VALUES (seller_uuid, 'Boas-vindas IPTV', 'welcome', 
    'Olá {nome}! 🎉

Seja bem-vindo(a)! Seu acesso IPTV está ativo.

📺 Servidor: {servidor}
👤 Login: {login}
🔑 Senha: {senha}
📅 Validade: {data_vencimento}

Aproveite! Qualquer dúvida, estou à disposição.',
    true)
  ON CONFLICT DO NOTHING;

  -- Template de Cobrança - Vence Hoje
  INSERT INTO whatsapp_templates (seller_id, name, type, message, is_default)
  VALUES (seller_uuid, 'Cobrança - Vence Hoje', 'collection',
    'Olá {nome}! 🔴

Seu plano vence *HOJE*!

📅 Vencimento: {data_vencimento}
📦 Plano: {plano}
💰 Valor: R$ {valor}

Renove agora para não perder o acesso aos seus serviços!

Chave PIX: {pix}

Qualquer dúvida estou à disposição! 🙏',
    true)
  ON CONFLICT DO NOTHING;

  -- Template de Cobrança - Vence Amanhã
  INSERT INTO whatsapp_templates (seller_id, name, type, message, is_default)
  VALUES (seller_uuid, 'Cobrança - Vence Amanhã', 'collection',
    'Olá {nome}! 🟠

Seu plano vence *amanhã*!

📅 Vencimento: {data_vencimento}
📦 Plano: {plano}
💰 Valor: R$ {valor}

Renove agora para garantir seu acesso sem interrupções!

Chave PIX: {pix}

Qualquer dúvida estou à disposição! 🙏',
    true)
  ON CONFLICT DO NOTHING;

  -- Template de Cobrança - Vencido
  INSERT INTO whatsapp_templates (seller_id, name, type, message, is_default)
  VALUES (seller_uuid, 'Cobrança - Vencido', 'collection',
    'Olá {nome}! 🔴

Seu plano está *vencido*!

📅 Vencimento: {data_vencimento}
📦 Plano: {plano}
💰 Valor: R$ {valor}

Renove agora para recuperar seu acesso!

Chave PIX: {pix}

Qualquer dúvida estou à disposição! 🙏',
    true)
  ON CONFLICT DO NOTHING;

  -- Template de Renovação
  INSERT INTO whatsapp_templates (seller_id, name, type, message, is_default)
  VALUES (seller_uuid, 'Renovação Confirmada', 'renewal',
    'Olá {nome}! ✅

Sua renovação foi confirmada com sucesso!

📦 Plano: {plano}
📅 Nova validade: {data_vencimento}

Obrigado pela confiança! 🙏',
    true)
  ON CONFLICT DO NOTHING;
END;
$$;