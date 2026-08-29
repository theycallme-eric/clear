import { render, screen } from '@testing-library/react'
import { RouterProvider } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { createTestRouter } from './router'

describe('app router', () => {
  it('renders the shell route', () => {
    render(<RouterProvider router={createTestRouter(['/'])} />)

    expect(screen.getByRole('heading', { name: 'CLEAR' })).toBeInTheDocument()
  })

  it('renders the fallback route', () => {
    render(<RouterProvider router={createTestRouter(['/missing'])} />)

    expect(
      screen.getByRole('heading', { name: 'Page not found' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Return to CLEAR' }),
    ).toHaveAttribute('href', '/')
  })
})
