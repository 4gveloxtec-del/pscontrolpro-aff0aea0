import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { 
  Wifi, 
  WifiOff, 
  Save, 
  Loader2,
  QrCode,
  CheckCircle2,
  AlertCircle,
  PartyPopper,
  Link,
  RefreshCw
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
  instance_link?: string;
  is_connected?: boolean;
  webhook_configured?: boolean;
  blocked?: boolean;
  auto_send_enabled?: boolean;
}

export function SimplifiedWhatsAppConfig() {
  const { user, profile, isAdmin } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingQr, setIsLoadingQr] = useState(false);
  const [instanceLink, setInstanceLink] = useState('');
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
      if (data?.instance_link) {
        setInstanceLink(data.instance_link);
      }
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

  // Save instance link
  const handleSave = async () => {
    if (!instanceLink.trim()) {
      toast.error('Digite o link ou nome da sua instância');
      return;
    }

    setIsSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('configure-seller-instance', {
        body: { 
          action: 'configure',
          instance_link: instanceLink.trim()
        },
      });

      if (error) throw error;

      if (data.blocked) {
        toast.error(data.error || 'Seu plano não permite usar esta funcionalidade');
        return;
      }

      if (!data.success) {
        toast.error(data.error || 'Erro ao configurar instância');
        return;
      }

      toast.success(data.message || 'Instância configurada!');
      
      // Reload status
      await loadStatus();
    } catch (err: any) {
      toast.error('Erro: ' + err.message);
    } finally {
      setIsSaving(false);
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
        {/* Configuration Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link className="h-5 w-5" />
              Conectar WhatsApp
            </CardTitle>
            <CardDescription>
              Cole o link ou nome da sua instância WhatsApp para ativar o envio automático de mensagens.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="instance-link">Link da Instância / Nome</Label>
              <div className="flex gap-2">
                <Input
                  id="instance-link"
                  placeholder="Ex: sandelrodrig ou https://api.exemplo.com/sandelrodrig"
                  value={instanceLink}
                  onChange={(e) => setInstanceLink(e.target.value)}
                  className="flex-1"
                />
                <Button 
                  onClick={handleSave} 
                  disabled={isSaving || !instanceLink.trim()}
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Digite apenas o nome da instância ou a URL completa
              </p>
            </div>

            {/* Status indicators */}
            {status?.configured && (
              <div className="flex flex-wrap gap-3 pt-2">
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
            )}
          </CardContent>
        </Card>

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

        {/* Success state */}
        {status?.configured && status?.is_connected && (
          <Alert className="border-green-500 bg-green-50 dark:bg-green-900/20">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800 dark:text-green-400">
              <strong>Tudo pronto!</strong> Seu WhatsApp está conectado e o chatbot está ativo.
              Seus clientes receberão mensagens automáticas de vencimento.
            </AlertDescription>
          </Alert>
        )}
      </div>
    </>
  );
}
