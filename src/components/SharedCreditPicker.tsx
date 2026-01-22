import { useState, useCallback, useMemo, memo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabaseExternal as supabase } from '@/lib/supabase-external';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Users, Monitor, Wifi, Calendar, Sparkles, Check, X, Loader2, Trash2 } from 'lucide-react';
import { differenceInDays, endOfMonth } from 'date-fns';
import { useCrypto } from '@/hooks/useCrypto';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
interface SharedCreditPickerProps {
  sellerId: string;
  category: string;
  serverId?: string; // Filter by selected server
  planDurationDays?: number; // Filter by plan duration (30, 90, 180, 365)
  onSelect: (selection: SharedCreditSelection | null) => void;
  selectedCredit: SharedCreditSelection | null;
}

export interface SharedCreditSelection {
  serverId: string;
  serverName: string;
  panelUrl?: string;
  slotType: 'iptv' | 'p2p';
  proRataPrice: number;
  fullPrice: number;
  remainingDays: number;
  existingClients: string[];
  // Shared credentials from existing client (decrypted for display)
  sharedLogin?: string;
  sharedPassword?: string;
  // Original encrypted credentials (to use when saving - avoids re-encryption issues)
  encryptedLogin?: string;
  encryptedPassword?: string;
  // Expiration date from existing clients
  expirationDate?: string;
}

interface ServerWithCredits {
  id: string;
  name: string;
  iptv_per_credit: number;
  p2p_per_credit: number;
  credit_price: number;
  panel_url: string | null;
}

interface ClientOnServer {
  id: string;
  name: string;
  login: string | null;
  password: string | null;
  server_id: string;
  category: string | null;
  expiration_date: string;
}

// Calculate pro-rata price based on remaining days
// AUDIT FIX: Precise calculation with safe numeric handling
const calculateProRataPrice = (monthlyPrice: number): { price: number; remainingDays: number } => {
  const safePrice = Number(monthlyPrice) || 0;
  if (safePrice <= 0) return { price: 0, remainingDays: 0 };
  
  const today = new Date();
  today.setHours(12, 0, 0, 0); // Normalize to noon
  const monthEnd = endOfMonth(today);
  monthEnd.setHours(12, 0, 0, 0);
  
  const remainingDays = differenceInDays(monthEnd, today) + 1; // +1 to include today
  const totalDays = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  
  // Round to 2 decimal places for currency precision
  const price = Math.round((safePrice / totalDays) * remainingDays * 100) / 100;
  return { price: Math.max(0, price), remainingDays: Math.max(0, remainingDays) };
};

// Helper to get duration category from days
const getDurationCategory = (days: number): 'monthly' | 'quarterly' | 'semiannual' | 'annual' | null => {
  if (days <= 35) return 'monthly';
  if (days <= 95) return 'quarterly';
  if (days <= 185) return 'semiannual';
  if (days <= 370) return 'annual';
  return null;
};

