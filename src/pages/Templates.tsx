import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabaseExternal as supabase } from '@/lib/supabase-external';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { Plus, MessageSquare, Edit, Trash2, Copy, Info, Tv, Wifi, Crown, Tag, Send, Users, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GenerateDefaultData } from '@/components/GenerateDefaultData';

interface Template {
  id: string;
  name: string;
  type: string;
  message: string;
  is_default: boolean;
}

interface TemplateCategory {
  id: string;
  name: string;
  seller_id: string;
}

// Default categories (Vendedores is admin-only, Revendedor is seller-only)
const DEFAULT_CATEGORIES = ['IPTV', 'P2P', 'SSH', 'Contas Premium', 'Revendedor'] as const;
const ADMIN_CATEGORIES = ['Vendedores'] as const;

// Platforms for message sending
const PLATFORMS = [
  { value: 'whatsapp', label: 'WhatsApp', icon: '📱' },
  { value: 'telegram', label: 'Telegram', icon: '✈️' },
] as const;

// Message types
const MESSAGE_TYPES = [
  { value: 'welcome', label: 'Boas-vindas', icon: '👋' },
  { value: 'billing', label: 'Cobrança', icon: '💰' },
  { value: 'expiring_3days', label: 'Vencimento (3 dias)', icon: '⏰' },
  { value: 'expiring_2days', label: 'Vencimento (2 dias)', icon: '⏰' },
  { value: 'expiring_1day', label: 'Vencimento (1 dia)', icon: '🔔' },
  { value: 'expired', label: 'Vencido', icon: '❌' },
  { value: 'renewal', label: 'Renovação', icon: '✅' },
  { value: 'credentials', label: 'Credenciais', icon: '🔐' },
  { value: 'loyalty', label: 'Fidelização', icon: '💝' },
  { value: 'referral', label: 'Indicação', icon: '🤝' },
  { value: 'custom', label: 'Personalizado', icon: '📝' },
];

// Available variables for client templates
const clientVariables = [
  { name: '{nome}', description: 'Nome do cliente' },
  { name: '{empresa}', description: 'Nome da empresa/revendedor' },
  { name: '{login}', description: 'Login do cliente' },
  { name: '{senha}', description: 'Senha do cliente' },
  { name: '{mac}', description: 'MAC(s) do cliente (se cadastrado)' },
  { name: '{dispositivo}', description: 'Tipo de dispositivo do cliente' },
  { name: '{apps}', description: 'Lista de aplicativos compatíveis' },
  { name: '{links}', description: 'Links de download dos apps' },
  { name: '{conta_premium}', description: 'Nome da conta Premium (Netflix, Spotify...)' },
  { name: '{contas_premium}', description: 'Todas as contas Premium com email e senha' },
  { name: '{email_premium}', description: 'Email(s) das contas Premium' },
  { name: '{senha_premium}', description: 'Senha(s) das contas Premium' },
  { name: '{vencimento}', description: 'Data de vencimento (DD/MM/YYYY)' },
  { name: '{dias_restantes}', description: 'Dias até vencer' },
  { name: '{valor}', description: 'Valor do plano' },
  { name: '{plano}', description: 'Nome do plano' },
  { name: '{servidor}', description: 'Nome do servidor' },
  { name: '{pix}', description: 'Chave PIX para pagamento' },
  { name: '{telegram}', description: 'Username do Telegram (@usuario)' },
];

// Available variables for reseller templates (Revendedor category)
const resellerVariables = [
  { name: '{nome}', description: 'Nome do revendedor' },
  { name: '{link_painel}', description: 'Link do painel do revendedor' },
  { name: '{usuario}', description: 'Usuário do painel' },
  { name: '{senha}', description: 'Senha do painel' },
  { name: '{valor}', description: 'Valor do plano (apenas cobrança)' },
  { name: '{vencimento}', description: 'Data de vencimento' },
  { name: '{servidor}', description: 'Nome do servidor' },
  { name: '{pix}', description: 'Chave PIX para pagamento' },
  { name: '{empresa}', description: 'Nome da sua empresa' },
];

