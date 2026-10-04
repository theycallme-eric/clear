/**
 * Package-induced lifecycle compatibility: exercise the real 0.14.3 Dialog,
 * including delayed exit, controlled-close suppression and interrupted exit.
 * Native dialog methods alone are supplied by the shared jsdom shim.
 */
import { act, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

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

describe('entrance — a dialog constructs itself', () => {
  it('opens via showModal wearing the composed entrance class', () => {
    renderWithProviders(
      <AppDialog open onClose={() => {}} title="Why this number">
        Body copy
      </AppDialog>,
    )
    const dialog = getDialog()
    expect(dialog.open).toBe(true)
    expect(dialog).toHaveClass('clr-app-dialog-enter')
    expect(dialog.querySelector('.clr-phosphor-in')).toBeNull()
    expect(dialog).not.toHaveClass('clr-phosphor-in')
  })

  it('keeps the consumer className alongside the motion class', () => {
    renderWithProviders(<AppDialog open className="app-extra">Body</AppDialog>)
    expect(getDialog()).toHaveClass('clr-dialog', 'clr-app-dialog-enter', 'app-extra')
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

})

describe('reduced motion — the end state, immediately', () => {
  it('opens and closes without scheduling anything to wait on', () => {
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
})
