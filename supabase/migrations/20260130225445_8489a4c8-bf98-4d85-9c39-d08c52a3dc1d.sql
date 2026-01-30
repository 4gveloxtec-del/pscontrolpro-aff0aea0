-- ETAPA 1: Criar template universal de cobrança
-- Primeiro, remover os templates antigos D-1 e D-0 se existirem (serão substituídos pelo universal)
DELETE FROM public.billing_reminder_templates 
WHERE id IN ('a0000001-0000-0000-0000-000000000001', 'a0000002-0000-0000-0000-000000000002');

-- Inserir o novo template universal
INSERT INTO public.billing_reminder_templates (id, seller_id, name, message, is_global, created_at, created_by)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'Lembrete de pagamento – universal',
  'Olá {{nome}}, tudo bem? 😊

Passando para lembrar sobre o pagamento do seu plano {{plano}}, com vencimento em {{vencimento}}.

Valor: {{valor}}.

Qualquer dúvida ou imprevisto, é só me avisar.
Obrigado!',
  true,
  now(),
  NULL
) ON CONFLICT (id) DO UPDATE SET 
  name = EXCLUDED.name,
  message = EXCLUDED.message;

-- ETAPA 2: Adicionar coluna send_mode à tabela billing_reminders para controle de envio
-- Valores: 'auto' = envio automático, 'manual_api' = envio manual via API, 'push_only' = apenas notificação push
ALTER TABLE public.billing_reminders 
ADD COLUMN IF NOT EXISTS send_mode text DEFAULT 'auto' 
CHECK (send_mode IN ('auto', 'manual_api', 'push_only'));

-- Adicionar coluna para mensagem editável (cópia do template que pode ser modificada)
ALTER TABLE public.billing_reminders 
ADD COLUMN IF NOT EXISTS edited_message text;

-- Comentário explicativo
COMMENT ON COLUMN public.billing_reminders.send_mode IS 'Modo de envio: auto (automático via API), manual_api (manual via API), push_only (apenas notificação push)';
COMMENT ON COLUMN public.billing_reminders.edited_message IS 'Mensagem editada pelo revendedor antes do envio';