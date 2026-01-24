/**
 * Exponential Backoff with Jitter
 * 
 * Implementa retry inteligente para operações de rede:
 * - Base exponencial: 2^attempt * baseDelay
 * - Jitter aleatório: evita thundering herd
 * - Cap máximo: evita delays excessivos
 * - Tracking de estado: evita retries simultâneos
 */

export interface BackoffConfig {
  baseDelayMs: number;      // Delay base em ms (default: 1000)
  maxDelayMs: number;       // Delay máximo em ms (default: 60000)
  maxAttempts: number;      // Máximo de tentativas (default: 5)
  jitterFactor: number;     // Fator de jitter 0-1 (default: 0.3)
  backoffFactor: number;    // Fator exponencial (default: 2)
}

export interface BackoffState {
  attempt: number;
  lastAttemptAt: number | null;
  nextRetryAt: number | null;
  isRetrying: boolean;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
}

const DEFAULT_CONFIG: BackoffConfig = {
  baseDelayMs: 1000,
  maxDelayMs: 60000,    // 1 minute max
  maxAttempts: 5,
  jitterFactor: 0.3,    // 30% random variation
  backoffFactor: 2,
};

/**
 * Calcula o delay com exponential backoff e jitter
 */
export function calculateBackoffDelay(
  attempt: number,
  config: Partial<BackoffConfig> = {}
): number {
  const { baseDelayMs, maxDelayMs, jitterFactor, backoffFactor } = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  // Exponential: base * (factor ^ attempt)
  const exponentialDelay = baseDelayMs * Math.pow(backoffFactor, attempt);
  
  // Cap at max delay
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs);
  
  // Add jitter: random value between -jitter and +jitter
  const jitterRange = cappedDelay * jitterFactor;
  const jitter = (Math.random() * 2 - 1) * jitterRange; // -jitterRange to +jitterRange
  
  // Ensure positive delay
  return Math.max(100, Math.round(cappedDelay + jitter));
}

/**
 * Cria uma instância de backoff manager
 */
export function createBackoffManager(config: Partial<BackoffConfig> = {}) {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  
  let state: BackoffState = {
    attempt: 0,
    lastAttemptAt: null,
    nextRetryAt: null,
    isRetrying: false,
    consecutiveFailures: 0,
    consecutiveSuccesses: 0,
  };

  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return {
    getState: () => ({ ...state }),
    
    getConfig: () => ({ ...fullConfig }),

    /**
     * Registra sucesso - reseta contador de falhas
     */
    recordSuccess: () => {
      state = {
        ...state,
        attempt: 0,
        consecutiveFailures: 0,
        consecutiveSuccesses: state.consecutiveSuccesses + 1,
        isRetrying: false,
        nextRetryAt: null,
      };
    },

    /**
     * Registra falha - incrementa contadores
     */
    recordFailure: () => {
      state = {
        ...state,
        attempt: state.attempt + 1,
        lastAttemptAt: Date.now(),
        consecutiveFailures: state.consecutiveFailures + 1,
        consecutiveSuccesses: 0,
      };
    },

    /**
     * Verifica se deve tentar novamente
     */
    shouldRetry: (): boolean => {
      return state.attempt < fullConfig.maxAttempts;
    },

    /**
     * Obtém o próximo delay de retry
     */
    getNextDelay: (): number => {
      if (state.attempt >= fullConfig.maxAttempts) return 0;
      return calculateBackoffDelay(state.attempt, fullConfig);
    },

    /**
     * Agenda um retry com callback
     */
    scheduleRetry: (callback: () => void): number | null => {
      if (state.isRetrying) {
        console.log('[Backoff] Retry já em andamento, ignorando');
        return null;
      }

      if (state.attempt >= fullConfig.maxAttempts) {
        console.log('[Backoff] Máximo de tentativas atingido');
        return null;
      }

      const delay = calculateBackoffDelay(state.attempt, fullConfig);
      
      state = {
        ...state,
        isRetrying: true,
        nextRetryAt: Date.now() + delay,
      };

      console.log(`[Backoff] Retry agendado em ${delay}ms (tentativa ${state.attempt + 1}/${fullConfig.maxAttempts})`);

      timeoutId = setTimeout(() => {
        state = { ...state, isRetrying: false };
        callback();
      }, delay);

      return delay;
    },

    /**
     * Cancela retry pendente
     */
    cancelRetry: () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      state = {
        ...state,
        isRetrying: false,
        nextRetryAt: null,
      };
    },

    /**
     * Reseta completamente o estado
     */
    reset: () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      state = {
        attempt: 0,
        lastAttemptAt: null,
        nextRetryAt: null,
        isRetrying: false,
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
      };
    },

    /**
     * Obtém tempo restante até próximo retry
     */
    getTimeUntilRetry: (): number | null => {
      if (!state.nextRetryAt) return null;
      return Math.max(0, state.nextRetryAt - Date.now());
    },
  };
}

/**
 * Hook-friendly wrapper para executar função com backoff
 */
export async function executeWithBackoff<T>(
  fn: () => Promise<T>,
  config: Partial<BackoffConfig> = {},
  onRetry?: (attempt: number, delay: number) => void
): Promise<T> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < fullConfig.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt < fullConfig.maxAttempts - 1) {
        const delay = calculateBackoffDelay(attempt, fullConfig);
        onRetry?.(attempt + 1, delay);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error('Max attempts reached');
}
