-- ETAPA 1: Criar templates globais de cobrança para D-1 e D-0
-- Esses templates funcionam tanto para envio manual quanto automático (Lembretes)
-- As variáveis são resolvidas no momento do envio pelo motor existente

-- Template 1: Lembrete D-1 (um dia antes do vencimento)
INSERT INTO public.billing_reminder_templates (
  id,
  seller_id,
  name,
  message,
  is_global,
  created_at,
  updated_at
) VALUES (
  'a0000001-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'Lembrete de pagamento – amanhã',
  'Olá {nome}, tudo bem? 😊

Passando para lembrar que o pagamento do seu plano {plano} vence amanhã, dia {vencimento}.

Valor: {valor}.

Qualquer dúvida ou imprevisto, é só me avisar.
Obrigado!',
  true,
  now(),
  now()
) ON CONFLICT (id) DO NOTHING;

-- Template 2: Lembrete D-0 (dia do vencimento)
INSERT INTO public.billing_reminder_templates (
  id,
  seller_id,
  name,
  message,
  is_global,
  created_at,
  updated_at
) VALUES (
  'a0000002-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000000',
  'Lembrete de pagamento – hoje',
  'Olá {nome}, bom dia! 👋

Conforme combinado, hoje ({vencimento}) é o vencimento do seu plano {plano}.

Valor pendente: {valor}.

Fico no aguardo da confirmação do pagamento.
Qualquer coisa, estou à disposição.',
  true,
  now(),
  now()
) ON CONFLICT (id) DO NOTHING;

-- Adicionar coluna reminder_type aos lembretes para distinguir D-1 e D-0
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'billing_reminders' 
    AND column_name = 'reminder_type'
  ) THEN
    ALTER TABLE public.billing_reminders 
    ADD COLUMN reminder_type text DEFAULT 'custom' CHECK (reminder_type IN ('d1', 'd0', 'custom'));
  END IF;
END $$;

-- Comentário explicando os tipos
COMMENT ON COLUMN public.billing_reminders.reminder_type IS 'Tipo de lembrete: d1 (1 dia antes), d0 (dia do vencimento), custom (personalizado)';