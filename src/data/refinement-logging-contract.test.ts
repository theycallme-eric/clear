/**
 * TASK-030 (REQ-030) — the logging field-to-contract matrix, proven against the
 * code it describes before any dependent task writes against it.
 *
 * Three kinds of evidence, all deterministic and offline:
 *
 *   · **Binding.** Every source the matrix names is a real export, every
 *     existing column is in the generated types, every proposed one is still
 *     absent, and the published specification states the same facts.
 *   · **Consumer rehearsal.** The app's own clients (`createWorkoutClients`,
 *     `createSummaryClient`, `createRestDayClient`) write every existing
 *     logging moment through an in-memory PostgREST transcribed from the
 *     migrations (`src/test/logging-contract-double.ts`), and the app's own
 *     readers read it back: `loggedSetFromRow` (Workout), `sessionDetail`
 *     (History), the rest-day read, the anchor evidence and `d5MissedReps`.
 *     Nothing here writes on the app's behalf, and the double is not the
 *     deployed database — that proof is TASK-047's, on the disposable lane.
 *   · **Boundary.** Categorical effort never becomes the legacy 1–10 number,
 *     the reasons a timed partial cannot reuse a set log, and the proposed
 *     per-movement identities derived from the blocks' real outcomes.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { Constants } from './database.types'
import type { AuthSession } from './auth'
import { createRestDayClient } from './rest-days'
import { createSummaryClient } from './summary'
import { createWorkoutClients } from './workout'
import {
  LOGGING_FIELDS,
  LOGGING_MOMENT_IDS,
  LOGGING_MOMENTS,
  PROPOSED_PATHS,
  draftsAfterProgressChange,
  loadApplies,
  movementActualFromDraft,
  partialRoundFor,
  type FieldContract,
  type SourceRef,
} from './refinement-logging-contract'
import { amrapOutcome, amrapView, type AmrapState } from '../state/amrap'
import { blockResultInsert, isPerceivedEffort, type BlockCompletion } from '../state/block-completion'
import { conditioningTrend, type ConditioningSectionRead } from '../state/conditioning'
import { d5MissedReps } from '../state/deload'
import { ErrorCode, ok, type Result } from '../state/errors'
import { forTimeOutcome, forTimeView, type ForTimeState } from '../state/for-time'
import { ladderRungs } from '../state/ladder'
import { moodStep } from '../state/mood'
import { sessionDebriefSchema, setEffortSchema, type SessionSnapshot, type WorkoutExerciseRow } from '../state/schemas'
import { sessionDetail, type SessionDetailView } from '../state/session-detail'
import { setObservationMutation } from '../state/set-observation-mutation'
import { isRecordedEffort, loggedSetFromRow, setLogViolation, type SetLogEntry } from '../state/set-logging'
import {
  BLOCK_RESULT_COLUMNS,
  LOGGING_DOUBLE_ANON_KEY,
  LOGGING_DOUBLE_TOKEN,
  LOGGING_DOUBLE_URL,
  REST_DAY_COLUMNS,
  SET_LOG_COLUMNS,
  createLoggingDouble,
  type LoggingDouble,
} from '../test/logging-contract-double'
import { fixtureId, snapshotFixture } from '../test/workout-double'

const REPO_ROOT = join(import.meta.dirname, '..', '..')
const read = (path: string) => readFileSync(join(REPO_ROOT, path), 'utf8')

const USER_ID = 'a0000001-0000-4000-8000-000000000000'
const STARTED_AT = '2026-09-24T09:00:00+00:00'
const REHEARSAL_TIMEOUT_MS = 20_000

// ─────────────────────────────────────────────────────────────────────────────
// The session every rehearsal performs: one block per logging family
// ─────────────────────────────────────────────────────────────────────────────

function session(overrides: { completed?: boolean } = {}): SessionSnapshot {
  return snapshotFixture({
    userId: USER_ID,
    startedAt: STARTED_AT,
    state: overrides.completed ? 'completed' : 'active',
    session: overrides.completed ? { completed_at: '2026-09-24T10:00:00+00:00' } : {},
    sections: [
      {
        title: 'Primary lift',
        sectionType: 'primary_lift',
        blocks: [
          {
            exercises: [
              { prescription: { exercise_id: 'back-squat', sets: 3, target_value: 5, equipment_used: 'barbell', load_type: 'absolute', load_value: 100 } },
            ],
          },
        ],
      },
      {
        title: 'Accessory',
        sectionType: 'accessory',
        blocks: [
          {
            exercises: [
              { prescription: { exercise_id: 'dumbbell-row', sets: 3, target_value: 10, equipment_used: 'dumbbell', load_type: 'absolute', load_value: 22.5 } },
              { prescription: { exercise_id: 'plank', modality: 'time', sets: 2, target_value: 45, equipment_used: 'bodyweight', load_type: 'bodyweight' } },
              {
                prescription: {
                  exercise_id: 'farmer-carry', modality: 'distance', sets: 2, target_value: 40, distance_unit: 'm',
                  equipment_used: 'kettlebell', load_type: 'absolute', load_value: 24,
                },
              },
            ],
          },
          {
            structureType: 'superset',
            exercises: [
              { prescription: { exercise_id: 'push-up', sets: 2, target_value: 12, equipment_used: 'bodyweight', load_type: 'bodyweight' } },
              { prescription: { exercise_id: 'dumbbell-curl', sets: 2, target_value: 10, equipment_used: 'dumbbell', load_type: 'absolute', load_value: 12 } },
            ],
          },
        ],
      },
      {
        title: 'Conditioning',
        sectionType: 'conditioning',
        blocks: [
          {
            structureType: 'circuit',
            rounds: 3,
            exercises: [
              { prescription: { exercise_id: 'kb-swing', sets: null, target_value: 15, equipment_used: 'kettlebell', load_type: 'absolute', load_value: 24 } },
              { prescription: { exercise_id: 'burpee', sets: null, target_value: 10, equipment_used: 'bodyweight', load_type: 'bodyweight' } },
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
          {
            structureType: 'amrap',
            timerType: 'countdown',
            timerSeconds: 480,
            exercises: [
              { prescription: { exercise_id: 'kb-swing', sets: null, target_value: 12, equipment_used: 'kettlebell', load_type: 'absolute', load_value: 24 } },
              { prescription: { exercise_id: 'burpee', sets: null, target_value: 8, equipment_used: 'bodyweight', load_type: 'bodyweight' } },
            ],
          },
          {
            structureType: 'for_time',
            timerType: 'count_up',
            timerSeconds: 900,
            exercises: [
              { prescription: { exercise_id: 'wall-ball', sets: null, target_value: 40, equipment_used: 'medicine_ball', load_type: 'absolute', load_value: 9 } },
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
                  exercise_id: 'push-up', sets: null, target_kind: 'sequence', target_value: null,
                  target_sequence: [2, 4, 6, 8], equipment_used: 'bodyweight', load_type: 'bodyweight',
                },
              },
              { prescription: { exercise_id: 'burpee', sets: null, target_value: 4, equipment_used: 'bodyweight', load_type: 'bodyweight' } },
            ],
          },
        ],
      },
    ],
  })
}

/** The blocks and movements of `session()`, by what they are rather than by id. */
function layout(snapshot: SessionSnapshot) {
  const blocks = snapshot.sections.flatMap((section) => section.blocks)
  const [primary, accessory, superset, circuit, emom, amrap, forTime, ladder] = blocks
  const movement = (entry: (typeof blocks)[number], index: number) => entry.exercises[index].exercise
  return {
    primary, accessory, superset, circuit, emom, amrap, forTime, ladder,
    squat: movement(primary, 0),
    row: movement(accessory, 0),
    plank: movement(accessory, 1),
    carry: movement(accessory, 2),
    pushUp: movement(superset, 0),
    curl: movement(superset, 1),
    circuitSwing: movement(circuit, 0),
    amrapSwing: movement(amrap, 0),
    amrapBurpee: movement(amrap, 1),
    wallBall: movement(forTime, 0),
    ladderPushUp: movement(ladder, 0),
    ladderBurpee: movement(ladder, 1),
  }
}

