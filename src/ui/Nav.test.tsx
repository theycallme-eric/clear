import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AppHeader } from '../design-system/index'
import { Nav } from './Nav'

describe('landmarks (CORE-05)', () => {
  it('Nav renders a navigation landmark with its accessible name', () => {
    render(
      <Nav label="Primary">
        <a href="/">Home</a>
      </Nav>,
    )

    expect(
      screen.getByRole('navigation', { name: 'Primary' }),
    ).toBeInTheDocument()
  })

  it('AppHeader renders the header landmark', () => {
    render(<AppHeader meta="v0">CLEAR</AppHeader>)

    expect(screen.getByRole('banner')).toBeInTheDocument()
  })
})
