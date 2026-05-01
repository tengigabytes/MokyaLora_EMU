/**
 * MokyaLora Digital Twin — Service Worker
 * Cache-first strategy for offline PWA.
 * Web Serial API (USB) requires browser APIs, no network calls.
 */

const CACHE_VERSION = 'v44';
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
  './js/ui/colors.js',
  './js/ui/mief-font.js',
  './js/ui/icons.js',
  './js/ui/screen-manager.js',
  './js/ui/components/hint-bar.js',
  './js/ui/screens/chat-screen.js',
  './js/ui/screens/map-screen.js',
  './js/ui/screens/settings-screen.js',
  './js/ui/screens/home-screen.js',
  './js/ui/screens/menu-screen.js',
  './js/ui/screens/meshtastic-screen.js',
  './js/ui/screens/messages-screen.js',
  './js/ui/screens/nodes-screen.js',
  './js/ui/screens/nodes-data.js',
  './js/ui/screens/node-detail-screen.js',
  './js/ui/screens/mesh-config-screen.js',
  './js/ui/screens/mesh-modules-screen.js',
  './js/ui/screens/mesh-channels-screen.js',
  './js/ui/screens/mesh-settings-data.js',
  './js/ui/screens/mesh-config-store.js',
  './js/ui/screens/connect-screen.js',
  './js/ui/screens/sensors-screen.js',
  './js/ui/screens/battery-screen.js',
  './js/ui/screens/system-config-screen.js',
  './js/ui/screens/system-settings-data.js',
  './js/ui/screens/system-settings-store.js',
  './js/ui/screens/settings-list-screen.js',
  './js/ui/screens/field-edit-screen.js',
  './js/ui/screens/placeholder-screen.js',
  './js/ui/screens/drafts-store.js',
  './js/ui/screens/status-detail-screen.js',
  './js/ui/screens/sos-screen.js',
  './js/ui/screens/lock-screen.js',
  './js/ui/screens/_chrome.js',
  './js/ui/screens/settings-home-screen.js',
  './js/ui/screens/telemetry-hist-screen.js',
  './js/ui/screens/telemetry-screen.js',
  './js/ui/screens/tools-screen.js',
  './js/ui/screens/traceroute-screen.js',
  './js/ui/screens/range-test-screen.js',
  './js/ui/screens/spectrum-screen.js',
  './js/ui/screens/sniffer-screen.js',
  './js/ui/screens/lora-test-screen.js',
  './js/ui/screens/gnss-sky-screen.js',
  './js/ui/screens/pairing-screen.js',
  './js/ui/screens/firmware-info-screen.js',
  './js/ui/screens/canned-screen.js',
  './js/ui/screens/msg-detail-screen.js',
  './js/ui/screens/channel-add-screen.js',
  './js/ui/screens/channel-share-screen.js',
  './js/ui/screens/node-ops-screen.js',
  './js/ui/screens/remote-admin-screen.js',
  './js/ui/screens/my-node-screen.js',
  './js/ui/screens/map-nav-screen.js',
  './js/ui/screens/sos-standby-screen.js',
  './js/ui/screens/sos-config-screen.js',
  './js/serial/meshtastic-serial.js',
  './js/serial/meshtastic-frame.js',
  './js/serial/protobuf.js',
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
