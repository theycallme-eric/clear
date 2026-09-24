/**
 * HIST-01 — what a history list *is*, as a pure function of the rows.
 *
 * The screen reads this module; `src/data/history.ts` reads the rows it is a
 * function of. Nothing here fetches, and nothing here remembers.
 *
 * Two decisions are worth stating, because neither is obvious from the schema:
 *
 *   * **A rest day is not a row.** `workout_sessions` cannot hold one — every
 *     generation input on it is NOT NULL, and the migration says so in as many
 *     words. So a rest day is not read, it is *derived*: a calendar day inside
 *     the span the loaded sessions cover on which the user did not train. That
 *     keeps "rest days marked" true without inventing a table, and it means the
 *     marks cannot disagree with the sessions they sit between.
 *   * **A run of rest days is one entry.** Three untrained days are
 *     `23–25 Sep · 3 rest days`, not three rows. It keeps the list bounded by
 *     the sessions rather than by the calendar — a user returning after two
 *     months meets one entry, not sixty — and it reads the way a person
 *     describes the same gap.
 *
 * The day a session belongs to is `workout_sessions.date`, the training day the
 * row already carries, so no time zone is consulted to place a session. The one
 * instant that does need a zone is *today*, because that is what decides where
 * the leading gap starts — and today is deliberately never itself a rest day.
 * A day still being lived is not yet a day off, which is the same judgement
 * `defaultStreakPolicy.bridgesDay` makes about the streak.
 */
import type { Enums } from '../data/database.types'
import type { WorkoutSessionRow } from './schemas'
import { sessionStateOf } from './session-machine'
import { localDayIn, previousDay, type LocalDay } from './streak'

// ─────────────────────────────────────────────────────────────────────────────
// Vocabulary
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What a session entry says happened, derived from the same three timestamps
 * `sessionStateOf` reads. Three words rather than four states, because the
 * list answers "what did I do", not "what may I do next":
 *
 *   * `completed` — it finished.
 *   * `partial` — work was started and never finished. An abandoned session
 *     that had begun, and a session still running: from history's point of view
 *     both are a workout with some of it done. Resuming one is Home's offer
 *     (HOME-01), not a status.
 *   * `unstarted` — it was never begun. Prescribed and waiting, or abandoned
 *     before the first set; either way nothing was performed.
 */
export type HistorySessionStatus = 'completed' | 'partial' | 'unstarted'

/** The word each status is shown by. Severity and state carry text, not colour. */
export const HISTORY_STATUS_LABELS: Readonly<Record<HistorySessionStatus, string>> = {
  completed: 'Completed',
  partial: 'Partial',
  unstarted: 'Not started',
}

export interface HistorySessionEntry {
  readonly kind: 'session'
  /** Stable across refetches — it is the row's id, not a list position. */
  readonly key: string
  readonly id: string
  /** `workout_sessions.date`: the training day, as the row records it. */
  readonly day: LocalDay
  readonly title: string
  readonly focus: Enums<'session_focus'>
  readonly status: HistorySessionStatus
  /**
   * Minutes actually performed, or `null` when the session never recorded any.
   * The target is not substituted for it: a workout that was planned for 45
   * minutes and abandoned did not take 45 minutes.
   */
  readonly durationMins: number | null
  /** `effective_intensity` — what the session was actually composed at. */
  readonly intensity: number
  readonly mood: number | null
}

export interface HistoryRestEntry {
  readonly kind: 'rest'
  readonly key: string
  /** The oldest day of the run. */
  readonly from: LocalDay
  /** The newest day of the run. `from === to` for a single day. */
  readonly to: LocalDay
  /** Calendar days in the run, inclusive. Always ≥ 1. */
  readonly days: number
}

export type HistoryEntry = HistorySessionEntry | HistoryRestEntry

