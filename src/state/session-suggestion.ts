/**
 * HOME-03 — what to train next, as a pure function of the sessions already read.
 *
 * This is the client half of what the previous app called `suggest_anchor()`
 * and what DATA_MODEL §3's cascade renames `suggest_session_focus()`: the
 * least-recently-trained focus, plus an intensity read off recent history. It
 * is written here rather than as an RPC for the reason SES-01c's streak and
 * HOME-01's week strip are written here — the input is the page of sessions
 * Home has already fetched, so a second round trip would be a second answer to
 * a question the rows in hand settle, and a formula nobody can execute on a
 * pull request is a formula nobody reviews.
 *
 * Four decisions, each load-bearing:
 *
 *   * **Staleness is a fact about training, not about rows.** A session that
 *     was never started trained nothing, so it is not evidence; a session
 *     stopped halfway trained something, so it is. That is the same judgement
 *     `weekStrip` makes about a day.
 *   * **Never trained is stale, but not infinitely stale.** A focus absent from
 *     the loaded history is ranked at `NEVER_TRAINED_STALENESS_DAYS` rather than
 *     at infinity — the previous RPC's "never hit = max staleness" ceiling, kept
 *     because absence from one page of history is weaker evidence than a dated
 *     session eleven days old. A focus genuinely untrained for longer than the
 *     ceiling therefore outranks one that never appears at all, and ties break
 *     by the enum's own order, which puts the three region focuses before
 *     `power`: suggesting Power to somebody who has never trained it is a guess,
 *     and Full body is the honest reading of the same evidence.
 *   * **Pattern staleness is derived, and it is a bound rather than a claim.**
 *     `workout_sessions` carries a focus, not a pattern, so what a session
 *     *admits* is read through `focus_pattern_map` (mirrored in
 *     `FOCUS_PATTERNS`). A hinge can only have been trained in a session whose
 *     focus admits one, so "no hinge in 11 days" derived this way is never an
 *     overstatement — the true gap can only be longer. It gives the requirement
 *     its pattern-level sentence without inventing exercise-level evidence
 *     nothing has read; `patternsTrained` is the seam an exercise-level read
 *     (`session_performed` joined to `exercise_pattern_ranked`) attaches to
 *     later, and every consumer here is written against it rather than against
 *     the focus.
 *   * **Thin history answers nothing.** Under `MIN_SUGGESTION_SESSIONS`
 *     completed sessions, or with nothing completed inside
 *     `SUGGESTION_RECENCY_DAYS`, there is no suggestion at all: `null`, which
 *     Home renders as its empty state. A "least-recently-trained" focus
 *     computed from one session is arithmetic on noise, and an intensity
 *     averaged from a training block three months old is a claim about a person
 *     who has since stopped.
 *
 * Nothing here navigates or remembers. The prefilled destination is
 * `generatePath` in `state/generation-form.ts`, because what a prefilled draft
 * *is* belongs to the form; the dismissal below is a `localStorage`
 * convenience on the same terms as `workout-persistence.ts` — unreadable or
 * malformed is simply ignored.
 *
 * Spec: `docs/specs/DATA_MODEL.md` §3.
 */
import { Constants, type Enums } from '../data/database.types'
import {
  generatePath,
  type GenerationPrefill,
} from './generation-form'
import { formatFocus, historyEntries, type HistoryEntry, type HistorySessionEntry } from './history'
import type { WorkoutSessionRow } from './schemas'
import { localDayIn, type LocalDay } from './streak'

export type SessionFocus = Enums<'session_focus'>
export type MovementPattern = Enums<'movement_pattern'>

// ─────────────────────────────────────────────────────────────────────────────
// Bounds
// ─────────────────────────────────────────────────────────────────────────────

/** The four focuses, in the enum's declared order — which is also the tie-break. */
export const SESSION_FOCUSES: readonly SessionFocus[] = Constants.public.Enums.session_focus

/**
 * `focus_pattern_map`, as the catalog migration seeds it. Mirrored rather than
 * fetched because it is a vocabulary rather than data: eleven rows that change
 * only when the taxonomy does, and `session-suggestion.test.ts` fails if this
 * and the migration ever disagree.
 *
 * `conditioning` is deliberately not reachable from any focus — it derives from
 * `cardio-output` and maps to no session focus, recorded as open question 5 in
 * DATA_MODEL §13 — so it is absent from `SUGGESTIBLE_PATTERNS` too rather than
 * appearing as a pattern the user has permanently neglected.
 */
export const FOCUS_PATTERNS: Readonly<Record<SessionFocus, readonly MovementPattern[]>> = {
  upper_body: ['press', 'pull'],
  lower_body: ['squat', 'hinge', 'unilateral'],
  full_body: ['squat', 'hinge', 'press', 'pull', 'unilateral'],
  power: ['power'],
}

