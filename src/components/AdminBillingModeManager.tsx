import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Search, Settings, Bell, Bot, AlertTriangle, Users, RefreshCw, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Client {
  id: string;
  name: string;
  phone: string | null;
  expiration_date: string;
  billing_mode: 'manual' | 'automatic' | null;
  seller_id: string;
  profiles?: {
    full_name: string | null;
    email: string;
  };
}

interface Seller {
  id: string;
  full_name: string | null;
  email: string;
}

interface AdminBillingModeManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AdminBillingModeManager({ open, onOpenChange }: AdminBillingModeManagerProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedSeller, setSelectedSeller] = useState<string>('all');
  const [confirmSwitch, setConfirmSwitch] = useState<{ clientId: string; clientName: string; newMode: 'manual' | 'automatic' } | null>(null);

  // Fetch all sellers for filter
  const { data: sellers = [] } = useQuery({
    queryKey: ['admin-sellers-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .order('full_name');
      if (error) throw error;
      
      // Filter to only sellers (those with seller role)
      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'seller');
      
      const sellerIds = new Set(roles?.map(r => r.user_id) || []);
      return (data?.filter(p => sellerIds.has(p.id)) || []) as Seller[];
    },
    enabled: open,
  });

  // Fetch clients with billing mode
  const { data: clients = [], isLoading } = useQuery({
    queryKey: ['admin-clients-billing-mode', selectedSeller],
    queryFn: async () => {
      let query = supabase
        .from('clients')
        .select('id, name, phone, expiration_date, billing_mode, seller_id')
        .eq('is_archived', false)
        .order('name');

      if (selectedSeller !== 'all') {
        query = query.eq('seller_id', selectedSeller);
      }

      const { data: clientsData, error } = await query.limit(500);
      if (error) throw error;

      // Fetch seller profiles separately
      const sellerIds = [...new Set((clientsData || []).map(c => c.seller_id))];
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', sellerIds);

      const profilesMap = new Map((profilesData || []).map(p => [p.id, p]));

      return (clientsData || []).map(c => ({
        ...c,
        profiles: profilesMap.get(c.seller_id) || null,
      })) as Client[];
    },
    enabled: open,
  });

  // Filter clients by search
  const filteredClients = useMemo(() => {
    if (!search.trim()) return clients;
    const searchLower = search.toLowerCase();
    return clients.filter(c => 
      c.name.toLowerCase().includes(searchLower) ||
      c.phone?.includes(searchLower)
    );
  }, [clients, search]);

  // Count by mode
  const modeCounts = useMemo(() => {
    const manual = clients.filter(c => !c.billing_mode || c.billing_mode === 'manual').length;
    const automatic = clients.filter(c => c.billing_mode === 'automatic').length;
    return { manual, automatic };
  }, [clients]);

  // Switch billing mode mutation
  const switchModeMutation = useMutation({
    mutationFn: async ({ clientId, newMode }: { clientId: string; newMode: 'manual' | 'automatic' }) => {
      // If switching to manual, cancel pending reminders
      if (newMode === 'manual') {
        const { data, error: cancelError } = await supabase.rpc('cancel_client_pending_reminders', {
          p_client_id: clientId,
        });
        if (cancelError) {
          console.warn('Error cancelling reminders:', cancelError);
        } else if (data && data > 0) {
          toast.info(`${data} lembrete(s) pendente(s) cancelado(s)`);
        }
      }

      // Update the client's billing mode
      const { error } = await supabase
        .from('clients')
        .update({ billing_mode: newMode })
        .eq('id', clientId);

      if (error) throw error;
      return newMode;
    },
    onSuccess: (newMode) => {
      queryClient.invalidateQueries({ queryKey: ['admin-clients-billing-mode'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      toast.success(
        newMode === 'manual'
          ? 'Modo alterado para Manual'
          : 'Modo alterado para Automático'
      );
      setConfirmSwitch(null);
    },
    onError: (error: Error) => {
      toast.error(`Erro ao alterar modo: ${error.message}`);
    },
  });

  // Bulk update mutation
  const bulkUpdateMutation = useMutation({
    mutationFn: async ({ sellerId, newMode }: { sellerId: string; newMode: 'manual' | 'automatic' }) => {
      // Get all clients for the seller
      const { data: clientIds } = await supabase
        .from('clients')
        .select('id')
        .eq('seller_id', sellerId)
        .eq('is_archived', false);

      if (!clientIds?.length) return 0;

      // If switching to manual, cancel all pending reminders for these clients
      if (newMode === 'manual') {
        for (const client of clientIds) {
          await supabase.rpc('cancel_client_pending_reminders', {
            p_client_id: client.id,
          });
        }
      }

      // Update all clients
      const { error, count } = await supabase
        .from('clients')
        .update({ billing_mode: newMode })
        .eq('seller_id', sellerId)
        .eq('is_archived', false);

      if (error) throw error;
      return count || clientIds.length;
    },
    onSuccess: (count, { newMode }) => {
      queryClient.invalidateQueries({ queryKey: ['admin-clients-billing-mode'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      toast.success(`${count} cliente(s) alterado(s) para modo ${newMode === 'manual' ? 'Manual' : 'Automático'}`);
    },
    onError: (error: Error) => {
      toast.error(`Erro: ${error.message}`);
    },
  });

  const handleModeToggle = (client: Client) => {
    const currentMode = client.billing_mode || 'manual';
    const newMode = currentMode === 'manual' ? 'automatic' : 'manual';
    setConfirmSwitch({ clientId: client.id, clientName: client.name, newMode });
  };

  const confirmModeChange = () => {
    if (confirmSwitch) {
      switchModeMutation.mutate({ clientId: confirmSwitch.clientId, newMode: confirmSwitch.newMode });
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[95vw] sm:max-w-4xl max-h-[85vh] overflow-hidden flex flex-col p-3 sm:p-6">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Settings className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
              <span className="truncate">Gerenciar Modo de Cobrança</span>
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              Defina se cada cliente usa cobrança manual (push) ou automática (WhatsApp).
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-3 sm:space-y-4 min-h-0">
            {/* Stats */}
            <div className="grid grid-cols-2 gap-2 sm:gap-4">
              <Card className="bg-blue-500/5 border-blue-500/20">
                <CardContent className="p-2 sm:p-4">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <Bell className="h-4 w-4 sm:h-5 sm:w-5 text-blue-500 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-medium truncate">Manual</p>
                      <p className="text-lg sm:text-2xl font-bold">{modeCounts.manual}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-success/5 border-success/20">
                <CardContent className="p-2 sm:p-4">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <Bot className="h-4 w-4 sm:h-5 sm:w-5 text-success flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-medium truncate">Automático</p>
                      <p className="text-lg sm:text-2xl font-bold">{modeCounts.automatic}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Filters */}
            <div className="flex flex-col xs:flex-row gap-2 sm:gap-3">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar cliente..."
                    className="pl-9 h-9 text-sm"
                  />
                </div>
              </div>
              <Select value={selectedSeller} onValueChange={setSelectedSeller}>
                <SelectTrigger className="w-full xs:w-[180px] h-9 text-sm">
                  <SelectValue placeholder="Revendedor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {sellers.map(seller => (
                    <SelectItem key={seller.id} value={seller.id}>
                      {seller.full_name || seller.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Bulk Actions */}
            {selectedSeller !== 'all' && (
              <div className="flex flex-col xs:flex-row gap-2 p-2 sm:p-3 rounded-lg bg-muted/50">
                <span className="text-xs sm:text-sm text-muted-foreground flex items-center gap-2">
                  <Users className="h-4 w-4 flex-shrink-0" />
                  <span className="hidden xs:inline">Ações em massa:</span>
                  <span className="xs:hidden">Em massa:</span>
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1 text-blue-500 flex-1 xs:flex-none h-7 sm:h-8 text-xs"
                    onClick={() => bulkUpdateMutation.mutate({ sellerId: selectedSeller, newMode: 'manual' })}
                    disabled={bulkUpdateMutation.isPending}
                  >
                    <Bell className="h-3 w-3" />
                    Manual
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1 text-success flex-1 xs:flex-none h-7 sm:h-8 text-xs"
                    onClick={() => bulkUpdateMutation.mutate({ sellerId: selectedSeller, newMode: 'automatic' })}
                    disabled={bulkUpdateMutation.isPending}
                  >
                    <Bot className="h-3 w-3" />
                    Auto
                  </Button>
                </div>
              </div>
            )}

            {/* Client List */}
            <ScrollArea className="h-[280px] sm:h-[350px] rounded-lg border">
              {isLoading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredClients.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm p-4 text-center">
                  {search ? 'Nenhum cliente encontrado' : 'Selecione um revendedor ou busque'}
                </div>
              ) : (
                <div className="divide-y">
                  {filteredClients.map(client => {
                    const effectiveMode = client.billing_mode || 'manual';
                    return (
                      <div key={client.id} className="flex items-center justify-between p-2 sm:p-3 hover:bg-muted/30 gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                            <span className="font-medium text-sm truncate max-w-[120px] sm:max-w-none">{client.name}</span>
                            <Badge 
                              variant="outline" 
                              className={`text-[9px] sm:text-[10px] ${effectiveMode === 'automatic' 
                                ? 'bg-success/10 text-success' 
                                : 'bg-blue-500/10 text-blue-500'
                              }`}
                            >
                              {effectiveMode === 'automatic' ? <Bot className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-0.5" /> : <Bell className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-0.5" />}
                              {effectiveMode === 'automatic' ? 'Auto' : 'Manual'}
                            </Badge>
                          </div>
                          <div className="text-[10px] sm:text-xs text-muted-foreground flex flex-wrap items-center gap-1 sm:gap-2 mt-0.5">
                            {client.phone && <span className="truncate max-w-[80px]">{client.phone}</span>}
                            <span className="hidden xs:inline">•</span>
                            <span>Vence: {format(new Date(client.expiration_date + 'T12:00:00'), "dd/MM/yy", { locale: ptBR })}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                          <Label htmlFor={`mode-${client.id}`} className="text-[10px] sm:text-xs text-muted-foreground hidden xs:block">
                            {effectiveMode === 'automatic' ? 'Auto' : 'Manual'}
                          </Label>
                          <Switch
                            id={`mode-${client.id}`}
                            checked={effectiveMode === 'automatic'}
                            onCheckedChange={() => handleModeToggle(client)}
                            disabled={switchModeMutation.isPending}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>

            {/* Legend */}
            <div className="flex flex-col xs:flex-row gap-1 xs:gap-4 text-[10px] sm:text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <Bell className="h-3 w-3 text-blue-500 flex-shrink-0" />
                <span>Manual: Push de vencimento</span>
              </div>
              <div className="flex items-center gap-1">
                <Bot className="h-3 w-3 text-success flex-shrink-0" />
                <span>Automático: WhatsApp</span>
              </div>
            </div>
          </div>

          <DialogFooter className="flex-shrink-0 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog */}
      <AlertDialog open={!!confirmSwitch} onOpenChange={() => setConfirmSwitch(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Confirmar Alteração
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Alterar <strong>{confirmSwitch?.clientName}</strong> para{' '}
                <strong>{confirmSwitch?.newMode === 'automatic' ? 'Modo Automático' : 'Modo Manual'}</strong>?
              </p>
              {confirmSwitch?.newMode === 'manual' ? (
                <p className="text-sm">
                  Lembretes pendentes serão cancelados e o revendedor receberá notificações push.
                </p>
              ) : (
                <p className="text-sm">
                  Notificações push serão desativadas. O revendedor poderá criar lembretes via WhatsApp.
                </p>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmModeChange} disabled={switchModeMutation.isPending}>
              {switchModeMutation.isPending ? 'Alterando...' : 'Confirmar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
