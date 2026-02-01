-- Adicionar coluna para modo de texto nos menus do bot
-- Quando true, envia menus como texto formatado em vez de listas interativas

ALTER TABLE public.bot_engine_config 
ADD COLUMN IF NOT EXISTS use_text_menus BOOLEAN DEFAULT false;

-- Comentário para documentação
COMMENT ON COLUMN public.bot_engine_config.use_text_menus IS 'Quando true, envia menus como texto formatado em vez de listas/botões interativos do WhatsApp. Útil para versões da Evolution API que não suportam mensagens interativas.';
