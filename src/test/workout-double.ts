/**
 * EXE-01's doubles: a session snapshot a test can shape, and the two clients
 * the shell talks to.
 *
 * The snapshot builder is deliberately terse at the call site —
 * `snapshotFixture({ sections: [{ title: 'Warm-up', blocks: [...] }] })` — so
 * a test about navigation reads as a test about navigation rather than as
 * thirty columns of prescription. Every row it produces is a real row: the
 * shapes come from `schemas.ts`, so a snapshot that would not parse against
 * the contract cannot be built here either.
 */
import type {
  BlockResultRow,
  ExerciseDefinitionRow,
  ExerciseSetLogRow,
  SessionSnapshot,
  WorkoutBlockRow,
  WorkoutExerciseRow,
  WorkoutSectionRow,
  WorkoutSessionRow,
} from '../state/schemas'
import type { Enums } from '../data/database.types'
import type { BlockCompletion } from '../state/block-completion'
import { createError, ErrorCode, err, ok, type Result } from '../state/errors'
import type { ExercisesClient } from '../data/exercises'
import type { HistoryClient } from '../data/history'
import { setLogInsert, type SetLogEntry } from '../state/set-logging'
import type { BlockResultsClient, SetLogsClient, WorkoutClients } from '../data/workout'
import type { SessionsClient } from '../data/sessions'
import { FIXTURE_USER_ID } from './user-data-double'

const ZERO_UUID = '00000000-0000-4000-8000-000000000000'

/** A uuid-shaped id that is readable in a failure message. */
export function fixtureId(prefix: string, index: number): string {
  return `${prefix}${String(index).padStart(7, '0')}-0000-4000-8000-000000000000`
}

export const FIXTURE_SESSION_ID = fixtureId('5', 1)
export const FIXTURE_STARTED_AT = '2026-09-24T09:00:00+00:00'

/**
 * One prescription in a block. A status on its own is the common case — a test
 * about navigation cares only whether the movement is done — and the long form
 * is for EXE-02's tests, which are about the prescription's own columns and the
 * sets already logged against it.
 */
export interface ExerciseFixture {
  status?: Enums<'execution_status'>
  /** Columns to override on `workout_exercises`: the structured target. */
  prescription?: Partial<WorkoutExerciseRow>
  /** Sets the snapshot already carries — what a resumed session shows. */
  setLogs?: Partial<ExerciseSetLogRow>[]
}

export interface BlockFixture {
  structureType?: Enums<'structure_type'>
  rounds?: number | null
  timerSeconds?: number | null
  timerType?: Enums<'timer_contract'>
  repScheme?: Enums<'rep_scheme'>
  roundRestSeconds?: number | null
  /** One entry per prescription: its status, or the whole thing. */
  exercises?: (Enums<'execution_status'> | ExerciseFixture)[]
}

export interface SectionFixture {
  title?: string
  sectionType?: Enums<'section_type'>
  blocks?: BlockFixture[]
}

export interface SnapshotFixture {
  sessionId?: string
  userId?: string
  title?: string
  state?: SessionSnapshot['state']
  startedAt?: string | null
  sections?: SectionFixture[]
}

function sessionRow(fixture: SnapshotFixture): WorkoutSessionRow {
  const startedAt = fixture.startedAt === undefined ? FIXTURE_STARTED_AT : fixture.startedAt

  return {
    id: fixture.sessionId ?? FIXTURE_SESSION_ID,
    user_id: fixture.userId ?? FIXTURE_USER_ID,
    location_id: null,
    created_at: '2026-09-24T08:59:00+00:00',
    updated_at: '2026-09-24T08:59:00+00:00',
    date: '2026-09-24',
    title: fixture.title ?? 'Full body',
    overview: null,
    session_focus: 'full_body',
    goal_preset: 'balanced',
    requested_duration_mins: 45,
    effective_duration_target_mins: 45,
    computed_duration_mins: null,
    actual_duration_mins: null,
    requested_intensity: 6,
    effective_intensity: 6,
    adjustment_reason: null,
    generation_notes: null,
    prompt_version: 'v4',
    contract_version: '4.1.0',
    started_at: startedAt,
    completed_at: null,
    abandoned_at: null,
    mood: null,
    session_notes: null,
    counts_for_streak: true,
  }
}

