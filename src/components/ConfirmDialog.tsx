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
  
  // Handle confirm - just close via onOpenChange
  const handleConfirm = useCallback(() => {
    onConfirm();
    onOpenChange(false);
  }, [onConfirm, onOpenChange]);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="w-[95vw] sm:max-w-md p-4 sm:p-6">
        <AlertDialogHeader>
          <AlertDialogTitle className={cn(
            "flex items-center gap-2 text-base sm:text-lg",
            variant === 'destructive' && "text-destructive"
          )}>
            {showIcon && (
              <div className={cn(
                "flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-full flex-shrink-0",
                variant === 'destructive' ? "bg-destructive/10" : 
                variant === 'warning' ? "bg-warning/10" : "bg-muted"
              )}>
                <IconComponent className={cn(
                  "h-4 w-4 sm:h-5 sm:w-5",
                  variant === 'destructive' ? "text-destructive" : 
                  variant === 'warning' ? "text-warning" : "text-muted-foreground"
                )} />
              </div>
            )}
            <span className="truncate">{title}</span>
          </AlertDialogTitle>
          <AlertDialogDescription className="pt-2 text-xs sm:text-sm leading-relaxed">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
          <AlertDialogCancel className="mt-0 w-full sm:w-auto">{cancelText}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            className={cn(
              "w-full sm:w-auto",
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
