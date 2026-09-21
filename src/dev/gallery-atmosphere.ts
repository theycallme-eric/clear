/**
 * DS-06's three intensity levels, as data the gallery can iterate.
 *
 * The levels themselves belong to the export (ATOMIC.md §7.2) and their type to
 * `src/app/atmosphere.ts`; what is written here is the list and a reviewer-facing
 * label for each. The record is keyed by the app's own union, so a fourth level
 * could not be introduced without this file failing to compile — which is what
 * keeps "the atmosphere switcher cycles all three levels" true of whatever the
 * union says rather than of what it said today.
 */
import type { AtmosphereLevel } from '../app/atmosphere'

/** What each level is for, in the words IA.md §4 uses for it. */
export const ATMOSPHERE_LABELS: Record<AtmosphereLevel, string> = {
  full: 'full — brand moments',
  quiet: 'quiet — reading and input',
  operational: 'operational — glanceability first',
}

/** Every level, in the order foundation.css declares them. */
export const ATMOSPHERE_LEVELS = Object.keys(
  ATMOSPHERE_LABELS,
) as readonly AtmosphereLevel[]
