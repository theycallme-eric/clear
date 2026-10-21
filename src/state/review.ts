/**
 * REV-01 — the pre-workout briefing, derived from the acceptance payload and
 * from nothing else.
 *
 * Review reads one object: the `SessionAcceptance` that the Generate → Loading
 * journey assembled, which is the composed workout together with the facts it
 * was composed under. That choice is what makes the screen's three entry paths
 * one screen rather than three: a fresh generation, a regeneration and a
 * favourite restart differ in where the payload came from, not in what a
 * briefing is, and none of them hands this module anything it has to fetch.
 *
 * Three rules this derivation keeps, each of them an acceptance criterion:
 *
 *   · **The duration on screen is the effective target and only ever that.**
 *     There are three duration numbers in play and they mean different things:
 *     `effective_duration_target_mins` is what generation was *asked* to hit,
 *     `computed_duration_mins` is GEN-06's plausibility estimate of what it
 *     actually composed, and the composed workout's own `estimated` minutes are
 *     Claude's diagnostic guess. The last two exist to be compared against in
 *     review of generation quality; showing either to a user would state a
 *     measurement of a workout nobody has performed. So this module does not
 *     read them — `briefingDuration` takes the one number — and
 *     `review.test.ts` holds three distinct values apart to prove the other two
 *     never reach the screen.
 *   · **Structures and rep schemes are named by the shell's own vocabulary.**
 *     `structureIdentity` and `prescriptionText` are the same functions the
 *     workout screen performs a block with, reading a composed `WorkoutBlock`
 *     and `Prescription` through the structural types those modules now take.
 *     A briefing with its own idea of what `ladder_down` or `{8,10}` means is
 *     how a user reads one workout and performs a different one.
 *   · **Nothing is invented for a field that is absent.** A profile with no
 *     goal says so; a block with no clock shows no clock; an `absolute` load
 *     whose unit is not known is stated without one rather than in a unit
 *     guessed from a default.
 *   · **A section is named by its type, never by its generated title (REQ-011).**
 *     `sectionTypeLabel` is the one vocabulary Review and the workout share;
 *     `section_title` stays on the payload for compatibility and is read by
 *     nothing here. A block that groups movements — a superset, a circuit, a
 *     timed structure — states its round count once and its shared rest beside
 *     the group, and tempo leaves the prescription line for an optional
 *     per-section detail, where any prescribed cadence is still kept whole.
 *   · **No generated overview or section introduction is carried (REQ-010).**
 *     `workout.overview` and each `section_notes` stay on the payload —
 *     required, nullable, and still strings on legacy sessions — but the
 *     briefing has no field for either, so nothing built from it can show one.
 *     Block notes, labels and every prescription are kept. Restoration:
 *     `GENERATION_CONTRACT.md` §13.
 *
 * Pure and React-free, like `session-detail.ts` beside it — which is the same
 * shape of module for HIST-01, one session later.
 */
import type { Enums } from '../data/database.types'
import { formatFocus } from './history'
import { prescriptionSiteKey } from './load-suggestions'
import { sectionTypeLabel } from './onboarding'
import { exerciseName, prescriptionText, restText } from './prescription'
import type {
  Prescription,
  SessionAcceptance,
  WorkoutBlock,
  WorkoutSection,
} from './schemas'
import { structureIdentity, type StructureIdentity } from './workout-progress'

// ─────────────────────────────────────────────────────────────────────────────
// The view
// ─────────────────────────────────────────────────────────────────────────────

/** The unit a weight is stated in, when the profile has told us one. */
export type BriefingWeightUnit = Enums<'weight_unit'>

