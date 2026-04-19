/**
 * MokyaLora Digital Twin — Service Worker
 * Cache-first strategy for offline PWA.
 * Web Serial API (USB) requires browser APIs, no network calls.
 */

const CACHE_VERSION = 'v11';
const CACHE_NAME    = `mokya-twin-${CACHE_VERSION}`;

const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/device.css',
  './icons/icon-192.svg',
  './icons/icon-512.svg',
  './data/zhuyin-mock.json',
  './js/app.js',
  './js/hal/display-hal.js',
  './js/hal/keyboard-hal.js',
  './js/hal/mie-hal.js',
  './js/core/mie-processor.js',
  './js/core/mie-timer.js',
  './js/core/mie-trie.js',
  './js/ui/renderer.js',
  './js/ui/screen-manager.js',
  './js/ui/screens/chat-screen.js',
  './js/ui/screens/map-screen.js',
  './js/ui/screens/settings-screen.js',
  './js/serial/meshtastic-serial.js',
];

// Install: pre-cache all static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .catch(err => console.warn('[SW] Cache pre-fill partial failure:', err))
  );
  self.skipWaiting();
});

// Activate: remove old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch: network-first for HTML, cache-first for everything else
self.addEventListener('fetch', (event) => {
  const { url } = event.request;
  const u = new URL(url);

  // External CDN (Tailwind etc.) — network-first, fall back to cache
  if (u.hostname !== self.location.hostname) {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // index.html / root — always network-first so deploys are visible immediately
  const isHtml = u.pathname.endsWith('/') || u.pathname.endsWith('/index.html');
  if (isHtml) {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // All other local assets — cache-first
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
