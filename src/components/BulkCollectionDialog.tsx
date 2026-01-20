import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { Send, Play, Pause, Square, Clock, CheckCircle2, XCircle, AlertCircle, Users, Loader2, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Client {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  expiration_date: string;
  plan_id: string | null;
  plan_name: string | null;
  plan_price: number | null;
  premium_price: number | null;
  category: string | null;
  login: string | null;
  server_name: string | null;
  telegram: string | null;
  daysRemaining?: number;
}

interface SendResult {
  clientId: string;
  clientName: string;
  status: 'success' | 'error' | 'pending' | 'skipped';
  message?: string;
}

interface BulkCollectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: Client[];
  filterLabel?: string;
}

export function BulkCollectionDialog({ 
  open, 
  onOpenChange, 
  clients, 
  filterLabel = 'selecionados' 
}: BulkCollectionDialogProps) {
  const { user, profile } = useAuth();
  const [intervalSeconds, setIntervalSeconds] = useState(15);
  const [isSending, setIsSending] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<SendResult[]>([]);
  const [countdown, setCountdown] = useState(0);
  const abortRef = useRef(false);
  const pauseRef = useRef(false);

  // Clients with valid phone numbers
  const clientsWithPhone = clients.filter(c => c.phone && c.phone.replace(/\D/g, '').length >= 10);
  const clientsWithoutPhone = clients.filter(c => !c.phone || c.phone.replace(/\D/g, '').length < 10);

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
    enabled: !!user?.id && open,
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
    enabled: open,
  });

  // Fetch templates
  const { data: templates } = useQuery({
    queryKey: ['templates', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whatsapp_templates')
        .select('*')
        .eq('seller_id', user!.id);
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id && open,
  });

  const canSendViaApi = sellerInstance?.is_connected && 
    !sellerInstance?.instance_blocked && 
    globalConfig?.is_active &&
    globalConfig?.api_url &&
    globalConfig?.api_token;

  const formatDate = (dateStr: string): string => new Date(dateStr).toLocaleDateString('pt-BR');

  const daysUntil = (dateStr: string): number => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(dateStr);
    target.setHours(0, 0, 0, 0);
    return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  };

  const getTemplateForClient = (client: Client) => {
    const categoryLower = (client.category || 'iptv').toLowerCase();
    const daysLeft = client.daysRemaining ?? daysUntil(client.expiration_date);
    
    let templateType = 'expired';
    if (daysLeft > 0 && daysLeft <= 3) templateType = 'expiring_3days';
    if (daysLeft > 3) templateType = 'billing';
    
    return templates?.find(t => t.type === templateType && t.name.toLowerCase().includes(categoryLower)) 
      || templates?.find(t => t.type === templateType);
  };

  const replaceVariables = (template: string, client: Client): string => {
    const daysLeft = client.daysRemaining ?? daysUntil(client.expiration_date);
    return template
      .replace(/\{nome\}/g, client.name || '')
      .replace(/\{empresa\}/g, (profile as any)?.company_name || profile?.full_name || '')
      .replace(/\{vencimento\}/g, formatDate(client.expiration_date))
      .replace(/\{dias_restantes\}/g, String(daysLeft))
      .replace(/\{valor\}/g, String(client.plan_price || 0))
      .replace(/\{plano\}/g, client.plan_name || '')
      .replace(/\{pix\}/g, (profile as any)?.pix_key || '')
      .replace(/\{servico\}/g, client.category || 'IPTV');
  };

  const sendMessageToClient = async (client: Client): Promise<SendResult> => {
    const template = getTemplateForClient(client);
    
    if (!template) {
      return {
        clientId: client.id,
        clientName: client.name,
        status: 'error',
        message: 'Template não encontrado'
      };
    }

    const message = replaceVariables(template.message, client);
    let phone = client.phone!.replace(/\D/g, '');
    if (!phone.startsWith('55') && (phone.length === 10 || phone.length === 11)) {
      phone = '55' + phone;
    }

    try {
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
        // Record notification sent
        const daysLeft = client.daysRemaining ?? daysUntil(client.expiration_date);
        const notificationType = daysLeft <= 0 ? 'iptv_vencimento' : daysLeft <= 3 ? 'iptv_3_dias' : 'iptv_cobranca';
        
        await supabase.from('client_notification_tracking').insert({
          client_id: client.id,
          seller_id: user!.id,
          notification_type: notificationType,
          expiration_cycle_date: client.expiration_date,
          sent_via: 'api_bulk',
        });
        
        return {
          clientId: client.id,
          clientName: client.name,
          status: 'success',
          message: 'Enviado com sucesso'
        };
      } else {
        return {
          clientId: client.id,
          clientName: client.name,
          status: 'error',
          message: data.error || 'Falha no envio'
        };
      }
    } catch (error: any) {
      return {
        clientId: client.id,
        clientName: client.name,
        status: 'error',
        message: error.message || 'Erro desconhecido'
      };
    }
  };

  const startBulkSend = async () => {
    if (!canSendViaApi) {
      toast.error('API do WhatsApp não está configurada ou conectada');
      return;
    }

    setIsSending(true);
    setIsPaused(false);
    abortRef.current = false;
    pauseRef.current = false;
    setResults([]);
    setCurrentIndex(0);

    await processBulkSend(0);
  };

  const processBulkSend = async (startIndex: number) => {
    for (let i = startIndex; i < clientsWithPhone.length; i++) {
      // Check if aborted
      if (abortRef.current) {
        setIsSending(false);
        toast.info('Envio cancelado');
        return;
      }

      // Check if paused
      if (pauseRef.current) {
        setCurrentIndex(i);
        toast.info('Envio pausado');
        return;
      }

      const client = clientsWithPhone[i];
      setCurrentIndex(i);

      // Mark as pending
      setResults(prev => [...prev, { clientId: client.id, clientName: client.name, status: 'pending' }]);

      // Send message
      const result = await sendMessageToClient(client);
      
      // Update result
      setResults(prev => prev.map(r => r.clientId === client.id ? result : r));

      // Wait for interval (with countdown) if not last client
      if (i < clientsWithPhone.length - 1 && !abortRef.current && !pauseRef.current) {
        for (let s = intervalSeconds; s > 0; s--) {
          if (abortRef.current || pauseRef.current) break;
          setCountdown(s);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        setCountdown(0);
      }
    }

    setIsSending(false);
    setCurrentIndex(clientsWithPhone.length);
    
    const successCount = results.filter(r => r.status === 'success').length + 1; // +1 for current
    toast.success(`Envio concluído! ${successCount} mensagens enviadas.`);
  };

  const pauseSend = () => {
    pauseRef.current = true;
    setIsPaused(true);
  };

  const resumeSend = () => {
    setIsPaused(false);
    pauseRef.current = false;
    processBulkSend(currentIndex);
  };

  const stopSend = () => {
    abortRef.current = true;
    pauseRef.current = false;
    setIsSending(false);
    setIsPaused(false);
  };

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setIsSending(false);
      setIsPaused(false);
      setCurrentIndex(0);
      setResults([]);
      setCountdown(0);
      abortRef.current = false;
      pauseRef.current = false;
    }
  }, [open]);

  const progress = clientsWithPhone.length > 0 
    ? ((currentIndex + (isSending ? 0 : 0)) / clientsWithPhone.length) * 100 
    : 0;

  const successCount = results.filter(r => r.status === 'success').length;
  const errorCount = results.filter(r => r.status === 'error').length;

  return (
    <Dialog open={open} onOpenChange={(o) => !isSending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-primary" />
            Cobrança em Massa
          </DialogTitle>
          <DialogDescription>
            Enviar mensagem de cobrança para {clientsWithPhone.length} clientes {filterLabel}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-muted/50 rounded-lg p-3 text-center">
              <Users className="h-5 w-5 mx-auto text-primary mb-1" />
              <p className="text-lg font-bold">{clientsWithPhone.length}</p>
              <p className="text-xs text-muted-foreground">Com telefone</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-3 text-center">
              <CheckCircle2 className="h-5 w-5 mx-auto text-success mb-1" />
              <p className="text-lg font-bold">{successCount}</p>
              <p className="text-xs text-muted-foreground">Enviados</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-3 text-center">
              <XCircle className="h-5 w-5 mx-auto text-destructive mb-1" />
              <p className="text-lg font-bold">{errorCount}</p>
              <p className="text-xs text-muted-foreground">Erros</p>
            </div>
          </div>

          {/* Clients without phone warning */}
          {clientsWithoutPhone.length > 0 && (
            <div className="flex items-center gap-2 p-2 bg-warning/10 border border-warning/30 rounded-lg text-sm">
              <AlertCircle className="h-4 w-4 text-warning shrink-0" />
              <span className="text-warning">
                {clientsWithoutPhone.length} cliente{clientsWithoutPhone.length !== 1 ? 's' : ''} sem telefone válido
              </span>
            </div>
          )}

          {/* API Status */}
          <div className={cn(
            "flex items-center gap-2 p-2 rounded-lg text-sm",
            canSendViaApi ? "bg-success/10 border border-success/30" : "bg-destructive/10 border border-destructive/30"
          )}>
            {canSendViaApi ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                <span className="text-success">WhatsApp API conectada e pronta</span>
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4 text-destructive shrink-0" />
                <span className="text-destructive">
                  WhatsApp API não disponível - configure na página de Automação
                </span>
              </>
            )}
          </div>

          {/* Interval config */}
          {!isSending && (
            <div className="space-y-2">
              <Label htmlFor="interval" className="text-sm flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Intervalo entre mensagens (segundos)
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="interval"
                  type="number"
                  min={5}
                  max={120}
                  value={intervalSeconds}
                  onChange={(e) => setIntervalSeconds(Math.max(5, Math.min(120, parseInt(e.target.value) || 15)))}
                  className="w-24"
                />
                <span className="text-xs text-muted-foreground">
                  (5-120s) - Maior intervalo = menor risco de banimento
                </span>
              </div>
            </div>
          )}

          {/* Progress */}
          {(isSending || results.length > 0) && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Progresso</span>
                <span className="font-medium">{Math.min(currentIndex + 1, clientsWithPhone.length)} / {clientsWithPhone.length}</span>
              </div>
              <Progress value={progress} className="h-2" />
              
              {countdown > 0 && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground animate-pulse">
                  <Clock className="h-4 w-4" />
                  Aguardando {countdown}s antes do próximo envio...
                </div>
              )}
            </div>
          )}

          {/* Results list */}
          {results.length > 0 && (
            <ScrollArea className="h-40 border rounded-lg p-2">
              <div className="space-y-1">
                {results.map((result) => (
                  <div 
                    key={result.clientId}
                    className={cn(
                      "flex items-center justify-between p-2 rounded text-sm",
                      result.status === 'success' && "bg-success/10",
                      result.status === 'error' && "bg-destructive/10",
                      result.status === 'pending' && "bg-muted/50"
                    )}
                  >
                    <span className="truncate">{result.clientName}</span>
                    <div className="flex items-center gap-1">
                      {result.status === 'success' && <CheckCircle2 className="h-4 w-4 text-success" />}
                      {result.status === 'error' && (
                        <span className="text-xs text-destructive truncate max-w-[100px]" title={result.message}>
                          {result.message}
                        </span>
                      )}
                      {result.status === 'pending' && <Loader2 className="h-4 w-4 animate-spin" />}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {!isSending && !isPaused && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={startBulkSend} 
                disabled={!canSendViaApi || clientsWithPhone.length === 0}
                className="gap-2"
              >
                <Play className="h-4 w-4" />
                Iniciar Envio
              </Button>
            </>
          )}
          
          {isSending && !isPaused && (
            <>
              <Button variant="outline" onClick={pauseSend} className="gap-2">
                <Pause className="h-4 w-4" />
                Pausar
              </Button>
              <Button variant="destructive" onClick={stopSend} className="gap-2">
                <Square className="h-4 w-4" />
                Cancelar
              </Button>
            </>
          )}
          
          {isPaused && (
            <>
              <Button variant="outline" onClick={stopSend} className="gap-2">
                <Square className="h-4 w-4" />
                Parar
              </Button>
              <Button onClick={resumeSend} className="gap-2">
                <Play className="h-4 w-4" />
                Continuar
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
