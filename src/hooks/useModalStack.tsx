import { useCallback, useEffect, useId, useRef } from 'react';
import { useNavigationSafe } from '@/contexts/NavigationContext';

interface UseModalStackOptions {
  /**
   * Unique identifier for this modal. If not provided, a React-generated ID will be used.
   */
  id?: string;
  
  /**
   * Whether the modal is currently open
   */
  isOpen: boolean;
  
  /**
   * Callback when the modal should be closed
   */
  onClose: () => void;
  
  /**
   * Optional data to store with the modal entry
   */
  data?: Record<string, unknown>;
}

/**
 * Hook to integrate a modal with the global navigation stack.
 * Ensures proper ordering, back button handling, and X button functionality.
 * 
 * IMPORTANT: This hook does NOT interfere with native Radix close behavior.
 * The X button, overlay click, and ESC key all work through Radix's onOpenChange.
 * This hook only manages the navigation stack for back button support.
 */
export function useModalStack({ id, isOpen, onClose, data }: UseModalStackOptions) {
  const generatedId = useId();
  const modalId = id || generatedId;
  const navigation = useNavigationSafe();
  
  // Track the previous open state to detect transitions
  const prevIsOpenRef = useRef(isOpen);
  
  // Use ref to store onClose to avoid stale closures
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  
  // Stable callback that uses the ref - only called by back button handler
  const stableOnClose = useCallback(() => {
    onCloseRef.current();
  }, []);
  
  // Handle registration/unregistration based on open state changes
  useEffect(() => {
    if (!navigation) return;
    
    const wasOpen = prevIsOpenRef.current;
    prevIsOpenRef.current = isOpen;
    
    if (isOpen && !wasOpen) {
      // Modal just opened - register it
      navigation.pushModal(modalId, stableOnClose, data);
    } else if (!isOpen && wasOpen) {
      // Modal just closed (via UI) - silently remove from stack
      // skipCallback=true because Radix already triggered onOpenChange
      navigation.popModal(modalId, true);
    }
  }, [isOpen, modalId, navigation, stableOnClose, data]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (navigation?.isModalOpen(modalId)) {
        navigation.popModal(modalId, true);
      }
    };
  }, [modalId, navigation]);
  
  // Close handler for programmatic use (not needed for X button)
  const handleClose = useCallback(() => {
    // Just call onClose - let React state flow handle the rest
    onClose();
  }, [onClose]);
  
  // Check if this is the top modal
  const isTopModal = navigation?.getTopModal()?.id === modalId;
  
  // Get position in stack (0 = bottom, higher = more on top)
  const stackPosition = navigation?.modalStack.findIndex(entry => entry.id === modalId) ?? -1;
  
  return {
    modalId,
    handleClose,
    isTopModal,
    stackPosition,
    isRegistered: navigation?.isModalOpen(modalId) ?? false,
  };
}

/**
 * Hook to handle Escape key for closing modals in the correct order.
 * Only the top modal should respond to Escape.
 */
export function useModalEscapeHandler(modalId: string, isOpen: boolean, onClose: () => void) {
  const navigation = useNavigationSafe();
  
  useEffect(() => {
    if (!isOpen) return;
    
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      
      // Only close if this is the top modal or no navigation context
      if (!navigation) {
        onClose();
        return;
      }
      
      const topModal = navigation.getTopModal();
      if (topModal?.id === modalId) {
        event.preventDefault();
        event.stopPropagation();
        navigation.popModal(modalId);
      }
    };
    
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, modalId, navigation, onClose]);
}

/**
 * Hook to handle browser back button for modals.
 * Prevents default navigation and closes top modal instead.
 */
export function useModalBackButtonHandler() {
  const navigation = useNavigationSafe();
  
  useEffect(() => {
    if (!navigation) return;
    
    const handlePopState = (event: PopStateEvent) => {
      // If there are modals open, close the top one instead of navigating
      if (navigation.getModalCount() > 0) {
        event.preventDefault();
        // Push the current state back to prevent actual navigation
        window.history.pushState(null, '', window.location.href);
        navigation.popModal();
      }
    };
    
    // Push an initial state to detect back button
    if (navigation.getModalCount() > 0) {
      window.history.pushState(null, '', window.location.href);
    }
    
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [navigation]);
}
