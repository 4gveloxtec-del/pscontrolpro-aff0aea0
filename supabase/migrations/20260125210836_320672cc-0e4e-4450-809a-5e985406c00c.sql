-- Expandir bot_engine_config com campos de personalização por revendedor
ALTER TABLE public.bot_engine_config
ADD COLUMN IF NOT EXISTS welcome_message TEXT DEFAULT 'Olá! 👋 Seja bem-vindo(a)! Como posso ajudar você hoje?',
ADD COLUMN IF NOT EXISTS welcome_media_url TEXT,
ADD COLUMN IF NOT EXISTS welcome_media_type TEXT DEFAULT 'none',
ADD COLUMN IF NOT EXISTS main_menu_key TEXT DEFAULT 'main',
ADD COLUMN IF NOT EXISTS business_hours_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS business_hours_start TIME DEFAULT '08:00',
ADD COLUMN IF NOT EXISTS business_hours_end TIME DEFAULT '22:00',
ADD COLUMN IF NOT EXISTS business_days INTEGER[] DEFAULT ARRAY[1,2,3,4,5,6],
ADD COLUMN IF NOT EXISTS outside_hours_message TEXT DEFAULT '⏰ Estamos fora do horário de atendimento. Retornaremos em breve!',
ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/Sao_Paulo',
ADD COLUMN IF NOT EXISTS auto_reply_delay_ms INTEGER DEFAULT 500,
ADD COLUMN IF NOT EXISTS typing_simulation BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS max_inactivity_minutes INTEGER DEFAULT 30,
ADD COLUMN IF NOT EXISTS inactivity_message TEXT DEFAULT 'Parece que você ficou ausente. Digite *menu* quando quiser continuar.',
ADD COLUMN IF NOT EXISTS human_takeover_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS human_takeover_message TEXT DEFAULT '👤 Você está sendo transferido para um atendente. Aguarde um momento...',
ADD COLUMN IF NOT EXISTS enabled_flows TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN IF NOT EXISTS disabled_commands TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN IF NOT EXISTS custom_variables JSONB DEFAULT '{}';

-- Índice para buscas por seller
CREATE INDEX IF NOT EXISTS idx_bot_engine_config_seller ON public.bot_engine_config(seller_id);

-- Comentários para documentação
COMMENT ON COLUMN public.bot_engine_config.welcome_message IS 'Mensagem inicial personalizada do bot';
COMMENT ON COLUMN public.bot_engine_config.welcome_media_url IS 'URL de mídia (imagem/vídeo) para enviar junto com boas-vindas';
COMMENT ON COLUMN public.bot_engine_config.welcome_media_type IS 'Tipo de mídia: none, image, video, audio, document';
COMMENT ON COLUMN public.bot_engine_config.main_menu_key IS 'Chave do menu principal (referência a bot_engine_menus.menu_key)';
COMMENT ON COLUMN public.bot_engine_config.business_hours_enabled IS 'Ativar controle de horário de funcionamento';
COMMENT ON COLUMN public.bot_engine_config.business_hours_start IS 'Hora de início do atendimento';
COMMENT ON COLUMN public.bot_engine_config.business_hours_end IS 'Hora de fim do atendimento';
COMMENT ON COLUMN public.bot_engine_config.business_days IS 'Dias da semana ativos (1=Seg, 7=Dom)';
COMMENT ON COLUMN public.bot_engine_config.outside_hours_message IS 'Mensagem quando fora do horário';
COMMENT ON COLUMN public.bot_engine_config.timezone IS 'Fuso horário para cálculo de horário comercial';
COMMENT ON COLUMN public.bot_engine_config.auto_reply_delay_ms IS 'Delay em ms antes de responder (humanização)';
COMMENT ON COLUMN public.bot_engine_config.typing_simulation IS 'Simular "digitando..." antes de responder';
COMMENT ON COLUMN public.bot_engine_config.max_inactivity_minutes IS 'Minutos de inatividade para encerrar sessão';
COMMENT ON COLUMN public.bot_engine_config.inactivity_message IS 'Mensagem ao encerrar por inatividade';
COMMENT ON COLUMN public.bot_engine_config.human_takeover_enabled IS 'Permitir transferência para atendente humano';
COMMENT ON COLUMN public.bot_engine_config.human_takeover_message IS 'Mensagem ao transferir para humano';
COMMENT ON COLUMN public.bot_engine_config.enabled_flows IS 'Array de flow_ids habilitados (vazio = todos)';
COMMENT ON COLUMN public.bot_engine_config.disabled_commands IS 'Comandos globais desabilitados para este seller';
COMMENT ON COLUMN public.bot_engine_config.custom_variables IS 'Variáveis personalizadas do seller ({empresa, pix, etc})';