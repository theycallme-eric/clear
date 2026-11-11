/**
 * TASK-019 — focus is never stranded on the inert page while a log is open.
 *
 * Found by the cross-family browser proof (`e2e/refinement/task-019.spec.ts`):
 * after a refused save made by keyboard, the set families moved focus to the
 * dialog's title (TASK-043), but a movement note, workout feedback and the
 * rest day left it on the page body — their Save is unavailable while the
 * write is in flight, and Chromium drops focus from a disabled control with a
 * `focusout` whose `relatedTarget` is null. `LoggingOverlay` now moves such
 * stranded focus to its own title, a programmatic target only.
 */
import { act, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { LoggingOverlay } from './refinements/logging-overlay'

function Consumer({ open = true }: { open?: boolean }) {
  const [busy, setBusy] = useState(false)
  return (
    <LoggingOverlay open={open} title="Notes — back squat" onClose={() => {}}>
      <button type="button" disabled={busy} onClick={() => setBusy(true)}>
        Save note
      </button>
    </LoggingOverlay>
  )
}

const flush = () => act(async () => { await Promise.resolve() })

describe('TASK-019 LoggingOverlay keeps focus inside', () => {
  it('moves focus stranded on the page body to the dialog title, outside the Tab order', async () => {
    render(<Consumer />)
    const dialog = screen.getByRole('dialog', { name: 'Notes — back squat' })
    const save = screen.getByRole('button', { name: 'Save note' })
    save.focus()
    expect(save).toHaveFocus()

    // The browser drops focus from a control that goes away under it.
    act(() => save.blur())
    await flush()
    const title = screen.getByRole('heading', { name: 'Notes — back squat' })
    expect(title).toHaveFocus()
    expect(title).toHaveAttribute('tabindex', '-1')
    expect(dialog.contains(document.activeElement)).toBe(true)
  })

  it('leaves focus the reader moved elsewhere inside the log, and a closed log, alone', async () => {
    const { rerender } = render(<Consumer />)
    const close = screen.getByRole('button', { name: 'Close log' })
    const save = screen.getByRole('button', { name: 'Save note' })
    save.focus()
    act(() => close.focus())
    await flush()
    expect(close).toHaveFocus()

    rerender(<Consumer open={false} />)
    act(() => (document.activeElement as HTMLElement | null)?.blur())
    await flush()
    expect(screen.getByRole('heading', { name: 'Notes — back squat', hidden: true })).not.toHaveFocus()
  })
})
