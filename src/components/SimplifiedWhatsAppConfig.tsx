import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { 
  Wifi, 
  WifiOff, 
  Loader2,
  QrCode,
  CheckCircle2,
  AlertCircle,
  PartyPopper,
  RefreshCw,
  Smartphone,
  Unplug
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import confetti from 'canvas-confetti';

interface InstanceStatus {
  configured: boolean;
  instance_name?: string;
  is_connected?: boolean;
  webhook_configured?: boolean;
  blocked?: boolean;
  auto_send_enabled?: boolean;
}

export function SimplifiedWhatsAppConfig() {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isLoadingQr, setIsLoadingQr] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [status, setStatus] = useState<InstanceStatus | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const [qrCountdown, setQrCountdown] = useState(50);

  const QR_REFRESH_INTERVAL = 50;

  // Celebration confetti effect
  const triggerCelebration = useCallback(() => {
    setShowCelebration(true);
    
    const duration = 3000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 };

    const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

    const interval = setInterval(() => {
      const timeLeft = animationEnd - Date.now();
      if (timeLeft <= 0) {
        clearInterval(interval);
        return;
      }

      const particleCount = 50 * (timeLeft / duration);
      
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
        colors: ['#22c55e', '#10b981', '#34d399', '#6ee7b7', '#a7f3d0'],
      });
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
        colors: ['#22c55e', '#10b981', '#34d399', '#6ee7b7', '#a7f3d0'],
      });
    }, 250);

    setTimeout(() => setShowCelebration(false), 5000);
  }, []);

  // Load current status
  const loadStatus = useCallback(async () => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase.functions.invoke('configure-seller-instance', {
        body: { action: 'check_status' },
      });

      if (error) throw error;

      setStatus(data);
    } catch (err: any) {
      console.error('Error loading status:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // QR Code countdown and auto-refresh
  useEffect(() => {
    if (!qrCode) {
      setQrCountdown(QR_REFRESH_INTERVAL);
      return;
    }

    const timer = setInterval(() => {
      setQrCountdown((prev) => {
        if (prev <= 1) {
          refreshQrCode();
          return QR_REFRESH_INTERVAL;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [qrCode]);

  // Refresh QR Code
  const refreshQrCode = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('configure-seller-instance', {
        body: { action: 'get_qrcode' },
      });

      if (error) throw error;

      if (data.qrcode) {
        setQrCode(data.qrcode);
        setQrCountdown(QR_REFRESH_INTERVAL);
      } else if (data.connected) {
        setQrCode(null);
        setStatus(prev => prev ? { ...prev, is_connected: true } : null);
        triggerCelebration();
        toast.success('WhatsApp conectado com sucesso!');
      }
    } catch (error) {
      console.error('Error refreshing QR code:', error);
    }
  };

  // Create instance automatically
  const handleCreateInstance = async () => {
    setIsCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke('configure-seller-instance', {
        body: { action: 'auto_create' },
      });

      if (error) throw error;

      if (data.blocked) {
        toast.error(data.error || 'Seu plano não permite usar esta funcionalidade');
        return;
      }

      if (!data.success) {
        toast.error(data.error || 'Erro ao criar instância');
        return;
      }

      toast.success('Instância criada! Agora escaneie o QR Code.');
      
      // Reload status and get QR code
      await loadStatus();
      
      // Automatically get QR code
      handleGetQrCode();
    } catch (err: any) {
      toast.error('Erro: ' + err.message);
    } finally {
      setIsCreating(false);
    }
  };

  // Get QR Code
  const handleGetQrCode = async () => {
    setIsLoadingQr(true);
    try {
      const { data, error } = await supabase.functions.invoke('configure-seller-instance', {
        body: { action: 'get_qrcode' },
      });

      if (error) throw error;

      if (data.error) {
        toast.error(data.error);
        return;
      }

      if (data.qrcode) {
        setQrCode(data.qrcode);
        toast.info('Escaneie o QR Code com seu WhatsApp');
      } else if (data.connected) {
        setStatus(prev => prev ? { ...prev, is_connected: true } : null);
        triggerCelebration();
        toast.success('WhatsApp já está conectado!');
      }
    } catch (err: any) {
      toast.error('Erro: ' + err.message);
    } finally {
      setIsLoadingQr(false);
    }
  };

  // Disconnect instance
  const handleDisconnect = async () => {
    if (!confirm('Tem certeza que deseja desconectar? Você precisará escanear o QR Code novamente.')) {
      return;
    }
    
    setIsDisconnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke('configure-seller-instance', {
        body: { action: 'disconnect' },
      });

      if (error) throw error;

      if (data.success) {
        toast.success('WhatsApp desconectado');
        setStatus(prev => prev ? { ...prev, is_connected: false } : null);
        setQrCode(null);
      } else {
        toast.error(data.error || 'Erro ao desconectar');
      }
    } catch (err: any) {
      toast.error('Erro: ' + err.message);
    } finally {
      setIsDisconnecting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Check if blocked
  if (status?.blocked) {
    return (
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            WhatsApp Bloqueado
          </CardTitle>
          <CardDescription>
            Seu plano está vencido. Renove para voltar a usar o WhatsApp automático.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <>
      {/* Celebration Dialog */}
      <Dialog open={showCelebration} onOpenChange={setShowCelebration}>
        <DialogContent className="sm:max-w-md text-center">
          <DialogHeader>
            <DialogTitle className="text-2xl flex items-center justify-center gap-2">
              <PartyPopper className="h-8 w-8 text-green-500" />
              WhatsApp Conectado!
            </DialogTitle>
          </DialogHeader>
          <div className="py-6">
            <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <p className="text-lg">
              Seu WhatsApp está pronto para enviar mensagens automáticas!
            </p>
          </div>
        </DialogContent>
      </Dialog>

      <div className="space-y-6">
        {/* Not configured - Show create button */}
        {!status?.configured && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Smartphone className="h-5 w-5" />
                Conectar WhatsApp
              </CardTitle>
              <CardDescription>
                Clique no botão abaixo para criar sua instância WhatsApp automaticamente e começar a enviar mensagens.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                onClick={handleCreateInstance} 
                disabled={isCreating}
                size="lg"
                className="w-full"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Criando instância...
                  </>
                ) : (
                  <>
                    <QrCode className="h-4 w-4 mr-2" />
                    Criar e Conectar WhatsApp
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Configured - Show status */}
        {status?.configured && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Smartphone className="h-5 w-5" />
                Sua Instância WhatsApp
              </CardTitle>
              <CardDescription>
                Instância: <strong>{status.instance_name}</strong>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Status indicators */}
              <div className="flex flex-wrap gap-3">
                <div className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm",
                  status.is_connected 
                    ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                    : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                )}>
                  {status.is_connected ? (
                    <>
                      <Wifi className="h-4 w-4" />
                      Conectado
                    </>
                  ) : (
                    <>
                      <WifiOff className="h-4 w-4" />
                      Desconectado
                    </>
                  )}
                </div>

                {status.webhook_configured && (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                    <CheckCircle2 className="h-4 w-4" />
                    Chatbot Ativo
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* QR Code Section - Only show if configured but not connected */}
        {status?.configured && !status?.is_connected && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <QrCode className="h-5 w-5" />
                Conectar WhatsApp
              </CardTitle>
              <CardDescription>
                Escaneie o QR Code com seu WhatsApp para conectar
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {qrCode ? (
                <div className="flex flex-col items-center gap-4">
                  <div className="p-4 bg-white rounded-lg shadow-lg">
                    <img
                      src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`}
                      alt="QR Code"
                      className="w-64 h-64"
                    />
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <RefreshCw className="h-4 w-4" />
                    Atualiza em {qrCountdown}s
                  </div>
                  <p className="text-sm text-center text-muted-foreground">
                    Abra o WhatsApp → Menu → Dispositivos conectados → Conectar dispositivo
                  </p>
                </div>
              ) : (
                <Button 
                  onClick={handleGetQrCode} 
                  disabled={isLoadingQr}
                  className="w-full"
                  size="lg"
                >
                  {isLoadingQr ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Gerando QR Code...
                    </>
                  ) : (
                    <>
                      <QrCode className="h-4 w-4 mr-2" />
                      Gerar QR Code
                    </>
                  )}
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Success state with disconnect option */}
        {status?.configured && status?.is_connected && (
          <Card className="border-green-500 bg-green-50 dark:bg-green-900/20">
            <CardContent className="pt-6">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
                  <div>
                    <p className="font-semibold text-green-800 dark:text-green-400">
                      Tudo pronto!
                    </p>
                    <p className="text-sm text-green-700 dark:text-green-500">
                      Seu WhatsApp está conectado e o chatbot está ativo.
                    </p>
                  </div>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleDisconnect}
                  disabled={isDisconnecting}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  {isDisconnecting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Unplug className="h-4 w-4 mr-2" />
                  )}
                  Desconectar
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
