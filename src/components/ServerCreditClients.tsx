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
      <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[85vh] overflow-hidden flex flex-col p-3 sm:p-6">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Users className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
            <span className="truncate">Créditos - {serverName}</span>
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            Gerencie os clientes vinculados aos créditos deste servidor
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto -mx-3 px-3 sm:-mx-6 sm:px-6 space-y-3 sm:space-y-4">
        {/* Slot usage summary */}
        <div className="grid grid-cols-2 gap-2 sm:gap-4 p-2.5 sm:p-4 rounded-lg bg-muted/50">
          {iptvPerCredit > 0 && (
            <div className="space-y-1.5 sm:space-y-2">
              <div className="flex items-center justify-between text-xs sm:text-sm">
                <span className="flex items-center gap-1 text-blue-500">
                  <Monitor className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  <span className="hidden xs:inline">IPTV</span>
                </span>
                <span className="font-medium">{usedIptvSlots} / {totalIptvSlots}</span>
              </div>
              <Progress 
                value={(usedIptvSlots / totalIptvSlots) * 100} 
                className="h-1.5 sm:h-2 [&>div]:bg-blue-500"
              />
              <p className="text-[10px] sm:text-xs text-muted-foreground">{availableIptvSlots} vagas</p>
            </div>
          )}
          {p2pPerCredit > 0 && (
            <div className="space-y-1.5 sm:space-y-2">
              <div className="flex items-center justify-between text-xs sm:text-sm">
                <span className="flex items-center gap-1 text-green-500">
                  <Wifi className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  <span className="hidden xs:inline">P2P</span>
                </span>
                <span className="font-medium">{usedP2pSlots} / {totalP2pSlots}</span>
              </div>
              <Progress 
                value={(usedP2pSlots / totalP2pSlots) * 100} 
                className="h-1.5 sm:h-2 [&>div]:bg-green-500"
              />
              <p className="text-[10px] sm:text-xs text-muted-foreground">{availableP2pSlots} vagas</p>
            </div>
          )}
        </div>

        {/* Pro-rata price display */}
        {creditPrice > 0 && (
          <div className="p-2 sm:p-3 rounded-lg bg-warning/10 border border-warning/20">
            <p className="text-xs sm:text-sm">
              <span className="font-medium">Mensal:</span> R$ {creditPrice.toFixed(2)}
            </p>
            <p className="text-xs sm:text-sm text-warning">
              <span className="font-medium">Pro-rata (dia {daysUsed}):</span> R$ {proRataPrice.toFixed(2)}
              <span className="text-[10px] sm:text-xs text-muted-foreground ml-1 sm:ml-2">
                ({30 - daysUsed} dias)
              </span>
            </p>
          </div>
        )}

        {/* View mode tabs */}
        <div className="flex gap-1.5 sm:gap-2">
          <Button
            variant={viewMode === 'view' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('view')}
            className="h-7 sm:h-8 text-xs sm:text-sm px-2 sm:px-3"
          >
            <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1" />
            <span className="hidden xs:inline">Vinculados ({serverClients.length})</span>
            <span className="xs:hidden">({serverClients.length})</span>
          </Button>
          <Button
            variant={viewMode === 'assign' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('assign')}
            disabled={!hasAvailableSlots}
            className="h-7 sm:h-8 text-xs sm:text-sm px-2 sm:px-3"
          >
            <UserPlus className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1" />
            <span className="hidden xs:inline">Adicionar</span>
            <span className="xs:hidden">+</span>
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar..."
            value={clientSearchTerm}
            onChange={(e) => setClientSearchTerm(e.target.value)}
            className="pl-8 sm:pl-10 h-8 sm:h-9 text-sm"
          />
        </div>

        {viewMode === 'view' ? (
          // View clients
          <div className="space-y-1.5 sm:space-y-2 max-h-52 sm:max-h-64 overflow-y-auto">
            {getFilteredViewClients().length === 0 ? (
              <p className="text-center text-muted-foreground py-4 text-xs sm:text-sm">
                Nenhum cliente vinculado
              </p>
            ) : (
              getFilteredViewClients().map((sc) => (
                <div
                  key={sc.id}
                  className="flex items-center justify-between p-2 sm:p-3 rounded-lg border bg-card gap-2"
                >
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                    <div className={cn(
                      "p-1 sm:p-1.5 rounded flex-shrink-0",
                      sc.slot_type === 'iptv' ? 'bg-blue-500/10' : 'bg-green-500/10'
                    )}>
                      {sc.slot_type === 'iptv' ? (
                        <Monitor className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-500" />
                      ) : (
                        <Wifi className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-green-500" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-xs sm:text-sm truncate">{sc.client?.name}</p>
                      <p className="text-[10px] sm:text-xs text-muted-foreground truncate">
                        {sc.client?.login && `👤 ${sc.client.login}`}
                        {sc.client?.login && sc.client?.password && ' • '}
                        {sc.client?.password && `🔑 ****`}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive h-7 w-7 sm:h-8 sm:w-8 flex-shrink-0"
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
                    <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  </Button>
                </div>
              ))
            )}
          </div>
        ) : (
          // Assign clients
          <div className="space-y-2 sm:space-y-3">
            {/* Slot type selector */}
            {iptvPerCredit > 0 && p2pPerCredit > 0 && (
              <div className="flex gap-1.5 sm:gap-2">
                <Button
                  variant={selectedSlotType === 'iptv' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedSlotType('iptv')}
                  disabled={availableIptvSlots <= 0}
                  className={cn(
                    "h-7 sm:h-8 text-xs sm:text-sm px-2 sm:px-3",
                    selectedSlotType === 'iptv' ? 'bg-blue-500 hover:bg-blue-600' : ''
                  )}
                >
                  <Monitor className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1" />
                  <span className="hidden xs:inline">IPTV ({availableIptvSlots})</span>
                  <span className="xs:hidden">IPTV</span>
                </Button>
                <Button
                  variant={selectedSlotType === 'p2p' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedSlotType('p2p')}
                  disabled={availableP2pSlots <= 0}
                  className={cn(
                    "h-7 sm:h-8 text-xs sm:text-sm px-2 sm:px-3",
                    selectedSlotType === 'p2p' ? 'bg-green-500 hover:bg-green-600' : ''
                  )}
                >
                  <Wifi className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1" />
                  <span className="hidden xs:inline">P2P ({availableP2pSlots})</span>
                  <span className="xs:hidden">P2P</span>
                </Button>
              </div>
            )}

            {/* Auto-select slot type if only one available */}
            {iptvPerCredit > 0 && p2pPerCredit === 0 && (
              <p className="text-xs sm:text-sm text-blue-500">Vinculando como IPTV</p>
            )}
            {p2pPerCredit > 0 && iptvPerCredit === 0 && (
              <p className="text-xs sm:text-sm text-green-500">Vinculando como P2P</p>
            )}

            {/* Available clients list */}
            <div className="space-y-1.5 sm:space-y-2 max-h-52 sm:max-h-64 overflow-y-auto">
              {getAvailableClients().length === 0 ? (
                <p className="text-center text-muted-foreground py-4 text-xs sm:text-sm">
                  {clientSearchTerm ? 'Nenhum cliente encontrado' : 'Todos os clientes já estão vinculados'}
                </p>
              ) : (
                getAvailableClients().map((client) => (
                  <div
                    key={client.id}
                    className="flex items-center justify-between p-2 sm:p-3 rounded-lg border bg-card hover:bg-accent transition-colors gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-xs sm:text-sm truncate">{client.name}</p>
                      <p className="text-[10px] sm:text-xs text-muted-foreground truncate">
                        {client.login && `👤 ${client.login}`}
                        {client.login && client.password && ' • '}
                        {client.password && `🔑 ****`}
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
                      className="h-7 sm:h-8 text-xs sm:text-sm px-2 sm:px-3 flex-shrink-0"
                    >
                      <UserPlus className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1" />
                      <span className="hidden xs:inline">Vincular</span>
                      <span className="xs:hidden">+</span>
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
        </div>
      </DialogContent>
      
      {/* Global Confirm Dialog */}
      <ConfirmDialog {...dialogProps} />
    </Dialog>
  );
}