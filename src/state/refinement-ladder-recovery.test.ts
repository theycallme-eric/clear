/**
 * TASK-032 (REQ-032; TASK-AC-381E586395ED, TASK-AC-406D2CE971AA,
 * TASK-AC-A168ED4B8418) — durable ladder draft and clock recovery, proved
 * deterministically: a fake wall clock, an in-memory `Storage`, and the real
 * owners — `ladder-recovery.ts` over `for-time.ts` / `timed-lifecycle.ts` /
 * `workout-clock.ts`, kept by `workout-persistence.ts` (`usePersistedLadder`).
 *
 * "Close" is an unmount and "reopen" a fresh mount over the same storage, which
 * is all a reload leaves behind. The writer case goes further: the shell's own
 * `BlockCompletionProvider` and the app's own `createWorkoutClients` over
 * TASK-030's in-memory PostgREST (`logging-contract-double.ts`), so a refused
 * save, a retry after a reload and an answer lost in transit are the real
 * paths, and the row count is the double's.
 *
 * This is the foundation, not the journey: no route renderer is changed, so
 * nothing here claims JOURNEY-032's visible recovery (TASK-013/014/046/048).
 */
import { act, render, renderHook, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement, useEffect, type ReactElement } from 'react'
import { describe, expect, it } from 'vitest'

import type { AuthSession } from '../data/auth'
import { draftsAfterProgressChange, partialRoundFor, PROPOSED_PATHS } from '../data/refinement-logging-contract'
import { createWorkoutClients } from '../data/workout'
import {
  createLoggingDouble,
  LOGGING_DOUBLE_ANON_KEY,
  LOGGING_DOUBLE_TOKEN,
  LOGGING_DOUBLE_URL,
  type LoggingDouble,
} from '../test/logging-contract-double'
import { AppProviders } from '../test/render'
import { snapshotFixture } from '../test/workout-double'
import { useBlockCompletion, useSectionCompletion } from './block-completion'
import { BlockCompletionProvider } from './block-completion-provider'
import { isErr, ok, type Result } from './errors'
import { ladderRungs } from './ladder'
import * as recovery from './ladder-recovery'
import {
  createLadderAttempt,
  ladderAttemptView,
  ladderClockView,
  ladderDraftOutcome,
  ladderRaceCapSeconds,
  ladderUndoAvailability,
  startLadderAttempt,
  type LadderAttempt,
  type LadderAttemptView,
} from './ladder-recovery'
import type { SessionSnapshot } from './schemas'
import * as persistence from './workout-persistence'
import {
  clearWorkoutShellState,
  readForTimeState,
  readLadderAttempt,
  restoreLadderAttempt,
  usePersistedLadder,
  WORKOUT_FOR_TIME_STORAGE_KEY,
  WORKOUT_LADDER_STORAGE_KEY,
  writeForTimeState,
  writeLadderAttempt,
  type PersistedLadder,
  type ShellStorage,
} from './workout-persistence'
import { sessionProgress, type BlockProgress } from './workout-progress'

const REPO_ROOT = join(import.meta.dirname, '..', '..')
const read = (path: string) => readFileSync(join(REPO_ROOT, path), 'utf8')

const SESSION = 'session-ladder'
const BLOCK = 'block-ladder'
const CAP = 420
const RUNGS = 4
const T0 = '2026-11-10T09:00:00.000Z'
const at = (seconds: number) => new Date(Date.parse(T0) + seconds * 1000).toISOString()
const WRITER_TIMEOUT_MS = 20_000

// ─────────────────────────────────────────────────────────────────────────────
// Fakes: storage, wall clock, ids
// ─────────────────────────────────────────────────────────────────────────────

type MemoryStorage = ShellStorage & { keys(): string[]; raw(key: string): string | null }

function memoryStorage(): MemoryStorage {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
    keys: () => [...values.keys()].sort(),
    raw: (key) => values.get(key) ?? null,
  }
}

/** Private-mode Safari: every access throws. */
function hostileStorage(): ShellStorage {
  const refuse = () => {
    throw new DOMException('denied')
  }
  return { getItem: refuse, setItem: refuse, removeItem: refuse }
}

interface FakeClock {
  now(): number
  advance(seconds: number): void
  /** Seconds since `T0`. */
  elapsed(): number
}

function fakeClock(): FakeClock {
  let current = Date.parse(T0)
  return {
    now: () => current,
    advance: (seconds) => {
      current += seconds * 1000
    },
    elapsed: () => (current - Date.parse(T0)) / 1000,
  }
}

function mintIds(prefix = 'attempt'): () => string {
  let count = 0
  return () => {
    count += 1
    return `${prefix}-${count}`
  }
}

interface LadderMount {
  readonly storage: ShellStorage
  readonly clock: FakeClock
  readonly mintId?: () => string
  readonly blockId?: string
  readonly sessionId?: string
  readonly capSeconds?: number | null
  readonly rungCount?: number
  readonly recorded?: boolean
}

/** One ladder block's hook, mounted as a renderer would mount it. */
function mountLadder(options: LadderMount) {
  const mintId = options.mintId ?? mintIds()
  return renderHook(
    ({ recorded }: { recorded: boolean }) =>
      usePersistedLadder({
        sessionId: options.sessionId ?? SESSION,
        blockId: options.blockId ?? BLOCK,
        capSeconds: options.capSeconds === undefined ? CAP : options.capSeconds,
        rungCount: options.rungCount ?? RUNGS,
        recorded,
        storage: options.storage,
        now: options.clock.now,
        mintId,
      }),
    { initialProps: { recorded: options.recorded ?? false } },
  )
}

function viewOf(ladder: PersistedLadder, clock: FakeClock, recorded = false, rungCount = RUNGS): LadderAttemptView {
  return ladderAttemptView(ladder.attempt, { rungCount, now: clock.now(), recorded })
}

function storedLadders(storage: MemoryStorage): Record<string, LadderAttempt> {
  return JSON.parse(storage.raw(WORKOUT_LADDER_STORAGE_KEY) ?? '{}') as Record<string, LadderAttempt>
}

/** An action that must not apply: the record in storage is byte-identical after it. */
function expectNoWrite(storage: MemoryStorage, action: () => void) {
  const before = storage.raw(WORKOUT_LADDER_STORAGE_KEY)
  act(action)
  expect(storage.raw(WORKOUT_LADDER_STORAGE_KEY)).toBe(before)
}

// ─────────────────────────────────────────────────────────────────────────────
// The shell's writer over TASK-030's PostgREST double
// ─────────────────────────────────────────────────────────────────────────────

