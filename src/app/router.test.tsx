import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ok } from '../state/errors'
import { renderApp, signedIn } from '../test/render'
import { createWorkoutDouble, reconstructionFixture } from '../test/workout-double'

describe('app router', () => {
  it('renders the shell route', () => {
    // Signed in, because AUTH-03 made `/` protected. HOME-01 owns a distinct
    // page heading, so this proves the daily entry point rendered.
    renderApp(['/'], signedIn())

    expect(screen.getByRole('heading', { name: 'Today' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generate workout' })).toBeInTheDocument()
  })

  it('mounts /history as a protected route at the quiet atmosphere', async () => {
    const { container } = renderApp(['/history'], signedIn())

    expect(
      await screen.findByRole('heading', { level: 1, name: 'History' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Page not found' })).toBeNull()
    expect(container.querySelector('.clr-shell')).toHaveAttribute(
      'data-atmosphere',
      'quiet',
    )
  })

  it('mounts /history/:id as a protected route at the quiet atmosphere', async () => {
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
      'quiet',
    )
  })

  it('does not render /history/:id for a signed-out visitor', async () => {
    renderApp(['/history/c0000001-0000-4000-8000-000000000000'])

    await waitFor(() => expect(document.documentElement.dataset.atmosphere).toBe('full'))
    expect(screen.queryByRole('heading', { name: 'Page not found' })).toBeNull()
    expect(screen.queryByRole('main')?.textContent ?? '').not.toContain('As performed')
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
