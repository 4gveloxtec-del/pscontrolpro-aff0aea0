import { useEffect } from 'react';

/**
 * Hook to prevent automatic scroll after button/form interactions
 * Preserves scroll position when clicking action buttons
 */
export function useScrollPreservation() {
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      
      // Check if target is an action element
      const isActionElement = 
        target.matches('button, [role="button"], [class*="btn"], [class*="action"], input[type="submit"]') ||
        target.closest('button, [role="button"], [class*="btn"], [class*="action"], input[type="submit"]');
      
      if (isActionElement) {
        const scrollY = window.scrollY;
        
        requestAnimationFrame(() => {
          // Only restore if scroll changed unexpectedly
          if (Math.abs(window.scrollY - scrollY) > 50) {
            window.scrollTo({ top: scrollY, behavior: 'instant' });
          }
        });
      }
    };

    // Use capture phase to intercept before default behavior
    document.addEventListener('click', handleClick, true);
    
    return () => {
      document.removeEventListener('click', handleClick, true);
    };
  }, []);
}
