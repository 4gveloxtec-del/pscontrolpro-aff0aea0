import { useState, useMemo, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from 'sonner';
import { Clock, Calendar, AlertTriangle, CheckCircle, XCircle, Bell, Settings, Zap, X, Send, MessageCircle, Smartphone } from 'lucide-react';
import { format, addDays, startOfToday, parseISO, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface BillingReminder {
  id: string;
  seller_id: string;
  client_id: string;
  template_id: string | null;
  message: string;
  edited_message: string | null;
  scheduled_date: string;
  scheduled_time: string;
  status: 'scheduled' | 'sent' | 'failed' | 'cancelled';
  reminder_type: 'd1' | 'd0' | 'custom';
  send_mode: 'auto' | 'manual_api' | 'push_only';
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
  d0_enabled: boolean;
  d0_time: string;
}

interface SellerProfile {
  id: string;
  plan_type: string | null;
  pix_key: string | null;
  company_name: string | null;
  full_name: string | null;
}

// Default settings key in localStorage
const REMINDER_SETTINGS_KEY = 'reminder_settings_v2';

// Universal template ID
const UNIVERSAL_TEMPLATE_ID = 'a0000000-0000-0000-0000-000000000001';

// Format price helper
function formatPrice(price: number | null): string {
  if (price === null || price === undefined) return '';
  return `R$ ${price.toFixed(2).replace('.', ',')}`;
}

// Format date helper
function formatDateBR(dateStr: string): string {
  if (!dateStr) return '';
  const dateOnlyMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return `${day}/${month}/${year}`;
  }
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

// Replace template variables
function replaceVariables(
  template: string, 
  client: Client, 
  profile: SellerProfile | null
): string {
  return template
    .replace(/\{\{nome\}\}/g, client.name || '')
    .replace(/\{\{plano\}\}/g, client.plan_name || '')
    .replace(/\{\{vencimento\}\}/g, formatDateBR(client.expiration_date))
    .replace(/\{\{valor\}\}/g, formatPrice(client.plan_price))
    .replace(/\{\{pix\}\}/g, profile?.pix_key || '')
    .replace(/\{\{empresa\}\}/g, profile?.company_name || profile?.full_name || '');
}

export default function Reminders() {
  const { user, profile, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('scheduled');
  const [editReminderDialog, setEditReminderDialog] = useState<{
    open: boolean;
    reminder: BillingReminder | null;
    editedMessage: string;
    sending: boolean;
  }>({
    open: false,
    reminder: null,
    editedMessage: '',
    sending: false,
  });

  // Load settings from localStorage
  const [settings, setSettings] = useState<ReminderSettings>(() => {
    try {
      const saved = localStorage.getItem(`${REMINDER_SETTINGS_KEY}_${user?.id}`);
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      d1_enabled: true,
      d1_time: '09:00',
      d0_enabled: true,
      d0_time: '08:00',
    };
  });

  // Save settings to localStorage when changed
  useEffect(() => {
    if (user?.id) {
      localStorage.setItem(`${REMINDER_SETTINGS_KEY}_${user.id}`, JSON.stringify(settings));
    }
  }, [settings, user?.id]);

  // Check if seller has WhatsApp API plan (derived from sellerProfile query instead)
  const [hasWhatsAppApi, setHasWhatsAppApi] = useState(false);

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

  // Fetch seller profile for variables and plan type
  const { data: sellerProfile } = useQuery({
    queryKey: ['seller-profile', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, plan_type, pix_key, company_name, full_name')
        .eq('id', user!.id)
        .single();
      if (error) throw error;
      return data as SellerProfile;
    },
    enabled: !!user?.id && !isAdmin,
  });

  // Update hasWhatsAppApi when profile loads
  useEffect(() => {
    if (sellerProfile) {
      setHasWhatsAppApi(sellerProfile.plan_type === 'whatsapp');
    }
  }, [sellerProfile]);

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

  // Fetch universal template
  const { data: universalTemplate } = useQuery({
    queryKey: ['universal-billing-template'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('billing_reminder_templates')
        .select('*')
        .eq('id', UNIVERSAL_TEMPLATE_ID)
        .single();
      if (error) throw error;
      return data as BillingReminderTemplate;
    },
    enabled: !!user?.id && !isAdmin,
  });

  // Fetch clients that can receive reminders
  const { data: eligibleClients = [] } = useQuery({
    queryKey: ['clients-for-reminders', user?.id],
    queryFn: async () => {
      const today = startOfToday();
      const tomorrow = addDays(today, 1);
      const todayStr = format(today, 'yyyy-MM-dd');
      const tomorrowStr = format(tomorrow, 'yyyy-MM-dd');
      
      // Get clients expiring today or tomorrow
      const { data, error } = await supabase
        .from('clients')
        .select('id, name, phone, billing_mode, expiration_date, plan_name, plan_price')
        .eq('seller_id', user!.id)
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

  // Determine send mode based on plan
  const getDefaultSendMode = (): 'auto' | 'manual_api' | 'push_only' => {
    // Plano Manual: apenas push notification
    if (!hasWhatsAppApi) return 'push_only';
    // Plano API WhatsApp: default é automático
    return 'auto';
  };

  // Generate reminders for eligible clients
  const generateRemindersMutation = useMutation({
    mutationFn: async (sendMode: 'auto' | 'manual_api' | 'push_only') => {
      if (!universalTemplate) throw new Error('Template universal não encontrado');

      const today = startOfToday();
      const tomorrow = addDays(today, 1);
      const todayStr = format(today, 'yyyy-MM-dd');

      const remindersToCreate: Array<{
        seller_id: string;
        client_id: string;
        template_id: string;
        message: string;
        scheduled_date: string;
        scheduled_time: string;
        reminder_type: 'd1' | 'd0';
        send_mode: 'auto' | 'manual_api' | 'push_only';
        status: 'scheduled';
      }> = [];

      // Check existing reminders to avoid duplicates
      const { data: existingReminders } = await supabase
        .from('billing_reminders')
        .select('client_id, reminder_type, scheduled_date')
        .eq('seller_id', user!.id)
        .eq('scheduled_date', todayStr)
        .eq('status', 'scheduled');

      const existingKeys = new Set(
        (existingReminders || []).map(r => `${r.client_id}:${r.reminder_type}`)
      );

      // D-1: Clients expiring TOMORROW - schedule for TODAY
      if (settings.d1_enabled) {
        for (const client of clientsD1) {
          const key = `${client.id}:d1`;
          if (existingKeys.has(key)) continue;

          remindersToCreate.push({
            seller_id: user!.id,
            client_id: client.id,
            template_id: UNIVERSAL_TEMPLATE_ID,
            message: universalTemplate.message,
            scheduled_date: todayStr,
            scheduled_time: settings.d1_time,
            reminder_type: 'd1',
            send_mode: sendMode,
            status: 'scheduled',
          });
        }
      }

      // D-0: Clients expiring TODAY - schedule for TODAY
      if (settings.d0_enabled) {
        for (const client of clientsD0) {
          const key = `${client.id}:d0`;
          if (existingKeys.has(key)) continue;

          remindersToCreate.push({
            seller_id: user!.id,
            client_id: client.id,
            template_id: UNIVERSAL_TEMPLATE_ID,
            message: universalTemplate.message,
            scheduled_date: todayStr,
            scheduled_time: settings.d0_time,
            reminder_type: 'd0',
            send_mode: sendMode,
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
        toast.success(`${result.created} lembrete(s) criado(s)!`);
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

  // Send reminder manually via API
  const sendManuallyMutation = useMutation({
    mutationFn: async ({ reminderId, message }: { reminderId: string; message: string }) => {
      // Update the reminder with edited message and mark as sending
      const { error: updateError } = await supabase
        .from('billing_reminders')
        .update({ edited_message: message })
        .eq('id', reminderId);

      if (updateError) throw updateError;

      // Call the process function to send this specific reminder
      const { data, error } = await supabase.functions.invoke('process-billing-reminders', {
        body: { reminder_id: reminderId, force_send: true }
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing-reminders'] });
      toast.success('Mensagem enviada com sucesso!');
      setEditReminderDialog({ open: false, reminder: null, editedMessage: '', sending: false });
    },
    onError: (error: Error) => {
      toast.error(`Erro ao enviar: ${error.message}`);
      setEditReminderDialog(prev => ({ ...prev, sending: false }));
    },
  });

  const openEditDialog = (reminder: BillingReminder) => {
    const client = reminder.clients;
    let message = reminder.edited_message || reminder.message;
    
    // Replace variables with actual values
    if (client) {
      message = replaceVariables(message, client as Client, sellerProfile || null);
    }

    setEditReminderDialog({
      open: true,
      reminder,
      editedMessage: message,
      sending: false,
    });
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

  const getReminderTypeBadge = (type: string) => {
    switch (type) {
      case 'd1':
        return <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-600">D-1</Badge>;
      case 'd0':
        return <Badge variant="secondary" className="bg-orange-500/10 text-orange-600">D-0</Badge>;
      default:
        return <Badge variant="secondary">Personalizado</Badge>;
    }
  };

  const getSendModeBadge = (mode: string) => {
    switch (mode) {
      case 'auto':
        return <Badge variant="outline" className="bg-success/10 text-success text-xs"><Zap className="h-3 w-3 mr-1" />Auto</Badge>;
      case 'manual_api':
        return <Badge variant="outline" className="bg-blue-500/10 text-blue-500 text-xs"><MessageCircle className="h-3 w-3 mr-1" />Manual API</Badge>;
      case 'push_only':
        return <Badge variant="outline" className="bg-purple-500/10 text-purple-500 text-xs"><Smartphone className="h-3 w-3 mr-1" />Push</Badge>;
      default:
        return null;
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
    <div className="space-y-4 sm:space-y-6 animate-fade-in max-w-full overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Lembretes de Cobrança</h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            {hasWhatsAppApi 
              ? 'Envie lembretes automáticos ou manuais via WhatsApp'
              : 'Receba alertas para cobrar seus clientes'
            }
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" className="gap-2 text-sm" onClick={() => setIsSettingsOpen(true)}>
            <Settings className="h-4 w-4" />
            <span className="hidden xs:inline">Horários</span>
          </Button>
        </div>
      </div>

      {/* Plan Info Banner */}
      <Card className={hasWhatsAppApi ? "bg-success/5 border-success/20" : "bg-purple-500/5 border-purple-500/20"}>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            {hasWhatsAppApi ? (
              <>
                <Zap className="h-5 w-5 text-success mt-0.5 flex-shrink-0" />
                <div className="text-sm space-y-1">
                  <p className="font-medium text-success">Plano API WhatsApp</p>
                  <p className="text-muted-foreground">
                    Você pode enviar mensagens automaticamente ou manualmente via API do WhatsApp.
                  </p>
                </div>
              </>
            ) : (
              <>
                <Smartphone className="h-5 w-5 text-purple-500 mt-0.5 flex-shrink-0" />
                <div className="text-sm space-y-1">
                  <p className="font-medium text-purple-500">Plano Manual</p>
                  <p className="text-muted-foreground">
                    Você receberá notificações push como alerta de cobrança. Envie as mensagens manualmente.
                  </p>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
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
                ? `Horário: ${settings.d1_time}` 
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
                ? `Horário: ${settings.d0_time}` 
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
            <p className="text-xs text-muted-foreground">Pendentes de processamento</p>
          </CardContent>
        </Card>
      </div>

      {/* Generate Reminders Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Gerar Lembretes
          </CardTitle>
          <CardDescription>
            Crie lembretes para os clientes que vencem hoje (D-0) ou amanhã (D-1)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {hasWhatsAppApi ? (
            // Plano API WhatsApp: opções de envio
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Escolha como deseja enviar os lembretes:
              </p>
              <div className="flex flex-wrap gap-3">
                <Button 
                  className="gap-2" 
                  onClick={() => generateRemindersMutation.mutate('auto')}
                  disabled={generateRemindersMutation.isPending}
                >
                  <Zap className="h-4 w-4" />
                  Enviar Automaticamente
                </Button>
                <Button 
                  variant="secondary"
                  className="gap-2" 
                  onClick={() => generateRemindersMutation.mutate('manual_api')}
                  disabled={generateRemindersMutation.isPending}
                >
                  <MessageCircle className="h-4 w-4" />
                  Enviar Manualmente (editar antes)
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                <strong>Automático:</strong> mensagens enviadas no horário configurado. <br />
                <strong>Manual:</strong> você poderá editar e enviar cada mensagem individualmente.
              </p>
            </div>
          ) : (
            // Plano Manual: apenas push notification
            <div className="space-y-4">
              <Button 
                className="gap-2" 
                onClick={() => generateRemindersMutation.mutate('push_only')}
                disabled={generateRemindersMutation.isPending}
              >
                <Bell className="h-4 w-4" />
                {generateRemindersMutation.isPending ? 'Gerando...' : 'Gerar Alertas de Cobrança'}
              </Button>
              <p className="text-xs text-muted-foreground">
                Você receberá notificações push no horário configurado para lembrar de cobrar cada cliente.
              </p>
            </div>
          )}
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
                      {getSendModeBadge(reminder.send_mode)}
                      {getStatusBadge(reminder.status)}
                    </div>
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
                  <div className="flex items-center gap-2">
                    {reminder.status === 'scheduled' && reminder.send_mode === 'manual_api' && hasWhatsAppApi && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1"
                        onClick={() => openEditDialog(reminder)}
                      >
                        <Send className="h-3 w-3" />
                        Editar e Enviar
                      </Button>
                    )}
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
              Configuração de Horários
            </DialogTitle>
            <DialogDescription>
              Configure os horários para D-1 e D-0. A data é calculada automaticamente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* D-1 Settings */}
            <div className="space-y-4 p-4 rounded-lg border bg-muted/30">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base font-medium">D-1 (Vence Amanhã)</Label>
                  <p className="text-xs text-muted-foreground">Clientes que vencem amanhã</p>
                </div>
                <Switch
                  checked={settings.d1_enabled}
                  onCheckedChange={(checked) => setSettings(s => ({ ...s, d1_enabled: checked }))}
                />
              </div>
              
              {settings.d1_enabled && (
                <div className="space-y-2">
                  <Label htmlFor="d1_time">Horário do Lembrete</Label>
                  <Input
                    id="d1_time"
                    type="time"
                    value={settings.d1_time}
                    onChange={(e) => setSettings(s => ({ ...s, d1_time: e.target.value }))}
                  />
                </div>
              )}
            </div>

            {/* D-0 Settings */}
            <div className="space-y-4 p-4 rounded-lg border bg-muted/30">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base font-medium">D-0 (Vence Hoje)</Label>
                  <p className="text-xs text-muted-foreground">Clientes que vencem hoje</p>
                </div>
                <Switch
                  checked={settings.d0_enabled}
                  onCheckedChange={(checked) => setSettings(s => ({ ...s, d0_enabled: checked }))}
                />
              </div>
              
              {settings.d0_enabled && (
                <div className="space-y-2">
                  <Label htmlFor="d0_time">Horário do Lembrete</Label>
                  <Input
                    id="d0_time"
                    type="time"
                    value={settings.d0_time}
                    onChange={(e) => setSettings(s => ({ ...s, d0_time: e.target.value }))}
                  />
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => setIsSettingsOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit and Send Dialog (for manual_api mode) */}
      <Dialog 
        open={editReminderDialog.open} 
        onOpenChange={(open) => !editReminderDialog.sending && setEditReminderDialog(prev => ({ ...prev, open }))}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5" />
              Editar e Enviar Mensagem
            </DialogTitle>
            <DialogDescription>
              {editReminderDialog.reminder?.clients?.name} - {editReminderDialog.reminder?.clients?.phone}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Mensagem</Label>
              <Textarea
                value={editReminderDialog.editedMessage}
                onChange={(e) => setEditReminderDialog(prev => ({ ...prev, editedMessage: e.target.value }))}
                rows={8}
                placeholder="Edite a mensagem antes de enviar..."
              />
              <p className="text-xs text-muted-foreground">
                A mensagem será enviada via WhatsApp API.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setEditReminderDialog({ open: false, reminder: null, editedMessage: '', sending: false })}
              disabled={editReminderDialog.sending}
            >
              Cancelar
            </Button>
            <Button 
              onClick={() => {
                if (editReminderDialog.reminder) {
                  setEditReminderDialog(prev => ({ ...prev, sending: true }));
                  sendManuallyMutation.mutate({
                    reminderId: editReminderDialog.reminder.id,
                    message: editReminderDialog.editedMessage,
                  });
                }
              }}
              disabled={editReminderDialog.sending || !editReminderDialog.editedMessage.trim()}
            >
              {editReminderDialog.sending ? (
                <>Enviando...</>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Enviar Agora
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={!!cancelConfirmId} onOpenChange={() => setCancelConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar Lembrete?</AlertDialogTitle>
            <AlertDialogDescription>
              O lembrete será cancelado e não será processado. Esta ação não pode ser desfeita.
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
