import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Checkbox } from '../design-system/index'
import { CheckboxGroup } from './checkbox-group'

describe('CheckboxGroup', () => {
  it('keeps native group semantics without drawing a second frame', () => {
    render(
      <CheckboxGroup legend="Equipment">
        <Checkbox label="Dumbbells" checked={false} onChange={() => undefined} />
      </CheckboxGroup>,
    )

    const group = screen.getByRole('group', { name: 'Equipment' })
    expect(group.tagName).toBe('FIELDSET')
    expect(group.style.border).toBe('0px')
    expect(group.style.margin).toBe('0px')
    expect(group.style.padding).toBe('0px')
    expect(screen.getByRole('checkbox', { name: 'Dumbbells' })).toBeInTheDocument()
  })
})
