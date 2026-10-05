/** CLEAR 0.14.3 ships one atmosphere, mounted once, with no intensity modes. */
import { readdirSync, readFileSync } from 'node:fs'

import { act, render } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { QueryClient } from '../state/query'
import { locationsQueryKey, profileQueryKey } from '../state/user-queries'
import { AppProviders, renderApp, signedIn, type ProviderOptions } from '../test/render'
import { FIXTURE_USER_ID, notOnboardedProfile } from '../test/user-data-double'
import { createWorkoutDouble, snapshotFixture } from '../test/workout-double'
import { routes } from './router'
import * as atmosphereModule from './atmosphere'
import { DEFAULT_ATMOSPHERE, resolveAtmosphere, screenAtmosphere } from './atmosphere'

const PRODUCTION_PATHS = [
  '/welcome',
  '/login',
  '/onboarding',
  '/',
  '/generate',
  '/review',
  '/workout',
  '/summary',
  '/history',
  '/history/a4f1c8e2',
  '/settings',
  '/settings/locations',
  '/settings/structures',
  '/dev/gallery',
  '/dev/gallery/ds',
  '/dev/gallery/app',
  '/no-such-screen',
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
  // `/review` joined them with FAV-01: protected, and it renders its own
  // "nothing to review" screen rather than redirecting, so signed in is all it
  // needs to stay mounted and carry its own level.
  // HIST-01's detail is protected and reads its session on arrival; a pending
  // read keeps it mounted in its loading state, carrying its own level.
  if (pathname.startsWith('/history/')) {
    return signedIn({
      workout: createWorkoutDouble({
        session: null,
        sessions: { asPerformed: () => new Promise(() => {}) },
      }).clients,
    })
  }
  if (
    pathname === '/summary' ||
    pathname === '/generate' ||
    pathname === '/review' ||
    pathname === '/history' ||
    pathname.startsWith('/settings')
  ) {
    return signedIn()
  }
  // ONB-01's gate: authed and not onboarded. An onboarded fixture would be
  // redirected Home and measure `/`'s level instead.
  if (pathname === '/onboarding') {
    const queryClient = new QueryClient()
    queryClient.setData(profileQueryKey(FIXTURE_USER_ID), notOnboardedProfile())
    queryClient.setData(locationsQueryKey(FIXTURE_USER_ID), [])
    return signedIn({ queryClient })
  }
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

describe('one atmosphere, no modes', () => {
  const foundation = readFileSync('src/design-system/css/foundation.css', 'utf8')
  const motion = readFileSync('src/design-system/css/motion.css', 'utf8')
  const appStyles = readdirSync('src/styles')
    .filter((name) => name.endsWith('.css'))
    .map((name) => ({ name, css: readFileSync(`src/styles/${name}`, 'utf8') }))

  it.each(PRODUCTION_PATHS)('resolves %s to the one atmosphere', (pathname) => {
    expect(resolveAtmosphere(pathname)).toBe(DEFAULT_ATMOSPHERE)
  })

  it('keeps no per-screen table for a route to be assigned a level from', () => {
    expect(Object.keys(atmosphereModule).sort()).toEqual([
      'DEFAULT_ATMOSPHERE',
      'resolveAtmosphere',
      'screenAtmosphere',
    ])
    // Routed, transient and unknown screens all sit on the same ground.
    expect(screenAtmosphere('Loading')).toBe(DEFAULT_ATMOSPHERE)
    expect(screenAtmosphere('Nowhere')).toBe(DEFAULT_ATMOSPHERE)
    expect(resolveAtmosphere('/deep/unknown/path')).toBe(DEFAULT_ATMOSPHERE)
  })

  it('ships a single intensity that no attribute can change', () => {
    expect(foundation).not.toContain('[data-atmosphere')
    expect(motion).not.toContain('[data-atmosphere')
    for (const token of ['blur', 'opacity', 'dim', 'grain', 'scan']) {
      expect(
        foundation.match(new RegExp(`--atmosphere-${token}:`, 'g')),
        token,
      ).toHaveLength(1)
    }
  })

  it('adds no app-owned mode, intensity or blob geometry', () => {
    expect(appStyles.length).toBeGreaterThan(0)
    for (const { name, css } of appStyles) {
      expect(css, name).not.toContain('data-atmosphere')
      expect(css, name).not.toMatch(/--atmosphere-[a-z]+\s*:/)
      expect(css, name).not.toContain('.clr-atmosphere__blob--')
    }
  })

  it('sizes every blob from the longer side of the layer', () => {
    expect(foundation).toMatch(/\.clr-atmosphere \{[^}]*container-type: size;/)
    for (const blob of ['structure', 'interaction', 'info']) {
      expect(foundation, blob).toMatch(
        new RegExp(
          `\\.clr-atmosphere__blob--${blob} \\{[^}]*width: \\d+cqmax; aspect-ratio: 1;`,
        ),
      )
    }
  })

  it('breathes and drifts by transform alone, never by brightness or blur', () => {
    const breathe = motion.match(/@keyframes clr-breathe \{(.*)\}\s*$/m)?.[1] ?? ''
    expect(breathe).toMatch(/scale:/)
    expect(breathe).toMatch(/rotate:/)
    expect(breathe).not.toMatch(/opacity|filter|brightness|border-radius|width|height/)

    const drifts = [...motion.matchAll(/@keyframes clr-drift-[a-d] \{ to \{ ([^}]*)\} \}/g)]
    expect(drifts).toHaveLength(4)
    for (const [, declarations] of drifts) {
      expect(declarations.trim()).toMatch(/^transform: [^;]+;$/)
    }

    for (const blob of ['structure', 'interaction', 'info']) {
      expect(motion, blob).toMatch(
        new RegExp(
          `\\.clr-atmosphere__blob--${blob} \\{ animation: clr-drift-[a-d] [^,]+, clr-breathe `,
        ),
      )
    }
  })
})

