import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { 
  Clock, Play, Pause, RotateCcw, Users, AlertTriangle, 
  CheckCircle, XCircle, Loader2, Calendar, Zap, Settings,
  RefreshCw, Timer, Send
} from 'lucide-react';
import { differenceInDays, format, startOfToday } from 'date-fns';

interface Client {
  id: string;
  name: string;
  phone: string | null;
  expiration_date: string;
  category: string | null;
  is_archived: boolean;
}

interface QueueSettings {
  id?: string;
  seller_id: string;
  is_enabled: boolean;
  interval_seconds: number;
  start_hour: number;
  end_hour: number;
  catch_up_mode: boolean;
  catch_up_completed: boolean;
}

interface QueueItem {
  client: Client;
  priority: number;
  daysUntilExpiration: number;
  status: 'pending' | 'sent' | 'failed';
}

export function SmartMessageQueue() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentClientIndex, setCurrentClientIndex] = useState(0);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [processedToday, setProcessedToday] = useState(0);
  const [failedToday, setFailedToday] = useState(0);

  // Fetch queue settings
  const { data: settings, refetch: refetchSettings } = useQuery({
    queryKey: ['queue-settings', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('seller_queue_settings')
        .select('*')
        .eq('seller_id', user!.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;
      
      return data as QueueSettings | null || {
        seller_id: user!.id,
        is_enabled: false,
        interval_seconds: 30,
        start_hour: 8,
        end_hour: 22,
        catch_up_mode: false,
        catch_up_completed: false,
      };
    },
    enabled: !!user?.id,
  });

  // Fetch clients for queue
  const { data: clients = [] } = useQuery({
    queryKey: ['queue-clients', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, name, phone, expiration_date, category, is_archived')
        .eq('seller_id', user!.id)
        .eq('is_archived', false)
        .not('phone', 'is', null);

      if (error) throw error;
      return data as Client[];
    },
    enabled: !!user?.id,
  });

  // Fetch today's sent notifications
  const { data: todayNotifications = [] } = useQuery({
    queryKey: ['today-notifications', user?.id],
    queryFn: async () => {
      const today = startOfToday().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('client_notification_tracking')
        .select('client_id')
        .eq('seller_id', user!.id)
        .gte('sent_at', today);

      if (error) throw error;
      return data.map(n => n.client_id);
    },
    enabled: !!user?.id,
  });

  // Build prioritized queue
  const buildQueue = useCallback(() => {
    const today = startOfToday();
    const notifiedSet = new Set(todayNotifications);

    const queueItems: QueueItem[] = clients
      .filter(c => c.phone && !notifiedSet.has(c.id))
      .map(client => {
        const daysUntil = differenceInDays(new Date(client.expiration_date), today);
        
        // Priority: lower number = higher priority
        // Expired clients get highest priority (negative days = very high priority)
        // Then today, then 1 day, 2 days, 3 days, etc.
        let priority = 100 + daysUntil; // Base priority
        
        if (daysUntil < 0) {
          // Expired: highest priority, more negative = higher priority
          priority = Math.abs(daysUntil);
        } else if (daysUntil === 0) {
          priority = 10; // Expiring today
        } else if (daysUntil <= 3) {
          priority = 20 + daysUntil; // 1-3 days: second priority
        }

        return {
          client,
          priority,
          daysUntilExpiration: daysUntil,
          status: 'pending' as const,
        };
      })
      .sort((a, b) => a.priority - b.priority);

    setQueue(queueItems);
    return queueItems;
  }, [clients, todayNotifications]);

  useEffect(() => {
    buildQueue();
  }, [buildQueue]);

  // Save settings mutation
  const saveSettingsMutation = useMutation({
    mutationFn: async (newSettings: Partial<QueueSettings>) => {
      const settingsToSave = { ...settings, ...newSettings, seller_id: user!.id };
      
      if (settings?.id) {
        const { error } = await supabase
          .from('seller_queue_settings')
          .update(settingsToSave)
          .eq('id', settings.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('seller_queue_settings')
          .insert(settingsToSave);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      refetchSettings();
      toast.success('Configurações salvas!');
    },
    onError: (error: Error) => {
      toast.error('Erro ao salvar: ' + error.message);
    },
  });

  // Process queue
  const processNextClient = async () => {
    if (!isProcessing || currentClientIndex >= queue.length) {
      setIsProcessing(false);
      if (currentClientIndex >= queue.length && queue.length > 0) {
        toast.success('Fila concluída!');
        // Mark catch-up as completed if in catch-up mode
        if (settings?.catch_up_mode && !settings?.catch_up_completed) {
          saveSettingsMutation.mutate({ catch_up_completed: true, catch_up_mode: false });
        }
      }
      return;
    }

    // Check if within operating hours
    const currentHour = new Date().getHours();
    if (settings && (currentHour < settings.start_hour || currentHour >= settings.end_hour)) {
      toast.info(`Fora do horário de operação (${settings.start_hour}h - ${settings.end_hour}h)`);
      setIsProcessing(false);
      return;
    }

    const item = queue[currentClientIndex];
    if (!item) return;

    try {
      // Get WhatsApp config
      const { data: globalConfig } = await supabase
        .from('whatsapp_global_config')
        .select('*')
        .eq('is_active', true)
        .maybeSingle();

      const { data: sellerInstance } = await supabase
        .from('whatsapp_seller_instances')
        .select('*')
        .eq('seller_id', user!.id)
        .eq('is_connected', true)
        .maybeSingle();

      // Get appropriate template
      const daysLeft = item.daysUntilExpiration;
      let templateType = '';
      let notificationType = '';

      if (daysLeft < 0) {
        templateType = 'expired';
        notificationType = item.client.category === 'Contas Premium' ? 'app_vencimento' : 'iptv_vencimento';
      } else if (daysLeft === 0) {
        templateType = 'expired';
        notificationType = item.client.category === 'Contas Premium' ? 'app_vencimento' : 'iptv_vencimento';
      } else if (daysLeft <= 3) {
        templateType = 'expiring_3days';
        notificationType = item.client.category === 'Contas Premium' ? 'app_3_dias' : 'iptv_3_dias';
      } else {
        // Skip clients with more than 3 days unless in catch-up mode
        if (!settings?.catch_up_mode) {
          setCurrentClientIndex(prev => prev + 1);
          processNextClient();
          return;
        }
        templateType = 'reminder';
        notificationType = 'reminder';
      }

      // Get template
      const { data: templates } = await supabase
        .from('whatsapp_templates')
        .select('*')
        .eq('seller_id', user!.id)
        .eq('type', templateType);

      const template = templates?.[0];
      
      if (!template) {
        console.log(`No template found for type: ${templateType}`);
        setFailedToday(prev => prev + 1);
        setCurrentClientIndex(prev => prev + 1);
        
        // Wait and continue
        setTimeout(() => processNextClient(), (settings?.interval_seconds || 30) * 1000);
        return;
      }

      // Get seller profile for variables
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user!.id)
        .single();

      // Replace variables
      const message = template.message
        .replace(/{nome}/g, item.client.name)
        .replace(/{vencimento}/g, format(new Date(item.client.expiration_date), 'dd/MM/yyyy'))
        .replace(/{dias_restantes}/g, String(Math.max(0, daysLeft)))
        .replace(/{empresa}/g, profile?.company_name || profile?.full_name || '')
        .replace(/{pix}/g, profile?.pix_key || '');

      let sent = false;

      // Try sending via Evolution API
      if (globalConfig && sellerInstance) {
        try {
          const { data, error } = await supabase.functions.invoke('evolution-api', {
            body: {
              action: 'send_message',
              api_url: globalConfig.api_url,
              api_token: globalConfig.api_token,
              instance_name: sellerInstance.instance_name,
              phone: item.client.phone,
              message,
            },
          });

          sent = !error && data?.success;
        } catch (e) {
          console.error('Error sending message:', e);
        }
      }

      if (sent) {
        // Record notification
        await supabase.from('client_notification_tracking').insert({
          client_id: item.client.id,
          seller_id: user!.id,
          notification_type: notificationType,
          expiration_cycle_date: item.client.expiration_date,
          sent_via: 'whatsapp',
        });

        setProcessedToday(prev => prev + 1);
        
        // Update queue item status
        setQueue(prev => prev.map((q, i) => 
          i === currentClientIndex ? { ...q, status: 'sent' } : q
        ));
      } else {
        setFailedToday(prev => prev + 1);
        setQueue(prev => prev.map((q, i) => 
          i === currentClientIndex ? { ...q, status: 'failed' } : q
        ));
      }

      setCurrentClientIndex(prev => prev + 1);

      // Wait for interval and process next
      setTimeout(() => processNextClient(), (settings?.interval_seconds || 30) * 1000);

    } catch (error) {
      console.error('Error processing client:', error);
      setFailedToday(prev => prev + 1);
      setCurrentClientIndex(prev => prev + 1);
      setTimeout(() => processNextClient(), (settings?.interval_seconds || 30) * 1000);
    }
  };

  const handleStart = () => {
    if (queue.length === 0) {
      toast.error('Nenhum cliente na fila');
      return;
    }
    setIsProcessing(true);
    setCurrentClientIndex(0);
    processNextClient();
    toast.success('Fila iniciada!');
  };

  const handlePause = () => {
    setIsProcessing(false);
    toast.info('Fila pausada');
  };

  const handleReset = () => {
    setIsProcessing(false);
    setCurrentClientIndex(0);
    setProcessedToday(0);
    setFailedToday(0);
    buildQueue();
    toast.info('Fila reiniciada');
  };

  // Categorize clients
  const expiredClients = queue.filter(q => q.daysUntilExpiration < 0);
  const expiringTodayClients = queue.filter(q => q.daysUntilExpiration === 0);
  const expiring1to3Days = queue.filter(q => q.daysUntilExpiration > 0 && q.daysUntilExpiration <= 3);
  const futureClients = queue.filter(q => q.daysUntilExpiration > 3);

  const progress = queue.length > 0 ? (currentClientIndex / queue.length) * 100 : 0;
  const estimatedMinutes = Math.ceil(((queue.length - currentClientIndex) * (settings?.interval_seconds || 30)) / 60);

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-8 w-8 text-destructive" />
              <div>
                <div className="text-2xl font-bold">{expiredClients.length}</div>
                <div className="text-xs text-muted-foreground">Expirados</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Calendar className="h-8 w-8 text-orange-500" />
              <div>
                <div className="text-2xl font-bold">{expiringTodayClients.length}</div>
                <div className="text-xs text-muted-foreground">Vencem Hoje</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Clock className="h-8 w-8 text-yellow-500" />
              <div>
                <div className="text-2xl font-bold">{expiring1to3Days.length}</div>
                <div className="text-xs text-muted-foreground">1-3 Dias</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Users className="h-8 w-8 text-primary" />
              <div>
                <div className="text-2xl font-bold">{queue.length}</div>
                <div className="text-xs text-muted-foreground">Total na Fila</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Settings Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Configurações da Fila
          </CardTitle>
          <CardDescription>
            Configure o intervalo e horário de envio das mensagens
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Timer className="h-4 w-4" />
                Intervalo (segundos)
              </Label>
              <Input
                type="number"
                min={10}
                max={300}
                value={settings?.interval_seconds || 30}
                onChange={(e) => saveSettingsMutation.mutate({ interval_seconds: parseInt(e.target.value) || 30 })}
              />
            </div>
            <div className="space-y-2">
              <Label>Horário Início</Label>
              <Input
                type="number"
                min={0}
                max={23}
                value={settings?.start_hour || 8}
                onChange={(e) => saveSettingsMutation.mutate({ start_hour: parseInt(e.target.value) || 8 })}
              />
            </div>
            <div className="space-y-2">
              <Label>Horário Fim</Label>
              <Input
                type="number"
                min={0}
                max={23}
                value={settings?.end_hour || 22}
                onChange={(e) => saveSettingsMutation.mutate({ end_hour: parseInt(e.target.value) || 22 })}
              />
            </div>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-yellow-500" />
                Modo Catch-Up (Recuperação)
              </Label>
              <p className="text-xs text-muted-foreground">
                Envia mensagens para todos os expirados e vencendo até 3 dias, depois volta ao normal
              </p>
            </div>
            <Switch
              checked={settings?.catch_up_mode || false}
              onCheckedChange={(checked) => saveSettingsMutation.mutate({ catch_up_mode: checked, catch_up_completed: false })}
            />
          </div>

          {settings?.catch_up_completed && (
            <Badge variant="outline" className="gap-1">
              <CheckCircle className="h-3 w-3" />
              Catch-up concluído
            </Badge>
          )}
        </CardContent>
      </Card>

      {/* Progress Card */}
      <Card className={isProcessing ? 'border-primary' : ''}>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              {isProcessing ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
              Fila de Envio
            </span>
            <div className="flex gap-2">
              {isProcessing ? (
                <Button size="sm" variant="destructive" onClick={handlePause}>
                  <Pause className="h-4 w-4 mr-1" />
                  Pausar
                </Button>
              ) : (
                <Button size="sm" onClick={handleStart} disabled={queue.length === 0}>
                  <Play className="h-4 w-4 mr-1" />
                  Iniciar
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={handleReset}>
                <RotateCcw className="h-4 w-4 mr-1" />
                Reiniciar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => buildQueue()}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Progress value={progress} className="h-3" />
          
          <div className="flex justify-between text-sm">
            <span className="flex items-center gap-1">
              <CheckCircle className="h-4 w-4 text-green-500" />
              {processedToday} enviados
            </span>
            <span className="flex items-center gap-1">
              <XCircle className="h-4 w-4 text-red-500" />
              {failedToday} falhas
            </span>
            <span>
              {currentClientIndex} / {queue.length} ({Math.round(progress)}%)
            </span>
            <span className="text-muted-foreground">
              ~{estimatedMinutes} min restantes
            </span>
          </div>

          {/* Queue Preview */}
          <Separator />
          
          <div className="space-y-2">
            <Label>Próximos na fila:</Label>
            <ScrollArea className="h-48 border rounded-lg">
              <div className="p-2 space-y-1">
                {queue.slice(currentClientIndex, currentClientIndex + 10).map((item, idx) => (
                  <div
                    key={item.client.id}
                    className={`flex items-center justify-between p-2 rounded text-sm ${
                      idx === 0 && isProcessing ? 'bg-primary/10 border border-primary' : 'bg-muted/30'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{item.client.name}</span>
                      {item.status === 'sent' && <CheckCircle className="h-3 w-3 text-green-500" />}
                      {item.status === 'failed' && <XCircle className="h-3 w-3 text-red-500" />}
                    </div>
                    <Badge variant={
                      item.daysUntilExpiration < 0 ? 'destructive' :
                      item.daysUntilExpiration === 0 ? 'default' :
                      item.daysUntilExpiration <= 3 ? 'secondary' : 'outline'
                    }>
                      {item.daysUntilExpiration < 0 
                        ? `${Math.abs(item.daysUntilExpiration)}d expirado`
                        : item.daysUntilExpiration === 0 
                          ? 'Hoje'
                          : `${item.daysUntilExpiration}d`
                      }
                    </Badge>
                  </div>
                ))}
                {queue.length > currentClientIndex + 10 && (
                  <div className="text-center text-xs text-muted-foreground py-2">
                    + {queue.length - currentClientIndex - 10} mais clientes...
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Como funciona a Fila Inteligente</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>1. <strong>Prioridade:</strong> Clientes expirados primeiro, depois os que vencem hoje, 1-3 dias, etc.</p>
          <p>2. <strong>Intervalo:</strong> Cada mensagem é enviada com intervalo configurável para evitar bloqueio.</p>
          <p>3. <strong>Horário:</strong> Mensagens só são enviadas dentro do horário configurado.</p>
          <p>4. <strong>Modo Catch-Up:</strong> Envia para todos os atrasados de uma vez, depois volta ao normal (3 dias + vencimento).</p>
        </CardContent>
      </Card>
    </div>
  );
}
