/**
 * AtmosphereLayer — the export's ground, mounted once.
 *
 * The markup is the export's own (`css/foundation.css`, ATMOSPHERE): three
 * role-coloured blobs and the dim overlay, viewport-fixed so scrolling never
 * repaints it. Geometry and motion are the package's too — the blobs are sized
 * from the layer's longer side and drift and breathe by transform alone — so
 * this component carries no sizing and no intensity.
 *
 * Effects TASK-006: the export's scanline layer (`.clr-atmosphere__scan`) is
 * retired. The live CRT Glass field mounted by the root effects host is the one
 * decorative scanline signal, so the atmosphere no longer draws its own. The
 * layer reads the root Visual effects policy: when decorative motion is not
 * allowed (reduced motion, a hidden tab, effects off) the blobs hold still in
 * place — the same live DOM, never rasterised or remounted. Outside the root
 * provider (a specimen mounted alone) it falls back to the OS preference.
 */
import { useSyncExternalStore } from 'react'

import { useOptionalVisualEffects } from '../state/visual-effects'

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
  const policy = useOptionalVisualEffects()
  const prefersReducedMotion = usePrefersReducedMotion()

  return <AtmosphereGround still={policy ? !policy.motionAllowed : prefersReducedMotion} />
}

/**
 * The layer's markup alone, reading no preference. A surface that must render
 * after the tree failed — the crash fallback — passes `still` itself rather
 * than reading the store that may be what failed.
 */
export function AtmosphereGround({ still }: { still: boolean }) {
  return (
    <div
      aria-hidden="true"
      className="clr-atmosphere clr-atmosphere--fixed"
      data-static={still ? 'true' : undefined}
    >
      <span className="clr-atmosphere__blob clr-atmosphere__blob--structure" />
      <span className="clr-atmosphere__blob clr-atmosphere__blob--interaction" />
      <span className="clr-atmosphere__blob clr-atmosphere__blob--info" />
      <span className="clr-atmosphere__overlay" />
    </div>
  )
}
