import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * =========================================================================
 * CloseButtonGlobal - COMPONENTE ÚNICO E OBRIGATÓRIO PARA FECHAR OVERLAYS
 * =========================================================================
 * 
 * Este é o ÚNICO botão de fechamento permitido em toda a aplicação.
 * 
 * REGRAS ABSOLUTAS:
 * 1. NÃO criar botões "X" manuais em nenhuma tela
 * 2. NÃO usar onClick para fechar - isso é gerenciado pelos primitivos Radix/Vaul
 * 3. NÃO usar window.history.back() para fechar overlays
 * 4. NÃO resetar estado da tela base ao fechar
 * 
 * COMO FUNCIONA:
 * - Este componente é embedado automaticamente em DialogContent, SheetContent e DrawerContent
 * - O fechamento é gerenciado pelos primitivos (DialogPrimitive.Close, etc.)
 * - Você NÃO precisa adicionar este botão manualmente em nenhum lugar
 * 
 * SE VOCÊ ESTÁ LENDO ISSO E PENSANDO EM CRIAR UM BOTÃO X MANUAL: NÃO FAÇA.
 * Use os componentes Dialog, Sheet ou Drawer do shadcn que já incluem este botão.
 * 
 * =========================================================================
 */

export interface CloseButtonGlobalProps {
  /** Tamanho do botão: 'sm' para drawers compactos, 'default' para dialogs/sheets */
  size?: 'sm' | 'default';
  /** Classes CSS adicionais (apenas para posicionamento, NÃO para lógica) */
  className?: string;
}

/**
 * CloseButtonGlobal - Renderiza o botão X padrão para overlays
 * 
 * IMPORTANTE: Este componente deve ser usado APENAS dentro dos primitivos Close do Radix/Vaul:
 * - <DialogPrimitive.Close asChild><CloseButtonGlobal /></DialogPrimitive.Close>
 * - <SheetPrimitive.Close asChild><CloseButtonGlobal /></SheetPrimitive.Close>
 * - <DrawerPrimitive.Close asChild><CloseButtonGlobal /></DrawerPrimitive.Close>
 * 
 * O fechamento é gerenciado automaticamente pelo primitivo - NÃO adicione onClick.
 */
export const CloseButtonGlobal = React.forwardRef<HTMLButtonElement, CloseButtonGlobalProps>(
  ({ className, size = 'default' }, ref) => {
    // Handler para prevenir propagação de eventos
    const handleClick = React.useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      // O fechamento real é gerenciado pelo primitivo Close do Radix/Vaul
    }, []);

    // Handler para prevenir menu de contexto em long-press mobile
    const handleContextMenu = React.useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
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
        }}
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
