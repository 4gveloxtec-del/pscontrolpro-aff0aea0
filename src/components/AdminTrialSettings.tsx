import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Save, Calendar, Clock, MessageSquare, Info, DollarSign, Zap, Settings2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface AdminTrialSettingsProps {
  onBack: () => void;
}

export function AdminTrialSettings({ onBack }: AdminTrialSettingsProps) {
  const queryClient = useQueryClient();
  
  // Tab state - controlled to persist selection after saves
  const [activeTab, setActiveTab] = useState('plans');
  
  // Trial settings
  const [trialDays, setTrialDays] = useState('5');
  const [trialApiEnabled, setTrialApiEnabled] = useState(false);
  const [trialApiHours, setTrialApiHours] = useState('24');
  
  // Plan prices
  const [manualPlanPrice, setManualPlanPrice] = useState('20');
  const [automaticPlanPrice, setAutomaticPlanPrice] = useState('35');

  // Fetch current settings
  const { data: settings, isLoading, isError } = useQuery({
    queryKey: ['admin-central-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('key, value')
        .in('key', [
          'seller_trial_days', 
          'trial_api_enabled', 
          'trial_api_hours',
          'manual_plan_price',
          'automatic_plan_price'
        ]);
      if (error) throw error;
      return data || [];
    },
  });

  // Update form when settings load
  useEffect(() => {
    if (settings) {
      const days = settings.find(s => s.key === 'seller_trial_days')?.value;
      if (days) setTrialDays(days);

      const apiEnabled = settings.find(s => s.key === 'trial_api_enabled')?.value;
      setTrialApiEnabled(apiEnabled === 'true');

      const apiHours = settings.find(s => s.key === 'trial_api_hours')?.value;
      if (apiHours) setTrialApiHours(apiHours);
      
      const manualPrice = settings.find(s => s.key === 'manual_plan_price')?.value;
      if (manualPrice) setManualPlanPrice(manualPrice);
      
      const autoPrice = settings.find(s => s.key === 'automatic_plan_price')?.value;
      if (autoPrice) setAutomaticPlanPrice(autoPrice);
    }
  }, [settings]);

  // Save all settings
  const saveMutation = useMutation({
    mutationFn: async () => {
      const updates = [
        { key: 'seller_trial_days', value: trialDays, description: 'Dias de teste grátis para novos revendedores' },
        { key: 'trial_api_enabled', value: String(trialApiEnabled), description: 'API liberada durante teste' },
        { key: 'trial_api_hours', value: trialApiHours, description: 'Horas de uso da API durante teste' },
        { key: 'manual_plan_price', value: manualPlanPrice, description: 'Valor mensal do Plano Manual' },
        { key: 'automatic_plan_price', value: automaticPlanPrice, description: 'Valor mensal do Plano Automático' },
      ];

      for (const update of updates) {
        const { error } = await supabase
          .from('app_settings')
          .upsert(
            { 
              key: update.key, 
              value: update.value, 
              description: update.description,
              updated_at: new Date().toISOString() 
            },
            { onConflict: 'key' }
          );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-central-settings'] });
      queryClient.invalidateQueries({ queryKey: ['app-settings'] });
      queryClient.invalidateQueries({ queryKey: ['app-settings-landing'] });
      queryClient.invalidateQueries({ queryKey: ['trial-settings'] });
      toast.success('Configurações salvas com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao salvar: ${error.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <p className="text-destructive mb-2">Erro ao carregar configurações</p>
        <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in max-w-2xl mx-auto px-1 sm:px-0">
      <div className="flex items-center gap-2 sm:gap-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="h-8 px-2 sm:px-3">
          ← <span className="hidden xs:inline">Voltar</span>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg sm:text-xl font-bold truncate">Central de Configurações</h1>
          <p className="text-xs sm:text-sm text-muted-foreground truncate">Planos, preços e teste grátis</p>
        </div>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Alterações aqui são aplicadas <strong>imediatamente</strong> na landing page e em novos cadastros.
          Revendedores já cadastrados não são afetados retroativamente.
        </AlertDescription>
      </Alert>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 h-auto">
            <TabsTrigger value="plans" className="gap-1 sm:gap-2 py-2 px-2 sm:px-3 text-xs sm:text-sm">
              <DollarSign className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
              <span className="truncate">Planos</span>
            </TabsTrigger>
            <TabsTrigger value="trial" className="gap-1 sm:gap-2 py-2 px-2 sm:px-3 text-xs sm:text-sm">
              <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
              <span className="truncate">Teste Grátis</span>
            </TabsTrigger>
          </TabsList>

          {/* Plans Tab */}
          <TabsContent value="plans" className="space-y-4 mt-4">
            {/* Manual Plan */}
            <div className="bg-card rounded-xl border border-border p-4 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                  <Settings2 className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <h3 className="font-medium">Plano Manual</h3>
                  <p className="text-sm text-muted-foreground">Apenas gestão de clientes, envios via app externo</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="manual_price">Valor Mensal (R$)</Label>
                <Input
                  id="manual_price"
                  type="number"
                  value={manualPlanPrice}
                  onChange={(e) => setManualPlanPrice(e.target.value)}
                  placeholder="20"
                  min="0"
                  step="1"
                />
              </div>
            </div>

            {/* Automatic Plan */}
            <div className="bg-card rounded-xl border border-primary/30 p-4 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Zap className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-medium">Plano Automático</h3>
                  <p className="text-sm text-muted-foreground">Gestão + WhatsApp API + Chatbot + Automação</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="automatic_price">Valor Mensal (R$)</Label>
                <Input
                  id="automatic_price"
                  type="number"
                  value={automaticPlanPrice}
                  onChange={(e) => setAutomaticPlanPrice(e.target.value)}
                  placeholder="35"
                  min="0"
                  step="1"
                />
              </div>
            </div>
          </TabsContent>

          {/* Trial Tab */}
          <TabsContent value="trial" className="space-y-4 mt-4">
            {/* Trial Duration */}
            <div className="bg-card rounded-xl border border-border p-4 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Calendar className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-medium">Duração do Teste</h3>
                  <p className="text-sm text-muted-foreground">Período de teste para novos revendedores</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="trial_days">Dias de Teste Grátis</Label>
                <Input
                  id="trial_days"
                  type="number"
                  value={trialDays}
                  onChange={(e) => setTrialDays(e.target.value)}
                  placeholder="5"
                  min="1"
                  max="30"
                  step="1"
                />
                <p className="text-xs text-muted-foreground">
                  Novos revendedores terão {trialDays} dias de acesso gratuito ao sistema
                </p>
              </div>
            </div>

            {/* WhatsApp API During Trial */}
            <div className="bg-card rounded-xl border border-border p-4 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-success/10 flex items-center justify-center">
                  <MessageSquare className="h-5 w-5 text-success" />
                </div>
                <div>
                  <h3 className="font-medium">WhatsApp API no Teste</h3>
                  <p className="text-sm text-muted-foreground">Controle de uso da API durante o período de teste</p>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">Liberar API no Teste</p>
                  <p className="text-xs text-muted-foreground">
                    {trialApiEnabled 
                      ? 'Revendedores em teste podem usar a API por tempo limitado' 
                      : 'API bloqueada durante o teste grátis'}
                  </p>
                </div>
                <Switch
                  checked={trialApiEnabled}
                  onCheckedChange={setTrialApiEnabled}
                />
              </div>

              {trialApiEnabled && (
                <div className="space-y-2 pt-2 border-t border-border">
                  <Label htmlFor="trial_api_hours" className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    Horas de Uso da API
                  </Label>
                  <Input
                    id="trial_api_hours"
                    type="number"
                    value={trialApiHours}
                    onChange={(e) => setTrialApiHours(e.target.value)}
                    placeholder="24"
                    min="1"
                    max="168"
                    step="1"
                  />
                  <p className="text-xs text-muted-foreground">
                    Após {trialApiHours} horas de uso, a API será automaticamente bloqueada.
                  </p>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Summary */}
        <div className="bg-muted/50 rounded-xl p-4 space-y-2">
          <h4 className="font-medium text-sm">Resumo da Configuração</h4>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li>• Plano Manual: <strong>R$ {manualPlanPrice}/mês</strong></li>
            <li>• Plano Automático: <strong>R$ {automaticPlanPrice}/mês</strong></li>
            <li>• Teste grátis: <strong>{trialDays} dias</strong></li>
            <li>• WhatsApp API no teste: <strong>{trialApiEnabled ? `Liberada por ${trialApiHours}h` : 'Bloqueada'}</strong></li>
          </ul>
        </div>

        <Button 
          type="submit" 
          className="w-full" 
          disabled={saveMutation.isPending}
        >
          <Save className="h-4 w-4 mr-2" />
          {saveMutation.isPending ? 'Salvando...' : 'Salvar Todas as Configurações'}
        </Button>
      </form>
    </div>
  );
}
