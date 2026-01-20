-- Resetar contadores de reparo que estavam em loop
UPDATE public.system_health_status 
SET 
  repair_attempts = 0,
  consecutive_failures = 0,
  last_error = NULL,
  status = 'healthy',
  last_repair_at = NULL,
  last_repair_success = NULL
WHERE component_name IN ('whatsapp_api', 'database_connection', 'seller_instances', 'message_queue', 'chatbot_webhook');

-- Resetar contadores diários de execução das ações de reparo
UPDATE public.system_repair_actions 
SET executions_today = 0
WHERE executions_today > 0;

-- Limpar logs antigos do sistema de autocura (mais de 7 dias)
DELETE FROM public.system_health_logs 
WHERE created_at < NOW() - INTERVAL '7 days';