// Available variables for seller templates (Admin only)
const sellerVariables = [
  { name: '{nome}', description: 'Nome do vendedor' },
  { name: '{email}', description: 'Email do vendedor' },
  { name: '{whatsapp}', description: 'WhatsApp do vendedor' },
  { name: '{vencimento}', description: 'Data de vencimento da assinatura' },
  { name: '{pix}', description: 'Chave PIX do Admin' },
  { name: '{valor}', description: 'Valor da mensalidade (dinâmico)' },
  { name: '{empresa}', description: 'Nome da empresa do Admin' },
];


export default function Templates() {
  const { user, isAdmin, profile } = useAuth();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [showVariables, setShowVariables] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    type: 'custom',
    message: '',
    category: 'IPTV',
  });

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['templates', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whatsapp_templates')
        .select('*')
        .eq('seller_id', user!.id)
        .order('name');
      if (error) throw error;
      return data as Template[];
    },
    enabled: !!user?.id,
  });

  const { data: customCategories = [] } = useQuery({
    queryKey: ['template-categories', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_categories')
        .select('*')
        .eq('seller_id', user!.id)
        .order('name');
      if (error) throw error;
      return data as TemplateCategory[];
    },
    enabled: !!user?.id,
  });
  // Build categories list based on user role - includes default + custom categories
  const allCategories = [
    ...DEFAULT_CATEGORIES, 
    ...(isAdmin ? ADMIN_CATEGORIES : []), 
    ...customCategories.map(c => c.name).filter(name => 
      !DEFAULT_CATEGORIES.includes(name as typeof DEFAULT_CATEGORIES[number]) && 
      !(isAdmin && ADMIN_CATEGORIES.includes(name as typeof ADMIN_CATEGORIES[number]))
    )
  ];

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; type: string; message: string }) => {
      const { error } = await supabase.from('whatsapp_templates').insert([{
        ...data,
        seller_id: user!.id,
      }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      toast.success('Template criado com sucesso!');
      resetForm();
      setIsDialogOpen(false);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('client_categories').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['template-categories'] });
      queryClient.invalidateQueries({ queryKey: ['client-categories'] });
      toast.success('Categoria excluída!');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });


  const addCategoryMutation = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from('client_categories').insert([{
        name,
        seller_id: user!.id,
      }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['template-categories'] });
      toast.success('Categoria criada!');
      setNewCategoryName('');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Template> }) => {
      const { error } = await supabase.from('whatsapp_templates').update(data).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      toast.success('Template atualizado!');
      resetForm();
      setIsDialogOpen(false);
      setEditingTemplate(null);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('whatsapp_templates').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      toast.success('Template excluído!');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const resetForm = () => {
    setFormData({
      name: '',
      type: 'custom',
      message: '',
      category: 'IPTV',
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (editingTemplate) {
      updateMutation.mutate({ id: editingTemplate.id, data: { name: formData.name, type: formData.type, message: formData.message } });
    } else {
      createMutation.mutate({ name: formData.name, type: formData.type, message: formData.message });
    }
  };

  const handleEdit = (template: Template) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      type: template.type,
      message: template.message,
      category: 'IPTV',
    });
    setIsDialogOpen(true);
  };

  const copyMessage = (message: string) => {
    navigator.clipboard.writeText(message);
    toast.success('Mensagem copiada!');
  };

  const insertVariable = (variable: string) => {
    setFormData({
      ...formData,
      message: formData.message + variable,
    });
  };

  const getTypeLabel = (type: string) => {
    return MESSAGE_TYPES.find(t => t.value === type)?.label || type;
  };

  const getTypeIcon = (type: string) => {
    return MESSAGE_TYPES.find(t => t.value === type)?.icon || '📝';
  };

  const typeColors: Record<string, string> = {
    welcome: 'bg-success/10 text-success',
    billing: 'bg-orange-500/10 text-orange-500',
    expiring_3days: 'bg-yellow-500/10 text-yellow-500',
    expiring_2days: 'bg-warning/10 text-warning',
    expiring_1day: 'bg-destructive/10 text-destructive',
    expired: 'bg-destructive/10 text-destructive',
    renewal: 'bg-blue-500/10 text-blue-500',
    credentials: 'bg-primary/10 text-primary',
    loyalty: 'bg-pink-500/10 text-pink-500',
    referral: 'bg-purple-500/10 text-purple-500',
    custom: 'bg-muted text-muted-foreground',
  };

