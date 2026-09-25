/**
 * OVR-02 — the deterministic half after the model, part two: the loads.
 *
 * §"Generation Impact" states the architecture in one sentence — *the AI doesn't
 * do arithmetic* — and this module is the second half of it. The first half is
 * `training-history.ts`, which tells the model what it is allowed to know about
 * the user's capacity (labels, never numbers). This half takes the composition
 * that came back and fills in the number for every prescribed exercise the user
 * has an anchor for.
 *
 * It computes nothing of its own. §1's inversion, §2's step, §5's decay, the
 * equipment increment and the 110% safety clamp are all `progression.ts`'s and
 * are called rather than restated, because a second copy of the anchor rules
 * would be a second answer to "what should this weigh" and the Review screen
 * (OVR-01c) reads the first one. What is decided *here* is only what the model's
 * output does not say and the rules need:
 *
 *   * **Which prescriptions get a load at all.** A rep target, a loadable
 *     implement, an anchor for that exact exercise-and-implement pair, and a
 *     session function that is actually working sets. A warmup drill and a
 *     cooldown stretch are prescribed at the anchor by nobody.
 *   * **Which rep target to invert at.** The top of a range and the longest rung
 *     of a ladder, never the bottom. Both directions are defensible as
 *     programming; only one of them is safe when it is wrong, because the top of
 *     the range is the lighter answer.
 *   * **The target RIR.** §"Generation Impact" says "implied by intensity and
 *     effort_percent". Contract 4.1 replaced `effort_percent` with
 *     `load_type`/`load_value`, so an explicit `rir` from the model is honoured —
 *     it is a prescription field and not a weight — and otherwise the effective
 *     intensity decides, through the same five bands the system prompt's LOAD
 *     GUIDANCE uses.
 *   * **What the directive does to the number.** §4's deload multiplies the
 *     anchor by 0.85 and caps RPE at 7; §5's re-entry caps at 8. Set counts are
 *     the model's to reduce — they are composition, and the prompt carries the
 *     multiplier — but a cap on effort is a cap on the load, and that lands here.
 *
 * Nothing here mutates the model's output. The fill is returned as its own list,
 * keyed to the site it belongs to, so `CONTRACT_VERSION` does not move for a
 * field the model never sends: `weight_suggested` is the app's column, written
 * beside the prescription rather than into the contract.
 *
 * Spec: `docs/specs/OVR-01_progressive-overload.md` §"Generation Impact"
 * (post-generation), §4 (deload), §5 (sparse and stale).
 */

import type { Candidate, SectionType } from '../../../src/data/candidates.ts'
import type { Enums } from '../../../src/data/database.types.ts'
import type { WeightUnit } from '../../../src/state/anchors.ts'
import {
  suggestLoad,
  type LiftRole,
  type MovementRegion,
  type ProgressionRuleId,
  type SessionRead,
  type SuggestionConfidence,
} from '../../../src/state/progression.ts'
import type { GenerationOutput, Prescription } from '../../../src/state/schemas.ts'
import type { PromptInput } from './prompt.ts'
import {
  DELOAD_RPE_CAP as DELOAD_CAP,
  RE_ENTRY_RPE_CAP as RE_ENTRY_CAP,
  type SessionDirective,
} from './training-history.ts'
import type { PrescriptionSite } from './validate.ts'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * §4: "Load anchors × 0.85 for suggestions". Applied to the anchor rather than to
 * the suggestion, so the step, the snap and the clamp all run against the
 * deloaded capacity instead of being reduced after they have already agreed on a
 * plate.
 */
export const DELOAD_ANCHOR_FACTOR = 0.85

/**
 * §4's hard RPE ceiling on a deload, and §5's on a re-entry session. Both are
 * declared in `training-history.ts` — the prompt states them to the model and the
 * fill applies them to the number, and two constants would be two answers.
 */
export { DELOAD_RPE_CAP, RE_ENTRY_RPE_CAP } from './training-history.ts'

