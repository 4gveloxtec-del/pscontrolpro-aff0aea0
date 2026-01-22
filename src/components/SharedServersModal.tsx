import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { 
  Search, Server, ExternalLink, Check, Plus, 
  Loader2, Users, Image, Link, Upload, AlertCircle 
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { ServerImageUpload } from '@/components/ServerImageUpload';

interface SharedServer {
  id: string;
  name: string;
  name_normalized: string;
  icon_url: string | null;
  panel_url: string | null;
  created_by: string | null;
  created_at: string;
}

interface SharedServersModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectServer: (server: { name: string; icon_url: string; panel_url?: string | null }) => void;
}

// Normalize server name for comparison
const normalizeServerName = (name: string): string => {
  return name.toLowerCase().replace(/\s+/g, '');
};

export function SharedServersModal({
  open,
  onOpenChange,
  onSelectServer,
}: SharedServersModalProps) {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'list' | 'add'>('list');
  const [newServerData, setNewServerData] = useState({
    name: '',
    icon_url: '',
    panel_url: '',
  });

  // Fetch shared servers
  const { data: servers = [], isLoading } = useQuery({
    queryKey: ['shared-servers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shared_servers')
        .select('*')
        .order('name');
      if (error) throw error;
      return data as SharedServer[];
    },
    enabled: open,
  });

  // Add new shared server
  const addServerMutation = useMutation({
    mutationFn: async (data: { name: string; icon_url: string; panel_url: string }) => {
      const normalized = normalizeServerName(data.name);
      
      // Check if server already exists
      const existing = servers.find(s => s.name_normalized === normalized);
      if (existing) {
        throw new Error('Este servidor já está cadastrado!');
      }

      const { error } = await supabase
        .from('shared_servers')
        .insert({
          name: data.name.trim().toUpperCase(),
          name_normalized: normalized,
          icon_url: data.icon_url.trim() || null,
          panel_url: data.panel_url.trim() || null,
          created_by: user?.id,
        });
      
      if (error) {
        if (error.code === '23505') {
          throw new Error('Este servidor já está cadastrado!');
        }
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shared-servers'] });
      toast.success('Servidor cadastrado com sucesso!', {
        description: 'Agora todos os revendedores podem usá-lo',
      });
      setNewServerData({ name: '', icon_url: '', panel_url: '' });
      setActiveTab('list');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Delete server (admin only)
  const deleteServerMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('shared_servers')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shared-servers'] });
      toast.success('Servidor removido!');
    },
    onError: () => {
      toast.error('Erro ao remover servidor');
    },
  });

  const filteredServers = servers.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = (server: SharedServer) => {
    setSelectedId(server.id);
    onSelectServer({
      name: server.name,
      icon_url: server.icon_url || '',
      panel_url: server.panel_url,
    });
    onOpenChange(false);
    setSearch('');
    setSelectedId(null);
  };

  const handleAddServer = () => {
    if (!newServerData.name.trim()) {
      toast.error('Informe o nome do servidor');
      return;
    }
    addServerMutation.mutate(newServerData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Servidores Cadastrados
          </DialogTitle>
          <DialogDescription>
            Servidores compartilhados entre todos os revendedores
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'list' | 'add')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="list" className="gap-2">
              <Server className="h-4 w-4" />
              Ver Servidores ({servers.length})
            </TabsTrigger>
            <TabsTrigger value="add" className="gap-2">
              <Plus className="h-4 w-4" />
              Adicionar Novo
            </TabsTrigger>
          </TabsList>

          {/* List Tab */}
          <TabsContent value="list" className="space-y-3 mt-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar servidor..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            <ScrollArea className="h-[350px] pr-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : filteredServers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Server className="h-12 w-12 text-muted-foreground/50 mb-2" />
                  <p className="text-muted-foreground">
                    {search ? 'Nenhum servidor encontrado' : 'Nenhum servidor cadastrado ainda'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Seja o primeiro a adicionar um servidor!
                  </p>
                </div>
              ) : (
                <div className="grid gap-2">
                  {filteredServers.map((server) => (
                    <div
                      key={server.id}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-lg border transition-all group",
                        "hover:border-primary/50 hover:bg-primary/5",
                        selectedId === server.id && "border-primary bg-primary/10"
                      )}
                    >
                      {/* Icon */}
                      <div className="flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden bg-muted border">
                        {server.icon_url ? (
                          <img
                            src={server.icon_url}
                            alt={server.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Server className="h-5 w-5 text-muted-foreground" />
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-sm truncate">{server.name}</h4>
                        {server.panel_url && (
                          <p className="text-xs text-muted-foreground truncate flex items-center gap-1 mt-0.5">
                            <ExternalLink className="h-3 w-3 flex-shrink-0" />
                            {server.panel_url}
                          </p>
                        )}
                        <div className="flex gap-2 mt-1">
                          {server.icon_url && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-green-500/10 text-green-600 border-green-500/20">
                              Ícone
                            </Badge>
                          )}
                          {server.panel_url && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-blue-500/10 text-blue-600 border-blue-500/20">
                              Painel
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 px-3 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => handleSelect(server)}
                        >
                          <Check className="h-3.5 w-3.5 mr-1" />
                          Usar
                        </Button>
                        
                        {isAdmin && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => deleteServerMutation.mutate(server.id)}
                            disabled={deleteServerMutation.isPending}
                          >
                            ×
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          {/* Add Tab */}
          <TabsContent value="add" className="space-y-4 mt-4">
            <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-600 dark:text-blue-400">
                <p className="font-medium">Servidor compartilhado</p>
                <p className="text-xs mt-0.5 opacity-80">
                  O servidor que você adicionar ficará disponível para todos os revendedores. 
                  Não é possível remover depois de cadastrado.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="server-name">Nome do Servidor *</Label>
                <Input
                  id="server-name"
                  placeholder="Ex: STAR PLAY, MEGA TV, IPTV BRASIL..."
                  value={newServerData.name}
                  onChange={(e) => setNewServerData(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>

              {/* Icon Section */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Image className="h-4 w-4" />
                  Ícone do Servidor
                </Label>
                
                {newServerData.icon_url && (
                  <div className="flex justify-center mb-2">
                    <img 
                      src={newServerData.icon_url} 
                      alt="Preview" 
                      className="w-16 h-16 rounded-lg object-cover border-2 border-primary/20"
                    />
                  </div>
                )}

                <Tabs defaultValue="upload" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="upload" className="text-xs gap-1">
                      <Upload className="h-3 w-3" />
                      Upload
                    </TabsTrigger>
                    <TabsTrigger value="url" className="text-xs gap-1">
                      <Link className="h-3 w-3" />
                      URL
                    </TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="upload" className="mt-2">
                    <ServerImageUpload
                      onUploadComplete={(url) => setNewServerData(prev => ({ ...prev, icon_url: url }))}
                      currentImageUrl={newServerData.icon_url}
                    />
                  </TabsContent>
                  
                  <TabsContent value="url" className="mt-2">
                    <Input
                      placeholder="https://exemplo.com/icone.png"
                      value={newServerData.icon_url}
                      onChange={(e) => setNewServerData(prev => ({ ...prev, icon_url: e.target.value }))}
                    />
                  </TabsContent>
                </Tabs>
              </div>

              <div className="space-y-2">
                <Label htmlFor="panel-url">Link do Painel (Opcional)</Label>
                <Input
                  id="panel-url"
                  placeholder="https://painel.servidor.com"
                  value={newServerData.panel_url}
                  onChange={(e) => setNewServerData(prev => ({ ...prev, panel_url: e.target.value }))}
                />
              </div>

              <Button 
                className="w-full gap-2" 
                onClick={handleAddServer}
                disabled={addServerMutation.isPending || !newServerData.name.trim()}
              >
                {addServerMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Cadastrar Servidor para Todos
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        {/* Info footer */}
        <div className="pt-3 border-t text-xs text-muted-foreground text-center">
          <p>💡 Quanto mais servidores cadastrados, menos trabalho para novos revendedores!</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
