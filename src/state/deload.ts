/**
 * OVR-04 — §4's deload triggers, as pure functions, and the consent around them.
 *
 * §4 opens with "triggers, not vibes", and closes with the reason the whole
 * requirement is shaped the way it is: *never auto-apply*. A personal tool that
 * silently reduces your weights because of a rolling median is a tool you stop
 * trusting. So this module decides one thing — whether there is something worth
 * *saying* — and decides nothing at all about what the session becomes. What the
 * user does with the sentence is the screen's, and what a deload session looks
 * like is generation's (`supabase/functions/_shared/training-history.ts`).
 *
 * Three parts, composing in one direction:
 *
 *   1. **The six triggers** (`d1Stall` … `d6CalendarBackstop`) — each a total
 *      function of a history it was handed, each answering the triggers it fired
 *      rather than a boolean, because a suggestion has to be able to say *which*
 *      lift stalled.
 *   2. **The headline** (`deloadTriggers`, `deloadSuggestion`) — everything that
 *      fired, and the one line the banner states. A suggestion is one sentence,
 *      so something has to choose it, and the choice is written down here rather
 *      than left to whichever trigger happened to be evaluated first.
 *   3. **The consent** (`DeloadDecision`, `suppression`, `clampedIntensity`,
 *      `confirmsHardIntensity`) — Apply, Not today, the three-session snooze, and
 *      the one confirmation a hard intensity costs on a flagged day.
 *
 * Five decisions are stated once here because each is load-bearing and none is
 * obvious from the table:
 *
 *   * **Scope beats table order.** D1 and D2 are exercise-scoped and D3–D6 are
 *     session-scoped (§4), and when both kinds fire the session-scoped one is the
 *     headline. A whole-session signal is the larger claim and subsumes the
 *     narrow one: telling someone their squat has stalled while their whole week
 *     reads RPE 9 would be answering the smaller question. Everything that fired
 *     is still returned, so nothing is hidden by the choice.
 *   * **A week nobody trained is an easy week.** D6's backstop asks for six
 *     consecutive weeks with no week averaging intensity ≤5. A week with no
 *     completed session has no average, and the honest reading of a backstop
 *     against accumulated fatigue is that a week off already cleared some — so an
 *     empty week resets it. The alternative fires a deload suggestion at someone
 *     who has not trained in a month, which is the opposite of the rule's point.
 *   * **The snooze counts days, not sessions completed today.** §4 snoozes for
 *     three sessions; a decision is recorded with the day it was made, and only
 *     sessions dated *after* that day count toward the three. A second session on
 *     the day of the dismissal cannot be told apart from one completed an hour
 *     before it, and the direction of the error matters: under-counting makes the
 *     banner wait longer, and this is a suggestion nobody asked for twice.
 *   * **Applying suppresses everything; dismissing suppresses its own scope.**
 *     An accepted deload runs for three sessions or seven days, whichever comes
 *     first (§4), and during it there is nothing to suggest. A dismissal is
 *     narrower: "not today" about a stalled squat is not an answer about a week
 *     of RPE 9 work, so it snoozes that movement and leaves the session-scoped
 *     read free to speak.
 *   * **The evidence is already the right evidence.** Every row here comes from
 *     `anchor_evidence(...)`, which has already dropped warmups, bodyweight,
 *     active recovery and — the criterion this requirement owes §4 — sessions
 *     already tagged `is_deload`. A deliberately light week can therefore neither
 *     lower an anchor nor read as a stall, which is the same exclusion stated
 *     once in SQL instead of twice.
 *
 * Spec: `docs/specs/OVR-01_progressive-overload.md` §4. §1's arithmetic is
 * `anchors.ts`, §2/§5's rules are `progression.ts`, §3's timed formats are
 * `conditioning.ts`. Pure and React-free like all three: nothing here fetches,
 * and nothing here reads a row it was not handed.
 */

import { sessionAnchors, type SessionAnchor } from './anchors'
import type { AnchorEvidenceRow, WorkoutSessionRow } from './schemas'

// ─────────────────────────────────────────────────────────────────────────────
// What a deload prescribes — §4's numbers, in one place
// ─────────────────────────────────────────────────────────────────────────────

/** §4: "Load anchors × 0.85 for suggestions." */
export const DELOAD_LOAD_FACTOR = 0.85

