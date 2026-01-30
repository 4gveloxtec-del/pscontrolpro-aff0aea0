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

interface ManagedDrawerProps {
  /**
   * Unique identifier for this drawer (legacy - kept for API compatibility)
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
 * ManagedDrawer - Wrapper que fecha via ESC, clique no backdrop, drag down ou botão voltar do navegador.
 */
export function ManagedDrawer({
  id,
  open,
  onOpenChange,
  children,
  contentClassName,
  shouldScaleBackground = true,
}: ManagedDrawerProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange} shouldScaleBackground={shouldScaleBackground}>
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
