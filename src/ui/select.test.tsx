/**
 * DS-04b acceptance: Select is a real `<select>` (native keyboard, type-ahead
 * and mobile picker), wired through FormField with Input's aria contract,
 * styled as Input's visual sibling from tokens only, and the dropdown itself
 * is the platform's — no custom listbox.
 */
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

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

describe('Select is a visual sibling of Input — tokens only', () => {
  it('draws the structure border, input surface and sharp corners from tokens', () => {
    renderWithProviders(<Select label="Goal" options={goals} />)

    const select = screen.getByRole('combobox', { name: 'Goal' })
    const style = select.getAttribute('style') ?? ''
    // 2px structure border and resting surface come from the same tokens Input uses.
    expect(style).toContain('var(--border-width)')
    expect(style).toContain('var(--border-input)')
    expect(style).toContain('var(--surface-input)')
    expect(select).toHaveStyle({ borderRadius: '0px' })
    // No literal colour anywhere on the control.
    expect(style).not.toMatch(/#[0-9a-fA-F]{3}/)
  })

  it('surface brightens and border sharpens on focus, and settles back on blur', async () => {
    renderWithProviders(<Select label="Goal" options={goals} />)

    const select = screen.getByRole('combobox', { name: 'Goal' })
    await userEvent.tab()
    expect(select).toHaveFocus()
    expect(select.getAttribute('style')).toContain('var(--surface-input-active)')
    expect(select.getAttribute('style')).toContain('var(--border-card)')

    await userEvent.tab()
    expect(select).not.toHaveFocus()
    expect(select.getAttribute('style')).toContain('var(--surface-input)')
    expect(select.getAttribute('style')).toContain('var(--border-input)')
  })

  it('invalid and disabled reuse the Input state tokens', () => {
    renderWithProviders(
      <>
        <Select label="Broken" options={goals} errorText="Choose a goal" />
        <Select label="Off" options={goals} disabled />
      </>,
    )

    const invalid = screen.getByRole('combobox', { name: 'Broken' })
    expect(invalid.getAttribute('style')).toContain('var(--surface-input-invalid)')
    expect(invalid.getAttribute('style')).toContain('var(--border-input-invalid)')

    const disabled = screen.getByRole('combobox', { name: 'Off' })
    expect(disabled.getAttribute('style')).toContain('var(--surface-disabled)')
    expect(disabled.getAttribute('style')).toContain('var(--border-disabled)')
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
