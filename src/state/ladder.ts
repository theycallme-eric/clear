/**
 * EXE-04a — what a ladder is, read from the columns that hold it.
 *
 * The requirement's first acceptance criterion is the negative one that this
 * whole module exists to keep true: **the renderer indexes an int array;
 * nothing parses a string.** The old app stored the pattern as
 * `"2-4-6-8-10-8-6-4-2"` on every exercise line and split it back apart at
 * render time, which is the same defect `prescription.ts` was written to end.
 * Here a rung is `target_sequence[i]` — an `int[]` the database holds and
 * `CONSTRAINT target_shape` already guarantees has more than one element — and
 * the only string produced is the one the screen shows.
 *
 * Two things follow from the rung living on `workout_exercises` while the
 * *scheme* lives on `workout_blocks` (DATA_MODEL §"blocks"):
 *
 *   · **The pattern is the block's, so it is stated once.** Every movement of a
 *     ladder shares the sequence; repeating it per exercise is exactly the
 *     clutter `ladder-for-time.md` §1 sets out to remove. `ladderRungs` folds
 *     the block's movements into one ordered list of rungs.
 *   · **A rung is identified by its target, not by its index** (the quickfix
 *     spec, and EXE-04a's third criterion). `rungLabel` is the target the user
 *     recognises — `12 reps` — while `LadderRung.number` is the 1-based rung
 *     number the *row* records, which is what `block_results.highest_rung`
 *     means: "which rung was reached".
 *
 * `inverse` is the reason a rung carries `targets` rather than one `target`:
 * two movements climb in opposite directions (`10/1, 9/2, 8/3…`), so rung 1 is
 * genuinely two numbers. Where the movements agree — every other scheme — the
 * duplicates collapse and the rung is one number again.
 *
 * Pure and React-free, like `prescription.ts` and `workout-progress.ts` beside
 * it.
 */
import type { Enums } from '../data/database.types.ts'
import {
  exerciseName,
  measuredText,
  modalityUnit,
  prescribedTarget,
  targetNumbers,
  targetText,
  type PrescribedColumns,
  type PrescribedTarget,
} from './prescription.ts'
import type { LadderTiming } from './schemas.ts'
import type { BlockProgress, ExerciseProgress } from './workout-progress.ts'

// ─────────────────────────────────────────────────────────────────────────────
// Which schemes are ladders
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The schemes that are performed as a ladder, per the quickfix spec: the three
 * shapes plus `inverse`, and `ladder_fixed_interval` — a ladder with a fixed
 * movement done between the rungs, which is a ladder with a companion rather
 * than a different structure.
 *
 * `n_plus_one` is deliberately absent. "Add one each round until failure" has
 * no prescribed sequence to index — its rungs are discovered by performing it —
 * so a renderer that read it as a ladder would have an empty array to draw.
 * `fixed` is not a ladder by definition.
 */
const LADDER_SCHEMES = [
  'ladder_up',
  'ladder_down',
  'pyramid',
  'inverse',
  'ladder_fixed_interval',
] as const satisfies readonly Enums<'rep_scheme'>[]

/** True for a block whose rep scheme is performed as a ladder. */
export function isLadderScheme(scheme: Enums<'rep_scheme'>): boolean {
  return (LADDER_SCHEMES as readonly string[]).includes(scheme)
}

// ─────────────────────────────────────────────────────────────────────────────
// Rungs
// ─────────────────────────────────────────────────────────────────────────────

/** One step of the ladder: which rung it is, and the target(s) it asks for. */
export interface LadderRung {
  /**
   * 1-based position in the ladder — what `block_results.highest_rung`
   * records. It is *not* how the rung is labelled; the target is.
   */
  readonly number: number
  /**
   * The number at this rung, per movement, with agreement collapsed: one entry
   * for an ordinary ladder, two for an `inverse` pair climbing opposite ways.
   */
  readonly targets: readonly number[]
}

/**
 * How a ladder block's movements divide.
 *
 * `laddered` are the movements the sequence belongs to. `interval` are the
 * companions of a `ladder_fixed_interval` — a fixed target performed between
 * each rung — which the screen states as an annotation rather than as a peer
 * movement (`ladder-for-time.md` §4). The split is read from `target_kind`:
 * whether a movement carries a sequence is what makes it part of the ladder,
 * not its position in the block.
 */