/** §4: "Working sets reduced by ~40% (round down, minimum 2)." */
export const DELOAD_SET_FACTOR = 0.6
export const DELOAD_MIN_SETS = 2

/** §4: "Hard RPE cap of 7 — surfaced in coaching cues." */
export const DELOAD_RPE_CAP = 7

/** §4: "Conditioning capped at intensity 6." */
export const DELOAD_CONDITIONING_INTENSITY_MAX = 6

/** §4's Apply: "intensity clamped to ≤5". */
export const DELOAD_INTENSITY_MAX = 5

/**
 * §4: "If the user picks intensity ≥8 on a flagged day, confirm once, then
 * honor it." The floor is where "hard" starts, and it is the only thing the
 * confirmation is about — a 7 on a flagged day is a judgement call, not a
 * contradiction of the suggestion.
 */
export const HARD_INTENSITY_FLOOR = 8

/** §4: a deload runs for "the next 3 completed sessions, or 7 days". */
export const DELOAD_SESSIONS = 3
export const DELOAD_DAYS = 7

/** §4: "Not today → snoozed for 3 sessions." */
export const SNOOZE_SESSIONS = 3

// ─────────────────────────────────────────────────────────────────────────────
// The trigger table's own numbers
// ─────────────────────────────────────────────────────────────────────────────

/** D1: three consecutive sessions, not moving, at a median RPE of 9 or more. */
export const STALL_SESSIONS = 3
export const STALL_RPE = 9

/** D2: ≥5% below the 4-week rolling best, across 2 consecutive sessions. */
export const REGRESSION_FRACTION = 0.05
export const REGRESSION_SESSIONS = 2
export const REGRESSION_WINDOW_DAYS = 28

/** D3: a 7-day median working-set RPE of 9.0 or more, over ≥3 sessions. */
export const EFFORT_WINDOW_DAYS = 7
export const EFFORT_MIN_SESSIONS = 3
export const EFFORT_RPE = 9

/** D4: ≥6 sessions at intensity ≥7 in 14 days, with zero at intensity ≤4. */
export const LOAD_WINDOW_DAYS = 14
export const LOAD_HARD_SESSIONS = 6
export const LOAD_HARD_INTENSITY = 7
export const LOAD_EASY_INTENSITY = 4

/** D5: ≥30% of prescribed working sets short, over the last 2 sessions. */
export const MISSED_REP_FRACTION = 0.3
export const MISSED_REP_SESSIONS = 2

/** D6: 6 consecutive weeks with no week averaging intensity ≤5. */
export const BACKSTOP_WEEKS = 6
export const BACKSTOP_INTENSITY = 5

const DAYS_PER_WEEK = 7
const MS_PER_DAY = 86_400_000

/**
 * A relative tolerance on "has not increased". Anchors are floating-point
 * arithmetic over Epley, and two identical sessions can differ in the last bit;
 * a stall that depended on exact equality would be a rule that silently never
 * fires.
 */
const STALL_TOLERANCE = 1e-9

// ─────────────────────────────────────────────────────────────────────────────
// Vocabulary
// ─────────────────────────────────────────────────────────────────────────────

/** §4's six rows, named as the table names them. */
export type DeloadTriggerId = 'D1' | 'D2' | 'D3' | 'D4' | 'D5' | 'D6'

/**
 * §4: "D1–D2 are exercise-scoped and can trigger a movement-specific deload.
 * D3–D6 are session-scoped and trigger a full deload."
 */
export type DeloadScope = 'movement' | 'session'

/** What the user decided about a suggestion, the last time one was shown. */
export type DeloadDecisionKind = 'applied' | 'dismissed'

/** One trigger that fired, and everything a sentence about it needs. */
export interface DeloadTrigger {
  readonly id: DeloadTriggerId
  readonly scope: DeloadScope
  /** The lift a movement-scoped trigger is about; null for a session one. */
  readonly exerciseId: string | null
  /** The one line the banner states. A sentence, not a rule id. */
  readonly reason: string
}

/**
 * One session, as the session-scoped triggers read it.
 *
 * A structural subset of `workout_sessions` rather than the row itself, for the
 * reason `conditioning.ts` takes a `TimedPrescription`: D4 and D6 are about
 * intensity over a calendar, and a rule that could only be exercised by building
 * a forty-column fixture is a rule nobody re-checks.
 */
