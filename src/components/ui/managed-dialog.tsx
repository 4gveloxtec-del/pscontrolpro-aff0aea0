import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
  DialogTrigger,
} from "@/components/ui/dialog";

interface ManagedDialogProps {
  /**
   * Unique identifier for this dialog (legacy - kept for API compatibility)
   */
  id: string;
  
  /**
   * Whether the dialog is open
   */
  open: boolean;
  
  /**
   * Callback when open state should change
   */
  onOpenChange: (open: boolean) => void;
  
  /**
   * Dialog content
   */
  children: React.ReactNode;
  
  /**
   * Optional class for DialogContent
   */
  contentClassName?: string;
}

/**
 * ManagedDialog - Wrapper simplificado que usa o sistema global de fechamento.
 * O fechamento é gerenciado pelo GlobalModalCloseContext.
 */
export function ManagedDialog({
  id,
  open,
  onOpenChange,
  children,
  contentClassName,
}: ManagedDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={contentClassName}>
        {children}
      </DialogContent>
    </Dialog>
  );
}

// Re-export dialog primitives for convenience
export {
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
  DialogTrigger,
};
