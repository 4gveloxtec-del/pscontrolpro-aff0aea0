import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
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
import { Plus, Smartphone, Edit, Trash2, ExternalLink, Handshake, Package, Download, Hash } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ServerApp {
  id: string;
  seller_id: string;
  server_id: string;
  name: string;
  app_type: 'own' | 'partnership';
  icon: string;
  website_url: string | null;
  download_url: string | null;
  downloader_code: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  // New fields for partner apps
  auth_type: 'code' | 'user_password' | 'provider_user_password';
  provider_name: string | null;
  compatible_devices: string[];
}

const DEVICE_TYPE_OPTIONS = [
  { value: 'smart_tv', label: 'Smart TV' },
  { value: 'tv_box', label: 'TV Box / Android TV' },
  { value: 'celular', label: 'Celular' },
  { value: 'pc', label: 'PC / Notebook' },
  { value: 'fire_stick', label: 'Fire Stick' },
  { value: 'projetor', label: 'Projetor' },
];

interface ServerAppsManagerProps {
  serverId: string;
  serverName: string;
  isOpen: boolean;
  onClose: () => void;
}

const EMOJI_OPTIONS = ['📱', '📺', '🎬', '🎮', '📡', '🌐', '💎', '⭐', '🔥', '🚀'];

export function ServerAppsManager({ serverId, serverName, isOpen, onClose }: ServerAppsManagerProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { dialogProps, confirm } = useConfirmDialog();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingApp, setEditingApp] = useState<ServerApp | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    app_type: 'own' as 'own' | 'partnership',
    icon: '📱',
    website_url: '',
    download_url: '',
    downloader_code: '',
    notes: '',
    is_active: true,
    auth_type: 'code' as 'code' | 'user_password' | 'provider_user_password',
    provider_name: '',
    compatible_devices: ['smart_tv', 'tv_box', 'celular', 'pc', 'fire_stick', 'projetor'] as string[],
  });

  // Fetch server apps
  // AUDIT FIX: Added isError guard for ServerAppsManager
  const { data: serverApps = [], isLoading, isError } = useQuery({
    queryKey: ['server-apps', serverId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('server_apps' as any)
        .select('*')
        .eq('server_id', serverId)
        .order('name');
      if (error) throw error;
      return (data || []) as unknown as ServerApp[];
    },
    enabled: isOpen && !!serverId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: Omit<ServerApp, 'id' | 'created_at' | 'seller_id'>) => {
      const { error } = await supabase.from('server_apps' as any).insert([{
        ...data,
        seller_id: user!.id,
      }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['server-apps', serverId] });
      toast.success('App criado com sucesso!');
      resetForm();
      setIsFormOpen(false);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ServerApp> }) => {
      const { error } = await supabase.from('server_apps' as any).update(data).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['server-apps', serverId] });
      toast.success('App atualizado!');
      resetForm();
      setIsFormOpen(false);
      setEditingApp(null);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('server_apps' as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['server-apps', serverId] });
      toast.success('App excluído!');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const resetForm = () => {
    setFormData({
      name: '',
      app_type: 'own',
      icon: '📱',
      website_url: '',
      download_url: '',
      downloader_code: '',
      notes: '',
      is_active: true,
      auth_type: 'code',
      provider_name: '',
      compatible_devices: ['smart_tv', 'tv_box', 'celular', 'pc', 'fire_stick', 'projetor'],
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      server_id: serverId,
      name: formData.name,
      app_type: formData.app_type,
      icon: formData.icon,
      website_url: formData.website_url || null,
      download_url: formData.download_url || null,
      downloader_code: formData.downloader_code || null,
      notes: formData.notes || null,
      is_active: formData.is_active,
      auth_type: formData.auth_type,
      provider_name: formData.provider_name || null,
      compatible_devices: formData.compatible_devices,
    };

    if (editingApp) {
      updateMutation.mutate({ id: editingApp.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (app: ServerApp) => {
    setEditingApp(app);
    setFormData({
      name: app.name,
      app_type: app.app_type,
      icon: app.icon,
      website_url: app.website_url || '',
      download_url: app.download_url || '',
      downloader_code: app.downloader_code || '',
      notes: app.notes || '',
      is_active: app.is_active,
      auth_type: app.auth_type || 'code',
      provider_name: app.provider_name || '',
      compatible_devices: app.compatible_devices || ['smart_tv', 'tv_box', 'celular', 'pc', 'fire_stick', 'projetor'],
    });
    setIsFormOpen(true);
  };

  const ownApps = serverApps.filter(a => a.app_type === 'own');
  const partnershipApps = serverApps.filter(a => a.app_type === 'partnership');

  // AUDIT FIX: Error state guard
  if (isError) {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5" />
              Apps do Servidor - {serverName}
            </DialogTitle>
          </DialogHeader>
          <div className="py-8 text-center text-destructive">
            <p>Erro ao carregar apps. Tente novamente.</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={onClose}>
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[95vw] max-w-2xl max-h-[85vh] overflow-y-auto p-3 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm sm:text-base">
            <Smartphone className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
            <span className="truncate">Apps do Servidor - {serverName}</span>
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            Gerencie os aplicativos próprios e de parceria deste servidor
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Add App Button */}
          <div className="flex justify-end">
            <Dialog open={isFormOpen} onOpenChange={(open) => {
              setIsFormOpen(open);
              if (!open) {
                setEditingApp(null);
                resetForm();
              }
            }}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-2">
                  <Plus className="h-4 w-4" />
                  Novo App
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingApp ? 'Editar App' : 'Novo App'}</DialogTitle>
                  <DialogDescription>
                    {editingApp ? 'Atualize os dados do aplicativo' : 'Adicione um novo aplicativo ao servidor'}
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nome do App *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                      placeholder="Ex: PlayTV, StarApp"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="app_type">Tipo do App *</Label>
                    <Select
                      value={formData.app_type}
                      onValueChange={(v) => setFormData({ ...formData, app_type: v as 'own' | 'partnership' })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="own">
                          <div className="flex items-center gap-2">
                            <Package className="h-4 w-4" />
                            App Próprio
                          </div>
                        </SelectItem>
                        <SelectItem value="partnership">
                          <div className="flex items-center gap-2">
                            <Handshake className="h-4 w-4" />
                            App Parceria
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Auth Type - Only for Partnership Apps */}
                  {formData.app_type === 'partnership' && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="auth_type">Tipo de Autenticação *</Label>
                        <Select
                          value={formData.auth_type}
                          onValueChange={(v) => setFormData({ ...formData, auth_type: v as 'code' | 'user_password' | 'provider_user_password' })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="code">
                              <div className="flex items-center gap-2">
                                <Hash className="h-4 w-4" />
                                Código (Ex: code: tes41)
                              </div>
                            </SelectItem>
                            <SelectItem value="user_password">
                              <div className="flex items-center gap-2">
                                <Package className="h-4 w-4" />
                                Usuário + Senha
                              </div>
                            </SelectItem>
                            <SelectItem value="provider_user_password">
                              <div className="flex items-center gap-2">
                                <Handshake className="h-4 w-4" />
                                Provedor + Usuário + Senha
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {formData.auth_type === 'provider_user_password' && (
                        <div className="space-y-2">
                          <Label htmlFor="provider_name">Nome do Provedor</Label>
                          <Input
                            id="provider_name"
                            value={formData.provider_name}
                            onChange={(e) => setFormData({ ...formData, provider_name: e.target.value })}
                            placeholder="Ex: suquita34"
                          />
                          <p className="text-xs text-muted-foreground">
                            Nome do provedor padrão para este app (pode ser alterado por cliente)
                          </p>
                        </div>
                      )}

                      <div className="space-y-2">
                        <Label>Aparelhos Compatíveis</Label>
                        <div className="grid grid-cols-2 gap-2">
                          {DEVICE_TYPE_OPTIONS.map((device) => {
                            const isSelected = formData.compatible_devices.includes(device.value);
                            return (
                              <label
                                key={device.value}
                                className="flex items-center gap-2 p-2 rounded-md border cursor-pointer hover:bg-muted/50"
                              >
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={(e) => {
                                    const newDevices = e.target.checked
                                      ? [...formData.compatible_devices, device.value]
                                      : formData.compatible_devices.filter(d => d !== device.value);
                                    setFormData({ ...formData, compatible_devices: newDevices });
                                  }}
                                  className="rounded border-muted"
                                />
                                <span className="text-sm">{device.label}</span>
                              </label>
                            );
                          })}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Selecione os tipos de aparelho compatíveis com este app
                        </p>
                      </div>
                    </>
                  )}

                  <div className="space-y-2">
                    <Label>Ícone</Label>
                    <div className="flex flex-wrap gap-2">
                      {EMOJI_OPTIONS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => setFormData({ ...formData, icon: emoji })}
                          className={cn(
                            "w-10 h-10 rounded-lg text-xl flex items-center justify-center transition-all",
                            formData.icon === emoji
                              ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2"
                              : "bg-muted hover:bg-muted/80"
                          )}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="website_url">URL do Site</Label>
                    <Input
                      id="website_url"
                      type="url"
                      value={formData.website_url}
                      onChange={(e) => setFormData({ ...formData, website_url: e.target.value })}
                      placeholder="https://app.exemplo.com"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="download_url">Link de Download</Label>
                    <Input
                      id="download_url"
                      type="url"
                      value={formData.download_url}
                      onChange={(e) => setFormData({ ...formData, download_url: e.target.value })}
                      placeholder="https://exemplo.com/app.apk"
                    />
                    <p className="text-xs text-muted-foreground">
                      📱 Funciona para: Android TV Box, Android TV e Celular Android
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="downloader_code">Código Downloader</Label>
                    <Input
                      id="downloader_code"
                      value={formData.downloader_code}
                      onChange={(e) => setFormData({ ...formData, downloader_code: e.target.value })}
                      placeholder="Ex: 12345"
                    />
                    <p className="text-xs text-muted-foreground">
                      🔢 Código para baixar via app Downloader (cada servidor pode ter o seu)
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="notes">Observações</Label>
                    <Input
                      id="notes"
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      placeholder="Notas sobre o app"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label htmlFor="is_active">App Ativo</Label>
                    <Switch
                      id="is_active"
                      checked={formData.is_active}
                      onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                    />
                  </div>

                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                      {editingApp ? 'Salvar' : 'Criar App'}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {/* Loading State */}
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
              ))}
            </div>
          ) : serverApps.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-8">
                <Smartphone className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-muted-foreground text-center">
                  Nenhum app cadastrado para este servidor
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Own Apps */}
              {ownApps.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium flex items-center gap-2">
                    <Package className="h-4 w-4" />
                    Apps Próprios ({ownApps.length})
                  </h3>
                  <div className="grid gap-2">
                    {ownApps.map((app) => (
                      <AppCard 
                        key={app.id} 
                        app={app} 
                        onEdit={handleEdit} 
                        onDelete={(app) => {
                          confirm({
                            title: 'Excluir app',
                            description: `Tem certeza que deseja excluir o app "${app.name}"?`,
                            confirmText: 'Excluir',
                            variant: 'destructive',
                            onConfirm: () => deleteMutation.mutate(app.id),
                          });
                        }} 
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Partnership Apps */}
              {partnershipApps.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium flex items-center gap-2">
                    <Handshake className="h-4 w-4" />
                    Apps Parceria ({partnershipApps.length})
                  </h3>
                  <div className="grid gap-2">
                    {partnershipApps.map((app) => (
                      <AppCard 
                        key={app.id} 
                        app={app} 
                        onEdit={handleEdit} 
                        onDelete={(app) => {
                          confirm({
                            title: 'Excluir app',
                            description: `Tem certeza que deseja excluir o app "${app.name}"?`,
                            confirmText: 'Excluir',
                            variant: 'destructive',
                            onConfirm: () => deleteMutation.mutate(app.id),
                          });
                        }} 
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
      
      {/* Global Confirm Dialog */}
      <ConfirmDialog {...dialogProps} />
    </Dialog>
  );
}

// App Card Component
function AppCard({ 
  app, 
  onEdit, 
  onDelete
}: { 
  app: ServerApp; 
  onEdit: (app: ServerApp) => void; 
  onDelete: (app: ServerApp) => void;
}) {
  return (
    <div className={cn(
      "flex items-center justify-between p-3 rounded-lg border",
      app.is_active ? "bg-card" : "bg-muted/50 opacity-60"
    )}>
      <div className="flex items-center gap-3">
        <span className="text-2xl">{app.icon}</span>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium">{app.name}</span>
            <Badge variant={app.app_type === 'own' ? 'default' : 'secondary'} className="text-xs">
              {app.app_type === 'own' ? 'Próprio' : 'Parceria'}
            </Badge>
            {!app.is_active && (
              <Badge variant="outline" className="text-xs">Inativo</Badge>
            )}
          </div>
          {app.notes && (
            <p className="text-xs text-muted-foreground">{app.notes}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1">
        {app.downloader_code && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-purple-600 hover:text-purple-700"
            onClick={() => {
              navigator.clipboard.writeText(app.downloader_code!);
              toast.success('Código copiado!');
            }}
            title={`Código: ${app.downloader_code}`}
          >
            <Hash className="h-4 w-4" />
          </Button>
        )}
        {app.download_url && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-green-600 hover:text-green-700"
            onClick={() => window.open(app.download_url!, '_blank')}
            title="Download APK"
          >
            <Download className="h-4 w-4" />
          </Button>
        )}
        {app.website_url && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => window.open(app.website_url!, '_blank')}
            title="Abrir Site"
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => onEdit(app)}
        >
          <Edit className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive hover:text-destructive"
          onClick={() => onDelete(app)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
