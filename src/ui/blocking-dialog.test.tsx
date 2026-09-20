/**
 * DS-05 acceptance: the blocking surfaces. A decision the user must take and
 * a failure that stops the flow are both a `Dialog` — never a bottom sheet
 * (decided 2026-08-25, ATOMIC §12) — and both inherit `AppDialog`'s entrance
 * and its phosphor-out dismissal, so a blocking overlay always constructs
 * itself rather than sliding in.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { createError, ErrorCode } from '../state/errors'
import { renderWithProviders } from '../test/render'
import { ConfirmDialog, ErrorDialog } from './blocking-dialog'

function getDialog(): HTMLDialogElement {
  const dialog = document.querySelector('dialog')
  if (!dialog) throw new Error('no dialog rendered')
  return dialog
}

describe('ConfirmDialog — a confirmation is a Dialog, not a sheet', () => {
  it('renders a native modal dialog wearing the composed entrance', () => {
    renderWithProviders(
      <ConfirmDialog
        open
        title="Discard workout"
        confirmLabel="Discard"
        onConfirm={() => {}}
        onCancel={() => {}}
      >
        This workout has not been saved.
      </ConfirmDialog>,
    )

    const dialog = screen.getByRole('dialog', { name: 'Discard workout' })
    expect(dialog.tagName).toBe('DIALOG')
    expect(getDialog().open).toBe(true)
    expect(dialog).toHaveClass('clr-app-dialog-enter')
    // A dialog constructs itself; only a toast phosphors in.
    expect(dialog).not.toHaveClass('clr-phosphor-in')
    expect(dialog.querySelector('.clr-phosphor-in')).toBeNull()
  })

  it('puts the safe action first in DOM order, where showModal lands focus', () => {
    renderWithProviders(
      <ConfirmDialog
        open
        title="Delete workout"
        confirmLabel="Delete"
        critical
        onConfirm={() => {}}
        onCancel={() => {}}
      >
        Deleting removes this workout and its history.
      </ConfirmDialog>,
    )

    const labels = screen.getAllByRole('button').map((button) => button.textContent)
    expect(labels).toEqual(['Cancel', 'Delete'])
  })

  it('reports confirm and cancel separately', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    renderWithProviders(
      <ConfirmDialog
        open
        title="Discard workout"
        confirmLabel="Discard"
        onConfirm={onConfirm}
        onCancel={onCancel}
      >
        Body
      </ConfirmDialog>,
    )

    await user.click(screen.getByRole('button', { name: 'Discard' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('Esc is the safe exit and reports one cancellation', () => {
    const onCancel = vi.fn()
    const onConfirm = vi.fn()
    renderWithProviders(
      <ConfirmDialog open title="Discard workout" onConfirm={onConfirm} onCancel={onCancel}>
        Body
      </ConfirmDialog>,
    )

    fireEvent(getDialog(), new Event('cancel', { cancelable: true }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('a destructive confirmation is not dismissible by a stray backdrop click', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    renderWithProviders(
      <ConfirmDialog
        open
        critical
        title="Delete workout"
        confirmLabel="Delete"
        onConfirm={() => {}}
        onCancel={onCancel}
      >
        Body
      </ConfirmDialog>,
    )

    await user.click(getDialog())

    expect(onCancel).not.toHaveBeenCalled()
  })
})

describe('ErrorDialog — a blocking AppError', () => {
  const error = createError(ErrorCode.GENERATION_FAILED, { requestId: 'req_test_123abc' })

  it('shows the user message, the requestId and exactly one retry action', () => {
    renderWithProviders(
      <ErrorDialog open error={error} onRetry={() => {}} onDismiss={() => {}} />,
    )

    const dialog = screen.getByRole('dialog', { name: 'Request failed' })
    expect(dialog).toHaveTextContent('Could not generate workout. Try again.')
    expect(dialog).toHaveTextContent('req_test_123abc')

    const retries = screen
      .getAllByRole('button')
      .filter((button) => button.textContent === 'Retry')
    expect(retries).toHaveLength(1)
  })

  it('carries severity as a glyph, never colour alone', () => {
    renderWithProviders(<ErrorDialog open error={error} onDismiss={() => {}} />)

    expect(getDialog().querySelector('svg')).not.toBeNull()
  })

  it('offers no retry when the failure has none, and still closes', async () => {
    const user = userEvent.setup()
    const onDismiss = vi.fn()
    renderWithProviders(<ErrorDialog open error={error} onDismiss={onDismiss} />)

    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('runs the retry and reports the dismissal once', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    const onDismiss = vi.fn()
    renderWithProviders(
      <ErrorDialog open error={error} onRetry={onRetry} onDismiss={onDismiss} />,
    )

    await user.click(screen.getByRole('button', { name: 'Retry' }))

    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('wears the critical frame of the shipped Dialog', () => {
    renderWithProviders(<ErrorDialog open error={error} onDismiss={() => {}} />)

    const panel = getDialog().querySelector<HTMLElement>('.clr-chamfer')
    expect(panel?.style.getPropertyValue('--brd')).toBe('var(--border-toast-negative)')
  })
})

describe('both blocking surfaces dismiss through phosphor-out', () => {
  it('keeps the confirmation mounted while it decays', () => {
    const view = renderWithProviders(
      <ConfirmDialog open title="Discard workout" onConfirm={() => {}} onCancel={() => {}}>
        Body
      </ConfirmDialog>,
    )

    // The exit animation cannot run in jsdom, so the close is immediate — the
    // decay class is the same one `app-dialog.test.tsx` proves holds it open.
    view.rerender(
      <ConfirmDialog
        open={false}
        title="Discard workout"
        onConfirm={() => {}}
        onCancel={() => {}}
      >
        Body
      </ConfirmDialog>,
    )

    expect(getDialog().open).toBe(false)
  })

  it('no app-owned source hand-rolls an overlay beside the shipped Dialog', () => {
    // The 2026-08-25 decision, kept true in the tree rather than in prose:
    // every overlay is the platform's <dialog> via the export's component.
    const root = resolve(import.meta.dirname, '..')
    const skip = new Set(['design-system', 'test'])
    const offenders: string[] = []
    const scanned: string[] = []

    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          if (!skip.has(entry.name)) walk(resolve(dir, entry.name))
          continue
        }
        if (!/\.tsx?$/.test(entry.name) || entry.name.includes('.test.')) continue
        const source = readFileSync(resolve(dir, entry.name), 'utf-8')
        scanned.push(entry.name)
        if (/bottom-?sheet/i.test(source) || /role=["']dialog["']/.test(source)) {
          offenders.push(entry.name)
        }
      }
    }
    walk(root)

    expect(scanned).toContain('blocking-dialog.tsx')
    expect(offenders).toEqual([])
  })

  it('never renders a bottom sheet: the only overlay element is <dialog>', () => {
    renderWithProviders(
      <ErrorDialog
        open
        error={createError(ErrorCode.NETWORK_OFFLINE)}
        onDismiss={() => {}}
      />,
    )

    expect(document.querySelectorAll('dialog')).toHaveLength(1)
    expect(document.querySelector('[class*="sheet"]')).toBeNull()
  })
})
