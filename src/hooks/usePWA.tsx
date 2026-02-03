import { useState, useEffect, useCallback, useRef } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * usePWA - Optional PWA functionality
 * 
 * This hook provides PWA install capabilities as an OPTIONAL feature.
 * The website works perfectly without installing as PWA.
 * Service worker registration is non-blocking and graceful.
 */
export function usePWA() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  // When we request an update, reload once the new SW takes control.
  const refreshingRef = useRef(false);

  useEffect(() => {
    // Service worker registration is optional and non-blocking
    const registerSW = async () => {
      // Skip SW registration in environments where it's not supported
      if (!('serviceWorker' in navigator)) {
        console.log('[PWA] Service workers not supported');
        return;
      }
      
      try {
        // Check if we're in a context where SW registration makes sense
        const isSecureContext = window.isSecureContext;
        if (!isSecureContext) {
          console.log('[PWA] Not a secure context, skipping SW registration');
          return;
        }
        
        const reg = await navigator.serviceWorker.register('/sw.js', {
          // Don't block page load
          updateViaCache: 'none',
          scope: '/'
        });
        
        setRegistration(reg);
        console.log('[PWA] Service worker registered successfully');
        
        // Non-blocking update check
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                setUpdateAvailable(true);
              }
            });
          }
        });
      } catch (error) {
        // SW registration failed - site continues to work normally
        // This is expected in some environments (e.g., when SW file is not found)
        console.log('[PWA] Service worker registration skipped:', 
          error instanceof Error ? error.message : 'Unknown error');
      }
    };

    // Register SW after page load to not block initial render
    if (document.readyState === 'complete') {
      registerSW();
    } else {
      window.addEventListener('load', registerSW, { once: true });
    }

    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }

    // Check if iOS
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(isIOSDevice);

    // Listen for install prompt
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    // Listen for app installed
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setInstallPrompt(null);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  // If a new Service Worker takes control, reload to ensure the UI uses the new build.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const handleControllerChange = () => {
      if (refreshingRef.current) {
        window.location.reload();
      }
    };

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };
  }, []);

  const install = async () => {
    if (!installPrompt) return false;
    
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setInstallPrompt(null);
      return true;
    }
    
    return false;
  };

  const checkForUpdates = useCallback(async () => {
    if (registration) {
      await registration.update();
    }
  }, [registration]);

  const applyUpdate = useCallback(() => {
    if (!registration) return;

    // Mark that we want to refresh when the updated SW becomes controller.
    refreshingRef.current = true;

    // Preferred path: waiting worker exists (update already downloaded).
    if (registration.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      return;
    }

    // Fallback: ask browser to check for a new SW; user can click again if needed.
    registration.update().catch(() => {
      // If update fails, we avoid breaking the app.
      refreshingRef.current = false;
    });
  }, [registration]);

  // Unregister service worker completely (if user wants to disable PWA features)
  const unregisterSW = useCallback(async () => {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const reg of registrations) {
        await reg.unregister();
      }
      // Clear any remaining caches
      const cacheNames = await caches.keys();
      for (const name of cacheNames) {
        await caches.delete(name);
      }
      return true;
    }
    return false;
  }, []);

  return {
    canInstall: !!installPrompt && !isInstalled,
    isInstalled,
    isIOS,
    install,
    updateAvailable,
    checkForUpdates,
    applyUpdate,
    unregisterSW,
  };
}
