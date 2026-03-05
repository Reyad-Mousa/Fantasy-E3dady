/* Default empty service worker to prevent 404/MIME errors */
self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
    // Simple pass-through
    event.respondWith(fetch(event.request));
});
