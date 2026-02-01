import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export function AdminWipeAllData() {
  const [open, setOpen] = useState(false);
  const [confirmCode, setConfirmCode] = useState('');
  const [step, setStep] = useState<'warning' | 'confirm'>('warning');
  const queryClient = useQueryClient();

  const wipeMutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Não autenticado');

      const response = await supabase.functions.invoke('wipe-all-data', {
        body: { confirmationCode: confirmCode }
      });

      if (response.error) {
        throw new Error(response.error.message || 'Erro ao apagar dados');
      }

      return response.data;
    },
    onSuccess: (data) => {
      toast.success('Todos os dados foram apagados com sucesso!', {
        description: `${data.results.sellers_deleted} revendedores e ${data.results.clients_deleted} clientes removidos.`
      });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
      queryClient.invalidateQueries({ queryKey: ['admin-recent-sellers'] });
      queryClient.invalidateQueries({ queryKey: ['sellers'] });
      setOpen(false);
      setStep('warning');
      setConfirmCode('');
    },
    onError: (error: Error) => {
      toast.error('Erro ao apagar dados', {
        description: error.message
      });
    }
  });

  const handleClose = () => {
    setOpen(false);
    setStep('warning');
    setConfirmCode('');
  };

  const handleProceed = () => {
    setStep('confirm');
  };

  const handleWipe = () => {
    if (confirmCode !== 'APAGAR-TUDO') {
      toast.error('Código de confirmação incorreto');
      return;
    }
    wipeMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={(value) => {
      if (!value) handleClose();
      else setOpen(true);
    }}>
      <DialogTrigger asChild>
        <Button variant="destructive" className="gap-2">
          <Trash2 className="h-4 w-4" />
          Apagar Tudo
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[95vw] sm:max-w-md p-3 sm:p-6">
        {step === 'warning' ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-500 text-base sm:text-lg">
                <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
                <span className="truncate">Atenção! Ação Irreversível</span>
              </DialogTitle>
              <DialogDescription className="pt-2 text-xs sm:text-sm">
                Esta ação irá apagar <strong>permanentemente</strong>:
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-3 py-3 sm:py-4">
              <Alert variant="destructive">
                <AlertDescription className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm">
                  <p>• <strong>Todos os clientes</strong> de todos os revendedores</p>
                  <p>• <strong>Todos os revendedores</strong> (exceto você)</p>
                  <p>• <strong>Dados relacionados:</strong> servidores, planos, templates, etc.</p>
                </AlertDescription>
              </Alert>
              
              <p className="text-xs sm:text-sm text-muted-foreground">
                Seu perfil de admin será preservado, mas seus clientes também serão removidos.
              </p>
            </div>

            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button variant="outline" onClick={handleClose} className="w-full sm:w-auto">
                Cancelar
              </Button>
              <Button variant="destructive" onClick={handleProceed} className="w-full sm:w-auto">
                Entendi, continuar
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-500 text-base sm:text-lg">
                <Trash2 className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
                <span className="truncate">Confirmar Exclusão Total</span>
              </DialogTitle>
              <DialogDescription className="text-xs sm:text-sm">
                Digite o código abaixo para confirmar a exclusão.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 sm:space-y-4 py-3 sm:py-4">
              <div className="space-y-2">
                <Label htmlFor="confirm-code" className="text-xs sm:text-sm">
                  Digite: <code className="bg-destructive/20 text-destructive px-1.5 sm:px-2 py-0.5 sm:py-1 rounded font-mono text-xs sm:text-sm">APAGAR-TUDO</code>
                </Label>
                <Input
                  id="confirm-code"
                  value={confirmCode}
                  onChange={(e) => setConfirmCode(e.target.value.toUpperCase())}
                  placeholder="Código de confirmação"
                  className="font-mono text-sm"
                />
              </div>
            </div>

            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button variant="outline" onClick={() => setStep('warning')} className="w-full sm:w-auto">
                Voltar
              </Button>
              <Button 
                variant="destructive" 
                onClick={handleWipe}
                disabled={confirmCode !== 'APAGAR-TUDO' || wipeMutation.isPending}
                className="w-full sm:w-auto"
              >
                {wipeMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 sm:mr-2 animate-spin" />
                    <span className="hidden xs:inline">Apagando...</span>
                    <span className="xs:hidden">...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4 mr-1 sm:mr-2" />
                    <span className="hidden xs:inline">Apagar Permanentemente</span>
                    <span className="xs:hidden">Apagar</span>
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
