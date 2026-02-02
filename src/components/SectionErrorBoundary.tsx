import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Props {
  children: ReactNode;
  /** Nome da seção para logging (ex: "Lista de Clientes") */
  sectionName?: string;
  /** Classe CSS adicional para o container de erro */
  className?: string;
  /** Callback opcional quando erro é capturado */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /** Componente de fallback personalizado */
  fallback?: ReactNode;
  /** Estilo compacto para seções menores */
  compact?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * SectionErrorBoundary - Captura erros em seções específicas da UI
 * 
 * Diferente do ErrorBoundary global, este componente:
 * - Isola erros para não derrubar a página inteira
 * - Oferece botão "Tentar Novamente" para recuperação local
 * - Exibe mensagem amigável sem detalhes técnicos (exceto em dev)
 * - Logs de erro para debugging
 * 
 * Uso:
 * <SectionErrorBoundary sectionName="Lista de Clientes">
 *   <ClientList />
 * </SectionErrorBoundary>
 */
export class SectionErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const { sectionName = 'Seção', onError } = this.props;
    
    // Log estruturado para debugging
    console.error(`[SectionErrorBoundary] Erro em "${sectionName}":`, {
      message: error.message,
      stack: error.stack?.slice(0, 500),
      componentStack: errorInfo.componentStack?.slice(0, 300),
    });
    
    this.setState({ errorInfo });
    
    // Callback opcional para tracking externo
    onError?.(error, errorInfo);
  }

  handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    const { children, sectionName = 'Esta seção', className, fallback, compact } = this.props;
    const { hasError, error } = this.state;

    if (hasError) {
      // Fallback personalizado se fornecido
      if (fallback) {
        return <>{fallback}</>;
      }

      // Modo compacto para seções menores
      if (compact) {
        return (
          <div className={cn(
            "flex items-center justify-between gap-3 p-3 rounded-lg",
            "bg-destructive/10 border border-destructive/20",
            className
          )}>
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <span>Erro ao carregar</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={this.handleRetry}
              className="h-7 px-2 text-xs"
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Tentar
            </Button>
          </div>
        );
      }

      // Modo padrão
      return (
        <div className={cn(
          "flex flex-col items-center justify-center gap-4 p-6 rounded-xl",
          "bg-destructive/5 border border-destructive/20",
          "min-h-[120px]",
          className
        )}>
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            <span className="font-medium">Erro ao carregar</span>
          </div>
          
          <p className="text-sm text-muted-foreground text-center max-w-md">
            {sectionName} encontrou um problema. Tente novamente ou recarregue a página.
          </p>
          
          {/* Mostra detalhes técnicos apenas em desenvolvimento */}
          {import.meta.env.DEV && error && (
            <p className="text-xs text-destructive/70 font-mono bg-destructive/10 px-2 py-1 rounded max-w-full overflow-auto">
              {error.message.slice(0, 150)}
            </p>
          )}
          
          <Button
            variant="outline"
            size="sm"
            onClick={this.handleRetry}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Tentar Novamente
          </Button>
        </div>
      );
    }

    return children;
  }
}

export default SectionErrorBoundary;
