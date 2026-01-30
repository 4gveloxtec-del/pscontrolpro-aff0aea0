import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * OverlayCloseButton - Componente global de botão de fechamento para overlays
 * 
 * Este é o ÚNICO padrão de botão X usado em toda a aplicação.
 * Funciona com Dialog, Sheet e Drawer.
 * 
 * Características:
 * - Alvo de toque 48x48px (padrão Android/acessibilidade)
 * - z-index 9999 com isolation: isolate
 * - Prevenção de context menu em long-press
 * - stopPropagation para evitar conflitos com overlays
 * - Touch-action: manipulation para resposta imediata
 */
export interface OverlayCloseButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Tamanho do botão: 'sm' para drawers compactos, 'default' para dialogs/sheets */
  size?: 'sm' | 'default';
}

export const OverlayCloseButton = React.forwardRef<HTMLButtonElement, OverlayCloseButtonProps>(
  ({ className, size = 'default', onClick, ...props }, ref) => {
    const handleClick = React.useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
      // Impede propagação para evitar conflitos com gestos/overlays
      e.stopPropagation();
      onClick?.(e);
    }, [onClick]);

    const handleContextMenu = React.useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
      // Previne menu de contexto em long-press no mobile
      e.preventDefault();
    }, []);

    const sizeClasses = size === 'sm' 
      ? "h-10 w-10 min-h-[40px] min-w-[40px]"
      : "h-12 w-12 min-h-[48px] min-w-[48px]";

    const iconSize = size === 'sm' ? 18 : 22;

    return (
      <button
        ref={ref}
        type="button"
        aria-label="Fechar"
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        className={cn(
          // Posicionamento
          "absolute top-2 right-2 z-[9999]",
          // Layout
          "flex items-center justify-center shrink-0",
          // Tamanho
          sizeClasses,
          // Estilo visual
          "rounded-full bg-muted/90 backdrop-blur-sm border border-border/50",
          // Estados interativos
          "active:scale-95 active:bg-muted-foreground/30",
          "hover:bg-muted-foreground/20",
          // Focus
          "ring-offset-background transition-all duration-150",
          "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
          // Touch optimization - crítico para Android/PWA
          "cursor-pointer select-none pointer-events-auto",
          className
        )}
        style={{
          // Force touch action for Android WebView
          touchAction: 'manipulation',
          WebkitTapHighlightColor: 'transparent',
          // Garante sempre no topo
          isolation: 'isolate',
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

OverlayCloseButton.displayName = "OverlayCloseButton";
