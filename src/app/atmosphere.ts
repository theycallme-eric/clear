/**
 * CLEAR 0.9.7 atmosphere assignment.
 *
 * The five-layer ground, the overlays, the keyframes, the reduced-motion
 * fallback and the available intensity values all ship in the export. The
 * application contract is deliberately narrower: every production screen uses
 * Full. Quiet and Operational remain available to the development gallery for
 * comparison, but route selection cannot opt into them.
 *
 * The table below is a transcription of IA.md §4 and nothing else. When a
 * screen's documented level changes there, it changes here — never the other
 * way round.
 */
/** Values still defined by the vendored package and shown in the dev gallery. */
export type AtmosphereLevel = 'full' | 'quiet' | 'operational'

export interface ScreenAtmosphere {
  /** Screen name exactly as IA.md §4 heads it. */
  screen: string
  /** Route pattern, or null for a screen that has no route of its own. */
  path: string | null
  /** The production level IA.md §4 records for that screen. */
  level: typeof DEFAULT_ATMOSPHERE
  /**
   * True for an extra route pattern covering an entry IA.md §4 writes as one
   * screen — Settings "+ 4 sub-views", the gallery's two sections. Not a screen
   * of its own, so nothing should count it as one.
   */
  alias?: true
}

/**
 * Every screen in IA.md §4, in document order. Keeping the inventory makes the
 * source document testable while one literal type prevents route-level drift.
 */
export const SCREEN_ATMOSPHERE: readonly ScreenAtmosphere[] = [
  { screen: 'Welcome', path: '/welcome', level: 'full' },
  { screen: 'OTP Login', path: '/login', level: 'full' },
  { screen: 'Onboarding', path: '/onboarding', level: 'full' },
  { screen: 'Home', path: '/', level: 'full' },
  { screen: 'Generate', path: '/generate', level: 'full' },
  // Transient: GEN-05 renders it inside whichever route started generation.
  { screen: 'Loading', path: null, level: 'full' },
  { screen: 'Review', path: '/review', level: 'full' },
  { screen: 'Workout', path: '/workout', level: 'full' },
  { screen: 'Summary', path: '/summary', level: 'full' },
  { screen: 'History', path: '/history', level: 'full' },
  { screen: 'Session Detail', path: '/history/:id', level: 'full' },
  { screen: 'Settings', path: '/settings', level: 'full' },
  { screen: 'Settings sub-views', path: '/settings/*', level: 'full', alias: true },
  { screen: 'Component Gallery', path: '/dev/gallery', level: 'full' },
  {
    screen: 'Component Gallery sections',
    path: '/dev/gallery/*',
    level: 'full',
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

/** Every pathname resolves to the one production atmosphere. */
export function resolveAtmosphere(_pathname: string): typeof DEFAULT_ATMOSPHERE {
  void _pathname
  return DEFAULT_ATMOSPHERE
}

/** The documented level for a screen that renders without a route of its own. */
export function screenAtmosphere(screen: string): typeof DEFAULT_ATMOSPHERE {
  const entry = SCREEN_ATMOSPHERE.find((candidate) => candidate.screen === screen)

  if (entry === undefined) {
    throw new Error(`No atmosphere is documented for the screen "${screen}"`)
  }

  return entry.level
}
