-- Atualizar a instância para incluir nome original (Sandel) para compatibilidade com webhook
UPDATE public.whatsapp_seller_instances
SET original_instance_name = 'Sandel',
    updated_at = NOW()
WHERE seller_id = '63f2d73c-1632-4ff0-a03c-42992e63d0fa'
  AND instance_name = 'sanplay_c4f9';