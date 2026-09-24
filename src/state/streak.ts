/**
 * SES-01c — the streak, derived.
 *
 * Consecutive days on which the user completed a session that counts. It is a
 * pure function of `workout_sessions` rows and it is **never stored**: the old
 * app kept six columns of it — `streak_count`, `streak_status`,
 * `streak_pause_reason`, `streak_start_date`, `streak_pause_start`,
 * `consecutive_rest_days` — and they drifted from the sessions they claimed to
 * summarise. No column in this schema holds a streak, which is what makes a
 * deleted or abandoned session change the answer on the next read with no
 * repair step to run.
 *
 * Three decisions this file exists to hold:
 *
 *   1. **The day is the user's, and the time zone is resolved once.** Every
 *      instant is bucketed by one `Intl.DateTimeFormat` built here from the
 *      caller's zone, so a session at 11pm and one at 1am are two days for the
 *      user whatever UTC thinks. Days are then walked as calendar dates rather
 *      than by subtracting 24 hours, which is the same distinction one DST
 *      boundary later: the day before 2026-11-02 is 2026-11-01 in every zone,
 *      and 25 hours earlier is not.
 *
 *   2. **A day in progress is not a missed day.** The run may end today or
 *      yesterday; only a day that has fully passed without a session breaks
 *      it. Waking up on Tuesday does not cost you Monday.
 *
 *   3. **HOME-02 extends this, and the extension point is `StreakPolicy`.**
 *      Pause states, rest-day allowances and the week strip are more answers
 *      to the two questions the policy already asks — *does this session
 *      count* and *does this empty day still leave the run intact* — so they
 *      arrive as a different policy passed to this same function, never as a
 *      second derivation beside it. `defaultStreakPolicy` is M1's: the session
 *      flag, and today.
 *
 * What it is not: a fetch. `src/data/streak.ts` reads the rows and hands them
 * here. Nothing in this module knows a session can be read from anywhere.
 */

import type { WorkoutSessionRow } from './schemas'

// ─────────────────────────────────────────────────────────────────────────────
// Vocabulary
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A calendar day in the user's zone, `YYYY-MM-DD`. A string rather than a
 * `Date` on purpose: a `Date` is an instant, and an instant is exactly the
 * thing whose day depends on where you are standing.
 */
export type LocalDay = string

/**
 * What the derivation needs from a session row, and no more: when it was
 * finished, and whether it counts. Structural, so both the full
 * `workout_sessions` row and the three columns `streak_sessions(...)` returns
 * satisfy it.
 *
 * `completed_at is null` covers prescribed, active and abandoned sessions in
 * one predicate — a session that was given up on has no completion instant,
 * so it cannot be a training day, and nothing has to remember that separately.
 */
export type StreakSession = Pick<WorkoutSessionRow, 'completed_at' | 'counts_for_streak'>

/**
 * The two rules HOME-02 extends. Everything else about the derivation — the
 * time zone, the calendar walk, the day in progress — is the same function
 * either way.
 */
export interface StreakPolicy {
  /**
   * Whether this session makes its day a training day. Deload and
   * active-recovery sessions are training days: nothing here reads
   * `goal_preset` or `adjustment_reason`, and a session that counts is one
   * whose `counts_for_streak` says so.
   */
  readonly countsForStreak: (session: StreakSession) => boolean
  /**
   * Whether a day with no counting session still leaves the run intact.
   * M1 bridges exactly one day — today, which is not over. HOME-02's rest
   * days, allowances and pauses are more days answered `true` here.
   */
  readonly bridgesDay: (day: LocalDay, context: StreakDayContext) => boolean
}

/** What a policy is told about the day it is asked to judge. */
export interface StreakDayContext {
  /** The user's today, from the instant the derivation was given. */
  readonly today: LocalDay
  /** Days already counted, most recent first — the run so far. */
  readonly counted: readonly LocalDay[]
}

export interface StreakOptions {
  /** An IANA zone — `America/New_York`. Resolved once, into one formatter. */
  readonly timeZone: string
  /** The instant "now" is read at. Injected, so the derivation stays pure. */
  readonly now?: Date
  /** Defaults to `defaultStreakPolicy`; HOME-02 passes its own. */
  readonly policy?: StreakPolicy
}

export interface Streak {
  /** Consecutive training days. The headline number, computed nowhere else. */
  readonly days: number
  /** Those days, most recent first. `days` is this array's length. */
  readonly trainingDays: readonly LocalDay[]
  /** The user's today, as the supplied zone renders the supplied instant. */
  readonly today: LocalDay
  /** Whether today is one of them — a run of 3 ending yesterday is still 3. */
  readonly includesToday: boolean
  /**
   * The most recent counting day in the rows supplied, streak or no streak.
   * A user who last trained a fortnight ago has `days: 0` and a date here.
   */
  readonly lastTrainingDay: LocalDay | null
  /**
   * Whether the run reached the oldest row it was given, and so may continue
   * into rows that were never supplied. `src/data/streak.ts` reads this and
   * asks for the page before; a caller that derived from a complete history
   * can ignore it.
   */
  readonly continuesBeforeOldest: boolean
}

