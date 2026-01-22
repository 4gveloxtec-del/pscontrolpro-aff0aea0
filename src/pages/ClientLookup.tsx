import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  Search, 
  User, 
  Calendar, 
  Server, 
  Smartphone, 
  CreditCard, 
  MessageSquare,
  Mail,
  Phone,
  Lock,
  Globe,
  Package,
  History,
  Shield,
  AlertCircle,
  CheckCircle,
  Clock,
  Loader2,
  UserSearch,
  Eye,
  EyeOff,
  Copy,
  ExternalLink
} from 'lucide-react';
import { format, differenceInDays, isPast, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ClientFullData {
  // Basic client data
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  telegram: string | null;
  category: string | null;
  notes: string | null;
  referral_code: string | null;
  created_at: string | null;
  updated_at: string | null;
  
  // Plan & Service
  plan_name: string | null;
  plan_price: number | null;
  expiration_date: string;
  is_paid: boolean | null;
  pending_amount: number | null;
  renewed_at: string | null;
  expected_payment_date: string | null;
  
  // Credentials
  login: string | null;
  password: string | null;
  login_2: string | null;
  password_2: string | null;
  dns: string | null;
  
  // Device info
  device: string | null;
  device_model: string | null;
  app_name: string | null;
  app_type: string | null;
  has_adult_content: boolean | null;
  
  // Server info
  server_id: string | null;
  server_name: string | null;
  server_id_2: string | null;
  server_name_2: string | null;
  additional_servers: any;
  
  // Gerencia App
  gerencia_app_mac: string | null;
  gerencia_app_devices: any;
  
  // Paid apps (legacy fields)
  has_paid_apps: boolean | null;
  paid_apps_email: string | null;
  paid_apps_password: string | null;
  paid_apps_expiration: string | null;
  paid_apps_duration: string | null;
  
  // Premium accounts
  premium_password: string | null;
  premium_price: number | null;
  
  // Archive status
  is_archived: boolean | null;
  archived_at: string | null;
  
  // Related data (joined)
  plan?: { name: string; price: number; duration_days: number; category: string } | null;
  server?: { name: string; icon_url: string | null } | null;
  external_apps?: Array<{
    id: string;
    email: string | null;
    password: string | null;
    expiration_date: string | null;
    devices: any;
    notes: string | null;
    fixed_app_name: string | null;
    external_app?: { name: string; download_url: string | null } | null;
  }>;
  premium_accounts?: Array<{
    id: string;
    plan_name: string;
    email: string | null;
    password: string | null;
    expiration_date: string | null;
    price: number | null;
    notes: string | null;
  }>;
  device_apps?: Array<{
    id: string;
    app: { name: string; icon: string | null; download_url: string | null };
  }>;
  message_history?: Array<{
    id: string;
    message_type: string;
    message_content: string;
    sent_at: string | null;
  }>;
  panel_clients?: Array<{
    id: string;
    slot_type: string;
    panel: { name: string };
  }>;
}

function ClientLookup() {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [showPasswords, setShowPasswords] = useState(false);
  
  // Search clients
  const { data: searchResults, isLoading: isSearching } = useQuery({
    queryKey: ['client-lookup-search', searchQuery, user?.id],
    queryFn: async () => {
      if (!user?.id || searchQuery.length < 2) return [];
      
      const normalizedQuery = searchQuery.toLowerCase().trim();
      
      const { data, error } = await supabase
        .from('clients')
        .select('id, name, phone, email, login, expiration_date, plan_name, is_archived')
        .eq('seller_id', user.id)
        .or(`name.ilike.%${normalizedQuery}%,phone.ilike.%${normalizedQuery}%,email.ilike.%${normalizedQuery}%,login.ilike.%${normalizedQuery}%`)
        .order('name')
        .limit(20);
        
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id && searchQuery.length >= 2,
    staleTime: 30000,
  });
  
  // Fetch full client data when selected
  const { data: clientFullData, isLoading: isLoadingClient } = useQuery({
    queryKey: ['client-full-data', selectedClientId, user?.id],
    queryFn: async () => {
      if (!user?.id || !selectedClientId) return null;
      
      // Fetch client with all related data
      const { data: client, error: clientError } = await supabase
        .from('clients')
        .select(`
          *,
          plan:plans(name, price, duration_days, category),
          server:servers(name, icon_url)
        `)
        .eq('id', selectedClientId)
        .eq('seller_id', user.id)
        .single();
        
      if (clientError) throw clientError;
      
      // Fetch related data in parallel
      const [externalAppsResult, premiumAccountsResult, deviceAppsResult, messageHistoryResult, panelClientsResult] = await Promise.all([
        supabase
          .from('client_external_apps')
          .select('id, email, password, expiration_date, devices, notes, fixed_app_name, external_app:external_apps(name, download_url)')
          .eq('client_id', selectedClientId)
          .eq('seller_id', user.id),
        supabase
          .from('client_premium_accounts')
          .select('id, plan_name, email, password, expiration_date, price, notes')
          .eq('client_id', selectedClientId)
          .eq('seller_id', user.id),
        supabase
          .from('client_device_apps')
          .select('id, app:reseller_device_apps(name, icon, download_url)')
          .eq('client_id', selectedClientId)
          .eq('seller_id', user.id),
        supabase
          .from('message_history')
          .select('id, message_type, message_content, sent_at')
          .eq('client_id', selectedClientId)
          .eq('seller_id', user.id)
          .order('sent_at', { ascending: false })
          .limit(10),
        supabase
          .from('panel_clients')
          .select('id, slot_type, panel:shared_panels(name)')
          .eq('client_id', selectedClientId)
          .eq('seller_id', user.id),
      ]);
      
      return {
        ...client,
        external_apps: externalAppsResult.data || [],
        premium_accounts: premiumAccountsResult.data || [],
        device_apps: deviceAppsResult.data || [],
        message_history: messageHistoryResult.data || [],
        panel_clients: panelClientsResult.data || [],
      } as ClientFullData;
    },
    enabled: !!user?.id && !!selectedClientId,
    staleTime: 60000,
  });
  
  const getStatusBadge = (expirationDate: string) => {
    const expDate = parseISO(expirationDate);
    const daysUntil = differenceInDays(expDate, new Date());
    
    if (isPast(expDate)) {
      return <Badge variant="destructive" className="gap-1"><AlertCircle className="h-3 w-3" />Vencido</Badge>;
    }
    if (daysUntil <= 3) {
      return <Badge variant="outline" className="border-orange-500 text-orange-500 gap-1"><Clock className="h-3 w-3" />Vence em {daysUntil}d</Badge>;
    }
    return <Badge variant="outline" className="border-green-500 text-green-500 gap-1"><CheckCircle className="h-3 w-3" />Ativo</Badge>;
  };
  
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  };
  
  const formatDate = (date: string | null) => {
    if (!date) return '-';
    try {
      return format(parseISO(date), 'dd/MM/yyyy', { locale: ptBR });
    } catch {
      return date;
    }
  };
  
  const formatDateTime = (date: string | null) => {
    if (!date) return '-';
    try {
      return format(parseISO(date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
    } catch {
      return date;
    }
  };
  
  const CredentialField = ({ label, value, icon: Icon }: { label: string; value: string | null; icon: React.ComponentType<{ className?: string }> }) => {
    if (!value) return null;
    return (
      <div className="flex items-center justify-between py-2 px-3 bg-muted/50 rounded-lg">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">{label}:</span>
          <span className="text-sm font-medium font-mono">
            {showPasswords || !label.toLowerCase().includes('senha') ? value : '••••••••'}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => copyToClipboard(value, label)}
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  };

  return (
    <div className="container mx-auto p-4 md:p-6 max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <UserSearch className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Consulta Avançada</h1>
            <p className="text-muted-foreground text-sm">Visão 360° completa do cliente</p>
          </div>
        </div>
      </div>
      
      {/* Search Section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Search className="h-5 w-5" />
            Buscar Cliente
          </CardTitle>
          <CardDescription>
            Pesquise por nome, telefone, email ou login
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Digite para buscar..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          
          {/* Search Results */}
          {searchQuery.length >= 2 && (
            <div className="border rounded-lg overflow-hidden">
              {isSearching ? (
                <div className="p-4 flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm text-muted-foreground">Buscando...</span>
                </div>
              ) : searchResults && searchResults.length > 0 ? (
                <ScrollArea className="max-h-64">
                  {searchResults.map((client) => (
                    <button
                      key={client.id}
                      onClick={() => setSelectedClientId(client.id)}
                      className={cn(
                        "w-full text-left p-3 hover:bg-muted/50 transition-colors border-b last:border-b-0",
                        selectedClientId === client.id && "bg-primary/5"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <User className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium flex items-center gap-2">
                              {client.name}
                              {client.is_archived && <Badge variant="secondary" className="text-xs">Arquivado</Badge>}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {client.phone || client.email || client.login || 'Sem contato'}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          {getStatusBadge(client.expiration_date)}
                          <p className="text-xs text-muted-foreground mt-1">{client.plan_name || 'Sem plano'}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </ScrollArea>
              ) : (
                <div className="p-4 text-center text-muted-foreground">
                  Nenhum cliente encontrado
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Client Full Data View */}
      {selectedClientId && (
        <Card className="border-primary/20">
          {isLoadingClient ? (
            <CardContent className="py-12 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </CardContent>
          ) : clientFullData ? (
            <>
              <CardHeader className="pb-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                      <User className="h-8 w-8 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-xl flex items-center gap-2">
                        {clientFullData.name}
                        {getStatusBadge(clientFullData.expiration_date)}
                      </CardTitle>
                      <CardDescription className="flex flex-wrap gap-2 mt-1">
                        {clientFullData.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />{clientFullData.phone}
                          </span>
                        )}
                        {clientFullData.email && (
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />{clientFullData.email}
                          </span>
                        )}
                      </CardDescription>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowPasswords(!showPasswords)}
                    className="gap-2"
                  >
                    {showPasswords ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    {showPasswords ? 'Ocultar' : 'Mostrar'} Senhas
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="general" className="w-full">
                  <TabsList className="grid w-full grid-cols-5 mb-4">
                    <TabsTrigger value="general" className="gap-1 text-xs">
                      <User className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Geral</span>
                    </TabsTrigger>
                    <TabsTrigger value="service" className="gap-1 text-xs">
                      <Package className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Serviços</span>
                    </TabsTrigger>
                    <TabsTrigger value="devices" className="gap-1 text-xs">
                      <Smartphone className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Dispositivos</span>
                    </TabsTrigger>
                    <TabsTrigger value="apps" className="gap-1 text-xs">
                      <CreditCard className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Apps</span>
                    </TabsTrigger>
                    <TabsTrigger value="history" className="gap-1 text-xs">
                      <History className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Histórico</span>
                    </TabsTrigger>
                  </TabsList>
                  
                  {/* General Tab */}
                  <TabsContent value="general" className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      {/* Personal Data */}
                      <div className="space-y-3">
                        <h3 className="font-semibold flex items-center gap-2">
                          <User className="h-4 w-4" />
                          Dados Pessoais
                        </h3>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between py-1 border-b border-dashed">
                            <span className="text-muted-foreground">Nome:</span>
                            <span className="font-medium">{clientFullData.name}</span>
                          </div>
                          <div className="flex justify-between py-1 border-b border-dashed">
                            <span className="text-muted-foreground">Telefone:</span>
                            <span className="font-medium">{clientFullData.phone || '-'}</span>
                          </div>
                          <div className="flex justify-between py-1 border-b border-dashed">
                            <span className="text-muted-foreground">Email:</span>
                            <span className="font-medium">{clientFullData.email || '-'}</span>
                          </div>
                          <div className="flex justify-between py-1 border-b border-dashed">
                            <span className="text-muted-foreground">Telegram:</span>
                            <span className="font-medium">{clientFullData.telegram || '-'}</span>
                          </div>
                          <div className="flex justify-between py-1 border-b border-dashed">
                            <span className="text-muted-foreground">Categoria:</span>
                            <Badge variant="outline">{clientFullData.category || 'Sem categoria'}</Badge>
                          </div>
                          <div className="flex justify-between py-1 border-b border-dashed">
                            <span className="text-muted-foreground">Código Indicação:</span>
                            <span className="font-mono text-primary">{clientFullData.referral_code || '-'}</span>
                          </div>
                        </div>
                      </div>
                      
                      {/* Status & Dates */}
                      <div className="space-y-3">
                        <h3 className="font-semibold flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          Status & Datas
                        </h3>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between py-1 border-b border-dashed">
                            <span className="text-muted-foreground">Criado em:</span>
                            <span className="font-medium">{formatDateTime(clientFullData.created_at)}</span>
                          </div>
                          <div className="flex justify-between py-1 border-b border-dashed">
                            <span className="text-muted-foreground">Atualizado em:</span>
                            <span className="font-medium">{formatDateTime(clientFullData.updated_at)}</span>
                          </div>
                          <div className="flex justify-between py-1 border-b border-dashed">
                            <span className="text-muted-foreground">Última renovação:</span>
                            <span className="font-medium">{formatDateTime(clientFullData.renewed_at)}</span>
                          </div>
                          <div className="flex justify-between py-1 border-b border-dashed">
                            <span className="text-muted-foreground">Pagamento:</span>
                            {clientFullData.is_paid ? (
                              <Badge variant="outline" className="border-green-500 text-green-500">Pago</Badge>
                            ) : (
                              <Badge variant="outline" className="border-orange-500 text-orange-500">
                                Pendente {clientFullData.pending_amount ? `R$ ${clientFullData.pending_amount}` : ''}
                              </Badge>
                            )}
                          </div>
                          <div className="flex justify-between py-1 border-b border-dashed">
                            <span className="text-muted-foreground">Arquivado:</span>
                            <span className="font-medium">
                              {clientFullData.is_archived ? `Sim (${formatDate(clientFullData.archived_at)})` : 'Não'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Notes */}
                    {clientFullData.notes && (
                      <div className="space-y-2">
                        <h3 className="font-semibold flex items-center gap-2">
                          <MessageSquare className="h-4 w-4" />
                          Observações
                        </h3>
                        <div className="p-3 bg-muted/50 rounded-lg text-sm">
                          {clientFullData.notes}
                        </div>
                      </div>
                    )}
                  </TabsContent>
                  
                  {/* Service Tab */}
                  <TabsContent value="service" className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      {/* Plan Info */}
                      <div className="space-y-3">
                        <h3 className="font-semibold flex items-center gap-2">
                          <Package className="h-4 w-4" />
                          Plano Contratado
                        </h3>
                        <div className="p-4 rounded-lg border bg-card">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-lg font-semibold">{clientFullData.plan_name || 'Sem plano'}</span>
                            <span className="text-xl font-bold text-primary">
                              R$ {clientFullData.plan_price?.toFixed(2) || '0.00'}
                            </span>
                          </div>
                          <Separator className="my-3" />
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Categoria:</span>
                              <Badge>{clientFullData.plan?.category || clientFullData.category || 'IPTV'}</Badge>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Vencimento:</span>
                              <span className="font-medium">{formatDate(clientFullData.expiration_date)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Duração:</span>
                              <span>{clientFullData.plan?.duration_days || 30} dias</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      {/* Server Info */}
                      <div className="space-y-3">
                        <h3 className="font-semibold flex items-center gap-2">
                          <Server className="h-4 w-4" />
                          Servidores
                        </h3>
                        <div className="space-y-2">
                          {clientFullData.server_name && (
                            <div className="p-3 rounded-lg border bg-card flex items-center gap-3">
                              {clientFullData.server?.icon_url ? (
                                <img src={clientFullData.server.icon_url} alt="" className="w-10 h-10 rounded-lg object-cover" />
                              ) : (
                                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                                  <Server className="h-5 w-5" />
                                </div>
                              )}
                              <div>
                                <p className="font-medium">{clientFullData.server_name}</p>
                                <p className="text-xs text-muted-foreground">Servidor Principal</p>
                              </div>
                            </div>
                          )}
                          {clientFullData.server_name_2 && (
                            <div className="p-3 rounded-lg border bg-card flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                                <Server className="h-5 w-5" />
                              </div>
                              <div>
                                <p className="font-medium">{clientFullData.server_name_2}</p>
                                <p className="text-xs text-muted-foreground">Servidor Secundário</p>
                              </div>
                            </div>
                          )}
                          {clientFullData.panel_clients && clientFullData.panel_clients.length > 0 && (
                            <div className="mt-3">
                              <p className="text-sm font-medium mb-2">Painéis Compartilhados:</p>
                              {clientFullData.panel_clients.map((pc: any) => (
                                <div key={pc.id} className="p-2 rounded border bg-muted/30 text-sm">
                                  {pc.panel?.name} ({pc.slot_type.toUpperCase()})
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    {/* Credentials */}
                    <div className="space-y-3">
                      <h3 className="font-semibold flex items-center gap-2">
                        <Lock className="h-4 w-4" />
                        Credenciais de Acesso
                      </h3>
                      <div className="grid gap-2 md:grid-cols-2">
                        <CredentialField label="Login" value={clientFullData.login} icon={User} />
                        <CredentialField label="Senha" value={clientFullData.password} icon={Lock} />
                        <CredentialField label="Login 2" value={clientFullData.login_2} icon={User} />
                        <CredentialField label="Senha 2" value={clientFullData.password_2} icon={Lock} />
                        <CredentialField label="DNS" value={clientFullData.dns} icon={Globe} />
                      </div>
                    </div>
                  </TabsContent>
                  
                  {/* Devices Tab */}
                  <TabsContent value="devices" className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      {/* Device Info */}
                      <div className="space-y-3">
                        <h3 className="font-semibold flex items-center gap-2">
                          <Smartphone className="h-4 w-4" />
                          Dispositivo Principal
                        </h3>
                        <div className="p-4 rounded-lg border bg-card space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Tipo:</span>
                            <span className="font-medium">{clientFullData.device || '-'}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Modelo:</span>
                            <span className="font-medium">{clientFullData.device_model || '-'}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Aplicativo:</span>
                            <span className="font-medium">{clientFullData.app_name || '-'}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Tipo App:</span>
                            <Badge variant="outline">{clientFullData.app_type || '-'}</Badge>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Conteúdo Adulto:</span>
                            <span>{clientFullData.has_adult_content ? 'Sim' : 'Não'}</span>
                          </div>
                        </div>
                      </div>
                      
                      {/* Gerencia App */}
                      <div className="space-y-3">
                        <h3 className="font-semibold flex items-center gap-2">
                          <Shield className="h-4 w-4" />
                          Gerencia App
                        </h3>
                        <div className="p-4 rounded-lg border bg-card space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">MAC:</span>
                            <span className="font-mono">{clientFullData.gerencia_app_mac || '-'}</span>
                          </div>
                          {clientFullData.gerencia_app_devices && Array.isArray(clientFullData.gerencia_app_devices) && (
                            <div className="mt-2">
                              <p className="text-sm text-muted-foreground mb-1">Dispositivos:</p>
                              {clientFullData.gerencia_app_devices.map((device: any, idx: number) => (
                                <div key={idx} className="text-xs p-1 bg-muted rounded">
                                  {device.name || device.mac || JSON.stringify(device)}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    {/* Device Apps */}
                    {clientFullData.device_apps && clientFullData.device_apps.length > 0 && (
                      <div className="space-y-3">
                        <h3 className="font-semibold">Aplicativos Instalados</h3>
                        <div className="grid gap-2 md:grid-cols-3">
                          {clientFullData.device_apps.map((da: any) => (
                            <div key={da.id} className="p-3 rounded-lg border bg-card flex items-center gap-3">
                              {da.app?.icon ? (
                                <img src={da.app.icon} alt="" className="w-8 h-8 rounded" />
                              ) : (
                                <div className="w-8 h-8 rounded bg-muted flex items-center justify-center">
                                  <Smartphone className="h-4 w-4" />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate">{da.app?.name}</p>
                              </div>
                              {da.app?.download_url && (
                                <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                                  <a href={da.app.download_url} target="_blank" rel="noopener noreferrer">
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </a>
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </TabsContent>
                  
                  {/* Apps Tab */}
                  <TabsContent value="apps" className="space-y-4">
                    {/* External/Paid Apps */}
                    <div className="space-y-3">
                      <h3 className="font-semibold flex items-center gap-2">
                        <CreditCard className="h-4 w-4" />
                        Apps Pagos Vinculados
                      </h3>
                      {clientFullData.external_apps && clientFullData.external_apps.length > 0 ? (
                        <div className="space-y-3">
                          {clientFullData.external_apps.map((app: any) => (
                            <div key={app.id} className="p-4 rounded-lg border bg-card">
                              <div className="flex items-center justify-between mb-3">
                                <span className="font-semibold">
                                  {app.external_app?.name || app.fixed_app_name || 'App'}
                                </span>
                                {app.expiration_date && getStatusBadge(app.expiration_date)}
                              </div>
                              <div className="grid gap-2">
                                <CredentialField label="Email" value={app.email} icon={Mail} />
                                <CredentialField label="Senha" value={app.password} icon={Lock} />
                              </div>
                              {app.expiration_date && (
                                <p className="text-xs text-muted-foreground mt-2">
                                  Vencimento: {formatDate(app.expiration_date)}
                                </p>
                              )}
                              {app.external_app?.download_url && (
                                <Button variant="link" size="sm" className="p-0 h-auto mt-2" asChild>
                                  <a href={app.external_app.download_url} target="_blank" rel="noopener noreferrer">
                                    <ExternalLink className="h-3 w-3 mr-1" />
                                    Link de Renovação
                                  </a>
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-4 text-center text-muted-foreground border rounded-lg">
                          Nenhum app pago vinculado
                        </div>
                      )}
                    </div>
                    
                    {/* Premium Accounts */}
                    <div className="space-y-3">
                      <h3 className="font-semibold flex items-center gap-2">
                        <Shield className="h-4 w-4" />
                        Contas Premium
                      </h3>
                      {clientFullData.premium_accounts && clientFullData.premium_accounts.length > 0 ? (
                        <div className="space-y-3">
                          {clientFullData.premium_accounts.map((acc: any) => (
                            <div key={acc.id} className="p-4 rounded-lg border bg-card">
                              <div className="flex items-center justify-between mb-3">
                                <span className="font-semibold">{acc.plan_name}</span>
                                <span className="text-primary font-bold">
                                  R$ {acc.price?.toFixed(2) || '0.00'}
                                </span>
                              </div>
                              <div className="grid gap-2">
                                <CredentialField label="Email" value={acc.email} icon={Mail} />
                                <CredentialField label="Senha" value={acc.password} icon={Lock} />
                              </div>
                              {acc.expiration_date && (
                                <div className="flex items-center justify-between mt-2 text-sm">
                                  <span className="text-muted-foreground">Vencimento:</span>
                                  {getStatusBadge(acc.expiration_date)}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-4 text-center text-muted-foreground border rounded-lg">
                          Nenhuma conta premium
                        </div>
                      )}
                    </div>
                    
                    {/* Legacy Paid Apps Fields */}
                    {clientFullData.has_paid_apps && (
                      <div className="space-y-3">
                        <h3 className="font-semibold">Apps Pagos (Legado)</h3>
                        <div className="p-4 rounded-lg border bg-card">
                          <div className="grid gap-2">
                            <CredentialField label="Email" value={clientFullData.paid_apps_email} icon={Mail} />
                            <CredentialField label="Senha" value={clientFullData.paid_apps_password} icon={Lock} />
                          </div>
                          <div className="flex justify-between text-sm mt-2">
                            <span className="text-muted-foreground">Vencimento:</span>
                            <span>{formatDate(clientFullData.paid_apps_expiration)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Duração:</span>
                            <span>{clientFullData.paid_apps_duration || '-'}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </TabsContent>
                  
                  {/* History Tab */}
                  <TabsContent value="history" className="space-y-4">
                    <h3 className="font-semibold flex items-center gap-2">
                      <MessageSquare className="h-4 w-4" />
                      Histórico de Mensagens
                    </h3>
                    {clientFullData.message_history && clientFullData.message_history.length > 0 ? (
                      <ScrollArea className="h-[400px]">
                        <div className="space-y-3">
                          {clientFullData.message_history.map((msg: any) => (
                            <div key={msg.id} className="p-3 rounded-lg border bg-card">
                              <div className="flex items-center justify-between mb-2">
                                <Badge variant="outline">{msg.message_type}</Badge>
                                <span className="text-xs text-muted-foreground">
                                  {formatDateTime(msg.sent_at)}
                                </span>
                              </div>
                              <p className="text-sm whitespace-pre-wrap">{msg.message_content}</p>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    ) : (
                      <div className="p-4 text-center text-muted-foreground border rounded-lg">
                        Nenhuma mensagem enviada
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </>
          ) : null}
        </Card>
      )}
    </div>
  );
}

export default ClientLookup;
