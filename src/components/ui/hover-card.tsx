import * as React from "react";
import * as HoverCardPrimitive from "@radix-ui/react-hover-card";

import { cn } from "@/lib/utils";
import { useIsInsideDialog } from "@/contexts/DialogContext";

const HoverCard = HoverCardPrimitive.Root;

const HoverCardTrigger = HoverCardPrimitive.Trigger;

interface HoverCardContentProps
  extends React.ComponentPropsWithoutRef<typeof HoverCardPrimitive.Content> {
  /**
   * When true, the HoverCard will not use a portal.
   * Use this when the HoverCard is inside a Dialog/Modal to avoid portal conflicts.
   */
  usePortal?: boolean;
}

const HoverCardContent = React.forwardRef<
  React.ElementRef<typeof HoverCardPrimitive.Content>,
  HoverCardContentProps
>(({ className, align = "center", sideOffset = 4, usePortal, ...props }, ref) => {
  // Auto-detect if inside a Dialog - disable portal to avoid conflicts
  const isInsideDialog = useIsInsideDialog();
  const shouldUsePortal = usePortal ?? !isInsideDialog;

  const content = (
    <HoverCardPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        "w-64 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none",
        // Use higher z-index when inside dialog to ensure visibility
        isInsideDialog ? "z-[9999]" : "z-50",
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        className,
      )}
      {...props}
    />
  );

  // When not using portal, render directly to avoid conflicts with Dialog portals
  if (!shouldUsePortal) {
    return content;
  }

  return <HoverCardPrimitive.Portal>{content}</HoverCardPrimitive.Portal>;
});
HoverCardContent.displayName = HoverCardPrimitive.Content.displayName;

export { HoverCard, HoverCardTrigger, HoverCardContent };