describe('atmosphere rendering', () => {
  it.each(PRODUCTION_PATHS)('renders %s with data-atmosphere="full"', (pathname) => {
    const { container } = renderApp([pathname], providersFor(pathname))

    // IA.md §3 layer 2 — the shell carries the level…
    const shell = container.querySelector('.clr-shell')
    expect(shell).toHaveClass('clr-shell--fixed', 'clr-shell--contained')
    expect(shell).toHaveAttribute(
      'data-atmosphere',
      'full',
    )
    // …and ATOMIC.md §7 puts the global attribute on <html>.
    expect(document.documentElement.dataset.atmosphere).toBe('full')
  })

  it('mounts the atmosphere layer once at the app root', () => {
    const { container } = renderApp(['/'])

    expect(container.querySelectorAll('.clr-atmosphere')).toHaveLength(1)
    // Sibling of the shell, not a child of it: the export's own app-shell markup.
    expect(container.querySelector('.clr-shell .clr-atmosphere')).toBeNull()
  })

  it('keeps the one layer mounted across navigation', async () => {
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
    expect(container.querySelector('.clr-shell')).toHaveAttribute('data-atmosphere', 'full')
    expect(document.documentElement.dataset.atmosphere).toBe('full')
    expect(container.querySelector('.clr-atmosphere')).not.toHaveAttribute('data-context')
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

  it('stops the drift and breathing in CSS, not only in the DOM', () => {
    const appRule = readFileSync('src/styles/atmosphere.css', 'utf8')
    const vendored = readFileSync('src/design-system/css/motion.css', 'utf8')

    expect(appRule).toMatch(
      /\.clr-atmosphere\[data-static='true'\] \.clr-atmosphere__blob \{\s*animation: none;/,
    )
    expect(vendored).toContain('.clr-atmosphere__blob { animation: none !important; }')
  })
})
