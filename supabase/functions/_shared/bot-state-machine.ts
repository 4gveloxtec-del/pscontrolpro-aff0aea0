/**
 * BOT ENGINE - Máquina de Estados
 * 
 * Define os estados e transições do chatbot:
 * - START: Menu principal
 * - TESTE: Submenu de testes (TV/Celular)
 * - TESTE_TV: Coleta modelo da TV
 * - TESTE_CELULAR: Coleta tipo de dispositivo (Android/iPhone)
 * - PLANOS: Exibe planos cadastrados
 * - SUPORTE: Coleta descrição do problema
 */

// =====================================================================
// TIPOS
// =====================================================================

export interface StateConfig {
  message: string;
  options?: StateOption[];
  collectInput?: {
    variableName: string;
    nextState: string;
    prompt?: string;
  };
  action?: string;
}

export interface StateOption {
  input: string | string[];
  nextState: string;
  label?: string;
}

export interface StateTransitionResult {
  newState: string;
  response: string;
  awaitingInput?: boolean;
  inputVariableName?: string;
  shouldGenerateTest?: boolean;
  testType?: 'tv' | 'celular';
  deviceInfo?: string;
  transferToHuman?: boolean;
}

// =====================================================================
// MENSAGENS DOS ESTADOS
// =====================================================================

export const STATE_MESSAGES: Record<string, StateConfig> = {
  START: {
    message: `Olá! 👋 Seja bem-vindo!

Escolha uma opção:
1️⃣ Testar IPTV
2️⃣ Ver Planos
3️⃣ Suporte`,
    options: [
      { input: ['1', 'testar', 'teste', 'iptv'], nextState: 'TESTE', label: 'Testar IPTV' },
      { input: ['2', 'planos', 'plano', 'preços', 'precos', 'valores'], nextState: 'PLANOS', label: 'Ver Planos' },
      { input: ['3', 'suporte', 'ajuda', 'problema', 'atendente'], nextState: 'SUPORTE', label: 'Suporte' },
    ],
  },

  TESTE: {
    message: `📺 *Escolha onde deseja testar:*

1️⃣ TV (Smart TV, TV Box)
2️⃣ Celular (Android/iPhone)

0️⃣ Voltar`,
    options: [
      { input: ['1', 'tv', 'smart', 'box', 'tvbox', 'smart tv'], nextState: 'TESTE_TV', label: 'TV' },
      { input: ['2', 'celular', 'cel', 'android', 'iphone', 'ios', 'smartphone'], nextState: 'TESTE_CELULAR', label: 'Celular' },
      { input: ['0', 'voltar'], nextState: 'START', label: 'Voltar' },
    ],
  },

  TESTE_TV: {
    message: `📺 *Teste para TV*

Por favor, informe o modelo da sua TV:
(Ex: Samsung 55", LG Smart, TV Box MXQ, etc.)`,
    collectInput: {
      variableName: 'tv_model',
      nextState: 'TESTE_GERANDO',
      prompt: 'Digite o modelo da sua TV:',
    },
  },

  TESTE_CELULAR: {
    message: `📱 *Teste para Celular*

Qual é o sistema do seu celular?
1️⃣ Android
2️⃣ iPhone (iOS)

0️⃣ Voltar`,
    options: [
      { input: ['1', 'android'], nextState: 'TESTE_GERANDO_ANDROID', label: 'Android' },
      { input: ['2', 'iphone', 'ios', 'apple'], nextState: 'TESTE_GERANDO_IPHONE', label: 'iPhone' },
      { input: ['0', 'voltar'], nextState: 'TESTE', label: 'Voltar' },
    ],
  },

  TESTE_GERANDO: {
    message: `⏳ *Gerando seu teste...*

Aguarde um momento enquanto criamos seu acesso de teste.`,
    action: 'generate_test',
  },

  TESTE_GERANDO_ANDROID: {
    message: `⏳ *Gerando teste para Android...*

Aguarde um momento.`,
    action: 'generate_test_android',
  },

  TESTE_GERANDO_IPHONE: {
    message: `⏳ *Gerando teste para iPhone...*

Aguarde um momento.`,
    action: 'generate_test_iphone',
  },

  TESTE_SUCESSO: {
    message: `✅ *Teste gerado com sucesso!*

Seus dados de acesso foram enviados.
O teste expira em {expiration}.

Precisa de algo mais?
1️⃣ Voltar ao menu
0️⃣ Encerrar`,
    options: [
      { input: ['1', 'menu', 'voltar', 'inicio'], nextState: 'START', label: 'Menu' },
      { input: ['0', 'encerrar', 'sair', 'tchau'], nextState: 'ENCERRADO', label: 'Encerrar' },
    ],
  },

  TESTE_ERRO: {
    message: `❌ *Não foi possível gerar o teste*

Ocorreu um erro ao gerar seu teste.
Por favor, tente novamente ou entre em contato com o suporte.

1️⃣ Tentar novamente
2️⃣ Falar com suporte
0️⃣ Voltar ao menu`,
    options: [
      { input: ['1', 'tentar', 'novamente'], nextState: 'TESTE', label: 'Tentar novamente' },
      { input: ['2', 'suporte', 'ajuda'], nextState: 'SUPORTE', label: 'Suporte' },
      { input: ['0', 'voltar', 'menu'], nextState: 'START', label: 'Menu' },
    ],
  },

  PLANOS: {
    message: `📋 *Nossos Planos*

{plans_list}

Para contratar, entre em contato pelo suporte!

0️⃣ Voltar ao menu`,
    options: [
      { input: ['0', 'voltar', 'menu', 'inicio'], nextState: 'START', label: 'Voltar' },
    ],
  },

  SUPORTE: {
    message: `🆘 *Suporte*

Por favor, descreva brevemente seu problema ou dúvida:`,
    collectInput: {
      variableName: 'support_message',
      nextState: 'SUPORTE_ENCAMINHADO',
      prompt: 'Descreva seu problema:',
    },
  },

  SUPORTE_ENCAMINHADO: {
    message: `✅ *Mensagem recebida!*

Sua solicitação foi encaminhada para nossa equipe.
Um atendente entrará em contato em breve.

Número do protocolo: #{ticket_id}

0️⃣ Voltar ao menu`,
    options: [
      { input: ['0', 'voltar', 'menu'], nextState: 'START', label: 'Voltar' },
    ],
    action: 'transfer_to_human',
  },

  AGUARDANDO_HUMANO: {
    message: `👤 *Aguardando atendente*

Você está na fila de atendimento.
Um atendente irá responder em breve.

Digite *menu* para voltar ao início.`,
    options: [
      { input: ['menu', 'voltar', 'inicio', '#'], nextState: 'START', label: 'Menu' },
    ],
  },

  ENCERRADO: {
    message: `👋 *Atendimento encerrado*

Obrigado pelo contato!
Para iniciar uma nova conversa, envie qualquer mensagem.`,
  },
};

