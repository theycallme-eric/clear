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
 *   · **Opening focus is a control's.** After `showModal()` the X takes focus
 *     (the X is the first control in tree order), so every browser and the
 *     tests agree. Focus a consumer already put on a control inside is left
 *     where it is; focus the browser put on the dialog, its frame or its
 *     scrolling region (Chromium counts a scroller as a focusable area ahead
 *     of the X) is moved to the X.
 *   · **Focus comes back, once the dialog has closed.** The control that
 *     opened the log is remembered; when the native dialog has closed —
 *     however it closed: its X, Escape, or the consumer closing it after a
 *     Save or at rest end — `onAfterClose` runs first (a consumer that knows
 *     better, such as a correction's Edit, takes focus there), and focus left
 *     stranded on the page or in the closed dialog then goes to the opener.
 *     Nothing is focused while the workout behind is still inert.
 *   · **…as it closes, never later.** The browser closes the dialog at once
 *     (it leaves the top layer, the workout stops being inert, focus goes back
 *     to the opener) but reports it with a queued `close` event. A close the
 *     consumer asked for is therefore finished when the dialog's `open`
 *     attribute goes, in the same task, so nothing the athlete does next —
 *     Tab to Edit, then Enter — can come before it and be overridden by it
 *     (A3 TASK-106 repair: the late return took focus off Edit, so Enter
 *     opened the next set). Each close is finished once; the queued event
 *     then finds nothing owed. A close the consumer did not ask for still
 *     waits for the event, which reports the dismissal first.
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
 *
 * A3 TASK-114 (REQ-018; C44, R16, AC-R018-04) keeps the frame on the screen
 * the athlete can see: while open, the dialog carries the visual viewport's
 * top and height (`--logging-visible-top`, `--logging-visible-height`), which
 * `logging-overlay.css` centres the frame in, so an on-screen keyboard shrinks
 * the frame instead of covering the form. Geometry only; nothing else changes.
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
/** The visual viewport's top and height on the open dialog (A3 TASK-114). */
const VISIBLE_TOP = '--logging-visible-top'
const VISIBLE_HEIGHT = '--logging-visible-height'

/**
 * The control that opened the log, if focus was on one: not the page itself,
 * and not anything already inside this dialog.
 */
function openerOf(dialog: HTMLDialogElement): HTMLElement | null {
  const active = dialog.ownerDocument.activeElement
  if (!(active instanceof HTMLElement) || active === dialog.ownerDocument.body) return null
  return dialog.contains(active) ? null : active
}

/**
 * Focus a reader or a consumer put on one of the log's controls — not the
 * dialog itself, its frame or its scroller. Chromium's dialog focusing steps
 * count a scrolling region as a focusable area that comes before the X in
 * tree order, so a long form opened by keyboard on a small phone had its
 * opening focus on the scroller (A3 TASK-106 repair, found by task-019).
 */
function onControl(dialog: HTMLDialogElement, active: Element | null): boolean {
  if (!(active instanceof HTMLElement) || active === dialog || !dialog.contains(active)) return false
  return active.matches('button, input, select, textarea, a[href], summary, [contenteditable="true"], [tabindex]:not([tabindex="-1"])')
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
   * Once per close, in the task that closed it when the consumer asked for it.
   */
  onAfterClose?: () => void
  variant?: 'dialog' | 'sheet'; backdrop?: 'balanced' | 'dark' | 'soft'; closeDisabled?: boolean
}) {
  const host = useRef<HTMLDivElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  // The consumer's `open`, as last committed: false once it asked to close.
  const wanted = useRef(open)
  // The after-close work this opening owes: owed when it opens, done once.
  const owed = useRef(false)
  const titleId = useId()
  const presentation = useWorkoutExperiencePresentation()
  const appearance = variant ?? presentation?.loggingOverlay ?? 'dialog'
  const dialogOf = () => host.current?.querySelector('dialog') ?? null

  // Before the dialog opens (layout effects run ahead of the dialog's own
  // `showModal`), remember the control that opened it.
  useLayoutEffect(() => {
    wanted.current = open
    const dialog = dialogOf()
    if (open && dialog !== null && !dialog.open) {
      opener.current = openerOf(dialog)
      owed.current = true
    }
  }, [open])

  // A3 TASK-114: while open, the dialog's box is the visual viewport — the
  // part of the screen an on-screen keyboard leaves. Without a visual
  // viewport the stylesheet falls back to the dynamic viewport.
  useLayoutEffect(() => {
    const dialog = dialogOf()
    const viewport = typeof window === 'undefined' ? undefined : window.visualViewport
    if (!open || dialog === null || viewport == null) return
    const update = () => {
      dialog.style.setProperty(VISIBLE_TOP, `${viewport.offsetTop}px`)
      dialog.style.setProperty(VISIBLE_HEIGHT, `${viewport.height}px`)
    }
    update()
    viewport.addEventListener('resize', update)
    viewport.addEventListener('scroll', update)
    return () => {
      viewport.removeEventListener('resize', update)
      viewport.removeEventListener('scroll', update)
      dialog.style.removeProperty(VISIBLE_TOP)
      dialog.style.removeProperty(VISIBLE_HEIGHT)
    }
  }, [open])

  // Once it is open, its focus belongs to a control: the X, unless focus is
  // already on one of its controls (a consumer's). The dialog, its frame or
  // its scroller holding focus is not a control's focus.
  useEffect(() => {
    const dialog = dialogOf()
    if (!open || dialog === null || !dialog.open) return
    if (onControl(dialog, dialog.ownerDocument.activeElement)) return
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
    if (dialog?.open || !owed.current) return
    owed.current = false
    onAfterClose?.()
    const target = opener.current
    opener.current = null
    if (dialog !== null && stranded(dialog) && target?.isConnected) target.focus()
  }, [onAfterClose])

  // A3 TASK-106 repair: a close the consumer asked for is finished as the
  // native dialog closes (its `open` attribute goes, observed in the same
  // task), not when the browser's queued `close` event arrives later.
  const finish = useRef(afterClose)
  useLayoutEffect(() => { finish.current = afterClose }, [afterClose])
  useLayoutEffect(() => {
    const dialog = host.current?.querySelector('dialog')
    if (dialog == null) return
    const observer = new MutationObserver(() => {
      if (!dialog.open && !wanted.current) finish.current()
    })
    observer.observe(dialog, { attributes: true, attributeFilter: ['open'] })
    return () => observer.disconnect()
  }, [])

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
