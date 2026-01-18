-- Enable required extensions for cron jobs
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Create cron job to execute self-healing function every 5 minutes
SELECT cron.schedule(
  'self-healing-check',
  '*/5 * * * *',
  $$
  SELECT
    net.http_post(
        url:='https://kgtqnjhmwsvswhrczqaf.supabase.co/functions/v1/self-healing',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtndHFuamhtd3N2c3docmN6cWFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2MDA0OTAsImV4cCI6MjA4NDE3NjQ5MH0.douqXINkw8kUqyWksIIgxEUKBb4YuTw933mLwzSiwvk"}'::jsonb,
        body:='{}'::jsonb
    ) as request_id;
  $$
);