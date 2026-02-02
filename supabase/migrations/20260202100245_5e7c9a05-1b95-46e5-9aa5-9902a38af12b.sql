-- Remove o trigger que referencia tabelas do chatbot_v3 que foram dropadas
DROP TRIGGER IF EXISTS auto_create_chatbot_v3_on_profile ON public.profiles;

-- Remove a função que referencia tabelas inexistentes
DROP FUNCTION IF EXISTS auto_create_chatbot_v3_data() CASCADE;

-- Também remover triggers/funções relacionadas que podem estar causando problemas
DROP TRIGGER IF EXISTS on_profile_created_chatbot_v3 ON public.profiles;