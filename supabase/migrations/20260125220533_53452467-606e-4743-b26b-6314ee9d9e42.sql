-- Habilitar extensão pg_cron se não existir
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Criar job para verificar alertas de teste a cada 5 minutos
SELECT cron.schedule(
  'check-test-alerts-job',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://kgtqnjhmwsvswhrczqaf.supabase.co/functions/v1/check-test-alerts',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtndHFuamhtd3N2c3docmN6cWFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2MDA0OTAsImV4cCI6MjA4NDE3NjQ5MH0.douqXINkw8kUqyWksIIgxEUKBb4YuTw933mLwzSiwvk"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);