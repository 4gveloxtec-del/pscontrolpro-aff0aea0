import { useCallback, useRef, useEffect } from 'react';
import { useScrollSafe } from '@/contexts/ScrollContext';

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
   * Delay before restoring scroll after data changes (ms)
   */
  restoreDelay?: number;
}

/**
 * Hook for managing scroll in lists with editable items.
 * Automatically preserves scroll position when editing, saving, or updating items.
 */
export function useListScroll(options: UseListScrollOptions) {
  const {
    listId,
    autoRestore = true,
    restoreDelay = 100,
  } = options;
  
  const scroll = useScrollSafe();
  const lastEditedItemRef = useRef<string | null>(null);
  const pendingRestoreRef = useRef(false);
  
  // Mark an item as being edited
  const markItemEdit = useCallback((itemId: string) => {
    lastEditedItemRef.current = itemId;
    
    if (scroll) {
      scroll.markEditAction(itemId);
    }
  }, [scroll]);
  
  // Mark that an item was saved/updated
  const markItemSaved = useCallback((itemId: string) => {
    lastEditedItemRef.current = itemId;
    pendingRestoreRef.current = true;
    
    if (scroll) {
      scroll.saveScrollPosition(undefined, itemId);
    }
  }, [scroll]);
  
  // Scroll to a specific item in the list
  const scrollToItem = useCallback((itemId: string, options?: { 
    behavior?: 'smooth' | 'instant';
    block?: 'start' | 'center' | 'end' | 'nearest';
  }) => {
    const element = document.getElementById(`${listId}-item-${itemId}`) ||
                    document.querySelector(`[data-item-id="${itemId}"]`) ||
                    document.getElementById(itemId);
    
    if (element) {
      element.scrollIntoView({
        behavior: options?.behavior || 'smooth',
        block: options?.block || 'center',
      });
    }
  }, [listId]);
  
  // Restore scroll position after data refresh
  const restoreAfterRefresh = useCallback(() => {
    if (!autoRestore) return;
    
    const restore = () => {
      if (lastEditedItemRef.current) {
        // Try to scroll to the edited item
        scrollToItem(lastEditedItemRef.current, { behavior: 'instant', block: 'nearest' });
      } else if (scroll) {
        // Fall back to saved position
        scroll.restoreScrollPosition(undefined, true);
      }
      
      pendingRestoreRef.current = false;
    };
    
    // Delay to allow for render
    setTimeout(restore, restoreDelay);
  }, [autoRestore, scroll, scrollToItem, restoreDelay]);
  
  // Get data-item-id attribute props for a list item
  const getItemProps = useCallback((itemId: string) => ({
    'data-item-id': itemId,
    id: `${listId}-item-${itemId}`,
  }), [listId]);
  
  // Clear tracking (e.g., when unmounting or navigating away)
  const clearTracking = useCallback(() => {
    lastEditedItemRef.current = null;
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
    scrollToItem,
    restoreAfterRefresh,
    getItemProps,
    clearTracking,
    lastEditedItemId: lastEditedItemRef.current,
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
