import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { Send, Users, Clock, CheckCircle, XCircle, Loader2, MessageSquare, Link as LinkIcon, Play, Pause, RotateCcw } from 'lucide-react';

interface Seller {
  id: string;
  email: string;
  full_name: string | null;
  whatsapp: string | null;
  is_active: boolean;
}

interface Broadcast {
  id: string;
  message: string;
  status: string;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  interval_seconds: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export function AdminBroadcastResellers() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [intervalSeconds, setIntervalSeconds] = useState(30);
  const [isSending, setIsSending] = useState(false);
  const [currentBroadcastId, setCurrentBroadcastId] = useState<string | null>(null);

  // Fetch sellers with WhatsApp
  const { data: sellers = [] } = useQuery({
    queryKey: ['broadcast-sellers'],
    queryFn: async () => {
      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'seller');

      if (!roles?.length) return [];

      const sellerIds = roles.map(r => r.user_id);

      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, full_name, whatsapp, is_active')
        .in('id', sellerIds)
        .eq('is_active', true)
        .not('whatsapp', 'is', null);

      if (error) throw error;
      return (data || []).filter(s => s.whatsapp) as Seller[];
    },
  });

  // Fetch recent broadcasts
  const { data: broadcasts = [] } = useQuery({
    queryKey: ['admin-broadcasts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admin_broadcasts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      return data as Broadcast[];
    },
  });

  // Fetch active broadcast progress
  const { data: activeBroadcast } = useQuery({
    queryKey: ['active-broadcast', currentBroadcastId],
    queryFn: async () => {
      if (!currentBroadcastId) return null;
      
      const { data, error } = await supabase
        .from('admin_broadcasts')
        .select('*')
        .eq('id', currentBroadcastId)
        .single();

      if (error) throw error;
      return data as Broadcast;
    },
    enabled: !!currentBroadcastId,
    refetchInterval: isSending ? 2000 : false,
  });

  // Get app URL
  const appUrl = window.location.origin;

  // Default message template
  const defaultMessage = `🎉 Novidades! 

Olá {nome}!

Temos uma atualização importante do nosso sistema de gestão! 

🔗 Acesse agora: ${appUrl}

Este é o novo sistema atualizado com melhorias e novas funcionalidades. Use seu e-mail e senha para acessar.

Qualquer dúvida estamos à disposição!`;

  const createBroadcastMutation = useMutation({
    mutationFn: async () => {
      // Create broadcast record
      const { data: broadcast, error: broadcastError } = await supabase
        .from('admin_broadcasts')
        .insert({
          admin_id: user!.id,
          message,
          interval_seconds: intervalSeconds,
          total_recipients: sellers.length,
          status: 'sending',
          started_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (broadcastError) throw broadcastError;

      // Create recipient records
      const recipients = sellers.map(seller => ({
        broadcast_id: broadcast.id,
        seller_id: seller.id,
        status: 'pending',
      }));

      const { error: recipientsError } = await supabase
        .from('admin_broadcast_recipients')
        .insert(recipients);

      if (recipientsError) throw recipientsError;

      return broadcast;
    },
    onSuccess: (broadcast) => {
      setCurrentBroadcastId(broadcast.id);
      setIsSending(true);
      processBroadcast(broadcast.id);
    },
    onError: (error: Error) => {
      toast.error('Erro ao criar broadcast: ' + error.message);
    },
  });

  const processBroadcast = async (broadcastId: string) => {
    try {
      // Get pending recipients
      const { data: pendingRecipients } = await supabase
        .from('admin_broadcast_recipients')
        .select('id, seller_id')
        .eq('broadcast_id', broadcastId)
        .eq('status', 'pending');

      if (!pendingRecipients?.length) {
        // Mark broadcast as completed
        await supabase
          .from('admin_broadcasts')
          .update({ 
            status: 'completed',
            completed_at: new Date().toISOString()
          })
          .eq('id', broadcastId);

        setIsSending(false);
        queryClient.invalidateQueries({ queryKey: ['admin-broadcasts'] });
        toast.success('Broadcast concluído!');
        setDialogOpen(false);
        return;
      }

      // Get global config
      const { data: globalConfig } = await supabase
        .from('whatsapp_global_config')
        .select('*')
        .eq('is_active', true)
        .maybeSingle();

      // Get admin instance
      const { data: adminInstance } = await supabase
        .from('whatsapp_seller_instances')
        .select('*')
        .eq('seller_id', user!.id)
        .eq('is_connected', true)
        .maybeSingle();

      for (const recipient of pendingRecipients) {
        if (!isSending) break;

        const seller = sellers.find(s => s.id === recipient.seller_id);
        if (!seller?.whatsapp) continue;

        // Replace variables in message
        const personalizedMessage = message
          .replace(/{nome}/g, seller.full_name || seller.email.split('@')[0])
          .replace(/{email}/g, seller.email)
          .replace(/{whatsapp}/g, seller.whatsapp);

        let sent = false;

        // Try sending via Evolution API
        if (globalConfig && adminInstance) {
          try {
            const { data, error } = await supabase.functions.invoke('evolution-api', {
              body: {
                action: 'send_message',
                api_url: globalConfig.api_url,
                api_token: globalConfig.api_token,
                instance_name: adminInstance.instance_name,
                phone: seller.whatsapp,
                message: personalizedMessage,
              },
            });

            sent = !error && data?.success;
          } catch (e) {
            console.error('Error sending via API:', e);
          }
        }

        // Update recipient status
        await supabase
          .from('admin_broadcast_recipients')
          .update({
            status: sent ? 'sent' : 'failed',
            sent_at: sent ? new Date().toISOString() : null,
            error_message: sent ? null : 'Falha ao enviar',
          })
          .eq('id', recipient.id);

        // Update broadcast counts
        const { data: currentBroadcast } = await supabase
          .from('admin_broadcasts')
          .select('sent_count, failed_count')
          .eq('id', broadcastId)
          .single();

        if (currentBroadcast) {
          const updateData = sent
            ? { sent_count: (currentBroadcast.sent_count || 0) + 1 }
            : { failed_count: (currentBroadcast.failed_count || 0) + 1 };

          await supabase
            .from('admin_broadcasts')
            .update(updateData)
            .eq('id', broadcastId);
        }

        queryClient.invalidateQueries({ queryKey: ['active-broadcast', broadcastId] });

        // Wait for interval
        await new Promise(resolve => setTimeout(resolve, intervalSeconds * 1000));
      }

      // Recursively process remaining
      if (isSending) {
        processBroadcast(broadcastId);
      }
    } catch (error) {
      console.error('Error processing broadcast:', error);
      setIsSending(false);
    }
  };

  const handleStartBroadcast = () => {
    if (!message.trim()) {
      toast.error('Digite uma mensagem');
      return;
    }
    if (sellers.length === 0) {
      toast.error('Nenhum revendedor com WhatsApp cadastrado');
      return;
    }
    createBroadcastMutation.mutate();
  };

  const handleStopBroadcast = () => {
    setIsSending(false);
    if (currentBroadcastId) {
      supabase
        .from('admin_broadcasts')
        .update({ status: 'paused' })
        .eq('id', currentBroadcastId);
    }
    toast.info('Broadcast pausado');
  };

  const handleResumeBroadcast = (broadcastId: string) => {
    setCurrentBroadcastId(broadcastId);
    setIsSending(true);
    processBroadcast(broadcastId);
  };

  const progress = activeBroadcast
    ? ((activeBroadcast.sent_count + activeBroadcast.failed_count) / activeBroadcast.total_recipients) * 100
    : 0;

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <MessageSquare className="h-4 w-4" />
          Broadcast para Revendedores
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Enviar Mensagem para Todos os Revendedores
          </DialogTitle>
          <DialogDescription>
            Envie uma mensagem com o link do app para todos os revendedores ativos
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Stats */}
          <div className="flex gap-4">
            <Card className="flex-1">
              <CardContent className="p-4 flex items-center gap-3">
                <Users className="h-8 w-8 text-primary" />
                <div>
                  <div className="text-2xl font-bold">{sellers.length}</div>
                  <div className="text-xs text-muted-foreground">Revendedores com WhatsApp</div>
                </div>
              </CardContent>
            </Card>
            <Card className="flex-1">
              <CardContent className="p-4 flex items-center gap-3">
                <LinkIcon className="h-8 w-8 text-blue-500" />
                <div>
                  <div className="text-sm font-mono truncate">{appUrl}</div>
                  <div className="text-xs text-muted-foreground">Link do App</div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Message */}
          <div className="space-y-2">
            <Label>Mensagem</Label>
            <Textarea
              value={message || defaultMessage}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Digite a mensagem..."
              rows={8}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Variáveis: {'{nome}'}, {'{email}'}, {'{whatsapp}'}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMessage(defaultMessage)}
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              Usar mensagem padrão
            </Button>
          </div>

          {/* Interval */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Intervalo entre mensagens (segundos)
            </Label>
            <Input
              type="number"
              min={10}
              max={300}
              value={intervalSeconds}
              onChange={(e) => setIntervalSeconds(parseInt(e.target.value) || 30)}
            />
            <p className="text-xs text-muted-foreground">
              Tempo estimado: {Math.ceil((sellers.length * intervalSeconds) / 60)} minutos
            </p>
          </div>

          {/* Active Broadcast Progress */}
          {activeBroadcast && isSending && (
            <Card className="border-primary">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Enviando...
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Progress value={progress} className="h-2" />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <CheckCircle className="h-3 w-3 text-green-500" />
                    {activeBroadcast.sent_count} enviados
                  </span>
                  <span className="flex items-center gap-1">
                    <XCircle className="h-3 w-3 text-red-500" />
                    {activeBroadcast.failed_count} falhas
                  </span>
                  <span>
                    {activeBroadcast.sent_count + activeBroadcast.failed_count} / {activeBroadcast.total_recipients}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recent Broadcasts */}
          {broadcasts.length > 0 && (
            <div className="space-y-2">
              <Label>Broadcasts Recentes</Label>
              <ScrollArea className="h-32 border rounded-lg">
                <div className="p-2 space-y-2">
                  {broadcasts.slice(0, 5).map((broadcast) => (
                    <div
                      key={broadcast.id}
                      className="flex items-center justify-between p-2 bg-muted/30 rounded text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant={
                          broadcast.status === 'completed' ? 'default' :
                          broadcast.status === 'sending' ? 'secondary' :
                          'outline'
                        }>
                          {broadcast.status === 'completed' ? 'Concluído' :
                           broadcast.status === 'sending' ? 'Enviando' :
                           broadcast.status === 'paused' ? 'Pausado' : 'Pendente'}
                        </Badge>
                        <span className="text-muted-foreground">
                          {broadcast.sent_count}/{broadcast.total_recipients}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {new Date(broadcast.created_at).toLocaleDateString('pt-BR')}
                        </span>
                        {broadcast.status === 'paused' && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => handleResumeBroadcast(broadcast.id)}
                          >
                            <Play className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {isSending ? (
            <Button variant="destructive" onClick={handleStopBroadcast}>
              <Pause className="h-4 w-4 mr-2" />
              Pausar
            </Button>
          ) : (
            <Button
              onClick={handleStartBroadcast}
              disabled={sellers.length === 0 || createBroadcastMutation.isPending}
            >
              {createBroadcastMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Iniciar Broadcast ({sellers.length} revendedores)
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
