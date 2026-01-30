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
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Gerenciar Modo de Cobrança
            </DialogTitle>
            <DialogDescription>
              Defina se cada cliente usa cobrança manual (push) ou automática (WhatsApp). 
              Apenas você pode alterar essa configuração.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Stats */}
            <div className="grid grid-cols-2 gap-4">
              <Card className="bg-blue-500/5 border-blue-500/20">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <Bell className="h-5 w-5 text-blue-500" />
                    <div>
                      <p className="text-sm font-medium">Modo Manual</p>
                      <p className="text-2xl font-bold">{modeCounts.manual}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-success/5 border-success/20">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <Bot className="h-5 w-5 text-success" />
                    <div>
                      <p className="text-sm font-medium">Modo Automático</p>
                      <p className="text-2xl font-bold">{modeCounts.automatic}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Filters */}
            <div className="flex gap-3">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar cliente por nome ou telefone..."
                    className="pl-9"
                  />
                </div>
              </div>
              <Select value={selectedSeller} onValueChange={setSelectedSeller}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Filtrar por revendedor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os revendedores</SelectItem>
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
              <div className="flex gap-2 p-3 rounded-lg bg-muted/50">
                <span className="text-sm text-muted-foreground flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Ações em massa para este revendedor:
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 text-blue-500"
                  onClick={() => bulkUpdateMutation.mutate({ sellerId: selectedSeller, newMode: 'manual' })}
                  disabled={bulkUpdateMutation.isPending}
                >
                  <Bell className="h-3 w-3" />
                  Todos Manual
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 text-success"
                  onClick={() => bulkUpdateMutation.mutate({ sellerId: selectedSeller, newMode: 'automatic' })}
                  disabled={bulkUpdateMutation.isPending}
                >
                  <Bot className="h-3 w-3" />
                  Todos Automático
                </Button>
              </div>
            )}

            {/* Client List */}
            <ScrollArea className="h-[400px] rounded-lg border">
              {isLoading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredClients.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  {search ? 'Nenhum cliente encontrado' : 'Selecione um revendedor ou busque um cliente'}
                </div>
              ) : (
                <div className="divide-y">
                  {filteredClients.map(client => {
                    const effectiveMode = client.billing_mode || 'manual';
                    return (
                      <div key={client.id} className="flex items-center justify-between p-3 hover:bg-muted/30">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium truncate">{client.name}</span>
                            <Badge 
                              variant="outline" 
                              className={effectiveMode === 'automatic' 
                                ? 'bg-success/10 text-success text-[10px]' 
                                : 'bg-blue-500/10 text-blue-500 text-[10px]'
                              }
                            >
                              {effectiveMode === 'automatic' ? <Bot className="h-3 w-3 mr-1" /> : <Bell className="h-3 w-3 mr-1" />}
                              {effectiveMode === 'automatic' ? 'Auto' : 'Manual'}
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground flex items-center gap-2">
                            {client.phone && <span>{client.phone}</span>}
                            <span>•</span>
                            <span>Vence: {format(new Date(client.expiration_date + 'T12:00:00'), "dd/MM/yyyy", { locale: ptBR })}</span>
                            {client.profiles && (
                              <>
                                <span>•</span>
                                <span>{client.profiles.full_name || client.profiles.email}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Label htmlFor={`mode-${client.id}`} className="text-xs text-muted-foreground">
                            {effectiveMode === 'automatic' ? 'Automático' : 'Manual'}
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
            <div className="flex gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <Bell className="h-3 w-3 text-blue-500" />
                <span>Manual: Notificações push de vencimento</span>
              </div>
              <div className="flex items-center gap-1">
                <Bot className="h-3 w-3 text-success" />
                <span>Automático: Cobrança via WhatsApp</span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
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
