import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

const VAPID_PUBLIC_KEY_STORAGE = 'vapid_public_key';
const PUSH_SUBSCRIPTION_STORAGE = 'push_subscription_active';

export interface BrowserCheck {
  isSecureContext: boolean;
  hasNotificationAPI: boolean;
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  browserName: string;
  browserVersion: string;
  isIOS: boolean;
  isIOSVersionSupported: boolean;
  isAndroid: boolean;
  isChrome: boolean;
  isFirefox: boolean;
  isSafari: boolean;
  isEdge: boolean;
}

export interface PushError {
  code: string;
  message: string;
  details?: string;
}

function getBrowserInfo(): BrowserCheck {
  const ua = navigator.userAgent;
  
  // Detect browsers
  const isChrome = /Chrome/.test(ua) && !/Edge|Edg/.test(ua);
  const isFirefox = /Firefox/.test(ua);
  const isSafari = /Safari/.test(ua) && !/Chrome/.test(ua);
  const isEdge = /Edge|Edg/.test(ua);
  
  // Detect platforms
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const isAndroid = /Android/.test(ua);
  
  // Get browser version
  let browserName = 'Unknown';
  let browserVersion = '0';
  
  if (isChrome) {
    browserName = 'Chrome';
    const match = ua.match(/Chrome\/(\d+)/);
    browserVersion = match ? match[1] : '0';
  } else if (isFirefox) {
    browserName = 'Firefox';
    const match = ua.match(/Firefox\/(\d+)/);
    browserVersion = match ? match[1] : '0';
  } else if (isSafari) {
    browserName = 'Safari';
    const match = ua.match(/Version\/(\d+)/);
    browserVersion = match ? match[1] : '0';
  } else if (isEdge) {
    browserName = 'Edge';
    const match = ua.match(/Edg\/(\d+)/);
    browserVersion = match ? match[1] : '0';
  }
  
  // iOS 16.4+ supports push notifications
  let isIOSVersionSupported = false;
  if (isIOS) {
    const match = ua.match(/OS (\d+)_(\d+)/);
    if (match) {
      const major = parseInt(match[1]);
      const minor = parseInt(match[2]);
      isIOSVersionSupported = major > 16 || (major === 16 && minor >= 4);
    }
  }
  
  return {
    isSecureContext: window.isSecureContext,
    hasNotificationAPI: 'Notification' in window,
    hasServiceWorker: 'serviceWorker' in navigator,
    hasPushManager: 'PushManager' in window,
    browserName,
    browserVersion,
    isIOS,
    isIOSVersionSupported,
    isAndroid,
    isChrome,
    isFirefox,
    isSafari,
    isEdge,
  };
}

