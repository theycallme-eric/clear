/**
 * HIST-01's detail, derived from a reconstruction and from nothing else.
 *
 * The screen reads one payload: `session_as_performed` (SES-01b / DATA_MODEL
 * §7). That is the whole of "without querying legacy client shapes" — the
 * detail never assembles its own idea of what happened out of a present-tense
 * snapshot plus a filter, because the fourth reconstruction a caller writes by
 * hand is always the one that says `revision_status = 'active'` where it means
 * "at the time". Whatever the function answers is what this file reads, and the
 * payload says which question it answered, so a view built from it can state
 * its own provenance rather than implying one.
 *
 * Three rules this derivation keeps:
 *
 *   · **A number that was not observed is absent, never zero.** Every outcome
 *     column is nullable and every one of them admits zero (DATA_MODEL §8): an
 *     AMRAP that managed no rounds records `0`, a structure with no rounds
 *     records `null`, and printing the second as `0 rounds` would be inventing
 *     a measurement. An unscored block says it is unscored.
 *   · **Which columns a block is read for is its structure's business.**
 *     `blockOutcome` is total over `structure_type`, with the one override
 *     `blockRendererFor` already has — a ladder is a rep scheme, not a seventh
 *     structure — so the outcome a For Time ladder reports is its highest rung
 *     and the outcome an EMOM reports is its minutes.
 *   · **A superseded prescription is part of the answer.** `as performed`
 *     returns the swapped-out row when sets were logged against it, and this
 *     view marks it as replaced rather than dropping it. Dropping it would lose
 *     the work; showing it unmarked would claim it was prescribed.
 */
import type { Enums } from '../data/database.types'
import { formatDay, formatFocus } from './history'
import { moodStep, type MoodStep } from './mood'
import { prescriptionText, exerciseName } from './prescription'
import type {
  BlockResultRow,
  ExerciseSetLogRow,
  ReconstructionKind,
  SessionReconstruction,
  WorkoutBlockRow,
  WorkoutExerciseRow,
} from './schemas'
import type { SessionState } from './session-machine'
import { formatElapsed } from './workout-clock'
import { isLadderScheme } from './ladder'
import { structureIdentity, type StructureIdentity } from './workout-progress'

// ─────────────────────────────────────────────────────────────────────────────
// The view
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Where the answer came from: which of the three questions was asked, and the
 * instant it resolves at.
 *
 * On screen this is one quiet line, and it is load-bearing rather than
 * decorative. A reconstruction is a statement about a moment — the same session
 * answers three different ways — so a detail view that showed rows without
 * saying which question produced them would be presenting one of three
 * possible truths as the only one.
 */
export interface DetailProvenance {
  readonly kind: ReconstructionKind
  /** `As performed` — what the question is, in words. */
  readonly label: string
  /** The instant it resolves at, formatted, or null when there is none. */
  readonly asOf: string | null
}

/** One logged set, as the row records it. Absent fields were not logged. */
export interface LoggedSetView {
  readonly key: string
  readonly setNumber: number
  readonly isWarmup: boolean
  /** `8 reps`, or null for a set that logged none. */
  readonly reps: string | null
  /** `60 kg` — the row carries its own unit, so nothing here converts. */
  readonly weight: string | null
  /** `RPE 8`, the per-set effort. */
  readonly rpe: string | null
  /** `45s`, for a set measured in time. */
  readonly duration: string | null
  /** `400 m`, for a set measured in distance. */
  readonly distance: string | null
}

/** How this prescription came to be in the block. */
export type PrescriptionLineage = 'prescribed' | 'substituted' | 'replaced'

export interface ExerciseDetailView {
  readonly id: string
  readonly name: string
  /** `3 × 8`, from the structured target the row carries. */
  readonly prescription: string
  readonly status: Enums<'execution_status'>
  readonly statusLabel: string
  readonly lineage: PrescriptionLineage
  /** The word a non-default lineage is read as, or null for a plain one. */
  readonly lineageLabel: string | null
  readonly sets: readonly LoggedSetView[]
}

