-- =====================================================
-- CRON: Automação WhatsApp para envio de mensagens
-- Executa 3 vezes ao dia: 8h, 14h e 19h (horário UTC -3 = BR)
-- Para evitar banimento, executa em horários comerciais
-- =====================================================

-- Garantir que as extensões estão habilitadas
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remover cron existente se houver (para evitar duplicatas)
SELECT cron.unschedule('whatsapp-automation-morning')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'whatsapp-automation-morning');

SELECT cron.unschedule('whatsapp-automation-afternoon')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'whatsapp-automation-afternoon');

SELECT cron.unschedule('whatsapp-automation-evening')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'whatsapp-automation-evening');

-- Criar CRON para automação às 8h (11h UTC)
SELECT cron.schedule(
  'whatsapp-automation-morning',
  '0 11 * * *',
  $$
  SELECT net.http_post(
    url := 'https://kgtqnjhmwsvswhrczqaf.supabase.co/functions/v1/whatsapp-automation',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtndHFuamhtd3N2c3docmN6cWFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2MDA0OTAsImV4cCI6MjA4NDE3NjQ5MH0.douqXINkw8kUqyWksIIgxEUKBb4YuTw933mLwzSiwvk"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- Criar CRON para automação às 14h (17h UTC)
SELECT cron.schedule(
  'whatsapp-automation-afternoon',
  '0 17 * * *',
  $$
  SELECT net.http_post(
    url := 'https://kgtqnjhmwsvswhrczqaf.supabase.co/functions/v1/whatsapp-automation',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtndHFuamhtd3N2c3docmN6cWFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2MDA0OTAsImV4cCI6MjA4NDE3NjQ5MH0.douqXINkw8kUqyWksIIgxEUKBb4YuTw933mLwzSiwvk"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- Criar CRON para automação às 19h (22h UTC)
SELECT cron.schedule(
  'whatsapp-automation-evening',
  '0 22 * * *',
  $$
  SELECT net.http_post(
    url := 'https://kgtqnjhmwsvswhrczqaf.supabase.co/functions/v1/whatsapp-automation',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtndHFuamhtd3N2c3docmN6cWFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2MDA0OTAsImV4cCI6MjA4NDE3NjQ5MH0.douqXINkw8kUqyWksIIgxEUKBb4YuTw933mLwzSiwvk"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);