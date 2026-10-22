import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { AppProviders, renderApp, signedIn } from '../test/render'
import { createWorkoutDouble, savedWorkoutFixture } from '../test/workout-double'
import { createTestRouter } from './router'

// Every case here is about the chrome above the route, but it needs a route
// under it that actually renders. `/` became protected with AUTH-03, so the
// visitor has to be signed in or the screen these assertions describe is
// `/welcome` instead of Home.

/**
 * The chrome's own announcer. It is asked for by class rather than by role
 * because `role="status"` is not unique on a screen and was never meant to be:
 * Home reads its resumable session (EXE-01), and a `ScanLoader` mid-read is a
 * polite status region of its own. This is the one the chrome owns.
 */
function announcer(): HTMLElement {
  const region = document.querySelector('[role="status"].a11y-hidden')
  if (region === null) throw new Error('the route announcer is not mounted')
  return region as HTMLElement
}

describe('AppChrome (CORE-05)', () => {
  describe('skip link', () => {
    it('is first in tab order and visible only on focus', async () => {
      const user = userEvent.setup()
      renderApp(['/'], signedIn())

      await user.tab()

      const skipLink = screen.getByRole('link', { name: 'Skip to content' })
      expect(skipLink).toHaveFocus()
      expect(skipLink).toHaveClass('skip-link')
      expect(skipLink).toHaveAttribute('href', '#main')
    })

    it('moves focus to the main landmark when activated', async () => {
      const user = userEvent.setup()
      renderApp(['/'], signedIn())

      await user.tab()
      await user.keyboard('{Enter}')

      expect(screen.getByRole('main')).toHaveFocus()
    })
  })

  describe('route-change focus and announcement', () => {
    it('leaves focus and the live region alone on initial load', () => {
      renderApp(['/'], signedIn())

      expect(document.body).toHaveFocus()
      expect(announcer()).toBeEmptyDOMElement()
    })

    it('focuses the new h1 and announces the screen exactly once on navigation', async () => {
      const user = userEvent.setup()
      const reset = vi.spyOn(Element.prototype, 'scrollTo')
      renderApp(['/missing'], signedIn())

      expect(announcer()).toBeEmptyDOMElement()

      await user.click(screen.getByRole('link', { name: 'Return to CLEAR' }))

      expect(
        screen.getByRole('heading', { level: 1, name: 'Today' }),
      ).toHaveFocus()
      const status = announcer()
      expect(status).toHaveAttribute('aria-live', 'polite')
      expect(status).toHaveTextContent(/^CLEAR$/)
      expect(status.childNodes).toHaveLength(1)
      expect(reset).toHaveBeenCalledWith({ top: 0, left: 0 })
    })

    it('keeps Home tab and state updates inline without resetting focus, scroll or announcement', async () => {
      const user = userEvent.setup()
      const router = createTestRouter(['/missing'])
      render(
        <AppProviders {...signedIn()}>
          <RouterProvider router={router} />
        </AppProviders>,
      )
      await user.click(screen.getByRole('link', { name: 'Return to CLEAR' }))
      const heading = screen.getByRole('heading', { level: 1, name: 'Today' })
      expect(heading).toHaveFocus()
      const arrival = announcer().firstChild
      const headingFocus = vi.spyOn(heading, 'focus')
      const scroller = document.querySelector<HTMLElement>('.clr-scroll-region__scroller')!
      // Observe only the page scroller, not TabBar's separate horizontal rail
      // or the prototype mock's calls from the preceding real route arrival.
      const reset = vi.fn()
      Object.defineProperty(scroller, 'scrollTo', { value: reset, configurable: true })
      scroller.scrollTop = 137
      const homeKey = router.state.location.key

      screen.getByRole('tab', { name: 'Recent workouts' }).focus()
      await user.keyboard('{ArrowRight}')

      const favorites = screen.getByRole('tab', { name: 'Favorites' })
      expect(favorites).toHaveAttribute('aria-selected', 'true')
      expect(router.state.location.search).toBe('?tab=favorites')
      expect(router.state.location.key).not.toBe(homeKey)
      await waitFor(() => expect(favorites).toHaveFocus())
      expect(headingFocus).not.toHaveBeenCalled()
      expect(reset).not.toHaveBeenCalled()
      expect(scroller.scrollTop).toBe(137)
      expect(announcer().firstChild).toBe(arrival)

      const queryKey = router.state.location.key
      await act(() => router.navigate('/?tab=favorites', {
        replace: true,
        state: { inlineUpdate: true },
      }))

      expect(router.state.location.key).not.toBe(queryKey)
      expect(router.state.location.state).toEqual({ inlineUpdate: true })
      expect(favorites).toHaveFocus()
      expect(headingFocus).not.toHaveBeenCalled()
      expect(reset).not.toHaveBeenCalled()
      expect(scroller.scrollTop).toBe(137)
      expect(announcer().firstChild).toBe(arrival)
    })

    it('still enters Review and focuses Home on browser Back to the original history entry', async () => {
      const user = userEvent.setup()
      const favorite = savedWorkoutFixture()
      const workout = createWorkoutDouble({ session: null, favorites: [favorite] })
      const router = createTestRouter(['/?tab=favorites'])
      const reset = vi.spyOn(Element.prototype, 'scrollTo')
      render(
        <AppProviders {...signedIn({ workout: workout.clients })}>
          <RouterProvider router={router} />
        </AppProviders>,
      )
      const originalKey = router.state.location.key
      expect(announcer()).toBeEmptyDOMElement()
      const favorites = await screen.findByRole('list', { name: 'Favorites' })

      await user.click(within(favorites).getByRole('button', { name: 'Start' }))

      expect(await screen.findByRole('heading', { level: 1, name: favorite.title })).toHaveFocus()
      expect(screen.getByRole('main')).toHaveClass('route-enter-up')
      expect(announcer()).toHaveTextContent(/^Review$/)
      expect(reset).toHaveBeenCalledWith({ top: 0, left: 0 })
      const reviewAnnouncement = announcer().firstChild
      reset.mockClear()

      await act(() => router.navigate(-1))

      expect(await screen.findByRole('heading', { level: 1, name: 'Today' })).toHaveFocus()
      expect(router.state.location.key).toBe(originalKey)
      expect(router.state.location.search).toBe('?tab=favorites')
      expect(screen.getByRole('tab', { name: 'Favorites' })).toHaveAttribute('aria-selected', 'true')
      expect(screen.getByRole('main')).toHaveClass('route-enter-back')
      expect(announcer()).toHaveTextContent(/^CLEAR$/)
      expect(announcer().firstChild).not.toBe(reviewAnnouncement)
      expect(reset).toHaveBeenCalledWith({ top: 0, left: 0 })
    })

    it('gives the arriving screen its entry without holding focus or input back', async () => {
      const user = userEvent.setup()
      renderApp(['/missing'], signedIn())
      expect(screen.getByRole('main').className).not.toMatch(/route-enter-/)

      await user.click(screen.getByRole('link', { name: 'Return to CLEAR' }))

      // The entry and the focus land in the same commit: nothing waits on it.
      expect(screen.getByRole('main')).toHaveClass('clr-screen', 'route-enter-forward')
      expect(screen.getByRole('heading', { level: 1, name: 'Today' })).toHaveFocus()
    })

    it('adds no entry at all when the platform asks for reduced motion', async () => {
      vi.stubGlobal('matchMedia', (query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }))
      const user = userEvent.setup()
      renderApp(['/missing'], signedIn())

      await user.click(screen.getByRole('link', { name: 'Return to CLEAR' }))

      expect(screen.getByRole('heading', { level: 1, name: 'Today' })).toHaveFocus()
      expect(screen.getByRole('main').className).not.toMatch(/route-enter-|clr-interlace/)
      vi.unstubAllGlobals()
    })

    it('updates the document title on navigation', async () => {
      const user = userEvent.setup()
      renderApp(['/missing'], signedIn())

      expect(document.title).toBe('Page not found · CLEAR')

      await user.click(screen.getByRole('link', { name: 'Return to CLEAR' }))

      expect(document.title).toBe('CLEAR')
    })
  })
})
