/* eslint-disable */
// SanctuaryVoice service worker. Built by the `sanctuaryServiceWorker` plugin in vite.config.ts,
// which replaces the two placeholders below with the build's asset list and a content hash.
//
// Goal: the app must open with NO internet once it has been opened online at least once, so a
// missionary whose phone restarts or whose tab gets closed in the field can still use the offline
// speech/translation models already downloaded in Offline Ready.
//
// - App shell (index.html, hashed JS/CSS, audio worklet, icons): precached at install.
// - Page loads: network first (so online users always get the latest deploy), falling back to the
//   cached shell when offline or when the network is too slow to answer.
// - On-device engine code (transformers.js + ONNX runtime WASM from jsDelivr): cached on first use,
//   then served from the cache, so the offline engine no longer needs the CDN.
// - /api/* and everything else: never cached (cloud features need a live connection anyway).
// - Model weights live in transformers.js' own `transformers-cache`, which this worker never touches.

const CACHE_VERSION = '__CACHE_VERSION__';
const PRECACHE_URLS = __PRECACHE_URLS__;

const APP_CACHE_PREFIX = 'sv-app-';
const APP_CACHE = APP_CACHE_PREFIX + CACHE_VERSION;
const RUNTIME_CACHE = 'sv-engine-runtime-v1';
const NAVIGATION_TIMEOUT_MS = 4000;
const RUNTIME_CACHE_PREFIXES = [
  'https://cdn.jsdelivr.net/npm/@xenova/transformers@',
  'https://cdn.jsdelivr.net/npm/onnxruntime-web@',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(APP_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS.map((url) => new Request(url, { cache: 'reload' }))))
      // Activate right away: page loads are network-first, so a page running online already matches
      // this new version. The page shows a "tap to refresh" banner instead of reloading itself, so a
      // live sermon is never interrupted.
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
            .filter((key) => key.startsWith(APP_CACHE_PREFIX) && key !== APP_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'GET_VERSION' && event.ports[0]) event.ports[0].postMessage(CACHE_VERSION);
});

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

async function handleNavigation(request) {
  try {
    const response = await Promise.race([fetch(request), timeout(NAVIGATION_TIMEOUT_MS)]);
    if (response && response.ok) return response;
    throw new Error('bad response');
  } catch {
    const cache = await caches.open(APP_CACHE);
    const cached = (await cache.match('/')) || (await cache.match('/index.html'));
    if (cached) return cached;
    return fetch(request);
  }
}

async function handleAppAsset(request) {
  const cache = await caches.open(APP_CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  return cached || fetch(request);
}

async function handleEngineFile(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  // Only store complete, readable responses (never opaque or partial ones).
  if (response.ok && response.status === 200 && response.type !== 'opaque') {
    cache.put(request, response.clone()).catch(() => {});
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith('/api/')) return;
    if (request.mode === 'navigate') {
      event.respondWith(handleNavigation(request));
      return;
    }
    event.respondWith(handleAppAsset(request));
    return;
  }

  if (RUNTIME_CACHE_PREFIXES.some((prefix) => request.url.startsWith(prefix))) {
    event.respondWith(handleEngineFile(request));
  }
});
