import * as React from "react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
  DrawerClose,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { useModalStack } from "@/hooks/useModalStack";

interface ManagedDrawerProps {
  /**
   * Unique identifier for this drawer. Required for stack management.
   */
  id: string;
  
  /**
   * Whether the drawer is open
   */
  open: boolean;
  
  /**
   * Callback when open state should change
   */
  onOpenChange: (open: boolean) => void;
  
  /**
   * Drawer content
   */
  children: React.ReactNode;
  
  /**
   * Optional class for DrawerContent
   */
  contentClassName?: string;
  
  /**
   * Whether to scale the background
   */
  shouldScaleBackground?: boolean;
}

/**
 * A Drawer component that integrates with the global navigation stack.
 * Use this when you need proper back button handling and stack ordering.
 */
export function ManagedDrawer({
  id,
  open,
  onOpenChange,
  children,
  contentClassName,
  shouldScaleBackground = true,
}: ManagedDrawerProps) {
  const { handleClose } = useModalStack({
    id,
    isOpen: open,
    onClose: () => onOpenChange(false),
  });
  
  // Override onOpenChange to use stack-aware close
  const handleOpenChange = React.useCallback((newOpen: boolean) => {
    if (!newOpen) {
      handleClose();
    } else {
      onOpenChange(true);
    }
  }, [handleClose, onOpenChange]);
  
  return (
    <Drawer open={open} onOpenChange={handleOpenChange} shouldScaleBackground={shouldScaleBackground}>
      <DrawerContent className={contentClassName}>
        {children}
      </DrawerContent>
    </Drawer>
  );
}

// Re-export drawer primitives for convenience
export {
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
  DrawerClose,
  DrawerTrigger,
};
