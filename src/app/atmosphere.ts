/**
 * CLEAR 0.14.3 atmosphere.
 *
 * The package ships one atmosphere: the root `--atmosphere-*` values are the
 * only intensity, and its Quiet and Operational modes were removed. So there
 * is no per-screen table here and nothing for a route to choose — every
 * screen, routed or transient, sits on the same ground `RootLayout` mounts.
 *
 * `data-atmosphere` no longer selects anything in the shipped CSS. The shell
 * still writes the single value below as an inert marker, so the rendered tree
 * records that one atmosphere is in force.
 */

/**
 * The retired intensity names. Only the development gallery's comparison
 * switcher still enumerates them; no production screen can be assigned one.
 */
export type AtmosphereLevel = 'full' | 'quiet' | 'operational'

/** The one atmosphere. */
export const DEFAULT_ATMOSPHERE = 'full' satisfies AtmosphereLevel

/** Every pathname resolves to the one atmosphere. */
export function resolveAtmosphere(_pathname: string): typeof DEFAULT_ATMOSPHERE {
  void _pathname
  return DEFAULT_ATMOSPHERE
}

/** A screen without a route of its own sits on the same one atmosphere. */
export function screenAtmosphere(_screen: string): typeof DEFAULT_ATMOSPHERE {
  void _screen
  return DEFAULT_ATMOSPHERE
}