function clientsFor(double: LoggingDouble) {
  const auth = {
    getSession: (): Promise<Result<AuthSession | null>> =>
      Promise.resolve(
        ok({ accessToken: LOGGING_DOUBLE_TOKEN, refreshToken: 'refresh', expiresAt: Date.now() + 60_000, user: { id: USER_ID, email: null } }),
      ),
  }
  const supabase = { url: LOGGING_DOUBLE_URL, anonKey: LOGGING_DOUBLE_ANON_KEY, fetch: double.fetch }
  return {
    workout: createWorkoutClients({ auth, supabase }),
    summary: createSummaryClient({ auth, supabase, timeZone: 'UTC' }),
    restDays: createRestDayClient({ auth, supabase }),
  }
}

let minted = 0
/** A set as the provider would queue it: client-minted id, stamped unit. */
function entry(exercise: WorkoutExerciseRow, performed: SetLogEntry['performed'], weightUnit: SetLogEntry['weightUnit'] = 'kg'): SetLogEntry {
  minted += 1
  return {
    id: fixtureId('c', minted),
    exerciseId: exercise.id,
    blockId: exercise.block_id,
    distanceUnit: exercise.distance_unit,
    weightUnit,
    performed,
  }
}

async function performed(double: LoggingDouble): Promise<SessionDetailView> {
  const reconstruction = await clientsFor(double).workout.sessions.asPerformed(double.session().id)
  expect(reconstruction.ok, JSON.stringify(reconstruction)).toBe(true)
  if (!reconstruction.ok) throw new Error('unreachable')
  return sessionDetail(reconstruction.value)
}

function exerciseView(view: SessionDetailView, id: string) {
  const found = view.sections.flatMap((section) => section.blocks.flatMap((block) => block.exercises)).find((exercise) => exercise.id === id)
  if (found === undefined) throw new Error(`no exercise ${id}`)
  return found
}

function blockView(view: SessionDetailView, id: string) {
  const found = view.sections.flatMap((section) => section.blocks).find((block) => block.id === id)
  if (found === undefined) throw new Error(`no block ${id}`)
  return found
}

// ─────────────────────────────────────────────────────────────────────────────
// Reading the generated types and the source tree
// ─────────────────────────────────────────────────────────────────────────────

/** A table's `Row` keys in `database.types.ts`, or null when there is no such table. */
function generatedColumns(table: string): readonly string[] | null {
  const types = read('src/data/database.types.ts')
  const tables = types.slice(types.indexOf('    Tables: {'), types.indexOf('    Views: {'))
  const match = new RegExp(`\\n {6}${table}: \\{\\n {8}Row: \\{\\n([\\s\\S]*?)\\n {8}\\}`).exec(tables)
  if (match === null) return null
  return [...match[1].matchAll(/^ {10}(\w+)\??:/gm)].map((line) => line[1])
}

function exportsName(module: string, name: string): boolean {
  return new RegExp(`export (?:async )?(?:function|const|class|interface|type) ${name}\\b`).test(read(module))
}

function member(root: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => (value as Record<string, unknown> | undefined)?.[key], root)
}

const everyRef = (): SourceRef[] => [
  ...LOGGING_MOMENTS.flatMap((moment) => [...moment.entry, ...moment.schemas, ...moment.validators, moment.writer, ...moment.readers]),
  ...LOGGING_FIELDS.flatMap((field) => [...field.validators, ...(field.writer === null ? [] : [field.writer]), ...field.readers]),
  ...PROPOSED_PATHS.flatMap((path) => (path.ref === null ? [] : [path.ref])),
]

const field = (id: string): FieldContract => {
  const found = LOGGING_FIELDS.find((candidate) => candidate.id === id)
  if (found === undefined) throw new Error(`no field ${id}`)
  return found
}

// ─────────────────────────────────────────────────────────────────────────────

