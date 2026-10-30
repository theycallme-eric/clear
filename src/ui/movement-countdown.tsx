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
 * B05-06 arranges it: the countdown spans the card's width, with Start/Pause
 * and Reset side by side underneath as one paired action row, above the
 * card's Rest entry action.
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
 *
 * `MovementCountdown` holds its own clock. An owner that must keep one clock
 * across views it mounts and unmounts — a circuit row whose load entry opens
 * and closes — holds `useMovementCountdown` itself and draws
 * `MovementCountdownView` in whichever card is showing.
 */
import { createPortal } from 'react-dom'

import { Button, Pause, Play, RefreshCw } from '../design-system/index'
import {
  COUNTDOWN_LOW_SECONDS,
  useMovementCountdown,
  type MovementCountdownApi,
} from '../state/movement-countdown'
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
  return <MovementCountdownView clock={useMovementCountdown(seconds)} movement={movement} />
}

export interface MovementCountdownViewProps {
  /** The countdown, held by whoever owns the movement's clock. */
  clock: MovementCountdownApi
  /** The movement's name, which names the region the countdown sits in. */
  movement: string
}

export function MovementCountdownView({ clock, movement }: MovementCountdownViewProps) {
  const { status, remainingSeconds, start, pause, reset } = clock

  const low = status !== 'ready' && remainingSeconds <= COUNTDOWN_LOW_SECONDS
  const urgent = status === 'running' && low
  const loop = useInterfaceLoop('urgent', urgent)

  return (
    <section
      aria-label={`${movement} countdown`}
      className="clr-stack--tight clr-movement-countdown"
      data-countdown-status={status}
    >
      <div className="clr-movement-countdown__timer">
        <TimerFrame
          label="Countdown"
          caption="Countdown"
          text={formatElapsed(remainingSeconds)}
          spoken={spokenRest(remainingSeconds)}
          size="var(--label-md-size)"
          low={low}
          pulse={urgent ? loop : undefined}
        />
      </div>

      {/*
        One paired row underneath: two framed halves that never stack or go
        ragged. Both secondary — the screen's one primary is not a timer's.
      */}
      <ActionGroup className="clr-action-group--paired clr-action-group--paired-labels">
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
          variant="secondary"
          size="sm"
          icon={<RefreshCw />}
          disabled={status === 'ready'}
          onClick={reset}
        >
          Reset
        </Button>
      </ActionGroup>

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
