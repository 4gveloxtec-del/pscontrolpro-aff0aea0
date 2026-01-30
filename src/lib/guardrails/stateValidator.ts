/**
 * State Validator & Auto-Recovery System
 * Detects and corrects invalid navigation/scroll/state conditions
 */

import { debugLog, debugRecovery, debugWarn } from '@/lib/debug/navigationDebug';

export interface ValidationResult {
  isValid: boolean;
  issues: string[];
  autoFixed: boolean;
}

export interface NavigationState {
  screenStack: Array<{ id: string; path?: string }>;
  modalStack: Array<{ id: string }>;
  currentPath: string;
}

export interface ScrollState {
  positions: Map<string, { position: number; timestamp: number }>;
  focusedItemId?: string;
}

/**
 * Validate navigation stack integrity
 */
export function validateNavigationStack(state: NavigationState): ValidationResult {
  const issues: string[] = [];
  let autoFixed = false;

  // Check for empty screen stack
  if (state.screenStack.length === 0) {
    issues.push('Screen stack is empty');
    debugWarn('guardrail', 'Empty screen stack detected');
  }

  // Check for duplicate entries
  const paths = state.screenStack.map(s => s.path).filter(Boolean);
  const uniquePaths = new Set(paths);
  if (paths.length !== uniquePaths.size) {
    issues.push('Duplicate paths in screen stack');
    debugWarn('guardrail', 'Duplicate paths in navigation stack', { paths });
  }

  // Verify current path matches top of stack
  const topScreen = state.screenStack[state.screenStack.length - 1];
  if (topScreen?.path && topScreen.path !== state.currentPath) {
    issues.push('Current path does not match top of stack');
    debugWarn('guardrail', 'Path mismatch', {
      expected: topScreen.path,
      actual: state.currentPath,
    });
  }

  // Check for orphan modals (modals without valid references)
  const modalIds = state.modalStack.map(m => m.id);
  const uniqueModalIds = new Set(modalIds);
  if (modalIds.length !== uniqueModalIds.size) {
    issues.push('Duplicate modal IDs in stack');
    debugWarn('guardrail', 'Duplicate modal IDs', { modalIds });
  }

  debugLog('guardrail', 'Navigation validation complete', {
    valid: issues.length === 0,
    issueCount: issues.length,
  });

  return {
    isValid: issues.length === 0,
    issues,
    autoFixed,
  };
}

/**
 * Validate scroll state integrity
 */
export function validateScrollState(state: ScrollState): ValidationResult {
  const issues: string[] = [];
  let autoFixed = false;
  const now = Date.now();
  const MAX_AGE = 10 * 60 * 1000; // 10 minutes

  // Check for expired entries
  let expiredCount = 0;
  state.positions.forEach((value, key) => {
    if (now - value.timestamp > MAX_AGE) {
      expiredCount++;
    }
  });

  if (expiredCount > 0) {
    issues.push(`${expiredCount} expired scroll positions`);
  }

  // Check for invalid positions
  state.positions.forEach((value, key) => {
    if (value.position < 0 || !Number.isFinite(value.position)) {
      issues.push(`Invalid scroll position for ${key}: ${value.position}`);
    }
  });

  debugLog('guardrail', 'Scroll validation complete', {
    valid: issues.length === 0,
    totalPositions: state.positions.size,
    expiredCount,
  });

  return {
    isValid: issues.length === 0,
    issues,
    autoFixed,
  };
}

/**
 * Auto-recover from broken navigation stack
 */
export function recoverNavigationStack(
  currentPath: string,
  navigate: (path: string, options?: { replace?: boolean }) => void
): boolean {
  debugRecovery('Broken navigation stack', 'Rebuilding with current path');

  try {
    // Determine safe route based on current context
    const isAdmin = currentPath.startsWith('/admin');
    const safeRoute = isAdmin ? '/admin/dashboard' : '/dashboard';

    // If we're not on a safe route and stack is broken, redirect
    if (currentPath !== safeRoute && currentPath !== '/auth' && currentPath !== '/admin') {
      debugLog('recovery', 'Redirecting to safe route', { from: currentPath, to: safeRoute });
      navigate(safeRoute, { replace: true });
      return true;
    }

    return false;
  } catch (error) {
    debugWarn('recovery', 'Failed to recover navigation stack', { error });
    return false;
  }
}

/**
 * Clean up stale scroll positions
 */
export function cleanupScrollPositions(
  positions: Map<string, { position: number; timestamp: number }>,
  maxAge: number = 10 * 60 * 1000
): number {
  const now = Date.now();
  let cleanedCount = 0;

  positions.forEach((value, key) => {
    if (now - value.timestamp > maxAge) {
      positions.delete(key);
      cleanedCount++;
    }
  });

  if (cleanedCount > 0) {
    debugLog('recovery', `Cleaned ${cleanedCount} stale scroll positions`);
  }

  return cleanedCount;
}

/**
 * Validate screen context (ensure screen is properly registered)
 */
export function validateScreenContext(
  screenId: string | undefined,
  containerRef: React.RefObject<HTMLElement> | null
): ValidationResult {
  const issues: string[] = [];

  if (!screenId) {
    issues.push('Screen ID is missing');
  }

  if (!containerRef?.current) {
    issues.push('Container reference is not available');
  }

  return {
    isValid: issues.length === 0,
    issues,
    autoFixed: false,
  };
}