/**
 * M1's rules. The session flag decides what counts, and the only empty day
 * that does not break a run is the one still being lived.
 */
export const defaultStreakPolicy: StreakPolicy = {
  countsForStreak: (session) => session.completed_at !== null && session.counts_for_streak,
  bridgesDay: (day, { today }) => day === today,
}

// ─────────────────────────────────────────────────────────────────────────────
// Derivation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The streak the supplied sessions describe. Order does not matter, duplicates
 * do not matter, and two sessions on one day are one training day — the input
 * is a set of rows, not a sequence of events.
 */
export function deriveStreak(
  sessions: readonly StreakSession[],
  options: StreakOptions,
): Streak {
  const dayOf = localDayIn(options.timeZone)
  const policy = options.policy ?? defaultStreakPolicy
  const today = dayOf(options.now ?? new Date())

  // One pass over the rows: the days that count, and the oldest day any row
  // reached. The second is what tells the caller whether an older page could
  // still extend the run — it is deliberately taken from *every* completed
  // session rather than only the counting ones, because a page whose oldest
  // row does not count still proves there is nothing between it and now.
  const counting = new Set<LocalDay>()
  let oldest: LocalDay | null = null
  let lastTrainingDay: LocalDay | null = null

  for (const session of sessions) {
    const instant = session.completed_at === null ? null : new Date(session.completed_at)
    // An unparseable instant is not a day. The rows are schema-parsed at the
    // boundary, so this is a floor rather than an expectation.
    if (instant === null || Number.isNaN(instant.getTime())) continue

    const day = dayOf(instant)
    if (oldest === null || day < oldest) oldest = day

    if (!policy.countsForStreak(session)) continue

    counting.add(day)
    if (lastTrainingDay === null || day > lastTrainingDay) lastTrainingDay = day
  }

  // The walk. Backwards from today, one calendar day at a time, for as long as
  // each day either counts or is bridged. It stops at the oldest day the rows
  // could speak for: anything earlier is unknown rather than empty, and
  // guessing it is how a derived number starts being wrong.
  const trainingDays: LocalDay[] = []
  let day = today
  let continuesBeforeOldest = false

  while (oldest !== null) {
    if (day < oldest) {
      // Ran out of rows while the run was still going.
      continuesBeforeOldest = true
      break
    }

    if (counting.has(day)) {
      trainingDays.push(day)
    } else if (!policy.bridgesDay(day, { today, counted: trainingDays })) {
      break
    }

    day = previousDay(day)
  }

  return {
    days: trainingDays.length,
    trainingDays,
    today,
    includesToday: counting.has(today),
    lastTrainingDay,
    // A run of nothing continues nowhere, however little history it was shown.
    continuesBeforeOldest: continuesBeforeOldest && trainingDays.length > 0,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Days
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A `LocalDay` reader for one zone. Built once per derivation: constructing an
 * `Intl.DateTimeFormat` per row is both slower and a second place the zone
 * could be supplied differently.
 *
 * Throws `RangeError` for a zone the platform does not know, exactly as `Intl`
 * does. `src/data/streak.ts` turns that into a typed error before it can reach
 * a screen.
 */
export function localDayIn(timeZone: string): (instant: Date) => LocalDay {
  const format = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })

  return (instant) => {
    // Assembled from parts rather than from a formatted string: the order of
    // a locale's date is a presentation decision, and this is not one.
    const parts = format.formatToParts(instant)
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((candidate) => candidate.type === type)?.value ?? ''

    return `${part('year').padStart(4, '0')}-${part('month')}-${part('day')}`
  }
}

/**
 * The calendar day before this one. Date arithmetic, not clock arithmetic: the
 * day before a DST transition is still the day before, and a month or a year
 * boundary is the same statement.
 */
export function previousDay(day: LocalDay): LocalDay {
  const [year, month, date] = day.split('-').map(Number)
  const previous = new Date(Date.UTC(year, month - 1, date - 1))

  // UTC throughout: this is a calendar, and `Date` is only being borrowed for
  // its knowledge of month lengths.
  return [
    String(previous.getUTCFullYear()).padStart(4, '0'),
    String(previous.getUTCMonth() + 1).padStart(2, '0'),
    String(previous.getUTCDate()).padStart(2, '0'),
  ].join('-')
}
