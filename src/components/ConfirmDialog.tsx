import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, Trash2, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { useModalStack } from "@/hooks/useModalStack";
import { useCallback, useId } from "react";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  variant?: 'default' | 'destructive' | 'warning';
  icon?: 'trash' | 'warning' | 'info';
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  onConfirm,
  variant = 'default',
  icon,
}: ConfirmDialogProps) {
  const dialogId = useId();
  const IconComponent = icon === 'trash' ? Trash2 : icon === 'info' ? Info : AlertTriangle;
  const showIcon = variant === 'destructive' || variant === 'warning' || icon;
  
  // Integrate with navigation stack
  const { handleClose } = useModalStack({
    id: `confirm-dialog-${dialogId}`,
    isOpen: open,
    onClose: () => onOpenChange(false),
  });
  
  // Stack-aware open change handler
  const handleOpenChange = useCallback((newOpen: boolean) => {
    if (!newOpen) {
      handleClose();
    } else {
      onOpenChange(true);
    }
  }, [handleClose, onOpenChange]);
  
  // Handle confirm with stack-aware close
  const handleConfirm = useCallback(() => {
    onConfirm();
    handleClose();
  }, [onConfirm, handleClose]);

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className={cn(
            "flex items-center gap-2",
            variant === 'destructive' && "text-destructive"
          )}>
            {showIcon && (
              <div className={cn(
                "flex h-10 w-10 items-center justify-center rounded-full",
                variant === 'destructive' ? "bg-destructive/10" : 
                variant === 'warning' ? "bg-warning/10" : "bg-muted"
              )}>
                <IconComponent className={cn(
                  "h-5 w-5",
                  variant === 'destructive' ? "text-destructive" : 
                  variant === 'warning' ? "text-warning" : "text-muted-foreground"
                )} />
              </div>
            )}
            <span>{title}</span>
          </AlertDialogTitle>
          <AlertDialogDescription className="pt-2 text-sm leading-relaxed">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-0">
          <AlertDialogCancel className="mt-0">{cancelText}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            className={cn(
              variant === 'destructive' && "bg-destructive text-destructive-foreground hover:bg-destructive/90"
            )}
          >
            {confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
