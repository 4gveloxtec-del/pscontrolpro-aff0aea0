import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowRight, Loader2, Server, Users } from 'lucide-react';
import { toast } from 'sonner';

interface Server {
  id: string;
  name: string;
  icon_url: string | null;
}

interface BulkServerMigrationProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceServerId: string;
  sourceServerName: string;
  servers: Server[];
  clientsToMigrate: { id: string; name: string }[];
  userId: string;
}

export function BulkServerMigration({
  open,
  onOpenChange,
  sourceServerId,
  sourceServerName,
  servers,
  clientsToMigrate,
  userId,
}: BulkServerMigrationProps) {
  const queryClient = useQueryClient();
  const [targetServerId, setTargetServerId] = useState<string>('');

  const targetServer = servers.find(s => s.id === targetServerId);

  const migrationMutation = useMutation({
    mutationFn: async () => {
      if (!targetServerId || !targetServer) {
        throw new Error('Selecione um servidor de destino');
      }

      const clientIds = clientsToMigrate.map(c => c.id);

      const { error } = await supabase
        .from('clients')
        .update({
          server_id: targetServerId,
          server_name: targetServer.name,
        })
        .in('id', clientIds)
        .eq('seller_id', userId);

      if (error) throw error;

      return clientIds.length;
    },
    onSuccess: (count) => {
      toast.success(`${count} cliente${count !== 1 ? 's' : ''} migrado${count !== 1 ? 's' : ''} para ${targetServer?.name}`);
      queryClient.invalidateQueries({ queryKey: ['clients', userId] });
      onOpenChange(false);
      setTargetServerId('');
    },
    onError: (error) => {
      console.error('Migration error:', error);
      toast.error('Erro ao migrar clientes');
    },
  });

  const availableServers = servers.filter(s => s.id !== sourceServerId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-md p-3 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Server className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
            <span className="truncate">Migrar Clientes em Massa</span>
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            Migrar todos os clientes do servidor <strong className="break-all">{sourceServerName}</strong> para outro servidor.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 sm:space-y-4 py-2 sm:py-4">
          {/* Migration Summary */}
          <div className="flex items-center justify-center gap-2 sm:gap-4 p-3 sm:p-4 bg-muted/50 rounded-lg">
            <div className="text-center min-w-0 flex-1">
              <div className="p-1.5 sm:p-2 rounded-full bg-primary/10 mb-1 sm:mb-2 mx-auto w-fit">
                <Server className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
              </div>
              <p className="font-medium text-xs sm:text-sm truncate">{sourceServerName}</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground">Origem</p>
            </div>

            <ArrowRight className="h-4 w-4 sm:h-6 sm:w-6 text-muted-foreground flex-shrink-0" />

            <div className="text-center min-w-0 flex-1">
              <div className="p-1.5 sm:p-2 rounded-full bg-success/10 mb-1 sm:mb-2 mx-auto w-fit">
                <Server className="h-4 w-4 sm:h-5 sm:w-5 text-success" />
              </div>
              <p className="font-medium text-xs sm:text-sm truncate">
                {targetServer?.name || 'Selecione...'}
              </p>
              <p className="text-[10px] sm:text-xs text-muted-foreground">Destino</p>
            </div>
          </div>

          {/* Clients Count */}
          <div className="flex items-center gap-2 p-2 sm:p-3 bg-warning/10 border border-warning/30 rounded-lg">
            <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-warning flex-shrink-0" />
            <p className="text-xs sm:text-sm">
              <strong>{clientsToMigrate.length}</strong> cliente{clientsToMigrate.length !== 1 ? 's' : ''} será{clientsToMigrate.length !== 1 ? 'ão' : ''} migrado{clientsToMigrate.length !== 1 ? 's' : ''}
            </p>
          </div>

          {/* Target Server Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Servidor de Destino</label>
            <Select value={targetServerId} onValueChange={setTargetServerId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o servidor de destino" />
              </SelectTrigger>
              <SelectContent>
                {availableServers.map((server) => (
                  <SelectItem key={server.id} value={server.id}>
                    {server.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {availableServers.length === 0 && (
            <p className="text-sm text-muted-foreground text-center">
              Nenhum outro servidor disponível para migração.
            </p>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
            Cancelar
          </Button>
          <Button
            onClick={() => migrationMutation.mutate()}
            disabled={!targetServerId || migrationMutation.isPending || availableServers.length === 0}
            className="gap-2 w-full sm:w-auto"
          >
            {migrationMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="hidden xs:inline">Migrando...</span>
                <span className="xs:hidden">...</span>
              </>
            ) : (
              <>
                <ArrowRight className="h-4 w-4" />
                <span className="hidden xs:inline">Migrar {clientsToMigrate.length} Cliente{clientsToMigrate.length !== 1 ? 's' : ''}</span>
                <span className="xs:hidden">Migrar ({clientsToMigrate.length})</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
