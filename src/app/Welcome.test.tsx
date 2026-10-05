/**
 * AUTH-02 — Welcome: the brand moment, its one exit, and its guard.
 */
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { createFakeAuthClient, signedInEvent } from '../test/auth-double'
import { renderApp } from '../test/render'

describe('Welcome', () => {
  it('groups the wordmark, one card holding the line under it, and both auth paths pinned', () => {
    renderApp(['/welcome'])

    const heading = screen.getByRole('heading', { level: 1, name: 'CLEAR' })
    expect(heading.firstElementChild).toHaveStyle({
      display: 'flex',
      justifyContent: 'center',
      width: '100%',
    })

    // Only the title sits on the atmosphere: the line under it is the card's.
    const main = screen.getByRole('main')
    const cards = main.querySelectorAll('.clr-card')
    expect(cards).toHaveLength(1)
    const card = cards[0] as HTMLElement
    expect(within(card).getByText('Strength training, simplified.')).toBeInTheDocument()
    expect(
      heading.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(within(card).queryAllByRole('button')).toHaveLength(0)

    // Both entries are the screen's pinned footer, outside the scroller.
    const foot = main.querySelector('.clr-scroll-region__foot > .clr-footer')
    expect(foot).not.toBeNull()
    const actions = within(foot as HTMLElement).getAllByRole('button')
    expect(actions.map((action) => action.textContent)).toEqual([
      'Sign in',
      'Create account',
    ])
    expect(actions[0]).toHaveClass('clr-btn--primary')
    expect(main.querySelector('.clr-scroll-region__scroller')).not.toContainElement(
      actions[0] ?? null,
    )
  })

  it('adds no boot status, sample check or product action of its own', () => {
    renderApp(['/welcome'])

    const main = screen.getByRole('main')
    expect(within(main).queryByRole('status')).not.toBeInTheDocument()
    expect(within(main).queryByRole('progressbar')).not.toBeInTheDocument()
    expect(within(main).queryByText(/system check|all systems nominal/i)).not.toBeInTheDocument()
    expect(within(main).queryByRole('button', { name: /begin session/i })).not.toBeInTheDocument()
    expect(within(main).getAllByRole('button')).toHaveLength(2)
  })

  it('reaches both entries by keyboard, in order, and opens one with Enter', async () => {
    const user = userEvent.setup()
    renderApp(['/welcome'])

    const signIn = screen.getByRole('button', { name: 'Sign in' })
    const create = screen.getByRole('button', { name: 'Create account' })
    signIn.focus()
    await user.tab()
    expect(create).toHaveFocus()

    await user.keyboard('{Enter}')

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Create account' }),
    ).toBeInTheDocument()
  })

  it('goes to the login screen', async () => {
    const user = userEvent.setup()
    renderApp(['/welcome'])

    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument()
  })

  it('opens an explicit account-creation version of the OTP screen', async () => {
    const user = userEvent.setup()
    renderApp(['/welcome'])

    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Create account' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/enter your email to create your account/i),
    ).toBeInTheDocument()
  })

  it('waits for the session restore rather than flashing the screen', () => {
    renderApp(['/welcome'], { auth: createFakeAuthClient({ settled: null }) })

    // Scoped to the screen: the route announcer is a status region too.
    const waiting = within(screen.getByRole('main')).getByRole('status')
    expect(waiting).toHaveAttribute('aria-busy', 'true')
    expect(waiting).toHaveTextContent('Checking session')
    expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument()
  })

  it('is public-only: an authenticated visitor is redirected away', async () => {
    renderApp(['/welcome'], {
      auth: createFakeAuthClient({ settled: signedInEvent() }),
    })

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument()
    })
    // Home is the authenticated daily entry point; onboarding remains AUTH-03's.
    expect(screen.getByRole('heading', { name: 'Today' })).toBeInTheDocument()
  })
})
