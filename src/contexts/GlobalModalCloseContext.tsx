import * as React from "react";

/**
 * =========================================================================
 * GlobalModalCloseContext - SISTEMA ÚNICO E GLOBAL DE FECHAMENTO DE MODAIS
 * =========================================================================
 * 
 * Este contexto gerencia o fechamento de TODOS os modais da aplicação
 * através de um único estado global.
 * 
 * REGRAS:
 * 1. Nenhum botão X fecha modal diretamente
 * 2. Todo botão X apenas chama `triggerClose()`
 * 3. Todos os modais observam `shouldClose` e fecham quando true
 * 4. Após fechar, o modal chama `resetClose()` para limpar o estado
 * 5. O backdrop e botão voltar também usam `triggerClose()`
 * 
 * =========================================================================
 */

interface GlobalModalCloseContextValue {
  /**
   * Quando true, todos os modais que estão observando devem fechar
   */
  shouldClose: boolean;
  
  /**
   * Dispara o fechamento global - chamado pelo CloseButtonGlobal, backdrop e voltar
   */
  triggerClose: () => void;
  
  /**
   * Reseta o estado após o fechamento - chamado pelos modais após fechar
   */
  resetClose: () => void;
  
  /**
   * Contador de closes para garantir que cada trigger seja único
   */
  closeId: number;
}

const GlobalModalCloseContext = React.createContext<GlobalModalCloseContextValue | null>(null);

export function GlobalModalCloseProvider({ children }: { children: React.ReactNode }) {
  const [closeId, setCloseId] = React.useState(0);
  const [shouldClose, setShouldClose] = React.useState(false);

  const triggerClose = React.useCallback(() => {
    console.log('[GlobalModalClose] triggerClose called');
    setShouldClose(true);
    setCloseId((prev) => prev + 1);
  }, []);

  const resetClose = React.useCallback(() => {
    console.log('[GlobalModalClose] resetClose called');
    setShouldClose(false);
  }, []);

  // Interceptar botão voltar do navegador
  React.useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      // Dispara o fechamento global
      console.log('[GlobalModalClose] Back button detected, triggering close');
      triggerClose();
      
      // Push state para prevenir navegação real
      window.history.pushState(null, '', window.location.href);
    };

    // Push um estado inicial para poder detectar o voltar
    window.history.pushState(null, '', window.location.href);
    
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [triggerClose]);

  const value = React.useMemo(
    () => ({ shouldClose, triggerClose, resetClose, closeId }),
    [shouldClose, triggerClose, resetClose, closeId]
  );

  return (
    <GlobalModalCloseContext.Provider value={value}>
      {children}
    </GlobalModalCloseContext.Provider>
  );
}

/**
 * Hook para acessar o sistema global de fechamento
 */
export function useGlobalModalClose() {
  const context = React.useContext(GlobalModalCloseContext);
  if (!context) {
    throw new Error('useGlobalModalClose must be used within GlobalModalCloseProvider');
  }
  return context;
}

/**
 * Hook seguro que retorna null se fora do contexto (para uso em componentes base)
 */
export function useGlobalModalCloseSafe() {
  return React.useContext(GlobalModalCloseContext);
}
