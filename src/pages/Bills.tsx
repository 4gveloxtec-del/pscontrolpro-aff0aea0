import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Plus, CreditCard, Calendar, User, Phone, DollarSign, Check, Edit, Trash2 } from 'lucide-react';
import { format, isBefore, startOfToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from '@/components/ConfirmDialog';

interface Bill {
  id: string;
  description: string;
  recipient_name: string;
  recipient_whatsapp: string | null;
  recipient_pix: string | null;
  amount: number;
  due_date: string;
  is_paid: boolean;
  paid_at: string | null;
  notes: string | null;
}

type FilterType = 'all' | 'pending' | 'paid' | 'overdue';

export default function Bills() {
  const { user } = useAuth();
  const { dialogProps, confirm } = useConfirmDialog();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingBill, setEditingBill] = useState<Bill | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');
  const [formData, setFormData] = useState({
    description: '',
    recipient_name: '',
    recipient_whatsapp: '',
    recipient_pix: '',
    amount: '',
    due_date: format(new Date(), 'yyyy-MM-dd'),
    notes: '',
  });

  const { data: bills = [], isLoading } = useQuery({
    queryKey: ['bills', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bills_to_pay')
        .select('*')
        .eq('seller_id', user!.id)
        .order('due_date', { ascending: true });
      if (error) throw error;
      return data as Bill[];
    },
    enabled: !!user?.id,
  });

  const createMutation = useMutation({
    mutationFn: async (data: { description: string; recipient_name: string; recipient_whatsapp?: string | null; recipient_pix?: string | null; amount: number; due_date: string; notes?: string | null }) => {
      const { error } = await supabase.from('bills_to_pay').insert([{
        ...data,
        seller_id: user!.id,
      }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills'] });
      toast.success('Conta criada com sucesso!');
      resetForm();
      setIsDialogOpen(false);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Bill> }) => {
      const { error } = await supabase.from('bills_to_pay').update(data).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills'] });
      toast.success('Conta atualizada!');
      resetForm();
      setIsDialogOpen(false);
      setEditingBill(null);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('bills_to_pay').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills'] });
      toast.success('Conta excluída!');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const togglePaidMutation = useMutation({
    mutationFn: async ({ id, is_paid }: { id: string; is_paid: boolean }) => {
      const { error } = await supabase.from('bills_to_pay').update({
        is_paid,
        paid_at: is_paid ? new Date().toISOString() : null,
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills'] });
      toast.success('Status atualizado!');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const resetForm = () => {
    setFormData({
      description: '',
      recipient_name: '',
      recipient_whatsapp: '',
      recipient_pix: '',
      amount: '',
      due_date: format(new Date(), 'yyyy-MM-dd'),
      notes: '',
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      description: formData.description,
      recipient_name: formData.recipient_name,
      recipient_whatsapp: formData.recipient_whatsapp || null,
      recipient_pix: formData.recipient_pix || null,
      amount: parseFloat(formData.amount) || 0,
      due_date: formData.due_date,
      notes: formData.notes || null,
    };

    if (editingBill) {
      updateMutation.mutate({ id: editingBill.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (bill: Bill) => {
    setEditingBill(bill);
    setFormData({
      description: bill.description,
      recipient_name: bill.recipient_name,
      recipient_whatsapp: bill.recipient_whatsapp || '',
      recipient_pix: bill.recipient_pix || '',
      amount: bill.amount > 0 ? bill.amount.toString() : '',
      due_date: bill.due_date,
      notes: bill.notes || '',
    });
    setIsDialogOpen(true);
  };

  const today = startOfToday();

  const getBillStatus = (bill: Bill) => {
    if (bill.is_paid) return 'paid';
    if (isBefore(new Date(bill.due_date), today)) return 'overdue';
    return 'pending';
  };

  const filteredBills = bills.filter((bill) => {
    const status = getBillStatus(bill);
    switch (filter) {
      case 'pending':
        return status === 'pending';
      case 'paid':
        return status === 'paid';
      case 'overdue':
        return status === 'overdue';
      default:
        return true;
    }
  });

  // AUDIT FIX: Safe numeric coercion for bill totals
  const totalPending = bills.filter(b => !b.is_paid).reduce((sum, b) => {
    const amount = Number(b.amount) || 0;
    return sum + (amount > 0 ? amount : 0);
  }, 0);
  const totalOverdue = bills.filter(b => getBillStatus(b) === 'overdue').reduce((sum, b) => {
    const amount = Number(b.amount) || 0;
    return sum + (amount > 0 ? amount : 0);
  }, 0);

  const statusColors = {
    pending: 'border-l-warning',
    paid: 'border-l-success',
    overdue: 'border-l-destructive',
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Contas a Pagar</h1>
          <p className="text-muted-foreground">Gerencie suas despesas e pagamentos</p>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          if (!open && (createMutation.isPending || updateMutation.isPending)) {
            return;
          }
          setIsDialogOpen(open);
          if (!open) {
            setEditingBill(null);
            resetForm();
          }
        }}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Nova Conta
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingBill ? 'Editar Conta' : 'Nova Conta'}</DialogTitle>
              <DialogDescription>
                {editingBill ? 'Atualize os dados da conta' : 'Adicione uma nova conta a pagar'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="description">Descrição *</Label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Mensalidade servidor"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="recipient_name">Nome do Destinatário *</Label>
                <Input
                  id="recipient_name"
                  value={formData.recipient_name}
                  onChange={(e) => setFormData({ ...formData, recipient_name: e.target.value })}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="amount">Valor (R$) *</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    placeholder="Ex: 50.00"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="due_date">Vencimento *</Label>
                  <Input
                    id="due_date"
                    type="date"
                    value={formData.due_date}
                    onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="recipient_whatsapp">WhatsApp</Label>
                <Input
                  id="recipient_whatsapp"
                  value={formData.recipient_whatsapp}
                  onChange={(e) => setFormData({ ...formData, recipient_whatsapp: e.target.value })}
                  placeholder="+55 11 99999-9999"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="recipient_pix">Chave PIX</Label>
                <Input
                  id="recipient_pix"
                  value={formData.recipient_pix}
                  onChange={(e) => setFormData({ ...formData, recipient_pix: e.target.value })}
                />
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
                  {editingBill ? 'Salvar' : 'Criar Conta'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="bg-warning/5 border-warning/20">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="p-3 rounded-lg bg-warning/10">
              <CreditCard className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Pendente</p>
              <p className="text-2xl font-bold">R$ {totalPending.toFixed(2)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-destructive/5 border-destructive/20">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="p-3 rounded-lg bg-destructive/10">
              <CreditCard className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Vencido</p>
              <p className="text-2xl font-bold">R$ {totalOverdue.toFixed(2)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterType)}>
        <TabsList>
          <TabsTrigger value="all">Todas ({bills.length})</TabsTrigger>
          <TabsTrigger value="pending">Pendentes</TabsTrigger>
          <TabsTrigger value="overdue">Vencidas</TabsTrigger>
          <TabsTrigger value="paid">Pagas</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Bills List */}
      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-4">
                <div className="h-6 bg-muted rounded w-3/4 mb-2" />
                <div className="h-4 bg-muted rounded w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredBills.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CreditCard className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhuma conta encontrada</h3>
            <p className="text-muted-foreground text-center">
              Adicione sua primeira conta a pagar
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredBills.map((bill) => {
            const status = getBillStatus(bill);
            return (
              <Card
                key={bill.id}
                className={cn(
                  'border-l-4 transition-all duration-200 hover:shadow-lg animate-slide-up',
                  statusColors[status]
                )}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <Checkbox
                        checked={bill.is_paid}
                        onCheckedChange={(checked) => 
                          togglePaidMutation.mutate({ id: bill.id, is_paid: checked as boolean })
                        }
                      />
                      <div>
                        <h3 className={cn(
                          'font-semibold',
                          bill.is_paid && 'line-through text-muted-foreground'
                        )}>
                          {bill.description}
                        </h3>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                          <span className="flex items-center gap-1">
                            <User className="h-3.5 w-3.5" />
                            {bill.recipient_name}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />
                            {format(new Date(bill.due_date), "dd/MM/yyyy")}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-lg font-bold">R$ {bill.amount.toFixed(2)}</span>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(bill)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => {
                            confirm({
                              title: 'Excluir conta',
                              description: `Tem certeza que deseja excluir esta conta de "${bill.recipient_name}"?`,
                              confirmText: 'Excluir',
                              variant: 'destructive',
                              onConfirm: () => deleteMutation.mutate(bill.id),
                            });
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Global Confirm Dialog */}
      <ConfirmDialog {...dialogProps} />
    </div>
  );
}
