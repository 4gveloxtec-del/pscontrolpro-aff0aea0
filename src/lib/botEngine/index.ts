/**
 * BOT ENGINE - Exportações centralizadas
 * Módulo isolado de infraestrutura para chatbots
 * 
 * ⚠️ Este módulo NÃO modifica webhooks ou APIs existentes.
 * Ele fornece funções que podem ser CHAMADAS pelos sistemas existentes.
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
