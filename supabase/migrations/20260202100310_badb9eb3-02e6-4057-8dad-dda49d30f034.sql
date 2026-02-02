-- Remove o trigger com nome correto que foi criado na migração 20260121162026
DROP TRIGGER IF EXISTS trigger_auto_create_chatbot_v3 ON public.profiles;