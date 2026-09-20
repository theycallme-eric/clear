import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { focusFirstInvalid } from './formFocus'

describe('focusFirstInvalid (CORE-05, export pattern 1)', () => {
  it('focuses the first control marked aria-invalid, in DOM order', () => {
    render(
      <form aria-label="Sample">
        <input aria-label="Valid" />
        <input aria-label="First invalid" aria-invalid="true" />
        <input aria-label="Second invalid" aria-invalid="true" />
      </form>,
    )

    const focused = focusFirstInvalid(screen.getByRole('form'))

    expect(focused).toBe(screen.getByRole('textbox', { name: 'First invalid' }))
    expect(screen.getByRole('textbox', { name: 'First invalid' })).toHaveFocus()
  })

  it('returns null and moves nothing when every control is valid', () => {
    render(
      <form aria-label="Sample">
        <input aria-label="Valid" />
      </form>,
    )

    const focused = focusFirstInvalid(screen.getByRole('form'))

    expect(focused).toBeNull()
    expect(document.body).toHaveFocus()
  })
})
