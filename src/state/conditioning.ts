/**
 * OVR-03 — §3's timed formats, as pure functions.
 *
 * §2's rules answer "what load next" from an anchor that makes any two sessions
 * comparable. §3 opens by saying that for timed work **it doesn't**: an 8-minute
 * AMRAP of swings and burpees and a 10-minute AMRAP of thrusters and pull-ups
 * are not the same test, and there is no valid score comparison between two
 * differently-generated conditioning pieces. Everything here follows from that
 * one sentence, and splits the way the spec splits:
 *
 *   1. **The score** (`conditioningScore`) — one comparable number per timed
 *      block: reps per minute for AMRAP and For Time, a completion ratio for
 *      EMOM, a rung for a ladder. Normalizing by the clock is what makes an
 *      8-minute and a 12-minute AMRAP of the *same* movements comparable.
 *   2. **The gate** (`conditioningFingerprint`, `previousBest`) — a comparison
 *      is offered only when the work is identical: same structure, same
 *      exercises, same targets, same clock, same loads. Anywhere else there is
 *      no comparison, because §3(a) is explicit that a false one is worse than
 *      none.
 *   3. **The nudge** (`conditioningTrend`, `densitySuggestion`) — for freshly
 *      generated conditioning, progress is not measured but *prescribed*: a
 *      rolling read over the last three conditioning sections at intensity ≥ 5
 *      says `ready`, `hold` or `backing_off`, and the per-format suggestion says
 *      what that means for an AMRAP as against an EMOM.
 *
 * Five decisions are stated once here because each is load-bearing:
 *
 *   * **The score is computed, never stored.** Every input is already a column
 *     (`block_results`, EXE-01) against a prescription that cannot change — a
 *     revision supersedes rather than mutates — so a `normalized_score` column
 *     would be a second copy of a derived number, free to disagree with the row
 *     it came from after one backfill or one rounding change. §3's own "New —
 *     required" table lists `perceived_effort`, `partial_reps` and
 *     `minutes_completed` and no score among them. The per-section storage is
 *     therefore the inputs plus this function, in one place, and
 *     `conditioning_history(...)` is the read that hands them over.
 *   * **Higher is always better.** Reps per minute, completion ratio and rung
 *     all improve upwards — including For Time, where finishing the same work
 *     faster *is* a higher rate. That is the second payoff of normalizing: one
 *     direction of comparison for four formats, so no caller has to remember
 *     which score is a time.
 *   * **An unobserved measurement scores nothing.** A block that recorded no
 *     rounds, or a piece that prescribes no reps to count, returns `null`
 *     rather than a zero nobody measured (DATA_MODEL §8). The trend still reads
 *     that section's effort and completion, because an unscorable piece is not
 *     an unfelt one.
 *   * **Identity is the prescription, not the favorite.** §3(a) says
 *     "in practice this means Favorites/repeats only", and the mechanism it
 *     describes is matching `structure_type` + exercise set + rep scheme +
 *     duration/cap + loads. So the fingerprint is that match, and it is what
 *     gates the comparison — a repeat is a repeat whether or not it was saved,
 *     and a saved workout whose prescription was swapped is no longer one.
 *   * **Backing off outranks going up.** When the window holds both patterns —
 *     two sections completed easily *and* two capped — the read is
 *     `backing_off`, for the reason §2's table evaluates its overshoot rows
 *     first: a correction is not something to average against a nudge.
 *
 * Spec: `docs/specs/OVR-01_progressive-overload.md` §3. §1's anchor arithmetic
 * is `anchors.ts`, §2's and §5's rules are `progression.ts`, §4's deload
 * triggers are OVR-04's. Pure and React-free, like both of them: nothing here
 * fetches, and nothing here reads a row it was not handed.
 */

import type { Enums } from '../data/database.types'
import type { BlockOutcome } from './block-completion'
import { isLadderScheme } from './ladder'
import type { ConditioningHistoryRow, ConditioningPrescription } from './schemas'
import type { BlockProgress } from './workout-progress'

