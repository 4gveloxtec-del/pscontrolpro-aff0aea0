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
import { useModalStack } from "@/hooks/useModalStack";

interface ManagedDialogProps {
  /**
   * Unique identifier for this dialog. Required for stack management.
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
 * A Dialog component that integrates with the global navigation stack.
 * Use this when you need proper back button handling and stack ordering.
 */
export function ManagedDialog({
  id,
  open,
  onOpenChange,
  children,
  contentClassName,
}: ManagedDialogProps) {
  // Register with stack - cleanup happens automatically when open becomes false
  useModalStack({
    id,
    isOpen: open,
    onClose: () => onOpenChange(false),
  });
  
  // Let Radix handle the close directly - stack cleanup happens via useEffect
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
