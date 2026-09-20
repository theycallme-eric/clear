import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { renderApp } from '../test/render'

describe('AppChrome (CORE-05)', () => {
  describe('skip link', () => {
    it('is first in tab order and visible only on focus', async () => {
      const user = userEvent.setup()
      renderApp(['/'])

      await user.tab()

      const skipLink = screen.getByRole('link', { name: 'Skip to content' })
      expect(skipLink).toHaveFocus()
      expect(skipLink).toHaveClass('skip-link')
      expect(skipLink).toHaveAttribute('href', '#main')
    })

    it('moves focus to the main landmark when activated', async () => {
      const user = userEvent.setup()
      renderApp(['/'])

      await user.tab()
      await user.keyboard('{Enter}')

      expect(screen.getByRole('main')).toHaveFocus()
    })
  })

  describe('route-change focus and announcement', () => {
    it('leaves focus and the live region alone on initial load', () => {
      renderApp(['/'])

      expect(document.body).toHaveFocus()
      expect(screen.getByRole('status')).toBeEmptyDOMElement()
    })

    it('focuses the new h1 and announces the screen exactly once on navigation', async () => {
      const user = userEvent.setup()
      renderApp(['/missing'])

      expect(screen.getByRole('status')).toBeEmptyDOMElement()

      await user.click(screen.getByRole('link', { name: 'Return to CLEAR' }))

      expect(
        screen.getByRole('heading', { level: 1, name: 'CLEAR' }),
      ).toHaveFocus()
      const status = screen.getByRole('status')
      expect(status).toHaveAttribute('aria-live', 'polite')
      expect(status).toHaveTextContent(/^CLEAR$/)
      expect(status.childNodes).toHaveLength(1)
    })

    it('updates the document title on navigation', async () => {
      const user = userEvent.setup()
      renderApp(['/missing'])

      expect(document.title).toBe('Page not found · CLEAR')

      await user.click(screen.getByRole('link', { name: 'Return to CLEAR' }))

      expect(document.title).toBe('CLEAR')
    })
  })
})
