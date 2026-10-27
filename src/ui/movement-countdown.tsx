/**
 * REQ-014 — a timed prescription's own countdown, with Start, Pause and Reset,
 * drawn on its movement's card.
 *
 * Three rules shape it:
 *
 *   · It is the movement's. `ExerciseSetLogger` draws it on the card, not in
 *     the logging sheet, so opening, minimising or closing the sheet never
 *     moves it, and the rest in the sheet is a different clock.
 *   · It is a countdown, never elapsed time. Its timer is named "Countdown",
 *     says "left" when spoken, and is drawn smaller than the session clock in
 *     the header, which keeps its own "Session time" name.
 *   · It records nothing. Running out is not proof the hold was held; only
 *     the athlete's own Log set writes a result.
 *
 * The frame is EXC-03's `TimerFrame`, the same adapter the session clock
 * draws with, so border, surface, chamfer and bar are one vocabulary. On a
 * card it is an element frame with no bar of its own: never a second card,
 * never a second bar.
 *
 * The final five seconds take the shipped low state — the timer-low frame and
 * digits, and the 80% pulse as the view's one urgent loop — and, while the
 * countdown runs, the screen-edge cue (`movement-countdown.css`). Under reduced
 * motion both are still and both stay drawn.
 */
import { createPortal } from 'react-dom'

import { Button, Pause, Play, RefreshCw } from '../design-system/index'
import { COUNTDOWN_LOW_SECONDS, useMovementCountdown } from '../state/movement-countdown'
import { spokenRest } from '../state/rest'
import { formatElapsed } from '../state/workout-clock'
import { ActionGroup } from './composition'
import { useInterfaceLoop } from './motion'
import { TimerFrame } from './workout-chrome'
import './movement-countdown.css'

export interface MovementCountdownProps {
  /** The prescribed seconds for this set. */
  seconds: number
  /** The movement's name, which names the region the countdown sits in. */
  movement: string
}

const STATUS_STYLE = {
  margin: 0,
  fontFamily: 'var(--font-data)',
  fontSize: 'var(--label-xs-size)',
  letterSpacing: 'var(--tracking-data)',
  textTransform: 'uppercase',
} as const

export function MovementCountdown({ seconds, movement }: MovementCountdownProps) {
  const { status, remainingSeconds, start, pause, reset } = useMovementCountdown(seconds)

  const low = status !== 'ready' && remainingSeconds <= COUNTDOWN_LOW_SECONDS
  const urgent = status === 'running' && low
  const loop = useInterfaceLoop('urgent', urgent)

  return (
    <section
      aria-label={`${movement} countdown`}
      className="clr-stack--tight"
      data-countdown-status={status}
      style={{ display: 'flex', flexDirection: 'column' }}
    >
      <div className="clr-row" style={{ flexWrap: 'wrap', alignItems: 'center', gap: 'var(--spacing-300)' }}>
        <TimerFrame
          label="Countdown"
          caption="Countdown"
          text={formatElapsed(remainingSeconds)}
          spoken={spokenRest(remainingSeconds)}
          size="var(--label-md-size)"
          low={low}
          pulse={urgent ? loop : undefined}
        />
        <ActionGroup style={{ flex: 1 }}>
          {status === 'running' ? (
            <Button variant="secondary" size="sm" icon={<Pause />} onClick={pause}>
              Pause
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              icon={<Play />}
              disabled={status === 'finished'}
              onClick={start}
            >
              Start
            </Button>
          )}
          <Button
            variant="quiet"
            size="sm"
            icon={<RefreshCw />}
            disabled={status === 'ready'}
            onClick={reset}
          >
            Reset
          </Button>
        </ActionGroup>
      </div>

      {/* Milestones only — the timer itself is labelled, not live. */}
      <p
        role="status"
        aria-live="polite"
        style={{ ...STATUS_STYLE, color: low ? 'var(--text-timer-low)' : 'var(--text-card-label)' }}
      >
        {urgent ? `Final ${COUNTDOWN_LOW_SECONDS} seconds` : status === 'finished' ? 'Countdown done' : ''}
      </p>

      {urgent &&
        createPortal(
          <div
            aria-hidden="true"
            className="clr-countdown-edge clr-pulse-micro"
            data-countdown-edge=""
            {...loop}
          />,
          document.body,
        )}
    </section>
  )
}
