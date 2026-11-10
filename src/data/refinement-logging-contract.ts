/**
 * TASK-030 (REQ-030; AC-R030-01, AC-R030-02, AC-R030-03) — the logging
 * field-to-contract matrix, as data the tests bind to real code.
 *
 * The prose, the reconciliation of the 16 moments, the reuse-versus-migration
 * reasoning and the draft SQL live in `docs/specs/LOGGING_FIELD_CONTRACT.md`.
 * This module is the machine-checkable half of the same matrix:
 *
 *   · `LOGGING_MOMENTS` — the 16 logging moments of the accepted reference
 *     (`gallery-refinement-data.ts`, REUSE.md "All 16 contexts"), each naming
 *     its schema, validators, the one writer it saves through today, its
 *     identity, its null / zero / update meaning, where an unsaved draft lives,
 *     and who reads it back.
 *   · `LOGGING_FIELDS` — every measurement, load, effort and note field a
 *     moment writes today, plus every field proposed for the richer timed
 *     results, each with its status: `existing`, `legacy` (kept, never written
 *     by the current UI), or `proposed-migration` (needs `MIG-A` / `MIG-B`).
 *   · `PROPOSED_PATHS` — the proposed writers and read models, each with the
 *     dependent task that owns it.
 *   · Three pure contract functions for the proposed timed fields:
 *     `partialRoundFor` (which round a per-movement partial belongs to, from
 *     the block's own recorded outcome), `loadApplies` (the set logger's own
 *     loaded-movement rule) and `movementActualFromDraft` (one movement's entry
 *     to the proposed row, or the field it is refused on).
 *
 * What it deliberately is not:
 *
 *   · Not a writer. It imports no client, builds no request and calls no
 *     database. Nothing in `src/` imports it at runtime; dependent tasks
 *     (TASK-015, TASK-031, TASK-032, TASK-036, TASK-043–TASK-047) import it to
 *     build against the same contract.
 *   · Not a migration. `MIG-A` and `MIG-B` are drafts in the specification,
 *     owned by TASK-031, and applying either to any hosted project needs the
 *     owner's separate live authority.
 *   · Not a second schema. The proposed values are validated by the existing
 *     validators (`isRecordedEffort`, `setLogViolation`); the zod row schemas
 *     for `MIG-A` / `MIG-B` belong in `src/state/schemas.ts` once the columns
 *     exist, which is TASK-031's.
 */
import type { Enums } from './database.types'
import type { BlockOutcome } from '../state/block-completion'
import { createError, err, ErrorCode, ok, type Result } from '../state/errors'
import type { PrescribedColumns } from '../state/prescription'
import { incrementFor } from '../state/progression'
import type { WorkoutBlockRow } from '../state/schemas'
import { setLogViolation, type SetLogEntry } from '../state/set-logging'

