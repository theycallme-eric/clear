/**
 * DS-06 — atmosphere assignment.
 *
 * The five-layer ground, the overlays, the keyframes, the reduced-motion
 * fallback and the three intensity levels all ship in the export
 * (`.clr-atmosphere` + `data-atmosphere`, ATOMIC.md §7.2). What this module
 * owns is the *assignment*: the level each screen declares in
 * `docs/specs/IA.md` §4, as data the app can resolve from a pathname.
 *
 * The table below is a transcription of IA.md §4 and nothing else. When a
 * screen's documented level changes there, it changes here — never the other
 * way round.
 */
import { matchPath } from 'react-router-dom'

/** `data-atmosphere` values defined by ATOMIC.md §7.2. */
export type AtmosphereLevel = 'full' | 'quiet' | 'operational'

export interface ScreenAtmosphere {
  /** Screen name exactly as IA.md §4 heads it. */
  screen: string
  /** Route pattern, or null for a screen that has no route of its own. */
  path: string | null
  /** The level IA.md §4 records for that screen. */
  level: AtmosphereLevel
  /**
   * True for an extra route pattern covering an entry IA.md §4 writes as one
   * screen — Settings "+ 4 sub-views", the gallery's two sections. Not a screen
   * of its own, so nothing should count it as one.
   */
  alias?: true
}

/**
 * Every screen in IA.md §4, in document order. Screens whose routes have not
 * been built yet still declare their level: the root layout resolves by
 * pathname, so each screen inherits its documented atmosphere on the day its
 * route lands rather than having to remember to set one.
 */
export const SCREEN_ATMOSPHERE: readonly ScreenAtmosphere[] = [
  { screen: 'Welcome', path: '/welcome', level: 'full' },
  { screen: 'OTP Login', path: '/login', level: 'quiet' },
  { screen: 'Onboarding', path: '/onboarding', level: 'quiet' },
  { screen: 'Home', path: '/', level: 'full' },
  { screen: 'Generate', path: '/generate', level: 'quiet' },
  // Transient: GEN-05 renders it inside whichever route started generation.
  { screen: 'Loading', path: null, level: 'full' },
  { screen: 'Review', path: '/review', level: 'quiet' },
  { screen: 'Workout', path: '/workout', level: 'operational' },
  { screen: 'Summary', path: '/summary', level: 'quiet' },
  { screen: 'History', path: '/history', level: 'quiet' },
  { screen: 'Session Detail', path: '/history/:id', level: 'quiet' },
  { screen: 'Settings', path: '/settings', level: 'quiet' },
  { screen: 'Settings sub-views', path: '/settings/*', level: 'quiet', alias: true },
  { screen: 'Component Gallery', path: '/dev/gallery', level: 'quiet' },
  {
    screen: 'Component Gallery sections',
    path: '/dev/gallery/*',
    level: 'quiet',
    alias: true,
  },
  // Declared last: `*` claims anything the screens above did not.
  { screen: 'Not Found', path: '*', level: 'full' },
] as const

/**
 * IA.md §4 gives the `*` route `full` — a brand moment. The table's own `*`
 * entry claims every unmatched pathname; this constant is the same answer for
 * a caller resolving a level before a route exists to match.
 */
export const DEFAULT_ATMOSPHERE: AtmosphereLevel = 'full'

const ROUTED_SCREENS = SCREEN_ATMOSPHERE.filter(
  (entry): entry is ScreenAtmosphere & { path: string } => entry.path !== null,
)

/** Exact patterns win over splat patterns: `/settings` is not a sub-view. */
const EXACT_SCREENS = ROUTED_SCREENS.filter((entry) => !entry.path.includes('*'))
const SPLAT_SCREENS = ROUTED_SCREENS.filter((entry) => entry.path.includes('*'))

/** The documented level for a pathname, or `full` for anything unrouted. */
export function resolveAtmosphere(pathname: string): AtmosphereLevel {
  for (const entry of [...EXACT_SCREENS, ...SPLAT_SCREENS]) {
    if (matchPath(entry.path, pathname) !== null) {
      return entry.level
    }
  }

  return DEFAULT_ATMOSPHERE
}

/** The documented level for a screen that renders without a route of its own. */
export function screenAtmosphere(screen: string): AtmosphereLevel {
  const entry = SCREEN_ATMOSPHERE.find((candidate) => candidate.screen === screen)

  if (entry === undefined) {
    throw new Error(`No atmosphere is documented for the screen "${screen}"`)
  }

  return entry.level
}
