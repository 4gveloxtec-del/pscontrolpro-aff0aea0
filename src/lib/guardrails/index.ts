/**
 * Guardrails System - Central exports
 * 
 * Sistema de blindagem arquitetural que valida e protege padrões críticos:
 * - Navegação e pilha de modais
 * - Scroll e restauração de estado
 * - Botão de fechamento global (CloseButtonGlobal)
 */

export { debugLog, debugWarn, debugError, debugRecovery, getDebugLogs, clearDebugLogs, toggleDebugCategory } from '@/lib/debug/navigationDebug';
export { validateNavigationStack, validateScrollState, cleanupScrollPositions, recoverNavigationStack, validateScreenContext, type ValidationResult, type NavigationState, type ScrollState } from '@/lib/guardrails/stateValidator';
export { validateCloseButtons, logViolations, initCloseButtonValidator, useCloseButtonValidator } from '@/lib/guardrails/closeButtonValidator';
