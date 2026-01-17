import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Trash2, Edit, Server, Image, ExternalLink, Link } from "lucide-react";

interface ServerTemplate {
  id: string;
  name: string;
  name_normalized: string;
  icon_url: string;
  panel_url?: string;
  created_at: string;
}

// Custom hook for fetching admin server templates
export const useAdminServerTemplates = () => {
  return useQuery({
    queryKey: ['admin-server-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('default_server_icons')
        .select('*')
        .order('name');
      if (error) throw error;
      return data as ServerTemplate[];
    },
  });
};

// Function to find template by normalized name
export const findServerTemplate = (templates: ServerTemplate[], serverName: string): ServerTemplate | undefined => {
  const normalized = serverName.toLowerCase().replace(/\s+/g, '');
  return templates.find(t => t.name_normalized === normalized);
};

const AdminServerTemplates = () => {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ServerTemplate | null>(null);
  const [formData, setFormData] = useState({ name: '', icon_url: '', panel_url: '' });

  const { data: templates = [], isLoading } = useAdminServerTemplates();

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; icon_url: string; panel_url: string }) => {
      const normalized = data.name.toLowerCase().replace(/\s+/g, '');
      const { error } = await supabase
        .from('default_server_icons')
        .insert({
          name: data.name.trim(),
          name_normalized: normalized,
          icon_url: data.icon_url.trim(),
          // panel_url will be stored in a separate way or we extend the table
        });
      if (error) throw error;
      
      // Store panel_url in app_settings as a workaround
      if (data.panel_url) {
        await supabase.from('app_settings').upsert({
          key: `server_panel_${normalized}`,
          value: data.panel_url.trim(),
          description: `Panel URL for server: ${data.name}`,
        }, { onConflict: 'key' });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-server-templates'] });
      queryClient.invalidateQueries({ queryKey: ['server-panel-urls'] });
      toast.success('Template adicionado com sucesso!');
      resetForm();
    },
    onError: (error: any) => {
      if (error.message?.includes('duplicate')) {
        toast.error('Já existe um template para este servidor');
      } else {
        toast.error('Erro ao adicionar template');
      }
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { id: string; name: string; icon_url: string; panel_url: string; oldNormalized: string }) => {
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
      
      // Update panel_url in app_settings
      // Remove old key if name changed
      if (data.oldNormalized !== normalized) {
        await supabase.from('app_settings').delete().eq('key', `server_panel_${data.oldNormalized}`);
      }
      
      if (data.panel_url) {
        await supabase.from('app_settings').upsert({
          key: `server_panel_${normalized}`,
          value: data.panel_url.trim(),
          description: `Panel URL for server: ${data.name}`,
        }, { onConflict: 'key' });
      } else {
        await supabase.from('app_settings').delete().eq('key', `server_panel_${normalized}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-server-templates'] });
      queryClient.invalidateQueries({ queryKey: ['server-panel-urls'] });
      toast.success('Template atualizado com sucesso!');
      resetForm();
    },
    onError: () => {
      toast.error('Erro ao atualizar template');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ id, normalized }: { id: string; normalized: string }) => {
      const { error } = await supabase
        .from('default_server_icons')
        .delete()
        .eq('id', id);
      if (error) throw error;
      
      // Also delete panel_url from app_settings
      await supabase.from('app_settings').delete().eq('key', `server_panel_${normalized}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-server-templates'] });
      queryClient.invalidateQueries({ queryKey: ['server-panel-urls'] });
      toast.success('Template removido com sucesso!');
    },
    onError: () => {
      toast.error('Erro ao remover template');
    },
  });

  // Fetch panel URLs from app_settings
  const { data: panelUrls = {} } = useQuery({
    queryKey: ['server-panel-urls'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('key, value')
        .like('key', 'server_panel_%');
      if (error) throw error;
      
      const urls: Record<string, string> = {};
      data.forEach(item => {
        const normalized = item.key.replace('server_panel_', '');
        urls[normalized] = item.value;
      });
      return urls;
    },
  });

  const resetForm = () => {
    setFormData({ name: '', icon_url: '', panel_url: '' });
    setEditingTemplate(null);
    setIsDialogOpen(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.icon_url) {
      toast.error('Nome e ícone são obrigatórios');
      return;
    }
    if (editingTemplate) {
      updateMutation.mutate({ 
        id: editingTemplate.id, 
        ...formData,
        oldNormalized: editingTemplate.name_normalized
      });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleEdit = (template: ServerTemplate) => {
    setEditingTemplate(template);
    setFormData({ 
      name: template.name, 
      icon_url: template.icon_url,
      panel_url: panelUrls[template.name_normalized] || ''
    });
    setIsDialogOpen(true);
  };

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card>
          <CardContent className="p-8 text-center">
            <Server className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">Acesso Restrito</h2>
            <p className="text-muted-foreground">
              Esta página é exclusiva para administradores.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Templates de Servidores</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Defina ícones e links padrão que aparecem automaticamente para revendedores
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          if (!open) resetForm();
          setIsDialogOpen(open);
        }}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Novo Template
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingTemplate ? 'Editar Template' : 'Adicionar Template'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome do Servidor *</Label>
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
                <Label htmlFor="icon_url">URL do Ícone *</Label>
                <Input
                  id="icon_url"
                  value={formData.icon_url}
                  onChange={(e) => setFormData(prev => ({ ...prev, icon_url: e.target.value }))}
                  placeholder="https://..."
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="panel_url" className="flex items-center gap-2">
                  <Link className="h-4 w-4" />
                  URL do Painel (opcional)
                </Label>
                <Input
                  id="panel_url"
                  value={formData.panel_url}
                  onChange={(e) => setFormData(prev => ({ ...prev, panel_url: e.target.value }))}
                  placeholder="https://painel.exemplo.com"
                />
                <p className="text-xs text-muted-foreground">
                  Link do painel que será sugerido ao revendedor
                </p>
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
                  {editingTemplate ? 'Atualizar' : 'Adicionar'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-4">
                <div className="h-16 w-16 bg-muted rounded-lg mx-auto mb-3" />
                <div className="h-4 bg-muted rounded w-3/4 mx-auto mb-2" />
                <div className="h-3 bg-muted rounded w-1/2 mx-auto" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : templates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Image className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhum template cadastrado</h3>
            <p className="text-muted-foreground text-center">
              Adicione templates para servidores populares
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {templates.map((template) => {
            const panelUrl = panelUrls[template.name_normalized];
            return (
              <Card key={template.id} className="group hover:shadow-lg transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    {template.icon_url ? (
                      <img 
                        src={template.icon_url} 
                        alt={template.name}
                        className="h-14 w-14 rounded-lg object-cover border border-border flex-shrink-0"
                      />
                    ) : (
                      <div className="h-14 w-14 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Server className="h-7 w-7 text-primary" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-sm truncate">{template.name}</h3>
                      <p className="text-xs text-muted-foreground">{template.name_normalized}</p>
                      {panelUrl && (
                        <a 
                          href={panelUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Painel
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 justify-end mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => handleEdit(template)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                      onClick={() => {
                        if (confirm('Remover este template?')) {
                          deleteMutation.mutate({ id: template.id, normalized: template.name_normalized });
                        }
                      }}
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

      <Card className="bg-muted/50">
        <CardHeader>
          <CardTitle className="text-base">Como funciona?</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>• Templates são associados automaticamente aos servidores pelo nome normalizado</p>
          <p>• "STAR PLAY", "Star Play" ou "starplay" usarão o mesmo template</p>
          <p>• Quando um revendedor digitar um nome compatível, o ícone e link aparecem automaticamente</p>
          <p>• Se o revendedor definir valores personalizados, eles terão prioridade sobre o template</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminServerTemplates;