export interface LadderMovements<T extends LadderMember = ExerciseProgress> {
  readonly laddered: readonly T[]
  readonly interval: readonly T[]
}

/**
 * Anything that carries a prescription's columns: the live shell's
 * `ExerciseProgress`, or a composed `Prescription` Review reads before it is
 * persisted (TASK-012) — one reader for both, as `prescription.ts` has.
 */
export interface LadderMember {
  readonly prescription: PrescribedColumns
}

export function ladderMovements<T extends LadderMember>(
  exercises: readonly T[],
): LadderMovements<T> {
  const laddered: T[] = []
  const interval: T[] = []

  for (const exercise of exercises) {
    const target = prescribedTarget(exercise.prescription)
    if (target?.kind === 'sequence') laddered.push(exercise)
    else interval.push(exercise)
  }

  return { laddered, interval }
}

/**
 * The block's ladder, as ordered rungs.
 *
 * The sequences are read by index and nothing else: rung `i` is every laddered
 * movement's `target_sequence[i]`. A block whose movements prescribe sequences
 * of different lengths is malformed rather than impossible — the longer one
 * still has rungs, and a movement that has run out simply contributes nothing
 * to them, which is a shorter ladder rather than a crash.
 */
export function ladderRungs(
  exercises: readonly LadderMember[],
): readonly LadderRung[] {
  const sequences = ladderMovements(exercises).laddered.flatMap((exercise) => {
    const target = prescribedTarget(exercise.prescription)
    return target?.kind === 'sequence' ? [target.rungs] : []
  })

  const depth = sequences.reduce((longest, rungs) => Math.max(longest, rungs.length), 0)

  const rungs: LadderRung[] = []
  for (let index = 0; index < depth; index += 1) {
    const targets = [
      ...new Set(
        sequences.flatMap((sequence) => {
          const target = sequence[index]
          return target === undefined ? [] : [target]
        }),
      ),
    ]
    if (targets.length > 0) rungs.push({ number: index + 1, targets })
  }

  return rungs
}

/**
 * The unit every rung is counted in: the modality of the ladder's movements.
 *
 * One unit for the block, because the rungs are the block's. Where the
 * laddered movements disagree — a sequence of reps beside a sequence of
 * seconds, which the generation contract does not produce — no unit is
 * claimed, and the rungs are shown as the bare numbers they are.
 */
export function ladderUnit(exercises: readonly LadderMember[]): string {
  const units = new Set(
    ladderMovements(exercises).laddered.map((exercise) =>
      modalityUnit(exercise.prescription),
    ),
  )

  return units.size === 1 ? [...units][0] : ''
}

/** A rung's numbers, with no unit: `12`, or `10 / 1` for an inverse pair. */
export function rungNumbers(rung: LadderRung): string {
  return rung.targets.join(' / ')
}

/**
 * How a rung is named: by its target, never by its index. `12 reps`, `40 sec`,
 * `10 / 1 reps` — the number the user is looking at on the floor.
 */
export function rungLabel(rung: LadderRung, unit: string): string {
  const numbers = rungNumbers(rung)
  return unit === '' ? numbers : `${numbers} ${unit}`
}

/**
 * TASK-013 (C34, AC-R013-01; R77, R89): one tap on a rung of the ordered
 * progress, and the rounds completed through after it. A rung outside the
 * completed prefix selects through it — every rung before it with it,
 * because "selecting a completed ladder rung marks preceding rungs complete"
 * (R89); a rung already in the prefix leaves only the rungs before it. The
 * result is always one contiguous run from the first rung: there is no
 * non-contiguous completion model, and the rung after the prefix is where any
 * partial work belongs (`ladderPartialRound`, TASK-030's rule). `null`, nothing
 * stated yet, is not zero: the first tap states it.
 */
export function ladderPrefixAfterTap(rungNumber: number, completedThrough: number | null): number {
  return completedThrough !== null && rungNumber <= completedThrough ? rungNumber - 1 : rungNumber
}

