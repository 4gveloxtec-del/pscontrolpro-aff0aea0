import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Trash2, Edit, Server, Image, ExternalLink } from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";

interface ServerIcon {
  id: string;
  name: string;
  name_normalized: string;
  icon_url: string;
  created_at: string;
}

const ServerIcons = () => {
  const { user } = useAuth();
  const { dialogProps, confirm } = useConfirmDialog();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingIcon, setEditingIcon] = useState<ServerIcon | null>(null);
  const [formData, setFormData] = useState({ name: '', icon_url: '' });

  const { data: icons = [], isLoading } = useQuery({
    queryKey: ['default-server-icons'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('default_server_icons')
        .select('*')
        .order('name');
      if (error) throw error;
      return data as ServerIcon[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; icon_url: string }) => {
      const normalized = data.name.toLowerCase().replace(/\s+/g, '');
      const { error } = await supabase
        .from('default_server_icons')
        .insert({
          name: data.name.trim(),
          name_normalized: normalized,
          icon_url: data.icon_url.trim(),
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['default-server-icons'] });
      toast.success('Ícone adicionado com sucesso!');
      resetForm();
    },
    onError: (error: any) => {
      if (error.message?.includes('duplicate')) {
        toast.error('Já existe um ícone para este servidor');
      } else {
        toast.error('Erro ao adicionar ícone');
      }
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { id: string; name: string; icon_url: string }) => {
      const normalized = data.name.toLowerCase().replace(/\s+/g, '');
      const { error } = await supabase
        .from('default_server_icons')
        .update({
          name: data.name.trim(),
          name_normalized: normalized,
          icon_url: data.icon_url.trim(),
        })
        .eq('id', data.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['default-server-icons'] });
      toast.success('Ícone atualizado com sucesso!');
      resetForm();
    },
    onError: () => {
      toast.error('Erro ao atualizar ícone');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('default_server_icons')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['default-server-icons'] });
      toast.success('Ícone removido com sucesso!');
    },
    onError: () => {
      toast.error('Erro ao remover ícone');
    },
  });

  const resetForm = () => {
    setFormData({ name: '', icon_url: '' });
    setEditingIcon(null);
    setIsDialogOpen(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.icon_url) {
      toast.error('Preencha todos os campos');
      return;
    }
    if (editingIcon) {
      updateMutation.mutate({ id: editingIcon.id, ...formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleEdit = (icon: ServerIcon) => {
    setEditingIcon(icon);
    setFormData({ name: icon.name, icon_url: icon.icon_url });
    setIsDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Ícones de Servidores</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Ícones padrão que aparecem automaticamente para revendedores
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          if (!open) resetForm();
          setIsDialogOpen(open);
        }}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Novo Ícone
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingIcon ? 'Editar Ícone' : 'Adicionar Ícone'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome do Servidor</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Ex: STAR PLAY"
                />
                <p className="text-xs text-muted-foreground">
                  Será normalizado para comparação (STAR PLAY → starplay)
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="icon_url">URL do Ícone</Label>
                <Input
                  id="icon_url"
                  value={formData.icon_url}
                  onChange={(e) => setFormData(prev => ({ ...prev, icon_url: e.target.value }))}
                  placeholder="https://..."
                />
              </div>
              {formData.icon_url && (
                <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                  <img 
                    src={formData.icon_url} 
                    alt="Preview" 
                    className="h-12 w-12 rounded-lg object-cover border border-border"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                  <span className="text-sm text-muted-foreground">Preview do ícone</span>
                </div>
              )}
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {editingIcon ? 'Atualizar' : 'Adicionar'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-4">
                <div className="h-16 w-16 bg-muted rounded-lg mx-auto mb-3" />
                <div className="h-4 bg-muted rounded w-3/4 mx-auto" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : icons.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Image className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhum ícone cadastrado</h3>
            <p className="text-muted-foreground text-center">
              Adicione ícones padrão para servidores populares
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {icons.map((icon) => (
            <Card key={icon.id} className="group hover:shadow-lg transition-shadow">
              <CardContent className="p-4 text-center">
                <div className="relative mb-3">
                  {icon.icon_url ? (
                    <img 
                      src={icon.icon_url} 
                      alt={icon.name}
                      className="h-16 w-16 rounded-lg object-cover border border-border mx-auto"
                    />
                  ) : (
                    <div className="h-16 w-16 rounded-lg bg-primary/10 flex items-center justify-center mx-auto">
                      <Server className="h-8 w-8 text-primary" />
                    </div>
                  )}
                </div>
                <h3 className="font-medium text-sm truncate mb-1">{icon.name}</h3>
                <p className="text-xs text-muted-foreground mb-3">{icon.name_normalized}</p>
                <div className="flex gap-1 justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => handleEdit(icon)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                    onClick={() => {
                      confirm({
                        title: 'Remover ícone',
                        description: `Tem certeza que deseja remover o ícone "${icon.name}"?`,
                        confirmText: 'Remover',
                        variant: 'destructive',
                        onConfirm: () => deleteMutation.mutate(icon.id),
                      });
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card className="bg-muted/50">
        <CardHeader>
          <CardTitle className="text-base">Como funciona?</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>• Os ícones são associados automaticamente aos servidores pelo nome normalizado</p>
          <p>• "STAR PLAY", "Star Play" ou "starplay" usarão o mesmo ícone</p>
          <p>• Quando um revendedor criar um servidor com nome compatível, o ícone aparece automaticamente</p>
          <p>• Se o revendedor definir um ícone personalizado, ele terá prioridade sobre o padrão</p>
        </CardContent>
      </Card>
      {/* Global Confirm Dialog */}
      <ConfirmDialog {...dialogProps} />
    </div>
  );
};

export default ServerIcons;
