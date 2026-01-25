import { useState, useCallback, useMemo, useRef, useEffect } from 'react';

interface PerformanceConfig {
  pageSize: number;
  debounceMs: number;
  maxVisibleItems: number;
}

const DEFAULT_CONFIG: PerformanceConfig = {
  pageSize: 50,
  debounceMs: 150, // Reduced for faster response
  maxVisibleItems: 100,
};

/**
 * Hook for performance optimization with pagination, debouncing, and virtual scrolling support
 * Optimized for 1000+ items
 */
export function usePerformanceOptimization<T>(
  items: T[],
  config: Partial<PerformanceConfig> = {}
) {
  const { pageSize, debounceMs, maxVisibleItems } = { ...DEFAULT_CONFIG, ...config };
  
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const prevItemsLengthRef = useRef(items.length);

  // Reset to page 1 when items change significantly (filter change)
  useEffect(() => {
    const diff = Math.abs(items.length - prevItemsLengthRef.current);
    // If more than 10% change in items, reset to page 1
    if (diff > prevItemsLengthRef.current * 0.1 || items.length < (currentPage - 1) * pageSize) {
      setCurrentPage(1);
    }
    prevItemsLengthRef.current = items.length;
  }, [items.length, currentPage, pageSize]);

  // Debounce search term with faster response
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      setCurrentPage(1); // Reset to first page on search
    }, debounceMs);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [searchTerm, debounceMs]);

  // Calculate total pages - memoized
  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(items.length / pageSize));
  }, [items.length, pageSize]);

  // Get paginated items - heavily optimized
  const paginatedItems = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, items.length);
    return items.slice(startIndex, endIndex);
  }, [items, currentPage, pageSize]);

  // Get visible items (limited for performance)
  const visibleItems = useMemo(() => {
    return paginatedItems.slice(0, maxVisibleItems);
  }, [paginatedItems, maxVisibleItems]);

  // Navigation functions - stable references
  // scrollToTop param allows callers to opt-out of auto scroll (e.g., after save operations)
  const goToPage = useCallback((page: number, scrollToTop: boolean = true) => {
    const validPage = Math.max(1, Math.min(page, totalPages));
    setCurrentPage(validPage);
    // Only scroll to top if explicitly requested (default for page navigation)
    if (scrollToTop) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [totalPages]);

  const nextPage = useCallback(() => {
    goToPage(currentPage + 1);
  }, [currentPage, goToPage]);

  const prevPage = useCallback(() => {
    goToPage(currentPage - 1);
  }, [currentPage, goToPage]);

  const resetPagination = useCallback(() => {
    setCurrentPage(1);
  }, []);

  // Optimized search handler
  const handleSearch = useCallback((term: string) => {
    setSearchTerm(term);
  }, []);

  // Calculate indices - memoized
  const startIndex = useMemo(() => 
    items.length === 0 ? 0 : (currentPage - 1) * pageSize + 1, 
    [currentPage, pageSize, items.length]
  );
  
  const endIndex = useMemo(() => 
    Math.min(currentPage * pageSize, items.length), 
    [currentPage, pageSize, items.length]
  );

  return {
    // State
    currentPage,
    totalPages,
    searchTerm,
    debouncedSearchTerm,
    
    // Items
    paginatedItems,
    visibleItems,
    totalItems: items.length,
    
    // Actions
    goToPage,
    nextPage,
    prevPage,
    resetPagination,
    handleSearch,
    setSearchTerm,
    
    // Helpers
    hasNextPage: currentPage < totalPages,
    hasPrevPage: currentPage > 1,
    startIndex,
    endIndex,
  };
}

/**
 * Hook for lazy loading data with intersection observer
 */
