/**
 * LoggingOverlay — the accepted focused logging frame (accepted gallery
 * reference eded158cfd928d382c9a9409e2c372270312741d,
 * `src/ui/refinements/logging-overlay.tsx`; REUSE.md "Balanced focused dialog,
 * top-aligned X, one stationary frame and inner scroll").
 *
 * TASK-018 (REQ-018; C44, C57, C58, C59; P01, P02, P03; R16, R128, R129,
 * R140) delivers its contained viewport, frame, scrolling and focus/chrome
 * contract, for every logging form the dialog will hold:
 *
 * - One stationary, continuous chamfered frame. Only the inner region scrolls;
 *   the frame, its border and its chamfer never move with the content (C44,
 *   R128, R129).
 * - The scrolling region sits directly on the frame's inner border, with no
 *   bottom inset, so a partly visible control's vertical strokes run to the
 *   inner lower border and are clipped there — no blank strip, no divider or
 *   pinned foot crossing the form (C57, P01).
 * - No automatic outline around the frame or the scrolling region on first
 *   load, open or reopen (C58, P02). The owner was diagnosed in Chromium, not
 *   guessed: `showModal()` focuses the first focusable area in tree order,
 *   and an overflowing scroll region is keyboard-focusable even with controls
 *   inside — the scroller wraps the header, so it comes before the X — or,
 *   when a tap lands on blank space, the dialog itself. Neither carries a
 *   tabindex or a control role, so no Foundation focus rule covers them and
 *   the browser paints its default ring (`outline: auto`, rgb(0, 95, 204)): a
 *   blue rounded outline around the whole container. So the opening focus is
 *   moved to the X in the same layout effect, before the first paint; the
 *   dialog, frame and scroller are never given a tabindex; and
 *   presentation.css gives those containers no outline. A second, latent
 *   owner is Foundation's fallback chamfer ring (`.clr-chamfer:has(
 *   :focus-visible)`, active wherever `FocusBrackets` is not mounted), which
 *   would double the whole frame's border in the focus hue while any control
 *   inside is focus-visible; the frame keeps its own border instead. Every
 *   control inside keeps its own focus indicator (the app's brackets, or
 *   Foundation's outline), and native modal focus is unchanged: the page
 *   behind is inert and focus starts inside the dialog.
 * - All scrollbar chrome hidden, overlay scrollbars included, while wheel,
 *   touch, keyboard and focus scrolling keep working; no sideways overflow
 *   (C59, P03).
 * - Height from the space actually available — the viewport, its safe areas
 *   and, while an on-screen keyboard is up, the visual viewport above it —
 *   never a fixed fraction of the screen (the rejected half-height cap). A
 *   short form is as tall as its content and does not scroll; a long one
 *   scrolls inside the frame, its Notes and Save reachable (C44, R16).
 *
 * TASK-016 (REQ-016; C40, C41, C43; R81, R90, R91, R100, R104, R105, R106,
 * R110, R113, R127, R131) delivers the selected dialog itself — its header,
 * backdrop and modal close/focus behaviour — as the one contract every
 * logging consumer adopts:
 *
 * - The selected simple form in a focused dialog (C40, R90 A, R110): the
 *   dialog's title is the form's one title. A form held here reads
 *   `LoggingOverlayTitleContext`, drops its own inline title and is named by
 *   the dialog's, so no second heading competes under it. The workout behind
 *   stays in view, blurred, as the larger section/workout context.
 * - The header (C41; R104, R105, R106, R113): the title, then the framed X —
 *   the shared secondary `IconButton`, its chamfered frame and emission, its
 *   hit area — with the accessible name "Close log" and no visible Close
 *   word. The X's frame top sits on the title's visible top: the header
 *   aligns to its start, the title's line box is trimmed to its capitals, and
 *   a title that wraps grows downwards while the X stays on its first line.
 * - The selected A / Balanced backdrop (C43; R110, R127): the reviewed dim,
 *   blur and corner vignette from `--logging-backdrop-*`, on the native
 *   `::backdrop` only, so the frame and everything in it stay sharp and fully
 *   readable. No further darkening, no shadow, no filter on the foreground,
 *   and no rising sheet.
 * - Modal behaviour (R100): `showModal()` makes the workout behind inert, so
 *   its controls are unavailable while the log is open, while every clock
 *   keeps running — the overlay pauses, resets and owns none. The X and
 *   Escape (the native cancel) both ask the consumer to close; closing never
 *   unmounts the form, so a draft is still there on reopen; and focus
 *   returns to the control that opened the log.
 *
 * Presentation only: the consumer owns its form, draft, writer, Save and
 * errors. TASK-043–046 move the actual logging entry points into it and
 * TASK-041 closes the geometry and the full JOURNEY-016/017/018 acceptance on
 * the routes — this file does not claim any route has adopted it.
 */