// ─────────────────────────────────────────────────────────────────────────────
// Vocabulary
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The 16 logging moments, by the accepted reference's stable gallery ids and in
 * its order (`src/dev/gallery-refinement-data.ts` `LOGGING_CONTEXTS`, gallery
 * `eded158c…`; REQ-019's coverage states list the same 16). LOGGING-FIELDS.md
 * has 15 rows because its first row covers two of them: anchor / primary lift
 * and other lift.
 */
export const LOGGING_MOMENT_IDS = [
  'anchor',
  'other-lift',
  'timed-movement',
  'distance-movement',
  'extra-set',
  'set-correction',
  'superset',
  'circuit-round',
  'circuit-movement',
  'movement-note',
  'workout-feedback',
  'rest-day',
  'emom',
  'amrap',
  'for_time',
  'ladder',
] as const

export type LoggingMomentId = (typeof LOGGING_MOMENT_IDS)[number]

/** The tasks a contract row hands work to. Nothing here is theirs to close. */
export type DependentTask =
  | 'TASK-013'
  | 'TASK-015'
  | 'TASK-019'
  | 'TASK-031'
  | 'TASK-032'
  | 'TASK-036'
  | 'TASK-043'
  | 'TASK-044'
  | 'TASK-045'
  | 'TASK-046'
  | 'TASK-047'
  | 'TASK-048'

/**
 * Where a field stands today.
 *
 *   · `existing` — a column with a current writer.
 *   · `legacy` — a column kept for its historical rows and meaning, which the
 *     current UI never writes (it writes `null`).
 *   · `prescription` — read by logging, never written by it.
 *   · `proposed-migration` — needs a column or table that does not exist.
 */
export type FieldStatus = 'existing' | 'legacy' | 'prescription' | 'proposed-migration'

/** The two isolated schema prerequisites, drafted in the specification. */
export type MigrationId = 'MIG-A' | 'MIG-B'

/**
 * A named export in a source file. With `member`, a method reached from what
 * the export builds (`setLogs.mutate` on what `createWorkoutClients` returns).
 *
 *   · `proposedBy`: it does not exist yet; that task adds it. The name is this
 *     contract's suggestion, and the task records the name it actually uses
 *     when it lands the field (the tests fail until it does).
 *   · `extendedBy`: it exists and does not carry this field yet; that task
 *     extends it.
 */
export interface SourceRef {
  readonly module: string
  readonly name: string
  readonly member?: string
  readonly proposedBy?: DependentTask
  readonly extendedBy?: DependentTask
}

export interface LoggingMomentContract {
  readonly id: LoggingMomentId
  /** The accepted reference's title for the context. */
  readonly title: string
  /** The LOGGING-FIELDS.md row this moment reconciles to. */
  readonly sourceRow: string
  /** Where the moment is entered in the app today. */
  readonly entry: readonly SourceRef[]
  /** The schemas that state its rows and payloads. */
  readonly schemas: readonly SourceRef[]
  /** What refuses a value before (or as) it is written. */
  readonly validators: readonly SourceRef[]
  /** The one existing writer it saves through. */
  readonly writer: SourceRef
  /** The table(s) and the key a saved value attaches to. */
  readonly identity: string
  /** Fields (ids into `LOGGING_FIELDS`) the moment writes today. */
  readonly fields: readonly string[]
  /** Fields proposed for this moment; none of them is written today. */
  readonly proposed: readonly string[]
  readonly nullMeans: string
  readonly zeroMeans: string
  readonly update: string
  /** Where an unsaved value lives before the writer is called. */
  readonly draft: string
  readonly readback: {
    readonly workout: string
    readonly history: string
  }
  /** The real readers named by `readback`. */
  readonly readers: readonly SourceRef[]
  /** The dependent tasks that adopt or extend this moment. */
  readonly owners: readonly DependentTask[]
}

export interface FieldContract {
  /** `table.column` — the table is a draft name for a proposed field. */
  readonly id: string
  readonly status: FieldStatus
  readonly table: string
  readonly column: string
  /** The SQL type, as the migration states it (or the draft does). */
  readonly type: string
  readonly meaning: string
  readonly nullMeans: string
  /** What a zero means, or `null` where the column is not numeric. */
  readonly zeroMeans: string | null
  readonly update: string
  readonly validators: readonly SourceRef[]
  /** The writer that sends it, or `null` for a column nothing writes now. */
  readonly writer: SourceRef | null
  readonly readers: readonly SourceRef[]
  readonly migration: MigrationId | null
  /** The dependent tasks that own the proposed or follow-up work. */
  readonly owners: readonly DependentTask[]
}

export interface ProposedPath {
  readonly id: string
  readonly kind: 'writer' | 'read-model' | 'schema' | 'draft' | 'migration' | 'live-authority'
  readonly summary: string
  /** What existing schema/source it reuses, or the migration it needs. */
  readonly basis: string
  readonly ref: SourceRef | null
  readonly owner: DependentTask | 'owner'
}

// ─────────────────────────────────────────────────────────────────────────────
// Source references
// ─────────────────────────────────────────────────────────────────────────────

const SCHEMAS = 'src/state/schemas.ts'
const SET_LOGGING = 'src/state/set-logging.ts'
const BLOCK_COMPLETION = 'src/state/block-completion.ts'
const OBSERVATION = 'src/state/set-observation-mutation.ts'
const WORKOUT_DATA = 'src/data/workout.ts'
const SESSION_DETAIL = 'src/state/session-detail.ts'

const schema = (name: string): SourceRef => ({ module: SCHEMAS, name })

const SET_WRITER: SourceRef = { module: WORKOUT_DATA, name: 'createWorkoutClients', member: 'setLogs.mutate' }
const BLOCK_WRITER: SourceRef = { module: WORKOUT_DATA, name: 'createWorkoutClients', member: 'blockResults.record' }
const NOTE_WRITER: SourceRef = { module: WORKOUT_DATA, name: 'createWorkoutClients', member: 'exercises.saveNotes' }
const DEBRIEF_WRITER: SourceRef = { module: 'src/data/summary.ts', name: 'createSummaryClient', member: 'saveDebrief' }
const REST_DAY_WRITER: SourceRef = { module: 'src/data/rest-days.ts', name: 'createRestDayClient', member: 'mark' }

const SET_VALIDATORS: readonly SourceRef[] = [
  { module: SET_LOGGING, name: 'setLogViolation' },
  { module: SET_LOGGING, name: 'isRecordedEffort' },
  { module: OBSERVATION, name: 'setObservationMutation' },
  { module: OBSERVATION, name: 'parseSetObservationAck' },
]
const BLOCK_VALIDATORS: readonly SourceRef[] = [
  { module: BLOCK_COMPLETION, name: 'blockResultInsert' },
  { module: BLOCK_COMPLETION, name: 'isPerceivedEffort' },
]

const WORKOUT_SET_READER: SourceRef = { module: SET_LOGGING, name: 'loggedSetFromRow' }
const HISTORY_READER: SourceRef = { module: SESSION_DETAIL, name: 'sessionDetail' }
const HISTORY_SET_READER: SourceRef = { module: SESSION_DETAIL, name: 'loggedSet' }
const HISTORY_OUTCOME_READER: SourceRef = { module: SESSION_DETAIL, name: 'blockOutcome' }
const SET_ROW_READING: SourceRef = { module: 'src/ui/set-effort.tsx', name: 'SetEffortReading' }
/** `conditioning_history` (20260921000012) → the like-for-like score and trend read every outcome column. */
const CONDITIONING_READER: SourceRef = { module: 'src/state/conditioning.ts', name: 'timedOutcome' }

const SET_SCHEMAS: readonly SourceRef[] = [
  schema('exerciseSetLogRowSchema'),
  schema('setEffortSchema'),
  schema('sessionSnapshotSchema'),
  schema('sessionReconstructionSchema'),
]
const BLOCK_SCHEMAS: readonly SourceRef[] = [
  schema('blockResultRowSchema'),
  schema('sessionReconstructionSchema'),
]

// ─────────────────────────────────────────────────────────────────────────────
// Shared wording
// ─────────────────────────────────────────────────────────────────────────────

const SET_IDENTITY =
  'exercise_set_logs: one row per (workout_exercise_id, set_number) on the active prescription performed; ' +
  'id is client-minted (the observation id), so a retried flush collides instead of duplicating'
const SET_NULL = 'a null measurement is not recorded; no row is no set recorded at that set number; skipped is workout_exercises.execution_status'
const SET_ZERO = 'zero is a measured result (0 reps is a failed attempt), distinct from null'
const SET_UPDATE =
  'correct and clear are ordered mutate_set_observation requests against the row id (expected revision + 1) while the session is active; ' +
  'a correction restates every measurement, the unit and the effort; set_number, rpe and is_warmup_set never change; a clear deletes the row and keeps its receipt'
const SET_DRAFT = 'the open sheet holds the typed draft; once submitted, the durable queue clear.set-log-queue holds it until the receipt settles it'
const SET_WORKOUT = 'the set row on the card: loggedSetFromRow / loggedSetFromEntry (syncing or failed until the receipt), SetEffortReading for the category'
const SET_HISTORY =
  'History /history/:id: sessionDetail → loggedSet shows reps, weight with its stamped unit, legacy RPE, time and distance; ' +
  'the per-set effort category is not read by History today (observation, not changed here)'
const BLOCK_IDENTITY =
  'block_results: one row per block (UNIQUE block_id), written once by the section forward action; a repeated insert answers 409 (23505) and counts as already recorded'
const BLOCK_UPDATE =
  'insert-once today: no client corrects a saved row (the UPDATE grant and block_results_update_own policy exist; the writer is TASK-031’s)'

const SET_OWNERS: readonly DependentTask[] = ['TASK-043', 'TASK-019']

// ─────────────────────────────────────────────────────────────────────────────
// The 16 moments
// ─────────────────────────────────────────────────────────────────────────────

function setMoment(
  id: LoggingMomentId,
  title: string,
  sourceRow: string,
  extra: { identity?: string; fields: readonly string[]; nullMeans?: string; entry?: readonly SourceRef[]; owners?: readonly DependentTask[] },
): LoggingMomentContract {
  return {
    id,
    title,
    sourceRow,
    entry: extra.entry ?? [
      { module: 'src/ui/set-logger.tsx', name: 'ExerciseSetLogger' },
      { module: 'src/ui/set-logging-sheet.tsx', name: 'SetLoggingSheet' },
    ],
    schemas: SET_SCHEMAS,
    validators: SET_VALIDATORS,
    writer: SET_WRITER,
    identity: extra.identity ?? SET_IDENTITY,
    fields: extra.fields,
    proposed: [],
    nullMeans: extra.nullMeans ?? SET_NULL,
    zeroMeans: SET_ZERO,
    update: SET_UPDATE,
    draft: SET_DRAFT,
    readback: { workout: SET_WORKOUT, history: SET_HISTORY },
    readers: [WORKOUT_SET_READER, SET_ROW_READING, HISTORY_READER, HISTORY_SET_READER],
    owners: extra.owners ?? SET_OWNERS,
  }
}

const LIFT_FIELDS = [
  'exercise_set_logs.actual_reps',
  'exercise_set_logs.weight',
  'exercise_set_logs.weight_unit',
  'exercise_set_logs.effort',
] as const

/** Every timed family's proposed additions. Notes reuse an existing column. */
const TIMED_PROPOSED_COMMON = ['block_results.effort', 'block_movement_results.weight', 'block_movement_results.weight_unit'] as const
const TIMED_PARTIALS = [
  'block_movement_results.round_number',
  'block_movement_results.actual_reps',
  'block_movement_results.actual_duration_seconds',
  'block_movement_results.actual_distance',
  'block_movement_results.actual_distance_unit',
] as const

const TIMED_READERS: readonly SourceRef[] = [HISTORY_READER, HISTORY_OUTCOME_READER]
const TIMED_OWNERS: readonly DependentTask[] = ['TASK-015', 'TASK-031', 'TASK-046', 'TASK-047', 'TASK-019']

export const LOGGING_MOMENTS: readonly LoggingMomentContract[] = [
  setMoment('anchor', 'Anchor / primary lift', 'Anchor / primary and other lift', {
    fields: LIFT_FIELDS,
    entry: [
      { module: 'src/ui/standard-block.tsx', name: 'StandardBlock' },
      { module: 'src/ui/set-logger.tsx', name: 'ExerciseSetLogger' },
      { module: 'src/ui/set-logging-sheet.tsx', name: 'SetLoggingSheet' },
    ],
  }),
  setMoment('other-lift', 'Other lift', 'Anchor / primary and other lift', {
    fields: LIFT_FIELDS,
    entry: [
      { module: 'src/ui/standard-block.tsx', name: 'StandardBlock' },
      { module: 'src/ui/set-logger.tsx', name: 'ExerciseSetLogger' },
      { module: 'src/ui/set-logging-sheet.tsx', name: 'SetLoggingSheet' },
    ],
  }),
  setMoment('timed-movement', 'Timed movement', 'Timed movement', {
    fields: [
      'exercise_set_logs.actual_duration_seconds',
      'exercise_set_logs.weight',
      'exercise_set_logs.weight_unit',
      'exercise_set_logs.effort',
    ],
    nullMeans:
      `${SET_NULL}; weight is offered for a loaded prescription (incrementFor(equipment_used) is not null), and on an ` +
      'unloaded one only when a weight is carried forward from this movement’s earlier set or the set being corrected has one (showLoad)',
  }),
  setMoment('distance-movement', 'Distance movement', 'Distance movement', {
    fields: [
      'exercise_set_logs.actual_distance',
      'exercise_set_logs.actual_distance_unit',
      'exercise_set_logs.weight',
      'exercise_set_logs.weight_unit',
      'exercise_set_logs.effort',
    ],
    nullMeans: `${SET_NULL}; a distance is written only with the prescription's own unit (distance_has_unit)`,
  }),
  setMoment('extra-set', 'Extra set', 'Extra set', {
    fields: LIFT_FIELDS,
    identity: `${SET_IDENTITY}; an extra set is the next set_number past workout_exercises.sets (no new data type)`,
  }),
  setMoment('set-correction', 'Saved-set correction', 'Saved-set correction', {
    fields: [...LIFT_FIELDS, 'exercise_set_logs.actual_duration_seconds', 'exercise_set_logs.actual_distance'],
    identity: `${SET_IDENTITY}; a correction or clear is addressed to the row id, never to the set number`,
  }),
  setMoment('superset', 'Superset round', 'Superset round', {
    fields: LIFT_FIELDS,
    identity:
      `${SET_IDENTITY}; every Performed movement in a round logs the same set_number (the round), ` +
      'and a movement not ticked writes no row, so it keeps a gap at that number',
    entry: [
      { module: 'src/ui/superset-block.tsx', name: 'SupersetBlock' },
      { module: 'src/ui/set-logger.tsx', name: 'SupersetRoundSheet' },
    ],
    owners: ['TASK-044', 'TASK-019'],
  }),
  {
    id: 'circuit-round',
    title: 'Circuit round / take back',
    sourceRow: 'Circuit round / take back',
    entry: [{ module: 'src/ui/circuit-block.tsx', name: 'CircuitBlock' }],
    schemas: BLOCK_SCHEMAS,
    validators: BLOCK_VALIDATORS,
    writer: BLOCK_WRITER,
    identity: `${BLOCK_IDENTITY}; round position and each round's timing stay in the circuit controller (clear.workout-circuits), never in the row`,
    fields: ['block_results.rounds_completed'],
    proposed: [],
    nullMeans: 'rounds_completed is null when no round was recorded: the circuit reports nothing for 0 rounds, so a circuit zero is not stored (its own rule)',
    zeroMeans: 'not produced by the circuit; Take back a round returns to the same nothing',
    update: `${BLOCK_UPDATE}; before the save, Finish round and Take back a round change the controller's count`,
    draft: 'clear.workout-circuits (round, position, rest and round timings) until the section saves; round times are never written to block_results',
    readback: {
      workout: 'the circuit card reads its controller record (rounds recorded, round times)',
      history: 'History reads Rounds N of M from rounds_completed; no reading when null',
    },
    readers: TIMED_READERS,
    owners: ['TASK-044', 'TASK-019'],
  },
  setMoment('circuit-movement', 'Circuit movement entry', 'Circuit movement entry', {
    fields: LIFT_FIELDS,
    identity: `${SET_IDENTITY}; set_number is that movement's next logged entry, while the circuit controller keeps round position and time`,
    entry: [
      { module: 'src/ui/circuit-block.tsx', name: 'CircuitBlock' },
      { module: 'src/ui/set-logger.tsx', name: 'ExerciseSetLogger' },
    ],
    owners: ['TASK-044', 'TASK-036', 'TASK-019'],
  }),
  {
    id: 'movement-note',
    title: 'Movement note',
    sourceRow: 'Movement note',
    entry: [{ module: 'src/ui/exercise-coaching.tsx', name: 'GroupExerciseCoaching' }],
    schemas: [schema('workoutExerciseRowSchema')],
    validators: [schema('workoutExerciseRowSchema')],
    writer: NOTE_WRITER,
    identity: 'workout_exercises.exercise_notes on that one prescription row (workout_exercises.id); a swap leaves the note on the row it was written on',
    fields: ['workout_exercises.exercise_notes'],
    proposed: [],
    nullMeans: 'null is no note; the panel saves an emptied field as null',
    zeroMeans: 'not numeric',
    update: 'an UPDATE of the one column, answered with the stored row; an update that matches nothing is PERSISTENCE_WRITE_FAILED',
    draft: 'the panel field (memory) until Save; the last successful save is cached under exercise-notes:<id>',
    readback: {
      workout: 'the Coaching and notes panel: useExerciseNotes().stored, falling back to the snapshot column',
      history: 'not read by History today',
    },
    readers: [{ module: 'src/state/exercise-queries.ts', name: 'useExerciseNotes' }],
    owners: ['TASK-045', 'TASK-019'],
  },
  {
    id: 'workout-feedback',
    title: 'Workout feedback',
    sourceRow: 'Workout feedback',
    entry: [
      { module: 'src/app/Summary.tsx', name: 'Summary' },
      { module: 'src/ui/feeling-row.tsx', name: 'FeelingRow' },
    ],
    schemas: [schema('sessionDebriefSchema'), schema('workoutSessionRowSchema')],
    validators: [schema('sessionDebriefSchema')],
    writer: DEBRIEF_WRITER,
    identity: 'workout_sessions.mood and workout_sessions.session_notes on the session row',
    fields: ['workout_sessions.mood', 'workout_sessions.session_notes'],
    proposed: [],
    nullMeans: 'null mood is not answered (never the middle face); null notes is nothing written (the form saves blank as null)',
    zeroMeans: 'mood has no zero: the scale is 1–5 and 0 is refused',
    update: 'each save restates both columns (UPDATE of the session row) and answers the stored row',
    draft: 'the Summary form (memory), initialised from the stored row',
    readback: {
      workout: 'the Summary form reads the stored row',
      history: 'History reads mood (moodStep) and session notes on /history/:id',
    },
    readers: [HISTORY_READER],
    owners: ['TASK-045', 'TASK-019'],
  },
  {
    id: 'rest-day',
    title: 'Rest day / reason change',
    sourceRow: 'Rest day / reason change',
    entry: [{ module: 'src/app/Home.tsx', name: 'Home' }],
    schemas: [schema('restDayMarkSchema'), schema('restDayRowSchema')],
    validators: [schema('restDayMarkSchema')],
    writer: REST_DAY_WRITER,
    identity: 'rest_days: one row per (user_id, day), upserted by mark_rest_day; the owner is auth.uid(), never the browser',
    fields: ['rest_days.reason', 'rest_days.note'],
    proposed: [],
    nullMeans: 'a day with no row is unmarked; note is null (the existing writer always sends null, and the function stores a blank note as null)',
    zeroMeans: 'not numeric',
    update: 'marking the same day again replaces reason and note in the one row',
    draft: 'the Reason select (memory) until saved',
    readback: {
      workout: 'Home reads the mark back (Today: <reason>) and the streak rules read every mark (restDayStreakPolicy)',
      history: 'History lists rest as derived calendar gaps, not from this row',
    },
    readers: [
      { module: 'src/data/rest-days.ts', name: 'readRestDays' },
      { module: 'src/state/rest-days.ts', name: 'restDayStreakPolicy' },
    ],
    owners: ['TASK-045', 'TASK-019'],
  },
  {
    id: 'emom',
    title: 'EMOM results',
    sourceRow: 'EMOM',
    entry: [
      { module: 'src/ui/emom-block.tsx', name: 'EmomBlock' },
      { module: 'src/ui/refinements/timed-result-log.tsx', name: 'TimedResultLog' },
    ],
    schemas: BLOCK_SCHEMAS,
    validators: BLOCK_VALIDATORS,
    writer: BLOCK_WRITER,
    identity: `${BLOCK_IDENTITY}; the EMOM reports { notes } from its end log, or {}`,
    fields: ['block_results.notes', 'block_results.minutes_completed'],
    proposed: [...TIMED_PROPOSED_COMMON],
    nullMeans: 'minutes_completed stays null for every ending (no minutes tally; the schedule is assumed); a blank note is not reported',
    zeroMeans: 'no EMOM value is numeric now; older rows keep their minutes_completed, read as Minutes N of M',
    update: BLOCK_UPDATE,
    draft: 'the end-log note is this mount’s memory (kept across a failed save and retry, lost on reload); the clock is clear.workout-emom',
    readback: {
      workout: 'the EMOM card while unsaved; after the save the log steps aside (Block saved)',
      history: 'History shows block notes; Minutes N of M only for an older row that has minutes_completed',
    },
    readers: TIMED_READERS,
    owners: TIMED_OWNERS,
  },
  {
    id: 'amrap',
    title: 'AMRAP results',
    sourceRow: 'AMRAP',
    entry: [
      { module: 'src/ui/amrap-block.tsx', name: 'AmrapBlock' },
      { module: 'src/ui/refinements/timed-result-log.tsx', name: 'TimedResultLog' },
    ],
    schemas: BLOCK_SCHEMAS,
    validators: [...BLOCK_VALIDATORS, { module: 'src/state/amrap.ts', name: 'amrapOutcome' }],
    writer: BLOCK_WRITER,
    identity: `${BLOCK_IDENTITY}; amrapOutcome reports elapsedSeconds and, once the window has closed, the recorded counts`,
    fields: ['block_results.elapsed_seconds', 'block_results.rounds_completed', 'block_results.partial_round_reps'],
    proposed: ['block_results.notes', ...TIMED_PROPOSED_COMMON, ...TIMED_PARTIALS],
    nullMeans: 'blank rounds or partial reps are null (not recorded); stopping and the cap never fill them',
    zeroMeans: 'an explicit 0 rounds or 0 partial reps is stored as 0 and read as such',
    update: `${BLOCK_UPDATE}; before the save every tap rewrites clear.workout-amraps`,
    draft: 'clear.workout-amraps (clock and both counts), restored on reload',
    readback: {
      workout: 'the AMRAP card and its like-for-like score line',
      history: 'History reads Rounds N (of M) and Partial round N reps; a null count has no reading',
    },
    readers: TIMED_READERS,
    owners: TIMED_OWNERS,
  },
  {
    id: 'for_time',
    title: 'For Time results',
    sourceRow: 'For Time',
    entry: [
      { module: 'src/ui/for-time-block.tsx', name: 'ForTimeBlock' },
      { module: 'src/ui/refinements/timed-result-log.tsx', name: 'TimedResultLog' },
    ],
    schemas: BLOCK_SCHEMAS,
    validators: [...BLOCK_VALIDATORS, { module: 'src/state/for-time.ts', name: 'forTimeOutcome' }],
    writer: BLOCK_WRITER,
    identity:
      `${BLOCK_IDENTITY}; forTimeOutcome reports elapsedSeconds and the completion answer, and no rounds count; ` +
      'workout_blocks.rounds may be null, 1 or more, so a proposed partial has round 1 only for a single pass and none for a ' +
      'multi-round race until a completed-rounds count is recorded (TASK-015)',
    fields: ['block_results.elapsed_seconds', 'block_results.completed_under_cap'],
    proposed: ['block_results.notes', ...TIMED_PROPOSED_COMMON, ...TIMED_PARTIALS],
    nullMeans: 'completed_under_cap is null before the race ends, with no cap, or when recorded mid-race; Finish alone never claims the work',
    zeroMeans: 'elapsed_seconds 0 is a measured time; an unstarted race reports no time at all',
    update: `${BLOCK_UPDATE}; before the save the athlete's Complete/Incomplete is kept as workCompleted on clear.workout-for-time`,
    draft: 'clear.workout-for-time (clock stamps and workCompleted); the effort faces are memory only and not saved',
    readback: {
      workout: 'the For Time card; completion chips are disabled once the row is saved',
      history: 'History reads Elapsed and Cap · Finished under the cap / Stopped at the cap / Incomplete (no rounds reading)',
    },
    readers: TIMED_READERS,
    owners: TIMED_OWNERS,
  },
  {
    id: 'ladder',
    title: 'Ladder results',
    sourceRow: 'Ladder',
    entry: [
      { module: 'src/ui/ladder-block.tsx', name: 'LadderBlock' },
      { module: 'src/ui/refinements/timed-result-log.tsx', name: 'TimedResultLog' },
    ],
    schemas: BLOCK_SCHEMAS,
    validators: BLOCK_VALIDATORS,
    writer: BLOCK_WRITER,
    identity:
      `${BLOCK_IDENTITY}; highest_rung is the last completed rung, 1-based (Complete records the top rung); ` +
      'the ordered progress and Finish checkpoint are held by TASK-032’s durable ladder attempt (session, block and attempt identity) and recorded by TASK-013',
    fields: ['block_results.highest_rung'],
    proposed: ['block_results.notes', ...TIMED_PROPOSED_COMMON, ...TIMED_PARTIALS],
    nullMeans: 'highest_rung is null when unanswered or Incomplete with no rung chosen',
    zeroMeans: 'the column admits 0 (no rung completed); the ladder log records it when the athlete states that no round was completed (TASK-013), never for nothing stated',
    update: BLOCK_UPDATE,
    draft: 'the race clock, live checked progress and the answer and rounds are TASK-032’s durable attempt (clear.workout-ladders, usePersistedLadder: progress, draft, Finish checkpoint, original cap), adopted by TASK-013, which imports the checked prefix at Finish or the cap; effort is still the renderer’s memory (no writer); Undo, the shared log and visible recovery are TASK-014/TASK-046/TASK-048',
    readback: {
      workout: 'the ladder card while unsaved, its answer and rounds restored from the durable attempt after a reload; a saved ladder whose row this device did not see saved claims no answer',
      history: 'History reads Highest rung N',
    },
    readers: TIMED_READERS,
    owners: ['TASK-013', 'TASK-015', 'TASK-031', 'TASK-032', 'TASK-046', 'TASK-047', 'TASK-048', 'TASK-019'],
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Fields
// ─────────────────────────────────────────────────────────────────────────────

function setField(
  column: string,
  type: string,
  meaning: string,
  zeroMeans: string | null,
  extra: { nullMeans?: string; validators?: readonly SourceRef[]; owners?: readonly DependentTask[] } = {},
): FieldContract {
  return {
    id: `exercise_set_logs.${column}`,
    status: 'existing',
    table: 'exercise_set_logs',
    column,
    type,
    meaning,
    nullMeans: extra.nullMeans ?? 'not recorded',
    zeroMeans,
    update: 'restated by a correct mutation; removed with the row by a clear',
    validators: extra.validators ?? [{ module: SET_LOGGING, name: 'setLogViolation' }, schema('exerciseSetLogRowSchema')],
    writer: SET_WRITER,
    readers: [WORKOUT_SET_READER, HISTORY_SET_READER],
    migration: null,
    owners: extra.owners ?? ['TASK-043', 'TASK-044'],
  }
}

function blockField(
  column: string,
  type: string,
  meaning: string,
  nullMeans: string,
  zeroMeans: string | null,
  owners: readonly DependentTask[] = ['TASK-031', 'TASK-047'],
  readers: readonly SourceRef[] = [HISTORY_OUTCOME_READER, CONDITIONING_READER],
): FieldContract {
  return {
    id: `block_results.${column}`,
    status: 'existing',
    table: 'block_results',
    column,
    type,
    meaning,
    nullMeans,
    zeroMeans,
    update: BLOCK_UPDATE,
    validators: [...BLOCK_VALIDATORS, schema('blockResultRowSchema')],
    writer: BLOCK_WRITER,
    readers,
    migration: null,
    owners,
  }
}

/** MIG-B's draft columns: the set log's measurement vocabulary, keyed to the block attempt. */
function movementField(column: string, type: string, meaning: string, zeroMeans: string | null, nullMeans: string): FieldContract {
  return {
    id: `block_movement_results.${column}`,
    status: 'proposed-migration',
    table: 'block_movement_results',
    column,
    type,
    meaning,
    nullMeans,
    zeroMeans,
    update:
      'one row per movement per block attempt, restated whole by a correction; when the block’s recorded progress changes, ' +
      'the amounts are cleared rather than moved to the new round, and the load is kept',
    validators: [
      { module: 'src/data/refinement-logging-contract.ts', name: 'movementActualFromDraft' },
      { module: SET_LOGGING, name: 'setLogViolation' },
    ],
    writer: { module: WORKOUT_DATA, name: 'createWorkoutClients', member: 'blockResults.recordMovements', proposedBy: 'TASK-031' },
    readers: [{ module: SESSION_DETAIL, name: 'movementActualReadings', proposedBy: 'TASK-031' }],
    migration: 'MIG-B',
    owners: ['TASK-031', 'TASK-015', 'TASK-046', 'TASK-047'],
  }
}

export const LOGGING_FIELDS: readonly FieldContract[] = [
  // ── exercise_set_logs — every set moment, through the one durable set path ──
  setField('actual_reps', 'int', 'reps performed in the set (modality reps)', '0 reps is a failed attempt'),
  setField('actual_duration_seconds', 'int', 'seconds held or worked (modality time)', '0 s is a measured result'),
  setField('actual_distance', 'numeric', 'distance covered, in actual_distance_unit (modality distance)', '0 is a measured result', {
    nullMeans: 'not recorded; a value requires its unit (distance_has_unit)',
  }),
  setField('actual_distance_unit', 'distance_unit', 'the prescription’s own distance unit, written only with a distance', null, {
    nullMeans: 'no distance recorded',
  }),
  setField('weight', 'numeric', 'actual load used (never the prescribed load), in the row’s weight_unit', '0 is a measured load', {
    owners: ['TASK-043', 'TASK-044', 'TASK-036'],
  }),
  setField('weight_unit', 'weight_unit NOT NULL', 'kg or lb stamped at write time (the athlete’s choice, else the profile then)', null, {
    nullMeans: 'never null: a set with no unit to stamp is refused, never guessed',
  }),
  setField(
    'effort',
    'set_effort',
    'the per-set category: too_hard, about_right or too_easy; never a number, never rpe',
    null,
    {
      nullMeans: 'unanswered, including every set logged before the column existed',
      validators: [{ module: SET_LOGGING, name: 'isRecordedEffort' }, schema('setEffortSchema'), schema('exerciseSetLogRowSchema')],
    },
  ),
  {
    id: 'exercise_set_logs.rpe',
    status: 'legacy',
    table: 'exercise_set_logs',
    column: 'rpe',
    type: 'numeric(3,1), 1–10',
    meaning: 'historical numeric per-set RPE; never written by the current UI (null), preserved for older rows and replayed older queued entries',
    nullMeans: 'not recorded',
    zeroMeans: 'refused (1–10)',
    update: 'immutable: a correction never changes it',
    validators: [schema('exerciseSetLogRowSchema')],
    writer: null,
    readers: [HISTORY_SET_READER, { module: 'src/data/anchors.ts', name: 'createAnchorsClient', member: 'evidence' }],
    migration: null,
    owners: [],
  },
  // ── block_results — the shell's one writer for every structure ──
  blockField('elapsed_seconds', 'int', 'For Time and AMRAP: the clock actually run', 'not observed (unstarted, or a structure that does not time)', '0 s is a measured time'),
  blockField(
    'completed_under_cap',
    'boolean',
    'For Time: the athlete’s Complete (true) or Incomplete (false) once the race ends; for older rows, finished before the cap',
    'no answer: before the end, no cap, or recorded mid-race',
    null,
  ),
  blockField(
    'rounds_completed',
    'int',
    'AMRAP and circuit rounds the athlete recorded; conditioning also scores a capped For Time from it (with partial_round_reps), which the current For Time card never writes',
    'not recorded (an AMRAP left blank; a circuit with no recorded round)',
    'AMRAP: an explicit 0 rounds',
  ),
  blockField(
    'partial_round_reps',
    'int',
    'AMRAP: reps into the next round, one count for the block; conditioning also reads it for a capped For Time, which the current For Time card never writes',
    'not recorded',
    'an explicit 0',
  ),
  {
    ...blockField(
      'minutes_completed',
      'int',
      'EMOM minutes tally of older rows; no current EMOM writes it (R84: the schedule is assumed, exceptions go in notes)',
      'every current EMOM ending',
      'an older row’s 0 of M',
    ),
    status: 'legacy',
    writer: null,
    owners: [],
  },
  blockField(
    'highest_rung',
    'int',
    'ladder: the last completed rung, 1-based; Complete records the top rung',
    'unanswered, or Incomplete with no rung chosen',
    'no rung completed (admitted by the CHECK; not written by the current renderer)',
    ['TASK-013', 'TASK-031', 'TASK-032', 'TASK-047'],
  ),
  {
    ...blockField(
      'perceived_effort',
      'smallint, 1–10',
      'historical numeric block effort (section RPE); every current row is written null; conditioningTrend reads ≤ 7 as an easy finish',
      'not answered, never low',
      'refused (1–10)',
    ),
    status: 'legacy',
    writer: null,
    readers: [HISTORY_READER, { module: 'src/state/conditioning.ts', name: 'conditioningTrend' }],
    owners: [],
  },
  blockField(
    'notes',
    'text',
    'the athlete’s own words about the block; EMOM writes its exception note here; AMRAP, For Time and ladder notes reuse it (no migration)',
    'nothing written (a blank note is not reported)',
    null,
    ['TASK-015', 'TASK-031', 'TASK-046', 'TASK-047'],
    [HISTORY_OUTCOME_READER],
  ),
  // ── MIG-A — categorical block effort ──
  {
    id: 'block_results.effort',
    status: 'proposed-migration',
    table: 'block_results',
    column: 'effort',
    type: 'set_effort (the existing enum)',
    meaning: 'the optional categorical effort for the whole timed block (the existing three faces); never perceived_effort, never mood',
    nullMeans: 'unanswered, including every row written before the column existed',
    zeroMeans: null,
    update: 'set with the block row; corrected with the row (TASK-031’s correction writer); null clears it',
    validators: [{ module: SET_LOGGING, name: 'isRecordedEffort' }, schema('setEffortSchema')],
    writer: { module: WORKOUT_DATA, name: 'createWorkoutClients', member: 'blockResults.record', extendedBy: 'TASK-031' },
    readers: [{ module: SESSION_DETAIL, name: 'blockOutcome', extendedBy: 'TASK-031' }],
    migration: 'MIG-A',
    owners: ['TASK-031', 'TASK-015', 'TASK-046', 'TASK-047'],
  },
  // ── MIG-B — per-movement timed partials and loads ──
  movementField(
    'round_number',
    'int > 0',
    'the round the partial amounts belong to (partialRoundFor): AMRAP round, ladder rung; For Time round 1 only for a single-pass block, else the round after a recorded completed-rounds count (none without one)',
    null,
    'no amount recorded (a load-only row)',
  ),
  movementField('actual_reps', 'int ≥ 0', 'reps of this movement done in that round (modality reps)', '0 is a measured result', 'not recorded'),
  movementField('actual_duration_seconds', 'int ≥ 0', 'seconds of this movement in that round (modality time)', '0 is a measured result', 'not recorded'),
  movementField('actual_distance', 'numeric ≥ 0', 'distance of this movement in that round (modality distance)', '0 is a measured result', 'not recorded; needs its unit'),
  movementField('actual_distance_unit', 'distance_unit', 'the prescription’s distance unit, only with a distance', null, 'no distance recorded'),
  movementField('weight', 'numeric ≥ 0', 'actual load used for this movement in the attempt, only where loadApplies', '0 is a measured load', 'not recorded'),
  movementField('weight_unit', 'weight_unit NOT NULL', 'stamped at write time, as on a set', null, 'never null'),
  // ── session, prescription and rest-day columns ──
  {
    id: 'workout_sessions.mood',
    status: 'existing',
    table: 'workout_sessions',
    column: 'mood',
    type: 'int, 1–5',
    meaning: 'the session’s five-step feeling (FeelingRow); a different question from any effort',
    nullMeans: 'not answered',
    zeroMeans: 'refused (1–5)',
    update: 'restated by each debrief save',
    validators: [schema('sessionDebriefSchema')],
    writer: DEBRIEF_WRITER,
    readers: [HISTORY_READER],
    migration: null,
    owners: ['TASK-045'],
  },
  {
    id: 'workout_sessions.session_notes',
    status: 'existing',
    table: 'workout_sessions',
    column: 'session_notes',
    type: 'text, at most 2000 characters at the boundary',
    meaning: 'the session’s notes from the debrief',
    nullMeans: 'nothing written (blank is saved as null)',
    zeroMeans: null,
    update: 'restated by each debrief save',
    validators: [schema('sessionDebriefSchema')],
    writer: DEBRIEF_WRITER,
    readers: [HISTORY_READER],
    migration: null,
    owners: ['TASK-045'],
  },
  {
    id: 'workout_exercises.exercise_notes',
    status: 'existing',
    table: 'workout_exercises',
    column: 'exercise_notes',
    type: 'text',
    meaning: 'the athlete’s note on one prescription',
    nullMeans: 'no note (an emptied field saves null)',
    zeroMeans: null,
    update: 'UPDATE of the one column; the stored row is the answer',
    validators: [schema('workoutExerciseRowSchema')],
    writer: NOTE_WRITER,
    readers: [{ module: 'src/state/exercise-queries.ts', name: 'useExerciseNotes' }],
    migration: null,
    owners: ['TASK-045'],
  },
  {
    id: 'workout_exercises.load_value',
    status: 'prescription',
    table: 'workout_exercises',
    column: 'load_value',
    type: 'numeric, with load_type',
    meaning: 'the prescribed load guidance; never copied into an actual weight, never written by a logging moment',
    nullMeans: 'no value (bodyweight, prior_session or none guidance)',
    zeroMeans: null,
    update: 'immutable under append-and-supersede',
    validators: [schema('workoutExerciseRowSchema')],
    writer: null,
    readers: [{ module: 'src/ui/refinements/movement-readings.ts', name: 'liveMovementReadings' }],
    migration: null,
    owners: ['TASK-036'],
  },
  {
    id: 'rest_days.reason',
    status: 'existing',
    table: 'rest_days',
    column: 'reason',
    type: 'rest_day_reason',
    meaning: 'why the day was taken off: rest, injury, sick or vacation (Rest day / Injured / Unwell / Away)',
    nullMeans: 'never null in a row; an unmarked day has no row',
    zeroMeans: null,
    update: 'replaced by marking the same day again',
    validators: [schema('restDayMarkSchema')],
    writer: REST_DAY_WRITER,
    readers: [
      { module: 'src/data/rest-days.ts', name: 'readRestDays' },
      { module: 'src/state/rest-days.ts', name: 'restDayStreakPolicy' },
    ],
    migration: null,
    owners: ['TASK-045'],
  },
  {
    id: 'rest_days.note',
    status: 'existing',
    table: 'rest_days',
    column: 'note',
    type: 'text, at most 2000 characters at the boundary',
    meaning: 'a column the writer supports and the app never fills: Home sends null; no Notes field is added (LOGGING-FIELDS)',
    nullMeans: 'no note',
    zeroMeans: null,
    update: 'replaced (with null) by marking the same day again',
    validators: [schema('restDayMarkSchema')],
    writer: REST_DAY_WRITER,
    readers: [{ module: 'src/data/rest-days.ts', name: 'readRestDays' }],
    migration: null,
    owners: ['TASK-045'],
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Proposed paths and isolated prerequisites
// ─────────────────────────────────────────────────────────────────────────────

export const PROPOSED_PATHS: readonly ProposedPath[] = [
  {
    id: 'MIG-A',
    kind: 'migration',
    summary: 'add block_results.effort public.set_effort (nullable, no default, no backfill)',
    basis: 'reuses the set_effort enum (20261027000027); block_results is granted at table level and reconstructions use to_jsonb(br), so no grant or reader SQL changes',
    ref: null,
    owner: 'TASK-031',
  },
  {
    id: 'MIG-B',
    kind: 'migration',
    summary: 'create block_movement_results: one row per movement per block attempt with round_number, the set log’s measurement columns and a stamped weight_unit, owner-only RLS, and the reconstructions extended to return it',
    basis: 'exercise_set_logs cannot carry it: anchor_evidence reads every set log, so a partial round would read as a short working set (deload D5, e1RM), and a load-only observation has no set identity',
    ref: null,
    owner: 'TASK-031',
  },
  {
    id: 'block-effort-schema',
    kind: 'schema',
    summary: 'blockResultRowSchema gains effort: setEffortSchema.nullable().default(null); blockResultInsert writes effort by omission when unanswered, as setLogInsert does',
    basis: 'MIG-A; the existing per-set effort read rule',
    ref: { module: SCHEMAS, name: 'blockResultRowSchema', extendedBy: 'TASK-031' },
    owner: 'TASK-031',
  },
  {
    id: 'movement-actual-schema',
    kind: 'schema',
    summary: 'a blockMovementResultRowSchema in src/state/schemas.ts mirroring MIG-B’s CHECKs, and the reconstruction’s per-exercise movement result',
    basis: 'MIG-B',
    ref: { module: SCHEMAS, name: 'blockMovementResultRowSchema', proposedBy: 'TASK-031' },
    owner: 'TASK-031',
  },
  {
    id: 'block-result-correction',
    kind: 'writer',
    summary: 'correct a saved block row (completion, counts, notes, effort) by UPDATE of that row, answered with the stored row',
    basis: 'reuse: the UPDATE grant and block_results_update_own policy (20260921000004); no migration',
    ref: { module: WORKOUT_DATA, name: 'createWorkoutClients', member: 'blockResults.correct', proposedBy: 'TASK-031' },
    owner: 'TASK-031',
  },
  {
    id: 'movement-actuals-writer',
    kind: 'writer',
    summary: 'write and correct the block’s movement rows idempotently (client-minted ids, one row per movement), after or with the block row, retaining the draft on failure',
    basis: 'MIG-B',
    ref: { module: WORKOUT_DATA, name: 'createWorkoutClients', member: 'blockResults.recordMovements', proposedBy: 'TASK-031' },
    owner: 'TASK-031',
  },
  {
    id: 'timed-read-model',
    kind: 'read-model',
    summary: 'History reads the block effort as its category word (never on the 1–10 scale) and each movement’s round partial and load with movement and round identity',
    basis: 'MIG-A, MIG-B; the existing sessionDetail derivation',
    ref: { module: SESSION_DETAIL, name: 'movementActualReadings', proposedBy: 'TASK-031' },
    owner: 'TASK-031',
  },
  {
    id: 'timed-entry',
    kind: 'draft',
    summary:
      'per-movement partial and load entry, effort and notes in the timed log, truthful across edit and retry; for a multi-round ' +
      'For Time, decide whether a completed-rounds count is recorded and whether a movement amount is in-round or a total (open)',
    basis: 'partialRoundFor, loadApplies and movementActualFromDraft below',
    ref: { module: 'src/ui/refinements/timed-result-log.tsx', name: 'TimedResultLog', extendedBy: 'TASK-015' },
    owner: 'TASK-015',
  },
  {
    id: 'ladder-durable-draft',
    kind: 'draft',
    summary:
      'landed by TASK-032: durable ladder progress, draft, Finish checkpoint and original cap through the existing workout-persistence owner ' +
      '(clear.workout-ladders, one versioned record per block with session/block/attempt identity; src/state/ladder-recovery.ts over the For Time ' +
      'clock; local storage, not a database column); visible adoption is TASK-013/TASK-014/TASK-046/TASK-048',
    basis: 'reuse: src/state/workout-persistence.ts; saved block_results stay authoritative',
    ref: { module: 'src/state/workout-persistence.ts', name: 'usePersistedLadder' },
    owner: 'TASK-032',
  },
  {
    id: 'visible-proof',
    kind: 'read-model',
    summary: 'Workout → Summary → History save, retry and reload proof of the richer timed results on the real test lane (disposable namespaced users)',
    basis: 'PRE-001 plus MIG-A/MIG-B applied to the project that lane writes to (LIVE-PRE-1)',
    ref: null,
    owner: 'TASK-047',
  },
  {
    id: 'LIVE-PRE-1',
    kind: 'live-authority',
    summary:
      'owner decision: apply MIG-A and MIG-B to the hosted project TASK-047’s real lane writes to. The repository documents one ' +
      'hosted project, the reused live Supabase project, where the test lane uses disposable namespaced users rather than a ' +
      'separate database; unless the owner names another project, that is a production schema change, not test-lane setup',
    basis:
      'IMPLEMENTATION_PLAN.md and CATALOG_MIGRATION_SCOPE.md (the rebuild runs on the reused live project), e2e/README.md ' +
      '(namespaced disposable users in that project); no repository workflow applies a migration; no task in this body is ' +
      'authorised to change a hosted database; TASK-030 changes none and reads no private configuration',
    ref: null,
    owner: 'owner',
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// The proposed timed contract, as pure functions
// ─────────────────────────────────────────────────────────────────────────────

/** The four timed-result families of the accepted `TimedResultLog`. */
export type TimedFamily = 'emom' | 'amrap' | 'for_time' | 'ladder'

/**
 * What the round identity of a per-movement partial is read from: the block's
 * own reported outcome (`amrapOutcome`, `forTimeOutcome`, the ladder's
 * outcome), never a planned target. The ladder's rung count and the For Time
 * block's `workout_blocks.rounds` are the block's structure — how many rungs
 * or passes exist — read only to know whether a round is left (and, for For
 * Time, whether the race is a single pass); neither ever supplies the round.
 */
export type PartialRoundInput =
  | { readonly family: 'emom' }
  | { readonly family: 'amrap'; readonly outcome: BlockOutcome }
  | { readonly family: 'for_time'; readonly outcome: BlockOutcome; readonly block: Pick<WorkoutBlockRow, 'rounds'> }
  | { readonly family: 'ladder'; readonly outcome: BlockOutcome; readonly rungCount: number }

/**
 * The round a movement's partial amount belongs to, or `null` when no partial
 * applies.
 *
 *   · EMOM: never (the schedule is assumed; only loads are logged).
 *   · AMRAP: the round after the recorded rounds. Unrecorded rounds give no
 *     identity — a partial cannot be attached to a round nobody counted, and
 *     null is never read as zero. An explicit 0 rounds gives round 1.
 *   · For Time, only when the athlete answered Incomplete (none when Complete
 *     or unanswered). `workout_blocks.rounds` is nullable and unrestricted for
 *     For Time, so a race may have several rounds:
 *       – with a recorded completed-rounds count (`roundsCompleted`, which
 *         `conditioningScore` already reads for a capped For Time), the round
 *         after it, while one is left;
 *       – with none, round 1 only for a single pass (`rounds` null or 1) — the
 *         one round there is. A multi-round race with no recorded count has
 *         no identity: `forTimeOutcome` records no count today, and where the
 *         athlete stopped is never guessed (TASK-015's open decision).
 *   · Ladder: the rung after the last completed one, when one is left; none
 *     when Complete (the top rung) or when no rung was recorded.
 */
export function partialRoundFor(input: PartialRoundInput): number | null {
  switch (input.family) {
    case 'emom':
      return null
    case 'amrap': {
      const rounds = input.outcome.roundsCompleted
      return rounds === undefined ? null : rounds + 1
    }
    case 'for_time': {
      if (input.outcome.completedUnderCap !== false) return null
      const passes = input.block.rounds ?? 1
      const through = input.outcome.roundsCompleted
      if (through === undefined) return passes === 1 ? 1 : null
      const next = through + 1
      return next <= passes ? next : null
    }
    case 'ladder': {
      const through = input.outcome.highestRung
      if (through === undefined) return null
      const next = through + 1
      return next <= input.rungCount ? next : null
    }
  }
}

/**
 * Whether an actual load can attach to this movement: the set logger's base
 * rule for load fields (`incrementFor(equipment_used)` not null — loaded
 * equipment), so a timed movement and a set of the same movement agree. The
 * accepted gallery's predicate was an approximation of it; this one is the
 * application's.
 *
 * The set logger's `showLoad` also shows load fields on unloaded equipment when
 * a weight is carried forward from that movement's earlier set or the set being
 * corrected already has one, so a recorded weight stays visible and correctable.
 * That exception has no counterpart here: a timed attempt has no earlier
 * movement row to carry a weight from, and because this rule refuses a weight
 * on unloaded equipment, no saved movement row can hold one to correct.
 */
export function loadApplies(prescription: Pick<PrescribedColumnsWithEquipment, 'equipment_used'>): boolean {
  return incrementFor(prescription.equipment_used, 'kg') !== null
}

/** The prescription columns a movement actual is read against. */
export type PrescribedColumnsWithEquipment = PrescribedColumns & { readonly equipment_used: string }

/** One movement's entry as the accepted log holds it: text, as typed. */
export interface MovementActualDraft {
  readonly amount: string
  readonly weight: string
}

/** MIG-B's draft row, before TASK-031 generates its types. */
export interface ProposedMovementActualRow {
  readonly id: string
  readonly workout_exercise_id: string
  readonly round_number: number | null
  readonly actual_reps: number | null
  readonly actual_duration_seconds: number | null
  readonly actual_distance: number | null
  readonly actual_distance_unit: Enums<'distance_unit'> | null
  readonly weight: number | null
  readonly weight_unit: Enums<'weight_unit'>
}

export interface MovementActualInput {
  /** Client-minted, so a retried write collides instead of duplicating. */
  readonly id: string
  /** `workout_exercises.id` — the movement as performed in this block. */
  readonly workoutExerciseId: string
  readonly prescription: PrescribedColumnsWithEquipment
  /** From `partialRoundFor`; null means no partial applies. */
  readonly partialRound: number | null
  /** Stamped at write time: the athlete's choice, else the profile's unit. */
  readonly weightUnit: Enums<'weight_unit'>
  readonly draft: MovementActualDraft
}

/** Blank is not recorded; anything else must be a number, which may be zero. */
function typed(text: string): number | undefined {
  const trimmed = text.trim()
  return trimmed === '' ? undefined : Number(trimmed)
}

function refused(field: string, extra: Record<string, unknown> = {}): Result<never> {
  return err(createError(ErrorCode.VALIDATION_OUT_OF_RANGE, { details: { field, ...extra } }))
}

/**
 * The movement's ladder target at a rung — the accepted log's input `max` —
 * or null where no source bounds the amount (AMRAP, For Time).
 */
function rungTarget(prescription: PrescribedColumns, round: number): number | null {
  if (prescription.target_kind === 'sequence') return prescription.target_sequence?.[round - 1] ?? null
  return prescription.target_kind === 'fixed' ? prescription.target_value : null
}

/**
 * One movement's entry → MIG-B's row, `ok(null)` when nothing was observed (no
 * row is written), or the field it is refused on.
 *
 * Every rule here is an existing one, applied to the new identity:
 *
 *   · the amount goes to the column of the prescription's modality, with the
 *     prescription's own distance unit, and is bounded exactly as a set's
 *     measurement is (`setLogViolation`): whole non-negative reps and seconds,
 *     a non-negative distance, a non-negative weight;
 *   · blank is not recorded and zero is a measurement;
 *   · an amount needs a round (`partialRoundFor`): a partial with no round
 *     identity is refused rather than attached to a guessed one;
 *   · a load attaches only where `loadApplies`, and is never the prescribed
 *     load — nothing here reads `load_value`;
 *   · a ladder amount is bounded by that movement's target at that rung.
 */
export function movementActualFromDraft(
  input: MovementActualInput,
  family: TimedFamily,
): Result<ProposedMovementActualRow | null> {
  const amount = typed(input.draft.amount)
  const weight = typed(input.draft.weight)
  const { prescription } = input

  if (amount !== undefined && input.partialRound === null) return refused('round_number')
  if (weight !== undefined && !loadApplies(prescription)) return refused('weight', { reason: 'unloaded' })

  const measured = {
    reps: prescription.modality === 'reps' ? amount : undefined,
    durationSeconds: prescription.modality === 'time' ? amount : undefined,
    distance: prescription.modality === 'distance' ? amount : undefined,
  }
  const entry: SetLogEntry = {
    id: input.id,
    exerciseId: input.workoutExerciseId,
    blockId: '',
    distanceUnit: prescription.distance_unit,
    weightUnit: input.weightUnit,
    // The round takes set_number's positive-integer rule. A load-only row has
    // no round; 1 stands in for the check and is never written.
    performed: {
      setNumber: input.partialRound ?? 1,
      ...(measured.reps === undefined ? {} : { reps: measured.reps }),
      ...(measured.durationSeconds === undefined ? {} : { durationSeconds: measured.durationSeconds }),
      ...(measured.distance === undefined ? {} : { distance: measured.distance }),
      ...(weight === undefined ? {} : { weight }),
    },
  }
  const violation = setLogViolation(entry)
  if (violation !== null) {
    return refused(violation.field === 'set_number' ? 'round_number' : violation.field, {
      ...(violation.min === undefined ? {} : { min: violation.min }),
    })
  }

  if (family === 'ladder' && amount !== undefined && input.partialRound !== null) {
    const max = rungTarget(prescription, input.partialRound)
    if (max !== null && amount > max) return refused(fieldFor(prescription.modality), { max })
  }

  if (amount === undefined && weight === undefined) return ok(null)

  return ok({
    id: input.id,
    workout_exercise_id: input.workoutExerciseId,
    round_number: amount === undefined ? null : input.partialRound,
    actual_reps: measured.reps ?? null,
    actual_duration_seconds: measured.durationSeconds ?? null,
    actual_distance: measured.distance ?? null,
    actual_distance_unit: measured.distance === undefined ? null : prescription.distance_unit,
    weight: weight ?? null,
    weight_unit: input.weightUnit,
  })
}

function fieldFor(modality: Enums<'prescription_modality'>): string {
  return modality === 'reps' ? 'actual_reps' : modality === 'time' ? 'actual_duration_seconds' : 'actual_distance'
}

/**
 * The accepted owner's rule for a change of recorded progress: an amount
 * belongs to one round, so when the round identity changes every amount is
 * cleared — never carried to the new round — and every load is kept.
 */
export function draftsAfterProgressChange(
  drafts: Readonly<Record<string, MovementActualDraft>>,
  fromRound: number | null,
  toRound: number | null,
): Readonly<Record<string, MovementActualDraft>> {
  if (fromRound === toRound) return drafts
  return Object.fromEntries(
    Object.entries(drafts).map(([id, draft]) => [id, { amount: '', weight: draft.weight }]),
  )
}
