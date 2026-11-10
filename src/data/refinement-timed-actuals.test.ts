/**
 * TASK-031 (REQ-031) — richer timed-result writers and read models, proven
 * deterministically against the app's own clients and readers.
 *
 * Every write here goes through `createWorkoutClients().blockResults`
 * (`record`, `correct`, `recordMovements`) and the save provider
 * `saveTimedResult` (src/state/timed-results.ts), into the in-memory PostgREST
 * transcribed from the migrations (`src/test/logging-contract-double.ts`,
 * MIG-A and MIG-B included). Every read comes back through
 * `sessions.asPerformed` → `sessionReconstructionSchema` → `sessionDetail`,
 * which is what History renders. Nothing here writes on the app's behalf, and
 * the double is not Postgres: the deployed-database proof is TASK-047's,
 * behind the owner's LIVE-PRE-1.
 *
 * Criteria:
 *   · TASK-AC-1D3D95F6D419 — typed per-movement/round/block mappings,
 *     category versus legacy numeric effort, notes, null/zero and correction
 *     identities from the validated contract.
 *   · TASK-AC-FCFBE3CD46A6 — client/read-model boundary behaviour, retained
 *     errors and idempotent retry; the migration and live authority exposed
 *     separately.
 *   · TASK-AC-D37D178270A8 — providers supplied for TASK-015/019/026/047;
 *     JOURNEY-031 not claimed.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import type { AuthSession } from './auth'
import { Constants } from './database.types'
import { PROPOSED_PATHS, draftsAfterProgressChange, type MovementActualDraft } from './refinement-logging-contract'
import { createWorkoutClients } from './workout'
import { amrapOutcome, amrapView, type AmrapState } from '../state/amrap'
import { blockResultInsert, type BlockCompletion } from '../state/block-completion'
import { conditioningTrend, type ConditioningSectionRead } from '../state/conditioning'
import { ErrorCode, isErr, ok, type Result } from '../state/errors'
import { forTimeOutcome, forTimeView, type ForTimeState } from '../state/for-time'
import { ladderRungs } from '../state/ladder'
import { exerciseName } from '../state/prescription'
import {
  blockMovementResultRowSchema,
  blockResultRowSchema,
  sessionReconstructionSchema,
  type SessionSnapshot,
} from '../state/schemas'
import { sessionDetail, type SessionDetailView } from '../state/session-detail'
import {
  saveTimedResult,
  timedResultDraft,
  timedResultRequest,
  timedSaveSettled,
  timedSaveStarted,
  timedSaveState,
  type TimedResultContext,
  type TimedResultDraft,
} from '../state/timed-results'
import {
  BLOCK_MOVEMENT_RESULT_COLUMNS,
  LOGGING_DOUBLE_ANON_KEY,
  LOGGING_DOUBLE_TOKEN,
  LOGGING_DOUBLE_URL,
  createLoggingDouble,
  type LoggingDouble,
  type LoggingDoubleOptions,
} from '../test/logging-contract-double'
import { fixtureId, snapshotFixture } from '../test/workout-double'
import { SET_EFFORT_CHOICES } from '../ui/set-effort'

const REPO_ROOT = join(import.meta.dirname, '..', '..')
const read = (path: string) => readFileSync(join(REPO_ROOT, path), 'utf8')

const USER_ID = 'a0000001-0000-4000-8000-000000000000'
const OTHER_USER = 'a0000002-0000-4000-8000-000000000000'
const STARTED_AT = '2026-09-24T09:00:00+00:00'
/** The GitHub runner is slower than a laptop; the rehearsals go through real clients. */
const HEAVY_MS = 20_000

const MIG_A = 'supabase/migrations/20261110000029_block_result_effort.sql'
const MIG_B = 'supabase/migrations/20261110000030_block_movement_results.sql'

// ─────────────────────────────────────────────────────────────────────────────
// The session: one block per timed family, plus a multi-round For Time
// ─────────────────────────────────────────────────────────────────────────────

function session(overrides: { completed?: boolean } = {}): SessionSnapshot {
  return snapshotFixture({
    userId: USER_ID,
    startedAt: STARTED_AT,
    state: overrides.completed ? 'completed' : 'active',
    session: overrides.completed ? { completed_at: '2026-09-24T10:00:00+00:00' } : {},
    sections: [
      {
        title: 'Conditioning',
        sectionType: 'conditioning',
        blocks: [
          {
            structureType: 'amrap',
            timerType: 'countdown',
            timerSeconds: 480,
            exercises: [
              { prescription: { exercise_id: 'kb-swing', sets: null, target_value: 12, equipment_used: 'kettlebell', load_type: 'absolute', load_value: 24 } },
              { prescription: { exercise_id: 'burpee', sets: null, target_value: 8, equipment_used: 'bodyweight', load_type: 'bodyweight' } },
              {
                prescription: {
                  exercise_id: 'row-erg', modality: 'distance', sets: null, target_value: 250, distance_unit: 'm',
                  equipment_used: 'rower', load_type: 'none',
                },
              },
            ],
          },
          {
            structureType: 'for_time',
            timerType: 'count_up',
            timerSeconds: 900,
            exercises: [
              { prescription: { exercise_id: 'wall-ball', sets: null, target_value: 40, equipment_used: 'medicine_ball', load_type: 'absolute', load_value: 9 } },
              { prescription: { exercise_id: 'plank', modality: 'time', sets: null, target_value: 60, equipment_used: 'bodyweight', load_type: 'bodyweight' } },
            ],
          },
          {
            structureType: 'for_time',
            timerType: 'count_up',
            timerSeconds: 600,
            rounds: 3,
            exercises: [
              { prescription: { exercise_id: 'thruster', sets: null, target_value: 10, equipment_used: 'barbell', load_type: 'absolute', load_value: 40 } },
              { prescription: { exercise_id: 'burpee', sets: null, target_value: 10, equipment_used: 'bodyweight', load_type: 'bodyweight' } },
            ],
          },
          {
            structureType: 'for_time',
            repScheme: 'ladder_up',
            timerType: 'count_up',
            timerSeconds: 420,
            exercises: [
              {
                prescription: {
                  exercise_id: 'goblet-squat', sets: null, target_kind: 'sequence', target_value: null,
                  target_sequence: [2, 4, 6, 8], equipment_used: 'kettlebell', load_type: 'absolute', load_value: 20,
                },
              },
              { prescription: { exercise_id: 'push-up', sets: null, target_kind: 'sequence', target_value: null, target_sequence: [2, 4, 6, 8], equipment_used: 'bodyweight', load_type: 'bodyweight' } },
            ],
          },
          {
            structureType: 'emom',
            timerType: 'per_minute',
            timerSeconds: 600,
            exercises: [
              { prescription: { exercise_id: 'kb-swing', sets: null, target_value: 12, equipment_used: 'kettlebell', load_type: 'absolute', load_value: 24 } },
              { prescription: { exercise_id: 'burpee', sets: null, target_value: 8, equipment_used: 'bodyweight', load_type: 'bodyweight' } },
            ],
          },
        ],
      },
    ],
  })
}

