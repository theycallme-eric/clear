import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../test/render'
import { HeaderBackButton } from './header-back-button'

describe('HeaderBackButton', () => {
  it('uses one framed secondary treatment for route exits', () => {
    renderWithProviders(<HeaderBackButton onClick={vi.fn()}>Home</HeaderBackButton>)

    const button = screen.getByRole('button', { name: 'Home' })
    expect(button).toHaveClass('clr-btn', 'clr-chamfer', 'clr-chamfer--sm')
    expect(button).not.toHaveClass('clr-btn--quiet')
  })
})
