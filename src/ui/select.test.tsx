/**
 * DS-04b acceptance: Select is a real `<select>` (native keyboard, type-ahead
 * and mobile picker), wired through FormField with Input's aria contract,
 * framed as Input's visual sibling — the 0.14.3 chamfered element frame, from
 * tokens only — and the dropdown itself is the platform's, no custom listbox.
 */
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Input } from '../design-system/index'
import { renderWithProviders } from '../test/render'
import { Select } from './select'

const goals = [
  { value: 'strength', label: 'Strength' },
  { value: 'hypertrophy', label: 'Hypertrophy' },
  { value: 'conditioning', label: 'Conditioning' },
]

describe('Select is a real native <select>', () => {
  it('renders an HTMLSelectElement with native options', () => {
    renderWithProviders(<Select label="Goal" options={goals} />)

    const select = screen.getByRole('combobox', { name: 'Goal' })
    expect(select).toBeInstanceOf(HTMLSelectElement)

    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(3)
    options.forEach((option) => expect(option).toBeInstanceOf(HTMLOptionElement))
    expect(options.map((o) => o.textContent)).toEqual([
      'Strength',
      'Hypertrophy',
      'Conditioning',
    ])
  })

  it('changes value through the native control and reports (value, event) like Input', async () => {
    const onChange = vi.fn()
    renderWithProviders(
      <Select label="Goal" options={goals} defaultValue="strength" onChange={onChange} />,
    )

    const select = screen.getByRole('combobox', { name: 'Goal' })
    await userEvent.selectOptions(select, 'conditioning')

    expect(onChange).toHaveBeenCalledTimes(1)
    const [value, event] = onChange.mock.calls[0]
    expect(value).toBe('conditioning')
    expect(event.target).toBe(select)
    expect(select).toHaveValue('conditioning')
  })

  it('participates in forms natively — name, required, disabled pass through', () => {
    renderWithProviders(
      <Select label="Goal" options={goals} name="goal" required disabled />,
    )

    const select = screen.getByRole('combobox', { name: /Goal/ })
    expect(select).toHaveAttribute('name', 'goal')
    expect(select).toBeRequired()
    expect(select).toBeDisabled()
  })

  it('renders native option children when given instead of an options array', () => {
    renderWithProviders(
      <Select label="Period">
        <option value="7">Last 7 days</option>
        <option value="30">Last 30 days</option>
      </Select>,
    )

    expect(screen.getAllByRole('option')).toHaveLength(2)
    expect(screen.getByRole('option', { name: 'Last 30 days' })).toBeInstanceOf(
      HTMLOptionElement,
    )
  })
})

describe('Select aria contract through FormField (matches Input)', () => {
  it('label is wired via htmlFor and names the control', () => {
    renderWithProviders(<Select label="Goal" options={goals} />)
    expect(screen.getByLabelText('Goal')).toBeInstanceOf(HTMLSelectElement)
  })

  it('helper text is linked through aria-describedby', () => {
    renderWithProviders(
      <Select label="Goal" options={goals} helperText="Filters your history" />,
    )

    const select = screen.getByRole('combobox', { name: 'Goal' })
    expect(select).toHaveAccessibleDescription('Filters your history')
    // Helper without error is not an invalid state.
    expect(select).not.toHaveAttribute('aria-invalid')
  })

  it('error text implies aria-invalid and joins the description, after helper', () => {
    renderWithProviders(
      <Select
        label="Goal"
        options={goals}
        helperText="Filters your history"
        errorText="Choose a goal"
      />,
    )

    const select = screen.getByRole('combobox', { name: 'Goal' })
    expect(select).toHaveAttribute('aria-invalid', 'true')
    expect(select).toHaveAccessibleDescription('Filters your history Choose a goal')
    expect(screen.getByText('Choose a goal')).toBeInTheDocument()
  })

  it('an explicit invalid prop overrides the errorText inference, like Input', () => {
    renderWithProviders(
      <Select label="Goal" options={goals} errorText="Choose a goal" invalid={false} />,
    )
    expect(screen.getByRole('combobox', { name: 'Goal' })).not.toHaveAttribute(
      'aria-invalid',
    )
  })

  it('marks a required field with the FormField asterisk', () => {
    renderWithProviders(<Select label="Goal" options={goals} required />)
    expect(screen.getByText('*')).toHaveAttribute('aria-hidden', 'true')
  })
})