export interface DeloadSessionRead {
  readonly id: string
  /** The training day, `YYYY-MM-DD`. */
  readonly date: string
  /** `effective_intensity`: what was generated, not what was asked for. */
  readonly intensity: number
  /** Started, finished, and not abandoned. Nothing else is evidence. */
  readonly completed: boolean
}

/** Everything the triggers read, and nothing they do not. */
export interface DeloadInput {
  /** `anchor_evidence(...)` rows — already free of deloads and warmups. */
  readonly evidence: readonly AnchorEvidenceRow[]
  /** The user's recent sessions, newest first or not; order is not read. */
  readonly sessions: readonly DeloadSessionRead[]
  /** The user's own today, `YYYY-MM-DD`. Never `now()` (SES-01c's reasoning). */
  readonly today: string
  /**
   * D2's "primary-lift movement", as a set of exercise ids.
   *
   * Optional, and its absence means *every anchored lift is eligible* rather
   * than none: `anchor_evidence` has already narrowed the rows to loaded,
   * reps-modality working sets — the kind of movement a primary lift is — and a
   * D2 that could never fire until some later requirement passes a set would be
   * a rule in name only. A caller that knows better narrows it.
   */
  readonly primaryLifts?: ReadonlySet<string>
  /** What the user has already said about a suggestion. Newest first or not. */
  readonly decisions?: readonly DeloadDecision[]
}

/** A decision the user made about a suggestion, as it is recorded. */
export interface DeloadDecision {
  /** The suggestion it answered: `session`, or `movement:<exercise_id>`. */
  readonly key: string
  readonly trigger: DeloadTriggerId
  readonly decision: DeloadDecisionKind
  /** The day it was made, `YYYY-MM-DD`. */
  readonly date: string
}

/** The suggestion a screen renders — one trigger, stated once. */
export interface DeloadSuggestion {
  /** The headline: the trigger the banner's sentence is about. */
  readonly trigger: DeloadTrigger
  /** Everything that fired, headline included, in table order. */
  readonly triggers: readonly DeloadTrigger[]
  readonly scope: DeloadScope
  readonly exerciseId: string | null
  /** The banner's line. */
  readonly reason: string
  /** What a decision about this suggestion is recorded under. */
  readonly key: string
  /**
   * §4: "If the same trigger fires after the snooze, the banner returns with
   * the count." Null when this is the first time it has been raised.
   */
  readonly dismissedSessionsAgo: number | null
}