function layout(snapshot: SessionSnapshot) {
  const [amrap, forTime, race, ladder, emom] = snapshot.sections[0].blocks
  const movements = (entry: typeof amrap) => entry.exercises.map(({ exercise }) => exercise)
  return { amrap, forTime, race, ladder, emom, movements }
}

function clientsFor(double: LoggingDouble) {
  const auth = {
    getSession: (): Promise<Result<AuthSession | null>> =>
      Promise.resolve(
        ok({ accessToken: LOGGING_DOUBLE_TOKEN, refreshToken: 'refresh', expiresAt: Date.now() + 60_000, user: { id: USER_ID, email: null } }),
      ),
  }
  return createWorkoutClients({ auth, supabase: { url: LOGGING_DOUBLE_URL, anonKey: LOGGING_DOUBLE_ANON_KEY, fetch: double.fetch } })
}

function setup(options: Partial<LoggingDoubleOptions> & { completed?: boolean } = {}) {
  const snapshot = session({ completed: options.completed })
  const double = createLoggingDouble({ snapshot, ...options })
  return { snapshot, at: layout(snapshot), double, workout: clientsFor(double) }
}

/** Deterministic row ids, one per movement, minted once per draft. */
function minter(prefix: string) {
  let next = 0
  return () => fixtureId(prefix, (next += 1))
}

const amrapAt = (state: Partial<AmrapState>) =>
  amrapOutcome(
    amrapView({ startedAt: STARTED_AT, endedAtSeconds: null, roundsCompleted: null, partialRoundReps: null, ...state }, { capSeconds: 480, size: 3 }, 600),
  )
const raceAt = (state: Partial<ForTimeState>, capSeconds: number, answer?: boolean, now = 0) =>
  forTimeOutcome(forTimeView({ startedAt: STARTED_AT, finishedAt: null, ...state }, { capSeconds, size: 2 }, now), answer)

function context(entry: SessionSnapshot['sections'][number]['blocks'][number], extra: Partial<TimedResultContext> = {}): TimedResultContext {
  return {
    block: entry.block,
    movements: entry.exercises.map(({ exercise }) => exercise),
    weightUnit: 'kg',
    ...extra,
  }
}

function withEntries(draft: TimedResultDraft, entries: Readonly<Record<string, Partial<MovementActualDraft>>>, extra: Partial<TimedResultDraft> = {}): TimedResultDraft {
  return {
    ...draft,
    ...extra,
    movements: Object.fromEntries(
      Object.entries(draft.movements).map(([id, current]) => [id, { ...current, ...(entries[id] ?? {}) }]),
    ),
  }
}

function request(draft: TimedResultDraft, ctx: TimedResultContext) {
  const built = timedResultRequest(draft, ctx)
  if (isErr(built)) throw new Error(`request refused: ${JSON.stringify(built.error.details)}`)
  return built.value
}

async function history(workout: ReturnType<typeof createWorkoutClients>, double: LoggingDouble): Promise<SessionDetailView> {
  const reconstruction = await workout.sessions.asPerformed(double.session().id)
  if (isErr(reconstruction)) throw new Error(JSON.stringify(reconstruction.error))
  return sessionDetail(reconstruction.value)
}

function blockView(view: SessionDetailView, id: string) {
  const found = view.sections.flatMap((section) => section.blocks).find((block) => block.id === id)
  if (found === undefined) throw new Error(`no block ${id}`)
  return found
}

const writes = (double: LoggingDouble, path: string, method?: string) =>
  double.requests.filter((entry) => entry.path === path && (method === undefined || entry.method === method))

const effortWord = (value: string | null) => SET_EFFORT_CHOICES.find((choice) => choice.value === value)?.label ?? null

/** `database.types.ts` Row keys of a table, or null. */
function generatedColumns(table: string): readonly string[] | null {
  const types = read('src/data/database.types.ts')
  const tables = types.slice(types.indexOf('    Tables: {'), types.indexOf('    Views: {'))
  const match = new RegExp(`\\n {6}${table}: \\{\\n {8}Row: \\{\\n([\\s\\S]*?)\\n {8}\\}`).exec(tables)
  return match === null ? null : [...match[1].matchAll(/^ {10}(\w+)\??:/gm)].map((line) => line[1])
}

// ─────────────────────────────────────────────────────────────────────────────