/** One reading off a block's result row: what was measured, and what it said. */
export interface OutcomeMeasurement {
  readonly label: string
  readonly value: string
}

export interface BlockDetailView {
  readonly id: string
  readonly identity: StructureIdentity
  /** Whether `block_results` holds a row for this block at all. */
  readonly scored: boolean
  /** The measurements this structure's result was read for, nulls dropped. */
  readonly outcome: readonly OutcomeMeasurement[]
  /** `7 of 10`, the shell's one question for every structure, or null. */
  readonly perceivedEffort: string | null
  readonly notes: string | null
  readonly exercises: readonly ExerciseDetailView[]
}

export interface SectionDetailView {
  readonly id: string
  readonly title: string
  readonly type: Enums<'section_type'>
  readonly blocks: readonly BlockDetailView[]
}

export interface SessionDetailView {
  readonly sessionId: string
  readonly title: string
  /** `Thu 24 Sep 2026`, from the session's own local day. */
  readonly day: string
  readonly focus: string
  readonly state: SessionState
  readonly stateLabel: string
  /** `42 min`, actual where it was measured and the estimate otherwise. */
  readonly duration: string | null
  readonly intensity: number
  /** The debrief's two answers. Null means it was not answered. */
  readonly mood: MoodStep | null
  readonly notes: string | null
  readonly provenance: DetailProvenance
  readonly sections: readonly SectionDetailView[]
  /** How many sets the whole session logged — zero is a real answer. */
  readonly loggedSetCount: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Vocabulary
// ─────────────────────────────────────────────────────────────────────────────

/** Which question the payload answers, in the words the screen shows. */
export const RECONSTRUCTION_LABELS: Readonly<Record<ReconstructionKind, string>> = {
  generated: 'As generated',
  intended_at_start: 'As intended at start',
  performed: 'As performed',
}

const STATE_LABELS: Readonly<Record<SessionState, string>> = {
  prescribed: 'Never started',
  active: 'Left unfinished',
  completed: 'Completed',
  abandoned: 'Abandoned',
}

const STATUS_LABELS: Readonly<Record<Enums<'execution_status'>, string>> = {
  not_started: 'Not logged',
  completed: 'Done',
  skipped: 'Skipped',
}

/**
 * What a lineage is called. `prescribed` has no word on purpose: it is what
 * every row is unless something happened to it, and a label on all of them
 * would be a label on none.
 */
const LINEAGE_LABELS: Readonly<Record<PrescriptionLineage, string | null>> = {
  prescribed: null,
  substituted: 'Swapped in',
  replaced: 'Swapped out',
}

// ─────────────────────────────────────────────────────────────────────────────
// Derivation
// ─────────────────────────────────────────────────────────────────────────────

/** The whole screen, from the one payload it is allowed to read. */
export function sessionDetail(reconstruction: SessionReconstruction): SessionDetailView {
  const { session } = reconstruction
  const sections = reconstruction.sections.map(sectionDetail)

  return {
    sessionId: session.id,
    title: session.title,
    day: formatDay(session.date),
    focus: formatFocus(session.session_focus),
    state: reconstruction.state,
    stateLabel: STATE_LABELS[reconstruction.state],
    duration: sessionDuration(session.actual_duration_mins, session.computed_duration_mins),
    intensity: session.effective_intensity,
    mood: moodStep(session.mood),
    // Whitespace is not a note. The debrief trims before writing, but a row
    // written by anything else can still hold spaces, and a notes panel with
    // nothing in it says the user wrote something.
    notes: blankToNull(session.session_notes),
    provenance: {
      kind: reconstruction.reconstruction,
      label: RECONSTRUCTION_LABELS[reconstruction.reconstruction],
      asOf: reconstruction.as_of === null ? null : formatInstant(reconstruction.as_of),
    },
    sections,
    loggedSetCount: sections.reduce(
      (total, section) =>
        total +
        section.blocks.reduce(
          (blockTotal, block) =>
            blockTotal +
            block.exercises.reduce((count, exercise) => count + exercise.sets.length, 0),
          0,
        ),
      0,
    ),
  }
}

function sectionDetail(
  entry: SessionReconstruction['sections'][number],
): SectionDetailView {
  return {
    id: entry.section.id,
    title: entry.section.section_title,
    type: entry.section.section_type,
    blocks: entry.blocks.map(blockDetail),
  }
}

function blockDetail(
  entry: SessionReconstruction['sections'][number]['blocks'][number],
): BlockDetailView {
  const result = entry.block_result

  return {
    id: entry.block.id,
    identity: structureIdentity(entry.block),
    scored: result !== null,
    outcome: result === null ? [] : blockOutcome(entry.block, result),
    perceivedEffort:
      result === null || result.perceived_effort === null
        ? null
        : `${result.perceived_effort} of 10`,
    notes: result === null ? null : blankToNull(result.notes),
    exercises: entry.exercises.map(({ exercise, set_logs }) =>
      exerciseDetail(exercise, set_logs),
    ),
  }
}

/**
 * The measurements a block's result is read for — its structure's, and the
 * ladder override.
 *
 * Total over `structure_type` with no default arm, so a seventh structure fails
 * to compile here rather than rendering a block whose outcome nobody decided
 * how to read. Every reading drops a null: the column being empty means the
 * structure does not measure that, or nothing measured it.
 */
export function blockOutcome(
  block: WorkoutBlockRow,
  result: BlockResultRow,
): readonly OutcomeMeasurement[] {
  const readings: (OutcomeMeasurement | null)[] = []

  // A ladder is a rep scheme rather than a structure type (`workout_blocks`
  // carries both), so the rung it reached is read alongside whatever its
  // structure measures rather than instead of it.
  if (isLadderScheme(block.rep_scheme)) {
    readings.push(measurement('Highest rung', result.highest_rung, String))
  }

  switch (block.structure_type) {
    case 'standard':
    case 'superset':
      // Nothing structural to read: these have no clock and no rounds of their
      // own, and their record of what happened is the set logs below. The
      // effort and the notes are shown for every structure, above.
      break

    case 'circuit':
      readings.push(roundsMeasurement(block, result))
      readings.push(measurement('Elapsed', result.elapsed_seconds, formatElapsed))
      break

    case 'emom':
      readings.push(
        measurement(
          'Minutes',
          result.minutes_completed,
          (minutes) => withTotal(minutes, prescribedMinutes(block)),
        ),
      )
      break

    case 'amrap':
      readings.push(roundsMeasurement(block, result))
      readings.push(
        measurement(
          'Partial round',
          result.partial_round_reps,
          (reps) => `${reps} ${reps === 1 ? 'rep' : 'reps'}`,
        ),
      )
      break

    case 'for_time':
      readings.push(measurement('Elapsed', result.elapsed_seconds, formatElapsed))
      readings.push(
        measurement('Cap', result.completed_under_cap, (under) =>
          under ? 'Finished under the cap' : 'Stopped at the cap',
        ),
      )
      break
  }

  return readings.filter((reading): reading is OutcomeMeasurement => reading !== null)
}

function exerciseDetail(
  exercise: WorkoutExerciseRow,
  setLogs: readonly ExerciseSetLogRow[],
): ExerciseDetailView {
  const lineage = prescriptionLineage(exercise)

  return {
    id: exercise.id,
    name: exerciseName(exercise.exercise_id),
    prescription: prescriptionText(exercise),
    status: exercise.execution_status,
    statusLabel: STATUS_LABELS[exercise.execution_status],
    lineage,
    lineageLabel: LINEAGE_LABELS[lineage],
    sets: setLogs.map(loggedSet),
  }
}

/**
 * Where this prescription came from, read off the two columns that record it.
 *
 * `revision_status` is the one that matters most: a superseded row in an
 * `as performed` answer is there *because* it was performed, so it is the
 * swapped-out movement and the sets under it are real work. A row that is
 * active and `revised` is what replaced something, and a row that is active
 * and `generated` is what the model composed.
 */
export function prescriptionLineage(exercise: WorkoutExerciseRow): PrescriptionLineage {
  if (exercise.revision_status === 'superseded') return 'replaced'
  if (exercise.origin === 'revised' || exercise.replaces_id !== null) return 'substituted'
  return 'prescribed'
}

/** One set's columns, each formatted or absent. Nothing here invents a zero. */
export function loggedSet(row: ExerciseSetLogRow): LoggedSetView {
  return {
    key: row.id,
    setNumber: row.set_number,
    isWarmup: row.is_warmup_set,
    reps:
      row.actual_reps === null
        ? null
        : `${row.actual_reps} ${row.actual_reps === 1 ? 'rep' : 'reps'}`,
    weight: row.weight === null ? null : `${formatNumber(row.weight)} ${row.weight_unit}`,
    rpe: row.rpe === null ? null : `RPE ${formatNumber(row.rpe)}`,
    duration:
      row.actual_duration_seconds === null ? null : `${row.actual_duration_seconds}s`,
    distance:
      row.actual_distance === null
        ? null
        : `${formatNumber(row.actual_distance)} ${row.actual_distance_unit ?? ''}`.trim(),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatting
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A reading, or null when the column is empty. The formatter is only ever
 * handed a value, so no reading has to defend itself against null twice.
 */
function measurement<T>(
  label: string,
  value: T | null,
  format: (value: T) => string,
): OutcomeMeasurement | null {
  return value === null ? null : { label, value: format(value) }
}

/** Rounds against the prescription, because `4 of 5` is the fact `4` is not. */
function roundsMeasurement(
  block: WorkoutBlockRow,
  result: BlockResultRow,
): OutcomeMeasurement | null {
  return measurement('Rounds', result.rounds_completed, (rounds) =>
    withTotal(rounds, block.rounds),
  )
}

/** `4 of 5` when the prescription states a total, `4` when it does not. */
function withTotal(value: number, total: number | null): string {
  return total === null ? String(value) : `${value} of ${total}`
}

const SECONDS_PER_MINUTE = 60

/** The EMOM's window in whole minutes — the grid it was run against. */
function prescribedMinutes(block: WorkoutBlockRow): number | null {
  if (block.timer_seconds === null) return null
  return Math.floor(block.timer_seconds / SECONDS_PER_MINUTE)
}

/**
 * Which duration to show. The measured one when the session measured it, the
 * generator's computed length otherwise, and nothing at all when neither
 * exists — a session that was never started has no duration, and `0 min` would
 * be a claim about how long it took.
 */
function sessionDuration(actual: number | null, computed: number | null): string | null {
  const minutes = actual ?? computed
  return minutes === null ? null : `${minutes} min`
}

/**
 * An instant, in the app's own order: `24 Sep 2026, 09:40`.
 *
 * The zone is the reader's, unlike `formatDay`, and deliberately: `as_of` is a
 * timestamp rather than a calendar day, and a moment shown in UTC to somebody
 * who trained at seven in the evening is a moment they will not recognise.
 */
export function formatInstant(iso: string): string {
  const parsed = Date.parse(iso)
  // Unparseable means the boundary let something through that its schema says
  // it cannot. Showing the raw string beats showing `Invalid Date`.
  if (Number.isNaN(parsed)) return iso

  return INSTANT_FORMAT.format(new Date(parsed)).replace(' at ', ', ')
}

const INSTANT_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

/** Trailing zeros are noise on a weight: `60`, not `60.0`. */
function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)))
}

function blankToNull(value: string | null): string | null {
  if (value === null) return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}