// Helper to calculate remaining days from expiration date
// AUDIT FIX: Normalize to noon to avoid DST/timezone edge cases
const getRemainingDaysFromExpiration = (expirationDate: string): number => {
  if (!expirationDate) return 0;
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const expStr = expirationDate.includes('T') ? expirationDate : `${expirationDate}T12:00:00`;
  const expDate = new Date(expStr);
  expDate.setHours(12, 0, 0, 0);
  const diff = Math.round((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return diff;
};

// Extended interface to include decrypted credentials
interface ClientOnServerWithDecrypted extends ClientOnServer {
  decryptedLogin?: string;
  decryptedPassword?: string;
}

export function SharedCreditPicker({
  sellerId,
  category,
  serverId,
  planDurationDays,
  onSelect,
  selectedCredit,
}: SharedCreditPickerProps) {
  const { decrypt } = useCrypto();
  const queryClient = useQueryClient();
  const [deletingSlot, setDeletingSlot] = useState<string | null>(null);
  
  // Fetch ALL active servers (not just credit-based)
  const { data: servers = [] } = useQuery({
    queryKey: ['servers-all-for-shared', sellerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('servers')
        .select('id, name, iptv_per_credit, p2p_per_credit, credit_price, panel_url, total_screens_per_credit')
        .eq('seller_id', sellerId)
        .eq('is_active', true);
      if (error) throw error;
      return data as (ServerWithCredits & { total_screens_per_credit: number | null })[];
    },
    enabled: !!sellerId,
  });

  // Fetch clients and decrypt their credentials for proper grouping
  const { data: clientsOnServers = [] } = useQuery({
    queryKey: ['clients-on-credit-servers-decrypted', sellerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, name, login, password, server_id, category, expiration_date')
        .eq('seller_id', sellerId)
        .eq('is_archived', false)
        .not('server_id', 'is', null)
        .not('login', 'is', null);
      if (error) throw error;
      
      // Decrypt all credentials in batch for proper grouping
      const clientsWithDecrypted: ClientOnServerWithDecrypted[] = await Promise.all(
        (data || []).map(async (client) => {
          let decryptedLogin = client.login || '';
          let decryptedPassword = client.password || '';
          
          try {
            if (client.login) {
              decryptedLogin = await decrypt(client.login);
            }
            if (client.password) {
              decryptedPassword = await decrypt(client.password);
            }
          } catch (err) {
            // If decryption fails, use original (might be plain text)
            console.warn('Decryption failed for client:', client.id, err);
          }
          
          return {
            ...client,
            decryptedLogin,
            decryptedPassword,
          } as ClientOnServerWithDecrypted;
        })
      );
      
      return clientsWithDecrypted;
    },
    enabled: !!sellerId,
    staleTime: 30000, // Cache for 30 seconds to avoid repeated decryption
  });

  // Check if category matches slot type for highlighting the recommended option
  const getCategorySlotType = (): 'iptv' | 'p2p' | null => {
    if (category === 'P2P') return 'p2p';
    if (category === 'IPTV' || category === 'SSH') return 'iptv';
    return null;
  };

  const categorySlotType = getCategorySlotType();

  // GLOBAL LIMIT: Maximum 3 clients can share the same login across the entire system
  const MAX_CLIENTS_PER_LOGIN = 3;

  // Count how many times each DECRYPTED login is used GLOBALLY (across all sellers/servers)
  const getGlobalLoginUsage = (decryptedLogin: string): number => {
    return clientsOnServers.filter(c => c.decryptedLogin === decryptedLogin).length;
  };

  // Group clients by server and DECRYPTED credentials to find available slots
  const getAvailableSlots = () => {
    const slots: {
      server: ServerWithCredits & { total_screens_per_credit: number | null };
      login: string; // Keep encrypted for saving
      password: string; // Keep encrypted for saving
      decryptedLogin: string; // For display
      decryptedPassword: string; // For display
      clientNames: string[];
      iptvTotal: number;
      iptvUsed: number;
      iptvAvailable: number;
      p2pTotal: number;
      p2pUsed: number;
      p2pAvailable: number;
      expirationDate?: string;
    }[] = [];

    // Filter servers by serverId if provided
    const targetServers = serverId ? servers.filter(s => s.id === serverId) : servers;

    targetServers.forEach(server => {
      // Only process servers that have credit configuration
      if (!server.iptv_per_credit && !server.p2p_per_credit && !server.total_screens_per_credit) {
        return;
      }

      // Filter clients on this server
      const serverClients = clientsOnServers.filter(c => c.server_id === server.id);
      
      // Group by DECRYPTED login+password (each unique combo is a "credit")
      const credentialGroups = new Map<string, ClientOnServerWithDecrypted[]>();
      
      serverClients.forEach(client => {
        if (client.decryptedLogin) {
          // Use DECRYPTED credentials for grouping
          const key = `${client.decryptedLogin}|||${client.decryptedPassword || ''}`;
          const existing = credentialGroups.get(key) || [];
          existing.push(client);
          credentialGroups.set(key, existing);
        }
      });

      // Check each credential group for available slots
      credentialGroups.forEach((clients, key) => {
        const [decryptedLogin, decryptedPassword] = key.split('|||');
        
        // GLOBAL CHECK: Count ALL clients using this DECRYPTED login (not just on this server)
        const globalUsage = getGlobalLoginUsage(decryptedLogin);
        
        // If this login is already used by MAX_CLIENTS_PER_LOGIN or more, skip it entirely
        if (globalUsage >= MAX_CLIENTS_PER_LOGIN) {
          // This credential has reached the GLOBAL limit, don't show it
          return;
        }
        
        // Count used slots by type on this server
        const iptvUsed = clients.filter(c => c.category !== 'P2P').length;
        const p2pUsed = clients.filter(c => c.category === 'P2P').length;
        
        // Get total slots per type from server config
        const iptvTotal = server.iptv_per_credit || 0;
        const p2pTotal = server.p2p_per_credit || 0;
        
        // Calculate total capacity and total used on this server
        const totalCapacity = iptvTotal + p2pTotal;
        const totalUsed = iptvUsed + p2pUsed;
        
        // Also check server-specific limit
        if (totalUsed >= totalCapacity) {
          // This credential is fully used on this server
          return;
        }
        
        // Calculate remaining slots considering BOTH server limit and global limit
        const globalRemaining = MAX_CLIENTS_PER_LOGIN - globalUsage;
        
        let iptvAvailable = Math.max(0, iptvTotal - iptvUsed);
        let p2pAvailable = Math.max(0, p2pTotal - p2pUsed);
        
        // Limit available slots to not exceed global remaining
        const totalAvailable = iptvAvailable + p2pAvailable;
        if (totalAvailable > globalRemaining) {
          // Proportionally reduce available slots
          const ratio = globalRemaining / totalAvailable;
          iptvAvailable = Math.floor(iptvAvailable * ratio);
          p2pAvailable = Math.max(0, globalRemaining - iptvAvailable);
        }

        // Get expiration date from first client to match
        const expirationDate = clients[0]?.expiration_date;
        
        // Use the first client's ENCRYPTED credentials for saving (to maintain consistency)
        const firstClient = clients[0];

        // Only add if there are available slots of any type
        if (iptvAvailable > 0 || p2pAvailable > 0) {
          slots.push({
            server,
            login: firstClient.login || '', // Encrypted for saving
            password: firstClient.password || '', // Encrypted for saving
            decryptedLogin, // For display
            decryptedPassword, // For display
            clientNames: clients.map(c => c.name),
            iptvTotal,
            iptvUsed,
            iptvAvailable,
            p2pTotal,
            p2pUsed,
            p2pAvailable,
            expirationDate,
          });
        }
      });
    });

    // Sort by expiration date (oldest first - ascending order)
    slots.sort((a, b) => {
      if (!a.expirationDate && !b.expirationDate) return 0;
      if (!a.expirationDate) return 1;
      if (!b.expirationDate) return -1;
      return new Date(a.expirationDate).getTime() - new Date(b.expirationDate).getTime();
    });

    return slots;
  };

  // Get available slots and filter by plan duration if provided
  const allAvailableSlots = getAvailableSlots();
  
  // Filter by plan duration category
  const availableSlots = planDurationDays 
    ? allAvailableSlots.filter(slot => {
        if (!slot.expirationDate) return false;
        const remainingDays = getRemainingDaysFromExpiration(slot.expirationDate);
        const slotDuration = getDurationCategory(remainingDays);
        const planDuration = getDurationCategory(planDurationDays);
        return slotDuration === planDuration;
      })
    : allAvailableSlots;

  const handleSelect = useCallback(async (slot: typeof availableSlots[0], slotType: 'iptv' | 'p2p') => {
    // Credentials are already decrypted, no need to decrypt again
    const proRataCalc = calculateProRataPrice(slot.server.credit_price || 0);
    
    onSelect({
      serverId: slot.server.id,
      serverName: slot.server.name,
      panelUrl: slot.server.panel_url || undefined,
      slotType,
      proRataPrice: proRataCalc.price,
      fullPrice: slot.server.credit_price || 0,
      remainingDays: proRataCalc.remainingDays,
      existingClients: slot.clientNames,
      sharedLogin: slot.decryptedLogin,
      sharedPassword: slot.decryptedPassword,
      // Pass original encrypted credentials to use when saving (avoids re-encryption mismatch)
      encryptedLogin: slot.login,
      encryptedPassword: slot.password,
      expirationDate: slot.expirationDate,
    });
  }, [onSelect]);

  const handleDeselect = () => {
    onSelect(null);
  };

  // Delete all clients that share a specific credit (by DECRYPTED login on a server)
  const handleDeleteSlot = async (slot: typeof availableSlots[0]) => {
    const slotKey = `${slot.server.id}-${slot.decryptedLogin}`;
    setDeletingSlot(slotKey);

    try {
      // Get all client IDs sharing this DECRYPTED credential on this server
      const clientIds = clientsOnServers
        .filter(c => {
          // Match by server_id AND the DECRYPTED login
          if (c.server_id !== slot.server.id) return false;
          if (c.decryptedLogin !== slot.decryptedLogin) return false;
          // Also match password if available
          if (slot.decryptedPassword && c.decryptedPassword !== slot.decryptedPassword) return false;
          return true;
        })
        .map(c => c.id);

      if (clientIds.length === 0) {
        toast.error('Nenhum cliente encontrado para excluir');
        return;
      }
      
      // Delete the clients
      const { error } = await supabase
        .from('clients')
        .delete()
        .in('id', clientIds);

      if (error) throw error;

      toast.success(`${clientIds.length} cliente(s) excluído(s) com sucesso`);
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['clients-on-credit-servers-decrypted'] });
    } catch (error) {
      console.error('Error deleting clients:', error);
      toast.error('Erro ao excluir clientes');
    } finally {
      setDeletingSlot(null);
    }
  };

  // If no servers or no available slots, don't render
  if (servers.length === 0 || availableSlots.length === 0) {
    return null;
  }

  // Get duration label for display
  const getDurationLabel = (days: number): string => {
    const cat = getDurationCategory(days);
    switch (cat) {
      case 'monthly': return 'Mensais';
      case 'quarterly': return 'Trimestrais';
      case 'semiannual': return 'Semestrais';
      case 'annual': return 'Anuais';
      default: return '';
    }
  };

  // Group slots by duration category for organized display
  const groupSlotsByDuration = () => {
    const groups: Record<string, typeof availableSlots> = {
      monthly: [],
      quarterly: [],
      semiannual: [],
      annual: [],
      unknown: [],
    };

    availableSlots.forEach(slot => {
      if (!slot.expirationDate) {
        groups.unknown.push(slot);
        return;
      }
      const remainingDays = getRemainingDaysFromExpiration(slot.expirationDate);
      const category = getDurationCategory(remainingDays);
      if (category) {
        groups[category].push(slot);
      } else {
        groups.unknown.push(slot);
      }
    });

    return groups;
  };

  const groupedSlots = groupSlotsByDuration();

  const durationConfig = [
    { key: 'monthly', label: 'Mensais (~30 dias)', icon: '📅', color: 'blue' },
    { key: 'quarterly', label: 'Trimestrais (~90 dias)', icon: '📆', color: 'purple' },
    { key: 'semiannual', label: 'Semestrais (~180 dias)', icon: '🗓️', color: 'orange' },
    { key: 'annual', label: 'Anuais (~365 dias)', icon: '📅', color: 'green' },
  ];

  const renderSlotCard = (slot: typeof availableSlots[0], index: number) => {
    const proRataCalc = calculateProRataPrice(slot.server.credit_price);
    const totalUsed = slot.iptvUsed + slot.p2pUsed;
    const totalSlots = slot.iptvTotal + slot.p2pTotal;
    const slotKey = `${slot.server.id}-${slot.decryptedLogin}`;
    const isDeleting = deletingSlot === slotKey;

    return (
      <Card 
        key={`${slot.server.id}-${slot.decryptedLogin}-${index}`} 
        className="border-2 border-dashed border-amber-500/30 hover:border-amber-500/50 transition-colors"
      >
        <CardContent className="p-4">
          {/* Header with server name and expiration badge */}
          <div className="flex items-center justify-between mb-2">
            <p className="font-bold text-lg">{slot.server.name}</p>
            <div className="flex items-center gap-2">
              {slot.expirationDate && (
                <Badge 
                  variant="outline" 
                  className={cn(
                    "text-xs",
                    getRemainingDaysFromExpiration(slot.expirationDate) <= 7 
                      ? "border-destructive text-destructive" 
                      : "border-amber-500 text-amber-600"
                  )}
                >
                  <Calendar className="h-3 w-3 mr-1" />
                  Vence: {new Date(slot.expirationDate).toLocaleDateString('pt-BR')}
                </Badge>
              )}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    disabled={isDeleting}
                  >
                    {isDeleting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir Crédito Compartilhado</AlertDialogTitle>
                    <AlertDialogDescription>
                      Isso irá excluir <strong>{slot.clientNames.length} cliente(s)</strong> que compartilham este crédito:
                      <br /><br />
                      <span className="font-medium">{slot.clientNames.join(', ')}</span>
                      <br /><br />
                      Esta ação não pode ser desfeita.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction 
                      onClick={() => handleDeleteSlot(slot)}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Excluir {slot.clientNames.length} cliente(s)
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
          
          {/* Clients sharing this credit */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
            <Users className="h-3 w-3" />
            <span>Compartilhado com: {slot.clientNames.join(', ')}</span>
          </div>

          {/* Pricing info */}
          <div className="flex items-center justify-between mb-3 p-2 rounded bg-muted/30">
            <div className="text-xs text-muted-foreground">
              Crédito: {totalUsed} de {totalSlots} telas usadas
            </div>
            <div className="text-right">
              {slot.server.credit_price > 0 && (
                <p className="text-xs text-muted-foreground line-through">
                  R$ {slot.server.credit_price.toFixed(2)}/mês
                </p>
              )}
              <p className="text-lg font-bold text-success">
                R$ {proRataCalc.price.toFixed(2)}
              </p>
              <p className="text-xs text-amber-500">
                ({proRataCalc.remainingDays} dias restantes do mês)
              </p>
            </div>
          </div>

          {/* IPTV Slots */}
          {slot.iptvTotal > 0 && (
            <div className={cn(
              "p-3 rounded-lg border-2 mb-2",
              "border-blue-500/50 bg-blue-500/5",
              categorySlotType === 'iptv' && "ring-2 ring-blue-500 ring-offset-2"
            )}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Monitor className="h-4 w-4 text-blue-500" />
                  <span className="font-semibold text-blue-600 dark:text-blue-400">
                    IPTV / SSH
                  </span>
                  {categorySlotType === 'iptv' && (
                    <Badge variant="outline" className="text-[10px] border-blue-500 text-blue-500">
                      Recomendado
                    </Badge>
                  )}
                </div>
                <Badge 
                  variant={slot.iptvAvailable > 0 ? "default" : "secondary"}
                  className={slot.iptvAvailable > 0 ? "bg-blue-500" : ""}
                >
                  {slot.iptvAvailable} {slot.iptvAvailable === 1 ? 'vaga' : 'vagas'}
                </Badge>
              </div>
              
              <p className="text-xs text-muted-foreground mb-3">
                {slot.iptvUsed} de {slot.iptvTotal} usado(s)
              </p>

              <Button
                type="button"
                size="sm"
                disabled={slot.iptvAvailable <= 0}
                className="w-full bg-blue-500 hover:bg-blue-600 disabled:opacity-50"
                onClick={() => handleSelect(slot, 'iptv')}
              >
                <Monitor className="h-4 w-4 mr-1" />
                {slot.iptvAvailable > 0 ? 'Usar vaga IPTV' : 'Sem vagas'}
              </Button>
            </div>
          )}

          {/* P2P Slots */}
          {slot.p2pTotal > 0 && (
            <div className={cn(
              "p-3 rounded-lg border-2 mb-3",
              "border-green-500/50 bg-green-500/5",
              categorySlotType === 'p2p' && "ring-2 ring-green-500 ring-offset-2"
            )}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Wifi className="h-4 w-4 text-green-500" />
                  <span className="font-semibold text-green-600 dark:text-green-400">
                    P2P
                  </span>
                  {categorySlotType === 'p2p' && (
                    <Badge variant="outline" className="text-[10px] border-green-500 text-green-500">
                      Recomendado
                    </Badge>
                  )}
                </div>
                <Badge 
                  variant={slot.p2pAvailable > 0 ? "default" : "secondary"}
                  className={slot.p2pAvailable > 0 ? "bg-green-500" : ""}
                >
                  {slot.p2pAvailable} {slot.p2pAvailable === 1 ? 'vaga' : 'vagas'}
                </Badge>
              </div>
              
              <p className="text-xs text-muted-foreground mb-3">
                {slot.p2pUsed} de {slot.p2pTotal} usado(s)
              </p>

              <Button
                type="button"
                size="sm"
                disabled={slot.p2pAvailable <= 0}
                className="w-full bg-green-500 hover:bg-green-600 disabled:opacity-50"
                onClick={() => handleSelect(slot, 'p2p')}
              >
                <Wifi className="h-4 w-4 mr-1" />
                {slot.p2pAvailable > 0 ? 'Usar vaga P2P' : 'Sem vagas'}
              </Button>
            </div>
          )}

          <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
            <Sparkles className="h-3 w-3" />
            Credenciais serão compartilhadas automaticamente
          </p>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-amber-500" />
          <h3 className="font-semibold text-amber-600 dark:text-amber-400">
            Vagas Disponíveis em Créditos
          </h3>
        </div>
        {planDurationDays && (
          <Badge variant="outline" className="text-xs border-amber-500 text-amber-600">
            Planos {getDurationLabel(planDurationDays)}
          </Badge>
        )}
      </div>
      
      {/* Info about ordering */}
      <p className="text-xs text-muted-foreground flex items-center gap-1">
        <Calendar className="h-3 w-3" />
        {planDurationDays 
          ? 'Mostrando apenas vagas compatíveis com o plano selecionado'
          : 'Organizado por período de vencimento'}
      </p>

      {selectedCredit ? (
        <Card className="border-2 border-success bg-success/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-success/20 flex items-center justify-center">
                  <Check className="h-5 w-5 text-success" />
                </div>
                <div>
                  <p className="font-semibold">{selectedCredit.serverName}</p>
                  <p className="text-sm text-muted-foreground">
                    Vaga {selectedCredit.slotType.toUpperCase()} • Com: {selectedCredit.existingClients.join(', ')}
                  </p>
                  {selectedCredit.sharedLogin && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                      Credenciais compartilhadas serão usadas
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-lg font-bold text-success">
                    R$ {selectedCredit.proRataPrice.toFixed(2)}
                  </p>
                  <p className="text-xs text-muted-foreground flex items-center justify-end gap-1">
                    <Calendar className="h-3 w-3" />
                    {selectedCredit.remainingDays} dias restantes
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={handleDeselect}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : planDurationDays ? (
        // When plan is selected, show filtered list
        <div className="space-y-3">
          {availableSlots.map((slot, index) => renderSlotCard(slot, index))}
          {availableSlots.length === 0 && (
            <div className="text-center py-4 text-muted-foreground text-sm">
              Nenhuma vaga disponível para planos {getDurationLabel(planDurationDays).toLowerCase()}
            </div>
          )}
        </div>
      ) : (
        // When no plan is selected, show organized by duration
        <div className="space-y-4">
          {durationConfig.map(({ key, label, icon }) => {
            const slots = groupedSlots[key];
            if (slots.length === 0) return null;
            
            return (
              <div key={key} className="space-y-2">
                <div className="flex items-center gap-2 sticky top-0 bg-background py-2 z-10">
                  <span className="text-lg">{icon}</span>
                  <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">
                    {label}
                  </h4>
                  <Badge variant="secondary" className="text-xs">
                    {slots.length} {slots.length === 1 ? 'vaga' : 'vagas'}
                  </Badge>
                </div>
                <div className="space-y-3 pl-2 border-l-2 border-muted">
                  {slots.map((slot, index) => renderSlotCard(slot, index))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