export function usePushNotifications() {
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [vapidPublicKey, setVapidPublicKey] = useState<string | null>(null);
  const [browserCheck, setBrowserCheck] = useState<BrowserCheck | null>(null);
  const [lastError, setLastError] = useState<PushError | null>(null);

  // Check support and current state
  useEffect(() => {
    const checkSupport = async () => {
      const check = getBrowserInfo();
      setBrowserCheck(check);
      
      console.log('[Push] Browser check:', check);
      
      // Full support check
      const supported = check.isSecureContext && 
                       check.hasNotificationAPI && 
                       check.hasServiceWorker && 
                       check.hasPushManager;
      
      // iOS specific check
      if (check.isIOS && !check.isIOSVersionSupported) {
        console.log('[Push] iOS version not supported (requires 16.4+)');
        setLastError({
          code: 'IOS_VERSION',
          message: 'iOS 16.4+ necessário',
          details: 'Atualize seu iOS para versão 16.4 ou superior para usar notificações push.'
        });
      }
      
      if (!check.isSecureContext) {
        console.log('[Push] Not in secure context (HTTPS required)');
        setLastError({
          code: 'INSECURE_CONTEXT',
          message: 'HTTPS necessário',
          details: 'Notificações push só funcionam em conexões seguras (HTTPS).'
        });
      }
      
      setIsSupported(supported);
      
      if (supported) {
        setPermission(Notification.permission);
        
        // Check if already subscribed
        const storedActive = localStorage.getItem(PUSH_SUBSCRIPTION_STORAGE);
        if (storedActive === 'true' && Notification.permission === 'granted') {
          try {
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.getSubscription();
            setIsSubscribed(!!subscription);
          } catch (error) {
            console.error('[Push] Error checking subscription:', error);
          }
        }

        // Get stored VAPID key
        const storedKey = localStorage.getItem(VAPID_PUBLIC_KEY_STORAGE);
        if (storedKey) {
          setVapidPublicKey(storedKey);
        }
      }
    };

    checkSupport();
  }, []);

  // Fetch VAPID public key from backend (always fetch fresh)
  const getVapidPublicKey = useCallback(async (): Promise<string | null> => {
    try {
      console.log('[Push] Fetching VAPID public key from server...');
      const { data, error } = await supabase.functions.invoke('get-vapid-public-key');
      
      if (error) {
        console.error('[Push] Error fetching VAPID public key:', error);
        setLastError({
          code: 'VAPID_FETCH_ERROR',
          message: 'Erro ao buscar chave do servidor',
          details: error.message || 'Não foi possível obter a chave de autenticação do servidor.'
        });
        return null;
      }

      if (data?.error) {
        console.error('[Push] Server returned error:', data.error);
        setLastError({
          code: 'VAPID_SERVER_ERROR',
          message: 'Chave VAPID não configurada',
          details: 'O servidor não possui a chave de notificações configurada.'
        });
        return null;
      }

      const key = data?.publicKey;
      if (key) {
        console.log('[Push] VAPID key received, length:', key.length);
        
        // Validate key format (should be 87 chars for URL-safe base64)
        if (key.length < 80 || key.length > 100) {
          console.error('[Push] Invalid VAPID key length:', key.length);
          setLastError({
            code: 'VAPID_INVALID',
            message: 'Chave VAPID inválida',
            details: `Formato da chave inválido (${key.length} caracteres).`
          });
          return null;
        }
        
        localStorage.setItem(VAPID_PUBLIC_KEY_STORAGE, key);
        setVapidPublicKey(key);
        return key;
      }
      
      console.error('[Push] No publicKey in response:', data);
      setLastError({
        code: 'VAPID_MISSING',
        message: 'Chave não encontrada na resposta',
        details: 'O servidor não retornou a chave pública esperada.'
      });
      return null;
    } catch (error) {
      console.error('[Push] Error getting VAPID key:', error);
      setLastError({
        code: 'VAPID_NETWORK_ERROR',
        message: 'Erro de conexão',
        details: 'Não foi possível conectar ao servidor. Verifique sua conexão.'
      });
      return null;
    }
  }, []);

  // Convert VAPID key to ArrayBuffer
  const urlBase64ToUint8Array = (base64String: string): ArrayBuffer => {
    try {
      const padding = '='.repeat((4 - base64String.length % 4) % 4);
      const base64 = (base64String + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');
      
      const rawData = window.atob(base64);
      const outputArray = new Uint8Array(rawData.length);
      
      for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
      }
      return outputArray.buffer as ArrayBuffer;
    } catch (error) {
      console.error('[Push] Error converting base64:', error);
      throw new Error('Erro ao processar chave de autenticação');
    }
  };

  // Register service worker if not registered
  const ensureServiceWorker = async (): Promise<ServiceWorkerRegistration | null> => {
    try {
      // Check if service worker is already registered
      let registration = await navigator.serviceWorker.getRegistration('/');
      
      if (!registration) {
        console.log('[Push] Registering service worker...');
        registration = await navigator.serviceWorker.register('/sw.js');
        console.log('[Push] Service worker registered');
      }
      
      // Wait for the service worker to be ready
      await navigator.serviceWorker.ready;
      console.log('[Push] Service worker ready');
      
      return registration;
    } catch (error) {
      console.error('[Push] Service worker registration failed:', error);
      setLastError({
        code: 'SW_REGISTRATION_FAILED',
        message: 'Erro ao registrar service worker',
        details: 'Não foi possível registrar o worker necessário para notificações.'
      });
      return null;
    }
  };

  // Subscribe to push notifications
  const subscribe = useCallback(async (): Promise<boolean> => {
    setLastError(null);
    
    if (!browserCheck) {
      console.error('[Push] Browser check not completed');
      setLastError({
        code: 'NOT_READY',
        message: 'Verificação do navegador não concluída',
        details: 'Aguarde a verificação inicial do navegador.'
      });
      return false;
    }
    
    // Detailed checks with specific errors
    if (!browserCheck.isSecureContext) {
      setLastError({
        code: 'INSECURE_CONTEXT',
        message: 'Conexão não segura',
        details: 'Notificações push requerem HTTPS. Acesse via URL segura.'
      });
      return false;
    }
    
    if (!browserCheck.hasNotificationAPI) {
      setLastError({
        code: 'NO_NOTIFICATION_API',
        message: 'API de notificações indisponível',
        details: `O navegador ${browserCheck.browserName} não suporta a API de notificações.`
      });
      return false;
    }
    
    if (!browserCheck.hasServiceWorker) {
      setLastError({
        code: 'NO_SERVICE_WORKER',
        message: 'Service Worker não suportado',
        details: `O navegador ${browserCheck.browserName} não suporta Service Workers.`
      });
      return false;
    }
    
    if (!browserCheck.hasPushManager) {
      setLastError({
        code: 'NO_PUSH_MANAGER',
        message: 'Push Manager não suportado',
        details: `O navegador ${browserCheck.browserName} não suporta Push Manager.`
      });
      return false;
    }
    
    if (browserCheck.isIOS && !browserCheck.isIOSVersionSupported) {
      setLastError({
        code: 'IOS_VERSION',
        message: 'Versão do iOS não suportada',
        details: 'Notificações push no iOS requerem versão 16.4 ou superior.'
      });
      return false;
    }
    
    setIsLoading(true);
    
    try {
      // Request permission
      console.log('[Push] Requesting notification permission...');
      const permissionResult = await Notification.requestPermission();
      setPermission(permissionResult);
      console.log('[Push] Permission result:', permissionResult);
      
      if (permissionResult === 'denied') {
        setLastError({
          code: 'PERMISSION_DENIED',
          message: 'Permissão negada',
          details: 'Você bloqueou as notificações. Para ativar, vá em Configurações do navegador > Sites > Notificações.'
        });
        setIsLoading(false);
        return false;
      }
      
      if (permissionResult !== 'granted') {
        setLastError({
          code: 'PERMISSION_DISMISSED',
          message: 'Permissão não concedida',
          details: 'Você precisa permitir as notificações quando o navegador solicitar.'
        });
        setIsLoading(false);
        return false;
      }

      // Get VAPID public key
      console.log('[Push] Getting VAPID public key...');
      const publicKey = await getVapidPublicKey();
      if (!publicKey) {
        // Error already set in getVapidPublicKey
        setIsLoading(false);
        return false;
      }
      console.log('[Push] VAPID key obtained, length:', publicKey.length);

      // Ensure service worker is registered
      const registration = await ensureServiceWorker();
      if (!registration) {
        setIsLoading(false);
        return false;
      }
      
      // Check if already subscribed
      const existingSubscription = await registration.pushManager.getSubscription();
      if (existingSubscription) {
        console.log('[Push] Already subscribed, unsubscribing first...');
        try {
          await existingSubscription.unsubscribe();
        } catch (error) {
          console.warn('[Push] Error unsubscribing existing:', error);
        }
      }
      
      // Convert key to ArrayBuffer
      let applicationServerKey: ArrayBuffer;
      try {
        applicationServerKey = urlBase64ToUint8Array(publicKey);
      } catch (error) {
        setLastError({
          code: 'KEY_CONVERSION_ERROR',
          message: 'Erro ao processar chave',
          details: 'A chave do servidor está em formato inválido.'
        });
        setIsLoading(false);
        return false;
      }
      
      // Subscribe to push
      console.log('[Push] Subscribing to push manager...');
      let subscription: PushSubscription;
      try {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
        console.log('[Push] Subscription created:', subscription.endpoint);
      } catch (error: unknown) {
        console.error('[Push] Push subscription failed:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        if (errorMessage.includes('applicationServerKey')) {
          setLastError({
            code: 'INVALID_SERVER_KEY',
            message: 'Chave do servidor inválida',
            details: 'A chave VAPID configurada no servidor é inválida.'
          });
        } else if (errorMessage.includes('permission')) {
          setLastError({
            code: 'PERMISSION_ERROR',
            message: 'Erro de permissão',
            details: 'Não foi possível obter permissão para notificações.'
          });
        } else {
          setLastError({
            code: 'SUBSCRIPTION_FAILED',
            message: 'Falha na inscrição',
            details: `Erro: ${errorMessage}`
          });
        }
        setIsLoading(false);
        return false;
      }

      // Send subscription to backend
      console.log('[Push] Saving subscription to backend...');
      const { error } = await supabase.functions.invoke('save-push-subscription', {
        body: { 
          subscription: subscription.toJSON(),
          action: 'subscribe'
        }
      });

      if (error) {
        console.error('[Push] Error saving subscription:', error);
        setLastError({
          code: 'SAVE_FAILED',
          message: 'Erro ao salvar inscrição',
          details: 'A inscrição foi criada mas não foi possível salvar no servidor.'
        });
        setIsLoading(false);
        return false;
      }
      console.log('[Push] Subscription saved successfully');

      localStorage.setItem(PUSH_SUBSCRIPTION_STORAGE, 'true');
      setIsSubscribed(true);
      setIsLoading(false);
      
      // Show test notification
      new Notification('CliControl', {
        body: 'Notificações push ativadas com sucesso!',
        icon: '/icon-192.png',
        tag: 'push-enabled'
      });
      
      return true;
    } catch (error: unknown) {
      console.error('[Push] Unexpected error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      setLastError({
        code: 'UNEXPECTED_ERROR',
        message: 'Erro inesperado',
        details: errorMessage
      });
      setIsLoading(false);
      return false;
    }
  }, [browserCheck, getVapidPublicKey]);

  // Unsubscribe from push notifications
  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported) return false;
    
    setIsLoading(true);
    setLastError(null);
    
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      
      if (subscription) {
        // Unsubscribe from push manager
        await subscription.unsubscribe();
        
        // Remove from backend
        await supabase.functions.invoke('save-push-subscription', {
          body: { 
            subscription: subscription.toJSON(),
            action: 'unsubscribe'
          }
        });
      }

      localStorage.setItem(PUSH_SUBSCRIPTION_STORAGE, 'false');
      setIsSubscribed(false);
      setIsLoading(false);
      return true;
    } catch (error) {
      console.error('Error unsubscribing from push:', error);
      setLastError({
        code: 'UNSUBSCRIBE_FAILED',
        message: 'Erro ao desativar',
        details: 'Não foi possível desativar as notificações.'
      });
      setIsLoading(false);
      return false;
    }
  }, [isSupported]);

  return {
    isSupported,
    permission,
    isSubscribed,
    isLoading,
    subscribe,
    unsubscribe,
    isGranted: permission === 'granted',
    isDenied: permission === 'denied',
    browserCheck,
    lastError,
  };
}
