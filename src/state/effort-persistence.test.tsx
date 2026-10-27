/**
 * TASK-007 (REQ-012, TC-001) — categorical per-set effort, persisted
 * losslessly.
 *
 * The declared contract: `exercise_set_logs.effort` is a nullable
 * `set_effort` enum of exactly `too_hard | about_right | too_easy`, and `null`
 * is unanswered. These tests hold four states apart — each of the three
 * categories, an explicit unanswered set, and a legacy record that has no
 * effort field at all — through every seam a set crosses: the insert, the
 * stored row read back, the durable queue and its retry across a reload, and
 * the correction that edits or clears one stored answer. Historical numeric
 * `rpe` is a different observation and is asserted untouched throughout.
 *
 * The disposable PostgreSQL 17 proof of the same contract is
 * `scripts/ui-polish/rehearse-effort-schema.mjs`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { Constants, type Enums } from '../data/database.types'
import { AppProviders } from '../test/render'
import {
  createWorkoutDouble,
  FIXTURE_SESSION_ID,
  snapshotFixture,
  type WorkoutDouble,
} from '../test/workout-double'
import { createError, err, ErrorCode } from './errors'
import { exerciseSetLogRowSchema, setEffortSchema } from './schemas'
import {
  readSetLogQueue,
  SET_LOG_QUEUE_STORAGE_KEY,
  type QueueStorage,
} from './set-log-queue'
import { SetLoggingProvider } from './set-logging-provider'
import {
  loggedSetFromEntry,
  loggedSetFromRow,
  setLogEffortUpdate,
  setLogInsert,
  setLogViolation,
  useSetLogging,
  type PerformedSet,
  type SetLogEntry,
} from './set-logging'
import { sessionProgress, type ExerciseProgress } from './workout-progress'

const CATEGORIES = ['too_hard', 'about_right', 'too_easy'] as const satisfies readonly Enums<'set_effort'>[]

/** Each answered category, and unanswered — the four values a set can hold. */
const ANSWERS = [...CATEGORIES, null] as const

const SET_LOG_ID = 'b0000001-0000-4000-8000-000000000000'
const EXERCISE_ID = 'c0000001-0000-4000-8000-000000000000'
const BLOCK_ID = 'd0000001-0000-4000-8000-000000000000'
const SESSION_ID = 'e0000001-0000-4000-8000-000000000000'
const MINTED = 'a0000001-0000-4000-8000-000000000000'

const REPO_ROOT = join(import.meta.dirname, '..', '..')
const MIGRATION = 'supabase/migrations/20261027000027_set_effort.sql'

function entry(performed: SetLogEntry['performed']): SetLogEntry {
  return {
    id: SET_LOG_ID,
    exerciseId: EXERCISE_ID,
    blockId: BLOCK_ID,
    distanceUnit: null,
    weightUnit: 'kg',
    performed,
  }
}

/** A stored row as PostgREST answers it after the migration. */
function storedRow(effort: Enums<'set_effort'> | null, rpe: number | null = null) {
  return {
    id: SET_LOG_ID,
    workout_exercise_id: EXERCISE_ID,
    prescription_revision_status: 'active',
    set_number: 1,
    actual_reps: 8,
    actual_duration_seconds: null,
    actual_distance: null,
    actual_distance_unit: null,
    weight: 60,
    weight_unit: 'kg',
    rpe,
    is_warmup_set: false,
    created_at: '2026-09-24T09:10:00+00:00',
    effort,
  }
}

/** A row saved before REQ-012, as a pre-migration reader answers it: no key. */
function legacyRow(rpe: number | null) {
  const { effort: _absent, ...row } = storedRow(null, rpe)
  void _absent
  return row
}

/** A queued record exactly as an older build wrote it to `localStorage`. */
function legacyQueueRecord(performed: Record<string, unknown>) {
  return {
    entry: { ...entry({ setNumber: 1 }), performed },
    sessionId: SESSION_ID,
    queuedAt: '2026-09-24T09:10:00.000Z',
    attempts: 1,
    lastErrorCode: ErrorCode.NETWORK_OFFLINE,
  }
}

