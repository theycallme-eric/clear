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
  ExerciseSetLogRow,
  SessionSnapshot,
  WorkoutBlockRow,
  WorkoutExerciseRow,
  WorkoutSectionRow,
  WorkoutSessionRow,
} from '../state/schemas'
import type { Enums } from '../data/database.types'
import type { BlockCompletion } from '../state/block-completion'
import { ok, type Result } from '../state/errors'
import type { HistoryClient } from '../data/history'
import type { BlockResultsClient, WorkoutClients } from '../data/workout'
import type { SessionsClient } from '../data/sessions'
import { FIXTURE_USER_ID } from './user-data-double'

const ZERO_UUID = '00000000-0000-4000-8000-000000000000'

/** A uuid-shaped id that is readable in a failure message. */
export function fixtureId(prefix: string, index: number): string {
  return `${prefix}${String(index).padStart(7, '0')}-0000-4000-8000-000000000000`
}

export const FIXTURE_SESSION_ID = fixtureId('5', 1)
export const FIXTURE_STARTED_AT = '2026-09-24T09:00:00+00:00'

export interface BlockFixture {
  structureType?: Enums<'structure_type'>
  rounds?: number | null
  timerSeconds?: number | null
  timerType?: Enums<'timer_contract'>
  repScheme?: Enums<'rep_scheme'>
  /** One entry per prescription: the status it is in. */
  exercises?: Enums<'execution_status'>[]
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
    round_rest_seconds: null,
    rep_scheme: fixture.repScheme ?? 'fixed',
    block_notes: null,
  }
}

function exerciseRow(
  id: string,
  blockId: string,
  index: number,
  status: Enums<'execution_status'>,
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
          const statuses = block.exercises ?? ['not_started']

          return {
            block: blockRow(blockId, sectionId, blockIndex, block),
            exercises: statuses.map((status, index) => {
              exerciseCounter += 1
              return {
                exercise: exerciseRow(
                  fixtureId('8', exerciseCounter),
                  blockId,
                  index,
                  status,
                ),
                set_logs: [] as ExerciseSetLogRow[],
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
}

export interface WorkoutDouble {
  clients: WorkoutClients
  /** Every `block_results` write the shell made, in order. */
  recorded(): BlockCompletion[]
  /** Session ids passed to `abandon` and `complete`. */
  abandoned(): string[]
  completed(): { sessionId: string; minutes?: number }[]
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

/** The shell's two clients, recording what they were asked to do. */
export function createWorkoutDouble(options: WorkoutDoubleOptions = {}): WorkoutDouble {
  const recorded: BlockCompletion[] = []
  const abandoned: string[] = []
  const completed: { sessionId: string; minutes?: number }[] = []
  const session = options.session === undefined ? snapshotFixture() : options.session

  const unsupported = <T>(name: string): Promise<Result<T>> => {
    throw new Error(`The workout double was asked for ${name}, which no test wired`)
  }

  const sessions: SessionsClient = {
    accept: () => unsupported('accept'),
    start: () => unsupported('start'),
    swap: () => unsupported('swap'),
    snapshot: () => unsupported('snapshot'),
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

  return {
    clients: { sessions, blockResults, history },
    recorded: () => [...recorded],
    abandoned: () => [...abandoned],
    completed: () => [...completed],
  }
}
