/**
 * The ENV-06 example: how a component test looks in this harness.
 * Render through the shared helper, query by accessible role, assert on
 * user-visible output, and build domain objects through factories.
 */
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { Checkbox } from '../design-system/index'
import { isAppError } from '../state/errors'
import { makeAppError } from './factories'
import { renderWithProviders } from './render'

describe('example component test', () => {
  it('renders and responds through accessible, user-visible controls', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Checkbox label="Include warm-up" defaultChecked />)

    const checkbox = screen.getByRole('checkbox', { name: 'Include warm-up' })
    expect(checkbox).toBeChecked()
    expect(screen.getByText('Include warm-up')).toBeVisible()

    await user.click(checkbox)

    expect(checkbox).not.toBeChecked()
  })

  it('builds domain fixtures through factories, never by hand', () => {
    const error = makeAppError({ requestId: 'req_example_override' })

    expect(isAppError(error)).toBe(true)
    expect(error.requestId).toBe('req_example_override')
    expect(error.message).toBe('Server error. Try again later.')
  })
})
