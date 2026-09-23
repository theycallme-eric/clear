import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { renderApp, signedIn } from '../test/render'

describe('app router', () => {
  it('renders the shell route', () => {
    // Signed in, because AUTH-03 made `/` protected. Asserted on the body
    // rather than the heading: `/welcome`'s wordmark is also named CLEAR, so
    // the heading alone cannot tell a rendered Home from a redirect to it.
    renderApp(['/'], signedIn())

    expect(screen.getByRole('heading', { name: 'CLEAR' })).toBeInTheDocument()
    expect(screen.getByText('Workout generation is being rebuilt.')).toBeInTheDocument()
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
