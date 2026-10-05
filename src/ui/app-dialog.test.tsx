/**
 * Package-induced lifecycle compatibility: exercise the real 0.14.3 Dialog,
 * including delayed exit, controlled-close suppression and interrupted exit.
 * Native dialog methods alone are supplied by the shared jsdom shim.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { act, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Button } from '../design-system/index'
import { renderWithProviders } from '../test/render'
import { AppDialog } from './app-dialog'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function getDialog(): HTMLDialogElement {
  const dialog = document.querySelector('dialog')
  if (!dialog) throw new Error('no dialog rendered')
  return dialog
}

const foundation = readFileSync(
  resolve(import.meta.dirname, '../design-system/css/foundation.css'),
  'utf-8',
)

/** The package's "main action" selector, as shipped in `.clr-actions`. */
const MAIN_ACTION =
  '.clr-actions > :is(.clr-btn--primary, .clr-btn--critical, [data-primary], :has(> .clr-btn--primary, > .clr-btn--critical))'

function reduceMotion() {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList,
  )
}

describe('entrance — the package owns the arrival', () => {
  it('opens via showModal with no app-owned motion class', () => {
    renderWithProviders(
      <AppDialog open onClose={() => {}} title="Why this number">
        Body copy
      </AppDialog>,
    )
    const dialog = getDialog()
    expect(dialog.open).toBe(true)
    expect(dialog.className).toBe('clr-dialog')
  })

  it('keeps the consumer className alongside the package class', () => {
    renderWithProviders(<AppDialog open className="app-extra">Body</AppDialog>)
    expect(getDialog().className).toBe('clr-dialog app-extra')
  })

  it('arrives and leaves on the package phosphor and its four-step backdrop', () => {
    // jsdom runs no stylesheet, so the motion the adapter defers to is
    // asserted against the vendored source it defers to.
    expect(foundation).toContain(
      '.clr-dialog[open]:not(.clr-dialog--closing)::backdrop { animation: clr-fade-in var(--dur-base) var(--step-4) both; }',
    )
    expect(foundation).toContain(
      '.clr-dialog[open]:not(.clr-dialog--closing) > .clr-bleed { animation: clr-phosphor-in var(--dur-base) var(--step-6) both; }',
    )
    expect(foundation).toContain(
      '.clr-dialog--closing::backdrop { animation: clr-fade-out var(--dur-base) var(--step-4) both; }',
    )
    expect(foundation).toContain(
      '.clr-dialog--closing > .clr-bleed { animation: clr-phosphor-out var(--dur-base) var(--step-6) both; }',
    )
  })
})

