-- Adicionar coluna para controlar notificações push de mensagens automáticas
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS push_on_auto_message boolean DEFAULT true;

-- Comentário descritivo
COMMENT ON COLUMN public.profiles.push_on_auto_message IS 'Quando ativado, envia notificação push para o revendedor sempre que uma mensagem automática é enviada para um cliente (boas-vindas, lembretes, renovações)';