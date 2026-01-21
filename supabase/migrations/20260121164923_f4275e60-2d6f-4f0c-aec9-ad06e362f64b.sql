-- Adicionar colunas de controle de passos na tabela de contatos
ALTER TABLE public.chatbot_v3_contacts 
ADD COLUMN IF NOT EXISTS previous_menu_key TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS last_sent_menu_key TEXT DEFAULT NULL;

-- Adicionar comentários explicativos
COMMENT ON COLUMN public.chatbot_v3_contacts.current_menu_key IS 'Passo atual do usuário';
COMMENT ON COLUMN public.chatbot_v3_contacts.previous_menu_key IS 'Passo anterior (para voltar)';
COMMENT ON COLUMN public.chatbot_v3_contacts.last_sent_menu_key IS 'Último passo enviado (anti-repetição)';

-- Adicionar campo para histórico de navegação (pilha de passos)
ALTER TABLE public.chatbot_v3_contacts 
ADD COLUMN IF NOT EXISTS navigation_stack TEXT[] DEFAULT ARRAY[]::TEXT[];

COMMENT ON COLUMN public.chatbot_v3_contacts.navigation_stack IS 'Pilha de navegação para voltar múltiplos níveis';

-- Adicionar campo para indicar se List Message é suportado
ALTER TABLE public.chatbot_v3_config
ADD COLUMN IF NOT EXISTS use_list_message BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS list_button_text TEXT DEFAULT '📋 Ver opções';

-- Adicionar campo de ID único para opções (para List Message)
ALTER TABLE public.chatbot_v3_options
ADD COLUMN IF NOT EXISTS list_id TEXT GENERATED ALWAYS AS ('lm_' || COALESCE(target_menu_key, action_type || '_' || option_number)) STORED;

-- Adicionar campo de ID para menus
ALTER TABLE public.chatbot_v3_menus
ADD COLUMN IF NOT EXISTS list_id TEXT GENERATED ALWAYS AS ('lm_' || menu_key) STORED;