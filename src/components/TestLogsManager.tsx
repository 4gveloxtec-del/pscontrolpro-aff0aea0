import { useTestLogs, calcularTempoRestante } from '@/hooks/useTestLogs';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Trash2, Phone, User, Loader2, CheckCircle, XCircle, RefreshCw, Server, Clock, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

function formatPhone(phone: string): string {
  if (phone.length === 13) {
    return `+${phone.slice(0, 2)} ${phone.slice(2, 4)} ${phone.slice(4, 9)}-${phone.slice(9)}`;
  }
  if (phone.length === 12) {
    return `+${phone.slice(0, 2)} ${phone.slice(2, 4)} ${phone.slice(4, 8)}-${phone.slice(8)}`;
  }
  return phone;
}

export function TestLogsManager() {
  const { dialogProps, confirm } = useConfirmDialog();
  
  const {
    logs,
    selectedLogs,
    stats,
    isLoading,
    isDeleting,
    refetch,
    deleteLogs,
    handleSelectLog,
    handleSelectAll,
  } = useTestLogs({ limit: 100, autoRefreshInterval: 30000 });

  const handleDeleteSelected = () => {
    if (stats.selectedCount === 0) return;

    confirm({
      title: 'Remover Testes Selecionados',
      description: `Você está prestes a remover ${stats.selectedCount} teste(s). Os clientes associados também serão removidos. Isso liberará os números para novos testes. Esta ação não pode ser desfeita.`,
      confirmText: 'Remover',
      variant: 'destructive',
      onConfirm: () => deleteLogs(Array.from(selectedLogs)),
    });
  };

  const handleDeleteSingle = (log: typeof logs[0]) => {
    confirm({
      title: 'Remover Teste',
      description: `Remover o teste do número ${formatPhone(log.sender_phone)}? O cliente associado também será removido e o número será liberado para um novo teste.`,
      confirmText: 'Remover',
      variant: 'destructive',
      onConfirm: () => deleteLogs([log.id]),
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Phone className="h-4 w-4" />
                Testes Gerados ({stats.total})
              </CardTitle>
              <CardDescription className="text-xs mt-1 flex items-center gap-3 flex-wrap">
                <span className="text-green-600">{stats.ativos} ativos</span>
                {stats.criticos > 0 && (
                  <span className="text-red-600 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {stats.criticos} críticos
                  </span>
                )}
                {stats.vencidos > 0 && (
                  <span className="text-muted-foreground">{stats.vencidos} vencidos</span>
                )}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                className="h-8"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
              {stats.selectedCount > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDeleteSelected}
                  disabled={isDeleting}
                  className="h-8"
                >
                  {isDeleting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                  )}
                  Remover ({stats.selectedCount})
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Nenhum teste gerado ainda.
            </div>
          ) : (
            <div className="space-y-2">
              {/* Header com select all */}
              <div className="flex items-center gap-2 pb-2 border-b">
                <Checkbox
                  checked={stats.selectedCount === stats.total && stats.total > 0}
                  onCheckedChange={handleSelectAll}
                />
                <span className="text-xs text-muted-foreground">Selecionar todos</span>
                <span className="text-xs text-muted-foreground ml-auto">
                  ⏱️ Atualiza a cada 30s
                </span>
              </div>

              {/* Lista de logs */}
              <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
                {logs.map((log) => (
                  <TestLogItem
                    key={log.id}
                    log={log}
                    isSelected={selectedLogs.has(log.id)}
                    onSelect={handleSelectLog}
                    onDelete={handleDeleteSingle}
                  />
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog {...dialogProps} />
    </>
  );
}

// Componente para cada item de log
interface TestLogItemProps {
  log: ReturnType<typeof useTestLogs>['logs'][0];
  isSelected: boolean;
  onSelect: (id: string, checked: boolean) => void;
  onDelete: (log: ReturnType<typeof useTestLogs>['logs'][0]) => void;
}

function TestLogItem({ log, isSelected, onSelect, onDelete }: TestLogItemProps) {
  const { texto: tempoTexto, status: tempoStatus } = log.tempoRestante;

  return (
    <div
      className={cn(
        "flex items-center gap-3 p-2.5 rounded-lg border transition-colors",
        isSelected 
          ? 'bg-primary/5 border-primary/30' 
          : 'bg-muted/30 hover:bg-muted/50',
        tempoStatus === 'critical' && 'border-red-300 dark:border-red-800',
        tempoStatus === 'expired' && 'opacity-60'
      )}
    >
      <Checkbox
        checked={isSelected}
        onCheckedChange={(checked) => onSelect(log.id, !!checked)}
      />
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Nome sequencial do teste */}
          {log.test_name && (
            <Badge variant="default" className="text-[10px] font-bold bg-primary/90 text-primary-foreground">
              {log.test_name.split(' - ')[0]}
            </Badge>
          )}
          
          {/* Tempo restante - DESTAQUE PRINCIPAL */}
          <Badge 
            variant="outline" 
            className={cn(
              "text-[10px] font-bold gap-1",
              tempoStatus === 'ok' && "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
              tempoStatus === 'warning' && "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800",
              tempoStatus === 'critical' && "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800 animate-pulse",
              tempoStatus === 'expired' && "bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700"
            )}
          >
            <Clock className="h-2.5 w-2.5" />
            {tempoTexto}
          </Badge>

          <span className="font-mono text-sm font-medium">
            {formatPhone(log.sender_phone)}
          </span>
          
          {log.client_created ? (
            <Badge variant="outline" className="text-[10px] gap-1 bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800">
              <CheckCircle className="h-2.5 w-2.5" />
              Criado
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] gap-1 bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800">
              <XCircle className="h-2.5 w-2.5" />
              Falhou
            </Badge>
          )}
        </div>
        
        <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground flex-wrap">
          {log.username && (
            <span className="flex items-center gap-1">
              <User className="h-2.5 w-2.5" />
              {log.username}
            </span>
          )}
          {log.servers?.name && (
            <span className="flex items-center gap-1 text-primary/80">
              <Server className="h-2.5 w-2.5" />
              {log.servers.name}
            </span>
          )}
          <span className="text-[9px]">
            Criado: {format(new Date(log.created_at), "dd/MM HH:mm", { locale: ptBR })}
          </span>
        </div>
        
        {log.error_message && (
          <p className="text-[10px] text-red-600 mt-0.5 truncate">
            {log.error_message}
          </p>
        )}
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={() => onDelete(log)}
        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
