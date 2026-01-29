import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Settings, Eye, EyeOff, Save, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface AsaasConfig {
  asaas_api_key: string;
  asaas_environment: string;
  asaas_webhook_token: string;
}

export function AsaasSettings() {
  const queryClient = useQueryClient();
  const [showApiKey, setShowApiKey] = useState(false);
  const [showWebhookToken, setShowWebhookToken] = useState(false);
  const [localConfig, setLocalConfig] = useState<AsaasConfig>({
    asaas_api_key: '',
    asaas_environment: 'sandbox',
    asaas_webhook_token: ''
  });

  const { data: config, isLoading } = useQuery({
    queryKey: ['asaas-config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('key, value')
        .in('key', ['asaas_api_key', 'asaas_environment', 'asaas_webhook_token']);

      if (error) throw error;

      const configMap: AsaasConfig = {
        asaas_api_key: '',
        asaas_environment: 'sandbox',
        asaas_webhook_token: ''
      };

      data?.forEach(item => {
        if (item.key in configMap) {
          configMap[item.key as keyof AsaasConfig] = item.value;
        }
      });

      setLocalConfig(configMap);
      return configMap;
    }
  });

  const saveMutation = useMutation({
    mutationFn: async (newConfig: AsaasConfig) => {
      const updates = Object.entries(newConfig).map(([key, value]) => ({
        key,
        value,
        updated_at: new Date().toISOString()
      }));

      for (const update of updates) {
        const { error } = await supabase
          .from('app_settings')
          .update({ value: update.value, updated_at: update.updated_at })
          .eq('key', update.key);

        if (error) throw error;
      }

      return newConfig;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asaas-config'] });
      toast.success('Configurações ASAAS salvas com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao salvar: ${error.message}`);
    }
  });

  const testConnectionMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('asaas-test-connection');
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data?.success) {
        toast.success('Conexão com ASAAS estabelecida com sucesso!');
      } else {
        toast.error(data?.error || 'Falha na conexão com ASAAS');
      }
    },
    onError: (error: Error) => {
      toast.error(`Erro ao testar conexão: ${error.message}`);
    }
  });

  const handleSave = () => {
    saveMutation.mutate(localConfig);
  };

  const hasApiKey = Boolean(localConfig.asaas_api_key);

  if (isLoading) {
    return (
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Settings className="h-5 w-5 text-blue-500" />
          Configurações ASAAS
        </CardTitle>
        <CardDescription className="text-slate-400">
          Configure a integração com o gateway de pagamentos ASAAS
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Ambiente */}
        <div className="space-y-2">
          <Label className="text-slate-300">Ambiente</Label>
          <Select
            value={localConfig.asaas_environment}
            onValueChange={(value) => setLocalConfig(prev => ({ ...prev, asaas_environment: value }))}
          >
            <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sandbox">Sandbox (Testes)</SelectItem>
              <SelectItem value="production">Produção</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-slate-500">
            Use Sandbox para testes. Mude para Produção apenas quando estiver pronto.
          </p>
        </div>

        {/* API Key */}
        <div className="space-y-2">
          <Label className="text-slate-300">Chave de API</Label>
          <div className="relative">
            <Input
              type={showApiKey ? 'text' : 'password'}
              value={localConfig.asaas_api_key}
              onChange={(e) => setLocalConfig(prev => ({ ...prev, asaas_api_key: e.target.value }))}
              placeholder="$aact_..."
              className="bg-slate-700 border-slate-600 text-white pr-10"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 p-0"
              onClick={() => setShowApiKey(!showApiKey)}
            >
              {showApiKey ? (
                <EyeOff className="h-4 w-4 text-slate-400" />
              ) : (
                <Eye className="h-4 w-4 text-slate-400" />
              )}
            </Button>
          </div>
          <p className="text-xs text-slate-500">
            Encontre sua API Key em: ASAAS → Configurações → Integrações → API
          </p>
        </div>

        {/* Webhook Token */}
        <div className="space-y-2">
          <Label className="text-slate-300">Token do Webhook (opcional)</Label>
          <div className="relative">
            <Input
              type={showWebhookToken ? 'text' : 'password'}
              value={localConfig.asaas_webhook_token}
              onChange={(e) => setLocalConfig(prev => ({ ...prev, asaas_webhook_token: e.target.value }))}
              placeholder="Token para validar webhooks"
              className="bg-slate-700 border-slate-600 text-white pr-10"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 p-0"
              onClick={() => setShowWebhookToken(!showWebhookToken)}
            >
              {showWebhookToken ? (
                <EyeOff className="h-4 w-4 text-slate-400" />
              ) : (
                <Eye className="h-4 w-4 text-slate-400" />
              )}
            </Button>
          </div>
        </div>

        {/* Status */}
        <div className="flex items-center gap-2 p-3 rounded-lg bg-slate-700/30">
          {hasApiKey ? (
            <>
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <span className="text-sm text-green-400">API Key configurada</span>
            </>
          ) : (
            <>
              <AlertCircle className="h-5 w-5 text-yellow-500" />
              <span className="text-sm text-yellow-400">API Key não configurada</span>
            </>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="flex-1"
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Salvar Configurações
          </Button>
          <Button
            variant="outline"
            onClick={() => testConnectionMutation.mutate()}
            disabled={!hasApiKey || testConnectionMutation.isPending}
            className="border-slate-600 hover:bg-slate-700"
          >
            {testConnectionMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              'Testar Conexão'
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
