import { memo, forwardRef } from 'react';
import { useRealtimeConnectionSync } from '@/hooks/useRealtimeConnectionSync';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Wifi, 
  WifiOff, 
  Loader2, 
  RefreshCw, 
  CheckCircle2,
  AlertTriangle,
  Phone,
  Zap,
  Activity,
  QrCode
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface WhatsAppStatusCardProps {
  isApiActive: boolean;
  autoSendEnabled: boolean;
  className?: string;
}

/**
 * Card de status do WhatsApp modernizado com visual profissional.
 * Exibe número conectado, estado da conexão e badges de status.
 */
const WhatsAppStatusCard = memo(forwardRef<HTMLDivElement, WhatsAppStatusCardProps>(
  ({ isApiActive, autoSendEnabled, className }, ref) => {
    const {
      connected,
      configured,
      state,
      isLoading,
      connected_phone,
      syncStatus,
      attemptReconnect,
      offlineDuration,
    } = useRealtimeConnectionSync({ heartbeatInterval: 30 });

    // Format phone number for display
    const formatPhone = (phone: string | undefined) => {
      if (!phone) return null;
      const digits = phone.replace(/\D/g, '');
      if (digits.length === 13) {
        return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 9)}-${digits.slice(9)}`;
      } else if (digits.length === 12) {
        return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 8)}-${digits.slice(8)}`;
      } else if (digits.length >= 10) {
        return `+${digits.slice(0, 2)} ${digits.slice(2)}`;
      }
      return phone;
    };

    const formattedPhone = formatPhone(connected_phone);
    const isConnected = connected && isApiActive;

    const getStateInfo = () => {
      if (isLoading || state === 'checking') {
        return {
          icon: <Loader2 className="h-6 w-6 animate-spin" />,
          label: 'Verificando...',
          color: 'text-blue-500',
          bg: 'bg-blue-500/10',
          border: 'border-blue-500/30',
        };
      }
      switch (state) {
        case 'connected':
          return {
            icon: <CheckCircle2 className="h-6 w-6" />,
            label: 'Conectado',
            color: 'text-green-500',
            bg: 'bg-green-500/10',
            border: 'border-green-500/30',
          };
        case 'reconnecting':
          return {
            icon: <RefreshCw className="h-6 w-6 animate-spin" />,
            label: 'Reconectando...',
            color: 'text-blue-500',
            bg: 'bg-blue-500/10',
            border: 'border-blue-500/30',
          };
        case 'needs_qr':
          return {
            icon: <QrCode className="h-6 w-6" />,
            label: 'Escanear QR',
            color: 'text-red-500',
            bg: 'bg-red-500/10',
            border: 'border-red-500/30',
          };
        default:
          return {
            icon: <WifiOff className="h-6 w-6" />,
            label: 'Desconectado',
            color: 'text-amber-500',
            bg: 'bg-amber-500/10',
            border: 'border-amber-500/30',
          };
      }
    };

    const stateInfo = getStateInfo();

    return (
      <Card ref={ref} className={cn('overflow-hidden', stateInfo.border, className)}>
        <CardContent className="p-0">
          {/* Header com gradiente */}
          <div className={cn(
            'px-3 py-3 sm:px-5 sm:py-4 border-b',
            isConnected 
              ? 'bg-gradient-to-r from-green-500/5 via-green-500/10 to-emerald-500/5' 
              : 'bg-gradient-to-r from-muted/50 to-muted/30'
          )}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
                {/* Status Icon com animação */}
                <div className={cn(
                  'relative p-2 sm:p-3 rounded-xl sm:rounded-2xl transition-all duration-300 flex-shrink-0',
                  stateInfo.bg
                )}>
                  {/* Pulse ring para conectado */}
                  {isConnected && (
                    <div className="absolute inset-0 rounded-xl sm:rounded-2xl bg-green-500/20 animate-ping opacity-50" 
                         style={{ animationDuration: '2s' }} />
                  )}
                  <div className={cn('relative [&>svg]:h-5 [&>svg]:w-5 sm:[&>svg]:h-6 sm:[&>svg]:w-6', stateInfo.color)}>
                    {stateInfo.icon}
                  </div>
                </div>

                {/* Info principal */}
                <div className="space-y-0.5 sm:space-y-1 min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                    <h3 className={cn('font-bold text-sm sm:text-lg truncate', stateInfo.color)}>
                      {stateInfo.label}
                    </h3>
                    {isConnected && (
                      <div className="flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-full bg-green-500/20 text-green-600 dark:text-green-400 text-[10px] sm:text-xs font-medium">
                        <Activity className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                        <span className="hidden xs:inline">Ativo</span>
                      </div>
                    )}
                  </div>
                  
                  {/* Número do WhatsApp */}
                  {formattedPhone && isConnected ? (
                    <div className="flex items-center gap-1.5 sm:gap-2 text-foreground">
                      <Phone className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-green-500 flex-shrink-0" />
                      <span className="font-semibold text-xs sm:text-base tracking-wide truncate">{formattedPhone}</span>
                    </div>
                  ) : !configured ? (
                    <p className="text-sm text-muted-foreground">
                      Configure sua instância para começar
                    </p>
                  ) : offlineDuration ? (
                    <p className="text-sm text-muted-foreground">
                      Offline há {offlineDuration}
                    </p>
                  ) : state === 'needs_qr' ? (
                    <p className="text-sm text-muted-foreground">
                      Escaneie o QR Code para reconectar
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Verificando status da conexão...
                    </p>
                  )}
                </div>
              </div>

              {/* Botão de refresh */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => syncStatus()}
                disabled={isLoading}
                className="rounded-xl hover:bg-background/50"
              >
                {isLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <RefreshCw className="h-5 w-5" />
                )}
              </Button>
            </div>
          </div>

          {/* Badges de status */}
          <div className="px-3 py-3 sm:px-5 sm:py-4">
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
              {/* API Status */}
              <Badge 
                variant="outline" 
                className={cn(
                  'gap-1 sm:gap-1.5 px-2 sm:px-3 py-0.5 sm:py-1 text-[10px] sm:text-xs',
                  isApiActive 
                    ? 'border-green-500/50 bg-green-500/10 text-green-600 dark:text-green-400' 
                    : 'border-destructive/50 bg-destructive/10 text-destructive'
                )}
              >
                <Zap className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                API {isApiActive ? 'Ativa' : 'Inativa'}
              </Badge>

              {/* Conexão Status */}
              <Badge 
                variant="outline" 
                className={cn(
                  'gap-1 sm:gap-1.5 px-2 sm:px-3 py-0.5 sm:py-1 text-[10px] sm:text-xs',
                  isConnected 
                    ? 'border-green-500/50 bg-green-500/10 text-green-600 dark:text-green-400' 
                    : 'border-muted-foreground/30 bg-muted/50 text-muted-foreground'
                )}
              >
                {isConnected ? (
                  <Wifi className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                ) : (
                  <WifiOff className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                )}
                {isConnected ? 'Conectado' : 'Desconectado'}
              </Badge>

              {/* Modo de envio */}
              <Badge 
                variant="outline" 
                className={cn(
                  'gap-1 sm:gap-1.5 px-2 sm:px-3 py-0.5 sm:py-1 text-[10px] sm:text-xs',
                  autoSendEnabled 
                    ? 'border-primary/50 bg-primary/10 text-primary' 
                    : 'border-muted-foreground/30 bg-muted/50 text-muted-foreground'
                )}
              >
                {autoSendEnabled ? '🤖 Automático' : '✋ Manual'}
              </Badge>
            </div>

            {/* Mensagem de ação se desconectado */}
            {!isConnected && configured && state === 'disconnected' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => attemptReconnect()}
                className="mt-4 w-full"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Tentar Reconectar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }
));

WhatsAppStatusCard.displayName = 'WhatsAppStatusCard';

export { WhatsAppStatusCard };
