/**
 * BOT ENGINE - Exportações centralizadas
 * Módulo isolado de infraestrutura para chatbots
 * 
 * ═══════════════════════════════════════════════════════════════════
 * ⚠️ CONTRATO DE ISOLAMENTO - GARANTIAS OBRIGATÓRIAS
 * ═══════════════════════════════════════════════════════════════════
 * 
 * ✅ NÃO modifica funções existentes
 * ✅ NÃO altera integrações já prontas (Evolution API, webhooks)
 * ✅ NÃO recria APIs
 * ✅ APENAS adiciona camada de interceptação opcional
 * ✅ Estrutura limpa, escalável e reutilizável
 * ✅ Código organizado e documentado
 * 
 * Este módulo fornece funções que são CHAMADAS pelos sistemas existentes.
 * O ponto de integração único está em `connection-heartbeat` (webhook),
 * onde o BotEngine é chamado de forma segura (try/catch) antes do
 * processamento normal de comandos IPTV.
 * 
 * Se o BotEngine falhar ou não interceptar, o fluxo continua normalmente.
 * ═══════════════════════════════════════════════════════════════════
 */

// Tipos
export * from './types';

// Utilitários
export * from './utils';

// Navegação (ir/voltar)
export * from './navigation';

// Integração com APIs existentes
export * from './integration';

// Funções Core (estado, parsing, ações, mensagens, lock)
export * from './core';

// Comandos Globais
export * from './commands';

// Configuração por Revendedor
export * from './config';
