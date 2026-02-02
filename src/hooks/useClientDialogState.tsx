import { useState, useCallback } from 'react';

/**
 * Interface for client data used in the dialog
 * Matches the Client interface from Clients.tsx
 */
interface ClientForDialog {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  device: string | null;
  dns: string | null;
  expiration_date: string;
  expiration_datetime: string | null;
  plan_id: string | null;
  plan_name: string | null;
  plan_price: number | null;
  premium_price: number | null;
  server_id: string | null;
  server_name: string | null;
  login: string | null;
  password: string | null;
  server_id_2: string | null;
  server_name_2: string | null;
  login_2: string | null;
  password_2: string | null;
  premium_password: string | null;
  category: string | null;
  is_paid: boolean;
  pending_amount: number | null;
  notes: string | null;
  has_paid_apps: boolean | null;
  paid_apps_duration: string | null;
  paid_apps_expiration: string | null;
  telegram: string | null;
  is_archived: boolean | null;
  archived_at: string | null;
  created_at: string | null;
  renewed_at: string | null;
  updated_at?: string | null;
  gerencia_app_mac: string | null;
  gerencia_app_devices: Array<{ name: string; mac: string }> | null;
  app_name: string | null;
  app_type: string | null;
  device_model: string | null;
  additional_servers?: Array<{
    server_id: string;
    server_name: string;
    login?: string | null;
    password?: string | null;
  }> | null;
  is_test: boolean | null;
  is_integrated: boolean | null;
}

interface UseClientDialogStateOptions {
  onDialogClose?: () => void;
}

/**
 * Hook para gerenciar o estado do diálogo de cliente (novo/edição)
 * 
 * Extraído do Clients.tsx para:
 * - Reduzir complexidade do componente principal
 * - Centralizar lógica de abertura/fechamento de modais
 * - Facilitar manutenção e testes
 * 
 * IMPORTANTE: Este hook mantém a mesma lógica exata do código original.
 */
export function useClientDialogState(options?: UseClientDialogStateOptions) {
  // ============= Estado principal do diálogo =============
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientForDialog | null>(null);
  
  // ============= Estado de confirmação de saída =============
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [pendingCloseDialog, setPendingCloseDialog] = useState(false);
  
  // ============= Estados de popovers internos =============
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const [expirationPopoverOpen, setExpirationPopoverOpen] = useState(false);
  const [paidAppsExpirationPopoverOpen, setPaidAppsExpirationPopoverOpen] = useState(false);

  // ============= Helpers =============
  
  /**
   * Verifica se está editando um cliente existente
   */
  const isEditing = editingClient !== null;

  /**
   * Abre o diálogo para criar um novo cliente
   */
  const openForNew = useCallback(() => {
    setEditingClient(null);
    setIsDialogOpen(true);
  }, []);

  /**
   * Abre o diálogo para editar um cliente existente
   */
  const openForEdit = useCallback((client: ClientForDialog) => {
    setEditingClient(client);
    setIsDialogOpen(true);
  }, []);

  /**
   * Fecha o diálogo e limpa o estado de edição
   * Chama o callback onDialogClose se fornecido
   */
  const closeDialog = useCallback(() => {
    setIsDialogOpen(false);
    setEditingClient(null);
    setShowExitConfirm(false);
    setPendingCloseDialog(false);
    setAddCategoryOpen(false);
    setExpirationPopoverOpen(false);
    setPaidAppsExpirationPopoverOpen(false);
    options?.onDialogClose?.();
  }, [options]);

  /**
   * Confirma saída sem salvar (usado quando há alterações não salvas)
   */
  const confirmExitWithoutSaving = useCallback(() => {
    closeDialog();
  }, [closeDialog]);

  /**
   * Cancela a saída (mantém o diálogo aberto)
   */
  const cancelExit = useCallback(() => {
    setShowExitConfirm(false);
    setPendingCloseDialog(false);
  }, []);

  /**
   * Solicita confirmação de saída (mostra diálogo de confirmação)
   */
  const requestExit = useCallback(() => {
    setShowExitConfirm(true);
    setPendingCloseDialog(true);
  }, []);

  /**
   * Handler para tentativa de fechar o diálogo
   * @param hasChanges - Se há alterações não salvas no formulário
   */
  const handleDialogOpenChange = useCallback((open: boolean, hasChanges: boolean = false) => {
    if (!open) {
      // Tentando fechar o diálogo
      if (hasChanges) {
        // Se há alterações, solicita confirmação
        requestExit();
      } else {
        // Se não há alterações, fecha diretamente
        closeDialog();
      }
    } else {
      setIsDialogOpen(true);
    }
  }, [closeDialog, requestExit]);

  return {
    // Estado principal
    isDialogOpen,
    setIsDialogOpen,
    editingClient,
    setEditingClient,
    
    // Estado de confirmação de saída
    showExitConfirm,
    setShowExitConfirm,
    pendingCloseDialog,
    setPendingCloseDialog,
    
    // Estados de popovers
    addCategoryOpen,
    setAddCategoryOpen,
    expirationPopoverOpen,
    setExpirationPopoverOpen,
    paidAppsExpirationPopoverOpen,
    setPaidAppsExpirationPopoverOpen,
    
    // Helpers
    isEditing,
    openForNew,
    openForEdit,
    closeDialog,
    confirmExitWithoutSaving,
    cancelExit,
    requestExit,
    handleDialogOpenChange,
  };
}

export type { ClientForDialog };
export default useClientDialogState;
