import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useWhatsAppConfig } from '@/hooks/useWhatsAppConfig';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { 
  Wifi, 
  WifiOff, 
  Save, 
  RefreshCw, 
  Eye,
  EyeOff,
  Loader2,
  Send,
  Zap,
  Play,
  Database,
  AlertCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';

export function WhatsAppApiConfig() {
  const { user, isAdmin } = useAuth();
  const { 
    config, 
    isLoading, 
    error: configError, 
    saveConfig, 
    updateConnectionStatus,
    refetch 
  } = useWhatsAppConfig();
  
  const [showToken, setShowToken] = useState(false);
  const [isCheckingConnection, setIsCheckingConnection] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRunningAutomation, setIsRunningAutomation] = useState(false);
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [formData, setFormData] = useState({
    api_url: '',
    api_token: '',
    instance_name: '',
    auto_send_enabled: false,
    is_connected: false,
  });

  // Load config into form
  useEffect(() => {
    if (config) {
      setFormData({
        api_url: config.api_url || '',
        api_token: config.api_token || '',
        instance_name: config.instance_name || '',
        auto_send_enabled: config.auto_send_enabled || false,
        is_connected: config.is_connected || false,
      });
    }
  }, [config]);

  // Setup tables
  const handleSetup = async () => {
    setIsSettingUp(true);
    try {
      const { data, error } = await supabase.functions.invoke('setup-whatsapp-automation');
      
      if (error) throw error;
      
      toast.success('Setup executado! Atualizando...');
      await refetch();
    } catch (error: any) {
      toast.error('Erro no setup: ' + error.message);
    } finally {
      setIsSettingUp(false);
    }
  };

  // Save config
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const result = await saveConfig({
        api_url: formData.api_url,
        api_token: formData.api_token,
        instance_name: formData.instance_name,
        auto_send_enabled: formData.auto_send_enabled,
        is_connected: formData.is_connected,
      });

      if (result.error) {
        toast.error('Erro ao salvar: ' + result.error);
      } else {
        toast.success('Configuração salva no banco de dados!');
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Check connection
  const checkConnection = async () => {
    if (!formData.api_url || !formData.api_token || !formData.instance_name) {
      toast.error('Preencha todos os campos da API');
      return;
    }

    setIsCheckingConnection(true);
    try {
      const { data, error } = await supabase.functions.invoke('evolution-api', {
        body: {
          action: 'check_connection',
          userId: user?.id,
          config: {
            api_url: formData.api_url,
            api_token: formData.api_token,
            instance_name: formData.instance_name,
          },
        },
      });

      if (error) throw error;

      if (data.connected) {
        toast.success('WhatsApp conectado!');
        setFormData(prev => ({ ...prev, is_connected: true }));
        await updateConnectionStatus(true);
      } else {
        toast.error('WhatsApp não conectado.');
        setFormData(prev => ({ ...prev, is_connected: false }));
        await updateConnectionStatus(false);
      }
    } catch (error: any) {
      toast.error('Erro: ' + error.message);
    } finally {
      setIsCheckingConnection(false);
    }
  };

  // Run automation manually
  const runAutomation = async () => {
    if (!formData.is_connected) {
      toast.error('Conecte o WhatsApp primeiro');
      return;
    }

    setIsRunningAutomation(true);
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-automation');

      if (error) throw error;

      if (data.sent > 0) {
        toast.success(`${data.sent} mensagem(ns) enviada(s)!`);
      } else {
        toast.info(data.message || 'Nenhum cliente para notificar hoje');
      }
    } catch (error: any) {
      toast.error('Erro: ' + error.message);
    } finally {
      setIsRunningAutomation(false);
    }
  };

  // Test message
  const sendTestMessage = async () => {
    const phone = prompt('Digite o número para teste (com DDD):');
    if (!phone) return;

    try {
      const { data, error } = await supabase.functions.invoke('evolution-api', {
        body: {
          action: 'send_message',
          config: formData,
          phone,
          message: '✅ Mensagem de teste do sistema!',
        },
      });

      if (error) throw error;
      if (data.success) {
        toast.success('Mensagem enviada!');
      } else {
        toast.error('Erro: ' + (data.error || 'Falha'));
      }
    } catch (error: any) {
      toast.error('Erro: ' + error.message);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Show setup button if table doesn't exist
  if (configError?.includes('não existe') || configError?.includes('42P01')) {
    return (
      <div className="space-y-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            As tabelas de automação WhatsApp não existem. Execute o setup para criá-las.
          </AlertDescription>
        </Alert>
        
        <Button onClick={handleSetup} disabled={isSettingUp} className="w-full">
          {isSettingUp ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Database className="h-4 w-4 mr-2" />
          )}
          Executar Setup das Tabelas
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 max-w-full overflow-hidden">
      {/* Connection Status */}
      <div className={cn(
        "p-3 sm:p-4 rounded-lg border flex flex-col xs:flex-row items-start xs:items-center gap-3 xs:gap-4",
        formData.is_connected 
          ? "bg-success/10 border-success/30" 
          : "bg-destructive/10 border-destructive/30"
      )}>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className={cn(
            "w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center flex-shrink-0",
            formData.is_connected ? "bg-success/20" : "bg-destructive/20"
          )}>
            {formData.is_connected ? (
              <Wifi className="h-5 w-5 sm:h-6 sm:w-6 text-success" />
            ) : (
              <WifiOff className="h-5 w-5 sm:h-6 sm:w-6 text-destructive" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-sm sm:text-base truncate">
              {formData.is_connected ? 'WhatsApp Conectado' : 'WhatsApp Desconectado'}
            </p>
            <p className="text-xs sm:text-sm text-muted-foreground truncate">
              {formData.is_connected 
                ? 'Mensagens automáticas ativas' 
                : 'Configure a API para ativar'}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={checkConnection}
          disabled={isCheckingConnection}
          className="w-full xs:w-auto"
        >
          {isCheckingConnection ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2 xs:mr-0" />
          )}
          <span className="xs:hidden">Verificar Conexão</span>
        </Button>
      </div>

      {/* Database Status Badge */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Database className="h-4 w-4" />
        <span>Dados salvos no banco de dados Supabase</span>
      </div>

      {/* Form */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>URL da API Evolution</Label>
          <Input
            type="url"
            value={formData.api_url}
            onChange={(e) => setFormData({ ...formData, api_url: e.target.value })}
            placeholder="https://api.evolution.exemplo.com"
          />
        </div>

        <div className="space-y-2">
          <Label>Token da API</Label>
          <div className="relative">
            <Input
              type={showToken ? 'text' : 'password'}
              value={formData.api_token}
              onChange={(e) => setFormData({ ...formData, api_token: e.target.value })}
              placeholder="Seu token"
              className="pr-10"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-0 top-0 h-full px-3"
              onClick={() => setShowToken(!showToken)}
            >
              {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Nome da Instância</Label>
          <Input
            value={formData.instance_name}
            onChange={(e) => setFormData({ ...formData, instance_name: e.target.value })}
            placeholder="minha-instancia"
          />
        </div>

        <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border">
          <div>
            <Label>Envio Automático</Label>
            <p className="text-sm text-muted-foreground">Enviar mensagens automaticamente</p>
          </div>
          <Switch
            checked={formData.auto_send_enabled}
            onCheckedChange={(checked) => setFormData({ ...formData, auto_send_enabled: checked })}
          />
        </div>

        <div className="flex flex-col xs:flex-row gap-2">
          <Button className="flex-1 h-9 sm:h-10" onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Salvar
          </Button>
          {formData.is_connected && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={sendTestMessage} className="flex-1 xs:flex-initial h-9 sm:h-10">
                <Send className="h-4 w-4 mr-1 sm:mr-2" />
                <span className="hidden xs:inline">Testar</span>
                <span className="xs:hidden">Test</span>
              </Button>
              <Button variant="secondary" onClick={runAutomation} disabled={isRunningAutomation} className="flex-1 xs:flex-initial h-9 sm:h-10">
                {isRunningAutomation ? (
                  <Loader2 className="h-4 w-4 mr-1 sm:mr-2 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-1 sm:mr-2" />
                )}
                <span className="hidden xs:inline">Executar</span>
                <span className="xs:hidden">Run</span>
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="p-4 rounded-lg bg-primary/5 border border-primary/20 space-y-2">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          <span className="font-medium text-sm">Sobre a Automação</span>
        </div>
        <ul className="text-sm text-muted-foreground space-y-1">
          {isAdmin ? (
            <>
              <li>• Envia lembretes para revendedores 3 dias antes do vencimento</li>
              <li>• Envia aviso no dia do vencimento do plano</li>
            </>
          ) : (
            <>
              <li>• Apps Pagos: notifica 30 dias, 3 dias e no vencimento</li>
              <li>• IPTV/Planos: notifica 3 dias e no vencimento</li>
              <li>• Cada mensagem é enviada apenas uma vez por ciclo</li>
              <li>• Histórico salvo no banco de dados</li>
            </>
          )}
        </ul>
      </div>
    </div>
  );
}
