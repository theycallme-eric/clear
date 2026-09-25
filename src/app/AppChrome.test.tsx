import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { renderApp, signedIn } from '../test/render'

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
