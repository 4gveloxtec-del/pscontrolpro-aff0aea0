/**
 * =========================================================================
 * useModalStack - DEPRECATED
 * =========================================================================
 * 
 * Este hook foi substituído pelo sistema global de fechamento.
 * Mantido apenas para compatibilidade com código legado.
 * 
 * O fechamento de modais agora é gerenciado pelo GlobalModalCloseContext.
 * 
 * =========================================================================
 */

import { useCallback, useId } from 'react';

interface UseModalStackOptions {
  /**
   * Unique identifier for this modal
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
   * Optional data (not used in new system)
   */
  data?: Record<string, unknown>;
}

/**
 * @deprecated Use o sistema global de fechamento via GlobalModalCloseContext.
 * Este hook é mantido apenas para compatibilidade com código existente.
 */
export function useModalStack({ id, isOpen, onClose, data }: UseModalStackOptions) {
  const generatedId = useId();
  const modalId = id || generatedId;
  
  // No-op - fechamento agora é gerenciado pelo GlobalModalCloseContext
  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);
  
  return {
    modalId,
    handleClose,
    isTopModal: true,
    stackPosition: 0,
    isRegistered: isOpen,
  };
}

/**
 * @deprecated Não mais necessário - ESC é gerenciado pelo Radix/Vaul
 */
export function useModalEscapeHandler(modalId: string, isOpen: boolean, onClose: () => void) {
  // No-op - ESC é gerenciado nativamente pelos primitivos Radix/Vaul
}

/**
 * @deprecated Não mais necessário - back button usa o sistema global
 */
export function useModalBackButtonHandler() {
  // No-op - back button agora usa GlobalModalCloseContext
}