describe('TASK-030 logging field ownership before dependent writes', () => {
  it('AC-R030-01 inventories exactly the 16 logging moments of the accepted sources, each with schema, validator, writer, identity, null/zero/update meaning, draft and readback', () => {
    // The accepted reference's stable ids, in its order (gallery-refinement-data.ts,
    // REUSE.md "All 16 contexts"; REQ-019 lists the same 16 states).
    expect(LOGGING_MOMENT_IDS).toEqual([
      'anchor', 'other-lift', 'timed-movement', 'distance-movement', 'extra-set', 'set-correction',
      'superset', 'circuit-round', 'circuit-movement', 'movement-note', 'workout-feedback', 'rest-day',
      'emom', 'amrap', 'for_time', 'ladder',
    ])
    expect(LOGGING_MOMENTS.map((moment) => moment.id)).toEqual([...LOGGING_MOMENT_IDS])

    // LOGGING-FIELDS.md has 15 rows; its first covers anchor and other lift.
    const rows = new Set(LOGGING_MOMENTS.map((moment) => moment.sourceRow))
    expect(rows.size).toBe(15)
    expect(LOGGING_MOMENTS.filter((moment) => moment.sourceRow === 'Anchor / primary and other lift').map((moment) => moment.id)).toEqual([
      'anchor',
      'other-lift',
    ])

    const fieldIds = new Set(LOGGING_FIELDS.map((candidate) => candidate.id))
    expect(fieldIds.size).toBe(LOGGING_FIELDS.length)
    for (const moment of LOGGING_MOMENTS) {
      for (const text of [moment.identity, moment.nullMeans, moment.zeroMeans, moment.update, moment.draft, moment.readback.workout, moment.readback.history]) {
        expect(text.trim(), moment.id).not.toBe('')
      }
      expect(moment.schemas.length, moment.id).toBeGreaterThan(0)
      expect(moment.validators.length, moment.id).toBeGreaterThan(0)
      expect(moment.readers.length, moment.id).toBeGreaterThan(0)
      expect(moment.owners.length, moment.id).toBeGreaterThan(0)
      expect(moment.fields.length, moment.id).toBeGreaterThan(0)
      // What a moment writes today exists today; what it is proposed to write does not yet.
      for (const id of moment.fields) {
        expect(fieldIds.has(id), `${moment.id} ${id}`).toBe(true)
        expect(field(id).status, `${moment.id} ${id}`).not.toBe('proposed-migration')
        expect(field(id).status, `${moment.id} ${id}`).not.toBe('prescription')
      }
      for (const id of moment.proposed) {
        expect(fieldIds.has(id), `${moment.id} ${id}`).toBe(true)
        expect(moment.fields, `${moment.id} ${id}`).not.toContain(id)
      }
    }

    // The four timed families each propose effort and an applicable load;
    // EMOM proposes no partial (the schedule is assumed), the other three do.
    const timed = LOGGING_MOMENTS.filter((moment) => ['emom', 'amrap', 'for_time', 'ladder'].includes(moment.id))
    for (const moment of timed) {
      expect(moment.proposed, moment.id).toEqual(expect.arrayContaining(['block_results.effort', 'block_movement_results.weight']))
      expect(moment.proposed.includes('block_movement_results.round_number'), moment.id).toBe(moment.id !== 'emom')
    }
    // Notes: EMOM writes the existing column; the other three reuse it without a migration.
    expect(LOGGING_MOMENTS.find((moment) => moment.id === 'emom')?.fields).toContain('block_results.notes')
    for (const id of ['amrap', 'for_time', 'ladder']) {
      expect(LOGGING_MOMENTS.find((moment) => moment.id === id)?.proposed, id).toContain('block_results.notes')
    }
    expect(field('block_results.notes').status).toBe('existing')

    for (const contract of LOGGING_FIELDS) {
      expect(contract.id).toBe(`${contract.table}.${contract.column}`)
      expect(contract.nullMeans.trim(), contract.id).not.toBe('')
      expect(contract.update.trim(), contract.id).not.toBe('')
      expect(contract.readers.length, contract.id).toBeGreaterThan(0)
      expect(contract.validators.length, contract.id).toBeGreaterThan(0)
      expect(contract.migration !== null, contract.id).toBe(contract.status === 'proposed-migration')
      expect(contract.writer === null, contract.id).toBe(contract.status === 'legacy' || contract.status === 'prescription')
      if (contract.status === 'proposed-migration') expect(contract.owners, contract.id).toContain('TASK-031')
    }
  })

  it('AC-R030-01 every source the matrix names resolves to a real export, every existing column to the generated types, and every proposed one is still absent', () => {
    const clients = clientsFor(createLoggingDouble({ snapshot: session() }))
    const built: Record<string, unknown> = {
      createWorkoutClients: clients.workout,
      createSummaryClient: clients.summary,
      createRestDayClient: clients.restDays,
      createAnchorsClient: clients.workout.anchors,
    }

    for (const ref of everyRef()) {
      const label = `${ref.module}#${ref.name}${ref.member === undefined ? '' : `.${ref.member}`}`
      expect(() => read(ref.module), label).not.toThrow()
      if (ref.member !== undefined) {
        expect(exportsName(ref.module, ref.name), label).toBe(true)
        const found = member(built[ref.name], ref.member)
        expect(typeof found, label).toBe(ref.proposedBy === undefined ? 'function' : 'undefined')
      } else {
        expect(exportsName(ref.module, ref.name), label).toBe(ref.proposedBy === undefined)
      }
    }

    for (const contract of LOGGING_FIELDS) {
      const columns = generatedColumns(contract.table)
      if (contract.status === 'proposed-migration') {
        expect(columns?.includes(contract.column) ?? false, `${contract.id} must not exist yet`).toBe(false)
      } else {
        expect(columns, contract.table).not.toBeNull()
        expect(columns, contract.id).toContain(contract.column)
      }
    }
    // MIG-B's whole table is absent; MIG-A adds one column to an existing table.
    expect(generatedColumns('block_movement_results')).toBeNull()
    expect(generatedColumns('block_results')).not.toContain('effort')
    // MIG-A reuses the existing categorical vocabulary, exactly.
    expect(Constants.public.Enums.set_effort).toEqual(['too_hard', 'about_right', 'too_easy'])

    // The rehearsal double transcribes exactly the generated columns.
    expect([...BLOCK_RESULT_COLUMNS].sort()).toEqual([...(generatedColumns('block_results') ?? [])].sort())
    expect([...SET_LOG_COLUMNS].sort()).toEqual([...(generatedColumns('exercise_set_logs') ?? [])].sort())
    expect([...REST_DAY_COLUMNS].sort()).toEqual([...(generatedColumns('rest_days') ?? [])].sort())
  })

  it('AC-R030-01 the published specification states the same moments, fields, statuses, migrations and owners as the typed contract', () => {
    const spec = read('docs/specs/LOGGING_FIELD_CONTRACT.md')
    const cells = (line: string) => line.split('|').slice(1, -1).map((cell) => cell.trim())

    // §2's inventory: one row per moment, in order, naming its writer.
    const momentRows = spec.split('\n').filter((line) => /^\| \d+ \| `[a-z_-]+` \|/.test(line)).map(cells)
    expect(momentRows.map((row) => row[1].replaceAll('`', ''))).toEqual([...LOGGING_MOMENT_IDS])
    for (const row of momentRows) {
      const moment = LOGGING_MOMENTS.find((candidate) => candidate.id === row[1].replaceAll('`', ''))
      const writer = moment?.writer.member ?? moment?.writer.name
      expect(row.join(' '), row[1]).toContain(String(writer))
    }
    // Every moment has its own detail section.
    for (const id of LOGGING_MOMENT_IDS) expect(spec, id).toContain(`### \`${id}\``)

    // §3's field matrix: id, status, …, migration, owners.
    const fieldRows = spec.split('\n').filter((line) => /^\| `[a-z_]+\.[a-z_]+` \|/.test(line)).map(cells)
    expect(fieldRows.map((row) => row[0].replaceAll('`', ''))).toEqual(LOGGING_FIELDS.map((contract) => contract.id))
    for (const row of fieldRows) {
      const contract = field(row[0].replaceAll('`', ''))
      expect(row[1].replaceAll('`', ''), contract.id).toBe(contract.status)
      expect(row.at(-2), contract.id).toBe(contract.migration ?? '—')
      const owners = (row.at(-1) ?? '').split(',').map((owner) => owner.trim()).filter((owner) => owner !== '' && owner !== '—')
      expect(owners.sort(), contract.id).toEqual([...contract.owners].sort())
    }

    // The isolated prerequisites, each with its owner, and the drafts marked as such.
    for (const path of PROPOSED_PATHS) expect(spec, path.id).toContain(`\`${path.id}\``)
    expect(spec).toMatch(/```sql\n-- DRAFT MIG-A — not a migration/)
    expect(spec).toMatch(/```sql\n-- DRAFT MIG-B — not a migration/)
    expect(spec).toContain('Gallery disposition: not applicable')
  })

  it('AC-R030-01 consumer rehearsal: lifts, timed and distance movements, extra sets, supersets and circuit movements save through the one durable set path and read back in Workout and History', async () => {
    const snapshot = session()
    const at = layout(snapshot)
    const double = createLoggingDouble({ snapshot })
    const { workout } = clientsFor(double)

    const sets: [string, SetLogEntry][] = [
      ['anchor', entry(at.squat, { setNumber: 1, reps: 5, weight: 100, effort: 'too_hard' })],
      ['anchor', entry(at.squat, { setNumber: 2, reps: 0, weight: 100 })],
      ['other-lift', entry(at.row, { setNumber: 1, reps: 10, weight: 22.5, effort: 'about_right' })],
      ['other-lift', entry(at.row, { setNumber: 2, reps: 10 })],
      ['timed-movement', entry(at.plank, { setNumber: 1, durationSeconds: 45 })],
      ['timed-movement', entry(at.plank, { setNumber: 2, durationSeconds: 0, effort: 'too_easy' })],
      ['distance-movement', entry(at.carry, { setNumber: 1, distance: 40, weight: 24 })],
      ['extra-set', entry(at.squat, { setNumber: 4, reps: 3, weight: 100 })],
      ['superset', entry(at.pushUp, { setNumber: 1, reps: 12 })],
      ['superset', entry(at.curl, { setNumber: 1, reps: 10, weight: 12 })],
      ['superset', entry(at.pushUp, { setNumber: 2, reps: 11 })],
      ['circuit-movement', entry(at.circuitSwing, { setNumber: 1, reps: 15, weight: 24 })],
    ]
    for (const [moment, set] of sets) {
      // The provider refuses what the table would refuse before it queues.
      expect(setLogViolation(set), moment).toBeNull()
      const ack = await workout.setLogs.mutate(setObservationMutation(set))
      expect(ack.ok, `${moment} ${JSON.stringify(ack)}`).toBe(true)
    }

    // On the wire: one request per set, the category in `effort`, nothing in `rpe`.
    const bodies = double.requests.filter((request) => request.path === '/rpc/mutate_set_observation').map((request) => request.body as Record<string, unknown>)
    expect(bodies).toHaveLength(sets.length)
    for (const body of bodies) {
      const values = body.p_values as Record<string, unknown>
      expect(values.rpe).toBeNull()
      expect(values.effort === null || isRecordedEffort(values.effort)).toBe(true)
      expect(Object.keys(values)).not.toContain('perceived_effort')
    }

    // Workout reads each set back from the snapshot: null is not recorded, zero is a result.
    const snap = await workout.sessions.snapshot(snapshot.session.id)
    expect(snap.ok).toBe(true)
    if (!snap.ok) return
    const logs = (id: string) =>
      snap.value.sections.flatMap((section) => section.blocks.flatMap((block) => block.exercises)).find(({ exercise }) => exercise.id === id)?.set_logs.map(loggedSetFromRow) ?? []
    expect(logs(at.squat.id).map((set) => [set.setNumber, set.reps, set.weight, set.weightUnit, set.effort, set.status])).toEqual([
      [1, 5, 100, 'kg', 'too_hard', 'logged'],
      [2, 0, 100, 'kg', null, 'logged'],
      [4, 3, 100, 'kg', null, 'logged'],
    ])
    expect(at.squat.sets).toBe(3) // set 4 is the extra set: no new data type
    expect(logs(at.row.id).map((set) => [set.reps, set.weight, set.effort])).toEqual([[10, 22.5, 'about_right'], [10, null, null]])
    expect(logs(at.plank.id).map((set) => [set.durationSeconds, set.reps, set.weight, set.effort])).toEqual([[45, null, null, null], [0, null, null, 'too_easy']])
    expect(logs(at.carry.id).map((set) => [set.distance, set.distanceUnit, set.weight])).toEqual([[40, 'm', 24]])
    expect(logs(at.pushUp.id).map((set) => set.setNumber)).toEqual([1, 2])
    expect(logs(at.curl.id).map((set) => set.setNumber)).toEqual([1]) // not ticked in round 2: a gap, not a zero
    expect(logs(at.circuitSwing.id).map((set) => [set.setNumber, set.reps, set.weight])).toEqual([[1, 15, 24]])

    // History reads the same rows: measurements and stamped units, legacy RPE absent.
    const view = await performed(double)
    const squat = exerciseView(view, at.squat.id).sets
    expect(squat.map((set) => [set.setNumber, set.reps, set.weight, set.rpe])).toEqual([
      [1, '5 reps', '100 kg', null],
      [2, '0 reps', '100 kg', null],
      [4, '3 reps', '100 kg', null],
    ])
    expect(exerciseView(view, at.row.id).sets.map((set) => set.weight)).toEqual(['22.5 kg', null])
    expect(exerciseView(view, at.plank.id).sets.map((set) => set.duration)).toEqual(['45s', '0s'])
    expect(exerciseView(view, at.carry.id).sets.map((set) => [set.distance, set.weight])).toEqual([['40 m', '24 kg']])
    expect(view.loggedSetCount).toBe(sets.length)
    // Observation recorded in the matrix: History has no reader for the per-set category.
    expect(Object.keys(squat[0])).not.toContain('effort')
  }, REHEARSAL_TIMEOUT_MS)

  it('AC-R030-01 consumer rehearsal: a saved set is corrected and cleared by ordered mutations that keep its identity, and a retry replays rather than duplicates', async () => {
    const snapshot = session()
    const at = layout(snapshot)
    const double = createLoggingDouble({ snapshot })
    const { workout } = clientsFor(double)

    const first = entry(at.squat, { setNumber: 1, reps: 5, weight: 100, effort: 'too_hard' })
    const second = entry(at.squat, { setNumber: 2, reps: 5, weight: 100 })
    expect((await workout.setLogs.mutate(setObservationMutation(first))).ok).toBe(true)
    expect((await workout.setLogs.mutate(setObservationMutation(second))).ok).toBe(true)

    // Correction: every measurement restated, addressed to the row id at revision 1 → 2.
    const corrected = { ...first, performed: { setNumber: 1, reps: 4, weight: 102.5, effort: 'about_right' as const } }
    const correction = setObservationMutation(corrected, 'correct', fixtureId('e', 1), 1)
    const applied = await workout.setLogs.mutate(correction)
    expect(applied.ok && applied.value.outcome).toBe('applied')
    expect(applied.ok && applied.value.head.row).toMatchObject({
      id: first.id, set_number: 1, actual_reps: 4, weight: 102.5, effort: 'about_right', rpe: null, is_warmup_set: false, mutation_revision: 2,
    })
    // A retry of the same request is a replay, not a second change.
    const replay = await workout.setLogs.mutate(correction)
    expect(replay.ok && replay.value.outcome).toBe('replayed')
    // A stale correction (expected revision 0) is refused, not applied.
    const stale = await workout.setLogs.mutate(setObservationMutation(corrected, 'correct', fixtureId('e', 2), 0))
    expect(!stale.ok && stale.error.code).toBe(ErrorCode.PERSISTENCE_CONFLICT)
    // Clearing an effort is a correction to null, never the middle face.
    const unanswered = { ...first, performed: { setNumber: 1, reps: 4, weight: 102.5, effort: null } }
    const cleared = await workout.setLogs.mutate(setObservationMutation(unanswered, 'correct', fixtureId('e', 3), 2))
    expect(cleared.ok && cleared.value.head.row?.effort).toBeNull()

    // Clear: the row goes, its receipt stays, and the other set keeps its number.
    const removal = await workout.setLogs.mutate(setObservationMutation(first, 'clear', fixtureId('e', 4), 3))
    expect(removal.ok && removal.value.head).toMatchObject({ cleared: true, row: null, revision: 4 })
    const view = await performed(double)
    expect(exerciseView(view, at.squat.id).sets.map((set) => [set.setNumber, set.reps])).toEqual([[2, '5 reps']])

    // A finished session refuses new corrections: they are active-only.
    const finished = session({ completed: true })
    const seeded = structuredClone(finished)
    const squatEntry = seeded.sections[0].blocks[0].exercises[0]
    squatEntry.set_logs = [{
      id: fixtureId('a', 1), workout_exercise_id: squatEntry.exercise.id, prescription_revision_status: 'active', set_number: 1,
      actual_reps: 5, actual_duration_seconds: null, actual_distance: null, actual_distance_unit: null, weight: 100,
      weight_unit: 'kg', rpe: null, is_warmup_set: false, created_at: '2026-09-24T09:10:00+00:00', effort: null,
      mutation_revision: 0, last_mutation_id: null,
    }]
    const closed = clientsFor(createLoggingDouble({ snapshot: seeded })).workout
    const late = await closed.setLogs.mutate(
      setObservationMutation({ ...entry(squatEntry.exercise, { setNumber: 1, reps: 6 }), id: fixtureId('a', 1) }, 'correct', fixtureId('e', 5), 0),
    )
    expect(!late.ok && late.error.code).toBe(ErrorCode.VALIDATION_CONSTRAINT)
  }, REHEARSAL_TIMEOUT_MS)

  it('AC-R030-01 consumer rehearsal: circuit, EMOM, AMRAP, For Time and ladder outcomes save through the shell’s one block writer, keep null distinct from zero and read back in History', async () => {
    const snapshot = session()
    const at = layout(snapshot)
    const double = createLoggingDouble({ snapshot })
    const { workout } = clientsFor(double)

    // The outcomes the renderers report, from their own state functions.
    const amrapState: AmrapState = { startedAt: STARTED_AT, endedAtSeconds: null, roundsCompleted: 0, partialRoundReps: null }
    const amrap = amrapOutcome(amrapView(amrapState, { capSeconds: 480, size: 2 }, 600))
    expect(amrap).toEqual({ elapsedSeconds: 480, roundsCompleted: 0 })
    const raceState: ForTimeState = { startedAt: STARTED_AT, finishedAt: '2026-09-24T09:01:30+00:00', workCompleted: false }
    const forTime = forTimeOutcome(forTimeView(raceState, { capSeconds: 900, size: 1 }, 0), raceState.workCompleted)
    expect(forTime).toEqual({ elapsedSeconds: 90, completedUnderCap: false })

    const completions: BlockCompletion[] = [
      { blockId: at.circuit.block.id, outcome: { roundsCompleted: 2 }, perceivedEffort: null },
      { blockId: at.emom.block.id, outcome: { notes: 'Minute 7: burpees scaled to 6' }, perceivedEffort: null },
      { blockId: at.amrap.block.id, outcome: amrap, perceivedEffort: null },
      { blockId: at.ladder.block.id, outcome: { highestRung: 2 }, perceivedEffort: null },
    ]
    for (const completion of completions) {
      const saved = await workout.blockResults.record(completion)
      expect(saved.ok, JSON.stringify(saved)).toBe(true)
    }

    // A refused save writes nothing; the retry writes the row once.
    double.refuseNext('/block_results', 503)
    const refused = await workout.blockResults.record({ blockId: at.forTime.block.id, outcome: forTime, perceivedEffort: null })
    expect(!refused.ok && refused.error.code).toBe(ErrorCode.NETWORK_SERVER_ERROR)
    expect(double.blockResults().some((row) => row.block_id === at.forTime.block.id)).toBe(false)
    expect((await workout.blockResults.record({ blockId: at.forTime.block.id, outcome: forTime, perceivedEffort: null })).ok).toBe(true)
    // A second insert for a saved block is the unique key's 23505 — what the
    // provider treats as already recorded. Still one row: insert-once.
    const again = await workout.blockResults.record({ blockId: at.amrap.block.id, outcome: amrap, perceivedEffort: null })
    expect(!again.ok && again.error).toMatchObject({ code: ErrorCode.PERSISTENCE_CONFLICT, details: { pgCode: '23505' } })
    expect(double.blockResults()).toHaveLength(5)

    // Every row on the wire carries a null effort and no categorical column.
    for (const request of double.requests.filter((candidate) => candidate.path === '/block_results')) {
      const [row] = request.body as Record<string, unknown>[]
      expect(row.perceived_effort).toBeNull()
      expect(Object.keys(row)).not.toContain('effort')
    }

    const view = await performed(double)
    expect(blockView(view, at.circuit.block.id).outcome).toEqual([{ label: 'Rounds', value: '2 of 3' }])
    const emom = blockView(view, at.emom.block.id)
    expect(emom.outcome).toEqual([]) // no minutes tally
    expect(emom.notes).toBe('Minute 7: burpees scaled to 6')
    // An explicit zero reads as zero; the blank partial round has no reading at all.
    expect(blockView(view, at.amrap.block.id).outcome).toEqual([{ label: 'Rounds', value: '0' }])
    expect(blockView(view, at.forTime.block.id).outcome).toEqual([
      { label: 'Elapsed', value: '01:30' },
      { label: 'Cap', value: 'Incomplete' },
    ])
    expect(blockView(view, at.ladder.block.id).outcome).toEqual([{ label: 'Highest rung', value: '2' }])
    for (const block of [at.circuit, at.emom, at.amrap, at.forTime, at.ladder]) {
      expect(blockView(view, block.block.id).perceivedEffort, block.block.id).toBeNull()
    }
  }, REHEARSAL_TIMEOUT_MS)

  it('AC-R030-01 consumer rehearsal: movement notes, workout feedback and rest days keep their own writers, validators and readers', async () => {
    const snapshot = session()
    const at = layout(snapshot)
    const double = createLoggingDouble({ snapshot })
    const { workout, summary, restDays } = clientsFor(double)

    // Movement note: one column on that prescription, answered with the stored row.
    const note = await workout.exercises.saveNotes(at.squat.id, 'Belt on the top set')
    expect(note.ok && note.value.exercise_notes).toBe('Belt on the top set')
    const cleared = await workout.exercises.saveNotes(at.row.id, null)
    expect(cleared.ok && cleared.value.exercise_notes).toBeNull()
    const snap = await workout.sessions.snapshot(snapshot.session.id)
    const stored = snap.ok ? snap.value.sections[0].blocks[0].exercises[0].exercise.exercise_notes : undefined
    expect(stored).toBe('Belt on the top set')

    // Workout feedback: the five-step mood and the session notes, nothing else.
    const sentBefore = double.requests.length
    const outOfRange = await summary.saveDebrief(snapshot.session.id, { mood: 6, session_notes: null })
    expect(!outOfRange.ok && outOfRange.error.code).toBe(ErrorCode.VALIDATION_CONSTRAINT)
    expect(double.requests.length).toBe(sentBefore) // refused before anything was sent
    const debrief = await summary.saveDebrief(snapshot.session.id, { mood: 4, session_notes: 'Strong day' })
    expect(debrief.ok && [debrief.value.session.mood, debrief.value.session.session_notes]).toEqual([4, 'Strong day'])
    const view = await performed(double)
    expect(view.mood).toEqual(moodStep(4))
    expect(view.notes).toBe('Strong day')
    // History reads no movement note today (recorded in the matrix, not changed).
    expect(Object.keys(exerciseView(view, at.squat.id))).not.toContain('notes')

    // Rest day: one row per day, re-marking replaces the reason, the note stays null.
    const marked = await restDays.mark({ day: '2026-09-25', reason: 'injury', note: null })
    expect(marked.ok && [marked.value.reason, marked.value.note]).toEqual(['injury', null])
    const changed = await restDays.mark({ day: '2026-09-25', reason: 'sick', note: null })
    expect(changed.ok && marked.ok && changed.value.id).toBe(marked.ok ? marked.value.id : null)
    const recent = await restDays.recent(USER_ID)
    expect(recent.ok && recent.value.map((row) => [row.day, row.reason, row.note])).toEqual([['2026-09-25', 'sick', null]])
    const invented = await restDays.mark({ day: '2026-09-26', reason: 'travel' as never, note: null })
    expect(!invented.ok && invented.error.code).toBe(ErrorCode.VALIDATION_INVALID_FORMAT)
  }, REHEARSAL_TIMEOUT_MS)

  it('AC-R030-02 categorical block effort is never converted into the legacy 1-10 perceived_effort, which keeps its numeric meaning', async () => {
    const snapshot = session()
    const at = layout(snapshot)
    const double = createLoggingDouble({ snapshot })
    const { workout } = clientsFor(double)

    // The one block writer refuses a category in the numeric column, before sending.
    for (const category of Constants.public.Enums.set_effort) {
      const refused = await workout.blockResults.record({ blockId: at.amrap.block.id, outcome: {}, perceivedEffort: category as unknown as number })
      expect(!refused.ok && refused.error.code, category).toBe(ErrorCode.VALIDATION_OUT_OF_RANGE)
    }
    expect(double.requests).toHaveLength(0)
    // …and the table would refuse it too (smallint), had anything sent it.
    const raw = await double.fetch(`${LOGGING_DOUBLE_URL}/rest/v1/block_results`, {
      method: 'POST',
      headers: { apikey: LOGGING_DOUBLE_ANON_KEY, Authorization: `Bearer ${LOGGING_DOUBLE_TOKEN}` },
      body: JSON.stringify([{ block_id: at.amrap.block.id, perceived_effort: 'too_easy' }]),
    })
    expect(raw.status).toBe(400)

    // A category handed to today's writer is dropped, never coerced: the row
    // mapping has no categorical column (MIG-A is TASK-031's).
    const withCategory = { blockId: at.amrap.block.id, outcome: {}, perceivedEffort: null, effort: 'too_easy' } as BlockCompletion
    expect(Object.keys(blockResultInsert(withCategory))).not.toContain('effort')
    expect(blockResultInsert(withCategory).perceived_effort).toBeNull()
    expect((await workout.blockResults.record(withCategory)).ok).toBe(true)
    expect(double.blockResults()[0]).toMatchObject({ perceived_effort: null })
    expect(Object.keys(double.blockResults()[0])).not.toContain('effort')

    // The legacy number keeps its meaning: History reads it on the 1–10 scale…
    const legacy = createLoggingDouble({ snapshot })
    expect((await clientsFor(legacy).workout.blockResults.record({ blockId: at.amrap.block.id, outcome: { roundsCompleted: 5 }, perceivedEffort: 7 })).ok).toBe(true)
    expect(blockView(await performed(legacy), at.amrap.block.id).perceivedEffort).toBe('7 of 10')
    // …and adaptive conditioning reads it as RPE: an easy finish at ≤ 7. A number
    // invented for "too easy" would turn an unanswered pair into a progression nudge.
    const read = (perceivedEffort: number | null): ConditioningSectionRead => ({
      sessionId: snapshot.session.id, blockId: at.amrap.block.id, date: '2026-09-24', intensity: 6, format: 'amrap',
      fingerprint: 'amrap:kb-swing+burpee', completion: 'complete', perceivedEffort, score: null,
    })
    expect(conditioningTrend([read(null), read(null)])).toBe('hold')
    expect(conditioningTrend([read(6), read(6)])).toBe('ready')
    expect(isPerceivedEffort(7)).toBe(true)

    // Per-set categories stay categories, beside a historical RPE that is never rewritten.
    const set = entry(at.squat, { setNumber: 1, reps: 5, weight: 100, effort: 'too_easy' })
    const request = setObservationMutation({ ...set, performed: { ...set.performed, rpe: 8 } as SetLogEntry['performed'] })
    expect(request.values).toMatchObject({ effort: 'too_easy', rpe: 8 })
    const kept = await workout.setLogs.mutate(request)
    expect(kept.ok && kept.value.head.row && [kept.value.head.row.effort, kept.value.head.row.rpe]).toEqual(['too_easy', 8])

    // MIG-A's validator is the existing categorical one: three categories or unanswered.
    for (const value of [...Constants.public.Enums.set_effort, null, undefined]) expect(isRecordedEffort(value), String(value)).toBe(true)
    for (const value of [1, 5, 7, 10, 'hard', 'medium']) {
      expect(isRecordedEffort(value), String(value)).toBe(false)
      expect(setEffortSchema.nullable().safeParse(value).success, String(value)).toBe(false)
    }
    // The session's five-step mood is a different question again.
    expect(sessionDebriefSchema.safeParse({ mood: 'too_easy', session_notes: null }).success).toBe(false)
    expect(field('block_results.effort')).toMatchObject({ status: 'proposed-migration', migration: 'MIG-A', type: 'set_effort (the existing enum)' })
    expect(field('block_results.perceived_effort')).toMatchObject({ status: 'legacy', writer: null })
  }, REHEARSAL_TIMEOUT_MS)

  it('AC-R030-02 per-movement timed partials and loads cannot reuse exercise_set_logs, so they need their own table', async () => {
    // A completed session: the AMRAP finished with 3 rounds and 5 kettlebell swings into round 4.
    const snapshot = session({ completed: true })
    const at = layout(snapshot)

    // Today, timed blocks write no set logs, and nothing reaches the anchor evidence.
    const today = createLoggingDouble({ snapshot })
    const evidence = await clientsFor(today).workout.anchors.evidence(USER_ID)
    expect(evidence.ok && evidence.value).toEqual([])
    expect(d5MissedReps(evidence.ok ? evidence.value : [])).toBeNull()

    // Rehearse the reuse: the partial as a set log through the real set path.
    const reused = createLoggingDouble({ snapshot })
    const clients = clientsFor(reused).workout
    const partial = entry(at.amrapSwing, { setNumber: 4, reps: 5, weight: 24 })
    expect(setLogViolation(partial)).toBeNull() // nothing in the set path can tell it is a partial
    expect((await clients.setLogs.mutate(setObservationMutation(partial))).ok).toBe(true)

    // anchor_evidence reads every set log whatever its block, so the partial
    // becomes a short working set (5 of 12) and trips the missed-rep deload.
    const polluted = await clients.anchors.evidence(USER_ID)
    expect(polluted.ok && polluted.value.map((row) => [row.exercise_id, row.set_number, row.actual_reps, row.prescribed_reps])).toEqual([
      ['kb-swing', 4, 5, 12],
    ])
    expect(d5MissedReps(polluted.ok ? polluted.value : [])).toMatchObject({ id: 'D5' })

    // History reads it as an ordinary fourth set, and counts it as a logged set.
    const view = await performed(reused)
    expect(exerciseView(view, at.amrapSwing.id).sets.map((set) => [set.setNumber, set.reps, set.weight])).toEqual([[4, '5 reps', '24 kg']])
    expect(view.loggedSetCount).toBe(1)

    // A load-only observation has no set identity at all: whichever number it takes claims a set.
    const loadOnly = entry(at.wallBall, { setNumber: 1, weight: 9 })
    expect((await clients.setLogs.mutate(setObservationMutation(loadOnly))).ok).toBe(true)
    expect(exerciseView(await performed(reused), at.wallBall.id).sets.map((set) => [set.setNumber, set.reps, set.weight])).toEqual([[1, null, '9 kg']])

    // So MIG-B is a table of its own — absent today, as PostgREST would say.
    const missing = await reused.fetch(`${LOGGING_DOUBLE_URL}/rest/v1/block_movement_results`, {
      method: 'POST',
      headers: { apikey: LOGGING_DOUBLE_ANON_KEY, Authorization: `Bearer ${LOGGING_DOUBLE_TOKEN}` },
      body: JSON.stringify([{ workout_exercise_id: at.amrapSwing.id, round_number: 4, actual_reps: 5 }]),
    })
    expect(missing.status).toBe(404)
    expect(PROPOSED_PATHS.find((path) => path.id === 'MIG-B')).toMatchObject({ kind: 'migration', owner: 'TASK-031' })
  }, REHEARSAL_TIMEOUT_MS)

  it('AC-R030-03 proposed per-movement identities derive from the block’s recorded outcome, never from planned targets, and keep null distinct from zero', () => {
    const snapshot = session()
    const at = layout(snapshot)
    const amrapAt = (state: Partial<AmrapState>, now = 600) =>
      amrapOutcome(amrapView({ startedAt: STARTED_AT, endedAtSeconds: null, roundsCompleted: null, partialRoundReps: null, ...state }, { capSeconds: 480, size: 2 }, now))
    const raceAt = (state: Partial<ForTimeState>, answer?: boolean, now = 0) =>
      forTimeOutcome(forTimeView({ startedAt: STARTED_AT, finishedAt: null, ...state }, { capSeconds: 900, size: 1 }, now), answer)
    const rungs = ladderRungs([{ prescription: at.ladderPushUp }, { prescription: at.ladderBurpee }]).length
    expect(rungs).toBe(4)

    // AMRAP: the round after the recorded rounds; blank rounds give no identity.
    expect(partialRoundFor({ family: 'amrap', outcome: amrapAt({ roundsCompleted: 3 }) })).toBe(4)
    expect(partialRoundFor({ family: 'amrap', outcome: amrapAt({ roundsCompleted: 0 }) })).toBe(1)
    expect(partialRoundFor({ family: 'amrap', outcome: amrapAt({}) })).toBeNull()
    expect(partialRoundFor({ family: 'amrap', outcome: amrapAt({ roundsCompleted: 3 }, 120) })).toBeNull() // still running
    // For Time: the one pass when Incomplete; none when Complete or not ended.
    expect(partialRoundFor({ family: 'for_time', outcome: raceAt({}, undefined, 900) })).toBe(1) // the cap
    expect(partialRoundFor({ family: 'for_time', outcome: raceAt({ finishedAt: '2026-09-24T09:05:00+00:00' }) })).toBeNull()
    expect(partialRoundFor({ family: 'for_time', outcome: raceAt({ finishedAt: '2026-09-24T09:05:00+00:00' }, false) })).toBe(1)
    expect(partialRoundFor({ family: 'for_time', outcome: raceAt({}, undefined, 120) })).toBeNull()
    // Ladder: the rung after the last completed one; none when complete or unanswered.
    expect(partialRoundFor({ family: 'ladder', outcome: { highestRung: 2 }, rungCount: rungs })).toBe(3)
    expect(partialRoundFor({ family: 'ladder', outcome: { highestRung: 0 }, rungCount: rungs })).toBe(1)
    expect(partialRoundFor({ family: 'ladder', outcome: { highestRung: rungs }, rungCount: rungs })).toBeNull()
    expect(partialRoundFor({ family: 'ladder', outcome: {}, rungCount: rungs })).toBeNull()
    expect(partialRoundFor({ family: 'emom' })).toBeNull()

    // A load attaches where the set logger shows one.
    expect([at.amrapSwing, at.wallBall, at.carry, at.amrapBurpee, at.plank].map(loadApplies)).toEqual([true, true, true, false, false])

    const actual = (exercise: WorkoutExerciseRow, partialRound: number | null, amount: string, weight: string, family: 'emom' | 'amrap' | 'for_time' | 'ladder' = 'amrap') =>
      movementActualFromDraft({ id: fixtureId('f', 1), workoutExerciseId: exercise.id, prescription: exercise, partialRound, weightUnit: 'kg', draft: { amount, weight } }, family)
    const refusedOn = (result: ReturnType<typeof actual>) => (result.ok ? null : result.error.details?.field)

    expect(actual(at.amrapSwing, 4, '5', '24')).toEqual(ok({
      id: fixtureId('f', 1), workout_exercise_id: at.amrapSwing.id, round_number: 4, actual_reps: 5, actual_duration_seconds: null,
      actual_distance: null, actual_distance_unit: null, weight: 24, weight_unit: 'kg',
    }))
    // Zero is a measurement; blank is not recorded; nothing is filled from the plan.
    expect(actual(at.amrapSwing, 4, '0', '').ok && actual(at.amrapSwing, 4, '0', '')).toMatchObject({ value: { actual_reps: 0, weight: null } })
    expect(actual(at.amrapSwing, 4, '', '24')).toMatchObject({ ok: true, value: { round_number: null, actual_reps: null, weight: 24 } })
    expect(actual(at.amrapSwing, 4, '', '')).toEqual(ok(null))
    expect(actual(at.amrapSwing, 4, ' ', ' ')).toEqual(ok(null))
    // Refusals, named by the field, exactly as a set's would be.
    expect(refusedOn(actual(at.amrapSwing, null, '5', ''))).toBe('round_number')
    expect(refusedOn(actual(at.amrapSwing, 4, '-1', ''))).toBe('actual_reps')
    expect(refusedOn(actual(at.amrapSwing, 4, '2.5', ''))).toBe('actual_reps')
    expect(refusedOn(actual(at.amrapSwing, 4, 'five', ''))).toBe('actual_reps')
    expect(refusedOn(actual(at.amrapSwing, 4, '', '-24'))).toBe('weight')
    expect(refusedOn(actual(at.amrapBurpee, 4, '', '10'))).toBe('weight')
    // Each modality's own column, with the prescription's own unit.
    expect(actual(at.carry, 1, '30', '24', 'for_time')).toMatchObject({ ok: true, value: { actual_distance: 30, actual_distance_unit: 'm', actual_reps: null } })
    expect(actual(at.plank, 1, '20', '', 'for_time')).toMatchObject({ ok: true, value: { actual_duration_seconds: 20, actual_reps: null } })
    // A ladder amount is bounded by that movement's target at that rung.
    expect(refusedOn(actual(at.ladderPushUp, 3, '7', '', 'ladder'))).toBe('actual_reps')
    expect(actual(at.ladderPushUp, 3, '6', '', 'ladder')).toMatchObject({ ok: true, value: { round_number: 3, actual_reps: 6 } })
    expect(refusedOn(actual(at.ladderBurpee, 3, '5', '', 'ladder'))).toBe('actual_reps')

    // A change of recorded progress clears every amount and keeps every load.
    const drafts = { [at.amrapSwing.id]: { amount: '5', weight: '24' }, [at.amrapBurpee.id]: { amount: '3', weight: '' } }
    expect(draftsAfterProgressChange(drafts, 4, 4)).toBe(drafts)
    expect(draftsAfterProgressChange(drafts, 4, 5)).toEqual({
      [at.amrapSwing.id]: { amount: '', weight: '24' },
      [at.amrapBurpee.id]: { amount: '', weight: '' },
    })
  })

  it('AC-R030-03 the proposed fields are isolated: no migration, live call or synthetic writer is added, and the current writers still cannot send them', async () => {
    // No migration defines the proposed column or table; the contract still calls them proposed.
    const migrations = readdirSync(join(REPO_ROOT, 'supabase', 'migrations')).filter((file) => file.endsWith('.sql'))
    expect(migrations.length).toBeGreaterThan(0)
    for (const file of migrations) {
      const sql = read(`supabase/migrations/${file}`)
      expect(sql, file).not.toMatch(/block_movement_results/)
      expect(sql, file).not.toMatch(/alter table (?:if exists )?public\.block_results\s+add column(?: if not exists)?\s+effort\b/i)
    }
    expect(LOGGING_FIELDS.filter((contract) => contract.migration !== null).every((contract) => contract.status === 'proposed-migration')).toBe(true)

    // The contract module is data and pure functions: no client, transport or schema of its own.
    const contract = read('src/data/refinement-logging-contract.ts')
    expect(contract).not.toMatch(/\bfetch\(|createSupabaseClient|\.from\(|\.rpc\(|createWorkoutClients\(|from 'zod'/)

    // The drafts are drafts: only the specification carries their SQL, owned by
    // TASK-031, and applying them anywhere is the owner's separate authority.
    const spec = read('docs/specs/LOGGING_FIELD_CONTRACT.md')
    expect(spec).toMatch(/DRAFT MIG-A — not a migration/)
    expect(PROPOSED_PATHS.find((path) => path.id === 'MIG-A')).toMatchObject({ owner: 'TASK-031' })
    expect(PROPOSED_PATHS.find((path) => path.id === 'LIVE-PRE-1')).toMatchObject({ kind: 'live-authority', owner: 'owner' })
    for (const id of ['block-result-correction', 'movement-actuals-writer', 'timed-read-model']) {
      expect(PROPOSED_PATHS.find((path) => path.id === id)?.ref?.proposedBy, id).toBe('TASK-031')
    }

    // Today's clients have no path for them: no correction, no movement rows.
    const double = createLoggingDouble({ snapshot: session() })
    const { workout } = clientsFor(double)
    expect(member(workout, 'blockResults.correct')).toBeUndefined()
    expect(member(workout, 'blockResults.recordMovements')).toBeUndefined()
    expect(double.requests).toHaveLength(0)
  })
})
