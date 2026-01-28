import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
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
import { toast } from 'sonner';
import { 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  Smartphone, 
  Tv, 
  Monitor, 
  Flame, 
  Apple,
  Download,
  Store,
  Link,
  Copy,
  ExternalLink,
  CheckCircle,
  XCircle,
  Loader2,
  Settings2
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

// Device types available
const DEVICE_TYPES = [
  { value: 'android_tv', label: 'Android TV', icon: Tv },
  { value: 'celular_android', label: 'Celular Android', icon: Smartphone },
  { value: 'smart_tv', label: 'Smart TV', icon: Monitor },
  { value: 'fire_stick', label: 'Fire Stick', icon: Flame },
  { value: 'iphone', label: 'iPhone (iOS)', icon: Apple },
] as const;

// App source types
const APP_SOURCES = [
  { value: 'play_store', label: 'Play Store', icon: Store },
  { value: 'app_store', label: 'App Store', icon: Apple },
  { value: 'direct', label: 'Download Direto', icon: Download },
] as const;

interface ResellerDeviceApp {
  id: string;
  seller_id: string;
  name: string;
  icon: string;
  company_name: string | null;
  device_types: string[];
  app_source: 'play_store' | 'app_store' | 'direct';
  download_url: string | null;
  downloader_code: string | null;
  server_id: string | null;
  is_gerencia_app: boolean;
  is_active: boolean;
  created_at: string;
  servers?: { name: string } | null;
}

interface FormData {
  name: string;
  icon: string;
  company_name: string;
  device_types: string[];
  app_source: 'play_store' | 'app_store' | 'direct';
  download_url: string;
  downloader_code: string;
  server_id: string;
  is_gerencia_app: boolean;
  is_active: boolean;
}

const defaultFormData: FormData = {
  name: '',
  icon: '📱',
  company_name: '',
  device_types: [],
  app_source: 'play_store',
  download_url: '',
  downloader_code: '',
  server_id: '',
  is_gerencia_app: false,
  is_active: true,
};

export default function MyApps() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { dialogProps, confirm } = useConfirmDialog();
  const [search, setSearch] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingApp, setEditingApp] = useState<ResellerDeviceApp | null>(null);
  const [formData, setFormData] = useState<FormData>(defaultFormData);
  const [activeTab, setActiveTab] = useState<'all' | 'gerencia'>('all');

  // Fetch apps
  const { data: apps = [], isLoading, isError } = useQuery({
    queryKey: ['reseller-device-apps', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reseller_device_apps' as any)
        .select('*, servers(name)')
        .eq('seller_id', user!.id)
        .order('name');
      if (error) throw error;
      return (data || []).map((app: any) => ({
        ...app,
        device_types: app.device_types || [],
      })) as ResellerDeviceApp[];
    },
    enabled: !!user?.id,
  });

  // Fetch servers for association
  const { data: servers = [], isError: serversError } = useQuery({
    queryKey: ['servers-for-apps', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('servers')
        .select('id, name')
        .eq('seller_id', user!.id)
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  // Combined error state
  const hasQueryError = isError || serversError;

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const { error } = await supabase
        .from('reseller_device_apps' as any)
        .insert({
          seller_id: user!.id,
          name: data.name,
          icon: data.icon,
          company_name: data.company_name || null,
          device_types: data.device_types,
          app_source: data.app_source,
          download_url: data.download_url || null,
          downloader_code: data.downloader_code || null,
          server_id: data.server_id || null,
          is_gerencia_app: data.is_gerencia_app,
          is_active: data.is_active,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reseller-device-apps'] });
      toast.success('Aplicativo cadastrado com sucesso!');
      resetForm();
    },
    onError: (error) => {
      toast.error('Erro ao cadastrar aplicativo: ' + error.message);
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: FormData }) => {
      const { error } = await supabase
        .from('reseller_device_apps' as any)
        .update({
          name: data.name,
          icon: data.icon,
          company_name: data.company_name || null,
          device_types: data.device_types,
          app_source: data.app_source,
          download_url: data.download_url || null,
          downloader_code: data.downloader_code || null,
          server_id: data.server_id || null,
          is_gerencia_app: data.is_gerencia_app,
          is_active: data.is_active,
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reseller-device-apps'] });
      toast.success('Aplicativo atualizado com sucesso!');
      resetForm();
    },
    onError: (error) => {
      toast.error('Erro ao atualizar aplicativo: ' + error.message);
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('reseller_device_apps' as any)
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reseller-device-apps'] });
      toast.success('Aplicativo excluído com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao excluir aplicativo: ' + error.message);
    },
  });

  const resetForm = () => {
    setFormData(defaultFormData);
    setEditingApp(null);
    setIsDialogOpen(false);
  };

  const handleEdit = (app: ResellerDeviceApp) => {
    setEditingApp(app);
    setFormData({
      name: app.name,
      icon: app.icon,
      company_name: app.company_name || '',
      device_types: app.device_types,
      app_source: app.app_source,
      download_url: app.download_url || '',
      downloader_code: app.downloader_code || '',
      server_id: app.server_id || '',
      is_gerencia_app: app.is_gerencia_app,
      is_active: app.is_active,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error('Nome do aplicativo é obrigatório');
      return;
    }
    if (formData.device_types.length === 0 && !formData.is_gerencia_app) {
      toast.error('Selecione ao menos um tipo de dispositivo');
      return;
    }

    if (editingApp) {
      updateMutation.mutate({ id: editingApp.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleDeviceToggle = (device: string) => {
    setFormData(prev => ({
      ...prev,
      device_types: prev.device_types.includes(device)
        ? prev.device_types.filter(d => d !== device)
        : [...prev.device_types, device],
    }));
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copiado para a área de transferência!');
  };

  // Filter apps based on search and tab
  const filteredApps = apps.filter(app => {
    const matchesSearch = app.name.toLowerCase().includes(search.toLowerCase()) ||
      (app.company_name && app.company_name.toLowerCase().includes(search.toLowerCase()));
    const matchesTab = activeTab === 'all' ? !app.is_gerencia_app : app.is_gerencia_app;
    return matchesSearch && matchesTab;
  });

  const getDeviceIcon = (deviceType: string) => {
    const device = DEVICE_TYPES.find(d => d.value === deviceType);
    return device ? device.icon : Smartphone;
  };

  const getSourceIcon = (source: string) => {
    const sourceType = APP_SOURCES.find(s => s.value === source);
    return sourceType ? sourceType.icon : Download;
  };

  // Error state guard
  if (hasQueryError) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-2">
          <p className="text-destructive font-medium">Erro ao carregar aplicativos</p>
          <p className="text-muted-foreground text-sm">Tente recarregar a página</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Meus Aplicativos</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Gerencie os aplicativos para envio automático aos clientes
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Novo Aplicativo
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingApp ? 'Editar Aplicativo' : 'Novo Aplicativo'}
              </DialogTitle>
              <DialogDescription>
                {editingApp 
                  ? 'Atualize as informações do aplicativo'
                  : 'Cadastre um novo aplicativo para enviar aos clientes'
                }
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Gerencia App Toggle */}
              <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/50 border">
                <div className="space-y-0.5">
                  <Label htmlFor="is_gerencia_app" className="text-base cursor-pointer">
                    Gerencia App
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Cadastro simplificado (apenas nome, empresa e link)
                  </p>
                </div>
                <Switch
                  id="is_gerencia_app"
                  checked={formData.is_gerencia_app}
                  onCheckedChange={(checked) => setFormData(prev => ({
                    ...prev,
                    is_gerencia_app: checked,
                    app_source: checked ? 'play_store' : prev.app_source,
                    device_types: checked ? ['android_tv', 'celular_android'] : prev.device_types,
                  }))}
                />
              </div>

              {/* Basic Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="icon">Ícone</Label>
                  <Input
                    id="icon"
                    value={formData.icon}
                    onChange={(e) => setFormData(prev => ({ ...prev, icon: e.target.value }))}
                    placeholder="📱"
                    className="text-center text-2xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">Nome do Aplicativo *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Ex: IPTV Smarters"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="company_name">Empresa / Servidor</Label>
                <Input
                  id="company_name"
                  value={formData.company_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, company_name: e.target.value }))}
                  placeholder="Ex: Minha Empresa IPTV"
                />
              </div>

              {/* Device Types - Only show if not Gerencia App */}
              {!formData.is_gerencia_app && (
                <div className="space-y-3">
                  <Label>Dispositivos Compatíveis *</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {DEVICE_TYPES.map((device) => {
                      const Icon = device.icon;
                      const isChecked = formData.device_types.includes(device.value);
                      return (
                        <div
                          key={device.value}
                          onClick={() => handleDeviceToggle(device.value)}
                          className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${
                            isChecked 
                              ? 'border-primary bg-primary/10 text-primary' 
                              : 'border-border hover:border-primary/50'
                          }`}
                        >
                          <Checkbox checked={isChecked} className="pointer-events-none" />
                          <Icon className="h-4 w-4" />
                          <span className="text-sm">{device.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* App Source */}
              {!formData.is_gerencia_app && (
                <div className="space-y-2">
                  <Label htmlFor="app_source">Origem do Aplicativo</Label>
                  <Select
                    value={formData.app_source}
                    onValueChange={(value) => setFormData(prev => ({ 
                      ...prev, 
                      app_source: value as FormData['app_source'] 
                    }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {APP_SOURCES.map((source) => {
                        const Icon = source.icon;
                        return (
                          <SelectItem key={source.value} value={source.value}>
                            <div className="flex items-center gap-2">
                              <Icon className="h-4 w-4" />
                              <span>{source.label}</span>
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Download URL */}
              <div className="space-y-2">
                <Label htmlFor="download_url">
                  {formData.app_source === 'play_store' 
                    ? 'Link da Play Store' 
                    : formData.app_source === 'app_store'
                    ? 'Link da App Store'
                    : 'Link de Download'
                  }
                </Label>
                <Input
                  id="download_url"
                  type="url"
                  value={formData.download_url}
                  onChange={(e) => setFormData(prev => ({ ...prev, download_url: e.target.value }))}
                  placeholder={
                    formData.app_source === 'play_store' 
                      ? 'https://play.google.com/store/apps/...'
                      : formData.app_source === 'app_store'
                      ? 'https://apps.apple.com/...'
                      : 'https://exemplo.com/download.apk'
                  }
                />
              </div>

              {/* Downloader Code */}
              <div className="space-y-2">
                <Label htmlFor="downloader_code">Código Downloader (opcional)</Label>
                <Input
                  id="downloader_code"
                  value={formData.downloader_code}
                  onChange={(e) => setFormData(prev => ({ ...prev, downloader_code: e.target.value }))}
                  placeholder="Ex: 12345"
                />
                <p className="text-xs text-muted-foreground">
                  🔢 Código para baixar via app Downloader
                </p>
              </div>

              {/* Server Association - Only show if not Gerencia App */}
              {!formData.is_gerencia_app && servers.length > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="server_id">Servidor Associado (opcional)</Label>
                  <Select
                    value={formData.server_id}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, server_id: value === 'none' ? '' : value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Nenhum servidor específico" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum servidor específico</SelectItem>
                      {servers.map((server) => (
                        <SelectItem key={server.id} value={server.id}>
                          {server.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Status */}
              <div className="flex items-center justify-between p-4 rounded-lg border">
                <div className="space-y-0.5">
                  <Label htmlFor="is_active" className="cursor-pointer">Status</Label>
                  <p className="text-xs text-muted-foreground">
                    {formData.is_active ? 'Ativo - será exibido para seleção' : 'Inativo - não será exibido'}
                  </p>
                </div>
                <Switch
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))}
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancelar
                </Button>
                <Button 
                  type="submit" 
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {(createMutation.isPending || updateMutation.isPending) && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  {editingApp ? 'Salvar Alterações' : 'Cadastrar'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search and Tabs */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar aplicativos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'all' | 'gerencia')}>
          <TabsList>
            <TabsTrigger value="all">Todos os Apps</TabsTrigger>
            <TabsTrigger value="gerencia">Gerencia App</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-2xl font-bold">{apps.length}</div>
          <div className="text-sm text-muted-foreground">Total de Apps</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold text-green-500">
            {apps.filter(a => a.is_active).length}
          </div>
          <div className="text-sm text-muted-foreground">Ativos</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold text-blue-500">
            {apps.filter(a => a.is_gerencia_app).length}
          </div>
          <div className="text-sm text-muted-foreground">Gerencia Apps</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold text-purple-500">
            {apps.filter(a => a.server_id).length}
          </div>
          <div className="text-sm text-muted-foreground">Com Servidor</div>
        </Card>
      </div>

      {/* Apps List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredApps.length === 0 ? (
        <Card className="p-12 text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="p-4 rounded-full bg-muted">
              <Smartphone className="h-8 w-8 text-muted-foreground" />
            </div>
            <div>
              <h3 className="font-medium">Nenhum aplicativo encontrado</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {search ? 'Tente outra busca' : 'Cadastre seu primeiro aplicativo'}
              </p>
            </div>
            {!search && (
              <Button onClick={() => setIsDialogOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Cadastrar Aplicativo
              </Button>
            )}
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredApps.map((app) => {
            const SourceIcon = getSourceIcon(app.app_source);
            return (
              <Card key={app.id} className={`relative ${!app.is_active ? 'opacity-60' : ''}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{app.icon}</span>
                      <div>
                        <CardTitle className="text-base">{app.name}</CardTitle>
                        {app.company_name && (
                          <CardDescription className="text-xs">
                            {app.company_name}
                          </CardDescription>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {app.is_active ? (
                        <Badge variant="default" className="text-xs bg-green-500/20 text-green-500 border-green-500/50">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Ativo
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">
                          <XCircle className="h-3 w-3 mr-1" />
                          Inativo
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Type badges */}
                  <div className="flex flex-wrap gap-1">
                    {app.is_gerencia_app && (
                      <Badge variant="outline" className="text-xs bg-blue-500/10 border-blue-500/30">
                        <Settings2 className="h-3 w-3 mr-1" />
                        Gerencia App
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-xs">
                      <SourceIcon className="h-3 w-3 mr-1" />
                      {APP_SOURCES.find(s => s.value === app.app_source)?.label}
                    </Badge>
                  </div>

                  {/* Device compatibility */}
                  {!app.is_gerencia_app && app.device_types.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {app.device_types.map((deviceType) => {
                        const DeviceIcon = getDeviceIcon(deviceType);
                        const deviceLabel = DEVICE_TYPES.find(d => d.value === deviceType)?.label;
                        return (
                          <Badge key={deviceType} variant="secondary" className="text-xs">
                            <DeviceIcon className="h-3 w-3 mr-1" />
                            {deviceLabel}
                          </Badge>
                        );
                      })}
                    </div>
                  )}

                  {/* Server */}
                  {app.servers?.name && (
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <Monitor className="h-3 w-3" />
                      Servidor: {app.servers.name}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-2 border-t">
                    {app.download_url && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 text-xs"
                          onClick={() => copyToClipboard(app.download_url!)}
                        >
                          <Copy className="h-3 w-3 mr-1" />
                          Copiar Link
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(app.download_url!, '_blank')}
                        >
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      </>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(app)}
                    >
                      <Edit className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        confirm({
                          title: 'Excluir app',
                          description: `Deseja excluir o aplicativo "${app.name}"?`,
                          confirmText: 'Excluir',
                          variant: 'destructive',
                          onConfirm: () => deleteMutation.mutate(app.id),
                        });
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      
      {/* Global Confirm Dialog */}
      <ConfirmDialog {...dialogProps} />
    </div>
  );
}