/**
 * The target RPE each intensity band is composed at, and so the reps in reserve
 * the load is inverted at: `RIR = 10 − target RPE`.
 *
 * The bands are the system prompt's own — LOAD GUIDANCE names five of them, 1–2
 * through 9–10 — so the table is a restatement of the prompt's intent in the
 * units the anchor rules need, rather than a sixth opinion about intensity. It is
 * a table and not a formula because the bands are not evenly spaced in effort:
 * the difference between 7 and 8 is one rep in reserve, and the difference
 * between 1 and 2 is nothing at all.
 */
export const INTENSITY_TARGET_RPE: readonly number[] = [
  // index 0 is unused; intensity is 1–10 and the database constrains it to that.
  0, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9,
]

/** The reps in reserve an intensity implies, through the table above. */
export function targetRirFor(intensity: number): number {
  const clamped = Math.min(Math.max(Math.round(intensity), 1), INTENSITY_TARGET_RPE.length - 1)
  return 10 - INTENSITY_TARGET_RPE[clamped]
}

/**
 * The session functions that are working sets. Warmup prep, conditioning pieces
 * and recovery work are prescribed by shape rather than at a fraction of a
 * maximum: a mobility drill has no anchor, and a conditioning round's progression
 * is density (OVR-03), not load.
 */
const LOADED_FUNCTIONS: readonly Prescription['session_function'][] = [
  'primary',
  'accessory',
  'balance',
  'core',
]

/**
 * §2's step sizes differ for upper and lower body, and nothing in the catalog
 * says which an exercise is — the gap OVR-01b recorded rather than invented past.
 * The two movement patterns that unambiguously answer it do so here; everything
 * else takes `upper`, which is the smaller percentage step and therefore the
 * conservative reading of a fact we do not have.
 */
const LOWER_BODY_PATTERNS: readonly Enums<'movement_pattern'>[] = ['squat', 'hinge']

export function regionOf(candidate: Candidate | undefined): MovementRegion {
  const patterns = candidate?.primaryPatterns.length
    ? candidate.primaryPatterns
    : (candidate?.patterns ?? [])

  return patterns.some((pattern) => LOWER_BODY_PATTERNS.includes(pattern)) ? 'lower' : 'upper'
}

/** §2's `balanced` goal reads this; every other goal ignores it. */
export function roleOf(prescription: Prescription): LiftRole {
  return prescription.session_function === 'primary' ? 'primary' : 'accessory'
}

// ─────────────────────────────────────────────────────────────────────────────
// What the fill is given
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One anchored exercise-and-implement pair, as much of it as the rules read. The
 * caller brings these — `load_anchors` for the anchor, `anchor_evidence` for the
 * last session and the recent maximum — and nothing here fetches a row.
 */
export interface AnchorFact {
  readonly exerciseId: string
  readonly equipmentUsed: string
  /** The stored anchor. `value` is the table's `anchor_value`, in `unit`. */
  readonly value: number
  readonly unit: WeightUnit
  readonly sessionCount: number
  /** `YYYY-MM-DD` of the most recent session behind the anchor. */
  readonly lastSessionDate: string
  /** The read of that session's working sets, where the caller has it (§2). */
  readonly lastSession?: SessionRead | null
  /** The heaviest working set actually logged in the last 8 weeks (§1's clamp). */
  readonly recentMax?: { readonly value: number; readonly unit: WeightUnit } | null
}

/** Everything the fill needs that is not in the workout or the prompt input. */
export interface FillContext {
  readonly anchors: readonly AnchorFact[]
  /** Today, `YYYY-MM-DD`, for §5's staleness bands. */
  readonly today: string
  /**
   * The directive the session was composed under. Defaults to the one the prompt
   * carried, so a caller cannot fill loads under a directive the model never saw.
   */
  readonly directive?: SessionDirective
}

/**
 * One filled prescription: where it is, what the app will store, and every
 * qualifier the number is never allowed to travel without.
 *
 * `weight_suggested` and `weight_suggested_unit` are named as the columns rather
 * than as domain fields because that is the only thing this record is for — the
 * persistence half writes them verbatim, and a rename on the way would be a name
 * two sides have to agree about twice.
 */
