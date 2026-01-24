/**
 * Circuit Breaker Status Component
 * 
 * Exibe o status do circuit breaker e fila de mensagens pendentes
 */

import { useState } from 'react';
import { useCircuitBreaker } from '@/hooks/useCircuitBreaker';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  RefreshCw, 
  Trash2,
  Play,
  Pause,
  Zap
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface CircuitBreakerStatusProps {
  compact?: boolean;
  showQueue?: boolean;
}

export function CircuitBreakerStatus({ compact = false, showQueue = true }: CircuitBreakerStatusProps) {
  const {
    circuitState,
    isOpen,
    isHalfOpen,
    isClosed,
    queuedMessages,
    queueLength,
    isProcessingQueue,
    processQueue,
    resetCircuit,
    clearQueue,
  } = useCircuitBreaker();
  
  const [isResetting, setIsResetting] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const handleReset = async () => {
    setIsResetting(true);
    await resetCircuit();
    setIsResetting(false);
  };

  const handleClearQueue = async () => {
    setIsClearing(true);
    await clearQueue();
    setIsClearing(false);
  };

  // Compact mode - just a badge
  if (compact) {
    if (isClosed && queueLength === 0) return null;
    
    return (
      <div className="flex items-center gap-2">
        {isOpen && (
          <Badge variant="destructive" className="gap-1">
            <AlertTriangle className="h-3 w-3" />
            API Instável
          </Badge>
        )}
        {isHalfOpen && (
          <Badge variant="secondary" className="gap-1 bg-yellow-500/20 text-yellow-700">
            <Clock className="h-3 w-3" />
            Testando
          </Badge>
        )}
        {queueLength > 0 && (
          <Badge variant="outline" className="gap-1">
            <Clock className="h-3 w-3" />
            {queueLength} na fila
          </Badge>
        )}
      </div>
    );
  }

  // Full status card
  return (
    <Card className={`
      ${isOpen ? 'border-destructive bg-destructive/5' : ''}
      ${isHalfOpen ? 'border-yellow-500 bg-yellow-500/5' : ''}
    `}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-base">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Status da API WhatsApp
          </div>
          
          <div className="flex items-center gap-2">
            {isClosed && (
              <Badge variant="default" className="bg-green-600 gap-1">
                <CheckCircle className="h-3 w-3" />
                Normal
              </Badge>
            )}
            {isOpen && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                Circuito Aberto
              </Badge>
            )}
            {isHalfOpen && (
              <Badge variant="secondary" className="gap-1 bg-yellow-500 text-white">
                <Clock className="h-3 w-3" />
                Testando
              </Badge>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Status details */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
          <div className="bg-muted/50 rounded p-2">
            <div className="text-muted-foreground text-xs">Falhas</div>
            <div className="font-medium">{circuitState?.failure_count || 0}/{circuitState?.failure_threshold || 5}</div>
          </div>
          <div className="bg-muted/50 rounded p-2">
            <div className="text-muted-foreground text-xs">Sucessos</div>
            <div className="font-medium">{circuitState?.success_count || 0}/{circuitState?.success_threshold || 3}</div>
          </div>
          <div className="bg-muted/50 rounded p-2">
            <div className="text-muted-foreground text-xs">Na Fila</div>
            <div className="font-medium">{queueLength}</div>
          </div>
          <div className="bg-muted/50 rounded p-2">
            <div className="text-muted-foreground text-xs">Última Falha</div>
            <div className="font-medium text-xs">
              {circuitState?.last_failure_at 
                ? formatDistanceToNow(new Date(circuitState.last_failure_at), { addSuffix: true, locale: ptBR })
                : '-'
              }
            </div>
          </div>
        </div>
        
        {/* Last error */}
        {circuitState?.last_error && (
          <div className="text-xs text-muted-foreground bg-muted/30 rounded p-2">
            <span className="font-medium">Último erro:</span> {circuitState.last_error.substring(0, 100)}
          </div>
        )}
        
        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          {(isOpen || isHalfOpen) && (
            <Button 
              size="sm" 
              variant="outline"
              onClick={handleReset}
              disabled={isResetting}
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${isResetting ? 'animate-spin' : ''}`} />
              Resetar Circuit
            </Button>
          )}
          
          {queueLength > 0 && !isProcessingQueue && (
            <Button 
              size="sm" 
              variant="default"
              onClick={() => processQueue()}
              disabled={isOpen}
            >
              <Play className="h-4 w-4 mr-1" />
              Processar Fila ({queueLength})
            </Button>
          )}
          
          {isProcessingQueue && (
            <Button size="sm" variant="secondary" disabled>
              <Pause className="h-4 w-4 mr-1 animate-pulse" />
              Processando...
            </Button>
          )}
          
          {queueLength > 0 && (
            <Button 
              size="sm" 
              variant="ghost"
              onClick={handleClearQueue}
              disabled={isClearing}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Limpar Fila
            </Button>
          )}
        </div>
        
        {/* Queue preview */}
        {showQueue && queueLength > 0 && (
          <div className="border-t pt-3 mt-2">
            <div className="text-xs font-medium text-muted-foreground mb-2">
              Mensagens na fila ({Math.min(queueLength, 5)} de {queueLength})
            </div>
            <div className="space-y-1">
              {queuedMessages.slice(0, 5).map((msg) => (
                <div 
                  key={msg.id} 
                  className="flex items-center justify-between text-xs bg-muted/30 rounded p-2"
                >
                  <div className="flex items-center gap-2 truncate flex-1">
                    <Badge variant="outline" className="text-[10px]">
                      {msg.message_type}
                    </Badge>
                    <span className="truncate">{msg.phone}</span>
                  </div>
                  <div className="text-muted-foreground">
                    {msg.retry_count > 0 && `(${msg.retry_count}x)`}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
