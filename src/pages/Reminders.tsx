import { useState, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Plus, Clock, Edit, Trash2, X, Send, Calendar, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { format, parseISO, isAfter, isBefore, startOfToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface BillingReminder {
  id: string;
  seller_id: string;
  client_id: string;
  template_id: string | null;
  message: string;
  scheduled_date: string;
  scheduled_time: string;
  status: 'scheduled' | 'sent' | 'failed' | 'cancelled';
  sent_at: string | null;
  error_message: string | null;
  created_at: string;
  clients?: {
    id: string;
    name: string;
    phone: string | null;
  };
}

interface BillingReminderTemplate {
  id: string;
  seller_id: string;
  name: string;
  message: string;
  is_global: boolean;
  created_at: string;
}

interface Client {
  id: string;
  name: string;
  phone: string | null;
  billing_mode: string | null;
}

export default function Reminders() {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingReminder, setEditingReminder] = useState<BillingReminder | null>(null);
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<BillingReminderTemplate | null>(null);
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);
  const [deleteTemplateId, setDeleteTemplateId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const [formData, setFormData] = useState({
    client_id: '',
    template_id: '',
    message: '',
    scheduled_date: '',
    scheduled_time: '09:00',
  });

  const [templateFormData, setTemplateFormData] = useState({
    name: '',
    message: '',
  });

  // Redirect admin away - this page is resellers only
  if (isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-2">
          <AlertTriangle className="h-12 w-12 text-warning mx-auto" />
          <p className="text-lg font-medium">Acesso Restrito</p>
          <p className="text-muted-foreground">Esta funcionalidade é exclusiva para revendedores.</p>
        </div>
      </div>
    );
  }

  // Fetch reminders
  const { data: reminders = [], isLoading: loadingReminders } = useQuery({
    queryKey: ['billing-reminders', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('billing_reminders')
        .select(`
          *,
          clients:client_id (id, name, phone)
        `)
        .eq('seller_id', user!.id)
        .order('scheduled_date', { ascending: true })
        .order('scheduled_time', { ascending: true });
      if (error) throw error;
      return data as BillingReminder[];
    },
    enabled: !!user?.id && !isAdmin,
  });

  // Fetch templates (own + global)
  const { data: templates = [] } = useQuery({
    queryKey: ['billing-reminder-templates', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('billing_reminder_templates')
        .select('*')
        .or(`seller_id.eq.${user!.id},is_global.eq.true`)
        .order('is_global', { ascending: false })
        .order('name');
      if (error) throw error;
      return data as BillingReminderTemplate[];
    },
    enabled: !!user?.id && !isAdmin,
  });

  // Fetch clients with automatic billing mode
  const { data: clients = [] } = useQuery({
    queryKey: ['clients-for-reminders', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, name, phone, billing_mode')
        .eq('seller_id', user!.id)
        .eq('billing_mode', 'automatic')
        .order('name');
      if (error) throw error;
      return data as Client[];
    },
    enabled: !!user?.id && !isAdmin,
  });

  // Filter reminders by status
  const filteredReminders = useMemo(() => {
    if (statusFilter === 'all') return reminders;
    return reminders.filter(r => r.status === statusFilter);
  }, [reminders, statusFilter]);

  // Create reminder mutation
  const createReminderMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase
        .from('billing_reminders')
        .insert({
          seller_id: user!.id,
          client_id: data.client_id,
          template_id: data.template_id || null,
          message: data.message,
          scheduled_date: data.scheduled_date,
          scheduled_time: data.scheduled_time,
          status: 'scheduled',
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing-reminders'] });
      toast.success('Lembrete agendado com sucesso!');
      resetForm();
      setIsDialogOpen(false);
    },
    onError: (error: Error) => {
      toast.error(`Erro ao criar lembrete: ${error.message}`);
    },
  });

  // Update reminder mutation
  const updateReminderMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const { error } = await supabase
        .from('billing_reminders')
        .update({
          client_id: data.client_id,
          template_id: data.template_id || null,
          message: data.message,
          scheduled_date: data.scheduled_date,
          scheduled_time: data.scheduled_time,
        })
        .eq('id', id)
        .eq('status', 'scheduled'); // Only update if still scheduled
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing-reminders'] });
      toast.success('Lembrete atualizado!');
      resetForm();
      setIsDialogOpen(false);
      setEditingReminder(null);
    },
    onError: (error: Error) => {
      toast.error(`Erro ao atualizar: ${error.message}`);
    },
  });

  // Cancel reminder mutation
  const cancelReminderMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('billing_reminders')
        .update({ status: 'cancelled' })
        .eq('id', id)
        .eq('status', 'scheduled');
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing-reminders'] });
      toast.success('Lembrete cancelado');
      setCancelConfirmId(null);
    },
    onError: (error: Error) => {
      toast.error(`Erro ao cancelar: ${error.message}`);
    },
  });

  // Create template mutation
  const createTemplateMutation = useMutation({
    mutationFn: async (data: typeof templateFormData) => {
      const { error } = await supabase
        .from('billing_reminder_templates')
        .insert({
          seller_id: user!.id,
          name: data.name,
          message: data.message,
          is_global: false,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing-reminder-templates'] });
      toast.success('Template criado!');
      resetTemplateForm();
      setIsTemplateDialogOpen(false);
    },
    onError: (error: Error) => {
      toast.error(`Erro ao criar template: ${error.message}`);
    },
  });

  // Update template mutation
  const updateTemplateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof templateFormData }) => {
      const { error } = await supabase
        .from('billing_reminder_templates')
        .update({ name: data.name, message: data.message })
        .eq('id', id)
        .eq('is_global', false); // Can only update non-global
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing-reminder-templates'] });
      toast.success('Template atualizado!');
      resetTemplateForm();
      setIsTemplateDialogOpen(false);
      setEditingTemplate(null);
    },
    onError: (error: Error) => {
      toast.error(`Erro ao atualizar: ${error.message}`);
    },
  });

  // Delete template mutation
  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('billing_reminder_templates')
        .delete()
        .eq('id', id)
        .eq('is_global', false);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing-reminder-templates'] });
      toast.success('Template excluído');
      setDeleteTemplateId(null);
    },
    onError: (error: Error) => {
      toast.error(`Erro ao excluir: ${error.message}`);
    },
  });

  const resetForm = () => {
    setFormData({
      client_id: '',
      template_id: '',
      message: '',
      scheduled_date: '',
      scheduled_time: '09:00',
    });
  };

  const resetTemplateForm = () => {
    setTemplateFormData({ name: '', message: '' });
  };

  const handleTemplateSelect = (templateId: string) => {
    const template = templates.find(t => t.id === templateId);
    if (template) {
      setFormData(prev => ({
        ...prev,
        template_id: templateId,
        message: template.message,
      }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.client_id || !formData.message || !formData.scheduled_date || !formData.scheduled_time) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    // Validate date is not in the past
    const scheduledDateTime = new Date(`${formData.scheduled_date}T${formData.scheduled_time}`);
    if (isBefore(scheduledDateTime, new Date())) {
      toast.error('A data/hora deve ser futura');
      return;
    }

    if (editingReminder) {
      updateReminderMutation.mutate({ id: editingReminder.id, data: formData });
    } else {
      createReminderMutation.mutate(formData);
    }
  };

  const handleTemplateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!templateFormData.name || !templateFormData.message) {
      toast.error('Preencha todos os campos');
      return;
    }

    if (editingTemplate) {
      updateTemplateMutation.mutate({ id: editingTemplate.id, data: templateFormData });
    } else {
      createTemplateMutation.mutate(templateFormData);
    }
  };

  const handleEditReminder = (reminder: BillingReminder) => {
    setEditingReminder(reminder);
    setFormData({
      client_id: reminder.client_id,
      template_id: reminder.template_id || '',
      message: reminder.message,
      scheduled_date: reminder.scheduled_date,
      scheduled_time: reminder.scheduled_time,
    });
    setIsDialogOpen(true);
  };

  const handleEditTemplate = (template: BillingReminderTemplate) => {
    setEditingTemplate(template);
    setTemplateFormData({ name: template.name, message: template.message });
    setIsTemplateDialogOpen(true);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'scheduled':
        return <Badge variant="outline" className="bg-blue-500/10 text-blue-500"><Clock className="h-3 w-3 mr-1" />Agendado</Badge>;
      case 'sent':
        return <Badge variant="outline" className="bg-success/10 text-success"><CheckCircle className="h-3 w-3 mr-1" />Enviado</Badge>;
      case 'failed':
        return <Badge variant="outline" className="bg-destructive/10 text-destructive"><XCircle className="h-3 w-3 mr-1" />Falhou</Badge>;
      case 'cancelled':
        return <Badge variant="outline" className="bg-muted text-muted-foreground"><X className="h-3 w-3 mr-1" />Cancelado</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Available variables
  const availableVariables = [
    { name: '{nome}', desc: 'Nome do cliente' },
    { name: '{vencimento}', desc: 'Data de vencimento' },
    { name: '{valor}', desc: 'Valor do plano' },
    { name: '{plano}', desc: 'Nome do plano' },
    { name: '{pix}', desc: 'Chave PIX' },
    { name: '{empresa}', desc: 'Sua empresa' },
  ];

  if (loadingReminders) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-pulse text-muted-foreground">Carregando lembretes...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Lembretes de Cobrança</h1>
          <p className="text-muted-foreground">
            Agende mensagens automáticas via WhatsApp para seus clientes
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Dialog open={isTemplateDialogOpen} onOpenChange={(open) => {
            setIsTemplateDialogOpen(open);
            if (!open) { setEditingTemplate(null); resetTemplateForm(); }
          }}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Plus className="h-4 w-4" />
                Novo Template
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{editingTemplate ? 'Editar Template' : 'Novo Template'}</DialogTitle>
                <DialogDescription>
                  Crie templates para reutilizar em lembretes
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleTemplateSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="template-name">Nome *</Label>
                  <Input
                    id="template-name"
                    value={templateFormData.name}
                    onChange={(e) => setTemplateFormData({ ...templateFormData, name: e.target.value })}
                    placeholder="Ex: Lembrete 3 dias antes"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="template-message">Mensagem *</Label>
                  <Textarea
                    id="template-message"
                    value={templateFormData.message}
                    onChange={(e) => setTemplateFormData({ ...templateFormData, message: e.target.value })}
                    placeholder="Olá {nome}, seu plano vence em {vencimento}..."
                    rows={5}
                    required
                  />
                  <div className="flex flex-wrap gap-1 mt-2">
                    {availableVariables.map(v => (
                      <Button
                        key={v.name}
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs"
                        onClick={() => setTemplateFormData(prev => ({ ...prev, message: prev.message + v.name }))}
                        title={v.desc}
                      >
                        {v.name}
                      </Button>
                    ))}
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={createTemplateMutation.isPending || updateTemplateMutation.isPending}>
                    {editingTemplate ? 'Atualizar' : 'Criar Template'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) { setEditingReminder(null); resetForm(); }
          }}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Novo Lembrete
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{editingReminder ? 'Editar Lembrete' : 'Novo Lembrete'}</DialogTitle>
                <DialogDescription>
                  Agende um lembrete de cobrança para um cliente
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Client Selection */}
                <div className="space-y-2">
                  <Label>Cliente *</Label>
                  <Select
                    value={formData.client_id}
                    onValueChange={(v) => setFormData({ ...formData, client_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um cliente" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.length === 0 ? (
                        <div className="p-2 text-sm text-muted-foreground text-center">
                          Nenhum cliente com modo automático
                        </div>
                      ) : (
                        clients.map((client) => (
                          <SelectItem key={client.id} value={client.id}>
                            {client.name} {client.phone ? `(${client.phone})` : ''}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  {clients.length === 0 && (
                    <p className="text-xs text-warning">
                      Apenas clientes com modo de cobrança automático podem receber lembretes.
                    </p>
                  )}
                </div>

                {/* Template Selection */}
                <div className="space-y-2">
                  <Label>Template (opcional)</Label>
                  <Select
                    value={formData.template_id}
                    onValueChange={handleTemplateSelect}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um template" />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.is_global ? '🌐 ' : ''}{template.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Message */}
                <div className="space-y-2">
                  <Label htmlFor="message">Mensagem *</Label>
                  <Textarea
                    id="message"
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    placeholder="Escreva a mensagem do lembrete..."
                    rows={5}
                    required
                  />
                  <div className="flex flex-wrap gap-1 mt-2">
                    {availableVariables.map(v => (
                      <Button
                        key={v.name}
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs"
                        onClick={() => setFormData(prev => ({ ...prev, message: prev.message + v.name }))}
                        title={v.desc}
                      >
                        {v.name}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Date and Time */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="scheduled_date">Data *</Label>
                    <Input
                      id="scheduled_date"
                      type="date"
                      value={formData.scheduled_date}
                      onChange={(e) => setFormData({ ...formData, scheduled_date: e.target.value })}
                      min={format(new Date(), 'yyyy-MM-dd')}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="scheduled_time">Hora *</Label>
                    <Input
                      id="scheduled_time"
                      type="time"
                      value={formData.scheduled_time}
                      onChange={(e) => setFormData({ ...formData, scheduled_time: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <DialogFooter>
                  <Button type="submit" disabled={createReminderMutation.isPending || updateReminderMutation.isPending}>
                    {editingReminder ? 'Atualizar' : 'Agendar Lembrete'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Info Banner */}
      <Card className="bg-blue-500/5 border-blue-500/20">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-blue-500 mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-blue-500">Modo Automático</p>
              <p className="text-muted-foreground">
                Lembretes funcionam apenas para clientes com modo de cobrança <strong>Automático</strong>. 
                A troca de modo é controlada pelo administrador.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Templates Section */}
      {templates.filter(t => !t.is_global).length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Meus Templates</CardTitle>
            <CardDescription>Templates personalizados para lembretes</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {templates.filter(t => !t.is_global).map(template => (
                <div
                  key={template.id}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border"
                >
                  <span className="text-sm font-medium">{template.name}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => handleEditTemplate(template)}
                  >
                    <Edit className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-destructive"
                    onClick={() => setDeleteTemplateId(template.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filter */}
      <div className="flex gap-2 items-center">
        <Label className="text-sm text-muted-foreground">Filtrar:</Label>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="scheduled">Agendados</SelectItem>
            <SelectItem value="sent">Enviados</SelectItem>
            <SelectItem value="failed">Falharam</SelectItem>
            <SelectItem value="cancelled">Cancelados</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Reminders List */}
      {filteredReminders.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-center">
              {statusFilter === 'all' 
                ? 'Nenhum lembrete agendado ainda' 
                : `Nenhum lembrete com status "${statusFilter}"`}
            </p>
            <Button variant="outline" className="mt-4" onClick={() => setIsDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Criar primeiro lembrete
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredReminders.map((reminder) => (
            <Card key={reminder.id} className="hover:bg-muted/30 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-medium truncate">
                        {reminder.clients?.name || 'Cliente não encontrado'}
                      </span>
                      {getStatusBadge(reminder.status)}
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                      {reminder.message}
                    </p>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {format(parseISO(reminder.scheduled_date), "dd/MM/yyyy", { locale: ptBR })}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {reminder.scheduled_time.slice(0, 5)}
                      </span>
                      {reminder.sent_at && (
                        <span className="flex items-center gap-1 text-success">
                          <Send className="h-3 w-3" />
                          Enviado {format(parseISO(reminder.sent_at), "dd/MM HH:mm", { locale: ptBR })}
                        </span>
                      )}
                      {reminder.error_message && (
                        <span className="text-destructive truncate max-w-[200px]" title={reminder.error_message}>
                          Erro: {reminder.error_message}
                        </span>
                      )}
                    </div>
                  </div>
                  {reminder.status === 'scheduled' && (
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleEditReminder(reminder)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setCancelConfirmId(reminder.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={!!cancelConfirmId} onOpenChange={() => setCancelConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar Lembrete?</AlertDialogTitle>
            <AlertDialogDescription>
              O lembrete será cancelado e não será enviado. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => cancelConfirmId && cancelReminderMutation.mutate(cancelConfirmId)}
            >
              Cancelar Lembrete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Template Confirmation Dialog */}
      <AlertDialog open={!!deleteTemplateId} onOpenChange={() => setDeleteTemplateId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Template?</AlertDialogTitle>
            <AlertDialogDescription>
              O template será excluído permanentemente. Lembretes já criados não serão afetados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTemplateId && deleteTemplateMutation.mutate(deleteTemplateId)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
