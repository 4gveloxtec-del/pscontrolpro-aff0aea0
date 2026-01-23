-- Habilitar logs para debug do revendedor específico
UPDATE test_integration_config 
SET logs_enabled = true 
WHERE seller_id = 'c4f9e3be-13ce-4648-9d88-9b1cccd4a67e';

-- Verificar o resultado
SELECT id, seller_id, logs_enabled, auto_create_client, server_id 
FROM test_integration_config 
WHERE seller_id = 'c4f9e3be-13ce-4648-9d88-9b1cccd4a67e';