export interface HistoryOptions {
  /** The instant "today" is read at. Injected, so the derivation stays pure. */
  readonly now?: Date
  /** An IANA zone. Only today is placed with it; sessions carry their own day. */
  readonly timeZone?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Derivation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The chronological list the rows describe, newest first, with the gaps between
 * them marked as rest.
 *
 * No rows means no entries — not a stack of rest days. A user who has never
 * trained has an empty history, and claiming they have been resting since the
 * beginning of the calendar would be the screen making something up.
 */
export function historyEntries(
  rows: readonly WorkoutSessionRow[],
  options: HistoryOptions = {},
): HistoryEntry[] {
  if (rows.length === 0) return []

  const sessions = [...rows].sort(compareSessions).map(sessionEntry)

  // The walk starts at today, or at the newest session when one is dated ahead
  // of it — a workout prescribed for tomorrow is still the top of the list.
  const today = todayIn(options)
  const newest = sessions[0].day
  const start = newest > today ? newest : today

  const byDay = new Map<LocalDay, HistorySessionEntry[]>()
  for (const session of sessions) {
    const existing = byDay.get(session.day)
    if (existing === undefined) byDay.set(session.day, [session])
    else existing.push(session)
  }

  const oldest = sessions[sessions.length - 1].day
  const entries: HistoryEntry[] = []

  // The walk: one calendar day at a time from `start` down to the oldest row
  // read. It stops there rather than at some horizon of its own — a rest day
  // below the oldest loaded session would be a claim about rows nobody has
  // read, and the next page is what settles it.
  let restRun: { from: LocalDay; to: LocalDay; days: number } | null = null

  const flushRest = () => {
    if (restRun === null) return
    entries.push({
      kind: 'rest',
      key: `rest:${restRun.from}`,
      from: restRun.from,
      to: restRun.to,
      days: restRun.days,
    })
    restRun = null
  }

  for (let day = start; day >= oldest; day = previousDay(day)) {
    const trained = byDay.get(day)

    if (trained === undefined) {
      // Today and anything ahead of it are not rest: a day still being lived is
      // not yet a day off, and a day that has not happened is neither.
      if (day >= today) continue

      restRun =
        restRun === null
          ? { from: day, to: day, days: 1 }
          : { from: day, to: restRun.to, days: restRun.days + 1 }
      continue
    }

    flushRest()
    entries.push(...trained)
  }

  // A trailing run cannot exist — the walk ends on the oldest session's day,
  // which is a trained day — but flushing is how that stays true by code
  // rather than by argument.
  flushRest()

  return entries
}

/** The status a row resolves to, over SES-01a's derived state and nothing else. */
export function historyStatus(row: WorkoutSessionRow): HistorySessionStatus {
  switch (sessionStateOf(row)) {
    case 'completed':
      return 'completed'
    case 'active':
      return 'partial'
    case 'abandoned':
      // The distinction abandonment alone cannot make: a session given up on
      // after two sets is a partial workout, one abandoned before it began is
      // a workout that never happened.
      return row.started_at === null ? 'unstarted' : 'partial'
    case 'prescribed':
      return 'unstarted'
  }
}

function sessionEntry(row: WorkoutSessionRow): HistorySessionEntry {
  return {
    kind: 'session',
    key: `session:${row.id}`,
    id: row.id,
    day: row.date,
    title: row.title,
    focus: row.session_focus,
    status: historyStatus(row),
    durationMins: row.actual_duration_mins,
    intensity: row.effective_intensity,
    mood: row.mood,
  }
}

/**
 * Newest first, and two sessions on one day resolve by when they were created —
 * the second workout of a day sits above the first, which is the order they
 * were lived in.
 */
function compareSessions(left: WorkoutSessionRow, right: WorkoutSessionRow): number {
  if (left.date !== right.date) return left.date < right.date ? 1 : -1
  if (left.created_at !== right.created_at) return left.created_at < right.created_at ? 1 : -1
  return 0
}

function todayIn({ now, timeZone }: HistoryOptions): LocalDay {
  return localDayIn(timeZone ?? resolveTimeZone())(now ?? new Date())
}

/**
 * The platform's zone, or UTC where there is none — the same fallback
 * `src/data/streak.ts` takes, and for the same reason: UTC is what the
 * timestamps are stored in, so the days it draws are at least reproducible.
 */
function resolveTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Filtering
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What the list is narrowed to. `rest` is a filter value rather than a toggle
 * because a rest day is an entry in the same chronology, not an overlay on it:
 * "show me the days I rested" is the same question as "show me the ones I
 * finished", asked of the other kind.
 */
export type HistoryFilter = 'all' | HistorySessionStatus | 'rest'

export const HISTORY_FILTERS: readonly { readonly value: HistoryFilter; readonly label: string }[] =
  [
    { value: 'all', label: 'All entries' },
    { value: 'completed', label: HISTORY_STATUS_LABELS.completed },
    { value: 'partial', label: HISTORY_STATUS_LABELS.partial },
    { value: 'unstarted', label: HISTORY_STATUS_LABELS.unstarted },
    { value: 'rest', label: 'Rest days' },
  ]

/** The filter a stored or typed value names, or `all` for anything else. */
export function historyFilterOf(value: string): HistoryFilter {
  const known = HISTORY_FILTERS.find((filter) => filter.value === value)
  return known?.value ?? 'all'
}

export function filterHistory(
  entries: readonly HistoryEntry[],
  filter: HistoryFilter,
): HistoryEntry[] {
  if (filter === 'all') return [...entries]
  if (filter === 'rest') return entries.filter((entry) => entry.kind === 'rest')

  return entries.filter((entry) => entry.kind === 'session' && entry.status === filter)
}

// ─────────────────────────────────────────────────────────────────────────────
// Reading a day out loud
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `2026-09-22` → `Tue 22 Sep 2026`. Read in UTC from the calendar parts, never
 * from an instant in a zone: the day string is already the answer, and handing
 * it to a zone would be a second chance to get the day wrong. Assembled from
 * parts for the same reason `localDayIn` is — the order a locale writes a date
 * in is a presentation decision, and this one is the app's.
 */
export function formatDay(day: LocalDay): string {
  const parts = DAY_FORMAT.formatToParts(asUtcInstant(day))
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? ''

  return `${part('weekday')} ${part('day')} ${part('month')} ${part('year')}`
}

/** The one line a rest run is read as: its span, and how long it lasted. */
export function formatRestRange(entry: HistoryRestEntry): string {
  const length = entry.days === 1 ? '1 rest day' : `${entry.days} rest days`

  return entry.days === 1
    ? `${formatDay(entry.from)} · ${length}`
    : `${formatDay(entry.from)} – ${formatDay(entry.to)} · ${length}`
}

/** `lower_body` → `Lower body`. The enum, read rather than recited. */
export function formatFocus(focus: Enums<'session_focus'>): string {
  const words = focus.replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

const DAY_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

function asUtcInstant(day: LocalDay): Date {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, date))
}
