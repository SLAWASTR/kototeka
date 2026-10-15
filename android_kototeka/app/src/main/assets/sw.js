const CACHE_NAME = 'kototeka-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/app.css',
  './js/db.js',
  './js/camera.js',
  './js/map.js',
  './js/achievements.js',
  './js/app.js',
  './icons/cat-icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/paw.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS).catch((err) => {
        console.warn('Cache addAll error (normal for first run with external assets):', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // If it's a tile request from openstreetmap, network-first with cache fallback
  if (event.request.url.includes('tile.openstreetmap.org')) {
    event.respondWith(
      caches.open('kototeka-tiles').then((cache) => {
        return fetch(event.request)
          .then((response) => {
            cache.put(event.request, response.clone());
            return response;
          })
          .catch(() => cache.match(event.request));
      })
    );
    return;
  }

  // Standard cache-first for local static assets
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request).catch(() => {
        if (event.request.destination === 'document') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