describe('TASK-031 richer timed-result writers and read models', () => {
  it('TASK-AC-1D3D95F6D419 the landed MIG-A and MIG-B schema is one contract across the migrations, the generated types, the row schemas and the double', () => {
    // MIG-A: one nullable column of the existing set_effort type, nothing else.
    const effort = read(MIG_A).replace(/--[^\n]*/g, '')
    expect(effort).toMatch(/alter table public\.block_results\s+add column if not exists effort public\.set_effort;/)
    expect(effort).not.toMatch(/perceived_effort\s*=|update public\.block_results/i)
    expect(generatedColumns('block_results')).toContain('effort')
    expect(blockResultRowSchema.shape.effort.parse(undefined)).toBeNull()
    for (const category of Constants.public.Enums.set_effort) expect(blockResultRowSchema.shape.effort.parse(category)).toBe(category)
    for (const number of [1, 7, 10]) expect(blockResultRowSchema.shape.effort.safeParse(number).success).toBe(false)

    // MIG-B: the table, its constraints, owner-only policies, column grants
    // without the database-observed columns, and the reconstruction.
    // SQL only: the migration's comments explain what it leaves alone.
    const table = read(MIG_B).replace(/--[^\n]*/g, '')
    for (const constraint of [
      'block_movement_results_prescription_fkey', 'block_movement_results_one_per_movement',
      'block_movement_results_round_positive', 'block_movement_results_amount_needs_round', 'block_movement_results_observed',
      'block_movement_results_distance_has_unit', 'block_movement_results_weight_non_negative',
    ]) expect(table, constraint).toContain(constraint)
    expect(table).toMatch(/constraint block_movement_results_one_per_movement\s+unique \(workout_exercise_id\)/)
    expect(table).toContain('alter table public.block_movement_results enable row level security;')
    for (const policy of ['select', 'insert', 'update', 'delete']) expect(table).toContain(`block_movement_results_${policy}_own`)
    const grants = /grant insert \(([^)]*)\)/.exec(table)?.[1] ?? ''
    expect(grants).not.toMatch(/prescription_revision_status|created_at|updated_at/)
    expect(table).toMatch(/'movement_result', \(\s*select to_jsonb\(m\)/)
    // The one function it redefines is the reconstruction: anchor evidence, the
    // snapshot and every set reader are untouched (these rows are not sets).
    expect([...table.matchAll(/create or replace function public\.(\w+)/g)].map((match) => match[1])).toEqual(['session_reconstruction'])
    expect(table).not.toMatch(/alter table (?:if exists )?public\.exercise_set_logs|on public\.exercise_set_logs/i)
    expect(generatedColumns('block_movement_results')).toEqual([...BLOCK_MOVEMENT_RESULT_COLUMNS])

    // The row schema mirrors the CHECKs: null is not recorded, zero is kept,
    // an amount needs its round, a row records something.
    const row = {
      id: fixtureId('b', 91), workout_exercise_id: fixtureId('e', 1), prescription_revision_status: 'active', round_number: 4,
      actual_reps: 0, actual_duration_seconds: null, actual_distance: null, actual_distance_unit: null, weight: null, weight_unit: 'kg',
      created_at: STARTED_AT, updated_at: STARTED_AT,
    }
    expect(blockMovementResultRowSchema.parse(row)).toMatchObject({ actual_reps: 0, weight: null })
    expect(blockMovementResultRowSchema.safeParse({ ...row, round_number: null }).success).toBe(false)
    expect(blockMovementResultRowSchema.safeParse({ ...row, actual_reps: null }).success).toBe(false)
    expect(blockMovementResultRowSchema.safeParse({ ...row, actual_reps: null, round_number: null, weight: 0 }).success).toBe(true)
    expect(blockMovementResultRowSchema.safeParse({ ...row, actual_reps: null, actual_distance: 30 }).success).toBe(false)
    expect(blockMovementResultRowSchema.safeParse({ ...row, actual_reps: -1 }).success).toBe(false)
    expect(blockMovementResultRowSchema.safeParse({ ...row, round_number: 0 }).success).toBe(false)
  })

  it('TASK-AC-1D3D95F6D419 an AMRAP, a single-pass For Time, a ladder and an EMOM save their per-movement partials, loads, effort and notes with the right block, round and movement identity, and History reads back the entries, not the plan', async () => {
    const { at, double, workout } = setup()
    const amrapMovements = at.movements(at.amrap)
    const [swing, burpee, row] = amrapMovements
    const [wallBall, plank] = at.movements(at.forTime)
    const [squat, pushUp] = at.movements(at.ladder)
    const [emomSwing] = at.movements(at.emom)
    const rungs = ladderRungs(at.ladder.exercises.map(({ exercise }) => ({ prescription: exercise }))).length

    // AMRAP: 3 rounds recorded → round 4; entries differ from the plan (12 reps, 24 kg).
    const amrap = withEntries(
      timedResultDraft(at.amrap.block.id, 'amrap', amrapAt({ roundsCompleted: 3, partialRoundReps: 7 }), amrapMovements, minter('1')),
      { [swing.id]: { amount: '5', weight: '20' }, [burpee.id]: { amount: '2' }, [row.id]: { amount: '125' } },
      { effort: 'too_hard', notes: 'Grip went in round 3' },
    )
    // Single-pass For Time stopped Incomplete → round 1.
    const forTime = withEntries(
      timedResultDraft(at.forTime.block.id, 'for_time', raceAt({ finishedAt: '2026-09-24T09:12:00+00:00' }, 900, false), at.movements(at.forTime), minter('2')),
      { [wallBall.id]: { amount: '31', weight: '6' }, [plank.id]: { amount: '45' } },
      { effort: 'about_right' },
    )
    // Ladder: through rung 2 → partials at rung 3, bounded by that rung's target (6).
    const ladder = withEntries(
      timedResultDraft(at.ladder.block.id, 'ladder', { highestRung: 2 }, at.movements(at.ladder), minter('3')),
      { [squat.id]: { amount: '4', weight: '16' }, [pushUp.id]: { amount: '6' } },
      { notes: 'Rung 3 squats unbroken' },
    )
    // EMOM: no partials, an applicable load only.
    const emom = withEntries(
      timedResultDraft(at.emom.block.id, 'emom', {}, at.movements(at.emom), minter('4')),
      { [emomSwing.id]: { weight: '28' } },
      { effort: 'too_easy', notes: 'Minute 7: burpees scaled to 6' },
    )

    const requests = [
      request(amrap, context(at.amrap)),
      request(forTime, context(at.forTime)),
      request(ladder, context(at.ladder, { rungCount: rungs })),
      request(emom, context(at.emom)),
    ]
    expect(requests.map((entry) => entry.partialRound)).toEqual([4, 1, 3, null])
    for (const entry of requests) {
      const saved = await saveTimedResult(workout.blockResults, entry)
      expect(saved.ok, JSON.stringify(saved)).toBe(true)
      expect(saved.ok && saved.value.corrected).toBe(false)
    }

    // Stored: one block row per block, one movement row per entered movement.
    expect(double.blockResults().map((stored) => [stored.block_id, stored.effort, stored.perceived_effort])).toEqual([
      [at.amrap.block.id, 'too_hard', null],
      [at.forTime.block.id, 'about_right', null],
      [at.ladder.block.id, null, null],
      [at.emom.block.id, 'too_easy', null],
    ])
    expect(double.blockResults()[0]).toMatchObject({ rounds_completed: 3, partial_round_reps: 7, notes: 'Grip went in round 3' })
    expect(double.movementResults().map((stored) => [stored.workout_exercise_id, stored.round_number, stored.actual_reps, stored.actual_duration_seconds, stored.actual_distance, stored.weight])).toEqual([
      [swing.id, 4, 5, null, null, 20],
      [burpee.id, 4, 2, null, null, null],
      [row.id, 4, null, null, 125, null],
      [wallBall.id, 1, 31, null, null, 6],
      [plank.id, 1, null, 45, null, null],
      [squat.id, 3, 4, null, null, 16],
      [pushUp.id, 3, 6, null, null, null],
      [emomSwing.id, null, null, null, null, 28],
    ])
    expect(double.movementResults().find((stored) => stored.workout_exercise_id === row.id)?.actual_distance_unit).toBe('m')

    // History, through the app's reconstruction parse and reader.
    const view = await history(workout, double)
    const amrapView_ = blockView(view, at.amrap.block.id)
    expect(effortWord(amrapView_.effort)).toBe('Too hard')
    expect(amrapView_.perceivedEffort).toBeNull()
    expect(amrapView_.notes).toBe('Grip went in round 3')
    expect(amrapView_.outcome).toEqual([{ label: 'Rounds', value: '3' }, { label: 'Partial round', value: '7 reps' }])
    expect(amrapView_.movementActuals.map((reading) => [reading.exerciseId, reading.roundLabel, reading.amount, reading.weight])).toEqual([
      [swing.id, 'Round 4', '5 reps', '20 kg'],
      [burpee.id, 'Round 4', '2 reps', null],
      [row.id, 'Round 4', '125 m', null],
    ])
    expect(blockView(view, at.forTime.block.id).movementActuals.map((reading) => [reading.roundLabel, reading.amount, reading.weight])).toEqual([
      ['Round 1', '31 reps', '6 kg'],
      ['Round 1', '45s', null],
    ])
    expect(blockView(view, at.ladder.block.id).movementActuals.map((reading) => [reading.exerciseId, reading.name, reading.roundLabel, reading.amount, reading.weight])).toEqual([
      [squat.id, exerciseName(squat.exercise_id), 'Rung 3', '4 reps', '16 kg'],
      [pushUp.id, exerciseName(pushUp.exercise_id), 'Rung 3', '6 reps', null],
    ])
    expect(blockView(view, at.emom.block.id)).toMatchObject({ effort: 'too_easy', notes: 'Minute 7: burpees scaled to 6' })
    expect(blockView(view, at.emom.block.id).movementActuals.map((reading) => [reading.round, reading.amount, reading.weight])).toEqual([[null, null, '28 kg']])

    // Actual entries, not planned values: nothing read back equals the plan
    // where the athlete entered something else, and none of it is a set.
    expect([swing.target_value, swing.load_value, wallBall.target_value, wallBall.load_value]).toEqual([12, 24, 40, 9])
    expect(view.loggedSetCount).toBe(0)
    for (const block of [at.amrap, at.forTime, at.ladder, at.emom]) {
      for (const exercise of blockView(view, block.block.id).exercises) expect(exercise.sets).toEqual([])
    }
  }, HEAVY_MS)

  it('TASK-AC-1D3D95F6D419 categorical section effort is never coerced into the legacy 1-10 number, and the legacy number keeps its reading and meaning', async () => {
    const { at, double, workout } = setup()

    // The category goes to its own column, with perceived_effort null on the wire.
    for (const category of Constants.public.Enums.set_effort) {
      const completion: BlockCompletion = { blockId: at.amrap.block.id, outcome: { effort: category }, perceivedEffort: null }
      expect(blockResultInsert(completion)).toMatchObject({ effort: category, perceived_effort: null })
    }
    const draft = { ...timedResultDraft(at.amrap.block.id, 'amrap', amrapAt({ roundsCompleted: 2 }), [], minter('5')), effort: 'too_easy' as const }
    const built = request(draft, context(at.amrap, { movements: [] }))
    expect(built.completion).toEqual({ blockId: at.amrap.block.id, outcome: { elapsedSeconds: 480, roundsCompleted: 2, effort: 'too_easy' }, perceivedEffort: null })
    expect((await saveTimedResult(workout.blockResults, built)).ok).toBe(true)
    const [sent] = writes(double, '/block_results', 'POST')[0].body as Record<string, unknown>[]
    expect(sent).toMatchObject({ effort: 'too_easy', perceived_effort: null })

    // A number is never accepted as the category, nor the category as the number.
    const numeric = await workout.blockResults.record({ blockId: at.forTime.block.id, outcome: { effort: 7 as never }, perceivedEffort: null })
    expect(isErr(numeric) && numeric.error.code).toBe(ErrorCode.VALIDATION_CONSTRAINT)
    const asNumber = await workout.blockResults.record({ blockId: at.forTime.block.id, outcome: {}, perceivedEffort: 'too_easy' as never })
    expect(isErr(asNumber) && asNumber.error.code).toBe(ErrorCode.VALIDATION_OUT_OF_RANGE)

    // An older row's legacy number still reads on its scale, with no category.
    const legacy = await workout.blockResults.record({ blockId: at.ladder.block.id, outcome: { highestRung: 4 }, perceivedEffort: 7 })
    expect(legacy.ok && [legacy.value.perceived_effort, legacy.value.effort]).toEqual([7, null])
    const view = await history(workout, double)
    expect(blockView(view, at.ladder.block.id)).toMatchObject({ perceivedEffort: '7 of 10', effort: null })
    expect(blockView(view, at.amrap.block.id)).toMatchObject({ perceivedEffort: null, effort: 'too_easy' })

    // Adaptive conditioning reads only the number: a category supplies none,
    // so "too easy" can never become a progression nudge.
    const reading = (perceivedEffort: number | null): ConditioningSectionRead => ({
      sessionId: double.session().id, blockId: at.amrap.block.id, date: '2026-09-24', intensity: 6, format: 'amrap',
      fingerprint: 'amrap:kb-swing+burpee', completion: 'complete', perceivedEffort, score: null,
    })
    const stored = double.blockResults().find((row) => row.block_id === at.amrap.block.id)
    expect(conditioningTrend([reading(stored?.perceived_effort ?? null), reading(stored?.perceived_effort ?? null)])).toBe('hold')
  }, HEAVY_MS)

  it('TASK-AC-1D3D95F6D419 null, zero and unreported stay distinct: blank is no row and no reading, zero is stored and read as zero, and an unrecorded round attaches no amount', async () => {
    const { at, double, workout } = setup()
    const [swing, burpee, row] = at.movements(at.amrap)

    const draft = withEntries(
      timedResultDraft(at.amrap.block.id, 'amrap', amrapAt({ roundsCompleted: 0, partialRoundReps: 0 }), at.movements(at.amrap), minter('6')),
      { [swing.id]: { amount: '0', weight: '0' }, [burpee.id]: { amount: ' ', weight: '' }, [row.id]: { amount: '', weight: '' } },
      { notes: '   ' },
    )
    const built = request(draft, context(at.amrap))
    expect(built.partialRound).toBe(1) // an explicit 0 rounds is round 1
    // Whitespace notes and an unanswered effort are not reported at all.
    expect(built.completion.outcome).toEqual({ elapsedSeconds: 480, roundsCompleted: 0, partialRoundReps: 0 })
    expect(built.movements.map((write) => [write.workoutExerciseId, write.row === null])).toEqual([[swing.id, false], [burpee.id, true], [row.id, true]])
    expect((await saveTimedResult(workout.blockResults, built)).ok).toBe(true)

    const [sent] = writes(double, '/block_results', 'POST')[0].body as Record<string, unknown>[]
    expect(Object.keys(sent)).not.toContain('effort')
    expect(sent.notes).toBeNull()
    expect(double.movementResults()).toHaveLength(1)
    expect(double.movementResults()[0]).toMatchObject({ round_number: 1, actual_reps: 0, weight: 0 })

    const view = blockView(await history(workout, double), at.amrap.block.id)
    expect(view.outcome).toEqual([{ label: 'Rounds', value: '0' }, { label: 'Partial round', value: '0 reps' }])
    expect(view.movementActuals.map((reading) => [reading.roundLabel, reading.amount, reading.weight])).toEqual([['Round 1', '0 reps', '0 kg']])
    expect([view.effort, view.notes]).toEqual([null, null])

    // Unrecorded rounds: no round identity, so an amount is refused before
    // anything is sent, while a load alone is accepted with no round.
    const before = double.requests.length
    const unrecorded = timedResultDraft(at.amrap.block.id, 'amrap', amrapAt({}), at.movements(at.amrap), minter('7'))
    const refused = timedResultRequest(withEntries(unrecorded, { [swing.id]: { amount: '5' } }), context(at.amrap))
    expect(isErr(refused) && refused.error.details).toMatchObject({ field: 'round_number', workoutExerciseId: swing.id })
    const loadOnly = request(withEntries(unrecorded, { [swing.id]: { weight: '16' } }), context(at.amrap))
    expect(loadOnly.partialRound).toBeNull()
    expect(loadOnly.movements[0].row).toMatchObject({ round_number: null, actual_reps: null, weight: 16 })
    expect(double.requests.length).toBe(before)

    // A load on unloaded equipment is refused, never coerced away.
    const unloaded = timedResultRequest(withEntries(unrecorded, { [burpee.id]: { weight: '10' } }), context(at.amrap))
    expect(isErr(unloaded) && unloaded.error.details).toMatchObject({ field: 'weight', workoutExerciseId: burpee.id })
  }, HEAVY_MS)

  it('TASK-AC-1D3D95F6D419 the For Time round rule is kept: a single pass is round 1, a multi-round race takes the round after a recorded count, and without one only loads are saved', async () => {
    const { at, double, workout } = setup()
    const [thruster] = at.movements(at.race)
    const [wallBall] = at.movements(at.forTime)
    expect([at.forTime.block.rounds, at.race.block.rounds]).toEqual([null, 3])
    const capped = raceAt({}, 600, undefined, 600)
    expect(capped).toMatchObject({ completedUnderCap: false })
    expect(capped).not.toHaveProperty('roundsCompleted')

    const race = (outcome: TimedResultDraft['outcome'], entries: Readonly<Record<string, Partial<MovementActualDraft>>>) =>
      timedResultRequest(withEntries(timedResultDraft(at.race.block.id, 'for_time', outcome, at.movements(at.race), minter('8')), entries), context(at.race))

    // Multi-round, no recorded count: an amount has no round and is refused…
    const noCount = race(capped, { [thruster.id]: { amount: '7' } })
    expect(isErr(noCount) && noCount.error.details?.field).toBe('round_number')
    // …a load alone is saved with no round…
    const loadOnly = race(capped, { [thruster.id]: { weight: '35' } })
    expect(loadOnly.ok && loadOnly.value.partialRound).toBeNull()
    // …and with a recorded count of 2 it is round 3, never past the last.
    const counted = race({ ...capped, roundsCompleted: 2 }, { [thruster.id]: { amount: '7', weight: '35' } })
    expect(counted.ok && counted.value.partialRound).toBe(3)
    const finished = race({ ...capped, roundsCompleted: 3 }, {})
    expect(finished.ok && finished.value.partialRound).toBeNull()
    // Complete claims no partial.
    const complete = race(raceAt({ finishedAt: '2026-09-24T09:07:00+00:00' }, 600), { [thruster.id]: { amount: '7' } })
    expect(isErr(complete) && complete.error.details?.field).toBe('round_number')

    // A single pass is round 1, however it stopped short.
    const single = timedResultRequest(
      withEntries(timedResultDraft(at.forTime.block.id, 'for_time', capped, at.movements(at.forTime), minter('9')), { [wallBall.id]: { amount: '30' } }),
      context(at.forTime),
    )
    expect(single.ok && single.value.partialRound).toBe(1)

    if (!loadOnly.ok || !counted.ok) throw new Error('unreachable')
    expect((await saveTimedResult(workout.blockResults, loadOnly.value)).ok).toBe(true)
    expect(double.movementResults()).toMatchObject([{ workout_exercise_id: thruster.id, round_number: null, actual_reps: null, weight: 35 }])
    // A later count corrects the same movement row into round 3.
    const corrected = await saveTimedResult(workout.blockResults, counted.value)
    expect(corrected.ok && corrected.value.corrected).toBe(true)
    expect(double.movementResults()).toMatchObject([{ workout_exercise_id: thruster.id, round_number: 3, actual_reps: 7, weight: 35 }])
    expect(blockView(await history(workout, double), at.race.block.id).movementActuals.map((reading) => reading.roundLabel)).toEqual(['Round 3'])
  }, HEAVY_MS)

  it('TASK-AC-1D3D95F6D419 a correction keeps the identity of the saved rows: the block row and each movement row are restated in place, a cleared movement is removed, and changed progress clears amounts but keeps loads', async () => {
    const { at, double, workout } = setup()
    const [swing, burpee, row] = at.movements(at.amrap)
    const first = withEntries(
      timedResultDraft(at.amrap.block.id, 'amrap', amrapAt({ roundsCompleted: 3, partialRoundReps: 7 }), at.movements(at.amrap), minter('a')),
      { [swing.id]: { amount: '5', weight: '20' }, [burpee.id]: { amount: '2' }, [row.id]: { amount: '100' } },
      { effort: 'too_hard', notes: 'First pass' },
    )
    const saved = await saveTimedResult(workout.blockResults, request(first, context(at.amrap)))
    if (!saved.ok) throw new Error(JSON.stringify(saved.error))
    const blockRowId = saved.value.block.id
    const movementIds = saved.value.movements.map((stored) => stored.id)

    // The athlete corrects: 4 rounds (progress changed → amounts cleared,
    // loads kept), re-enters one amount, clears the rower, drops the note and
    // the effort answer.
    const moved = draftsAfterProgressChange(first.movements, 4, 5)
    const second: TimedResultDraft = withEntries(
      { ...first, outcome: amrapAt({ roundsCompleted: 4, partialRoundReps: 1 }), movements: moved, effort: null, notes: '' },
      { [swing.id]: { amount: '3' } },
    )
    expect(second.movements[swing.id]).toEqual({ amount: '3', weight: '20' })
    expect(second.movements[burpee.id]).toEqual({ amount: '', weight: '' })
    const resaved = await saveTimedResult(workout.blockResults, request(second, context(at.amrap)))
    if (!resaved.ok) throw new Error(JSON.stringify(resaved.error))
    expect(resaved.value.corrected).toBe(true)

    // The insert answered 23505, the correction restated the same row.
    expect(writes(double, '/block_results', 'PATCH')).toHaveLength(1)
    expect(double.blockResults()).toHaveLength(1)
    expect(double.blockResults()[0]).toMatchObject({
      id: blockRowId, rounds_completed: 4, partial_round_reps: 1, notes: null, effort: null, perceived_effort: null,
    })
    // The swing row kept its id and moved to round 5; the others were removed.
    expect(double.movementResults()).toHaveLength(1)
    expect(double.movementResults()[0]).toMatchObject({ id: movementIds[0], workout_exercise_id: swing.id, round_number: 5, actual_reps: 3, weight: 20 })
    const view = blockView(await history(workout, double), at.amrap.block.id)
    expect(view.movementActuals.map((reading) => [reading.roundLabel, reading.amount, reading.weight])).toEqual([['Round 5', '3 reps', '20 kg']])
    expect([view.effort, view.notes]).toEqual([null, null])

    // A correction never becomes an insert: no saved row, nothing written.
    const missing = await workout.blockResults.correct({ blockId: at.ladder.block.id, outcome: { highestRung: 1 }, perceivedEffort: null })
    expect(isErr(missing) && missing.error.code).toBe(ErrorCode.PERSISTENCE_NOT_FOUND)
    expect(double.blockResults()).toHaveLength(1)
  }, HEAVY_MS)

  it('TASK-AC-FCFBE3CD46A6 a refused save keeps the draft and the error, sends nothing the table would refuse, and the retry writes each row exactly once', async () => {
    const { at, double, workout } = setup()
    const [swing, burpee] = at.movements(at.amrap)
    const draft = withEntries(
      timedResultDraft(at.amrap.block.id, 'amrap', amrapAt({ roundsCompleted: 3 }), at.movements(at.amrap), minter('b')),
      { [swing.id]: { amount: '5', weight: '20' }, [burpee.id]: { amount: '2' } },
      { effort: 'about_right', notes: 'Kept' },
    )
    let state = timedSaveState(draft)

    // Refused before anything is sent: a value the table would refuse.
    const invalid = timedResultRequest(withEntries(draft, { [swing.id]: { amount: '-1' } }), context(at.amrap))
    expect(isErr(invalid) && invalid.error.details).toMatchObject({ field: 'actual_reps', workoutExerciseId: swing.id })
    const bad = await workout.blockResults.recordMovements([{ workoutExerciseId: swing.id, row: { id: fixtureId('b', 92), workout_exercise_id: swing.id, actual_reps: 5, weight_unit: 'kg' } }])
    expect(isErr(bad) && bad.error.details).toMatchObject({ field: 'round_number' })
    expect(double.requests).toHaveLength(0)

    // The block save is refused: nothing stored, the draft and error kept.
    double.refuseNext('/block_results', 503, 'POST')
    state = timedSaveStarted(state)
    const firstTry = await saveTimedResult(workout.blockResults, request(state.draft, context(at.amrap)))
    state = timedSaveSettled(state, firstTry)
    expect(state.status).toBe('failed')
    expect(state.draft).toBe(draft)
    expect(state.error).toMatchObject({ code: ErrorCode.NETWORK_SERVER_ERROR, details: { stage: 'block' } })
    expect([double.blockResults().length, double.movementResults().length]).toEqual([0, 0])

    // The retry gets the block row through, then a movement write is refused.
    double.refuseNext('/block_movement_results', 503, 'POST')
    const secondTry = await saveTimedResult(workout.blockResults, request(state.draft, context(at.amrap)))
    state = timedSaveSettled(timedSaveStarted(state), secondTry)
    expect(state.error).toMatchObject({ code: ErrorCode.NETWORK_SERVER_ERROR, details: { stage: 'movements', workoutExerciseId: swing.id, written: 0 } })
    expect(state.draft).toBe(draft)
    expect([double.blockResults().length, double.movementResults().length]).toEqual([1, 0])

    // The third try converges: the block row is restated (23505 → correction),
    // each movement written once.
    const thirdTry = await saveTimedResult(workout.blockResults, request(state.draft, context(at.amrap)))
    state = timedSaveSettled(timedSaveStarted(state), thirdTry)
    expect(state).toMatchObject({ status: 'saved', error: null })
    expect(state.draft).toBe(draft)
    expect(state.saved?.corrected).toBe(true)
    expect(double.blockResults()).toHaveLength(1)
    expect(double.blockResults()[0]).toMatchObject({ rounds_completed: 3, effort: 'about_right', notes: 'Kept' })
    expect(double.movementResults().map((stored) => [stored.workout_exercise_id, stored.actual_reps])).toEqual([[swing.id, 5], [burpee.id, 2]])
  }, HEAVY_MS)

  it('TASK-AC-FCFBE3CD46A6 a retry after lost answers is idempotent: writes that landed but whose answers were lost are corrected through the 23505, never duplicated, and repeating the save changes nothing', async () => {
    const { at, double, workout } = setup()
    const [squat, pushUp] = at.movements(at.ladder)
    const rungCount = 4
    const draft = withEntries(
      timedResultDraft(at.ladder.block.id, 'ladder', { highestRung: 2 }, at.movements(at.ladder), minter('c')),
      { [squat.id]: { amount: '4', weight: '16' }, [pushUp.id]: { amount: '5' } },
      { effort: 'too_hard', notes: 'Lost answer' },
    )
    const ctx = context(at.ladder, { rungCount })

    // The block insert lands but its answer is lost.
    double.loseNextAnswer('/block_results', 'POST')
    const lost = await saveTimedResult(workout.blockResults, request(draft, ctx))
    expect(isErr(lost) && lost.error).toMatchObject({ code: ErrorCode.NETWORK_OFFLINE, details: { stage: 'block' } })
    expect(double.blockResults()).toHaveLength(1)

    // The athlete changes the rung-3 push-ups before retrying: the 23505 is
    // corrected to what they last confirmed, not absorbed.
    const changed = withEntries(draft, { [pushUp.id]: { amount: '6' } })
    double.loseNextAnswer('/block_movement_results', 'POST')
    const lostMovement = await saveTimedResult(workout.blockResults, request(changed, ctx))
    expect(isErr(lostMovement) && lostMovement.error.details).toMatchObject({ stage: 'movements', workoutExerciseId: squat.id })
    expect(double.movementResults()).toHaveLength(1)

    const retried = await saveTimedResult(workout.blockResults, request(changed, ctx))
    expect(retried.ok && retried.value.corrected).toBe(true)
    // The lost squat insert is answered 23505 and restated; the push-up inserted once.
    const squatInserts = writes(double, '/block_movement_results', 'POST').filter((entry) => (entry.body as { workout_exercise_id: string }[])[0].workout_exercise_id === squat.id)
    expect(squatInserts).toHaveLength(2)
    expect(writes(double, '/block_movement_results', 'PATCH')).toHaveLength(1)

    const snapshotOfRows = () => ({
      blocks: double.blockResults().map(({ id, block_id, highest_rung, effort, notes }) => ({ id, block_id, highest_rung, effort, notes })),
      movements: double.movementResults().map(({ id, workout_exercise_id, round_number, actual_reps, weight }) => ({ id, workout_exercise_id, round_number, actual_reps, weight })),
    })
    const settled = snapshotOfRows()
    expect(settled.blocks).toHaveLength(1)
    expect(settled.movements).toEqual([
      { id: draft.rowIds[squat.id], workout_exercise_id: squat.id, round_number: 3, actual_reps: 4, weight: 16 },
      { id: draft.rowIds[pushUp.id], workout_exercise_id: pushUp.id, round_number: 3, actual_reps: 6, weight: null },
    ])

    // Repeating the identical save twice more leaves exactly the same rows.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      expect((await saveTimedResult(workout.blockResults, request(changed, ctx))).ok).toBe(true)
    }
    expect(snapshotOfRows()).toEqual(settled)
    expect(blockView(await history(workout, double), at.ladder.block.id).movementActuals.map((reading) => [reading.roundLabel, reading.amount])).toEqual([
      ['Rung 3', '4 reps'],
      ['Rung 3', '6 reps'],
    ])
  }, HEAVY_MS)

  it('TASK-AC-FCFBE3CD46A6 the client and read-model boundary refuses what does not belong to the caller or the block and never reads a malformed stored row as recorded', async () => {
    const { at, snapshot, double, workout } = setup()
    const [swing] = at.movements(at.amrap)
    const [wallBall] = at.movements(at.forTime)

    // A movement row must name the movement it is written for; a draft entry
    // for a movement outside the block is refused.
    const mismatched = await workout.blockResults.recordMovements([
      { workoutExerciseId: swing.id, row: { id: fixtureId('b', 93), workout_exercise_id: wallBall.id, weight: 9, weight_unit: 'kg' } },
    ])
    expect(isErr(mismatched) && mismatched.error.details).toMatchObject({ field: 'workout_exercise_id' })
    const foreign = timedResultDraft(at.amrap.block.id, 'amrap', amrapAt({ roundsCompleted: 1 }), [...at.movements(at.amrap), wallBall], minter('d'))
    const stranger = timedResultRequest(foreign, context(at.amrap))
    expect(isErr(stranger) && stranger.error.details).toMatchObject({ field: 'workout_exercise_id', workoutExerciseId: wallBall.id })
    const wrongBlock = timedResultRequest(timedResultDraft(at.forTime.block.id, 'amrap', {}, [], minter('d')), context(at.amrap))
    expect(isErr(wrongBlock) && wrongBlock.error.details?.field).toBe('block_id')
    const noRungs = timedResultRequest(timedResultDraft(at.ladder.block.id, 'ladder', { highestRung: 1 }, [], minter('d')), context(at.ladder))
    expect(isErr(noRungs) && noRungs.error.details?.field).toBe('rung_count')
    expect(double.requests).toHaveLength(0)

    // Another person's session: their policies refuse the insert, and a
    // correction finds nothing to change.
    const intruder = createLoggingDouble({ snapshot, userId: OTHER_USER })
    const theirs = clientsFor(intruder)
    const denied = await theirs.blockResults.recordMovements([
      { workoutExerciseId: swing.id, row: { id: fixtureId('b', 94), workout_exercise_id: swing.id, round_number: 1, actual_reps: 5, weight_unit: 'kg' } },
    ])
    expect(isErr(denied) && denied.error.code).toBe(ErrorCode.AUTH_UNAUTHORIZED)
    expect(intruder.movementResults()).toEqual([])
    const notTheirs = await theirs.blockResults.correct({ blockId: at.amrap.block.id, outcome: {}, perceivedEffort: null })
    expect(isErr(notTheirs) && notTheirs.error.code).toBe(ErrorCode.PERSISTENCE_NOT_FOUND)

    // A column the client may not set is refused by the grant, not ignored.
    const ungranted = await double.fetch(`${LOGGING_DOUBLE_URL}/rest/v1/block_movement_results`, {
      method: 'POST',
      headers: { apikey: LOGGING_DOUBLE_ANON_KEY, Authorization: `Bearer ${LOGGING_DOUBLE_TOKEN}` },
      body: JSON.stringify([{ id: fixtureId('b', 95), workout_exercise_id: swing.id, weight: 20, weight_unit: 'kg', prescription_revision_status: 'superseded' }]),
    })
    expect(ungranted.status).toBe(403)

    // The read model refuses a stored row the table could not hold, rather
    // than reading an amount with no round as recorded.
    const performed = await workout.sessions.asPerformed(snapshot.session.id)
    if (isErr(performed)) throw new Error('unreachable')
    const tampered = structuredClone(performed.value) as unknown as { sections: { blocks: { exercises: Record<string, unknown>[] }[] }[] }
    tampered.sections[0].blocks[0].exercises[0].movement_result = {
      id: fixtureId('b', 96), workout_exercise_id: swing.id, prescription_revision_status: 'active', round_number: null,
      actual_reps: 5, actual_duration_seconds: null, actual_distance: null, actual_distance_unit: null, weight: null,
      weight_unit: 'kg', created_at: STARTED_AT, updated_at: STARTED_AT,
    }
    expect(sessionReconstructionSchema.safeParse(tampered).success).toBe(false)
    // The control: the same row with its round is read.
    ;(tampered.sections[0].blocks[0].exercises[0].movement_result as Record<string, unknown>).round_number = 4
    expect(sessionReconstructionSchema.safeParse(tampered).success).toBe(true)
    // A reconstruction without the key (a project MIG-B has not reached) reads
    // as nothing recorded — never zero.
    expect(performed.value.sections[0].blocks[0].exercises[0].movement_result).toBeNull()
  }, HEAVY_MS)

  it('TASK-AC-FCFBE3CD46A6 on the hosted schema before LIVE-PRE-1 the shipped saves and History keep working, and the new writers refuse explicitly, naming the missing migration, with the draft kept', async () => {
    const { at, double, workout } = setup({ schema: 'hosted-before-timed-actuals' })

    // The shipped completion path (no effort, no movements) saves as before.
    const shipped = await workout.blockResults.record({ blockId: at.emom.block.id, outcome: { notes: 'Minute 7 scaled' }, perceivedEffort: null })
    expect(shipped.ok && [shipped.value.notes, shipped.value.effort]).toEqual(['Minute 7 scaled', null])
    const [sent] = writes(double, '/block_results', 'POST')[0].body as Record<string, unknown>[]
    expect(Object.keys(sent)).not.toContain('effort')
    // History reads it, with no effort and no movement actuals.
    const view = blockView(await history(workout, double), at.emom.block.id)
    expect(view).toMatchObject({ notes: 'Minute 7 scaled', effort: null, movementActuals: [] })

    // The new writers: explicit refusal naming the migration, nothing dropped.
    const withEffort = withEntries(
      timedResultDraft(at.amrap.block.id, 'amrap', amrapAt({ roundsCompleted: 2 }), at.movements(at.amrap), minter('e')),
      {},
      { effort: 'too_hard' },
    )
    let state = timedSaveSettled(timedSaveStarted(timedSaveState(withEffort)), await saveTimedResult(workout.blockResults, request(withEffort, context(at.amrap))))
    expect(state.error).toMatchObject({ details: { stage: 'block', reason: 'migration-not-applied', migration: 'MIG-A', pgCode: 'PGRST204' } })
    expect(state.draft).toBe(withEffort)
    expect(double.blockResults().some((row) => row.block_id === at.amrap.block.id)).toBe(false)

    const withMovement = withEntries(
      timedResultDraft(at.forTime.block.id, 'for_time', raceAt({}, 900, undefined, 900), at.movements(at.forTime), minter('f')),
      { [at.movements(at.forTime)[0].id]: { amount: '30' } },
    )
    state = timedSaveSettled(timedSaveStarted(timedSaveState(withMovement)), await saveTimedResult(workout.blockResults, request(withMovement, context(at.forTime))))
    expect(state.error).toMatchObject({ details: { stage: 'movements', reason: 'migration-not-applied', migration: 'MIG-B', pgCode: 'PGRST205' } })
    expect(state.draft).toBe(withMovement)

    const correction = await workout.blockResults.correct({ blockId: at.emom.block.id, outcome: { notes: 'Corrected' }, perceivedEffort: null })
    expect(isErr(correction) && correction.error.details).toMatchObject({ migration: 'MIG-A', reason: 'migration-not-applied' })
    expect(double.blockResults().find((row) => row.block_id === at.emom.block.id)?.notes).toBe('Minute 7 scaled')
  }, HEAVY_MS)

  it('TASK-AC-FCFBE3CD46A6 the required migrations and their live authority are exposed separately: which files, which environment, who decides, and that it was not taken', () => {
    const spec = read('docs/specs/LOGGING_FIELD_CONTRACT.md')
    const section = spec.slice(spec.indexOf('## 7. Isolated prerequisites'), spec.indexOf('## 8. Validation'))
    expect(section).toContain(MIG_A.split('/').at(-1))
    expect(section).toContain(MIG_B.split('/').at(-1))
    expect(section).toMatch(/\*\*Not applied\*\*/)
    expect(section).toMatch(/Exact live authority still required \(TASK-031; not taken\)/)
    expect(section).toContain('qxckevxniacktaqecypl')
    expect(section).toMatch(/\*\*Who:\*\* the owner/)
    expect(section).toMatch(/production schema\s+change/)
    expect(section).toContain('rls-standing.yml')
    expect(PROPOSED_PATHS.find((path) => path.id === 'LIVE-PRE-1')).toMatchObject({ kind: 'live-authority', owner: 'owner' })

    const note = read('docs/journal/clear-refinement-20261103/TASK-031.md')
    expect(note).toContain('LIVE-PRE-1')
    expect(note).toMatch(/not applied/i)
    expect(note).toMatch(/JOURNEY-031 is not claimed complete/)

    // The disposition audit's entry is unseeded so the shared hosted seed keeps working.
    const dispositions = read('scripts/e2e/dispositions.mjs')
    expect(dispositions).toMatch(/table: 'block_movement_results',\s+standing: 'cross-user',\s+ownerColumn: null,\s+seeded: false,/)
  })

  it('TASK-AC-D37D178270A8 the data providers exist for TASK-015, TASK-019, TASK-026 and TASK-047, no shipped route or renderer adopts them yet, and JOURNEY-031 is not claimed', () => {
    for (const id of ['block-result-correction', 'movement-actuals-writer', 'timed-result-save', 'timed-read-model', 'block-effort-schema', 'movement-actual-schema']) {
      const path = PROPOSED_PATHS.find((candidate) => candidate.id === id)
      expect(path, id).toMatchObject({ owner: 'TASK-031' })
      expect(path?.ref?.proposedBy, id).toBeUndefined()
    }
    expect(PROPOSED_PATHS.find((path) => path.id === 'timed-entry')).toMatchObject({ owner: 'TASK-015', ref: { extendedBy: 'TASK-015' } })
    expect(PROPOSED_PATHS.find((path) => path.id === 'visible-proof')).toMatchObject({ owner: 'TASK-047' })

    // The real exports the dependants build on.
    const provider = read('src/state/timed-results.ts')
    for (const name of ['timedResultDraft', 'timedResultRequest', 'saveTimedResult', 'timedSaveSettled']) {
      expect(provider, name).toMatch(new RegExp(`export (?:async )?function ${name}\\b`))
    }
    expect(read('src/state/session-detail.ts')).toMatch(/export function movementActualReadings\b/)

    // No shipped file adopts them: no entry UI, no route wiring, the shell's
    // one completion path unchanged (still `perceivedEffort: null`, no effort).
    const runtime = readdirSync(join(REPO_ROOT, 'src'), { recursive: true, encoding: 'utf8' })
      .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file) && !/^test[/\\]/.test(file))
    const adopters = runtime.filter((file) => /timed-results'|blockResults\.(?:correct|recordMovements)\(|movementActualReadings\(/.test(read(`src/${file}`)))
    expect(adopters.sort()).toEqual(['state/session-detail.ts'])
    expect(read('src/state/block-completion-provider.tsx')).not.toMatch(/\beffort:/)

    // The contract module stays out of the shipped graph (bundle).
    const imported = runtime.filter((file) => /refinement-logging-contract'/.test(read(`src/${file}`)))
    expect(imported.sort()).toEqual(['state/ladder-recovery.ts', 'state/timed-results.ts'])
    expect(read('src/state/ladder-recovery.ts')).toMatch(/import type \{[^}]*\} from '\.\.\/data\/refinement-logging-contract'/)

    expect(read('docs/journal/clear-refinement-20261103/TASK-031.md')).toMatch(/JOURNEY-031 is not claimed complete/)
  })
})
