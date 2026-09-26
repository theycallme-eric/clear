/**
 * HOME-01 — what Home says, as a pure function of the sessions it was given.
 *
 * Three derivations, one read. Home asks HIST-01's `useHistoryQuery` once and
 * this module answers the three questions the screen puts to it — which days of
 * this week were trained, which workouts were the last three, and whether there
 * is a session worth repeating. None of them is a second request, and none of
 * them is a second idea of what a session row means: the week and the recents
 * are read through `historyEntries`, so the ordering, the training day and the
 * status a row resolves to are HIST-01's everywhere they appear.
 *
 * Two decisions worth stating, because neither is in the schema:
 *
 *   * **Today is never a rest day.** A day still being lived is `upcoming`
 *     until something is logged on it — the same judgement `historyEntries`
 *     makes about the leading gap and `defaultStreakPolicy` makes about the
 *     streak. Rest is a fact about a day that has finished.
 *   * **Quick Start reuses a request, not a result.** What it repeats is what
 *     the user *asked* for — `requested_intensity` and
 *     `requested_duration_mins` — rather than the effective values a deload may
 *     have adjusted to (OVR-04). Repeating an adjustment would apply it twice;
 *     the next generation adjusts the fresh request on its own terms.
 *
 * Full streak logic — pauses, rest-day allowances, the week's target — is
 * HOME-02's and is deliberately absent. This strip renders session data.
 */
import type { GenerationInput } from '../data/generation'
import type { Enums } from '../data/database.types'
import {
  formatFocus,
  historyEntries,
  type HistoryEntry,
  type HistorySessionEntry,
} from './history'
import type { RestDayReason, WorkoutSessionRow } from './schemas'
import type { RestDayIndex } from './rest-days'
import { localDayIn, previousDay, type LocalDay } from './streak'

// ─────────────────────────────────────────────────────────────────────────────
// Bounds
// ─────────────────────────────────────────────────────────────────────────────

/** Days in the strip. A week, Monday first, as the template draws it. */
export const WEEK_STRIP_DAYS = 7

/** Recent workouts Home shows. Three, per the requirement. */
export const RECENT_WORKOUT_COUNT = 3

export interface HomeOptions {
  /** The instant "today" is read at. Injected, so the derivation stays pure. */
  readonly now?: Date
  /** An IANA zone. Only today is placed with it; sessions carry their own day. */
  readonly timeZone?: string
  /** HOME-02's explicit marks. Omitted keeps HOME-01's session-only strip. */
  readonly restDays?: RestDayIndex
}

// ─────────────────────────────────────────────────────────────────────────────
// The week strip
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What one day of the strip says happened.
 *
 *   * `workout` — a session was performed on it. Completed or partial: the
 *     strip answers "did you train", and a workout stopped halfway was still
 *     training. A session that was never started is not one.
 *   * `rest` — a day that has finished with nothing performed on it.
 *   * `upcoming` — today, and the days after it. Not yet either of the above.
 */
export type WeekDayState = 'workout' | 'rest' | 'upcoming'

/** The word each state is read by. Colour is never the only cue. */
export const WEEK_DAY_LABELS: Readonly<Record<WeekDayState, string>> = {
  workout: 'Workout',
  rest: 'Rest',
  upcoming: 'Upcoming',
}

export interface WeekDay {
  readonly day: LocalDay
  /**
   * Why the day was rested, when the user said (HOME-02). `null` for a day that
   * was trained, a day still to come, and a finished day nobody accounted for —
   * the third is the one that costs a streak, and the strip says `Rest` for it
   * either way because the strip has three states, not four.
   */
  readonly reason: RestDayReason | null
  /** `M`, `T`, `W` — the letter the strip draws. Decorative; never the label. */
  readonly initial: string
  /** `Monday` — what a screen reader is given instead of the letter. */
  readonly weekday: string
  readonly state: WeekDayState
  readonly isToday: boolean
}

/**
 * The seven days of the week containing today, Monday first.
 *
 * A calendar week rather than a trailing seven days, because the strip is read
 * as *this week* — the template's `M T W T F S S` with today marked in place —
 * and a rolling window puts a different letter under today every morning.
 */
export function weekStrip(
  rows: readonly WorkoutSessionRow[],
  options: HomeOptions = {},
): WeekDay[] {
  const today = todayIn(options)
  const performed = new Set(
    historyEntries(rows, options)
      .filter(isSessionEntry)
      .filter((entry) => entry.status !== 'unstarted')
      .map((entry) => entry.day),
  )

  const days: LocalDay[] = [startOfWeek(today)]
  while (days.length < WEEK_STRIP_DAYS) days.push(nextDay(days[days.length - 1]))

  return days.map((day) => {
    const reason = options.restDays?.get(day) ?? null

    return {
      day,
      reason,
      initial: weekdayIn(day, 'narrow'),
      weekday: weekdayIn(day, 'long'),
      state: performed.has(day)
        ? 'workout'
        : reason !== null || day < today
          ? 'rest'
          : 'upcoming',
      isToday: day === today,
    }
  })
}

/** Days of the strip that were trained. The strip's own "3 / 7". */
export function daysTrained(week: readonly WeekDay[]): number {
  return week.filter((day) => day.state === 'workout').length
}

