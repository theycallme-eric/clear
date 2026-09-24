/**
 * DS-06 acceptance. The table in `atmosphere.ts` is a transcription of
 * IA.md §4, so these tests restate IA.md §4 independently — if the two ever
 * disagree, one of them is a typo and the test says which screen.
 */
import { readFileSync } from 'node:fs'

import { act, render } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppProviders, renderApp, signedIn, type ProviderOptions } from '../test/render'
import { createWorkoutDouble, snapshotFixture } from '../test/workout-double'
import { routes } from './router'
import {
  DEFAULT_ATMOSPHERE,
  SCREEN_ATMOSPHERE,
  resolveAtmosphere,
  screenAtmosphere,
  type AtmosphereLevel,
} from './atmosphere'

/** Every screen in IA.md §4 with a route, and the level documented for it. */
const DOCUMENTED_ROUTES: ReadonlyArray<[string, AtmosphereLevel]> = [
  ['/welcome', 'full'],
  ['/login', 'quiet'],
  ['/onboarding', 'quiet'],
  ['/', 'full'],
  ['/generate', 'quiet'],
  ['/review', 'quiet'],
  ['/workout', 'operational'],
  ['/summary', 'quiet'],
  ['/history', 'quiet'],
  ['/history/a4f1c8e2', 'quiet'],
  ['/settings', 'quiet'],
  ['/settings/locations', 'quiet'],
  ['/settings/structures', 'quiet'],
  ['/dev/gallery', 'quiet'],
  ['/dev/gallery/ds', 'quiet'],
  ['/dev/gallery/app', 'quiet'],
  // IA.md §4, Not Found — `*` is a brand moment.
  ['/no-such-screen', 'full'],
]

/**
 * What a route needs before it renders itself rather than a redirect.
 *
 * `/workout` has EXE-01's state-dependent guard and `/summary` is protected.
 * Both need a signed-in fixture to stay mounted long enough for this test to
 * measure their own atmosphere instead of the destination of a redirect.
 */
function providersFor(pathname: string): ProviderOptions {
  // SET-01's hub is protected: signed out it renders a redirect to Welcome,
  // whose `full` is then the only level there is to measure.
  if (pathname === '/summary' || pathname === '/settings') return signedIn()
  if (pathname !== '/workout') return {}
  return signedIn({
    workout: createWorkoutDouble({ session: snapshotFixture() }).clients,
  })
}

function setReducedMotion(prefersReduced: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: query.includes('prefers-reduced-motion') ? prefersReduced : false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList,
  )
}