// ─────────────────────────────────────────────────────────────────────────────
// The compact prescription — TASK-012 (C35; R70, R71, R72, R94, R95, R117)
// ─────────────────────────────────────────────────────────────────────────────
//
// The accepted R6 composition (`/gallery/refinements?state=ladder-4` and
// `ladder-12`, eded158c…): one concise line per movement for the whole
// progression, then every round as a compact tile naming each movement's
// target in that round, the fixed companion included. Every number, unit and
// name below is read from the prescription's own columns — the sequence by
// index, never a template — so a descending, pyramid or inverse ladder is
// stated as itself rather than as the screenshot's rising push up (R94).

/** The minus sign, so a falling step reads as one, not as a dash. */
const MINUS = '−'

/**
 * A movement's whole prescription in one concise reading (C35, R94).
 *
 *   · a sequence that rises or falls by one constant step: its ends and that
 *     step — `2 → 24 reps · +2 per round`, `15 → 3 reps · −3 per round`;
 *   · any other sequence (a pyramid, an uneven ladder): the actual sequence,
 *     in the order performed — `20-40-60-40-20 sec`, never a step it does not
 *     have;
 *   · a fixed companion, a band or no target: its own target — `4 reps`,
 *     `250 m`, `8 reps each side` — which is the same in every round, so it is
 *     said once and not once per round (R70).
 */
export function ladderProgressionText(prescription: PrescribedColumns): string {
  const target = prescribedTarget(prescription)
  if (target?.kind !== 'sequence' || target.rungs.length < 2) return targetText(prescription, target)

  const { rungs } = target
  const step = rungs[1] - rungs[0]
  const constant = step !== 0 && rungs.every((value, index) => index === 0 || value - rungs[index - 1] === step)
  if (!constant) return targetText(prescription, target)

  const ends = measuredText(prescription, `${rungs[0]} → ${rungs[rungs.length - 1]}`)
  return `${ends} · ${step > 0 ? '+' : MINUS}${Math.abs(step)} per round`
}

/** One movement's work in one round of the compact grid. */
export interface LadderRoundEntry {
  /** The movement's place in prescribed order, 0-based: the order performed. */
  readonly movement: number
  /** `push up` — the movement's own name. */
  readonly name: string
  /**
   * R72's concise notation: `2 × push up` for reps (the `×` replaces the word
   * "reps" between quantity and movement), `30 sec plank` and `250 m row`
   * where the unit is the meaning, and `each side` kept where it is part of
   * the target.
   */
  readonly text: string
  /** The same target in words for a screen reader: `push up, 2 reps`. */
  readonly spoken: string
}

/** One round of the compact grid: its number, and each movement's work in it. */
export interface LadderRoundReading {
  /** 1-based — the rung number `highest_rung` records. */
  readonly number: number
  readonly entries: readonly LadderRoundEntry[]
}

/** The quantity a movement asks for in one round, or null for none. */
function roundTarget(prescription: PrescribedColumns, roundNumber: number): PrescribedTarget | null {
  const target = prescribedTarget(prescription)
  if (target?.kind !== 'sequence') return target
  const value = target.rungs[roundNumber - 1]
  return value === undefined ? null : { kind: 'fixed', value }
}

function roundEntry(member: LadderMember, movement: number, roundNumber: number): LadderRoundEntry | null {
  const { prescription } = member
  const name = exerciseName(prescription.exercise_id)
  const declared = prescribedTarget(prescription)
  const target = roundTarget(prescription, roundNumber)

  // A sequence that has run out before this round contributes nothing to it,
  // exactly as `ladderRungs` reads a shorter sequence — a shorter ladder for
  // that movement, never an invented number.
  if (declared?.kind === 'sequence' && target === null) return null
  if (target === null) return { movement, name, text: name, spoken: name }

  const numbers = targetNumbers(target)
  const side = prescription.per_side ? ' each side' : ''
  const unit = modalityUnit(prescription)
  const text =
    prescription.modality === 'reps'
      ? `${numbers} × ${name}${side}`
      : `${unit === '' ? numbers : `${numbers} ${unit}`} ${name}${side}`

  return { movement, name, text, spoken: `${name}, ${targetText(prescription, target)}` }
}

