-- Drop all chatbot-related tables
-- Note: Order matters due to foreign key constraints

-- Drop chatbot V3 tables
DROP TABLE IF EXISTS public.chatbot_v3_logs CASCADE;
DROP TABLE IF EXISTS public.chatbot_v3_options CASCADE;
DROP TABLE IF EXISTS public.chatbot_v3_menus CASCADE;
DROP TABLE IF EXISTS public.chatbot_v3_triggers CASCADE;
DROP TABLE IF EXISTS public.chatbot_v3_variables CASCADE;
DROP TABLE IF EXISTS public.chatbot_v3_contacts CASCADE;
DROP TABLE IF EXISTS public.chatbot_v3_config CASCADE;

-- Drop legacy chatbot tables
DROP TABLE IF EXISTS public.chatbot_flow_sessions CASCADE;
DROP TABLE IF EXISTS public.chatbot_flow_nodes CASCADE;
DROP TABLE IF EXISTS public.chatbot_flows CASCADE;
DROP TABLE IF EXISTS public.chatbot_interactions CASCADE;
DROP TABLE IF EXISTS public.chatbot_contacts CASCADE;
DROP TABLE IF EXISTS public.chatbot_rules CASCADE;
DROP TABLE IF EXISTS public.chatbot_settings CASCADE;
DROP TABLE IF EXISTS public.chatbot_template_categories CASCADE;
DROP TABLE IF EXISTS public.chatbot_templates CASCADE;
DROP TABLE IF EXISTS public.chatbot_send_logs CASCADE;

-- Drop admin chatbot tables
DROP TABLE IF EXISTS public.admin_chatbot_interactions CASCADE;
DROP TABLE IF EXISTS public.admin_chatbot_contacts CASCADE;
DROP TABLE IF EXISTS public.admin_chatbot_keywords CASCADE;
DROP TABLE IF EXISTS public.admin_chatbot_config CASCADE;