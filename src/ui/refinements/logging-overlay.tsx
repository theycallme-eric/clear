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
 * Presentation only: the consumer owns its form, draft, writer, Save and
 * errors. The selected header, backdrop and close behaviour are TASK-016's
 * acceptance; this owner keeps the reference's title and X so the dialog has
 * an accessible name and a way out. TASK-043–046 move the actual logging
 * entry points into it and TASK-041 closes the geometry on the routes — this
 * file does not claim any route has adopted it.
 */
import { useId, useLayoutEffect, useRef, type ReactNode } from 'react'

import { IconButton, X } from '../../design-system/index'
import { CardContainmentContext } from '../card-context'
import { EchoExcluded } from '../foreground-echo'
import { Heading, HeadingLevelProvider } from '../Heading'
import { PhosphorEchoFrame } from '../phosphor-echo'
import { useOptionalVisualEffects } from '../../state/visual-effects'
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

export function LoggingOverlay({ open, title, onClose, children }: LoggingOverlayProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const effects = useOptionalVisualEffects()
  useLayoutEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      // Opening focus belongs to a control, never to the frame or the scroller.
      dialog
        .querySelector<HTMLButtonElement>(`button[aria-label="${LOGGING_OVERLAY_CLOSE_LABEL}"]`)
        ?.focus({ preventScroll: true })
    }
    if (!open && dialog.open) dialog.close()
  }, [open])
  useVisibleViewport(ref, open)

  const frame = (
    <div className="clr-bleed clr-bleed--block clr-accepted-log__emission">
      <div className="clr-chamfer clr-chamfer--lg clr-accepted-log__frame" data-logging-frame="">
        <EchoExcluded>
          <CardContainmentContext value={false}>
            <HeadingLevelProvider level={2}>
              {/* No tabindex on this structural scroller: opening focus belongs
                  to the X. One stationary frame clips it at its inner border. */}
              <div className="clr-accepted-log__scroll" data-logging-scroll="">
                <header className="clr-accepted-log__head">
                  <Heading id={titleId}>{title}</Heading>
                  <IconButton variant="secondary" label={LOGGING_OVERLAY_CLOSE_LABEL} icon={<X />} onClick={onClose} />
                </header>
                <div className="clr-accepted-log__body">{children}</div>
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
        if (event.target === event.currentTarget && open) onClose()
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