/** Every pattern some focus admits, in `movement_pattern`'s declared order. */
export const SUGGESTIBLE_PATTERNS: readonly MovementPattern[] =
  Constants.public.Enums.movement_pattern.filter((pattern) =>
    SESSION_FOCUSES.some((focus) => FOCUS_PATTERNS[focus].includes(pattern)),
  )

/** Completed sessions before "least recently trained" means anything. */
export const MIN_SUGGESTION_SESSIONS = 3

/** How recent the newest completed session must be for any of this to hold. */
export const SUGGESTION_RECENCY_DAYS = 21

/**
 * What a focus absent from the loaded history ranks as. The previous
 * `suggest_anchor()` used its seven-day window plus one; this reads a page of
 * history rather than a week, so the ceiling is a fortnight.
 */
export const NEVER_TRAINED_STALENESS_DAYS = 14

/** Completed sessions the intensity suggestion averages over, newest first. */
export const INTENSITY_HISTORY_COUNT = 3

/** The intensity bound `workout_sessions` itself holds. */
const INTENSITY_MIN = 1
const INTENSITY_MAX = 10

export interface SuggestionOptions {
  /** The instant "today" is read at. Injected, so the derivation stays pure. */
  readonly now?: Date
  /** An IANA zone. Only today is placed with it; sessions carry their own day. */
  readonly timeZone?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Staleness
// ─────────────────────────────────────────────────────────────────────────────

/**
 * How long ago one thing was last trained.
 *
 * `daysSince` is `null` for "not in the sessions read", which is not the same
 * as a large number and must never be rendered as one. `rank` is the number the
 * ordering uses, with `null` at the `NEVER_TRAINED_STALENESS_DAYS` ceiling.
 */
export interface Staleness<T> {
  readonly value: T
  readonly daysSince: number | null
  readonly rank: number
}

export type FocusStaleness = Staleness<SessionFocus>
export type PatternStaleness = Staleness<MovementPattern>

/**
 * Which day each focus was last trained on. Exported because it is the evidence
 * every answer below is read from, and a caller inspecting a suggestion should
 * be able to see the same rows it saw.
 */
export function focusesTrained(
  rows: readonly WorkoutSessionRow[],
  options: SuggestionOptions = {},
): ReadonlyMap<SessionFocus, LocalDay> {
  const trained = new Map<SessionFocus, LocalDay>()

  for (const entry of trainingSessions(rows, options)) {
    const known = trained.get(entry.focus)
    if (known === undefined || entry.day > known) trained.set(entry.focus, entry.day)
  }

  return trained
}

/**
 * Which day each movement pattern was last *admitted* by a session performed.
 *
 * The seam the module's third decision names: focus-derived today, and the one
 * function an exercise-level read would replace. Everything downstream asks
 * this rather than asking a focus, so that replacement changes no copy and no
 * consumer.
 */
export function patternsTrained(
  rows: readonly WorkoutSessionRow[],
  options: SuggestionOptions = {},
): ReadonlyMap<MovementPattern, LocalDay> {
  const trained = new Map<MovementPattern, LocalDay>()

  for (const [focus, day] of focusesTrained(rows, options)) {
    for (const pattern of FOCUS_PATTERNS[focus]) {
      const known = trained.get(pattern)
      if (known === undefined || day > known) trained.set(pattern, day)
    }
  }

  return trained
}

/** The four focuses, stalest first. */
export function focusStaleness(
  rows: readonly WorkoutSessionRow[],
  options: SuggestionOptions = {},
): FocusStaleness[] {
  const trained = focusesTrained(rows, options)
  const today = todayIn(options)

  return stalestFirst(
    SESSION_FOCUSES.map((focus) => staleness(focus, trained.get(focus) ?? null, today)),
  )
}

/** Every pattern a focus admits, stalest first. */
export function patternStaleness(
  rows: readonly WorkoutSessionRow[],
  options: SuggestionOptions = {},
): PatternStaleness[] {
  const trained = patternsTrained(rows, options)
  const today = todayIn(options)

  return stalestFirst(
    SUGGESTIBLE_PATTERNS.map((pattern) =>
      staleness(pattern, trained.get(pattern) ?? null, today),
    ),
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// The suggestion
// ─────────────────────────────────────────────────────────────────────────────

export interface SessionSuggestion {
  readonly focus: SessionFocus
  /** `Lower body` — the focus as a person reads it. */
  readonly focusLabel: string
  readonly intensity: number
  /** The focus's own staleness, for the copy that says how long it has been. */
  readonly focusStaleness: FocusStaleness
  /** The stalest pattern this focus would train. The requirement's precision. */
  readonly patternStaleness: PatternStaleness
  /** `No hinge in 11 days.` — pattern-level, never only "no lower body". */
  readonly reason: string
  /** Why this intensity and not another. A number with no account is a guess. */
  readonly intensityReason: string
  readonly prefill: GenerationPrefill
  /** `/generate?focus=lower_body&intensity=7` — where tapping it goes. */
  readonly path: string
}

/**
 * The least-recently-trained focus, or `null` when the history is too thin to
 * name one. The client's `suggest_session_focus`.
 */
export function suggestSessionFocus(
  rows: readonly WorkoutSessionRow[],
  options: SuggestionOptions = {},
): SessionFocus | null {
  if (!hasEnoughHistory(rows, options)) return null
  return focusStaleness(rows, options)[0]?.value ?? null
}

/**
 * The intensity recent history supports: the mean of the last
 * `INTENSITY_HISTORY_COUNT` completed sessions' `effective_intensity`, rounded.
 *
 * `effective_intensity` rather than `requested_intensity` — what the user
 * actually trained at, including any deload adjustment (OVR-04) — because this
 * answers "what have you been sustaining", not "what did you ask for". It is
 * continuity rather than a target: a number that drifts up on its own would be
 * the app prescribing progression it has no evidence for, and the goal chosen
 * on the Generate screen clamps whatever lands here to its own range anyway.
 */
export function suggestedIntensity(
  rows: readonly WorkoutSessionRow[],
  options: SuggestionOptions = {},
): number | null {
  const recent = completedSessions(rows, options).slice(0, INTENSITY_HISTORY_COUNT)
  if (recent.length === 0) return null

  const total = recent.reduce((sum, entry) => sum + entry.intensity, 0)
  const mean = Math.round(total / recent.length)

  return Math.min(INTENSITY_MAX, Math.max(INTENSITY_MIN, mean))
}

/**
 * Whether the loaded history says enough for any suggestion to be honest:
 * `MIN_SUGGESTION_SESSIONS` completed sessions, the newest of them inside
 * `SUGGESTION_RECENCY_DAYS`.
 */
export function hasEnoughHistory(
  rows: readonly WorkoutSessionRow[],
  options: SuggestionOptions = {},
): boolean {
  const completed = completedSessions(rows, options)
  if (completed.length < MIN_SUGGESTION_SESSIONS) return false

  const newest = completed[0]
  return daysBetween(newest.day, todayIn(options)) <= SUGGESTION_RECENCY_DAYS
}

/**
 * What Home offers, or `null` for "not enough history to say" — and `null` is
 * the whole of the requirement's "no suggestion shown with insufficient
 * history". There is no hedged suggestion and no default focus to fall back on.
 */
export function suggestSession(
  rows: readonly WorkoutSessionRow[],
  options: SuggestionOptions = {},
): SessionSuggestion | null {
  const focus = suggestSessionFocus(rows, options)
  const intensity = suggestedIntensity(rows, options)
  if (focus === null || intensity === null) return null

  const focusStale =
    focusStaleness(rows, options).find((candidate) => candidate.value === focus) ?? null
  const patternStale = stalestPatternOf(focus, rows, options)
  if (focusStale === null || patternStale === null) return null

  const prefill: GenerationPrefill = { focus, intensity }
  const sessionCount = Math.min(
    completedSessions(rows, options).length,
    INTENSITY_HISTORY_COUNT,
  )

  return {
    focus,
    focusLabel: formatFocus(focus),
    intensity,
    focusStaleness: focusStale,
    patternStaleness: patternStale,
    reason: stalenessSentence(patternStale),
    intensityReason: `Your last ${countWord(sessionCount, 'session')} averaged intensity ${intensity}.`,
    prefill,
    path: generatePath(prefill),
  }
}

/** The stalest pattern a focus would train, which is why it is being suggested. */
export function stalestPatternOf(
  focus: SessionFocus,
  rows: readonly WorkoutSessionRow[],
  options: SuggestionOptions = {},
): PatternStaleness | null {
  const admitted = FOCUS_PATTERNS[focus]

  return (
    patternStaleness(rows, options).find((candidate) =>
      admitted.includes(candidate.value),
    ) ?? null
  )
}

/**
 * `No hinge in 11 days.` for something dated, and an absence stated as one
 * where there is no date to give. Never a number standing in for "never".
 */
export function stalenessSentence(stale: Staleness<string>): string {
  const name = stale.value.replace(/_/g, ' ')

  return stale.daysSince === null
    ? `No ${name} in the sessions you’ve logged.`
    : `No ${name} in ${countWord(stale.daysSince, 'day')}.`
}

// ─────────────────────────────────────────────────────────────────────────────
// Dismissal
// ─────────────────────────────────────────────────────────────────────────────

/** One key, overwritten: the suggestion is dismissed for a day, not for ever. */
export const SUGGESTION_DISMISSAL_STORAGE_KEY = 'clear.home-suggestion'

/** The subset of `Storage` this module uses; injectable, so a test owns it. */
export interface SuggestionStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/**
 * `localStorage`, or nothing. Safari in private mode throws on access, and an
 * app that forgets a dismissal is still a working app — it offers the
 * suggestion again, which is the harmless direction to fail in.
 */
export function defaultSuggestionStorage(): SuggestionStorage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

/**
 * The day the suggestion was dismissed for, or `null` — for absent, unreadable
 * and malformed alike. A hand-written guard rather than zod, on
 * `workout-persistence.ts`'s argument: this crosses no process boundary, and
 * its own previous write is the only thing that produces it.
 */
export function readSuggestionDismissal(
  storage: SuggestionStorage | null,
): LocalDay | null {
  if (storage === null) return null

  let raw: string | null
  try {
    raw = storage.getItem(SUGGESTION_DISMISSAL_STORAGE_KEY)
  } catch {
    return null
  }

  return raw !== null && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null
}

/** Dismisses the suggestion for one day. Tomorrow's is a different suggestion. */
export function writeSuggestionDismissal(
  storage: SuggestionStorage | null,
  day: LocalDay,
): void {
  if (storage === null) return

  try {
    storage.setItem(SUGGESTION_DISMISSAL_STORAGE_KEY, day)
  } catch {
    // A full or unavailable store costs a dismissal, never the screen.
  }
}

/** Whether today's suggestion has already been dismissed. */
export function suggestionDismissed(
  storage: SuggestionStorage | null,
  options: SuggestionOptions = {},
): boolean {
  return readSuggestionDismissal(storage) === todayIn(options)
}

/** The day a dismissal is recorded against: today, in the reader's own zone. */
export function suggestionDay(options: SuggestionOptions = {}): LocalDay {
  return todayIn(options)
}

// ─────────────────────────────────────────────────────────────────────────────
// Reading the rows
// ─────────────────────────────────────────────────────────────────────────────

/** Sessions that trained something, newest first. Unstarted rows are not evidence. */
function trainingSessions(
  rows: readonly WorkoutSessionRow[],
  options: SuggestionOptions,
): HistorySessionEntry[] {
  return historyEntries(rows, options)
    .filter(isSessionEntry)
    .filter((entry) => entry.status !== 'unstarted')
}

/** Sessions that finished, newest first. The intensity evidence, and the gate's. */
function completedSessions(
  rows: readonly WorkoutSessionRow[],
  options: SuggestionOptions,
): HistorySessionEntry[] {
  return historyEntries(rows, options)
    .filter(isSessionEntry)
    .filter((entry) => entry.status === 'completed')
}

function isSessionEntry(entry: HistoryEntry): entry is HistorySessionEntry {
  return entry.kind === 'session'
}

function staleness<T>(value: T, day: LocalDay | null, today: LocalDay): Staleness<T> {
  const daysSince = day === null ? null : daysBetween(day, today)

  return {
    value,
    daysSince,
    rank: daysSince ?? NEVER_TRAINED_STALENESS_DAYS,
  }
}

/**
 * Stalest first, and stable: `Array.prototype.sort` is specified stable, so an
 * equal rank keeps the enum order it arrived in — which is the tie-break the
 * module's second decision describes rather than an accident of the sort.
 */
function stalestFirst<T>(all: readonly Staleness<T>[]): Staleness<T>[] {
  return [...all].sort((left, right) => right.rank - left.rank)
}

/** `1 day` / `11 days`. Colour is never the only cue, and neither is a bare number. */
function countWord(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

function todayIn({ now, timeZone }: SuggestionOptions): LocalDay {
  return localDayIn(timeZone ?? resolveTimeZone())(now ?? new Date())
}

/**
 * The platform's zone, or UTC where there is none — the same fallback
 * `src/state/home.ts` and `src/state/history.ts` take.
 */
function resolveTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/**
 * Whole calendar days from `from` to `to`, never negative: a session dated
 * ahead of today was not trained in the future, it was trained now.
 */
function daysBetween(from: LocalDay, to: LocalDay): number {
  const elapsed = utcDate(to).getTime() - utcDate(from).getTime()
  return Math.max(0, Math.round(elapsed / DAY_MS))
}

const DAY_MS = 24 * 60 * 60 * 1000

function utcDate(day: LocalDay): Date {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, date))
}
