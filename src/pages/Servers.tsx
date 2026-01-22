import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Server, DollarSign, Edit, Trash2, Coins, ExternalLink, Monitor, Wifi, Calendar, Users, Image, Sparkles, Search, Link, CheckCircle2, Smartphone, Upload, FolderOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ServerCreditClients } from '@/components/ServerCreditClients';
import { ServerAppsManager } from '@/components/ServerAppsManager';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BulkImportServers } from '@/components/BulkImportServers';
import { ServerImageUpload } from '@/components/ServerImageUpload';
import { AdminServerTemplatesModal } from '@/components/AdminServerTemplatesModal';
import { SharedServersModal } from '@/components/SharedServersModal';
import { ConfirmDialog } from '@/components/ConfirmDialog';

interface ServerData {
  id: string;
  name: string;
  monthly_cost: number;
  is_active: boolean;
  notes: string | null;
  is_credit_based: boolean;
  credit_value: number;
  total_credits: number;
  used_credits: number;
  panel_url: string | null;
  iptv_per_credit: number;
  p2p_per_credit: number;
  credit_price: number;
  total_screens_per_credit: number;
  icon_url: string | null;
}

interface ServerTemplate {
  id: string;
  name: string;
  name_normalized: string;
  icon_url: string;
  panel_url?: string | null;
}

// Helper function to calculate pro-rata price
// AUDIT FIX: Safe numeric handling with precision rounding
const calculateProRataPrice = (monthlyPrice: number, daysUsed: number, totalDays: number = 30): number => {
  const safePrice = Number(monthlyPrice) || 0;
  const safeDaysUsed = Number(daysUsed) || 0;
  const safeTotalDays = Number(totalDays) || 30;
  
  if (safePrice <= 0 || safeTotalDays <= 0) return 0;
  if (safeDaysUsed <= 0) return safePrice;
  
  const remainingDays = safeTotalDays - safeDaysUsed;
  if (remainingDays <= 0) return 0;
  
  // Round to 2 decimal places for currency precision
  return Math.round((safePrice / safeTotalDays) * remainingDays * 100) / 100;
};

// Normalize server name for comparison
const normalizeServerName = (name: string): string => {
  return name.toLowerCase().replace(/\s+/g, '');
};