// ─────────────────────────────────────────────────────────────────────────────
// Vocabulary
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The formats §3 scores, which are not the structure types.
 *
 * A ladder is a rep scheme rather than a seventh structure (`session-detail.ts`
 * makes the same override), and a circuit is here because the density read is
 * over *conditioning sections* and a circuit is one of the things a conditioning
 * section holds — it scores like an AMRAP when it carries a clock and reports
 * its completion either way. `standard` and `superset` are absent: they are §2's
 * work, where the anchor already makes two sessions comparable.
 */
export type ConditioningFormat = 'amrap' | 'for_time' | 'emom' | 'ladder' | 'circuit'

/** What a score's number *is*, so nothing renders a rung as a rate. */
export type ScoreUnit = 'reps_per_minute' | 'completion_ratio' | 'rung'

/** §3's rolling read on how conditioning is landing. */
export type ConditioningTrend = 'ready' | 'hold' | 'backing_off'

/** Whether the prescribed work was finished, hit its cap, or fell short. */
export type BlockCompletionRead = 'complete' | 'capped' | 'incomplete' | 'unknown'

/** §3: the window is "the last 3 conditioning sections at intensity ≥5". */
export const DENSITY_INTENSITY_FLOOR = 5
export const TREND_WINDOW = 3

/** §3: "two consecutive sections … at section RPE ≤ 7". */
export const READY_EFFORT_CEILING = 7
export const CONSECUTIVE_SECTIONS = 2

/** §3's step sizes, as the directive states them. */
export const ROUND_STEP = 1
export const REPS_PER_ROUND_STEP = 2
export const MINUTE_STEP = 1
export const RUNG_STEP = 1
/** "−10% time cap" when ready, "+15% cap" when backing off. */
export const CAP_SHORTEN_FRACTION = 0.1
export const CAP_LENGTHEN_FRACTION = 0.15

const SECONDS_PER_MINUTE = 60

// ─────────────────────────────────────────────────────────────────────────────
// What the score reads
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A timed block's prescription, in the one shape both callers can supply: a
 * `conditioning_history` row from the user's history, and the block being
 * performed right now (`BlockProgress`).
 *
 * It is a structural subset rather than either of those types, because a score
 * that took a history row could not be shown at completion and a score that took
 * a `BlockProgress` could not be computed over history — and the piece being
 * finished must score exactly as the same piece will score when it is read back.
 */
export interface TimedPrescription {
  readonly structureType: Enums<'structure_type'>
  readonly repScheme: Enums<'rep_scheme'>
  readonly timerType: Enums<'timer_contract'>
  /** The block's clock: an AMRAP's window, an EMOM's length, a For Time cap. */
  readonly timerSeconds: number | null
  readonly rounds: number | null
  readonly roundRestSeconds: number | null
  /** The active prescriptions, in prescribed order. */
  readonly exercises: readonly ConditioningPrescription[]
}

/** The outcome half: what the block actually recorded. */
export interface TimedOutcome {
  readonly elapsedSeconds: number | null
  readonly completedUnderCap: boolean | null
  readonly roundsCompleted: number | null
  readonly partialRoundReps: number | null
  readonly minutesCompleted: number | null
  readonly highestRung: number | null
  /** The section RPE EXE-01 has captured at completion since M1. */
  readonly perceivedEffort: number | null
}

