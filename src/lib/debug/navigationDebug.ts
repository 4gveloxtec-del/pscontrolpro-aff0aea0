/**
 * Navigation Debug System
 * Controlled logging for navigation, scroll, focus, and state changes
 * Only active in development mode
 */

type DebugCategory = 'navigation' | 'scroll' | 'focus' | 'state' | 'recovery' | 'guardrail';

interface DebugLogEntry {
  timestamp: number;
  category: DebugCategory;
  action: string;
  details?: Record<string, unknown>;
  stackTrace?: string;
}

// Debug state
const DEBUG_ENABLED = import.meta.env.DEV;
const MAX_LOG_ENTRIES = 100;
const debugLogs: DebugLogEntry[] = [];

// Category-specific enabled flags (can be toggled at runtime in dev tools)
const categoryEnabled: Record<DebugCategory, boolean> = {
  navigation: true,
  scroll: true,
  focus: true,
  state: true,
  recovery: true,
  guardrail: true,
};

/**
 * Log a debug entry (dev mode only)
 */
export function debugLog(
  category: DebugCategory,
  action: string,
  details?: Record<string, unknown>
): void {
  if (!DEBUG_ENABLED || !categoryEnabled[category]) return;

  const entry: DebugLogEntry = {
    timestamp: Date.now(),
    category,
    action,
    details,
  };

  // Add to circular buffer
  debugLogs.push(entry);
  if (debugLogs.length > MAX_LOG_ENTRIES) {
    debugLogs.shift();
  }

  // Console output with category prefix
  const prefix = `[${category.toUpperCase()}]`;
  const style = getCategoryStyle(category);
  
  if (details) {
    console.log(`%c${prefix} ${action}`, style, details);
  } else {
    console.log(`%c${prefix} ${action}`, style);
  }
}

/**
 * Log a warning (always visible in dev)
 */
export function debugWarn(
  category: DebugCategory,
  action: string,
  details?: Record<string, unknown>
): void {
  if (!DEBUG_ENABLED) return;

  const prefix = `[${category.toUpperCase()}]`;
  console.warn(`${prefix} ⚠️ ${action}`, details || '');
}

/**
 * Log an error (always visible in dev)
 */
export function debugError(
  category: DebugCategory,
  action: string,
  error?: unknown
): void {
  if (!DEBUG_ENABLED) return;

  const prefix = `[${category.toUpperCase()}]`;
  console.error(`${prefix} ❌ ${action}`, error || '');
}

/**
 * Log a recovery action
 */
export function debugRecovery(
  issue: string,
  resolution: string,
  details?: Record<string, unknown>
): void {
  debugLog('recovery', `🔧 ${issue} → ${resolution}`, details);
}

/**
 * Get console style for category
 */
function getCategoryStyle(category: DebugCategory): string {
  const styles: Record<DebugCategory, string> = {
    navigation: 'color: #3b82f6; font-weight: bold',
    scroll: 'color: #10b981; font-weight: bold',
    focus: 'color: #f59e0b; font-weight: bold',
    state: 'color: #8b5cf6; font-weight: bold',
    recovery: 'color: #ef4444; font-weight: bold',
    guardrail: 'color: #ec4899; font-weight: bold',
  };
  return styles[category];
}

/**
 * Get all debug logs (for debugging in console)
 */
export function getDebugLogs(): DebugLogEntry[] {
  return [...debugLogs];
}

/**
 * Clear debug logs
 */
export function clearDebugLogs(): void {
  debugLogs.length = 0;
}

/**
 * Toggle category logging at runtime
 */
export function toggleDebugCategory(category: DebugCategory, enabled: boolean): void {
  categoryEnabled[category] = enabled;
}

/**
 * Export debug tools to window for console access (dev only)
 */
if (DEBUG_ENABLED && typeof window !== 'undefined') {
  (window as any).__NAV_DEBUG__ = {
    getLogs: getDebugLogs,
    clearLogs: clearDebugLogs,
    toggleCategory: toggleDebugCategory,
    categories: categoryEnabled,
  };
}
