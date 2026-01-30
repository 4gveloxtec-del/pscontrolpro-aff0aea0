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
import { useModalStack } from "@/hooks/useModalStack";
import { type VariantProps } from "class-variance-authority";

interface ManagedSheetProps {
  /**
   * Unique identifier for this sheet. Required for stack management.
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
 * A Sheet component that integrates with the global navigation stack.
 * Use this when you need proper back button handling and stack ordering.
 */
export function ManagedSheet({
  id,
  open,
  onOpenChange,
  children,
  side = "right",
  contentClassName,
}: ManagedSheetProps) {
  // Register with stack - cleanup happens automatically when open becomes false
  useModalStack({
    id,
    isOpen: open,
    onClose: () => onOpenChange(false),
  });
  
  // Let Radix handle the close directly - stack cleanup happens via useEffect
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
