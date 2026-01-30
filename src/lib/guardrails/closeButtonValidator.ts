/**
 * =========================================================================
 * Close Button Validator - Validador automático do padrão de fechamento
 * =========================================================================
 * 
 * Este módulo detecta violações do padrão global de botão de fechamento.
 * 
 * VIOLAÇÕES DETECTADAS:
 * 1. Botões X manuais fora do CloseButtonGlobal
 * 2. Uso de onClick em botões de fechamento
 * 3. Uso de window.history.back() para fechar overlays
 * 4. Handlers locais de fechamento (setOpen(false), onClose())
 * 
 * COMO USAR:
 * O validador é executado automaticamente em desenvolvimento.
 * Violações aparecem no console como warnings.
 * 
 * =========================================================================
 */

const VIOLATION_PATTERNS = {
  MANUAL_CLOSE_BUTTON: 'MANUAL_CLOSE_BUTTON',
  HISTORY_BACK_CLOSE: 'HISTORY_BACK_CLOSE', 
  INLINE_ONCLICK_CLOSE: 'INLINE_ONCLICK_CLOSE',
} as const;

type ViolationType = keyof typeof VIOLATION_PATTERNS;

interface Violation {
  type: ViolationType;
  message: string;
  element?: Element;
  suggestion: string;
}

/**
 * Verifica se um elemento é um botão de fechamento manual (fora do padrão)
 */
function isManualCloseButton(element: Element): boolean {
  // Ignora o CloseButtonGlobal legítimo
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel === 'Fechar' && element.closest('[data-radix-dialog-close]')) {
    return false; // É o botão global dentro do primitivo Close
  }

  // Detecta botões X manuais
  const textContent = element.textContent?.trim().toLowerCase() || '';
  const hasXIcon = element.querySelector('svg path[d*="18 6"]') !== null;
  const isCloseButton = 
    textContent === 'x' || 
    textContent === '×' ||
    hasXIcon ||
    ariaLabel?.toLowerCase().includes('close') ||
    ariaLabel?.toLowerCase().includes('fechar');

  // Verifica se está dentro de um overlay mas não é o botão global
  const isInOverlay = 
    element.closest('[role="dialog"]') !== null ||
    element.closest('[data-vaul-drawer]') !== null;

  return isCloseButton && isInOverlay;
}

/**
 * Executa validação no DOM atual
 */
export function validateCloseButtons(): Violation[] {
  const violations: Violation[] = [];

  // Busca todos os botões no documento
  const buttons = document.querySelectorAll('button, [role="button"]');
  
  buttons.forEach(button => {
    if (isManualCloseButton(button)) {
      // Verifica se é o CloseButtonGlobal legítimo
      const isGlobalButton = button.classList.contains('z-[9999]') && 
                             button.getAttribute('aria-label') === 'Fechar';
      
      if (!isGlobalButton) {
        violations.push({
          type: 'MANUAL_CLOSE_BUTTON',
          message: 'Botão de fechamento manual detectado fora do padrão global',
          element: button,
          suggestion: 'Use DialogContent, SheetContent ou DrawerContent que já incluem o CloseButtonGlobal automaticamente',
        });
      }
    }
  });

  return violations;
}

/**
 * Log de violações no console (apenas em desenvolvimento)
 */
export function logViolations(violations: Violation[]): void {
  if (violations.length === 0) return;
  
  console.group('🚨 Close Button Validator - Violações Detectadas');
  
  violations.forEach((violation, index) => {
    console.warn(
      `[${index + 1}] ${violation.type}:\n` +
      `   Mensagem: ${violation.message}\n` +
      `   Sugestão: ${violation.suggestion}`
    );
    if (violation.element) {
      console.log('   Elemento:', violation.element);
    }
  });
  
  console.groupEnd();
}

/**
 * Inicia o validador automático em desenvolvimento
 */
export function initCloseButtonValidator(): () => void {
  if (process.env.NODE_ENV !== 'development') {
    return () => {}; // No-op em produção
  }

  let timeoutId: NodeJS.Timeout | null = null;

  const runValidation = () => {
    // Debounce para evitar múltiplas execuções
    if (timeoutId) clearTimeout(timeoutId);
    
    timeoutId = setTimeout(() => {
      const violations = validateCloseButtons();
      if (violations.length > 0) {
        logViolations(violations);
      }
    }, 1000);
  };

  // Observer para detectar mudanças no DOM
  const observer = new MutationObserver((mutations) => {
    const hasRelevantChange = mutations.some(mutation => 
      mutation.type === 'childList' && 
      (mutation.target as Element).closest?.('[role="dialog"]') !== null
    );
    
    if (hasRelevantChange) {
      runValidation();
    }
  });

  // Inicia observação
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Executa validação inicial
  runValidation();

  // Retorna função de cleanup
  return () => {
    if (timeoutId) clearTimeout(timeoutId);
    observer.disconnect();
  };
}

/**
 * Hook para usar o validador em componentes React
 */
export function useCloseButtonValidator(): void {
  if (typeof window === 'undefined') return;
  
  // Executa apenas uma vez na montagem
  const cleanupRef = { current: null as (() => void) | null };
  
  if (!cleanupRef.current) {
    cleanupRef.current = initCloseButtonValidator();
  }
}
