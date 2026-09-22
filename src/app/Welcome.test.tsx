/**
 * AUTH-02 — Welcome: the brand moment, its one exit, and its guard.
 */
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { createFakeAuthClient, signedInEvent } from '../test/auth-double'
import { renderApp } from '../test/render'

describe('Welcome', () => {
  it('shows the wordmark, the line under it, and one way forward', () => {
    renderApp(['/welcome'])

    expect(screen.getByRole('heading', { level: 1, name: 'CLEAR' })).toBeInTheDocument()
    expect(screen.getByText('Strength training, simplified.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('goes to the login screen', async () => {
    const user = userEvent.setup()
    renderApp(['/welcome'])

    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument()
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
    // Home is the app shell for now; the onboarding question is AUTH-03's.
    expect(screen.getByText('Workout generation is being rebuilt.')).toBeInTheDocument()
  })
})
