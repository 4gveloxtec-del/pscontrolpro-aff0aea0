/**
 * BOT ENGINE - Hook para criar fluxo IPTV padrão (estrutura de menu hierárquico)
 * Inicializa automaticamente UM fluxo com submenus aninhados em um único nó
 * 
 * IMPORTANTE: A estrutura usa os campos corretos que o bot-engine-intercept espera:
 * - submenu_options (não children)
 * - action_type (não action)
 * - message_text (não message)
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const IPTV_FLOWS_INITIALIZED_KEY = 'iptv-flows-initialized-v4';

/**
 * Estrutura do MENU HIERÁRQUICO com submenus aninhados
 * Compatível com bot-engine-intercept
 */
const IPTV_MAIN_MENU = {
  message_text: `👋 Olá, {primeiro_nome}! Seja bem-vindo(a) à {empresa} 🎬📺

Qualidade, estabilidade e o melhor do entretenimento para você!`,
  
  menu_options: [
    // ===== 1️⃣ PLANOS (com submenus) =====
    {
      id: 'planos',
      emoji: '📺',
      title: 'Conhecer os Planos',
      description: 'Veja nossos planos e valores',
      action_type: 'submenu',
      submenu_options: [
        {
          id: 'planos_iptv',
          emoji: '📡',
          title: 'IPTV',
          description: 'Canais ao vivo + Filmes + Séries',
          action_type: 'message',
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

Digite *ASSINAR* para contratar!`,
        },
        {
          id: 'planos_p2p',
          emoji: '🎬',
          title: 'P2P',
          description: 'Filmes e Séries On Demand',
          action_type: 'message',
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

Digite *ASSINAR* para contratar!`,
        },
        {
          id: 'planos_ssh',
          emoji: '🔐',
          title: 'SSH',
          description: 'Conexões seguras',
          action_type: 'message',
          message_text: `🔐 *PLANOS SSH*

Conexões seguras e estáveis:
✅ Servidores otimizados
✅ Conexão ilimitada
✅ Suporte técnico

💰 *Valores:*
• Mensal: R$ 15,00
• Trimestral: R$ 40,00

Digite *ASSINAR* para contratar!`,
        },
      ],
    },

    // ===== 2️⃣ TESTE GRÁTIS (com submenus de dispositivos) =====
    {
      id: 'teste',
      emoji: '🎁',
      title: 'Teste Grátis',
      description: 'Experimente por 24 horas',
      action_type: 'submenu',
      submenu_options: [
        {
          id: 'teste_smarttv',
          emoji: '📺',
          title: 'Smart TV',
          description: 'Samsung, LG, etc',
          action_type: 'command',
          command: '/teste',
        },
        {
          id: 'teste_tvbox',
          emoji: '📦',
          title: 'TV Box / Android',
          description: 'Dispositivos Android',
          action_type: 'command',
          command: '/teste',
        },
        {
          id: 'teste_celular',
          emoji: '📱',
          title: 'Celular / Tablet',
          description: 'iOS e Android',
          action_type: 'command',
          command: '/teste',
        },
        {
          id: 'teste_pc',
          emoji: '💻',
          title: 'Computador',
          description: 'Windows, Mac, Linux',
          action_type: 'command',
          command: '/teste',
        },
      ],
    },

    // ===== 3️⃣ RENOVAR ASSINATURA =====
    {
      id: 'renovar',
      emoji: '🫰',
      title: 'Renovar Assinatura',
      description: 'Renove seu plano atual',
      action_type: 'message',
      message_text: `🫰 *RENOVAR ASSINATURA*

Para renovar, informe seu *login* ou *e-mail* cadastrado.

Um atendente irá verificar seu cadastro e gerar o PIX para pagamento!`,
    },

    // ===== 4️⃣ SUPORTE TÉCNICO (com submenus de problemas) =====
    {
      id: 'suporte',
      emoji: '🛠️',
      title: 'Suporte Técnico',
      description: 'Resolva problemas técnicos',
      action_type: 'submenu',
      submenu_options: [
        {
          id: 'suporte_app',
          emoji: '📱',
          title: 'App não abre / Travando',
          description: 'Problemas com o aplicativo',
          action_type: 'message',
          message_text: `📱 *APP NÃO ABRE / TRAVANDO*

Tente as seguintes soluções:

1️⃣ *Reinicie o dispositivo* completamente
2️⃣ *Limpe o cache* do aplicativo
3️⃣ *Desinstale e reinstale* o app
4️⃣ Verifique sua *conexão de internet*

Se o problema persistir, fale com um *atendente*.`,
        },
        {
          id: 'suporte_canais',
          emoji: '📡',
          title: 'Canais fora do ar',
          description: 'Canais não carregam',
          action_type: 'message',
          message_text: `📡 *CANAIS FORA DO AR*

Alguns canais podem estar em manutenção temporária.

✅ Atualize a lista de canais no app
✅ Verifique se o problema é em todos ou específicos
✅ Aguarde alguns minutos e tente novamente

Se o problema persistir, fale com um *atendente*.`,
        },
        {
          id: 'suporte_buffer',
          emoji: '🐌',
          title: 'Qualidade ruim / Buffer',
          description: 'Travamentos e lentidão',
          action_type: 'message',
          message_text: `🐌 *QUALIDADE RUIM / BUFFER*

Para melhorar a experiência:

1️⃣ Teste sua velocidade em *speedtest.net*
2️⃣ Mínimo recomendado: *15 Mbps*
3️⃣ Use *cabo de rede* ao invés de Wi-Fi
4️⃣ Feche outros apps/dispositivos

Se sua internet for boa, fale com um *atendente*.`,
        },
        {
          id: 'suporte_login',
          emoji: '🔐',
          title: 'Login inválido',
          description: 'Erro ao fazer login',
          action_type: 'message',
          message_text: `🔐 *LOGIN INVÁLIDO*

Verifique os seguintes pontos:

1️⃣ Confira se digitou *corretamente* (maiúsculas/minúsculas)
2️⃣ Verifique se seu plano *não expirou*
3️⃣ Certifique-se de usar o *app correto*

Se continuar com problemas, fale com um *atendente*.`,
        },
        {
          id: 'suporte_outro',
          emoji: '❓',
          title: 'Outro problema',
          description: 'Descreva seu problema',
          action_type: 'transfer_human',
          message_text: `❓ *OUTRO PROBLEMA*

Por favor, descreva o problema que você está enfrentando e um atendente irá te ajudar em breve!`,
        },
      ],
    },

    // ===== 5️⃣ FALAR COM ATENDENTE =====
    {
      id: 'atendente',
      emoji: '👨‍💻',
      title: 'Falar com Atendente',
      description: 'Atendimento humano',
      action_type: 'transfer_human',
      message_text: `👨‍💻 *ATENDIMENTO HUMANO*

Aguarde um momento, estou notificando um atendente...

⏳ Em breve você será atendido!`,
    },

    // ===== 6️⃣ PS CONTROL =====
    {
      id: 'pscontrol',
      emoji: '⭐',
      title: 'PS Control - Revenda',
      description: 'Seja um revendedor',
      action_type: 'message',
      message_text: `⭐ *PS CONTROL - SISTEMA DE REVENDA*

Quer ter seu próprio negócio de IPTV?

Com o PS Control você:
✅ Gerencia seus clientes
✅ Controla vencimentos
✅ Envia mensagens automáticas
✅ Recebe pagamentos via PIX

💰 *Comece hoje mesmo!*

Quer saber mais? Fale com um *atendente*!`,
    },
  ],
};

