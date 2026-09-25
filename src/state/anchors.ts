/**
 * OVR-01a — what a load anchor is, as arithmetic.
 *
 * The anchor is CLEAR's stored estimate of a one-rep max, and it is never
 * tested: it is computed from sets the user actually performed, which is the
 * whole reason a personal tool can autoregulate at all. This module is that
 * computation and nothing else. It reads a list of evidence rows and answers
 * the rows that belong in `load_anchors` — no client, no fetch, no React, and
 * no knowledge of when it is called.
 *
 * The split with SQL is deliberate and mirrors SES-01c's streak.
 * `anchor_evidence()` owns which sets are *allowed* to count — working sets
 * only, no deload, no active recovery, no bodyweight, and the prescribed target
 * read through the join to the immutable prescription row. Those are facts
 * about rows, and a screen must not be able to reproduce them differently. What
 * lives here is everything §1 states as a formula, because a formula with a
 * clamp, a unit conversion and a weighting is a set of branches that deserves a
 * test each rather than a paragraph of SQL nobody can execute on a pull
 * request.
 *
 * Three decisions this module makes, stated once here because each of them is
 * load-bearing and none of them is obvious:
 *
 *   * **The anchor's unit is the evidence's unit, never the profile's.** The
 *     unit of the most recent working set that contributed is the unit the
 *     anchor is expressed in, and every older set is converted into it before
 *     anything is compared. DATA-01d stamps a unit per set log precisely so a
 *     changed profile default cannot reinterpret history; an anchor that took
 *     its unit from the profile would reintroduce exactly that at one remove —
 *     the same row would silently mean a different weight. It also keeps
 *     recomputation idempotent, which a mutable setting would not.
 *   * **A measurement is skipped, not a set.** §1 skips a set with no RPE or no
 *     weight for the e1RM candidate, but rep completion has a different
 *     denominator and a set performed without an RPE still happened. So each
 *     answer ignores what it cannot use rather than the row ignoring both.
 *   * **Absence answers absence.** An exercise whose evidence yields no
 *     candidate produces no anchor row — not a zero, and not a row with a null
 *     in it. `load_anchors_value_positive` says the same thing in SQL.
 *
 * Spec: `docs/specs/OVR-01_progressive-overload.md` §1, with the confidence
 * ladder from §5. The rules that *read* an anchor — the RPE table, the
 * suggested weight, the staleness decay — are OVR-01b's and are deliberately
 * not here: this requirement only learns.
 */

import type { AnchorEvidenceRow, LoadAnchorInput } from './schemas'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pounds in a kilogram, to the precision the definition has. Conversion is
 * lossless in one direction and rounded in the other, so it is applied to the
 * weights and never to the anchor twice — an anchor is converted at most once,
 * on its way into the unit its most recent evidence was logged in.
 */
export const LB_PER_KG = 2.20462262185

/**
 * §1: effective reps clamp at 12. Epley degrades badly above that — a 20-rep
 * set says far more about work capacity than about a maximum — so the set still
 * contributes and the anchor it contributed to drops one confidence level.
 */
export const EFFECTIVE_REPS_CAP = 12

/**
 * §5: the anchor is a weighted average of the last three session anchors, most
 * recent first. Fewer than three renormalises over what exists, so two sessions
 * are 0.625/0.375 rather than an unexplained 0.8 of an answer.
 */
export const SMOOTHING_WEIGHTS = [0.5, 0.3, 0.2] as const

/** Cents of a pound or a kilogram. Rounded so two runs cannot differ in noise. */
const ANCHOR_PRECISION = 2

/**
 * Separates the two halves of a grouping key. A NUL, because no slug contains
 * one, so no pair of ids can collide into a third key. Built with
 * `String.fromCharCode` rather than written into a template literal: a raw NUL
 * in the source makes the file binary to git, grep and every review tool.
 */
const KEY_SEPARATOR = String.fromCharCode(0)

// ─────────────────────────────────────────────────────────────────────────────
// Domain
// ─────────────────────────────────────────────────────────────────────────────

export type WeightUnit = AnchorEvidenceRow['weight_unit']

/**
 * One session's best expression of capacity for one exercise-and-equipment
 * pair, in the unit given to `sessionAnchors`.
 *
 * `repCompletion` rides along rather than being computed somewhere else later:
 * it is the join's whole purpose, and OVR-01b's rule table reads it from here
 * rather than re-deriving it from rows it would have to re-fetch.
 */
