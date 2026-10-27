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
  setLogInsert,
  useSetLogging,
  type SetLoggingApi,
  type SetLogEntry,
} from './set-logging'
import { SetLoggingProvider } from './set-logging-provider'
import { setObservationMutation, sameSetMutation, parseSetObservationAck, type SetObservationMutation, type SetObservationAck } from './set-observation-mutation'
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
    const held = gate
    gate = null
    if (held !== null) await held
    const behaviour = plan.shift() ?? 'store'
    if (behaviour === 'offline') return offline()
    log.push(name)
    const answer = write()
    return behaviour === 'lost' ? offline() : answer
  }

  const offline = () => err(createError(ErrorCode.NETWORK_OFFLINE))

  const receipts = new Map<string, SetObservationMutation>()
  const heads = new Map<string, SetObservationMutation>()
  const conflict = () => err(createError(ErrorCode.PERSISTENCE_CONFLICT))
  const answer = (mutation: SetObservationMutation, outcome: 'applied' | 'replayed') => {
    const head = heads.get(mutation.observation_id)!
    return ok<SetObservationAck>({ outcome, mutation, head: {
      revision: head.revision, mutation_id: head.mutation_id,
      cleared: head.operation === 'clear', row: rows.get(mutation.observation_id) ?? null,
    } })
  }
  const client: SetLogsClient = {
    log: async () => conflict(),
    mutate: (mutation) => request(`${mutation.operation} ${mutation.observation_id}`, () => {
      if (!visible(mutation.exercise_id)) return err(createError(ErrorCode.PERSISTENCE_NOT_FOUND))
      const previous = receipts.get(mutation.mutation_id)
      if (previous !== undefined) return sameSetMutation(previous, mutation)
        ? answer(previous, 'replayed') : conflict()
      const head = heads.get(mutation.observation_id)
      const row = rows.get(mutation.observation_id)
      if (mutation.expected_revision !== (head?.revision ?? 0)) return conflict()
      if (row !== undefined && (row.workout_exercise_id !== mutation.exercise_id
        || row.set_number !== mutation.set_number)) return conflict()
      if (mutation.operation === 'insert') {
        if (head !== undefined) return conflict()
        const clash = [...rows.values()].some((candidate) => candidate.id !== mutation.observation_id
          && candidate.workout_exercise_id === mutation.exercise_id && candidate.set_number === mutation.set_number)
        if (clash) return conflict()
        if (row !== undefined) {
          if (!Object.entries(mutation.values).every(([key, value]) => (row as unknown as Record<string, unknown>)[key] === value)) return conflict()
        } else {
          rows.set(mutation.observation_id, {
            id: mutation.observation_id, workout_exercise_id: mutation.exercise_id,
            prescription_revision_status: 'active', set_number: mutation.set_number,
            created_at: '2026-10-27T09:00:00+00:00', ...mutation.values,
          } as ExerciseSetLogRow)
        }
      } else if (mutation.operation === 'correct') {
        if (row === undefined) return err(createError(ErrorCode.PERSISTENCE_NOT_FOUND))
        rows.set(row.id, { ...row, ...mutation.values } as ExerciseSetLogRow)
      } else rows.delete(mutation.observation_id)
      const current = rows.get(mutation.observation_id)
      if (current !== undefined) rows.set(current.id, { ...current,
        mutation_revision: mutation.revision, last_mutation_id: mutation.mutation_id } as ExerciseSetLogRow)
      receipts.set(mutation.mutation_id, mutation)
      heads.set(mutation.observation_id, mutation)
      return answer(mutation, 'applied')
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
    mutation_revision: 0, last_mutation_id: null,
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

  it('keeps historical numeric RPE and classification when correcting an unsent legacy insert', () => {
    const original = { ...entry(ROW_IDS[0], WRONG, 1, 8), performed: { setNumber: 1, reps: 8, rpe: 7, isWarmup: true } }
    const result = corrected([insertOf(original)], mutationOf(entry(ROW_IDS[0], WRONG, 1, 7), 'm1'), null)
    expect(result[0].entry.performed).toMatchObject({ reps: 7, rpe: 7, isWarmup: true })
    expect(setObservationMutation(result[0].entry).values).toMatchObject({ rpe: 7, is_warmup_set: true })
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
      [ROW_IDS[0], 'insert'],
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
    expect(reconciled([landed], stored)).toEqual([landed])
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

describe('the wire: exact durable mutation receipts (AC-072)', () => {
  function wire(answer: unknown) {
    const sent: { method: string; url: URL; body: unknown }[] = []
    const clients = createWorkoutClients({
      auth: { getSession: () => Promise.resolve(ok({ accessToken: 'token', refreshToken: 'refresh',
        expiresAt: Date.now() + 60_000, user: { id: 'owner', email: null } })) },
      supabase: { url: 'https://project.supabase.co', anonKey: 'anon', fetch: async (input, init) => {
        sent.push({ method: init?.method ?? 'GET', url: new URL(String(input)),
          body: init?.body === undefined ? undefined : JSON.parse(String(init.body)) })
        return new Response(JSON.stringify(answer), { status: 200, headers: { 'Content-Type': 'application/json' } })
      } },
    })
    return { setLogs: clients.setLogs, sent }
  }
  it('posts the canonical ID, predecessor and payload to one atomic RPC', async () => {
    const mutation = setObservationMutation(entry(ROW_IDS[0], WRONG, 1, 7), 'correct', 'mutation-id', 3)
    const { setLogs, sent } = wire({ outcome: 'conflict' })
    const result = await setLogs.mutate(mutation)
    expect(result.ok || result.error.code).toBe(ErrorCode.PERSISTENCE_CONFLICT)
    expect(sent).toHaveLength(1)
    expect(sent[0].method).toBe('POST')
    expect(sent[0].url.pathname).toBe('/rest/v1/rpc/mutate_set_observation')
    expect(sent[0].body).toEqual({ p_observation_id: ROW_IDS[0], p_mutation_id: 'mutation-id',
      p_revision: 4, p_expected_revision: 3, p_operation: 'correct', p_exercise_id: WRONG,
      p_set_number: 1, p_values: mutation.values })
    expect(mutation.values).not.toHaveProperty('rpe')
    expect(mutation.values).not.toHaveProperty('is_warmup_set')
  })
  it('never accepts a missing, mismatched or generic-conflict answer as saved', async () => {
    const request = setObservationMutation(entry(ROW_IDS[0], WRONG, 1, 7))
    for (const value of [null, [], {}, { outcome: 'conflict' }, { outcome: 'applied', mutation: { ...request, mutation_id: 'other' }, head: {} }]) {
      expect(parseSetObservationAck(value, request).ok).toBe(false)
    }
  })
  it('rejects reused mutation identity with changed payload on the server', async () => {
    const server = createServer([WRONG])
    const request = setObservationMutation(entry(ROW_IDS[0], WRONG, 1, 7))
    expect((await server.client.mutate(request)).ok).toBe(true)
    const result = await server.client.mutate({ ...request, values: { ...request.values, actual_reps: 99 } })
    expect(result.ok || result.error.code).toBe(ErrorCode.PERSISTENCE_CONFLICT)
    expect(server.rows.get(ROW_IDS[0])?.actual_reps).toBe(7)
  })
})

describe('saved observation units', () => {
  it('retains the actual distance unit when it differs from the prescription on no-op Save', async () => {
    const server = createServer([WRONG])
    const legacy = { ...stored(entry(ROW_IDS[0], WRONG, 1, 8)), actual_reps: null,
      actual_distance: 2, actual_distance_unit: 'km' as const }
    server.rows.set(legacy.id, legacy)
    const shell = await start(server)
    act(() => shell.api().correctSet?.(WRONG, ROW_IDS[0], { setNumber: 1, distance: 2 }))
    await settle(shell)
    expect(server.rows.get(ROW_IDS[0])).toMatchObject({ actual_distance: 2, actual_distance_unit: 'km' })
    expect(shell.api().loggedSets(WRONG)).toMatchObject([{ distance: 2, distanceUnit: 'km', status: 'logged' }])
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

  it('keeps dispatched legacy RPE through exact bootstrap and a lost-response replay', async () => {
    const server = createServer([WRONG])
    const original = { ...entry(ROW_IDS[0], WRONG, 1, 8), performed: {
      setNumber: 1, reps: 8, rpe: 7, isWarmup: true,
    } }
    const historical = { ...stored(original), rpe: 7 }
    server.rows.set(historical.id, historical)
    const storage = memoryStorage()
    storage.setItem(SET_LOG_QUEUE_STORAGE_KEY, JSON.stringify([{ ...insertOf(original), dispatched: true, attempts: 1 }]))
    server.plan.push('lost')
    let shell = await start(server, storage)
    expect(shell.queue()[0].request?.values).toMatchObject({ rpe: 7, is_warmup_set: true })
    expect(shell.api().loggedSets(WRONG)).toMatchObject([{ status: 'failed' }])
    shell = await shell.reload()
    expect(shell.queue()).toEqual([])
    expect(server.rows.get(ROW_IDS[0])).toMatchObject({ rpe: 7, is_warmup_set: true, mutation_revision: 1 })
    expect(shell.api().loggedSets(WRONG)).toMatchObject([{ status: 'logged', isWarmup: true }])
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

describe('server requests that outlive their provider (AC-072)', () => {
  it('keeps a delayed pre-reload insert fenced after clear and explicit re-entry', async () => {
    const server = createServer([WRONG])
    let shell = await start(server)
    server.hold()
    act(() => shell.api().logSet(WRONG, { setNumber: 1, reps: 8 }))
    expect(shell.queue()[0]).toMatchObject({ dispatched: true, request: { revision: 1 } })
    // Original request is still outstanding. The new provider replays its
    // exact durable request, then owns all subsequent storage writes.
    shell = await shell.reload()
    act(() => shell.api().clearSet?.(WRONG, ROW_IDS[0]))
    await settle(shell)
    act(() => shell.api().logSet(WRONG, { setNumber: 1, reps: 9 }))
    await settle(shell)
    const before = shell.storage.getItem(SET_LOG_QUEUE_STORAGE_KEY)
    await server.release()
    expect(shell.storage.getItem(SET_LOG_QUEUE_STORAGE_KEY)).toBe(before)
    expect([...server.rows.keys()]).toEqual([ROW_IDS[1]])
    expect(shell.api().loggedSets(WRONG)).toMatchObject([{ id: ROW_IDS[1], reps: 9, status: 'logged' }])
  })

  it('cannot let an old correction response overwrite a newer post-reload correction', async () => {
    const server = createServer([WRONG])
    let shell = await start(server)
    act(() => shell.api().logSet(WRONG, { setNumber: 1, reps: 8 }))
    await settle(shell)
    server.hold()
    act(() => shell.api().correctSet?.(WRONG, ROW_IDS[0], { setNumber: 1, reps: 7 }))
    const oldRequest = shell.queue()[0].request
    shell = await shell.reload()
    act(() => shell.api().correctSet?.(WRONG, ROW_IDS[0], { setNumber: 1, reps: 6 }))
    await settle(shell)
    const before = shell.storage.getItem(SET_LOG_QUEUE_STORAGE_KEY)
    await server.release()
    expect(shell.storage.getItem(SET_LOG_QUEUE_STORAGE_KEY)).toBe(before)
    expect(server.rows.get(ROW_IDS[0])?.actual_reps).toBe(6)
    expect(shell.api().loggedSets(WRONG)).toMatchObject([{ reps: 6, status: 'logged' }])
    const replay = await server.client.mutate(oldRequest!)
    expect(replay.ok && replay.value.head.row?.actual_reps).toBe(6)
  })

  it('never confirms another observation occupying the same exercise/set slot', async () => {
    const server = createServer([WRONG])
    const other = stored(entry(ROW_IDS[3], WRONG, 1, 100))
    server.rows.set(other.id, other)
    const storage = memoryStorage()
    storage.setItem(SET_LOG_QUEUE_STORAGE_KEY, JSON.stringify([insertOf(entry(ROW_IDS[0], WRONG, 1, 8))]))
    const shell = await start(server, storage)
    expect(server.rows.get(other.id)?.actual_reps).toBe(100)
    expect(shell.queue()).toHaveLength(1)
    expect(shell.api().loggedSets(WRONG).find((row) => row.id === ROW_IDS[0])?.status).toBe('failed')
  })
})