/**
 * Every round of the ladder as the compact grid states it: `rounds` entries
 * (the explicit timing's own count; the ladder's rungs when it has none), each
 * listing every movement's work in that round in prescribed order — the
 * laddered movements at this round's rung, and the fixed companion work at its
 * own target in every round (C35, R95). Nothing is summed, inferred or
 * repeated from a template.
 */
export function ladderRoundReadings(
  members: readonly LadderMember[],
  rounds: number | null = null,
): readonly LadderRoundReading[] {
  const count = rounds ?? ladderRungs(members).length
  return Array.from({ length: Math.max(0, count) }, (_, index): LadderRoundReading => ({
    number: index + 1,
    entries: members.flatMap((member, movement) => {
      const entry = roundEntry(member, movement, index + 1)
      return entry === null ? [] : [entry]
    }),
  }))
}

// ─────────────────────────────────────────────────────────────────────────────
// Timing — REQ-018 / E03 (TASK-032)
// ─────────────────────────────────────────────────────────────────────────────
//
// The rungs above say *what* each round asks for; `ladder_timing` says *when*
// it happens (GENERATION_CONTRACT §5.1). Everything below reads the stored
// timing and nothing else: round count and interval length are the block's own
// numbers, never constants, and no round is ever derived from a clock unless
// the mode schedules it.

/**
 * The block's explicit timing, or `null` for a legacy block — absent, null, or
 * on a scheme that is not a ladder (which the schema refuses, and this does not
 * try to honour).
 */
export function explicitLadderTiming(
  block: Pick<BlockProgress, 'repScheme' | 'ladderTiming'>,
): LadderTiming | null {
  const timing = block.ladderTiming ?? null
  return timing !== null && isLadderScheme(block.repScheme) ? timing : null
}

/** One round of a timed ladder, with everything the screen needs precomputed. */
export interface LadderRoundPlan {
  /** 1-based round number — the rung number `highest_rung` records. */
  readonly number: number
  /** The rung's target(s), indexed from `target_sequence`. */
  readonly rung: LadderRung | null
  /** The fixed companion work, performed in full every round. */
  readonly companions: readonly ExerciseProgress[]
  /**
   * Seconds into the block at which this round starts — `(k − 1) × interval`
   * for `scheduled_starts`, and `null` in every other mode, where a round
   * starts when the last one is finished.
   */
  readonly startSeconds: number | null
}

/**
 * Every round of the ladder, as the timing declares them: `timing.rounds`
 * entries, each with its rung and the companions beside it. Nothing is left
 * for the user to add up mid-workout.
 */
export function ladderRoundPlan(
  exercises: readonly ExerciseProgress[],
  timing: LadderTiming,
): readonly LadderRoundPlan[] {
  const rungs = ladderRungs(exercises)
  const companions = ladderMovements(exercises).interval

  return Array.from({ length: timing.rounds }, (_, index): LadderRoundPlan => ({
    number: index + 1,
    rung: rungs.find((rung) => rung.number === index + 1) ?? null,
    companions,
    startSeconds:
      timing.mode === 'scheduled_starts' ? index * timing.interval_seconds : null,
  }))
}

/**
 * The round a *scheduled* ladder is in, `blockElapsedSeconds` into the block's
 * own clock — and `null` for free-paced `for_time` and `capped_window`, whose
 * progress is observed from the user and never inferred from elapsed time.
 * Also `null` once the schedule has run out. The global session clock is not an
 * input here and is not changed by anything in this module.
 */
export function scheduledRoundAt(
  timing: LadderTiming,
  blockElapsedSeconds: number,
): number | null {
  if (timing.mode !== 'scheduled_starts') return null
  if (!Number.isFinite(blockElapsedSeconds) || blockElapsedSeconds < 0) return null

  const round = Math.floor(blockElapsedSeconds / timing.interval_seconds) + 1
  return round <= timing.rounds ? round : null
}

/** The one cap a `capped_window` places on the whole ladder; `null` otherwise. */
export function ladderCapSeconds(timing: LadderTiming): number | null {
  return timing.mode === 'capped_window' ? timing.cap_seconds : null
}