export interface FilledLoad {
  readonly site: PrescriptionSite
  readonly exerciseId: string
  readonly equipment: string
  /** `null` where no honest number exists — §5's zero-session and discarded rows. */
  readonly weight_suggested: number | null
  readonly weight_suggested_unit: WeightUnit | null
  readonly confidence: SuggestionConfidence
  readonly sessionCount: number
  /** The rep target the load was inverted at. */
  readonly targetReps: number
  /** The reps in reserve that target was inverted at. */
  readonly targetRir: number
  /** Which row of §2's table fired, or `null` when none did. */
  readonly rule: ProgressionRuleId | null
  /** The session's RPE ceiling, from the directive or from staleness. */
  readonly rpeCap: number | null
  /** Whether §1's 110% clamp bound the answer. */
  readonly clamped: boolean
  /** `read → action`, the sentence OVR-01c's "why this number" dialog shows. */
  readonly reason: string
}

// ─────────────────────────────────────────────────────────────────────────────
// The rep target
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The reps a load is inverted at, or `null` when the prescription has no rep
 * target to invert — a timed or distance piece, which progresses by density.
 *
 * A range answers with its top and a ladder with its longest rung. Both are the
 * lighter of the two available answers, which is the whole argument: an
 * over-suggestion is the failure mode that hurts somebody, and double
 * progression's own mechanism is to earn the top of the band and then add load.
 */
export function targetRepsOf(prescription: Prescription): number | null {
  if (prescription.modality !== 'reps') return null

  switch (prescription.target_kind) {
    case 'fixed':
      return prescription.target_value
    case 'range':
      return prescription.target_max
    case 'sequence':
      return Math.max(...prescription.target_sequence)
  }
}

/**
 * The reps in reserve, from the model's own `rir` where it gave one and from the
 * effective intensity otherwise, then floored by whichever cap the directive
 * imposes.
 *
 * A cap raises the *floor* on reps in reserve, never lowers it: a deload's RPE 7
 * ceiling means at least three reps left, and a session already prescribed at
 * four is not pushed up to meet it.
 */
export function resolveTargetRir(
  prescription: Prescription,
  intensity: number,
  directive: SessionDirective,
): { readonly rir: number; readonly rpeCap: number | null } {
  const stated =
    prescription.load_type === 'rir' && prescription.load_value !== null
      ? prescription.load_value
      : targetRirFor(intensity)

  const rpeCap =
    directive === 'deload' ? DELOAD_CAP : directive === 're_entry' ? RE_ENTRY_CAP : null

  return { rir: rpeCap === null ? stated : Math.max(stated, 10 - rpeCap), rpeCap }
}

// ─────────────────────────────────────────────────────────────────────────────
// The fill
// ─────────────────────────────────────────────────────────────────────────────

const key = (exerciseId: string, equipment: string) => `${exerciseId} ${equipment}`

function anchorIndex(facts: readonly AnchorFact[]): ReadonlyMap<string, AnchorFact> {
  const index = new Map<string, AnchorFact>()
  for (const fact of facts) {
    index.set(key(fact.exerciseId, fact.equipmentUsed), fact)
  }
  return index
}

function candidateIndex(
  input: PromptInput,
): ReadonlyMap<SectionType, ReadonlyMap<string, Candidate>> {
  const index = new Map<SectionType, Map<string, Candidate>>()

  for (const section of input.sections) {
    const existing = index.get(section.section) ?? new Map<string, Candidate>()
    for (const candidate of section.candidates) {
      if (!existing.has(candidate.exerciseId)) existing.set(candidate.exerciseId, candidate)
    }
    index.set(section.section, existing)
  }

  return index
}

/**
 * Every prescription the app can honestly put a number on, with the number.
 *
 * One entry per *anchored* site, and no entry for the rest: §"Generation Impact"
 * says "for each generated exercise that has an anchor", and a list carrying an
 * entry for every warmup drill would make the absence of a suggestion look like a
 * suggestion of nothing. An anchored site whose rules produce no honest number
 * *is* in the list, with `weight_suggested: null` and the reason why — that is
 * §5's contamination principle, and the reason is what OVR-01c renders instead of
 * the number.
 */
