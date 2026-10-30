/**
 * PWA-01 — the app-shell service worker.
 *
 * It caches the shell and nothing else. Data offline is OFF-01 (M3), so every
 * API response here is network-only and is never written to a cache: a stale
 * workout or a cached session would be worse than no answer.
 *
 * Two failure modes this is shaped against:
 *
 * 1. **The stale-shell trap.** A cache-first document means a deploy never
 *    reaches anyone who already has the old one. So the document is
 *    network-first — the cached copy is the offline fallback, never the
 *    preferred answer — the worker takes over as soon as it installs, and
 *    every cache from an older version is deleted on activation.
 * 2. **A half-cached shell.** Vite fingerprints its assets, so a cached
 *    `/assets/*` file is immutable and cache-first is safe. The document is
 *    precached at install so a first offline load has something to render.
 *
 * Tested behaviourally in `src/test/service-worker.test.ts`, which runs this
 * file against a fabricated worker scope.
 */

// Bump to invalidate every cached shell at once. `activate` deletes anything
// that does not match, so an old deploy's cache cannot outlive it.
const CACHE = 'clear-shell-v1'

const SHELL_DOCUMENT = '/index.html'

/** The shell, minus the fingerprinted assets, which are cached as requested. */
const PRECACHE = [
  '/',
  SHELL_DOCUMENT,
  '/manifest.webmanifest',
  '/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon-180.png',
]

/**
 * Same-origin paths that are data, not shell. Supabase and Anthropic are
 * cross-origin and are excluded by the origin check on their own; this covers
 * anything the deployment serves from its own host.
 */
const DATA_PATHS = [/^\/api\//, /^\/rest\/v1\//, /^\/auth\/v1\//, /^\/functions\/v1\//]

/** What the shell is made of, by request destination and by path. */
const SHELL_DESTINATIONS = ['script', 'style', 'font', 'image', 'manifest']

function isShellAsset(request, url) {
  return (
    url.pathname.startsWith('/assets/') ||
    SHELL_DESTINATIONS.indexOf(request.destination) !== -1
  )
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await self.caches.open(CACHE)
      await cache.addAll(PRECACHE)
      // Activate over the previous worker rather than waiting for every tab to
      // close — the new shell is the one that matches the new deploy.
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await self.caches.keys()
      await Promise.all(
        names
          .filter((name) => name !== CACHE)
          .map((name) => self.caches.delete(name)),
      )
      // Control the pages that are already open, so the next navigation in
      // this tab is served by this worker and not by the network alone.
      await self.clients.claim()
    })(),
  )
})

/**
 * Network-first: a deploy is visible on the next load, and the cache is only
 * consulted when the network cannot answer at all.
 */
async function documentFromNetwork(request) {
  const cache = await self.caches.open(CACHE)

  try {
    const response = await fetch(request)
    if (response.ok) {
      await cache.put(SHELL_DOCUMENT, response.clone())
    }
    return response
  } catch (error) {
    const cached =
      (await cache.match(SHELL_DOCUMENT)) || (await cache.match('/'))
    if (cached) return cached
    throw error
  }
}

/** Cache-first: these URLs are fingerprinted, so a hit is never stale. */
async function assetFromCache(request) {
  const cache = await self.caches.open(CACHE)
  const cached = await cache.match(request)
  if (cached) return cached

  const response = await fetch(request)
  if (response.ok) {
    await cache.put(request, response.clone())
  }
  return response
}

self.addEventListener('fetch', (event) => {
  const request = event.request

  // Anything not answered below falls through to the network untouched and is
  // never written to a cache: other methods, other origins, and data.
  if (request.method !== 'GET') return

  const url = new URL(request.url, self.location.href)
  if (url.origin !== self.location.origin) return
  if (DATA_PATHS.some((pattern) => pattern.test(url.pathname))) return

  if (request.mode === 'navigate') {
    event.respondWith(documentFromNetwork(request))
    return
  }

  if (isShellAsset(request, url)) {
    event.respondWith(assetFromCache(request))
  }
})