function memoryStorage(seed: Record<string, string> = {}): QueueStorage {
  const data = new Map(Object.entries(seed))

  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The declared contract
// ─────────────────────────────────────────────────────────────────────────────

describe('the declared effort contract', () => {
  it('is exactly three categories, in their own enum', () => {
    expect(Constants.public.Enums.set_effort).toEqual(CATEGORIES)
    for (const category of CATEGORIES) {
      expect(setEffortSchema.parse(category)).toBe(category)
    }
  })

  it.each([0, 1, 5, 7.5, 10, '', 'hard', 'easy', 'right', 'TOO_HARD', 'unanswered'])(
    'refuses %j as an effort category — no numbers, no preview keys',
    (value) => {
      expect(setEffortSchema.safeParse(value).success).toBe(false)
    },
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// Save — the insert
// ─────────────────────────────────────────────────────────────────────────────

describe('a logged set saves its effort in its own column', () => {
  it.each(CATEGORIES)('writes %s as the category, and never into rpe', (category) => {
    const insert = setLogInsert(entry({ setNumber: 1, reps: 8, weight: 60, effort: category }))

    expect(insert.effort).toBe(category)
    expect(insert.rpe).toBeNull()
  })

  it.each([
    ['omitted', { setNumber: 1, reps: 8 }],
    ['explicitly null', { setNumber: 1, reps: 8, effort: null }],
  ] as const)('writes an unanswered (%s) set as no effort and no rpe', (_label, performed) => {
    const insert = setLogInsert(entry(performed))

    // Omission is the declared write for unanswered: the column has no
    // default, so the stored row is NULL — and an unmigrated schema still
    // accepts the set.
    expect(insert).not.toHaveProperty('effort')
    expect(insert.rpe).toBeNull()
  })

  it('refuses a number or an unknown key before anything is sent', () => {
    for (const effort of [3, 'hard', ''] as unknown as Enums<'set_effort'>[]) {
      expect(setLogViolation(entry({ setNumber: 1, effort }))).toEqual({ field: 'effort' })
    }
    for (const effort of ANSWERS) {
      expect(setLogViolation(entry({ setNumber: 1, effort }))).toBeNull()
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Read — the stored row
// ─────────────────────────────────────────────────────────────────────────────

describe('a saved row reads its effort back unchanged', () => {
  it.each(ANSWERS)('reads %s back as %s', (effort) => {
    const parsed = exerciseSetLogRowSchema.parse(storedRow(effort))

    expect(parsed.effort).toBe(effort)
    expect(loggedSetFromRow(parsed).effort).toBe(effort)
  })

  it.each([null, 1, 7.5, 10])(
    'reads a legacy row (rpe %s, no effort field) as unanswered, keeping its rpe',
    (rpe) => {
      const raw = legacyRow(rpe)
      expect(raw).not.toHaveProperty('effort')

      const parsed = exerciseSetLogRowSchema.parse(raw)

      // Nothing is derived from the historical number: it stays a number, and
      // the category stays unanswered.
      expect(parsed.rpe).toBe(rpe)
      expect(parsed.effort).toBeNull()
      expect(loggedSetFromRow(parsed).effort).toBeNull()
    },
  )

  it('keeps a stored category independent of a stored historical rpe', () => {
    const parsed = exerciseSetLogRowSchema.parse(storedRow('too_easy', 9))

    expect(parsed).toMatchObject({ effort: 'too_easy', rpe: 9 })
  })

  it.each([5, 'hard', ''])('refuses a stored effort of %j rather than coercing it', (effort) => {
    expect(exerciseSetLogRowSchema.safeParse({ ...storedRow(null), effort }).success).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// The durable queue
// ─────────────────────────────────────────────────────────────────────────────

describe('the durable queue keeps each answer, and decodes older entries', () => {
  function decoded(performed: Record<string, unknown>) {
    const storage = memoryStorage({
      [SET_LOG_QUEUE_STORAGE_KEY]: JSON.stringify([legacyQueueRecord(performed)]),
    })
    return readSetLogQueue(storage)
  }

  it.each(ANSWERS)('decodes a queued %s and reads it back as %s', (effort) => {
    const [queued] = decoded({ setNumber: 1, reps: 8, effort })

    expect(queued.entry.performed.effort).toBe(effort)
    expect(loggedSetFromEntry(queued.entry, 'failed').effort).toBe(effort)
  })

  it('decodes an entry queued before effort existed, with no effort key, as unanswered', () => {
    const [queued] = decoded({ setNumber: 1, reps: 8, weight: 60 })

    expect(queued.entry.performed).not.toHaveProperty('effort')
    expect(loggedSetFromEntry(queued.entry, 'failed').effort).toBeNull()
    expect(setLogInsert(queued.entry)).not.toHaveProperty('effort')
  })

  it('still decodes an entry carrying a legacy rpe, and still writes rpe as not recorded', () => {
    const [queued] = decoded({ setNumber: 1, reps: 8, rpe: 8 })

    expect(queued).toBeDefined()
    expect(loggedSetFromEntry(queued.entry, 'failed').effort).toBeNull()
    expect(setLogInsert(queued.entry)).toMatchObject({ rpe: null })
    expect(setLogInsert(queued.entry)).not.toHaveProperty('effort')
  })

  it.each([7, 'hard', true])('drops a queued effort of %j instead of guessing a category', (effort) => {
    expect(decoded({ setNumber: 1, reps: 8, effort })).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// The path: provider → queue → retry after reload → stored row
// ─────────────────────────────────────────────────────────────────────────────

function EffortRenderer({
  exercise,
  performed,
}: {
  exercise: ExerciseProgress
  performed: PerformedSet
}) {
  const { logSet, loggedSets } = useSetLogging()

  return (
    <div>
      <button type="button" onClick={() => logSet(exercise.exerciseId, performed)}>
        Log set
      </button>
      <p>
        {`effort ${loggedSets(exercise.exerciseId)
          .map((set) => `${set.setNumber}:${set.status}:${String(set.effort)}`)
          .join(',')}`}
      </p>
    </div>
  )
}

function mount(workout: WorkoutDouble, storage: QueueStorage, performed: PerformedSet) {
  const snapshot = snapshotFixture({
    sections: [
      {
        title: 'Primary lift',
        sectionType: 'primary_lift',
        blocks: [{ structureType: 'standard', exercises: ['not_started'] }],
      },
    ],
  })
  const exercises = sessionProgress(snapshot)
    .sections.flatMap((section) => section.blocks)
    .flatMap((block) => block.exercises)

  render(
    <AppProviders workout={workout.clients}>
      <SetLoggingProvider
        sessionId={FIXTURE_SESSION_ID}
        exercises={exercises}
        weightUnit="kg"
        onFailure={() => {}}
        newId={() => MINTED}
        storage={storage}
        retryDelay={() => 1_000_000}
      >
        {exercises.map((exercise) => (
          <EffortRenderer key={exercise.exerciseId} exercise={exercise} performed={performed} />
        ))}
      </SetLoggingProvider>
    </AppProviders>,
  )
}

function offlineDouble(): WorkoutDouble {
  const base = createWorkoutDouble()
  return {
    ...base,
    clients: {
      ...base.clients,
      setLogs: { log: async () => err(createError(ErrorCode.NETWORK_OFFLINE)) },
    },
  }
}

describe('effort survives save, the offline queue, a reload and the retry', () => {
  it.each(ANSWERS)('round-trips %s', async (effort) => {
    const storage = memoryStorage()
    const performed: PerformedSet = { setNumber: 1, reps: 8, weight: 60, effort }

    // Offline: the set is durable and drawn with its answer, unconfirmed.
    mount(offlineDouble(), storage, performed)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Log set' }))
    await waitFor(() => expect(screen.getByText(`effort 1:failed:${String(effort)}`)).toBeTruthy())
    const [queued] = readSetLogQueue(storage)
    expect(queued.entry.performed.effort).toBe(effort)

    // Reload with the network back: the retry writes the same answer.
    cleanup()
    const online = createWorkoutDouble()
    mount(online, storage, performed)
    await waitFor(() => expect(online.loggedSets()).toHaveLength(1))
    const [written] = online.loggedSets()
    expect(written.id).toBe(queued.entry.id)

    const insert = setLogInsert(written)
    expect(insert.rpe).toBeNull()
    if (effort === null) expect(insert).not.toHaveProperty('effort')
    else expect(insert.effort).toBe(effort)

    // And the confirmed row reads back as the same answer.
    await waitFor(() => expect(screen.getByText(`effort 1:logged:${String(effort)}`)).toBeTruthy())
    await waitFor(() => expect(readSetLogQueue(storage)).toEqual([]))
    cleanup()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Edit and clear
// ─────────────────────────────────────────────────────────────────────────────

describe('a stored answer can be corrected or cleared, and nothing else moves', () => {
  it.each(ANSWERS)('writes %s as the whole correction', (effort) => {
    expect(setLogEffortUpdate(effort)).toEqual({ effort })
  })

  it('applies every edit and the clear losslessly to a stored row, rpe untouched', () => {
    let row = exerciseSetLogRowSchema.parse(storedRow('too_hard', 6.5))

    for (const next of ['about_right', 'too_easy', null, 'too_hard', null] as const) {
      row = exerciseSetLogRowSchema.parse({ ...row, ...setLogEffortUpdate(next) })
      expect(row.effort).toBe(next)
      expect(row.rpe).toBe(6.5)
      expect(row.actual_reps).toBe(8)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// The migration, and what it does not change
// ─────────────────────────────────────────────────────────────────────────────

function read(path: string): string {
  return readFileSync(join(REPO_ROOT, path), 'utf8')
}

function filesUnder(dir: string): string[] {
  return readdirSync(join(REPO_ROOT, dir)).flatMap((name) => {
    const path = join(dir, name)
    return statSync(join(REPO_ROOT, path)).isDirectory() ? filesUnder(path) : [path]
  })
}

/**
 * SQL with its `--` comments and `comment on` statements removed, so prose
 * cannot satisfy — or trip — an assertion.
 */
function code(sql: string): string {
  return sql.replace(/--.*$/gm, '').replace(/comment on [^;]*;/gi, '')
}

describe('the additive migration', () => {
  const sql = code(read(MIGRATION)).toLowerCase()

  it('adds one nullable enum column with no default and no backfill', () => {
    expect(sql).toMatch(/create type public\.set_effort as enum \(\s*'too_hard', 'about_right', 'too_easy'\s*\)/)
    expect(sql).toMatch(/add column if not exists effort public\.set_effort;/)
    expect(sql).not.toMatch(/\bdefault\b/)
    expect(sql).not.toMatch(/\bnot null\b/)
    expect(sql).not.toMatch(/^\s*(update|delete|truncate|drop)\b/m)
  })

  it('leaves rpe, its range and its grants exactly where they were', () => {
    expect(sql).not.toMatch(/\brpe\b/)
    expect(code(read('supabase/migrations/20260921000004_execution_domain.sql'))).toMatch(
      /constraint exercise_set_logs_rpe_range\s+check \(rpe is null or rpe between 1 and 10\)/,
    )
  })

  it('grants the owner insert and update on the new column only', () => {
    expect(sql).toMatch(/grant insert \(effort\) on public\.exercise_set_logs to authenticated;/)
    expect(sql).toMatch(/grant update \(effort\) on public\.exercise_set_logs to authenticated;/)
    expect(sql).not.toMatch(/\banon\b/)
  })

  it('is the only migration that knows the categories exist', () => {
    const others = filesUnder('supabase/migrations').filter(
      (path) => path.endsWith('.sql') && !path.endsWith('20261027000027_set_effort.sql'),
    )
    for (const path of others) {
      expect(code(read(path)), path).not.toMatch(/set_effort|too_hard|about_right|too_easy/)
    }
  })
})

describe('no conversion, aggregation, progression, adaptation or prompt change', () => {
  /**
   * The readers that turn history into training decisions and the prompt.
   * None of them may learn the categories exist: what effort means for load,
   * progression or generation is not decided by this contract.
   */
  const CONSUMERS = [
    ...filesUnder('supabase/functions'),
    'src/state/anchors.ts',
    'src/state/deload.ts',
    'src/state/progression.ts',
    'src/state/favorite-progression.ts',
    'src/data/history.ts',
    'src/data/anchors.ts',
  ].filter((path) => /\.(ts|tsx|mjs|sql)$/.test(path) && !/\.test\.tsx?$/.test(path))

  it.each(CONSUMERS)('%s does not read effort categories', (path) => {
    expect(read(path)).not.toMatch(/set_effort|too_hard|about_right|too_easy|\.effort\b/)
  })
})
