// Offline support: every file the game needs is cached on first visit,
// then served from the cache. Bump VERSION whenever a file changes.
const VERSION = 'nonocat-v3';
const FILES = [
  './',
  'index.html',
  'css/style.css',
  'js/config.js',
  'js/rng.js',
  'js/solver.js',
  'js/generator.js',
  'js/pictures.js',
  'js/sync.js',
  'js/app.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()));
});

// Cache first, so the game opens instantly with no connection; refresh the
// cached copy in the background when the network is available.
self.addEventListener('fetch', (event) => {
  // Only the game's own files; online saves go straight to the network.
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/api/')) return;
  event.respondWith(
    caches.open(VERSION).then((cache) =>
      cache.match(event.request, { ignoreSearch: true }).then((hit) => {
        const fresh = fetch(event.request)
          .then((res) => {
            if (res.ok && new URL(event.request.url).origin === location.origin) cache.put(event.request, res.clone());
            return res;
          })
          .catch(() => hit);
        if (hit) {
          event.waitUntil(fresh);
          return hit;
        }
        return fresh;
      })));
});
