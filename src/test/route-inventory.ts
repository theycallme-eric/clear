import { matchPath, matchRoutes, type RouteObject } from 'react-router-dom'

/**
 * REQ-010 — the router held to the required inventory.
 *
 * Both functions take the route table as an argument rather than importing it,
 * so `required-routes.test.ts` can run them against the real router and against
 * a fixture with a route taken away, and prove the check fails in the direction
 * that matters.
 */

/**
 * The part of an `e2e/required-routes.ts` entry these checks read. Stated
 * structurally because nothing under `src/` outside a test file may import from
 * `e2e/` (`e2e-harness.test.ts`).
 */
interface RequiredScreen {
  readonly screen: string
  readonly route: string | null
  readonly path: string | null
  readonly subPaths?: readonly string[]
  readonly pendingOwner?: string
}

/** Every URL an inventory entry asks the router for. */
function requiredPaths(entry: RequiredScreen): string[] {
  return entry.path === null ? [] : [entry.path, ...(entry.subPaths ?? [])]
}

/**
 * True when the router renders `path` with a route of its own. The catch-all
 * answers every URL, so a URL it answers is not served — unless the required
 * route *is* the catch-all.
 */
function serves(routes: RouteObject[], path: string, route: string): boolean {
  const leaf = matchRoutes(routes, path)?.at(-1)?.route
  if (leaf === undefined) return false
  return route === '*' ? leaf.path === '*' : leaf.path !== '*'
}

/**
 * Required routes the router does not serve, as readable failures. A pending
 * entry is the one recorded exception, and it fails the other way: once the
 * router serves it, the marker must go so the route becomes required.
 */
export function unservedRequiredRoutes(
  routes: RouteObject[],
  inventory: readonly RequiredScreen[],
): string[] {
  const failures: string[] = []

  for (const entry of inventory) {
    if (entry.route === null) continue

    for (const path of requiredPaths(entry)) {
      const served = serves(routes, path, entry.route)

      if (entry.pendingOwner === undefined && !served) {
        failures.push(`${entry.screen} (${entry.route}) is required but ${path} is not served`)
      }
      if (entry.pendingOwner !== undefined && served) {
        failures.push(
          `${entry.screen} (${entry.route}) is now served at ${path}; remove its pendingOwner`,
        )
      }
    }
  }

  return failures
}

/** Every path pattern in a route tree, absolute, pathless layouts skipped. */
export function routePatterns(routes: RouteObject[], parent = ''): string[] {
  return routes.flatMap((route) => {
    const own =
      route.path === undefined
        ? parent
        : route.path.startsWith('/')
          ? route.path
          : `${parent.replace(/\/$/, '')}/${route.path}`

    return [
      ...(route.path === undefined ? [] : [own]),
      ...routePatterns(route.children ?? [], own),
    ]
  })
}

/**
 * Router routes no inventory URL reaches. The complement of the check above:
 * a screen the router gains has to be written into the requirement too, or it
 * is never visited — and never scanned — by the browser suite.
 */
export function undeclaredRoutes(
  routes: RouteObject[],
  inventory: readonly RequiredScreen[],
): string[] {
  const urls = inventory.flatMap(requiredPaths)

  return routePatterns(routes).filter(
    (pattern) => !urls.some((url) => matchPath(pattern, url) !== null),
  )
}