const USER_ID = 'a0000001-0000-4000-8000-000000000032'

/** The accepted four-rung ladder: push up 2 → 8 and a fixed 4-rep burpee, 07:00 cap. */
function ladderSnapshot(): SessionSnapshot {
  return snapshotFixture({
    userId: USER_ID,
    sections: [
      {
        title: 'Conditioning',
        sectionType: 'conditioning',
        blocks: [
          {
            structureType: 'for_time',
            repScheme: 'ladder_up',
            timerType: 'count_up',
            timerSeconds: CAP,
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

function workoutClientsOver(fetch: typeof globalThis.fetch) {
  const auth = {
    getSession: (): Promise<Result<AuthSession | null>> =>
      Promise.resolve(
        ok({ accessToken: LOGGING_DOUBLE_TOKEN, refreshToken: 'refresh', expiresAt: Date.now() + 60_000, user: { id: USER_ID, email: null } }),
      ),
  }
  return createWorkoutClients({ auth, supabase: { url: LOGGING_DOUBLE_URL, anonKey: LOGGING_DOUBLE_ANON_KEY, fetch } })
}

interface HarnessHandle {
  ladder: PersistedLadder
  view: LadderAttemptView
  /** The section's forward action, then the attempt told how it went. */
  save(): Promise<Result<undefined>>
}

/**
 * The smallest consumer of the contract: it reports the attempt's outcome
 * through the renderers' seam and saves through the shell's forward seam, as
 * TASK-048's adoption will. No presentation.
 */
function LadderHarness({
  block,
  storage,
  clock,
  mintId,
  expose,
}: {
  block: BlockProgress
  storage: ShellStorage
  clock: FakeClock
  mintId: () => string
  /** Hands the test the latest committed handle. */
  expose: (handle: HarnessHandle) => void
}) {
  const { reportOutcome, isBlockRecorded } = useBlockCompletion()
  const { completeSection } = useSectionCompletion()
  const recorded = isBlockRecorded(block.blockId)
  const rungCount = ladderRungs(block.exercises).length
  const ladder = usePersistedLadder({
    sessionId: SNAPSHOT_SESSION_ID,
    blockId: block.blockId,
    capSeconds: ladderRaceCapSeconds(block),
    rungCount,
    recorded,
    storage,
    now: clock.now,
    mintId,
  })
  const view = ladderAttemptView(ladder.attempt, { rungCount, now: clock.now(), recorded })

  useEffect(() => {
    reportOutcome(block.blockId, view.outcome)
    expose({
      ladder,
      view,
      save: async () => {
        const attemptId = ladder.attempt.identity.attemptId
        const result = await completeSection([block.blockId])
        if (isErr(result)) ladder.saveFailed(attemptId)
        else ladder.saveSucceeded(attemptId)
        return result
      },
    })
  })
  return null
}

const SNAPSHOT_SESSION_ID = ladderSnapshot().session.id

function mountShell(fetch: typeof globalThis.fetch, storage: ShellStorage, clock: FakeClock) {
  const snapshot = ladderSnapshot()
  const block = sessionProgress(snapshot).sections[0].blocks[0]
  const handle: { current: HarnessHandle | null } = { current: null }
  // No JSX in a `.ts` test: the same tree, built by hand.
  const harness = createElement(LadderHarness, {
    block,
    storage,
    clock,
    mintId: () => 'attempt-shell',
    expose: (latest: HarnessHandle) => {
      handle.current = latest
    },
  })
  const tree: ReactElement = createElement(AppProviders, {
    workout: workoutClientsOver(fetch),
    children: createElement(BlockCompletionProvider, { sessionId: snapshot.session.id, blocks: [block], children: harness }),
  })
  const mounted = render(tree)
  const current = (): HarnessHandle => {
    if (handle.current === null) throw new Error('harness not mounted')
    return handle.current
  }
  return { block, current, unmount: mounted.unmount }
}

const posts = (double: LoggingDouble) => double.requests.filter((request) => request.method === 'POST' && request.path === '/block_results')
const performedReads = (double: LoggingDouble) => double.requests.filter((request) => request.path === '/rpc/session_as_performed')

// ─────────────────────────────────────────────────────────────────────────────

describe('TASK-032 durable ladder draft and clock recovery', () => {
  it('AC-381E586395ED ordered progress, the current draft, the Finish checkpoint and the original cap round-trip through the workout-persistence owner under the attempt’s session, block and attempt identity', () => {
    const storage = memoryStorage()
    const clock = fakeClock()
    const mintId = mintIds()

    const first = mountLadder({ storage, clock, mintId })
    expect(first.result.current.source).toBe('fresh')
    // Nothing is stored until something happens to the attempt.
    expect(storage.keys()).toEqual([])

    act(() => first.result.current.start())
    clock.advance(60)
    act(() => first.result.current.track(1))
    act(() => first.result.current.track(2))
    act(() =>
      first.result.current.editDraft({
        effort: 'too_hard',
        notes: 'grip went on rung two',
        movements: { 'push-up-row': { amount: '', weight: '' }, 'burpee-row': { amount: '', weight: '10' } },
      }),
    )
    first.unmount() // the tab closes mid-ladder

    clock.advance(90) // 150 s since Start, 90 of them closed
    const second = mountLadder({ storage, clock, mintId })
    expect(second.result.current.source).toBe('stored')
    expect(second.result.current.discarded).toBeNull()
    const restored = second.result.current.attempt
    expect(restored.identity).toEqual({ sessionId: SESSION, blockId: BLOCK, attemptId: 'attempt-1' })
    expect(restored.version).toBe(1)
    expect(restored.originalCapSeconds).toBe(CAP)
    expect(restored.progress).toBe(2)
    expect(restored.draft).toEqual({
      completed: null,
      highestRung: null,
      effort: 'too_hard',
      notes: 'grip went on rung two',
      movements: { 'push-up-row': { amount: '', weight: '' }, 'burpee-row': { amount: '', weight: '10' } },
    })
    expect(viewOf(second.result.current, clock)).toMatchObject({
      clock: { phase: 'running', elapsedSeconds: 150, remainingSeconds: CAP - 150 },
      lifecycle: 'running',
      canTrack: true,
      authority: 'draft',
    })

    clock.advance(50)
    act(() => second.result.current.finish())
    const finished = second.result.current.attempt
    expect(finished.clock).toEqual({ startedAt: T0, finishedAt: at(200) })
    expect(finished.checkpoint).toEqual({ pausedAt: null, progress: 2, completed: null })
    // Tracked progress carries into the editable log (C36); effort, notes and loads stay.
    expect(finished.draft).toMatchObject({ completed: false, highestRung: 2, effort: 'too_hard', notes: 'grip went on rung two' })
    expect(finished.draft?.movements['burpee-row']).toEqual({ amount: '', weight: '10' })
    second.unmount()

    clock.advance(30)
    const third = mountLadder({ storage, clock, mintId })
    expect(third.result.current.attempt).toEqual(finished)
    expect(viewOf(third.result.current, clock)).toMatchObject({
      clock: { phase: 'finished', elapsedSeconds: 200 },
      lifecycle: 'ended',
      ended: true,
      canTrack: false,
      outcome: { highestRung: 2 },
      undo: { available: true },
    })

    // One key, one versioned record carrying its identity; the For Time key is untouched.
    expect(storage.keys()).toEqual([WORKOUT_LADDER_STORAGE_KEY])
    expect(Object.keys(storedLadders(storage))).toEqual([BLOCK])
    expect(storedLadders(storage)[BLOCK]).toEqual(finished)
    expect(readLadderAttempt(storage, SESSION, BLOCK)).toEqual(finished)
  })

  it('AC-381E586395ED a stale snapshot never attaches to another workout, block or attempt, and an unreadable or unknown-version record restores nothing', () => {
    const clock = fakeClock()
    const input = { sessionId: SESSION, blockId: BLOCK, capSeconds: CAP, rungCount: RUNGS, mintId: () => 'attempt-new' }
    const mine = startLadderAttempt(createLadderAttempt({ sessionId: SESSION, blockId: BLOCK, capSeconds: CAP, mintId: () => 'attempt-1' }), clock.now())

    // Another workout's record under this block's id: discarded, never read as ours.
    const storage = memoryStorage()
    const foreign = startLadderAttempt(createLadderAttempt({ sessionId: 'session-old', blockId: BLOCK, capSeconds: 900, mintId: () => 'attempt-old' }), clock.now())
    expect(writeLadderAttempt(storage, foreign)).toBe('written')
    expect(readLadderAttempt(storage, SESSION, BLOCK)).toBeNull()
    const restored = restoreLadderAttempt(storage, input)
    expect(restored).toMatchObject({ source: 'fresh', discarded: 'other-session' })
    expect(restored.attempt).toMatchObject({ identity: { sessionId: SESSION, blockId: BLOCK, attemptId: 'attempt-new' }, originalCapSeconds: CAP, progress: null })
    expect(restored.attempt.clock.startedAt).toBeNull()

    // Each of these is unreadable: filed under another block, another version,
    // no version, or a value the record cannot hold.
    const { version: _version, ...unversioned } = mine
    void _version
    const unreadable: Record<string, unknown>[] = [
      { ...mine, identity: { ...mine.identity, blockId: 'block-other' } },
      { ...mine, version: 2 },
      unversioned,
      { ...mine, identity: { ...mine.identity, attemptId: '' } },
      { ...mine, progress: -1 },
      { ...mine, originalCapSeconds: 0 },
      { ...mine, draft: { completed: null, highestRung: null, effort: 'hard', notes: '', movements: {} } },
      { ...mine, draft: { completed: null, highestRung: 1.5, effort: null, notes: '', movements: {} } },
      { ...mine, draft: { completed: null, highestRung: null, effort: null, notes: '', movements: { a: { amount: 4, weight: '' } } } },
      { ...mine, checkpoint: { pausedAt: null, progress: 'two', completed: null } },
      { ...mine, save: { status: 'saved', at: T0 } },
      { ...mine, endCarried: 'yes' },
      { ...mine, clock: { startedAt: 5, finishedAt: null } },
    ]
    for (const entry of unreadable) {
      const bad = memoryStorage()
      bad.setItem(WORKOUT_LADDER_STORAGE_KEY, JSON.stringify({ [BLOCK]: entry }))
      // An older For Time clock beside it is at least as stale, so it is not adopted either.
      writeForTimeState(bad, BLOCK, { startedAt: T0, finishedAt: null })
      expect(restoreLadderAttempt(bad, input), JSON.stringify(entry)).toMatchObject({ source: 'fresh', discarded: 'unreadable' })
      expect(readLadderAttempt(bad, SESSION, BLOCK)).toBeNull()
    }
    const garbage = memoryStorage()
    garbage.setItem(WORKOUT_LADDER_STORAGE_KEY, '{ not json')
    expect(restoreLadderAttempt(garbage, input)).toMatchObject({ source: 'fresh', discarded: null })

    // The same block in the same workout under another attempt: never replaced.
    // Two tabs open on one ladder; the second to Start adopts the first's attempt.
    const shared = memoryStorage()
    const tabA = mountLadder({ storage: shared, clock, mintId: mintIds('tab-a') })
    const tabB = mountLadder({ storage: shared, clock, mintId: mintIds('tab-b') })
    act(() => tabB.result.current.start())
    clock.advance(5)
    act(() => tabA.result.current.start())
    expect(storedLadders(shared)[BLOCK].identity.attemptId).toBe('tab-b-1')
    expect(storedLadders(shared)[BLOCK].clock.startedAt).toBe(T0)
    expect(tabA.result.current.attempt.identity.attemptId).toBe('tab-b-1')
    expect(writeLadderAttempt(shared, { ...mine, identity: { ...mine.identity, attemptId: 'tab-a-1' } })).toBe('refused')
    // Another block's entry, even one this build cannot read, is left as stored.
    shared.setItem(WORKOUT_LADDER_STORAGE_KEY, JSON.stringify({ ...storedLadders(shared), 'block-next': { version: 2, future: true } }))
    clock.advance(5)
    act(() => tabB.result.current.track(1))
    expect(JSON.parse(shared.raw(WORKOUT_LADDER_STORAGE_KEY) ?? '{}')['block-next']).toEqual({ version: 2, future: true })

    // Storage that refuses everything: the attempt still works in memory and says it is not durable.
    const hostile = mountLadder({ storage: hostileStorage(), clock })
    act(() => hostile.result.current.start())
    expect(hostile.result.current.attempt.clock.startedAt).toBe(new Date(clock.now()).toISOString())
    expect(hostile.result.current.durable).toBe(false)
    expect(writeLadderAttempt(null, mine)).toBe('unavailable')
  })

  it('AC-381E586395ED a ladder clock already in a browser under the For Time key is adopted once — running, paused or finished — and older records keep restoring exactly as before', () => {
    const clock = fakeClock()
    clock.advance(100)
    const input = { sessionId: SESSION, blockId: BLOCK, capSeconds: CAP, rungCount: RUNGS, mintId: () => 'attempt-adopted' }

    // Running: the shape every raced ladder has stored since EXE-04b.
    const storage = memoryStorage()
    const running = { startedAt: T0, finishedAt: null }
    writeForTimeState(storage, BLOCK, running)
    const forTimeRaw = storage.raw(WORKOUT_FOR_TIME_STORAGE_KEY)
    expect(restoreLadderAttempt(storage, input)).toMatchObject({
      source: 'legacy-clock',
      discarded: null,
      attempt: {
        version: 1,
        identity: { sessionId: SESSION, blockId: BLOCK, attemptId: 'attempt-adopted' },
        originalCapSeconds: CAP,
        clock: running,
        progress: null,
        draft: null,
        checkpoint: null,
        endCarried: false,
        save: { status: 'unsaved' },
      },
    })

    // The hook adopts it once, under a stable attempt id, and reads it back as its own.
    const first = mountLadder({ storage, clock, mintId: mintIds('adopt') })
    expect(first.result.current.source).toBe('legacy-clock')
    expect(viewOf(first.result.current, clock).clock).toMatchObject({ phase: 'running', elapsedSeconds: 100 })
    expect(storedLadders(storage)[BLOCK].identity.attemptId).toBe('adopt-1')
    first.unmount()
    const again = mountLadder({ storage, clock, mintId: mintIds('other') })
    expect(again.result.current.source).toBe('stored')
    expect(again.result.current.attempt.identity.attemptId).toBe('adopt-1')
    // The For Time record is left exactly as it was, and still reads as before.
    expect(storage.raw(WORKOUT_FOR_TIME_STORAGE_KEY)).toBe(forTimeRaw)
    expect(readForTimeState(storage, BLOCK)).toEqual(running)

    // Paused: comes back paused at the same moment, however long it was closed.
    const paused = memoryStorage()
    writeForTimeState(paused, BLOCK, { startedAt: T0, finishedAt: null, pausedAt: at(60) })
    clock.advance(3600)
    const pausedAttempt = restoreLadderAttempt(paused, input).attempt
    expect(pausedAttempt.clock).toEqual({ startedAt: T0, finishedAt: null, pausedAt: at(60) })
    expect(ladderClockView(pausedAttempt, clock.now())).toMatchObject({ phase: 'paused', elapsedSeconds: 60, remainingSeconds: CAP - 60 })

    // Finished: it keeps its time, and has no checkpoint, so it cannot be undone;
    // a For Time answer stored beside the clock is not the ladder's.
    const finished = memoryStorage()
    writeForTimeState(finished, BLOCK, { startedAt: T0, finishedAt: at(200), workCompleted: true })
    const finishedAttempt = restoreLadderAttempt(finished, input).attempt
    expect(finishedAttempt.clock).toEqual({ startedAt: T0, finishedAt: at(200) })
    expect(ladderClockView(finishedAttempt, clock.now())).toMatchObject({ phase: 'finished', elapsedSeconds: 200 })
    expect(ladderUndoAvailability(finishedAttempt, clock.now())).toEqual({ available: false, reason: 'not-finished' })

    // A clock never started carries nothing to adopt.
    const unstarted = memoryStorage()
    writeForTimeState(unstarted, BLOCK, { startedAt: null, finishedAt: null })
    expect(restoreLadderAttempt(unstarted, input)).toMatchObject({ source: 'fresh', discarded: null })

    // A ladder record wins over an older clock under the For Time key.
    const both = memoryStorage()
    writeForTimeState(both, BLOCK, { startedAt: at(-500), finishedAt: null })
    const own = startLadderAttempt(createLadderAttempt({ sessionId: SESSION, blockId: BLOCK, capSeconds: CAP, mintId: () => 'own' }), Date.parse(T0))
    writeLadderAttempt(both, own)
    expect(restoreLadderAttempt(both, input)).toMatchObject({ source: 'stored', attempt: { identity: { attemptId: 'own' }, clock: { startedAt: T0 } } })

    // The session's end drops the ladder record with every other key.
    clearWorkoutShellState(storage)
    expect(storage.keys()).toEqual([])
  })

  it('AC-406D2CE971AA close and reopen while running counts the time away, while paused counts none, and Resume keeps the original cap and the window left', () => {
    const storage = memoryStorage()
    const clock = fakeClock()
    const mintId = mintIds()

    const first = mountLadder({ storage, clock, mintId })
    act(() => first.result.current.start())
    clock.advance(100)
    first.unmount()
    clock.advance(200) // closed while the clock ran
    const second = mountLadder({ storage, clock, mintId })
    expect(viewOf(second.result.current, clock).clock).toMatchObject({ phase: 'running', elapsedSeconds: 300, remainingSeconds: 120 })

    act(() => second.result.current.pause())
    expect(second.result.current.attempt.clock.pausedAt).toBe(at(300))
    second.unmount()
    clock.advance(7200) // two hours closed while paused

    // The block now reads a longer cap, and then none: the attempt keeps its original one.
    const longer = mountLadder({ storage, clock, mintId, capSeconds: 600 })
    expect(longer.result.current.attempt.originalCapSeconds).toBe(CAP)
    expect(viewOf(longer.result.current, clock).clock).toMatchObject({ phase: 'paused', elapsedSeconds: 300, remainingSeconds: 120, capSeconds: CAP })
    longer.unmount()
    const third = mountLadder({ storage, clock, mintId, capSeconds: null })
    expect(third.result.current.attempt.originalCapSeconds).toBe(CAP)
    expect(viewOf(third.result.current, clock)).toMatchObject({ lifecycle: 'paused', canTrack: true, clock: { elapsedSeconds: 300 } })

    act(() => third.result.current.resume())
    expect(third.result.current.attempt.clock).toEqual({ startedAt: at(7200), finishedAt: null })
    expect(viewOf(third.result.current, clock).clock).toMatchObject({ phase: 'running', elapsedSeconds: 300, remainingSeconds: 120 })
    clock.advance(60)
    expect(viewOf(third.result.current, clock).clock).toMatchObject({ phase: 'running', elapsedSeconds: 360, remainingSeconds: 60 })
    clock.advance(60)
    expect(viewOf(third.result.current, clock).clock).toMatchObject({ phase: 'capped', elapsedSeconds: CAP, remainingSeconds: 0, completedUnderCap: false })

    // The cap a raced ladder is created against is the route clock's own reading.
    const legacy = { repScheme: 'ladder_up', ladderTiming: null, timerSeconds: CAP } as const
    expect(ladderRaceCapSeconds(legacy)).toBe(CAP)
    expect(ladderRaceCapSeconds({ ...legacy, timerSeconds: 419.6 })).toBe(419)
    expect(ladderRaceCapSeconds({ ...legacy, timerSeconds: null })).toBeNull()
    expect(ladderRaceCapSeconds({ ...legacy, timerSeconds: 600, ladderTiming: { mode: 'for_time', rounds: 4, interval_seconds: null, cap_seconds: null } })).toBe(600)
    expect(ladderRaceCapSeconds({ ...legacy, timerSeconds: 900, ladderTiming: { mode: 'capped_window', rounds: 12, interval_seconds: null, cap_seconds: CAP } })).toBe(CAP)
    expect(ladderRaceCapSeconds({ ...legacy, timerSeconds: 300, ladderTiming: { mode: 'scheduled_starts', rounds: 5, interval_seconds: 60, cap_seconds: null } })).toBeNull()
  })

  it('AC-406D2CE971AA a clock that reached its cap while closed comes back expired: no Pause, Resume, check-off or Finish, and tracked progress carries into the log once', () => {
    const storage = memoryStorage()
    const clock = fakeClock()
    const mintId = mintIds()

    const first = mountLadder({ storage, clock, mintId })
    act(() => first.result.current.start())
    clock.advance(100)
    for (const rung of [1, 2, 3]) act(() => first.result.current.track(rung))
    first.unmount()
    clock.advance(400) // the cap passed while the phone was locked

    const second = mountLadder({ storage, clock, mintId })
    const view = viewOf(second.result.current, clock)
    expect(view).toMatchObject({
      clock: { phase: 'capped', elapsedSeconds: CAP, remainingSeconds: 0 },
      lifecycle: 'ended',
      ended: true,
      canTrack: false,
      editable: true,
      progress: 3,
      // The cap ended it; three rungs were checked, so the log starts there (C36).
      draft: { completed: false, highestRung: 3 },
      outcome: { highestRung: 3 },
      undo: { available: false, reason: 'not-finished' },
    })
    for (const action of [
      () => second.result.current.pause(),
      () => second.result.current.resume(),
      () => second.result.current.finish(),
      () => second.result.current.track(4),
      () => second.result.current.start(),
      () => second.result.current.undoFinish(),
    ]) {
      expectNoWrite(storage, action)
    }

    // The athlete corrects the log; the carry is not applied again over it.
    act(() => second.result.current.editDraft({ highestRung: 2 }))
    expect(second.result.current.attempt).toMatchObject({ endCarried: true, draft: { completed: false, highestRung: 2 } })
    second.unmount()
    clock.advance(60)
    const third = mountLadder({ storage, clock, mintId })
    expect(viewOf(third.result.current, clock)).toMatchObject({ draft: { highestRung: 2 }, outcome: { highestRung: 2 } })

    // Every rung checked before the cap starts at Complete with the top rung.
    const all = memoryStorage()
    const full = mountLadder({ storage: all, clock, blockId: 'block-all' })
    act(() => full.result.current.start())
    for (const rung of [1, 2, 3, 4]) act(() => full.result.current.track(rung))
    clock.advance(CAP)
    expect(viewOf(full.result.current, clock)).toMatchObject({ draft: { completed: true, highestRung: 4 }, outcome: { highestRung: 4 } })

    // A paused clock does not run out, however long the phone is closed.
    const held = memoryStorage()
    const pausedLadder = mountLadder({ storage: held, clock, blockId: 'block-held' })
    act(() => pausedLadder.result.current.start())
    clock.advance(400)
    act(() => pausedLadder.result.current.pause())
    pausedLadder.unmount()
    clock.advance(3600)
    const back = mountLadder({ storage: held, clock, blockId: 'block-held' })
    expect(viewOf(back.result.current, clock)).toMatchObject({ clock: { phase: 'paused', elapsedSeconds: 400, remainingSeconds: 20 }, canTrack: true })
  })

  it('AC-406D2CE971AA Undo after Finish resumes as though Finish never happened: a running clock keeps the time spent finished, a paused one stays paused, progress and the draft come back, and the answer given to the ended attempt is undone', () => {
    const storage = memoryStorage()
    const clock = fakeClock()
    const mintId = mintIds()

    // Running at Finish.
    const first = mountLadder({ storage, clock, mintId })
    act(() => first.result.current.start())
    clock.advance(60)
    act(() => first.result.current.track(1))
    clock.advance(60)
    act(() => first.result.current.track(2))
    clock.advance(180)
    act(() => first.result.current.finish()) // accidental, at 05:00
    // The log corrects the rung and gains entries for the next one.
    act(() =>
      first.result.current.editDraft({
        highestRung: 3,
        effort: 'about_right',
        notes: 'tapped Finish by mistake',
        movements: { 'push-up-row': { amount: '4', weight: '' }, 'burpee-row': { amount: '2', weight: '10' } },
      }),
    )
    first.unmount()
    clock.advance(30)

    const second = mountLadder({ storage, clock, mintId })
    expect(viewOf(second.result.current, clock).undo).toEqual({ available: true })
    act(() => second.result.current.undoFinish())
    const undone = second.result.current.attempt
    // The same start, no finish, no pause: 30 s spent finished counted, nothing granted.
    expect(undone.clock).toEqual({ startedAt: T0, finishedAt: null })
    expect(undone.checkpoint).toBeNull()
    expect(undone.progress).toBe(3)
    expect(undone.draft).toEqual({
      completed: null,
      highestRung: 3,
      effort: 'about_right',
      notes: 'tapped Finish by mistake',
      movements: { 'push-up-row': { amount: '4', weight: '' }, 'burpee-row': { amount: '2', weight: '10' } },
    })
    expect(viewOf(second.result.current, clock)).toMatchObject({
      clock: { phase: 'running', elapsedSeconds: 330, remainingSeconds: 90 },
      lifecycle: 'running',
      canTrack: true,
      outcome: {},
      undo: { available: false, reason: 'not-finished' },
    })
    second.unmount()

    // Reopened after Undo it is still live; Finish again at the same rung keeps the entries.
    clock.advance(10)
    const third = mountLadder({ storage, clock, mintId })
    expect(viewOf(third.result.current, clock).clock).toMatchObject({ phase: 'running', elapsedSeconds: 340 })
    act(() => third.result.current.finish())
    expect(third.result.current.attempt.draft).toMatchObject({
      completed: false,
      highestRung: 3,
      movements: { 'push-up-row': { amount: '4', weight: '' }, 'burpee-row': { amount: '2', weight: '10' } },
    })
    // A different rung moves the partial round: amounts cleared, loads kept (TASK-030's rule).
    act(() => third.result.current.editDraft({ highestRung: 1 }))
    expect(third.result.current.attempt.draft?.movements).toEqual({
      'push-up-row': { amount: '', weight: '' },
      'burpee-row': { amount: '', weight: '10' },
    })

    // Paused at Finish, with the athlete's own answer given before it.
    const held = memoryStorage()
    const pausedLadder = mountLadder({ storage: held, clock, blockId: 'block-held', mintId: mintIds('held') })
    const start = clock.elapsed()
    act(() => pausedLadder.result.current.start())
    act(() => pausedLadder.result.current.editDraft({ completed: false, highestRung: 1 }))
    clock.advance(200)
    act(() => pausedLadder.result.current.pause())
    clock.advance(60)
    act(() => pausedLadder.result.current.finish())
    // Finishing a paused attempt freezes it at the pause, not at the later tap.
    expect(pausedLadder.result.current.attempt.clock).toEqual({ startedAt: at(start), finishedAt: at(start + 200) })
    expect(pausedLadder.result.current.attempt.checkpoint).toEqual({ pausedAt: at(start + 200), progress: null, completed: false })
    act(() => pausedLadder.result.current.editDraft({ completed: true }))
    pausedLadder.unmount()
    clock.advance(3600)

    const back = mountLadder({ storage: held, clock, blockId: 'block-held' })
    expect(viewOf(back.result.current, clock).undo).toEqual({ available: true })
    act(() => back.result.current.undoFinish())
    expect(back.result.current.attempt.clock).toEqual({ startedAt: at(start), finishedAt: null, pausedAt: at(start + 200) })
    // Complete chose the top rung, so live progress is every rung; the answer is the pre-Finish one.
    expect(back.result.current.attempt.progress).toBe(RUNGS)
    expect(back.result.current.attempt.draft).toMatchObject({ completed: false })
    expect(viewOf(back.result.current, clock).clock).toMatchObject({ phase: 'paused', elapsedSeconds: 200, remainingSeconds: CAP - 200 })
    clock.advance(10)
    act(() => back.result.current.resume())
    clock.advance(20)
    expect(viewOf(back.result.current, clock).clock).toMatchObject({ phase: 'running', elapsedSeconds: 220 })

    // The two contract rules the draft applies are TASK-030's own, restated so the
    // route bundle does not carry the contract's tables: pinned equal here.
    const entries = { a: { amount: '4', weight: '' }, b: { amount: '', weight: '10' }, c: { amount: '0', weight: '0' } }
    for (let rungCount = 0; rungCount <= 6; rungCount += 1) {
      for (const highestRung of [null, ...Array.from({ length: rungCount + 2 }, (_, rung) => rung)]) {
        const outcome = highestRung === null ? {} : { highestRung }
        expect(recovery.ladderPartialRound(highestRung, rungCount), `${highestRung}/${rungCount}`).toBe(
          partialRoundFor({ family: 'ladder', outcome, rungCount }),
        )
      }
    }
    for (const [from, to] of [[null, null], [null, 2], [2, 2], [2, 3], [3, null]] as const) {
      expect(recovery.movementsAfterRoundChange(entries, from, to), `${from}→${to}`).toEqual(draftsAfterProgressChange(entries, from, to))
    }
  })

  it('AC-406D2CE971AA Undo is unavailable once the original cap has passed, and an accidental Finish keeps its time instead of resuming past the cap', () => {
    const storage = memoryStorage()
    const clock = fakeClock()
    const mintId = mintIds()

    const ladder = mountLadder({ storage, clock, mintId })
    act(() => ladder.result.current.start())
    clock.advance(100)
    act(() => ladder.result.current.track(2))
    clock.advance(200)
    act(() => ladder.result.current.finish()) // at 05:00 of 07:00
    act(() => ladder.result.current.editDraft({ effort: 'too_easy' }))

    clock.advance(119) // 06:59 on the clock it would resume
    expect(viewOf(ladder.result.current, clock).undo).toEqual({ available: true })
    clock.advance(1) // 07:00: the original cap
    expect(viewOf(ladder.result.current, clock).undo).toEqual({ available: false, reason: 'expired' })
    expectNoWrite(storage, () => ladder.result.current.undoFinish())
    expect(viewOf(ladder.result.current, clock)).toMatchObject({
      clock: { phase: 'finished', elapsedSeconds: 300 },
      draft: { completed: false, highestRung: 2, effort: 'too_easy' },
      outcome: { highestRung: 2 },
      editable: true,
    })
    ladder.unmount()

    // A block that now reads a longer cap does not reopen the window.
    const longer = mountLadder({ storage, clock, mintId, capSeconds: 900 })
    expect(viewOf(longer.result.current, clock).undo).toEqual({ available: false, reason: 'expired' })
    expectNoWrite(storage, () => longer.result.current.undoFinish())

    // Finish after the cap is not a Finish: the cap already ended the attempt.
    const late = memoryStorage()
    const capped = mountLadder({ storage: late, clock, blockId: 'block-late' })
    act(() => capped.result.current.start())
    clock.advance(CAP + 30)
    expectNoWrite(late, () => capped.result.current.finish())
    expect(viewOf(capped.result.current, clock)).toMatchObject({ clock: { phase: 'capped' }, undo: { available: false, reason: 'not-finished' } })
  })

  it('AC-406D2CE971AA a failed save keeps the draft and Undo for the retry; a successful save removes Undo, freezes the draft and the clock and survives a reload; a row the server reports is authoritative over any local draft', () => {
    const storage = memoryStorage()
    const clock = fakeClock()
    const mintId = mintIds()

    const ladder = mountLadder({ storage, clock, mintId })
    act(() => ladder.result.current.start())
    clock.advance(120)
    act(() => ladder.result.current.track(2))
    act(() => ladder.result.current.finish())
    act(() => ladder.result.current.editDraft({ effort: 'too_hard', notes: 'retry me' }))
    const beforeSave = ladder.result.current.attempt

    act(() => ladder.result.current.saveFailed())
    expect(ladder.result.current.attempt).toEqual({ ...beforeSave, save: { status: 'failed', at: at(120) } })
    expect(viewOf(ladder.result.current, clock)).toMatchObject({ saveFailed: true, editable: true, undo: { available: true }, outcome: { highestRung: 2 } })
    ladder.unmount()

    clock.advance(20)
    const reopened = mountLadder({ storage, clock, mintId })
    expect(reopened.result.current.attempt).toEqual({ ...beforeSave, save: { status: 'failed', at: at(120) } })
    // An answer for another attempt changes nothing.
    expectNoWrite(storage, () => reopened.result.current.saveSucceeded('attempt-stale'))
    act(() => reopened.result.current.saveSucceeded())
    expect(reopened.result.current.attempt).toMatchObject({ checkpoint: null, save: { status: 'saved', at: at(140), source: 'save' } })
    expect(viewOf(reopened.result.current, clock)).toMatchObject({
      authority: 'saved-here',
      lifecycle: 'ended',
      editable: false,
      canTrack: false,
      draft: { completed: false, highestRung: 2, effort: 'too_hard', notes: 'retry me' },
      outcome: { highestRung: 2 },
      undo: { available: false, reason: 'saved' },
    })
    for (const action of [
      () => reopened.result.current.undoFinish(),
      () => reopened.result.current.editDraft({ highestRung: 4 }),
      () => reopened.result.current.track(3),
      () => reopened.result.current.resume(),
      () => reopened.result.current.saveFailed(),
    ]) {
      expectNoWrite(storage, action)
    }
    reopened.unmount()
    clock.advance(600)
    const later = mountLadder({ storage, clock, mintId })
    expect(viewOf(later.result.current, clock)).toMatchObject({ authority: 'saved-here', undo: { available: false, reason: 'saved' }, clock: { phase: 'finished', elapsedSeconds: 120 } })

    // Saved mid-race (the section's forward action while racing): the clock stops at the save.
    const mid = memoryStorage()
    const racing = mountLadder({ storage: mid, clock, blockId: 'block-mid' })
    const start = clock.elapsed()
    act(() => racing.result.current.start())
    clock.advance(100)
    act(() => racing.result.current.saveSucceeded())
    racing.unmount()
    clock.advance(900)
    const after = mountLadder({ storage: mid, clock, blockId: 'block-mid' })
    expect(after.result.current.attempt.clock).toEqual({ startedAt: at(start), finishedAt: at(start + 100) })
    expect(viewOf(after.result.current, clock)).toMatchObject({ clock: { phase: 'finished', elapsedSeconds: 100 }, lifecycle: 'ended' })

    // The server has a row this device never saw saved: no local draft is offered over it.
    const elsewhere = memoryStorage()
    const other = mountLadder({ storage: elsewhere, clock, blockId: 'block-elsewhere' })
    act(() => other.result.current.start())
    clock.advance(60)
    act(() => other.result.current.track(1))
    act(() => other.result.current.finish())
    other.rerender({ recorded: true })
    expect(other.result.current.attempt.save).toMatchObject({ status: 'saved', source: 'server' })
    expect(viewOf(other.result.current, clock, true)).toMatchObject({
      authority: 'saved-elsewhere',
      draft: null,
      outcome: {},
      editable: false,
      undo: { available: false, reason: 'saved' },
    })
    other.unmount()
    // Reopened offline (no server word yet), it stays closed.
    const offline = mountLadder({ storage: elsewhere, clock, blockId: 'block-elsewhere' })
    expect(viewOf(offline.result.current, clock, false)).toMatchObject({ authority: 'saved-elsewhere', undo: { available: false, reason: 'saved' } })
    expectNoWrite(elsewhere, () => offline.result.current.undoFinish())

    // The draft maps to the ladder's existing row only: null is not zero, Complete is the top rung.
    expect(ladderDraftOutcome(null, RUNGS)).toEqual({})
    expect(ladderDraftOutcome({ ...recovery.EMPTY_LADDER_DRAFT, highestRung: 2 }, RUNGS)).toEqual({})
    expect(ladderDraftOutcome({ ...recovery.EMPTY_LADDER_DRAFT, completed: false }, RUNGS)).toEqual({})
    expect(ladderDraftOutcome({ ...recovery.EMPTY_LADDER_DRAFT, completed: false, highestRung: 0 }, RUNGS)).toEqual({ highestRung: 0 })
    expect(ladderDraftOutcome({ ...recovery.EMPTY_LADDER_DRAFT, completed: true, highestRung: 1, effort: 'too_hard', notes: 'x' }, RUNGS)).toEqual({ highestRung: RUNGS })
    expect(ladderDraftOutcome({ ...recovery.EMPTY_LADDER_DRAFT, completed: true }, 0)).toEqual({})
  })

  it(
    'AC-406D2CE971AA through the shell’s one block writer: a refused save writes nothing, the retry after a reload writes the durable draft exactly once, and an answer lost in transit is read back as saved with no duplicate row',
    async () => {
      // ── A refused save, a reload, a retry ──
      const double = createLoggingDouble({ snapshot: ladderSnapshot() })
      const storage = memoryStorage()
      const clock = fakeClock()

      let shell = mountShell(double.fetch, storage, clock)
      await waitFor(() => expect(performedReads(double).length).toBeGreaterThan(0))
      act(() => shell.current().ladder.start())
      clock.advance(60)
      act(() => shell.current().ladder.track(1))
      act(() => shell.current().ladder.track(2))
      clock.advance(60)
      act(() => shell.current().ladder.track(3))
      clock.advance(120)
      act(() => shell.current().ladder.finish())
      act(() => shell.current().ladder.editDraft({ effort: 'too_hard', notes: 'rung four never came' }))
      expect(shell.current().view.outcome).toEqual({ highestRung: 3 })

      double.refuseNext('/block_results', 503)
      let result: Result<undefined> | undefined
      await act(async () => {
        result = await shell.current().save()
      })
      expect(result !== undefined && isErr(result)).toBe(true)
      expect(double.blockResults()).toEqual([])
      expect(readLadderAttempt(storage, SNAPSHOT_SESSION_ID, shell.block.blockId)).toMatchObject({
        save: { status: 'failed' },
        draft: { completed: false, highestRung: 3, effort: 'too_hard', notes: 'rung four never came' },
        checkpoint: { progress: 3 },
      })
      expect(shell.current().view.undo).toEqual({ available: true })
      shell.unmount() // reload

      clock.advance(30)
      const readsBefore = performedReads(double).length
      shell = mountShell(double.fetch, storage, clock)
      await waitFor(() => expect(performedReads(double).length).toBeGreaterThan(readsBefore))
      expect(shell.current().ladder.source).toBe('stored')
      expect(shell.current().view).toMatchObject({
        authority: 'draft',
        saveFailed: true,
        draft: { highestRung: 3, effort: 'too_hard' },
        outcome: { highestRung: 3 },
        undo: { available: true },
      })
      await act(async () => {
        result = await shell.current().save()
      })
      expect(result).toEqual(ok(undefined))
      // Exactly one row, from the durable draft; effort and notes have no ladder writer yet.
      expect(double.blockResults()).toHaveLength(1)
      expect(double.blockResults()[0]).toMatchObject({ block_id: shell.block.blockId, highest_rung: 3, perceived_effort: null, notes: null })
      expect(shell.current().view).toMatchObject({ authority: 'saved-here', editable: false, undo: { available: false, reason: 'saved' } })
      const sent = posts(double).length
      expect(sent).toBe(2) // the refused one and the one that landed
      await act(async () => {
        result = await shell.current().save()
      })
      expect(posts(double)).toHaveLength(sent)
      expect(double.blockResults()).toHaveLength(1)
      shell.unmount()

      // ── An answer lost in transit ──
      const lost = createLoggingDouble({ snapshot: ladderSnapshot() })
      let dropNext = true
      const lossy: typeof globalThis.fetch = async (input, init) => {
        const response = await lost.fetch(input, init)
        if (dropNext && init?.method === 'POST' && new URL(String(input)).pathname.endsWith('/block_results')) {
          dropNext = false
          throw new TypeError('Failed to fetch')
        }
        return response
      }
      const lostStorage = memoryStorage()
      let device = mountShell(lossy, lostStorage, clock)
      await waitFor(() => expect(performedReads(lost).length).toBeGreaterThan(0))
      act(() => device.current().ladder.start())
      clock.advance(90)
      act(() => device.current().ladder.track(2))
      act(() => device.current().ladder.finish())
      await act(async () => {
        result = await device.current().save()
      })
      expect(result !== undefined && isErr(result)).toBe(true)
      // The row landed even though the answer never came back.
      expect(lost.blockResults()).toHaveLength(1)
      expect(readLadderAttempt(lostStorage, SNAPSHOT_SESSION_ID, device.block.blockId)?.save.status).toBe('failed')
      device.unmount() // reconnect: reload once the network is back

      device = mountShell(lossy, lostStorage, clock)
      await waitFor(() => expect(device.current().view.authority).toBe('saved-elsewhere'))
      expect(readLadderAttempt(lostStorage, SNAPSHOT_SESSION_ID, device.block.blockId)?.save).toMatchObject({ status: 'saved', source: 'server' })
      expect(device.current().view).toMatchObject({ draft: null, editable: false, undo: { available: false, reason: 'saved' } })
      const before = posts(lost).length
      await act(async () => {
        result = await device.current().save()
      })
      expect(result).toEqual(ok(undefined))
      expect(posts(lost)).toHaveLength(before)
      expect(lost.blockResults()).toHaveLength(1)
      device.unmount()
    },
    WRITER_TIMEOUT_MS,
  )

  it('AC-A168ED4B8418 exposes the state and recovery interfaces TASK-013, TASK-014, TASK-046 and TASK-048 consume, documented with each task’s obligation, and claims no JOURNEY-032 completion', () => {
    const interfaces: Record<string, { module: Record<string, unknown>; names: readonly string[] }> = {
      'src/state/ladder-recovery.ts': {
        module: recovery,
        names: [
          'LADDER_ATTEMPT_VERSION', 'EMPTY_LADDER_DRAFT', 'normalizedCapSeconds', 'ladderRaceCapSeconds',
          'createLadderAttempt', 'adoptLegacyLadderClock', 'clampLadderAttempt', 'ladderPartialRound',
          'movementsAfterRoundChange', 'ladderClockView',
          'ladderAttemptView', 'ladderUndoAvailability', 'ladderDraftOutcome', 'startLadderAttempt',
          'pauseLadderAttempt', 'resumeLadderAttempt', 'trackLadderProgress', 'finishLadderAttempt',
          'undoLadderFinish', 'editLadderDraft', 'ladderSaveSucceeded', 'ladderSaveFailed', 'ladderRecorded',
        ],
      },
      'src/state/workout-persistence.ts': {
        module: persistence,
        names: [
          'WORKOUT_LADDER_STORAGE_KEY', 'isLadderAttempt', 'readLadderAttempt', 'writeLadderAttempt',
          'restoreLadderAttempt', 'usePersistedLadder',
        ],
      },
    }

    const readme = read('src/state/README.md')
    const start = readme.indexOf('## Ladder attempt recovery (TASK-032)')
    expect(start).toBeGreaterThan(-1)
    const next = readme.indexOf('\n## ', start + 1)
    const section = readme.slice(start, next === -1 ? undefined : next)

    for (const [path, { module, names }] of Object.entries(interfaces)) {
      expect(section, path).toContain(`\`${path}\``)
      for (const name of names) {
        expect(module[name], `${path} ${name}`).toBeDefined()
        expect(section, name).toContain(`\`${name}\``)
      }
    }
    // Each consumer has its own row, with what it must do.
    const rows = section.split('\n').filter((line) => line.startsWith('| '))
    for (const task of ['TASK-013', 'TASK-014', 'TASK-046', 'TASK-048']) {
      const row = rows.find((line) => line.startsWith(`| ${task} `))
      expect(row, task).toBeDefined()
      expect((row ?? '').split('|').filter((cell) => cell.trim() !== '').length, task).toBeGreaterThanOrEqual(3)
    }
    // A foundation, not the journey.
    expect(section).toMatch(/JOURNEY-032 is not complete/)
    expect(section).toContain('clear.workout-ladders')

    // TASK-030's contract records the path as landed, under its real name.
    const path = PROPOSED_PATHS.find((candidate) => candidate.id === 'ladder-durable-draft')
    expect(path).toMatchObject({ owner: 'TASK-032', ref: { module: 'src/state/workout-persistence.ts', name: 'usePersistedLadder' } })
    expect(path?.ref?.proposedBy).toBeUndefined()
    expect(path?.ref?.extendedBy).toBeUndefined()
    expect(read('docs/specs/LOGGING_FIELD_CONTRACT.md')).toMatch(/`ladder-durable-draft`[^\n]*`usePersistedLadder`/)
  })
})
