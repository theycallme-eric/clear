/**
 * SES-01a — the session state machine.
 *
 * Four states and three events, and every one of them is a fact about a row
 * rather than about this module's memory:
 *
 * ```
 *   (persisted)
 *        │  accept — the constructor, not a transition
 *        ▼
 *   prescribed ──start──▶ active ──complete──▶ completed
 *        │                   │
 *        └──────abandon──────┴────────────────▶ abandoned
 * ```
 *
 * Two properties this file exists to keep, both of them acceptance criteria:
 *
 *   1. **State is derived, never stored.** `sessionStateOf` reads the three
 *      lifecycle timestamps, which is exactly what `session_state(...)` does in
 *      SQL. There is no status column to fall out of step with them, and no
 *      client-side copy either: the machine's "current state" is whatever the
 *      last row said.
 *
 *   2. **Abandoning is a state.** It is reachable from both non-terminal
 *      states and it is terminal, which is the whole distinction from a
 *      delete — an abandoned session keeps its structure, its logs and its
 *      lineage and simply stops being the one that is running.
 *
 * What it is not: an effect. Nothing here writes, fetches or schedules.
 * `src/data/sessions.ts` performs the transitions against the database, where
 * they are enforced a second time — this module is what a screen consults
 * before offering a control, and what the client checks its answers against.
 * Two independent statements of the same rule is the same posture RLS and the
 * CHECK constraints take, and it is deliberate.
 */

import { Constants, type Enums } from '../data/database.types'
import { ErrorCode, createError, err, ok, type AppError, type Result } from './errors'
import type { SessionSnapshot } from './schemas'

// ─────────────────────────────────────────────────────────────────────────────
// Vocabulary
// ─────────────────────────────────────────────────────────────────────────────

/** `session_state`, generated from the migration. Not a second list. */
export type SessionState = Enums<'session_state'>
export const SESSION_STATES = Constants.public.Enums.session_state

/**
 * The state a persisted session begins in. Acceptance is the constructor
 * rather than an event: a workout that was never persisted has no row, and a
 * state machine over a row cannot have a state for "there is no row".
 */
export const INITIAL_SESSION_STATE: SessionState = 'prescribed'

/**
 * The three things a user can do to a session's lifecycle. Logging a set,
 * skipping an exercise and swapping a prescription are not here: none of them
 * moves the session itself, which is why a swap mid-workout is legal and why
 * `started_at` stays the pivot of the "as intended at start" query
 * (DATA_MODEL §7).
 */
export const SESSION_EVENTS = ['start', 'complete', 'abandon'] as const
export type SessionEvent = (typeof SESSION_EVENTS)[number]

// ─────────────────────────────────────────────────────────────────────────────
// The machine
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The whole machine, as data. Written as a total map over the four states so
 * that adding a fifth to the enum fails to compile here rather than silently
 * becoming a state with no transitions out of it.
 */
const TRANSITIONS: Readonly<Record<SessionState, Readonly<Partial<Record<SessionEvent, SessionState>>>>> =
  {
    prescribed: { start: 'active', abandon: 'abandoned' },
    active: { complete: 'completed', abandon: 'abandoned' },
    // Terminal. A completed session is a record of what happened, and an
    // abandoned one is a record of what did not.
    completed: {},
    abandoned: {},
  }

/** A state nothing leads out of. */
export function isTerminal(state: SessionState): boolean {
  return Object.keys(TRANSITIONS[state]).length === 0
}

/** Whether a control should be offered at all. */
export function canTransition(from: SessionState, event: SessionEvent): boolean {
  return TRANSITIONS[from][event] !== undefined
}

/** Every event this state admits, for a screen that renders its own controls. */
export function eventsFrom(from: SessionState): SessionEvent[] {
  return SESSION_EVENTS.filter((event) => canTransition(from, event))
}

/**
 * The transition, or a typed refusal. `SESSION_INVALID_TRANSITION` rather than
 * a validation error: nothing about the request was malformed, it simply
 * arrived after the state moved on — a completed workout being completed twice
 * is a double tap, not a bad payload.
 */
export function transition(
  from: SessionState,
  event: SessionEvent,
): Result<SessionState, AppError> {
  const next = TRANSITIONS[from][event]

  if (next === undefined) {
    return err(
      createError(ErrorCode.SESSION_INVALID_TRANSITION, {
        details: { from, event, allowed: eventsFrom(from) },
      }),
    )
  }

  return ok(next)
}

/**
 * The state of a row, derived from its three timestamps — the same derivation
 * `public.session_state(...)` performs, and deliberately the same order of
 * questions. The CHECK constraint makes completed-and-abandoned impossible, so
 * the precedence never actually arbitrates; it is written down anyway, because
 * a reader should not have to work out what would happen if it did.
 */
export function sessionStateOf(row: {
  readonly started_at: string | null
  readonly completed_at: string | null
  readonly abandoned_at: string | null
}): SessionState {
  if (row.abandoned_at !== null) return 'abandoned'
  if (row.completed_at !== null) return 'completed'
  if (row.started_at !== null) return 'active'

  return INITIAL_SESSION_STATE
}

// ─────────────────────────────────────────────────────────────────────────────
// Resuming
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Where a session picks back up: the first prescription nobody has finished
 * with, and the set number the next log should carry.
 *
 * This is the half of "hard refresh mid-workout" the client owns. The other
 * half is `resume_session`, which decides *which* session is resumable; this
 * decides where inside it the user was. Neither of them remembers anything —
 * the position is recomputed from execution status and the logs that are
 * already written, so a refresh, a second device and a reinstall all land in
 * the same place.
 */
export interface ResumePoint {
  readonly sectionId: string
  readonly sectionType: Enums<'section_type'>
  /** `order_index`, so a caller can scroll to it without counting. */
  readonly sectionOrder: number
  readonly blockId: string
  readonly workoutExerciseId: string
  readonly exerciseId: string
  /** Sets already logged against this prescription. Intact across a refresh. */
  readonly loggedSets: number
  /**
   * What the next set is numbered — one past the highest logged, never the
   * count. EXE-07 writes a set log with a client-minted id and flushes it
   * later, so a gap in the numbers is possible and counting would reuse one.
   */
  readonly nextSetNumber: number
}

/**
 * The first exercise still to be performed, or `null` when every one of them
 * has been completed or skipped — which is a session waiting to be completed,
 * not a session with nothing in it.
 *
 * A skipped exercise is passed over rather than resumed at: skipping is a
 * decision the user already made, and re-offering it would be the app
 * forgetting it (DATA_MODEL §8).
 */
export function resumePoint(snapshot: SessionSnapshot): ResumePoint | null {
  for (const section of snapshot.sections) {
    for (const block of section.blocks) {
      for (const { exercise, set_logs: logs } of block.exercises) {
        if (exercise.execution_status !== 'not_started') continue

        const highest = logs.reduce((max, log) => Math.max(max, log.set_number), 0)

        return {
          sectionId: section.section.id,
          sectionType: section.section.section_type,
          sectionOrder: section.section.order_index,
          blockId: block.block.id,
          workoutExerciseId: exercise.id,
          exerciseId: exercise.exercise_id,
          loggedSets: logs.length,
          nextSetNumber: highest + 1,
        }
      }
    }
  }

  return null
}
