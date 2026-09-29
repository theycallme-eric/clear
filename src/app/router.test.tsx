import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { renderApp, signedIn } from '../test/render'

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
