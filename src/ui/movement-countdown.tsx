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
 * The frame is the shared whole timer body (`DeadlineTimer`, TASK-007: C19,
 * R102), the one every live clock draws, so border, surface, chamfer and
 * emission are one vocabulary: one complete frame filling the card's width,
 * its digits centred, with no accent-bar strip or second chamfer inside it.
 * It reads this countdown and no other clock (C21).
 *
 * TASK-008 (C22, C23, C24, C61; R120, R125, R126): its warning is the shared
 * one, drawn by `DeadlineTimer` from this countdown's own deadline — the
 * timer-low colour from ten seconds left, and in the final five, while it
 * runs, the timer's smooth breathe with the one soft screen-edge aura in the
 * same phase. Pause and the end stop the breathe and the aura. Under reduced
 * motion both hold a steady .5 and stay drawn. The countdown's former own
 * edge portal and its hard-outlined `.clr-countdown-edge` are retired into
 * that one owner, so no second edge can compete with another deadline's.
 *
 * `MovementCountdown` holds its own clock. An owner that must keep one clock
 * across views it mounts and unmounts — a circuit row whose load entry opens
 * and closes — holds `useMovementCountdown` itself and draws
 * `MovementCountdownView` in whichever card is showing.
 */
import { Button, Pause, Play, RefreshCw } from '../design-system/index'
import { movementCountdownDeadline } from '../state/countdown-urgency'
import { useMovementCountdown, type MovementCountdownApi } from '../state/movement-countdown'
import { movementReading } from '../state/timed-clock'
import { ActionGroup } from './composition'
import { COUNTDOWN_WARNING_THRESHOLDS, countdownWarningState } from './refinements/countdown-warning'
import { DeadlineTimer } from './refinements/deadline-timer'
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

  const deadline = movementCountdownDeadline(status, remainingSeconds)
  const { low, urgent } = countdownWarningState(deadline.remaining, deadline.running)

  return (
    <section
      aria-label={`${movement} countdown`}
      className="clr-stack--tight clr-movement-countdown"
      data-countdown-status={status}
    >
      <div className="clr-movement-countdown__timer">
        <DeadlineTimer
          reading={movementReading(remainingSeconds)}
          size="var(--heading-h1-size)"
          deadline={deadline}
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
        {urgent
          ? `Final ${COUNTDOWN_WARNING_THRESHOLDS.pulseSeconds} seconds`
          : status === 'finished' ? 'Countdown done' : ''}
      </p>
    </section>
  )
}
