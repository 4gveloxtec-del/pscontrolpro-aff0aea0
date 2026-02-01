-- Renomear o fluxo de "Menu Principal" para "FLUXO IPTV"
-- Operação segura: apenas atualiza o campo 'name', mantendo todos os outros dados intactos

UPDATE public.bot_engine_flows
SET 
  name = 'FLUXO IPTV',
  updated_at = now()
WHERE id = '3f256fbd-6be2-4120-aefc-bb0163a016e1'
  AND seller_id = 'c4f9e3be-13ce-4648-9d88-9b1cccd4a67e';