import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { Input } from '../design-system/index'
import { renderWithProviders } from '../test/render'
import { focusFirstInvalid, useInvalidFocus } from './formFocus'
import { Select } from './select'
import { TextAction } from './text-action'

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

/**
 * The hook is the half that forms actually use, and the half that has to get
 * React's timing right: the control is marked invalid by the render the
 * failure causes, so the focus move has to happen after that render, not
 * inside the handler that caused it.
 */
describe('useInvalidFocus (CORE-05, the shared submit helper)', () => {
  /** A two-field form whose submit fails on the second field, or succeeds. */
  function Sample({
    accept = false,
    async: isAsync = false,
  }: {
    accept?: boolean
    async?: boolean
  }) {
    const onSubmit = useInvalidFocus()
    const [rejected, setRejected] = useState(false)

    function submit(): boolean | Promise<boolean> {
      if (accept) return isAsync ? Promise.resolve(true) : true
      if (isAsync) {
        return Promise.resolve().then(() => {
          setRejected(true)
          return false
        })
      }
      setRejected(true)
      return false
    }

    return (
      <form aria-label="Sample" onSubmit={onSubmit(submit)} noValidate>
        <input aria-label="First" />
        <input aria-label="Second" aria-invalid={rejected || undefined} />
        <button type="submit">Submit</button>
      </form>
    )
  }

  const submitButton = () => screen.getByRole('button', { name: 'Submit' })

  it('moves focus to the control the failed submit marked invalid', async () => {
    const user = userEvent.setup()
    render(<Sample />)

    await user.click(submitButton())

    expect(screen.getByRole('textbox', { name: 'Second' })).toHaveFocus()
  })

  it('moves focus again when the same bad value is submitted twice', async () => {
    const user = userEvent.setup()
    render(<Sample />)

    await user.click(submitButton())
    await user.click(screen.getByRole('textbox', { name: 'First' }))
    expect(screen.getByRole('textbox', { name: 'First' })).toHaveFocus()

    await user.click(submitButton())

    expect(screen.getByRole('textbox', { name: 'Second' })).toHaveFocus()
  })

  it('follows a failure the server decided, not only a local one', async () => {
    const user = userEvent.setup()
    render(<Sample async />)

    await user.click(submitButton())

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Second' })).toHaveFocus()
    })
  })

  it('leaves focus alone when the submit was accepted', async () => {
    const user = userEvent.setup()
    render(<Sample accept />)

    await user.click(submitButton())

    expect(submitButton()).toHaveFocus()
  })

  it('prevents the browser default, so the app owns the failure', async () => {
    const user = userEvent.setup()
    let defaultPrevented: boolean | null = null
    render(
      <div
        onSubmit={(event) => {
          defaultPrevented = event.defaultPrevented
        }}
      >
        <Sample />
      </div>,
    )

    await user.click(submitButton())

    expect(defaultPrevented).toBe(true)
  })
})

/**
 * The 0.14.3 field is an element frame around a borderless control. The helper
 * has to land on the control inside that frame, not on the frame, and the
 * frame's own contract — label above, unit, glyph, sizing — has to survive.
 */