/** One comparable number, with everything a reader needs to say what it is. */
export interface ConditioningScore {
  readonly format: ConditioningFormat
  readonly unit: ScoreUnit
  /** The normalized number. Higher is better, in every unit. */
  readonly value: number
  /**
   * `false` only for a For Time that stopped at its cap — §3 flags it, because
   * "reps at the cap" and "the whole thing, faster" are not the same result.
   * `null` where the format has no cap to beat.
   */
  readonly completedUnderCap: boolean | null
  /** What the score says, in words: `12.5 reps/min`, `8 of 10 min`, `Rung 5`. */
  readonly label: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Format
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Which format a block is scored as, or null for a block §3 does not score.
 *
 * The rep scheme is read before the structure type, for the reason
 * `blockRendererFor` reads it first: a For Time performed as a ladder records a
 * rung, and scoring it as a For Time would divide reps that were never
 * prescribed as a round. `n_plus_one` counts as a ladder here although
 * `isLadderScheme` excludes it — that exclusion is about whether a renderer can
 * draw the rungs from a stored sequence, and this is about which column the
 * result is in. §3's table puts "Ladder / N+1" on one row for exactly that
 * reason.
 */
export function conditioningFormat(block: {
  readonly structureType: Enums<'structure_type'>
  readonly repScheme: Enums<'rep_scheme'>
}): ConditioningFormat | null {
  if (isLadderScheme(block.repScheme) || block.repScheme === 'n_plus_one') return 'ladder'

  switch (block.structureType) {
    case 'amrap':
      return 'amrap'
    case 'for_time':
      return 'for_time'
    case 'emom':
      return 'emom'
    case 'circuit':
      return 'circuit'
    case 'standard':
    case 'superset':
      return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The reps a round asks for
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reps prescribed per round, across the block's movements, or null when the
 * piece prescribes none to count.
 *
 * Three readings, each stated because a rate is only as honest as its
 * numerator:
 *
 *   * **A range's floor is the prescription.** `anchor_evidence` resolves a
 *     range the same way: the reps that had to be completed for the round to
 *     count as completed, not the top of the band. Using the midpoint would make
 *     the same piece score differently depending on how a caller rounded.
 *   * **Per-side doubles.** Ten per side is twenty reps of work, and a rate that
 *     halved one of two identical pieces because one was written per side would
 *     be comparing the notation rather than the work.
 *   * **Only reps count.** A 400 m run or a 60-second plank inside the piece
 *     contributes no reps, and a piece made entirely of them has no
 *     reps-per-minute rate at all — which is a null score, not a zero one.
 */
export function prescribedRepsPerRound(
  exercises: readonly ConditioningPrescription[],
): number | null {
  let total = 0
  let counted = false

  for (const exercise of exercises) {
    if (exercise.modality !== 'reps') continue

    const reps = targetReps(exercise)
    if (reps === null) continue

    counted = true
    total += reps * (exercise.sets ?? 1) * (exercise.per_side ? 2 : 1)
  }

  return counted && total > 0 ? total : null
}

/** The prescribed target of one movement, per its target shape (DATA_MODEL §6). */
function targetReps(exercise: ConditioningPrescription): number | null {
  switch (exercise.target_kind) {
    case 'fixed':
      return exercise.target_value
    case 'range':
      return exercise.target_min
    case 'sequence':
      // A sequence inside one round is the whole sequence: the round is not
      // finished until its last rung is. A ladder *block* never reaches here —
      // it scores by rung — so this is the fixed-interval companion case.
      return exercise.target_sequence?.reduce((sum, rung) => sum + rung, 0) ?? null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The score
// ─────────────────────────────────────────────────────────────────────────────

/**
 * §3's normalized score for one timed block, or null when the block records
 * nothing comparable.
 *
 * | Format | Normalized rate |
 * |---|---|
 * | AMRAP | total reps ÷ window minutes |
 * | For Time, finished | prescribed reps ÷ elapsed minutes |
 * | For Time, capped | reps at the cap ÷ cap minutes, flagged |
 * | EMOM | minutes completed ÷ minutes prescribed |
 * | Ladder / N+1 | the rung reached |
 *
 * A circuit scores as an AMRAP when it carries a clock, and not at all when it
 * does not — an untimed circuit is rounds without a denominator, and a rate
 * needs one.
 */
export function conditioningScore(
  block: TimedPrescription,
  outcome: TimedOutcome,
): ConditioningScore | null {
  const format = conditioningFormat(block)
  if (format === null) return null

  if (format === 'ladder') {
    if (outcome.highestRung === null) return null
    return {
      format,
      unit: 'rung',
      value: outcome.highestRung,
      completedUnderCap: null,
      label: `Rung ${outcome.highestRung}`,
    }
  }

  if (format === 'emom') {
    const prescribed = clockMinutes(block.timerSeconds)
    if (prescribed === null || outcome.minutesCompleted === null) return null
    return {
      format,
      unit: 'completion_ratio',
      value: outcome.minutesCompleted / prescribed,
      completedUnderCap: null,
      // EMOM is a pass/fail density test, so the words are the two counts
      // rather than the ratio: "8 of 10 min" is actionable, "0.8" is not.
      label: `${outcome.minutesCompleted} of ${formatNumber(prescribed)} min`,
    }
  }

  // For Time that beat its cap is the one case measured by its own elapsed
  // time: the work is fixed and the clock is the result. Everywhere else the
  // clock is fixed and the reps are the result.
  const finishedForTime = format === 'for_time' && outcome.completedUnderCap !== false
  const repsPerRound = prescribedRepsPerRound(block.exercises)
  if (repsPerRound === null) return null

  if (finishedForTime) {
    const minutes = clockMinutes(outcome.elapsedSeconds)
    if (minutes === null) return null
    const prescribedReps = repsPerRound * (block.rounds ?? 1)
    return rate(format, prescribedReps / minutes, outcome.completedUnderCap)
  }

  if (outcome.roundsCompleted === null) return null
  const minutes = clockMinutes(block.timerSeconds) ?? clockMinutes(outcome.elapsedSeconds)
  if (minutes === null) return null

  const reps = outcome.roundsCompleted * repsPerRound + (outcome.partialRoundReps ?? 0)
  return rate(format, reps / minutes, format === 'for_time' ? false : null)
}

function rate(
  format: ConditioningFormat,
  value: number,
  completedUnderCap: boolean | null,
): ConditioningScore {
  return {
    format,
    unit: 'reps_per_minute',
    value,
    completedUnderCap,
    label: `${formatNumber(value)} reps/min`,
  }
}

/** Seconds as minutes, or null when there is no clock to divide by. */
function clockMinutes(seconds: number | null): number | null {
  if (seconds === null || seconds <= 0) return null
  return seconds / SECONDS_PER_MINUTE
}

/** One decimal place, and no trailing `.0` on a whole number. */
function formatNumber(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

// ─────────────────────────────────────────────────────────────────────────────
// Was it finished?
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Whether the block finished the work as prescribed — the other half of §3's
 * density read, beside the section RPE.
 *
 * "As prescribed" means something different per format, and the difference is
 * the point: an AMRAP is finished by its clock, so a recorded AMRAP is a
 * completed one; an EMOM is finished by surviving every minute; a For Time is
 * finished by beating its cap, and `completed_under_cap = false` is the cap it
 * hit. `unknown` is a real answer — the outcome column the format is read
 * through was never recorded — and it keeps a section out of both consecutive
 * patterns rather than counting it as a failure.
 */
export function blockCompletionRead(
  block: TimedPrescription,
  outcome: TimedOutcome,
): BlockCompletionRead {
  const format = conditioningFormat(block)

  switch (format) {
    case 'for_time':
      if (outcome.completedUnderCap === null) return 'unknown'
      return outcome.completedUnderCap ? 'complete' : 'capped'

    case 'emom': {
      const prescribed = clockMinutes(block.timerSeconds)
      if (outcome.minutesCompleted === null || prescribed === null) return 'unknown'
      return outcome.minutesCompleted >= prescribed ? 'complete' : 'incomplete'
    }

    case 'ladder': {
      if (outcome.highestRung === null) return 'unknown'
      const top = topRung(block)
      // An open-ended ladder — N+1, or a block whose sequence never travelled —
      // is finished where it is finished: there is no rung it fell short of.
      if (top === null) return 'complete'
      return outcome.highestRung >= top ? 'complete' : 'incomplete'
    }

    case 'amrap':
      // The window is the work. An AMRAP cannot be under-completed, only
      // under-scored, which is what the score is for.
      return outcome.roundsCompleted === null ? 'unknown' : 'complete'

    case 'circuit':
      if (outcome.roundsCompleted === null) return 'unknown'
      if (block.rounds === null) return 'complete'
      return outcome.roundsCompleted >= block.rounds ? 'complete' : 'incomplete'

    case null:
      return 'unknown'
  }
}

/** The last rung a ladder prescribes, or null when it prescribes no sequence. */
function topRung(block: TimedPrescription): number | null {
  const lengths = block.exercises
    .map((exercise) => exercise.target_sequence?.length ?? 0)
    .filter((length) => length > 0)

  return lengths.length === 0 ? null : Math.max(...lengths)
}

// ─────────────────────────────────────────────────────────────────────────────
// Identical work — §3(a)'s gate
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A stable fingerprint of the *work*: `structure_type` + rep scheme + clock +
 * rounds + the exercise set with its targets, sides and loads, in prescribed
 * order.
 *
 * §3(a) lists exactly these as the conditions for a like-for-like comparison.
 * Two blocks with the same fingerprint are the same test; anything else is two
 * different tests, and no comparison is drawn between them however similar they
 * look. Order matters — the same movements in a different order is a different
 * piece to perform — and the string is deliberately opaque: it is an equality
 * check, not a thing to display or to parse back.
 */
export function conditioningFingerprint(block: TimedPrescription): string {
  const head = [
    block.structureType,
    block.repScheme,
    block.timerType,
    field(block.timerSeconds),
    field(block.rounds),
    field(block.roundRestSeconds),
  ].join('|')

  const work = [...block.exercises]
    .sort((left, right) => left.order_index - right.order_index)
    .map((exercise) =>
      [
        exercise.exercise_id,
        exercise.modality,
        exercise.target_kind,
        field(exercise.sets),
        field(exercise.target_value),
        field(exercise.target_min),
        field(exercise.target_max),
        exercise.target_sequence === null ? '-' : exercise.target_sequence.join('-'),
        exercise.per_side ? 'per_side' : 'both',
        field(exercise.distance_unit),
        field(exercise.load_type),
        field(exercise.load_value),
        exercise.equipment_used,
      ].join(':'),
    )
    .join('~')

  return `${head}#${work}`
}

function field(value: string | number | null): string {
  return value === null ? '-' : String(value)
}

// ─────────────────────────────────────────────────────────────────────────────
// One scored section, and the comparison
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One conditioning block, read: what it was, how it went, how hard it felt.
 *
 * This is the shape both consumers work in. The comparison reads `fingerprint`
 * and `score`; the density nudge reads `intensity`, `completion` and
 * `perceivedEffort`. An unscorable piece keeps its row — `score: null` — because
 * a piece nobody can rate a rate for was still performed and still felt like
 * something.
 */
export interface ConditioningSectionRead {
  readonly sessionId: string
  readonly blockId: string
  /** The session's date, `YYYY-MM-DD`, as the row holds it. */
  readonly date: string
  /** `effective_intensity`: the intensity actually generated, not the request. */
  readonly intensity: number
  readonly format: ConditioningFormat | null
  readonly fingerprint: string
  readonly completion: BlockCompletionRead
  readonly perceivedEffort: number | null
  readonly score: ConditioningScore | null
}

/** The prescription half of a history row, in the shape the score reads. */
export function timedPrescription(row: ConditioningHistoryRow): TimedPrescription {
  return {
    structureType: row.structure_type,
    repScheme: row.rep_scheme,
    timerType: row.timer_type,
    timerSeconds: row.timer_seconds,
    rounds: row.rounds,
    roundRestSeconds: row.round_rest_seconds,
    exercises: row.prescriptions,
  }
}

/** The outcome half of a history row. */
export function timedOutcome(row: ConditioningHistoryRow): TimedOutcome {
  return {
    elapsedSeconds: row.elapsed_seconds,
    completedUnderCap: row.completed_under_cap,
    roundsCompleted: row.rounds_completed,
    partialRoundReps: row.partial_round_reps,
    minutesCompleted: row.minutes_completed,
    highestRung: row.highest_rung,
    perceivedEffort: row.perceived_effort,
  }
}

/** One history row, read. */
export function conditioningSection(row: ConditioningHistoryRow): ConditioningSectionRead {
  const block = timedPrescription(row)
  const outcome = timedOutcome(row)

  return {
    sessionId: row.session_id,
    blockId: row.block_id,
    date: row.session_date,
    intensity: row.effective_intensity,
    format: conditioningFormat(block),
    fingerprint: conditioningFingerprint(block),
    completion: blockCompletionRead(block, outcome),
    perceivedEffort: outcome.perceivedEffort,
    score: conditioningScore(block, outcome),
  }
}

/** Every history row, read, newest first — the order the function answers in. */
export function conditioningSections(
  rows: readonly ConditioningHistoryRow[],
): readonly ConditioningSectionRead[] {
  return rows.map(conditioningSection)
}

/** What a like-for-like comparison says, when there is one to make. */
export interface ScoreComparison {
  readonly current: ConditioningScore
  /** The best identical attempt before this one. */
  readonly best: ConditioningScore
  readonly bestDate: string
  /** How many identical attempts precede this one. */
  readonly attempts: number
  readonly direction: 'ahead' | 'level' | 'behind'
  /** Current minus best, in the score's own unit. Signed. */
  readonly delta: number
  /** True when this attempt is the new best. */
  readonly isBest: boolean
  /** One line: `Previous best 12.4 reps/min`. */
  readonly label: string
}

/**
 * The comparison for one attempt, or **null** when there is none to draw.
 *
 * Null is the common case and the important one. §3(a): "Everywhere else, don't
 * show a comparison — a false one is worse than none." So this answers null for
 * a first attempt, for a piece whose fingerprint appears nowhere in the history,
 * for a piece that cannot be scored, and for a stored attempt whose score is in
 * a different unit — which is the defensive half of the same rule, since a rung
 * and a rate must never be subtracted from one another.
 *
 * The current block is excluded by id: a history read taken after the block was
 * written contains the block itself, and comparing an attempt to itself would
 * report every repeat as "level".
 */
export function previousBest(
  current: ConditioningSectionRead,
  history: readonly ConditioningSectionRead[],
): ScoreComparison | null {
  const score = current.score
  if (score === null) return null

  const identical = history.filter(
    (section) =>
      section.blockId !== current.blockId &&
      section.fingerprint === current.fingerprint &&
      section.score !== null &&
      section.score.unit === score.unit,
  )
  if (identical.length === 0) return null

  // Higher is better in every unit, so "best" is one comparison for all three.
  // History arrives newest first, so `>` keeps the most recent of equal bests —
  // the attempt the user is likeliest to remember.
  const best = identical.reduce((leader, section) =>
    (section.score?.value ?? 0) > (leader.score?.value ?? 0) ? section : leader,
  )
  const bestScore = best.score
  if (bestScore === null) return null

  const delta = score.value - bestScore.value

  return {
    current: score,
    best: bestScore,
    bestDate: best.date,
    attempts: identical.length,
    direction: delta > 0 ? 'ahead' : delta < 0 ? 'behind' : 'level',
    delta,
    isBest: delta > 0,
    label: `Previous best ${bestScore.label}`,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// §3(b) — the density nudge
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The sections the trend is read over: the most recent `TREND_WINDOW` scorable
 * conditioning sections at intensity `DENSITY_INTENSITY_FLOOR` or above,
 * returned **oldest first** so "consecutive" means what it says.
 *
 * The intensity gate lives here rather than in SQL so that it is a unit test
 * rather than a predicate nobody can run on a pull request — and so that "the
 * last 3 at intensity ≥5" cannot quietly become "3 of the last 5, whichever
 * qualified". Sections with no format are dropped: a standard block that landed
 * in a conditioning section is §2's work, not a density signal.
 */
export function densityWindow(
  sections: readonly ConditioningSectionRead[],
): readonly ConditioningSectionRead[] {
  return sections
    .filter(
      (section) => section.format !== null && section.intensity >= DENSITY_INTENSITY_FLOOR,
    )
    .slice(0, TREND_WINDOW)
    .reverse()
}

/**
 * §3(b)'s rolling read, over the window above.
 *
 * * Two consecutive sections finished as prescribed at section RPE ≤ 7 →
 *   `ready`.
 * * Two consecutive sections hitting the cap or failing to complete →
 *   `backing_off`.
 * * Mixed, or not enough data → `hold`.
 *
 * `backing_off` is checked first, so a window holding both patterns backs off
 * rather than averaging a correction against a nudge. A section whose effort was
 * never recorded cannot satisfy the `ready` pair — the rule names an RPE, and an
 * absent one is not a low one — but it can satisfy the backing-off pair, which
 * needs only what the outcome says.
 */
export function conditioningTrend(
  sections: readonly ConditioningSectionRead[],
): ConditioningTrend {
  const window = densityWindow(sections)
  if (window.length < CONSECUTIVE_SECTIONS) return 'hold'

  if (consecutive(window, backedOff)) return 'backing_off'
  if (consecutive(window, landedEasily)) return 'ready'
  return 'hold'
}

/** True when `count` neighbours in a row all satisfy `holds`. */
function consecutive(
  window: readonly ConditioningSectionRead[],
  holds: (section: ConditioningSectionRead) => boolean,
): boolean {
  let run = 0
  for (const section of window) {
    run = holds(section) ? run + 1 : 0
    if (run >= CONSECUTIVE_SECTIONS) return true
  }
  return false
}

function backedOff(section: ConditioningSectionRead): boolean {
  return section.completion === 'capped' || section.completion === 'incomplete'
}

function landedEasily(section: ConditioningSectionRead): boolean {
  return (
    section.completion === 'complete' &&
    section.perceivedEffort !== null &&
    section.perceivedEffort <= READY_EFFORT_CEILING
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// What the trend means, per format
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The levers a nudge can pull. §3 offers the generator a choice — "+1 round, +2
 * reps per round, or −10% time cap (generator's choice)" — so a suggestion is a
 * list rather than a single instruction, and which levers exist depends on the
 * format: an AMRAP has no rounds to add, an EMOM progresses by surviving more
 * minutes, and a ladder moves by rungs.
 */
export type DensityLever =
  | 'add_round'
  | 'drop_round'
  | 'add_reps_per_round'
  | 'reduce_reps_per_round'
  | 'shorten_cap'
  | 'lengthen_cap'
  | 'shorten_window'
  | 'lengthen_window'
  | 'add_minute'
  | 'drop_minute'
  | 'add_rung'
  | 'drop_rung'
  | 'hold'

export interface DensityLeverStep {
  readonly lever: DensityLever
  /** What pulling it means, in the numbers §3 gives. */
  readonly summary: string
}

export interface DensitySuggestion {
  readonly format: ConditioningFormat
  readonly trend: ConditioningTrend
  /** Any one of these satisfies the nudge; the generator chooses. */
  readonly levers: readonly DensityLeverStep[]
  /** The one line a prompt or a screen states. */
  readonly summary: string
}

const HOLD_STEP: DensityLeverStep = {
  lever: 'hold',
  summary: 'Hold the current density',
}

const READY_LEVERS: Readonly<Record<ConditioningFormat, readonly DensityLeverStep[]>> = {
  // An AMRAP's rounds are the score, never the prescription, so the levers are
  // the two things that are prescribed: the work in a round, and the window.
  amrap: [
    { lever: 'add_reps_per_round', summary: `+${REPS_PER_ROUND_STEP} reps per round` },
    { lever: 'shorten_window', summary: `−${percent(CAP_SHORTEN_FRACTION)} window` },
  ],
  for_time: [
    { lever: 'add_round', summary: `+${ROUND_STEP} round` },
    { lever: 'add_reps_per_round', summary: `+${REPS_PER_ROUND_STEP} reps per round` },
    { lever: 'shorten_cap', summary: `−${percent(CAP_SHORTEN_FRACTION)} time cap` },
  ],
  // §3: "EMOM progresses by *surviving more*, not by scoring higher." So the
  // first lever is another minute, and only then more work inside one.
  emom: [
    { lever: 'add_minute', summary: `+${MINUTE_STEP} minute` },
    { lever: 'add_reps_per_round', summary: `+${REPS_PER_ROUND_STEP} reps per minute` },
  ],
  ladder: [{ lever: 'add_rung', summary: `+${RUNG_STEP} rung` }],
  circuit: [
    { lever: 'add_round', summary: `+${ROUND_STEP} round` },
    { lever: 'add_reps_per_round', summary: `+${REPS_PER_ROUND_STEP} reps per round` },
  ],
}

const BACKING_OFF_LEVERS: Readonly<
  Record<ConditioningFormat, readonly DensityLeverStep[]>
> = {
  amrap: [
    { lever: 'reduce_reps_per_round', summary: `−${REPS_PER_ROUND_STEP} reps per round` },
    { lever: 'lengthen_window', summary: `+${percent(CAP_LENGTHEN_FRACTION)} window` },
  ],
  for_time: [
    { lever: 'drop_round', summary: `−${ROUND_STEP} round` },
    { lever: 'lengthen_cap', summary: `+${percent(CAP_LENGTHEN_FRACTION)} time cap` },
  ],
  emom: [
    { lever: 'drop_minute', summary: `−${MINUTE_STEP} minute` },
    {
      lever: 'reduce_reps_per_round',
      summary: `−${REPS_PER_ROUND_STEP} reps per minute`,
    },
  ],
  ladder: [{ lever: 'drop_rung', summary: `−${RUNG_STEP} rung` }],
  circuit: [{ lever: 'drop_round', summary: `−${ROUND_STEP} round` }],
}

/**
 * What a trend means for one format — the per-format half of §3(b).
 *
 * `hold` is one lever in every format, and it is not an empty list: "no change"
 * is a decision the generator was told to make, and a caller that received
 * nothing could not tell it from a format nobody wrote a rule for.
 */
export function densitySuggestion(
  format: ConditioningFormat,
  trend: ConditioningTrend,
): DensitySuggestion {
  const levers =
    trend === 'ready'
      ? READY_LEVERS[format]
      : trend === 'backing_off'
        ? BACKING_OFF_LEVERS[format]
        : [HOLD_STEP]

  return {
    format,
    trend,
    levers,
    summary: levers.map((step) => step.summary).join(' · '),
  }
}

function percent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`
}

// ─────────────────────────────────────────────────────────────────────────────
// The directive generation reads
// ─────────────────────────────────────────────────────────────────────────────

/**
 * §3(b)'s directive, in the shape the prompt carries it: `conditioning_trend`,
 * the wire name the spec writes, plus what the read rested on.
 *
 * Snake-cased for the same reason the prescription rows are: this is a payload
 * crossing to the generator, and a name that changes on the way is a name two
 * sides have to agree about twice. `sections_read` and `reason` do not go into
 * the prompt's directive line — they are how a bad nudge is explained after the
 * fact, which §3 asks for of every suggestion.
 */
export interface ConditioningDirective {
  readonly conditioning_trend: ConditioningTrend
  /** How many sections the window actually held, of `TREND_WINDOW`. */
  readonly sections_read: number
  readonly reason: string
}

const DIRECTIVE_REASON: Readonly<Record<ConditioningTrend, string>> = {
  ready: 'two consecutive conditioning sections finished as prescribed at RPE 7 or below',
  backing_off: 'two consecutive conditioning sections hit the cap or fell short',
  hold: 'not two consecutive sections either way',
}

/** The directive for a history, ready to pass to generation. */
export function conditioningDirective(
  sections: readonly ConditioningSectionRead[],
): ConditioningDirective {
  const window = densityWindow(sections)
  const trend = conditioningTrend(sections)

  return {
    conditioning_trend: trend,
    sections_read: window.length,
    reason:
      window.length < CONSECUTIVE_SECTIONS
        ? `only ${window.length} conditioning section${window.length === 1 ? '' : 's'} at intensity ${DENSITY_INTENSITY_FLOOR} or above`
        : DIRECTIVE_REASON[trend],
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The block being performed right now
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The block the shell is completing, in the shape the score reads.
 *
 * The same function scores the piece at completion and scores it when it is read
 * back out of history, which is the only way the number shown at completion can
 * be the number the comparison later uses. `BlockProgress` carries the active
 * prescriptions whole (`ExerciseProgress.prescription`), so nothing is refetched
 * to say what was prescribed.
 */
export function blockPrescription(block: BlockProgress): TimedPrescription {
  return {
    structureType: block.structureType,
    repScheme: block.repScheme,
    timerType: block.timerType,
    timerSeconds: block.timerSeconds,
    rounds: block.rounds,
    roundRestSeconds: block.roundRestSeconds,
    exercises: block.exercises.map((exercise) => exercise.prescription),
  }
}

/**
 * A renderer's sparse outcome as the score reads it: `undefined` is "not
 * observed" on the way in and `null` is "not observed" in the row, and the two
 * must mean the same thing to the score or a block would score differently
 * before and after it was written.
 */
export function outcomeOf(outcome: BlockOutcome, perceivedEffort: number | null): TimedOutcome {
  return {
    elapsedSeconds: outcome.elapsedSeconds ?? null,
    completedUnderCap: outcome.completedUnderCap ?? null,
    roundsCompleted: outcome.roundsCompleted ?? null,
    partialRoundReps: outcome.partialRoundReps ?? null,
    minutesCompleted: outcome.minutesCompleted ?? null,
    highestRung: outcome.highestRung ?? null,
    perceivedEffort,
  }
}
