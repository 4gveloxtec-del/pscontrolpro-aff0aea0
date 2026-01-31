import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

import { cn } from "@/lib/utils";
import { useIsInsideDialog } from "@/contexts/DialogContext";

const TooltipProvider = TooltipPrimitive.Provider;

const Tooltip = TooltipPrimitive.Root;

const TooltipTrigger = TooltipPrimitive.Trigger;

interface TooltipContentProps
  extends React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content> {
  /**
   * When true, the Tooltip will not use a portal.
   * Use this when the Tooltip is inside a Dialog/Modal to avoid portal conflicts.
   */
  usePortal?: boolean;
}

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  TooltipContentProps
>(({ className, sideOffset = 4, usePortal, ...props }, ref) => {
  // Auto-detect if inside a Dialog - disable portal to avoid conflicts
  const isInsideDialog = useIsInsideDialog();
  const shouldUsePortal = usePortal ?? !isInsideDialog;

  const content = (
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md",
        // Use higher z-index when inside dialog to ensure visibility
        isInsideDialog ? "z-[9999]" : "z-50",
        "animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        className,
      )}
      {...props}
    />
  );

  // When not using portal, render directly to avoid conflicts with Dialog portals
  if (!shouldUsePortal) {
    return content;
  }

  return <TooltipPrimitive.Portal>{content}</TooltipPrimitive.Portal>;
});
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
