/**
 * TASK-007 (C21, G06; R15, R17, R67, R98) — what a timer frame reads, and
 * from which functional clock.
 *
 * The live workout runs several clocks at once, and the owner's rule is that
 * they stay distinct: the session's elapsed time, a movement's own countdown,
 * the session's one rest, and each format's clock (an EMOM's minute, an
 * AMRAP's window, a For Time race and the timed ladder that runs it, a
 * circuit's round rest and round time, a scheduled ladder's interval). Each
 * already has exactly one owner, and that owner keeps its own arithmetic:
 *
 *   · session elapsed — `workout-clock.ts`, `now − started_at`; nothing in a
 *     section pauses it;
 *   · movement countdown — `movement-countdown.ts`, banked on Pause;
 *   · rest — `rest.ts` / `rest-provider.tsx`, `total − (now − startedAt)`,
 *     extended by moving its total;
 *   · format clocks — `emom.ts`, `amrap.ts`, `for-time.ts`, `circuit.ts`,
 *     `ladder.ts`, with TASK-006's Pause/Resume arithmetic in
 *     `timed-lifecycle.ts` and each format's own cap.
 *
 * This module is not another clock. It starts nothing, stores nothing, reads
 * no wall clock and writes nothing. It is the one place that turns an owner's
 * reading into what the shared timer frame (`DeadlineTimer`) draws: which
 * clock it is, its accessible name, its direction, the digits, the words, and
 * how long is left before its deadline — a countdown's own reading, a race's
 * cap minus its elapsed time, or none at all for an elapsed-only clock.
 * Because a reading is a pure function of the owner's reading, drawing it in
 * a different place — the footer, the open log, a narrower card — cannot
 * create, restart or reset the clock behind it (AC-R007-03).
 *
 * TASK-022 (REQ-022, R15): a preparation section (Warm-up, Cooldown) is drawn
 * as its concise guide with its own separate preparation clock
 * (`preparation-clock.ts`), counting the guide's approximate time down with
 * Start, Pause and Add 30s. It is one more reading here, `preparation`, and
 * changes none of the others.
 */
import { spokenRest } from './rest'
import { formatElapsed, spokenElapsed } from './workout-clock'

/** The distinct functional clocks a timer frame can be reading. */
export const TIMED_CLOCKS = ['session', 'movement', 'rest', 'format', 'preparation'] as const
export type TimedClock = (typeof TIMED_CLOCKS)[number]

export interface TimerReading {
  /** Which functional clock this is a reading of. */
  readonly clock: TimedClock
  /** The timer's accessible name, said once — "Session time", "Countdown". */
  readonly label: string
  /** Counting up (elapsed) or down (time left). */
  readonly direction: 'up' | 'down'
  /** The whole seconds the digits show. */
  readonly seconds: number
  /**
   * Seconds left before this clock's deadline: a countdown's own reading, or
   * a race's cap minus its elapsed time. Null for a clock with no deadline —
   * the session's elapsed time, a race with no cap, a round's elapsed time.
   */
  readonly remaining: number | null
  /** The digits: `MM:SS`, or `H:MM:SS` past an hour. Decorative. */
  readonly text: string
  /** The accessible value, in words. */
  readonly spoken: string
}

function whole(seconds: number): number {
  return Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0
}

function countingUp(clock: TimedClock, label: string, elapsed: number, remaining: number | null): TimerReading {
  const seconds = whole(elapsed)
  return { clock, label, direction: 'up', seconds, remaining, text: formatElapsed(seconds), spoken: spokenElapsed(seconds) }
}

function countingDown(clock: TimedClock, label: string, left: number): TimerReading {
  const seconds = whole(left)
  return { clock, label, direction: 'down', seconds, remaining: seconds, text: formatElapsed(seconds), spoken: spokenRest(seconds) }
}

/** The session's elapsed time (`useElapsedSeconds(started_at)`): no deadline. */
export function sessionReading(elapsedSeconds: number): TimerReading {
  return countingUp('session', 'Session time', elapsedSeconds, null)
}

/** The session's one rest, as `useRestTimer` reads it. */
export function restReading(remainingSeconds: number): TimerReading {
  return countingDown('rest', 'Time remaining', remainingSeconds)
}

/** A Warm-up's or Cooldown's preparation clock, as `usePreparationClock` reads it. */
export function preparationReading(remainingSeconds: number): TimerReading {
  return countingDown('preparation', 'Time remaining', remainingSeconds)
}

/** A timed prescription's own countdown, as `useMovementCountdown` reads it. */
export function movementReading(remainingSeconds: number): TimerReading {
  return countingDown('movement', 'Countdown', remainingSeconds)
}

/**
 * A format's countdown: an EMOM's minute, an AMRAP's window, a circuit's round
 * rest or a scheduled ladder's interval — each its format view's own reading.
 */
export function formatCountdownReading(remainingSeconds: number): TimerReading {
  return countingDown('format', 'Time remaining', remainingSeconds)
}

/**
 * A race that counts up toward its cap — a For Time block, and the timed
 * ladder that runs its clock (TASK-006, R67). The deadline is the cap minus
 * the elapsed time, as the race's own view already holds it (frozen while
 * paused); a race with no cap has none.
 */
export function raceReading(elapsedSeconds: number, remainingSeconds: number | null): TimerReading {
  return countingUp('format', 'Block time', elapsedSeconds, remainingSeconds === null ? null : whole(remainingSeconds))
}

/** A circuit round's own elapsed time (REQ-017): no deadline. */
export function roundReading(round: number, elapsedSeconds: number): TimerReading {
  return countingUp('format', `Round ${round} time`, elapsedSeconds, null)
}
