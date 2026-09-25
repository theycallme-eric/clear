/**
 * OVR-01b — the rules that read an anchor, as pure functions.
 *
 * OVR-01a learns: it turns set logs into a stored e1RM per exercise and stops
 * there. This module is the other half — what to prescribe next — and it is
 * deliberately a separate file with no client, no fetch and no React, because
 * the requirement's first acceptance criterion is that *every row of the RPE
 * table has a unit test*. A rule that can only be exercised by completing a
 * session is a rule nobody re-checks; a rule that is a total function of a
 * session read is eight tests and a table.
 *
 * Three things live here, and they compose in one direction only:
 *
 *   1. **The read** (`sessionRead`) — median working-set RPE, first-set RPE and
 *      rep completion, from the same evidence rows `anchor_evidence` answers.
 *   2. **The table** (`RULE_TABLE`, `ruleFor`) — §2's eight rows, in the order
 *      they are evaluated, each carrying the prose cell it came from so the
 *      spec and the code can be diffed by eye.
 *   3. **The number** (`suggestLoad`) — the anchor inverted at the prescribed
 *      reps and RIR, decayed for staleness, stepped by the rule that fired,
 *      snapped to the equipment's increment, and clamped to 110% of what was
 *      actually lifted in the last eight weeks.
 *
 * Four decisions are stated once here because each is load-bearing:
 *
 *   * **A suggestion always carries its confidence.** `LoadSuggestion.weight`
 *     is never returned without `confidence` and `sessionCount` beside it, and
 *     the two states that cannot honestly produce a number — no history, and an
 *     anchor older than twelve weeks — return `weight: null` rather than a
 *     plausible one. §5's contamination principle is the whole point: a
 *     confident-looking number from four months ago is worse than no number.
 *   * **The table is ordered, and the order is the precedence.** §2 says a
 *     first set at RPE ≥9 is an overshoot "regardless of what the median says",
 *     so the three overshoot rows are evaluated before the five that require
 *     every rep completed. Within the overshoot rows, the harshest read — RPE
 *     10 with reps missed — is checked first, so it is not shadowed by the
 *     milder −5% rules it necessarily also satisfies.
 *   * **Backing off is not modulated by goal.** §2's goal table chooses which
 *     lever *progress* uses — load for strength, reps for hypertrophy — but an
 *     overshoot is a correction, and a hypertrophy block does not respond to a
 *     failed set by adding a rep. Downward rows always move the load.
 *   * **Increments are indivisible.** §5 halves the step at two sessions. That
 *     bites on a percentage; it cannot halve a plate, so a halved increment
 *     step is still one increment. The alternative is a suggestion nobody can
 *     load onto a bar.
 *
 * Spec: `docs/specs/OVR-01_progressive-overload.md` §2 and §5. §1's arithmetic
 * is `anchors.ts`; §3's timed formats are OVR-03's; §4's deload triggers are
 * OVR-04's. Nothing here reads a row it was not handed.
 */

import type { Enums } from '../data/database.types'
import { convertWeight, type WeightUnit } from './anchors'
import type { AnchorEvidenceRow } from './schemas'

// ─────────────────────────────────────────────────────────────────────────────
// Vocabulary
// ─────────────────────────────────────────────────────────────────────────────

export type GoalPreset = Enums<'goal_preset'>

/** §2's step sizing: lower body tolerates larger absolute jumps than upper. */
export type MovementRegion = 'upper' | 'lower'

/** §2's `balanced` goal: load on the primary lift, reps on accessories. */
export type LiftRole = 'primary' | 'accessory'

/**
 * §5's ladder, as a suggestion carries it. `none` is the tier the stored
 * `anchor_confidence` enum has no room for and this one needs: zero sessions is
 * not low confidence, it is no answer.
 */
export type SuggestionConfidence = 'none' | 'low' | 'medium' | 'high'

/** §5's staleness bands, named by what they do rather than by their weeks. */
export type StalenessTier = 'fresh' | 're_entry' | 'recalibration' | 'discarded'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** §1's safety clamp: never more than 110% of the heaviest recent logged set. */
export const SAFETY_CLAMP = 1.1

