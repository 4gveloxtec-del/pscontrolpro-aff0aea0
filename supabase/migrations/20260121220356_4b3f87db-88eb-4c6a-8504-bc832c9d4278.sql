-- Adicionar gatilho "inicio" para usuários existentes que ainda não têm
INSERT INTO chatbot_v3_triggers (user_id, trigger_name, keywords, action_type, target_menu_key, priority, is_active)
SELECT 
  user_id,
  'inicio',
  ARRAY['inicio', 'início', 'começo', 'menu principal', '00', '##'],
  'goto_home',
  'main',
  100,
  true
FROM chatbot_v3_config
WHERE NOT EXISTS (
  SELECT 1 FROM chatbot_v3_triggers t 
  WHERE t.user_id = chatbot_v3_config.user_id 
  AND t.trigger_name = 'inicio'
);

-- Atualizar a função de auto-criação para incluir o gatilho "inicio"
CREATE OR REPLACE FUNCTION auto_create_chatbot_v3_data()
RETURNS TRIGGER AS $$
BEGIN
  -- Criar config padrão
  INSERT INTO chatbot_v3_config (user_id, is_enabled, fallback_message, welcome_message, use_list_message, list_button_text)
  VALUES (
    NEW.id,
    true,
    'Não entendi 😕 Digite *MENU* para ver as opções disponíveis.',
    'Olá! Seja bem-vindo! Como posso ajudar?',
    true,
    '📋 Ver opções'
  )
  ON CONFLICT (user_id) DO NOTHING;
  
  -- Criar menu principal
  INSERT INTO chatbot_v3_menus (user_id, menu_key, list_id, title, message_text, parent_menu_key, sort_order)
  VALUES (
    NEW.id,
    'main',
    'lm_main',
    'Menu Principal',
    '👋 *Olá!* Seja bem-vindo!

Escolha uma opção:

*1* - 📋 Ver Planos
*2* - 🆓 Solicitar Teste
*3* - 👤 Falar com Atendente

*0* - Voltar | *00* - Menu Principal',
    NULL,
    0
  )
  ON CONFLICT DO NOTHING;
  
  -- Criar gatilhos padrão
  INSERT INTO chatbot_v3_triggers (user_id, trigger_name, keywords, action_type, target_menu_key, priority)
  VALUES
    (NEW.id, 'menu', ARRAY['menu', 'oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite'], 'goto_menu', 'main', 90),
    (NEW.id, 'voltar', ARRAY['voltar', 'retornar', 'anterior', '*', '#'], 'goto_previous', NULL, 80),
    (NEW.id, 'inicio', ARRAY['inicio', 'início', 'começo', 'menu principal', '00', '##'], 'goto_home', 'main', 100),
    (NEW.id, 'humano', ARRAY['atendente', 'humano', 'pessoa', 'falar com alguém', 'ajuda humana'], 'human', NULL, 70)
  ON CONFLICT DO NOTHING;
  
  -- Criar variáveis padrão
  INSERT INTO chatbot_v3_variables (user_id, variable_key, variable_value, description, is_system)
  VALUES
    (NEW.id, 'empresa', 'Minha Empresa', 'Nome da empresa', true),
    (NEW.id, 'pix', 'pix@exemplo.com', 'Chave PIX', true),
    (NEW.id, 'whatsapp', '(00) 00000-0000', 'WhatsApp de contato', true),
    (NEW.id, 'horario', 'Seg-Sex 9h às 18h', 'Horário de atendimento', true)
  ON CONFLICT DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;