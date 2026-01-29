import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CreditCard, Plus, Loader2, Copy, ExternalLink, RefreshCw, Search, QrCode, DollarSign } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

interface Payment {
  id: string;
  reseller_id: string;
  asaas_payment_id: string | null;
  amount: number;
  description: string | null;
  status: string;
  due_date: string;
  paid_at: string | null;
  pix_copy_paste: string | null;
  pix_qr_code: string | null;
  invoice_url: string | null;
  created_at: string;
  profiles?: {
    full_name: string | null;
    email: string | null;
  };
}

interface Reseller {
  id: string;
  full_name: string | null;
  email: string | null;
}

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-400',
  confirmed: 'bg-green-500/20 text-green-400',
  received: 'bg-green-500/20 text-green-400',
  overdue: 'bg-red-500/20 text-red-400',
  refunded: 'bg-blue-500/20 text-blue-400',
  canceled: 'bg-slate-500/20 text-slate-400'
};

const statusLabels: Record<string, string> = {
  pending: 'Pendente',
  confirmed: 'Confirmado',
  received: 'Recebido',
  overdue: 'Vencido',
  refunded: 'Reembolsado',
  canceled: 'Cancelado'
};

export function AsaasResellerPayments() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    reseller_id: '',
    amount: '',
    description: '',
    due_date: format(new Date(), 'yyyy-MM-dd')
  });

  // Fetch payments
  const { data: payments = [], isLoading: loadingPayments } = useQuery({
    queryKey: ['asaas-payments', statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('asaas_reseller_payments')
        .select(`
          *,
          profiles:reseller_id (full_name, email)
        `)
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Payment[];
    }
  });

  // Fetch resellers for dropdown
  const { data: resellers = [] } = useQuery({
    queryKey: ['resellers-for-payment'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .order('full_name');

      if (error) throw error;
      return data as Reseller[];
    }
  });

  // Create payment mutation
  const createPaymentMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { data: result, error } = await supabase.functions.invoke('asaas-create-payment', {
        body: {
          reseller_id: data.reseller_id,
          amount: parseFloat(data.amount),
          description: data.description,
          due_date: data.due_date
        }
      });

      if (error) throw error;
      if (!result.success) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asaas-payments'] });
      toast.success('Cobrança criada com sucesso!');
      setIsCreateOpen(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast.error(`Erro ao criar cobrança: ${error.message}`);
    }
  });

  // Sync payment status mutation
  const syncStatusMutation = useMutation({
    mutationFn: async (paymentId: string) => {
      const { data, error } = await supabase.functions.invoke('asaas-sync-payment', {
        body: { payment_id: paymentId }
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asaas-payments'] });
      toast.success('Status atualizado!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao sincronizar: ${error.message}`);
    }
  });

  const resetForm = () => {
    setFormData({
      reseller_id: '',
      amount: '',
      description: '',
      due_date: format(new Date(), 'yyyy-MM-dd')
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copiado!');
  };

  const filteredPayments = payments.filter(payment => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      payment.profiles?.full_name?.toLowerCase().includes(searchLower) ||
      payment.profiles?.email?.toLowerCase().includes(searchLower) ||
      payment.description?.toLowerCase().includes(searchLower)
    );
  });

  // Stats
  const stats = {
    total: payments.length,
    pending: payments.filter(p => p.status === 'pending').length,
    received: payments.filter(p => ['confirmed', 'received'].includes(p.status)).length,
    overdue: payments.filter(p => p.status === 'overdue').length,
    totalReceived: payments
      .filter(p => ['confirmed', 'received'].includes(p.status))
      .reduce((acc, p) => acc + Number(p.amount), 0)
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-white">{stats.total}</div>
            <p className="text-xs text-slate-400">Total Cobranças</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-yellow-400">{stats.pending}</div>
            <p className="text-xs text-slate-400">Pendentes</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-400">{stats.received}</div>
            <p className="text-xs text-slate-400">Recebidos</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-400">
              R$ {stats.totalReceived.toFixed(2)}
            </div>
            <p className="text-xs text-slate-400">Total Recebido</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Card */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-white flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-green-500" />
                Cobranças ASAAS
              </CardTitle>
              <CardDescription className="text-slate-400">
                Gerencie cobranças PIX para revendedores
              </CardDescription>
            </div>
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button className="bg-green-600 hover:bg-green-700">
                  <Plus className="h-4 w-4 mr-2" />
                  Nova Cobrança
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-slate-800 border-slate-700">
                <DialogHeader>
                  <DialogTitle className="text-white">Criar Nova Cobrança</DialogTitle>
                  <DialogDescription className="text-slate-400">
                    Gere uma cobrança PIX para um revendedor
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label className="text-slate-300">Revendedor</Label>
                    <Select
                      value={formData.reseller_id}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, reseller_id: value }))}
                    >
                      <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
                        <SelectValue placeholder="Selecione o revendedor" />
                      </SelectTrigger>
                      <SelectContent>
                        {resellers.map(reseller => (
                          <SelectItem key={reseller.id} value={reseller.id}>
                            {reseller.full_name || reseller.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-300">Valor (R$)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="1"
                      value={formData.amount}
                      onChange={(e) => setFormData(prev => ({ ...prev, amount: e.target.value }))}
                      placeholder="0.00"
                      className="bg-slate-700 border-slate-600 text-white"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-300">Descrição</Label>
                    <Input
                      value={formData.description}
                      onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Ex: Mensalidade Janeiro/2026"
                      className="bg-slate-700 border-slate-600 text-white"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-300">Vencimento</Label>
                    <Input
                      type="date"
                      value={formData.due_date}
                      onChange={(e) => setFormData(prev => ({ ...prev, due_date: e.target.value }))}
                      className="bg-slate-700 border-slate-600 text-white"
                    />
                  </div>

                  <Button
                    onClick={() => createPaymentMutation.mutate(formData)}
                    disabled={!formData.reseller_id || !formData.amount || createPaymentMutation.isPending}
                    className="w-full bg-green-600 hover:bg-green-700"
                  >
                    {createPaymentMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <DollarSign className="h-4 w-4 mr-2" />
                    )}
                    Gerar Cobrança PIX
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar por nome ou email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 bg-slate-700 border-slate-600 text-white"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px] bg-slate-700 border-slate-600 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Status</SelectItem>
                <SelectItem value="pending">Pendente</SelectItem>
                <SelectItem value="confirmed">Confirmado</SelectItem>
                <SelectItem value="received">Recebido</SelectItem>
                <SelectItem value="overdue">Vencido</SelectItem>
                <SelectItem value="canceled">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          {loadingPayments ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : filteredPayments.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              Nenhuma cobrança encontrada
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-slate-700">
                  <TableHead className="text-slate-300">Revendedor</TableHead>
                  <TableHead className="text-slate-300">Valor</TableHead>
                  <TableHead className="text-slate-300">Vencimento</TableHead>
                  <TableHead className="text-slate-300">Status</TableHead>
                  <TableHead className="text-slate-300">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPayments.map((payment) => (
                  <TableRow key={payment.id} className="border-slate-700">
                    <TableCell>
                      <div>
                        <p className="font-medium text-white">
                          {payment.profiles?.full_name || 'Sem nome'}
                        </p>
                        <p className="text-xs text-slate-400">
                          {payment.profiles?.email}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="text-white font-medium">
                      R$ {Number(payment.amount).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-slate-300">
                      {format(new Date(payment.due_date), 'dd/MM/yyyy', { locale: ptBR })}
                    </TableCell>
                    <TableCell>
                      <Badge className={statusColors[payment.status] || 'bg-slate-500/20 text-slate-400'}>
                        {statusLabels[payment.status] || payment.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {payment.pix_copy_paste && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(payment.pix_copy_paste!)}
                            title="Copiar PIX"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        )}
                        {payment.pix_qr_code && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedPayment(payment)}
                            title="Ver QR Code"
                          >
                            <QrCode className="h-4 w-4" />
                          </Button>
                        )}
                        {payment.invoice_url && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => window.open(payment.invoice_url!, '_blank')}
                            title="Abrir Fatura"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => syncStatusMutation.mutate(payment.id)}
                          disabled={syncStatusMutation.isPending}
                          title="Sincronizar Status"
                        >
                          <RefreshCw className={`h-4 w-4 ${syncStatusMutation.isPending ? 'animate-spin' : ''}`} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* QR Code Modal */}
      <Dialog open={!!selectedPayment} onOpenChange={() => setSelectedPayment(null)}>
        <DialogContent className="bg-slate-800 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white">QR Code PIX</DialogTitle>
            <DialogDescription className="text-slate-400">
              Escaneie o QR Code para pagar
            </DialogDescription>
          </DialogHeader>
          {selectedPayment?.pix_qr_code && (
            <div className="flex flex-col items-center gap-4">
              <img
                src={`data:image/png;base64,${selectedPayment.pix_qr_code}`}
                alt="QR Code PIX"
                className="w-64 h-64 bg-white p-2 rounded-lg"
              />
              {selectedPayment.pix_copy_paste && (
                <Button
                  variant="outline"
                  onClick={() => copyToClipboard(selectedPayment.pix_copy_paste!)}
                  className="w-full"
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copiar Código PIX
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