export function fillSuggestedLoads(
  workout: GenerationOutput,
  input: PromptInput,
  context: FillContext,
): readonly FilledLoad[] {
  const anchors = anchorIndex(context.anchors)
  const candidates = candidateIndex(input)
  const directive = context.directive ?? input.training.directive
  const { goal, effectiveIntensity: intensity } = input.request
  const filled: FilledLoad[] = []

  workout.sections.forEach((section, sectionIndex) => {
    section.blocks.forEach((block, blockIndex) => {
      block.exercises.forEach((exercise, exerciseIndex) => {
        const fact = anchors.get(key(exercise.exercise_id, exercise.equipment))
        if (!fact) return
        if (!LOADED_FUNCTIONS.includes(exercise.session_function)) return

        const targetReps = targetRepsOf(exercise)
        if (targetReps === null) return

        const { rir, rpeCap } = resolveTargetRir(exercise, intensity, directive)

        const suggestion = suggestLoad({
          anchor: {
            value: directive === 'deload' ? fact.value * DELOAD_ANCHOR_FACTOR : fact.value,
            unit: fact.unit,
            sessionCount: fact.sessionCount,
            lastSessionDate: fact.lastSessionDate,
          },
          today: context.today,
          equipment: exercise.equipment,
          targetReps,
          targetRir: rir,
          goal,
          region: regionOf(candidates.get(section.section_type)?.get(exercise.exercise_id)),
          role: roleOf(exercise),
          lastSession: fact.lastSession ?? null,
          recentMax: fact.recentMax ?? null,
        })

        filled.push({
          site: {
            sectionIndex,
            blockIndex,
            exerciseIndex,
            sectionType: section.section_type,
          },
          exerciseId: exercise.exercise_id,
          equipment: exercise.equipment,
          weight_suggested: suggestion.weight,
          weight_suggested_unit: suggestion.weight === null ? null : suggestion.unit,
          confidence: suggestion.confidence,
          sessionCount: suggestion.sessionCount,
          targetReps,
          targetRir: rir,
          rule: suggestion.rule,
          // The stricter of the two ceilings: the directive's, and whatever §5's
          // staleness band imposed on this particular anchor.
          rpeCap: strictest(rpeCap, suggestion.rpeCap),
          clamped: suggestion.clamped,
          reason:
            directive === 'deload'
              ? `deload → anchor × ${DELOAD_ANCHOR_FACTOR}, ${suggestion.reason}`
              : suggestion.reason,
        })
      })
    })
  })

  return filled
}

/** The lower of two RPE ceilings, ignoring the absent ones. */
function strictest(left: number | null, right: number | null): number | null {
  if (left === null) return right
  if (right === null) return left
  return Math.min(left, right)
}

/**
 * What the persistence half writes onto `workout_exercises`, and nothing else.
 * Kept as its own projection so a column list lives in one place rather than
 * being spelled out at every insert.
 */
export function suggestedLoadFields(
  load: FilledLoad,
): Readonly<Record<string, number | string | null>> {
  return {
    weight_suggested: load.weight_suggested,
    weight_suggested_unit: load.weight_suggested_unit,
  }
}

/**
 * The fill as a log line's fields — counts, never a weight and never an exercise
 * id. How many sites were anchored, how many produced a number, how many were
 * bound by the clamp, and under which directive. Enough to see the fill working
 * without narrating a user's session into a log.
 */
export function fillFields(
  loads: readonly FilledLoad[],
  directive: SessionDirective,
): Record<string, unknown> {
  return {
    directive,
    anchored: loads.length,
    suggested: loads.filter((load) => load.weight_suggested !== null).length,
    clamped: loads.filter((load) => load.clamped).length,
    lowConfidence: loads.filter((load) => load.confidence === 'low').length,
  }
}
