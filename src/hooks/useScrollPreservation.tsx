import { useCallback, useRef, useEffect } from 'react';
import { useScrollSafe } from '@/contexts/ScrollContext';

interface UseScrollPreservationOptions {
  /**
   * Whether to auto-preserve scroll on interactive element clicks
   */
  autoPreserve?: boolean;
  
  /**
   * Duration to preserve scroll after an action (ms)
   */
  preserveDuration?: number;
}

/**
 * Enhanced scroll preservation hook that integrates with the global ScrollContext.
 * Provides both automatic and manual scroll preservation capabilities.
 */
export function useScrollPreservation(options: UseScrollPreservationOptions = {}) {
  const {
    autoPreserve = true,
    preserveDuration = 500,
  } = options;
  
  const scroll = useScrollSafe();
  
  // Local state for when context is not available
  const savedScrollRef = useRef<number | null>(null);
  const isPreservingRef = useRef(false);
  const preserveTimeoutRef = useRef<number | null>(null);

  const preserveScroll = useCallback(() => {
    if (isPreservingRef.current && savedScrollRef.current !== null) {
      const diff = Math.abs(window.scrollY - savedScrollRef.current);
      if (diff > 30) {
        window.scrollTo({ top: savedScrollRef.current, behavior: 'instant' });
      }
    }
  }, []);

  const startPreserving = useCallback((duration: number = preserveDuration) => {
    savedScrollRef.current = window.scrollY;
    isPreservingRef.current = true;
    
    // Also save to context if available
    if (scroll) {
      scroll.saveScrollPosition();
    }
    
    // Clear existing timeout
    if (preserveTimeoutRef.current) {
      clearTimeout(preserveTimeoutRef.current);
    }
    
    // Restore scroll multiple times to catch delayed scrolls
    requestAnimationFrame(preserveScroll);
    setTimeout(preserveScroll, 16);
    setTimeout(preserveScroll, 50);
    setTimeout(preserveScroll, 100);
    setTimeout(preserveScroll, 200);
    setTimeout(preserveScroll, 300);
    setTimeout(preserveScroll, 400);
    
    // Stop preserving after duration
    preserveTimeoutRef.current = window.setTimeout(() => {
      isPreservingRef.current = false;
      savedScrollRef.current = null;
    }, duration);
  }, [preserveScroll, scroll, preserveDuration]);

  // Wrap an async action with scroll preservation
  const withScrollPreservation = useCallback(async <T,>(
    action: () => T | Promise<T>,
    duration?: number
  ): Promise<T> => {
    if (scroll) {
      let result: T;
      await scroll.preserveScrollDuringAction(async () => {
        result = await action();
      }, duration || preserveDuration);
      return result!;
    } else {
      startPreserving(duration || preserveDuration);
      try {
        return await action();
      } finally {
        // Preservation will auto-stop after timeout
      }
    }
  }, [scroll, startPreserving, preserveDuration]);

  // Mark an item as being edited (for smart restoration)
  const markItemEdit = useCallback((itemId: string) => {
    if (scroll) {
      scroll.markEditAction(itemId);
    }
    startPreserving();
  }, [scroll, startPreserving]);

  useEffect(() => {
    if (!autoPreserve) return;

    const handleInteractionStart = (e: Event) => {
      const target = e.target as HTMLElement;
      
      // Check if target is an interactive element that might cause scroll
      const isInteractiveElement = 
        target.matches('button, [role="button"], [role="menuitem"], [role="option"], input, select, textarea, [data-radix-collection-item], [data-state]') ||
        target.closest('button, [role="button"], [role="menuitem"], [role="option"], [data-radix-collection-item], [role="dialog"], [role="alertdialog"], [data-state]');
      
      if (isInteractiveElement) {
        // Use longer duration for buttons that likely trigger dialog/modal operations
        const isDialogTrigger = target.closest('[data-state], [aria-haspopup], [aria-expanded]');
        startPreserving(isDialogTrigger ? 800 : preserveDuration);
      }
    };

    // Handle dialog open/close which often causes scroll reset
    const handleDialogChange = () => {
      if (savedScrollRef.current !== null && isPreservingRef.current) {
        requestAnimationFrame(preserveScroll);
        setTimeout(preserveScroll, 16);
        setTimeout(preserveScroll, 50);
        setTimeout(preserveScroll, 100);
      }
    };

    // Use capture phase to intercept before default behavior
    document.addEventListener('click', handleInteractionStart, true);
    document.addEventListener('pointerdown', handleInteractionStart, true);
    
    // Watch for attribute changes on body (dialog overlay adds/removes classes)
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' || mutation.type === 'childList') {
          handleDialogChange();
        }
      }
    });
    
    observer.observe(document.body, { 
      attributes: true, 
      childList: true,
      subtree: false 
    });
    
    return () => {
      document.removeEventListener('click', handleInteractionStart, true);
      document.removeEventListener('pointerdown', handleInteractionStart, true);
      observer.disconnect();
      if (preserveTimeoutRef.current) {
        clearTimeout(preserveTimeoutRef.current);
      }
    };
  }, [autoPreserve, preserveScroll, startPreserving, preserveDuration]);

  return {
    startPreserving,
    withScrollPreservation,
    markItemEdit,
    scrollContext: scroll,
  };
}
