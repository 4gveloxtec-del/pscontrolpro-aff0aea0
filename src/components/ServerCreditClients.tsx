import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabaseExternal as supabase } from '@/lib/supabase-external';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { toast } from 'sonner';
import { UserPlus, Search, Trash2, Monitor, Wifi, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';

interface ServerCreditClientsProps {
  serverId: string;
  serverName: string;
  sellerId: string;
  iptvPerCredit: number;
  p2pPerCredit: number;
  totalCredits: number;
  creditPrice: number;
  isOpen: boolean;
  onClose: () => void;
}

interface Client {
  id: string;
  name: string;
  login: string | null;
  password: string | null;
}

interface PanelClient {
  id: string;
  panel_id: string;
  client_id: string;
  assigned_at: string;
  slot_type: string;
}

// Calculate pro-rata price
// AUDIT FIX: Safe numeric handling and precision rounding
const calculateProRataPrice = (monthlyPrice: number, daysUsed: number, totalDays: number = 30): number => {
  const safePrice = Number(monthlyPrice) || 0;
  const safeDaysUsed = Number(daysUsed) || 0;
  const safeTotalDays = Number(totalDays) || 30;
  
  if (safePrice <= 0 || safeTotalDays <= 0) return 0;
  if (safeDaysUsed <= 0) return safePrice;
  
  const remainingDays = safeTotalDays - safeDaysUsed;
  if (remainingDays <= 0) return 0;
  
  // Round to 2 decimal places for currency precision
  return Math.round((safePrice / safeTotalDays) * remainingDays * 100) / 100;
};

// Get current day of month for pro-rata
const getCurrentDayOfMonth = () => {
  return new Date().getDate();
};

export function ServerCreditClients({
  serverId,
  serverName,
  sellerId,
  iptvPerCredit,
  p2pPerCredit,
  totalCredits,
  creditPrice,
  isOpen,
  onClose,
}: ServerCreditClientsProps) {
  const queryClient = useQueryClient();
  const { dialogProps, confirm } = useConfirmDialog();
  const [clientSearchTerm, setClientSearchTerm] = useState('');
  const [selectedSlotType, setSelectedSlotType] = useState<'iptv' | 'p2p'>('iptv');
  const [viewMode, setViewMode] = useState<'assign' | 'view'>('view');

  // Fetch all clients
  const { data: clients = [] } = useQuery({
    queryKey: ['clients-for-server-credits', sellerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, name, login, password')
        .eq('seller_id', sellerId)
        .eq('is_archived', false)
        .order('name');
      if (error) throw error;
      return data as Client[];
    },
    enabled: isOpen,
  });

  // Fetch panel_clients for this server (using server_id as panel_id)
  const { data: serverClients = [] } = useQuery({
    queryKey: ['server-credit-clients', serverId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('panel_clients')
        .select('*')
        .eq('panel_id', serverId)
        .eq('seller_id', sellerId);
      if (error) throw error;
      return data as PanelClient[];
    },
    enabled: isOpen,
  });

  // Assign client mutation
  const assignClientMutation = useMutation({
    mutationFn: async ({ client_id, slot_type }: { client_id: string; slot_type: string }) => {
      const { error } = await supabase.from('panel_clients').insert([{
        panel_id: serverId,
        client_id,
        seller_id: sellerId,
        slot_type,
      }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['server-credit-clients', serverId] });
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      toast.success('Cliente vinculado ao crédito!');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Remove client mutation
  const removeClientMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('panel_clients').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['server-credit-clients', serverId] });
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      toast.success('Cliente removido do crédito!');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Calculate slot usage
  const usedIptvSlots = serverClients.filter(sc => sc.slot_type === 'iptv').length;
  const usedP2pSlots = serverClients.filter(sc => sc.slot_type === 'p2p').length;
  const totalIptvSlots = totalCredits * iptvPerCredit;
  const totalP2pSlots = totalCredits * p2pPerCredit;
  const availableIptvSlots = totalIptvSlots - usedIptvSlots;
  const availableP2pSlots = totalP2pSlots - usedP2pSlots;

  // Get clients with their slot type
  const getClientsWithSlotType = () => {
    return serverClients
      .map(sc => {
        const client = clients.find(c => c.id === sc.client_id);
        return { ...sc, client };
      })
      .filter(sc => sc.client);
  };

  // Get available clients (not yet assigned)
  const getAvailableClients = () => {
    const assignedClientIds = serverClients.map(sc => sc.client_id);
    return clients.filter(c => {
      if (assignedClientIds.includes(c.id)) return false;
      if (!clientSearchTerm) return true;
      const query = clientSearchTerm.toLowerCase();
      return (
        c.name.toLowerCase().includes(query) ||
        (c.login && c.login.toLowerCase().includes(query)) ||
        (c.password && c.password.toLowerCase().includes(query))
      );
    });
  };

  // Filter viewed clients
  const getFilteredViewClients = () => {
    const clientsWithSlot = getClientsWithSlotType();
    if (!clientSearchTerm) return clientsWithSlot;
    const query = clientSearchTerm.toLowerCase();
    return clientsWithSlot.filter(sc => 
      sc.client?.name.toLowerCase().includes(query) ||
      (sc.client?.login && sc.client.login.toLowerCase().includes(query)) ||
      (sc.client?.password && sc.client.password.toLowerCase().includes(query))
    );
  };

  // Check if any slot type has availability
  const hasAvailableSlots = availableIptvSlots > 0 || availableP2pSlots > 0;

  // Pro-rata calculation
  const daysUsed = getCurrentDayOfMonth();
  const proRataPrice = calculateProRataPrice(creditPrice, daysUsed, 30);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Créditos Compartilhados - {serverName}
          </DialogTitle>
          <DialogDescription>
            Gerencie os clientes vinculados aos créditos deste servidor
          </DialogDescription>
        </DialogHeader>

        {/* Slot usage summary */}
        <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-muted/50">
          {iptvPerCredit > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1 text-blue-500">
                  <Monitor className="h-4 w-4" />
                  IPTV
                </span>
                <span className="font-medium">{usedIptvSlots} / {totalIptvSlots}</span>
              </div>
              <Progress 
                value={(usedIptvSlots / totalIptvSlots) * 100} 
                className="h-2 [&>div]:bg-blue-500"
              />
              <p className="text-xs text-muted-foreground">{availableIptvSlots} vagas disponíveis</p>
            </div>
          )}
          {p2pPerCredit > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1 text-green-500">
                  <Wifi className="h-4 w-4" />
                  P2P
                </span>
                <span className="font-medium">{usedP2pSlots} / {totalP2pSlots}</span>
              </div>
              <Progress 
                value={(usedP2pSlots / totalP2pSlots) * 100} 
                className="h-2 [&>div]:bg-green-500"
              />
              <p className="text-xs text-muted-foreground">{availableP2pSlots} vagas disponíveis</p>
            </div>
          )}
        </div>

        {/* Pro-rata price display */}
        {creditPrice > 0 && (
          <div className="p-3 rounded-lg bg-warning/10 border border-warning/20">
            <p className="text-sm">
              <span className="font-medium">Preço Mensal:</span> R$ {creditPrice.toFixed(2)}
            </p>
            <p className="text-sm text-warning">
              <span className="font-medium">Pro-rata (dia {daysUsed}):</span> R$ {proRataPrice.toFixed(2)}
              <span className="text-xs text-muted-foreground ml-2">
                ({30 - daysUsed} dias restantes)
              </span>
            </p>
          </div>
        )}

        {/* View mode tabs */}
        <div className="flex gap-2">
          <Button
            variant={viewMode === 'view' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('view')}
          >
            <Users className="h-4 w-4 mr-1" />
            Clientes Vinculados ({serverClients.length})
          </Button>
          <Button
            variant={viewMode === 'assign' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('assign')}
            disabled={!hasAvailableSlots}
          >
            <UserPlus className="h-4 w-4 mr-1" />
            Adicionar Cliente
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, usuário ou senha..."
            value={clientSearchTerm}
            onChange={(e) => setClientSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {viewMode === 'view' ? (
          // View clients
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {getFilteredViewClients().length === 0 ? (
              <p className="text-center text-muted-foreground py-4">
                Nenhum cliente vinculado
              </p>
            ) : (
              getFilteredViewClients().map((sc) => (
                <div
                  key={sc.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card"
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "p-1.5 rounded",
                      sc.slot_type === 'iptv' ? 'bg-blue-500/10' : 'bg-green-500/10'
                    )}>
                      {sc.slot_type === 'iptv' ? (
                        <Monitor className="h-4 w-4 text-blue-500" />
                      ) : (
                        <Wifi className="h-4 w-4 text-green-500" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium">{sc.client?.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {sc.client?.login && `Usuário: ${sc.client.login}`}
                        {sc.client?.login && sc.client?.password && ' • '}
                        {sc.client?.password && `Senha: ${sc.client.password}`}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      confirm({
                        title: 'Remover cliente',
                        description: `Tem certeza que deseja remover "${sc.client?.name}" deste crédito?`,
                        confirmText: 'Remover',
                        variant: 'destructive',
                        onConfirm: () => removeClientMutation.mutate(sc.id),
                      });
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </div>
        ) : (
          // Assign clients
          <div className="space-y-3">
            {/* Slot type selector */}
            {iptvPerCredit > 0 && p2pPerCredit > 0 && (
              <div className="flex gap-2">
                <Button
                  variant={selectedSlotType === 'iptv' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedSlotType('iptv')}
                  disabled={availableIptvSlots <= 0}
                  className={selectedSlotType === 'iptv' ? 'bg-blue-500 hover:bg-blue-600' : ''}
                >
                  <Monitor className="h-4 w-4 mr-1" />
                  IPTV ({availableIptvSlots} vagas)
                </Button>
                <Button
                  variant={selectedSlotType === 'p2p' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedSlotType('p2p')}
                  disabled={availableP2pSlots <= 0}
                  className={selectedSlotType === 'p2p' ? 'bg-green-500 hover:bg-green-600' : ''}
                >
                  <Wifi className="h-4 w-4 mr-1" />
                  P2P ({availableP2pSlots} vagas)
                </Button>
              </div>
            )}

            {/* Auto-select slot type if only one available */}
            {iptvPerCredit > 0 && p2pPerCredit === 0 && (
              <p className="text-sm text-blue-500">Vinculando como IPTV</p>
            )}
            {p2pPerCredit > 0 && iptvPerCredit === 0 && (
              <p className="text-sm text-green-500">Vinculando como P2P</p>
            )}

            {/* Available clients list */}
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {getAvailableClients().length === 0 ? (
                <p className="text-center text-muted-foreground py-4">
                  {clientSearchTerm ? 'Nenhum cliente encontrado' : 'Todos os clientes já estão vinculados'}
                </p>
              ) : (
                getAvailableClients().map((client) => (
                  <div
                    key={client.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent transition-colors"
                  >
                    <div>
                      <p className="font-medium">{client.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {client.login && `Usuário: ${client.login}`}
                        {client.login && client.password && ' • '}
                        {client.password && `Senha: ${client.password}`}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => {
                        const slotType = iptvPerCredit > 0 && p2pPerCredit === 0 ? 'iptv' :
                                        p2pPerCredit > 0 && iptvPerCredit === 0 ? 'p2p' :
                                        selectedSlotType;
                        assignClientMutation.mutate({
                          client_id: client.id,
                          slot_type: slotType,
                        });
                      }}
                      disabled={assignClientMutation.isPending}
                    >
                      <UserPlus className="h-4 w-4 mr-1" />
                      Vincular
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </DialogContent>
      
      {/* Global Confirm Dialog */}
      <ConfirmDialog {...dialogProps} />
    </Dialog>
  );
}