/**
 * AtmosphereLayer — the export's five-layer ground, mounted once.
 *
 * The markup is the export's own (`templates/app-shell/AppShell.dc.html`):
 * three role-coloured blobs, the dim overlay and the scanlines, viewport-fixed
 * so scrolling never repaints it. Intensity is not this component's business —
 * it reads whatever `data-atmosphere` the document carries (ATOMIC.md §7.2),
 * which is what lets one mount serve every screen.
 *
 * Under `prefers-reduced-motion` the layer renders its static fallback: the
 * export's media query already stops the blob drift, and the scanlines — the
 * one remaining source of apparent movement — are dropped entirely.
 */
import { useSyncExternalStore } from 'react'

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

/** The OS preference is an external store, so read it as one — it can flip mid-session. */
function subscribeToReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION_QUERY)

  query.addEventListener('change', onChange)

  return () => query.removeEventListener('change', onChange)
}

function readReducedMotion(): boolean {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches
}

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeToReducedMotion, readReducedMotion)
}

export function AtmosphereLayer() {
  const prefersReducedMotion = usePrefersReducedMotion()

  return (
    <div
      aria-hidden="true"
      className="clr-atmosphere clr-atmosphere--fixed"
      data-static={prefersReducedMotion ? 'true' : undefined}
    >
      <span className="clr-atmosphere__blob clr-atmosphere__blob--structure" />
      <span className="clr-atmosphere__blob clr-atmosphere__blob--interaction" />
      <span className="clr-atmosphere__blob clr-atmosphere__blob--info" />
      <span className="clr-atmosphere__overlay" />
      {prefersReducedMotion ? null : <span className="clr-atmosphere__scan" />}
    </div>
  )
}
