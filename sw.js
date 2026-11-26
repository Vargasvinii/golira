// Service worker mínimo: só existe para o navegador reconhecer o site como instalável.
// Não guarda nada em cache de propósito, assim toda atualização aparece na hora.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});

// Notificações
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data.json(); } catch (x) { /* aviso sem texto */ }
  e.waitUntil(self.registration.showNotification(d.title || 'GOLIRA', { body: d.body || '', tag: d.tag, icon: '/icons/icon-192.png' }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((c) => (c[0] ? c[0].focus() : self.clients.openWindow('/'))));
});
