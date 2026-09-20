/**
 * AppDialog — the DS-05 entrance/exit motion around the shipped `Dialog`.
 *
 * The export's `Dialog` deliberately ships no entrance animation —
 * `showModal()` simply reveals it. This wrapper composes the shipped motion
 * vocabulary so a modal reads as a panel powering up: the chamfered frame
 * traces its border on (`clr-trace`), the contents materialize
 * (`clr-materialize`), and the backdrop hard-cuts (`clr-cut-in`) — see
 * `src/styles/app-motion.css`. A dialog constructs itself; a toast phosphors
 * in — the two arrivals never look alike.
 *
 * Dismissal runs `.clr-phosphor-out` before the platform close: the wrapper
 * holds the native dialog open through a `leaving` phase, decays the panel,
 * and closes on the animation's end. Esc is intercepted only to give the
 * platform's cancel the same animated path — it still dismisses, and
 * `onClose` still fires exactly once per dismissal. When the animation
 * cannot run (`prefers-reduced-motion`, or no stylesheet as in tests) the
 * close happens immediately; nothing ever waits on motion.
 */
import { useEffect, useRef, useState } from 'react'
import type { SyntheticEvent } from 'react'

import { Dialog, type DialogProps } from '../design-system/index'

const PHOSPHOR_OUT = 'clr-phosphor-out'
const ENTER_CLASS = 'clr-app-dialog-enter'

/** True when the element's computed style actually runs the named animation. */
function runsAnimation(element: Element, name: string): boolean {
  const names = getComputedStyle(element).animationName ?? ''
  return names.split(',').some((animation) => animation.trim() === name)
}

type Phase = 'closed' | 'open' | 'leaving'

export type AppDialogProps = DialogProps

export function AppDialog({
  open = false,
  onClose,
  className,
  onCancel,
  ...props
}: AppDialogProps) {
  // display:contents wrapper only exists to reach the native <dialog> element;
  // the Dialog owns its ref internally and does not expose one.
  const hostRef = useRef<HTMLSpanElement>(null)
  const [phase, setPhase] = useState<Phase>(open ? 'open' : 'closed')

  // Adjust phase during render when the parent flips `open` — the React
  // "information from previous renders" pattern, not an effect, so the stale
  // render never commits. Withdrawing `open` decays before the platform close.
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    setPhase(open ? 'open' : phase === 'closed' ? 'closed' : 'leaving')
  }

  // Close on the phosphor decay's own end. A native listener, not the React
  // prop: the animation runs on the <dialog> element itself, and the native
  // event is what fires in every environment. If the exit animation is inert
  // (reduced motion, test DOM), close now — nothing ever waits on motion.
  useEffect(() => {
    if (phase !== 'leaving') return
    const dialog = hostRef.current?.querySelector('dialog')
    if (!dialog || !runsAnimation(dialog, PHOSPHOR_OUT)) {
      setPhase('closed')
      return
    }
    const handleEnd = (event: Event) => {
      if ((event as globalThis.AnimationEvent).animationName === PHOSPHOR_OUT) {
        setPhase('closed')
      }
    }
    dialog.addEventListener('animationend', handleEnd)
    return () => dialog.removeEventListener('animationend', handleEnd)
  }, [phase])

  const handleCancel = (event: SyntheticEvent<HTMLDialogElement, Event>) => {
    onCancel?.(event)
    if (event.defaultPrevented) return
    // Take Esc off the instant native close so it exits through phosphor-out.
    event.preventDefault()
    if (open) onClose?.()
  }

  const handleClose = () => {
    // A close event the wrapper did not stage (form method="dialog", a
    // browser that would not cancel): the element is already closed, so an
    // exit phase would re-open it — skip straight to closed.
    const dialog = hostRef.current?.querySelector('dialog')
    if (dialog && !dialog.open) setPhase('closed')
    onClose?.()
  }

  const motionClass =
    phase === 'leaving' ? PHOSPHOR_OUT : phase === 'open' ? ENTER_CLASS : undefined

  return (
    <span ref={hostRef} style={{ display: 'contents' }}>
      <Dialog
        {...props}
        open={phase !== 'closed'}
        onClose={handleClose}
        onCancel={handleCancel}
        className={[motionClass, className].filter(Boolean).join(' ')}
      />
    </span>
  )
}
