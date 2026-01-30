import * as React from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
  SheetClose,
  SheetTrigger,
} from "@/components/ui/sheet";

interface ManagedSheetProps {
  /**
   * Unique identifier for this sheet (legacy - kept for API compatibility)
   */
  id: string;
  
  /**
   * Whether the sheet is open
   */
  open: boolean;
  
  /**
   * Callback when open state should change
   */
  onOpenChange: (open: boolean) => void;
  
  /**
   * Sheet content
   */
  children: React.ReactNode;
  
  /**
   * Side from which the sheet slides in
   */
  side?: "top" | "bottom" | "left" | "right";
  
  /**
   * Optional class for SheetContent
   */
  contentClassName?: string;
}

/**
 * ManagedSheet - Wrapper que fecha via ESC, clique no backdrop ou botão voltar do navegador.
 */
export function ManagedSheet({
  id,
  open,
  onOpenChange,
  children,
  side = "right",
  contentClassName,
}: ManagedSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={side} className={contentClassName}>
        {children}
      </SheetContent>
    </Sheet>
  );
}

// Re-export sheet primitives for convenience
export {
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
  SheetTrigger,
};