export default function Servers() {
  const { user, isAdmin } = useAuth();
  const { dialogProps, confirm } = useConfirmDialog();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<ServerData | null>(null);
  const [creditClientsServer, setCreditClientsServer] = useState<ServerData | null>(null);
  const [appsServer, setAppsServer] = useState<ServerData | null>(null);
  const [templateApplied, setTemplateApplied] = useState(false);
  const [showAdminTemplatesModal, setShowAdminTemplatesModal] = useState(false);
  const [showSharedServersModal, setShowSharedServersModal] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    monthly_cost: '',
    is_active: true,
    notes: '',
    is_credit_based: false,
    credit_value: '',
    total_credits: '',
    used_credits: '',
    panel_url: '',
    iptv_per_credit: '',
    p2p_per_credit: '',
    credit_price: '',
    total_screens_per_credit: '',
    icon_url: '',
  });
  const [isGeneratingIcon, setIsGeneratingIcon] = useState(false);

  // Fetch shared servers (collaborative list from all resellers)
  const { data: serverTemplates = [] } = useQuery({
    queryKey: ['shared-servers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shared_servers')
        .select('*')
        .order('name');
      if (error) throw error;
      return data as ServerTemplate[];
    },
  });


  // Check if bulk import is enabled for resellers
  const { data: bulkImportEnabled = false } = useQuery({
    queryKey: ['bulk-server-import-enabled'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'bulk_server_import_enabled')
        .maybeSingle();
      if (error) return false;
      return data?.value === 'true';
    },
  });

  // Auto-apply template when name changes
  const applyTemplateIfAvailable = useCallback((serverName: string) => {
    if (!serverName.trim() || editingServer) return;
    
    const normalized = normalizeServerName(serverName);
    const template = serverTemplates.find(t => t.name_normalized === normalized);
    
    if (template) {
      const panelUrl = template.panel_url || '';
      
      // Only apply if fields are empty
      setFormData(prev => ({
        ...prev,
        icon_url: prev.icon_url || template.icon_url,
        panel_url: prev.panel_url || panelUrl,
      }));
      
      if (template.icon_url || panelUrl) {
        setTemplateApplied(true);
        toast.success('Dados preenchidos automaticamente!', {
          description: 'Ícone e link do servidor cadastrado',
          duration: 2000,
        });
      }
    }
  }, [serverTemplates, editingServer]);

  // Handle shared server selection from modal
  const handleSelectSharedServer = (server: { name: string; icon_url: string; panel_url?: string | null }) => {
    setFormData(prev => ({
      ...prev,
      name: server.name,
      icon_url: server.icon_url || '',
      panel_url: server.panel_url || '',
    }));
    setTemplateApplied(true);
    toast.success('Servidor selecionado!', {
      description: 'Dados preenchidos automaticamente. Você pode editá-los.',
      duration: 3000,
    });
  };

  // Debounce name changes
  useEffect(() => {
    if (!formData.name.trim() || editingServer) {
      setTemplateApplied(false);
      return;
    }
    
    const timeout = setTimeout(() => {
      applyTemplateIfAvailable(formData.name);
    }, 500);
    
    return () => clearTimeout(timeout);
  }, [formData.name, applyTemplateIfAvailable, editingServer]);

  const { data: servers = [], isLoading } = useQuery({
    queryKey: ['servers', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('servers')
        .select('*')
        .eq('seller_id', user!.id)
        .order('name');
      if (error) throw error;
      return data as ServerData[];
    },
    enabled: !!user?.id,
  });

  const createMutation = useMutation({
    mutationFn: async (data: { 
      name: string; 
      monthly_cost?: number; 
      is_active?: boolean; 
      notes?: string | null;
      is_credit_based?: boolean;
      credit_value?: number;
      total_credits?: number;
      used_credits?: number;
    }) => {
      const { error } = await supabase.from('servers').insert([{
        ...data,
        seller_id: user!.id,
      }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      toast.success('Servidor criado com sucesso!');
      resetForm();
      setIsDialogOpen(false);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ServerData> }) => {
      const { error } = await supabase.from('servers').update(data).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      toast.success('Servidor atualizado!');
      resetForm();
      setIsDialogOpen(false);
      setEditingServer(null);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('servers').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      toast.success('Servidor excluído!');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from('servers').update({ is_active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      toast.success('Status atualizado!');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const resetForm = () => {
    setFormData({
      name: '',
      monthly_cost: '',
      is_active: true,
      notes: '',
      is_credit_based: false,
      credit_value: '',
      total_credits: '',
      used_credits: '',
      panel_url: '',
      iptv_per_credit: '',
      p2p_per_credit: '',
      credit_price: '',
      total_screens_per_credit: '',
      icon_url: '',
    });
    setTemplateApplied(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Force uppercase for server names
    const normalizedName = formData.name.trim().toUpperCase();
    
    const data = {
      name: normalizedName,
      monthly_cost: parseFloat(formData.monthly_cost) || 0,
      is_active: formData.is_active,
      notes: formData.notes || null,
      is_credit_based: formData.is_credit_based,
      credit_value: parseFloat(formData.credit_value) || 0,
      total_credits: parseFloat(formData.total_credits) || 0,
      used_credits: parseFloat(formData.used_credits) || 0,
      panel_url: formData.panel_url || null,
      iptv_per_credit: parseInt(formData.iptv_per_credit) || 0,
      p2p_per_credit: parseInt(formData.p2p_per_credit) || 0,
      credit_price: parseFloat(formData.credit_price) || 0,
      total_screens_per_credit: parseInt(formData.total_screens_per_credit) || 0,
      icon_url: formData.icon_url || null,
    };

    if (editingServer) {
      updateMutation.mutate({ id: editingServer.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (server: ServerData) => {
    setEditingServer(server);
    setFormData({
      name: server.name,
      monthly_cost: server.monthly_cost > 0 ? server.monthly_cost.toString() : '',
      is_active: server.is_active,
      notes: server.notes || '',
      is_credit_based: server.is_credit_based || false,
      credit_value: server.credit_value && server.credit_value > 0 ? server.credit_value.toString() : '',
      total_credits: server.total_credits && server.total_credits > 0 ? server.total_credits.toString() : '',
      used_credits: server.used_credits && server.used_credits > 0 ? server.used_credits.toString() : '',
      panel_url: server.panel_url || '',
      iptv_per_credit: server.iptv_per_credit && server.iptv_per_credit > 0 ? server.iptv_per_credit.toString() : '',
      p2p_per_credit: server.p2p_per_credit && server.p2p_per_credit > 0 ? server.p2p_per_credit.toString() : '',
      credit_price: server.credit_price && server.credit_price > 0 ? server.credit_price.toString() : '',
      total_screens_per_credit: server.total_screens_per_credit && server.total_screens_per_credit > 0 ? server.total_screens_per_credit.toString() : '',
      icon_url: server.icon_url || '',
    });
    setIsDialogOpen(true);
  };

  const generateIcon = async (action: 'generate' | 'search') => {
    if (!formData.name.trim()) {
      toast.error('Digite o nome do servidor primeiro');
      return;
    }

    setIsGeneratingIcon(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-server-icon', {
        body: { serverName: formData.name, action }
      });

      if (error) throw error;

      if (data?.success && data?.imageUrl) {
        setFormData(prev => ({ ...prev, icon_url: data.imageUrl }));
        toast.success('Ícone gerado com sucesso!');
      } else {
        throw new Error(data?.error || 'Erro ao gerar ícone');
      }
    } catch (error) {
      console.error('Error generating icon:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao gerar ícone');
    } finally {
      setIsGeneratingIcon(false);
    }
  };

  const totalMonthlyCost = servers
    .filter(s => s.is_active)
    .reduce((sum, s) => sum + s.monthly_cost, 0);

  const totalCredits = servers
    .filter(s => s.is_active && s.is_credit_based)
    .reduce((sum, s) => sum + (s.total_credits || 0), 0);

  const usedCredits = servers
    .filter(s => s.is_active && s.is_credit_based)
    .reduce((sum, s) => sum + (s.used_credits || 0), 0);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Servidores</h1>
          <p className="text-muted-foreground">Gerencie seus servidores, custos e créditos</p>
        </div>

        <div className="flex gap-2">
          {/* Bulk import - only show if admin or if enabled for resellers */}
          {(isAdmin || bulkImportEnabled) && <BulkImportServers />}

        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          if (!open && (createMutation.isPending || updateMutation.isPending)) {
            return;
          }
          setIsDialogOpen(open);
          if (!open) {
            setEditingServer(null);
            resetForm();
          }
        }}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Novo Servidor
            </Button>
          </DialogTrigger>
          <DialogContent
            onPointerDownOutside={(e) => {
              if (createMutation.isPending || updateMutation.isPending) {
                e.preventDefault();
              }
            }}
            onEscapeKeyDown={(e) => {
              if (createMutation.isPending || updateMutation.isPending) {
                e.preventDefault();
              }
            }}
          >
            <DialogHeader>
              <DialogTitle>{editingServer ? 'Editar Servidor' : 'Novo Servidor'}</DialogTitle>
              <DialogDescription>
                {editingServer ? 'Atualize os dados do servidor' : 'Adicione um novo servidor'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
              {/* Shared Servers Button - Only show when creating new server */}
              {!editingServer && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full gap-2 border-primary/50 hover:bg-primary/10 bg-primary/5"
                  onClick={() => setShowSharedServersModal(true)}
                >
                  <Users className="h-4 w-4" />
                  Ver Servidores Cadastrados
                  {serverTemplates.length > 0 && (
                    <span className="ml-auto text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full">
                      {serverTemplates.length}
                    </span>
                  )}
                </Button>
              )}

              {/* Icon Section */}
              <div className="space-y-3 p-4 rounded-lg border border-border bg-muted/30">
                <Label className="flex items-center gap-2">
                  <Image className="h-4 w-4" />
                  Imagem do Servidor
                </Label>
                
                {formData.icon_url && (
                  <div className="flex justify-center">
                    <div className="relative group">
                      <img 
                        src={formData.icon_url} 
                        alt="Server icon" 
                        className="w-20 h-20 rounded-lg object-cover border-2 border-primary/20"
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="absolute -top-2 -right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => setFormData(prev => ({ ...prev, icon_url: '' }))}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                )}

                <Tabs defaultValue="upload" className="w-full">
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="upload" className="text-xs gap-1">
                      <Upload className="h-3 w-3" />
                      Upload
                    </TabsTrigger>
                    <TabsTrigger value="url" className="text-xs gap-1">
                      <Link className="h-3 w-3" />
                      URL
                    </TabsTrigger>
                    <TabsTrigger value="generate" className="text-xs gap-1">
                      <Sparkles className="h-3 w-3" />
                      Gerar IA
                    </TabsTrigger>
                    <TabsTrigger value="search" className="text-xs gap-1">
                      <Search className="h-3 w-3" />
                      Buscar
                    </TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="upload" className="mt-3">
                    <ServerImageUpload
                      onUploadComplete={(url) => setFormData(prev => ({ ...prev, icon_url: url }))}
                      currentImageUrl={formData.icon_url}
                    />
                  </TabsContent>
                  
                  <TabsContent value="url" className="space-y-2 mt-3">
                    <Input
                      id="icon_url"
                      type="text"
                      value={formData.icon_url}
                      onChange={(e) => setFormData({ ...formData, icon_url: e.target.value })}
                      placeholder="https://exemplo.com/icone.png"
                    />
                    <p className="text-xs text-muted-foreground">Cole o link de uma imagem</p>
                  </TabsContent>
                  
                  <TabsContent value="generate" className="space-y-2 mt-3">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full gap-2"
                      disabled={isGeneratingIcon || !formData.name.trim()}
                      onClick={() => generateIcon('generate')}
                    >
                      {isGeneratingIcon ? (
                        <>
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                          Gerando...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4" />
                          Gerar Ícone Único
                        </>
                      )}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      IA cria um ícone exclusivo baseado no nome "{formData.name || '...'}"
                    </p>
                  </TabsContent>
                  
                  <TabsContent value="search" className="space-y-2 mt-3">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full gap-2"
                      disabled={isGeneratingIcon || !formData.name.trim()}
                      onClick={() => generateIcon('search')}
                    >
                      {isGeneratingIcon ? (
                        <>
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                          Buscando...
                        </>
                      ) : (
                        <>
                          <Search className="h-4 w-4" />
                          Buscar Ícone da Marca
                        </>
                      )}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      IA tenta encontrar/criar ícone similar à marca "{formData.name || '...'}"
                    </p>
                  </TabsContent>
                </Tabs>
              </div>

              <div className="space-y-2">
                <Label htmlFor="name" className="flex items-center gap-2">
                  Nome *
                  {templateApplied && !editingServer && (
                    <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                      <CheckCircle2 className="h-3 w-3" />
                      Template aplicado
                    </span>
                  )}
                </Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => {
                    // Force uppercase
                    const upperValue = e.target.value.toUpperCase();
                    setFormData({ ...formData, name: upperValue });
                    setTemplateApplied(false);
                  }}
                  required
                  placeholder="Ex: STAR PLAY"
                  className="uppercase"
                />
                {!editingServer && serverTemplates.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    💡 Use LETRAS MAIÚSCULAS - Servidores do admin terão ícone e link automáticos
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="monthly_cost">Custo Mensal (R$)</Label>
                <Input
                  id="monthly_cost"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.monthly_cost}
                  onChange={(e) => setFormData({ ...formData, monthly_cost: e.target.value })}
                  placeholder="Ex: 100.00"
                />
              </div>
              
              {/* Credit-based toggle */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div>
                  <Label htmlFor="is_credit_based" className="font-medium">Servidor por Créditos</Label>
                  <p className="text-xs text-muted-foreground">Ativar para gerenciar créditos</p>
                </div>
                <Switch
                  id="is_credit_based"
                  checked={formData.is_credit_based}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_credit_based: checked })}
                />
              </div>

              {/* Credit fields - only show when credit-based */}
              {formData.is_credit_based && (
                <div className="space-y-4 p-4 rounded-lg border border-border bg-muted/30">
                  <div className="space-y-2">
                    <Label htmlFor="credit_value">Valor por Crédito (R$)</Label>
                    <Input
                      id="credit_value"
                      type="number"
                      step="0.01"
                      value={formData.credit_value}
                      onChange={(e) => setFormData({ ...formData, credit_value: e.target.value })}
                      placeholder="Ex: 1.50"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="total_credits">Total de Créditos</Label>
                      <Input
                        id="total_credits"
                        type="number"
                        step="1"
                        value={formData.total_credits}
                        onChange={(e) => setFormData({ ...formData, total_credits: e.target.value })}
                        placeholder="Ex: 100"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="used_credits">Créditos Usados</Label>
                      <Input
                        id="used_credits"
                        type="number"
                        step="1"
                        value={formData.used_credits}
                        onChange={(e) => setFormData({ ...formData, used_credits: e.target.value })}
                        placeholder="Ex: 25"
                      />
                    </div>
                  </div>
                  
                  {/* Shared credits configuration */}
                  <div className="pt-3 border-t border-border">
                    <p className="text-sm font-medium mb-3">Configuração de Créditos Compartilhados</p>
                    <div className="space-y-2">
                      <Label htmlFor="credit_price">Preço Mensal do Crédito (R$)</Label>
                      <Input
                        id="credit_price"
                        type="number"
                        step="0.01"
                        value={formData.credit_price}
                        onChange={(e) => setFormData({ ...formData, credit_price: e.target.value })}
                        placeholder="Ex: 25.00"
                      />
                      <p className="text-xs text-muted-foreground">Valor mensal para cálculo pro-rata (desconto por dias)</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4 mt-3">
                      <div className="space-y-2">
                        <Label htmlFor="iptv_per_credit">IPTV por Crédito</Label>
                        <Input
                          id="iptv_per_credit"
                          type="number"
                          step="1"
                          min="0"
                          value={formData.iptv_per_credit}
                          onChange={(e) => setFormData({ ...formData, iptv_per_credit: e.target.value })}
                          placeholder="Ex: 2"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="p2p_per_credit">P2P por Crédito</Label>
                        <Input
                          id="p2p_per_credit"
                          type="number"
                          step="1"
                          min="0"
                          value={formData.p2p_per_credit}
                          onChange={(e) => setFormData({ ...formData, p2p_per_credit: e.target.value })}
                          placeholder="Ex: 1"
                        />
                      </div>
                    </div>
                    
                    {/* Total screens per credit */}
                    <div className="space-y-2 mt-3">
                      <Label htmlFor="total_screens_per_credit">Total de Telas por Crédito</Label>
                      <Input
                        id="total_screens_per_credit"
                        type="number"
                        step="1"
                        min="1"
                        max="10"
                        value={formData.total_screens_per_credit}
                        onChange={(e) => setFormData({ ...formData, total_screens_per_credit: e.target.value })}
                        placeholder="Ex: 3"
                      />
                      <p className="text-xs text-muted-foreground">
                        Quantas telas o cliente pode ter com 1 crédito (máx para seleção no cadastro)
                      </p>
                    </div>
                    
                    {(parseInt(formData.iptv_per_credit) > 0 || parseInt(formData.p2p_per_credit) > 0) && (
                      <div className="mt-3 p-2 rounded bg-primary/10 text-sm">
                        <span className="font-medium">1 crédito = </span>
                        {parseInt(formData.iptv_per_credit) > 0 && (
                          <span className="text-blue-500">{formData.iptv_per_credit} IPTV</span>
                        )}
                        {parseInt(formData.iptv_per_credit) > 0 && parseInt(formData.p2p_per_credit) > 0 && ' + '}
                        {parseInt(formData.p2p_per_credit) > 0 && (
                          <span className="text-green-500">{formData.p2p_per_credit} P2P</span>
                        )}
                        {parseInt(formData.total_screens_per_credit) > 0 && (
                          <span className="text-amber-500 ml-2">({formData.total_screens_per_credit} telas máx)</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between">
                <Label htmlFor="is_active">Servidor Ativo</Label>
                <Switch
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="panel_url">URL do Painel</Label>
                <Input
                  id="panel_url"
                  type="url"
                  value={formData.panel_url}
                  onChange={(e) => setFormData({ ...formData, panel_url: e.target.value })}
                  placeholder="https://painel.exemplo.com"
                />
                <p className="text-xs text-muted-foreground">Link do painel para renovar clientes</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Observações</Label>
                <Input
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {editingServer ? 'Salvar' : 'Criar Servidor'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="flex items-center justify-between p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-primary/10">
                <DollarSign className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Custo Mensal Total</p>
                <p className="text-2xl font-bold">R$ {totalMonthlyCost.toFixed(2)}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Servidores Ativos</p>
              <p className="text-2xl font-bold">{servers.filter(s => s.is_active).length}/{servers.length}</p>
            </div>
          </CardContent>
        </Card>

        {totalCredits > 0 && (
          <Card className="bg-warning/5 border-warning/20">
            <CardContent className="flex items-center justify-between p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-warning/10">
                  <Coins className="h-6 w-6 text-warning" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Créditos Totais</p>
                  <p className="text-2xl font-bold">{usedCredits} / {totalCredits}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Disponíveis</p>
                <p className="text-2xl font-bold">{totalCredits - usedCredits}</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Servers Grid */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-6 bg-muted rounded w-3/4 mb-4" />
                <div className="h-4 bg-muted rounded w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : servers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Server className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhum servidor cadastrado</h3>
            <p className="text-muted-foreground text-center">
              Adicione seu primeiro servidor clicando no botão acima
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {servers.map((server) => {
            const creditPercentage = server.total_credits > 0 
              ? (server.used_credits / server.total_credits) * 100 
              : 0;
            const remainingCredits = (server.total_credits || 0) - (server.used_credits || 0);

            return (
              <Card
                key={server.id}
                className={cn(
                  'transition-all duration-200 hover:shadow-lg animate-slide-up',
                  !server.is_active && 'opacity-60'
                )}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      {server.icon_url ? (
                        <img 
                          src={server.icon_url} 
                          alt={server.name}
                          className="w-10 h-10 rounded-lg object-cover border border-border"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                            (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                          }}
                        />
                      ) : null}
                      <div className={cn(
                        'p-2 rounded-lg',
                        server.is_active ? 'bg-success/10' : 'bg-muted',
                        server.icon_url && 'hidden'
                      )}>
                        <Server className={cn(
                          'h-5 w-5',
                          server.is_active ? 'text-success' : 'text-muted-foreground'
                        )} />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{server.name}</CardTitle>
                        <CardDescription className="flex items-center gap-2">
                          {server.is_active ? 'Ativo' : 'Inativo'}
                          {server.is_credit_based && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-warning/10 text-warning">
                              Créditos
                            </span>
                          )}
                        </CardDescription>
                      </div>
                    </div>
                    <Switch
                      checked={server.is_active}
                      onCheckedChange={(checked) => 
                        toggleStatusMutation.mutate({ id: server.id, is_active: checked })
                      }
                    />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 mb-2">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    <span className="text-lg font-semibold">R$ {server.monthly_cost.toFixed(2)}/mês</span>
                  </div>
                  
                  {/* Credit info */}
                  {server.is_credit_based && (
                    <div className="space-y-2 mb-4 p-3 rounded-lg bg-muted/50">
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Coins className="h-4 w-4" />
                          Créditos
                        </span>
                        <span className="font-medium">
                          {server.used_credits || 0} / {server.total_credits || 0}
                        </span>
                      </div>
                      <Progress 
                        value={creditPercentage} 
                        className={cn(
                          "h-2",
                          creditPercentage > 80 ? "[&>div]:bg-destructive" : "[&>div]:bg-warning"
                        )}
                      />
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Valor: R$ {(server.credit_value || 0).toFixed(2)}/crédito</span>
                        <span>{remainingCredits} disponíveis</span>
                      </div>
                      
                      {/* Shared credits config display */}
                      {((server.iptv_per_credit || 0) > 0 || (server.p2p_per_credit || 0) > 0) && (
                        <div className="pt-2 border-t border-border/50 mt-2">
                          <div className="flex items-center gap-2 text-xs mb-1">
                            <span className="text-muted-foreground">Crédito Compartilhado:</span>
                            <div className="flex items-center gap-1">
                              {(server.iptv_per_credit || 0) > 0 && (
                                <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500">
                                  <Monitor className="h-3 w-3" />
                                  {server.iptv_per_credit} IPTV
                                </span>
                              )}
                              {(server.p2p_per_credit || 0) > 0 && (
                                <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-green-500/10 text-green-500">
                                  <Wifi className="h-3 w-3" />
                                  {server.p2p_per_credit} P2P
                                </span>
                              )}
                            </div>
                          </div>
                          {(server.credit_price || 0) > 0 && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Calendar className="h-3 w-3" />
                              <span>Mensal: R$ {(server.credit_price || 0).toFixed(2)}</span>
                              <span className="text-warning">
                                (Pro-rata: R$ {calculateProRataPrice(server.credit_price || 0, 0, 30).toFixed(2)})
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {server.notes && (
                    <p className="text-sm text-muted-foreground mb-4">{server.notes}</p>
                  )}
                  <div className="flex items-center gap-2 pt-3 border-t border-border">
                    {/* Apps Button */}
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => setAppsServer(server)}
                    >
                      <Smartphone className="h-4 w-4 mr-1" />
                      Apps
                    </Button>
                    {((server.iptv_per_credit || 0) > 0 || (server.p2p_per_credit || 0) > 0) && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="flex-1"
                        onClick={() => setCreditClientsServer(server)}
                      >
                        <Users className="h-4 w-4 mr-1" />
                        Clientes
                      </Button>
                    )}
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => handleEdit(server)}>
                      <Edit className="h-4 w-4 mr-1" />
                      Editar
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        confirm({
                          title: 'Excluir servidor',
                          description: `Tem certeza que deseja excluir o servidor "${server.name}"? Esta ação não pode ser desfeita.`,
                          confirmText: 'Excluir',
                          variant: 'destructive',
                          onConfirm: () => deleteMutation.mutate(server.id),
                        });
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

      {/* Credit Clients Dialog */}
      {creditClientsServer && user && (
        <ServerCreditClients
          serverId={creditClientsServer.id}
          serverName={creditClientsServer.name}
          sellerId={user.id}
          iptvPerCredit={creditClientsServer.iptv_per_credit || 0}
          p2pPerCredit={creditClientsServer.p2p_per_credit || 0}
          totalCredits={creditClientsServer.total_credits || 0}
          creditPrice={creditClientsServer.credit_price || 0}
          isOpen={!!creditClientsServer}
          onClose={() => setCreditClientsServer(null)}
        />
      )}

      {/* Server Apps Manager Dialog */}
      {appsServer && (
        <ServerAppsManager
          serverId={appsServer.id}
          serverName={appsServer.name}
          isOpen={!!appsServer}
          onClose={() => setAppsServer(null)}
        />
      )}

      {/* Shared Servers Modal */}
      <SharedServersModal
        open={showSharedServersModal}
        onOpenChange={setShowSharedServersModal}
        onSelectServer={handleSelectSharedServer}
      />

      {/* Global Confirm Dialog */}
      <ConfirmDialog {...dialogProps} />
    </div>
  );
}