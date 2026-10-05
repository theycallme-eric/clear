import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { ok } from '../state/errors'
import { GENERATION_LOADING_TITLE } from '../state/generation-loading'
import { STEP_TITLES } from '../state/onboarding'
import { QueryClient } from '../state/query'
import { locationsQueryKey, profileQueryKey } from '../state/user-queries'
import { makeGenerationOutput, makeSessionAcceptance } from '../test/factories'
import { createFakeGenerationClient } from '../test/generation-double'
import { AppProviders, renderApp, signedIn } from '../test/render'
import {
  createFakeUserDataClient,
  FIXTURE_USER_ID,
  fixtureLocation,
  notOnboardedProfile,
  onboardedProfile,
} from '../test/user-data-double'
import { createWorkoutDouble, reconstructionFixture } from '../test/workout-double'
import { ONBOARDING_TITLE } from './Onboarding'
import { createTestRouter, routes } from './router'

describe('app router', () => {
  it('renders the shell route', () => {
    // Signed in, because AUTH-03 made `/` protected. HOME-01 owns a distinct
    // page heading, so this proves the daily entry point rendered.
    renderApp(['/'], signedIn())

    expect(screen.getByRole('heading', { name: 'Today' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generate workout' })).toBeInTheDocument()
  })

  it('mounts /onboarding behind the onboarding guard, at the Full atmosphere', async () => {
    const userData = createFakeUserDataClient({
      profile: async () => ok(notOnboardedProfile()),
    })
    renderApp(['/onboarding'], signedIn({ userData, queryClient: new QueryClient() }))

    expect(
      await screen.findByRole('heading', { level: 2, name: STEP_TITLES.location }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: ONBOARDING_TITLE })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Page not found' })).toBeNull()
    expect(document.querySelector('.clr-shell')).toHaveAttribute('data-atmosphere', 'full')
  })

  it('mounts /history as a protected route at the Full atmosphere', async () => {
    const { container } = renderApp(['/history'], signedIn())

    expect(
      await screen.findByRole('heading', { level: 1, name: 'History' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Page not found' })).toBeNull()
    expect(container.querySelector('.clr-shell')).toHaveAttribute(
      'data-atmosphere',
      'full',
    )
  })

  it('mounts /history/:id as a protected route at the Full atmosphere', async () => {
    const record = reconstructionFixture({ title: 'Routed session' })
    const workout = createWorkoutDouble({
      session: null,
      sessions: { asPerformed: async () => ok(record) },
    })
    const { container } = renderApp(
      [`/history/${record.session.id}`],
      signedIn({ workout: workout.clients }),
    )

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Routed session' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Page not found' })).toBeNull()
    expect(container.querySelector('.clr-shell')).toHaveAttribute(
      'data-atmosphere',
      'full',
    )
  })

  it('does not render /history/:id for a signed-out visitor', async () => {
    renderApp(['/history/c0000001-0000-4000-8000-000000000000'])

    await waitFor(() => expect(document.documentElement.dataset.atmosphere).toBe('full'))
    expect(screen.queryByRole('heading', { name: 'Page not found' })).toBeNull()
    expect(screen.queryByRole('main')?.textContent ?? '').not.toContain('As performed')
  })

  it('takes a /generate submit through Loading to /review with the validated workout', async () => {
    const user = userEvent.setup()
    const cache = new QueryClient()
    cache.setData(profileQueryKey(FIXTURE_USER_ID), onboardedProfile())
    cache.setData(locationsQueryKey(FIXTURE_USER_ID), [fixtureLocation()])
    const generation = createFakeGenerationClient()
    const { container } = renderApp(['/generate'], signedIn({ queryClient: cache, generation }))

    // The Focus choices follow the history read: nothing completed, so they are asked for.
    await user.click(
      within(await screen.findByRole('group', { name: 'Anchor' })).getByRole('button', {
        name: /upper body/i,
      }),
    )
    await user.click(screen.getByRole('button', { name: /generate workout/i }))

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(GENERATION_LOADING_TITLE)
    expect(document.documentElement.dataset.atmosphere).toBe('full')

    await act(async () => {
      generation.succeed({
        acceptance: makeSessionAcceptance({
          workout: { ...makeGenerationOutput(), title: 'Routed session' },
        }),
      })
    })

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Routed session' }),
    ).toBeInTheDocument()
    expect(document.documentElement.dataset.atmosphere).toBe('full')
    expect(container.querySelector('.clr-shell')).toHaveAttribute(
      'data-atmosphere',
      document.documentElement.dataset.atmosphere,
    )
  })

  describe('route motion (REQ-011)', () => {
    function mount(initialEntries: string[], providers = signedIn()) {
      const router = createTestRouter(initialEntries)
      render(
        <AppProviders {...providers}>
          <RouterProvider router={router} />
        </AppProviders>,
      )
      return router
    }

    /** The one shipped entry the screen carries, or `null` when it has none. */
    function entry(): string | null {
      const classes = [...screen.getByRole('main').classList].filter((name) =>
        name.startsWith('route-enter-'),
      )
      expect(classes.length).toBeLessThanOrEqual(1)
      return classes[0] ?? null
    }

    it('declares how every route is arrived at, so none falls back by omission', () => {
      const [root] = routes
      const [chrome] = root.children ?? []
      const screens = chrome.children ?? []

      expect(screens.length).toBeGreaterThan(10)
      for (const route of screens) {
        expect(route.handle, route.path).toMatchObject({
          motion: { depth: expect.any(Number) },
        })
      }
    })

    it('leaves the first screen alone: nothing arrived', async () => {
      mount(['/history'])

      await screen.findByRole('heading', { level: 1, name: 'History' })
      expect(entry()).toBeNull()
    })

    it('enters forward going in, back on the browser’s back and forward again', async () => {
      const router = mount(['/'])

      await act(() => router.navigate('/history'))
      await screen.findByRole('heading', { level: 1, name: 'History' })
      expect(entry()).toBe('route-enter-forward')

      await act(() => router.navigate(-1))
      await screen.findByRole('heading', { level: 1, name: 'Today' })
      expect(entry()).toBe('route-enter-back')

      await act(() => router.navigate(1))
      await screen.findByRole('heading', { level: 1, name: 'History' })
      expect(entry()).toBe('route-enter-forward')
    })

    it('enters back when a link leads out to a shallower screen', async () => {
      const router = mount(['/settings'])

      await act(() => router.navigate('/'))
      await screen.findByRole('heading', { level: 1, name: 'Today' })

      expect(entry()).toBe('route-enter-back')
    })

    it('cuts in a screen that sits outside the flow', async () => {
      const router = mount(['/'])

      await act(() => router.navigate('/missing'))
      await screen.findByRole('heading', { level: 1, name: 'Page not found' })

      expect(entry()).toBe('route-enter-fade')
    })

    it('does not replay the entrance when only the query or state changes', async () => {
      const router = mount(['/'])
      await act(() => router.navigate('/history'))
      const main = await screen.findByRole('main')
      main.classList.remove('route-enter-forward')

      await act(() => router.navigate('/history?view=favorites', { replace: true }))
      await act(() => router.navigate('/history', { state: { refreshed: true } }))

      expect(screen.getByRole('main')).toBe(main)
      expect(entry()).toBeNull()
    })
  })

  it('renders the fallback route', () => {
    renderApp(['/missing'])

    expect(
      screen.getByRole('heading', { name: 'Page not found' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Return to CLEAR' }),
    ).toHaveAttribute('href', '/')
  })
})
