import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabaseExternal as supabase } from '@/lib/supabase-external';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
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
import { Plus, Tag, Percent, DollarSign, Calendar, Edit, Trash2, Copy } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from '@/components/ConfirmDialog';

interface Coupon {
  id: string;
  code: string;
  name: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  max_uses: number | null;
  current_uses: number;
  min_plan_value: number | null;
  expires_at: string | null;
  is_active: boolean;
}

export default function Coupons() {
  const { user } = useAuth();
  const { dialogProps, confirm } = useConfirmDialog();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    discount_type: 'percentage' as 'percentage' | 'fixed',
    discount_value: '',
    max_uses: '',
    min_plan_value: '',
    expires_at: '',
    is_active: true,
  });

  const { data: coupons = [], isLoading } = useQuery({
    queryKey: ['coupons', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('coupons')
        .select('*')
        .eq('seller_id', user!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Coupon[];
    },
    enabled: !!user?.id,
  });

  const createMutation = useMutation({
    mutationFn: async (data: { code: string; name: string; discount_type: 'percentage' | 'fixed'; discount_value: number; max_uses?: number | null; min_plan_value?: number | null; expires_at?: string | null; is_active: boolean }) => {
      const { error } = await supabase.from('coupons').insert([{
        ...data,
        seller_id: user!.id,
      }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coupons'] });
      toast.success('Cupom criado com sucesso!');
      resetForm();
      setIsDialogOpen(false);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Coupon> }) => {
      const { error } = await supabase.from('coupons').update(data).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coupons'] });
      toast.success('Cupom atualizado!');
      resetForm();
      setIsDialogOpen(false);
      setEditingCoupon(null);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('coupons').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coupons'] });
      toast.success('Cupom excluído!');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const generateCode = () => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    setFormData({ ...formData, code });
  };

  const resetForm = () => {
    setFormData({
      code: '',
      name: '',
      discount_type: 'percentage',
      discount_value: '',
      max_uses: '',
      min_plan_value: '',
      expires_at: '',
      is_active: true,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      code: formData.code.toUpperCase(),
      name: formData.name,
      discount_type: formData.discount_type,
      discount_value: parseFloat(formData.discount_value) || 0,
      max_uses: formData.max_uses ? parseInt(formData.max_uses) : null,
      min_plan_value: formData.min_plan_value ? parseFloat(formData.min_plan_value) : null,
      expires_at: formData.expires_at || null,
      is_active: formData.is_active,
    };

    if (editingCoupon) {
      updateMutation.mutate({ id: editingCoupon.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (coupon: Coupon) => {
    setEditingCoupon(coupon);
    setFormData({
      code: coupon.code,
      name: coupon.name,
      discount_type: coupon.discount_type,
      discount_value: coupon.discount_value > 0 ? coupon.discount_value.toString() : '',
      max_uses: coupon.max_uses?.toString() || '',
      min_plan_value: coupon.min_plan_value && coupon.min_plan_value > 0 ? coupon.min_plan_value.toString() : '',
      expires_at: coupon.expires_at ? format(new Date(coupon.expires_at), 'yyyy-MM-dd') : '',
      is_active: coupon.is_active,
    });
    setIsDialogOpen(true);
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success('Código copiado!');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Cupons de Desconto</h1>
          <p className="text-muted-foreground">Crie cupons promocionais para seus clientes</p>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          if (!open && (createMutation.isPending || updateMutation.isPending)) {
            return;
          }
          setIsDialogOpen(open);
          if (!open) {
            setEditingCoupon(null);
            resetForm();
          }
        }}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Novo Cupom
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
              <DialogTitle>{editingCoupon ? 'Editar Cupom' : 'Novo Cupom'}</DialogTitle>
              <DialogDescription>
                {editingCoupon ? 'Atualize os dados do cupom' : 'Crie um cupom de desconto'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="code">Código *</Label>
                <div className="flex gap-2">
                  <Input
                    id="code"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    placeholder="DESCONTO10"
                    required
                    className="uppercase"
                  />
                  <Button type="button" variant="outline" onClick={generateCode}>
                    Gerar
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Nome do Cupom *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Promoção de Natal"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tipo de Desconto</Label>
                  <Select
                    value={formData.discount_type}
                    onValueChange={(v) => setFormData({ ...formData, discount_type: v as 'percentage' | 'fixed' })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">Percentual (%)</SelectItem>
                      <SelectItem value="fixed">Valor Fixo (R$)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="discount_value">
                    Valor {formData.discount_type === 'percentage' ? '(%)' : '(R$)'} *
                  </Label>
                  <Input
                    id="discount_value"
                    type="number"
                    step={formData.discount_type === 'percentage' ? '1' : '0.01'}
                    min="0"
                    value={formData.discount_value}
                    onChange={(e) => setFormData({ ...formData, discount_value: e.target.value })}
                    placeholder={formData.discount_type === 'percentage' ? '10' : '0.00'}
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="max_uses">Limite de Usos</Label>
                  <Input
                    id="max_uses"
                    type="number"
                    value={formData.max_uses}
                    onChange={(e) => setFormData({ ...formData, max_uses: e.target.value })}
                    placeholder="Ilimitado"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="min_plan_value">Valor Mínimo (R$)</Label>
                  <Input
                    id="min_plan_value"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.min_plan_value}
                    onChange={(e) => setFormData({ ...formData, min_plan_value: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="expires_at">Data de Expiração</Label>
                <Input
                  id="expires_at"
                  type="date"
                  value={formData.expires_at}
                  onChange={(e) => setFormData({ ...formData, expires_at: e.target.value })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="is_active">Cupom Ativo</Label>
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
                  {editingCoupon ? 'Salvar' : 'Criar Cupom'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

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
      ) : coupons.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Tag className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhum cupom cadastrado</h3>
            <p className="text-muted-foreground text-center">
              Crie seu primeiro cupom de desconto
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {coupons.map((coupon) => (
            <Card
              key={coupon.id}
              className={cn(
                'transition-all duration-200 hover:shadow-lg animate-slide-up',
                !coupon.is_active && 'opacity-60'
              )}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <code className="text-lg font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">
                        {coupon.code}
                      </code>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyCode(coupon.code)}>
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <CardTitle className="text-base">{coupon.name}</CardTitle>
                  </div>
                  <span className={cn(
                    'text-xs px-2 py-0.5 rounded-full',
                    coupon.is_active ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'
                  )}>
                    {coupon.is_active ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-2">
                    {coupon.discount_type === 'percentage' ? (
                      <Percent className="h-4 w-4 text-primary" />
                    ) : (
                      <DollarSign className="h-4 w-4 text-primary" />
                    )}
                    <span className="text-xl font-bold">
                      {coupon.discount_type === 'percentage' 
                        ? `${coupon.discount_value}%` 
                        : `R$ ${coupon.discount_value.toFixed(2)}`}
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground space-y-1">
                    {coupon.max_uses && (
                      <p>Usos: {coupon.current_uses}/{coupon.max_uses}</p>
                    )}
                    {coupon.expires_at && (
                      <p className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        Expira: {format(new Date(coupon.expires_at), "dd/MM/yyyy")}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-3 border-t border-border">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => handleEdit(coupon)}>
                    <Edit className="h-4 w-4 mr-1" />
                    Editar
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      confirm({
                        title: 'Excluir cupom',
                        description: `Tem certeza que deseja excluir o cupom "${coupon.code}"?`,
                        confirmText: 'Excluir',
                        variant: 'destructive',
                        onConfirm: () => deleteMutation.mutate(coupon.id),
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