describe('dismissal — one vendor exit before the platform close', () => {
  it('holds a controlled close open for exactly the vendor exit, without reporting it', () => {
    vi.useFakeTimers()
    const onClose = vi.fn()
    const view = renderWithProviders(<AppDialog open onClose={onClose}>Body</AppDialog>)
    view.rerender(<AppDialog open={false} onClose={onClose}>Body</AppDialog>)
    const dialog = getDialog()
    expect(dialog.open).toBe(true)
    expect(dialog).toHaveClass('clr-dialog--closing')
    act(() => vi.advanceTimersByTime(199))
    expect(dialog.open).toBe(true)
    act(() => vi.advanceTimersByTime(1))
    expect(dialog.open).toBe(false)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('Esc reports exactly one dismissal only after the real delayed close', () => {
    vi.useFakeTimers()
    const onClose = vi.fn()
    renderWithProviders(<AppDialog open onClose={onClose}>Body</AppDialog>)
    const dialog = getDialog()
    const cancel = new Event('cancel', { cancelable: true })
    fireEvent(dialog, cancel)
    expect(cancel.defaultPrevented).toBe(true)
    expect(dialog.open).toBe(true)
    expect(onClose).not.toHaveBeenCalled()
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    act(() => vi.advanceTimersByTime(200))
    expect(dialog.open).toBe(false)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('a native close remains closed and is reported once', () => {
    const onClose = vi.fn()
    renderWithProviders(<AppDialog open onClose={onClose}>Body</AppDialog>)
    act(() => getDialog().close())
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(getDialog().open).toBe(false)
    expect(getDialog()).not.toHaveClass('clr-dialog--closing')
  })

  it('reopening cancels a controlled exit and does not suppress a later user dismissal', () => {
    vi.useFakeTimers()
    const onClose = vi.fn()
    const view = renderWithProviders(<AppDialog open onClose={onClose}>Body</AppDialog>)
    view.rerender(<AppDialog open={false} onClose={onClose}>Body</AppDialog>)
    act(() => vi.advanceTimersByTime(100))
    view.rerender(<AppDialog open onClose={onClose}>Body</AppDialog>)
    act(() => vi.advanceTimersByTime(200))
    expect(getDialog().open).toBe(true)
    expect(getDialog()).not.toHaveClass('clr-dialog--closing')
    expect(onClose).not.toHaveBeenCalled()
    fireEvent(getDialog(), new Event('cancel', { cancelable: true }))
    act(() => vi.advanceTimersByTime(200))
    expect(getDialog().open).toBe(false)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('a controlled close during a user exit ends it silently, and reopening starts clean', () => {
    vi.useFakeTimers()
    const onClose = vi.fn()
    const view = renderWithProviders(<AppDialog open onClose={onClose}>Body</AppDialog>)
    fireEvent(getDialog(), new Event('cancel', { cancelable: true }))
    act(() => vi.advanceTimersByTime(100))
    // The parent withdrew `open` itself, so it already knows.
    view.rerender(<AppDialog open={false} onClose={onClose}>Body</AppDialog>)
    act(() => vi.advanceTimersByTime(100))
    expect(getDialog().open).toBe(false)
    expect(onClose).not.toHaveBeenCalled()

    view.rerender(<AppDialog open onClose={onClose}>Body</AppDialog>)
    expect(getDialog().open).toBe(true)
    expect(getDialog()).not.toHaveClass('clr-dialog--closing')
    fireEvent(getDialog(), new Event('cancel', { cancelable: true }))
    act(() => vi.advanceTimersByTime(200))
    expect(getDialog().open).toBe(false)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('backdrop — a dismissal only where the caller allows it', () => {
  it('reports one dismissal after the exit when the backdrop is dismissible', () => {
    vi.useFakeTimers()
    const onClose = vi.fn()
    renderWithProviders(
      <AppDialog open dismissOnBackdrop onClose={onClose} actions={<button>Close</button>}>
        Body
      </AppDialog>,
    )
    const dialog = getDialog()
    // A click inside the panel is not a backdrop click.
    fireEvent.click(screen.getByText('Body'))
    expect(dialog).not.toHaveClass('clr-dialog--closing')

    fireEvent.click(dialog)
    fireEvent.click(dialog)
    expect(dialog.open).toBe(true)
    expect(dialog).toHaveClass('clr-dialog--closing')
    expect(onClose).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(200))
    expect(dialog.open).toBe(false)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('ignores the backdrop by default', () => {
    vi.useFakeTimers()
    const onClose = vi.fn()
    renderWithProviders(<AppDialog open onClose={onClose}>Body</AppDialog>)
    fireEvent.click(getDialog())
    act(() => vi.advanceTimersByTime(200))
    expect(getDialog().open).toBe(true)
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('reduced motion — the end state, immediately', () => {
  it('Esc closes at once and reports exactly one dismissal', () => {
    reduceMotion()
    vi.useFakeTimers()
    const onClose = vi.fn()
    renderWithProviders(<AppDialog open onClose={onClose}>Body</AppDialog>)
    fireEvent(getDialog(), new Event('cancel', { cancelable: true }))
    expect(getDialog().open).toBe(false)
    expect(getDialog()).not.toHaveClass('clr-dialog--closing')
    expect(vi.getTimerCount()).toBe(0)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('silences the package arrival and exit rather than shortening them', () => {
    expect(foundation).toContain(
      '@media (prefers-reduced-motion: reduce) { .clr-dialog[open]::backdrop, .clr-dialog[open] > .clr-bleed, .clr-dialog--closing::backdrop, .clr-dialog--closing > .clr-bleed { animation: none; } }',
    )
  })

  it('opens and closes without scheduling anything to wait on', () => {
    reduceMotion()
    vi.useFakeTimers()
    const onClose = vi.fn()
    const view = renderWithProviders(
      <AppDialog open onClose={onClose} title="Why this number" actions={<button>Close</button>}>
        Body copy
      </AppDialog>,
    )
    expect(getDialog().open).toBe(true)
    expect(screen.getByText('Body copy')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
    expect(vi.getTimerCount()).toBe(0)
    view.rerender(<AppDialog open={false} onClose={onClose}>Body copy</AppDialog>)
    expect(getDialog().open).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('platform contract preserved', () => {
  it('renders a real dialog with the shipped chamfered panel and accessible title', () => {
    renderWithProviders(<AppDialog open title="Why this number">Body copy</AppDialog>)
    const dialog = screen.getByRole('dialog', { name: 'Why this number' })
    expect(dialog.tagName).toBe('DIALOG')
    expect(dialog.querySelector('.clr-chamfer')).not.toBeNull()
  })

  it('names the dialog from one semantic heading', () => {
    renderWithProviders(<AppDialog open title="Why this number">Body copy</AppDialog>)
    const headings = within(getDialog()).getAllByRole('heading')
    expect(headings).toHaveLength(1)
    expect(headings[0].tagName).toBe('H2')
    expect(getDialog().getAttribute('aria-labelledby')).toBe(headings[0].id)
  })

  it('leaves the trap and the inert background to showModal', () => {
    const showModal = vi.spyOn(HTMLDialogElement.prototype, 'showModal')
    renderWithProviders(<AppDialog open title="Why this number">Body copy</AppDialog>)
    expect(showModal).toHaveBeenCalledTimes(1)
    // No scripted trap: nothing is given a tabindex, an inert flag or a
    // hand-rolled modal role for the platform's own to fight with.
    const dialog = getDialog()
    expect(dialog.hasAttribute('aria-modal')).toBe(false)
    expect(dialog.hasAttribute('role')).toBe(false)
    expect(document.querySelector('[tabindex], [inert], [aria-hidden="true"]')).toBeNull()
  })
})

describe('actions — the package row, with the safe action first', () => {
  function renderActions() {
    renderWithProviders(
      <AppDialog
        open
        title="Discard workout"
        actions={
          <>
            <Button variant="secondary">Keep</Button>
            <Button variant="critical">Discard</Button>
          </>
        }
      >
        Body
      </AppDialog>,
    )
  }

  it('renders actions in the shipped row, with no layout of its own', () => {
    renderActions()
    const row = getDialog().querySelector<HTMLElement>('.clr-actions')
    expect(row).not.toBeNull()
    expect(row?.className).toBe('clr-actions')
    expect(row?.getAttribute('style')).toBeNull()
    expect(within(row as HTMLElement).getAllByRole('button')).toHaveLength(2)
  })

  it('keeps the safe action first in DOM order, where showModal lands focus', () => {
    renderActions()
    const first = getDialog().querySelector('button, [href], input, select, textarea')
    expect(first).toHaveTextContent('Keep')
    expect(first).not.toHaveClass('clr-btn--primary', 'clr-btn--critical')
  })

  it('marks exactly one main action for the package to reorder', () => {
    renderActions()
    const main = getDialog().querySelectorAll(MAIN_ACTION)
    expect(main).toHaveLength(1)
    expect(main[0]).toHaveTextContent('Discard')
  })

  it('stacks full width with the main action on top, then an equal row with it on the right', () => {
    const wide = foundation.slice(foundation.indexOf('@media (min-width: 560px)', foundation.indexOf('.clr-actions {')))
    const phone = foundation.slice(foundation.indexOf('.clr-actions {'), foundation.indexOf(wide))
    expect(phone).toContain('.clr-actions { display: grid; gap: var(--spacing-200); }')
    expect(phone).toContain('.clr-actions > .clr-bleed > .clr-btn, .clr-actions > .clr-btn { width: 100%; }')
    expect(phone).toContain(`${MAIN_ACTION} { order: -1; }`)
    expect(wide).toContain('.clr-actions { grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); }')
    expect(wide).toContain(`${MAIN_ACTION} { order: 2; }`)
  })
})
