/**
 * BOT ENGINE - Comandos Globais
 * Comandos que funcionam em qualquer estado
 * 
 * ⚠️ Módulo isolado - não interfere em funções existentes
 */

import { 
  setState, 
  clearStack, 
  popStack, 
  unlockSession,
  sendMessage 
} from './core';

// =====================================================================
// TIPOS
// =====================================================================

export interface GlobalCommand {
  keywords: string[];
  action: string;
  description: string;
}

export interface CommandResult {
  handled: boolean;
  command?: string;
  newState?: string;
  message?: string;
}

// =====================================================================
// COMANDOS GLOBAIS
// =====================================================================

export const GLOBAL_COMMANDS: GlobalCommand[] = [
  {
    keywords: ['menu', 'cardapio', 'opcoes', 'opções'],
    action: 'menu',
    description: 'Vai para o menu principal e limpa a pilha de navegação'
  },
  {
    keywords: ['voltar', 'anterior', 'retornar', '*', '#'],
    action: 'voltar',
    description: 'Retorna ao estado anterior'
  },
  {
    keywords: ['inicio', 'início', 'começo', 'reiniciar', 'restart', '00', '##'],
    action: 'inicio',
    description: 'Reinicia a sessão completamente'
  },
  {
    keywords: ['sair', 'exit', 'encerrar', 'tchau', 'bye', 'fim'],
    action: 'sair',
    description: 'Encerra a sessão do bot'
  },
  {
    keywords: ['humano', 'atendente', 'pessoa', 'suporte', 'ajuda', 'falar com alguem', 'falar com alguém'],
    action: 'humano',
    description: 'Encaminha para atendimento humano'
  }
];

// =====================================================================
// PROCESSAMENTO DE COMANDOS
// =====================================================================

/**
 * Verifica se a mensagem corresponde a um comando global
 */
export function matchGlobalCommand(message: string): GlobalCommand | null {
  const normalized = message.toLowerCase().trim();
  
  for (const cmd of GLOBAL_COMMANDS) {
    for (const keyword of cmd.keywords) {
      if (normalized === keyword || normalized.includes(keyword)) {
        return cmd;
      }
    }
  }
  
  return null;
}

/**
 * Processa comandos globais
 * Retorna se o comando foi tratado e o novo estado
 */
export async function processGlobalCommand(
  userId: string,
  sellerId: string,
  message: string
): Promise<CommandResult> {
  const command = matchGlobalCommand(message);
  
  if (!command) {
    return { handled: false };
  }

  console.log(`[BotEngine] Global command matched: ${command.action}`);

  // ⚠️ NÃO envia mensagens - apenas muda estado/stack
  // As mensagens devem vir dos fluxos configurados nas tabelas bot_engine_*
  switch (command.action) {
    case 'menu':
      await clearStack(userId, sellerId);
      await setState(userId, sellerId, 'MENU');
      return { handled: true, command: 'menu', newState: 'MENU' };

    case 'voltar':
      const previousState = await popStack(userId, sellerId);
      const backState = previousState || 'MENU';
      return { handled: true, command: 'voltar', newState: backState };

    case 'inicio':
      await clearStack(userId, sellerId);
      await setState(userId, sellerId, 'INICIO');
      return { handled: true, command: 'inicio', newState: 'INICIO' };

    case 'sair':
      await clearStack(userId, sellerId);
      await setState(userId, sellerId, 'ENCERRADO');
      await unlockSession(userId, sellerId);
      return { handled: true, command: 'sair', newState: 'ENCERRADO' };

    case 'humano':
      await setState(userId, sellerId, 'AGUARDANDO_HUMANO');
      return { handled: true, command: 'humano', newState: 'AGUARDANDO_HUMANO' };

    default:
      return { handled: false };
  }
}

/**
 * Verifica se o estado atual permite comandos globais
 * Alguns estados podem bloquear comandos globais (ex: aguardando input crítico)
 */
export function isGlobalCommandsEnabled(currentState: string): boolean {
  // Estados que bloqueiam comandos globais
  const blockedStates = [
    'AGUARDANDO_PAGAMENTO',
    'CONFIRMACAO_CRITICA',
    'INPUT_OBRIGATORIO'
  ];
  
  return !blockedStates.includes(currentState.toUpperCase());
}

/**
 * Processa mensagem verificando comandos globais primeiro
 * Esta é a função principal a ser chamada pelo handler de mensagens
 */
export async function handleMessage(
  userId: string,
  sellerId: string,
  message: string,
  currentState: string
): Promise<CommandResult> {
  // Log da mensagem recebida
  await sendMessage(userId, sellerId, message, 'text', true);

  // Verificar se comandos globais estão habilitados neste estado
  if (!isGlobalCommandsEnabled(currentState)) {
    return { handled: false };
  }

  // Processar comando global se houver match
  return await processGlobalCommand(userId, sellerId, message);
}

// =====================================================================
// HELPERS
// =====================================================================

/**
 * Lista todos os comandos globais disponíveis
 */
export function listGlobalCommands(): string {
  return GLOBAL_COMMANDS
    .map(cmd => `• *${cmd.keywords[0]}* - ${cmd.description}`)
    .join('\n');
}

/**
 * Verifica se uma palavra-chave específica é um comando global
 */
export function isGlobalCommand(keyword: string): boolean {
  return matchGlobalCommand(keyword) !== null;
}
