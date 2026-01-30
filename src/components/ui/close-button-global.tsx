import * as React from "react";
import { cn } from "@/lib/utils";
import { useGlobalModalCloseSafe } from "@/contexts/GlobalModalCloseContext";

/**
 * =========================================================================
 * CloseButtonGlobal - COMPONENTE ÚNICO PARA FECHAR MODAIS VIA ESTADO GLOBAL
 * =========================================================================
 * 
 * Este botão NÃO fecha o modal diretamente.
 * Ele apenas dispara o estado global `shouldClose = true`.
 * Os modais (Dialog, Sheet, Drawer) observam esse estado e fecham.
 * 
 * =========================================================================
 */

export interface CloseButtonGlobalProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "size"> {
  /** Tamanho do botão: 'sm' para drawers compactos, 'default' para dialogs/sheets */
  size?: "sm" | "default";
  /** Classes CSS adicionais (apenas para posicionamento, NÃO para lógica) */
  className?: string;
}

export const CloseButtonGlobal = React.forwardRef<HTMLButtonElement, CloseButtonGlobalProps>(
  ({ className, size = "default", onClick, onContextMenu, style, type, ...props }, ref) => {
    const globalClose = useGlobalModalCloseSafe();

    // Handler que dispara o fechamento global
    const handleClick = React.useCallback(
      (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        e.stopPropagation();
        
        console.log('[CloseButtonGlobal] Click detected, triggering global close');
        
        // Dispara o fechamento global - os modais observam esse estado
        if (globalClose) {
          globalClose.triggerClose();
        }
        
        // Também chama onClick original caso exista (fallback para Radix)
        onClick?.(e);
      },
      [globalClose, onClick],
    );

    // Handler para prevenir menu de contexto em long-press mobile
    const handleContextMenu = React.useCallback(
      (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        onContextMenu?.(e);
      },
      [onContextMenu],
    );

    const sizeClasses = size === 'sm' 
      ? "h-10 w-10 min-h-[40px] min-w-[40px]"
      : "h-12 w-12 min-h-[48px] min-w-[48px]";

    const iconSize = size === 'sm' ? 18 : 22;

    return (
      <button
        ref={ref}
        type={type ?? "button"}
        aria-label={props["aria-label"] ?? "Fechar"}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        className={cn(
          // Posicionamento absoluto no canto superior direito
          "absolute top-2 right-2 z-[9999]",
          // Layout centralizado
          "flex items-center justify-center shrink-0",
          // Tamanho mínimo para acessibilidade (48px Android)
          sizeClasses,
          // Estilo visual padrão
          "rounded-full bg-muted/90 backdrop-blur-sm border border-border/50",
          // Estados interativos
          "active:scale-95 active:bg-muted-foreground/30",
          "hover:bg-muted-foreground/20",
          // Focus ring para acessibilidade
          "ring-offset-background transition-all duration-150",
          "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
          // Otimização para touch - crítico para Android/PWA
          "cursor-pointer select-none pointer-events-auto",
          className
        )}
        style={{
          // Touch action para resposta imediata no Android
          touchAction: 'manipulation',
          WebkitTapHighlightColor: 'transparent',
          // Isolamento de contexto para z-index
          isolation: 'isolate',
          ...style,
        }}
        {...props}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width={iconSize}
          height={iconSize}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="pointer-events-none"
          aria-hidden="true"
        >
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      </button>
    );
  }
);

CloseButtonGlobal.displayName = "CloseButtonGlobal";

// Re-export para compatibilidade com imports existentes
export { CloseButtonGlobal as OverlayCloseButton };
