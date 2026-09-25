/**
 * GEN-06 — duration plausibility, computed here and nowhere else.
 *
 * This is check 8 of GENERATION_CONTRACT §6, and §7 is the whole of it. What it
 * exists to do is narrow: **reject a workout that clearly cannot fit.** It does
 * not predict how long a session will take, and reading it as though it does is
 * how a crude allowance becomes an argument about seconds per rep.
 *
 * It closes D5. The check it replaces compared `estimated_duration_mins` — a
 * number the prompt told Claude the answer to — against the request that told
 * it, so it could not fail. Nothing in this module reads that field; the only
 * inputs are the blocks, the prescriptions and the request's own target, and
 * `src/test/generation-duration.test.ts` proves the independence by estimating
 * the same workout twice with two absurd estimates on it.
 *
 * Three decisions are worth stating, because each one is a thing this module
 * deliberately does not do:
 *
 *   * **The allowances are constants in this file.** `WORK_PER_SET_SECONDS` and
 *     `TRANSITION_SECONDS`, and that is the entire model. No metadata table, no
 *     per-exercise override, no tempo parsing, no seconds-per-rep — every one of
 *     those would make the estimate look authoritative, and an authoritative
 *     number is the thing §7 says this is not.
 *   * **Shared rest is counted once per round.** It lives on the block, which is
 *     the normalization fix earning itself: under the old shape a circuit's rest
 *     was duplicated on three members and could be summed three times.
 *   * **The band is one-sided, and that is not an oversight.** A fixed
 *     work-per-set under-counts real time by construction — it knows nothing
 *     about setup, cueing, or a warmup set before a heavy single — so a computed
 *     duration *below* the target is evidence about the allowance rather than
 *     about the workout, and rejecting on it would fail good sessions. An
 *     overrun is the direction §7 names: work and rest that cannot fit.
 *
 * On a failure nothing is trimmed. Which block to cut is composition judgment,
 * so the verdict names the block that overran and by how much and the model
 * composes again — one targeted retry through the same counter every other hard
 * check uses (`claude.ts`).
 */

import type { SectionType } from '../../../src/data/candidates.ts'
import type { Enums } from '../../../src/data/database.types.ts'
import type { GenerationOutput, WorkoutBlock } from '../../../src/state/schemas.ts'

type StructureType = Enums<'structure_type'>

// ─────────────────────────────────────────────────────────────────────────────
// The constants — §7's whole allowance model
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One working set, including the moment before it. §7 states 30–45s and this is
 * the middle of it: a number at either end would be a claim about which
 * exercises the library holds, which is exactly the per-exercise knowledge this
 * check refuses to acquire.
 */
export const WORK_PER_SET_SECONDS = 40

/**
 * The small fixed allowance §7 asks for, charged once per exercise inside a
 * section and once per section: walking to the rack, loading it, reading the
 * next card. Fixed, because a transition that varied by equipment would be the
 * metadata table under another name.
 */
export const TRANSITION_SECONDS = 30

/**
 * §7's tolerance, at the generous end of its 15–20%. Generous is the point: the
 * check has to be one a reasonable session never trips, so that the sessions it
 * does trip are the ones that genuinely do not fit.
 */
export const DURATION_TOLERANCE = 0.2

/** The structures whose length is declared rather than derived (§7). */
const TIMED_STRUCTURES = new Set<StructureType>(['emom', 'amrap', 'for_time'])

/** The structures that repeat as a whole and carry one shared rest per round. */
const ROUND_STRUCTURES = new Set<StructureType>(['superset', 'circuit'])

// ─────────────────────────────────────────────────────────────────────────────
// The estimate
// ─────────────────────────────────────────────────────────────────────────────

/** One block's cost, kept apart from the total so a failure can name it. */
export interface BlockDuration {
  /** `sections[1].blocks[0]` — the block, which is what a retry is told about. */
  readonly path: string
  readonly sectionType: SectionType
  readonly structureType: StructureType
  /** Work only: sets, or rounds of members. */
  readonly workSeconds: number
  /** Rest the prescription requires — shared rest counted once per round. */
  readonly restSeconds: number
  readonly seconds: number
  /**
   * How many rounds the formula counted, and `null` for a declared clock, which
   * has no rounds to count. `assumedRounds` says the number was not the block's
   * own (see `roundsOf`).
   */
  readonly rounds: number | null
  readonly assumedRounds: boolean
  /** True when §7 read the block's declared clock instead of its members. */
  readonly declaredClock: boolean
}

