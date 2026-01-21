import { useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useCrypto } from '@/hooks/useCrypto';
import { usePrivacyMode } from '@/hooks/usePrivacyMode';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabaseExternal as supabase } from '@/lib/supabase-external';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Plus, Search, Phone, Calendar as CalendarIcon, User, Trash2, Edit, Eye, EyeOff, MessageCircle, Loader2, Server, Copy, RefreshCw } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { format, addDays, addMonths, isBefore, isAfter, startOfToday, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ConfirmDialog';

interface PanelReseller {
  id: string;
  server_id: string;
  server_name?: string;
  name: string;
  whatsapp: string;
  email: string | null;
  login: string | null;
  password: string | null;
  credits: number;
  expiration_date: string;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

interface ServerData {
  id: string;
  name: string;
  is_active: boolean;
  icon_url: string | null;
}

interface WhatsAppTemplate {
  id: string;
  name: string;
  type: string;
  message: string;
}

type FilterType = 'all' | 'active' | 'expiring' | 'expired';

export default function PanelResellers() {
  const { user } = useAuth();
  const { encrypt, decrypt } = useCrypto();
  const { isPrivacyMode, maskData } = usePrivacyMode();
  const queryClient = useQueryClient();
  
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [serverFilter, setServerFilter] = useState<string>('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingReseller, setEditingReseller] = useState<PanelReseller | null>(null);
  const [deleteReseller, setDeleteReseller] = useState<PanelReseller | null>(null);
  const [showPassword, setShowPassword] = useState<string | null>(null);
  const [decryptedCredentials, setDecryptedCredentials] = useState<Record<string, { login: string; password: string }>>({});
  const [decrypting, setDecrypting] = useState<string | null>(null);
  const [expirationPopoverOpen, setExpirationPopoverOpen] = useState(false);
  
  // Message dialog state
  const [messageReseller, setMessageReseller] = useState<PanelReseller | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [messageContent, setMessageContent] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    whatsapp: '',
    email: '',
    server_id: '',
    login: '',
    password: '',
    credits: '0',
    expiration_date: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
    notes: '',
  });

  // Fetch resellers with server name
  const { data: resellers = [], isLoading } = useQuery({
    queryKey: ['panel-resellers', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('panel_resellers' as any)
        .select(`
          *,
          servers:server_id (name)
        `)
        .eq('seller_id', user!.id)
        .eq('is_active', true)
        .order('expiration_date', { ascending: true });
      if (error) throw error;
      return (data || []).map((r: any) => ({
        ...r,
        server_name: r.servers?.name || 'Servidor desconhecido'
      })) as PanelReseller[];
    },
    enabled: !!user?.id,
  });

  // Fetch servers
  const { data: servers = [] } = useQuery({
    queryKey: ['servers-active', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('servers')
        .select('id, name, is_active, icon_url')
        .eq('seller_id', user!.id)
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data as ServerData[];
    },
    enabled: !!user?.id,
  });

  // Fetch templates for panel resellers
  const { data: templates = [] } = useQuery({
    queryKey: ['panel-reseller-templates', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whatsapp_templates')
        .select('id, name, type, message')
        .eq('seller_id', user!.id)
        .like('type', 'panel_reseller%')
        .order('name');
      if (error) throw error;
      const list = (data as WhatsAppTemplate[] | null) || [];
      const normalizeName = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();
      const seen = new Set<string>();
      const deduped: WhatsAppTemplate[] = [];
      for (const t of list) {
        const key = `${user!.id}:${t.type}:${normalizeName(t.name)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(t);
      }
      return deduped;
    },
    enabled: !!user?.id,
  });

  // Fetch seller profile for PIX key
  const { data: profile } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('pix_key, company_name')
        .eq('id', user!.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Decrypt credentials
  const decryptCredentialsForReseller = useCallback(async (resellerId: string, encryptedLogin: string | null, encryptedPassword: string | null) => {
    if (decryptedCredentials[resellerId]) {
      return decryptedCredentials[resellerId];
    }

    setDecrypting(resellerId);
    try {
      const decryptedLogin = encryptedLogin ? await decrypt(encryptedLogin) : '';
      const decryptedPassword = encryptedPassword ? await decrypt(encryptedPassword) : '';
      
      const result = { login: decryptedLogin, password: decryptedPassword };
      setDecryptedCredentials(prev => ({ ...prev, [resellerId]: result }));
      return result;
    } catch (error) {
      return { login: encryptedLogin || '', password: encryptedPassword || '' };
    } finally {
      setDecrypting(null);
    }
  }, [decrypt, decryptedCredentials]);

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const encryptedLogin = data.login ? await encrypt(data.login) : null;
      const encryptedPassword = data.password ? await encrypt(data.password) : null;
      
      const { error } = await supabase.from('panel_resellers' as any).insert([{
        seller_id: user!.id,
        server_id: data.server_id,
        name: data.name,
        whatsapp: data.whatsapp,
        email: data.email || null,
        login: encryptedLogin,
        password: encryptedPassword,
        credits: parseInt(data.credits) || 0,
        expiration_date: data.expiration_date,
        notes: data.notes || null,
      }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['panel-resellers'] });
      toast.success('Revendedor cadastrado!');
      resetForm();
      setIsDialogOpen(false);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const encryptedLogin = data.login ? await encrypt(data.login) : null;
      const encryptedPassword = data.password ? await encrypt(data.password) : null;
      
      const { error } = await supabase.from('panel_resellers' as any).update({
        server_id: data.server_id,
        name: data.name,
        whatsapp: data.whatsapp,
        email: data.email || null,
        login: encryptedLogin,
        password: encryptedPassword,
        credits: parseInt(data.credits) || 0,
        expiration_date: data.expiration_date,
        notes: data.notes || null,
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['panel-resellers'] });
      toast.success('Revendedor atualizado!');
      resetForm();
      setIsDialogOpen(false);
      setEditingReseller(null);
      setDecryptedCredentials({});
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('panel_resellers' as any).update({ is_active: false }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['panel-resellers'] });
      toast.success('Revendedor removido!');
      setDeleteReseller(null);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const renewMutation = useMutation({
    mutationFn: async ({ id, newDate }: { id: string; newDate: string }) => {
      const { error } = await supabase.from('panel_resellers' as any).update({
        expiration_date: newDate,
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['panel-resellers'] });
      toast.success('Renovado com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const resetForm = () => {
    setFormData({
      name: '',
      whatsapp: '',
      email: '',
      server_id: '',
      login: '',
      password: '',
      credits: '0',
      expiration_date: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
      notes: '',
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.server_id) {
      toast.error('Selecione um servidor');
      return;
    }
    if (editingReseller) {
      updateMutation.mutate({ id: editingReseller.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleEdit = async (reseller: PanelReseller) => {
    let login = reseller.login || '';
    let password = reseller.password || '';
    
    if (reseller.login || reseller.password) {
      const decrypted = await decryptCredentialsForReseller(reseller.id, reseller.login, reseller.password);
      login = decrypted.login;
      password = decrypted.password;
    }
    
    setEditingReseller(reseller);
    setFormData({
      name: reseller.name,
      whatsapp: reseller.whatsapp,
      email: reseller.email || '',
      server_id: reseller.server_id,
      login,
      password,
      credits: String(reseller.credits || 0),
      expiration_date: reseller.expiration_date.split('T')[0],
      notes: reseller.notes || '',
    });
    setIsDialogOpen(true);
  };

  const handleQuickRenew = (resellerId: string, days: number) => {
    const newDate = format(addDays(new Date(), days), 'yyyy-MM-dd');
    renewMutation.mutate({ id: resellerId, newDate });
  };

  // Replace variables in template
  const replaceVariables = async (template: string, reseller: PanelReseller) => {
    let login = '';
    let password = '';
    
    if (reseller.login || reseller.password) {
      const decrypted = await decryptCredentialsForReseller(reseller.id, reseller.login, reseller.password);
      login = decrypted.login;
      password = decrypted.password;
    }

    return template
      .replace(/{nome}/g, reseller.name)
      .replace(/{servidor}/g, reseller.server_name || '')
      .replace(/{login}/g, login)
      .replace(/{senha}/g, password)
      .replace(/{creditos}/g, String(reseller.credits || 0))
      .replace(/{vencimento}/g, format(new Date(reseller.expiration_date), 'dd/MM/yyyy'))
      .replace(/{pix}/g, profile?.pix_key || '')
      .replace(/{empresa}/g, profile?.company_name || '');
  };

  const handleOpenMessageDialog = (reseller: PanelReseller) => {
    setMessageReseller(reseller);
    setSelectedTemplate('');
    setMessageContent('');
  };

  const handleTemplateSelect = async (templateId: string) => {
    setSelectedTemplate(templateId);
    const template = templates.find(t => t.id === templateId);
    if (template && messageReseller) {
      const processed = await replaceVariables(template.message, messageReseller);
      setMessageContent(processed);
    }
  };

  const handleSendWhatsApp = () => {
    if (!messageReseller || !messageContent) return;
    const phone = messageReseller.whatsapp.replace(/\D/g, '');
    const url = `https://wa.me/55${phone}?text=${encodeURIComponent(messageContent)}`;
    window.open(url, '_blank');
    setMessageReseller(null);
  };

  // Filter resellers
  const today = startOfToday();
  const filteredResellers = resellers.filter(reseller => {
    const expirationDate = new Date(reseller.expiration_date);
    const daysUntilExpiration = differenceInDays(expirationDate, today);

    // Status filter
    if (filter === 'active' && (daysUntilExpiration < 0 || daysUntilExpiration > 7)) return false;
    if (filter === 'expiring' && (daysUntilExpiration < 0 || daysUntilExpiration > 7)) return false;
    if (filter === 'expired' && daysUntilExpiration >= 0) return false;

    // Server filter
    if (serverFilter !== 'all' && reseller.server_id !== serverFilter) return false;

    // Search
    if (search) {
      const searchLower = search.toLowerCase();
      return (
        reseller.name.toLowerCase().includes(searchLower) ||
        reseller.whatsapp.includes(search) ||
        (reseller.server_name || '').toLowerCase().includes(searchLower)
      );
    }
    return true;
  });

  const getStatusBadge = (expirationDate: string) => {
    const expDate = new Date(expirationDate);
    const days = differenceInDays(expDate, today);
    
    if (days < 0) {
      return <Badge variant="destructive">Vencido há {Math.abs(days)} dias</Badge>;
    } else if (days === 0) {
      return <Badge variant="destructive">Vence hoje</Badge>;
    } else if (days <= 3) {
      return <Badge variant="outline" className="border-destructive text-destructive">Vence em {days} dias</Badge>;
    } else if (days <= 7) {
      return <Badge variant="outline" className="border-warning text-warning">Vence em {days} dias</Badge>;
    }
    return <Badge variant="outline" className="border-success text-success">Ativo ({days} dias)</Badge>;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Revendedores de Painéis</h1>
          <p className="text-muted-foreground">Gerencie seus revendedores dos servidores cadastrados</p>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) {
            setEditingReseller(null);
            resetForm();
          }
        }}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Novo Revendedor
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingReseller ? 'Editar Revendedor' : 'Novo Revendedor'}</DialogTitle>
              <DialogDescription>
                Cadastre um revendedor para um dos seus servidores
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Server Selection */}
              <div className="space-y-2">
                <Label>Servidor *</Label>
                <Select value={formData.server_id} onValueChange={(v) => setFormData({ ...formData, server_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o servidor" />
                  </SelectTrigger>
                  <SelectContent>
                    {servers.map((server) => (
                      <SelectItem key={server.id} value={server.id}>
                        <div className="flex items-center gap-2">
                          {server.icon_url && (
                            <img src={server.icon_url} alt="" className="h-4 w-4 rounded" />
                          )}
                          {server.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Name and WhatsApp */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Nome do revendedor"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="whatsapp">WhatsApp *</Label>
                  <Input
                    id="whatsapp"
                    value={formData.whatsapp}
                    onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
                    placeholder="11999999999"
                    required
                  />
                </div>
              </div>

              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="email@exemplo.com"
                />
              </div>

              {/* Login and Password */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="login">Login do Painel</Label>
                  <Input
                    id="login"
                    value={formData.login}
                    onChange={(e) => setFormData({ ...formData, login: e.target.value })}
                    placeholder="Login"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Senha do Painel</Label>
                  <Input
                    id="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="Senha"
                  />
                </div>
              </div>

              {/* Credits */}
              <div className="space-y-2">
                <Label htmlFor="credits">Créditos</Label>
                <Input
                  id="credits"
                  type="number"
                  min="0"
                  value={formData.credits}
                  onChange={(e) => setFormData({ ...formData, credits: e.target.value })}
                  placeholder="0"
                />
              </div>

              {/* Expiration Date */}
              <div className="space-y-2">
                <Label>Data de Vencimento *</Label>
                <Popover open={expirationPopoverOpen} onOpenChange={setExpirationPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !formData.expiration_date && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formData.expiration_date ? format(new Date(formData.expiration_date), 'dd/MM/yyyy') : 'Selecione'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <div className="p-2 border-b flex flex-wrap gap-1">
                      {[7, 15, 30, 60, 90].map((days) => (
                        <Button
                          key={days}
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setFormData({ ...formData, expiration_date: format(addDays(new Date(), days), 'yyyy-MM-dd') });
                            setExpirationPopoverOpen(false);
                          }}
                        >
                          +{days}d
                        </Button>
                      ))}
                    </div>
                    <CalendarPicker
                      mode="single"
                      selected={formData.expiration_date ? new Date(formData.expiration_date) : undefined}
                      onSelect={(date) => {
                        if (date) {
                          setFormData({ ...formData, expiration_date: format(date, 'yyyy-MM-dd') });
                          setExpirationPopoverOpen(false);
                        }
                      }}
                      locale={ptBR}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label htmlFor="notes">Observações</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Anotações sobre o revendedor..."
                  rows={3}
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {editingReseller ? 'Salvar' : 'Cadastrar'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, WhatsApp ou servidor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={serverFilter} onValueChange={setServerFilter}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="Servidor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os servidores</SelectItem>
            {servers.map((server) => (
              <SelectItem key={server.id} value={server.id}>{server.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Status Tabs */}
      <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterType)} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="all">Todos ({resellers.length})</TabsTrigger>
          <TabsTrigger value="active">Ativos</TabsTrigger>
          <TabsTrigger value="expiring">Vencendo</TabsTrigger>
          <TabsTrigger value="expired">Vencidos</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Resellers List */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredResellers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Server className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">Nenhum revendedor encontrado</p>
            <Button variant="link" onClick={() => setIsDialogOpen(true)}>
              Cadastrar primeiro revendedor
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredResellers.map((reseller) => {
            const credentials = decryptedCredentials[reseller.id];
            const isDecrypting = decrypting === reseller.id;

            return (
              <Card key={reseller.id} className="relative overflow-hidden">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-lg truncate flex items-center gap-2">
                        <User className="h-4 w-4 flex-shrink-0" />
                        {isPrivacyMode ? maskData(reseller.name, 'name') : reseller.name}
                      </CardTitle>
                      <CardDescription className="flex items-center gap-1 mt-1">
                        <Server className="h-3 w-3" />
                        {reseller.server_name}
                      </CardDescription>
                    </div>
                    {getStatusBadge(reseller.expiration_date)}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Contact */}
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span>{isPrivacyMode ? maskData(reseller.whatsapp, 'phone') : reseller.whatsapp}</span>
                  </div>

                  {/* Credentials */}
                  {(reseller.login || reseller.password) && (
                    <div className="p-2 rounded bg-muted/50 text-sm space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Credenciais:</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2"
                          onClick={async () => {
                            if (showPassword === reseller.id) {
                              setShowPassword(null);
                            } else {
                              await decryptCredentialsForReseller(reseller.id, reseller.login, reseller.password);
                              setShowPassword(reseller.id);
                            }
                          }}
                          disabled={isDecrypting}
                        >
                          {isDecrypting ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : showPassword === reseller.id ? (
                            <EyeOff className="h-3 w-3" />
                          ) : (
                            <Eye className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                      {showPassword === reseller.id && credentials && (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span>Login: <strong>{credentials.login}</strong></span>
                            <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => {
                              navigator.clipboard.writeText(credentials.login);
                              toast.success('Login copiado!');
                            }}>
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Senha: <strong>{credentials.password}</strong></span>
                            <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => {
                              navigator.clipboard.writeText(credentials.password);
                              toast.success('Senha copiada!');
                            }}>
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Credits */}
                  {reseller.credits > 0 && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">Créditos:</span>
                      <Badge variant="secondary">{reseller.credits}</Badge>
                    </div>
                  )}

                  {/* Expiration */}
                  <div className="flex items-center gap-2 text-sm">
                    <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                    <span>Vence: {format(new Date(reseller.expiration_date), 'dd/MM/yyyy')}</span>
                  </div>

                  {/* Notes */}
                  {reseller.notes && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{reseller.notes}</p>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-2 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => handleOpenMessageDialog(reseller)}
                    >
                      <MessageCircle className="h-4 w-4 mr-1" />
                      WhatsApp
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleQuickRenew(reseller.id, 30)}
                      disabled={renewMutation.isPending}
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(reseller)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDeleteReseller(reseller)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteReseller}
        onOpenChange={(open) => !open && setDeleteReseller(null)}
        title="Excluir Revendedor"
        description={`Tem certeza que deseja excluir ${deleteReseller?.name}?`}
        onConfirm={() => deleteReseller && deleteMutation.mutate(deleteReseller.id)}
        variant="destructive"
      />

      {/* Message Dialog */}
      <Dialog open={!!messageReseller} onOpenChange={(open) => !open && setMessageReseller(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Enviar Mensagem</DialogTitle>
            <DialogDescription>
              Envie uma mensagem para {messageReseller?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Template</Label>
              <Select value={selectedTemplate} onValueChange={handleTemplateSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um template" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((template) => (
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
                value={messageContent}
                onChange={(e) => setMessageContent(e.target.value)}
                rows={8}
                placeholder="Selecione um template ou escreva sua mensagem..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMessageReseller(null)}>
              Cancelar
            </Button>
            <Button onClick={handleSendWhatsApp} disabled={!messageContent} className="gap-2">
              <MessageCircle className="h-4 w-4" />
              Enviar WhatsApp
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
