-- Adiciona campo para modelo/identificação do dispositivo do cliente
-- Exemplo: "Samsung 55 Sala", "LG OLED Quarto", "Celular João"
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS device_model text;