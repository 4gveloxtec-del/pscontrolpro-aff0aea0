import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Hook que detecta se o app está em modo ADM e gerencia o manifest/tema dinamicamente
 * - Rotas /admin/* usam manifest-admin.json
 * - Outras rotas usam manifest.json (revendedor)
 */
export function useAdminManifest() {
  const location = useLocation();
  
  useEffect(() => {
    const isAdminRoute = location.pathname.startsWith('/admin');
    
    const manifestLink = document.querySelector('link[rel="manifest"]');
    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    const appleTouchIcon = document.querySelector('link[rel="apple-touch-icon"]');
    const appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    
    if (isAdminRoute) {
      // Configurar para Admin PWA
      if (manifestLink) {
        manifestLink.setAttribute('href', '/manifest-admin.json');
      }
      if (themeColorMeta) {
        themeColorMeta.setAttribute('content', '#1e40af');
      }
      if (appleTouchIcon) {
        appleTouchIcon.setAttribute('href', '/admin-icon-192.png');
      }
      if (appleTitle) {
        appleTitle.setAttribute('content', 'ADM');
      }
      document.title = 'Painel ADM - Sistema de Gestão';
      
      // Registrar service worker do admin
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw-admin.js', { scope: '/' })
          .catch(() => {
            // Silently fail
          });
      }
    } else {
      // Configurar para Revendedor PWA
      if (manifestLink) {
        manifestLink.setAttribute('href', '/manifest.json');
      }
      if (themeColorMeta) {
        themeColorMeta.setAttribute('content', '#e50914');
      }
      if (appleTouchIcon) {
        appleTouchIcon.setAttribute('href', '/icon-192.png');
      }
      if (appleTitle) {
        appleTitle.setAttribute('content', 'PSControl');
      }
      // Registrar service worker do revendedor
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js', { scope: '/' })
          .catch(() => {
            // Silently fail
          });
      }
    }
  }, [location.pathname]);
}

/**
 * Componente wrapper que aplica o hook de manifest
 */
export function AdminManifestProvider({ children }: { children: React.ReactNode }) {
  useAdminManifest();
  return <>{children}</>;
}
