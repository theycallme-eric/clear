/**
 * DS-06's atmosphere, as data the gallery can iterate.
 *
 * CLEAR 0.14.3 ships one atmosphere: its Quiet and Operational modes were
 * removed in 0.11.2, and `data-atmosphere` selects nothing in the shipped CSS
 * (ATOMIC.md §5.2). The gallery therefore frames the one atmosphere production
 * uses, never a removed mode for comparison — a specimen of a retired option
 * reads as guidance.
 *
 * The type still comes from `src/app/atmosphere.ts`, whose union keeps the
 * retired names only for the switcher in `GalleryRoute.tsx` (ledger F-03).
 */
import { DEFAULT_ATMOSPHERE, type AtmosphereLevel } from '../app/atmosphere'

/** What the one atmosphere is, for a reviewer. */
export const ATMOSPHERE_LABELS: Readonly<Partial<Record<AtmosphereLevel, string>>> = {
  [DEFAULT_ATMOSPHERE]: 'full — the one atmosphere, on every screen',
}

/** Every atmosphere the package ships: one. */
export const ATMOSPHERE_LEVELS: readonly AtmosphereLevel[] = [DEFAULT_ATMOSPHERE]
