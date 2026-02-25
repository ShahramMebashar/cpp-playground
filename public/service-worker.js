const CACHE_NAME = 'cpp-playground-v1';
const RUNTIME_CACHE = 'cpp-playground-runtime-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll([
        './',
        './index.html',
      ]),
    ),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

function isStaticAsset(requestUrl) {
  return requestUrl.pathname.includes('/assets/')
    || requestUrl.pathname.endsWith('.wasm')
    || requestUrl.pathname.endsWith('.mjs')
    || requestUrl.pathname.endsWith('.js')
    || requestUrl.pathname.endsWith('.css');
}

function isWasmerRelated(requestUrl) {
  return requestUrl.hostname.includes('wasmer')
    || requestUrl.hostname.includes('jsdelivr')
    || requestUrl.pathname.includes('wasmer');
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const requestUrl = new URL(request.url);
  if (requestUrl.protocol !== 'http:' && requestUrl.protocol !== 'https:') {
    return;
  }

  const shouldCache = isStaticAsset(requestUrl) || isWasmerRelated(requestUrl);

  if (!shouldCache) return;

  event.respondWith(
    (async () => {
      const runtime = await caches.open(RUNTIME_CACHE);
      const cached = await runtime.match(request);
      if (cached) return cached;

      try {
        const response = await fetch(request);
        if (response && (response.ok || response.type === 'opaque')) {
          try {
            await runtime.put(request, response.clone());
          } catch {
            // Ignore non-cacheable or unsupported requests.
          }
        }
        return response;
      } catch (err) {
        if (cached) return cached;
        throw err;
      }
    })(),
  );
});
