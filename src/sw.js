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
      try {
        const response = await fetch(request);
        if (shouldCache(request, response)) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        }
        const fallback = await resolveEntryAssetFallback(request, response);
        if (fallback) return fallback;
        return response;
      } catch {
        const fallback = await resolveEntryAssetFallback(request, null);
        if (fallback) return fallback;
        if (cached) return cached;
        throw new Error('Network unavailable and no cached response');
      }
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

function isEntryAssetRequest(request, ext) {
  try {
    const url = new URL(request.url);
    return new RegExp(`^/assets/index-[^/]+\\.${ext}$`).test(url.pathname);
  } catch {
    return false;
  }
}

function isBrokenAssetResponse(request, response) {
  if (!response) return true;
  if (!response.ok) return true;
  return !isExpectedResponseForRequest(request, response);
}

async function resolveEntryAssetFallback(request, response) {
  const wantsCss = request.destination === 'style' && isEntryAssetRequest(request, 'css');
  const wantsJs = request.destination === 'script' && isEntryAssetRequest(request, 'js');
  if (!wantsCss && !wantsJs) return null;
  if (!isBrokenAssetResponse(request, response)) return null;
  return fetchLatestEntryAsset(wantsCss ? 'css' : 'js');
}

async function fetchLatestEntryAsset(type) {
  try {
    const probeUrl = `/?sw_asset_probe=${Date.now()}`;
    const page = await fetch(probeUrl, { cache: 'no-store' });
    if (!page.ok) return null;
    const html = await page.text();
    const regex = type === 'css'
      ? /href=["'](\/assets\/index-[^"']+\.css)["']/i
      : /src=["'](\/assets\/index-[^"']+\.js)["']/i;
    const match = html.match(regex);
    if (!match?.[1]) return null;
    const assetUrl = new URL(match[1], self.location.origin).toString();
    const asset = await fetch(assetUrl, { cache: 'no-store' });
    if (!asset.ok) return null;
    const assetRequest = new Request(assetUrl);
    const assetCopy = asset.clone();
    caches.open(CACHE_NAME).then((cache) => cache.put(assetRequest, assetCopy));
    return asset;
  } catch {
    return null;
  }
}
