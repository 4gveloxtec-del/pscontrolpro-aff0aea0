-- ============================================================
-- REORGANIZAÇÃO DO BOT ENGINE - FLUXOS MODULARES
-- ============================================================
-- REGRAS SEGUIDAS:
-- 1. Backup completo do fluxo atual
-- 2. Criação de 10 novos fluxos
-- 3. Movimentação de nós (não deleção)
-- 4. Navegação via GOTO entre fluxos
-- 5. Preservação total do comportamento
-- ============================================================

-- Variáveis de referência
DO $$
DECLARE
  v_seller_id UUID := 'c4f9e3be-13ce-4648-9d88-9b1cccd4a67e';
  v_old_flow_id UUID := '3f256fbd-6be2-4120-aefc-bb0163a016e1';
  v_backup_flow_id UUID;
  v_menu_principal_id UUID;
  v_planos_id UUID;
  v_plano_mensal_id UUID;
  v_plano_trimestral_id UUID;
  v_plano_semestral_id UUID;
  v_plano_anual_id UUID;
  v_teste_gratis_id UUID;
  v_renovar_id UUID;
  v_atendimento_id UUID;
  v_ps_control_id UUID;
  v_node RECORD;
  v_edge RECORD;
  v_new_node_id UUID;
  v_node_mapping JSONB := '{}';
