import { useState, useMemo, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Clock, Calendar, AlertTriangle, CheckCircle, XCircle, Bell, Settings, Zap, X } from 'lucide-react';
import { format, addDays, startOfToday, parseISO, isSameDay } from 'date-fns';
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
  reminder_type: 'd1' | 'd0' | 'custom';
  sent_at: string | null;
  error_message: string | null;
  created_at: string;
  clients?: {
    id: string;
    name: string;
    phone: string | null;
    expiration_date: string;
    plan_name: string | null;
    plan_price: number | null;
    billing_mode: string | null;
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
  expiration_date: string;
  plan_name: string | null;
  plan_price: number | null;
}

interface ReminderSettings {
  d1_enabled: boolean;
  d1_time: string;
  d1_template_id: string;
  d0_enabled: boolean;
  d0_time: string;
  d0_template_id: string;
}

// Default settings key in localStorage
const REMINDER_SETTINGS_KEY = 'reminder_settings';

export default function Reminders() {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('scheduled');

  // Load settings from localStorage
  const [settings, setSettings] = useState<ReminderSettings>(() => {
    try {
      const saved = localStorage.getItem(`${REMINDER_SETTINGS_KEY}_${user?.id}`);
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      d1_enabled: true,
      d1_time: '09:00',
      d1_template_id: 'a0000001-0000-0000-0000-000000000001',
      d0_enabled: true,
      d0_time: '08:00',
      d0_template_id: 'a0000002-0000-0000-0000-000000000002',
    };
  });

  // Save settings to localStorage when changed
  useEffect(() => {
    if (user?.id) {
      localStorage.setItem(`${REMINDER_SETTINGS_KEY}_${user.id}`, JSON.stringify(settings));
    }
  }, [settings, user?.id]);

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
          clients:client_id (id, name, phone, expiration_date, plan_name, plan_price, billing_mode)
        `)
        .eq('seller_id', user!.id)
        .order('scheduled_date', { ascending: true })
        .order('scheduled_time', { ascending: true });
      if (error) throw error;
      return (data || []) as BillingReminder[];
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

  // Fetch clients that can receive reminders (automatic mode)
  const { data: eligibleClients = [] } = useQuery({
    queryKey: ['clients-for-auto-reminders', user?.id],
    queryFn: async () => {
      const today = startOfToday();
      const tomorrow = addDays(today, 1);
      const todayStr = format(today, 'yyyy-MM-dd');
      const tomorrowStr = format(tomorrow, 'yyyy-MM-dd');
      
      // Get clients expiring today or tomorrow with automatic billing mode
      const { data, error } = await supabase
        .from('clients')
        .select('id, name, phone, billing_mode, expiration_date, plan_name, plan_price')
        .eq('seller_id', user!.id)
        .eq('billing_mode', 'automatic')
        .eq('is_archived', false)
        .or(`expiration_date.eq.${todayStr},expiration_date.eq.${tomorrowStr}`)
        .order('expiration_date');
      if (error) throw error;
      return data as Client[];
    },
    enabled: !!user?.id && !isAdmin,
  });

  // Separate clients by D-1 and D-0
  const { clientsD1, clientsD0 } = useMemo(() => {
    const today = startOfToday();
    const tomorrow = addDays(today, 1);
    
    return {
      clientsD1: eligibleClients.filter(c => {
        const expDate = new Date(c.expiration_date + 'T12:00:00');
        return isSameDay(expDate, tomorrow);
      }),
      clientsD0: eligibleClients.filter(c => {
        const expDate = new Date(c.expiration_date + 'T12:00:00');
        return isSameDay(expDate, today);
      }),
    };
  }, [eligibleClients]);

  // Filter reminders by status
  const filteredReminders = useMemo(() => {
    if (statusFilter === 'all') return reminders;
    return reminders.filter(r => r.status === statusFilter);
  }, [reminders, statusFilter]);

  // Generate reminders for eligible clients
  const generateRemindersMutation = useMutation({
    mutationFn: async () => {
      const today = startOfToday();
      const tomorrow = addDays(today, 1);
      const todayStr = format(today, 'yyyy-MM-dd');
      const tomorrowStr = format(tomorrow, 'yyyy-MM-dd');
      
      const remindersToCreate: Array<{
        seller_id: string;
        client_id: string;
        template_id: string | null;
        message: string;
        scheduled_date: string;
        scheduled_time: string;
        reminder_type: 'd1' | 'd0';
        status: 'scheduled';
      }> = [];

      // Get templates
      const d1Template = templates.find(t => t.id === settings.d1_template_id);
      const d0Template = templates.find(t => t.id === settings.d0_template_id);

      // Check existing reminders to avoid duplicates
      const { data: existingReminders } = await supabase
        .from('billing_reminders')
        .select('client_id, reminder_type, scheduled_date')
        .eq('seller_id', user!.id)
        .in('scheduled_date', [todayStr, tomorrowStr])
        .eq('status', 'scheduled');

      const existingKeys = new Set(
        (existingReminders || []).map(r => `${r.client_id}:${r.reminder_type}:${r.scheduled_date}`)
      );

      // D-1: Clients expiring TOMORROW - schedule for TODAY
      if (settings.d1_enabled && d1Template) {
        for (const client of clientsD1) {
          const key = `${client.id}:d1:${todayStr}`;
          if (existingKeys.has(key)) continue;

          remindersToCreate.push({
            seller_id: user!.id,
            client_id: client.id,
            template_id: settings.d1_template_id,
            message: d1Template.message,
            scheduled_date: todayStr,
            scheduled_time: settings.d1_time,
            reminder_type: 'd1',
            status: 'scheduled',
          });
        }
      }

      // D-0: Clients expiring TODAY - schedule for TODAY
      if (settings.d0_enabled && d0Template) {
        for (const client of clientsD0) {
          const key = `${client.id}:d0:${todayStr}`;
          if (existingKeys.has(key)) continue;

          remindersToCreate.push({
            seller_id: user!.id,
            client_id: client.id,
            template_id: settings.d0_template_id,
            message: d0Template.message,
            scheduled_date: todayStr,
            scheduled_time: settings.d0_time,
            reminder_type: 'd0',
            status: 'scheduled',
          });
        }
      }

      if (remindersToCreate.length === 0) {
        return { created: 0 };
      }

      const { error } = await supabase
        .from('billing_reminders')
        .insert(remindersToCreate);

      if (error) throw error;

      return { created: remindersToCreate.length };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['billing-reminders'] });
      if (result.created > 0) {
        toast.success(`${result.created} lembrete(s) criado(s) automaticamente!`);
      } else {
        toast.info('Nenhum novo lembrete para criar. Todos já foram agendados.');
      }
    },
    onError: (error: Error) => {
      toast.error(`Erro ao gerar lembretes: ${error.message}`);
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

  const getReminderTypeBadge = (type: string) => {
    switch (type) {
      case 'd1':
        return <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-600">D-1 (Amanhã)</Badge>;
      case 'd0':
        return <Badge variant="secondary" className="bg-orange-500/10 text-orange-600">D-0 (Hoje)</Badge>;
      default:
        return <Badge variant="secondary">Personalizado</Badge>;
    }
  };

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
            Agende mensagens automáticas para clientes próximos ao vencimento
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" className="gap-2" onClick={() => setIsSettingsOpen(true)}>
            <Settings className="h-4 w-4" />
            Configurar
          </Button>
          <Button 
            className="gap-2" 
            onClick={() => generateRemindersMutation.mutate()}
            disabled={generateRemindersMutation.isPending}
          >
            <Zap className="h-4 w-4" />
            {generateRemindersMutation.isPending ? 'Gerando...' : 'Gerar Lembretes'}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Bell className="h-4 w-4 text-yellow-500" />
              D-1 (Vence Amanhã)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{clientsD1.length}</div>
            <p className="text-xs text-muted-foreground">
              {settings.d1_enabled 
                ? `Envio às ${settings.d1_time}` 
                : 'Desativado'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Bell className="h-4 w-4 text-orange-500" />
              D-0 (Vence Hoje)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{clientsD0.length}</div>
            <p className="text-xs text-muted-foreground">
              {settings.d0_enabled 
                ? `Envio às ${settings.d0_time}` 
                : 'Desativado'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-500" />
              Lembretes Agendados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {reminders.filter(r => r.status === 'scheduled').length}
            </div>
            <p className="text-xs text-muted-foreground">Pendentes de envio</p>
          </CardContent>
        </Card>
      </div>

      {/* Info Banner */}
      <Card className="bg-blue-500/5 border-blue-500/20">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-blue-500 mt-0.5 flex-shrink-0" />
            <div className="text-sm space-y-1">
              <p className="font-medium text-blue-500">Como funciona</p>
              <ul className="text-muted-foreground list-disc list-inside space-y-1">
                <li><strong>D-1:</strong> Clientes que vencem AMANHÃ recebem mensagem HOJE</li>
                <li><strong>D-0:</strong> Clientes que vencem HOJE recebem mensagem HOJE</li>
                <li>Apenas clientes com modo <strong>Automático</strong> são incluídos</li>
                <li>Use o botão "Gerar Lembretes" para criar os agendamentos</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

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
            <Button 
              variant="outline" 
              className="mt-4" 
              onClick={() => generateRemindersMutation.mutate()}
              disabled={generateRemindersMutation.isPending}
            >
              <Zap className="h-4 w-4 mr-2" />
              Gerar Lembretes Automaticamente
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
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="font-medium truncate">
                        {reminder.clients?.name || 'Cliente não encontrado'}
                      </span>
                      {getReminderTypeBadge(reminder.reminder_type)}
                      {getStatusBadge(reminder.status)}
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                      {reminder.message}
                    </p>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {format(parseISO(reminder.scheduled_date), "dd/MM/yyyy", { locale: ptBR })}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {reminder.scheduled_time.slice(0, 5)}
                      </span>
                      {reminder.clients?.expiration_date && (
                        <span className="text-warning">
                          Vence: {format(parseISO(reminder.clients.expiration_date), "dd/MM", { locale: ptBR })}
                        </span>
                      )}
                      {reminder.sent_at && (
                        <span className="flex items-center gap-1 text-success">
                          <CheckCircle className="h-3 w-3" />
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
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => setCancelConfirmId(reminder.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Settings Dialog */}
      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Configurações de Lembretes
            </DialogTitle>
            <DialogDescription>
              Configure os horários e templates para D-1 e D-0
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* D-1 Settings */}
            <div className="space-y-4 p-4 rounded-lg border bg-muted/30">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base font-medium">D-1 (Vence Amanhã)</Label>
                  <p className="text-xs text-muted-foreground">Enviar lembrete para clientes que vencem amanhã</p>
                </div>
                <Switch
                  checked={settings.d1_enabled}
                  onCheckedChange={(checked) => setSettings(s => ({ ...s, d1_enabled: checked }))}
                />
              </div>
              
              {settings.d1_enabled && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="d1_time">Horário</Label>
                    <Input
                      id="d1_time"
                      type="time"
                      value={settings.d1_time}
                      onChange={(e) => setSettings(s => ({ ...s, d1_time: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Template</Label>
                    <Select
                      value={settings.d1_template_id}
                      onValueChange={(v) => setSettings(s => ({ ...s, d1_template_id: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {templates.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.is_global ? '🌐 ' : ''}{t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>

            {/* D-0 Settings */}
            <div className="space-y-4 p-4 rounded-lg border bg-muted/30">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base font-medium">D-0 (Vence Hoje)</Label>
                  <p className="text-xs text-muted-foreground">Enviar lembrete para clientes que vencem hoje</p>
                </div>
                <Switch
                  checked={settings.d0_enabled}
                  onCheckedChange={(checked) => setSettings(s => ({ ...s, d0_enabled: checked }))}
                />
              </div>
              
              {settings.d0_enabled && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="d0_time">Horário</Label>
                    <Input
                      id="d0_time"
                      type="time"
                      value={settings.d0_time}
                      onChange={(e) => setSettings(s => ({ ...s, d0_time: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Template</Label>
                    <Select
                      value={settings.d0_template_id}
                      onValueChange={(v) => setSettings(s => ({ ...s, d0_template_id: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {templates.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.is_global ? '🌐 ' : ''}{t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => setIsSettingsOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
    </div>
  );
}
