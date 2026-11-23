/**
 * Actual public countdown with shared deadline urgency and surface width.
 *
 * A3 TASK-108 (TASK-008): its warning reads the clock's own deadline through
 * the per-clock adapters (`state/countdown-urgency.ts`) when the consumer
 * gives one. The real `/workout` route's countdowns — the circuit's round rest
 * and a scheduled ladder's interval — draw Round 7's whole `TimerFrame`
 * (`workout-chrome.tsx`) instead; this display remains the gallery
 * catalogue's specimen and the countdown of the timed blocks the route does
 * not draw (`EmomBlock`, `AmrapBlock`).
 */
import { use } from 'react'
import { TimerDisplay as PublicTimerDisplay, type TimerDisplayProps } from '../design-system/index'
import type { CountdownDeadline } from '../state/countdown-urgency'
import { LoggingSurfaceContext } from './logging-surface-context'
import { useCountdownUrgency } from './countdown-urgency'

export function CountdownDisplay({ running = true, deadline, ...props }: TimerDisplayProps & { running?: boolean; deadline?: CountdownDeadline }) {
  const logging = use(LoggingSurfaceContext)
  const seconds = props.seconds ?? 0
  const urgency = useCountdownUrgency(deadline ?? { remaining: seconds, running: running && seconds > 0 })
  return <div className={[logging ? 'clr-log-timer' : '', urgency.urgent ? 'clr-pulse-micro' : ''].filter(Boolean).join(' ')} {...urgency.loop}>
    {urgency.edge}<PublicTimerDisplay {...props} lowThreshold={10} />
  </div>
}