BEGIN
  -- ============================================================
  -- ETAPA 1: CRIAR FLUXO DE BACKUP
  -- ============================================================
  INSERT INTO public.bot_engine_flows (
    seller_id, name, description, trigger_type, trigger_keywords,
    is_active, is_default, priority
  ) VALUES (
    v_seller_id,
    'BACKUP_FLUXO_ATUAL',
    'Backup automático do fluxo original antes da reorganização',
    'manual',
    ARRAY[]::TEXT[],
    FALSE,
    FALSE,
    0
  ) RETURNING id INTO v_backup_flow_id;

  -- Duplicar todos os nós do fluxo original para o backup
  FOR v_node IN 
    SELECT * FROM public.bot_engine_nodes WHERE flow_id = v_old_flow_id
  LOOP
    INSERT INTO public.bot_engine_nodes (
      flow_id, seller_id, node_type, name, config, 
      position_x, position_y, is_entry_point
    ) VALUES (
      v_backup_flow_id, v_seller_id, v_node.node_type, v_node.name, v_node.config,
      v_node.position_x, v_node.position_y, v_node.is_entry_point
    ) RETURNING id INTO v_new_node_id;
    
    -- Mapear ID antigo para novo
    v_node_mapping := v_node_mapping || jsonb_build_object(v_node.id::TEXT, v_new_node_id::TEXT);
  END LOOP;

  -- Duplicar edges para o backup
  FOR v_edge IN 
    SELECT * FROM public.bot_engine_edges WHERE flow_id = v_old_flow_id
  LOOP
    INSERT INTO public.bot_engine_edges (
      flow_id, seller_id, source_node_id, target_node_id,
      condition_type, condition_value, label, priority
    ) VALUES (
      v_backup_flow_id, 
      v_seller_id,
      (v_node_mapping->>v_edge.source_node_id::TEXT)::UUID,
      (v_node_mapping->>v_edge.target_node_id::TEXT)::UUID,
      v_edge.condition_type, v_edge.condition_value, v_edge.label, v_edge.priority
    );
  END LOOP;

  -- ============================================================
  -- ETAPA 2: CRIAR OS 10 NOVOS FLUXOS
  -- ============================================================
  
  -- MENU_PRINCIPAL (Entry Point)
  INSERT INTO public.bot_engine_flows (
    seller_id, name, description, trigger_type, trigger_keywords,
    is_active, is_default, priority
  ) VALUES (
    v_seller_id,
    'MENU_PRINCIPAL',
    'Menu principal do bot - ponto de entrada',
    'first_message',
    ARRAY['oi', 'olá', 'ola', 'menu', 'inicio', 'começar']::TEXT[],
    TRUE,
    TRUE,
    100
  ) RETURNING id INTO v_menu_principal_id;

  -- PLANOS
  INSERT INTO public.bot_engine_flows (
    seller_id, name, description, trigger_type, trigger_keywords,
    is_active, is_default, priority
  ) VALUES (
    v_seller_id,
    'PLANOS',
    'Submenu de planos disponíveis',
    'keyword',
    ARRAY['planos', 'preços', 'valores']::TEXT[],
    TRUE,
    FALSE,
    90
  ) RETURNING id INTO v_planos_id;

  -- PLANO_MENSAL
  INSERT INTO public.bot_engine_flows (
    seller_id, name, description, trigger_type, trigger_keywords,
    is_active, is_default, priority
  ) VALUES (
    v_seller_id,
    'PLANO_MENSAL',
    'Detalhes do plano mensal',
    'keyword',
    ARRAY['mensal']::TEXT[],
    TRUE,
    FALSE,
    80
  ) RETURNING id INTO v_plano_mensal_id;

  -- PLANO_TRIMESTRAL
  INSERT INTO public.bot_engine_flows (
    seller_id, name, description, trigger_type, trigger_keywords,
    is_active, is_default, priority
  ) VALUES (
    v_seller_id,
    'PLANO_TRIMESTRAL',
    'Detalhes do plano trimestral',
    'keyword',
    ARRAY['trimestral']::TEXT[],
    TRUE,
    FALSE,
    80
  ) RETURNING id INTO v_plano_trimestral_id;

  -- PLANO_SEMESTRAL
  INSERT INTO public.bot_engine_flows (
    seller_id, name, description, trigger_type, trigger_keywords,
    is_active, is_default, priority
  ) VALUES (
    v_seller_id,
    'PLANO_SEMESTRAL',
    'Detalhes do plano semestral',
    'keyword',
    ARRAY['semestral']::TEXT[],
    TRUE,
    FALSE,
    80
  ) RETURNING id INTO v_plano_semestral_id;

  -- PLANO_ANUAL
  INSERT INTO public.bot_engine_flows (
    seller_id, name, description, trigger_type, trigger_keywords,
    is_active, is_default, priority
  ) VALUES (
    v_seller_id,
    'PLANO_ANUAL',
    'Detalhes do plano anual',
    'keyword',
    ARRAY['anual']::TEXT[],
    TRUE,
    FALSE,
    80
  ) RETURNING id INTO v_plano_anual_id;

  -- TESTE_GRATIS
  INSERT INTO public.bot_engine_flows (
    seller_id, name, description, trigger_type, trigger_keywords,
    is_active, is_default, priority
  ) VALUES (
    v_seller_id,
    'TESTE_GRATIS',
    'Fluxo de teste grátis por dispositivo',
    'keyword',
    ARRAY['teste', 'testar', 'experimentar']::TEXT[],
    TRUE,
    FALSE,
    85
  ) RETURNING id INTO v_teste_gratis_id;

  -- RENOVAR
  INSERT INTO public.bot_engine_flows (
    seller_id, name, description, trigger_type, trigger_keywords,
    is_active, is_default, priority
  ) VALUES (
    v_seller_id,
    'RENOVAR',
    'Fluxo de renovação de assinatura',
    'keyword',
    ARRAY['renovar', 'renovação', 'pagar']::TEXT[],
    TRUE,
    FALSE,
    85
  ) RETURNING id INTO v_renovar_id;

  -- ATENDIMENTO
  INSERT INTO public.bot_engine_flows (
    seller_id, name, description, trigger_type, trigger_keywords,
    is_active, is_default, priority
  ) VALUES (
    v_seller_id,
    'ATENDIMENTO',
    'Fluxo de atendimento/suporte',
    'keyword',
    ARRAY['atendimento', 'suporte', 'ajuda', 'atendente']::TEXT[],
    TRUE,
    FALSE,
    85
  ) RETURNING id INTO v_atendimento_id;

  -- PS_CONTROL
  INSERT INTO public.bot_engine_flows (
    seller_id, name, description, trigger_type, trigger_keywords,
    is_active, is_default, priority
  ) VALUES (
    v_seller_id,
    'PS_CONTROL',
    'Submenu PS Control',
    'keyword',
    ARRAY['ps control', 'pscontrol', 'ps']::TEXT[],
    TRUE,
    FALSE,
    80
  ) RETURNING id INTO v_ps_control_id;

  -- ============================================================
  -- ETAPA 3: MOVER NÓS PARA OS NOVOS FLUXOS
  -- ============================================================

  -- MENU_PRINCIPAL
  UPDATE public.bot_engine_nodes SET flow_id = v_menu_principal_id
  WHERE flow_id = v_old_flow_id AND name IN (
    'MESSAGE_MENU_PRINCIPAL', 'INPUT_MENU_PRINCIPAL', 'CONDITION_MENU_PRINCIPAL'
  );

  -- PLANOS
  UPDATE public.bot_engine_nodes SET flow_id = v_planos_id
  WHERE flow_id = v_old_flow_id AND name IN (
    'MESSAGE_PLANOS', 'INPUT_PLANOS_OPCAO', 'CONDITION_PLANOS'
  );

  -- PLANO_MENSAL
  UPDATE public.bot_engine_nodes SET flow_id = v_plano_mensal_id
  WHERE flow_id = v_old_flow_id AND name IN (
    'MESSAGE_PLANO_MENSAL', 'MESSAGE_MENSAL_1TELA', 'MESSAGE_MENSAL_2TELAS', 'MESSAGE_MENSAL_3TELAS',
    'INPUT_MENSAL_TELAS', 'CONDITION_MENSAL_TELAS',
    'INPUT_MENSAL_1TELA_ACAO', 'CONDITION_MENSAL_1TELA_ACAO',
    'INPUT_MENSAL_2TELAS_ACAO', 'CONDITION_MENSAL_2TELAS_ACAO',
    'INPUT_MENSAL_3TELAS_ACAO', 'CONDITION_MENSAL_3TELAS_ACAO'
  );

  -- PLANO_TRIMESTRAL
  UPDATE public.bot_engine_nodes SET flow_id = v_plano_trimestral_id
  WHERE flow_id = v_old_flow_id AND name IN (
    'MESSAGE_PLANO_TRIMESTRAL', 'INPUT_TRIMESTRAL_NAV', 'CONDITION_TRIMESTRAL_NAV'
  );

  -- PLANO_SEMESTRAL
  UPDATE public.bot_engine_nodes SET flow_id = v_plano_semestral_id
  WHERE flow_id = v_old_flow_id AND name IN (
    'MESSAGE_PLANO_SEMESTRAL', 'INPUT_SEMESTRAL_NAV', 'CONDITION_SEMESTRAL_NAV'
  );

  -- PLANO_ANUAL
  UPDATE public.bot_engine_nodes SET flow_id = v_plano_anual_id
  WHERE flow_id = v_old_flow_id AND name IN (
    'MESSAGE_PLANO_ANUAL', 'MESSAGE_ANUAL_1TELA', 'MESSAGE_ANUAL_2TELAS', 'MESSAGE_ANUAL_3TELAS',
    'INPUT_ANUAL_TELAS', 'CONDITION_ANUAL_TELAS',
    'INPUT_ANUAL_1TELA_NAV', 'CONDITION_ANUAL_1TELA_NAV',
    'INPUT_ANUAL_2TELAS_NAV', 'CONDITION_ANUAL_2TELAS_NAV',
    'INPUT_ANUAL_3TELAS_NAV', 'CONDITION_ANUAL_3TELAS_NAV'
  );

  -- TESTE_GRATIS
  UPDATE public.bot_engine_nodes SET flow_id = v_teste_gratis_id
  WHERE flow_id = v_old_flow_id AND name IN (
    'MESSAGE_TESTE', 'INPUT_TESTE_DISPOSITIVO', 'CONDITION_TESTE_DISPOSITIVO',
    'MESSAGE_TESTE_ANDROID', 'INPUT_POS_ANDROID', 'CONDITION_POS_ANDROID',
    'MESSAGE_TESTE_IOS', 'INPUT_POS_IOS', 'CONDITION_POS_IOS',
    'MESSAGE_TESTE_TVBOX', 'INPUT_POS_TVBOX', 'CONDITION_POS_TVBOX',
    'MESSAGE_TESTE_FIRESTICK', 'INPUT_POS_FIRESTICK', 'CONDITION_POS_FIRESTICK',
    'MESSAGE_TESTE_TVSMART', 'INPUT_POS_TVSMART', 'CONDITION_POS_TVSMART',
    'MESSAGE_TESTE_TVANDROID', 'INPUT_POS_TVANDROID', 'CONDITION_POS_TVANDROID',
    'MESSAGE_TESTE_PC', 'INPUT_POS_PC', 'CONDITION_POS_PC',
    'MESSAGE_TESTE_OUTROS', 'INPUT_POS_OUTROS', 'CONDITION_POS_OUTROS'
  );

  -- RENOVAR
  UPDATE public.bot_engine_nodes SET flow_id = v_renovar_id
  WHERE flow_id = v_old_flow_id AND name IN (
    'ACTION_NOTIFY_RENOVAR', 'MESSAGE_RENOVAR', 'INPUT_POS_RENOVAR', 'CONDITION_POS_RENOVAR'
  );

  -- ATENDIMENTO
  UPDATE public.bot_engine_nodes SET flow_id = v_atendimento_id
  WHERE flow_id = v_old_flow_id AND name IN (
    'ACTION_NOTIFY_ATENDIMENTO', 'MESSAGE_ATENDENTE', 'MESSAGE_ATENDIMENTO',
    'INPUT_POS_ATENDIMENTO', 'CONDITION_POS_ATENDIMENTO'
  );

  -- PS_CONTROL
  UPDATE public.bot_engine_nodes SET flow_id = v_ps_control_id
  WHERE flow_id = v_old_flow_id AND name IN (
    'MESSAGE_PS_CONTROL', 'INPUT_PS_CONTROL', 'CONDITION_PS_CONTROL',
    'MESSAGE_PS_RENOVAR', 'INPUT_POS_PS_RENOVAR', 'CONDITION_POS_PS_RENOVAR',
    'MESSAGE_PS_TESTAR', 'INPUT_POS_PS_TESTAR', 'CONDITION_POS_PS_TESTAR'
  );

  -- ============================================================
  -- ETAPA 4: CRIAR NÓS GOTO PARA NAVEGAÇÃO ENTRE FLUXOS
  -- ============================================================

  -- MENU_PRINCIPAL -> Criar GOTOs para cada opção
  INSERT INTO public.bot_engine_nodes (flow_id, seller_id, node_type, name, config, position_x, position_y)
  VALUES 
    (v_menu_principal_id, v_seller_id, 'goto', 'GOTO_PLANOS', jsonb_build_object('target_flow_id', v_planos_id), 400, 300),
    (v_menu_principal_id, v_seller_id, 'goto', 'GOTO_TESTE_GRATIS', jsonb_build_object('target_flow_id', v_teste_gratis_id), 400, 400),
    (v_menu_principal_id, v_seller_id, 'goto', 'GOTO_RENOVAR', jsonb_build_object('target_flow_id', v_renovar_id), 400, 500),
    (v_menu_principal_id, v_seller_id, 'goto', 'GOTO_ATENDIMENTO', jsonb_build_object('target_flow_id', v_atendimento_id), 400, 600),
    (v_menu_principal_id, v_seller_id, 'goto', 'GOTO_PS_CONTROL', jsonb_build_object('target_flow_id', v_ps_control_id), 400, 700);

  -- PLANOS -> GOTOs para cada tipo de plano
  INSERT INTO public.bot_engine_nodes (flow_id, seller_id, node_type, name, config, position_x, position_y)
  VALUES 
    (v_planos_id, v_seller_id, 'goto', 'GOTO_PLANO_MENSAL', jsonb_build_object('target_flow_id', v_plano_mensal_id), 400, 300),
    (v_planos_id, v_seller_id, 'goto', 'GOTO_PLANO_TRIMESTRAL', jsonb_build_object('target_flow_id', v_plano_trimestral_id), 400, 400),
    (v_planos_id, v_seller_id, 'goto', 'GOTO_PLANO_SEMESTRAL', jsonb_build_object('target_flow_id', v_plano_semestral_id), 400, 500),
    (v_planos_id, v_seller_id, 'goto', 'GOTO_PLANO_ANUAL', jsonb_build_object('target_flow_id', v_plano_anual_id), 400, 600),
    (v_planos_id, v_seller_id, 'goto', 'GOTO_MENU_FROM_PLANOS', jsonb_build_object('target_flow_id', v_menu_principal_id), 400, 100);

  -- Adicionar GOTOs de retorno em cada fluxo filho
  INSERT INTO public.bot_engine_nodes (flow_id, seller_id, node_type, name, config, position_x, position_y)
  VALUES 
    -- Planos mensais/trimestrais/semestrais/anuais -> PLANOS
    (v_plano_mensal_id, v_seller_id, 'goto', 'GOTO_PLANOS_FROM_MENSAL', jsonb_build_object('target_flow_id', v_planos_id), 100, 100),
    (v_plano_mensal_id, v_seller_id, 'goto', 'GOTO_MENU_FROM_MENSAL', jsonb_build_object('target_flow_id', v_menu_principal_id), 200, 100),
    (v_plano_trimestral_id, v_seller_id, 'goto', 'GOTO_PLANOS_FROM_TRIMESTRAL', jsonb_build_object('target_flow_id', v_planos_id), 100, 100),
    (v_plano_trimestral_id, v_seller_id, 'goto', 'GOTO_MENU_FROM_TRIMESTRAL', jsonb_build_object('target_flow_id', v_menu_principal_id), 200, 100),
    (v_plano_semestral_id, v_seller_id, 'goto', 'GOTO_PLANOS_FROM_SEMESTRAL', jsonb_build_object('target_flow_id', v_planos_id), 100, 100),
    (v_plano_semestral_id, v_seller_id, 'goto', 'GOTO_MENU_FROM_SEMESTRAL', jsonb_build_object('target_flow_id', v_menu_principal_id), 200, 100),
    (v_plano_anual_id, v_seller_id, 'goto', 'GOTO_PLANOS_FROM_ANUAL', jsonb_build_object('target_flow_id', v_planos_id), 100, 100),
    (v_plano_anual_id, v_seller_id, 'goto', 'GOTO_MENU_FROM_ANUAL', jsonb_build_object('target_flow_id', v_menu_principal_id), 200, 100),
    -- Teste/Renovar/Atendimento/PS -> MENU
    (v_teste_gratis_id, v_seller_id, 'goto', 'GOTO_MENU_FROM_TESTE', jsonb_build_object('target_flow_id', v_menu_principal_id), 100, 100),
    (v_renovar_id, v_seller_id, 'goto', 'GOTO_MENU_FROM_RENOVAR', jsonb_build_object('target_flow_id', v_menu_principal_id), 100, 100),
    (v_atendimento_id, v_seller_id, 'goto', 'GOTO_MENU_FROM_ATENDIMENTO', jsonb_build_object('target_flow_id', v_menu_principal_id), 100, 100),
    (v_ps_control_id, v_seller_id, 'goto', 'GOTO_MENU_FROM_PS', jsonb_build_object('target_flow_id', v_menu_principal_id), 100, 100);

  -- ============================================================
  -- ETAPA 5: DEFINIR ENTRY POINTS
  -- ============================================================
  
  -- Limpar entry points antigos
  UPDATE public.bot_engine_nodes SET is_entry_point = FALSE
  WHERE seller_id = v_seller_id;
  
  -- Definir entry points para cada fluxo
  UPDATE public.bot_engine_nodes SET is_entry_point = TRUE
  WHERE seller_id = v_seller_id AND name = 'MESSAGE_MENU_PRINCIPAL' AND flow_id = v_menu_principal_id;
  
  UPDATE public.bot_engine_nodes SET is_entry_point = TRUE
  WHERE seller_id = v_seller_id AND name = 'MESSAGE_PLANOS' AND flow_id = v_planos_id;
  
  UPDATE public.bot_engine_nodes SET is_entry_point = TRUE
  WHERE seller_id = v_seller_id AND name = 'MESSAGE_PLANO_MENSAL' AND flow_id = v_plano_mensal_id;
  
  UPDATE public.bot_engine_nodes SET is_entry_point = TRUE
  WHERE seller_id = v_seller_id AND name = 'MESSAGE_PLANO_TRIMESTRAL' AND flow_id = v_plano_trimestral_id;
  
  UPDATE public.bot_engine_nodes SET is_entry_point = TRUE
  WHERE seller_id = v_seller_id AND name = 'MESSAGE_PLANO_SEMESTRAL' AND flow_id = v_plano_semestral_id;
  
  UPDATE public.bot_engine_nodes SET is_entry_point = TRUE
  WHERE seller_id = v_seller_id AND name = 'MESSAGE_PLANO_ANUAL' AND flow_id = v_plano_anual_id;
  
  UPDATE public.bot_engine_nodes SET is_entry_point = TRUE
  WHERE seller_id = v_seller_id AND name = 'MESSAGE_TESTE' AND flow_id = v_teste_gratis_id;
  
  UPDATE public.bot_engine_nodes SET is_entry_point = TRUE
  WHERE seller_id = v_seller_id AND name = 'ACTION_NOTIFY_RENOVAR' AND flow_id = v_renovar_id;
  
  UPDATE public.bot_engine_nodes SET is_entry_point = TRUE
  WHERE seller_id = v_seller_id AND name = 'ACTION_NOTIFY_ATENDIMENTO' AND flow_id = v_atendimento_id;
  
  UPDATE public.bot_engine_nodes SET is_entry_point = TRUE
  WHERE seller_id = v_seller_id AND name = 'MESSAGE_PS_CONTROL' AND flow_id = v_ps_control_id;

  -- ============================================================
  -- ETAPA 6: DESATIVAR FLUXO ANTIGO (não deletar)
  -- ============================================================
  UPDATE public.bot_engine_flows 
  SET is_active = FALSE, is_default = FALSE, name = 'FLUXO_IPTV_LEGADO'
  WHERE id = v_old_flow_id;

  -- Log de conclusão
  RAISE NOTICE 'Reorganização concluída com sucesso!';
  RAISE NOTICE 'Backup criado: %', v_backup_flow_id;
  RAISE NOTICE 'MENU_PRINCIPAL: %', v_menu_principal_id;
  RAISE NOTICE 'Total de 10 fluxos criados + 1 backup';
  
END $$;