// ─────────────────────────────────────────────────────────────────────────────
// Recent workouts
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The last three workouts, newest first. Rest runs are dropped: they are part
 * of the chronology the History screen reads, and Home is asking a narrower
 * question — what did I last do.
 */
export function recentWorkouts(
  rows: readonly WorkoutSessionRow[],
  options: HomeOptions = {},
): HistorySessionEntry[] {
  return historyEntries(rows, options)
    .filter(isSessionEntry)
    .slice(0, RECENT_WORKOUT_COUNT)
}

/** Where a recent workout opens: HIST-01's detail for that session. */
export function sessionDetailPath(sessionId: string): string {
  return `/history/${sessionId}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Quick Start
// ─────────────────────────────────────────────────────────────────────────────

export interface QuickStartPlan {
  /** The generation request, ready to send. Contract §1's five fields. */
  readonly input: GenerationInput
  /** The session it was read off, for the copy that says what is repeated. */
  readonly sessionId: string
  readonly title: string
  readonly day: LocalDay
  /** `Full body · 45 min · intensity 6` — what the button promises. */
  readonly summary: string
  /**
   * The goal that session was composed for, read for the copy alone. It is
   * **not** in the request: `generationRequestSchema` has no goal field,
   * because the goal is a column on `profiles` that the function reads for
   * itself. Sending a stale copy of it from the browser would be a second
   * source for something the database already answers.
   */
  readonly goal: Enums<'goal_preset'> | null
  readonly goalLabel: string | null
}

/**
 * The request Quick Start would send, or `null` when there is nothing to
 * repeat — and `null` is the whole of the requirement's "hidden entirely until
 * at least one completed workout exists". There is no disabled state here and
 * no default to fall back to: a screen with no plan renders no Quick Start.
 *
 * *Completed*, not merely performed: a workout the user abandoned is not one
 * they asked for again. And a session with no `location_id` is skipped rather
 * than defaulted — the location decides which equipment is eligible, so
 * choosing one on the user's behalf would compose a different workout under
 * the name of repeating theirs. The scan continues to the next completed
 * session, which is still reuse rather than invention.
 */
export function quickStartPlan(
  rows: readonly WorkoutSessionRow[],
  options: HomeOptions = {},
): QuickStartPlan | null {
  const byId = new Map(rows.map((row) => [row.id, row]))

  for (const entry of historyEntries(rows, options)) {
    if (!isSessionEntry(entry) || entry.status !== 'completed') continue

    const row = byId.get(entry.id)
    if (row === undefined || row.location_id === null) continue

    return {
      input: {
        focus: row.session_focus,
        requested_intensity: row.requested_intensity,
        requested_duration_mins: row.requested_duration_mins,
        location_id: row.location_id,
        // Notes were context for that composition, not a standing preference.
        notes: null,
        // Quick Start has no deload prompt. OVR-04 forbids applying one without
        // the user's explicit choice, so repeating a request is an ordinary day.
        deload: false,
      },
      sessionId: row.id,
      title: row.title,
      day: entry.day,
      summary: [
        formatFocus(row.session_focus),
        `${row.requested_duration_mins} min`,
        `intensity ${row.requested_intensity}`,
      ].join(' · '),
      goal: row.goal_preset,
      goalLabel: row.goal_preset === null ? null : readEnum(row.goal_preset),
    }
  }

  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// Days
// ─────────────────────────────────────────────────────────────────────────────

function isSessionEntry(entry: HistoryEntry): entry is HistorySessionEntry {
  return entry.kind === 'session'
}

/** `strength_endurance` → `Strength endurance`. The enum, read rather than listed. */
function readEnum(value: string): string {
  const words = value.replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function todayIn({ now, timeZone }: HomeOptions): LocalDay {
  return localDayIn(timeZone ?? resolveTimeZone())(now ?? new Date())
}

/**
 * The platform's zone, or UTC where there is none — the same fallback
 * `src/state/history.ts` and `src/data/streak.ts` take.
 */
function resolveTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/** The Monday of the week this day falls in. */
function startOfWeek(day: LocalDay): LocalDay {
  // `getUTCDay` is 0 for Sunday, so Sunday is six days into the week rather
  // than the start of one — the ISO reading, and the one the letters draw.
  let start = day
  for (let back = (utcDate(day).getUTCDay() + 6) % 7; back > 0; back -= 1) {
    start = previousDay(start)
  }

  return start
}

/** The calendar day after this one, by date arithmetic like `previousDay`. */
function nextDay(day: LocalDay): LocalDay {
  const [year, month, date] = day.split('-').map(Number)
  const next = new Date(Date.UTC(year, month - 1, date + 1))

  return [
    String(next.getUTCFullYear()).padStart(4, '0'),
    String(next.getUTCMonth() + 1).padStart(2, '0'),
    String(next.getUTCDate()).padStart(2, '0'),
  ].join('-')
}

/**
 * A day's weekday name. Read in UTC from the calendar parts: a `LocalDay` is
 * already a date, and handing it to a zone would be a second chance to shift it.
 */
function weekdayIn(day: LocalDay, weekday: 'narrow' | 'long'): string {
  return new Intl.DateTimeFormat('en-US', { weekday, timeZone: 'UTC' }).format(
    utcDate(day),
  )
}

function utcDate(day: LocalDay): Date {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, date))
}
