-- Atualizar instância do SANDEL para marcar webhook como configurado
UPDATE whatsapp_seller_instances 
SET 
  webhook_auto_configured = true,
  configuration_error = null,
  updated_at = now()
WHERE seller_id = 'c4f9e3be-13ce-4648-9d88-9b1cccd4a67e';