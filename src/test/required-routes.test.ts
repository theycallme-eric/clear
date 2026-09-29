import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { matchPath, matchRoutes, type RouteObject } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import {
  REQUIRED_JOURNEYS,
  REQUIRED_SCREENS,
  type RequiredScreen,
} from '../../e2e/required-routes'
import { SCREENS } from '../../e2e/screens'
import { routes } from '../app/router'
import {
  routePatterns,
  undeclaredRoutes,
  unservedRequiredRoutes,
} from './route-inventory'

/**
 * REQ-010 — the required route and journey inventory, proved against the
 * requirement on one side and the router on the other.
 *
 * The inventory restates IA.md §4 without looking at the router; the router is
 * then held to it. The failure direction is proved here too, on fixture route
 * tables: a check that has never been seen to fail is not yet a check.
 */

const repoRoot = resolve(import.meta.dirname, '../..')
const read = (path: string) => readFileSync(resolve(repoRoot, path), 'utf-8')

/** IA.md §4's screen headings, in order, with the route each one names. */
function documentedScreens(): Array<{ screen: string; route: string | null }> {
  const ia = read('docs/specs/IA.md')
  const section = ia.slice(ia.indexOf('\n## 4. Screens'), ia.indexOf('\n## 5.'))

  return [...section.matchAll(/^### (.+?) — (.+)$/gm)].map((match) => ({
    screen: match[1],
    route: /`([^`]+)`/.exec(match[2])?.[1] ?? null,
  }))
}

/** A copy of a route tree without the route that renders `path`. */
function withoutRouteFor(tree: RouteObject[], path: string): RouteObject[] {
  const target = matchRoutes(tree, path)?.at(-1)?.route
  if (target === undefined) throw new Error(`Nothing in the router renders ${path}`)

  const prune = (branch: RouteObject[]): RouteObject[] =>
    branch
      .filter((route) => route !== target)
      .map((route) => ({
        ...route,
        children: route.children && prune(route.children),
      })) as RouteObject[]

  return prune(tree)
}

const required = REQUIRED_SCREENS.filter(
  (entry): entry is RequiredScreen & { route: string } =>
    entry.route !== null && entry.pendingOwner === undefined,
)

describe('the inventory states the requirement, not the router (REQ-010)', () => {
  it('is declared without reference to the router', () => {
    const source = read('e2e/required-routes.ts')

    // Pure data: no import at all, so nothing the router exports can leak in.
    expect(source).not.toMatch(/^\s*import\s/m)
    expect(source).not.toMatch(/from\s+'[^']*router'/)
  })

  it('names every screen IA.md §4 heads, in document order, with its route', () => {
    const documented = documentedScreens()

    expect(documented.length).toBeGreaterThan(0)
    expect(REQUIRED_SCREENS.map(({ screen, route }) => ({ screen, route }))).toEqual(
      documented,
    )
  })

  it('includes the transient Loading screen, with no route of its own', () => {
    const loading = REQUIRED_SCREENS.find((entry) => entry.screen === 'Loading')

    expect(loading?.route).toBeNull()
    expect(loading?.path).toBeNull()
    expect(loading?.journeys).toContain('new-user')
    // It is reached through the screens that render it in place.
    for (const host of loading?.renderedWithin ?? []) {
      expect(REQUIRED_SCREENS.find((entry) => entry.screen === host)?.route).not.toBeNull()
    }
    expect(loading?.renderedWithin).toEqual(['Home', 'Generate', 'Review'])
  })

  it('records the journeys REQ-010 names, over screens the inventory holds', () => {
    const names = new Set(REQUIRED_SCREENS.map((entry) => entry.screen))

    expect(REQUIRED_JOURNEYS.map((journey) => journey.id)).toEqual([
      'new-user',
      'history-detail',
      'settings-appearance',
      'focused-forms',
    ])
    expect(REQUIRED_JOURNEYS[0].steps).toEqual([
      'Welcome',
      'OTP Login',
      'Onboarding',
      'Home',
      'Generate',
      'Loading',
      'Review',
      'Workout',
      'Summary',
      'Home',
    ])
    for (const journey of REQUIRED_JOURNEYS) {
      for (const step of journey.steps) expect(names).toContain(step)
    }
  })

  it.each(REQUIRED_SCREENS.map((entry) => [entry.screen, entry] as const))(
    'records which journeys %s belongs to',
    (screen, entry) => {
      const expected = REQUIRED_JOURNEYS.filter((journey) =>
        journey.steps.includes(screen),
      ).map((journey) => journey.id)

      expect([...entry.journeys].sort()).toEqual([...expected].sort())
    },
  )

  it('gives every concrete path the route pattern it stands for', () => {
    for (const entry of REQUIRED_SCREENS) {
      if (entry.route === null) continue
      const pattern = entry.route === '*' ? '/*' : entry.route
      // The gallery's §4 route is its index; its sections sit below it.
      const scope = entry.guard === 'dev-only' ? `${pattern}/*` : pattern

      expect(matchPath(scope, entry.path ?? ''), entry.screen).not.toBeNull()
      // Sub-views sit under their screen's own route.
      for (const sub of entry.subPaths ?? []) {
        expect(matchPath(`${pattern}/*`, sub), sub).not.toBeNull()
      }
    }
  })
})

describe('the router serves every required route (REQ-010)', () => {
  it('serves each one, and names the pending ones only while they are pending', () => {
    expect(unservedRequiredRoutes(routes, REQUIRED_SCREENS)).toEqual([])
  })

  it('declares every route it has in the inventory', () => {
    expect(routePatterns(routes).length).toBeGreaterThan(0)
    expect(undeclaredRoutes(routes, REQUIRED_SCREENS)).toEqual([])
  })

  it('holds only recovery work as pending, each with a named owner', () => {
    const pending = REQUIRED_SCREENS.filter((entry) => entry.pendingOwner !== undefined)

    for (const entry of pending) {
      expect(entry.route).not.toBeNull()
      expect(entry.pendingOwner).toMatch(/^G\d{2} \/ UAT-R\d{2} — /)
    }
  })
})

describe('removing a required route from the router fails (REQ-010)', () => {
  it.each(required.map((entry) => [entry.route, entry] as const))(
    'fails when a fixture router drops %s',
    (route, entry) => {
      const fixture = withoutRouteFor(routes, entry.path ?? '')

      // The fixture really lost a route…
      expect(routePatterns(fixture)).toHaveLength(routePatterns(routes).length - 1)
      // …and the check says which required screen that took with it.
      const failures = unservedRequiredRoutes(fixture, REQUIRED_SCREENS)
      expect(failures.length).toBeGreaterThan(0)
      expect(failures.join('\n')).toContain(`${entry.screen} (${route}) is required`)
    },
  )

  it('fails when a fixture router drops a Settings sub-view', () => {
    const failures = unservedRequiredRoutes(
      withoutRouteFor(routes, '/settings/locations'),
      REQUIRED_SCREENS,
    )

    expect(failures).toEqual([
      'Settings (/settings) is required but /settings/locations is not served',
    ])
  })

  it('fails when a pending route lands and is still marked pending', () => {
    const fixture: RouteObject[] = [
      { path: '/history/:id', element: null },
      ...routes,
    ]

    expect(unservedRequiredRoutes(fixture, REQUIRED_SCREENS)).toEqual([
      expect.stringMatching(/^Session Detail \(\/history\/:id\) is now served/),
    ])
  })

  it('fails when a fixture router gains a route the inventory does not name', () => {
    const fixture: RouteObject[] = [{ path: '/stray', element: null }, ...routes]

    expect(undeclaredRoutes(fixture, REQUIRED_SCREENS)).toEqual(['/stray'])
  })
})

describe('the E2E screens are derived from the inventory (REQ-010, CORE-05)', () => {
  it('imports the inventory and never the router', () => {
    const source = read('e2e/screens.ts')

    expect(source).toContain("from './required-routes'")
    expect(source).not.toMatch(/from\s+'[^']*router'/)
  })

  it('visits every required route a preview build contains', () => {
    const expected = REQUIRED_SCREENS.filter(
      (entry) => entry.path !== null && entry.guard !== 'dev-only',
    ).flatMap((entry) => [entry.path, ...(entry.subPaths ?? [])])

    expect(SCREENS.map((screen) => screen.path)).toEqual(expected)
  })

  it('scans every inventory screen, directly or through the screen that hosts it', () => {
    const visited = new Set(SCREENS.map((screen) => screen.screen))

    for (const entry of REQUIRED_SCREENS) {
      if (entry.guard === 'dev-only') continue
      if (entry.route === null) {
        // Loading is rendered in place of its hosts; each host is visited and
        // scanned, and REQ-010's new-user journey drives it with a session.
        for (const host of entry.renderedWithin ?? []) expect(visited).toContain(host)
        continue
      }
      expect(visited, entry.screen).toContain(entry.screen)
    }
  })

  it('leaves out only the development-only gallery', () => {
    const skipped = REQUIRED_SCREENS.filter(
      (entry) => entry.route !== null && !SCREENS.some((s) => s.screen === entry.screen),
    ).map((entry) => entry.screen)

    expect(skipped).toEqual(['Component Gallery'])
  })

  it('reaches every visited screen through the scanning fixture', () => {
    // `visit` navigates and runs axe-core; these specs walk SCREENS with it,
    // and `e2e-harness.test.ts` fails any spec that navigates without it.
    for (const spec of ['e2e/app-shell.spec.ts', 'e2e/reduced-motion.spec.ts']) {
      const source = read(spec)
      expect(source).toContain("from './screens'")
      expect(source).toMatch(/for \(const screen of SCREENS\)[\s\S]*?await visit\(screen\.path\)/)
    }
  })
})
