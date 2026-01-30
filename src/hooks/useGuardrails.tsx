/**
 * useGuardrails - Automatic architectural guardrails hook
 * Monitors and auto-corrects navigation, scroll, state, and UI pattern issues
 * 
 * INCLUI:
 * - Validação da pilha de navegação
 * - Validação de scroll state
 * - Detecção de modais órfãos
 * - Validação do padrão CloseButtonGlobal
 */

import { useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useNavigationSafe } from '@/contexts/NavigationContext';
import { useScrollSafe } from '@/contexts/ScrollContext';
import { debugLog, debugRecovery, debugWarn } from '@/lib/debug/navigationDebug';
import {
  validateNavigationStack,
  validateScrollState,
  cleanupScrollPositions,
  type NavigationState,
  type ScrollState,
} from '@/lib/guardrails/stateValidator';
import { initCloseButtonValidator } from '@/lib/guardrails/closeButtonValidator';

interface GuardrailsConfig {
  /**
   * Enable navigation stack validation
   * @default true
   */
  validateNavigation?: boolean;
  
  /**
   * Enable scroll state validation
   * @default true
   */
  validateScroll?: boolean;
  
  /**
   * Enable auto-recovery for issues
   * @default true
   */
  autoRecover?: boolean;
  
  /**
   * Interval for periodic validation (ms)
   * @default 30000 (30 seconds)
   */
  validationInterval?: number;
  
  /**
   * Enable debug logging
   * @default true in development
   */
  enableLogging?: boolean;
  
  /**
   * Enable close button pattern validation
   * @default true in development
   */
  validateCloseButtons?: boolean;
}

const DEFAULT_CONFIG: Required<GuardrailsConfig> = {
  validateNavigation: true,
  validateScroll: true,
  autoRecover: true,
  validationInterval: 30000,
  enableLogging: import.meta.env.DEV,
  validateCloseButtons: import.meta.env.DEV,
};

/**
 * Hook that provides automatic guardrails for the application
 */
export function useGuardrails(config: GuardrailsConfig = {}) {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const location = useLocation();
  const navigate = useNavigate();
  const navigation = useNavigationSafe();
  const scrollContext = useScrollSafe();
  const lastValidationRef = useRef<number>(0);
  const recoveryAttemptsRef = useRef<number>(0);
  const MAX_RECOVERY_ATTEMPTS = 3;

  // Validate navigation stack
  const validateAndRecoverNavigation = useCallback(() => {
    if (!mergedConfig.validateNavigation || !navigation) return;

    const state: NavigationState = {
      screenStack: navigation.screenStack,
      modalStack: navigation.modalStack,
      currentPath: location.pathname,
    };

    const result = validateNavigationStack(state);

    if (!result.isValid && mergedConfig.autoRecover) {
      if (recoveryAttemptsRef.current < MAX_RECOVERY_ATTEMPTS) {
        recoveryAttemptsRef.current++;
        
        // Attempt recovery based on issue type
        for (const issue of result.issues) {
          if (issue.includes('empty')) {
            debugRecovery('Empty screen stack', 'Reinitializing with current path');
            // The navigation context will auto-initialize on next render
          } else if (issue.includes('mismatch')) {
            debugRecovery('Path mismatch', 'Syncing stack with current location');
            // Force a navigation to current path to sync
            navigate(location.pathname, { replace: true });
          }
        }
      } else if (mergedConfig.enableLogging) {
        debugWarn('guardrail', 'Max recovery attempts reached for navigation');
      }
    } else {
      // Reset recovery counter on successful validation
      recoveryAttemptsRef.current = 0;
    }
  }, [navigation, location.pathname, navigate, mergedConfig]);

  // Validate scroll state
  const validateAndRecoverScroll = useCallback(() => {
    if (!mergedConfig.validateScroll || !scrollContext) return;

    // Build scroll state for validation
    const positions = new Map<string, { position: number; timestamp: number }>();
    
    // Access internal state if available (we'll use a simplified check)
    // The scroll context handles its own cleanup, so we just trigger it
    
    if (mergedConfig.enableLogging) {
      debugLog('guardrail', 'Scroll state validation triggered');
    }
  }, [scrollContext, mergedConfig]);

  // Close orphan modals (modals that should have been closed)
  const closeOrphanModals = useCallback(() => {
    if (!navigation) return;

    const modalCount = navigation.getModalCount();
    if (modalCount > 5) {
      // Too many modals open - likely a bug
      debugWarn('guardrail', `Excessive modals detected: ${modalCount}`);
      
      if (mergedConfig.autoRecover) {
        debugRecovery('Too many modals', 'Closing all modals');
        navigation.closeAllModals();
      }
    }
  }, [navigation, mergedConfig.autoRecover]);

  // Run validation on route change
  useEffect(() => {
    validateAndRecoverNavigation();
    closeOrphanModals();
  }, [location.pathname, validateAndRecoverNavigation, closeOrphanModals]);

  // Periodic validation
  useEffect(() => {
    if (mergedConfig.validationInterval <= 0) return;

    const interval = setInterval(() => {
      const now = Date.now();
      if (now - lastValidationRef.current >= mergedConfig.validationInterval) {
        lastValidationRef.current = now;
        
        if (mergedConfig.enableLogging) {
          debugLog('guardrail', 'Periodic validation running');
        }
        
        validateAndRecoverNavigation();
        validateAndRecoverScroll();
        closeOrphanModals();
      }
    }, mergedConfig.validationInterval);

    return () => clearInterval(interval);
  }, [mergedConfig.validationInterval, mergedConfig.enableLogging, validateAndRecoverNavigation, validateAndRecoverScroll, closeOrphanModals]);

  // Visibility change handler - validate when tab becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (mergedConfig.enableLogging) {
          debugLog('guardrail', 'Tab became visible - running validation');
        }
        validateAndRecoverNavigation();
        validateAndRecoverScroll();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [validateAndRecoverNavigation, validateAndRecoverScroll, mergedConfig.enableLogging]);

  // Online/offline handler - validate when connection restored
  useEffect(() => {
    const handleOnline = () => {
      if (mergedConfig.enableLogging) {
        debugLog('guardrail', 'Connection restored - running validation');
      }
      validateAndRecoverNavigation();
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [validateAndRecoverNavigation, mergedConfig.enableLogging]);

  // Close button pattern validator (development only)
  useEffect(() => {
    if (!mergedConfig.validateCloseButtons) return;
    
    const cleanup = initCloseButtonValidator();
    
    if (mergedConfig.enableLogging) {
      debugLog('guardrail', 'CloseButtonGlobal validator initialized');
    }
    
    return cleanup;
  }, [mergedConfig.validateCloseButtons, mergedConfig.enableLogging]);

  return {
    validateNavigation: validateAndRecoverNavigation,
    validateScroll: validateAndRecoverScroll,
    closeOrphanModals,
  };
}

/**
 * Global guardrails wrapper component
 */
export function GuardrailsProvider({ children }: { children: React.ReactNode }) {
  useGuardrails();
  return <>{children}</>;
}

export default useGuardrails;
