import * as React from "react";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { DialogContextProvider } from "@/contexts/DialogContext";
import { CloseButtonGlobal } from "./close-button-global";
import { useGlobalModalCloseSafe } from "@/contexts/GlobalModalCloseContext";

const AlertDialog = AlertDialogPrimitive.Root;

const AlertDialogTrigger = AlertDialogPrimitive.Trigger;

const AlertDialogPortal = AlertDialogPrimitive.Portal;

const AlertDialogOverlay = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Overlay
    className={cn(
      "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
    ref={ref}
  />
));
AlertDialogOverlay.displayName = AlertDialogPrimitive.Overlay.displayName;

interface AlertDialogContentProps extends React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content> {
  /** Hide the close button */
  hideCloseButton?: boolean;
}

/**
 * AlertDialogContent com observação do estado global de fechamento
 */
const AlertDialogContent = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Content>,
  AlertDialogContentProps
>(({ className, children, hideCloseButton = true, ...props }, ref) => {
  const contentRef = React.useRef<HTMLDivElement>(null);
  const globalClose = useGlobalModalCloseSafe();
  const lastCloseIdRef = React.useRef<number>(0);

  // Observa o estado global e fecha quando shouldClose = true
  React.useEffect(() => {
    if (!globalClose) return;
    
    const { shouldClose, closeId, resetClose } = globalClose;
    
    if (shouldClose && closeId > lastCloseIdRef.current) {
      console.log('[AlertDialogContent] Global close triggered, closing alert dialog');
      lastCloseIdRef.current = closeId;
      
      // AlertDialog usa Cancel para fechar
      const cancelButton = contentRef.current?.querySelector('[data-radix-alert-dialog-cancel]') as HTMLButtonElement;
      if (cancelButton) {
        cancelButton.click();
      }
      
      setTimeout(() => {
        resetClose();
      }, 50);
    }
  }, [globalClose?.shouldClose, globalClose?.closeId, globalClose?.resetClose]);

  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content
        ref={(node) => {
          if (typeof ref === 'function') ref(node);
          else if (ref) ref.current = node;
          (contentRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
        }}
        className={cn(
          // Mobile-first: bottom sheet style
          "fixed z-50 grid w-full gap-4 border bg-background p-4 sm:p-6 shadow-lg duration-200",
          "inset-x-0 bottom-0 top-auto rounded-t-2xl sm:rounded-lg",
          // Desktop: centered modal
          "sm:left-[50%] sm:top-[50%] sm:bottom-auto sm:translate-x-[-50%] sm:translate-y-[-50%]",
          "sm:max-w-lg",
          // Height constraints
          "max-h-[85vh] sm:max-h-[90vh]",
          "pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-6",
          // Animations
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          "data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
          "sm:data-[state=closed]:slide-out-to-bottom-0 sm:data-[state=open]:slide-in-from-bottom-0",
          "sm:data-[state=closed]:zoom-out-95 sm:data-[state=open]:zoom-in-95",
          className,
        )}
        {...props}
      >
        <DialogContextProvider>{children}</DialogContextProvider>
        {/* Botão de fechar (opcional para AlertDialog, normalmente usa Cancel) */}
        {!hideCloseButton && <CloseButtonGlobal />}
      </AlertDialogPrimitive.Content>
    </AlertDialogPortal>
  );
});
AlertDialogContent.displayName = AlertDialogPrimitive.Content.displayName;

const AlertDialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-2 text-center sm:text-left", className)} {...props} />
);
AlertDialogHeader.displayName = "AlertDialogHeader";

const AlertDialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} />
);
AlertDialogFooter.displayName = "AlertDialogFooter";

const AlertDialogTitle = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Title ref={ref} className={cn("text-lg font-semibold", className)} {...props} />
));
AlertDialogTitle.displayName = AlertDialogPrimitive.Title.displayName;

const AlertDialogDescription = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Description ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
AlertDialogDescription.displayName = AlertDialogPrimitive.Description.displayName;

const AlertDialogAction = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Action>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Action>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Action ref={ref} className={cn(buttonVariants(), className)} {...props} />
));
AlertDialogAction.displayName = AlertDialogPrimitive.Action.displayName;

const AlertDialogCancel = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Cancel>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Cancel>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Cancel
    ref={ref}
    data-radix-alert-dialog-cancel
    className={cn(buttonVariants({ variant: "outline" }), "mt-2 sm:mt-0", className)}
    {...props}
  />
));
AlertDialogCancel.displayName = AlertDialogPrimitive.Cancel.displayName;

export {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
};
