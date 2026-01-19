import { useRealtimeConnectionSync } from '@/hooks/useRealtimeConnectionSync';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { 
  Wifi, 
  WifiOff, 
  Loader2, 
  RefreshCw, 
  AlertTriangle,
  Clock,
  CheckCircle2,
  QrCode,
  Activity
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface RealTimeConnectionStatusProps {
  variant?: 'badge' | 'compact' | 'detailed' | 'card';
  showLastSync?: boolean;
  showReconnect?: boolean;
  className?: string;
  heartbeatInterval?: number;
}

/**
 * Componente de status de conexão em tempo real.
 * 
 * Características:
 * - Atualização automática via realtime
 * - Indicador visual do estado real do backend
 * - Auto-healing automático
 * - Nunca depende de estado local
 */
export function RealTimeConnectionStatus({
  variant = 'badge',
  showLastSync = false,
  showReconnect = true,
  className,
  heartbeatInterval = 30,
}: RealTimeConnectionStatusProps) {
  const {
    connected,
    configured,
    state,
    isLoading,
    lastSyncTime,
    offlineDuration,
    instance_name,
    evolution_state,
    syncStatus,
    attemptReconnect,
  } = useRealtimeConnectionSync({ heartbeatInterval });

  if (!configured) {
    return null;
  }

  const getStateIcon = () => {
    if (isLoading || state === 'checking') {
      return <Loader2 className="h-3.5 w-3.5 animate-spin" />;
    }
    switch (state) {
      case 'connected':
        return <Wifi className="h-3.5 w-3.5" />;
      case 'reconnecting':
        return <RefreshCw className="h-3.5 w-3.5 animate-spin" />;
      case 'needs_qr':
        return <QrCode className="h-3.5 w-3.5" />;
      default:
        return <WifiOff className="h-3.5 w-3.5" />;
    }
  };

  const getStateLabel = () => {
    if (isLoading || state === 'checking') return 'Verificando...';
    switch (state) {
      case 'connected':
        return 'Conectado';
      case 'reconnecting':
        return 'Reconectando...';
      case 'needs_qr':
        return 'Escanear QR';
      default:
        return 'Desconectado';
    }
  };

  const getStateStyles = () => {
    switch (state) {
      case 'connected':
        return 'border-green-500 text-green-600 bg-green-50 dark:bg-green-900/20';
      case 'reconnecting':
        return 'border-blue-500 text-blue-600 bg-blue-50 dark:bg-blue-900/20';
      case 'needs_qr':
        return 'border-red-500 text-red-600 bg-red-50 dark:bg-red-900/20';
      default:
        return 'border-amber-500 text-amber-600 bg-amber-50 dark:bg-amber-900/20';
    }
  };

  // Badge variant - simple inline indicator
  if (variant === 'badge') {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className={cn('gap-1.5 cursor-default', getStateStyles(), className)}
            >
              {getStateIcon()}
              WhatsApp
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <div className="space-y-1">
              <p className="font-medium">{getStateLabel()}</p>
              {offlineDuration && state !== 'connected' && (
                <p className="text-xs">Offline há {offlineDuration}</p>
              )}
              {lastSyncTime && showLastSync && (
                <p className="text-xs text-muted-foreground">
                  Última verificação: {format(lastSyncTime, 'HH:mm:ss', { locale: ptBR })}
                </p>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Compact variant - small button with popover
  if (variant === 'compact') {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn('gap-2', getStateStyles(), className)}
          >
            {getStateIcon()}
            <span className="hidden sm:inline">WhatsApp</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-4">
          <div className="space-y-4">
            {/* Status Header */}
            <div className="flex items-center gap-3">
              <div className={cn(
                'p-2 rounded-full',
                state === 'connected' 
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-600' 
                  : state === 'reconnecting'
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600'
                  : 'bg-amber-100 dark:bg-amber-900/30 text-amber-600'
              )}>
                {getStateIcon()}
              </div>
              <div>
                <p className="font-medium">{getStateLabel()}</p>
                {instance_name && (
                  <p className="text-xs text-muted-foreground">{instance_name}</p>
                )}
              </div>
            </div>

            {/* Offline duration */}
            {offlineDuration && state !== 'connected' && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                Offline há {offlineDuration}
              </div>
            )}

            {/* Evolution API state */}
            {evolution_state && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Activity className="h-3 w-3" />
                Estado da API: {evolution_state}
              </div>
            )}

            {/* Last sync */}
            {lastSyncTime && (
              <p className="text-xs text-muted-foreground">
                Verificado às {format(lastSyncTime, 'HH:mm:ss', { locale: ptBR })}
              </p>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              {showReconnect && state === 'disconnected' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => attemptReconnect()}
                  className="flex-1"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Reconectar
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => syncStatus()}
                disabled={isLoading}
                className="flex-1"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Atualizar
                  </>
                )}
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  // Card variant - for dashboard displays
  if (variant === 'card') {
    return (
      <Card className={cn('overflow-hidden', className)}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn(
                'p-2.5 rounded-full',
                state === 'connected' 
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-600' 
                  : state === 'reconnecting'
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600'
                  : state === 'needs_qr'
                  ? 'bg-red-100 dark:bg-red-900/30 text-red-600'
                  : 'bg-amber-100 dark:bg-amber-900/30 text-amber-600'
              )}>
                {state === 'connected' ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : state === 'reconnecting' ? (
                  <RefreshCw className="h-5 w-5 animate-spin" />
                ) : state === 'needs_qr' ? (
                  <AlertTriangle className="h-5 w-5" />
                ) : (
                  <WifiOff className="h-5 w-5" />
                )}
              </div>
              <div>
                <p className="font-semibold">{getStateLabel()}</p>
                <p className="text-sm text-muted-foreground">
                  {state === 'connected' 
                    ? 'Chatbot funcionando normalmente'
                    : state === 'reconnecting'
                    ? 'Tentando reconectar automaticamente...'
                    : state === 'needs_qr'
                    ? 'Escaneie o QR Code para reconectar'
                    : offlineDuration
                    ? `Offline há ${offlineDuration}`
                    : 'Conexão perdida'}
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              {showReconnect && (state === 'disconnected' || state === 'reconnecting') && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => attemptReconnect()}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => syncStatus()}
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Realtime indicator */}
          <div className="mt-3 pt-3 border-t flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className={cn(
                'w-2 h-2 rounded-full',
                state === 'connected' ? 'bg-green-500' : 'bg-amber-500',
                state !== 'connected' && 'animate-pulse'
              )} />
              Monitoramento em tempo real
            </span>
            {lastSyncTime && (
              <span>Atualizado às {format(lastSyncTime, 'HH:mm:ss', { locale: ptBR })}</span>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Detailed variant (default) - full info display
  return (
    <div className={cn('p-4 rounded-lg border', className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={cn(
            'p-2 rounded-full',
            state === 'connected' 
              ? 'bg-green-100 dark:bg-green-900/30 text-green-600' 
              : state === 'reconnecting'
              ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600'
              : state === 'needs_qr'
              ? 'bg-red-100 dark:bg-red-900/30 text-red-600'
              : 'bg-amber-100 dark:bg-amber-900/30 text-amber-600'
          )}>
            {state === 'checking' || isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : state === 'connected' ? (
              <Wifi className="h-5 w-5" />
            ) : state === 'reconnecting' ? (
              <RefreshCw className="h-5 w-5 animate-spin" />
            ) : state === 'needs_qr' ? (
              <AlertTriangle className="h-5 w-5" />
            ) : (
              <WifiOff className="h-5 w-5" />
            )}
          </div>
          <div>
            <p className="font-medium">{getStateLabel()}</p>
            <p className="text-sm text-muted-foreground">
              {state === 'connected' 
                ? 'Chatbot funcionando normalmente'
                : state === 'reconnecting'
                ? 'Tentando reconectar automaticamente...'
                : state === 'needs_qr'
                ? 'Sessão expirada - escaneie o QR Code'
                : offlineDuration
                ? `Offline há ${offlineDuration}`
                : 'Verificando conexão...'}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          {showReconnect && state === 'disconnected' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => attemptReconnect()}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Reconectar
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => syncStatus()}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Evolution state info */}
      {evolution_state && state !== 'connected' && (
        <div className="mt-3 p-2 bg-muted rounded text-sm">
          <span className="text-muted-foreground">Estado da Evolution API:</span>{' '}
          <span className="font-medium">{evolution_state}</span>
        </div>
      )}

      {/* Last sync timestamp */}
      {lastSyncTime && showLastSync && (
        <p className="mt-2 text-xs text-muted-foreground text-right">
          Última sincronização: {format(lastSyncTime, "dd/MM 'às' HH:mm:ss", { locale: ptBR })}
        </p>
      )}
    </div>
  );
}
