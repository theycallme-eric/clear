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
  AnchorEvidenceRow,
  BlockResultRow,
  ConditioningHistoryRow,
  Prescription,
  ExerciseDefinitionRow,
  ExerciseSetLogRow,
  ReconstructionKind,
  SessionReconstruction,
  SessionSnapshot,
  WorkoutBlockRow,
  WorkoutExerciseRow,
  WorkoutSectionRow,
  WorkoutSessionRow,
} from '../state/schemas'
import type { AnchorsClient } from '../data/anchors'
import type { CandidatesClient, SectionCandidates } from '../data/candidates'
import type { Enums } from '../data/database.types'
import type { BlockCompletion } from '../state/block-completion'
import { createError, ErrorCode, err, ok, type Result } from '../state/errors'
import type { ConditioningClient } from '../data/conditioning'
import type { ExercisesClient } from '../data/exercises'
import { HISTORY_PAGE_SIZE, type HistoryClient } from '../data/history'
import { setLogInsert, type SetLogEntry } from '../state/set-logging'
import type { BlockResultsClient, SetLogsClient, WorkoutClients } from '../data/workout'
import type { SessionsClient, SwapResult } from '../data/sessions'
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
  /**
   * The `block_results` row this block was scored with (SES-01b). Only a
   * reconstruction carries one — `session_snapshot` answers the structure and
   * the logs, not the score — so `snapshotFixture` ignores it and
   * `reconstructionFixture` reads it. Absent means the block was never scored,
   * which is a different fact from scored with nothing in it.
   */
  result?: Partial<BlockResultRow>
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
  /**
   * Columns to override on `workout_sessions` — the debrief's `mood` and
   * `session_notes`, a `completed_at`, a measured duration. The long way round
   * for a test that is about the row rather than about the structure.
   */
  session?: Partial<WorkoutSessionRow>
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
    ...fixture.session,
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
// Reconstructions — SES-01b
// ─────────────────────────────────────────────────────────────────────────────

export interface ReconstructionFixture extends SnapshotFixture {
  /** Which of the three questions this answers. `performed` by default. */
  reconstruction?: ReconstructionKind
  /**
   * The instant it resolves at. `started_at` by default, because that is what
   * `intended_at_start` and `performed` resolve against; pass `null` for the
   * never-started session, where the null is the reason a list is empty.
   */
  asOf?: string | null
}

/**
 * What `session_as_performed` and its two siblings answer, built from the same
 * fixture `snapshotFixture` takes.
 *
 * One builder over two shapes rather than a second transcription of twenty-six
 * columns: a reconstruction *is* a snapshot plus the question it answers, the
 * instant it resolves at, and each block's score. Every row it produces is a
 * real row — the shapes come from `schemas.ts` — so a payload this builds is
 * one `sessionReconstructionSchema` would parse.
 */
export function reconstructionFixture(
  fixture: ReconstructionFixture = {},
): SessionReconstruction {
  const snapshot = snapshotFixture(fixture)

  return {
    reconstruction: fixture.reconstruction ?? 'performed',
    as_of: fixture.asOf === undefined ? snapshot.session.started_at : fixture.asOf,
    session: snapshot.session,
    state: snapshot.state,
    sections: snapshot.sections.map((section, sectionIndex) => ({
      section: section.section,
      blocks: section.blocks.map((block, blockIndex) => ({
        block: block.block,
        block_result: resultRow(
          block.block.id,
          fixture.sections?.[sectionIndex]?.blocks?.[blockIndex]?.result,
        ),
        exercises: block.exercises,
      })),
    })),
  }
}

