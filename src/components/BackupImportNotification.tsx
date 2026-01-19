import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, CheckCircle, AlertTriangle, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface BackupImportNotificationProps {
  jobId: string;
  onComplete?: (result: { restored: Record<string, number>; errors: string[] }) => void;
  onClose?: () => void;
}

interface JobData {
  status: string;
  progress: number;
  processed_items: number;
  total_items: number;
  restored: Record<string, number> | null;
  errors: string[] | null;
  warnings: string[] | null;
}

export function BackupImportNotification({ jobId, onComplete, onClose }: BackupImportNotificationProps) {
  const [job, setJob] = useState<JobData | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);
  const [isVisible, setIsVisible] = useState(true);

  // Fetch initial job data
  useEffect(() => {
    const fetchJob = async () => {
      const { data } = await supabase
        .from('backup_import_jobs')
        .select('status, progress, processed_items, total_items, restored, errors, warnings')
        .eq('id', jobId)
        .single();
      
      if (data) {
        setJob(data as JobData);
      }
    };
    fetchJob();
  }, [jobId]);

  // Subscribe to realtime updates
  useEffect(() => {
    const channel = supabase
      .channel(`backup-notification:${jobId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'backup_import_jobs',
          filter: `id=eq.${jobId}`,
        },
        (payload) => {
          const row = payload.new as any;
          if (!row) return;
          
          setJob({
            status: row.status || 'processing',
            progress: row.progress || 0,
            processed_items: row.processed_items || 0,
            total_items: row.total_items || 0,
            restored: row.restored || null,
            errors: row.errors || null,
            warnings: row.warnings || null,
          });

          // Check if completed
          if (row.status === 'completed' || row.status === 'failed') {
            if (row.status === 'completed') {
              const totalRestored = Object.values(row.restored || {}).reduce((a: number, b: unknown) => a + (b as number), 0);
              toast.success(`Backup importado! ${totalRestored} itens restaurados.`);
            } else if (row.status === 'failed') {
              toast.error(row.errors?.[0] || 'Falha na importação');
            }
            
            onComplete?.({
              restored: row.restored || {},
              errors: row.errors || [],
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [jobId, onComplete]);

  const handleDismiss = () => {
    setIsVisible(false);
    onClose?.();
  };

  const handleMinimize = () => {
    setIsExpanded(false);
  };

  if (!isVisible) return null;

  const isProcessing = job?.status !== 'completed' && job?.status !== 'failed';
  const isCompleted = job?.status === 'completed';
  const isFailed = job?.status === 'failed';

  const getStatusLabel = () => {
    switch (job?.status) {
      case 'queued': return 'Na fila...';
      case 'validating': return 'Validando...';
      case 'cleaning': return 'Limpando dados...';
      case 'processing': return 'Importando...';
      case 'completed': return 'Concluído!';
      case 'failed': return 'Falhou';
      default: return 'Processando...';
    }
  };

  // Get last restored items (real-time feedback)
  const restoredItems = job?.restored || {};
  const restoredCount = Object.values(restoredItems).reduce((a, b) => a + b, 0);

  return (
    <div className={cn(
      "fixed bottom-20 left-4 z-50 md:bottom-6 md:left-6",
      "bg-card border border-border rounded-xl shadow-2xl overflow-hidden",
      "transition-all duration-300",
      isExpanded ? "w-80" : "w-auto"
    )}>
      {/* Header */}
      <div className={cn(
        "px-4 py-3 flex items-center gap-3",
        isCompleted && "bg-green-500/10",
        isFailed && "bg-destructive/10",
        isProcessing && "bg-primary/10"
      )}>
        {isProcessing ? (
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        ) : isCompleted ? (
          <CheckCircle className="h-5 w-5 text-green-500" />
        ) : (
          <AlertTriangle className="h-5 w-5 text-destructive" />
        )}
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">Importação de Backup</span>
            {isProcessing && (
              <Badge variant="secondary" className="text-xs">
                {job?.progress || 0}%
              </Badge>
            )}
          </div>
        </div>

        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </Button>
          {(isCompleted || isFailed) && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleDismiss}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="px-4 py-3 space-y-3">
          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{getStatusLabel()}</span>
              <span>{job?.processed_items || 0} / {job?.total_items || 0}</span>
            </div>
            <Progress value={job?.progress || 0} className="h-2" />
          </div>

          {/* Real-time restored items */}
          {restoredCount > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium">Restaurados em tempo real:</p>
              <div className="flex flex-wrap gap-1">
                {Object.entries(restoredItems).slice(0, 8).map(([key, count]) => (
                  <Badge key={key} variant="outline" className="text-xs">
                    {key}: {count}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Errors preview */}
          {(job?.errors?.length || 0) > 0 && (
            <div className="p-2 bg-destructive/10 rounded-lg">
              <p className="text-xs text-destructive font-medium">
                {job?.errors?.length} erro(s)
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {job?.errors?.[0]}
              </p>
            </div>
          )}

          {/* Final result */}
          {isCompleted && (
            <div className="p-2 bg-green-500/10 rounded-lg">
              <p className="text-xs text-green-600 font-medium">
                ✓ {restoredCount} itens restaurados com sucesso!
              </p>
              <p className="text-xs text-muted-foreground">
                Seus dados já estão disponíveis no app.
              </p>
            </div>
          )}

          {isFailed && (
            <Button variant="outline" size="sm" className="w-full" onClick={handleDismiss}>
              Fechar
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
