/**
 * Paydown's service worker, built to `sw.js` by the plugin in `vite.config.ts`.
 *
 * It caches the app's own static files so the installed app opens offline. It never sees
 * loan data: loans live in localStorage, and `#open=` links never reach the network.
 * It must stay free of imports so the build emits it as one classic script.
 */
export {};

declare const self: ServiceWorkerGlobalScope;

type Precache = { version: string; urls: string[] };

// The build replaces this placeholder with the real file list.
const precache = JSON.parse('__PAYDOWN_PRECACHE__') as Precache;

const CACHE_PREFIX = 'paydown-';
const cacheName = `${CACHE_PREFIX}${precache.version}`;
const scope = self.registration.scope;
const shellUrl = new URL('index.html', scope).href;

// On a weak connection, open the cached app rather than wait on the network.
const NAVIGATION_TIMEOUT_MS = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(cacheName)
      .then((cache) =>
        cache.addAll(precache.urls.map((url) => new Request(url, { cache: 'reload' }))),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== cacheName)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || !request.url.startsWith(scope)) {
    return;
  }

  event.respondWith(request.mode === 'navigate' ? networkFirst(request) : cacheFirst(request));
});

// Pages come from the network when it answers, so a deploy shows on the next launch.
async function networkFirst(request: Request): Promise<Response> {
  const network = fetch(request);
  network.catch(() => undefined);
  const timeout = new Promise<undefined>((resolve) => {
    setTimeout(resolve, NAVIGATION_TIMEOUT_MS, undefined);
  });

  try {
    const response = await Promise.race([network, timeout]);
    if (response) {
      return response;
    }
  } catch {
    // Offline: fall back to the cached app below.
  }

  const cached = await caches.match(shellUrl, { cacheName, ignoreVary: true });
  return cached ?? network;
}

// Built files have content hashes in their names, so a cached copy is never stale.
async function cacheFirst(request: Request): Promise<Response> {
  const cache = await caches.open(cacheName);
  // Servers may send `Vary: Origin`, and Vite's crossorigin script tags send an Origin
  // header the install-time requests lacked, so the cached copy would never match.
  const cached = await cache.match(request, { ignoreVary: true });
  if (cached) {
    return cached;
  }

  const response = await fetch(request);
  // Files left out of the precache, like the encrypted set a file, work offline once fetched.
  if (response.ok && response.type === 'basic') {
    await cache.put(request, response.clone());
  }
  return response;
}