/** The window the clamp's maximum is taken over (§1), in weeks. */
export const CLAMP_WINDOW_WEEKS = 8

/** §5's decay factors, by band. `0` is the discard — there is no anchor left. */
export const DECAY_RE_ENTRY = 0.95
export const DECAY_RECALIBRATION = 0.9

/** §2: `active_recovery` suggestions are capped at 60% of the anchor, RPE 5. */
export const ACTIVE_RECOVERY_CAP = 0.6
export const ACTIVE_RECOVERY_RPE_CAP = 5

/** Days in the week the staleness bands are measured in. */
const DAYS_PER_WEEK = 7
const MS_PER_DAY = 86_400_000

/** Two decimals, so the same history twice produces the same text. */
const WEIGHT_PRECISION = 2

// ─────────────────────────────────────────────────────────────────────────────
// The read
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What §2 asks of the last session, before any rule looks at it.
 *
 * Every field answers `null` or zero honestly. A set logged without an RPE
 * still happened — it counts toward `workingSets` and toward rep completion —
 * so each measurement ignores what it cannot use rather than the row dropping
 * out of all of them (the same rule `anchors.ts` states for the candidate).
 */
export interface SessionRead {
  /** Working sets in the session, whatever they recorded. */
  readonly workingSets: number
  /** Median RPE of the sets that recorded one. Median, not mean (§2). */
  readonly medianRpe: number | null
  /** The RPE of the lowest-numbered set, when it recorded one. */
  readonly firstSetRpe: number | null
  /** Reps completed ÷ reps prescribed, over the sets that recorded both. */
  readonly repCompletion: number | null
  /** Sets that came in under their prescribed target. */
  readonly setsUnderTarget: number
  /** Sets that recorded both an actual and a target, so could be judged. */
  readonly setsWithTarget: number
  /** No judgeable set came in under target, and at least one was judgeable. */
  readonly allRepsCompleted: boolean
}

/**
 * The read of one exercise's working sets in one session.
 *
 * The caller slices the evidence — one exercise, one implement, one session —
 * exactly as `anchors.ts` does; nothing here re-groups, because a read across
 * two exercises is not a read of either.
 */
