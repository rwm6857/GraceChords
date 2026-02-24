// Include the version query from registration URL so each deploy gets
// an isolated cache namespace.
const swUrl = new URL(self.location.href);
const CACHE_VERSION = swUrl.searchParams.get('v') || 'dev';
const CACHE_NAME = `gracechords-${CACHE_VERSION}`;
const STATIC_ASSETS = [
  '/fonts/NotoSans-Regular.ttf',
  '/fonts/NotoSans-Bold.ttf',
  '/fonts/NotoSans-Italic.ttf',
  '/fonts/NotoSans-BoldItalic.ttf',
  '/fonts/NotoSansMono-Regular.ttf',
  '/fonts/NotoSansMono-Bold.ttf'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(STATIC_ASSETS.map((asset) => cache.add(asset))).then(
        (results) => {
          results.forEach((result, i) => {
            if (result.status === 'rejected') {
              console.error(`Failed to cache ${STATIC_ASSETS[i]}`, result.reason);
            }
          });
        }
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Use a network-first strategy for navigation requests to avoid serving a
// potentially stale index.html that references outdated assets. Other requests
// still fall back to a cache-first approach.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  // Always try the network first for dynamic content that changes frequently
  // so edits to songs and the index show up without manual cache busting.
  if (request.url.includes('/songs/') || request.url.includes('/src/data/index.json')) {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Always try the network first for navigations (HTML documents)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      const usableCached = isExpectedResponseForRequest(request, cached) ? cached : null;
      if (usableCached) return usableCached;
      const response = await fetch(request);
      const copy = response.clone();
      if (shouldCache(request, response)) {
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      }
      return response;
    })()
  );
});

function shouldCache(request, response) {
  if (!response || !response.ok) return false;
  if (!isExpectedResponseForRequest(request, response)) return false;
  return (
    (request.destination === 'script' ||
      request.destination === 'style' ||
      request.destination === 'font' ||
      request.destination === 'image' ||
      request.url.includes('/assets/') ||
      request.url.includes('/src/data/') ||
      // Cache individual song files
      request.url.includes('/songs/'))
  );
}

function isExpectedResponseForRequest(request, response) {
  if (!response) return false;
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (!contentType) return true;
  if (contentType.includes('text/html')) {
    return request.mode === 'navigate' || request.destination === 'document';
  }
  if (request.destination === 'style') return contentType.includes('text/css');
  if (request.destination === 'script') {
    return (
      contentType.includes('javascript') ||
      contentType.includes('ecmascript') ||
      contentType.includes('application/x-javascript')
    );
  }
  if (request.destination === 'font') {
    return contentType.includes('font/') || contentType.includes('application/font');
  }
  if (request.destination === 'image') return contentType.includes('image/');
  return true;
}
