const CACHE_NAME = 'srs-puzzler-v3';
const BASE_PATH = new URL('./', self.registration.scope).pathname;
const appPath = (path) => `${BASE_PATH}${path.replace(/^\//, '')}`;
const APP_SHELL = [
  appPath('/'),
  appPath('/index.html'),
  appPath('/manifest.webmanifest'),
  appPath('/icon-192.svg'),
  appPath('/icon-512.svg'),
  appPath('/engine/stockfish.js'),
  appPath('/engine/stockfish.wasm')
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  const relativePath = requestUrl.pathname.startsWith(BASE_PATH)
    ? requestUrl.pathname.slice(BASE_PATH.length)
    : requestUrl.pathname;
  const networkFirst = requestUrl.origin === self.location.origin && (
    event.request.mode === 'navigate' ||
    relativePath === 'index.html' ||
    relativePath === 'manifest.webmanifest' ||
    relativePath === 'corpus/rating-shards/manifest.json'
  );

  event.respondWith(networkFirst ? networkFirstResponse(event.request) : cacheFirstResponse(event.request));
});

async function cacheResponse(request, response) {
  if (!response.ok || new URL(request.url).origin !== self.location.origin) return response;
  const copy = response.clone();
  await caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
  return response;
}

async function networkFirstResponse(request) {
  try {
    const response = await fetch(request);
    const isAsset = request.destination === 'script' || request.destination === 'style' || request.url.includes('/assets/');
    if (isAsset && response.headers.get('content-type')?.includes('text/html')) {
      throw new Error('Asset request returned HTML');
    }
    return cacheResponse(request, response);
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.mode === 'navigate') return caches.match(appPath('/index.html'));
    return new Response('', { status: 503, statusText: 'Offline' });
  }
}

async function cacheFirstResponse(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    return await cacheResponse(request, await fetch(request));
  } catch {
    return new Response('', { status: 503, statusText: 'Offline' });
  }
}