/** A `block_results` row, or null for a block that was never scored. */
function resultRow(
  blockId: string,
  overrides: Partial<BlockResultRow> | undefined,
): BlockResultRow | null {
  if (overrides === undefined) return null

  return {
    id: fixtureId('b', 1),
    block_id: blockId,
    elapsed_seconds: null,
    completed_under_cap: null,
    rounds_completed: null,
    partial_round_reps: null,
    minutes_completed: null,
    highest_rung: null,
    perceived_effort: null,
    notes: null,
    created_at: '2026-09-24T09:30:00+00:00',
    ...overrides,
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
  /**
   * HIST-01's session page. Empty by default since OVR-04, which reads it on
   * the Generate screen: a user with no past sessions has no trend to be warned
   * about, so a test about the generation form does not have to wire a history
   * to see the form. `historyRows` is how a test that *is* about a trend
   * says what the page holds.
   */
  history?: Partial<HistoryClient>
  /** HIST-01's rows, newest first, as `history.page` answers them. */
  historyRows?: readonly WorkoutSessionRow[]
  setLogs?: Partial<SetLogsClient>
  exercises?: Partial<ExercisesClient>
  /**
   * OVR-03's conditioning read. Empty by default, which is the honest default:
   * a user with no prior conditioning has no like-for-like comparison to be
   * shown, so a test that is not about one does not have to wire it.
   */
  conditioning?: Partial<ConditioningClient>
  /** Prior scored conditioning blocks, newest first, as the RPC answers them. */
  conditioningHistory?: readonly ConditioningHistoryRow[]
  /**
   * EXE-06's swap candidates. Unwired by default: a test that is not about a
   * mid-workout swap never opens the panel, and a double that answered a list
   * anyway would make "the candidate read happened" unassertable.
   */
  candidates?: Partial<CandidatesClient>
  /** What `candidates.retrieve` answers, as GEN-02a's retrieval would. */
  candidateSets?: readonly SectionCandidates[]
  /**
   * OVR-01a's anchor reads, which OVR-04's triggers are a function of. Empty by
   * default for the reason the conditioning read is: no logged working sets is
   * no evidence of a stall, and that is the honest answer for a new user rather
   * than a gap a test has to fill.
   */
  anchors?: Partial<AnchorsClient>
  /** The working sets `anchors.evidence` answers (OVR-01a, OVR-04). */
  anchorEvidence?: readonly AnchorEvidenceRow[]
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
  /** Every swap the shell asked for, in order (EXE-06). */
  swaps(): { workoutExerciseId: string; prescription: Prescription }[]
  /**
   * The session as the double now holds it — what a reload would read back.
   * Maintained by the double's own `swap`, not by the code under test, so a
   * test that asserts the shell agrees with it is asserting something.
   */
  stored(): SessionSnapshot | null
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
  const swaps: { workoutExerciseId: string; prescription: Prescription }[] = []
  const session = options.session === undefined ? snapshotFixture() : options.session

  /**
   * The rows as the double holds them, which `swap` revises the way
   * `swap_session_exercise` does: supersede in place, append a revision in the
   * same `slot_id` with `replaces_id` set, and leave the outgoing row's set
   * logs and `execution_status` exactly as they were.
   */
  let stored = session
  let revisions = 0

  const unsupported = <T>(name: string): Promise<Result<T>> => {
    throw new Error(`The workout double was asked for ${name}, which no test wired`)
  }

  /**
   * One slot revised in the stored rows, exactly as `swap_session_exercise`
   * does it. Shared by `swap` and `swapBlock` for the reason the migration
   * shares it: a unit swap is that mechanism applied to every member of one
   * block, and a double whose two paths could disagree would prove nothing
   * about the one that does not.
   */
  const revise = (
    workoutExerciseId: string,
    prescription: Prescription,
  ): Result<SwapResult> => {
      const outgoing = prescriptionIn(stored, workoutExerciseId)
      if (outgoing === undefined || outgoing.revision_status !== 'active') {
        // What the function answers for a row that is not there, or is already
        // superseded: `not_found` and `invalid_transition` both surface as a
        // refusal rather than as a second revision of the same predecessor.
        return err(
          createError(ErrorCode.PERSISTENCE_NOT_FOUND, {
            details: { table: 'workout_exercises', exerciseId: workoutExerciseId },
          }),
        )
      }

      revisions += 1
      const superseded: WorkoutExerciseRow = {
        ...outgoing,
        revision_status: 'superseded',
        superseded_at: '2026-09-24T09:15:00+00:00',
      }
      const replacement: WorkoutExerciseRow = {
        ...outgoing,
        id: fixtureId('c', revisions),
        exercise_id: prescription.exercise_id,
        equipment_used: prescription.equipment,
        modality: prescription.modality,
        sets: prescription.sets,
        target_kind: prescription.target_kind,
        target_value: prescription.target_value,
        target_min: prescription.target_min,
        target_max: prescription.target_max,
        target_sequence: prescription.target_sequence,
        per_side: prescription.per_side,
        distance_unit: prescription.distance_unit,
        rest_seconds: prescription.rest_seconds,
        tempo: prescription.tempo,
        load_type: prescription.load_type,
        load_value: prescription.load_value,
        is_interval_exercise: prescription.is_interval_exercise,
        slot_id: outgoing.slot_id,
        replaces_id: outgoing.id,
        origin: 'revised',
        created_at: '2026-09-24T09:15:00+00:00',
        superseded_at: null,
        revision_status: 'active',
        // A replacement has not been performed. The row it replaced keeps
        // whatever it had, which is the whole of DATA_MODEL §7's split.
        execution_status: 'not_started',
      }

      stored = storedWith(stored, superseded, replacement)
      return ok({ exercise: replacement, superseded })
  }

  const sessions: SessionsClient = {
    accept: () => unsupported('accept'),
    start: () => unsupported('start'),
    asGenerated: () => unsupported('asGenerated'),
    asIntendedAtStart: () => unsupported('asIntendedAtStart'),
    asPerformed: () => unsupported('asPerformed'),
    async swap(workoutExerciseId, prescription) {
      swaps.push({ workoutExerciseId, prescription })
      return revise(workoutExerciseId, prescription)
    },
    async swapBlock(blockId, revisions) {
      // The slot check the function makes before writing anything: exactly the
      // block's active members, once each. Checked here for the same reason —
      // a payload that named three of four must leave the block untouched.
      const active = activeIn(stored, blockId)
      const targets = revisions.map((revision) => revision.workoutExerciseId)
      const named = new Set(targets)
      if (
        targets.length !== active.length ||
        named.size !== targets.length ||
        !active.every((row) => named.has(row.id))
      ) {
        return err(
          createError(ErrorCode.VALIDATION_CONSTRAINT, {
            details: { event: 'swap_block', blockId },
          }),
        )
      }

      const members: SwapResult[] = []
      for (const revision of revisions) {
        swaps.push({
          workoutExerciseId: revision.workoutExerciseId,
          prescription: revision.prescription,
        })
        const result = revise(revision.workoutExerciseId, revision.prescription)
        if (!result.ok) return result
        members.push(result.value)
      }

      return ok(members)
    },
    async snapshot() {
      return ok(stored ?? snapshotFixture())
    },
    async resume() {
      return ok(stored)
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

  /**
   * A user with no history, unless a test says otherwise. Every screen that
   * reads HIST-01's page — Home is the first — would otherwise have to wire one
   * to render at all, and "nobody has trained yet" is the honest default for a
   * test that is about something else.
  */
  const history: HistoryClient = {
    async page(_userId, query = {}) {
      // The real read is a page: it answers one row more than it returns to
      // learn whether an older one exists, and the double honours that so a
      // paging assertion is about paging rather than about the double.
      const rows = [...(options.historyRows ?? [])]
      const offset = query.offset ?? 0
      const limit = query.limit ?? HISTORY_PAGE_SIZE

      return ok({
        sessions: rows.slice(offset, offset + limit),
        hasMore: rows.length > offset + limit,
      })
    },
    ...options.history,
  }

  const anchors: AnchorsClient = {
    async evidence() {
      return ok([...(options.anchorEvidence ?? [])])
    },
    list: () => unsupported('anchors.list'),
    recompute: () => unsupported('anchors.recompute'),
    ...options.anchors,
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

  const conditioning: ConditioningClient = {
    async history() {
      return ok([...(options.conditioningHistory ?? [])])
    },
    ...options.conditioning,
  }

  const candidates: CandidatesClient = {
    async retrieve() {
      return ok([...(options.candidateSets ?? [])])
    },
    ...options.candidates,
  }

  return {
    clients: {
      sessions,
      blockResults,
      history,
      setLogs,
      exercises,
      conditioning,
      candidates,
      anchors,
    },
    recorded: () => [...recorded],
    loggedSets: () => [...loggedSets],
    abandoned: () => [...abandoned],
    completed: () => [...completed],
    savedNotes: () => [...savedNotes],
    swaps: () => [...swaps],
    stored: () => stored,
  }
}

/**
 * The session with one slot revised: the superseded row in place, its set logs
 * where they were, and the replacement appended to the same block.
 *
 * Written out rather than reusing `applySwap` — that is the function under
 * test in `swap.test.ts`, and a double that stored what the code under test
 * computed could never disagree with it.
 */
function storedWith(
  snapshot: SessionSnapshot | null,
  superseded: WorkoutExerciseRow,
  replacement: WorkoutExerciseRow,
): SessionSnapshot | null {
  if (snapshot === null) return null

  return {
    ...snapshot,
    sections: snapshot.sections.map((section) => ({
      ...section,
      blocks: section.blocks.map((block) => {
        if (!block.exercises.some((entry) => entry.exercise.id === superseded.id)) {
          return block
        }

        return {
          ...block,
          exercises: [
            ...block.exercises.map((entry) =>
              entry.exercise.id === superseded.id ? { ...entry, exercise: superseded } : entry,
            ),
            { exercise: replacement, set_logs: [] },
          ],
        }
      }),
    })),
  }
}

/** The prescription row a session holds under this id, if it holds one. */
/** The block's active members, in the order the block holds them. */
function activeIn(
  snapshot: SessionSnapshot | null,
  blockId: string,
): readonly WorkoutExerciseRow[] {
  return (snapshot?.sections ?? [])
    .flatMap((section) => section.blocks)
    .filter((block) => block.block.id === blockId)
    .flatMap((block) => block.exercises.map((entry) => entry.exercise))
    .filter((row) => row.revision_status === 'active')
    .sort((left, right) => left.order_index - right.order_index)
}

function prescriptionIn(
  snapshot: SessionSnapshot | null,
  exerciseId: string,
): WorkoutExerciseRow | undefined {
  return snapshot?.sections
    .flatMap((section) => section.blocks)
    .flatMap((block) => block.exercises)
    .find((entry) => entry.exercise.id === exerciseId)?.exercise
}
