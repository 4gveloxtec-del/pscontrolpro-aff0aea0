import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
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
import { Plus, Package, DollarSign, Clock, Edit, Trash2, Monitor, RefreshCw, Crown, PlusCircle, X, Sparkles, Box } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GenerateDefaultData } from '@/components/GenerateDefaultData';
import { ConfirmDialog } from '@/components/ConfirmDialog';

interface Plan {
  id: string;
  name: string;
  description: string | null;
  price: number;
  duration_days: number;
  is_active: boolean;
  category: string;
  screens: number;
}

interface CustomProduct {
  id: string;
  name: string;
  icon: string;
  is_active: boolean;
  created_at: string;
}

// Default categories - Premium is special for monthly subscription accounts
const DEFAULT_CATEGORIES = ['IPTV', 'P2P', 'SSH', 'Premium'];

type DurationFilter = 'all' | 30 | 90 | 180 | 365;

export default function Plans() {
  const { user, isAdmin, profile } = useAuth();
  const { dialogProps, confirm } = useConfirmDialog();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isProductDialogOpen, setIsProductDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [durationFilter, setDurationFilter] = useState<DurationFilter>('all');
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newProductName, setNewProductName] = useState('');
  const [newProductIcon, setNewProductIcon] = useState('📦');
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    duration_days: '30',
    is_active: true,
    category: 'IPTV',
    screens: '1',
  });

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ['plans', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('plans')
        .select('*')
        .eq('seller_id', user!.id)
        .order('category')
        .order('duration_days')
        .order('screens');
      if (error) throw error;
      return data as Plan[];
    },
    enabled: !!user?.id,
  });

  // Fetch custom products
  const { data: customProducts = [] } = useQuery({
    queryKey: ['custom-products', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('custom_products')
        .select('*')
        .eq('seller_id', user!.id)
        .order('name');
      if (error) throw error;
      return data as CustomProduct[];
    },
    enabled: !!user?.id,
  });

  // Get all unique categories (default + custom products)
  const allCategories = [...new Set([
    ...DEFAULT_CATEGORIES,
    ...customProducts.map(p => p.name),
    ...plans.map(p => p.category).filter(Boolean)
  ])];

  // Create custom product mutation
  const createProductMutation = useMutation({
    mutationFn: async (data: { name: string; icon: string }) => {
      // 1. Create the custom product
      const { error: productError } = await supabase
        .from('custom_products')
        .insert([{
          name: data.name,
          icon: data.icon,
          seller_id: user!.id,
        }]);
      if (productError) throw productError;

      // 2. Call database function to create templates
      const { error: templateError } = await supabase.rpc('create_templates_for_custom_product', {
        p_seller_id: user!.id,
        p_product_name: data.name,
      });
      if (templateError) console.error('Error creating templates:', templateError);

      // 3. Call database function to create default plans
      const { error: planError } = await supabase.rpc('create_plans_for_custom_product', {
        p_seller_id: user!.id,
        p_product_name: data.name,
      });
      if (planError) console.error('Error creating plans:', planError);

      return data.name;
    },
    onSuccess: (name) => {
      queryClient.invalidateQueries({ queryKey: ['custom-products'] });
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-templates'] });
      toast.success(`Produto "${name}" criado com planos e templates!`);
      setIsProductDialogOpen(false);
      setNewProductName('');
      setNewProductIcon('📦');
    },
    onError: (error: Error) => {
      if (error.message.includes('duplicate')) {
        toast.error('Já existe um produto com esse nome');
      } else {
        toast.error(error.message);
      }
    },
  });

  // Delete custom product mutation
  const deleteProductMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('custom_products')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-products'] });
      toast.success('Produto removido!');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string | null; price: number; duration_days: number; is_active: boolean; category: string; screens: number }) => {
      const { error } = await supabase.from('plans').insert([{
        ...data,
        seller_id: user!.id,
      }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      toast.success('Plano criado com sucesso!');
      resetForm();
      setIsDialogOpen(false);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });


  const updateMutation = useMutation({
    mutationFn: async ({ id, data, syncPrice }: { id: string; data: Partial<Plan>; syncPrice?: { category: string; duration_days: number; screens: number; price: number } }) => {
      // Update the main plan
      const { error } = await supabase.from('plans').update(data).eq('id', id);
      if (error) throw error;
      
      // If IPTV or P2P, sync price with the equivalent plan in the other category
      if (syncPrice && (syncPrice.category === 'IPTV' || syncPrice.category === 'P2P')) {
        const otherCategory = syncPrice.category === 'IPTV' ? 'P2P' : 'IPTV';
        await supabase
          .from('plans')
          .update({ price: syncPrice.price })
          .eq('seller_id', user!.id)
          .eq('category', otherCategory)
          .eq('duration_days', syncPrice.duration_days)
          .eq('screens', syncPrice.screens);
      }
      
      // Sync plan_price for clients with this plan that have price 0 or null
      if (data.price !== undefined && data.price > 0) {
        // Update clients that have this plan_id and plan_price = 0 or null
        await supabase
          .from('clients')
          .update({ 
            plan_price: data.price,
            plan_name: data.name || undefined
          })
          .eq('plan_id', id)
          .eq('seller_id', user!.id)
          .or('plan_price.is.null,plan_price.eq.0');
        
        // Also sync clients that have the equivalent plan in IPTV/P2P
        if (syncPrice && (syncPrice.category === 'IPTV' || syncPrice.category === 'P2P')) {
          const otherCategory = syncPrice.category === 'IPTV' ? 'P2P' : 'IPTV';
          
          // Find the equivalent plan ID
          const { data: equivalentPlans } = await supabase
            .from('plans')
            .select('id')
            .eq('seller_id', user!.id)
            .eq('category', otherCategory)
            .eq('duration_days', syncPrice.duration_days)
            .eq('screens', syncPrice.screens)
            .limit(1);
          
          if (equivalentPlans && equivalentPlans.length > 0) {
            await supabase
              .from('clients')
              .update({ plan_price: data.price })
              .eq('plan_id', equivalentPlans[0].id)
              .eq('seller_id', user!.id)
              .or('plan_price.is.null,plan_price.eq.0');
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      toast.success('Plano atualizado! Clientes com valor R$ 0 foram sincronizados.');
      resetForm();
      setIsDialogOpen(false);
      setEditingPlan(null);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('plans').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      toast.success('Plano excluído!');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const syncAllClientsMutation = useMutation({
    mutationFn: async () => {
      // Get all plans
      const { data: allPlans, error: plansError } = await supabase
        .from('plans')
        .select('id, name, price')
        .eq('seller_id', user!.id);
      
      if (plansError) throw plansError;
      
      let syncedCount = 0;
      
      // Update clients for each plan
      for (const plan of allPlans || []) {
        const { data: updatedClients } = await supabase
          .from('clients')
          .update({ 
            plan_price: plan.price,
            plan_name: plan.name
          })
          .eq('plan_id', plan.id)
          .eq('seller_id', user!.id)
          .select('id');
        
        syncedCount += updatedClients?.length || 0;
      }
      
      return syncedCount;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      toast.success(`${count} cliente(s) sincronizado(s) com sucesso!`);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      price: '',
      duration_days: '30',
      is_active: true,
      category: 'IPTV',
      screens: '1',
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      name: formData.name,
      description: formData.description || null,
      price: parseFloat(formData.price) || 0,
      duration_days: parseInt(formData.duration_days) || 30,
      is_active: formData.is_active,
      category: formData.category,
      screens: parseInt(formData.screens) || 1,
    };

    if (editingPlan) {
      // Sync prices between IPTV and P2P (SSH is independent)
      const syncPrice = (formData.category === 'IPTV' || formData.category === 'P2P') 
        ? {
            category: formData.category,
            duration_days: data.duration_days,
            screens: data.screens,
            price: data.price,
          }
        : undefined;
      updateMutation.mutate({ id: editingPlan.id, data, syncPrice });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (plan: Plan) => {
    setEditingPlan(plan);
    setFormData({
      name: plan.name,
      description: plan.description || '',
      price: plan.price > 0 ? plan.price.toString() : '',
      duration_days: plan.duration_days.toString(),
      is_active: plan.is_active,
      category: plan.category || 'IPTV',
      screens: (plan.screens || 1).toString(),
    });
    setIsDialogOpen(true);
  };

  const handleCreateProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProductName.trim()) {
      toast.error('Digite o nome do produto');
      return;
    }
    createProductMutation.mutate({
      name: newProductName.trim(),
      icon: newProductIcon,
    });
  };

  const filteredPlans = plans.filter(plan => {
    const matchesCategory = categoryFilter === 'all' || plan.category === categoryFilter;
    const matchesDuration = durationFilter === 'all' || plan.duration_days === durationFilter;
    return matchesCategory && matchesDuration;
  });

  const getDurationLabel = (days: number) => {
    if (days === 30) return 'Mensal';
    if (days === 90) return 'Trimestral';
    if (days === 180) return 'Semestral';
    if (days === 365) return 'Anual';
    return `${days} dias`;
  };

  const getDurationColor = (days: number) => {
    if (days === 30) return 'bg-blue-500/10 text-blue-500 border-blue-500/30';
    if (days === 90) return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30';
    if (days === 180) return 'bg-amber-500/10 text-amber-500 border-amber-500/30';
    if (days === 365) return 'bg-purple-500/10 text-purple-500 border-purple-500/30';
    return 'bg-muted text-muted-foreground border-border';
  };

  const getCardBorderColor = (days: number) => {
    if (days === 30) return 'border-l-blue-500';
    if (days === 90) return 'border-l-emerald-500';
    if (days === 180) return 'border-l-amber-500';
    if (days === 365) return 'border-l-purple-500';
    return 'border-l-border';
  };

  const isCustomCategory = (cat: string) => !DEFAULT_CATEGORIES.includes(cat);
  const getProductIcon = (cat: string) => {
    const product = customProducts.find(p => p.name === cat);
    return product?.icon || '📦';
  };

  // Common emoji options for products
  const emojiOptions = ['📦', '🎬', '🎵', '🎮', '📺', '🎥', '📱', '💎', '⭐', '🔥', '✨', '🎯'];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Planos</h1>
          <p className="text-muted-foreground">Gerencie planos de IPTV, SSH e produtos personalizados</p>
        </div>

        <div className="flex gap-2 flex-wrap">
          {user && (
            <GenerateDefaultData 
              userId={user.id} 
              isAdmin={isAdmin} 
              companyName={profile?.full_name || undefined}
            />
          )}
          
          <Button 
            variant="outline" 
            className="gap-2"
            onClick={() => syncAllClientsMutation.mutate()}
            disabled={syncAllClientsMutation.isPending}
          >
            <RefreshCw className={cn("h-4 w-4", syncAllClientsMutation.isPending && "animate-spin")} />
            {syncAllClientsMutation.isPending ? 'Sincronizando...' : 'Sincronizar'}
          </Button>

          {/* New Product Dialog */}
          <Dialog open={isProductDialogOpen} onOpenChange={setIsProductDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Sparkles className="h-4 w-4" />
                Novo Produto
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Box className="h-5 w-5" />
                  Criar Novo Produto
                </DialogTitle>
                <DialogDescription>
                  Crie um novo tipo de produto. Planos e templates serão gerados automaticamente!
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateProduct} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="productName">Nome do Produto *</Label>
                  <Input
                    id="productName"
                    value={newProductName}
                    onChange={(e) => setNewProductName(e.target.value)}
                    placeholder="Ex: Netflix, Spotify, Disney+"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Este será o nome da categoria e aparecerá nos filtros
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Ícone</Label>
                  <div className="flex flex-wrap gap-2">
                    {emojiOptions.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => setNewProductIcon(emoji)}
                        className={cn(
                          "w-10 h-10 rounded-lg border-2 text-xl flex items-center justify-center transition-all",
                          newProductIcon === emoji
                            ? "border-primary bg-primary/10"
                            : "border-border hover:border-primary/50"
                        )}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-success/10 border border-success/20">
                  <div className="flex items-center gap-2 text-success">
                    <Sparkles className="h-4 w-4" />
                    <span className="text-sm font-medium">Geração Automática</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Ao criar o produto, serão gerados automaticamente:
                  </p>
                  <ul className="text-xs text-muted-foreground mt-1 list-disc list-inside">
                    <li>4 planos (Mensal, Trimestral, Semestral, Anual)</li>
                    <li>8 templates de mensagem (boas-vindas, vencimento, cobrança, etc.)</li>
                  </ul>
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsProductDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={createProductMutation.isPending}>
                    {createProductMutation.isPending ? 'Criando...' : 'Criar Produto'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            // Prevent closing while mutation is pending
            if (!open && (createMutation.isPending || updateMutation.isPending)) {
              return;
            }
            setIsDialogOpen(open);
            if (!open) {
              setEditingPlan(null);
              resetForm();
            }
          }}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Novo Plano
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
                <DialogTitle>{editingPlan ? 'Editar Plano' : 'Novo Plano'}</DialogTitle>
                <DialogDescription>
                  {editingPlan ? 'Atualize os dados do plano' : 'Crie um novo plano de assinatura'}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="IPTV Mensal 1 Tela"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Descrição</Label>
                  <Input
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Acesso completo por 30 dias"
                  />
                </div>
                
<div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Categoria</Label>
                    {showNewCategoryInput ? (
                      <div className="flex gap-2">
                        <Input
                          value={newCategoryName}
                          onChange={(e) => setNewCategoryName(e.target.value)}
                          placeholder="Nome da categoria"
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            if (newCategoryName.trim()) {
                              setFormData({ ...formData, category: newCategoryName.trim() });
                              setShowNewCategoryInput(false);
                              setNewCategoryName('');
                            }
                          }}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            setShowNewCategoryInput(false);
                            setNewCategoryName('');
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <Select
                        value={formData.category}
                        onValueChange={(value) => {
                          if (value === '__new__') {
                            setShowNewCategoryInput(true);
                          } else {
                            setFormData({ ...formData, category: value });
                          }
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {allCategories.map((cat) => (
                            <SelectItem key={cat} value={cat}>
                              <span className="flex items-center gap-2">
                                {isCustomCategory(cat) && <span>{getProductIcon(cat)}</span>}
                                {cat === 'Premium' && <Crown className="h-3 w-3 text-amber-500" />}
                                {cat}
                                {cat === 'Premium' && <span className="text-xs text-muted-foreground">(Netflix, Spotify...)</span>}
                              </span>
                            </SelectItem>
                          ))}
                          <SelectItem value="__new__">
                            <span className="flex items-center gap-2 text-primary">
                              <PlusCircle className="h-3 w-3" />
                              Nova Categoria
                            </span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  {formData.category !== 'Premium' && !isCustomCategory(formData.category) && (
                    <div className="space-y-2">
                      <Label>{formData.category === 'SSH' ? 'Número de Conexões' : 'Número de Telas'}</Label>
                      <Select
                        value={formData.screens}
                        onValueChange={(value) => setFormData({ ...formData, screens: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {formData.category === 'SSH' ? (
                            <>
                              <SelectItem value="1">1 Conexão</SelectItem>
                              <SelectItem value="2">2 Conexões</SelectItem>
                              <SelectItem value="3">3 Conexões</SelectItem>
                              <SelectItem value="4">4 Conexões</SelectItem>
                              <SelectItem value="5">5 Conexões</SelectItem>
                            </>
                          ) : (
                            <>
                              <SelectItem value="1">1 Tela</SelectItem>
                              <SelectItem value="2">2 Telas</SelectItem>
                              <SelectItem value="3">3 Telas</SelectItem>
                              <SelectItem value="4">4 Telas</SelectItem>
                              <SelectItem value="5">5 Telas</SelectItem>
                            </>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                {(formData.category === 'Premium' || isCustomCategory(formData.category)) && (
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                      {isCustomCategory(formData.category) ? (
                        <span className="text-lg">{getProductIcon(formData.category)}</span>
                      ) : (
                        <Crown className="h-4 w-4" />
                      )}
                      <span className="text-sm font-medium">
                        {isCustomCategory(formData.category) ? formData.category : 'Conta Premium'}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {isCustomCategory(formData.category) 
                        ? 'Produto personalizado com templates próprios'
                        : 'Ideal para contas mensais como Netflix, Spotify, YouTube Premium, Disney+, etc.'}
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="price">Preço (R$) *</Label>
                    <Input
                      id="price"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                      placeholder="Ex: 25.00"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Duração</Label>
                    <Select
                      value={formData.duration_days}
                      onValueChange={(value) => setFormData({ ...formData, duration_days: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="30">Mensal (30 dias)</SelectItem>
                        <SelectItem value="90">Trimestral (90 dias)</SelectItem>
                        <SelectItem value="180">Semestral (180 dias)</SelectItem>
                        <SelectItem value="365">Anual (365 dias)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="is_active">Plano Ativo</Label>
                  <Switch
                    id="is_active"
                    checked={formData.is_active}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                  />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                    {editingPlan ? 'Salvar' : 'Criar Plano'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Custom Products Section */}
      {customProducts.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Seus Produtos Personalizados
            </CardTitle>
            <CardDescription>Produtos que você criou com planos e templates automáticos</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {customProducts.map((product) => (
                <div
                  key={product.id}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border border-border"
                >
                  <span className="text-lg">{product.icon}</span>
                  <span className="font-medium">{product.name}</span>
                  <span className="text-xs text-muted-foreground">
                    ({plans.filter(p => p.category === product.name).length} planos)
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-destructive hover:text-destructive"
                    onClick={() => {
                      confirm({
                        title: 'Remover produto',
                        description: `Remover o produto "${product.name}"? Os planos e templates não serão excluídos.`,
                        confirmText: 'Remover',
                        variant: 'destructive',
                        onConfirm: () => deleteProductMutation.mutate(product.id),
                      });
                    }}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      {plans.length > 0 && (
        <div className="space-y-3">
          {/* Category Filter */}
          <Tabs value={categoryFilter} onValueChange={(v) => setCategoryFilter(v)}>
            <TabsList className="flex-wrap h-auto gap-1">
              <TabsTrigger value="all">Todos ({plans.length})</TabsTrigger>
              {allCategories.map((cat) => {
                const count = plans.filter(p => p.category === cat).length;
                if (count === 0 && !DEFAULT_CATEGORIES.includes(cat) && !customProducts.find(p => p.name === cat)) return null;
                return (
                  <TabsTrigger key={cat} value={cat} className="gap-1">
                    {isCustomCategory(cat) && <span>{getProductIcon(cat)}</span>}
                    {cat === 'Premium' && <Crown className="h-3 w-3 text-amber-500" />}
                    {cat} ({count})
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>

          {/* Duration Filter */}
          <Tabs value={durationFilter.toString()} onValueChange={(v) => setDurationFilter(v === 'all' ? 'all' : Number(v) as DurationFilter)}>
            <TabsList>
              <TabsTrigger value="all">Todas Durações</TabsTrigger>
              <TabsTrigger value="30" className="text-blue-600 data-[state=active]:bg-blue-500/10">
                Mensal ({plans.filter(p => p.duration_days === 30).length})
              </TabsTrigger>
              <TabsTrigger value="90" className="text-emerald-600 data-[state=active]:bg-emerald-500/10">
                Trimestral ({plans.filter(p => p.duration_days === 90).length})
              </TabsTrigger>
              <TabsTrigger value="180" className="text-amber-600 data-[state=active]:bg-amber-500/10">
                Semestral ({plans.filter(p => p.duration_days === 180).length})
              </TabsTrigger>
              <TabsTrigger value="365" className="text-purple-600 data-[state=active]:bg-purple-500/10">
                Anual ({plans.filter(p => p.duration_days === 365).length})
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      )}

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
      ) : plans.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Package className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhum plano cadastrado</h3>
            <p className="text-muted-foreground text-center mb-4">
              Crie seu primeiro plano ou produto personalizado
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setIsProductDialogOpen(true)}>
                <Sparkles className="h-4 w-4 mr-2" />
                Novo Produto
              </Button>
              <Button onClick={() => setIsDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Novo Plano
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredPlans.map((plan) => (
            <Card
              key={plan.id}
              className={cn(
                'transition-all duration-200 hover:shadow-lg animate-slide-up border-l-4',
                getCardBorderColor(plan.duration_days),
                !plan.is_active && 'opacity-60',
                plan.price === 0 && 'ring-2 ring-warning/50'
              )}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={cn(
                        'text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1',
                        plan.category === 'IPTV' ? 'bg-primary/10 text-primary' : 
                        plan.category === 'P2P' ? 'bg-primary/10 text-primary' : 
                        plan.category === 'Premium' ? 'bg-amber-500/10 text-amber-600' :
                        isCustomCategory(plan.category) ? 'bg-purple-500/10 text-purple-600' :
                        'bg-secondary text-secondary-foreground'
                      )}>
                        {isCustomCategory(plan.category) && <span>{getProductIcon(plan.category)}</span>}
                        {plan.category === 'Premium' && <Crown className="h-3 w-3" />}
                        {plan.category}
                      </span>
                      <span className={cn(
                        'text-xs px-2 py-0.5 rounded-full font-medium border',
                        getDurationColor(plan.duration_days)
                      )}>
                        {getDurationLabel(plan.duration_days)}
                      </span>
                      {plan.category !== 'Premium' && !isCustomCategory(plan.category) && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground flex items-center gap-1">
                          <Monitor className="h-3 w-3" />
                          {plan.screens || 1} {plan.category === 'SSH' ? (plan.screens === 1 ? 'Conexão' : 'Conexões') : (plan.screens === 1 ? 'Tela' : 'Telas')}
                        </span>
                      )}
                    </div>
                    <CardTitle className="text-base">{plan.name}</CardTitle>
                    {plan.description && (
                      <CardDescription className="text-xs">{plan.description}</CardDescription>
                    )}
                  </div>
                  <span className={cn(
                    'text-xs px-2 py-0.5 rounded-full',
                    plan.is_active ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'
                  )}>
                    {plan.is_active ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-success" />
                    <span className={cn(
                      "text-xl font-bold",
                      plan.price === 0 && "text-warning"
                    )}>
                      {plan.price === 0 ? 'Definir preço' : `R$ ${plan.price.toFixed(2)}`}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-3 border-t border-border">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => handleEdit(plan)}>
                    <Edit className="h-4 w-4 mr-1" />
                    Editar
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      confirm({
                        title: 'Excluir plano',
                        description: `Tem certeza que deseja excluir o plano "${plan.name}"?`,
                        confirmText: 'Excluir',
                        variant: 'destructive',
                        onConfirm: () => deleteMutation.mutate(plan.id),
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

      {/* Global Confirm Dialog */}
      <ConfirmDialog {...dialogProps} />
    </div>
  );
}
