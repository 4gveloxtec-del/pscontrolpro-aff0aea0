import { useEffect, useRef } from 'react';

/**
 * Hook to prevent automatic scroll after button/form interactions
 * Preserves scroll position when clicking action buttons or interacting with dialogs
 */
export function useScrollPreservation() {
  const savedScrollRef = useRef<number | null>(null);
  const isPreservingRef = useRef(false);

  useEffect(() => {
    const preserveScroll = () => {
      if (isPreservingRef.current && savedScrollRef.current !== null) {
        const diff = Math.abs(window.scrollY - savedScrollRef.current);
        if (diff > 50) {
          window.scrollTo({ top: savedScrollRef.current, behavior: 'instant' });
        }
      }
    };

    const handleInteractionStart = (e: Event) => {
      const target = e.target as HTMLElement;
      
      // Check if target is an interactive element that might cause scroll
      const isInteractiveElement = 
        target.matches('button, [role="button"], [role="menuitem"], [role="option"], input, select, textarea, [data-radix-collection-item]') ||
        target.closest('button, [role="button"], [role="menuitem"], [role="option"], [data-radix-collection-item], [role="dialog"], [role="alertdialog"]');
      
      if (isInteractiveElement) {
        savedScrollRef.current = window.scrollY;
        isPreservingRef.current = true;
        
        // Restore scroll multiple times to catch delayed scrolls
        requestAnimationFrame(preserveScroll);
        setTimeout(preserveScroll, 50);
        setTimeout(preserveScroll, 100);
        setTimeout(preserveScroll, 200);
        
        // Stop preserving after 300ms
        setTimeout(() => {
          isPreservingRef.current = false;
          savedScrollRef.current = null;
        }, 300);
      }
    };

    // Handle dialog open/close which often causes scroll reset
    const handleDialogChange = () => {
      if (savedScrollRef.current !== null) {
        requestAnimationFrame(preserveScroll);
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
    };
  }, []);
}
