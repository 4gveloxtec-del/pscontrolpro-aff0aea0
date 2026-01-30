import React, { createContext, useContext, useCallback, useRef, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

// Types for scroll state
export type ActionType = 'edit' | 'create' | 'response' | 'delete' | 'navigation' | 'filter' | 'refresh';

interface ScrollState {
  position: number;
  timestamp: number;
  focusedItemId?: string;
  actionType?: ActionType;
}

interface UserScrollMemory {
  [routeKey: string]: ScrollState;
}

interface FocusHighlight {
  itemId: string;
  timestamp: number;
  duration: number;
}

interface ReadinessState {
  dataLoaded: boolean;
  layoutStable: boolean;
  listsReady: boolean;
}

interface ScrollContextType {
  // Save current scroll position for a route
  saveScrollPosition: (routeKey?: string, itemId?: string, actionType?: ActionType) => void;
  
  // Restore scroll position for a route
  restoreScrollPosition: (routeKey?: string, immediate?: boolean) => void;
  
  // Get saved position for a route
  getScrollPosition: (routeKey?: string) => number | null;
  
  // Clear scroll position for a route
  clearScrollPosition: (routeKey?: string) => void;
  
  // Clear all scroll positions (e.g., on logout)
  clearAllScrollPositions: () => void;
  
  // Preserve scroll during an action (temporary lock)
  preserveScrollDuringAction: (action: () => void | Promise<void>, duration?: number) => Promise<void>;
  
  // Mark that we're about to perform an edit action
  markEditAction: (itemId: string, actionType?: ActionType) => void;
  
  // Get the last edited item ID
  getLastEditedItemId: () => string | null;
  
  // Scroll to a specific element by ID with visual focus
  scrollToElement: (elementId: string, options?: ScrollToElementOptions) => void;
  
  // Focus and highlight an item after action
  focusItem: (itemId: string, options?: FocusItemOptions) => void;
  
  // Check if an item is currently highlighted
  isItemHighlighted: (itemId: string) => boolean;
  
  // Get current highlight state
  getCurrentHighlight: () => FocusHighlight | null;
  
  // Set readiness state for smart restoration
  setReadinessState: (state: Partial<ReadinessState>) => void;
  
  // Check if ready for scroll restoration
  isReadyForRestore: () => boolean;
  
  // Wait for readiness before restoring
  waitForReadinessAndRestore: (routeKey?: string, timeout?: number) => Promise<boolean>;
  
  // Set current user ID for user-based memory
  setUserId: (userId: string | null) => void;
  
  // Get current user ID
  getUserId: () => string | null;
}

interface ScrollToElementOptions {
  behavior?: 'smooth' | 'instant';
  block?: 'start' | 'center' | 'end' | 'nearest';
  offset?: number;
}

interface FocusItemOptions {
  behavior?: 'smooth' | 'instant';
  block?: 'start' | 'center' | 'end' | 'nearest';
  highlightDuration?: number;
  actionType?: ActionType;
}

const ScrollContext = createContext<ScrollContextType | null>(null);

// Maximum age for stored scroll positions (10 minutes)
const MAX_SCROLL_AGE = 10 * 60 * 1000;

// Default highlight duration
const DEFAULT_HIGHLIGHT_DURATION = 2000;

// Debounce time for scroll saves
const SCROLL_SAVE_DEBOUNCE = 100;

// Storage key prefix for persistent user memory
const STORAGE_KEY_PREFIX = 'scroll_memory_';

// Get storage key for user
const getUserStorageKey = (userId: string) => `${STORAGE_KEY_PREFIX}${userId}`;

// Load user scroll memory from localStorage
const loadUserMemory = (userId: string): UserScrollMemory => {
  try {
    const stored = localStorage.getItem(getUserStorageKey(userId));
    if (stored) {
      const memory = JSON.parse(stored) as UserScrollMemory;
      // Filter out expired entries
      const now = Date.now();
      const filtered: UserScrollMemory = {};
      for (const [key, state] of Object.entries(memory)) {
        if (now - state.timestamp <= MAX_SCROLL_AGE) {
          filtered[key] = state;
        }
      }
      return filtered;
    }
  } catch {
    // Ignore parse errors
  }
  return {};
};

// Save user scroll memory to localStorage
const saveUserMemory = (userId: string, memory: UserScrollMemory) => {
  try {
    // Clean up old entries before saving
    const now = Date.now();
    const filtered: UserScrollMemory = {};
    for (const [key, state] of Object.entries(memory)) {
      if (now - state.timestamp <= MAX_SCROLL_AGE) {
        filtered[key] = state;
      }
    }
    localStorage.setItem(getUserStorageKey(userId), JSON.stringify(filtered));
  } catch {
    // Ignore storage errors
  }
};

// Clear user scroll memory
const clearUserMemory = (userId: string) => {
  try {
    localStorage.removeItem(getUserStorageKey(userId));
  } catch {
    // Ignore errors
  }
};

export function ScrollProvider({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  
  // Current user ID for user-based memory
  const userIdRef = useRef<string | null>(null);
  
  // Store scroll positions per route (in-memory for current session)
  const scrollPositions = useRef<Map<string, ScrollState>>(new Map());
  
  // Track last edited item
  const lastEditedItemRef = useRef<string | null>(null);
  const lastActionTypeRef = useRef<ActionType | null>(null);
  
  // Track if we're in preservation mode
  const isPreservingRef = useRef(false);
  const preservedPositionRef = useRef<number | null>(null);
  
  // Debounce timer for saving scroll
  const saveDebounceRef = useRef<number | null>(null);
  
  // Previous route for detecting navigation
  const previousRouteRef = useRef<string>(location.pathname);
  
  // Current highlight state
  const [currentHighlight, setCurrentHighlight] = useState<FocusHighlight | null>(null);
  const highlightTimeoutRef = useRef<number | null>(null);
  
  // Readiness state for smart restoration
  const readinessRef = useRef<ReadinessState>({
    dataLoaded: false,
    layoutStable: false,
    listsReady: false,
  });
  
  // Pending restore callback
  const pendingRestoreRef = useRef<(() => void) | null>(null);
  
  // Set user ID
  const setUserId = useCallback((userId: string | null) => {
    const previousUserId = userIdRef.current;
    userIdRef.current = userId;
    
    // Clear in-memory positions when user changes
    if (previousUserId !== userId) {
      scrollPositions.current.clear();
      
      // Load user memory if logging in
      if (userId) {
        const memory = loadUserMemory(userId);
        for (const [key, state] of Object.entries(memory)) {
          scrollPositions.current.set(key, state);
        }
      }
    }
  }, []);
  
  // Get user ID
  const getUserId = useCallback(() => userIdRef.current, []);
  
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
  
  // Persist to localStorage if user is logged in
  const persistToStorage = useCallback(() => {
    const userId = userIdRef.current;
    if (userId) {
      const memory: UserScrollMemory = {};
      scrollPositions.current.forEach((state, key) => {
        memory[key] = state;
      });
      saveUserMemory(userId, memory);
    }
  }, []);
  
  // Save scroll position
  const saveScrollPosition = useCallback((routeKey?: string, itemId?: string, actionType?: ActionType) => {
    const key = routeKey || getCurrentRouteKey();
    const position = window.scrollY;
    
    scrollPositions.current.set(key, {
      position,
      timestamp: Date.now(),
      focusedItemId: itemId || lastEditedItemRef.current || undefined,
      actionType: actionType || lastActionTypeRef.current || undefined,
    });
    
    // Persist to storage
    persistToStorage();
  }, [getCurrentRouteKey, persistToStorage]);
  
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
  
  // Find element by ID with fallback selectors
  const findElement = useCallback((elementId: string): HTMLElement | null => {
    return (
      document.getElementById(elementId) ||
      document.querySelector(`[data-item-id="${elementId}"]`) ||
      document.querySelector(`[data-scroll-item="${elementId}"]`) ||
      null
    );
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
    
    const element = findElement(elementId);
    if (!element) return;
    
    if (offset !== 0) {
      const rect = element.getBoundingClientRect();
      const absoluteTop = window.scrollY + rect.top + offset;
      window.scrollTo({ top: absoluteTop, behavior });
    } else {
      element.scrollIntoView({ behavior, block });
    }
  }, [findElement]);
  
  // Focus and highlight an item
  const focusItem = useCallback((
    itemId: string,
    options: FocusItemOptions = {}
  ) => {
    const {
      behavior = 'smooth',
      block = 'center',
      highlightDuration = DEFAULT_HIGHLIGHT_DURATION,
      actionType,
    } = options;
    
    // Clear existing highlight timeout
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
    }
    
    // Set highlight state
    const highlight: FocusHighlight = {
      itemId,
      timestamp: Date.now(),
      duration: highlightDuration,
    };
    setCurrentHighlight(highlight);
    
    // Save action context
    lastEditedItemRef.current = itemId;
    if (actionType) {
      lastActionTypeRef.current = actionType;
    }
    
    // Use requestAnimationFrame for proper timing
    const attemptFocus = (attempts: number = 0) => {
      const element = findElement(itemId);
      
      if (element) {
        // Scroll to element
        element.scrollIntoView({ behavior, block });
        
        // Add highlight class
        element.classList.add('scroll-focus-highlight');
        
        // Remove highlight after duration
        highlightTimeoutRef.current = window.setTimeout(() => {
          element.classList.remove('scroll-focus-highlight');
          setCurrentHighlight(null);
        }, highlightDuration);
      } else if (attempts < 10) {
        // Retry if element not found yet (e.g., still rendering)
        requestAnimationFrame(() => attemptFocus(attempts + 1));
      } else {
        // Give up after max attempts
        setCurrentHighlight(null);
      }
    };
    
    // Start focus attempt after a microtask to allow render
    requestAnimationFrame(() => attemptFocus());
  }, [findElement]);
  
  // Check if item is highlighted
  const isItemHighlighted = useCallback((itemId: string): boolean => {
    return currentHighlight?.itemId === itemId;
  }, [currentHighlight]);
  
  // Get current highlight
  const getCurrentHighlight = useCallback(() => currentHighlight, [currentHighlight]);
  
  // Set readiness state
  const setReadinessState = useCallback((state: Partial<ReadinessState>) => {
    readinessRef.current = { ...readinessRef.current, ...state };
    
    // Check if we have a pending restore and are now ready
    if (pendingRestoreRef.current && isReadyForRestore()) {
      const restore = pendingRestoreRef.current;
      pendingRestoreRef.current = null;
      restore();
    }
  }, []);
  
  // Check if ready for restore
  const isReadyForRestore = useCallback((): boolean => {
    const { dataLoaded, layoutStable, listsReady } = readinessRef.current;
    // At minimum, need layout stable. Data and lists are bonuses
    return layoutStable || (dataLoaded && listsReady);
  }, []);
  
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
      // If there was a focused item, try to scroll to it first
      if (state.focusedItemId) {
        const element = findElement(state.focusedItemId);
        if (element) {
          element.scrollIntoView({ behavior: immediate ? 'instant' : 'auto', block: 'center' });
          return;
        }
      }
      
      // Fall back to saved position
      window.scrollTo({
        top: state.position,
        behavior: immediate ? 'instant' : 'auto',
      });
    };
    
    if (immediate) {
      restore();
    } else {
      // Wait for render to complete using double RAF
      requestAnimationFrame(() => {
        requestAnimationFrame(restore);
      });
    }
  }, [getCurrentRouteKey, findElement]);
  
  // Wait for readiness and then restore
  const waitForReadinessAndRestore = useCallback((
    routeKey?: string,
    timeout: number = 3000
  ): Promise<boolean> => {
    return new Promise((resolve) => {
      const key = routeKey || getCurrentRouteKey();
      const state = scrollPositions.current.get(key);
      
      if (!state) {
        resolve(false);
        return;
      }
      
      // Check if already ready
      if (isReadyForRestore()) {
        restoreScrollPosition(key, true);
        resolve(true);
        return;
      }
      
      // Set up timeout
      const timeoutId = window.setTimeout(() => {
        pendingRestoreRef.current = null;
        // Force restore anyway after timeout
        restoreScrollPosition(key, true);
        resolve(true);
      }, timeout);
      
      // Set pending restore
      pendingRestoreRef.current = () => {
        clearTimeout(timeoutId);
        restoreScrollPosition(key, true);
        resolve(true);
      };
    });
  }, [getCurrentRouteKey, isReadyForRestore, restoreScrollPosition]);
  
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
    persistToStorage();
  }, [getCurrentRouteKey, persistToStorage]);
  
  // Clear all scroll positions
  const clearAllScrollPositions = useCallback(() => {
    scrollPositions.current.clear();
    lastEditedItemRef.current = null;
    lastActionTypeRef.current = null;
    
    // Clear from storage too
    const userId = userIdRef.current;
    if (userId) {
      clearUserMemory(userId);
    }
  }, []);
  
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
    
    // Set up restoration intervals using RAF for better performance
    const restoreLoop = () => {
      if (isPreservingRef.current) {
        restorePosition();
        requestAnimationFrame(restoreLoop);
      }
    };
    
    requestAnimationFrame(restoreLoop);
    
    try {
      // Execute the action
      await action();
    } finally {
      // Keep restoring for the duration
      window.setTimeout(() => {
        isPreservingRef.current = false;
        preservedPositionRef.current = null;
      }, duration);
    }
  }, []);
  
  // Mark edit action
  const markEditAction = useCallback((itemId: string, actionType: ActionType = 'edit') => {
    lastEditedItemRef.current = itemId;
    lastActionTypeRef.current = actionType;
    saveScrollPosition(undefined, itemId, actionType);
  }, [saveScrollPosition]);
  
  // Get last edited item
  const getLastEditedItemId = useCallback(() => {
    return lastEditedItemRef.current;
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
        actionType: lastActionTypeRef.current || undefined,
      });
      
      // Persist to storage
      persistToStorage();
      
      // Reset readiness state for new route
      readinessRef.current = {
        dataLoaded: false,
        layoutStable: false,
        listsReady: false,
      };
      
      // Check if we should restore or reset scroll
      const savedState = scrollPositions.current.get(currentRoute);
      
      if (savedState) {
        // Restore scroll when ready
        waitForReadinessAndRestore(currentRoute, 2000);
      } else {
        // New screen - scroll to top
        window.scrollTo({ top: 0, behavior: 'instant' });
      }
      
      // Clear last edited item on route change
      lastEditedItemRef.current = null;
      lastActionTypeRef.current = null;
      previousRouteRef.current = currentRoute;
    }
    
    // Cleanup old positions periodically
    cleanupOldPositions();
  }, [location.pathname, cleanupOldPositions, persistToStorage, waitForReadinessAndRestore]);
  
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
  
  // Mark layout as stable after initial render
  useEffect(() => {
    // Use requestIdleCallback if available, otherwise RAF
    const markStable = () => {
      setReadinessState({ layoutStable: true });
    };
    
    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(markStable, { timeout: 500 });
    } else {
      requestAnimationFrame(() => {
        requestAnimationFrame(markStable);
      });
    }
  }, [location.pathname, setReadinessState]);
  
  // Cleanup highlight timeout on unmount
  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);
  
  const contextValue: ScrollContextType = {
    saveScrollPosition,
    restoreScrollPosition,
    getScrollPosition,
    clearScrollPosition,
    clearAllScrollPositions,
    preserveScrollDuringAction,
    markEditAction,
    getLastEditedItemId,
    scrollToElement,
    focusItem,
    isItemHighlighted,
    getCurrentHighlight,
    setReadinessState,
    isReadyForRestore,
    waitForReadinessAndRestore,
    setUserId,
    getUserId,
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

// Hook to sync user ID with scroll context
export function useScrollUserSync(userId: string | null) {
  const scroll = useScrollSafe();
  
  useEffect(() => {
    if (scroll) {
      scroll.setUserId(userId);
    }
  }, [scroll, userId]);
  
  // Clear on logout
  useEffect(() => {
    if (!userId && scroll) {
      scroll.clearAllScrollPositions();
    }
  }, [userId, scroll]);
}
