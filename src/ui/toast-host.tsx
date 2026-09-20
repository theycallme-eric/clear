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
import { useEffect, useRef, useSyncExternalStore } from 'react'

import { Toast } from '../design-system/index'
import { toastQueue, type ToastQueue } from '../state/toasts'

const PHOSPHOR_OUT = 'clr-phosphor-out'

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
      style={{
        position: 'fixed',
        bottom: 'var(--spacing-500)',
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'calc(100% - var(--spacing-400) * 2)',
        maxWidth: 440,
        zIndex: 2,
      }}
    >
      {/* The Toast bakes .clr-phosphor-in into its own class list, so the exit
          runs on this host-owned wrapper — the decay covers the whole toast. */}
      <div ref={wrapperRef} className={leaving ? PHOSPHOR_OUT : undefined}>
        <Toast
          variant={current.variant}
          actionLabel={current.actionLabel}
          onAction={() => {
            current.onAction?.()
            queue.dismiss(current.id)
          }}
          onDismiss={() => queue.dismiss(current.id)}
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
