import React, { createContext, useContext, useCallback, useRef, useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

// Types for navigation stack
interface StackEntry {
  id: string;
  type: 'screen' | 'modal' | 'sheet' | 'drawer';
  path?: string;
  onClose?: () => void;
  data?: Record<string, unknown>;
}

interface NavigationContextType {
  // Stack state
  screenStack: StackEntry[];
  modalStack: StackEntry[];
  
  // Navigation methods
  pushScreen: (path: string, data?: Record<string, unknown>) => void;
  popScreen: () => void;
  replaceScreen: (path: string, data?: Record<string, unknown>) => void;
  
  // Modal methods
  pushModal: (id: string, onClose?: () => void, data?: Record<string, unknown>) => void;
  popModal: (id?: string, skipCallback?: boolean) => boolean;
  closeAllModals: () => void;
  isModalOpen: (id: string) => boolean;
  
  // Utility
  canGoBack: boolean;
  goToSafeRoute: () => void;
  getTopModal: () => StackEntry | undefined;
  getModalCount: () => number;
}

const NavigationContext = createContext<NavigationContextType | null>(null);

// Generate unique IDs for stack entries
let stackIdCounter = 0;
const generateStackId = () => `stack-${++stackIdCounter}-${Date.now()}`;

// Safe routes to fallback to
const SAFE_ROUTES = ['/dashboard', '/admin/dashboard', '/auth'];

export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Screen navigation stack (mirrors browser history)
  const [screenStack, setScreenStack] = useState<StackEntry[]>([]);
  
  // Modal/overlay stack (managed separately from routing)
  const [modalStack, setModalStack] = useState<StackEntry[]>([]);
  
  // Ref to track if we should ignore next location change
  const ignoreNextLocationChange = useRef(false);
  
  // Initialize screen stack with current location
  useEffect(() => {
    if (screenStack.length === 0) {
      setScreenStack([{
        id: generateStackId(),
        type: 'screen',
        path: location.pathname,
      }]);
    }
  }, []);
  
  // Sync screen stack with location changes
  useEffect(() => {
    if (ignoreNextLocationChange.current) {
      ignoreNextLocationChange.current = false;
      return;
    }
    
    setScreenStack(prev => {
      // Check if navigating back
      const prevIndex = prev.findIndex(entry => entry.path === location.pathname);
      if (prevIndex >= 0 && prevIndex < prev.length - 1) {
        // Pop entries after the found index
        return prev.slice(0, prevIndex + 1);
      }
      
      // Check if replacing current
      if (prev.length > 0 && prev[prev.length - 1].path === location.pathname) {
        return prev;
      }
      
      // Push new entry
      return [...prev, {
        id: generateStackId(),
        type: 'screen',
        path: location.pathname,
      }];
    });
  }, [location.pathname]);
  
  // Determine if we can go back
  const canGoBack = screenStack.length > 1;
  
  // Push a new screen
  const pushScreen = useCallback((path: string, data?: Record<string, unknown>) => {
    navigate(path, { state: data });
  }, [navigate]);
  
  // Pop current screen (go back)
  const popScreen = useCallback(() => {
    if (screenStack.length > 1) {
      navigate(-1);
    } else {
      // No history, go to safe route
      goToSafeRoute();
    }
  }, [navigate, screenStack.length]);
  
  // Replace current screen
  const replaceScreen = useCallback((path: string, data?: Record<string, unknown>) => {
    ignoreNextLocationChange.current = true;
    setScreenStack(prev => {
      if (prev.length === 0) {
        return [{
          id: generateStackId(),
          type: 'screen',
          path,
          data,
        }];
      }
      const newStack = [...prev];
      newStack[newStack.length - 1] = {
        ...newStack[newStack.length - 1],
        path,
        data,
      };
      return newStack;
    });
    navigate(path, { replace: true, state: data });
  }, [navigate]);
  
  // Go to a safe route (fallback)
  const goToSafeRoute = useCallback(() => {
    const currentPath = location.pathname;
    
    // Determine which safe route based on context
    if (currentPath.startsWith('/admin')) {
      navigate('/admin/dashboard', { replace: true });
    } else {
      navigate('/dashboard', { replace: true });
    }
  }, [navigate, location.pathname]);
  
  // Push a modal to the stack
  const pushModal = useCallback((id: string, onClose?: () => void, data?: Record<string, unknown>) => {
    setModalStack(prev => {
      // Avoid duplicates
      if (prev.some(entry => entry.id === id)) {
        return prev;
      }
      return [...prev, {
        id,
        type: 'modal',
        onClose,
        data,
      }];
    });
  }, []);
  
  // Track popped modals to prevent double-pop (idempotency guard)
  const poppedModalsRef = useRef<Set<string>>(new Set());
  
  // Pop a modal from the stack with idempotency
  // skipCallback: when true, removes from stack without calling onClose (used when modal already closed via UI)
  const popModal = useCallback((id?: string, skipCallback?: boolean): boolean => {
    // If specific id provided, check idempotency
    if (id && poppedModalsRef.current.has(id)) {
      return false; // Already popped, skip
    }
    
    let closedEntry: StackEntry | undefined;
    let entryId: string | undefined;
    
    setModalStack(prev => {
      if (prev.length === 0) return prev;
      
      if (id) {
        const index = prev.findIndex(entry => entry.id === id);
        if (index >= 0) {
          closedEntry = prev[index];
          entryId = id;
          return [...prev.slice(0, index), ...prev.slice(index + 1)];
        }
        return prev;
      } else {
        closedEntry = prev[prev.length - 1];
        entryId = closedEntry?.id;
        return prev.slice(0, -1);
      }
    });
    
    // Mark as popped and call callback (unless skipCallback is true)
    if (closedEntry && entryId) {
      poppedModalsRef.current.add(entryId);
      // Clear from set after a short delay to allow re-opening
      setTimeout(() => {
        poppedModalsRef.current.delete(entryId!);
      }, 100);
      
      // Only call onClose if not skipping (i.e., when triggered by back button or programmatic close)
      if (!skipCallback) {
        closedEntry.onClose?.();
      }
    }
    
    return !!closedEntry;
  }, []);
  
  // Close all modals
  const closeAllModals = useCallback(() => {
    setModalStack(prev => {
      // Call all onClose callbacks
      prev.forEach(entry => entry.onClose?.());
      return [];
    });
  }, []);
  
  // Check if a modal is open
  const isModalOpen = useCallback((id: string) => {
    return modalStack.some(entry => entry.id === id);
  }, [modalStack]);
  
  // Get top modal
  const getTopModal = useCallback(() => {
    return modalStack[modalStack.length - 1];
  }, [modalStack]);
  
  // Get modal count
  const getModalCount = useCallback(() => {
    return modalStack.length;
  }, [modalStack.length]);
  
  const contextValue: NavigationContextType = {
    screenStack,
    modalStack,
    pushScreen,
    popScreen,
    replaceScreen,
    pushModal,
    popModal,
    closeAllModals,
    isModalOpen,
    canGoBack,
    goToSafeRoute,
    getTopModal,
    getModalCount,
  };
  
  return (
    <NavigationContext.Provider value={contextValue}>
      {children}
    </NavigationContext.Provider>
  );
}

// Hook to use navigation context
export function useNavigation() {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return context;
}

// Hook for safe navigation that doesn't throw if outside provider
export function useNavigationSafe() {
  return useContext(NavigationContext);
}
