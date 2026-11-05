/** Meaningful deadline cue; no data writer and no functional clock of its own. */
import { useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { formatElapsed } from '../../state/workout-clock'
import { prefersReducedMotion } from '../motion'
import { subscribeMotionPreferences } from '../../state/visual-effects'
import { ForegroundEchoFrame } from '../foreground-echo'
import { countdownWarningState } from './countdown-warning'
import './presentation.css'

const claims = new Set<string>()
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
const notify = () => { for (const listener of listeners) listener() }

/** All animations use the document timeline epoch. Portal moves and numeric
 * ticks cannot restart a pulse or shift the timer relative to the one aura. */
function alignPhase(element: HTMLElement | null) {
  for (const animation of element?.getAnimations?.() ?? []) {
    if (typeof CSSAnimation !== 'undefined' && animation instanceof CSSAnimation && animation.animationName === 'clr-deadline-breathe') animation.startTime = 0
  }
}

function EdgeCue({ still }: { still: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const [host, setHost] = useState<HTMLElement | null>(null)
  useLayoutEffect(() => {
    const update = () => {
      const dialogs = [...document.querySelectorAll<HTMLDialogElement>('dialog[open]')]
      setHost(dialogs.at(-1) ?? document.body)
    }
    update()
    const observer = new MutationObserver(update)
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['open'] })
    return () => observer.disconnect()
  }, [])
  useLayoutEffect(() => { alignPhase(ref.current) }, [host, still])
  return host ? createPortal(<div ref={ref} className="clr-deadline-edge" data-countdown-edge="" data-still={still || undefined} aria-hidden="true" />, host) : null
}

export function DeadlineTimer({ seconds, remaining = seconds, running = false, elapsedOnly = false, label = 'Time remaining', reducedMotion = false }: {
  seconds: number; remaining?: number | null; running?: boolean; elapsedOnly?: boolean; label?: string; reducedMotion?: boolean
}) {
  const id = useId()
  const ref = useRef<HTMLDivElement>(null)
  const {low,urgent} = countdownWarningState(remaining,running,elapsedOnly)
  const prefersStill = useSyncExternalStore(subscribeMotionPreferences, prefersReducedMotion, () => true)
  const still = reducedMotion || prefersStill
  useLayoutEffect(() => {
    if (!urgent) return
    claims.add(id); notify()
    return () => { claims.delete(id); notify() }
  }, [id, urgent])
  const winner = useSyncExternalStore(subscribe, () => claims.values().next().value ?? null)
  useLayoutEffect(() => { alignPhase(ref.current) }, [urgent, still])
  return <>
    <ForegroundEchoFrame><div className="clr-bleed clr-bleed--block clr-accepted-timer" data-low={low || undefined}>
      <div ref={ref} className={`clr-chamfer clr-chamfer--md clr-accepted-timer__body ${low ? 'clr-chamfer--timer-low' : 'clr-chamfer--timer'}`} role="timer" aria-label={`${label}: ${formatElapsed(seconds)}`}
        data-urgent={urgent || undefined} data-still={still || undefined}>
        <span aria-hidden="true">{formatElapsed(seconds)}</span>
      </div>
    </div></ForegroundEchoFrame>
    {urgent && winner === id && <EdgeCue still={still} />}
  </>
}