function blockRow(id: string, sectionId: string, index: number, fixture: BlockFixture): WorkoutBlockRow {
  return {
    id,
    section_id: sectionId,
    created_at: '2026-09-24T08:59:00+00:00',
    order_index: index,
    structure_type: fixture.structureType ?? 'standard',
    rounds: fixture.rounds ?? null,
    timer_type: fixture.timerType ?? 'none',
    timer_seconds: fixture.timerSeconds ?? null,
    round_rest_seconds: fixture.roundRestSeconds ?? null,
    rep_scheme: fixture.repScheme ?? 'fixed',
    block_notes: null,
  }
}

/** A `set_logs` row for a prescription, with only what a test states set. */
function setLogRow(
  exerciseId: string,
  index: number,
  overrides: Partial<ExerciseSetLogRow>,
): ExerciseSetLogRow {
  return {
    id: fixtureId('a', index),
    workout_exercise_id: exerciseId,
    prescription_revision_status: 'active',
    set_number: index,
    actual_reps: null,
    actual_duration_seconds: null,
    actual_distance: null,
    actual_distance_unit: null,
    weight: null,
    weight_unit: 'kg',
    rpe: null,
    is_warmup_set: false,
    created_at: '2026-09-24T09:10:00+00:00',
    ...overrides,
  }
}

function exerciseRow(
  id: string,
  blockId: string,
  index: number,
  status: Enums<'execution_status'>,
  overrides: Partial<WorkoutExerciseRow> = {},
): WorkoutExerciseRow {
  return {
    id,
    block_id: blockId,
    exercise_id: 'back-squat',
    order_index: index,
    modality: 'reps',
    sets: 3,
    target_kind: 'fixed',
    target_value: 8,
    target_min: null,
    target_max: null,
    target_sequence: null,
    per_side: false,
    distance_unit: null,
    rest_seconds: 90,
    tempo: null,
    load_type: null,
    load_value: null,
    equipment_used: 'barbell',
    is_interval_exercise: false,
    slot_id: ZERO_UUID,
    replaces_id: null,
    origin: 'generated',
    created_at: '2026-09-24T08:59:00+00:00',
    superseded_at: null,
    revision_status: 'active',
    execution_status: status,
    exercise_notes: null,
    ...overrides,
  }
}

