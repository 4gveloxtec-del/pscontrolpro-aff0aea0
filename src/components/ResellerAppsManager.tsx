import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabaseExternal as supabase } from '@/lib/supabase-external';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Trash2, Edit, Smartphone, Save } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface ResellerApp {
  id: string;
  name: string;
  icon: string;
  seller_id: string;
  is_active: boolean;
}

const EMOJI_OPTIONS = ['📱', '📺', '🎬', '🎮', '📡', '🌐', '⚡', '🔥', '💎', '🎯'];

interface ResellerAppsManagerProps {
  sellerId: string;
}

export function ResellerAppsManager({ sellerId }: ResellerAppsManagerProps) {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingApp, setEditingApp] = useState<ResellerApp | null>(null);
  const [formData, setFormData] = useState({ name: '', icon: '📱' });

  // Fetch reseller apps - using custom_products with a specific naming convention
  const { data: resellerApps = [], isLoading } = useQuery({
    queryKey: ['reseller-apps', sellerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('custom_products')
        .select('*')
        .eq('seller_id', sellerId)
        .like('name', 'APP_REVENDEDOR:%')
        .order('created_at');
      if (error) throw error;
      return (data || []).map(item => ({
        id: item.id,
        name: item.name.replace('APP_REVENDEDOR:', ''),
        icon: item.icon || '📱',
        seller_id: item.seller_id,
        is_active: item.is_active
      })) as ResellerApp[];
    },
    enabled: !!sellerId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; icon: string }) => {
      // Check if already has 10 apps
      if (resellerApps.length >= 10) {
        throw new Error('Limite de 10 apps atingido');
      }
      
      const { error } = await supabase
        .from('custom_products')
        .insert({
          name: `APP_REVENDEDOR:${data.name}`,
          icon: data.icon,
          seller_id: sellerId,
          is_active: true
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reseller-apps'] });
      toast.success('App criado com sucesso!');
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao criar app');
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { name: string; icon: string } }) => {
      const { error } = await supabase
        .from('custom_products')
        .update({
          name: `APP_REVENDEDOR:${data.name}`,
          icon: data.icon,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reseller-apps'] });
      toast.success('App atualizado com sucesso!');
      setIsDialogOpen(false);
      resetForm();
    },
    onError: () => {
      toast.error('Erro ao atualizar app');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('custom_products')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reseller-apps'] });
      toast.success('App removido com sucesso!');
    },
    onError: () => {
      toast.error('Erro ao remover app');
    }
  });

  const resetForm = () => {
    setFormData({ name: '', icon: '📱' });
    setEditingApp(null);
  };

  const handleEdit = (app: ResellerApp) => {
    setEditingApp(app);
    setFormData({ name: app.name, icon: app.icon });
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error('Nome do app é obrigatório');
      return;
    }

    if (editingApp) {
      updateMutation.mutate({ id: editingApp.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5" />
              Meus Apps (Revendedor)
            </CardTitle>
            <CardDescription>
              Cadastre até 10 apps personalizados para usar nos clientes
            </CardDescription>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button 
                size="sm" 
                disabled={resellerApps.length >= 10}
                title={resellerApps.length >= 10 ? 'Limite de 10 apps atingido' : 'Adicionar novo app'}
              >
                <Plus className="h-4 w-4 mr-1" />
                Adicionar
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleSubmit}>
                <DialogHeader>
                  <DialogTitle>
                    {editingApp ? 'Editar App' : 'Novo App do Revendedor'}
                  </DialogTitle>
                  <DialogDescription>
                    Esses apps aparecerão como opção ao cadastrar clientes
                  </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Ícone</Label>
                    <div className="flex flex-wrap gap-2">
                      {EMOJI_OPTIONS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => setFormData({ ...formData, icon: emoji })}
                          className={`w-10 h-10 text-xl rounded-lg border-2 transition-all ${
                            formData.icon === emoji 
                              ? 'border-primary bg-primary/10' 
                              : 'border-border hover:border-primary/50'
                          }`}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="app-name">Nome do App *</Label>
                    <Input
                      id="app-name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Ex: IPTV Premium, StreamFlix..."
                      maxLength={50}
                    />
                  </div>
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={createMutation.isPending || updateMutation.isPending}
                  >
                    <Save className="h-4 w-4 mr-1" />
                    {editingApp ? 'Salvar' : 'Criar'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Carregando...</div>
        ) : resellerApps.length === 0 ? (
          <div className="text-center py-8">
            <Smartphone className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground text-sm">
              Nenhum app cadastrado ainda
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Clique em "Adicionar" para criar seu primeiro app
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {resellerApps.map((app) => (
              <div 
                key={app.id}
                className="flex items-center justify-between p-3 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{app.icon}</span>
                  <div>
                    <p className="font-medium">{app.name}</p>
                    <Badge variant="secondary" className="text-xs">
                      App do Revendedor
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEdit(app)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      if (confirm('Remover este app?')) {
                        deleteMutation.mutate(app.id);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            <p className="text-xs text-muted-foreground text-center pt-2">
              {resellerApps.length}/10 apps cadastrados
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Hook to fetch reseller apps for use in other components
export function useResellerApps(sellerId: string | undefined) {
  return useQuery({
    queryKey: ['reseller-apps', sellerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('custom_products')
        .select('*')
        .eq('seller_id', sellerId!)
        .like('name', 'APP_REVENDEDOR:%')
        .eq('is_active', true)
        .order('created_at');
      if (error) throw error;
      return (data || []).map(item => ({
        id: item.id,
        name: item.name.replace('APP_REVENDEDOR:', ''),
        icon: item.icon || '📱',
        seller_id: item.seller_id
      }));
    },
    enabled: !!sellerId,
  });
}