export interface SectionDuration {
  readonly path: string
  readonly sectionType: SectionType
  readonly blocks: readonly BlockDuration[]
  /** One transition per exercise in the section (§7). */
  readonly transitionSeconds: number
  readonly seconds: number
}

export interface WorkoutDuration {
  readonly seconds: number
  /**
   * `workout_sessions.computed_duration_mins`, and the reason it is rounded here
   * rather than at the INSERT: the column is an int with `> 0`, so a workout
   * shorter than thirty seconds is one minute rather than zero.
   */
  readonly minutes: number
  readonly sections: readonly SectionDuration[]
  /** Every block, flattened, longest first — the order a failure reads them in. */
  readonly blocks: readonly BlockDuration[]
  /** One transition per section (§7). */
  readonly transitionSeconds: number
}

/**
 * How many times a round-based block repeats.
 *
 * `circuit` declares it — the schema refuses one that does not. `superset` is
 * the gap DATA-01c recorded: `fixed_round_structures_have_rounds` constrains
 * circuits alone, so a superset may arrive with `rounds: null` and §7's formula
 * has nothing to multiply. Inventing a constraint here would be this module
 * deciding another requirement's shape, so instead the member sets answer —
 * a pair written as `sets: 3` each is three rounds of the pair — and one round
 * is the floor when nobody said anything. `assumedRounds` records that the
 * number was inferred, so a caller can tell a counted block from a guessed one.
 */
function roundsOf(block: WorkoutBlock): { rounds: number; assumed: boolean } {
  if (block.rounds !== null) return { rounds: block.rounds, assumed: false }

  const stated = block.exercises.reduce((most, exercise) => Math.max(most, exercise.sets ?? 0), 0)

  return { rounds: Math.max(stated, 1), assumed: true }
}

/**
 * §7's per-block formula, one branch per structure and nothing else:
 *
 * ```
 * standard   → Σ members: sets × WORK_PER_SET + (sets − 1) × rest_seconds
 * superset   → rounds × Σ(member work) + (rounds − 1) × round_rest_seconds
 * circuit    → rounds × Σ(member work) + (rounds − 1) × round_rest_seconds
 * emom       → timer_seconds
 * amrap      → timer_seconds
 * for_time   → timer_seconds            (the full cap)
 * ```
 *
 * A member of a round-based block is one set per round: the block is what
 * repeats (§5), so counting its members' own `sets` on top of `rounds` would
 * charge the same work twice.
 */
export function estimateBlock(
  block: WorkoutBlock,
  path: string,
  sectionType: SectionType,
): BlockDuration {
  const base = { path, sectionType, structureType: block.structure_type }

  // A declared clock is the answer, including for `for_time`, where the cap is
  // budgeted in full: the user may need all of it, and a workout planned around
  // them finishing early is one that does not fit when they do not.
  if (TIMED_STRUCTURES.has(block.structure_type)) {
    const seconds = block.timer_seconds ?? 0

    return {
      ...base,
      workSeconds: seconds,
      restSeconds: 0,
      seconds,
      rounds: null,
      assumedRounds: false,
      declaredClock: true,
    }
  }

  if (ROUND_STRUCTURES.has(block.structure_type)) {
    const { rounds, assumed } = roundsOf(block)
    const workSeconds = rounds * block.exercises.length * WORK_PER_SET_SECONDS
    // Once per round, because it is one fact on the block rather than one per
    // member. This is the line the old shape got wrong three times over.
    const restSeconds = Math.max(rounds - 1, 0) * (block.round_rest_seconds ?? 0)

    return {
      ...base,
      workSeconds,
      restSeconds,
      seconds: workSeconds + restSeconds,
      rounds,
      assumedRounds: assumed,
      declaredClock: false,
    }
  }

  // `standard`, and anything a later enum adds: independent sets, summed over
  // the members, each member resting between its own sets and not after the last
  // one.
  let workSeconds = 0
  let restSeconds = 0

  for (const exercise of block.exercises) {
    const sets = exercise.sets ?? 1
    workSeconds += sets * WORK_PER_SET_SECONDS
    restSeconds += Math.max(sets - 1, 0) * (exercise.rest_seconds ?? 0)
  }

  // A standard block may still declare shared rest between its rounds of work;
  // where it does, `rounds` is the block's own and the rest is charged once per
  // round the way §7 charges it everywhere else.
  const rounds = block.rounds
  if (rounds !== null) restSeconds += Math.max(rounds - 1, 0) * (block.round_rest_seconds ?? 0)

  return {
    ...base,
    workSeconds,
    restSeconds,
    seconds: workSeconds + restSeconds,
    rounds,
    assumedRounds: false,
    declaredClock: false,
  }
}

