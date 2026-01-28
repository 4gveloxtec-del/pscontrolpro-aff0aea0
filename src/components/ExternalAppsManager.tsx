import { useState, useMemo, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Plus, Trash2, Edit, ExternalLink, Key, Mail, Monitor, Loader2, AppWindow, Lock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export interface ExternalApp {
  id: string;
  name: string;
  website_url: string | null;
  download_url: string | null;
  auth_type: 'mac_key' | 'email_password';
  is_active: boolean;
  seller_id: string;
  price: number;
  cost: number;
  icon?: string | null;
  downloader_code?: string | null;
  isFixed?: boolean;
}

// Apps fixos visíveis para todos os revendedores - NÃO podem ser editados ou removidos
const FIXED_EXTERNAL_APPS: ExternalApp[] = [
  // Apps em destaque (principais)
  { id: 'fixed-clouddy', name: 'CLOUDDY', website_url: 'https://clouddy.online/', download_url: null, auth_type: 'mac_key', is_active: true, seller_id: 'system', price: 0, cost: 0, isFixed: true },
  { id: 'fixed-ibo-pro', name: 'IBO PRO', website_url: 'https://iboproapp.com/', download_url: null, auth_type: 'mac_key', is_active: true, seller_id: 'system', price: 0, cost: 0, isFixed: true },
  { id: 'fixed-ibo-player', name: 'IBO PLAYER', website_url: 'https://iboplayer.com/', download_url: null, auth_type: 'mac_key', is_active: true, seller_id: 'system', price: 0, cost: 0, isFixed: true },
  { id: 'fixed-smartone', name: 'SMARTONE', website_url: 'https://smartone-iptv.com/', download_url: null, auth_type: 'mac_key', is_active: true, seller_id: 'system', price: 0, cost: 0, isFixed: true },
  // Demais apps em ordem alfabética
  { id: 'fixed-abe-player', name: 'ABE PLAYER', website_url: 'https://abeplayertv.com/', download_url: null, auth_type: 'mac_key', is_active: true, seller_id: 'system', price: 0, cost: 0, isFixed: true },
  { id: 'fixed-all-player', name: 'ALL PLAYER', website_url: 'https://iptvallplayer.com/', download_url: null, auth_type: 'mac_key', is_active: true, seller_id: 'system', price: 0, cost: 0, isFixed: true },
  { id: 'fixed-bay-iptv', name: 'BAY IPTV', website_url: 'https://cms.bayip.tv/user/manage/playlist', download_url: null, auth_type: 'mac_key', is_active: true, seller_id: 'system', price: 0, cost: 0, isFixed: true },
  { id: 'fixed-bob-player', name: 'BOB PLAYER', website_url: 'https://bobplayer.com/', download_url: null, auth_type: 'mac_key', is_active: true, seller_id: 'system', price: 0, cost: 0, isFixed: true },
  { id: 'fixed-duplecast', name: 'DUPLECAST', website_url: 'https://duplecast.com/', download_url: null, auth_type: 'mac_key', is_active: true, seller_id: 'system', price: 0, cost: 0, isFixed: true },
  { id: 'fixed-duplex-play', name: 'DUPLEX PLAY', website_url: 'https://edit.duplexplay.com/Default', download_url: null, auth_type: 'mac_key', is_active: true, seller_id: 'system', price: 0, cost: 0, isFixed: true },
  { id: 'fixed-easy-player', name: 'EASY PLAYER', website_url: 'https://easyplayer.io/#/home', download_url: null, auth_type: 'mac_key', is_active: true, seller_id: 'system', price: 0, cost: 0, isFixed: true },
  { id: 'fixed-family-player', name: 'FAMILY PLAYER', website_url: 'https://www.family4kplayer.com/', download_url: null, auth_type: 'mac_key', is_active: true, seller_id: 'system', price: 0, cost: 0, isFixed: true },
  { id: 'fixed-hot-iptv', name: 'HOT IPTV', website_url: 'https://hotplayer.app/', download_url: null, auth_type: 'mac_key', is_active: true, seller_id: 'system', price: 0, cost: 0, isFixed: true },
  { id: 'fixed-hush-play', name: 'HUSH PLAY', website_url: 'https://www.hushplayer.com/', download_url: null, auth_type: 'mac_key', is_active: true, seller_id: 'system', price: 0, cost: 0, isFixed: true },
  { id: 'fixed-iboss-player', name: 'IBOSS PLAYER', website_url: 'https://ibossiptv.com/', download_url: null, auth_type: 'mac_key', is_active: true, seller_id: 'system', price: 0, cost: 0, isFixed: true },
  { id: 'fixed-iboxx-player', name: 'IBOXX PLAYER', website_url: 'https://iboxxiptv.com/', download_url: null, auth_type: 'mac_key', is_active: true, seller_id: 'system', price: 0, cost: 0, isFixed: true },
  { id: 'fixed-king4k-player', name: 'KING4K PLAYER', website_url: 'https://king4kplayer.com/', download_url: null, auth_type: 'mac_key', is_active: true, seller_id: 'system', price: 0, cost: 0, isFixed: true },
  { id: 'fixed-ktn-player', name: 'KTN PLAYER', website_url: 'https://ktntvplayer.com/', download_url: null, auth_type: 'mac_key', is_active: true, seller_id: 'system', price: 0, cost: 0, isFixed: true },
  { id: 'fixed-lumina-player', name: 'LUMINA PLAYER', website_url: 'https://luminaplayer.com/#/home', download_url: null, auth_type: 'mac_key', is_active: true, seller_id: 'system', price: 0, cost: 0, isFixed: true },
  { id: 'fixed-mac-player', name: 'MAC PLAYER', website_url: 'https://mactvplayer.com/', download_url: null, auth_type: 'mac_key', is_active: true, seller_id: 'system', price: 0, cost: 0, isFixed: true },
  { id: 'fixed-mika-player', name: 'MIKA PLAYER', website_url: 'https://mikaplayer.com/', download_url: null, auth_type: 'mac_key', is_active: true, seller_id: 'system', price: 0, cost: 0, isFixed: true },
  { id: 'fixed-quick-player', name: 'QUICK PLAYER', website_url: 'https://quickplayer.app/#/home', download_url: null, auth_type: 'mac_key', is_active: true, seller_id: 'system', price: 0, cost: 0, isFixed: true },
  { id: 'fixed-rivolut-player', name: 'RIVOLUT PLAYER', website_url: 'https://rivolutplayer.com/', download_url: null, auth_type: 'mac_key', is_active: true, seller_id: 'system', price: 0, cost: 0, isFixed: true },
  { id: 'fixed-virginia-player', name: 'VIRGINIA PLAYER', website_url: 'https://virginia-player.com/', download_url: null, auth_type: 'mac_key', is_active: true, seller_id: 'system', price: 0, cost: 0, isFixed: true },
  { id: 'fixed-vu-player-pro', name: 'VU PLAYER PRO', website_url: 'https://vuplayer.pro/reseller/login', download_url: null, auth_type: 'mac_key', is_active: true, seller_id: 'system', price: 0, cost: 0, isFixed: true },
];

export function ExternalAppsManager() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { dialogProps, confirm } = useConfirmDialog();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingApp, setEditingApp] = useState<ExternalApp | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    website_url: '',
    download_url: '',
    auth_type: 'mac_key' as 'mac_key' | 'email_password',
    price: 0,
    cost: 0,
  });

  const { data: customApps = [], isLoading, isError } = useQuery({
    queryKey: ['external-apps', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('external_apps')
        .select('*')
        .eq('seller_id', user!.id)
        .order('name');
      if (error) throw error;
      return data as ExternalApp[];
    },
    enabled: !!user?.id,
  });

  // Helper: validar URL
  const isValidUrl = useCallback((url: string): boolean => {
    if (!url) return true; // URLs vazias são permitidas
    try {
      const parsed = new URL(url);
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  }, []);

  // Helper: verificar nome duplicado
  const isNameDuplicate = useCallback((name: string, excludeId?: string): boolean => {
    const trimmedName = name.trim().toLowerCase();
    
    // Verificar nos apps fixos
    const fixedDuplicate = FIXED_EXTERNAL_APPS.some(
      app => app.name.toLowerCase() === trimmedName
    );
    if (fixedDuplicate) return true;
    
    // Verificar nos apps customizados
    return customApps.some(
      app => app.name.toLowerCase() === trimmedName && app.id !== excludeId
    );
  }, [customApps]);

  // Helper: safe number parsing
  const safeNumber = (value: number | undefined | null): number => {
    const num = Number(value);
    return isNaN(num) ? 0 : Math.round(num * 100) / 100;
  };

  const createMutation = useMutation({
    mutationFn: async (data: { 
      name: string; 
      website_url: string; 
      download_url: string;
      auth_type: 'mac_key' | 'email_password';
      price: number;
      cost: number;
    }) => {
      const trimmedName = data.name.trim();
      
      // Validações
      if (!trimmedName) {
        throw new Error('Nome do app é obrigatório');
      }
      
      if (isNameDuplicate(trimmedName)) {
        throw new Error('Já existe um app com este nome');
      }
      
      if (data.website_url && !isValidUrl(data.website_url)) {
        throw new Error('URL do site inválida');
      }
      
      if (data.download_url && !isValidUrl(data.download_url)) {
        throw new Error('URL de download inválida');
      }
      
      const { error } = await supabase.from('external_apps').insert([{
        name: trimmedName,
        website_url: data.website_url.trim() || null,
        download_url: data.download_url.trim() || null,
        auth_type: data.auth_type,
        price: safeNumber(data.price),
        cost: safeNumber(data.cost),
        seller_id: user!.id,
        is_active: true,
      }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['external-apps', user?.id] });
      toast.success('Aplicativo cadastrado!');
      resetForm();
      setIsDialogOpen(false);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const trimmedName = data.name.trim();
      
      // Validações
      if (!trimmedName) {
        throw new Error('Nome do app é obrigatório');
      }
      
      if (isNameDuplicate(trimmedName, id)) {
        throw new Error('Já existe um app com este nome');
      }
      
      if (data.website_url && !isValidUrl(data.website_url)) {
        throw new Error('URL do site inválida');
      }
      
      if (data.download_url && !isValidUrl(data.download_url)) {
        throw new Error('URL de download inválida');
      }
      
      const { error } = await supabase.from('external_apps').update({
        name: trimmedName,
        website_url: data.website_url.trim() || null,
        download_url: data.download_url.trim() || null,
        auth_type: data.auth_type,
        price: safeNumber(data.price),
        cost: safeNumber(data.cost),
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['external-apps', user?.id] });
      toast.success('Aplicativo atualizado!');
      resetForm();
      setIsDialogOpen(false);
      setEditingApp(null);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('external_apps').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['external-apps', user?.id] });
      toast.success('Aplicativo removido!');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const resetForm = () => {
    setFormData({
      name: '',
      website_url: '',
      download_url: '',
      auth_type: 'mac_key',
      price: 0,
      cost: 0,
    });
    setEditingApp(null);
  };

  const handleEdit = (app: ExternalApp) => {
    setEditingApp(app);
    setFormData({
      name: app.name,
      website_url: app.website_url || '',
      download_url: app.download_url || '',
      auth_type: app.auth_type,
      price: safeNumber(app.price),
      cost: safeNumber(app.cost),
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingApp) {
      updateMutation.mutate({
        id: editingApp.id,
        data: formData,
      });
    } else {
      createMutation.mutate(formData);
    }
  };

  // Error state guard
  if (isError) {
    return (
      <div className="p-4 text-center">
        <p className="text-destructive font-medium">Erro ao carregar apps</p>
        <p className="text-muted-foreground text-sm">Tente recarregar a página</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <AppWindow className="h-4 w-4" />
            Apps Externos Cadastrados
          </h3>
          <p className="text-sm text-muted-foreground">
            Cadastre apps como IBO PRO, Bob Player, etc.
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              Novo App
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingApp ? 'Editar Aplicativo' : 'Novo Aplicativo'}</DialogTitle>
              <DialogDescription>
                {editingApp ? 'Atualize os dados do aplicativo' : 'Cadastre um novo aplicativo externo'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome do App *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: IBO PRO, Bob Player..."
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="website_url">Link do Site (opcional)</Label>
                <Input
                  id="website_url"
                  type="url"
                  value={formData.website_url}
                  onChange={(e) => setFormData({ ...formData, website_url: e.target.value })}
                  placeholder="https://exemplo.com"
                />
                <p className="text-xs text-muted-foreground">
                  Link oficial do site do aplicativo para ativação
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="download_url">Link de Download (opcional)</Label>
                <Input
                  id="download_url"
                  type="url"
                  value={formData.download_url}
                  onChange={(e) => setFormData({ ...formData, download_url: e.target.value })}
                  placeholder="https://exemplo.com/download"
                />
                <p className="text-xs text-muted-foreground">
                  Link para enviar ao cliente baixar o app. Use nos templates: <code className="bg-muted px-1 rounded">{'{link_download_app}'}</code>
                </p>
              </div>
              <div className="space-y-2">
                <Label>Tipo de Autenticação *</Label>
                <Select
                  value={formData.auth_type}
                  onValueChange={(value: 'mac_key' | 'email_password') => 
                    setFormData({ ...formData, auth_type: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mac_key">
                      <div className="flex items-center gap-2">
                        <Monitor className="h-4 w-4" />
                        MAC + Device Key
                      </div>
                    </SelectItem>
                    <SelectItem value="email_password">
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4" />
                        E-mail + Senha
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {formData.auth_type === 'mac_key' 
                    ? 'O cliente usará MAC e Device Key para ativar'
                    : 'O cliente usará E-mail e Senha para login'}
                </p>
              </div>
              
              {/* Price and Cost fields */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="price">Preço de Venda (R$)</Label>
                  <Input
                    id="price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                    placeholder="35,00"
                  />
                  <p className="text-xs text-muted-foreground">
                    Quanto você cobra do cliente
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cost">Custo de Ativação (R$)</Label>
                  <Input
                    id="cost"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.cost}
                    onChange={(e) => setFormData({ ...formData, cost: parseFloat(e.target.value) || 0 })}
                    placeholder="15,00"
                  />
                  <p className="text-xs text-muted-foreground">
                    Quanto você paga pela ativação
                  </p>
                </div>
              </div>
              {formData.price > 0 && formData.cost >= 0 && (
                <div className="p-2 rounded bg-green-500/10 border border-green-500/20 text-center">
                  <p className="text-xs text-muted-foreground">Lucro por venda</p>
                  <p className="text-lg font-bold text-green-600">
                    R$ {(formData.price - formData.cost).toFixed(2)}
                  </p>
                </div>
              )}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {(createMutation.isPending || updateMutation.isPending) && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  {editingApp ? 'Salvar' : 'Cadastrar'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Apps Fixos do Sistema */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-muted-foreground" />
              <h4 className="font-medium text-sm text-muted-foreground">Apps do Sistema (Não editáveis)</h4>
            </div>
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {FIXED_EXTERNAL_APPS.map((app) => (
                <Card key={app.id} className="relative border-dashed">
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Lock className="h-3 w-3 text-muted-foreground shrink-0" />
                        <h4 className="font-medium text-sm truncate">{app.name}</h4>
                      </div>
                      {app.website_url && (
                        <a
                          href={app.website_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline flex items-center gap-1 shrink-0"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Apps Personalizados do Revendedor */}
          <div className="space-y-3">
            <h4 className="font-medium text-sm">Meus Apps Personalizados</h4>
            {customApps.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-6 text-center">
                  <AppWindow className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Nenhum app personalizado cadastrado.
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Clique em "Novo App" para adicionar seus próprios apps.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {customApps.map((app) => (
                  <Card key={app.id} className="relative">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1 flex-1 min-w-0">
                          <h4 className="font-medium truncate">{app.name}</h4>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {app.auth_type === 'mac_key' ? (
                                <><Monitor className="h-3 w-3 mr-1" /> MAC + Key</>
                              ) : (
                                <><Mail className="h-3 w-3 mr-1" /> E-mail</>
                              )}
                            </Badge>
                            {(safeNumber(app.price) > 0 || safeNumber(app.cost) > 0) && (
                              <Badge variant="secondary" className="text-xs">
                                Lucro: R$ {(safeNumber(app.price) - safeNumber(app.cost)).toFixed(2)}
                              </Badge>
                            )}
                          </div>
                          {(safeNumber(app.price) > 0 || safeNumber(app.cost) > 0) && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Venda: R$ {safeNumber(app.price).toFixed(2)} | Custo: R$ {safeNumber(app.cost).toFixed(2)}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-2 mt-2">
                            {app.website_url && (
                              <a
                                href={app.website_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-primary hover:underline flex items-center gap-1"
                              >
                                <ExternalLink className="h-3 w-3" />
                                Site
                              </a>
                            )}
                            {app.download_url && (
                              <a
                                href={app.download_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-green-600 hover:underline flex items-center gap-1"
                              >
                                <ExternalLink className="h-3 w-3" />
                                Download
                              </a>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleEdit(app)}
                            disabled={updateMutation.isPending}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            disabled={deleteMutation.isPending}
                            onClick={() => {
                              confirm({
                                title: 'Remover app',
                                description: `Tem certeza que deseja remover o app "${app.name}"?`,
                                confirmText: 'Remover',
                                variant: 'destructive',
                                onConfirm: () => deleteMutation.mutate(app.id),
                              });
                            }}
                          >
                            {deleteMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Global Confirm Dialog */}
      <ConfirmDialog {...dialogProps} />
    </div>
  );
}

export default ExternalAppsManager;
