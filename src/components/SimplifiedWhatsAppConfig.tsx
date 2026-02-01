import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { 
  Loader2,
  QrCode,
  CheckCircle2,
  AlertCircle,
  PartyPopper,
  RefreshCw,
  Smartphone,
  Unplug,
  Activity,
  Pencil
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import confetti from 'canvas-confetti';
import { RealTimeConnectionStatus } from './RealTimeConnectionStatus';

interface InstanceStatus {
  configured: boolean;
  instance_name?: string;
  is_connected?: boolean;
  webhook_configured?: boolean;
  blocked?: boolean;
  auto_send_enabled?: boolean;
  last_heartbeat?: string;
  evolution_state?: string;
  connected_phone?: string;
}

export function SimplifiedWhatsAppConfig() {
  const { user } = useAuth();
  const { dialogProps, confirm } = useConfirmDialog();
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isLoadingQr, setIsLoadingQr] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isRecreating, setIsRecreating] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [status, setStatus] = useState<InstanceStatus | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const [qrCountdown, setQrCountdown] = useState(50);
  const connectionCheckRef = useRef<NodeJS.Timeout | null>(null);
  const previousConnectedRef = useRef<boolean | null>(null);

  const QR_REFRESH_INTERVAL = 50;
  const CONNECTION_CHECK_INTERVAL = 3000; // Check every 3s while showing QR

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

  // Load current status from backend (source of truth)
  const loadStatus = useCallback(async (silent = false) => {
    if (!user?.id) return;

    try {
      if (!silent) setIsLoading(true);
      
      const { data, error } = await supabase.functions.invoke('configure-seller-instance', {
        body: { action: 'check_status' },
      });

      if (error) throw error;

      // Check for connection change
      if (previousConnectedRef.current !== null && 
          previousConnectedRef.current === false && 
          data.is_connected === true) {
        // Connection restored!
        setQrCode(null);
        triggerCelebration();
        toast.success('WhatsApp conectado com sucesso!');
      }
      
      previousConnectedRef.current = data.is_connected ?? false;
      setStatus(data);
    } catch (err: any) {
      console.error('Error loading status:', err);
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [user?.id, triggerCelebration]);

  // Initial load
  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // Subscribe to realtime instance changes (auto-healing)
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`instance-config-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'whatsapp_seller_instances',
          filter: `seller_id=eq.${user.id}`,
        },
        (payload) => {
          const newData = payload.new as any;
          
          // Auto-update status without refresh
          setStatus(prev => prev ? {
            ...prev,
            is_connected: newData.is_connected,
            webhook_configured: newData.webhook_auto_configured,
          } : null);

          // If connected while showing QR, celebrate!
          if (newData.is_connected && qrCode) {
            setQrCode(null);
            triggerCelebration();
            toast.success('WhatsApp conectado com sucesso!');
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, qrCode, triggerCelebration]);

  // QR Code countdown and auto-refresh + connection check
  useEffect(() => {
    if (!qrCode) {
      setQrCountdown(QR_REFRESH_INTERVAL);
      // Clear connection check interval when no QR
      if (connectionCheckRef.current) {
        clearInterval(connectionCheckRef.current);
        connectionCheckRef.current = null;
      }
      return;
    }

    // Start checking connection status while QR is displayed
    connectionCheckRef.current = setInterval(() => {
      loadStatus(true); // Silent check
    }, CONNECTION_CHECK_INTERVAL);

    // QR countdown timer
    const timer = setInterval(() => {
      setQrCountdown((prev) => {
        if (prev <= 1) {
          refreshQrCode();
          return QR_REFRESH_INTERVAL;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(timer);
      if (connectionCheckRef.current) {
        clearInterval(connectionCheckRef.current);
        connectionCheckRef.current = null;
      }
    };
  }, [qrCode, loadStatus]);

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
  const handleDisconnect = () => {
   console.log('[SimplifiedWhatsAppConfig] handleDisconnect called');
    confirm({
      title: 'Desconectar WhatsApp',
      description: 'Tem certeza que deseja desconectar? Você precisará escanear o QR Code novamente.',
      confirmText: 'Desconectar',
      variant: 'warning',
      onConfirm: async () => {
       console.log('[SimplifiedWhatsAppConfig] onConfirm disconnect triggered');
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
            // Exibir erro detalhado
            const errorMsg = data.error || 'Erro ao desconectar';
            const details = data.details ? `\n\nDetalhes: ${data.details}` : '';
            toast.error(errorMsg + details, { duration: 6000 });
            
            // Se banco foi atualizado localmente, atualizar UI
            if (data.local_updated) {
              setStatus(prev => prev ? { ...prev, is_connected: false } : null);
              toast.warning('Status local atualizado. Use "Forçar Desconexão" se o problema persistir.', { duration: 8000 });
            }
          }
        } catch (err: any) {
          toast.error('Erro: ' + err.message);
        } finally {
          setIsDisconnecting(false);
        }
      },
    });
  };

  // Forçar desconexão (fallback)
  const handleForceDisconnect = () => {
   console.log('[SimplifiedWhatsAppConfig] handleForceDisconnect called');
    confirm({
      title: 'Forçar Desconexão',
      description: 'Isso irá remover completamente a instância do WhatsApp. Você precisará configurar novamente do zero.',
      confirmText: 'Forçar Desconexão',
      variant: 'destructive',
      onConfirm: async () => {
       console.log('[SimplifiedWhatsAppConfig] onConfirm force_disconnect triggered');
        setIsDisconnecting(true);
        try {
          const { data, error } = await supabase.functions.invoke('configure-seller-instance', {
            body: { action: 'force_disconnect' },
          });
          if (error) throw error;
          if (data.success) {
            toast.success('Instância removida. Configure novamente.');
            setStatus(prev => prev ? { ...prev, is_connected: false, instance_name: undefined } : null);
            setQrCode(null);
            await loadStatus();
          } else {
            toast.error(data.error || 'Erro ao forçar desconexão');
          }
        } catch (err: any) {
          toast.error('Erro: ' + err.message);
        } finally {
          setIsDisconnecting(false);
        }
      },
    });
  };

  // Rename instance to use company name
  const handleRenameInstance = () => {
    confirm({
      title: 'Renomear instância',
      description: 'Sua instância será renomeada para usar o nome da sua empresa. Você precisará escanear o QR Code novamente para reconectar. Certifique-se de ter configurado o nome da empresa em Configurações.',
      confirmText: 'Renomear',
      variant: 'warning',
      onConfirm: async () => {
        setIsRenaming(true);
        try {
          const { data, error } = await supabase.functions.invoke('configure-seller-instance', {
            body: { action: 'rename_instance' },
          });
          if (error) throw error;
          if (data.success) {
            toast.success(data.message || `Instância renomeada para: ${data.new_name}`);
            await loadStatus();
            if (data.qrcode) {
              setQrCode(data.qrcode);
            }
          } else {
            toast.error(data.error || 'Erro ao renomear instância');
          }
        } catch (err: any) {
          toast.error('Erro: ' + err.message);
        } finally {
          setIsRenaming(false);
        }
      },
    });
  };

  // Recreate instance with new auto-generated name
  const handleRecreateInstance = () => {
    confirm({
      title: 'Recriar instância',
      description: 'Isso irá desconectar sua instância atual e criar uma nova com nome automático. Você precisará escanear o QR Code novamente. Continuar?',
      confirmText: 'Recriar',
      variant: 'warning',
      onConfirm: async () => {
        setIsRecreating(true);
        try {
          await supabase.functions.invoke('configure-seller-instance', {
            body: { action: 'disconnect' },
          });
          if (user?.id) {
            await supabase.from('whatsapp_seller_instances').delete().eq('seller_id', user.id);
          }
          const { data, error } = await supabase.functions.invoke('configure-seller-instance', {
            body: { action: 'auto_create' },
          });
          if (error) throw error;
          if (data.success) {
            toast.success(`Nova instância criada: ${data.instance_name}`);
            await loadStatus();
            if (data.qrcode) {
              setQrCode(data.qrcode);
            } else {
              const { data: qrData } = await supabase.functions.invoke('configure-seller-instance', {
                body: { action: 'get_qrcode' },
              });
              if (qrData?.qrcode) {
                setQrCode(qrData.qrcode);
              }
            }
          } else {
            toast.error(data.error || 'Erro ao criar nova instância');
          }
        } catch (err: any) {
          toast.error('Erro: ' + err.message);
        } finally {
          setIsRecreating(false);
        }
      },
    });
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

      <div className="space-y-4 sm:space-y-6">
        {/* Not configured - Show create button */}
        {!status?.configured && (
          <Card>
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
                <Smartphone className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
                <span className="truncate">Conectar WhatsApp</span>
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Clique no botão abaixo para criar sua instância WhatsApp automaticamente.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
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

        {/* Configured - Show real-time status */}
        {status?.configured && (
          <Card>
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
                <Smartphone className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
                <span className="truncate">Sua Instância WhatsApp</span>
              </CardTitle>
              <CardDescription className="space-y-1 text-xs sm:text-sm">
                <span>Instância: <strong className="break-all">{status.instance_name}</strong></span>
                {status.connected_phone && status.is_connected && (
                  <span className="block text-green-600 dark:text-green-400 font-medium">
                    📱 Número: <strong>{status.connected_phone}</strong>
                  </span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 sm:space-y-4 p-4 sm:p-6 pt-0 sm:pt-0">
              {/* Real-time connection status */}
              <RealTimeConnectionStatus 
                variant="card" 
                showLastSync={true}
                heartbeatInterval={30}
              />
              
              {/* Chatbot status indicator */}
              {status.webhook_configured && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 w-fit">
                  <Activity className="h-4 w-4" />
                  Chatbot Ativo
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* QR Code Section - Only show if configured but not connected */}
        {status?.configured && !status?.is_connected && (
          <Card>
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
                <QrCode className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
                <span className="truncate">Conectar WhatsApp</span>
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Escaneie o QR Code com seu WhatsApp para conectar
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 sm:space-y-4 p-4 sm:p-6 pt-0 sm:pt-0">
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
            <CardContent className="pt-6 space-y-4">
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
              </div>
              
              {/* Action buttons */}
              <div className="flex flex-wrap gap-2 pt-2 border-t border-green-200 dark:border-green-800">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleRenameInstance}
                  disabled={isRenaming}
                  className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                >
                  {isRenaming ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Pencil className="h-4 w-4 mr-2" />
                  )}
                  Renomear
                </Button>
                
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
                
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleRecreateInstance}
                  disabled={isRecreating}
                  className="text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                >
                  {isRecreating ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Recriar
                </Button>
              </div>
              
              {/* Forçar Desconexão - botão de fallback */}
              <Button 
                variant="ghost"
                size="sm"
                onClick={handleForceDisconnect} 
                disabled={isDisconnecting}
                className="w-full mt-1 text-xs text-muted-foreground hover:text-red-600"
              >
                🔧 Forçar Desconexão (se o botão acima não funcionar)
              </Button>
              
              <p className="text-xs text-green-700 dark:text-green-400">
                ✏️ <strong>Renomear:</strong> Usa o nome da sua empresa configurado em "Configurações"
              </p>
            </CardContent>
          </Card>
        )}
      </div>

     {/* Global Confirm Dialog */}
     <ConfirmDialog {...dialogProps} />
    </>
  );
}
