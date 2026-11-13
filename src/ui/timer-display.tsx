/** Actual public countdown with shared deadline urgency and surface width. */
import { use } from 'react'
import { TimerDisplay as PublicTimerDisplay, type TimerDisplayProps } from '../design-system/index'
import { LoggingSurfaceContext } from './logging-surface-context'
import { useCountdownUrgency } from './countdown-urgency'

export function CountdownDisplay({ running = true, ...props }: TimerDisplayProps & { running?: boolean }) {
  const logging = use(LoggingSurfaceContext)
  const urgency = useCountdownUrgency(props.seconds ?? 0, running && (props.seconds ?? 0) > 0)
  return <div className={[logging ? 'clr-log-timer' : '', urgency.urgent ? 'clr-pulse-micro' : ''].filter(Boolean).join(' ')} {...urgency.loop}>
    {urgency.edge}<PublicTimerDisplay {...props} lowThreshold={10} />
  </div>
}
