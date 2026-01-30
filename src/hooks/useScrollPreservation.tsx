import { useEffect, useRef, useCallback } from 'react';

/**
 * Hook to prevent automatic scroll after button/form interactions
 * Preserves scroll position when clicking action buttons or interacting with dialogs
 */
export function useScrollPreservation() {
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

  const startPreserving = useCallback((duration: number = 500) => {
    savedScrollRef.current = window.scrollY;
    isPreservingRef.current = true;
    
    // Clear existing timeout
    if (preserveTimeoutRef.current) {
      clearTimeout(preserveTimeoutRef.current);
    }
    
    // Restore scroll multiple times to catch delayed scrolls from async operations
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
  }, [preserveScroll]);

  useEffect(() => {
    const handleInteractionStart = (e: Event) => {
      const target = e.target as HTMLElement;
      
      // Check if target is an interactive element that might cause scroll
      const isInteractiveElement = 
        target.matches('button, [role="button"], [role="menuitem"], [role="option"], input, select, textarea, [data-radix-collection-item], [data-state]') ||
        target.closest('button, [role="button"], [role="menuitem"], [role="option"], [data-radix-collection-item], [role="dialog"], [role="alertdialog"], [data-state]');
      
      if (isInteractiveElement) {
        // Use longer duration for buttons that likely trigger dialog/modal operations
        const isDialogTrigger = target.closest('[data-state], [aria-haspopup], [aria-expanded]');
        startPreserving(isDialogTrigger ? 800 : 500);
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
  }, [preserveScroll, startPreserving]);
}
