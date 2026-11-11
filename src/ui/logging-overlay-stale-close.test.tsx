/**
 * TASK-045 — a stale native `close` event never closes a reopened log.
 *
 * The browser queues a dialog's `close` event. When a consumer closes the
 * log (its X, Escape, or a save) and the athlete reopens it at once — found
 * in the browser by reopening Workout feedback with Enter straight after
 * Escape — the queued event from the earlier close used to arrive while the
 * dialog was open again and close it. `LoggingOverlay` now ignores a `close`
 * event while its dialog is open; a real close still reaches the consumer.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { LoggingOverlay } from './refinements/logging-overlay'

describe('TASK-045 LoggingOverlay stale close', () => {
  it('ignores a queued close event that arrives after the log is open again, and still hears a real one', () => {
    const onClose = vi.fn()
    render(
      <LoggingOverlay open title="Workout feedback" onClose={onClose}>
        <p>Form</p>
      </LoggingOverlay>,
    )
    const dialog = screen.getByRole('dialog', { name: 'Workout feedback' }) as HTMLDialogElement
    expect(dialog.open).toBe(true)

    // The earlier close's event, delivered while the dialog is open again.
    dialog.dispatchEvent(new Event('close'))
    expect(onClose).not.toHaveBeenCalled()
    expect(dialog.open).toBe(true)

    // A close the browser makes itself (the dialog is no longer open) is reported.
    dialog.close()
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
