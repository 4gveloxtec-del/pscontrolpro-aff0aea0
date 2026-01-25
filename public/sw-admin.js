/**
 * ADMIN SERVICE WORKER - Notifications Only (Production Safe)
 * 
 * This is a minimal service worker for the admin panel.
 * It does NOT cache any resources or block network requests.
 * 
 * IMPORTANT: Fetch events are ignored - all requests go directly to network.
 * Cache is cleared on every install to ensure fresh deploys work correctly.
 * 
 * Version: 3.0.0 - Vercel/Production/Deploy compatible
 */

const SW_VERSION = 'admin-prod-safe-v3';

try {
  // Install event - clear all caches, don't block
  self.addEventListener('install', (event) => {
    console.log('[SW-Admin] Installing v' + SW_VERSION);
    
    event.waitUntil(
      caches.keys()
        .then((cacheNames) => Promise.all(
          cacheNames.map((cacheName) => {
            console.log('[SW-Admin] Clearing cache:', cacheName);
            return caches.delete(cacheName);
          })
        ))
        .then(() => console.log('[SW-Admin] All caches cleared'))
        .catch((error) => console.error('[SW-Admin] Cache clear error:', error))
    );
    
    self.skipWaiting();
  });

  // Activate event - take control immediately
  self.addEventListener('activate', (event) => {
    console.log('[SW-Admin] Activating v' + SW_VERSION);
    
    event.waitUntil(
      Promise.all([
        caches.keys()
          .then((names) => Promise.all(names.map((n) => caches.delete(n))))
          .catch((error) => console.error('[SW-Admin] Activate cache clear error:', error)),
        self.clients.claim()
      ]).catch((error) => console.error('[SW-Admin] Activate error:', error))
    );
  });

  // Push notification handling
  self.addEventListener('push', (event) => {
    if (!event.data) return;
    
    let data = {
      title: 'PSControl Admin',
      body: 'Você tem uma nova notificação',
      icon: '/admin-icon-192.png',
      badge: '/admin-icon-192.png',
      data: { url: '/admin/dashboard' }
    };

    try {
      const payload = event.data.json();
      data = {
        title: payload.title || data.title,
        body: payload.body || data.body,
        icon: payload.icon || data.icon,
        badge: payload.badge || data.badge,
        data: payload.data || data.data
      };
    } catch (e) {
      console.error('[SW-Admin] Push payload parse error:', e);
      return;
    }

    const options = {
      body: data.body,
      icon: data.icon,
      badge: data.badge,
      vibrate: [100, 50, 100],
      data: data.data,
      requireInteraction: false,
      actions: [
        { action: 'open', title: 'Abrir' },
        { action: 'close', title: 'Fechar' }
      ]
    };

    event.waitUntil(
      self.registration.showNotification(data.title, options).catch((error) => console.error('[SW-Admin] Show notification error:', error))
    );
  });

  // Notification click handling
  self.addEventListener('notificationclick', (event) => {
    try {
      event.notification.close();

      if (event.action === 'close') return;

      const urlToOpen = event.notification.data?.url || '/admin/dashboard';

      event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true })
          .then((clientList) => {
            for (const client of clientList) {
              if (client.url.includes(self.location.origin) && 'focus' in client) {
                client.navigate(urlToOpen);
                return client.focus();
              }
            }
            if (self.clients.openWindow) {
              return self.clients.openWindow(urlToOpen);
            }
          })
          .catch((error) => console.error('[SW-Admin] Notification click handler error:', error))
      );
    } catch (e) {
      console.error('[SW-Admin] Notification click error:', e);
    }
  });

  // Fetch event - NEVER intercept
  self.addEventListener('fetch', () => {
    return;
  });

  // Message handling
  self.addEventListener('message', (event) => {
    if (!event.data) return;
    
    try {
      switch (event.data.type) {
        case 'SKIP_WAITING':
          self.skipWaiting();
          break;
          
        case 'CLEAR_CACHES':
          caches.keys()
            .then((names) => Promise.all(names.map((n) => caches.delete(n))))
            .catch((error) => console.error('[SW-Admin] Clear caches error:', error));
          break;
          
        case 'UNREGISTER':
          self.registration.unregister().catch((error) => console.error('[SW-Admin] Unregister error:', error));
          break;
          
        case 'GET_VERSION':
          if (event.source) {
            event.source.postMessage({ type: 'SW_VERSION', version: SW_VERSION });
          }
          break;
      }
    } catch (e) {
      console.error('[SW-Admin] Message handler error:', e);
    }
  });

} catch (globalError) {
  console.error('[SW-Admin] Setup error (non-fatal):', globalError);
}

console.log('[SW-Admin] Service Worker v' + SW_VERSION + ' loaded');