/** Why no suggestion is being shown, when something is being suppressed. */
export interface DeloadSuppression {
  readonly decision: DeloadDecision
  /** Completed sessions since the decision — what the window is counted in. */
  readonly sessionsSince: number
  /** Days since the decision. Only an applied deload reads it. */
  readonly daysSince: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Reading the history
// ─────────────────────────────────────────────────────────────────────────────

/** A `workout_sessions` row as the session-scoped triggers read it. */
export function deloadSessionRead(row: WorkoutSessionRow): DeloadSessionRead {
  return {
    id: row.id,
    date: row.date,
    intensity: row.effective_intensity,
    completed: row.completed_at !== null && row.abandoned_at === null,
  }
}

export function deloadSessionReads(
  rows: readonly WorkoutSessionRow[],
): readonly DeloadSessionRead[] {
  return rows.map(deloadSessionRead)
}

/**
 * One exercise's sessions, oldest first: what the anchor was, and how hard the
 * working sets felt.
 *
 * The anchor per session is `anchors.ts`' own — the same arithmetic, unit
 * conversion included, that produced the stored number — because a stall
 * detector that computed its own e1RM would be a second opinion about whether
 * you got stronger.
 */
export interface ExerciseSessionRead extends SessionAnchor {
  /** §2's read: the median of the session's working-set RPEs, or null. */
  readonly medianRpe: number | null
}

export function exerciseSessions(
  evidence: readonly AnchorEvidenceRow[],
): readonly ExerciseSessionRead[] {
  const rpes = new Map<string, number[]>()

  for (const set of evidence) {
    if (set.rpe === null) continue
    const key = sessionKey(set.session_id, set.exercise_id, set.equipment_used)
    const bucket = rpes.get(key)
    if (bucket === undefined) rpes.set(key, [set.rpe])
    else bucket.push(set.rpe)
  }

  return sessionAnchors(evidence).map((anchor) => ({
    ...anchor,
    medianRpe: median(
      rpes.get(sessionKey(anchor.sessionId, anchor.exerciseId, anchor.equipmentUsed)) ?? [],
    ),
  }))
}

/** The median of what was measured, or null when nothing was. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null

  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)

  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2
}

/** Whole days between two `YYYY-MM-DD` dates, `from` first. Signed. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / MS_PER_DAY)
}

// ─────────────────────────────────────────────────────────────────────────────
// D1 — performance stall
// ─────────────────────────────────────────────────────────────────────────────

/**
 * §4 D1: the same exercise, three consecutive sessions where the anchor has not
 * increased **and** the median working-set RPE is 9 or more.
 *
 * "Not increased" is measured against the first session of the three rather than
 * step by step: a window of 100, 99, 100 has gone nowhere, and a rule that read
 * the last step as progress would clear a stall that plainly is one. The RPE
 * condition is the half that makes this honest — §4 says so outright: without
 * it, every stretch of light sessions would look like a stall.
 *
 * A session whose RPE was never recorded cannot satisfy the rule. An absent
 * measurement is not a 9.
 */
export function d1Stall(evidence: readonly AnchorEvidenceRow[]): readonly DeloadTrigger[] {
  const triggers: DeloadTrigger[] = []

  for (const [, sessions] of byExercise(exerciseSessions(evidence))) {
    const window = sessions.slice(-STALL_SESSIONS)
    if (window.length < STALL_SESSIONS) continue

    const [first] = window
    const stalled = window.every(
      (session) => session.value <= first.value * (1 + STALL_TOLERANCE),
    )
    const maximal = window.every(
      (session) => session.medianRpe !== null && session.medianRpe >= STALL_RPE,
    )
    if (!stalled || !maximal) continue

    triggers.push({
      id: 'D1',
      scope: 'movement',
      exerciseId: first.exerciseId,
      reason:
        `Your last ${STALL_SESSIONS} ${exerciseLabel(first.exerciseId)} sessions ` +
        `stalled at RPE ${STALL_RPE}+.`,
    })
  }

  return triggers
}

// ─────────────────────────────────────────────────────────────────────────────
// D2 — regression
// ─────────────────────────────────────────────────────────────────────────────

/**
 * §4 D2: a primary lift's anchor drops 5% or more below its 4-week rolling best,
 * across two consecutive sessions.
 *
 * The rolling best is taken over the four weeks *ending at each session*,
 * including that session: a best that could include a session yet to happen
 * would make the same history read differently depending on when it was asked.
 * Both of the two most recent sessions have to be down against their own window,
 * which is what "across 2 consecutive sessions" rules out — one bad Tuesday.
 */
export function d2Regression(
  evidence: readonly AnchorEvidenceRow[],
  primaryLifts?: ReadonlySet<string>,
): readonly DeloadTrigger[] {
  const triggers: DeloadTrigger[] = []

  for (const [, sessions] of byExercise(exerciseSessions(evidence))) {
    const [newest] = sessions.slice(-1)
    if (newest === undefined) continue
    if (primaryLifts !== undefined && !primaryLifts.has(newest.exerciseId)) continue

    const window = sessions.slice(-REGRESSION_SESSIONS)
    if (window.length < REGRESSION_SESSIONS) continue

    const regressed = window.every((session) => {
      const best = rollingBest(sessions, session)
      return session.value <= best * (1 - REGRESSION_FRACTION)
    })
    if (!regressed) continue

    triggers.push({
      id: 'D2',
      scope: 'movement',
      exerciseId: newest.exerciseId,
      reason:
        `Your ${exerciseLabel(newest.exerciseId)} has been ` +
        `${Math.round(REGRESSION_FRACTION * 100)}% or more below its best for ` +
        `${REGRESSION_SESSIONS} sessions.`,
    })
  }

  return triggers
}

/** The highest anchor in the four weeks ending at `session`, itself included. */
function rollingBest(
  sessions: readonly ExerciseSessionRead[],
  session: ExerciseSessionRead,
): number {
  let best = session.value

  for (const candidate of sessions) {
    const age = daysBetween(candidate.date, session.date)
    if (age < 0 || age > REGRESSION_WINDOW_DAYS) continue
    if (candidate.value > best) best = candidate.value
  }

  return best
}

// ─────────────────────────────────────────────────────────────────────────────
// D3 — effort inflation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * §4 D3: a rolling 7-day median working-set RPE of 9.0 or more, across three or
 * more completed sessions.
 *
 * The median is over every working set in the window rather than a median of
 * per-session medians: §2 takes a median over sets for exactly the reason that
 * one grinder set should not drag the read, and the same argument applies once
 * more across a week. The session count is the guard against a single brutal
 * day reading as a brutal week.
 */
export function d3EffortInflation(
  evidence: readonly AnchorEvidenceRow[],
  today: string,
): DeloadTrigger | null {
  const recent = evidence.filter(
    (set) => set.rpe !== null && withinDays(set.session_date, today, EFFORT_WINDOW_DAYS),
  )

  const sessions = new Set(recent.map((set) => set.session_id))
  if (sessions.size < EFFORT_MIN_SESSIONS) return null

  const read = median(recent.map((set) => set.rpe ?? 0))
  if (read === null || read < EFFORT_RPE) return null

  return {
    id: 'D3',
    scope: 'session',
    exerciseId: null,
    reason:
      `Everything has felt like an RPE ${EFFORT_RPE} this week — ${sessions.size} ` +
      `sessions running.`,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// D4 — accumulated load
// ─────────────────────────────────────────────────────────────────────────────

/**
 * §4 D4: six or more sessions in the last fourteen days at intensity 7 or above,
 * with **zero** sessions at intensity 4 or below.
 *
 * The zero is the whole rule. Six hard sessions in a fortnight is a training
 * block; six hard sessions with nothing easy between them is a fortnight with no
 * recovery in it, and only the second is a reason to say something.
 */
export function d4AccumulatedLoad(
  sessions: readonly DeloadSessionRead[],
  today: string,
): DeloadTrigger | null {
  const window = completedWithin(sessions, today, LOAD_WINDOW_DAYS)

  const hard = window.filter((session) => session.intensity >= LOAD_HARD_INTENSITY)
  const easy = window.filter((session) => session.intensity <= LOAD_EASY_INTENSITY)

  if (hard.length < LOAD_HARD_SESSIONS || easy.length > 0) return null

  return {
    id: 'D4',
    scope: 'session',
    exerciseId: null,
    reason:
      `${hard.length} hard sessions in ${LOAD_WINDOW_DAYS} days and no easy ones.`,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// D5 — missed-rep pattern
// ─────────────────────────────────────────────────────────────────────────────

/**
 * §4 D5: 30% or more of the prescribed working sets in the last two sessions came
 * in under their prescribed reps.
 *
 * "The last two sessions" is counted in sessions that produced evidence, not in
 * calendar days: a fortnight off between them does not make the pattern older
 * than it is, and §5's staleness is the rule that owns time away.
 *
 * A set with no prescribed target is in neither half — there is nothing it could
 * have come up short of — and a set with no recorded reps is left out for the
 * reason `anchors.ts` states once: not recorded is not zero.
 */
export function d5MissedReps(evidence: readonly AnchorEvidenceRow[]): DeloadTrigger | null {
  const recent = new Set(recentSessionIds(evidence, MISSED_REP_SESSIONS))

  const measured = evidence.filter(
    (set) =>
      recent.has(set.session_id) &&
      set.actual_reps !== null &&
      set.prescribed_reps !== null &&
      set.prescribed_reps > 0,
  )
  if (measured.length === 0) return null

  const short = measured.filter((set) => (set.actual_reps ?? 0) < (set.prescribed_reps ?? 0))
  const fraction = short.length / measured.length
  if (fraction < MISSED_REP_FRACTION) return null

  return {
    id: 'D5',
    scope: 'session',
    exerciseId: null,
    reason:
      `${Math.round(fraction * 100)}% of your sets came up short of their reps in ` +
      `the last ${MISSED_REP_SESSIONS} sessions.`,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// D6 — calendar backstop
// ─────────────────────────────────────────────────────────────────────────────

/**
 * §4 D6: six consecutive weeks with no week averaging intensity 5 or below.
 *
 * The weeks are seven-day windows counted back from today rather than calendar
 * weeks, because the rule is about how long it has been and a Monday boundary
 * would make the answer depend on which day the user opened the app.
 *
 * A week with no completed session **resets** the backstop. It has no average to
 * be above, and a fatigue backstop that fired at someone who spent a week not
 * training would be measuring the calendar rather than the training.
 */
export function d6CalendarBackstop(
  sessions: readonly DeloadSessionRead[],
  today: string,
): DeloadTrigger | null {
  for (let week = 0; week < BACKSTOP_WEEKS; week += 1) {
    const inWeek = sessions.filter((session) => {
      if (!session.completed) return false
      const age = daysBetween(session.date, today)
      return age >= week * DAYS_PER_WEEK && age < (week + 1) * DAYS_PER_WEEK
    })

    if (inWeek.length === 0) return null

    const average =
      inWeek.reduce((sum, session) => sum + session.intensity, 0) / inWeek.length
    if (average <= BACKSTOP_INTENSITY) return null
  }

  return {
    id: 'D6',
    scope: 'session',
    exerciseId: null,
    reason: `${BACKSTOP_WEEKS} weeks without an easy one.`,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Everything that fired
// ─────────────────────────────────────────────────────────────────────────────

/** §4's six rows, evaluated in the table's own order. */
export function deloadTriggers(input: DeloadInput): readonly DeloadTrigger[] {
  const { evidence, sessions, today, primaryLifts } = input

  return [
    ...d1Stall(evidence),
    ...d2Regression(evidence, primaryLifts),
    d3EffortInflation(evidence, today),
    d4AccumulatedLoad(sessions, today),
    d5MissedReps(evidence),
    d6CalendarBackstop(sessions, today),
  ].filter((trigger): trigger is DeloadTrigger => trigger !== null)
}

/**
 * The trigger the banner speaks for: the first session-scoped one that fired,
 * or the first movement-scoped one when none did.
 *
 * Within a scope the table's order decides, so the same history always produces
 * the same sentence.
 */
export function headlineTrigger(
  triggers: readonly DeloadTrigger[],
): DeloadTrigger | null {
  return (
    triggers.find((trigger) => trigger.scope === 'session') ?? triggers[0] ?? null
  )
}

/** What a decision about a trigger is recorded under. */
export function suggestionKey(trigger: {
  readonly scope: DeloadScope
  readonly exerciseId: string | null
}): string {
  return trigger.scope === 'session' ? 'session' : `movement:${trigger.exerciseId ?? ''}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Consent — the snooze, and what an accepted deload suppresses
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The decision still standing against a suggestion, or null when none is.
 *
 * An **applied** deload suppresses every suggestion — the user is already inside
 * the thing being suggested — for three completed sessions or seven days,
 * whichever comes first (§4). A **dismissal** suppresses only the suggestion it
 * answered, for three completed sessions, because "not today" about one stalled
 * lift is not an answer about the week as a whole.
 */
export function suppression(
  key: string,
  decisions: readonly DeloadDecision[],
  sessions: readonly DeloadSessionRead[],
  today: string,
): DeloadSuppression | null {
  const relevant = decisions.filter(
    (decision) => decision.decision === 'applied' || decision.key === key,
  )

  for (const decision of [...relevant].sort((left, right) =>
    right.date.localeCompare(left.date),
  )) {
    const sessionsSince = completedAfter(sessions, decision.date)
    const daysSince = daysBetween(decision.date, today)

    const spent =
      decision.decision === 'applied'
        ? sessionsSince >= DELOAD_SESSIONS || daysSince >= DELOAD_DAYS
        : sessionsSince >= SNOOZE_SESSIONS

    if (!spent) return { decision, sessionsSince, daysSince }
  }

  return null
}

/**
 * §4's banner, or null when there is nothing to say.
 *
 * Null is the ordinary answer and the important one: no trigger fired, or one
 * did and the user has already answered it. Nothing here changes a session — the
 * screen renders this, the user decides, and only then does anything move.
 */
export function deloadSuggestion(input: DeloadInput): DeloadSuggestion | null {
  const triggers = deloadTriggers(input)
  const headline = headlineTrigger(triggers)
  if (headline === null) return null

  const key = suggestionKey(headline)
  const decisions = input.decisions ?? []

  if (suppression(key, decisions, input.sessions, input.today) !== null) return null

  // §4: a banner that has been dismissed before comes back saying so. The count
  // is sessions rather than days because the snooze is counted in sessions, and
  // two units in one sentence would be two things to reconcile.
  const dismissed = decisions
    .filter((decision) => decision.decision === 'dismissed' && decision.key === key)
    .sort((left, right) => right.date.localeCompare(left.date))[0]

  return {
    trigger: headline,
    triggers,
    scope: headline.scope,
    exerciseId: headline.exerciseId,
    reason: headline.reason,
    key,
    dismissedSessionsAgo:
      dismissed === undefined ? null : completedAfter(input.sessions, dismissed.date),
  }
}

/** The decision a screen records when the user answers a suggestion. */
export function decisionFor(
  suggestion: DeloadSuggestion,
  decision: DeloadDecisionKind,
  today: string,
): DeloadDecision {
  return { key: suggestion.key, trigger: suggestion.trigger.id, decision, date: today }
}

// ─────────────────────────────────────────────────────────────────────────────
// What Apply does, and what it does not
// ─────────────────────────────────────────────────────────────────────────────

/**
 * §4's Apply: the intensity, clamped to 5 or below.
 *
 * A clamp rather than a fixed value: a user who had already chosen 3 asked for
 * something lighter than the deload's ceiling, and raising it to meet a cap
 * would be the app arguing with them in the direction it just warned against.
 */
export function clampedIntensity(intensity: number): number {
  return Math.min(intensity, DELOAD_INTENSITY_MAX)
}

/**
 * Whether choosing this intensity on a flagged day costs one confirmation.
 *
 * §4: "If the user picks intensity ≥8 on a flagged day, confirm once, then honor
 * it. The user knows things the app doesn't." Once — so a screen asks, records
 * the override, and never asks again for that session.
 */
export function confirmsHardIntensity(intensity: number, flagged: boolean): boolean {
  return flagged && intensity >= HARD_INTENSITY_FLOOR
}

// ─────────────────────────────────────────────────────────────────────────────
// Internals
// ─────────────────────────────────────────────────────────────────────────────

/** Completed sessions dated within `days` of `today`, the boundary included. */
function completedWithin(
  sessions: readonly DeloadSessionRead[],
  today: string,
  days: number,
): readonly DeloadSessionRead[] {
  return sessions.filter(
    (session) => session.completed && withinDays(session.date, today, days),
  )
}

/**
 * Completed sessions dated strictly after `date`.
 *
 * Strictly: a session completed on the day a suggestion was answered cannot be
 * told apart from one completed an hour before it was, and counting it would
 * shorten a snooze the user asked for.
 */
function completedAfter(sessions: readonly DeloadSessionRead[], date: string): number {
  return sessions.filter((session) => session.completed && session.date > date).length
}

/**
 * The ids of the most recent `count` sessions the evidence holds, newest last.
 *
 * Keyed by id and ordered by date, so two sessions on one day are two sessions:
 * "the last 2 sessions" is a count of workouts, and a day that held both a
 * morning and an evening one held two.
 */
function recentSessionIds(
  evidence: readonly AnchorEvidenceRow[],
  count: number,
): readonly string[] {
  const dates = new Map<string, string>()
  for (const set of evidence) {
    const seen = dates.get(set.session_id)
    if (seen === undefined || set.session_date < seen) dates.set(set.session_id, set.session_date)
  }

  return [...dates]
    .sort(([leftId, leftDate], [rightId, rightDate]) =>
      leftDate.localeCompare(rightDate) || leftId.localeCompare(rightId),
    )
    .slice(-count)
    .map(([id]) => id)
}

/** Whether `date` falls in the `days`-long window ending at `today`. */
function withinDays(date: string, today: string, days: number): boolean {
  const age = daysBetween(date, today)
  return age >= 0 && age < days
}

/** One exercise-and-implement pair's sessions, oldest first. */
function byExercise(
  sessions: readonly ExerciseSessionRead[],
): Map<string, ExerciseSessionRead[]> {
  const groups = new Map<string, ExerciseSessionRead[]>()

  for (const session of sessions) {
    const key = `${session.exerciseId}/${session.equipmentUsed}`
    const group = groups.get(key)
    if (group === undefined) groups.set(key, [session])
    else group.push(session)
  }

  return groups
}

function sessionKey(sessionId: string, exerciseId: string, equipment: string): string {
  return `${sessionId}/${exerciseId}/${equipment}`
}

/**
 * An exercise id as a sentence says it: `back-squat` → `back squat`.
 *
 * The catalog's display name is a row this module was not handed, and fetching
 * one to write a banner would make a pure rule depend on a network call. The ids
 * are kebab-cased English, so the substitution reads correctly, and a caller
 * with the catalog in hand can render its own name from `exerciseId`.
 */
export function exerciseLabel(exerciseId: string): string {
  return exerciseId.replaceAll('-', ' ').replaceAll('_', ' ')
}
