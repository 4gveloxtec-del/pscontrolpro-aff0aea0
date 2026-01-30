import { useCallback, useRef, useEffect } from 'react';
import { useScrollSafe, ActionType } from '@/contexts/ScrollContext';

interface UseListScrollOptions {
  /**
   * Unique identifier for this list (e.g., 'clients-list')
   */
  listId: string;
  
  /**
   * Whether to auto-restore scroll when items change
   */
  autoRestore?: boolean;
  
  /**
   * Whether to use smart readiness detection
   */
  useReadiness?: boolean;
}

/**
 * Hook for managing scroll in lists with editable items.
 * Automatically preserves scroll position when editing, saving, or updating items.
 */
export function useListScroll(options: UseListScrollOptions) {
  const {
    listId,
    autoRestore = true,
    useReadiness = true,
  } = options;
  
  const scroll = useScrollSafe();
  const lastEditedItemRef = useRef<string | null>(null);
  const lastActionTypeRef = useRef<ActionType | null>(null);
  const pendingRestoreRef = useRef(false);
  
  // Mark an item as being edited
  const markItemEdit = useCallback((itemId: string, actionType: ActionType = 'edit') => {
    lastEditedItemRef.current = itemId;
    lastActionTypeRef.current = actionType;
    
    if (scroll) {
      scroll.markEditAction(itemId, actionType);
    }
  }, [scroll]);
  
  // Mark that an item was saved/updated - focus and highlight it
  const markItemSaved = useCallback((itemId: string, actionType: ActionType = 'edit') => {
    lastEditedItemRef.current = itemId;
    lastActionTypeRef.current = actionType;
    pendingRestoreRef.current = true;
    
    if (scroll) {
      scroll.saveScrollPosition(undefined, itemId, actionType);
      
      // Focus and highlight the saved item
      scroll.focusItem(itemId, {
        actionType,
        behavior: 'smooth',
        block: 'center',
        highlightDuration: 2000,
      });
    }
  }, [scroll]);
  
  // Mark that a new item was created - focus and highlight it
  const markItemCreated = useCallback((itemId: string) => {
    lastEditedItemRef.current = itemId;
    lastActionTypeRef.current = 'create';
    pendingRestoreRef.current = true;
    
    if (scroll) {
      scroll.saveScrollPosition(undefined, itemId, 'create');
      
      // Focus and highlight the new item with longer duration
      scroll.focusItem(itemId, {
        actionType: 'create',
        behavior: 'smooth',
        block: 'center',
        highlightDuration: 3000,
      });
    }
  }, [scroll]);
  
  // Mark that an item was deleted
  const markItemDeleted = useCallback((itemId: string) => {
    // Clear if it was the last edited item
    if (lastEditedItemRef.current === itemId) {
      lastEditedItemRef.current = null;
    }
    lastActionTypeRef.current = 'delete';
    
    if (scroll) {
      scroll.saveScrollPosition();
    }
  }, [scroll]);
  
  // Scroll to a specific item in the list
  const scrollToItem = useCallback((itemId: string, options?: { 
    behavior?: 'smooth' | 'instant';
    block?: 'start' | 'center' | 'end' | 'nearest';
    highlight?: boolean;
    highlightDuration?: number;
  }) => {
    if (options?.highlight && scroll) {
      scroll.focusItem(itemId, {
        behavior: options.behavior,
        block: options.block,
        highlightDuration: options.highlightDuration,
      });
    } else {
      const element = document.getElementById(`${listId}-item-${itemId}`) ||
                      document.querySelector(`[data-item-id="${itemId}"]`) ||
                      document.getElementById(itemId);
      
      if (element) {
        element.scrollIntoView({
          behavior: options?.behavior || 'smooth',
          block: options?.block || 'center',
        });
      }
    }
  }, [listId, scroll]);
  
  // Mark data as loaded (for readiness detection)
  const markDataLoaded = useCallback(() => {
    if (scroll && useReadiness) {
      scroll.setReadinessState({ dataLoaded: true });
    }
  }, [scroll, useReadiness]);
  
  // Mark list as ready (for readiness detection)
  const markListReady = useCallback(() => {
    if (scroll && useReadiness) {
      scroll.setReadinessState({ listsReady: true });
    }
  }, [scroll, useReadiness]);
  
  // Restore scroll position after data refresh
  const restoreAfterRefresh = useCallback(() => {
    if (!autoRestore) return;
    
    const restore = () => {
      if (lastEditedItemRef.current) {
        // Try to focus the edited item with highlight
        if (scroll) {
          scroll.focusItem(lastEditedItemRef.current, {
            behavior: 'instant',
            block: 'center',
            actionType: lastActionTypeRef.current || undefined,
            highlightDuration: 1500,
          });
        } else {
          // Fallback: just scroll to item
          scrollToItem(lastEditedItemRef.current, { behavior: 'instant', block: 'nearest' });
        }
      } else if (scroll) {
        // Fall back to saved position
        scroll.restoreScrollPosition(undefined, true);
      }
      
      pendingRestoreRef.current = false;
    };
    
    // Use readiness detection if available
    if (scroll && useReadiness) {
      scroll.waitForReadinessAndRestore().then(() => {
        if (lastEditedItemRef.current) {
          scrollToItem(lastEditedItemRef.current, { behavior: 'instant', block: 'nearest' });
        }
      });
    } else {
      // Fallback: wait for RAF
      requestAnimationFrame(() => {
        requestAnimationFrame(restore);
      });
    }
  }, [autoRestore, scroll, scrollToItem, useReadiness]);
  
  // Get data-item-id attribute props for a list item
  const getItemProps = useCallback((itemId: string) => ({
    'data-item-id': itemId,
    'data-scroll-item': itemId,
    id: `${listId}-item-${itemId}`,
  }), [listId]);
  
  // Check if an item is currently highlighted
  const isItemHighlighted = useCallback((itemId: string): boolean => {
    return scroll?.isItemHighlighted(itemId) || false;
  }, [scroll]);
  
  // Clear tracking (e.g., when unmounting or navigating away)
  const clearTracking = useCallback(() => {
    lastEditedItemRef.current = null;
    lastActionTypeRef.current = null;
    pendingRestoreRef.current = false;
  }, []);
  
  // Effect to handle pending restores
  useEffect(() => {
    if (pendingRestoreRef.current && autoRestore) {
      restoreAfterRefresh();
    }
  }, [autoRestore, restoreAfterRefresh]);
  
  return {
    markItemEdit,
    markItemSaved,
    markItemCreated,
    markItemDeleted,
    scrollToItem,
    markDataLoaded,
    markListReady,
    restoreAfterRefresh,
    getItemProps,
    isItemHighlighted,
    clearTracking,
    lastEditedItemId: lastEditedItemRef.current,
    lastActionType: lastActionTypeRef.current,
  };
}

/**
 * Hook to preserve scroll during async operations (like API calls)
 */
export function useAsyncScrollPreservation() {
  const scroll = useScrollSafe();
  const savedPositionRef = useRef<number | null>(null);
  const isPreservingRef = useRef(false);
  
  const startPreserving = useCallback(() => {
    savedPositionRef.current = window.scrollY;
    isPreservingRef.current = true;
    
    if (scroll) {
      scroll.saveScrollPosition();
    }
  }, [scroll]);
  
  const restore = useCallback(() => {
    if (isPreservingRef.current && savedPositionRef.current !== null) {
      window.scrollTo({ top: savedPositionRef.current, behavior: 'instant' });
    }
    isPreservingRef.current = false;
    savedPositionRef.current = null;
  }, []);
  
  const preserveDuring = useCallback(async <T,>(
    asyncFn: () => Promise<T>
  ): Promise<T> => {
    startPreserving();
    try {
      const result = await asyncFn();
      // Restore after next render
      requestAnimationFrame(() => {
        requestAnimationFrame(restore);
      });
      return result;
    } catch (error) {
      restore();
      throw error;
    }
  }, [startPreserving, restore]);
  
  return {
    startPreserving,
    restore,
    preserveDuring,
  };
}
