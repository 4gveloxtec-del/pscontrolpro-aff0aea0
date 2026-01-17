import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { Server, Package, Users, ChevronRight, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  completed: boolean;
}

export function OnboardingTutorial() {
  const { profile, isSeller, isAdmin, user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [steps, setSteps] = useState<OnboardingStep[]>([
    {
      id: 'servidor',
      title: '1. Cadastrar Servidor',
      description: 'Adicione seu primeiro servidor para começar a gerenciar seus clientes.',
      icon: Server,
      href: '/servers',
      completed: false,
    },
    {
      id: 'planos',
      title: '2. Configurar Planos',
      description: 'Defina os valores dos planos IPTV/SSH ou crie novos planos personalizados.',
      icon: Package,
      href: '/plans',
      completed: false,
    },
    {
      id: 'clientes',
      title: '3. Adicionar Clientes',
      description: 'Cadastre seus primeiros clientes e comece a gerenciar suas assinaturas.',
      icon: Users,
      href: '/clients',
      completed: false,
    },
  ]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Only show for sellers who haven't completed the tutorial
    if (user && isSeller && !isAdmin && profile && profile.tutorial_visto === false) {
      checkOnboardingStatus();
    }
  }, [user, isSeller, isAdmin, profile]);

  const checkOnboardingStatus = async () => {
    if (!user) return;

    try {
      // Check if user has servers
      const { data: servers } = await supabase
        .from('servers')
        .select('id')
        .eq('seller_id', user.id)
        .limit(1);

      // Check if user has plans
      const { data: plans } = await supabase
        .from('plans')
        .select('id')
        .eq('seller_id', user.id)
        .limit(1);

      // Check if user has clients
      const { data: clients } = await supabase
        .from('clients')
        .select('id')
        .eq('seller_id', user.id)
        .limit(1);

      const hasServers = servers && servers.length > 0;
      const hasPlans = plans && plans.length > 0;
      const hasClients = clients && clients.length > 0;

      setSteps((prev) =>
        prev.map((step) => {
          if (step.id === 'servidor') return { ...step, completed: hasServers };
          if (step.id === 'planos') return { ...step, completed: hasPlans };
          if (step.id === 'clientes') return { ...step, completed: hasClients };
          return step;
        })
      );

      // If all steps completed, mark tutorial as done
      if (hasServers && hasPlans && hasClients) {
        await markTutorialComplete();
      } else {
        setOpen(true);
      }
    } catch (error) {
      console.error('Error checking onboarding status:', error);
    }
  };

  const markTutorialComplete = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const { error } = await supabase
        .from('profiles')
        .update({ tutorial_visto: true })
        .eq('id', user.id);

      if (error) throw error;
      setOpen(false);
      toast.success('Parabéns! Você completou a configuração inicial.');
    } catch (error) {
      console.error('Error marking tutorial complete:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStepClick = (step: OnboardingStep) => {
    const stepIndex = steps.findIndex((s) => s.id === step.id);
    
    // Check if previous steps are completed
    for (let i = 0; i < stepIndex; i++) {
      if (!steps[i].completed) {
        toast.error(`Complete primeiro: ${steps[i].title}`);
        return;
      }
    }

    setOpen(false);
    navigate(step.href);
  };

  const handleSkip = async () => {
    await markTutorialComplete();
  };

  const allCompleted = steps.every((s) => s.completed);

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader className="text-center pb-2">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center mb-3 shadow-lg shadow-primary/30">
            <Sparkles className="w-7 h-7 text-primary-foreground" />
          </div>
          <DialogTitle className="text-xl font-bold">Bem-vindo ao PSControl!</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Siga estes 3 passos para configurar seu sistema de gerenciamento de clientes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-4">
          {steps.map((step, index) => {
            const isLocked = index > 0 && !steps[index - 1].completed;
            const StepIcon = step.icon;

            return (
              <button
                key={step.id}
                onClick={() => handleStepClick(step)}
                disabled={isLocked}
                className={cn(
                  'w-full flex items-center gap-4 p-4 rounded-xl border transition-all duration-200 text-left',
                  step.completed
                    ? 'bg-success/10 border-success/30 text-foreground'
                    : isLocked
                    ? 'bg-muted/30 border-border/50 opacity-50 cursor-not-allowed'
                    : 'bg-card border-border hover:border-primary/50 hover:shadow-md cursor-pointer'
                )}
              >
                <div
                  className={cn(
                    'w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0',
                    step.completed
                      ? 'bg-success/20 text-success'
                      : isLocked
                      ? 'bg-muted text-muted-foreground'
                      : 'bg-primary/10 text-primary'
                  )}
                >
                  {step.completed ? (
                    <Checkbox checked disabled className="w-6 h-6" />
                  ) : (
                    <StepIcon className="w-6 h-6" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className={cn(
                      'font-semibold text-sm',
                      step.completed && 'line-through opacity-70'
                    )}
                  >
                    {step.title}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                    {step.description}
                  </p>
                </div>
                {!step.completed && !isLocked && (
                  <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                )}
              </button>
            );
          })}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          {allCompleted ? (
            <Button onClick={markTutorialComplete} disabled={loading} className="w-full">
              {loading ? 'Finalizando...' : 'Concluir Tutorial'}
            </Button>
          ) : (
            <Button
              variant="ghost"
              onClick={handleSkip}
              disabled={loading}
              className="w-full text-muted-foreground"
            >
              Pular tutorial (já sei usar)
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
