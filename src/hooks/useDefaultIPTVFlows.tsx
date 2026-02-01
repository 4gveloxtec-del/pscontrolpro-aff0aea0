/**
 * BOT ENGINE - Hook para criar fluxo IPTV padrão (estrutura aninhada)
 * Inicializa automaticamente UM fluxo com submenus interconectados
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const IPTV_FLOWS_INITIALIZED_KEY = 'iptv-flows-initialized-v2';

// Definição dos nós do fluxo IPTV (estrutura aninhada)
const IPTV_NODES = [
  // ===== MENU PRINCIPAL =====
  {
    key: 'welcome',
    node_type: 'message',
    name: '👋 Boas-vindas',
    is_entry_point: true,
    position_x: 100,
    position_y: 100,
    config: {
      message_text: `👋 Olá, {primeiro_nome}! Seja bem-vindo(a) à {empresa} 🎬📺

Qualidade, estabilidade e o melhor do entretenimento para você!


Escolha uma opção abaixo 👇

1️⃣ Conhecer os Planos  
2️⃣ Teste Grátis 🎁  
3️⃣ Renovar Assinatura 🫰  
4️⃣ Suporte Técnico 🛠️  
5️⃣ Falar com Atendente 👨‍💻  
6️⃣ PS Control - Revenda ⭐`,
      message_type: 'text',
    },
  },
  {
    key: 'menu_input',
    node_type: 'input',
    name: '⌨️ Aguardar Opção Menu',
    is_entry_point: false,
    position_x: 100,
    position_y: 220,
    config: {
      variable_name: 'opcao_menu',
      prompt_message: '',
      silent_on_invalid: true,
      valid_options: ['1', '2', '3', '4', '5', '6', '0'],
    },
  },

  // ===== 1️⃣ SUBMENU PLANOS =====
  {
    key: 'planos_menu',
    node_type: 'message',
    name: '📺 Menu de Planos',
    is_entry_point: false,
    position_x: 400,
    position_y: 100,
    config: {
      message_text: `📺 *NOSSOS PLANOS*

Escolha a categoria:

1️⃣ IPTV - Canais ao vivo + Filmes + Séries
2️⃣ P2P - Filmes e Séries On Demand
3️⃣ SSH - Conexões seguras

0️⃣ Voltar ao Menu Principal`,
      message_type: 'text',
    },
  },
  {
    key: 'planos_input',
    node_type: 'input',
    name: '⌨️ Aguardar Opção Planos',
    is_entry_point: false,
    position_x: 400,
    position_y: 220,
    config: {
      variable_name: 'opcao_planos',
      prompt_message: '',
      silent_on_invalid: true,
      valid_options: ['1', '2', '3', '0'],
    },
  },
  {
    key: 'planos_iptv',
    node_type: 'message',
    name: '📡 Planos IPTV',
    is_entry_point: false,
    position_x: 550,
    position_y: 100,
    config: {
      message_text: `📡 *PLANOS IPTV*

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

Digite *ASSINAR* para contratar ou *0* para voltar`,
      message_type: 'text',
    },
  },
  {
    key: 'planos_p2p',
    node_type: 'message',
    name: '🎬 Planos P2P',
    is_entry_point: false,
    position_x: 550,
    position_y: 220,
    config: {
      message_text: `🎬 *PLANOS P2P*

Acesso ilimitado a filmes e séries:
✅ Catálogo atualizado diariamente
✅ Qualidade Full HD e 4K
✅ Legendas em português
✅ Sem anúncios

💰 *Valores:*
• Mensal: R$ 20,00
• Trimestral: R$ 50,00
• Anual: R$ 180,00

Digite *ASSINAR* para contratar ou *0* para voltar`,
      message_type: 'text',
    },
  },
  {
    key: 'planos_ssh',
    node_type: 'message',
    name: '🔐 Planos SSH',
    is_entry_point: false,
    position_x: 550,
    position_y: 340,
    config: {
      message_text: `🔐 *PLANOS SSH*

Conexões seguras e estáveis:
✅ Servidores otimizados
✅ Conexão ilimitada
✅ Suporte técnico

💰 *Valores:*
• Mensal: R$ 15,00
• Trimestral: R$ 40,00

Digite *ASSINAR* para contratar ou *0* para voltar`,
      message_type: 'text',
    },
  },

  // ===== 2️⃣ SUBMENU TESTE GRÁTIS =====
  {
    key: 'teste_menu',
    node_type: 'message',
    name: '🎁 Teste Grátis',
    is_entry_point: false,
    position_x: 400,
    position_y: 340,
    config: {
      message_text: `🎁 *TESTE GRÁTIS*

Que ótimo que você quer experimentar!

Nosso teste dura *24 horas* e inclui acesso completo a todos os recursos.

Qual dispositivo você usa?

1️⃣ Smart TV (Samsung, LG, etc)
2️⃣ TV Box / Android
3️⃣ Celular / Tablet
4️⃣ Computador

0️⃣ Voltar ao Menu Principal`,
      message_type: 'text',
    },
  },
  {
    key: 'teste_input',
    node_type: 'input',
    name: '⌨️ Aguardar Dispositivo',
    is_entry_point: false,
    position_x: 400,
    position_y: 460,
    config: {
      variable_name: 'dispositivo_teste',
      prompt_message: '',
      silent_on_invalid: true,
      valid_options: ['1', '2', '3', '4', '0'],
    },
  },
  {
    key: 'teste_confirmacao',
    node_type: 'message',
    name: '✅ Confirmação Teste',
    is_entry_point: false,
    position_x: 550,
    position_y: 460,
    config: {
      message_text: `✅ *TESTE SOLICITADO!*

Seu teste de 24 horas está sendo gerado...

📱 Dispositivo selecionado: {dispositivo_teste}

Em instantes você receberá os dados de acesso!

_Aguarde um momento..._`,
      message_type: 'text',
    },
  },
  {
    key: 'teste_notificar',
    node_type: 'action',
    name: '🔔 Notificar Revendedor (Teste)',
    is_entry_point: false,
    position_x: 700,
    position_y: 460,
    config: {
      action_type: 'send_notification',
      notification_title: '🎁 Novo Pedido de Teste',
      notification_body: 'Cliente solicitou teste grátis - Dispositivo: {dispositivo_teste}',
      notification_type: 'test_request',
    },
  },

  // ===== 3️⃣ SUBMENU RENOVAÇÃO =====
  {
    key: 'renovar_menu',
    node_type: 'message',
    name: '🫰 Renovar Assinatura',
    is_entry_point: false,
    position_x: 400,
    position_y: 580,
    config: {
      message_text: `🫰 *RENOVAR ASSINATURA*

Para renovar, preciso de algumas informações:

📱 Qual seu *login* ou *e-mail* cadastrado?

_Digite abaixo ou envie 0 para voltar ao menu_`,
      message_type: 'text',
    },
  },
  {
    key: 'renovar_login_input',
    node_type: 'input',
    name: '⌨️ Coletar Login',
    is_entry_point: false,
    position_x: 400,
    position_y: 700,
    config: {
      variable_name: 'login_renovacao',
      prompt_message: '',
    },
  },
  {
    key: 'renovar_confirmacao',
    node_type: 'message',
    name: '✅ Confirmação Renovação',
    is_entry_point: false,
    position_x: 550,
    position_y: 700,
    config: {
      message_text: `✅ *RENOVAÇÃO INICIADA!*

📧 Login informado: {login_renovacao}

Estou verificando seu cadastro e gerando o PIX...

_Aguarde, em breve enviarei os dados para pagamento!_`,
      message_type: 'text',
    },
  },
  {
    key: 'renovar_notificar',
    node_type: 'action',
    name: '🔔 Notificar Revendedor (Renovação)',
    is_entry_point: false,
    position_x: 700,
    position_y: 700,
    config: {
      action_type: 'send_notification',
      notification_title: '🫰 Pedido de Renovação',
      notification_body: 'Cliente quer renovar - Login: {login_renovacao}',
      notification_type: 'renewal_request',
    },
  },

  // ===== 4️⃣ SUBMENU SUPORTE =====
  {
    key: 'suporte_menu',
    node_type: 'message',
    name: '🛠️ Suporte Técnico',
    is_entry_point: false,
    position_x: 400,
    position_y: 820,
    config: {
      message_text: `🛠️ *SUPORTE TÉCNICO*

Qual problema você está enfrentando?

1️⃣ App não abre / Travando
2️⃣ Canais fora do ar
3️⃣ Qualidade ruim / Buffer
4️⃣ Login inválido
5️⃣ Outro problema

0️⃣ Voltar ao Menu Principal`,
      message_type: 'text',
    },
  },
  {
    key: 'suporte_input',
    node_type: 'input',
    name: '⌨️ Aguardar Problema',
    is_entry_point: false,
    position_x: 400,
    position_y: 940,
    config: {
      variable_name: 'tipo_problema',
      prompt_message: '',
      silent_on_invalid: true,
      valid_options: ['1', '2', '3', '4', '5', '0'],
    },
  },
  {
    key: 'suporte_app',
    node_type: 'message',
    name: '📱 Suporte - App',
    is_entry_point: false,
    position_x: 550,
    position_y: 820,
    config: {
      message_text: `📱 *APP NÃO ABRE / TRAVANDO*

Tente as seguintes soluções:

1️⃣ *Reinicie o dispositivo* completamente
2️⃣ *Limpe o cache* do aplicativo
3️⃣ *Desinstale e reinstale* o app
4️⃣ Verifique sua *conexão de internet*

Se o problema persistir, digite *ATENDENTE* para falar conosco.

0️⃣ Voltar ao Menu Principal`,
      message_type: 'text',
    },
  },
  {
    key: 'suporte_canais',
    node_type: 'message',
    name: '📡 Suporte - Canais',
    is_entry_point: false,
    position_x: 550,
    position_y: 940,
    config: {
      message_text: `📡 *CANAIS FORA DO AR*

Alguns canais podem estar em manutenção temporária.

✅ Atualize a lista de canais no app
✅ Verifique se o problema é em todos ou específicos
✅ Aguarde alguns minutos e tente novamente

Se o problema persistir, digite *ATENDENTE* para falar conosco.

0️⃣ Voltar ao Menu Principal`,
      message_type: 'text',
    },
  },
  {
    key: 'suporte_buffer',
    node_type: 'message',
    name: '🐌 Suporte - Buffer',
    is_entry_point: false,
    position_x: 550,
    position_y: 1060,
    config: {
      message_text: `🐌 *QUALIDADE RUIM / BUFFER*

Para melhorar a experiência:

1️⃣ Teste sua velocidade em *speedtest.net*
2️⃣ Mínimo recomendado: *15 Mbps*
3️⃣ Use *cabo de rede* ao invés de Wi-Fi
4️⃣ Feche outros apps/dispositivos

Se sua internet for boa, digite *ATENDENTE* para ajudarmos.

0️⃣ Voltar ao Menu Principal`,
      message_type: 'text',
    },
  },
  {
    key: 'suporte_login',
    node_type: 'message',
    name: '🔐 Suporte - Login',
    is_entry_point: false,
    position_x: 700,
    position_y: 820,
    config: {
      message_text: `🔐 *LOGIN INVÁLIDO*

Verifique os seguintes pontos:

1️⃣ Confira se digitou *corretamente* (maiúsculas/minúsculas)
2️⃣ Verifique se seu plano *não expirou*
3️⃣ Certifique-se de usar o *app correto*

Se continuar com problemas, digite *ATENDENTE*.

0️⃣ Voltar ao Menu Principal`,
      message_type: 'text',
    },
  },
  {
    key: 'suporte_outro',
    node_type: 'message',
    name: '❓ Suporte - Outro',
    is_entry_point: false,
    position_x: 700,
    position_y: 940,
    config: {
      message_text: `❓ *OUTRO PROBLEMA*

Por favor, descreva o problema que você está enfrentando e um atendente irá te ajudar.

_Digite sua mensagem abaixo:_`,
      message_type: 'text',
    },
  },
  {
    key: 'suporte_outro_input',
    node_type: 'input',
    name: '⌨️ Descrever Problema',
    is_entry_point: false,
    position_x: 700,
    position_y: 1060,
    config: {
      variable_name: 'descricao_problema',
      prompt_message: '',
    },
  },
  {
    key: 'suporte_outro_notificar',
    node_type: 'action',
    name: '🔔 Notificar Revendedor (Suporte)',
    is_entry_point: false,
    position_x: 850,
    position_y: 1060,
    config: {
      action_type: 'send_notification',
      notification_title: '🛠️ Solicitação de Suporte',
      notification_body: 'Cliente com problema: {descricao_problema}',
      notification_type: 'support_request',
    },
  },

  // ===== 5️⃣ ATENDENTE =====
  {
    key: 'atendente',
    node_type: 'message',
    name: '👨‍💻 Falar com Atendente',
    is_entry_point: false,
    position_x: 400,
    position_y: 1180,
    config: {
      message_text: `👨‍💻 *ATENDIMENTO HUMANO*

Aguarde um momento, estou notificando um atendente...

⏳ Em breve você será atendido!`,
      message_type: 'text',
    },
  },
  {
    key: 'atendente_notificar',
    node_type: 'action',
    name: '🔔 Notificar Revendedor (Atendente)',
    is_entry_point: false,
    position_x: 550,
    position_y: 1180,
    config: {
      action_type: 'send_notification',
      notification_title: '👨‍💻 Solicitação de Atendente',
      notification_body: 'Cliente solicitou atendimento humano',
      notification_type: 'human_takeover',
    },
  },

  // ===== 6️⃣ PS CONTROL =====
  {
    key: 'pscontrol',
    node_type: 'message',
    name: '⭐ PS Control - Revenda',
    is_entry_point: false,
    position_x: 400,
    position_y: 1300,
    config: {
      message_text: `⭐ *PS CONTROL - SISTEMA DE REVENDA*

Quer ter seu próprio negócio de IPTV?

Com o PS Control você:
✅ Gerencia seus clientes
✅ Controla vencimentos
✅ Envia mensagens automáticas
✅ Recebe pagamentos via PIX

💰 *Comece hoje mesmo!*

Quer saber mais? Digite *SIM* ou envie *0* para voltar.`,
      message_type: 'text',
    },
  },
  {
    key: 'pscontrol_input',
    node_type: 'input',
    name: '⌨️ Aguardar Interesse',
    is_entry_point: false,
    position_x: 400,
    position_y: 1420,
    config: {
      variable_name: 'interesse_revenda',
      prompt_message: '',
      valid_options: ['sim', 'SIM', 'Sim', '0'],
    },
  },
  {
    key: 'pscontrol_interesse',
    node_type: 'message',
    name: '🎯 PS Control - Interesse',
    is_entry_point: false,
    position_x: 550,
    position_y: 1420,
    config: {
      message_text: `🎯 *ÓTIMO! VOCÊ QUER SER REVENDEDOR!*

Um de nossos especialistas vai entrar em contato para explicar tudo sobre a parceria.

📞 Aguarde nosso contato em até 24 horas úteis!`,
      message_type: 'text',
    },
  },
  {
    key: 'pscontrol_notificar',
    node_type: 'action',
    name: '🔔 Notificar Revendedor (PS Control)',
    is_entry_point: false,
    position_x: 700,
    position_y: 1420,
    config: {
      action_type: 'send_notification',
      notification_title: '⭐ Interesse em Revenda',
      notification_body: 'Novo lead interessado em ser revendedor',
      notification_type: 'reseller_lead',
    },
  },
];

// Definição das conexões (edges) entre os nós
const IPTV_EDGES = [
  // Menu Principal → Input
  { source: 'welcome', target: 'menu_input', condition_type: 'always' },
  
  // Input Menu → Submenus (baseado na opção escolhida)
  { source: 'menu_input', target: 'planos_menu', condition_type: 'equals', condition_value: '1' },
  { source: 'menu_input', target: 'teste_menu', condition_type: 'equals', condition_value: '2' },
  { source: 'menu_input', target: 'renovar_menu', condition_type: 'equals', condition_value: '3' },
  { source: 'menu_input', target: 'suporte_menu', condition_type: 'equals', condition_value: '4' },
  { source: 'menu_input', target: 'atendente', condition_type: 'equals', condition_value: '5' },
  { source: 'menu_input', target: 'pscontrol', condition_type: 'equals', condition_value: '6' },
  
  // Submenu Planos
  { source: 'planos_menu', target: 'planos_input', condition_type: 'always' },
  { source: 'planos_input', target: 'planos_iptv', condition_type: 'equals', condition_value: '1' },
  { source: 'planos_input', target: 'planos_p2p', condition_type: 'equals', condition_value: '2' },
  { source: 'planos_input', target: 'planos_ssh', condition_type: 'equals', condition_value: '3' },
  { source: 'planos_input', target: 'welcome', condition_type: 'equals', condition_value: '0' },
  
  // Submenu Teste Grátis
  { source: 'teste_menu', target: 'teste_input', condition_type: 'always' },
  { source: 'teste_input', target: 'teste_confirmacao', condition_type: 'not_equals', condition_value: '0' },
  { source: 'teste_input', target: 'welcome', condition_type: 'equals', condition_value: '0' },
  { source: 'teste_confirmacao', target: 'teste_notificar', condition_type: 'always' },
  
  // Submenu Renovação
  { source: 'renovar_menu', target: 'renovar_login_input', condition_type: 'always' },
  { source: 'renovar_login_input', target: 'renovar_confirmacao', condition_type: 'not_equals', condition_value: '0' },
  { source: 'renovar_login_input', target: 'welcome', condition_type: 'equals', condition_value: '0' },
  { source: 'renovar_confirmacao', target: 'renovar_notificar', condition_type: 'always' },
  
  // Submenu Suporte
  { source: 'suporte_menu', target: 'suporte_input', condition_type: 'always' },
  { source: 'suporte_input', target: 'suporte_app', condition_type: 'equals', condition_value: '1' },
  { source: 'suporte_input', target: 'suporte_canais', condition_type: 'equals', condition_value: '2' },
  { source: 'suporte_input', target: 'suporte_buffer', condition_type: 'equals', condition_value: '3' },
  { source: 'suporte_input', target: 'suporte_login', condition_type: 'equals', condition_value: '4' },
  { source: 'suporte_input', target: 'suporte_outro', condition_type: 'equals', condition_value: '5' },
  { source: 'suporte_input', target: 'welcome', condition_type: 'equals', condition_value: '0' },
  { source: 'suporte_outro', target: 'suporte_outro_input', condition_type: 'always' },
  { source: 'suporte_outro_input', target: 'suporte_outro_notificar', condition_type: 'always' },
  
  // Atendente
  { source: 'atendente', target: 'atendente_notificar', condition_type: 'always' },
  
  // PS Control
  { source: 'pscontrol', target: 'pscontrol_input', condition_type: 'always' },
  { source: 'pscontrol_input', target: 'pscontrol_interesse', condition_type: 'contains', condition_value: 'sim' },
  { source: 'pscontrol_input', target: 'welcome', condition_type: 'equals', condition_value: '0' },
  { source: 'pscontrol_interesse', target: 'pscontrol_notificar', condition_type: 'always' },
];

export function useDefaultIPTVFlows() {
  const { user } = useAuth();
  const [isInitializing, setIsInitializing] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (!user?.id) return;

    const initializeFlows = async () => {
      // Verificar se já inicializou via localStorage
      const localKey = `${IPTV_FLOWS_INITIALIZED_KEY}_${user.id}`;
      if (localStorage.getItem(localKey) === 'true') {
        setIsInitialized(true);
        return;
      }

      // Verificar se já existem fluxos para este seller
      const { data: existingFlows, error: fetchError } = await supabase
        .from('bot_engine_flows')
        .select('id')
        .eq('seller_id', user.id)
        .limit(1);

      if (fetchError) {
        console.error('[IPTV Flows] Error checking existing flows:', fetchError);
        return;
      }

      // Se já tem fluxos, marcar como inicializado
      if (existingFlows && existingFlows.length > 0) {
        localStorage.setItem(localKey, 'true');
        setIsInitialized(true);
        return;
      }

      // Criar fluxo IPTV único com submenus
      setIsInitializing(true);
      console.log('[IPTV Flows] Creating nested flow structure for new user');

      try {
        // 1. Criar o fluxo principal
        const { data: flow, error: flowError } = await supabase
          .from('bot_engine_flows')
          .insert({
            seller_id: user.id,
            name: '🎬 Fluxo IPTV Completo',
            description: 'Fluxo principal com todos os submenus: Planos, Teste, Renovação, Suporte, Atendente e Revenda',
            trigger_type: 'first_message',
            trigger_keywords: ['oi', 'olá', 'ola', 'menu', 'início', 'inicio', 'start', 'bom dia', 'boa tarde', 'boa noite'],
            category: 'Fluxos IPTV',
            is_default: true,
            is_active: true,
            priority: 100,
          })
          .select()
          .single();

        if (flowError) {
          console.error('[IPTV Flows] Error creating main flow:', flowError);
          throw flowError;
        }

        // 2. Criar todos os nós e mapear keys para IDs
        const nodeIdMap: Record<string, string> = {};
        
        for (const nodeDef of IPTV_NODES) {
          const { data: node, error: nodeError } = await supabase
            .from('bot_engine_nodes')
            .insert({
              flow_id: flow.id,
              seller_id: user.id,
              node_type: nodeDef.node_type,
              name: nodeDef.name,
              is_entry_point: nodeDef.is_entry_point,
              config: nodeDef.config,
              position_x: nodeDef.position_x,
              position_y: nodeDef.position_y,
            })
            .select()
            .single();

          if (nodeError) {
            console.error(`[IPTV Flows] Error creating node ${nodeDef.name}:`, nodeError);
            continue;
          }

          nodeIdMap[nodeDef.key] = node.id;
        }

        // 3. Criar as edges com as condições
        for (const edgeDef of IPTV_EDGES) {
          const sourceId = nodeIdMap[edgeDef.source];
          const targetId = nodeIdMap[edgeDef.target];
          
          if (!sourceId || !targetId) {
            console.warn(`[IPTV Flows] Missing node for edge: ${edgeDef.source} → ${edgeDef.target}`);
            continue;
          }

          await supabase.from('bot_engine_edges').insert({
            flow_id: flow.id,
            seller_id: user.id,
            source_node_id: sourceId,
            target_node_id: targetId,
            condition_type: edgeDef.condition_type,
            condition_value: edgeDef.condition_value || null,
            priority: 10,
          });
        }

        console.log('[IPTV Flows] Nested flow created successfully with', Object.keys(nodeIdMap).length, 'nodes');
        localStorage.setItem(localKey, 'true');
        setIsInitialized(true);
      } catch (error) {
        console.error('[IPTV Flows] Error initializing nested flow:', error);
      } finally {
        setIsInitializing(false);
      }
    };

    initializeFlows();
  }, [user?.id]);

  return {
    isInitializing,
    isInitialized,
  };
}