export interface SessionAnchor {
  readonly sessionId: string
  readonly exerciseId: string
  readonly equipmentUsed: string
  /** The session's training day, `YYYY-MM-DD`. */
  readonly date: string
  /** The highest e1RM candidate the session produced. */
  readonly value: number
  readonly unit: WeightUnit
  /**
   * Whether the best candidate needed the 12-rep clamp. A clamped session still
   * counts; it costs the anchor one level of confidence (§1).
   */
  readonly clamped: boolean
  /**
   * Reps completed ÷ reps prescribed across the working sets that recorded
   * both. `null` when nothing in the session recorded both, which is not the
   * same as zero and must not be rendered as one.
   */
  readonly repCompletion: number | null
}

/** The key a `load_anchors` row is stored under: one lift, one implement. */
export interface AnchorKey {
  readonly exerciseId: string
  readonly equipmentUsed: string
}

// ─────────────────────────────────────────────────────────────────────────────
// The formulas
// ─────────────────────────────────────────────────────────────────────────────

/** `weight` expressed in `to`. Identity when the units already agree. */
export function convertWeight(weight: number, from: WeightUnit, to: WeightUnit): number {
  if (from === to) return weight
  return from === 'kg' ? weight * LB_PER_KG : weight / LB_PER_KG
}

/**
 * `reps_completed + (10 − rpe)`, clamped at 12 — reps in reserve added to reps
 * performed, which is what makes one set at RPE 8 comparable to another at
 * RPE 10 (§1).
 *
 * Returns the clamped value and whether clamping happened, because the caller
 * needs both: one feeds Epley, the other feeds confidence.
 */
export function effectiveReps(reps: number, rpe: number): {
  readonly value: number
  readonly clamped: boolean
} {
  const raw = reps + (10 - rpe)
  return { value: Math.min(raw, EFFECTIVE_REPS_CAP), clamped: raw > EFFECTIVE_REPS_CAP }
}

/**
 * Epley over effective reps: `weight × (1 + effective_reps / 30)`.
 *
 * `null` when the set cannot answer — no weight, no RPE, no recorded reps, or a
 * weight of zero, which is a bodyweight set that reached this far by some other
 * route and is not evidence of a load.
 */
export function e1rmCandidate(set: {
  readonly weight: number | null
  readonly rpe: number | null
  readonly actual_reps: number | null
}): { readonly value: number; readonly clamped: boolean } | null {
  const { weight, rpe, actual_reps: reps } = set
  if (weight === null || rpe === null || reps === null) return null
  if (weight <= 0) return null

  const effective = effectiveReps(reps, rpe)

  return { value: weight * (1 + effective.value / 30), clamped: effective.clamped }
}

/**
 * Reps completed against reps prescribed, over the sets that recorded both.
 *
 * Computed, never parsed: `prescribed_reps` arrives from the prescription row
 * the log is attached to (`anchor_evidence`), so a rep target is read from the
 * row that asked for it rather than from a string somebody wrote. A set with no
 * recorded reps is left out of both halves — "not recorded" is not "zero" — and
 * a set with no prescribed target has nothing to be completed against.
 */
export function repCompletion(sets: readonly AnchorEvidenceRow[]): number | null {
  let completed = 0
  let prescribed = 0

  for (const set of sets) {
    if (set.actual_reps === null || set.prescribed_reps === null) continue
    if (set.prescribed_reps <= 0) continue
    completed += set.actual_reps
    prescribed += set.prescribed_reps
  }

  return prescribed === 0 ? null : completed / prescribed
}

// ─────────────────────────────────────────────────────────────────────────────
// Derivation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The per-session anchors in `evidence`, oldest first, for one exercise and one
 * implement at a time.
 *
 * The unit is decided once per key — the unit of the most recently logged
 * contributing set — and every candidate is converted into it, so a user who
 * switched from pounds to kilograms mid-history gets one coherent number rather
 * than a maximum taken across two scales.
 */
export function sessionAnchors(evidence: readonly AnchorEvidenceRow[]): SessionAnchor[] {
  const anchors: SessionAnchor[] = []

  for (const [, sets] of groupBy(evidence, keyOf)) {
    const unit = anchorUnit(sets)

    for (const [, sessionSets] of groupBy(sets, (set) => set.session_id)) {
      const best = bestCandidate(sessionSets, unit)
      if (best === null) continue

      const [first] = sessionSets

      anchors.push({
        sessionId: first.session_id,
        exerciseId: first.exercise_id,
        equipmentUsed: first.equipment_used,
        date: first.session_date,
        value: best.value,
        unit,
        clamped: best.clamped,
        repCompletion: repCompletion(sessionSets),
      })
    }
  }

  return anchors.sort(byRecency)
}

/**
 * The `load_anchors` rows `evidence` supports, keyed order-independently: the
 * same history always produces the same list, which is the requirement's
 * idempotency stated as a property of this function rather than of the write.
 *
 * Sorted by exercise and then equipment so two runs produce an identical
 * payload byte for byte, not merely an equivalent one.
 */
