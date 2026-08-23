// Service Worker simples. Ele guarda os arquivos já visitados para permitir reabertura offline.
const CACHE = 'rsnv-v12';
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE));
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(event.request, copy));
      return response;
    }))
  );
});
