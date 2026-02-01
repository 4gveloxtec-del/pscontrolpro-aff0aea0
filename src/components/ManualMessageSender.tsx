import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { MessageCircle, Copy, Clock, Send, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ensureClientNotificationTracking } from '@/lib/idempotency';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface Client {
  id: string;
  name: string;
  phone: string;
  expiration_date: string;
  category: string;
  plan_name: string;
  plan_price: number;
  server_name?: string | null;
  login?: string | null;
  password?: string | null;
  device?: string | null;
  telegram?: string | null;
}

interface ManualMessageSenderProps {
  client: Client;
  onMessageSent?: () => void;
}

interface NotificationTracking {
  id: string;
  notification_type: string;
  expiration_cycle_date: string;
}

export function ManualMessageSender({ client, onMessageSent }: ManualMessageSenderProps) {
  const { user, profile } = useAuth();
  const [sendingType, setSendingType] = useState<string | null>(null);

  // Fetch WhatsApp seller instance
  const { data: sellerInstance } = useQuery({
    queryKey: ['whatsapp-instance', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whatsapp_seller_instances')
        .select('*')
        .eq('seller_id', user!.id)
        .maybeSingle();
      if (error) return null;
      return data;
    },
    enabled: !!user?.id,
  });

  // Fetch global config
  const { data: globalConfig } = useQuery({
    queryKey: ['whatsapp-global-config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whatsapp_global_config')
        .select('*')
        .maybeSingle();
      if (error) return null;
      return data;
    },
  });

  const { data: templates } = useQuery({
    queryKey: ['templates', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whatsapp_templates')
        .select('*')
        .eq('seller_id', user!.id);
      if (error) throw error;
      const list = (data || []) as any[];
      const normalizeName = (name: string) => String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();
      const seen = new Set<string>();
      const deduped: any[] = [];
      for (const t of list) {
        const key = `${user!.id}:${t.type}:${normalizeName(t.name)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(t);
      }
      return deduped;
    },
    enabled: !!user?.id,
  });

  const { data: sentNotifications, refetch: refetchNotifications } = useQuery({
    queryKey: ['client-notifications', client.id],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('client_notification_tracking' as any)
          .select('*')
          .eq('client_id', client.id)
          .eq('expiration_cycle_date', client.expiration_date);
        if (error) return [];
        const list = ((data as unknown as NotificationTracking[]) || []);

        // Etapa 4 (UI): não listar duas cobranças/notificações do mesmo período
        const seen = new Set<string>();
        const deduped: NotificationTracking[] = [];
        for (const n of list) {
          const key = `${n.notification_type}:${n.expiration_cycle_date}`;
          if (seen.has(key)) continue;
          seen.add(key);
          deduped.push(n);
        }
        return deduped;
      } catch {
        return [];
      }
    },
    enabled: !!client.id,
  });

  // Format date without timezone shift - uses T12:00:00 to avoid UTC midnight issues
  const formatDate = (dateStr: string): string => {
    if (!dateStr) return '';
    // Parse as local date by adding T12:00:00 to avoid timezone issues
    const normalizedDate = dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00`;
    return new Date(normalizedDate).toLocaleDateString('pt-BR');
  };

  const daysUntil = (dateStr: string): number => {
    if (!dateStr) return 0;
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const normalizedDate = dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00`;
    const target = new Date(normalizedDate);
    target.setHours(12, 0, 0, 0);
    return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  };

  const replaceVariables = (template: string): string => {
    return template
      .replace(/\{nome\}/gi, client.name || '')
      .replace(/\{empresa\}/gi, (profile as any)?.company_name || profile?.full_name || '')
      .replace(/\{vencimento\}/gi, formatDate(client.expiration_date))
      .replace(/\{dias_restantes\}/gi, String(daysUntil(client.expiration_date)))
      .replace(/\{valor\}/gi, String(client.plan_price || 0))
      .replace(/\{plano\}/gi, client.plan_name || '')
      .replace(/\{pix\}/gi, (profile as any)?.pix_key || '')
      .replace(/\{servico\}/gi, client.category || 'IPTV')
      .replace(/\{categoria\}/gi, client.category || 'IPTV')
      .replace(/\{servidor\}/gi, client.server_name || '')
      .replace(/\{login\}/gi, client.login || '')
      .replace(/\{senha\}/gi, client.password || '')
      .replace(/\{dispositivo\}/gi, client.device || '')
      .replace(/\{telegram\}/gi, client.telegram || '');
  };

  const getTemplateForType = (type: string) => {
    const categoryLower = (client.category || 'iptv').toLowerCase();
    return templates?.find(t => t.type === type && t.name.toLowerCase().includes(categoryLower)) 
      || templates?.find(t => t.type === type);
  };

  const isNotificationSent = (type: string) => {
    return sentNotifications?.some(n => n.notification_type === type);
  };

  const canSendViaApi = sellerInstance?.is_connected && 
    !sellerInstance?.instance_blocked && 
    globalConfig?.is_active &&
    globalConfig?.api_url &&
    globalConfig?.api_token;

  // Send message via WhatsApp API
  const sendViaApi = async (type: string, templateType: string) => {
    if (!client.phone) {
      toast.error('Cliente sem telefone');
      return;
    }

    const template = getTemplateForType(templateType);
    if (!template) {
      toast.error('Template não encontrado');
      return;
    }

    setSendingType(type);
    
    try {
      const message = replaceVariables(template.message);
      let phone = client.phone.replace(/\D/g, '');
      if (!phone.startsWith('55') && (phone.length === 10 || phone.length === 11)) {
        phone = '55' + phone;
      }

      const { data, error } = await supabase.functions.invoke('evolution-api', {
        body: {
          action: 'send_message',
          config: {
            api_url: globalConfig!.api_url,
            api_token: globalConfig!.api_token,
            instance_name: sellerInstance!.instance_name,
          },
          phone,
          message,
        },
      });

      if (error) throw error;
      
      if (data.success) {
        // Record notification sent (idempotent)
        await ensureClientNotificationTracking(supabase, {
          client_id: client.id,
          seller_id: user!.id,
          notification_type: type,
          expiration_cycle_date: client.expiration_date,
          sent_via: 'api',
        });
        
        toast.success('Mensagem enviada via API!');
        refetchNotifications();
        onMessageSent?.();
      } else {
        toast.error('Erro: ' + (data.error || 'Falha no envio'));
      }
    } catch (error: any) {
      toast.error('Erro ao enviar: ' + error.message);
    } finally {
      setSendingType(null);
    }
  };

  // Send message via WhatsApp Web (manual)
  const sendManualMessage = async (type: string, templateType: string) => {
    if (!client.phone) {
      toast.error('Cliente sem telefone');
      return;
    }

    const template = getTemplateForType(templateType);
    if (!template) {
      toast.error('Template não encontrado');
      return;
    }

    const message = replaceVariables(template.message);
    let phone = client.phone.replace(/\D/g, '');
    if (!phone.startsWith('55') && (phone.length === 10 || phone.length === 11)) {
      phone = '55' + phone;
    }

    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');

    try {
      await ensureClientNotificationTracking(supabase, {
        client_id: client.id,
        seller_id: user!.id,
        notification_type: type,
        expiration_cycle_date: client.expiration_date,
        sent_via: 'manual',
      });
      toast.success('Mensagem preparada!');
      refetchNotifications();
      onMessageSent?.();
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const copyMessage = (templateType: string) => {
    const template = getTemplateForType(templateType);
    if (!template) return;
    navigator.clipboard.writeText(replaceVariables(template.message));
    toast.success('Copiado!');
  };

  const isPaidApp = client.category === 'Contas Premium';
  const daysLeft = daysUntil(client.expiration_date);

  const messageButtons = [
    ...(isPaidApp ? [{ label: '30 dias', type: 'app_30_dias', templateType: 'billing', show: daysLeft <= 30 && daysLeft > 3 }] : []),
    { label: '3 dias', type: isPaidApp ? 'app_3_dias' : 'iptv_3_dias', templateType: 'expiring_3days', show: daysLeft <= 3 && daysLeft > 0 },
    { label: 'Vencimento', type: isPaidApp ? 'app_vencimento' : 'iptv_vencimento', templateType: 'expired', show: daysLeft <= 0 },
  ].filter(b => b.show);

  if (messageButtons.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 sm:gap-2">
      {messageButtons.map((button) => {
        const isSent = isNotificationSent(button.type);
        const isSending = sendingType === button.type;
        
        return (
          <div key={button.type} className="flex items-center gap-0.5 sm:gap-1">
            {canSendViaApi ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                      variant={isSent ? "secondary" : "outline"}
                      size="sm"
                      className={cn("gap-1 sm:gap-1.5 text-xs h-7 sm:h-8 px-2 sm:px-3", isSent && "opacity-50")}
                    disabled={isSent || isSending}
                  >
                    {isSending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : isSent ? (
                      <Clock className="h-3 w-3" />
                    ) : (
                      <MessageCircle className="h-3 w-3" />
                    )}
                    {button.label}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={() => sendViaApi(button.type, button.templateType)}>
                    <Send className="h-4 w-4 mr-2 text-green-500" />
                    Enviar via API (automático)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => sendManualMessage(button.type, button.templateType)}>
                    <MessageCircle className="h-4 w-4 mr-2 text-blue-500" />
                    Abrir WhatsApp Web (manual)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button
                variant={isSent ? "secondary" : "outline"}
                size="sm"
                className={cn("gap-1 sm:gap-1.5 text-xs h-7 sm:h-8 px-2 sm:px-3", isSent && "opacity-50")}
                onClick={() => sendManualMessage(button.type, button.templateType)}
                disabled={isSent}
              >
                {isSent ? <Clock className="h-2.5 w-2.5 sm:h-3 sm:w-3" /> : <MessageCircle className="h-2.5 w-2.5 sm:h-3 sm:w-3" />}
                {button.label}
              </Button>
            )}
            <Button variant="ghost" size="sm" className="h-6 w-6 sm:h-8 sm:w-8 p-0" onClick={() => copyMessage(button.templateType)}>
              <Copy className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