import { useEffect, useId, useLayoutEffect, useRef, type ReactNode } from 'react'

import { IconButton, X } from '../../design-system/index'
import { CardContainmentContext } from '../card-context'
import { EchoExcluded } from '../foreground-echo'
import { Heading, HeadingLevelProvider } from '../Heading'
import { PhosphorEchoFrame } from '../phosphor-echo'
import { useOptionalVisualEffects } from '../../state/visual-effects'
import { LoggingOverlayTitleContext } from './logging-overlay-context'
import './tokens.css'
import './presentation.css'

/** The X's accessible name; the opening focus lands on it. */
export const LOGGING_OVERLAY_CLOSE_LABEL = 'Close log'

/** The two visible-viewport variables the overlay's recipe reads. */
export const LOGGING_VISIBLE_TOP = '--logging-visible-top'
export const LOGGING_VISIBLE_HEIGHT = '--logging-visible-height'

export interface LoggingOverlayProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}

/**
 * While open, keeps the dialog's box on the visual viewport: the part of the
 * screen not covered by an on-screen keyboard. Without a visual viewport the
 * recipe falls back to the dynamic viewport height.
 */
function useVisibleViewport(ref: { current: HTMLDialogElement | null }, open: boolean) {
  useLayoutEffect(() => {
    const dialog = ref.current
    const viewport = typeof window === 'undefined' ? undefined : window.visualViewport
    if (!open || !dialog || !viewport) return
    const update = () => {
      dialog.style.setProperty(LOGGING_VISIBLE_TOP, `${viewport.offsetTop}px`)
      dialog.style.setProperty(LOGGING_VISIBLE_HEIGHT, `${viewport.height}px`)
    }
    update()
    viewport.addEventListener('resize', update)
    viewport.addEventListener('scroll', update)
    return () => {
      viewport.removeEventListener('resize', update)
      viewport.removeEventListener('scroll', update)
      dialog.style.removeProperty(LOGGING_VISIBLE_TOP)
      dialog.style.removeProperty(LOGGING_VISIBLE_HEIGHT)
    }
  }, [ref, open])
}

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
 * Returns focus to the opener once the log has closed, however it closed —
 * the X, Escape, or the consumer closing it after a Save. A browser that
 * already restored it is left alone, and so is focus the reader has since
 * moved elsewhere; an opener that is gone is not chased.
 */
function returnFocus(dialog: HTMLDialogElement, opener: HTMLElement | null) {
  if (!opener?.isConnected) return
  const active = dialog.ownerDocument.activeElement
  const stranded = active === null || active === dialog.ownerDocument.body || dialog.contains(active)
  if (stranded) opener.focus()
}

/**
 * TASK-019 (REQ-019, JOURNEY-019; a cross-family seam): while the log is
 * open, focus is never left stranded on the inert page. When the focused
 * control inside it goes away under the reader — a Save made unavailable
 * while its write is in flight, then a refusal answered in place — the
 * browser drops focus to the page body, where a keyboard reader can do
 * nothing in a modal. Focus then moves to the dialog's own title, a
 * programmatic target only (never in the Tab order), so the reader hears
 * which log they are in and Tab reaches its controls. This is the recovery
 * the set families already made on Save (TASK-043); it now holds for every
 * moment. Focus the reader moved deliberately, a window losing focus, and a
 * log that is closing are left alone.
 */
function useFocusKeptInside(ref: { current: HTMLDialogElement | null }, open: boolean, titleId: string) {
  useEffect(() => {
    const dialog = ref.current
    if (!open || !dialog) return
    const onFocusOut = (event: FocusEvent) => {
      if (event.relatedTarget !== null) return
      queueMicrotask(() => {
        const document = dialog.ownerDocument
        const active = document.activeElement
        if (!dialog.isConnected || !dialog.open) return
        if (active !== null && active !== document.body) return
        const title = document.getElementById(titleId)
        if (title === null || !dialog.contains(title)) return
        if (!title.hasAttribute('tabindex')) title.setAttribute('tabindex', '-1')
        title.focus({ preventScroll: true })
      })
    }
    dialog.addEventListener('focusout', onFocusOut)
    return () => dialog.removeEventListener('focusout', onFocusOut)
  }, [ref, open, titleId])
}

