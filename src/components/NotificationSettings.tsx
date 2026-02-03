import { Bell, BellOff, Loader2, AlertTriangle, CheckCircle2, Info, Smartphone, Globe, Send, Calendar } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useAuth } from '@/hooks/useAuth';
import { supabaseExternal as supabase } from '@/lib/supabase-external';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useState, useEffect } from 'react';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';

export function NotificationSettings() {
  const {
    isSupported,
    permission,
    isSubscribed,
    isLoading,
    subscribe,
    unsubscribe,
    isDenied,
    browserCheck,
    lastError,
    getLastErrorSync,
  } = usePushNotifications();
  
  const { isAdmin, user } = useAuth();
  const [showDetails, setShowDetails] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [notificationDays, setNotificationDays] = useState(3);
  const [isSavingDays, setIsSavingDays] = useState(false);
  const [hasLoadedDays, setHasLoadedDays] = useState(false);
  
  // Push on auto message setting
  const [pushOnAutoMessage, setPushOnAutoMessage] = useState(true);
  const [isSavingPushOnAutoMessage, setIsSavingPushOnAutoMessage] = useState(false);
  
  // Push for unnotified clients (clients expiring today that weren't auto-notified)
  const [pushUnnotifiedClients, setPushUnnotifiedClients] = useState(true);
  const [isSavingPushUnnotified, setIsSavingPushUnnotified] = useState(false);

  // Load notification days preference from database
  useEffect(() => {
    const loadNotificationDays = async () => {
      if (!user?.id) return;
      
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();
        
        if (!error && data) {
          const profile = data as any;
          if (profile.notification_days_before !== null && profile.notification_days_before !== undefined) {
            setNotificationDays(profile.notification_days_before);
          }
          // Load push on auto message preference (default true)
          if (profile.push_on_auto_message !== null && profile.push_on_auto_message !== undefined) {
            setPushOnAutoMessage(profile.push_on_auto_message);
          } else {
            setPushOnAutoMessage(true);
          }
          // Load push unnotified clients preference (default true)
          if (profile.push_unnotified_clients !== null && profile.push_unnotified_clients !== undefined) {
            setPushUnnotifiedClients(profile.push_unnotified_clients);
          } else {
            setPushUnnotifiedClients(true);
          }
        }
        setHasLoadedDays(true);
      } catch (error) {
        console.error('Error loading notification days:', error);
        setHasLoadedDays(true);
      }
    };

    loadNotificationDays();
  }, [user?.id]);

  const handleDaysChange = async (value: number[]) => {
    const newDays = value[0];
    setNotificationDays(newDays);
  };

  const saveDaysPreference = async () => {
    if (!user?.id) return;
    
    setIsSavingDays(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ notification_days_before: notificationDays } as any)
        .eq('id', user.id);
      
      if (error) throw error;
      
      // Also save to localStorage for quick access
      localStorage.setItem('notification_days_before', String(notificationDays));
      
      toast.success('Preferência salva!', {
        description: `Você será notificado ${notificationDays} dia(s) antes do vencimento.`
      });
    } catch (error) {
      console.error('Error saving notification days:', error);
      toast.error('Erro ao salvar preferência');
    } finally {
      setIsSavingDays(false);
    }
  };

  // Toggle push on auto message
  const handlePushOnAutoMessageToggle = async (checked: boolean) => {
    if (!user?.id) return;
    
    setIsSavingPushOnAutoMessage(true);
    setPushOnAutoMessage(checked);
    
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ push_on_auto_message: checked } as any)
        .eq('id', user.id);
      
      if (error) throw error;
      
      toast.success(checked ? 'Notificações de envio ativadas!' : 'Notificações de envio desativadas', {
        description: checked 
          ? 'Você será notificado quando mensagens automáticas forem enviadas aos clientes.'
          : 'Você não receberá notificações de mensagens automáticas enviadas.'
      });
    } catch (error) {
      console.error('Error saving push on auto message:', error);
      setPushOnAutoMessage(!checked); // Revert on error
      toast.error('Erro ao salvar preferência');
    } finally {
      setIsSavingPushOnAutoMessage(false);
    }
  };

  // Toggle push for unnotified clients
  const handlePushUnnotifiedToggle = async (checked: boolean) => {
    if (!user?.id) return;
    
    setIsSavingPushUnnotified(true);
    setPushUnnotifiedClients(checked);
    
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ push_unnotified_clients: checked } as any)
        .eq('id', user.id);
      
      if (error) throw error;
      
      toast.success(checked ? 'Alerta de clientes não notificados ativado!' : 'Alerta desativado', {
        description: checked 
          ? 'Você será lembrado de clientes que vencem hoje mas não foram notificados automaticamente.'
          : 'Você não receberá alertas de clientes não notificados.'
      });
    } catch (error) {
      console.error('Error saving push unnotified clients:', error);
      setPushUnnotifiedClients(!checked); // Revert on error
      toast.error('Erro ao salvar preferência');
    } finally {
      setIsSavingPushUnnotified(false);
    }
  };

  const handleToggle = async (checked: boolean) => {
    // Push subscription is tied to the authenticated user on the backend.
    if (!user?.id) {
      toast.error('Faça login para configurar notificações');
      return;
    }

    if (!isSupported) {
      toast.error('Notificações não suportadas', {
        description: lastError?.details || 'Este navegador não suporta notificações push.'
      });
      return;
    }

    if (checked) {
      const success = await subscribe();
      if (success) {
        toast.success('Notificações push ativadas!', {
          description: 'Você receberá alertas mesmo com o app fechado.'
        });
      } else {
        // IMPORTANT: lastError state may be stale immediately after await.
        const err = getLastErrorSync?.() ?? lastError;

        if (err) {
          toast.error(err.message, {
            description: err.details,
          duration: 6000,
          });
        } else if (permission === 'denied' || Notification.permission === 'denied') {
          toast.error('Permissão negada', {
            description: 'Ative nas configurações do navegador'
          });
        } else {
          toast.error('Erro ao ativar notificações');
        }
      }
    } else {
      const success = await unsubscribe();
      if (success) {
        toast.info('Notificações desativadas');
      } else {
        toast.error('Erro ao desativar notificações');
      }
    }
  };

  const handleTestNotification = async () => {
    if (!isSubscribed) {
      toast.error('Ative as notificações primeiro');
      return;
    }
    
    setIsSendingTest(true);
    
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast.error('Usuário não autenticado');
        return;
      }
      
      // Fetch real clients expiring in the next 3 days
      const today = new Date();
      const threeDaysFromNow = new Date(today);
      threeDaysFromNow.setDate(today.getDate() + 3);
      
      const { data: expiringClients, error: clientError } = await supabase
        .from('clients')
        .select('id, name, expiration_date, plan_name')
        .eq('seller_id', user.id)
        .eq('is_archived', false)
        .gte('expiration_date', today.toISOString().split('T')[0])
        .lte('expiration_date', threeDaysFromNow.toISOString().split('T')[0])
        .order('expiration_date', { ascending: true })
        .limit(5);
      
      if (clientError) {
        console.error('Error fetching clients:', clientError);
        toast.error('Erro ao buscar clientes');
        return;
      }
      
      if (!expiringClients || expiringClients.length === 0) {
        toast.info('Nenhum cliente vencendo nos próximos 3 dias', {
          description: 'Enviando notificação de exemplo...'
        });
        
        // Send example notification
        const { data, error } = await supabase.functions.invoke('send-push-notification', {
          body: {
            userId: user.id,
            title: '✅ Teste de Notificação',
            body: 'Suas notificações estão funcionando! Você receberá alertas de clientes vencendo.',
            tag: `test-${Date.now()}`,
            data: { type: 'test' }
          }
        });
        
        if (error) {
          console.error('Error sending push:', error);
          toast.error('Erro ao enviar notificação');
          return;
        }
        
        if (data?.sent > 0) {
          toast.success('Notificação de teste enviada!');
        } else {
          toast.warning('Nenhum dispositivo recebeu a notificação');
        }
        return;
      }
      
      // Pick first expiring client
      const client = expiringClients[0];
      const expirationDate = new Date(client.expiration_date + 'T12:00:00');
      const daysLeft = Math.ceil((expirationDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      const formattedDate = expirationDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      
      // Format like WhatsApp message
      let emoji = '🟢';
      let urgencyText = `Vence em ${daysLeft} dias`;
      if (daysLeft <= 0) {
        emoji = '🔴';
        urgencyText = 'Vence HOJE!';
      } else if (daysLeft === 1) {
        emoji = '🟠';
        urgencyText = 'Vence amanhã!';
      }
      
      // Send real notification
      const { data, error } = await supabase.functions.invoke('send-push-notification', {
        body: {
          userId: user.id,
          title: `${emoji} ${client.name}`,
          body: `${urgencyText} • ${client.plan_name || 'Plano'} • ${formattedDate}`,
          tag: `client-${client.id}`,
          data: { type: 'client-expiration', clientId: client.id }
        }
      });
      
      if (error) {
        console.error('Error sending push:', error);
        toast.error('Erro ao enviar notificação', { description: error.message });
        return;
      }
      
      console.log('Push response:', data);
      
      if (data?.sent > 0) {
        toast.success('Notificação enviada!', {
          description: `Cliente "${client.name}" - ${urgencyText}`
        });
      } else {
        toast.warning('Notificação não foi recebida', {
          description: 'Verifique as permissões do navegador'
        });
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error('Erro ao enviar notificação de teste');
    } finally {
      setIsSendingTest(false);
    }
  };

  const getStatusText = () => {
    if (!browserCheck) return 'Verificando...';
    if (!isSupported) {
      if (browserCheck.isIOS && !browserCheck.isIOSVersionSupported) {
        return 'iOS 16.4+ necessário';
      }
      if (!browserCheck.isSecureContext) {
        return 'Requer HTTPS';
      }
      return 'Não suportado neste navegador';
    }
    if (isDenied) return 'Bloqueado nas configurações do navegador';
    if (isLoading) return 'Processando...';
    if (isSubscribed) return 'Ativadas (funciona mesmo com app fechado)';
    return 'Desativadas';
  };

  const getStatusColor = () => {
    if (!browserCheck) return 'text-muted-foreground';
    if (!isSupported || isDenied) return 'text-destructive';
    if (isSubscribed) return 'text-green-500';
    return 'text-muted-foreground';
  };

  const getBrowserCheckIcon = (supported: boolean) => {
    return supported ? (
      <CheckCircle2 className="h-4 w-4 text-green-500" />
    ) : (
      <AlertTriangle className="h-4 w-4 text-destructive" />
    );
  };

  return (
    <div className="space-y-3 max-w-full overflow-x-hidden">
      <div className="flex items-center justify-between w-full gap-3">
        <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
            {isLoading ? (
              <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 text-foreground animate-spin" />
            ) : isSubscribed ? (
              <Bell className="h-4 w-4 sm:h-5 sm:w-5 text-foreground" />
            ) : (
              <BellOff className="h-4 w-4 sm:h-5 sm:w-5 text-foreground" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-foreground text-sm sm:text-base">Notificações Push</p>
            <p className={cn("text-xs sm:text-sm truncate", getStatusColor())}>
              {getStatusText()}
            </p>
          </div>
        </div>
        
        {isSupported && !isDenied && (
          <Switch
            checked={isSubscribed}
            onCheckedChange={handleToggle}
            disabled={isLoading}
            className="flex-shrink-0"
          />
        )}
        
        {isDenied && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => toast.info('Acesse as configurações do seu navegador, vá em "Sites" ou "Permissões" e ative as notificações para este site.', { duration: 8000 })}
            className="flex-shrink-0 text-xs"
          >
            Saiba mais
          </Button>
        )}
      </div>
      
      {/* Test Button - Available for everyone */}
      {isSubscribed && (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={handleTestNotification}
          disabled={isSendingTest}
        >
          {isSendingTest ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Send className="h-4 w-4 mr-2" />
          )}
          Testar Notificação (Cliente Vencendo)
        </Button>
      )}
      
      {/* Error display - only show for truly blocking errors (denied permission or unsupported browser) */}
      {!isSubscribed && !isLoading && (isDenied || (!isSupported && lastError)) && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
          <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-destructive">
              {isDenied ? 'Permissão bloqueada' : lastError?.message}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {isDenied 
                ? 'Ative as notificações nas configurações do seu navegador.' 
                : lastError?.details}
            </p>
          </div>
        </div>
      )}
      
      {/* Notification Days Configuration */}
      {isSubscribed && hasLoadedDays && (
        <div className="p-4 rounded-lg bg-muted/50 border border-border space-y-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <Label className="text-sm font-medium">Antecedência das Notificações</Label>
          </div>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Notificar {notificationDays} dia(s) antes
              </span>
              <span className="text-xs text-muted-foreground">
                1 - 7 dias
              </span>
            </div>
            
            <Slider
              value={[notificationDays]}
              onValueChange={handleDaysChange}
              min={1}
              max={7}
              step={1}
              className="w-full"
            />
            
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>1 dia</span>
              <span>7 dias</span>
            </div>
            
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={saveDaysPreference}
              disabled={isSavingDays}
            >
              {isSavingDays ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              )}
              Salvar Preferência
            </Button>
          </div>
          
          <p className="text-xs text-muted-foreground">
            Aplica-se a contas a pagar e clientes vencendo.
          </p>
        </div>
      )}

      {/* Push on Auto Message Toggle */}
      {isSubscribed && hasLoadedDays && (
        <div className="p-4 rounded-lg bg-muted/50 border border-border space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-success/10 flex items-center justify-center">
                <Send className="h-4 w-4 text-success" />
              </div>
              <div>
                <p className="text-sm font-medium">Notificar Mensagens Enviadas</p>
                <p className="text-xs text-muted-foreground">
                  Receber push quando mensagens automáticas forem enviadas
                </p>
              </div>
            </div>
            <Switch
              checked={pushOnAutoMessage}
              onCheckedChange={handlePushOnAutoMessageToggle}
              disabled={isSavingPushOnAutoMessage}
            />
          </div>
          
          <p className="text-xs text-muted-foreground">
            Inclui boas-vindas, lembretes de vencimento e cobranças automáticas.
          </p>
        </div>
      )}

      {/* Push for Unnotified Clients Toggle */}
      {isSubscribed && hasLoadedDays && (
        <div className="p-4 rounded-lg bg-orange-500/10 border border-orange-500/30 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-orange-500/20 flex items-center justify-center">
                <AlertTriangle className="h-4 w-4 text-orange-500" />
              </div>
              <div>
                <p className="text-sm font-medium">Lembrar Clientes Não Notificados</p>
                <p className="text-xs text-muted-foreground">
                  Clientes que vencem hoje mas não foram chamados automaticamente
                </p>
              </div>
            </div>
            <Switch
              checked={pushUnnotifiedClients}
              onCheckedChange={handlePushUnnotifiedToggle}
              disabled={isSavingPushUnnotified}
            />
          </div>
          
          <p className="text-xs text-muted-foreground">
            Receba um push listando clientes vencendo HOJE que não receberam mensagem automática, 
            para que você possa ligar e lembrá-los manualmente.
          </p>
        </div>
      )}

      {/* Browser compatibility details */}
      <Collapsible open={showDetails} onOpenChange={setShowDetails}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground">
            <Info className="h-4 w-4 mr-2" />
            {showDetails ? 'Ocultar' : 'Ver'} diagnóstico do navegador
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-2 mt-2">
          {browserCheck && (
            <div className="p-3 rounded-lg bg-muted/50 border border-border space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Navegador:</span>
                <span className="font-medium">{browserCheck.browserName} {browserCheck.browserVersion}</span>
              </div>
              
              {browserCheck.isIOS && (
                <div className="flex items-center gap-2 text-sm">
                  <Smartphone className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">iOS:</span>
                  <span className="font-medium">
                    {browserCheck.isIOSVersionSupported ? 'Versão compatível' : 'Requer iOS 16.4+'}
                  </span>
                  {getBrowserCheckIcon(browserCheck.isIOSVersionSupported)}
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border">
                <div className="flex items-center gap-2 text-xs">
                  {getBrowserCheckIcon(browserCheck.isSecureContext)}
                  <span>Conexão segura (HTTPS)</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {getBrowserCheckIcon(browserCheck.hasNotificationAPI)}
                  <span>API de Notificações</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {getBrowserCheckIcon(browserCheck.hasServiceWorker)}
                  <span>Service Worker</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {getBrowserCheckIcon(browserCheck.hasPushManager)}
                  <span>Push Manager</span>
                </div>
              </div>
              
              {!isSupported && (
                <div className="pt-2 border-t border-border">
                  <p className="text-xs text-muted-foreground">
                    {browserCheck.isIOS && !browserCheck.isIOSVersionSupported ? (
                      'Atualize seu iPhone/iPad para iOS 16.4 ou superior para usar notificações push.'
                    ) : !browserCheck.isSecureContext ? (
                      'Notificações push requerem uma conexão HTTPS segura.'
                    ) : (
                      'Seu navegador não suporta todos os recursos necessários para notificações push. Tente usar Chrome, Firefox, Safari ou Edge atualizados.'
                    )}
                  </p>
                </div>
              )}
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}