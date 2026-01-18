import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useWhatsAppSellerInstance } from '@/hooks/useWhatsAppSellerInstance';
import { useWhatsAppGlobalConfig } from '@/hooks/useWhatsAppGlobalConfig';
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
  Loader2,
  Send,
  Play,
  AlertCircle,
  QrCode,
  PowerOff,
  Ban,
  CreditCard,
  Lock
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';

export function WhatsAppSellerConfig() {
  const { user, profile, isAdmin } = useAuth();
  const { 
    instance, 
    isLoading, 
    error: instanceError, 
    isBlocked,
    blockedReason,
    saveInstance, 
    updateConnectionStatus,
    refetch 
  } = useWhatsAppSellerInstance();

  const { config: globalConfig, isApiActive, isLoading: isLoadingConfig } = useWhatsAppGlobalConfig();
  
  const [isCheckingConnection, setIsCheckingConnection] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRunningAutomation, setIsRunningAutomation] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [isLoadingQr, setIsLoadingQr] = useState(false);
  const [formData, setFormData] = useState({
    instance_name: '',
    auto_send_enabled: false,
    is_connected: false,
  });

  // Check if user has a paid plan (not in free trial)
  const hasPaidPlan = (() => {
    if (isAdmin) return true; // Admins always have access
    if (!profile) return false;
    
    // is_permanent = true means they have permanent access
    if (profile.is_permanent) return true;
    
    // subscription_expires_at set and not expired means paid plan
    if (profile.subscription_expires_at) {
      const expiresAt = new Date(profile.subscription_expires_at);
      return expiresAt > new Date();
    }
    
    return false;
  })();

  // Load instance into form
  useEffect(() => {
    if (instance) {
      setFormData({
        instance_name: instance.instance_name || '',
        auto_send_enabled: instance.auto_send_enabled || false,
        is_connected: instance.is_connected || false,
      });
    }
  }, [instance]);

  // Save instance config
  const handleSave = async () => {
    if (!formData.instance_name) {
      toast.error('Digite o nome da sua instância');
      return;
    }

    setIsSaving(true);
    try {
      const result = await saveInstance({
        instance_name: formData.instance_name,
        auto_send_enabled: formData.auto_send_enabled,
      });

      if (result.error) {
        toast.error('Erro ao salvar: ' + result.error);
      } else {
        toast.success('Configuração salva!');
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Send welcome message when connected
  const sendWelcomeMessage = async () => {
    if (!globalConfig?.api_url || !globalConfig?.api_token || !profile?.whatsapp) {
      return; // Skip if no config or no WhatsApp number
    }

    try {
      let phone = profile.whatsapp.replace(/\D/g, '');
      if (!phone.startsWith('55') && (phone.length === 10 || phone.length === 11)) {
        phone = '55' + phone;
      }

      const companyName = (profile as any)?.company_name || profile?.full_name || 'Revendedor';
      const message = `✅ *WhatsApp Conectado com Sucesso!*\n\n` +
        `Olá ${companyName}!\n\n` +
        `Sua instância *${formData.instance_name}* foi conectada e está pronta para enviar mensagens automáticas.\n\n` +
        `🔔 A partir de agora, seus clientes receberão notificações de vencimento automaticamente.\n\n` +
        `📱 Acesse o sistema para configurar suas preferências de envio.`;

      await supabase.functions.invoke('evolution-api', {
        body: {
          action: 'send_message',
          config: {
            api_url: globalConfig.api_url,
            api_token: globalConfig.api_token,
            instance_name: formData.instance_name,
          },
          phone,
          message,
        },
      });

      console.log('Welcome message sent to seller');
    } catch (error) {
      console.error('Error sending welcome message:', error);
      // Don't show error to user - this is a background task
    }
  };

  // Check connection
  const checkConnection = async () => {
    if (!formData.instance_name) {
      toast.error('Digite o nome da instância primeiro');
      return;
    }

    if (!globalConfig?.api_url || !globalConfig?.api_token) {
      toast.error('API global não configurada pelo administrador');
      return;
    }

    setIsCheckingConnection(true);
    try {
      const { data, error } = await supabase.functions.invoke('evolution-api', {
        body: {
          action: 'check_connection',
          userId: user?.id,
          config: {
            api_url: globalConfig.api_url,
            api_token: globalConfig.api_token,
            instance_name: formData.instance_name,
          },
        },
      });

      if (error) throw error;

      if (data.connected) {
        // Check if this is a new connection (was disconnected before)
        const wasDisconnected = !formData.is_connected;
        
        toast.success('WhatsApp conectado!');
        setFormData(prev => ({ ...prev, is_connected: true }));
        await updateConnectionStatus(true);
        setQrCode(null);
        
        // Send welcome message if newly connected
        if (wasDisconnected) {
          await sendWelcomeMessage();
        }
      } else {
        toast.error('WhatsApp não conectado. Escaneie o QR Code.');
        setFormData(prev => ({ ...prev, is_connected: false }));
        await updateConnectionStatus(false);
      }
    } catch (error: any) {
      toast.error('Erro: ' + error.message);
    } finally {
      setIsCheckingConnection(false);
    }
  };

  // Get QR Code
  const getQrCode = async () => {
    if (!formData.instance_name) {
      toast.error('Salve o nome da instância primeiro');
      return;
    }

    if (!globalConfig?.api_url || !globalConfig?.api_token) {
      toast.error('API global não configurada pelo administrador');
      return;
    }

    setIsLoadingQr(true);
    try {
      const { data, error } = await supabase.functions.invoke('evolution-api', {
        body: {
          action: 'get_qrcode',
          config: {
            api_url: globalConfig.api_url,
            api_token: globalConfig.api_token,
            instance_name: formData.instance_name,
          },
        },
      });

      if (error) throw error;

      if (data.qrcode) {
        setQrCode(data.qrcode);
        toast.info('Escaneie o QR Code com seu WhatsApp');
      } else if (data.connected) {
        // Check if this is a new connection
        const wasDisconnected = !formData.is_connected;
        
        toast.success('Já está conectado!');
        setFormData(prev => ({ ...prev, is_connected: true }));
        await updateConnectionStatus(true);
        
        // Send welcome message if newly connected
        if (wasDisconnected) {
          await sendWelcomeMessage();
        }
      } else {
        toast.error('Erro ao obter QR Code');
      }
    } catch (error: any) {
      toast.error('Erro: ' + error.message);
    } finally {
      setIsLoadingQr(false);
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

  // Test message with input validation
  const sendTestMessage = async () => {
    const phone = prompt('Digite o número para teste (com DDD):');
    if (!phone) return;

    // SECURITY: Validate phone number format
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 10 || cleanPhone.length > 15) {
      toast.error('Número de telefone inválido. Use apenas números com DDD.');
      return;
    }

    if (!globalConfig?.api_url || !globalConfig?.api_token) {
      toast.error('API global não configurada');
      return;
    }

    // SECURITY: Validate instance name
    const safeInstanceName = formData.instance_name.replace(/[^a-zA-Z0-9_-]/g, '');
    if (safeInstanceName !== formData.instance_name) {
      toast.error('Nome da instância contém caracteres inválidos');
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('evolution-api', {
        body: {
          action: 'send_message',
          config: {
            api_url: globalConfig.api_url,
            api_token: globalConfig.api_token,
            instance_name: safeInstanceName,
          },
          phone: cleanPhone,
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

  if (isLoading || isLoadingConfig) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Show warning if instance is BLOCKED
  if (isBlocked) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive" className="border-destructive">
          <Ban className="h-4 w-4" />
          <AlertDescription className="font-medium">
            🚫 Instância WhatsApp Bloqueada
          </AlertDescription>
        </Alert>
        
        <div className="p-6 rounded-lg bg-destructive/10 border border-destructive/30 text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-destructive/20 flex items-center justify-center">
            <CreditCard className="h-8 w-8 text-destructive" />
          </div>
          <div>
            <h3 className="font-bold text-lg text-destructive">Instância Bloqueada por Falta de Pagamento</h3>
            <p className="text-sm text-muted-foreground mt-2">
              {blockedReason || 'Seu plano está vencido. Renove para voltar a usar o WhatsApp.'}
            </p>
          </div>
          <div className="pt-4 border-t border-destructive/20">
            <p className="text-sm text-muted-foreground">
              ❌ Nenhuma mensagem automática ou manual pode ser enviada
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Entre em contato com o administrador para renovar seu plano.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Show warning if user doesn't have a paid plan (free trial)
  if (!hasPaidPlan) {
    return (
      <div className="space-y-4">
        <Alert className="border-amber-500 bg-amber-500/10">
          <Lock className="h-4 w-4 text-amber-500" />
          <AlertDescription className="font-medium text-amber-700 dark:text-amber-400">
            🔒 Recurso Exclusivo para Planos Pagos
          </AlertDescription>
        </Alert>
        
        <div className="p-6 rounded-lg bg-amber-500/10 border border-amber-500/30 text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-amber-500/20 flex items-center justify-center">
            <Lock className="h-8 w-8 text-amber-600" />
          </div>
          <div>
            <h3 className="font-bold text-lg text-amber-700 dark:text-amber-400">
              API de WhatsApp Indisponível no Teste Grátis
            </h3>
            <p className="text-sm text-muted-foreground mt-2">
              O envio automático de mensagens via WhatsApp está disponível apenas para usuários com planos pagos.
            </p>
          </div>
          <div className="pt-4 border-t border-amber-500/20 space-y-2">
            <p className="text-sm text-muted-foreground">
              ✅ Você pode usar o sistema normalmente para gerenciar clientes
            </p>
            <p className="text-sm text-muted-foreground">
              ✅ Envie mensagens manualmente abrindo o WhatsApp Web
            </p>
            <p className="text-sm text-amber-600 dark:text-amber-400 font-medium mt-3">
              📞 Entre em contato com o administrador para ativar seu plano
            </p>
          </div>
          <Button 
            variant="outline" 
            className="mt-4"
            onClick={() => window.open('https://wa.me/', '_blank')}
          >
            Abrir WhatsApp Web
          </Button>
        </div>
      </div>
    );
  }

  // Check if global API is properly configured and active
  const apiConfigured = globalConfig?.api_url && globalConfig?.api_token;
  const apiInactive = !isApiActive || !apiConfigured;

  return (
    <div className="space-y-6">
      {/* Connection Status Card */}
      <div className={cn(
        "relative overflow-hidden rounded-2xl border-2 transition-all duration-300",
        formData.is_connected 
          ? "bg-gradient-to-br from-success/10 via-success/5 to-transparent border-success/40 shadow-lg shadow-success/10" 
          : "bg-gradient-to-br from-destructive/10 via-destructive/5 to-transparent border-destructive/40"
      )}>
        {/* Decorative background */}
        <div className={cn(
          "absolute inset-0 opacity-5",
          formData.is_connected ? "bg-[radial-gradient(circle_at_top_right,hsl(var(--success)),transparent_50%)]" : ""
        )} />
        
        <div className="relative p-5 flex items-center gap-4">
          <div className={cn(
            "w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-300",
            formData.is_connected 
              ? "bg-success/20 ring-4 ring-success/20" 
              : "bg-destructive/20 ring-4 ring-destructive/20"
          )}>
            {formData.is_connected ? (
              <Wifi className="h-7 w-7 text-success" />
            ) : (
              <WifiOff className="h-7 w-7 text-destructive" />
            )}
          </div>
          <div className="flex-1">
            <p className={cn(
              "font-semibold text-lg",
              formData.is_connected ? "text-success" : "text-destructive"
            )}>
              {formData.is_connected ? '✓ WhatsApp Conectado' : 'WhatsApp Desconectado'}
            </p>
            <p className="text-sm text-muted-foreground mt-0.5">
              {formData.is_connected 
                ? `Instância ${formData.instance_name || 'ativa'} pronta para envios` 
                : 'Configure e escaneie o QR Code para conectar'}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={checkConnection}
            disabled={isCheckingConnection}
            className="rounded-xl hover:bg-background/50"
          >
            {isCheckingConnection ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <RefreshCw className="h-5 w-5" />
            )}
          </Button>
        </div>
      </div>

      {/* QR Code Display - Redesigned */}
      {qrCode && (
        <div className="relative overflow-hidden rounded-2xl border-2 border-primary/30 bg-gradient-to-b from-background to-muted/30">
          {/* Header */}
          <div className="bg-primary/5 border-b border-primary/20 px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <QrCode className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Escaneie o QR Code</h3>
                <p className="text-xs text-muted-foreground">Use o WhatsApp no seu celular</p>
              </div>
            </div>
          </div>
          
          {/* QR Code Container */}
          <div className="p-6 flex flex-col items-center">
            <div className="relative">
              {/* Decorative corner brackets */}
              <div className="absolute -top-2 -left-2 w-6 h-6 border-l-4 border-t-4 border-primary rounded-tl-lg" />
              <div className="absolute -top-2 -right-2 w-6 h-6 border-r-4 border-t-4 border-primary rounded-tr-lg" />
              <div className="absolute -bottom-2 -left-2 w-6 h-6 border-l-4 border-b-4 border-primary rounded-bl-lg" />
              <div className="absolute -bottom-2 -right-2 w-6 h-6 border-r-4 border-b-4 border-primary rounded-br-lg" />
              
              {/* QR Code Image */}
              <div className="p-3 bg-white rounded-xl shadow-lg">
                <img 
                  src={qrCode} 
                  alt="QR Code WhatsApp" 
                  className="w-56 h-56 sm:w-64 sm:h-64"
                />
              </div>
            </div>
            
            {/* Instructions */}
            <div className="mt-6 space-y-3 text-center max-w-xs">
              <div className="flex items-center gap-2 text-sm text-muted-foreground justify-center">
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">1</div>
                <span>Abra o WhatsApp no celular</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground justify-center">
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">2</div>
                <span>Vá em <strong>Dispositivos conectados</strong></span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground justify-center">
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">3</div>
                <span>Toque em <strong>Conectar dispositivo</strong></span>
              </div>
            </div>
            
            <Button 
              onClick={checkConnection} 
              className="mt-6 rounded-xl px-6"
              disabled={isCheckingConnection}
            >
              {isCheckingConnection ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Já escaneei o código
            </Button>
          </div>
        </div>
      )}

      {/* API Inactive Warning Banner */}
      {apiInactive && (
        <Alert className="border-warning bg-warning/10 rounded-xl">
          <AlertCircle className="h-4 w-4 text-warning" />
          <AlertDescription className="text-warning-foreground">
            <strong>API aguardando ativação.</strong> Você pode salvar suas configurações, 
            mas a conexão via QR Code só estará disponível quando o administrador ativar a API.
          </AlertDescription>
        </Alert>
      )}

      {/* Configuration Form */}
      <div className="rounded-2xl border bg-card p-5 space-y-5">
        <div className="flex items-center gap-3 pb-3 border-b">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <QrCode className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold">Configurações da Instância</h3>
            <p className="text-xs text-muted-foreground">Configure sua conexão WhatsApp</p>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium">Nome da Sua Instância</Label>
          <Input
            value={formData.instance_name}
            onChange={(e) => setFormData({ ...formData, instance_name: e.target.value })}
            placeholder="minha-revenda"
            className="rounded-xl h-11"
          />
          <p className="text-xs text-muted-foreground">
            Identificador único da sua conexão WhatsApp (sem espaços ou caracteres especiais)
          </p>
        </div>

        <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50 border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Send className="h-4 w-4 text-primary" />
            </div>
            <div>
              <Label className="font-medium">Envio Automático</Label>
              <p className="text-xs text-muted-foreground">Notificar clientes automaticamente</p>
            </div>
          </div>
          <Switch
            checked={formData.auto_send_enabled}
            onCheckedChange={(checked) => setFormData({ ...formData, auto_send_enabled: checked })}
          />
        </div>

        <div className="grid grid-cols-2 gap-3 pt-2">
          <Button onClick={handleSave} disabled={isSaving} className="rounded-xl h-11">
            {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Salvar
          </Button>
          
          {!formData.is_connected ? (
            <Button 
              variant="secondary" 
              onClick={getQrCode} 
              disabled={isLoadingQr || !formData.instance_name || apiInactive}
              title={apiInactive ? 'Aguardando ativação da API pelo administrador' : ''}
              className="rounded-xl h-11"
            >
              {isLoadingQr ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <QrCode className="h-4 w-4 mr-2" />}
              {apiInactive ? 'API Inativa' : 'Conectar'}
            </Button>
          ) : (
            <Button 
              variant="secondary" 
              onClick={sendTestMessage} 
              disabled={apiInactive}
              className="rounded-xl h-11"
            >
              <Send className="h-4 w-4 mr-2" />
              Testar Envio
            </Button>
          )}
        </div>

        {formData.is_connected && (
          <Button 
            className="w-full rounded-xl h-11 mt-2" 
            variant="outline"
            onClick={runAutomation} 
            disabled={isRunningAutomation}
          >
            {isRunningAutomation ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            Executar Automação Agora
          </Button>
        )}
      </div>

      {/* How it Works Info Card */}
      <div className="rounded-2xl bg-gradient-to-br from-primary/5 via-primary/3 to-transparent border border-primary/20 overflow-hidden">
        <div className="px-5 py-4 border-b border-primary/10 bg-primary/5">
          <span className="font-semibold text-sm flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-primary" />
            Como Funciona
          </span>
        </div>
        <ul className="p-5 text-sm text-muted-foreground space-y-2">
          <li className="flex items-start gap-2">
            <span className="text-primary mt-0.5">•</span>
            Sua instância é conectada à API global do administrador
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary mt-0.5">•</span>
            Apenas seus clientes receberão mensagens pela sua instância
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary mt-0.5">•</span>
            O administrador não tem acesso às suas conversas
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary mt-0.5">•</span>
            <strong>Apps Pagos:</strong> notifica 30 dias, 3 dias e no vencimento
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary mt-0.5">•</span>
            <strong>IPTV/Planos:</strong> notifica 3 dias e no vencimento
          </li>
        </ul>
      </div>
    </div>
  );
}