export function sessionRead(sets: readonly AnchorEvidenceRow[]): SessionRead {
  const rpes = sets.map((set) => set.rpe).filter((rpe): rpe is number => rpe !== null)

  let completed = 0
  let prescribed = 0
  let setsUnderTarget = 0
  let setsWithTarget = 0

  for (const set of sets) {
    if (set.actual_reps === null || set.prescribed_reps === null || set.prescribed_reps <= 0) {
      continue
    }
    setsWithTarget += 1
    completed += set.actual_reps
    prescribed += set.prescribed_reps
    if (set.actual_reps < set.prescribed_reps) setsUnderTarget += 1
  }

  return {
    workingSets: sets.length,
    medianRpe: median(rpes),
    firstSetRpe: firstSetRpe(sets),
    repCompletion: prescribed === 0 ? null : completed / prescribed,
    setsUnderTarget,
    setsWithTarget,
    // Per set, not in aggregate: a surplus on set 1 must not pay for a miss on
    // set 3. "All reps completed" is a claim about every set that made one.
    allRepsCompleted: setsWithTarget > 0 && setsUnderTarget === 0,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The table
// ─────────────────────────────────────────────────────────────────────────────

/** The eight rows of §2's table, named by what each one reads. */
export type ProgressionRuleId =
  | 'overshoot-ceiling'
  | 'overshoot-missed-reps'
  | 'overshoot-first-set'
  | 'too-light'
  | 'slightly-light'
  | 'on-target'
  | 'on-target-heavy'
  | 'ceiling'

/** What a row does to the load. Percentages differ by region (§2 sizing). */
export type LoadStep =
  | { readonly kind: 'hold' }
  | { readonly kind: 'increment'; readonly direction: 'up' | 'down'; readonly count: number }
  | {
      readonly kind: 'percent'
      readonly direction: 'up' | 'down'
      readonly upper: number
      readonly lower: number
    }

/** One row of §2's table, prose cells included so the two lists can be diffed. */
export interface ProgressionRule {
  readonly id: ProgressionRuleId
  /** The spec's "Last session read" cell. */
  readonly read: string
  /** The spec's "Interpretation" cell. */
  readonly interpretation: string
  /** The load half of the spec's "Next prescription" cell. */
  readonly load: LoadStep
  /** The rep half, when the row offers one. `0` means the row offers none. */
  readonly repDelta: number
  /** Rows that say "hold rep target" forbid the rep lever outright. */
  readonly holdsRepTarget: boolean
  /** Whether this row fires for a read. Evaluated in table order. */
  readonly matches: (read: SessionRead) => boolean
}

/**
 * §2's table, in evaluation order.
 *
 * The three overshoot rows come first because §2 says a first set at RPE ≥9 is
 * an overshoot regardless of the median, and because RPE 10 with reps missed
 * necessarily also satisfies the milder −5% rows it must not be shadowed by.
 * The five "all reps completed" rows follow, and their RPE bands are disjoint,
 * so their relative order carries no meaning.
 */
export const RULE_TABLE: readonly ProgressionRule[] = [
  {
    id: 'overshoot-ceiling',
    read: 'RPE 10, reps missed',
    interpretation: 'Overshoot',
    load: { kind: 'percent', direction: 'down', upper: 0.05, lower: 0.1 },
    repDelta: 0,
    holdsRepTarget: false,
    matches: (read) => read.medianRpe === 10 && read.setsUnderTarget > 0,
  },
  {
    id: 'overshoot-missed-reps',
    read: 'Any RPE, ≥1 rep missed on ≥half the sets',
    interpretation: 'Overshoot',
    load: { kind: 'percent', direction: 'down', upper: 0.05, lower: 0.05 },
    repDelta: 0,
    holdsRepTarget: false,
    // Half of the working sets, not half of the judgeable ones: a session where
    // one set of five recorded a target is not a session where 20% missed.
    matches: (read) => read.setsUnderTarget > 0 && read.setsUnderTarget * 2 >= read.workingSets,
  },
  {
    id: 'overshoot-first-set',
    read: 'First set already RPE ≥ 9',
    interpretation: 'Load wrong for set count',
    load: { kind: 'percent', direction: 'down', upper: 0.05, lower: 0.05 },
    repDelta: 0,
    holdsRepTarget: true,
    matches: (read) => read.firstSetRpe !== null && read.firstSetRpe >= 9,
  },
  {
    id: 'too-light',
    read: 'RPE ≤ 6, all reps completed',
    interpretation: 'Too light. Unambiguous.',
    load: { kind: 'percent', direction: 'up', upper: 0.05, lower: 0.1 },
    repDelta: 2,
    holdsRepTarget: false,
    matches: (read) => read.allRepsCompleted && read.medianRpe !== null && read.medianRpe <= 6,
  },
  {
    id: 'slightly-light',
    read: 'RPE 6.5–7, all reps completed',
    interpretation: 'Slightly light',
    load: { kind: 'increment', direction: 'up', count: 1 },
    repDelta: 1,
    holdsRepTarget: false,
    matches: (read) => read.allRepsCompleted && within(read.medianRpe, 6.5, 7),
  },
  {
    id: 'on-target',
    read: 'RPE 7.5–8.5, all reps completed',
    interpretation: 'On target',
    load: { kind: 'increment', direction: 'up', count: 1 },
    repDelta: 1,
    holdsRepTarget: false,
    matches: (read) => read.allRepsCompleted && within(read.medianRpe, 7.5, 8.5),
  },
  {
    id: 'on-target-heavy',
    read: 'RPE 9–9.5, all reps completed',
    interpretation: 'On target for heavy work',
    load: { kind: 'hold' },
    repDelta: 1,
    holdsRepTarget: false,
    matches: (read) => read.allRepsCompleted && within(read.medianRpe, 9, 9.5),
  },
  {
    id: 'ceiling',
    read: 'RPE 10, all reps completed',
    interpretation: 'At the ceiling',
    load: { kind: 'hold' },
    repDelta: 0,
    holdsRepTarget: true,
    matches: (read) => read.allRepsCompleted && read.medianRpe === 10,
  },
]

/**
 * The first row of §2's table that the read satisfies, or `null` when none
 * does.
 *
 * `null` is a real answer and not a gap to be papered over: a session with no
 * RPE recorded anywhere, or a median landing between two bands, has told us
 * nothing about the load, and the honest response is to repeat it rather than
 * to guess a direction.
 */
export function ruleFor(read: SessionRead): ProgressionRule | null {
  return RULE_TABLE.find((rule) => rule.matches(read)) ?? null
}

// ─────────────────────────────────────────────────────────────────────────────
// §5 — sparse history and stale history
// ─────────────────────────────────────────────────────────────────────────────

/** How much of a step §5 allows for the history that exists. */
export interface SparsePolicy {
  readonly confidence: SuggestionConfidence
  /** Multiplier on a percentage step. `0` is "no progression". */
  readonly stepScale: number
  /** Whether any upward step is allowed at all. */
  readonly progresses: boolean
}

/**
 * §5's session-count ladder: 0 answers nothing, 1 holds, 2 halves, 3+ is full
 * rules.
 *
 * The one-session exception — RPE ≤6 with all reps completed earns a single
 * increment — is not here, because it depends on which rule fired. It lives in
 * `progressionStep`, where both facts are in hand.
 */
export function sparsePolicy(sessionCount: number): SparsePolicy {
  if (sessionCount <= 0) return { confidence: 'none', stepScale: 0, progresses: false }
  if (sessionCount === 1) return { confidence: 'low', stepScale: 0, progresses: false }
  if (sessionCount === 2) return { confidence: 'medium', stepScale: 0.5, progresses: true }
  return { confidence: 'high', stepScale: 1, progresses: true }
}

/** What §5's staleness table does to an anchor, and to the session that uses it. */
export interface Staleness {
  readonly tier: StalenessTier
  /** Multiplier on the anchor. `0` when the anchor is discarded. */
  readonly factor: number
  /** The session's RPE cap, when the band imposes one. */
  readonly rpeCap: number | null
  /** 6–12 weeks: the anchor is rewritten from this session, not averaged. */
  readonly rewrites: boolean
}

/**
 * §5's decay, by weeks since the last logged session.
 *
 * Band edges belong to the *later* band — three weeks exactly is already
 * re-entry — and only strictly more than twelve weeks discards, which is what
 * the spec's `> 12` says. A negative interval (a session dated after "today",
 * which a clock skew can produce) is treated as fresh rather than as an error:
 * this function has no way to report one and no business inventing decay.
 */
export function stalenessOf(weeks: number): Staleness {
  if (weeks < 3) return { tier: 'fresh', factor: 1, rpeCap: null, rewrites: false }
  if (weeks < 6) {
    return { tier: 're_entry', factor: DECAY_RE_ENTRY, rpeCap: 8, rewrites: false }
  }
  if (weeks <= 12) {
    return { tier: 'recalibration', factor: DECAY_RECALIBRATION, rpeCap: 7, rewrites: true }
  }
  return { tier: 'discarded', factor: 0, rpeCap: null, rewrites: false }
}

/** Whole and fractional weeks between two `YYYY-MM-DD` dates, `from` first. */
export function weeksBetween(from: string, to: string): number {
  return (Date.parse(to) - Date.parse(from)) / (MS_PER_DAY * DAYS_PER_WEEK)
}

// ─────────────────────────────────────────────────────────────────────────────
// Equipment increments
// ─────────────────────────────────────────────────────────────────────────────

/**
 * §"Data needed": the increments, in code rather than in a table, for v1.
 *
 * Keyed by the catalog equipment ids `src/state/onboarding.ts` owns, because
 * `workout_exercises.equipment_used` is one of those strings. Anything absent
 * falls back to the barbell's step — an unknown implement is still loaded in
 * plates far more often than it is loaded in tenths of a pound.
 */
export const EQUIPMENT_INCREMENTS: Readonly<Record<string, Readonly<Record<WeightUnit, number>>>> =
  {
    barbell: { lb: 5, kg: 2.5 },
    dumbbells: { lb: 5, kg: 2 },
    kettlebells: { lb: 9, kg: 4 },
    cable_machine: { lb: 10, kg: 5 },
    leg_press: { lb: 10, kg: 5 },
    leg_curl_extension: { lb: 10, kg: 5 },
    hack_squat: { lb: 10, kg: 5 },
    assisted_pullup_dip: { lb: 10, kg: 5 },
  }

/** The fallback for an implement the table does not name. */
const DEFAULT_INCREMENT: Readonly<Record<WeightUnit, number>> = { lb: 5, kg: 2.5 }

/**
 * Implements that carry no external load, and so progress by reps or by density
 * rather than by weight (§"Data needed", and flag 3).
 */
const UNLOADED_EQUIPMENT: readonly string[] = [
  'bodyweight',
  'pullup_bar',
  'box',
  'battle_ropes',
  'resistance_bands',
  'foam_roller',
  'rowing_machine',
  'assault_bike',
]

/**
 * The kettlebells that exist, in kilograms and in the pound labels the same
 * bells are sold under. A kettlebell does not round to an increment — it snaps
 * to a bell on the rack, and suggesting 23 kg is suggesting a bell nobody owns.
 */
export const KETTLEBELL_LADDER: Readonly<Record<WeightUnit, readonly number[]>> = {
  kg: [8, 12, 16, 20, 24, 28, 32],
  lb: [18, 26, 35, 44, 53, 62, 70],
}

/**
 * The smallest load change `equipment` can express in `unit`, or `null` when it
 * cannot express one at all.
 *
 * A kettlebell's answer is the ladder's nominal gap: it is what an "add one
 * increment" rule means for a bell, and `snapLoad` then puts the result on a
 * rung that exists.
 */
export function incrementFor(equipment: string, unit: WeightUnit): number | null {
  if (UNLOADED_EQUIPMENT.includes(equipment)) return null
  return (EQUIPMENT_INCREMENTS[equipment] ?? DEFAULT_INCREMENT)[unit]
}

/**
 * `weight` on a load the equipment can actually be set to.
 *
 * `direction: 'down'` never rounds up, which is what the safety clamp needs — a
 * ceiling that rounds up is not a ceiling. Unloaded implements return the
 * weight untouched; there is nothing to snap it to.
 */
export function snapLoad(
  weight: number,
  equipment: string,
  unit: WeightUnit,
  direction: 'nearest' | 'down' = 'nearest',
): number {
  if (isKettlebell(equipment)) return snapToLadder(weight, KETTLEBELL_LADDER[unit], direction)

  const increment = incrementFor(equipment, unit)
  if (increment === null || increment <= 0) return round(weight)

  const steps =
    direction === 'down' ? Math.floor(weight / increment) : Math.round(weight / increment)

  return round(Math.max(steps, 0) * increment)
}

// ─────────────────────────────────────────────────────────────────────────────
// The step
// ─────────────────────────────────────────────────────────────────────────────

/** What the caller knows about the exercise the suggestion is for. */
export interface ProgressionContext {
  readonly goal: GoalPreset
  readonly region: MovementRegion
  /** §2's `balanced` goal needs it; every other goal ignores it. */
  readonly role?: LiftRole
  /** Sessions of history behind the anchor — §5's ladder reads this. */
  readonly sessionCount: number
}

/** A rule, resolved against the goal and the history that exists. */
export interface ProgressionStep {
  /** The row that fired, or `null` when none did. */
  readonly rule: ProgressionRuleId | null
  readonly load: LoadStep
  /** Reps added to the target, when reps are the lever the goal prefers. */
  readonly repDelta: number
  /** `read → action`, the sentence the "why this number" dialog shows (§UI 3). */
  readonly reason: string
}

const HOLD: LoadStep = { kind: 'hold' }

/**
 * §2's table and §2's goal modulation and §5's ladder, applied in that order.
 *
 * Backing off is exempt from all three: a downward row moves the load whatever
 * the goal prefers and however little history there is, because an overshoot is
 * the one read that a single session establishes beyond argument.
 */
export function progressionStep(
  read: SessionRead | null,
  context: ProgressionContext,
): ProgressionStep {
  if (context.goal === 'active_recovery') {
    return step(null, HOLD, 0, 'active recovery → no progression')
  }

  const rule = read === null ? null : ruleFor(read)
  if (rule === null) {
    return step(null, HOLD, 0, 'no rule fired → hold load')
  }

  if (isDownward(rule.load)) {
    return step(rule, rule.load, 0, `${rule.read} → ${loadText(rule.load, context.region)}`)
  }

  const policy = sparsePolicy(context.sessionCount)

  // §5's one-session exception: "too light" is the one read a single session
  // settles, so it earns one increment rather than the full percentage.
  if (context.sessionCount === 1) {
    if (rule.id !== 'too-light') {
      return step(rule, HOLD, 0, `${rule.read}, 1 session → hold load`)
    }
    const single: LoadStep = { kind: 'increment', direction: 'up', count: 1 }
    return step(rule, single, 0, `${rule.read}, 1 session → ${loadText(single, context.region)}`)
  }

  if (!policy.progresses) {
    return step(rule, HOLD, 0, `${rule.read}, no history → hold load`)
  }

  const lever = leverFor(context.goal, context.role)

  // Reps are the lever when the goal prefers them, and also when the goal
  // prefers load but the row offers none — RPE 9–9.5 holds the load and adds a
  // rep for every goal that progresses at all.
  const prefersReps = lever === 'reps' || (lever === 'load' && rule.load.kind === 'hold')
  if (prefersReps && rule.repDelta > 0 && !rule.holdsRepTarget) {
    return step(rule, HOLD, rule.repDelta, `${rule.read} → ${repText(rule.repDelta)}`)
  }

  if (lever === 'none') {
    return step(rule, HOLD, 0, `${rule.read}, conditioning → density, not load`)
  }

  const scaled = scaleStep(rule.load, policy.stepScale)

  return step(rule, scaled, 0, `${rule.read} → ${loadText(scaled, context.region)}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// The number
// ─────────────────────────────────────────────────────────────────────────────

/** The stored anchor, as much of it as a suggestion needs. */
export interface AnchorSnapshot {
  readonly value: number
  readonly unit: WeightUnit
  readonly sessionCount: number
  /** `YYYY-MM-DD` of the most recent session behind the anchor. */
  readonly lastSessionDate: string
}

/** Everything `suggestLoad` reads. No row is fetched; the caller brings them. */
export interface SuggestionInput {
  /** `null` when the exercise has no anchor at all — §5's zero-session row. */
  readonly anchor: AnchorSnapshot | null
  /** Today, `YYYY-MM-DD`, for the staleness bands. */
  readonly today: string
  /** The catalog equipment id the prescription names. */
  readonly equipment: string
  readonly targetReps: number
  /** Reps in reserve the intensity implies. `10 − target RPE`. */
  readonly targetRir: number
  readonly goal: GoalPreset
  readonly region: MovementRegion
  readonly role?: LiftRole
  /** The read of the last session, when there is one. */
  readonly lastSession?: SessionRead | null
  /** The heaviest working set actually logged in the last 8 weeks (§1 clamp). */
  readonly recentMax?: { readonly value: number; readonly unit: WeightUnit } | null
}

/** A number and everything that qualifies it. Never one without the other. */
export interface LoadSuggestion {
  /** `null` when no honest number exists: no history, or an anchor discarded. */
  readonly weight: number | null
  readonly unit: WeightUnit
  readonly confidence: SuggestionConfidence
  readonly sessionCount: number
  readonly rule: ProgressionRuleId | null
  readonly repDelta: number
  readonly staleness: StalenessTier
  /** The session's RPE cap, from staleness or from `active_recovery`. */
  readonly rpeCap: number | null
  /** Whether §1's 110% clamp bound the answer. */
  readonly clamped: boolean
  readonly reason: string
}

/**
 * §1's inversion: the load that puts `targetReps` at `targetRir` reps in
 * reserve, given the anchor.
 */
export function invertAnchor(anchor: number, targetReps: number, targetRir: number): number {
  return anchor / (1 + (targetReps + targetRir) / 30)
}

/**
 * The step applied to a weight. `increment` is the equipment's, and `null` —
 * an unloaded implement — leaves the weight alone.
 */
export function applyLoadStep(
  weight: number,
  step: LoadStep,
  region: MovementRegion,
  increment: number | null,
): number {
  if (step.kind === 'hold') return weight

  const sign = step.direction === 'up' ? 1 : -1

  if (step.kind === 'increment') {
    if (increment === null) return weight
    return Math.max(weight + sign * increment * step.count, 0)
  }

  const percent = region === 'lower' ? step.lower : step.upper

  return Math.max(weight * (1 + sign * percent), 0)
}

/**
 * §1's safety clamp: never more than 110% of the heaviest weight actually
 * logged for the exercise in the last eight weeks.
 *
 * The ceiling is snapped *down* to a load the equipment can be set to, so the
 * act of making the answer liftable cannot put it back above the ceiling.
 */
export function clampToRecentMax(
  weight: number,
  recentMax: number | null | undefined,
  equipment: string,
  unit: WeightUnit,
): { readonly weight: number; readonly clamped: boolean } {
  if (recentMax === null || recentMax === undefined || recentMax <= 0) {
    return { weight, clamped: false }
  }

  const ceiling = snapLoad(recentMax * SAFETY_CLAMP, equipment, unit, 'down')
  if (weight <= ceiling) return { weight, clamped: false }

  return { weight: ceiling, clamped: true }
}

/**
 * The whole pipeline, in the order the requirement states it: the anchor,
 * decayed for staleness, inverted at the prescription, stepped by the rule that
 * fired, snapped to the equipment's increment, clamped to 110% of the recent
 * logged max — and never returned without the confidence that qualifies it.
 */
export function suggestLoad(input: SuggestionInput): LoadSuggestion {
  const { anchor, equipment, goal, region, role } = input
  const unit = anchor?.unit ?? 'lb'
  const sessionCount = anchor?.sessionCount ?? 0
  const context: ProgressionContext = { goal, region, role, sessionCount }
  const step = progressionStep(input.lastSession ?? null, context)

  if (anchor === null || sessionCount <= 0 || anchor.value <= 0) {
    return {
      ...blank(unit, 0, step),
      staleness: 'fresh',
      reason: 'no logged history → no weight suggested',
    }
  }

  const staleness = stalenessOf(weeksBetween(anchor.lastSessionDate, input.today))
  const policy = sparsePolicy(sessionCount)

  if (staleness.tier === 'discarded') {
    return {
      ...blank(unit, sessionCount, step),
      confidence: 'none',
      staleness: staleness.tier,
      reason: 'last logged over 12 weeks ago → anchor discarded',
    }
  }

  const increment = incrementFor(equipment, unit)
  if (increment === null) {
    return {
      ...blank(unit, sessionCount, step),
      confidence: policy.confidence,
      staleness: staleness.tier,
      rpeCap: staleness.rpeCap,
      reason: 'bodyweight movement → progress by reps, not load',
    }
  }

  const decayed = anchor.value * staleness.factor
  const inverted = invertAnchor(decayed, input.targetReps, input.targetRir)
  const stepped = applyLoadStep(inverted, step.load, region, increment)

  // §2: if rounding erases an upward step, force one increment. The percentage
  // is advisory; the increment is the reality on a 315 lb deadlift.
  const snapped = forceUp(
    snapLoad(stepped, equipment, unit),
    snapLoad(inverted, equipment, unit),
    step.load,
    equipment,
    unit,
    increment,
  )

  // §2: an active-recovery day prescribes at most 60% of the anchor, and is
  // excluded from anchor updates elsewhere — a light day is not new capacity.
  const capped =
    goal === 'active_recovery'
      ? Math.min(snapped, snapLoad(decayed * ACTIVE_RECOVERY_CAP, equipment, unit, 'down'))
      : snapped

  const clamp = clampToRecentMax(capped, recentMaxIn(input, unit), equipment, unit)

  return {
    weight: round(clamp.weight),
    unit,
    confidence: policy.confidence,
    sessionCount,
    rule: step.rule,
    repDelta: step.repDelta,
    staleness: staleness.tier,
    rpeCap: goal === 'active_recovery' ? ACTIVE_RECOVERY_RPE_CAP : staleness.rpeCap,
    clamped: clamp.clamped,
    reason: clamp.clamped ? `${step.reason}, clamped to 110% of the 8-week max` : step.reason,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Internals
// ─────────────────────────────────────────────────────────────────────────────

/** The middle value, or the mean of the middle two. `null` over nothing. */
function median(values: readonly number[]): number | null {
  if (values.length === 0) return null

  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)

  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

/** The RPE of the lowest-numbered set, which is the one §2 calls "set 1". */
function firstSetRpe(sets: readonly AnchorEvidenceRow[]): number | null {
  let first: AnchorEvidenceRow | null = null

  for (const set of sets) {
    if (first === null || set.set_number < first.set_number) first = set
  }

  return first?.rpe ?? null
}

/** Inclusive on both ends, and `false` for an RPE that was never recorded. */
function within(value: number | null, low: number, high: number): boolean {
  return value !== null && value >= low && value <= high
}

function isDownward(step: LoadStep): boolean {
  return step.kind !== 'hold' && step.direction === 'down'
}

/** §2's goal table, as which lever progress uses. */
function leverFor(goal: GoalPreset, role: LiftRole | undefined): 'load' | 'reps' | 'none' {
  switch (goal) {
    case 'strength':
      return 'load'
    case 'hypertrophy':
      return 'reps'
    case 'conditioning':
      return 'none'
    case 'balanced':
      return role === 'accessory' ? 'reps' : 'load'
    case 'active_recovery':
      return 'none'
  }
}

/** §5's half step. A percentage halves; a plate cannot. */
function scaleStep(step: LoadStep, scale: number): LoadStep {
  if (step.kind !== 'percent' || scale === 1) return step

  return { ...step, upper: step.upper * scale, lower: step.lower * scale }
}

function step(
  rule: ProgressionRule | null,
  load: LoadStep,
  repDelta: number,
  reason: string,
): ProgressionStep {
  return { rule: rule?.id ?? null, load, repDelta, reason }
}

/** `+5%`, `+1 increment`, `hold load` — the action half of a reason. */
function loadText(load: LoadStep, region: MovementRegion): string {
  if (load.kind === 'hold') return 'hold load'

  const sign = load.direction === 'up' ? '+' : '−'
  if (load.kind === 'increment') {
    return `${sign}${load.count} increment${load.count === 1 ? '' : 's'}`
  }

  const percent = (region === 'lower' ? load.lower : load.upper) * 100

  return `${sign}${round(percent)}%`
}

function repText(repDelta: number): string {
  return `+${repDelta} rep${repDelta === 1 ? '' : 's'}`
}

/** §2's forced increment, when snapping erased an upward step. */
function forceUp(
  snapped: number,
  base: number,
  load: LoadStep,
  equipment: string,
  unit: WeightUnit,
  increment: number,
): number {
  if (load.kind === 'hold' || load.direction !== 'up') return snapped
  if (snapped > base) return snapped

  return snapLoad(base + increment, equipment, unit)
}

function isKettlebell(equipment: string): boolean {
  return equipment === 'kettlebells'
}

/** The nearest rung, or the highest rung at or below the weight. */
function snapToLadder(
  weight: number,
  ladder: readonly number[],
  direction: 'nearest' | 'down',
): number {
  if (direction === 'down') {
    const below = ladder.filter((rung) => rung <= weight)
    return below.length === 0 ? ladder[0] : below[below.length - 1]
  }

  return ladder.reduce((best, rung) =>
    Math.abs(rung - weight) < Math.abs(best - weight) ? rung : best,
  )
}

/** The clamp's maximum, expressed in the anchor's unit. */
function recentMaxIn(input: SuggestionInput, unit: WeightUnit): number | null {
  const max = input.recentMax
  if (max === null || max === undefined) return null

  return convertWeight(max.value, max.unit, unit)
}

/** A suggestion with no number in it, still carrying everything else. */
function blank(
  unit: WeightUnit,
  sessionCount: number,
  step: ProgressionStep,
): LoadSuggestion {
  return {
    weight: null,
    unit,
    confidence: sparsePolicy(sessionCount).confidence,
    sessionCount,
    rule: step.rule,
    repDelta: step.repDelta,
    staleness: 'fresh',
    rpeCap: null,
    clamped: false,
    reason: step.reason,
  }
}

/** Two decimal places, so the same input twice produces the same text. */
function round(value: number): number {
  const factor = 10 ** WEIGHT_PRECISION
  return Math.round(value * factor) / factor
}