/** One prescription, as the briefing states it. */
export interface ReviewExerciseView {
  /** Stable within one briefing. Composed rows have no ids until acceptance. */
  readonly key: string
  readonly name: string
  /** `3 × 8 reps`, `5 rungs · 15-12-9-6-3 reps` — the structured target. */
  readonly prescription: string
  /** The equipment the prescription was composed for, in the user's words. */
  readonly equipment: string
  /** `75% 1RM`, `2 RIR`, `Bodyweight` — null when the guidance says nothing. */
  readonly load: string | null
  /** `Rest 90s`, or null. A zero rest is never rendered as one. */
  readonly rest: string | null
  /**
   * `3-1-1-0`, display only — never parsed, here or anywhere. Not rendered on
   * the prescription line: the section's `cadence` detail carries it.
   */
  readonly tempo: string | null
}

/** One block: what structure it is, and what is in it. */
export interface ReviewBlockView {
  readonly key: string
  /**
   * The shell's reading of the structure. A superset whose rounds are its
   * members' shared set count carries that count as its `detail`, the same
   * `N ROUNDS` a circuit already does, so the round count is said once.
   */
  readonly identity: StructureIdentity
  /**
   * True for every structure but `standard`: its movements are performed as
   * one group, in order, and the briefing frames and numbers them as one.
   */
  readonly grouped: boolean
  /** The rounds the group is performed for, when the block says how many. */
  readonly rounds: number | null
  readonly notes: string | null
  /** `Rest 90s between rounds` — the group's shared rest, stated beside it. */
  readonly roundRest: string | null
  /** In prescribed order: the order the array holds is the order performed. */
  readonly exercises: readonly ReviewExerciseView[]
}

/** One movement's prescribed cadence, for the optional tempo detail. */
export interface ReviewCadence {
  readonly key: string
  readonly name: string
  readonly tempo: string
}

/** One section of the workout, in the order it will be performed. */
export interface ReviewSectionView {
  readonly key: string
  /** The stable label of `type` (`sectionTypeLabel`), never `section_title`. */
  readonly title: string
  readonly type: Enums<'section_type'>
  readonly blocks: readonly ReviewBlockView[]
  /** How many movements are under this heading, across its blocks. */
  readonly movementCount: number
  /**
   * Every prescribed tempo in the section, in movement order — the optional
   * detail surface that replaces a `Tempo …` repeated on each row. Empty when
   * nothing in the section prescribes one.
   */
  readonly cadence: readonly ReviewCadence[]
}

/** The header IA.md §4 asks for: intensity, anchor, goal — and the duration. */
export interface ReviewFact {
  readonly label: string
  readonly value: string
}