/** A session snapshot with exactly the structure a test needs and no more. */
export function snapshotFixture(fixture: SnapshotFixture = {}): SessionSnapshot {
  const session = sessionRow(fixture)
  const sections = fixture.sections ?? [
    { title: 'Warm-up' },
    { title: 'Primary lift', sectionType: 'primary_lift' },
  ]

  let blockCounter = 0
  let exerciseCounter = 0

  return {
    session,
    state: fixture.state ?? 'active',
    sections: sections.map((sectionFixture, sectionIndex) => {
      const sectionId = fixtureId('6', sectionIndex + 1)
      const sectionRow: WorkoutSectionRow = {
        id: sectionId,
        session_id: session.id,
        created_at: '2026-09-24T08:59:00+00:00',
        updated_at: '2026-09-24T08:59:00+00:00',
        section_type: sectionFixture.sectionType ?? 'warmup',
        order_index: sectionIndex,
        section_title: sectionFixture.title ?? `Section ${sectionIndex + 1}`,
        section_notes: null,
      }

      const blocks = sectionFixture.blocks ?? [{}]

      return {
        section: sectionRow,
        blocks: blocks.map((block, blockIndex) => {
          blockCounter += 1
          const blockId = fixtureId('7', blockCounter)
          const members = block.exercises ?? ['not_started']

          return {
            block: blockRow(blockId, sectionId, blockIndex, block),
            exercises: members.map((member, index) => {
              exerciseCounter += 1
              const entry: ExerciseFixture =
                typeof member === 'string' ? { status: member } : member
              const exerciseId = fixtureId('8', exerciseCounter)

              return {
                exercise: exerciseRow(
                  exerciseId,
                  blockId,
                  index,
                  entry.status ?? 'not_started',
                  entry.prescription ?? {},
                ),
                set_logs: (entry.setLogs ?? []).map((log, logIndex) =>
                  setLogRow(exerciseId, logIndex + 1, log),
                ),
              }
            }),
          }
        }),
      }
    }),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Clients
// ─────────────────────────────────────────────────────────────────────────────

export interface WorkoutDoubleOptions {
  /** What `resume` answers. `null` is "nobody is mid-workout". */
  session?: SessionSnapshot | null
  /** Override any client method — a failing abandon, a slow complete. */
  sessions?: Partial<SessionsClient>
  blockResults?: Partial<BlockResultsClient>
  history?: Partial<HistoryClient>
  setLogs?: Partial<SetLogsClient>
  exercises?: Partial<ExercisesClient>
  /**
   * What the catalog answers, by slug (EXE-05). A slug that is not here answers
   * `null` — the library has no definition for it — rather than throwing, so a
   * test that is not about the coaching panel does not have to wire one.
   */
  definitions?: Readonly<Record<string, ExerciseDefinitionRow>>
}

export interface WorkoutDouble {
  clients: WorkoutClients
  /** Every `block_results` write the shell made, in order. */
  recorded(): BlockCompletion[]
  /** Every `exercise_set_logs` write the shell made, in order. */
  loggedSets(): SetLogEntry[]
  /** Session ids passed to `abandon` and `complete`. */
  abandoned(): string[]
  completed(): { sessionId: string; minutes?: number }[]
  /** Every `exercise_notes` write the panel made, in order (EXE-05). */
  savedNotes(): { exerciseId: string; notes: string | null }[]
}

/**
 * A library definition, as `exercise_definitions` holds one. Cues and a
 * regression by default, because that is the case the coaching panel is for;
 * a test about the empty one overrides them.
 */
export function definitionFixture(
  overrides: Partial<ExerciseDefinitionRow> = {},
): ExerciseDefinitionRow {
  return {
    id: 'back-squat',
    name: 'Back squat',
    coaching_cues: ['Brace before you descend', 'Knees track over the toes'],
    regression: 'Goblet squat',
    progression: 'Pause squat',
    ...overrides,
  }
}

function blockResultRow(completion: BlockCompletion): BlockResultRow {
  return {
    id: fixtureId('9', 1),
    block_id: completion.blockId,
    elapsed_seconds: completion.outcome.elapsedSeconds ?? null,
    completed_under_cap: completion.outcome.completedUnderCap ?? null,
    rounds_completed: completion.outcome.roundsCompleted ?? null,
    partial_round_reps: completion.outcome.partialRoundReps ?? null,
    minutes_completed: completion.outcome.minutesCompleted ?? null,
    highest_rung: completion.outcome.highestRung ?? null,
    perceived_effort: completion.perceivedEffort,
    notes: completion.outcome.notes ?? null,
    created_at: '2026-09-24T09:30:00+00:00',
  }
}

/**
 * The row the database would have stored, built from the same pure mapping the
 * real client uses — so a test that asserts what came back is asserting the
 * insert rather than a second, hand-written idea of it.
 */
function storedSetLog(entry: SetLogEntry): ExerciseSetLogRow {
  const insert = setLogInsert(entry)

  return {
    ...insert,
    prescription_revision_status: 'active',
    actual_reps: insert.actual_reps ?? null,
    actual_duration_seconds: insert.actual_duration_seconds ?? null,
    actual_distance: insert.actual_distance ?? null,
    actual_distance_unit: insert.actual_distance_unit ?? null,
    weight: insert.weight ?? null,
    rpe: insert.rpe ?? null,
    is_warmup_set: insert.is_warmup_set ?? false,
    created_at: '2026-09-24T09:20:00+00:00',
  }
}

/** The shell's clients, recording what they were asked to do. */
export function createWorkoutDouble(options: WorkoutDoubleOptions = {}): WorkoutDouble {
  const recorded: BlockCompletion[] = []
  const loggedSets: SetLogEntry[] = []
  const abandoned: string[] = []
  const completed: { sessionId: string; minutes?: number }[] = []
  const savedNotes: { exerciseId: string; notes: string | null }[] = []
  const session = options.session === undefined ? snapshotFixture() : options.session

  const unsupported = <T>(name: string): Promise<Result<T>> => {
    throw new Error(`The workout double was asked for ${name}, which no test wired`)
  }

  const sessions: SessionsClient = {
    accept: () => unsupported('accept'),
    start: () => unsupported('start'),
    swap: () => unsupported('swap'),
    snapshot: () => unsupported('snapshot'),
    asGenerated: () => unsupported('asGenerated'),
    asIntendedAtStart: () => unsupported('asIntendedAtStart'),
    asPerformed: () => unsupported('asPerformed'),
    async resume() {
      return ok(session)
    },
    async abandon(sessionId) {
      abandoned.push(sessionId)
      return ok({
        session: { ...(session ?? snapshotFixture()).session, abandoned_at: '2026-09-24T09:40:00+00:00' },
        state: 'abandoned' as const,
      })
    },
    async complete(sessionId, minutes) {
      completed.push({ sessionId, minutes })
      return ok({
        session: { ...(session ?? snapshotFixture()).session, completed_at: '2026-09-24T09:40:00+00:00' },
        state: 'completed' as const,
      })
    },
    ...options.sessions,
  }

  const blockResults: BlockResultsClient = {
    async record(completion) {
      recorded.push(completion)
      return ok(blockResultRow(completion))
    },
    ...options.blockResults,
  }

  const history: HistoryClient = {
    page: () => unsupported('history.page'),
    ...options.history,
  }

  const setLogs: SetLogsClient = {
    async log(entry) {
      loggedSets.push(entry)
      return ok(storedSetLog(entry))
    },
    ...options.setLogs,
  }

  const exercises: ExercisesClient = {
    async definition(exerciseId) {
      return ok(options.definitions?.[exerciseId] ?? null)
    },
    async saveNotes(workoutExerciseId, notes) {
      savedNotes.push({ exerciseId: workoutExerciseId, notes })

      const stored = prescriptionIn(session, workoutExerciseId)
      if (stored === undefined) {
        // What the real client answers when the update matched nothing: a note
        // on a prescription that is not in this session is not stored.
        return err(
          createError(ErrorCode.PERSISTENCE_WRITE_FAILED, {
            details: { table: 'workout_exercises', exerciseId: workoutExerciseId },
          }),
        )
      }

      return ok({ ...stored, exercise_notes: notes })
    },
    ...options.exercises,
  }

  return {
    clients: { sessions, blockResults, history, setLogs, exercises },
    recorded: () => [...recorded],
    loggedSets: () => [...loggedSets],
    abandoned: () => [...abandoned],
    completed: () => [...completed],
    savedNotes: () => [...savedNotes],
  }
}

/** The prescription row a session holds under this id, if it holds one. */
function prescriptionIn(
  snapshot: SessionSnapshot | null,
  exerciseId: string,
): WorkoutExerciseRow | undefined {
  return snapshot?.sections
    .flatMap((section) => section.blocks)
    .flatMap((block) => block.exercises)
    .find((entry) => entry.exercise.id === exerciseId)?.exercise
}