const getCategoryIcon = (name: string) => {
    switch (name) {
      case 'IPTV': return <Tv className="h-4 w-4" />;
      case 'P2P': return <Wifi className="h-4 w-4" />;
      case 'SSH': return <Wifi className="h-4 w-4" />;
      case 'Contas Premium': return <Crown className="h-4 w-4" />;
      case 'Vendedores': return <Users className="h-4 w-4" />;
      case 'Revendedor': return <Users className="h-4 w-4" />;
      default: return <Tag className="h-4 w-4" />;
    }
  };

  // Filter templates
  const filteredTemplates = templates.filter(template => {
    // Platform filter (Telegram templates have [TG] prefix)
    if (platformFilter === 'telegram' && !template.name.startsWith('[TG]')) return false;
    if (platformFilter === 'whatsapp' && template.name.startsWith('[TG]')) return false;
    
    // Category filter by name prefix - supports all categories including custom ones
    if (categoryFilter !== 'all') {
      const templateName = template.name.replace('[TG] ', '').toLowerCase();
      const filterLower = categoryFilter.toLowerCase();
      
      // Check for known category mappings
      if (categoryFilter === 'IPTV' && !templateName.includes('iptv')) return false;
      if (categoryFilter === 'P2P' && !templateName.includes('p2p')) return false;
      if (categoryFilter === 'SSH' && !templateName.includes('ssh')) return false;
      if (categoryFilter === 'Contas Premium' && !templateName.includes('premium')) return false;
      if (categoryFilter === 'Vendedores' && !templateName.includes('vendedor')) return false;
      if (categoryFilter === 'Revendedor' && !templateName.includes('revendedor')) return false;
      
      // For custom categories, check if template name contains the category name
      if (!['IPTV', 'P2P', 'SSH', 'Contas Premium', 'Vendedores', 'Revendedor'].includes(categoryFilter)) {
        if (!templateName.includes(filterLower)) return false;
      }
    }
    
    // Type filter
    if (typeFilter !== 'all' && template.type !== typeFilter) return false;
    
    return true;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Templates de Mensagem</h1>
          <p className="text-muted-foreground">Crie mensagens personalizadas para IPTV, SSH e Contas Premium</p>
        </div>

        <div className="flex gap-2 flex-wrap">
          {user && (
            <GenerateDefaultData 
              userId={user.id} 
              isAdmin={isAdmin} 
              companyName={profile?.full_name || undefined}
            />
          )}

          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) {
              setEditingTemplate(null);
              resetForm();
            }
          }}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Novo Template
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingTemplate ? 'Editar Template' : 'Novo Template'}</DialogTitle>
              <DialogDescription>
                Use variáveis como {'{nome}'} e {'{vencimento}'} para personalizar
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome do Template *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="IPTV - Lembrete de Vencimento"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tipo de Mensagem</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(v) => setFormData({ ...formData, type: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MESSAGE_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.icon} {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="message">Mensagem *</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowVariables(!showVariables)}
                  >
                    <Info className="h-4 w-4 mr-1" />
                    Variáveis
                  </Button>
                </div>
                <Textarea
                  id="message"
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  placeholder="Olá {nome}! Seu plano {plano} vence em {dias_restantes} dias..."
                  rows={8}
                  required
                />
              </div>

              {showVariables && (
                <div className="p-3 rounded-lg bg-muted/50 space-y-2">
                  <p className="text-sm font-medium">Clique para inserir:</p>
                  <div className="flex flex-wrap gap-2">
                    {clientVariables.map((v) => (
                      <Button
                        key={v.name}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => insertVariable(v.name)}
                        title={v.description}
                      >
                        {v.name}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {editingTemplate ? 'Salvar' : 'Criar Template'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Add New Category */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Tag className="h-4 w-4" />
            Nova Categoria
          </CardTitle>
          <CardDescription>
            Crie uma nova categoria para organizar seus templates
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="Nome da categoria"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              className="max-w-xs"
            />
            <Button
              variant="outline"
              onClick={() => {
                if (newCategoryName.trim()) {
                  addCategoryMutation.mutate(newCategoryName.trim());
                }
              }}
              disabled={!newCategoryName.trim() || addCategoryMutation.isPending}
            >
              <Plus className="h-4 w-4 mr-1" />
              Adicionar
            </Button>
          </div>
          {customCategories.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2 items-center">
              <span className="text-sm text-muted-foreground">Suas categorias:</span>
              {customCategories.map((cat) => (
                <div key={cat.id} className="flex items-center gap-1 text-xs bg-muted px-2 py-1 rounded group">
                  <span>{cat.name}</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Excluir categoria "${cat.name}"?`)) {
                        deleteCategoryMutation.mutate(cat.id);
                      }
                    }}
                    className="text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                    title="Excluir categoria"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Variables Reference */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Info className="h-4 w-4" />
            Variáveis Disponíveis - Clientes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {clientVariables.map((v) => (
              <div
                key={v.name}
                className="text-xs bg-muted px-2 py-1.5 rounded"
                title={v.description}
              >
                <span className="font-mono font-medium">{v.name}</span>
                <span className="text-muted-foreground ml-1">- {v.description}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Admin-only Seller Variables Reference */}
      {isAdmin && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" />
              Variáveis Disponíveis - Vendedores
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {sellerVariables.map((v) => (
                <div
                  key={v.name}
                  className="text-xs bg-muted px-2 py-1.5 rounded"
                  title={v.description}
                >
                  <span className="font-mono font-medium">{v.name}</span>
                  <span className="text-muted-foreground ml-1">- {v.description}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      {templates.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-4">
            {/* Platform Filter */}
            <div className="space-y-1">
              <Label className="text-sm text-muted-foreground">Plataforma</Label>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={platformFilter === 'all' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setPlatformFilter('all')}
                >
                  Todas
                </Button>
                <Button
                  variant={platformFilter === 'whatsapp' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setPlatformFilter('whatsapp')}
                  className="gap-1"
                >
                  📱 WhatsApp
                </Button>
                <Button
                  variant={platformFilter === 'telegram' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setPlatformFilter('telegram')}
                  className="gap-1"
                >
                  <Send className="h-3 w-3" />
                  Telegram
                </Button>
              </div>
            </div>
            
            {/* Category Filter */}
            <div className="space-y-1">
              <Label className="text-sm text-muted-foreground">Categoria</Label>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={categoryFilter === 'all' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setCategoryFilter('all')}
                >
                  Todas
                </Button>
                {allCategories.map((cat) => (
                  <Button
                    key={cat}
                    variant={categoryFilter === cat ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setCategoryFilter(cat)}
                    className="gap-1"
                  >
                    {getCategoryIcon(cat)}
                    {cat}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          
          {/* Type Filter */}
          <div className="space-y-1">
            <Label className="text-sm text-muted-foreground">Tipo de Mensagem</Label>
            <Tabs value={typeFilter} onValueChange={setTypeFilter}>
              <TabsList className="flex-wrap h-auto">
                <TabsTrigger value="all">Todos</TabsTrigger>
                {MESSAGE_TYPES.map((type) => (
                  <TabsTrigger key={type.value} value={type.value}>
                    {type.icon} {type.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-6 bg-muted rounded w-3/4 mb-4" />
                <div className="h-20 bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : templates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhum template cadastrado</h3>
            <p className="text-muted-foreground text-center mb-4">
              Gere templates padrão ou crie seu primeiro template
            </p>
          </CardContent>
        </Card>
      ) : filteredTemplates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhum template encontrado</h3>
            <p className="text-muted-foreground text-center">
              Tente ajustar os filtros
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filteredTemplates.map((template) => (
            <Card key={template.id} className="transition-all duration-200 hover:shadow-lg animate-slide-up">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{template.name}</CardTitle>
                    <span className={cn(
                      'text-xs px-2 py-0.5 rounded-full mt-1 inline-flex items-center gap-1',
                      typeColors[template.type]
                    )}>
                      {getTypeIcon(template.type)} {getTypeLabel(template.type)}
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="bg-muted/50 p-3 rounded-lg mb-4 max-h-40 overflow-y-auto">
                  <p className="text-sm whitespace-pre-wrap">{template.message}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => copyMessage(template.message)}>
                    <Copy className="h-4 w-4 mr-1" />
                    Copiar
                  </Button>
                  <Button variant="outline" size="icon" onClick={() => handleEdit(template)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      if (confirm('Tem certeza que deseja excluir este template?')) {
                        deleteMutation.mutate(template.id);
                      }
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
    </div>
  );
}
