import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Tipos de filtro disponíveis para a lista de clientes
 */
export type ClientFilterType = 
  | 'all' 
  | 'active' 
  | 'expiring' 
  | 'expired' 
  | 'expired_not_called' 
  | 'unpaid' 
  | 'with_paid_apps' 
  | 'archived' 
  | 'api_tests';

/**
 * Hook para gerenciar todos os estados de filtro da página de Clientes
 * 
 * Extraído do Clients.tsx para:
 * - Reduzir complexidade do componente principal
 * - Facilitar manutenção e testes
 * - Reutilização em outros contextos se necessário
 * 
 * IMPORTANTE: Este hook mantém a mesma lógica exata do código original.
 * Nenhuma funcionalidade foi alterada, apenas reorganizada.
 */
export function useClientFilters() {
  // ============= Estado de busca com debounce =============
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Debounce search for performance with large datasets (150ms)
  useEffect(() => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }
    searchDebounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
    }, 150);
    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, [search]);

  // ============= Filtro principal (tipo de visualização) =============
  const [filter, setFilter] = useState<ClientFilterType>('all');

  // ============= Filtros secundários =============
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [serverFilter, setServerFilter] = useState<string>('all');
  const [dnsFilter, setDnsFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string | null>(null);

  // ============= Helpers =============
  
  /**
   * Verifica se estamos visualizando clientes arquivados
   */
  const isViewingArchived = filter === 'archived';

  /**
   * Verifica se há algum filtro ativo (exceto 'all')
   */
  const hasActiveFilters = 
    filter !== 'all' || 
    categoryFilter !== 'all' || 
    serverFilter !== 'all' || 
    dnsFilter !== 'all' || 
    dateFilter !== null ||
    search.trim() !== '';

  /**
   * Limpa todos os filtros para o estado inicial
   */
  const clearAllFilters = useCallback(() => {
    setSearch('');
    setDebouncedSearch('');
    setFilter('all');
    setCategoryFilter('all');
    setServerFilter('all');
    setDnsFilter('all');
    setDateFilter(null);
  }, []);

  /**
   * Limpa apenas os filtros secundários (mantém busca e filtro principal)
   */
  const clearSecondaryFilters = useCallback(() => {
    setCategoryFilter('all');
    setServerFilter('all');
    setDnsFilter('all');
    setDateFilter(null);
  }, []);

  return {
    // Busca
    search,
    setSearch,
    debouncedSearch,
    
    // Filtro principal
    filter,
    setFilter,
    
    // Filtros secundários
    categoryFilter,
    setCategoryFilter,
    serverFilter,
    setServerFilter,
    dnsFilter,
    setDnsFilter,
    dateFilter,
    setDateFilter,
    
    // Helpers
    isViewingArchived,
    hasActiveFilters,
    clearAllFilters,
    clearSecondaryFilters,
  };
}

export default useClientFilters;
