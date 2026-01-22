-- Atualizar tabela system_health_status para remover chatbot e adicionar seller_contacts
UPDATE system_health_status 
SET component_name = 'seller_contacts',
    status = 'healthy',
    last_error = NULL,
    consecutive_failures = 0,
    metadata = '{"status": "check_skipped"}'::jsonb
WHERE component_name = 'chatbot_webhook';

-- Resetar status do message_queue para healthy (agora usa tabela correta)
UPDATE system_health_status 
SET status = 'healthy',
    last_error = NULL,
    consecutive_failures = 0,
    metadata = '{"status": "table_checked"}'::jsonb
WHERE component_name = 'message_queue';