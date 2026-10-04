/**
 * ToastHost — the single DS-05 toast surface, mounted once at the app root.
 *
 * Renders at most one design-system `Toast` from the queue in
 * `src/state/toasts.ts`. Dismissal is two-phase: the queue marks the toast
 * `leaving`, the host runs `.clr-phosphor-out` on its wrapper, and only the
 * animation's end settles the queue and lets the next message through — no
 * toast is unmounted mid-animation. When the exit animation cannot run
 * (`prefers-reduced-motion`, or no stylesheet as in tests), the host settles
 * immediately so nothing ever waits on motion.
 *
 * Focus is never managed here: arrival does not steal it, and dismissal is a
 * plain labelled button inside the Toast, reachable by keyboard in place.
 */
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'

import { Toast } from '../design-system/index'
import { toastQueue, type ToastQueue } from '../state/toasts'

const PHOSPHOR_OUT = 'clr-phosphor-out'
const DEFAULT_BOTTOM = 'var(--spacing-500)'

/**
 * A toast must not cover the screen's pinned action. ScrollRegion measures the
 * footer for its own scroller, but the root toast host is its sibling and does
 * not inherit that measurement. Read the rendered edge instead of guessing a
 * button height, so one rule works for wrapped actions and every viewport.
 */
function pinnedFooterBottom(): string {
  const footer = document.querySelector<HTMLElement>('main .clr-scroll-region__foot')
  if (footer === null) return DEFAULT_BOTTOM

  const viewport = window.visualViewport
  const viewportBottom = viewport
    ? viewport.offsetTop + viewport.height
    : window.innerHeight
  const inset = Math.max(0, viewportBottom - footer.getBoundingClientRect().top)
  return `calc(${Math.ceil(inset)}px + var(--spacing-300))`
}

/** True when the element's computed style actually runs the named animation. */
function runsAnimation(element: Element, name: string): boolean {
  const names = getComputedStyle(element).animationName ?? ''
  return names.split(',').some((animation) => animation.trim() === name)
}

export interface ToastHostProps {
  /** The app uses the root queue; tests may inject an isolated one. */
  queue?: ToastQueue
}

export function ToastHost({ queue = toastQueue }: ToastHostProps) {
  const state = useSyncExternalStore(queue.subscribe, queue.getState)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const { current, phase } = state
  const leaving = phase === 'leaving'
  const leavingId = leaving && current ? current.id : null
  const [bottom, setBottom] = useState(DEFAULT_BOTTOM)

  useLayoutEffect(() => {
    if (current === null) return

    const update = () => setBottom(pinnedFooterBottom())
    update()

    const footer = document.querySelector<HTMLElement>('main .clr-scroll-region__foot')
    const observer = footer !== null && typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(update)
      : null
    if (footer !== null) observer?.observe(footer)
    window.addEventListener('resize', update)
    window.visualViewport?.addEventListener('resize', update)

    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('resize', update)
    }
  }, [current])

  // Settle on the phosphor decay's own end. A native listener, not the React
  // prop: the animation runs on this DOM element, and the native event is
  // what fires in every environment. If the exit animation is inert (reduced
  // motion, test DOM), settle now — nothing ever waits on motion.
  useEffect(() => {
    if (leavingId === null) return
    const wrapper = wrapperRef.current
    if (!wrapper || !runsAnimation(wrapper, PHOSPHOR_OUT)) {
      queue.settle(leavingId)
      return
    }
    const handleEnd = (event: Event) => {
      if ((event as globalThis.AnimationEvent).animationName === PHOSPHOR_OUT) {
        queue.settle(leavingId)
      }
    }
    wrapper.addEventListener('animationend', handleEnd)
    return () => wrapper.removeEventListener('animationend', handleEnd)
  }, [leavingId, queue])

  if (!current) return null

  return (
    <div
      data-clear-toast-host
      style={{
        position: 'fixed',
        bottom,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'calc(100% - var(--spacing-400) * 2)',
        maxWidth: 440,
        zIndex: 3,
      }}
    >
      {/* The Toast bakes .clr-phosphor-in into its own class list, so the exit
          runs on this host-owned wrapper — the decay covers the whole toast. */}
      <div ref={wrapperRef} className={leaving ? PHOSPHOR_OUT : undefined}>
        <Toast
          key={current.id}
          variant={current.variant}
          actionLabel={current.actionLabel}
          onAction={() => {
            current.onAction?.()
            queue.dismiss(current.id)
          }}
          onDismiss={() => {
            // The vendor reports completed exit; do not animate it a second time.
            queue.dismiss(current.id)
            queue.settle(current.id)
          }}
        >
          {current.message}
          {current.requestId && (
            <span
              style={{
                display: 'block',
                marginTop: 'var(--spacing-100)',
                fontFamily: 'var(--font-data)',
                fontSize: 'var(--label-xs-size)',
                letterSpacing: 'var(--tracking-data)',
              }}
            >
              {current.requestId}
            </span>
          )}
        </Toast>
      </div>
    </div>
  )
}