/**
 * The whole workout, per §7: blocks into sections with a transition per
 * exercise, sections into a total with a transition per section.
 *
 * Pure, total, and reads nothing but the structure — `estimated_duration_mins`
 * is not a parameter and could not be consulted if it were.
 */
export function estimateDuration(workout: GenerationOutput): WorkoutDuration {
  const sections = workout.sections.map((section, sectionIndex): SectionDuration => {
    const path = `sections[${sectionIndex}]`

    const blocks = section.blocks.map((block, blockIndex) =>
      estimateBlock(block, `${path}.blocks[${blockIndex}]`, section.section_type),
    )

    const exerciseCount = section.blocks.reduce((count, block) => count + block.exercises.length, 0)
    const transitionSeconds = exerciseCount * TRANSITION_SECONDS

    return {
      path,
      sectionType: section.section_type,
      blocks,
      transitionSeconds,
      seconds: blocks.reduce((total, block) => total + block.seconds, 0) + transitionSeconds,
    }
  })

  const transitionSeconds = sections.length * TRANSITION_SECONDS
  const seconds = sections.reduce((total, section) => total + section.seconds, 0) + transitionSeconds

  return {
    seconds,
    // `> 0` is the column's constraint; a session that computes to nothing is a
    // defect upstream and should not become a zero the database refuses.
    minutes: Math.max(1, Math.round(seconds / 60)),
    sections,
    blocks: sections
      .flatMap((section) => section.blocks)
      .slice()
      .sort((a, b) => b.seconds - a.seconds),
    transitionSeconds,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The verdict
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check 8's answer. `fits` is the verdict; everything beside it exists so the
 * retry is specific and so `computed_duration_mins` can be persisted whether the
 * workout fitted or not.
 */
export interface DurationVerdict {
  readonly fits: boolean
  readonly duration: WorkoutDuration
  readonly targetMins: number
  /** The target plus the tolerance — the number `fits` is actually measured on. */
  readonly ceilingMins: number
  /** Minutes past the ceiling. `0` when it fits. */
  readonly overrunMins: number
  /** The longest block: what a retry is told to compose differently. */
  readonly longestBlock: BlockDuration | null
  /** The retry addendum's detail, and `null` when there is nothing to correct. */
  readonly detail: string | null
}

const minutes = (seconds: number) => Math.round(seconds / 60)

/**
 * §7's check: the computed duration against the request's own target, with the
 * tolerance applied in one direction (see this file's header for why).
 *
 * The detail names the block, its structure and its cost, then the totals — the
 * three things a model needs to compose a shorter session on purpose rather than
 * re-roll and hope. No title, no overview and no prescription text: the addendum
 * is a correction, not the model's own answer read back to it.
 */
export function checkDuration(workout: GenerationOutput, targetMins: number): DurationVerdict {
  const duration = estimateDuration(workout)
  const ceilingMins = Math.round(targetMins * (1 + DURATION_TOLERANCE))
  const longestBlock = duration.blocks[0] ?? null

  if (duration.minutes <= ceilingMins) {
    return {
      fits: true,
      duration,
      targetMins,
      ceilingMins,
      overrunMins: 0,
      longestBlock,
      detail: null,
    }
  }

  const overrunMins = duration.minutes - ceilingMins

  const block = longestBlock
    ? `${longestBlock.path} (${longestBlock.sectionType}, ${longestBlock.structureType}) is the ` +
      `longest block at ${minutes(longestBlock.seconds)} min ` +
      `(${minutes(longestBlock.workSeconds)} min work, ${minutes(longestBlock.restSeconds)} min rest)`
    : 'no block was composed'

  return {
    fits: false,
    duration,
    targetMins,
    ceilingMins,
    overrunMins,
    longestBlock,
    detail:
      `${block}. The prescribed work and required rest compute to ${duration.minutes} min ` +
      `against a ${targetMins} min target, ${overrunMins} min over the ${ceilingMins} min limit. ` +
      'Compose less work in that block rather than less rest.',
  }
}
