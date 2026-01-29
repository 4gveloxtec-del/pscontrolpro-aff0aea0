import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
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
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Search, Server, ExternalLink, Check, Plus, 
  Loader2, Users, Image, Link, Upload, AlertCircle,
  CheckSquare, Square
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
  /** When true, allows selecting multiple servers at once */
  multiSelect?: boolean;
  /** Callback for multi-select mode */
  onSelectMultiple?: (servers: Array<{ name: string; icon_url: string; panel_url?: string | null }>) => void;
}

// Normalize server name for comparison
const normalizeServerName = (name: string): string => {
  return name.toLowerCase().replace(/\s+/g, '');
};

export function SharedServersModal({
  open,
  onOpenChange,
  onSelectServer,
  multiSelect = false,
  onSelectMultiple,
}: SharedServersModalProps) {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const { dialogProps, confirm } = useConfirmDialog();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'list' | 'add'>('list');
  const [newServerData, setNewServerData] = useState({
    name: '',
    icon_url: '',
    panel_url: '',
  });

  // Fetch shared servers
  const { data: servers = [], isLoading, isError } = useQuery({
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
    onError: (error: Error) => {
      console.error('[deleteServerMutation]', error);
      toast.error('Erro ao remover servidor: ' + error.message);
    },
  });

  const filteredServers = useMemo(() => 
    servers.filter(s => s.name.toLowerCase().includes(search.toLowerCase())),
    [servers, search]
  );

  // Toggle selection for multi-select mode
  const toggleSelection = (serverId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(serverId)) {
        next.delete(serverId);
      } else {
        next.add(serverId);
      }
      return next;
    });
  };

  // Select/Deselect all filtered servers
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredServers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredServers.map(s => s.id)));
    }
  };

  const handleSelect = (server: SharedServer) => {
    if (multiSelect) {
      toggleSelection(server.id);
    } else {
      setSelectedId(server.id);
      onSelectServer({
        name: server.name,
        icon_url: server.icon_url || '',
        panel_url: server.panel_url,
      });
      onOpenChange(false);
      setSearch('');
      setSelectedId(null);
    }
  };

  const handleConfirmMultiSelect = () => {
    const selectedServers = servers
      .filter(s => selectedIds.has(s.id))
      .map(s => ({
        name: s.name,
        icon_url: s.icon_url || '',
        panel_url: s.panel_url,
      }));
    
    if (onSelectMultiple) {
      onSelectMultiple(selectedServers);
    }
    
    onOpenChange(false);
    setSearch('');
    setSelectedIds(new Set());
    toast.success(`${selectedServers.length} servidor(es) selecionado(s)!`);
  };

  const handleAddServer = () => {
    if (!newServerData.name.trim()) {
      toast.error('Informe o nome do servidor');
      return;
    }
    addServerMutation.mutate(newServerData);
  };

  // Reset selection when modal closes
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setSelectedIds(new Set());
      setSearch('');
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl w-full">
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
          <TabsList className="grid w-full grid-cols-2 h-9 sm:h-10">
            <TabsTrigger value="list" className="gap-1 sm:gap-2 text-xs sm:text-sm">
              <Server className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden xs:inline">Ver</span> Servidores ({servers.length})
            </TabsTrigger>
            <TabsTrigger value="add" className="gap-1 sm:gap-2 text-xs sm:text-sm">
              <Plus className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden xs:inline">Adicionar</span> Novo
            </TabsTrigger>
          </TabsList>

          {/* List Tab */}
          <TabsContent value="list" className="space-y-3 mt-4">
            {/* Search + Select All */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar servidor..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              {multiSelect && filteredServers.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={toggleSelectAll}
                  className="gap-1 h-10 px-3 whitespace-nowrap"
                >
                  {selectedIds.size === filteredServers.length ? (
                    <>
                      <CheckSquare className="h-4 w-4" />
                      <span className="hidden sm:inline">Desmarcar</span>
                    </>
                  ) : (
                    <>
                      <Square className="h-4 w-4" />
                      <span className="hidden sm:inline">Selecionar Todos</span>
                    </>
                  )}
                </Button>
              )}
            </div>

            {/* Selection count indicator */}
            {multiSelect && selectedIds.size > 0 && (
              <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-primary/10 border border-primary/20">
                <span className="text-sm font-medium text-primary">
                  {selectedIds.size} servidor(es) selecionado(s)
                </span>
                <Button
                  size="sm"
                  onClick={handleConfirmMultiSelect}
                  className="h-7 gap-1"
                >
                  <Check className="h-3.5 w-3.5" />
                  Confirmar
                </Button>
              </div>
            )}

            <ScrollArea className="h-[35vh] sm:h-[300px] pr-2 sm:pr-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : isError ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <AlertCircle className="h-12 w-12 text-destructive/50 mb-2" />
                  <p className="text-destructive">Erro ao carregar servidores</p>
                  <p className="text-xs text-muted-foreground mt-1">Tente novamente mais tarde</p>
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
                  {filteredServers.map((server) => {
                    const isSelected = multiSelect 
                      ? selectedIds.has(server.id) 
                      : selectedId === server.id;
                    
                    return (
                      <div
                        key={server.id}
                        className={cn(
                          "flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg border transition-all group cursor-pointer",
                          "hover:border-primary/50 hover:bg-primary/5",
                          isSelected && "border-primary bg-primary/10"
                        )}
                        onClick={() => multiSelect && handleSelect(server)}
                      >
                        {/* Checkbox for multi-select */}
                        {multiSelect && (
                          <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleSelection(server.id)}
                              className="h-5 w-5"
                            />
                          </div>
                        )}

                        {/* Icon */}
                        <div className="flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-lg overflow-hidden bg-muted border">
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
                              <Server className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
                            </div>
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-xs sm:text-sm truncate">{server.name}</h4>
                          {server.panel_url && (
                            <p className="text-[10px] sm:text-xs text-muted-foreground truncate flex items-center gap-1 mt-0.5">
                              <ExternalLink className="h-2.5 w-2.5 sm:h-3 sm:w-3 flex-shrink-0" />
                              <span className="truncate">{server.panel_url}</span>
                            </p>
                          )}
                          <div className="flex gap-1 sm:gap-2 mt-1">
                            {server.icon_url && (
                              <Badge variant="outline" className="text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0 h-3.5 sm:h-4 bg-green-500/10 text-green-600 border-green-500/20">
                                Ícone
                              </Badge>
                            )}
                            {server.panel_url && (
                              <Badge variant="outline" className="text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0 h-3.5 sm:h-4 bg-blue-500/10 text-blue-600 border-blue-500/20">
                                Painel
                              </Badge>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 sm:gap-2">
                          {!multiSelect && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 sm:h-8 px-2 sm:px-3 text-xs"
                              onClick={() => handleSelect(server)}
                            >
                              <Check className="h-3 w-3 sm:h-3.5 sm:w-3.5 sm:mr-1" />
                              <span className="hidden sm:inline">Usar</span>
                            </Button>
                          )}
                          
                          {isAdmin && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 sm:h-8 sm:w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={(e) => {
                                e.stopPropagation();
                                confirm({
                                  title: 'Remover servidor',
                                  description: `Tem certeza que deseja remover "${server.name}" da lista compartilhada?`,
                                  confirmText: 'Remover',
                                  variant: 'destructive',
                                  onConfirm: () => deleteServerMutation.mutate(server.id),
                                });
                              }}
                              disabled={deleteServerMutation.isPending}
                            >
                              ×
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>

            {/* Floating confirm button for mobile multi-select */}
            {multiSelect && selectedIds.size > 0 && (
              <div className="sm:hidden pt-2 border-t">
                <Button
                  className="w-full gap-2"
                  onClick={handleConfirmMultiSelect}
                >
                  <Check className="h-4 w-4" />
                  Importar {selectedIds.size} servidor(es)
                </Button>
              </div>
            )}
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
