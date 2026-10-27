/**
 * TASK-011 / REQ-013 (AC-072, AC-045) — a correction or a clear, from the tap
 * to the row, through the durable queue.
 *
 * The provider is driven through its own seam and answered by a server fake
 * that behaves like `exercise_set_logs` where it matters: rows keyed by their
 * client-minted id, `(workout_exercise_id, set_number)` unique, an id
 * collision refused as a conflict, and RLS that shows a caller only their own
 * prescriptions. Each request can be held, refused, or carried out with its
 * answer lost, which is how delayed responses, network failure, retry and
 * reload are produced without a network.
 *
 * What is proved is mutation identity and order, not set-number matching:
 * every correction and clear is addressed to a row id, and the server state
 * after each journey is compared row by row.
 */
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { createWorkoutClients, type SetLogsClient } from '../data/workout'
import { AppProviders } from '../test/render'
import {
  createWorkoutDouble,
  FIXTURE_SESSION_ID,
  snapshotFixture,
  type ExerciseFixture,
} from '../test/workout-double'
import { createError, err, ErrorCode, ok } from './errors'
import type { ExerciseSetLogRow } from './schemas'
import {
  cleared,
  corrected,
  isInsert,
  queuedSetLog,
  readSetLogQueue,
  reconciled,
  sendable,
  SET_LOG_QUEUE_STORAGE_KEY,
  type QueuedSetLog,
  type QueueStorage,
} from './set-log-queue'
import {
  setLogCorrection,
  setLogInsert,
  useSetLogging,
  type SetLoggingApi,
  type SetLogEntry,
} from './set-logging'
import { SetLoggingProvider } from './set-logging-provider'
import { sessionProgress } from './workout-progress'

afterEach(cleanup)

// ─────────────────────────────────────────────────────────────────────────────
// The server
// ─────────────────────────────────────────────────────────────────────────────

type Behaviour = 'store' | 'offline' | 'lost'

interface Server {
  client: SetLogsClient
  rows: Map<string, ExerciseSetLogRow>
  /** Every request, in the order the database received it. */
  log: string[]
  /** The next requests' behaviour, consumed in order; `store` once empty. */
  plan: Behaviour[]
  /** Holds the next request until `release()`. */
  hold(): void
  release(): Promise<void>
}

function createServer(owned: readonly string[]): Server {
  const rows = new Map<string, ExerciseSetLogRow>()
  const log: string[] = []
  const plan: Behaviour[] = []
  let gate: Promise<void> | null = null
  let open: (() => void) | null = null

  const visible = (exerciseId: string) => owned.includes(exerciseId)

  async function request<T>(name: string, write: () => T): Promise<T | ReturnType<typeof offline>> {
    if (gate !== null) await gate
    const behaviour = plan.shift() ?? 'store'
    if (behaviour === 'offline') return offline()
    log.push(name)
    const answer = write()
    return behaviour === 'lost' ? offline() : answer
  }

  const offline = () => err(createError(ErrorCode.NETWORK_OFFLINE))

  const client: SetLogsClient = {
    log: (entry) =>
      request(`insert ${entry.id}`, () => {
        const clash = [...rows.values()].some(
          (row) =>
            row.id === entry.id ||
            (row.workout_exercise_id === entry.exerciseId && row.set_number === entry.performed.setNumber),
        )
        if (clash || !visible(entry.exerciseId)) return err(createError(ErrorCode.PERSISTENCE_CONFLICT))
        const row = stored(entry)
        rows.set(row.id, row)
        return ok(row)
      }),
    correct: (entry) =>
      request(`correct ${entry.id}`, () => {
        const row = rows.get(entry.id)
        // RLS: a row that is not the caller's matches nothing, like a missing one.
        if (row === undefined || row.workout_exercise_id !== entry.exerciseId || !visible(row.workout_exercise_id)) {
          return err(createError(ErrorCode.PERSISTENCE_NOT_FOUND))
        }
        const next = { ...row, ...setLogCorrection(entry) } as ExerciseSetLogRow
        rows.set(row.id, next)
        return ok(next)
      }),
    clear: (entry) =>
      request(`clear ${entry.id}`, () => {
        const row = rows.get(entry.id)
        if (row !== undefined && row.workout_exercise_id === entry.exerciseId && visible(row.workout_exercise_id)) {
          rows.delete(entry.id)
        }
        return ok(undefined)
      }),
  }

  return {
    client,
    rows,
    log,
    plan,
    hold() {
      gate = new Promise((resolve) => {
        open = resolve
      })
    },
    async release() {
      const resolve = open
      gate = null
      open = null
      await act(async () => {
        resolve?.()
        await Promise.resolve()
      })
    },
  }
}

