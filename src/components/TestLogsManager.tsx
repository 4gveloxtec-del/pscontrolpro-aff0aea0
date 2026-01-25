import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { toast } from 'sonner';
import { Trash2, Phone, User, Calendar, Loader2, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface TestLog {
  id: string;
  sender_phone: string;
  username: string | null;
  client_created: boolean;
  client_id: string | null;
  created_at: string;
  error_message: string | null;
  test_name: string | null;
  server_id: string | null;
  servers?: { name: string } | null;
}

export function TestLogsManager() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { dialogProps, confirm } = useConfirmDialog();
  const [selectedLogs, setSelectedLogs] = useState<Set<string>>(new Set());

  // Buscar logs de testes
  const { data: logs = [], isLoading, refetch } = useQuery({
    queryKey: ['test-generation-logs', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('test_generation_log')
        .select('id, sender_phone, username, client_created, client_id, created_at, error_message, test_name, server_id, servers:server_id(name)')
        .eq('seller_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as TestLog[];
    },
    enabled: !!user?.id,
  });

  // Mutation para deletar logs selecionados
  const deleteLogsMutation = useMutation({
    mutationFn: async (logIds: string[]) => {
      // Primeiro, buscar os client_ids associados
      const { data: logsToDelete } = await supabase
        .from('test_generation_log')
        .select('id, client_id')
        .in('id', logIds);

      // Deletar os clientes associados (se existirem)
      const clientIds = logsToDelete
        ?.filter(l => l.client_id)
        .map(l => l.client_id) as string[];
      
      if (clientIds.length > 0) {
        const { error: clientError } = await supabase
          .from('clients')
          .delete()
          .in('id', clientIds);
        
        if (clientError) {
          console.error('Error deleting clients:', clientError);
        }
      }

      // Deletar os logs
      const { error } = await supabase
        .from('test_generation_log')
        .delete()
        .in('id', logIds);
      
      if (error) throw error;
      
      return { deletedLogs: logIds.length, deletedClients: clientIds.length };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['test-generation-logs'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      setSelectedLogs(new Set());
      toast.success(`${result.deletedLogs} teste(s) removido(s) com sucesso!`);
    },
    onError: (error: Error) => {
      toast.error('Erro ao remover testes: ' + error.message);
    },
  });

  const handleSelectLog = (logId: string, checked: boolean) => {
    const newSelected = new Set(selectedLogs);
    if (checked) {
      newSelected.add(logId);
    } else {
      newSelected.delete(logId);
    }
    setSelectedLogs(newSelected);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedLogs(new Set(logs.map(l => l.id)));
    } else {
      setSelectedLogs(new Set());
    }
  };

  const handleDeleteSelected = () => {
    if (selectedLogs.size === 0) {
      toast.warning('Selecione pelo menos um teste para remover');
      return;
    }

    confirm({
      title: 'Remover Testes Selecionados',
      description: `Você está prestes a remover ${selectedLogs.size} teste(s). Os clientes associados também serão removidos. Isso liberará os números para novos testes. Esta ação não pode ser desfeita.`,
      confirmText: 'Remover',
      variant: 'destructive',
      onConfirm: () => {
        deleteLogsMutation.mutate(Array.from(selectedLogs));
      },
    });
  };

  const handleDeleteSingle = (log: TestLog) => {
    confirm({
      title: 'Remover Teste',
      description: `Remover o teste do número ${log.sender_phone}? O cliente associado também será removido e o número será liberado para um novo teste.`,
      confirmText: 'Remover',
      variant: 'destructive',
      onConfirm: () => {
        deleteLogsMutation.mutate([log.id]);
      },
    });
  };

  const formatPhone = (phone: string) => {
    // Format: 55 31 99999-9999
    if (phone.length === 13) {
      return `+${phone.slice(0, 2)} ${phone.slice(2, 4)} ${phone.slice(4, 9)}-${phone.slice(9)}`;
    }
    if (phone.length === 12) {
      return `+${phone.slice(0, 2)} ${phone.slice(2, 4)} ${phone.slice(4, 8)}-${phone.slice(8)}`;
    }
    return phone;
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
                Testes Gerados ({logs.length})
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                Gerencie os testes criados via API. Remova para liberar números.
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
              {selectedLogs.size > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDeleteSelected}
                  disabled={deleteLogsMutation.isPending}
                  className="h-8"
                >
                  {deleteLogsMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                  )}
                  Remover ({selectedLogs.size})
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
                  checked={selectedLogs.size === logs.length && logs.length > 0}
                  onCheckedChange={handleSelectAll}
                />
                <span className="text-xs text-muted-foreground">Selecionar todos</span>
              </div>

              {/* Lista de logs */}
              <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className={`flex items-center gap-3 p-2.5 rounded-lg border transition-colors ${
                      selectedLogs.has(log.id) 
                        ? 'bg-primary/5 border-primary/30' 
                        : 'bg-muted/30 hover:bg-muted/50'
                    }`}
                  >
                    <Checkbox
                      checked={selectedLogs.has(log.id)}
                      onCheckedChange={(checked) => handleSelectLog(log.id, !!checked)}
                    />
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Nome sequencial do teste - identificador principal */}
                        {log.test_name && (
                          <Badge variant="default" className="text-[10px] font-bold bg-primary/90 text-primary-foreground">
                            {log.test_name.split(' - ')[0]}
                          </Badge>
                        )}
                        <span className="font-mono text-sm font-medium">
                          {formatPhone(log.sender_phone)}
                        </span>
                        {log.client_created ? (
                          <Badge variant="outline" className="text-[10px] gap-1 bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800">
                            <CheckCircle className="h-2.5 w-2.5" />
                            Cliente criado
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
                            📺 {log.servers.name}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Calendar className="h-2.5 w-2.5" />
                          {format(new Date(log.created_at), "dd/MM/yy 'às' HH:mm", { locale: ptBR })}
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
                      onClick={() => handleDeleteSingle(log)}
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
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
