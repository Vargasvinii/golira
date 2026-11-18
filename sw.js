// Service worker mínimo: só existe para o navegador reconhecer o site como instalável.
// Não guarda nada em cache de propósito, assim toda atualização aparece na hora.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
