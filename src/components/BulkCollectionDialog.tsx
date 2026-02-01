import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { Play, Pause, Square, Clock, CheckCircle2, XCircle, AlertCircle, Users, Loader2, MessageCircle, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

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

interface BulkJob {
  id: string;
  seller_id: string;
  status: 'pending' | 'processing' | 'completed' | 'paused' | 'cancelled';
  total_clients: number;
  processed_clients: number;
  success_count: number;
  error_count: number;
  interval_seconds: number;
  current_index: number;
  created_at: string;
  updated_at: string;
  last_error?: string;
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
  const queryClient = useQueryClient();
  const [intervalSeconds, setIntervalSeconds] = useState(15);

  // Clients with valid phone numbers
  const clientsWithPhone = clients.filter(c => c.phone && c.phone.replace(/\D/g, '').length >= 10);
  const clientsWithoutPhone = clients.filter(c => !c.phone || c.phone.replace(/\D/g, '').length < 10);

  // Fetch active job
  const { data: activeJob, refetch: refetchJob, isLoading: isLoadingJob } = useQuery({
    queryKey: ['bulk-job-active', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('bulk-collection-processor', {
        body: { action: 'get_active', seller_id: user!.id },
      });
      if (error) throw error;
      return data.job as BulkJob | null;
    },
    enabled: !!user?.id && open,
    refetchInterval: (query) => {
      const job = query.state.data as BulkJob | null;
      // Only poll if there's an active job
      if (job?.status === 'processing' || job?.status === 'pending') {
        return 2000; // Poll every 2 seconds
      }
      return false;
    },
  });

  // Subscribe to realtime updates
  useEffect(() => {
    if (!user?.id || !open) return;

    const channel = supabase
      .channel(`bulk-job-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bulk_collection_jobs',
          filter: `seller_id=eq.${user.id}`,
        },
        () => {
          refetchJob();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, open, refetchJob]);

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

  const canSendViaApi = sellerInstance?.is_connected && 
    !sellerInstance?.instance_blocked && 
    globalConfig?.is_active &&
    globalConfig?.api_url &&
    globalConfig?.api_token;

  // Start job mutation
  const startMutation = useMutation({
    mutationFn: async () => {
      const clientsData = clientsWithPhone.map(c => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        expiration_date: c.expiration_date,
        plan_name: c.plan_name,
        plan_price: c.plan_price,
        category: c.category,
        daysRemaining: c.daysRemaining,
      }));

      const { data, error } = await supabase.functions.invoke('bulk-collection-processor', {
        body: { 
          action: 'start', 
          seller_id: user!.id,
          clients: clientsData,
          interval_seconds: intervalSeconds,
          profile_data: {
            company_name: (profile as any)?.company_name,
            full_name: profile?.full_name,
            pix_key: (profile as any)?.pix_key,
          },
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success('Envio iniciado em segundo plano!', {
        description: 'Você pode fechar esta janela. O envio continuará automaticamente.',
      });
      refetchJob();
    },
    onError: (error: any) => {
      toast.error('Erro ao iniciar envio', { description: error.message });
    },
  });

  // Pause job mutation
  const pauseMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('bulk-collection-processor', {
        body: { action: 'pause', job_id: activeJob!.id, seller_id: user!.id },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.info('Envio pausado');
      refetchJob();
    },
  });

  // Resume job mutation
  const resumeMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('bulk-collection-processor', {
        body: { action: 'resume', job_id: activeJob!.id, seller_id: user!.id },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Envio retomado');
      refetchJob();
    },
  });

  // Cancel job mutation
  const cancelMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('bulk-collection-processor', {
        body: { action: 'cancel', job_id: activeJob!.id, seller_id: user!.id },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.info('Envio cancelado');
      refetchJob();
    },
  });

  const isProcessing = activeJob?.status === 'processing' || activeJob?.status === 'pending';
  const isPaused = activeJob?.status === 'paused';
  const isCompleted = activeJob?.status === 'completed';
  const isCancelled = activeJob?.status === 'cancelled';
  const hasActiveJob = isProcessing || isPaused;

  const progress = activeJob 
    ? (activeJob.processed_clients / activeJob.total_clients) * 100 
    : 0;

  const handleStartNew = useCallback(() => {
    startMutation.mutate();
  }, [startMutation]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-lg max-h-[85vh] overflow-y-auto p-3 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg flex-wrap">
            <MessageCircle className="h-4 w-4 sm:h-5 sm:w-5 text-primary flex-shrink-0" />
            <span>Cobrança em Massa</span>
            {hasActiveJob && (
              <Badge variant="outline" className="animate-pulse text-xs">
                {isProcessing ? 'Enviando...' : 'Pausado'}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            {hasActiveJob 
              ? `Job: ${activeJob.processed_clients}/${activeJob.total_clients} processados`
              : `Enviar cobrança para ${clientsWithPhone.length} clientes ${filterLabel}`
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 sm:space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
            <div className="bg-muted/50 rounded-lg p-2 sm:p-3 text-center">
              <Users className="h-4 w-4 sm:h-5 sm:w-5 mx-auto text-primary mb-1" />
              <p className="text-base sm:text-lg font-bold">
                {hasActiveJob ? activeJob.total_clients : clientsWithPhone.length}
              </p>
              <p className="text-[10px] sm:text-xs text-muted-foreground">
                {hasActiveJob ? 'Total' : 'Telefone'}
              </p>
            </div>
            <div className="bg-muted/50 rounded-lg p-2 sm:p-3 text-center">
              <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 mx-auto text-success mb-1" />
              <p className="text-base sm:text-lg font-bold">{activeJob?.success_count || 0}</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground">Enviados</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-2 sm:p-3 text-center">
              <XCircle className="h-4 w-4 sm:h-5 sm:w-5 mx-auto text-destructive mb-1" />
              <p className="text-base sm:text-lg font-bold">{activeJob?.error_count || 0}</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground">Erros</p>
            </div>
          </div>

          {/* Background processing notice */}
          {hasActiveJob && (
            <div className="flex items-center gap-2 p-3 bg-primary/10 border border-primary/30 rounded-lg text-sm">
              <RefreshCw className="h-4 w-4 text-primary shrink-0 animate-spin" />
              <span className="text-primary">
                O envio continua em segundo plano mesmo se você fechar esta janela ou sair da página!
              </span>
            </div>
          )}

          {/* Clients without phone warning */}
          {!hasActiveJob && clientsWithoutPhone.length > 0 && (
            <div className="flex items-center gap-2 p-2 bg-warning/10 border border-warning/30 rounded-lg text-sm">
              <AlertCircle className="h-4 w-4 text-warning shrink-0" />
              <span className="text-warning">
                {clientsWithoutPhone.length} cliente{clientsWithoutPhone.length !== 1 ? 's' : ''} sem telefone válido
              </span>
            </div>
          )}

          {/* API Status */}
          {!hasActiveJob && (
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
          )}

          {/* Interval config - only show when no active job */}
          {!hasActiveJob && (
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
          {hasActiveJob && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Progresso</span>
                <span className="font-medium">
                  {activeJob.processed_clients} / {activeJob.total_clients}
                </span>
              </div>
              <Progress value={progress} className="h-2" />
              
              {isProcessing && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Enviando mensagens... (intervalo: {activeJob.interval_seconds}s)
                </div>
              )}
            </div>
          )}

          {/* Completed/Cancelled status */}
          {(isCompleted || isCancelled) && activeJob && (
            <div className={cn(
              "p-3 rounded-lg text-sm",
              isCompleted ? "bg-success/10 border border-success/30" : "bg-muted/50 border border-muted"
            )}>
              <p className="font-medium">
                {isCompleted ? '✅ Envio concluído!' : '⏹ Envio cancelado'}
              </p>
              <p className="text-muted-foreground mt-1">
                {activeJob.success_count} mensagens enviadas, {activeJob.error_count} erros
              </p>
              {activeJob.last_error && (
                <p className="text-destructive mt-1 text-xs">{activeJob.last_error}</p>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {/* No active job - show start button */}
          {!hasActiveJob && !isCompleted && !isCancelled && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={handleStartNew} 
                disabled={!canSendViaApi || clientsWithPhone.length === 0 || startMutation.isPending}
                className="gap-2"
              >
                {startMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                Iniciar Envio
              </Button>
            </>
          )}
          
          {/* Processing - show pause/cancel */}
          {isProcessing && (
            <>
              <Button 
                variant="outline" 
                onClick={() => pauseMutation.mutate()} 
                disabled={pauseMutation.isPending}
                className="gap-2"
              >
                <Pause className="h-4 w-4" />
                Pausar
              </Button>
              <Button 
                variant="destructive" 
                onClick={() => cancelMutation.mutate()}
                disabled={cancelMutation.isPending}
                className="gap-2"
              >
                <Square className="h-4 w-4" />
                Cancelar
              </Button>
            </>
          )}
          
          {/* Paused - show resume/stop */}
          {isPaused && (
            <>
              <Button 
                variant="outline" 
                onClick={() => cancelMutation.mutate()}
                disabled={cancelMutation.isPending}
                className="gap-2"
              >
                <Square className="h-4 w-4" />
                Parar
              </Button>
              <Button 
                onClick={() => resumeMutation.mutate()}
                disabled={resumeMutation.isPending}
                className="gap-2"
              >
                <Play className="h-4 w-4" />
                Continuar
              </Button>
            </>
          )}

          {/* Completed/Cancelled - show close and new */}
          {(isCompleted || isCancelled) && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Fechar
              </Button>
              <Button 
                onClick={handleStartNew} 
                disabled={!canSendViaApi || clientsWithPhone.length === 0 || startMutation.isPending}
                className="gap-2"
              >
                {startMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                Novo Envio
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
