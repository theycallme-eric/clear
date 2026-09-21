/**
 * PWA-01 — registering the app-shell worker.
 *
 * The worker itself is `public/sw.js`: a plain file at the origin root, not a
 * bundled module, because its scope is the path it is served from and `/sw.js`
 * is what lets it control every route.
 *
 * Registration is deliberately late and deliberately quiet. It waits for
 * `load` so installing the shell never competes with rendering it, and a
 * failure is swallowed — an app that works online must not break because a
 * browser refused a worker (or because the page is on `http:`).
 */

/** Where the worker is served from, and the scope that path grants. */
export const SERVICE_WORKER_URL = '/sw.js'

type RegisterOptions = {
  /**
   * Off in dev by default: a worker that caches a shell would sit in front of
   * HMR, and the dev server already serves the real files.
   */
  enabled?: boolean
}

export function registerServiceWorker({
  enabled = import.meta.env.PROD,
}: RegisterOptions = {}): void {
  if (!enabled) return
  if (!('serviceWorker' in navigator)) return

  window.addEventListener(
    'load',
    () => {
      void navigator.serviceWorker
        .register(SERVICE_WORKER_URL, {
          scope: '/',
          // Never answer the update check from the HTTP cache: that is the
          // stale-shell trap one layer down from the worker's own logic.
          updateViaCache: 'none',
        })
        .catch(() => {
          // Intentionally silent — see the note above.
        })
    },
    { once: true },
  )
}