export function useLazyLoad<T>(
  loadMore: () => Promise<T[]>,
  options: { threshold?: number; rootMargin?: string } = {}
) {
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadingRef = useRef<HTMLDivElement | null>(null);

  const handleLoadMore = useCallback(async () => {
    if (isLoading || !hasMore) return;
    
    setIsLoading(true);
    try {
      const newItems = await loadMore();
      if (newItems.length === 0) {
        setHasMore(false);
      }
    } catch (error) {
      console.error('Error loading more items:', error);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, hasMore, loadMore]);

  useEffect(() => {
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          handleLoadMore();
        }
      },
      {
        threshold: options.threshold || 0.1,
        rootMargin: options.rootMargin || '100px',
      }
    );

    if (loadingRef.current) {
      observerRef.current.observe(loadingRef.current);
    }

    return () => {
      observerRef.current?.disconnect();
    };
  }, [handleLoadMore, options.threshold, options.rootMargin]);

  return {
    loadingRef,
    isLoading,
    hasMore,
    setHasMore,
  };
}

/**
 * Hook for optimistic updates with rollback
 */
export function useOptimisticUpdate<T>() {
  const [optimisticData, setOptimisticData] = useState<T | null>(null);
  const [rollbackData, setRollbackData] = useState<T | null>(null);

  const applyOptimistic = useCallback((data: T, original: T) => {
    setRollbackData(original);
    setOptimisticData(data);
  }, []);

  const rollback = useCallback(() => {
    if (rollbackData !== null) {
      setOptimisticData(rollbackData);
      setRollbackData(null);
    }
  }, [rollbackData]);

  const commit = useCallback(() => {
    setRollbackData(null);
  }, []);

  const reset = useCallback(() => {
    setOptimisticData(null);
    setRollbackData(null);
  }, []);

  return {
    optimisticData,
    applyOptimistic,
    rollback,
    commit,
    reset,
  };
}

/**
 * Hook for request deduplication and caching
 */
export function useRequestCache<T>(cacheTimeMs: number = 30000) {
  const cacheRef = useRef<Map<string, { data: T; timestamp: number }>>(new Map());
  const pendingRef = useRef<Map<string, Promise<T>>>(new Map());

  const get = useCallback((key: string): T | null => {
    const cached = cacheRef.current.get(key);
    if (cached && Date.now() - cached.timestamp < cacheTimeMs) {
      return cached.data;
    }
    return null;
  }, [cacheTimeMs]);

  const set = useCallback((key: string, data: T) => {
    cacheRef.current.set(key, { data, timestamp: Date.now() });
  }, []);

  const fetchWithCache = useCallback(async (
    key: string,
    fetcher: () => Promise<T>
  ): Promise<T> => {
    // Check cache first
    const cached = get(key);
    if (cached !== null) {
      return cached;
    }

    // Check if request is already pending (deduplication)
    const pending = pendingRef.current.get(key);
    if (pending) {
      return pending;
    }

    // Make new request
    const promise = fetcher().then((data) => {
      set(key, data);
      pendingRef.current.delete(key);
      return data;
    }).catch((error) => {
      pendingRef.current.delete(key);
      throw error;
    });

    pendingRef.current.set(key, promise);
    return promise;
  }, [get, set]);

  const invalidate = useCallback((key?: string) => {
    if (key) {
      cacheRef.current.delete(key);
    } else {
      cacheRef.current.clear();
    }
  }, []);

  return {
    get,
    set,
    fetchWithCache,
    invalidate,
  };
}

/**
 * Utility for batch processing to avoid UI freezing
 */
export function useBatchProcessor<T, R>(
  processor: (item: T) => R,
  options: { batchSize?: number; delayMs?: number } = {}
) {
  const { batchSize = 10, delayMs = 0 } = options;
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  const processBatch = useCallback(async (items: T[]): Promise<R[]> => {
    if (items.length === 0) return [];
    
    setIsProcessing(true);
    setProgress(0);
    
    const results: R[] = [];
    const batches = Math.ceil(items.length / batchSize);
    
    for (let i = 0; i < batches; i++) {
      const start = i * batchSize;
      const end = Math.min(start + batchSize, items.length);
      const batch = items.slice(start, end);
      
      // Process batch
      for (const item of batch) {
        results.push(processor(item));
      }
      
      // Update progress
      setProgress(Math.round(((i + 1) / batches) * 100));
      
      // Yield to main thread
      if (delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      } else {
        await new Promise(resolve => requestAnimationFrame(() => resolve(undefined)));
      }
    }
    
    setIsProcessing(false);
    return results;
  }, [batchSize, delayMs, processor]);

  return {
    processBatch,
    isProcessing,
    progress,
  };
}
