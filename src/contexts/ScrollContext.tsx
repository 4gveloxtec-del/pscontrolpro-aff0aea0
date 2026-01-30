import React, { createContext, useContext, useCallback, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// Types for scroll state
interface ScrollState {
  position: number;
  timestamp: number;
  focusedItemId?: string;
}

interface ScrollContextType {
  // Save current scroll position for a route
  saveScrollPosition: (routeKey?: string, itemId?: string) => void;
  
  // Restore scroll position for a route
  restoreScrollPosition: (routeKey?: string, immediate?: boolean) => void;
  
  // Get saved position for a route
  getScrollPosition: (routeKey?: string) => number | null;
  
  // Clear scroll position for a route
  clearScrollPosition: (routeKey?: string) => void;
  
  // Preserve scroll during an action (temporary lock)
  preserveScrollDuringAction: (action: () => void | Promise<void>, duration?: number) => Promise<void>;
  
  // Mark that we're about to perform an edit action
  markEditAction: (itemId: string) => void;
  
  // Get the last edited item ID
  getLastEditedItemId: () => string | null;
  
  // Scroll to a specific element by ID
  scrollToElement: (elementId: string, options?: ScrollToElementOptions) => void;
}

interface ScrollToElementOptions {
  behavior?: 'smooth' | 'instant';
  block?: 'start' | 'center' | 'end' | 'nearest';
  offset?: number;
}

const ScrollContext = createContext<ScrollContextType | null>(null);

// Maximum age for stored scroll positions (10 minutes)
const MAX_SCROLL_AGE = 10 * 60 * 1000;

// Debounce time for scroll saves
const SCROLL_SAVE_DEBOUNCE = 100;

export function ScrollProvider({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  
  // Store scroll positions per route
  const scrollPositions = useRef<Map<string, ScrollState>>(new Map());
  
  // Track last edited item
  const lastEditedItemRef = useRef<string | null>(null);
  
  // Track if we're in preservation mode
  const isPreservingRef = useRef(false);
  const preservedPositionRef = useRef<number | null>(null);
  
  // Debounce timer for saving scroll
  const saveDebounceRef = useRef<number | null>(null);
  
  // Previous route for detecting navigation
  const previousRouteRef = useRef<string>(location.pathname);
  
  // Get current route key
  const getCurrentRouteKey = useCallback(() => {
    return location.pathname + location.search;
  }, [location.pathname, location.search]);
  
  // Clean up old scroll positions
  const cleanupOldPositions = useCallback(() => {
    const now = Date.now();
    for (const [key, state] of scrollPositions.current.entries()) {
      if (now - state.timestamp > MAX_SCROLL_AGE) {
        scrollPositions.current.delete(key);
      }
    }
  }, []);
  
  // Save scroll position
  const saveScrollPosition = useCallback((routeKey?: string, itemId?: string) => {
    const key = routeKey || getCurrentRouteKey();
    const position = window.scrollY;
    
    scrollPositions.current.set(key, {
      position,
      timestamp: Date.now(),
      focusedItemId: itemId || lastEditedItemRef.current || undefined,
    });
  }, [getCurrentRouteKey]);
  
  // Debounced save on scroll
  const debouncedSaveScroll = useCallback(() => {
    if (saveDebounceRef.current) {
      clearTimeout(saveDebounceRef.current);
    }
    
    saveDebounceRef.current = window.setTimeout(() => {
      if (!isPreservingRef.current) {
        saveScrollPosition();
      }
    }, SCROLL_SAVE_DEBOUNCE);
  }, [saveScrollPosition]);
  
  // Restore scroll position
  const restoreScrollPosition = useCallback((routeKey?: string, immediate: boolean = false) => {
    const key = routeKey || getCurrentRouteKey();
    const state = scrollPositions.current.get(key);
    
    if (!state) return;
    
    // Check if position is still valid (not too old)
    if (Date.now() - state.timestamp > MAX_SCROLL_AGE) {
      scrollPositions.current.delete(key);
      return;
    }
    
    const restore = () => {
      window.scrollTo({
        top: state.position,
        behavior: immediate ? 'instant' : 'auto',
      });
      
      // If there was a focused item, try to scroll to it
      if (state.focusedItemId) {
        requestAnimationFrame(() => {
          const element = document.getElementById(state.focusedItemId!) ||
                          document.querySelector(`[data-item-id="${state.focusedItemId}"]`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        });
      }
    };
    
    if (immediate) {
      restore();
    } else {
      // Wait for render to complete
      requestAnimationFrame(() => {
        requestAnimationFrame(restore);
      });
    }
  }, [getCurrentRouteKey]);
  
  // Get saved position
  const getScrollPosition = useCallback((routeKey?: string): number | null => {
    const key = routeKey || getCurrentRouteKey();
    const state = scrollPositions.current.get(key);
    
    if (!state || Date.now() - state.timestamp > MAX_SCROLL_AGE) {
      return null;
    }
    
    return state.position;
  }, [getCurrentRouteKey]);
  
  // Clear scroll position
  const clearScrollPosition = useCallback((routeKey?: string) => {
    const key = routeKey || getCurrentRouteKey();
    scrollPositions.current.delete(key);
  }, [getCurrentRouteKey]);
  
  // Preserve scroll during an action
  const preserveScrollDuringAction = useCallback(async (
    action: () => void | Promise<void>,
    duration: number = 1000
  ) => {
    // Save current position
    preservedPositionRef.current = window.scrollY;
    isPreservingRef.current = true;
    
    // Create restoration function
    const restorePosition = () => {
      if (preservedPositionRef.current !== null && isPreservingRef.current) {
        const diff = Math.abs(window.scrollY - preservedPositionRef.current);
        if (diff > 20) {
          window.scrollTo({ top: preservedPositionRef.current, behavior: 'instant' });
        }
      }
    };
    
    // Set up restoration intervals
    const intervals = [0, 16, 50, 100, 150, 200, 300, 400, 500, 750];
    const timeouts = intervals.map(ms => 
      window.setTimeout(restorePosition, ms)
    );
    
    try {
      // Execute the action
      await action();
    } finally {
      // Keep restoring for the duration
      window.setTimeout(() => {
        isPreservingRef.current = false;
        preservedPositionRef.current = null;
        timeouts.forEach(clearTimeout);
      }, duration);
    }
  }, []);
  
  // Mark edit action
  const markEditAction = useCallback((itemId: string) => {
    lastEditedItemRef.current = itemId;
    saveScrollPosition(undefined, itemId);
  }, [saveScrollPosition]);
  
  // Get last edited item
  const getLastEditedItemId = useCallback(() => {
    return lastEditedItemRef.current;
  }, []);
  
  // Scroll to element
  const scrollToElement = useCallback((
    elementId: string,
    options: ScrollToElementOptions = {}
  ) => {
    const {
      behavior = 'smooth',
      block = 'center',
      offset = 0,
    } = options;
    
    const element = document.getElementById(elementId) ||
                    document.querySelector(`[data-item-id="${elementId}"]`);
    
    if (!element) return;
    
    if (offset !== 0) {
      const rect = element.getBoundingClientRect();
      const absoluteTop = window.scrollY + rect.top + offset;
      window.scrollTo({ top: absoluteTop, behavior });
    } else {
      element.scrollIntoView({ behavior, block });
    }
  }, []);
  
  // Handle route changes
  useEffect(() => {
    const currentRoute = location.pathname;
    const previousRoute = previousRouteRef.current;
    
    if (currentRoute !== previousRoute) {
      // Save scroll for the route we're leaving
      scrollPositions.current.set(previousRoute, {
        position: window.scrollY,
        timestamp: Date.now(),
        focusedItemId: lastEditedItemRef.current || undefined,
      });
      
      // Check if we should restore or reset scroll
      const isNavigatingBack = window.history.state?.idx < (window.history.state?.prevIdx ?? 0);
      const savedState = scrollPositions.current.get(currentRoute);
      
      if (isNavigatingBack && savedState) {
        // Navigating back - restore scroll
        requestAnimationFrame(() => {
          restoreScrollPosition(currentRoute, true);
        });
      } else if (!savedState) {
        // New screen - scroll to top
        window.scrollTo({ top: 0, behavior: 'instant' });
      }
      
      // Clear last edited item on route change
      lastEditedItemRef.current = null;
      previousRouteRef.current = currentRoute;
    }
    
    // Cleanup old positions periodically
    cleanupOldPositions();
  }, [location.pathname, cleanupOldPositions, restoreScrollPosition]);
  
  // Auto-save scroll on scroll events
  useEffect(() => {
    const handleScroll = () => {
      if (!isPreservingRef.current) {
        debouncedSaveScroll();
      }
    };
    
    window.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (saveDebounceRef.current) {
        clearTimeout(saveDebounceRef.current);
      }
    };
  }, [debouncedSaveScroll]);
  
  const contextValue: ScrollContextType = {
    saveScrollPosition,
    restoreScrollPosition,
    getScrollPosition,
    clearScrollPosition,
    preserveScrollDuringAction,
    markEditAction,
    getLastEditedItemId,
    scrollToElement,
  };
  
  return (
    <ScrollContext.Provider value={contextValue}>
      {children}
    </ScrollContext.Provider>
  );
}

// Hook to use scroll context
export function useScroll() {
  const context = useContext(ScrollContext);
  if (!context) {
    throw new Error('useScroll must be used within a ScrollProvider');
  }
  return context;
}

// Safe hook that doesn't throw if outside provider
export function useScrollSafe() {
  return useContext(ScrollContext);
}
