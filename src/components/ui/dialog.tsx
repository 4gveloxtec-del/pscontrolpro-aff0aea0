import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";

import { cn } from "@/lib/utils";
import { DialogContextProvider } from "@/contexts/DialogContext";
import { CloseButtonGlobal } from "./close-button-global";
import { useGlobalModalCloseSafe } from "@/contexts/GlobalModalCloseContext";

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

function composeRefs<T>(...refs: Array<React.Ref<T> | undefined>) {
  return (node: T) => {
    for (const ref of refs) {
      if (!ref) continue;
      if (typeof ref === "function") {
        ref(node);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (ref as any).current = node;
      }
    }
  };
}

interface DialogContentProps extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  /** Hide the close button (useful for custom layouts) */
  hideCloseButton?: boolean;
}

/**
 * DialogContent com observação do estado global de fechamento
 */
const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(
  (
    {
      className,
      children,
      onOpenAutoFocus,
      onCloseAutoFocus,
      tabIndex,
      hideCloseButton = false,
      ...props
    },
    ref,
  ) => {
    const contentRef = React.useRef<React.ElementRef<typeof DialogPrimitive.Content> | null>(null);
    const previouslyFocusedRef = React.useRef<HTMLElement | null>(null);
    const globalClose = useGlobalModalCloseSafe();
    const lastCloseIdRef = React.useRef<number>(0);

    // Observa o estado global e fecha quando shouldClose = true
    React.useEffect(() => {
      if (!globalClose) return;
      
      const { shouldClose, closeId, resetClose } = globalClose;
      
      // Só processa se é um novo trigger (closeId diferente)
      if (shouldClose && closeId > lastCloseIdRef.current) {
        console.log('[DialogContent] Global close triggered, closing dialog');
        lastCloseIdRef.current = closeId;
        
        // Encontra e clica no botão de fechar do Radix para fechar corretamente
        const closeButton = contentRef.current?.querySelector('[data-radix-dialog-close]') as HTMLButtonElement;
        if (closeButton) {
          closeButton.click();
        }
        
        // Reset o estado global após um pequeno delay
        setTimeout(() => {
          resetClose();
        }, 50);
      }
    }, [globalClose?.shouldClose, globalClose?.closeId, globalClose?.resetClose]);

    return (
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          ref={composeRefs(ref, contentRef)}
          tabIndex={tabIndex ?? -1}
          onOpenAutoFocus={(event) => {
            previouslyFocusedRef.current = (document.activeElement as HTMLElement) ?? null;
            onOpenAutoFocus?.(event);

            if (!event.defaultPrevented) {
              event.preventDefault();
              try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (contentRef.current as any)?.focus?.({ preventScroll: true });
              } catch {
                contentRef.current?.focus?.();
              }
            }
          }}
          onCloseAutoFocus={(event) => {
            onCloseAutoFocus?.(event);

            if (!event.defaultPrevented) {
              event.preventDefault();
              const el = previouslyFocusedRef.current;
              if (el && typeof el.focus === "function") {
                try {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  (el as any).focus({ preventScroll: true });
                } catch {
                  el.focus();
                }
              }
            }
          }}
          className={cn(
            "fixed z-50 grid gap-3 sm:gap-4 border bg-background shadow-lg duration-200",
            "inset-x-0 bottom-0 top-auto w-full rounded-t-2xl sm:rounded-xl",
            "sm:left-[50%] sm:top-[50%] sm:bottom-auto sm:translate-x-[-50%] sm:translate-y-[-50%]",
            "sm:w-[calc(100%-2rem)] sm:max-w-lg",
            "max-h-[85vh] sm:max-h-[90vh]",
            "pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-6",
            "pt-4 px-4 sm:p-6",
            "overflow-y-auto overflow-x-hidden",
            "-webkit-overflow-scrolling-touch",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
            "sm:data-[state=closed]:slide-out-to-bottom-0 sm:data-[state=open]:slide-in-from-bottom-0",
            "sm:data-[state=closed]:zoom-out-95 sm:data-[state=open]:zoom-in-95",
            className,
          )}
          {...props}
        >
          {/* Mobile drag indicator */}
          <div className="sm:hidden w-12 h-1.5 bg-muted-foreground/30 rounded-full mx-auto mt-2 mb-2 flex-shrink-0" />
          <DialogContextProvider>{children}</DialogContextProvider>
          {/* Botão de fechar - dispara estado global */}
          {!hideCloseButton && (
            <>
              {/* Botão invisível do Radix para manter a lógica de fechamento */}
              <DialogPrimitive.Close 
                data-radix-dialog-close
                className="sr-only" 
                aria-hidden="true"
              />
              {/* Botão visual que dispara o estado global */}
              <CloseButtonGlobal />
            </>
          )}
        </DialogPrimitive.Content>
      </DialogPortal>
    );
  },
);
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)} {...props} />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