// =====================================================================
// FUNÇÕES DE TRANSIÇÃO
// =====================================================================

/**
 * Verifica se um input corresponde a uma opção
 */
function matchOption(input: string, option: StateOption): boolean {
  const normalizedInput = input.toLowerCase().trim();
  const inputs = Array.isArray(option.input) ? option.input : [option.input];
  
  return inputs.some(opt => {
    const normalizedOpt = opt.toLowerCase().trim();
    return normalizedInput === normalizedOpt || normalizedInput.includes(normalizedOpt);
  });
}

/**
 * Processa a transição de estado baseado no input do usuário
 */
export function processStateTransition(
  currentState: string,
  userInput: string,
  _sessionContext: Record<string, unknown> = {}
): StateTransitionResult {
  const stateConfig = STATE_MESSAGES[currentState];
  
  // Estado não encontrado - voltar ao START
  if (!stateConfig) {
    return {
      newState: 'START',
      response: STATE_MESSAGES.START.message,
      awaitingInput: false,
    };
  }

  // Se o estado atual está coletando input
  const currentCollectConfig = stateConfig.collectInput;
  if (currentCollectConfig) {
    // Input foi coletado - salvar e ir para próximo estado
    const nextState = currentCollectConfig.nextState;
    const nextConfig = STATE_MESSAGES[nextState];
    
    // Determinar se precisa gerar teste
    const shouldGenerateTest = nextState.startsWith('TESTE_GERANDO');
    let testType: 'tv' | 'celular' | undefined;
    
    if (nextState === 'TESTE_GERANDO') {
      testType = 'tv';
    } else if (nextState === 'TESTE_GERANDO_ANDROID' || nextState === 'TESTE_GERANDO_IPHONE') {
      testType = 'celular';
    }
    
    return {
      newState: nextState,
      response: nextConfig?.message || 'Processando...',
      awaitingInput: false,
      shouldGenerateTest,
      testType,
      deviceInfo: userInput,
      transferToHuman: nextConfig?.action === 'transfer_to_human',
    };
  }

  // Verificar opções do estado
  const currentOptions = stateConfig.options;
  if (currentOptions && currentOptions.length > 0) {
    for (const option of currentOptions) {
      if (matchOption(userInput, option)) {
        const nextState = option.nextState;
        const nextConfig = STATE_MESSAGES[nextState];
        
        if (!nextConfig) {
          return {
            newState: 'START',
            response: STATE_MESSAGES.START.message,
          };
        }

        // Verificar se próximo estado coleta input
        const nextCollectConfig = nextConfig.collectInput;
        const awaitingInput = !!nextCollectConfig;
        
        return {
          newState: nextState,
          response: nextConfig.message,
          awaitingInput,
          inputVariableName: nextCollectConfig ? nextCollectConfig.variableName : undefined,
          shouldGenerateTest: nextConfig.action ? nextConfig.action.startsWith('generate_test') : false,
          testType: nextConfig.action === 'generate_test' ? 'tv' : 
                   nextConfig.action === 'generate_test_android' ? 'celular' :
                   nextConfig.action === 'generate_test_iphone' ? 'celular' : undefined,
          transferToHuman: nextConfig.action === 'transfer_to_human',
        };
      }
    }
  }

  // Nenhuma opção correspondeu - mostrar mensagem de erro
  const fallbackCollect = stateConfig.collectInput;
  return {
    newState: currentState,
    response: `❌ Opção inválida. Por favor, escolha uma das opções disponíveis.\n\n${stateConfig.message}`,
    awaitingInput: !!fallbackCollect,
    inputVariableName: fallbackCollect ? fallbackCollect.variableName : undefined,
  };
}

/**
 * Obtém mensagem de um estado específico
 */
export function getStateMessage(state: string): string {
  return STATE_MESSAGES[state]?.message || STATE_MESSAGES.START.message;
}

/**
 * Verifica se um estado requer coleta de input
 */
export function stateRequiresInput(state: string): boolean {
  return !!STATE_MESSAGES[state]?.collectInput;
}

/**
 * Obtém o nome da variável que o estado está coletando
 */
export function getInputVariableName(state: string): string | null {
  return STATE_MESSAGES[state]?.collectInput?.variableName || null;
}
