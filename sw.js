/* ==========================================================================
   EuLog — Bulletproof Offline-First PWA Service Worker (v8)
   - App Shell & 2,154-Food DB: Cache-First + background Stale-While-Revalidate
     so EuLog opens instantaneously in Airplane Mode with zero internet.
   - AI Runtime & SigLIP Weights (cdn.jsdelivr.net / huggingface.co): Cached
     in a persistent separate cache so SigLIP also works offline after first
     use or Preload.
   ========================================================================== */

const APP_CACHE = 'eulog-offline-v12';
const AI_CACHE = 'eulog-ai-cache-v1';

const APP_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './foods-db.js',
  './greek-foods-2000.js',
  './nutrients.js',
  './supplements.js',
  './storage.js',
  './siglip-embeddings.js',
  './siglip-vision.js',
  './siglip-worker.js',
  './app.js',
  './manifest.json',
  './icon.svg',
  './favicon-32.png',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-192.png',
  './icon-maskable-512.png',
];

const AI_HOSTS = [
  'cdn.jsdelivr.net',
  'huggingface.co',
  'cdn-lfs.hf.co',
  'cdn-lfs-us-1.hf.co',
  'cdn-lfs.huggingface.co',
  'cas-bridge.xethub.hf.co',
];

function isAiAssetUrl(url) {
  return AI_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(APP_CACHE)
      .then(async (cache) => {
        // Cache each asset individually so a single redirect/blip never aborts offline install
        await Promise.allSettled(
          APP_ASSETS.map(async (asset) => {
            const req = new Request(asset, { cache: 'reload' });
            const res = await fetch(req);
            if (res && res.ok) {
              await cache.put(asset, res.clone());
            }
          })
        );
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== APP_CACHE && k !== AI_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // 1. Cross-origin AI runtime & SigLIP weights: Cache-first in persistent AI_CACHE
  if (url.origin !== self.location.origin) {
    if (isAiAssetUrl(url)) {
      event.respondWith(
        caches.open(AI_CACHE).then(async (cache) => {
          const cached = await cache.match(event.request);
          if (cached) return cached;
          try {
            const res = await fetch(event.request);
            if (res && (res.ok || res.type === 'opaque')) {
              cache.put(event.request, res.clone()).catch(() => {});
            }
            return res;
          } catch {
            return new Response('', { status: 503, statusText: 'Offline' });
          }
        })
      );
      return;
    }

    // Google Fonts: try cache first, fall back cleanly without hanging offline
    if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
      event.respondWith(
        caches.open(APP_CACHE).then(async (cache) => {
          const cached = await cache.match(event.request);
          if (cached) return cached;
          try {
            const res = await fetch(event.request);
            if (res && res.ok) cache.put(event.request, res.clone()).catch(() => {});
            return res;
          } catch {
            return new Response('', { status: 200, headers: { 'Content-Type': 'text/css' } });
          }
        })
      );
    }
    return;
  }

  // 2. Navigation requests (opening/refreshing PWA offline):
  //    Serve cached index.html immediately, revalidate in background when online.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.open(APP_CACHE).then(async (cache) => {
        const cached =
          (await cache.match(event.request, { ignoreSearch: true })) ||
          (await cache.match('./index.html')) ||
          (await cache.match('./'));

        const networkUpdate = fetch(event.request)
          .then((res) => {
            if (res && res.ok) {
              cache.put('./index.html', res.clone()).catch(() => {});
              cache.put('./', res.clone()).catch(() => {});
            }
            return res;
          })
          .catch(() => null);

        if (cached) {
          event.waitUntil(networkUpdate);
          return cached;
        }
        const net = await networkUpdate;
        return net || new Response('Offline — please open EuLog once while online to cache.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain' },
        });
      })
    );
    return;
  }

  // 3. Same-origin app assets (CSS, JS, 2,154 foods DB, embeddings, worker, icons):
  //    Cache-First + background Stale-While-Revalidate => instant Airplane Mode startup!
  event.respondWith(
    caches.open(APP_CACHE).then(async (cache) => {
      const cached = await cache.match(event.request, { ignoreSearch: true });

      const networkUpdate = fetch(event.request)
        .then((res) => {
          if (res && res.ok) {
            cache.put(event.request, res.clone()).catch(() => {});
          }
          return res;
        })
        .catch(() => null);

      if (cached) {
        event.waitUntil(networkUpdate);
        return cached;
      }

      const net = await networkUpdate;
      return net || new Response('', { status: 503, statusText: 'Offline' });
    })
  );
});
