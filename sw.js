/* ════════════════════════════════════════════════════════════════
   CutNest Service Worker
   Strategy:
   - Pages (HTML): NETWORK-FIRST. Users always get your latest
     deploy when online; the cached copy is only used offline.
     This means pushing updates to GitHub works exactly as before.
   - Static assets & fonts: CACHE-FIRST for instant loads.
   - Never touches POST requests (licence key validation),
     Lemon Squeezy, or Google Analytics.
   To force-refresh every user's cache after a big change,
   bump the VERSION string below.
   ════════════════════════════════════════════════════════════════ */

const VERSION = 'cutnest-v10';

const PRECACHE = [
  '/',
  '/index.html',
  '/app.html',
  '/manifest.webmanifest',
  '/og-image.png',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(VERSION)
      .then(function (cache) { return cache.addAll(PRECACHE); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(
          keys.filter(function (k) { return k !== VERSION; })
              .map(function (k) { return caches.delete(k); })
        );
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  const req = event.request;

  // Only ever handle GET. POSTs (licence validation) pass straight through.
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }

  // Never intercept payments or analytics.
  if (url.hostname.indexOf('lemonsqueezy.com') !== -1 ||
      url.hostname.indexOf('googletagmanager.com') !== -1 ||
      url.hostname.indexOf('google-analytics.com') !== -1) {
    return;
  }

  // ── Page navigations: network-first, cache fallback ──
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(function (res) {
          const copy = res.clone();
          caches.open(VERSION).then(function (cache) { cache.put(req, copy); });
          return res;
        })
        .catch(function () {
          return caches.match(req).then(function (hit) {
            if (hit) return hit;
            // Offline and this exact page not cached: serve the right precached page
            const fallback = url.pathname.indexOf('app') !== -1 ? '/app.html' : '/index.html';
            return caches.match(fallback);
          });
        })
    );
    return;
  }

  // ── Fonts + same-origin assets: cache-first ──
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  const isSameOrigin = url.origin === self.location.origin;

  if (isFont || isSameOrigin) {
    event.respondWith(
      caches.match(req).then(function (hit) {
        if (hit) return hit;
        return fetch(req).then(function (res) {
          if (res && (res.status === 200 || res.type === 'opaque')) {
            const copy = res.clone();
            caches.open(VERSION).then(function (cache) { cache.put(req, copy); });
          }
          return res;
        });
      })
    );
  }
  // Everything else: default browser behaviour.
});
