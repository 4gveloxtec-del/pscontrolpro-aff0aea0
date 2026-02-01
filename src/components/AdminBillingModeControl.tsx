import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Settings, AlertTriangle, Bell, Bot } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface AdminBillingModeControlProps {
  clientId: string;
  clientName: string;
  currentMode: 'manual' | 'automatic' | null;
  onModeChanged?: () => void;
}

export function AdminBillingModeControl({
  clientId,
  clientName,
  currentMode,
  onModeChanged,
}: AdminBillingModeControlProps) {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [confirmSwitch, setConfirmSwitch] = useState<'manual' | 'automatic' | null>(null);

  const effectiveMode = currentMode || 'manual';

  const switchModeMutation = useMutation({
    mutationFn: async (newMode: 'manual' | 'automatic') => {
      // If switching to manual, cancel pending reminders
      if (newMode === 'manual') {
        const { data, error: cancelError } = await supabase.rpc('cancel_client_pending_reminders', {
          p_client_id: clientId,
        });
        if (cancelError) {
          console.warn('Error cancelling reminders:', cancelError);
        } else if (data && data > 0) {
          toast.info(`${data} lembrete(s) pendente(s) cancelado(s)`);
        }
      }

      // Update the client's billing mode
      const { error } = await supabase
        .from('clients')
        .update({ billing_mode: newMode })
        .eq('id', clientId);

      if (error) throw error;
      return newMode;
    },
    onSuccess: (newMode) => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['billing-reminders'] });
      toast.success(
        newMode === 'manual'
          ? 'Modo alterado para Manual - Notificações push ativadas'
          : 'Modo alterado para Automático - Cobrança via WhatsApp'
      );
      setConfirmSwitch(null);
      setIsOpen(false);
      onModeChanged?.();
    },
    onError: (error: Error) => {
      toast.error(`Erro ao alterar modo: ${error.message}`);
    },
  });

  const handleModeToggle = (checked: boolean) => {
    const newMode = checked ? 'automatic' : 'manual';
    setConfirmSwitch(newMode);
  };

  const confirmModeChange = () => {
    if (confirmSwitch) {
      switchModeMutation.mutate(confirmSwitch);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() => setIsOpen(true)}
      >
        <Settings className="h-4 w-4" />
        Modo Cobrança
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="w-[95vw] sm:max-w-md max-h-[85vh] overflow-y-auto p-3 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg">Modo de Cobrança</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              Configure como a cobrança será feita para <strong>{clientName}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 sm:space-y-6 py-3 sm:py-4">
            {/* Current Mode Display */}
            <div className="flex items-center justify-between p-3 sm:p-4 rounded-lg bg-muted/50 gap-2">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                {effectiveMode === 'manual' ? (
                  <Bell className="h-4 w-4 sm:h-5 sm:w-5 text-blue-500 flex-shrink-0" />
                ) : (
                  <Bot className="h-4 w-4 sm:h-5 sm:w-5 text-success flex-shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="font-medium text-sm sm:text-base truncate">
                    {effectiveMode === 'manual' ? 'Modo Manual' : 'Modo Automático'}
                  </p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">
                    {effectiveMode === 'manual'
                      ? 'Notificações push quando vencer'
                      : 'Lembretes via WhatsApp API'}
                  </p>
                </div>
              </div>
              <Badge variant={effectiveMode === 'manual' ? 'secondary' : 'default'} className="flex-shrink-0 text-xs">
                {effectiveMode === 'manual' ? 'Manual' : 'Auto'}
              </Badge>
            </div>

            {/* Toggle Switch */}
            <div className="flex items-center justify-between gap-2">
              <div className="space-y-0.5 min-w-0">
                <Label htmlFor="billing-mode" className="text-sm sm:text-base">
                  Cobrança Automática
                </Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Ativar lembretes via WhatsApp
                </p>
              </div>
              <Switch
                id="billing-mode"
                checked={effectiveMode === 'automatic'}
                onCheckedChange={handleModeToggle}
                disabled={switchModeMutation.isPending}
              />
            </div>

            {/* Mode Explanation */}
            <div className="space-y-2 sm:space-y-3">
              <div className="flex items-start gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
                <Bell className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                <div className="text-xs sm:text-sm">
                  <p className="font-medium text-blue-500">Manual</p>
                  <p className="text-muted-foreground">
                    Você recebe notificações push quando o cliente vencer. Nenhuma mensagem automática é enviada.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg bg-success/5 border border-success/20">
                <Bot className="h-4 w-4 text-success mt-0.5 flex-shrink-0" />
                <div className="text-xs sm:text-sm">
                  <p className="font-medium text-success">Automático</p>
                  <p className="text-muted-foreground">
                    Lembretes são enviados via WhatsApp nas datas agendadas. Sem notificações push.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setIsOpen(false)} className="w-full sm:w-auto">
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog */}
      <AlertDialog open={!!confirmSwitch} onOpenChange={() => setConfirmSwitch(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Confirmar Alteração de Modo
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              {confirmSwitch === 'manual' ? (
                <>
                  <p>Ao mudar para <strong>Modo Manual</strong>:</p>
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    <li>Todos os lembretes pendentes serão <strong>cancelados</strong></li>
                    <li>Você receberá <strong>notificações push</strong> quando vencer</li>
                    <li>Nenhuma mensagem automática será enviada</li>
                  </ul>
                </>
              ) : (
                <>
                  <p>Ao mudar para <strong>Modo Automático</strong>:</p>
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    <li>Notificações push serão <strong>desativadas</strong></li>
                    <li>Você poderá criar <strong>lembretes via WhatsApp</strong></li>
                    <li>Cobranças serão enviadas nas datas agendadas</li>
                  </ul>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmModeChange}
              disabled={switchModeMutation.isPending}
            >
              {switchModeMutation.isPending ? 'Alterando...' : 'Confirmar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
