-- Forçar reconexão de todas as instâncias WhatsApp EXCETO SANDEL (31973004131)
-- Isso vai limpar o estado de logout manual e permitir reconexão automática

UPDATE public.whatsapp_seller_instances
SET 
  last_evolution_state = 'admin_force_reconnect',
  updated_at = NOW()
WHERE seller_id NOT IN (
  -- Excluir SANDEL pelo WhatsApp
  SELECT id FROM public.profiles WHERE whatsapp LIKE '%31973004131%'
)
AND is_connected = true;