describe('the shared helper against the 0.14.3 framed fields', () => {
  const foundation = readFileSync(
    resolve(import.meta.dirname, '../design-system/css/foundation.css'),
    'utf-8',
  )

  /** Bleed wrapper > chamfered field > control. */
  function frameOf(control: HTMLElement) {
    const field = control.parentElement as HTMLElement
    return { field, bleed: field.parentElement as HTMLElement }
  }

  it('focuses the control inside the first invalid frame, across Input and Select', () => {
    renderWithProviders(
      <form aria-label="Sample">
        <Input label="Name" />
        <Select label="Goal" errorText="Choose a goal">
          <option value="">None</option>
        </Select>
        <Input label="Notes" multiline errorText="Too long" />
      </form>,
    )

    const focused = focusFirstInvalid(screen.getByRole('form'))

    const select = screen.getByRole('combobox', { name: 'Goal' })
    expect(focused).toBe(select)
    expect(select).toHaveFocus()
  })

  it('keeps the label above, the wrapper emission, the unit and the warning glyph', () => {
    renderWithProviders(<Input label="Load" unit="kg" errorText="Enter a load" />)

    const input = screen.getByRole('textbox', { name: 'Load' })
    const { field, bleed } = frameOf(input)
    expect(bleed).toHaveClass('clr-bleed', 'clr-bleed--block')
    expect(field).toHaveClass('clr-chamfer', 'clr-chamfer--sm', 'clr-field')
    expect(screen.getByText('Load').nextElementSibling).toBe(bleed)

    // The unit is in the field, announced with it, and is not editable text.
    const unit = screen.getByText('kg')
    expect(unit.parentElement).toBe(field)
    expect(unit).toHaveClass('clr-field__unit')
    expect(input).toHaveAccessibleDescription('kg Enter a load')
    expect(input).toHaveValue('')

    const glyph = field.querySelector('.clr-field__glyph')
    expect(glyph).toHaveAttribute('aria-hidden', 'true')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(field.style.getPropertyValue('--surface')).toBe('var(--surface-input-invalid)')
  })

  it('lets a narrow container shrink the field without a raw override', () => {
    renderWithProviders(
      <div className="clr-stack">
        <Input label="Reps" unit="reps" />
      </div>,
    )

    const input = screen.getByRole('textbox', { name: 'Reps' })
    const { field, bleed } = frameOf(input)
    expect(input.style.minWidth).toBe('0px')
    expect(input.style.width).toBe('100%')
    expect((bleed.parentElement as HTMLElement).style.minWidth).toBe('0px')
    // The 40px floor stays with the frame however narrow it gets.
    expect(field.style.minHeight).toBe('var(--control-height)')
    expect(foundation).toMatch(/--control-height:\s*40px/)
  })

  it('grows a textarea with its content and never shows the native grip', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Input label="Notes" multiline />)

    const textarea = screen.getByRole('textbox', { name: 'Notes' })
    const { field } = frameOf(textarea)
    expect(textarea).toBeInstanceOf(HTMLTextAreaElement)
    expect(textarea).toHaveClass('clr-input')
    expect(textarea.style.resize).toBe('none')

    // Growth is the stylesheet's: the frame sets no height and clips nothing,
    // so a second and third line stay inside the field instead of scrolling.
    const rule = foundation.match(/\.clr-field > textarea\.clr-input \{([^}]*)\}/)?.[1] ?? ''
    expect(rule).toContain('field-sizing: content')
    expect(rule).toContain('resize: none')
    expect(field.style.minHeight).toBe('')
    expect(field.style.height).toBe('')
    expect(textarea.style.height).toBe('')
    expect(textarea.style.overflow).toBe('')

    await user.type(textarea, 'one{enter}two{enter}three{enter}four')
    expect(textarea).toHaveValue('one\ntwo\nthree\nfour')
    expect(textarea.style.height).toBe('')
  })

  it('carries disabled, read-only, error and focus states on a textarea frame', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <>
        <Input label="Active" multiline />
        <Input label="Locked" multiline readOnly defaultValue="Kept" />
        <Input label="Broken" multiline errorText="Too long" />
        <Input label="Off" multiline disabled />
      </>,
    )

    const active = screen.getByRole('textbox', { name: 'Active' })
    await user.click(active)
    expect(active).toHaveFocus()
    expect(frameOf(active).field.style.getPropertyValue('--brd')).toBe(
      'var(--border-field-focus)',
    )
    expect(frameOf(active).field.style.getPropertyValue('--surface')).toBe(
      'var(--surface-input-active)',
    )

    const locked = screen.getByRole('textbox', { name: 'Locked' })
    await user.type(locked, 'more')
    expect(locked).toHaveAttribute('readonly')
    expect(locked).toHaveValue('Kept')

    const broken = frameOf(screen.getByRole('textbox', { name: 'Broken' })).field
    expect(broken.style.getPropertyValue('--brd')).toBe('var(--border-input-invalid)')
    expect(broken.querySelector('.clr-field__glyph')).not.toBeNull()

    const off = screen.getByRole('textbox', { name: 'Off' })
    expect(off).toBeDisabled()
    expect(frameOf(off).field.style.getPropertyValue('--brd')).toBe('var(--border-disabled)')
  })

  it('keeps a quiet action reachable and visibly focused beside a narrow field', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <form aria-label="Sample">
        <Input label="Reps" />
        <TextAction onClick={() => undefined}>Skip for now</TextAction>
        <TextAction to="/history">View history</TextAction>
      </form>,
    )

    await user.tab()
    expect(screen.getByRole('textbox', { name: 'Reps' })).toHaveFocus()
    await user.tab()
    const skip = screen.getByRole('button', { name: 'Skip for now' })
    expect(skip).toHaveFocus()
    await user.tab()
    const view = screen.getByRole('link', { name: 'View history' })
    expect(view).toHaveFocus()

    // Nothing inline suppresses the system focus ring on either element.
    for (const action of [skip, view]) {
      expect(action).toHaveClass('clr-text-action')
      expect(action.style.outline).toBe('')
    }
    expect(foundation).toMatch(/button:focus-visible, a:focus-visible[^{]*\{\s*outline: var\(--focus-ring-width\)/)
    expect(foundation).toMatch(/\.clr-text-action \{[^}]*min-height: var\(--control-height\)/)
  })
})

/**
 * "One shared submit helper, not a per-form habit" is only true while it is
 * the only way a form handles submission. A new form that writes its own
 * focus move is the failure mode this test exists to catch.
 */
describe('every form in the app submits through the shared helper', () => {
  const srcDir = resolve(import.meta.dirname, '..')

  function appSources(dir: string, found: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      // The vendored export owns its own component layer, and the gallery
      // renders specimens of it rather than app forms.
      if (entry.name === 'design-system' || entry.name === 'dev') continue

      const full = resolve(dir, entry.name)
      if (entry.isDirectory()) {
        appSources(full, found)
      } else if (/\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name)) {
        found.push(full)
      }
    }
    return found
  }

  const formFiles = appSources(srcDir).filter((file) =>
    /<form[\s>]/.test(readFileSync(file, 'utf-8')),
  )

  it('finds the forms it is checking', () => {
    expect(formFiles.length).toBeGreaterThan(0)
  })

  it('wires each one to useInvalidFocus', () => {
    const offenders = formFiles.filter(
      (file) => !readFileSync(file, 'utf-8').includes('useInvalidFocus'),
    )

    expect(offenders).toEqual([])
  })
})
