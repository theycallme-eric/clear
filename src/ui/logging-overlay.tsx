/**
 * One proposed logging surface; native modal behavior in both visual treatments.
 *
 * A3 TASK-106 (F4) carries the old build's modal focus behaviour into Round
 * 7's dialog. The look is unchanged: the same AppDialog, frame, header, X,
 * scroller and backdrop. What the dialog now also does:
 *
 *   · **Its title is a focus target.** The dialog keeps Round 7's name (its
 *     `aria-label` is the title); the title now also has an id, which a form
 *     held inside reads through `LoggingOverlayTitleContext` — the set entry
 *     moves focus there when Save replaces the form with its confirmation
 *     (TASK-020, TASK-043).
 *   · **Opening focus is a control's.** After `showModal()` the X takes focus,
 *     as Chromium's own dialog focusing steps already give it (the X is the
 *     first control in tree order), so every browser and the tests agree.
 *     Focus already inside the dialog is left where it is.
 *   · **Focus comes back, once the dialog has closed.** The control that
 *     opened the log is remembered; when the native dialog has closed —
 *     however it closed: its X, Escape, or the consumer closing it after a
 *     Save or at rest end — `onAfterClose` runs first (a consumer that knows
 *     better, such as a correction's Edit, takes focus there), and focus left
 *     stranded on the page or in the closed dialog then goes to the opener.
 *     Nothing is focused while the workout behind is still inert.
 *   · **Focus is never stranded inside it** (TASK-019). When the focused
 *     control goes away under the reader while the log is open, focus moves
 *     to the dialog's title, a programmatic target outside the Tab order.
 *   · **Keyboard focus stays visible** (TASK-041). While open, the dialog
 *     hosts Foundation's one focus-bracket layer, and hands it back when it
 *     closes or unmounts.
 *   · **A stale close is ignored** (TASK-045). The browser queues a dialog's
 *     `close` event; one that arrives after the log was opened again is not
 *     reported as a dismissal. The X and Escape (the native `cancel`) ask the
 *     consumer to close in the same turn, so the dialog leaves through the
 *     shared exit as a controlled close.
 */
import { useCallback, useEffect, useId, useLayoutEffect, useRef, type ReactNode } from 'react'
import { IconButton, X } from '../design-system/index'
import { AppDialog } from './app-dialog'
import { LoggingSurfaceContext } from './logging-surface-context'
import { CardContainmentContext } from './card-context'
import { Heading, HeadingLevelProvider } from './Heading'
import { LoggingOverlayTitleContext } from './refinements/logging-overlay-context'
import { useWorkoutExperiencePresentation } from './workout-experience-presentation'
import '../styles/logging-overlay.css'

/** The X's accessible name; the opening focus lands on it. */
const CLOSE_LABEL = 'Close log'

/**
 * The control that opened the log, if focus was on one: not the page itself,
 * and not anything already inside this dialog.
 */
function openerOf(dialog: HTMLDialogElement): HTMLElement | null {
  const active = dialog.ownerDocument.activeElement
  if (!(active instanceof HTMLElement) || active === dialog.ownerDocument.body) return null
  return dialog.contains(active) ? null : active
}

/** Focus with nowhere to be: on the page body, gone, or inside a closed dialog. */
function stranded(dialog: HTMLDialogElement): boolean {
  const active = dialog.ownerDocument.activeElement
  return active === null || active === dialog.ownerDocument.body || !active.isConnected || dialog.contains(active)
}