export interface ReviewBriefing {
  /** The workout's own title, which is the screen's heading. */
  readonly title: string
  /**
   * Intensity, anchor, goal and duration, in that order and as one list — the
   * header renders four readings of the same kind, so it is given four of the
   * same shape rather than four named fields it would have to lay out itself.
   */
  readonly facts: readonly ReviewFact[]
  /**
   * Why the session differs from what was asked for, when a clamp moved it.
   * Null is the common case: nothing was adjusted, so there is nothing to say.
   */
  readonly adjustment: string | null
  readonly sections: readonly ReviewSectionView[]
  /** Movements across the whole workout. Zero is impossible — see below. */
  readonly movementCount: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Words
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The goal the workout was composed for, in the words the generate screen
 * offers it in. Snapshotted at generation, so this is what it was rather than
 * what the profile says today.
 */
const GOAL_LABELS: Readonly<Record<Enums<'goal_preset'>, string>> = {
  strength: 'Strength',
  hypertrophy: 'Hypertrophy',
  conditioning: 'Conditioning',
  balanced: 'Balanced',
  active_recovery: 'Active recovery',
}

/**
 * A profile that never answered the goal question. Stated rather than left
 * blank: a header with an empty cell reads as a value that failed to load.
 */
export const NO_GOAL_LABEL = 'Not set'

export const INTENSITY_LABEL = 'Intensity'
export const ANCHOR_LABEL = 'Anchor'
export const GOAL_LABEL = 'Goal'
export const DURATION_LABEL = 'Duration'

/** The intensity scale is 1–10, and the header says which end it is on. */
export function briefingIntensity(effectiveIntensity: number): string {
  return `${effectiveIntensity} of 10`
}

/**
 * The duration, from the effective target and from no other number.
 *
 * A separate function taking a single `number` rather than a branch inside
 * `reviewBriefing`, so that the one value the screen is allowed to show is
 * also the only value this code path can see. The computed estimate and the
 * model's diagnostic estimate are not parameters, which is a stronger
 * statement than a comment saying not to use them.
 */
export function briefingDuration(effectiveTargetMins: number): string {
  return `${effectiveTargetMins} min`
}

/**
 * What the prescription says about load, in the guidance's own terms.
 *
 * Total over `load_guidance` with no default arm: a seventh kind of guidance
 * fails to compile here rather than rendering as a bare number. Three of the
 * six carry their own answer and need no value at all (`SELF_DESCRIBING_LOAD`
 * in `schemas.ts` is the same three), and `none` says nothing because there is
 * nothing to say — an unloaded movement is not a movement loaded with zero.
 *
 * `absolute` is the one that needs a unit, and the unit is the profile's
 * because the prescription has no column for one. When the profile has not been
 * read the number is shown without a unit rather than in a guessed one: `60`
 * meaning kilograms to someone who trains in pounds is the kind of silent
 * misread this codebase keeps refusing to make.
 */
export function loadText(
  loadType: Enums<'load_guidance'>,
  loadValue: number | null,
  weightUnit: BriefingWeightUnit | null,
): string | null {
  switch (loadType) {
    case 'bodyweight':
      return 'Bodyweight'
    case 'prior_session':
      return 'Match last session'
    case 'none':
      return null
    case 'percent_1rm':
      return loadValue === null ? null : `${loadValue}% 1RM`
    case 'rir':
      return loadValue === null ? null : `${loadValue} RIR`
    case 'absolute':
      if (loadValue === null) return null
      return weightUnit === null ? `${loadValue}` : `${loadValue} ${weightUnit}`
  }
}

/** `Rest 90s between rounds`, for a block that rests between them. Zero is not rest. */
export function roundRestText(seconds: number | null): string | null {
  if (seconds === null || seconds <= 0) return null
  return `Rest ${seconds}s between rounds`
}

/**
 * How many rounds a superset or circuit is performed for, when it says.
 *
 * The block's own `rounds` when it carries one. A superset may leave it null
 * (only a circuit is required to carry it), and then its rounds are the set
 * count its members share — stated only when they all agree, because a guess
 * between two different counts would be a number the workout does not hold.
 * Timed structures are counted by their clock, not by rounds.
 */
export function groupRounds(block: WorkoutBlock): number | null {
  if (block.structure_type !== 'superset' && block.structure_type !== 'circuit') return null
  if (block.rounds !== null) return block.rounds
  if (block.structure_type !== 'superset') return null
  const counts = new Set(block.exercises.map((exercise) => exercise.sets))
  const [only] = counts
  return counts.size === 1 && only !== undefined ? only : null
}

/**
 * `barbell` → `barbell`, `dumbbell-pair` → `dumbbell pair`.
 *
 * The same humanising `exerciseName` does, and for the same reason: the column
 * holds a slug, nothing here reads meaning out of it, and the day the payload
 * carries a display name this is the one place that changes.
 */
export function equipmentName(equipment: string): string {
  return equipment.replaceAll('-', ' ').replaceAll('_', ' ')
}

/** Whitespace is not a note. A panel with nothing in it claims one was written. */
function blankToNull(value: string | null): string | null {
  if (value === null) return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

// ─────────────────────────────────────────────────────────────────────────────
// The derivation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The briefing, from the acceptance payload the journey assembled.
 *
 * `weightUnit` is the profile's, and `null` is a legitimate argument rather
 * than a missing one: Review renders before its profile query has necessarily
 * settled, and a load stated without a unit is honest where a defaulted one
 * would not be.
 *
 * There is no empty case. A workout with no sections is a validation failure
 * and `generationOutputSchema` refuses one (`sections.min(1)`, `blocks.min(1)`,
 * `exercises.min(1)`), which is exactly what IA.md §4 means by "empty: n/a" for
 * this screen — so nothing here has to decide what an empty briefing looks
 * like.
 */
export function reviewBriefing(
  acceptance: SessionAcceptance,
  weightUnit: BriefingWeightUnit | null = null,
): ReviewBriefing {
  const sections = acceptance.workout.sections.map((section, index) =>
    reviewSection(section, index, weightUnit),
  )

  return {
    title: acceptance.workout.title,
    facts: [
      { label: INTENSITY_LABEL, value: briefingIntensity(acceptance.effective_intensity) },
      { label: ANCHOR_LABEL, value: formatFocus(acceptance.session_focus) },
      {
        label: GOAL_LABEL,
        value:
          acceptance.goal_preset === null
            ? NO_GOAL_LABEL
            : GOAL_LABELS[acceptance.goal_preset],
      },
      {
        label: DURATION_LABEL,
        value: briefingDuration(acceptance.effective_duration_target_mins),
      },
    ],
    adjustment: blankToNull(acceptance.adjustment_reason),
    sections,
    movementCount: sections.reduce((total, section) => total + section.movementCount, 0),
  }
}

function reviewSection(
  section: WorkoutSection,
  index: number,
  weightUnit: BriefingWeightUnit | null,
): ReviewSectionView {
  const key = `section-${index}`
  const blocks = section.blocks.map((block, blockIndex) =>
    reviewBlock(block, index, blockIndex, weightUnit),
  )

  return {
    key,
    title: sectionTypeLabel(section.section_type),
    type: section.section_type,
    blocks,
    movementCount: blocks.reduce((total, block) => total + block.exercises.length, 0),
    cadence: blocks.flatMap((block) =>
      block.exercises.flatMap((exercise) =>
        exercise.tempo === null
          ? []
          : [{ key: exercise.key, name: exercise.name, tempo: exercise.tempo }],
      ),
    ),
  }
}

function reviewBlock(
  block: WorkoutBlock,
  sectionIndex: number,
  blockIndex: number,
  weightUnit: BriefingWeightUnit | null,
): ReviewBlockView {
  const identity = structureIdentity(block)
  const rounds = groupRounds(block)

  return {
    key: `section-${sectionIndex}-block-${blockIndex}`,
    // The shell's own reading of the structure — see the header comment.
    identity:
      rounds !== null && identity.detail === null
        ? { ...identity, detail: `${rounds} ROUNDS` }
        : identity,
    grouped: block.structure_type !== 'standard',
    rounds,
    notes: blankToNull(block.block_notes),
    roundRest: roundRestText(block.round_rest_seconds),
    // The key is `prescriptionSiteKey`'s and not this file's: OVR-01c keys a
    // load suggestion by the same position, and two definitions of "which
    // prescription" is how a suggestion lands on the wrong row.
    exercises: block.exercises.map((exercise, index) =>
      reviewExercise(exercise, prescriptionSiteKey(sectionIndex, blockIndex, index), weightUnit),
    ),
  }
}

function reviewExercise(
  exercise: Prescription,
  key: string,
  weightUnit: BriefingWeightUnit | null,
): ReviewExerciseView {
  return {
    key,
    name: exerciseName(exercise.exercise_id),
    prescription: prescriptionText(exercise),
    equipment: equipmentName(exercise.equipment),
    load: loadText(exercise.load_type, exercise.load_value, weightUnit),
    // `restText` rather than a second sentence about the same column: the rest
    // a briefing promises and the rest the workout screen runs are one fact.
    rest: restText(exercise.rest_seconds),
    tempo: blankToNull(exercise.tempo),
  }
}
