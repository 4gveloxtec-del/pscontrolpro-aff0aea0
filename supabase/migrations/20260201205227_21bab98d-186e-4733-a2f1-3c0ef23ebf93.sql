-- Migração: Restaurar estrutura hierárquica padrão para nós de menu sem submenus
-- Atualiza APENAS os nós entry_point que têm menu_options mas SEM submenu_options aninhados

UPDATE public.bot_engine_nodes
SET 
  config = jsonb_build_object(
    'message_type', 'menu',
    'message_text', '👋 Olá, {primeiro_nome}! Seja bem-vindo(a) à {empresa} 🎬📺

Qualidade, estabilidade e o melhor do entretenimento para você!',
    'menu_title', 'Menu Principal',
    'show_back_button', true,
    'back_button_text', '↩️ Voltar',
    'silent_on_invalid', true,
    'menu_options', jsonb_build_array(
      -- 1. PLANOS (com submenus)
      jsonb_build_object(
        'id', 'planos',
        'emoji', '📺',
        'title', 'Conhecer os Planos',
        'description', 'Veja nossos planos e valores',
        'action_type', 'submenu',
        'submenu_options', jsonb_build_array(
          jsonb_build_object('id', 'planos_iptv', 'emoji', '📡', 'title', 'IPTV', 'description', 'Canais ao vivo + Filmes + Séries', 'action_type', 'message', 'message_text', '📡 *PLANOS IPTV*

Todos os planos incluem:
✅ +15.000 canais ao vivo
✅ +80.000 filmes e séries
✅ Guia de programação (EPG)
✅ Suporte 7 dias por semana

💰 *Valores:*
• Mensal: R$ 30,00
• Trimestral: R$ 75,00
• Semestral: R$ 140,00
• Anual: R$ 250,00

Digite *ASSINAR* para contratar!'),
          jsonb_build_object('id', 'planos_p2p', 'emoji', '🎬', 'title', 'P2P', 'description', 'Filmes e Séries On Demand', 'action_type', 'message', 'message_text', '🎬 *PLANOS P2P*

Acesso ilimitado a filmes e séries:
✅ Catálogo atualizado diariamente
✅ Qualidade Full HD e 4K
✅ Legendas em português
✅ Sem anúncios

💰 *Valores:*
• Mensal: R$ 20,00
• Trimestral: R$ 50,00
• Anual: R$ 180,00

Digite *ASSINAR* para contratar!')
        )
      ),
      -- 2. TESTE GRÁTIS (com submenus)
      jsonb_build_object(
        'id', 'teste',
        'emoji', '🎁',
        'title', 'Teste Grátis',
        'description', 'Experimente por 24 horas',
        'action_type', 'submenu',
        'submenu_options', jsonb_build_array(
          jsonb_build_object('id', 'teste_smarttv', 'emoji', '📺', 'title', 'Smart TV', 'description', 'Samsung, LG, etc', 'action_type', 'command', 'command', '/teste'),
          jsonb_build_object('id', 'teste_tvbox', 'emoji', '📦', 'title', 'TV Box / Android', 'description', 'Dispositivos Android', 'action_type', 'command', 'command', '/teste'),
          jsonb_build_object('id', 'teste_celular', 'emoji', '📱', 'title', 'Celular / Tablet', 'description', 'iOS e Android', 'action_type', 'command', 'command', '/teste')
        )
      ),
      -- 3. RENOVAR
      jsonb_build_object(
        'id', 'renovar',
        'emoji', '🫰',
        'title', 'Renovar Assinatura',
        'description', 'Renove seu plano atual',
        'action_type', 'message',
        'message_text', '🫰 *RENOVAR ASSINATURA*

Para renovar, informe seu *login* ou *e-mail* cadastrado.

Um atendente irá verificar seu cadastro e gerar o PIX para pagamento!'
      ),
      -- 4. SUPORTE (com submenus)
      jsonb_build_object(
        'id', 'suporte',
        'emoji', '🛠️',
        'title', 'Suporte Técnico',
        'description', 'Resolva problemas técnicos',
        'action_type', 'submenu',
        'submenu_options', jsonb_build_array(
          jsonb_build_object('id', 'suporte_app', 'emoji', '📱', 'title', 'App não abre', 'description', 'Problemas com o aplicativo', 'action_type', 'message', 'message_text', '📱 *APP NÃO ABRE / TRAVANDO*

Tente as seguintes soluções:

1️⃣ *Reinicie o dispositivo* completamente
2️⃣ *Limpe o cache* do aplicativo
3️⃣ *Desinstale e reinstale* o app
4️⃣ Verifique sua *conexão de internet*

Se o problema persistir, fale com um *atendente*.'),
          jsonb_build_object('id', 'suporte_canais', 'emoji', '📡', 'title', 'Canais fora do ar', 'description', 'Canais não carregam', 'action_type', 'message', 'message_text', '📡 *CANAIS FORA DO AR*

Alguns canais podem estar em manutenção temporária.

✅ Atualize a lista de canais no app
✅ Verifique se o problema é em todos ou específicos
✅ Aguarde alguns minutos e tente novamente

Se o problema persistir, fale com um *atendente*.'),
          jsonb_build_object('id', 'suporte_outro', 'emoji', '❓', 'title', 'Outro problema', 'description', 'Descreva seu problema', 'action_type', 'transfer_human', 'message_text', '❓ *OUTRO PROBLEMA*

Por favor, descreva o problema que você está enfrentando e um atendente irá te ajudar em breve!')
        )
      ),
      -- 5. ATENDENTE
      jsonb_build_object(
        'id', 'atendente',
        'emoji', '👨‍💻',
        'title', 'Falar com Atendente',
        'description', 'Atendimento humano',
        'action_type', 'transfer_human',
        'message_text', '👨‍💻 *ATENDIMENTO HUMANO*

Aguarde um momento, estou notificando um atendente...

⏳ Em breve você será atendido!'
      ),
      -- 6. REVENDA
      jsonb_build_object(
        'id', 'pscontrol',
        'emoji', '⭐',
        'title', 'PS Control - Revenda',
        'description', 'Seja um revendedor',
        'action_type', 'message',
        'message_text', '⭐ *PS CONTROL - SISTEMA DE REVENDA*

Quer ter seu próprio negócio de IPTV?

Com o PS Control você:
✅ Gerencia seus clientes
✅ Controla vencimentos
✅ Envia mensagens automáticas
✅ Recebe pagamentos via PIX

💰 *Comece hoje mesmo!*

Quer saber mais? Fale com um *atendente*!'
      )
    )
  ),
  updated_at = now()
WHERE 
  is_entry_point = true
  AND node_type = 'message'
  AND config->>'message_type' = 'menu'
  AND (
    -- Nós sem menu_options ou com menu_options flat (sem submenu_options)
    config->'menu_options' IS NULL 
    OR jsonb_array_length(config->'menu_options') = 0
    OR NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(config->'menu_options') AS opt
      WHERE opt->'submenu_options' IS NOT NULL AND jsonb_array_length(opt->'submenu_options') > 0
    )
  );