import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
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
import { Plus, Trash2, Edit, ExternalLink, Key, Mail, Monitor, Loader2, AppWindow } from 'lucide-react';
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
}

export function ExternalAppsManager() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
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

  const { data: apps = [], isLoading } = useQuery({
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

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; website_url: string; auth_type: 'mac_key' | 'email_password' }) => {
      const { error } = await supabase.from('external_apps').insert([{
        ...data,
        website_url: data.website_url || null,
        seller_id: user!.id,
      }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['external-apps'] });
      toast.success('Aplicativo cadastrado!');
      resetForm();
      setIsDialogOpen(false);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ExternalApp> }) => {
      const { error } = await supabase.from('external_apps').update(data).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['external-apps'] });
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
      queryClient.invalidateQueries({ queryKey: ['external-apps'] });
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
      price: app.price || 0,
      cost: app.cost || 0,
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
      ) : apps.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-8 text-center">
            <AppWindow className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">
              Nenhum aplicativo cadastrado ainda.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Cadastre apps como IBO PRO, Bob Player para vincular aos clientes.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {apps.map((app) => (
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
                      {(app.price > 0 || app.cost > 0) && (
                        <Badge variant="secondary" className="text-xs">
                          Lucro: R$ {((app.price || 0) - (app.cost || 0)).toFixed(2)}
                        </Badge>
                      )}
                    </div>
                    {(app.price > 0 || app.cost > 0) && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Venda: R$ {(app.price || 0).toFixed(2)} | Custo: R$ {(app.cost || 0).toFixed(2)}
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
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => {
                        if (confirm(`Remover o app "${app.name}"?`)) {
                          deleteMutation.mutate(app.id);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default ExternalAppsManager;