/**
 * TASK-041 (REQ-018, JOURNEY-018; C58, P02 — "retain modal focus and
 * intentional keyboard focus on controls"): keyboard focus stays visible on
 * the log's controls. The app runs Foundation's `FocusBrackets`, which draws
 * its one bracket layer from the page body, and in brackets mode a focused
 * button drops its own outline. A modal dialog is in the top layer, above
 * everything in the body, so the brackets were drawn underneath the open log
 * and Tab moved through its controls with nothing visible on them (found on
 * the routes, Chromium). While the log is open it hosts that same layer —
 * moved, never copied, still decorative and pointer-transparent — and hands it
 * back to the body when it closes or goes away, as the deadline aura does
 * (TASK-008). A layer Foundation has already removed is left removed.
 */
function useFocusBracketsInside(ref: { current: HTMLDialogElement | null }, open: boolean) {
  useEffect(() => {
    const dialog = ref.current
    if (!open || !dialog) return
    const layer = dialog.ownerDocument.querySelector<HTMLElement>('.clr-focus-brackets')
    if (layer === null || layer.parentElement === dialog) return
    const home = layer.parentElement
    dialog.append(layer)
    return () => {
      if (layer.parentElement !== dialog) return
      ;(home?.isConnected ? home : dialog.ownerDocument.body).append(layer)
    }
  }, [ref, open])
}

export function LoggingOverlay({ open, title, onClose, children }: LoggingOverlayProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  const titleId = useId()
  const effects = useOptionalVisualEffects()
  useLayoutEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      opener.current = openerOf(dialog)
      dialog.showModal()
      // Opening focus belongs to a control, never to the frame or the scroller.
      dialog
        .querySelector<HTMLButtonElement>(`button[aria-label="${LOGGING_OVERLAY_CLOSE_LABEL}"]`)
        ?.focus({ preventScroll: true })
    }
    if (!open) {
      if (dialog.open) dialog.close()
      returnFocus(dialog, opener.current)
      opener.current = null
    }
  }, [open])
  useVisibleViewport(ref, open)
  useFocusKeptInside(ref, open, titleId)
  useFocusBracketsInside(ref, open)

  const frame = (
    <div className="clr-bleed clr-bleed--block clr-accepted-log__emission">
      <div className="clr-chamfer clr-chamfer--lg clr-accepted-log__frame" data-logging-frame="">
        <EchoExcluded>
          <CardContainmentContext value={false}>
            <HeadingLevelProvider level={2}>
              {/* No tabindex on this structural scroller: opening focus belongs
                  to the X. One stationary frame clips it at its inner border. */}
              <div className="clr-accepted-log__scroll" data-logging-scroll="">
                {/* The title, then the framed icon-only X, aligned to the
                    title's visible top however many lines it wraps to. */}
                <header className="clr-accepted-log__head" data-logging-head="">
                  <Heading id={titleId} className="clr-accepted-log__title">
                    {title}
                  </Heading>
                  <IconButton variant="secondary" label={LOGGING_OVERLAY_CLOSE_LABEL} icon={<X />} onClick={onClose} />
                </header>
                <div className="clr-accepted-log__body">
                  <LoggingOverlayTitleContext value={titleId}>{children}</LoggingOverlayTitleContext>
                </div>
              </div>
            </HeadingLevelProvider>
          </CardContainmentContext>
        </EchoExcluded>
      </div>
    </div>
  )
  return (
    <dialog
      ref={ref}
      className="clr-dialog clr-accepted-log"
      aria-labelledby={titleId}
      onClose={(event) => {
        // TASK-045: the native `close` event is queued, so the one from a
        // close the consumer already made can arrive after a quick reopen;
        // a dialog that is open again has not been closed.
        if (event.target === event.currentTarget && open && !event.currentTarget.open) onClose()
      }}
      onCancel={(event) => {
        if (event.target !== event.currentTarget) return
        event.preventDefault()
        onClose()
      }}
    >
      {effects ? <PhosphorEchoFrame>{frame}</PhosphorEchoFrame> : frame}
    </dialog>
  )
}
