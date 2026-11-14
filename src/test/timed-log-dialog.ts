/**
 * TASK-046 (REQ-019, C45): test access to a timed block's result log now that
 * it is held by the shared focused dialog (`refinements/timed-result-dialog.tsx`).
 *
 * A timed block draws one "Log results" action where its log used to be; the
 * log itself — the same `TimedResultLog` form — is in a `LoggingOverlay`
 * portalled to the document body. These helpers open a block's log from its
 * own action (closing any other timed log first, as an athlete would) and
 * return the open dialog's form, so a case reads and operates the same fields
 * it always did. Synchronous (`fireEvent`), so they fit the existing
 * synchronous lookups. jsdom draws no top layer, so the page behind is not
 * made inert here; the browser specs prove that.
 */
import { fireEvent, within } from '@testing-library/react'

/** The opener's words and the dialog's title. */
export const TIMED_LOG_LABEL = 'Log results'

/** The block's "Log results" action within `scope`, or null when the block offers no log. */
export function timedLogOpener(scope: HTMLElement): HTMLButtonElement | null {
  const openers = scope.querySelectorAll<HTMLButtonElement>('[data-timed-log-opener] button')
  if (openers.length > 1) throw new Error(`expected at most one timed log in scope, found ${openers.length}`)
  return openers[0] ?? null
}

/** Every timed log dialog that is open now. */
export function openTimedLogDialogs(): HTMLDialogElement[] {
  return [...document.querySelectorAll<HTMLDialogElement>('dialog.clr-accepted-log[open]')].filter(
    (dialog) => dialog.querySelector('form.clr-timed-log') !== null,
  )
}

/** Closes every open timed log with its framed X. */
export function closeTimedLogs() {
  for (const dialog of openTimedLogDialogs()) {
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close log' }))
  }
}

/**
 * Opens the block's log from its action in `scope` (unless it is already the
 * open one) and returns the dialog holding it; null when the block offers no
 * log. `scope` defaults to the whole document, for a mount of one block.
 */
export function queryTimedLogDialog(scope: HTMLElement = document.body): HTMLDialogElement | null {
  const opener = timedLogOpener(scope)
  if (opener === null) return null
  if (opener.getAttribute('aria-expanded') !== 'true') {
    closeTimedLogs()
    fireEvent.click(opener)
  }
  const open = openTimedLogDialogs()
  if (open.length !== 1) throw new Error(`expected one open timed log, found ${open.length}`)
  return open[0]
}

/** The open log's form (the shared `TimedResultLog`), opened from `scope`; null when none is offered. */
export function queryTimedLog(scope: HTMLElement = document.body): HTMLElement | null {
  const dialog = queryTimedLogDialog(scope)
  return dialog === null ? null : dialog.querySelector<HTMLElement>('form.clr-timed-log')
}

/** As `queryTimedLog`, failing when the block offers no log. */
export function timedLog(scope: HTMLElement = document.body): HTMLElement {
  const form = queryTimedLog(scope)
  if (form === null) throw new Error('the block offers no timed log')
  return form
}
