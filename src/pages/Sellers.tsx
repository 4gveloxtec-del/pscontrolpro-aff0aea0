import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Navigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { toast } from 'sonner';
import { Search, UserCog, Calendar, Plus, Shield, Trash2, Key, UserPlus, Copy, Check, RefreshCw, FlaskConical, Users, MessageCircle, Send, RotateCcw, Loader2, Zap, CheckCircle, XCircle } from 'lucide-react';
import { format, addDays, isBefore, startOfToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface WhatsAppTemplate {
  id: string;
  name: string;
  type: string;
  message: string;
}

interface Seller {
  id: string;
  email: string;
  full_name: string | null;
  whatsapp: string | null;
  subscription_expires_at: string | null;
  is_permanent: boolean;
  is_active: boolean;
  created_at: string;
  client_count?: number;
  plan_type?: string | null;
  plan_price?: number | null;
}

type PlanType = 'manual' | 'whatsapp';

type FilterType = 'all' | 'active' | 'expired';

export default function Sellers() {
  const { isAdmin, session } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [tempPasswordDialog, setTempPasswordDialog] = useState<{ 
    open: boolean; 
    password: string; 
    email: string;
    whatsapp: string;
    name: string;
    sendingWhatsApp: boolean;
  }>({ 
    open: false, 
    password: '', 
    email: '',
    whatsapp: '',
    name: '',
    sendingWhatsApp: false
  });
  const [copiedPassword, setCopiedPassword] = useState(false);
  
  // Confirmation dialogs state
  const [renewDialog, setRenewDialog] = useState<{ open: boolean; sellerId: string; sellerName: string; days: number; planType: PlanType; currentPlanType?: string }>({
    open: false,
    sellerId: '',
    sellerName: '',
    days: 30,
    planType: 'manual'
  });
  const [permanentDialog, setPermanentDialog] = useState<{ open: boolean; sellerId: string; sellerName: string; isPermanent: boolean }>({
    open: false,
    sellerId: '',
    sellerName: '',
    isPermanent: false
  });
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; sellerId: string; sellerName: string }>({
    open: false,
    sellerId: '',
    sellerName: ''
  });
  const [messageDialog, setMessageDialog] = useState<{ 
    open: boolean; 
    seller: Seller | null;
    selectedTemplate: string;
    message: string;
    sendingApi: boolean;
    apiStatus: 'idle' | 'sending' | 'success' | 'error';
    apiError: string;
  }>({
    open: false,
    seller: null,
    selectedTemplate: '',
    message: '',
    sendingApi: false,
    apiStatus: 'idle',
    apiError: ''
  });

  // Create seller form
  const [newSellerEmail, setNewSellerEmail] = useState('');
  const [newSellerName, setNewSellerName] = useState('');
  const [newSellerWhatsapp, setNewSellerWhatsapp] = useState('');
  const [newSellerDays, setNewSellerDays] = useState('30');
  const [newSellerPlanType, setNewSellerPlanType] = useState<PlanType>('manual');

  // Quick role fix (when someone was created as admin by mistake)
  const [roleFixEmail, setRoleFixEmail] = useState('');

  const setUserRoleMutation = useMutation({
    mutationFn: async (payload: { email?: string; user_id?: string; role: 'admin' | 'seller' | 'user' }) => {
      const { data: result, error } = await supabase.functions.invoke('set-user-role', {
        body: payload,
      });

      if (error) throw error;
      if (result?.error) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sellers'] });
      queryClient.invalidateQueries({ queryKey: ['pending-users'] });
      toast.success('Permissão atualizada!');
      setRoleFixEmail('');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const resetTrialMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { data: result, error } = await supabase.functions.invoke('reset-trial', {
        body: { user_id: userId },
      });

      if (error) throw error;
      if (result?.error) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sellers'] });
      queryClient.invalidateQueries({ queryKey: ['pending-users'] });
      toast.success('Período de teste reiniciado! (5 dias a partir de hoje)');
    },
    onError: (error: Error) => {
      toast.error('Erro ao resetar teste: ' + error.message);
    },
  });

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  // Fetch all users with their roles
  const { data: allUsersData = { sellers: [], pendingUsers: [] }, isLoading } = useQuery({
    queryKey: ['sellers', 'pending-users'],
    queryFn: async () => {
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;

      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id, role');

      const roleMap: Record<string, string> = {};
      roles?.forEach(r => {
        roleMap[r.user_id] = r.role;
      });

      const adminIds = roles?.filter(r => r.role === 'admin').map(r => r.user_id) || [];
      const sellerIds = roles?.filter(r => r.role === 'seller').map(r => r.user_id) || [];
      // Use string comparison for 'user' role since DB type might not include it yet
      const userIds = roles?.filter(r => (r.role as string) === 'user').map(r => r.user_id) || [];
      
      // Get client counts for each seller
      const { data: clientCounts } = await supabase
        .from('clients')
        .select('seller_id')
        .eq('is_archived', false);

      const countMap: Record<string, number> = {};
      clientCounts?.forEach(c => {
        countMap[c.seller_id] = (countMap[c.seller_id] || 0) + 1;
      });
      
      const allProfiles = profiles as Seller[];
      
      // Sellers (revendedores ativos)
      const sellers = allProfiles
        .filter(p => sellerIds.includes(p.id))
        .map(p => ({ ...p, client_count: countMap[p.id] || 0, userRole: 'seller' as const }));
      
      // Pending users (aguardando aprovação)
      const pendingUsers = allProfiles
        .filter(p => userIds.includes(p.id))
        .map(p => ({ ...p, client_count: 0, userRole: 'user' as const }));
      
      return { sellers, pendingUsers };
    },
  });

  const { sellers, pendingUsers } = allUsersData;

  // Fetch admin templates for sellers
  const { data: sellerTemplates = [] } = useQuery({
    queryKey: ['admin-seller-templates', session?.user?.id],
    queryFn: async () => {
      if (!session?.user?.id) return [];
      const { data, error } = await supabase
        .from('whatsapp_templates')
        .select('*')
        .eq('seller_id', session.user.id)
        .like('name', 'Vendedor%')
        .order('name');
      if (error) throw error;
      return data as WhatsAppTemplate[];
    },
    enabled: !!session?.user?.id,
  });

  // Fetch admin profile for PIX key
  const { data: adminProfile } = useQuery({
    queryKey: ['admin-profile', session?.user?.id],
    queryFn: async () => {
      if (!session?.user?.id) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('pix_key, company_name')
        .eq('id', session.user.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!session?.user?.id,
  });

  // Fetch app monthly price
  const { data: appPrice } = useQuery({
    queryKey: ['app-monthly-price'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'app_monthly_price')
        .single();
      if (error) return '25';
      return data?.value || '25';
    },
  });

  const createSellerMutation = useMutation({
    mutationFn: async (data: { email: string; full_name: string; whatsapp?: string; subscription_days: number; plan_type?: string }) => {
      const { data: result, error } = await supabase.functions.invoke('create-seller', {
        body: data,
        headers: { Authorization: `Bearer ${session?.access_token}` }
      });

      if (error) throw error;
      if (result.error) throw new Error(result.error);
      
      return result;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['sellers'] });
      setCreateDialogOpen(false);
      setNewSellerEmail('');
      setNewSellerName('');
      setNewSellerWhatsapp('');
      setNewSellerDays('30');
      setNewSellerPlanType('manual');
      
      setTempPasswordDialog({
        open: true,
        password: data.tempPassword,
        email: data.email,
        whatsapp: newSellerWhatsapp,
        name: newSellerName || data.email.split('@')[0],
        sendingWhatsApp: false
      });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (sellerId: string) => {
      const { data: result, error } = await supabase.functions.invoke('change-seller-password', {
        body: { seller_id: sellerId },
        headers: { Authorization: `Bearer ${session?.access_token}` }
      });

      if (error) throw error;
      if (result.error) throw new Error(result.error);
      
      return result;
    },
    onSuccess: (data) => {
      const seller = sellers.find(s => s.id === data.seller_id);
      setTempPasswordDialog({
        open: true,
        password: data.tempPassword,
        email: seller?.email || '',
        whatsapp: seller?.whatsapp || '',
        name: seller?.full_name || seller?.email.split('@')[0] || '',
        sendingWhatsApp: false
      });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Helper to determine plan period based on days
  const getPlanPeriod = (days: number): string => {
    if (days <= 35) return 'mensal';
    if (days <= 95) return 'trimestral';
    if (days <= 185) return 'semestral';
    if (days <= 370) return 'anual';
    return 'vitalicio';
  };

  const updateExpirationMutation = useMutation({
    mutationFn: async ({ id, days, planType }: { id: string; days: number; planType?: PlanType }) => {
      const seller = sellers.find(s => s.id === id);
      if (!seller) throw new Error('Vendedor não encontrado');

      const baseDate = seller.subscription_expires_at 
        ? new Date(seller.subscription_expires_at)
        : new Date();
      
      const newDate = addDays(baseDate, days);

      const updateData: { subscription_expires_at: string; plan_type?: string; plan_period?: string } = { 
        subscription_expires_at: newDate.toISOString(),
        plan_period: getPlanPeriod(days)
      };
      
      if (planType) {
        updateData.plan_type = planType;
      }

      const { error } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sellers'] });
      toast.success('Assinatura atualizada!');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const togglePermanentMutation = useMutation({
    mutationFn: async ({ id, is_permanent }: { id: string; is_permanent: boolean }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ is_permanent })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sellers'] });
      toast.success('Status atualizado!');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const deleteSellerMutation = useMutation({
    mutationFn: async (id: string) => {
      // Deactivate the seller (we can't delete auth users from client)
      const { error } = await supabase
        .from('profiles')
        .update({ is_active: false })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sellers'] });
      toast.success('Vendedor desativado!');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const handleCreateSeller = (e: React.FormEvent) => {
    e.preventDefault();
    createSellerMutation.mutate({
      email: newSellerEmail,
      full_name: newSellerName,
      whatsapp: newSellerWhatsapp || undefined,
      subscription_days: parseInt(newSellerDays),
      plan_type: newSellerPlanType
    });
  };

  const handleCreateTestSeller = () => {
    const timestamp = Date.now();
    createSellerMutation.mutate({
      email: `teste${timestamp}@teste.com`,
      full_name: `Vendedor Teste ${timestamp.toString().slice(-4)}`,
      subscription_days: 3
    });
  };

  const copyPassword = () => {
    navigator.clipboard.writeText(tempPasswordDialog.password);
    setCopiedPassword(true);
    toast.success('Senha copiada!');
    setTimeout(() => setCopiedPassword(false), 2000);
  };

  const replaceSellerVariables = (template: string, seller: Seller) => {
    const expirationDate = seller.subscription_expires_at 
      ? format(new Date(seller.subscription_expires_at), "dd/MM/yyyy")
      : 'Não definido';
    
    return template
      .replace(/{nome}/g, seller.full_name || seller.email.split('@')[0])
      .replace(/{email}/g, seller.email)
      .replace(/{whatsapp}/g, seller.whatsapp || 'Não informado')
      .replace(/{vencimento}/g, expirationDate)
      .replace(/{pix}/g, adminProfile?.pix_key || 'Não configurado')
      .replace(/{empresa}/g, adminProfile?.company_name || '')
      .replace(/{valor}/g, `R$ ${appPrice || '25'},00`);
  };

  const handleOpenMessageDialog = (seller: Seller) => {
    setMessageDialog({
      open: true,
      seller,
      selectedTemplate: '',
      message: '',
      sendingApi: false,
      apiStatus: 'idle',
      apiError: ''
    });
  };

  const handleTemplateSelect = (templateId: string) => {
    const template = sellerTemplates.find(t => t.id === templateId);
    if (template && messageDialog.seller) {
      const processedMessage = replaceSellerVariables(template.message, messageDialog.seller);
      setMessageDialog(prev => ({
        ...prev,
        selectedTemplate: templateId,
        message: processedMessage
      }));
    }
  };

  const handleSendWhatsApp = () => {
    if (!messageDialog.seller?.whatsapp || !messageDialog.message) {
      toast.error('WhatsApp ou mensagem não disponível');
      return;
    }

    const phone = messageDialog.seller.whatsapp.replace(/\D/g, '');
    const encodedMessage = encodeURIComponent(messageDialog.message);
    window.open(`https://wa.me/${phone}?text=${encodedMessage}`, '_blank');
    
    setMessageDialog({ open: false, seller: null, selectedTemplate: '', message: '', sendingApi: false, apiStatus: 'idle', apiError: '' });
    toast.success('WhatsApp aberto!');
  };

  const handleSendWhatsAppApi = async () => {
    if (!messageDialog.seller?.whatsapp || !messageDialog.message) {
      toast.error('WhatsApp ou mensagem não disponível');
      return;
    }

    setMessageDialog(prev => ({ ...prev, sendingApi: true, apiStatus: 'sending', apiError: '' }));

    try {
      const selectedTemplate = sellerTemplates.find(t => t.id === messageDialog.selectedTemplate);
      
      const { data, error } = await supabase.functions.invoke('send-reseller-message', {
        body: {
          reseller_id: messageDialog.seller.id,
          reseller_name: messageDialog.seller.full_name || messageDialog.seller.email,
          reseller_phone: messageDialog.seller.whatsapp,
          message: messageDialog.message,
          template_name: selectedTemplate?.name || null
        }
      });

      if (error) {
        throw error;
      }

      if (data?.success) {
        setMessageDialog(prev => ({ ...prev, sendingApi: false, apiStatus: 'success' }));
        toast.success('Mensagem enviada via WhatsApp API!');
        
        // Close dialog after 2 seconds
        setTimeout(() => {
          setMessageDialog({ open: false, seller: null, selectedTemplate: '', message: '', sendingApi: false, apiStatus: 'idle', apiError: '' });
        }, 2000);
      } else {
        throw new Error(data?.error || 'Erro ao enviar mensagem');
      }
    } catch (error: any) {
      console.error('Error sending via API:', error);
      setMessageDialog(prev => ({ 
        ...prev, 
        sendingApi: false, 
        apiStatus: 'error', 
        apiError: error.message || 'Erro ao enviar mensagem' 
      }));
      toast.error('Erro ao enviar: ' + (error.message || 'Erro desconhecido'));
    }
  };

  const copyMessage = () => {
    navigator.clipboard.writeText(messageDialog.message);
    toast.success('Mensagem copiada!');
  };

  const today = startOfToday();

  const getSellerStatus = (seller: Seller) => {
    if (!seller.is_active) return 'inactive';
    if (seller.is_permanent) return 'permanent';
    if (!seller.subscription_expires_at) return 'expired';
    return isBefore(new Date(seller.subscription_expires_at), today) ? 'expired' : 'active';
  };

  const filteredSellers = sellers.filter((seller) => {
    if (!seller.is_active) return false;

    const searchLower = search.toLowerCase();
    const matchesSearch =
      (seller.full_name || '').toLowerCase().includes(searchLower) ||
      seller.email.toLowerCase().includes(searchLower);

    if (!matchesSearch) return false;

    const status = getSellerStatus(seller);
    switch (filter) {
      case 'active':
        return status === 'active' || status === 'permanent';
      case 'expired':
        return status === 'expired';
      default:
        return true;
    }
  });

  const statusColors = {
    active: 'border-l-success',
    expired: 'border-l-destructive',
    permanent: 'border-l-primary',
    inactive: 'border-l-muted',
  };

  const statusBadges = {
    active: 'bg-success/10 text-success',
    expired: 'bg-destructive/10 text-destructive',
    permanent: 'bg-primary/10 text-primary',
    inactive: 'bg-muted text-muted-foreground',
  };

  const statusLabels = {
    active: 'Ativo',
    expired: 'Expirado',
    permanent: 'Permanente',
    inactive: 'Inativo',
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Vendedores</h1>
          <p className="text-muted-foreground">Gerencie os vendedores do sistema</p>
        </div>

        <div className="flex gap-2">
          <Button 
            variant="outline" 
            className="gap-2"
            onClick={handleCreateTestSeller}
            disabled={createSellerMutation.isPending}
          >
            <FlaskConical className="h-4 w-4" />
            <span className="hidden sm:inline">Teste 3 dias</span>
          </Button>
          
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <UserPlus className="h-4 w-4" />
                Novo Vendedor
              </Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar Novo Vendedor</DialogTitle>
              <DialogDescription>
                Uma senha temporária será gerada automaticamente
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateSeller} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="seller-email">Email *</Label>
                <Input
                  id="seller-email"
                  type="email"
                  value={newSellerEmail}
                  onChange={(e) => setNewSellerEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="seller-name">Nome Completo *</Label>
                <Input
                  id="seller-name"
                  value={newSellerName}
                  onChange={(e) => setNewSellerName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="seller-whatsapp">WhatsApp</Label>
                <Input
                  id="seller-whatsapp"
                  value={newSellerWhatsapp}
                  onChange={(e) => setNewSellerWhatsapp(e.target.value)}
                  placeholder="+55 11 99999-9999"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="seller-days">Dias de Assinatura</Label>
                <Input
                  id="seller-days"
                  type="number"
                  min="1"
                  value={newSellerDays}
                  onChange={(e) => setNewSellerDays(e.target.value)}
                />
              </div>
              <div className="space-y-3">
                <Label className="text-base">Tipo de Plano</Label>
                <div className="grid gap-2">
                  <div 
                    className={cn(
                      "p-3 border-2 rounded-lg cursor-pointer transition-all",
                      newSellerPlanType === 'manual' 
                        ? "border-primary bg-primary/5" 
                        : "border-muted hover:border-muted-foreground/50"
                    )}
                    onClick={() => setNewSellerPlanType('manual')}
                  >
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "w-3 h-3 rounded-full border-2",
                        newSellerPlanType === 'manual' ? "border-primary bg-primary" : "border-muted-foreground"
                      )} />
                      <span className="font-medium text-sm">📱 Plano Manual</span>
                    </div>
                    <p className="text-xs text-muted-foreground ml-5">Sem API WhatsApp</p>
                  </div>
                  <div 
                    className={cn(
                      "p-3 border-2 rounded-lg cursor-pointer transition-all",
                      newSellerPlanType === 'whatsapp' 
                        ? "border-success bg-success/5" 
                        : "border-muted hover:border-muted-foreground/50"
                    )}
                    onClick={() => setNewSellerPlanType('whatsapp')}
                  >
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "w-3 h-3 rounded-full border-2",
                        newSellerPlanType === 'whatsapp' ? "border-success bg-success" : "border-muted-foreground"
                      )} />
                      <span className="font-medium text-sm text-success">🚀 Plano WhatsApp</span>
                    </div>
                    <p className="text-xs text-muted-foreground ml-5">Com API + envio automático</p>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={createSellerMutation.isPending}>
                  {createSellerMutation.isPending ? 'Criando...' : 'Criar Vendedor'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterType)}>
          <TabsList>
            <TabsTrigger value="all">Todos ({sellers.filter(s => s.is_active).length})</TabsTrigger>
            <TabsTrigger value="active">Ativos</TabsTrigger>
            <TabsTrigger value="expired">Expirados</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Quick role fix */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1 space-y-2">
              <Label htmlFor="role-fix-email">Corrigir permissão (se virou ADM por engano)</Label>
              <Input
                id="role-fix-email"
                type="email"
                placeholder="email@exemplo.com"
                value={roleFixEmail}
                onChange={(e) => setRoleFixEmail(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Digite o email do usuário e defina como Vendedor. (Isso corrige casos como o Sandel.)
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={!roleFixEmail || setUserRoleMutation.isPending}
                onClick={() =>
                  setUserRoleMutation.mutate({
                    email: roleFixEmail,
                    role: 'seller',
                  })
                }
              >
                {setUserRoleMutation.isPending ? 'Ajustando...' : 'Definir como Vendedor'}
              </Button>
              <Button
                variant="secondary"
                disabled={!roleFixEmail || setUserRoleMutation.isPending}
                onClick={() =>
                  setUserRoleMutation.mutate({
                    email: roleFixEmail,
                    role: 'admin',
                  })
                }
              >
                Definir como ADM
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pending Users Section - Users awaiting approval */}
      {pendingUsers.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-warning/30" />
            <span className="text-sm font-semibold text-warning px-3 py-1 bg-warning/10 rounded-full">
              ⏳ {pendingUsers.length} Usuário(s) Aguardando Aprovação
            </span>
            <div className="h-px flex-1 bg-warning/30" />
          </div>
          
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pendingUsers.map((user) => (
              <Card key={user.id} className="border-warning/50 bg-warning/5">
                <CardContent className="p-4">
                  <div className="space-y-3">
                    <div>
                      <h4 className="font-semibold truncate">{user.full_name || user.email.split('@')[0]}</h4>
                      <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                      {user.whatsapp && (
                        <p className="text-xs text-muted-foreground">{user.whatsapp}</p>
                      )}
                    </div>
                    <div className="flex flex-col gap-2">
                      <Button
                        size="sm"
                        className="w-full bg-success hover:bg-success/90"
                        disabled={setUserRoleMutation.isPending}
                        onClick={() => setUserRoleMutation.mutate({ user_id: user.id, role: 'seller' })}
                      >
                        ✓ Aprovar como Vendedor
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full gap-1"
                        disabled={resetTrialMutation.isPending}
                        onClick={() => resetTrialMutation.mutate(user.id)}
                      >
                        <RotateCcw className={`h-3 w-3 ${resetTrialMutation.isPending ? 'animate-spin' : ''}`} />
                        Reiniciar Teste (5 dias)
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Sellers List */}
      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-4">
                <div className="h-6 bg-muted rounded w-1/3 mb-2" />
                <div className="h-4 bg-muted rounded w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredSellers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <UserCog className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhum vendedor encontrado</h3>
            <p className="text-muted-foreground text-center">
              {search ? 'Tente ajustar sua busca' : 'Crie seu primeiro vendedor clicando no botão acima'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredSellers.map((seller) => {
            const status = getSellerStatus(seller);
            return (
              <Card
                key={seller.id}
                className={cn(
                  'border-l-4 transition-all duration-200 hover:shadow-lg animate-slide-up',
                  statusColors[status]
                )}
              >
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="font-semibold text-lg">
                          {seller.full_name || seller.email.split('@')[0]}
                        </h3>
                        <span className={cn('text-xs px-2 py-0.5 rounded-full', statusBadges[status])}>
                          {statusLabels[status]}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">{seller.email}</p>
                      {seller.whatsapp && (
                        <p className="text-sm text-muted-foreground">{seller.whatsapp}</p>
                      )}
                      <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                        <Users className="h-3.5 w-3.5" />
                        {seller.client_count || 0} clientes
                      </p>
                      <p className={cn(
                        "text-xs px-2 py-0.5 rounded-full inline-flex items-center gap-1 mt-1 w-fit",
                        seller.plan_type === 'whatsapp' ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
                      )}>
                        {seller.plan_type === 'whatsapp' ? '🚀 WhatsApp' : '📱 Manual'}
                      </p>
                      {seller.subscription_expires_at && !seller.is_permanent && (
                        <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                          <Calendar className="h-3.5 w-3.5" />
                          Expira: {format(new Date(seller.subscription_expires_at), "dd 'de' MMM, yyyy", { locale: ptBR })}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {/* WhatsApp Button */}
                      {seller.whatsapp && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1 text-success hover:text-success"
                          onClick={() => handleOpenMessageDialog(seller)}
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                          WhatsApp
                        </Button>
                      )}
                      
                      {/* Renovar Button with Select */}
                      <div className="flex items-center gap-1">
                        <Select
                          disabled={seller.is_permanent}
                          onValueChange={(value) => {
                            const days = parseInt(value);
                            setRenewDialog({
                              open: true,
                              sellerId: seller.id,
                              sellerName: seller.full_name || seller.email,
                              days,
                              planType: (seller.plan_type as PlanType) || 'manual',
                              currentPlanType: seller.plan_type || 'manual'
                            });
                          }}
                        >
                          <SelectTrigger className="h-8 w-[140px]" disabled={seller.is_permanent}>
                            <RefreshCw className="h-3.5 w-3.5 mr-1" />
                            <SelectValue placeholder="Renovar" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="5">+5 dias</SelectItem>
                            <SelectItem value="30">+1 mês (30 dias)</SelectItem>
                            <SelectItem value="60">+2 meses</SelectItem>
                            <SelectItem value="90">+3 meses</SelectItem>
                            <SelectItem value="180">+6 meses</SelectItem>
                            <SelectItem value="365">+1 ano</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        variant={seller.is_permanent ? 'secondary' : 'outline'}
                        size="sm"
                        onClick={() => setPermanentDialog({
                          open: true,
                          sellerId: seller.id,
                          sellerName: seller.full_name || seller.email,
                          isPermanent: !seller.is_permanent
                        })}
                      >
                        <Shield className="h-3.5 w-3.5 mr-1" />
                        {seller.is_permanent ? 'Remover Permanente' : 'Permanente'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (confirm(`Gerar nova senha temporária para ${seller.email}?`)) {
                            changePasswordMutation.mutate(seller.id);
                          }
                        }}
                      >
                        <Key className="h-3.5 w-3.5 mr-1" />
                        Nova Senha
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setDeleteDialog({
                          open: true,
                          sellerId: seller.id,
                          sellerName: seller.full_name || seller.email
                        })}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Temp Password Dialog */}
      <Dialog open={tempPasswordDialog.open} onOpenChange={(open) => !open && setTempPasswordDialog({ open: false, password: '', email: '', whatsapp: '', name: '', sendingWhatsApp: false })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Senha Temporária Gerada</DialogTitle>
            <DialogDescription>
              Envie esta senha para o revendedor via WhatsApp junto com o link do aplicativo atualizado.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground mb-1">Revendedor:</p>
              <p className="font-medium">{tempPasswordDialog.name}</p>
              <p className="text-sm text-muted-foreground">{tempPasswordDialog.email}</p>
            </div>
            <div className="p-3 bg-primary/10 rounded-lg">
              <p className="text-sm text-muted-foreground mb-1">Senha Temporária:</p>
              <div className="flex items-center gap-2">
                <code className="text-lg font-mono font-bold text-primary">
                  {tempPasswordDialog.password}
                </code>
                <Button variant="ghost" size="icon" onClick={copyPassword}>
                  {copiedPassword ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              O revendedor será obrigado a alterar esta senha no primeiro acesso.
            </p>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            {tempPasswordDialog.whatsapp && (
              <Button 
                variant="default" 
                className="w-full sm:w-auto gap-2"
                onClick={() => {
                  const appLink = 'https://stream-manager-hub.lovable.app';
                  const message = `🚀 *Atualização do Aplicativo de Gerenciamento*

Olá, ${tempPasswordDialog.name}! 

Temos ótimas novidades! Lançamos uma *versão atualizada* do aplicativo com melhorias incríveis:

✅ *Envio Automático de Mensagens via WhatsApp* - Agora o sistema envia mensagens automaticamente para seus clientes (avisos de vencimento, cobrança, etc.)
✅ Interface mais rápida e moderna
✅ Novos recursos de gerenciamento

📱 *Link do Aplicativo Atualizado:*
${appLink}

🔐 *Suas Credenciais de Acesso:*
• Email: ${tempPasswordDialog.email}
• Senha temporária: ${tempPasswordDialog.password}

⚠️ *Importante:* Como fizemos o backup dos dados, sua senha anterior não funciona mais. Use a senha temporária acima para acessar. No primeiro login, você será solicitado a criar uma nova senha.

Qualquer dúvida, estou à disposição!`;
                  
                  const phone = tempPasswordDialog.whatsapp.replace(/\D/g, '');
                  const encodedMessage = encodeURIComponent(message);
                  window.open(`https://wa.me/${phone}?text=${encodedMessage}`, '_blank');
                  toast.success('WhatsApp aberto com a mensagem!');
                }}
              >
                <MessageCircle className="h-4 w-4" />
                Enviar via WhatsApp
              </Button>
            )}
            <Button 
              variant="outline" 
              onClick={() => setTempPasswordDialog({ open: false, password: '', email: '', whatsapp: '', name: '', sendingWhatsApp: false })}
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Renew Confirmation Dialog */}
      <Dialog 
        open={renewDialog.open} 
        onOpenChange={(open) => !open && setRenewDialog({ open: false, sellerId: '', sellerName: '', days: 30, planType: 'manual' })}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-primary" />
              Renovar Assinatura
            </DialogTitle>
            <DialogDescription>
              Renovar "{renewDialog.sellerName}" por {renewDialog.days} dias
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-3">
              <Label className="text-base font-semibold">Selecione o Plano</Label>
              
              <div 
                className={cn(
                  "p-4 border-2 rounded-lg cursor-pointer transition-all",
                  renewDialog.planType === 'manual' 
                    ? "border-primary bg-primary/5" 
                    : "border-muted hover:border-muted-foreground/50"
                )}
                onClick={() => setRenewDialog(prev => ({ ...prev, planType: 'manual' }))}
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-4 h-4 rounded-full border-2",
                    renewDialog.planType === 'manual' ? "border-primary bg-primary" : "border-muted-foreground"
                  )} />
                  <div className="flex-1">
                    <h4 className="font-semibold">📱 Plano Manual</h4>
                    <p className="text-sm text-muted-foreground">
                      Apenas gerenciamento de clientes. Envio de mensagens manualmente (sem API WhatsApp).
                    </p>
                  </div>
                </div>
              </div>

              <div 
                className={cn(
                  "p-4 border-2 rounded-lg cursor-pointer transition-all",
                  renewDialog.planType === 'whatsapp' 
                    ? "border-success bg-success/5" 
                    : "border-muted hover:border-muted-foreground/50"
                )}
                onClick={() => setRenewDialog(prev => ({ ...prev, planType: 'whatsapp' }))}
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-4 h-4 rounded-full border-2",
                    renewDialog.planType === 'whatsapp' ? "border-success bg-success" : "border-muted-foreground"
                  )} />
                  <div className="flex-1">
                    <h4 className="font-semibold text-success">🚀 Plano WhatsApp</h4>
                    <p className="text-sm text-muted-foreground">
                      Conecta à API do WhatsApp. Inclui envio manual + envio automático de mensagens.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {renewDialog.currentPlanType && renewDialog.currentPlanType !== renewDialog.planType && (
              <div className="p-3 bg-warning/10 border border-warning/30 rounded-lg">
                <p className="text-sm text-warning-foreground">
                  ⚠️ Você está alterando o plano de <strong>{renewDialog.currentPlanType === 'manual' ? 'Manual' : 'WhatsApp'}</strong> para <strong>{renewDialog.planType === 'manual' ? 'Manual' : 'WhatsApp'}</strong>
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button 
              variant="outline" 
              onClick={() => setRenewDialog({ open: false, sellerId: '', sellerName: '', days: 30, planType: 'manual' })}
            >
              Cancelar
            </Button>
            <Button 
              onClick={() => {
                updateExpirationMutation.mutate({ 
                  id: renewDialog.sellerId, 
                  days: renewDialog.days,
                  planType: renewDialog.planType 
                });
                setRenewDialog({ open: false, sellerId: '', sellerName: '', days: 30, planType: 'manual' });
              }}
              disabled={updateExpirationMutation.isPending}
            >
              {updateExpirationMutation.isPending ? 'Renovando...' : 'Confirmar Renovação'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Permanent Confirmation Dialog */}
      <ConfirmDialog
        open={permanentDialog.open}
        onOpenChange={(open) => !open && setPermanentDialog({ open: false, sellerId: '', sellerName: '', isPermanent: false })}
        title={permanentDialog.isPermanent ? "Tornar Permanente" : "Remover Permanente"}
        description={
          permanentDialog.isPermanent 
            ? `Deseja tornar "${permanentDialog.sellerName}" permanente? Este vendedor não terá mais data de expiração.`
            : `Deseja remover o status permanente de "${permanentDialog.sellerName}"? Você precisará definir uma nova data de expiração.`
        }
        confirmText={permanentDialog.isPermanent ? "Sim, Tornar Permanente" : "Sim, Remover"}
        onConfirm={() => {
          togglePermanentMutation.mutate({ id: permanentDialog.sellerId, is_permanent: permanentDialog.isPermanent });
          setPermanentDialog({ open: false, sellerId: '', sellerName: '', isPermanent: false });
        }}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteDialog.open}
        onOpenChange={(open) => !open && setDeleteDialog({ open: false, sellerId: '', sellerName: '' })}
        title="Desativar Vendedor"
        description={`Tem certeza que deseja desativar "${deleteDialog.sellerName}"? Esta ação pode ser revertida.`}
        confirmText="Sim, Desativar"
        variant="destructive"
        onConfirm={() => {
          deleteSellerMutation.mutate(deleteDialog.sellerId);
          setDeleteDialog({ open: false, sellerId: '', sellerName: '' });
        }}
      />

      {/* WhatsApp Message Dialog */}
      <Dialog 
        open={messageDialog.open} 
        onOpenChange={(open) => !open && setMessageDialog({ open: false, seller: null, selectedTemplate: '', message: '', sendingApi: false, apiStatus: 'idle', apiError: '' })}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-success" />
              Enviar WhatsApp
            </DialogTitle>
            <DialogDescription>
              {messageDialog.seller?.full_name || messageDialog.seller?.email}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Selecionar Template</Label>
              <Select value={messageDialog.selectedTemplate} onValueChange={handleTemplateSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolha um template..." />
                </SelectTrigger>
                <SelectContent>
                  {sellerTemplates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Mensagem</Label>
              <Textarea
                value={messageDialog.message}
                onChange={(e) => setMessageDialog(prev => ({ ...prev, message: e.target.value }))}
                rows={8}
                placeholder="Selecione um template ou digite sua mensagem..."
              />
            </div>

            {sellerTemplates.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-2">
                Nenhum template de vendedor encontrado. Crie templates em "Mensagens" → "Templates".
              </p>
            )}

            {/* API Status Feedback */}
            {messageDialog.apiStatus === 'success' && (
              <div className="flex items-center gap-2 p-3 bg-success/10 border border-success/30 rounded-lg">
                <CheckCircle className="h-5 w-5 text-success" />
                <span className="text-sm text-success font-medium">Mensagem enviada com sucesso via API!</span>
              </div>
            )}

            {messageDialog.apiStatus === 'error' && (
              <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
                <XCircle className="h-5 w-5 text-destructive" />
                <span className="text-sm text-destructive">{messageDialog.apiError}</span>
              </div>
            )}
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={copyMessage} disabled={!messageDialog.message}>
              <Copy className="h-4 w-4 mr-2" />
              Copiar
            </Button>
            <Button 
              onClick={handleSendWhatsApp} 
              disabled={!messageDialog.message || !messageDialog.seller?.whatsapp || messageDialog.sendingApi}
              variant="outline"
              className="border-success text-success hover:bg-success/10"
            >
              <Send className="h-4 w-4 mr-2" />
              WhatsApp Web
            </Button>
            <Button 
              onClick={handleSendWhatsAppApi} 
              disabled={!messageDialog.message || !messageDialog.seller?.whatsapp || messageDialog.sendingApi}
              className="bg-primary hover:bg-primary/90"
            >
              {messageDialog.sendingApi ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Zap className="h-4 w-4 mr-2" />
              )}
              {messageDialog.sendingApi ? 'Enviando...' : 'Enviar via API'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