export function useDefaultIPTVFlows() {
  const { user } = useAuth();
  const [isInitializing, setIsInitializing] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (!user?.id) return;

    const initializeFlows = async () => {
      // Verificar se já inicializou via localStorage (v4)
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

      // Criar fluxo IPTV com menus hierárquicos
      setIsInitializing(true);
      console.log('[IPTV Flows] Creating hierarchical menu flow for new user');

      try {
        // 1. Criar o fluxo principal
        const { data: flow, error: flowError } = await supabase
          .from('bot_engine_flows')
          .insert({
            seller_id: user.id,
            name: '🎬 Fluxo IPTV Completo',
            description: 'Fluxo com menus interativos hierárquicos: Planos, Teste, Renovação, Suporte, Atendente e Revenda',
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

        // 2. Criar o nó de menu principal com toda a estrutura hierárquica
        const { error: nodeError } = await supabase
          .from('bot_engine_nodes')
          .insert({
            flow_id: flow.id,
            seller_id: user.id,
            node_type: 'message',
            name: '🌳 Menu Principal',
            is_entry_point: true,
            config: {
              message_type: 'menu',
              message_text: IPTV_MAIN_MENU.message_text,
              menu_options: IPTV_MAIN_MENU.menu_options,
              menu_title: 'Menu Principal',
              show_back_button: true,
              back_button_text: '↩️ Voltar',
              silent_on_invalid: true,
            },
            position_x: 100,
            position_y: 100,
          });

        if (nodeError) {
          console.error('[IPTV Flows] Error creating menu node:', nodeError);
          throw nodeError;
        }

        console.log('[IPTV Flows] Hierarchical menu flow created successfully');
        localStorage.setItem(localKey, 'true');
        setIsInitialized(true);
      } catch (error) {
        console.error('[IPTV Flows] Error initializing flow:', error);
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