beforeEach(() => {
  delete document.documentElement.dataset.atmosphere
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('atmosphere assignment', () => {
  it.each(DOCUMENTED_ROUTES)(
    'resolves %s to the level IA.md §4 documents',
    (pathname, level) => {
      expect(resolveAtmosphere(pathname)).toBe(level)
    },
  )

  it('covers every screen IA.md §4 declares, and invents none', () => {
    const ia = readFileSync('docs/specs/IA.md', 'utf8')
    const documented = [...ia.matchAll(/^\*\*Atmosphere:\*\* `(\w+)`/gm)].map(
      (match) => match[1],
    )
    const screens = SCREEN_ATMOSPHERE.filter((entry) => entry.alias !== true)

    expect(screens).toHaveLength(documented.length)
    // Same multiset of levels, so a mistranscribed level fails here.
    expect([...screens.map((entry) => entry.level)].sort()).toEqual(
      [...documented].sort(),
    )
  })

  it('gives a routeless screen its documented level', () => {
    // The Loading screen is transient — IA.md §4 gives it `full` and no route.
    expect(screenAtmosphere('Loading')).toBe('full')
    expect(() => screenAtmosphere('Nowhere')).toThrow(/Nowhere/)
  })

  it('falls back to the Not Found level for an unclaimed pathname', () => {
    expect(DEFAULT_ATMOSPHERE).toBe('full')
    expect(resolveAtmosphere('/deep/unknown/path')).toBe(DEFAULT_ATMOSPHERE)
  })

  it('never assigns a level outside ATOMIC.md §7.2', () => {
    for (const entry of SCREEN_ATMOSPHERE) {
      expect(['full', 'quiet', 'operational']).toContain(entry.level)
    }
  })
})

describe('atmosphere rendering', () => {
  it.each(DOCUMENTED_ROUTES)('renders %s with data-atmosphere="%s"', (pathname, level) => {
    const { container } = renderApp([pathname], providersFor(pathname))

    // IA.md §3 layer 2 — the shell carries the level…
    expect(container.querySelector('.clr-shell')).toHaveAttribute(
      'data-atmosphere',
      level,
    )
    // …and ATOMIC.md §7 puts the global attribute on <html>.
    expect(document.documentElement.dataset.atmosphere).toBe(level)
  })

  it('mounts the atmosphere layer once at the app root', () => {
    const { container } = renderApp(['/'])

    expect(container.querySelectorAll('.clr-atmosphere')).toHaveLength(1)
    // Sibling of the shell, not a child of it: the export's own app-shell markup.
    expect(container.querySelector('.clr-shell .clr-atmosphere')).toBeNull()
  })

  it('changes level on navigation without remounting the layer', async () => {
    // `/welcome` → `/login` is `full` → `quiet` for the same anonymous visitor.
    // It used to start on `/workout`, which EXE-01 has since made both
    // protected and a focus mode — a navigation off it is intercepted by the
    // abandon confirm, which is `Workout.test.tsx`'s subject and would prove
    // nothing about the atmosphere layer here.
    const router = createMemoryRouter(routes, { initialEntries: ['/welcome'] })
    // `/login` is a real screen now (AUTH-02) and reads the session, so this
    // router needs the same providers `renderApp` mounts.
    const { container } = render(
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>,
    )
    const layer = container.querySelector('.clr-atmosphere')

    expect(container.querySelector('.clr-shell')).toHaveAttribute(
      'data-atmosphere',
      'full',
    )

    await act(async () => {
      await router.navigate('/login')
    })

    // The same DOM node, so the ground never restarts mid-navigation.
    expect(container.querySelector('.clr-atmosphere')).toBe(layer)
    expect(container.querySelector('.clr-shell')).toHaveAttribute(
      'data-atmosphere',
      'quiet',
    )
    expect(document.documentElement.dataset.atmosphere).toBe('quiet')
  })

  it('renders the export five-layer ground and hides it from assistive tech', () => {
    const { container } = renderApp(['/'])
    const layer = container.querySelector('.clr-atmosphere')

    expect(layer).toHaveAttribute('aria-hidden', 'true')
    expect(layer).toHaveClass('clr-atmosphere--fixed')
    expect(layer?.querySelectorAll('.clr-atmosphere__blob')).toHaveLength(3)
    expect(layer?.querySelector('.clr-atmosphere__overlay')).not.toBeNull()
    expect(layer?.querySelector('.clr-atmosphere__scan')).not.toBeNull()
    expect(layer).not.toHaveAttribute('data-static')
  })

  it('renders the static fallback under prefers-reduced-motion', () => {
    setReducedMotion(true)
    const { container } = renderApp(['/'])
    const layer = container.querySelector('.clr-atmosphere')

    // No scan…
    expect(layer?.querySelector('.clr-atmosphere__scan')).toBeNull()
    // …and no drift: the attribute the app-owned rule keys `animation: none` on.
    expect(layer).toHaveAttribute('data-static', 'true')
    // The ground itself stays — only its motion is removed.
    expect(layer?.querySelectorAll('.clr-atmosphere__blob')).toHaveLength(3)
  })

  it('stops the drift in CSS, not only in the DOM', () => {
    const appRule = readFileSync('src/styles/atmosphere.css', 'utf8')
    const vendored = readFileSync('src/design-system/css/motion.css', 'utf8')

    expect(appRule).toMatch(
      /\.clr-atmosphere\[data-static='true'\] \.clr-atmosphere__blob \{\s*animation: none;/,
    )
    expect(vendored).toContain('.clr-atmosphere__blob { animation: none !important; }')
  })
})
