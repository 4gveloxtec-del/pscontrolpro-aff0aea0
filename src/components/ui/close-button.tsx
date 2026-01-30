import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface CloseButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Size variant */
  size?: "sm" | "md";
}

/**
 * Global close button component for modals, dialogs, sheets, and drawers.
 * Provides consistent styling and accessibility across the application.
 */
const CloseButton = React.forwardRef<HTMLButtonElement, CloseButtonProps>(
  ({ className, size = "md", ...props }, ref) => {
    const sizeClasses = {
      sm: "h-7 w-7 sm:h-8 sm:w-8",
      md: "h-8 w-8 sm:h-9 sm:w-9",
    };

    const iconSizeClasses = {
      sm: "h-3.5 w-3.5 sm:h-4 sm:w-4",
      md: "h-4 w-4 sm:h-5 sm:w-5",
    };

    return (
      <button
        ref={ref}
        type="button"
        aria-label="Fechar"
        className={cn(
          // Positioning - higher z-index to ensure clickability
          "absolute top-3 right-3 z-[150]",
          // Layout
          "flex items-center justify-center shrink-0",
          // Sizing
          sizeClasses[size],
          // Styling
          "rounded-full bg-muted",
          // States
          "opacity-90 hover:opacity-100 hover:bg-muted-foreground/20",
          // Focus
          "ring-offset-background transition-opacity",
          "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
          // Touch optimization - ensure the button is always clickable
          "touch-manipulation cursor-pointer select-none",
          // Prevent any pointer-events issues
          "pointer-events-auto",
          className
        )}
        {...props}
      >
        <X className={cn(iconSizeClasses[size], "pointer-events-none")} />
      </button>
    );
  }
);

CloseButton.displayName = "CloseButton";

export { CloseButton };
