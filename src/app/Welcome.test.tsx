/**
 * AUTH-02 — Welcome: the brand moment, its one entry, and its guard.
 *
 * U13: the wordmark and one card holding the line and the single Get started
 * entry, centred as one group. U14: that entry serves new and returning
 * accounts alike, so there is no second door.
 */
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { createFakeAuthClient, signedInEvent } from '../test/auth-double'
import { renderApp } from '../test/render'

describe('Welcome', () => {
  it('composes the wordmark and one centred card holding the line and the one entry', () => {
    renderApp(['/welcome'])

    const heading = screen.getByRole('heading', { level: 1, name: 'CLEAR' })
    expect(within(heading).getByRole('img', { name: 'CLEAR' })).toBe(
      heading.firstElementChild,
    )
    expect(heading.firstElementChild).toHaveStyle({
      display: 'flex',
      justifyContent: 'center',
      width: '100%',
    })

    // Only the title sits on the atmosphere: everything else is the card's.
    const main = screen.getByRole('main')
    const cards = main.querySelectorAll('.clr-card')
    expect(cards).toHaveLength(1)
    const card = cards[0] as HTMLElement
    expect(within(card).getByText('Strength training, simplified.')).toBeInTheDocument()
    // U08: one statement.
    expect(card.querySelectorAll('p')).toHaveLength(1)
    expect(
      heading.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()

    // U14: the one entry, primary, inside the card — no pinned footer.
    const entry = within(card).getByRole('button', { name: 'Get started' })
    expect(entry).toHaveClass('clr-btn--primary')
    expect(within(main).getAllByRole('button')).toEqual([entry])
    expect(main.querySelector('.clr-footer')).toBeNull()

    // U13: the title and the card are centred as one group in the scroller;
    // the content box is the one that scrolls when the group does not fit.
    const content = main.querySelector('.clr-screen__content')
    expect(content).toHaveClass('clr-screen__content--centered')
    expect(content).toContainElement(heading)
    expect(content).toContainElement(card)
    expect(main.querySelector('.clr-scroll-region__scroller')).toContainElement(entry)
  })

  it('adds no boot status, sample check or second entry of its own', () => {
    renderApp(['/welcome'])

    const main = screen.getByRole('main')
    expect(within(main).queryByRole('status')).not.toBeInTheDocument()
    expect(within(main).queryByRole('progressbar')).not.toBeInTheDocument()
    expect(within(main).queryByText(/system check|all systems nominal/i)).not.toBeInTheDocument()
    expect(within(main).queryByRole('button', { name: /begin session/i })).not.toBeInTheDocument()
    expect(within(main).queryByRole('button', { name: /sign in/i })).not.toBeInTheDocument()
    expect(within(main).queryByRole('button', { name: /create account/i })).not.toBeInTheDocument()
  })

  it('keeps the entry outside decorative boot transforms', () => {
    renderApp(['/welcome'])

    const entry = screen.getByRole('button', { name: 'Get started' })
    expect(entry.closest('.clr-boot')).toBeNull()
    expect(screen.getByText('Strength training, simplified.').closest('.clr-boot')).not.toBeNull()
  })

  it('opens the one passwordless flow from the keyboard', async () => {
    const user = userEvent.setup()
    renderApp(['/welcome'])

    screen.getByRole('button', { name: 'Get started' }).focus()
    await user.keyboard('{Enter}')

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Get started' }),
    ).toBeInTheDocument()
  })

  it('goes to the email step of the shared code flow for new and returning accounts', async () => {
    const user = userEvent.setup()
    renderApp(['/welcome'])

    await user.click(screen.getByRole('button', { name: 'Get started' }))

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Get started' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/new or returning, enter your email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
  })

  it('loading: waits for the session restore in one card rather than flashing the screen', () => {
    renderApp(['/welcome'], { auth: createFakeAuthClient({ settled: null }) })

    // Scoped to the screen: the route announcer is a status region too.
    const main = screen.getByRole('main')
    const waiting = within(main).getByRole('status')
    expect(waiting).toHaveAttribute('aria-busy', 'true')
    expect(waiting).toHaveTextContent('Checking session')
    expect(main.querySelectorAll('.clr-card')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Get started' })).not.toBeInTheDocument()
  })

  it('is public-only: an authenticated visitor is redirected away', async () => {
    renderApp(['/welcome'], {
      auth: createFakeAuthClient({ settled: signedInEvent() }),
    })

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Get started' })).not.toBeInTheDocument()
    })
    // Home is the authenticated daily entry point; onboarding remains AUTH-03's.
    expect(screen.getByRole('heading', { name: 'Today' })).toBeInTheDocument()
  })
})