export function LoggingOverlay({ open, title, onClose, onAfterClose, children, variant, backdrop, closeDisabled = false }: {
  open: boolean; title: string; onClose: () => void; children: ReactNode
  /**
   * Runs once the native dialog has closed and the workout behind it is no
   * longer inert — the consumer's moment to return focus where it belongs.
   */
  onAfterClose?: () => void
  variant?: 'dialog' | 'sheet'; backdrop?: 'balanced' | 'dark' | 'soft'; closeDisabled?: boolean
}) {
  const host = useRef<HTMLDivElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  const titleId = useId()
  const presentation = useWorkoutExperiencePresentation()
  const appearance = variant ?? presentation?.loggingOverlay ?? 'dialog'
  const dialogOf = () => host.current?.querySelector('dialog') ?? null

  // Before the dialog opens (layout effects run ahead of the dialog's own
  // `showModal`), remember the control that opened it.
  useLayoutEffect(() => {
    const dialog = dialogOf()
    if (open && dialog !== null && !dialog.open) opener.current = openerOf(dialog)
  }, [open])

  // Once it is open, its focus belongs to a control: the X, unless focus is
  // already inside (the dialog's own focusing steps, or a consumer's).
  useEffect(() => {
    const dialog = dialogOf()
    if (!open || dialog === null || !dialog.open) return
    if (dialog.contains(dialog.ownerDocument.activeElement)) return
    dialog.querySelector<HTMLButtonElement>(`button[aria-label="${CLOSE_LABEL}"]`)?.focus({ preventScroll: true })
  }, [open])

  // TASK-019: focus dropped on the page while the log is open goes to its title.
  useEffect(() => {
    const dialog = dialogOf()
    if (!open || dialog === null) return
    const onFocusOut = (event: FocusEvent) => {
      if (event.relatedTarget !== null) return
      queueMicrotask(() => {
        const document = dialog.ownerDocument
        const active = document.activeElement
        if (!dialog.isConnected || !dialog.open) return
        if (active !== null && active !== document.body) return
        const heading = document.getElementById(titleId)
        if (heading === null || !dialog.contains(heading)) return
        if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1')
        heading.focus({ preventScroll: true })
      })
    }
    dialog.addEventListener('focusout', onFocusOut)
    return () => dialog.removeEventListener('focusout', onFocusOut)
  }, [open, titleId])

  // TASK-041: the one focus-bracket layer is drawn in the top layer while open.
  useEffect(() => {
    const dialog = dialogOf()
    if (!open || dialog === null) return
    const layer = dialog.ownerDocument.querySelector<HTMLElement>('.clr-focus-brackets')
    if (layer === null || layer.parentElement === dialog) return
    const home = layer.parentElement
    dialog.append(layer)
    return () => {
      if (layer.parentElement !== dialog) return
      ;(home?.isConnected ? home : dialog.ownerDocument.body).append(layer)
    }
  }, [open])

  // TASK-045: a dialog that is open again has not been closed.
  const reportClose = useCallback(() => {
    if (dialogOf()?.open) return
    onClose()
  }, [onClose])

  const afterClose = useCallback(() => {
    const dialog = dialogOf()
    if (dialog?.open) return
    onAfterClose?.()
    const target = opener.current
    opener.current = null
    if (dialog !== null && stranded(dialog) && target?.isConnected) target.focus()
  }, [onAfterClose])

  return <div ref={host} style={{ display: 'contents' }}>
    <AppDialog open={open} onClose={reportClose} onAfterClose={afterClose} aria-label={title}
      className="clr-logging-overlay" data-overlay={appearance} data-backdrop={backdrop ?? presentation?.dialogBackdrop ?? 'balanced'}
      // The X and Escape (the native cancel) ask the consumer to close, at once:
      // its `open` turns false in the same turn, and the dialog then leaves
      // through the shared exit. Nothing the athlete does between the native
      // close and its queued event can find a stale open state.
      onCancel={event => {
        if (event.target !== event.currentTarget) return
        event.preventDefault()
        if (!closeDisabled) onClose()
      }}
      onKeyDown={event => { if (closeDisabled && event.key === 'Escape') { event.preventDefault(); event.stopPropagation() } }}>
      <LoggingSurfaceContext value><CardContainmentContext value={false}>
        <HeadingLevelProvider level={2}>
          <div className="clr-logging-overlay__scroll">
            <div className="clr-logging-overlay__head">
              <Heading id={titleId} className="clr-logging-overlay__title">{title}</Heading>
              <IconButton variant="secondary" label={CLOSE_LABEL} icon={<X />} disabled={closeDisabled}
                onClick={() => dialogOf()?.requestClose()} />
            </div>
            <div className="clr-logging-overlay__body">
              <LoggingOverlayTitleContext value={titleId}>{children}</LoggingOverlayTitleContext>
            </div>
          </div>
        </HeadingLevelProvider>
      </CardContainmentContext></LoggingSurfaceContext>
    </AppDialog>
  </div>
}
