import { useState, useCallback } from 'react';

interface ConfirmDialogState {
  open: boolean;
  title: string;
  description: string;
  confirmText: string;
  cancelText: string;
  variant: 'default' | 'destructive' | 'warning';
  onConfirm: () => void;
}

const defaultState: ConfirmDialogState = {
  open: false,
  title: '',
  description: '',
  confirmText: 'Confirmar',
  cancelText: 'Cancelar',
  variant: 'default',
  onConfirm: () => {},
};

export function useConfirmDialog() {
  const [state, setState] = useState<ConfirmDialogState>(defaultState);

  const confirm = useCallback((options: {
    title: string;
    description: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'default' | 'destructive' | 'warning';
    onConfirm: () => void;
  }) => {
    setState({
      open: true,
      title: options.title,
      description: options.description,
      confirmText: options.confirmText || 'Confirmar',
      cancelText: options.cancelText || 'Cancelar',
      variant: options.variant || 'default',
      onConfirm: options.onConfirm,
    });
  }, []);

  const close = useCallback(() => {
    setState(prev => ({ ...prev, open: false }));
  }, []);

  const handleConfirm = useCallback(() => {
    state.onConfirm();
    close();
  }, [state.onConfirm, close]);

  return {
    dialogProps: {
      open: state.open,
      onOpenChange: (open: boolean) => !open && close(),
      title: state.title,
      description: state.description,
      confirmText: state.confirmText,
      cancelText: state.cancelText,
      variant: state.variant,
      onConfirm: handleConfirm,
    },
    confirm,
    close,
  };
}