/** The 0.14.3 element frame: bleed wrapper > chamfered field > control. */
function frameOf(control: HTMLElement) {
  const field = control.parentElement as HTMLElement
  const bleed = field.parentElement as HTMLElement
  return { field, bleed }
}

describe('Select is a visual sibling of Input — the 0.14.3 element frame', () => {
  it('sits in the same chamfered field frame Input emits, from tokens only', () => {
    renderWithProviders(
      <>
        <Select label="Goal" options={goals} />
        <Input label="Name" />
      </>,
    )

    const select = screen.getByRole('combobox', { name: 'Goal' })
    const mine = frameOf(select)
    const theirs = frameOf(screen.getByRole('textbox', { name: 'Name' }))

    // Same wrapper emission and the same 8px cut as the public Input.
    expect(mine.bleed.className).toBe(theirs.bleed.className)
    expect(mine.field.className).toBe(theirs.field.className)
    expect(mine.field).toHaveClass('clr-chamfer', 'clr-chamfer--sm', 'clr-field')
    expect(mine.bleed).toHaveClass('clr-bleed', 'clr-bleed--block')
    expect(select).toHaveClass('clr-input')

    // Border, surface and bleed are the frame's, exactly as Input's are.
    for (const property of ['--surface', '--brd', 'min-height']) {
      expect(mine.field.style.getPropertyValue(property)).toBe(
        theirs.field.style.getPropertyValue(property),
      )
    }
    expect(mine.bleed.style.getPropertyValue('--bleed')).toBe(
      theirs.bleed.style.getPropertyValue('--bleed'),
    )
    expect(mine.field.style.getPropertyValue('--surface')).toBe('var(--surface-input)')
    expect(mine.field.style.getPropertyValue('--brd')).toBe('var(--border-input)')
    expect(mine.bleed.style.getPropertyValue('--bleed')).toBe('var(--border-input)')
    expect(mine.field.style.minHeight).toBe('var(--control-height)')

    // The control itself is borderless and transparent; no literal colour.
    const style = select.getAttribute('style') ?? ''
    expect(style).not.toContain('solid')
    expect(select.style.background).toBe('transparent')
    expect(select).toHaveStyle({ borderRadius: '0px' })
    expect(mine.bleed.outerHTML).not.toMatch(/#[0-9a-fA-F]{3}/)
  })

  it('surface brightens and the frame takes the field-focus border, then settles on blur', async () => {
    renderWithProviders(<Select label="Goal" options={goals} />)

    const select = screen.getByRole('combobox', { name: 'Goal' })
    const { field, bleed } = frameOf(select)
    await userEvent.tab()
    expect(select).toHaveFocus()
    expect(field.style.getPropertyValue('--surface')).toBe('var(--surface-input-active)')
    expect(field.style.getPropertyValue('--brd')).toBe('var(--border-field-focus)')
    expect(bleed.style.getPropertyValue('--bleed')).toBe('var(--border-field-focus)')

    await userEvent.tab()
    expect(select).not.toHaveFocus()
    expect(field.style.getPropertyValue('--surface')).toBe('var(--surface-input)')
    expect(field.style.getPropertyValue('--brd')).toBe('var(--border-input)')
  })

  it('invalid and disabled reuse the Input state tokens', () => {
    renderWithProviders(
      <>
        <Select label="Broken" options={goals} errorText="Choose a goal" />
        <Select label="Off" options={goals} disabled />
      </>,
    )

    const invalid = frameOf(screen.getByRole('combobox', { name: 'Broken' })).field
    expect(invalid.style.getPropertyValue('--surface')).toBe('var(--surface-input-invalid)')
    expect(invalid.style.getPropertyValue('--brd')).toBe('var(--border-input-invalid)')

    const disabled = frameOf(screen.getByRole('combobox', { name: 'Off' })).field
    expect(disabled.style.getPropertyValue('--surface')).toBe('var(--surface-disabled)')
    expect(disabled.style.getPropertyValue('--brd')).toBe('var(--border-disabled)')
  })

  it('focus wins the border over invalid while the surface stays urgent, like Input', async () => {
    renderWithProviders(<Select label="Broken" options={goals} errorText="Choose a goal" />)

    const { field } = frameOf(screen.getByRole('combobox', { name: 'Broken' }))
    await userEvent.tab()
    expect(field.style.getPropertyValue('--brd')).toBe('var(--border-field-focus)')
    expect(field.style.getPropertyValue('--surface')).toBe('var(--surface-input-invalid)')
  })

  it('an invalid field carries the warning glyph, never colour alone', () => {
    renderWithProviders(
      <>
        <Select label="Broken" options={goals} errorText="Choose a goal" />
        <Select label="Fine" options={goals} />
        <Select label="Off" options={goals} errorText="Choose a goal" disabled />
        <Input label="Reference" errorText="Required" />
      </>,
    )

    const glyphOf = (name: string, role = 'combobox') =>
      frameOf(screen.getByRole(role, { name })).field.querySelector('.clr-field__glyph')

    const glyph = glyphOf('Broken')
    expect(glyph).not.toBeNull()
    expect(glyph?.closest('[aria-hidden="true"]')).not.toBeNull()
    // The same glyph the public Input draws, not a local dialect of it.
    expect(glyph?.querySelector('path')?.getAttribute('d')).toBe(
      glyphOf('Reference', 'textbox')?.querySelector('path')?.getAttribute('d'),
    )
    expect(glyphOf('Fine')).toBeNull()
    expect(glyphOf('Off')).toBeNull()
  })

  it('shrinks inside a narrow container without a call-site override', () => {
    renderWithProviders(<Select label="Goal" options={goals} />)

    const select = screen.getByRole('combobox', { name: 'Goal' })
    const { field, bleed } = frameOf(select)
    expect(select.style.minWidth).toBe('0px')
    expect(select.style.width).toBe('100%')
    expect(bleed.style.minWidth).toBe('0px')
    expect((bleed.parentElement as HTMLElement).style.minWidth).toBe('0px')
    // The 40px floor is the frame's, so a narrow field never loses its target.
    expect(field.style.minHeight).toBe('var(--control-height)')
  })

  it('keeps the label above the field', () => {
    renderWithProviders(<Select label="Goal" options={goals} />)

    const { bleed } = frameOf(screen.getByRole('combobox', { name: 'Goal' }))
    const label = screen.getByText('Goal')
    expect(label.tagName).toBe('LABEL')
    expect(label.nextElementSibling).toBe(bleed)
    expect((bleed.parentElement as HTMLElement).style.flexDirection).toBe('column')
  })

  it('the chevron is decorative and never intercepts the pointer', () => {
    renderWithProviders(<Select label="Goal" options={goals} data-testid="goal" />)

    const select = screen.getByRole('combobox', { name: 'Goal' })
    const chevron = select.parentElement?.querySelector('svg')
    expect(chevron).not.toBeNull()
    expect(chevron).toHaveAttribute('aria-hidden', 'true')
    expect(chevron?.parentElement).toHaveStyle({ pointerEvents: 'none' })
  })
})

describe('Select leaves the dropdown to the platform', () => {
  it('renders no custom listbox or popup wiring', () => {
    renderWithProviders(<Select label="Goal" options={goals} />)

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    const select = screen.getByRole('combobox', { name: 'Goal' })
    // Native select needs no popup annotations; adding them would signal a custom list.
    expect(select).not.toHaveAttribute('aria-haspopup')
    expect(select).not.toHaveAttribute('aria-expanded')
    // Every child is a native option — nothing custom inside the control.
    Array.from(select.children).forEach((child) =>
      expect(child.tagName).toBe('OPTION'),
    )
  })
})
