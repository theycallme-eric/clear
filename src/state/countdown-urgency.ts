/**
 * TASK-008 (C23, C24, C61; G06; R120, R125, R126, R144) — the deadline each
 * functional clock's warning reads.
 *
 * The rule itself — colour at ten, edge at five, elapsed-only never — is the
 * accepted owner `src/ui/refinements/countdown-warning.ts`, and the cue is
 * drawn once by `DeadlineTimer`. What the rule needs from a clock is two facts
 * its existing owner already holds: how long is left before its deadline, and
 * whether that time is running out now. This module reads them from each
 * owner's own view and nothing else:
 *
 *   · movement countdown — `movement-countdown.ts`: live once started, paused
 *     while held, none before Start or once it has run out;
 *   · rest — `rest.ts` / `rest-provider.tsx`: a drawn rest is running;
 *   · EMOM minute — `emom.ts`: this minute's seconds, held while paused;
 *   · AMRAP window — `amrap.ts`: the window left, held while paused;
 *   · race toward a cap — `for-time.ts` (For Time and the raced ladder):
 *     the cap minus the elapsed time (R126: a count-up cap warns on the cap,
 *     never on the number it shows), held while paused, none without a cap;
 *   · scheduled ladder interval and circuit round rest: their own seconds.
 *
 * The session's elapsed time and a circuit round's elapsed time have no
 * deadline: they take `NO_DEADLINE` and never warn.
 *
 * This is not a clock. It starts nothing, reads no wall clock, stores nothing
 * and writes nothing: a warning never records performed work (C24).
 */
import type { AmrapView } from './amrap'
import type { CircuitView } from './circuit'
import type { EmomView } from './emom'
import type { ForTimeView } from './for-time'
import type { CountdownStatus } from './movement-countdown'

/** What a timer's warning reads from its clock. */
export interface CountdownDeadline {
  /** Seconds left before the deadline; null when the clock has none live. */
  readonly remaining: number | null
  /** Whether that time is running out now: false while paused or held. */
  readonly running: boolean
}

/** Not started, ended, or elapsed-only: nothing to warn about. */
export const NO_DEADLINE: CountdownDeadline = Object.freeze({ remaining: null, running: false })

function live(remaining: number, running: boolean): CountdownDeadline {
  return { remaining, running }
}

/** A timed prescription's own countdown (`useMovementCountdown`). */
export function movementCountdownDeadline(status: CountdownStatus, remainingSeconds: number): CountdownDeadline {
  if (status === 'running') return live(remainingSeconds, true)
  if (status === 'paused') return live(remainingSeconds, false)
  return NO_DEADLINE
}

/** The session's one rest: drawn only while it runs. */
export function restDeadline(remainingSeconds: number): CountdownDeadline {
  return remainingSeconds > 0 ? live(remainingSeconds, true) : NO_DEADLINE
}

/** An EMOM's minute: the seconds left of the minute the user is in. */
export function emomMinuteDeadline(view: EmomView): CountdownDeadline {
  if (view.phase !== 'work' && view.phase !== 'rest') return NO_DEADLINE
  return live(view.secondsRemaining, !view.paused)
}

/** An AMRAP's window, when it carries one. */
export function amrapWindowDeadline(view: AmrapView): CountdownDeadline {
  if (view.capSeconds === null) return NO_DEADLINE
  if (view.phase === 'running') return live(view.remainingSeconds, true)
  if (view.phase === 'paused') return live(view.remainingSeconds, false)
  return NO_DEADLINE
}

/**
 * A race counting up toward its cap — a For Time block, and the raced ladder
 * that runs its clock. The deadline is the cap minus the elapsed time, as the
 * race's own view holds it; a race with no cap has none.
 */
export function raceCapDeadline(view: ForTimeView): CountdownDeadline {
  if (view.remainingSeconds === null) return NO_DEADLINE
  if (view.phase === 'running') return live(view.remainingSeconds, true)
  if (view.phase === 'paused') return live(view.remainingSeconds, false)
  return NO_DEADLINE
}

/** A scheduled ladder's countdown to its next start. */
export function scheduleIntervalDeadline(view: {
  readonly phase: 'ready' | 'running' | 'complete'
  readonly secondsRemaining: number
}): CountdownDeadline {
  return view.phase === 'running' ? live(view.secondsRemaining, true) : NO_DEADLINE
}

/** A circuit's shared round rest. */
export function circuitRestDeadline(view: CircuitView): CountdownDeadline {
  return view.phase === 'rest' ? live(view.restRemaining, true) : NO_DEADLINE
}
