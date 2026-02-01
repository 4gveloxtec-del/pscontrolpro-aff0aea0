/**
 * BOT ENGINE - Hook para criar fluxos IPTV padrão
 * Inicializa automaticamente a estrutura de fluxos para novos revendedores
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const IPTV_FLOWS_INITIALIZED_KEY = 'iptv-flows-initialized';

// Definição da estrutura base dos fluxos IPTV
const IPTV_FLOW_STRUCTURE = [
  {
    name: 'Menu Principal',
    description: 'Fluxo de entrada com boas-vindas e menu principal',
    trigger_type: 'first_message' as const,
    trigger_keywords: ['oi', 'olá', 'ola', 'menu', 'início', 'inicio', 'start'],
    category: 'Fluxos IPTV',
    is_default: true,
    is_active: true,
    priority: 100,
    nodes: [
      {
        node_type: 'message',
        name: 'Boas-vindas',
        is_entry_point: true,
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
        node_type: 'input',
        name: 'Aguardar Opção',
        is_entry_point: false,
        config: {
          variable_name: 'opcao_menu',
          prompt_message: '',
          silent_on_invalid: true,
          valid_options: ['1', '2', '3', '4', '5', '6'],
        },
      },
    ],
  },
  {
    name: '1️⃣ Conhecer Planos',
    description: 'Submenu para exibir planos disponíveis',
    trigger_type: 'keyword' as const,
    trigger_keywords: ['1', 'planos', 'preços', 'valores'],
    category: 'Fluxos IPTV',
    is_default: false,
    is_active: true,
    priority: 90,
    nodes: [
      {
        node_type: 'message',
        name: 'Menu de Planos',
        is_entry_point: true,
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
    ],
  },
  {
    name: '2️⃣ Teste Grátis',
    description: 'Fluxo para solicitar teste gratuito',
    trigger_type: 'keyword' as const,
    trigger_keywords: ['2', 'teste', 'testar', 'grátis', 'gratis'],
    category: 'Fluxos IPTV',
    is_default: false,
    is_active: true,
    priority: 89,
    nodes: [
      {
        node_type: 'message',
        name: 'Teste Grátis',
        is_entry_point: true,
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
    ],
  },
  {
    name: '3️⃣ Renovar Assinatura',
    description: 'Fluxo para renovação de assinatura existente',
    trigger_type: 'keyword' as const,
    trigger_keywords: ['3', 'renovar', 'renovação', 'pagar'],
    category: 'Fluxos IPTV',
    is_default: false,
    is_active: true,
    priority: 88,
    nodes: [
      {
        node_type: 'message',
        name: 'Renovação',
        is_entry_point: true,
        config: {
          message_text: `🫰 *RENOVAR ASSINATURA*

Para renovar, preciso de algumas informações:

📱 Qual seu *login* ou *e-mail* cadastrado?

_Digite abaixo ou envie 0 para voltar ao menu_`,
          message_type: 'text',
        },
      },
      {
        node_type: 'input',
        name: 'Coletar Login',
        is_entry_point: false,
        config: {
          variable_name: 'login_renovacao',
          prompt_message: '',
        },
      },
    ],
  },
  {
    name: '4️⃣ Suporte Técnico',
    description: 'Fluxo de suporte técnico com FAQ',
    trigger_type: 'keyword' as const,
    trigger_keywords: ['4', 'suporte', 'ajuda', 'problema', 'não funciona'],
    category: 'Fluxos IPTV',
    is_default: false,
    is_active: true,
    priority: 87,
    nodes: [
      {
        node_type: 'message',
        name: 'Suporte',
        is_entry_point: true,
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
    ],
  },
  {
    name: '5️⃣ Falar com Atendente',
    description: 'Transferência para atendimento humano com notificação',
    trigger_type: 'keyword' as const,
    trigger_keywords: ['5', 'atendente', 'humano', 'pessoa', 'falar'],
    category: 'Fluxos IPTV',
    is_default: false,
    is_active: true,
    priority: 86,
    nodes: [
      {
        node_type: 'message',
        name: 'Transferência',
        is_entry_point: true,
        config: {
          message_text: `👨‍💻 *ATENDIMENTO HUMANO*

Aguarde um momento, estou notificando um atendente...

⏳ Em breve você será atendido!`,
          message_type: 'text',
        },
      },
      {
        node_type: 'action',
        name: 'Notificar Revendedor',
        is_entry_point: false,
        config: {
          action_type: 'send_notification',
          notification_title: '👨‍💻 Solicitação de Atendente',
          notification_body: 'Cliente solicitou atendimento humano',
          notification_type: 'human_takeover',
        },
      },
    ],
  },
  {
    name: '6️⃣ PS Control - Revenda',
    description: 'Informações sobre o sistema de revenda',
    trigger_type: 'keyword' as const,
    trigger_keywords: ['6', 'revenda', 'revendedor', 'ps control', 'pscontrol'],
    category: 'Fluxos IPTV',
    is_default: false,
    is_active: true,
    priority: 85,
    nodes: [
      {
        node_type: 'message',
        name: 'PS Control',
        is_entry_point: true,
        config: {
          message_text: `⭐ *PS CONTROL - SISTEMA DE REVENDA*

Quer ter seu próprio negócio de IPTV?

Com o PS Control você:
✅ Gerencia seus clientes
✅ Controla vencimentos
✅ Envia mensagens automáticas
✅ Recebe pagamentos via PIX

💰 *Comece hoje mesmo!*

Quer saber mais? Digite *SIM* ou envie 0 para voltar.`,
          message_type: 'text',
        },
      },
    ],
  },
];

export function useDefaultIPTVFlows() {
  const { user } = useAuth();
  const [isInitializing, setIsInitializing] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (!user?.id) return;

    const initializeFlows = async () => {
      // Verificar se já inicializou via localStorage (evita requisições desnecessárias)
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

      // Se já tem fluxos, marcar como inicializado e sair
      if (existingFlows && existingFlows.length > 0) {
        localStorage.setItem(localKey, 'true');
        setIsInitialized(true);
        return;
      }

      // Criar fluxos IPTV padrão
      setIsInitializing(true);
      console.log('[IPTV Flows] Creating default flows for new user');

      try {
        for (const flowDef of IPTV_FLOW_STRUCTURE) {
          // Criar o fluxo
          const { data: flow, error: flowError } = await supabase
            .from('bot_engine_flows')
            .insert({
              seller_id: user.id,
              name: flowDef.name,
              description: flowDef.description,
              trigger_type: flowDef.trigger_type,
              trigger_keywords: flowDef.trigger_keywords,
              category: flowDef.category,
              is_default: flowDef.is_default,
              is_active: flowDef.is_active,
              priority: flowDef.priority,
            })
            .select()
            .single();

          if (flowError) {
            console.error(`[IPTV Flows] Error creating flow ${flowDef.name}:`, flowError);
            continue;
          }

          // Criar os nós do fluxo
          const nodeIds: string[] = [];
          for (const nodeDef of flowDef.nodes) {
            const { data: node, error: nodeError } = await supabase
              .from('bot_engine_nodes')
              .insert({
                flow_id: flow.id,
                seller_id: user.id,
                node_type: nodeDef.node_type,
                name: nodeDef.name,
                is_entry_point: nodeDef.is_entry_point,
                config: nodeDef.config,
                position_x: nodeDef.is_entry_point ? 100 : 100 + (nodeIds.length * 50),
                position_y: nodeDef.is_entry_point ? 100 : 100 + (nodeIds.length * 80),
              })
              .select()
              .single();

            if (nodeError) {
              console.error(`[IPTV Flows] Error creating node ${nodeDef.name}:`, nodeError);
              continue;
            }

            nodeIds.push(node.id);
          }

          // Criar edges conectando os nós em sequência
          for (let i = 0; i < nodeIds.length - 1; i++) {
            await supabase.from('bot_engine_edges').insert({
              flow_id: flow.id,
              seller_id: user.id,
              source_node_id: nodeIds[i],
              target_node_id: nodeIds[i + 1],
              condition_type: 'always',
              priority: 10,
            });
          }
        }

        console.log('[IPTV Flows] Default flows created successfully');
        localStorage.setItem(localKey, 'true');
        setIsInitialized(true);
      } catch (error) {
        console.error('[IPTV Flows] Error initializing flows:', error);
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