function stored(entry: SetLogEntry): ExerciseSetLogRow {
  const insert = setLogInsert(entry)
  return {
    id: entry.id,
    workout_exercise_id: entry.exerciseId,
    prescription_revision_status: 'active',
    set_number: entry.performed.setNumber,
    actual_reps: insert.actual_reps ?? null,
    actual_duration_seconds: insert.actual_duration_seconds ?? null,
    actual_distance: insert.actual_distance ?? null,
    actual_distance_unit: insert.actual_distance_unit ?? null,
    weight: insert.weight ?? null,
    weight_unit: entry.weightUnit,
    rpe: null,
    is_warmup_set: insert.is_warmup_set ?? false,
    created_at: '2026-10-27T09:00:00+00:00',
    effort: insert.effort ?? null,
  }
}

function memoryStorage(): QueueStorage {
  const data = new Map<string, string>()
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The shell
// ─────────────────────────────────────────────────────────────────────────────

/** Two movements in one block: the wrong one the set went to, and the right one. */
function snapshotWith(rows: readonly ExerciseSetLogRow[] = []) {
  const forIndex = (index: number): ExerciseFixture => ({
    setLogs: rows.filter((row) => row.workout_exercise_id === exerciseIds[index]),
  })
  return snapshotFixture({
    sections: [
      { sectionType: 'primary_lift', blocks: [{ structureType: 'standard', exercises: [forIndex(0), forIndex(1)] }] },
    ],
  })
}

const exerciseIds = sessionProgress(
  snapshotFixture({
    sections: [{ sectionType: 'primary_lift', blocks: [{ structureType: 'standard', exercises: [{}, {}] }] }],
  }),
).sections[0].blocks[0].exercises.map((exercise) => exercise.exerciseId)
const [WRONG, RIGHT] = exerciseIds

const ROW_IDS = [
  'b0000001-0000-4000-8000-000000000000',
  'b0000002-0000-4000-8000-000000000000',
  'b0000003-0000-4000-8000-000000000000',
  'b0000004-0000-4000-8000-000000000000',
]

interface Shell {
  api: () => SetLoggingApi
  storage: QueueStorage
  queue: () => readonly QueuedSetLog[]
  reload: () => Promise<Shell>
}

/** Mounted, with the mount's own flush pass finished — as before any real tap. */
async function start(server: Server, storage?: QueueStorage, minted?: { next: number }): Promise<Shell> {
  const shell = mountShell(server, storage, minted)
  await settle(shell)
  return shell
}

/**
 * The provider with corrections on, answered by `server`. `reload` unmounts it
 * and mounts it again over the same storage and the server's current rows —
 * what a refreshed tab resuming the session sees.
 */
function mountShell(server: Server, storage: QueueStorage = memoryStorage(), minted = { next: 0 }): Shell {
  const holder: { api: SetLoggingApi | null } = { api: null }
  const Probe = () => {
    holder.api = useSetLogging()
    return null
  }
  const double = createWorkoutDouble({ session: snapshotWith() })
  const exercises = sessionProgress(snapshotWith([...server.rows.values()])).sections[0].blocks[0].exercises

  const view = render(
    <AppProviders workout={{ ...double.clients, setLogs: server.client }}>
      <SetLoggingProvider
        sessionId={FIXTURE_SESSION_ID}
        exercises={exercises}
        weightUnit="kg"
        onFailure={() => {}}
        newId={() => ROW_IDS[minted.next++]}
        storage={storage}
        retryDelay={() => 60_000}
        corrections
      >
        <Probe />
      </SetLoggingProvider>
    </AppProviders>,
  )

  return {
    api: () => {
      if (holder.api === null) throw new Error('not mounted')
      return holder.api
    },
    storage,
    queue: () => readSetLogQueue(storage),
    reload: () => {
      view.unmount()
      return start(server, storage, minted)
    },
  }
}

async function settle(shell: Shell): Promise<void> {
  await waitFor(() => expect(shell.api().sync.syncing).toBe(false))
  await act(async () => {
    await Promise.resolve()
  })
}

/** Flushes once more, the way `online` or the notice's retry would. */
async function retry(shell: Shell): Promise<void> {
  await act(async () => {
    shell.api().retrySync()
    await Promise.resolve()
  })
  await settle(shell)
}

const values = (rows: Map<string, ExerciseSetLogRow>) =>
  [...rows.values()]
    .map((row) => ({
      id: row.id,
      exercise: row.workout_exercise_id,
      set: row.set_number,
      reps: row.actual_reps,
      weight: row.weight,
      unit: row.weight_unit,
      effort: row.effort,
    }))
    .sort((left, right) => left.id.localeCompare(right.id))

// ─────────────────────────────────────────────────────────────────────────────
// The rules, pure
// ─────────────────────────────────────────────────────────────────────────────

function entry(id: string, exerciseId: string, setNumber: number, reps: number): SetLogEntry {
  return {
    id,
    exerciseId,
    blockId: 'c0000001-0000-4000-8000-000000000000',
    distanceUnit: null,
    weightUnit: 'kg',
    performed: { setNumber, reps },
  }
}
const at = '2026-10-27T09:00:00.000Z'
const insertOf = (value: SetLogEntry) => queuedSetLog(value, FIXTURE_SESSION_ID, at)
const mutationOf = (value: SetLogEntry, mutationId: string) => ({ ...insertOf(value), mutationId })

describe('the queue rules a correction and a clear follow (AC-072)', () => {
  it('rewrites an insert that has never been sent, and queues behind one that may have landed', () => {
    const original = entry(ROW_IDS[0], WRONG, 1, 8)
    const fix = entry(ROW_IDS[0], WRONG, 1, 7)

    const unsent = corrected([insertOf(original)], mutationOf(fix, 'm1'), null)
    expect(unsent).toHaveLength(1)
    expect(isInsert(unsent[0])).toBe(true)
    expect(unsent[0].entry.performed.reps).toBe(7)

    // In flight, or dispatched before a reload: its answer may still be the old values.
    for (const queue of [
      corrected([insertOf(original)], mutationOf(fix, 'm1'), ROW_IDS[0]),
      corrected([{ ...insertOf(original), dispatched: true }], mutationOf(fix, 'm1'), null),
    ]) {
      expect(queue.map((item) => item.kind ?? 'insert')).toEqual(['insert', 'correct'])
      expect(queue[0].entry.performed.reps).toBe(8)
      expect(queue[1].mutationId).toBe('m1')
    }
  })

  it('supersedes an unsent correction but never the one in flight', () => {
    const first = { ...mutationOf(entry(ROW_IDS[0], WRONG, 1, 7), 'm1'), kind: 'correct' as const }
    const second = mutationOf(entry(ROW_IDS[0], WRONG, 1, 6), 'm2')

    expect(corrected([first], second, null).map((item) => item.mutationId)).toEqual(['m2'])
    expect(corrected([first], second, 'm1').map((item) => item.mutationId)).toEqual(['m1', 'm2'])
  })

  it('withdraws a never-sent set entirely, and deletes one that may exist', () => {
    const set = entry(ROW_IDS[0], WRONG, 1, 8)
    const partner = insertOf(entry(ROW_IDS[1], RIGHT, 1, 8))

    expect(cleared([insertOf(set), partner], mutationOf(set, 'c1'), null)).toEqual([partner])

    const sent = cleared([{ ...insertOf(set), attempts: 1 }, partner], mutationOf(set, 'c1'), null)
    expect(sent.map((item) => [item.entry.id, item.kind ?? 'insert'])).toEqual([
      [ROW_IDS[1], 'insert'],
      [ROW_IDS[0], 'clear'],
    ])
  })

  it('orders a re-entry into a cleared slot behind the clear, and nothing else behind it', () => {
    const clear = { ...mutationOf(entry(ROW_IDS[0], WRONG, 1, 8), 'c1'), kind: 'clear' as const }
    const reentry = insertOf(entry(ROW_IDS[1], WRONG, 1, 9))
    const elsewhere = insertOf(entry(ROW_IDS[2], RIGHT, 1, 8))

    expect(sendable([clear, reentry, elsewhere]).map((item) => item.entry.id)).toEqual([ROW_IDS[0], ROW_IDS[2]])
    expect(sendable([reentry, elsewhere]).map((item) => item.entry.id)).toEqual([ROW_IDS[1], ROW_IDS[2]])
  })

  it('keeps corrections and clears through a reload, and a re-entry into a slot being cleared', () => {
    const stored = [{ id: ROW_IDS[0], exerciseId: WRONG, setNumber: 1 }]
    const correction = { ...mutationOf(entry(ROW_IDS[0], WRONG, 1, 7), 'm1'), kind: 'correct' as const }
    const clear = { ...mutationOf(entry(ROW_IDS[0], WRONG, 1, 8), 'c1'), kind: 'clear' as const }
    const reentry = insertOf(entry(ROW_IDS[1], WRONG, 1, 9))
    const landed = insertOf(entry(ROW_IDS[0], WRONG, 1, 8))

    expect(reconciled([correction], stored)).toEqual([correction])
    expect(reconciled([clear, reentry], stored)).toEqual([clear, reentry])
    expect(reconciled([landed], stored)).toEqual([])
  })

  it('decodes a legacy insert, and refuses a mutation with no identity of its own', () => {
    const storage = memoryStorage()
    const legacy = insertOf(entry(ROW_IDS[0], WRONG, 1, 8))
    const orphan = { ...insertOf(entry(ROW_IDS[1], WRONG, 2, 8)), kind: 'clear' }
    const correction = { ...mutationOf(entry(ROW_IDS[2], WRONG, 3, 8), 'm1'), kind: 'correct', dispatched: true }
    storage.setItem(SET_LOG_QUEUE_STORAGE_KEY, JSON.stringify([legacy, orphan, correction]))

    expect(readSetLogQueue(storage)).toEqual([legacy, correction])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Through the provider and the server
// ─────────────────────────────────────────────────────────────────────────────

describe('a correction of a confirmed set (AC-072)', () => {
  it('updates only that row, by id, and is drawn unconfirmed until the database answers', async () => {
    const server = createServer([WRONG, RIGHT])
    const shell = await start(server)
    act(() => {
      shell.api().logSet(WRONG, { setNumber: 1, reps: 8, weight: 60 })
      shell.api().logSet(RIGHT, { setNumber: 1, reps: 8, weight: 40 })
    })
    await settle(shell)
    const before = values(server.rows)

    server.hold()
    act(() => shell.api().correctSet?.(WRONG, ROW_IDS[0], { setNumber: 1, reps: 7, weight: 62.5, weightUnit: 'kg', effort: 'too_hard' }))
    expect(shell.api().loggedSets(WRONG)).toMatchObject([{ id: ROW_IDS[0], reps: 7, effort: 'too_hard', status: 'syncing' }])
    await server.release()
    await settle(shell)

    expect(shell.api().loggedSets(WRONG)).toMatchObject([{ id: ROW_IDS[0], reps: 7, weight: 62.5, effort: 'too_hard', status: 'logged' }])
    expect(values(server.rows)).toEqual(before.map((row) =>
      row.id === ROW_IDS[0] ? { ...row, reps: 7, weight: 62.5, effort: 'too_hard' } : row))
    expect(server.log.filter((line) => !line.startsWith('insert'))).toEqual([`correct ${ROW_IDS[0]}`])
    expect(shell.queue()).toEqual([])
  })

  it('never renumbers, reclassifies or relabels the set it corrects', async () => {
    const server = createServer([WRONG])
    const shell = await start(server)
    act(() => shell.api().logSet(WRONG, { setNumber: 1, reps: 8, weight: 135, weightUnit: 'lb' }))
    await settle(shell)

    // A caller naming another set number cannot move the observation.
    act(() => shell.api().correctSet?.(WRONG, ROW_IDS[0], { setNumber: 3, reps: 6, weight: 135 }))
    await settle(shell)

    expect(server.rows.get(ROW_IDS[0])).toMatchObject({ set_number: 1, actual_reps: 6, weight_unit: 'lb', is_warmup_set: false, rpe: null })
  })

  it('survives a network failure and is retried with the same identity, never duplicated', async () => {
    const server = createServer([WRONG])
    const shell = await start(server)
    act(() => shell.api().logSet(WRONG, { setNumber: 1, reps: 8 }))
    await settle(shell)

    server.plan.push('offline')
    act(() => shell.api().correctSet?.(WRONG, ROW_IDS[0], { setNumber: 1, reps: 5 }))
    await settle(shell)
    expect(shell.api().loggedSets(WRONG)).toMatchObject([{ reps: 5, status: 'failed' }])
    const mutationId = shell.queue()[0].mutationId

    await retry(shell)
    expect(server.log).toEqual([`insert ${ROW_IDS[0]}`, `correct ${ROW_IDS[0]}`])
    expect(server.rows.get(ROW_IDS[0])?.actual_reps).toBe(5)
    expect(mutationId).toMatch(/.+/)
    expect(shell.api().loggedSets(WRONG)).toMatchObject([{ reps: 5, status: 'logged' }])
  })

  it('keeps the latest of two corrections when the first is delayed in flight', async () => {
    const server = createServer([WRONG])
    const shell = await start(server)
    act(() => shell.api().logSet(WRONG, { setNumber: 1, reps: 8 }))
    await settle(shell)

    server.hold()
    act(() => shell.api().correctSet?.(WRONG, ROW_IDS[0], { setNumber: 1, reps: 7 }))
    act(() => shell.api().correctSet?.(WRONG, ROW_IDS[0], { setNumber: 1, reps: 6 }))
    expect(shell.queue().map((item) => item.kind)).toEqual(['correct', 'correct'])
    await server.release()
    await settle(shell)

    expect(server.log.slice(1)).toEqual([`correct ${ROW_IDS[0]}`, `correct ${ROW_IDS[0]}`])
    expect(server.rows.get(ROW_IDS[0])?.actual_reps).toBe(6)
    expect(shell.api().loggedSets(WRONG)).toMatchObject([{ reps: 6, status: 'logged' }])
  })
})

describe('a correction of a queued or in-flight set (AC-072)', () => {
  it('follows a refused insert, so the database ends with one row holding the corrected values', async () => {
    const server = createServer([WRONG])
    server.plan.push('offline')
    const shell = await start(server)
    // Refused before it reached the server — though this device cannot know that.
    act(() => shell.api().logSet(WRONG, { setNumber: 1, reps: 8 }))
    await settle(shell)
    expect(shell.api().loggedSets(WRONG)).toMatchObject([{ status: 'failed' }])

    act(() => shell.api().correctSet?.(WRONG, ROW_IDS[0], { setNumber: 1, reps: 7, effort: 'about_right' }))
    await retry(shell)

    expect(values(server.rows)).toEqual([
      { id: ROW_IDS[0], exercise: WRONG, set: 1, reps: 7, weight: null, unit: 'kg', effort: 'about_right' },
    ])
    expect(server.log.filter((line) => line.startsWith('insert'))).toHaveLength(1)
  })

  it('is not lost when the insert landed but its answer did not, and a retry collides', async () => {
    const server = createServer([WRONG])
    server.plan.push('lost')
    const shell = await start(server)
    act(() => shell.api().logSet(WRONG, { setNumber: 1, reps: 8 }))
    await settle(shell)
    // Stored, but this device was told it failed.
    expect(server.rows.get(ROW_IDS[0])?.actual_reps).toBe(8)

    act(() => shell.api().correctSet?.(WRONG, ROW_IDS[0], { setNumber: 1, reps: 7 }))
    await retry(shell)

    // The retried insert collided on its own id (stored, old values); the
    // correction followed it rather than being folded into the collided write.
    expect(server.log).toEqual([`insert ${ROW_IDS[0]}`, `insert ${ROW_IDS[0]}`, `correct ${ROW_IDS[0]}`])
    expect(server.rows.size).toBe(1)
    expect(server.rows.get(ROW_IDS[0])?.actual_reps).toBe(7)
    expect(shell.api().loggedSets(WRONG)).toMatchObject([{ reps: 7, status: 'logged' }])
  })

  it('waits for an insert in flight, then writes over it', async () => {
    const server = createServer([WRONG])
    const shell = await start(server)
    server.hold()
    act(() => shell.api().logSet(WRONG, { setNumber: 1, reps: 8 }))
    act(() => shell.api().correctSet?.(WRONG, ROW_IDS[0], { setNumber: 1, reps: 7 }))
    expect(shell.api().loggedSets(WRONG)).toMatchObject([{ reps: 7, status: 'syncing' }])
    await server.release()
    await settle(shell)

    expect(server.log).toEqual([`insert ${ROW_IDS[0]}`, `correct ${ROW_IDS[0]}`])
    expect(server.rows.get(ROW_IDS[0])?.actual_reps).toBe(7)
  })

  it('survives a reload between the insert and its correction', async () => {
    const server = createServer([WRONG])
    server.plan.push('lost')
    let shell = await start(server)
    act(() => shell.api().logSet(WRONG, { setNumber: 1, reps: 8 }))
    await settle(shell)
    server.plan.push('offline')
    act(() => shell.api().correctSet?.(WRONG, ROW_IDS[0], { setNumber: 1, reps: 7 }))
    await settle(shell)

    shell = await shell.reload()
    await settle(shell)

    expect(server.rows.get(ROW_IDS[0])?.actual_reps).toBe(7)
    expect(server.rows.size).toBe(1)
    expect(shell.api().loggedSets(WRONG)).toMatchObject([{ id: ROW_IDS[0], reps: 7, status: 'logged' }])
    expect(shell.queue()).toEqual([])
  })
})

describe('a confirmed clear, then explicit re-entry (AC-072)', () => {
  it('removes only the mistaken row and lets the right movement log it afresh', async () => {
    const server = createServer([WRONG, RIGHT])
    const shell = await start(server)
    act(() => {
      shell.api().logSet(WRONG, { setNumber: 1, reps: 8, weight: 60 })
      shell.api().logSet(WRONG, { setNumber: 2, reps: 8, weight: 60 })
    })
    await settle(shell)

    act(() => shell.api().clearSet?.(WRONG, ROW_IDS[1]))
    // Gone from the movement; nothing appears on the other one by itself.
    expect(shell.api().loggedSets(WRONG).map((set) => set.id)).toEqual([ROW_IDS[0]])
    expect(shell.api().loggedSets(RIGHT)).toEqual([])
    await settle(shell)

    act(() => shell.api().logSet(RIGHT, { setNumber: 1, reps: 8, weight: 60 }))
    await settle(shell)

    expect(values(server.rows)).toEqual([
      { id: ROW_IDS[0], exercise: WRONG, set: 1, reps: 8, weight: 60, unit: 'kg', effort: null },
      { id: ROW_IDS[2], exercise: RIGHT, set: 1, reps: 8, weight: 60, unit: 'kg', effort: null },
    ])
  })

  it('does not resurrect a set whose insert was in flight when it was cleared', async () => {
    const server = createServer([WRONG])
    const shell = await start(server)
    server.hold()
    act(() => shell.api().logSet(WRONG, { setNumber: 1, reps: 8 }))
    act(() => shell.api().clearSet?.(WRONG, ROW_IDS[0]))
    expect(shell.api().loggedSets(WRONG)).toEqual([])
    await server.release()
    await settle(shell)

    expect(server.log).toEqual([`insert ${ROW_IDS[0]}`, `clear ${ROW_IDS[0]}`])
    expect(server.rows.size).toBe(0)
    expect(shell.api().loggedSets(WRONG)).toEqual([])
  })

  it('does not resurrect a set whose insert landed with its answer lost', async () => {
    const server = createServer([WRONG])
    server.plan.push('lost')
    const shell = await start(server)
    act(() => shell.api().logSet(WRONG, { setNumber: 1, reps: 8 }))
    await settle(shell)

    act(() => shell.api().clearSet?.(WRONG, ROW_IDS[0]))
    await retry(shell)

    expect(server.rows.size).toBe(0)
    expect(shell.api().loggedSets(WRONG)).toEqual([])
  })

  it('re-enters into the cleared slot only after the clear, through failure and reload', async () => {
    const server = createServer([WRONG])
    let shell = await start(server)
    act(() => shell.api().logSet(WRONG, { setNumber: 1, reps: 8 }))
    await settle(shell)

    // Refused now, and again on the pass the re-entry starts.
    server.plan.push('offline', 'offline')
    act(() => shell.api().clearSet?.(WRONG, ROW_IDS[0]))
    await settle(shell)
    // The slot is free on screen, so set 1 can be logged again — explicitly.
    act(() => shell.api().logSet(WRONG, { setNumber: 1, reps: 9 }))
    await settle(shell)
    expect(shell.queue().map((item) => item.kind ?? 'insert')).toEqual(['clear', 'insert'])
    // Neither is drawn as confirmed while the clear is owed.
    expect(shell.api().loggedSets(WRONG)).toMatchObject([{ id: ROW_IDS[1], reps: 9, status: 'syncing' }])

    shell = await shell.reload()
    await settle(shell)

    expect(server.log).toEqual([`insert ${ROW_IDS[0]}`, `clear ${ROW_IDS[0]}`, `insert ${ROW_IDS[1]}`])
    expect(values(server.rows)).toEqual([
      { id: ROW_IDS[1], exercise: WRONG, set: 1, reps: 9, weight: null, unit: 'kg', effort: null },
    ])
    expect(shell.api().loggedSets(WRONG)).toMatchObject([{ id: ROW_IDS[1], status: 'logged' }])
  })
})

describe('a canceled clear, a missing target and owner isolation (AC-072)', () => {
  it('touches nothing when no clear was confirmed', async () => {
    const server = createServer([WRONG])
    const shell = await start(server)
    act(() => shell.api().logSet(WRONG, { setNumber: 1, reps: 8 }))
    await settle(shell)
    const before = values(server.rows)

    // The confirmation was dismissed: the seam was never called.
    await retry(shell)

    expect(values(server.rows)).toEqual(before)
    expect(shell.queue()).toEqual([])
  })

  it('ignores a correction or clear for a set this session does not show', async () => {
    const server = createServer([WRONG])
    const shell = await start(server)
    act(() => {
      shell.api().correctSet?.(WRONG, 'not-a-shown-set', { setNumber: 1, reps: 1 })
      shell.api().clearSet?.(WRONG, 'not-a-shown-set')
      shell.api().correctSet?.('not-this-session', ROW_IDS[0], { setNumber: 1, reps: 1 })
    })
    await settle(shell)

    expect(shell.queue()).toEqual([])
    expect(server.log).toEqual([])
  })

  it('never claims a correction RLS refused: it stays queued, failed and counted', async () => {
    // The row is somebody else's: RLS matches nothing for this caller.
    const server = createServer([])
    const foreign = stored(entry(ROW_IDS[0], WRONG, 1, 8))
    server.rows.set(foreign.id, foreign)
    const shell = await start(server)

    act(() => shell.api().correctSet?.(WRONG, ROW_IDS[0], { setNumber: 1, reps: 2 }))
    act(() => shell.api().clearSet?.(WRONG, ROW_IDS[0]))
    await settle(shell)

    expect(server.rows.get(ROW_IDS[0])).toEqual(foreign)
    expect(shell.api().sync.unsyncedCount).toBeGreaterThan(0)
  })
})

describe('the wire: a correction and a clear name exactly one row (AC-072)', () => {
  function wire(answer: unknown[] | null) {
    const sent: { method: string; url: URL; body: unknown }[] = []
    const clients = createWorkoutClients({
      auth: {
        getSession: () =>
          Promise.resolve(ok({
            accessToken: 'token',
            refreshToken: 'refresh',
            expiresAt: Date.now() + 60_000,
            user: { id: 'a0000001-0000-4000-8000-000000000000', email: null },
          })),
      },
      supabase: {
        url: 'https://project.supabase.co',
        anonKey: 'anon',
        fetch: async (input, init) => {
          sent.push({
            method: init?.method ?? 'GET',
            url: new URL(String(input)),
            body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
          })
          return answer === null
            ? new Response(null, { status: 204 })
            : new Response(JSON.stringify(answer), { status: 200, headers: { 'Content-Type': 'application/json' } })
        },
      },
    })
    return { setLogs: clients.setLogs, sent }
  }

  it('patches by id and prescription, with no set number, rpe or warmup in the body', async () => {
    const correction = { ...entry(ROW_IDS[0], WRONG, 1, 7), performed: { setNumber: 1, reps: 7, effort: 'too_hard' as const } }
    const { setLogs, sent } = wire([stored(correction)])

    const result = await setLogs.correct(correction)

    expect(result.ok).toBe(true)
    expect(sent).toHaveLength(1)
    expect(sent[0].method).toBe('PATCH')
    expect(sent[0].url.pathname).toBe('/rest/v1/exercise_set_logs')
    expect(sent[0].url.searchParams.get('id')).toBe(`eq.${ROW_IDS[0]}`)
    expect(sent[0].url.searchParams.get('workout_exercise_id')).toBe(`eq.${WRONG}`)
    expect(sent[0].body).toEqual({
      actual_reps: 7,
      actual_duration_seconds: null,
      actual_distance: null,
      actual_distance_unit: null,
      weight: null,
      weight_unit: 'kg',
      effort: 'too_hard',
    })
  })

  it('refuses a correction RLS matched to nothing instead of calling it saved', async () => {
    const { setLogs } = wire([])
    const result = await setLogs.correct(entry(ROW_IDS[0], WRONG, 1, 7))
    expect(result.ok || result.error.code).toBe(ErrorCode.PERSISTENCE_NOT_FOUND)
  })

  it('refuses an impossible correction before anything is sent', async () => {
    const { setLogs, sent } = wire([])
    const result = await setLogs.correct({ ...entry(ROW_IDS[0], WRONG, 1, 7), performed: { setNumber: 1, reps: -1 } })
    expect(result.ok || result.error.code).toBe(ErrorCode.VALIDATION_OUT_OF_RANGE)
    expect(sent).toEqual([])
  })

  it('deletes by id and prescription only', async () => {
    const { setLogs, sent } = wire(null)
    const result = await setLogs.clear(entry(ROW_IDS[0], WRONG, 1, 8))

    expect(result.ok).toBe(true)
    expect(sent.map((request) => [request.method, request.url.search])).toEqual([
      ['DELETE', `?id=eq.${ROW_IDS[0]}&workout_exercise_id=eq.${WRONG}`],
    ])
  })
})

describe('effort through correction and clear (AC-045)', () => {
  it('round-trips every category and unanswered through a correction, and reads it back after reload', async () => {
    const server = createServer([WRONG])
    let shell = await start(server)
    act(() => shell.api().logSet(WRONG, { setNumber: 1, reps: 8, effort: 'too_easy' }))
    await settle(shell)

    for (const effort of ['too_hard', 'about_right', 'too_easy', null] as const) {
      act(() => shell.api().correctSet?.(WRONG, ROW_IDS[0], { setNumber: 1, reps: 8, effort }))
      await settle(shell)
      expect(server.rows.get(ROW_IDS[0])?.effort).toBe(effort)
      expect(server.rows.get(ROW_IDS[0])?.rpe).toBeNull()
    }

    shell = await shell.reload()
    expect(shell.api().loggedSets(WRONG)).toMatchObject([{ effort: null, status: 'logged' }])
  })

  it('reads an older row with no effort as unanswered, and keeps its historical rpe through a correction', async () => {
    const server = createServer([WRONG])
    const legacy = { ...stored(entry(ROW_IDS[0], WRONG, 1, 8)), rpe: 7, effort: null }
    server.rows.set(legacy.id, legacy)
    const shell = await start(server)
    expect(shell.api().loggedSets(WRONG)).toMatchObject([{ id: ROW_IDS[0], effort: null }])

    act(() => shell.api().correctSet?.(WRONG, ROW_IDS[0], { setNumber: 1, reps: 9 }))
    await settle(shell)

    expect(server.rows.get(ROW_IDS[0])).toMatchObject({ actual_reps: 9, rpe: 7, effort: null })
  })
})
