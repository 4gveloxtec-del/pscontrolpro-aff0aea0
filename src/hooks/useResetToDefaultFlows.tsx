/**
 * Hook para resetar fluxos do BotEngine para a estrutura hierárquica padrão IPTV
 * Usado quando o usuário quer restaurar os fluxos para a configuração inicial
 */

import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

// Mesma estrutura de useDefaultIPTVFlows - estrutura hierárquica completa
const IPTV_MAIN_MENU = {
  message_text: `👋 Olá, {primeiro_nome}! Seja bem-vindo(a) à {empresa} 🎬📺

Qualidade, estabilidade e o melhor do entretenimento para você!`,
  
  menu_options: [
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

export function useResetToDefaultFlows() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isResetting, setIsResetting] = useState(false);

  const resetToDefault = async () => {
    if (!user?.id) {
      toast.error('Usuário não autenticado');
      return false;
    }

    setIsResetting(true);
    
    try {
      console.log('[ResetFlows] Starting reset to default for user:', user.id);

      // 1. Deletar todos os nós do usuário (edges são deletados via CASCADE)
      const { error: deleteNodesError } = await supabase
        .from('bot_engine_nodes')
        .delete()
        .eq('seller_id', user.id);

      if (deleteNodesError) {
        console.error('[ResetFlows] Error deleting nodes:', deleteNodesError);
        throw deleteNodesError;
      }

      // 2. Deletar todos os fluxos do usuário
      const { error: deleteFlowsError } = await supabase
        .from('bot_engine_flows')
        .delete()
        .eq('seller_id', user.id);

      if (deleteFlowsError) {
        console.error('[ResetFlows] Error deleting flows:', deleteFlowsError);
        throw deleteFlowsError;
      }

      // 3. Limpar sessões ativas do usuário
      const { error: deleteSessionsError } = await supabase
        .from('bot_engine_sessions')
        .delete()
        .eq('seller_id', user.id);

      if (deleteSessionsError) {
        console.warn('[ResetFlows] Warning deleting sessions:', deleteSessionsError);
        // Não lança erro - sessões podem não existir
      }

      // 4. Criar fluxo IPTV padrão
      console.log('[ResetFlows] Creating default IPTV flow');
      
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
        console.error('[ResetFlows] Error creating flow:', flowError);
        throw flowError;
      }

      // 5. Criar nó de menu principal com estrutura hierárquica
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
        console.error('[ResetFlows] Error creating menu node:', nodeError);
        throw nodeError;
      }

      // 6. Limpar localStorage para permitir reinicialização futura
      localStorage.removeItem(`iptv-flows-initialized-v4_${user.id}`);

      // 7. Invalidar cache do React Query
      queryClient.invalidateQueries({ queryKey: ['bot-engine-flows'] });
      queryClient.invalidateQueries({ queryKey: ['bot-engine-nodes'] });
      queryClient.invalidateQueries({ queryKey: ['bot-engine-config'] });

      console.log('[ResetFlows] Reset completed successfully');
      toast.success('Fluxos restaurados para o padrão hierárquico!');
      return true;
    } catch (error: any) {
      console.error('[ResetFlows] Reset failed:', error);
      toast.error('Erro ao restaurar fluxos: ' + (error.message || 'Erro desconhecido'));
      return false;
    } finally {
      setIsResetting(false);
    }
  };

  return {
    resetToDefault,
    isResetting,
  };
}