export function deriveAnchors(evidence: readonly AnchorEvidenceRow[]): LoadAnchorInput[] {
  const anchors: LoadAnchorInput[] = []

  for (const [, sessions] of groupBy(sessionAnchors(evidence), (anchor) =>
    keyOf({ exercise_id: anchor.exerciseId, equipment_used: anchor.equipmentUsed }),
  )) {
    // Most recent first: the smoothing weights are stated that way, and so is
    // "the last three sessions".
    const recent = [...sessions].sort(byRecency).reverse()
    const contributing = recent.slice(0, SMOOTHING_WEIGHTS.length)
    const [newest] = recent

    anchors.push({
      exercise_id: newest.exerciseId,
      equipment_used: newest.equipmentUsed,
      anchor_value: round(smooth(contributing.map((session) => session.value))),
      unit: newest.unit,
      confidence: confidenceOf(
        sessions.length,
        contributing.some((session) => session.clamped),
      ),
      session_count: sessions.length,
      last_session_date: newest.date,
    })
  }

  return anchors.sort(
    (left, right) =>
      left.exercise_id.localeCompare(right.exercise_id) ||
      left.equipment_used.localeCompare(right.equipment_used),
  )
}

/**
 * §5's ladder: one session is low, two is medium, three or more is high —
 * dropped one level when the evidence needed the effective-rep clamp, because a
 * set of fifteen says less about a maximum than a set of five and the row
 * should admit it.
 */
export function confidenceOf(
  sessionCount: number,
  clamped = false,
): LoadAnchorInput['confidence'] {
  const ladder = ['low', 'medium', 'high'] as const
  const tier = Math.min(sessionCount, ladder.length) - 1
  const adjusted = Math.max(0, clamped ? tier - 1 : tier)

  return ladder[adjusted]
}

// ─────────────────────────────────────────────────────────────────────────────
// Internals
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `exercise_id` and `equipment_used` are one key; neither alone is a lift. The
 * separator is escaped rather than written literally: a raw NUL in the source
 * makes the file binary to git, grep and every review tool, for no gain over
 * the escape. It is a NUL because no slug can contain one, so no pair of ids
 * can collide into a third key.
 */
function keyOf(set: Pick<AnchorEvidenceRow, 'exercise_id' | 'equipment_used'>): string {
  return `${set.exercise_id}${KEY_SEPARATOR}${set.equipment_used}`
}

/** Oldest first, with the log clock breaking a tie inside one training day. */
function byRecency(left: SessionAnchor, right: SessionAnchor): number {
  return left.date.localeCompare(right.date) || left.sessionId.localeCompare(right.sessionId)
}

/**
 * The unit the most recently logged set carrying a weight was recorded in, and
 * the pounds default when none did — a key with no weighted set produces no
 * anchor anyway, so the fallback is never the unit of a stored row.
 */
function anchorUnit(sets: readonly AnchorEvidenceRow[]): WeightUnit {
  let latest: AnchorEvidenceRow | null = null

  for (const set of sets) {
    if (set.weight === null) continue
    if (latest === null || set.logged_at >= latest.logged_at) latest = set
  }

  return latest?.weight_unit ?? 'lb'
}

/** The session's highest candidate, expressed in `unit` (§1). */
function bestCandidate(
  sets: readonly AnchorEvidenceRow[],
  unit: WeightUnit,
): { value: number; clamped: boolean } | null {
  let best: { value: number; clamped: boolean } | null = null

  for (const set of sets) {
    const candidate = e1rmCandidate({
      ...set,
      weight: set.weight === null ? null : convertWeight(set.weight, set.weight_unit, unit),
    })
    if (candidate === null) continue
    if (best === null || candidate.value > best.value) best = candidate
  }

  return best
}

/** The weighted average, renormalised over however many sessions exist. */
function smooth(values: readonly number[]): number {
  const weights = SMOOTHING_WEIGHTS.slice(0, values.length)
  const total = weights.reduce((sum, weight) => sum + weight, 0)

  return values.reduce((sum, value, index) => sum + value * weights[index], 0) / total
}

/** Two decimal places, so an idempotent recomputation is idempotent in text. */
function round(value: number): number {
  const factor = 10 ** ANCHOR_PRECISION
  return Math.round(value * factor) / factor
}

/** Grouping that keeps first-seen order, so a derivation reads deterministically. */
function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>()

  for (const item of items) {
    const group = groups.get(key(item))
    if (group === undefined) groups.set(key(item), [item])
    else group.push(item)
  }

  return groups
}
