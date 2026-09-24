/**
 * EXE-01 — the small amount of shell state that is *not* in the database, and
 * the rule that keeps it small.
 *
 * Everything that matters about a workout is already persisted: the session
 * row carries `started_at`, the prescriptions carry their execution status,
 * the set logs are written as they happen (EXE-02) and `block_results` is
 * written at block completion. Closing the tab loses none of it, which is why
 * the requirement can say the trap is on in-app navigation and not on the
 * user — and why there is no `beforeunload` handler anywhere in this feature.
 * Asking "are you sure you want to leave?" would be the app protecting state
 * it has already saved, at the cost of the one exit the user is entitled to.
 *
 * What is left is where they were *looking*: which section the shell had open.
 * The database cannot answer that — section four being untouched does not mean
 * the user had not scrolled to it — so it is written to `localStorage`, keyed
 * by session id, and restored when the same session is re-entered. It is a
 * convenience, and it is treated like one: an unreadable, unparsable or
 * foreign-session record is simply ignored, and the shell falls back to the
 * first unfinished section derived from the rows.
 *
 * EXE-03 adds two more conveniences one level down: a circuit's current round
 * and position and an EMOM's running clock are not in the rows either. Each is
 * kept under its own key because different components write them at different
 * moments; merging them into the shell record would make independent
 * read-modify-write cycles lose one another. All three records are dropped
 * together when the session ends. Block ids are per-session, so each record can
 * only be read back by the block that wrote it.
 *
 * EXE-04b adds the third, under a third key, by the same argument one structure
 * across: a For Time block's clock. When the user *started racing* is not in the
 * rows either — the session's `started_at` is the whole workout, not this block —
 * and it has to survive a refresh, because the elapsed time is the score.
 *
 * EXE-04c adds the third key on the same argument one level further: an AMRAP's
 * score — when its window opened, the rounds banked, the partial round at the
 * buzzer — is nowhere in the rows until the block is completed, and the user is
 * entitled to walk to the next section and back without losing it.
 *
 * No zod here. CORE-03's rule is that every payload crossing a *process*
 * boundary is parsed in `schemas.ts`; this crosses no process, and its own
 * previous write is the only thing that produces it. A hand-written guard is
 * the honest size of the problem.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import type { AmrapState } from './amrap'
import type { CircuitState } from './circuit'
import type { EmomState } from './emom'
import type { ForTimeState } from './for-time'

/** One key, overwritten: the app has one session in progress at a time. */
export const WORKOUT_SHELL_STORAGE_KEY = 'clear.workout-shell'

/** The circuits' key: one record per block id, for the session in progress. */
export const WORKOUT_CIRCUIT_STORAGE_KEY = 'clear.workout-circuits'
/** The EMOMs' key: one record per block id, for the session in progress. */
export const WORKOUT_EMOM_STORAGE_KEY = 'clear.workout-emom'

/** The For Time blocks' key: one clock per block id (EXE-04b). */
export const WORKOUT_FOR_TIME_STORAGE_KEY = 'clear.workout-for-time'

/** The AMRAPs' key: one score per block id, on the same terms as the circuits'. */
export const WORKOUT_AMRAP_STORAGE_KEY = 'clear.workout-amraps'

export interface WorkoutShellState {
  readonly sessionId: string
  /** The section index the shell had open. */
  readonly sectionIndex: number
  /** When it was written, so a stale record is legible in a bug report. */
  readonly updatedAt: string
}

/** The subset of `Storage` this module uses; injectable, so a test owns it. */
export interface ShellStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/**
 * `localStorage`, or nothing. Safari in private mode throws on access, and an
 * app that cannot remember which section was open is still a working app.
 */
export function defaultShellStorage(): ShellStorage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

function isShellState(value: unknown): value is WorkoutShellState {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>

  return (
    typeof record.sessionId === 'string' &&
    record.sessionId !== '' &&
    typeof record.sectionIndex === 'number' &&
    Number.isInteger(record.sectionIndex) &&
    record.sectionIndex >= 0 &&
    typeof record.updatedAt === 'string'
  )
}

/** The stored record, or null — for absent, unreadable and malformed alike. */
export function readWorkoutShellState(
  storage: ShellStorage | null,
): WorkoutShellState | null {
  if (storage === null) return null

  let raw: string | null
  try {
    raw = storage.getItem(WORKOUT_SHELL_STORAGE_KEY)
  } catch {
    return null
  }
  if (raw === null) return null

  try {
    const parsed: unknown = JSON.parse(raw)
    return isShellState(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function writeWorkoutShellState(
  storage: ShellStorage | null,
  state: WorkoutShellState,
): void {
  if (storage === null) return
  try {
    storage.setItem(WORKOUT_SHELL_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // A full or refused quota loses a convenience, never a workout.
  }
}

/**
 * Forgets everything the shell remembered locally — the open section and every
 * block's position, clock, or score. Completing and abandoning both call it
 * and clear every key because an ended session has nowhere to return to.
 */
export function clearWorkoutShellState(storage: ShellStorage | null): void {
  if (storage === null) return
  try {
    storage.removeItem(WORKOUT_SHELL_STORAGE_KEY)
    storage.removeItem(WORKOUT_CIRCUIT_STORAGE_KEY)
    storage.removeItem(WORKOUT_EMOM_STORAGE_KEY)
    storage.removeItem(WORKOUT_FOR_TIME_STORAGE_KEY)
    storage.removeItem(WORKOUT_AMRAP_STORAGE_KEY)
  } catch {
    // Nothing to recover: the next read discards a record it cannot use.
  }
}

/** The stored index for this session, or null when the record is another's. */
export function restoredSectionIndex(
  storage: ShellStorage | null,
  sessionId: string,
): number | null {
  const state = readWorkoutShellState(storage)
  return state !== null && state.sessionId === sessionId ? state.sectionIndex : null
}

export interface PersistedSection {
  readonly index: number
  setIndex(index: number): void
  /** Writes the current index now — what the shell does before it exits. */
  persist(): void
  /** Drops the record. Completing and abandoning both call it. */
  forget(): void
}

/**
 * The open section, persisted across a close, a background and a refresh.
 *
 * Written three times over, deliberately: on every change, when the page is
 * hidden, and when it is being unloaded via `pagehide`. The last two are what
 * make "backgrounding the phone persists state" true on iOS, where a tab can
 * be discarded without any further script running — `pagehide` is the last
 * event that is reliably delivered, and `visibilitychange` is the one that
 * fires when an app is merely swiped away.
 *
 * There is no `beforeunload` listener and there must never be one: it is the
 * only API here that could stop the user leaving, and leaving is allowed.
 */
export function usePersistedSection(
  sessionId: string,
  initialIndex: number,
  storage: ShellStorage | null = defaultShellStorage(),
  now: () => number = Date.now,
): PersistedSection {
  const [index, setIndexState] = useState(initialIndex)

  // Refs, so the hidden/pagehide listeners are registered once and still see
  // the latest values — re-subscribing on every index change would be a new
  // listener per tap of Next.
  const latest = useRef({ index, sessionId, storage, now })
  useEffect(() => {
    latest.current = { index, sessionId, storage, now }
  })

  const persist = useCallback(() => {
    const current = latest.current
    writeWorkoutShellState(current.storage, {
      sessionId: current.sessionId,
      sectionIndex: current.index,
      updatedAt: new Date(current.now()).toISOString(),
    })
  }, [])

  // On change. The common path, and the one a refresh depends on.
  useEffect(() => {
    persist()
  }, [index, persist])

  // On the way out. Neither listener cancels, blocks or prompts anything.
  useEffect(() => {
    const onHidden = () => {
      if (globalThis.document?.visibilityState === 'hidden') persist()
    }

    globalThis.addEventListener?.('visibilitychange', onHidden)
    globalThis.addEventListener?.('pagehide', persist)

    return () => {
      globalThis.removeEventListener?.('visibilitychange', onHidden)
      globalThis.removeEventListener?.('pagehide', persist)
    }
  }, [persist])

  const forget = useCallback(() => {
    clearWorkoutShellState(latest.current.storage)
  }, [])

  return { index, setIndex: setIndexState, persist, forget }
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-block records
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What a per-block key holds: one record per block id, for the session in
 * progress. Two structures keep one — EXE-03's circuit position and EXE-04b's
 * For Time clock — and they keep it the same way, so the guard is the only thing
 * that differs between them.
 */
type BlockRecords<T> = Record<string, T>

/** The stored map under one key, with any entry it cannot vouch for dropped. */
function readBlockRecords<T>(
  storage: ShellStorage | null,
  key: string,
  isRecord: (value: unknown) => value is T,
): BlockRecords<T> {
  if (storage === null) return {}

  let raw: string | null
  try {
    raw = storage.getItem(key)
  } catch {
    return {}
  }
  if (raw === null) return {}

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {}
  }
  if (typeof parsed !== 'object' || parsed === null) return {}

  const records: BlockRecords<T> = {}
  for (const [blockId, entry] of Object.entries(parsed as Record<string, unknown>)) {
    if (isRecord(entry)) records[blockId] = entry
  }
  return records
}

/**
 * Writes one block's record, leaving the other blocks in the session alone. A
 * session holds a handful of blocks and the whole map is dropped when it ends,
 * so read-modify-write is the right size for the problem.
 */
function writeBlockRecord<T>(
  storage: ShellStorage | null,
  key: string,
  isRecord: (value: unknown) => value is T,
  blockId: string,
  record: T,
): void {
  if (storage === null) return
  try {
    storage.setItem(
      key,
      JSON.stringify({ ...readBlockRecords(storage, key, isRecord), [blockId]: record }),
    )
  } catch {
    // A full or refused quota costs a position on a refresh, never a logged set.
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Circuits (EXE-03)
// ─────────────────────────────────────────────────────────────────────────────

/** Every circuit's place in its rounds, by block id. */
type CircuitRecords = BlockRecords<CircuitState>

function isCircuitState(value: unknown): value is CircuitState {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>

  return (
    typeof record.round === 'number' &&
    Number.isInteger(record.round) &&
    record.round >= 1 &&
    typeof record.position === 'number' &&
    Number.isInteger(record.position) &&
    record.position >= 1 &&
    (record.restStartedAt === null || typeof record.restStartedAt === 'string')
  )
}

/** The stored map, with any entry it cannot vouch for dropped. */
export function readCircuitStates(storage: ShellStorage | null): CircuitRecords {
  return readBlockRecords(storage, WORKOUT_CIRCUIT_STORAGE_KEY, isCircuitState)
}

/** One block's stored position, or null — for absent and unusable alike. */
export function readCircuitState(
  storage: ShellStorage | null,
  blockId: string,
): CircuitState | null {
  return readCircuitStates(storage)[blockId] ?? null
}

/** Writes one block's position, leaving the other circuits alone. */
export function writeCircuitState(
  storage: ShellStorage | null,
  blockId: string,
  state: CircuitState,
): void {
  writeBlockRecord(storage, WORKOUT_CIRCUIT_STORAGE_KEY, isCircuitState, blockId, state)
}

export interface PersistedCircuit {
  readonly state: CircuitState
  /** Moves the circuit and writes it in the same act. */
  advanceTo(next: CircuitState): void
}

/** A circuit's position, restored on mount and written on every tap. */
export function usePersistedCircuit(
  blockId: string,
  restore: (stored: CircuitState | null) => CircuitState,
  storage: ShellStorage | null = defaultShellStorage(),
): PersistedCircuit {
  const [state, setState] = useState(() => restore(readCircuitState(storage, blockId)))
  const latest = useRef(storage)
  useEffect(() => {
    latest.current = storage
  })

  const advanceTo = useCallback(
    (next: CircuitState) => {
      setState(next)
      writeCircuitState(latest.current, blockId, next)
    },
    [blockId],
  )

  return { state, advanceTo }
}

// ─────────────────────────────────────────────────────────────────────────────
// EMOMs (EXE-03)
// ─────────────────────────────────────────────────────────────────────────────

type EmomRecords = BlockRecords<EmomState>

function isEmomState(value: unknown): value is EmomState {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    (record.startedAt === null || typeof record.startedAt === 'string') &&
    (record.workDoneMinute === null ||
      (typeof record.workDoneMinute === 'number' && Number.isInteger(record.workDoneMinute)))
  )
}

export function readEmomStates(storage: ShellStorage | null): EmomRecords {
  return readBlockRecords(storage, WORKOUT_EMOM_STORAGE_KEY, isEmomState)
}

export function readEmomState(storage: ShellStorage | null, blockId: string): EmomState | null {
  return readEmomStates(storage)[blockId] ?? null
}

export function writeEmomState(storage: ShellStorage | null, blockId: string, state: EmomState): void {
  writeBlockRecord(storage, WORKOUT_EMOM_STORAGE_KEY, isEmomState, blockId, state)
}

export interface PersistedEmom { readonly state: EmomState; update(next: EmomState): void }

export function usePersistedEmom(
  blockId: string,
  restore: (stored: EmomState | null) => EmomState,
  storage: ShellStorage | null = defaultShellStorage(),
): PersistedEmom {
  const [state, setState] = useState(() => restore(readEmomState(storage, blockId)))
  const latest = useRef(storage)
  useEffect(() => { latest.current = storage })
  const update = useCallback((next: EmomState) => {
    setState(next)
    writeEmomState(latest.current, blockId, next)
  }, [blockId])
  return { state, update }
}

// ─────────────────────────────────────────────────────────────────────────────
// For Time (EXE-04b)
// ─────────────────────────────────────────────────────────────────────────────

type ForTimeRecords = BlockRecords<ForTimeState>

function isForTimeState(value: unknown): value is ForTimeState {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    (record.startedAt === null || typeof record.startedAt === 'string') &&
    (record.finishedAt === null || typeof record.finishedAt === 'string')
  )
}

export function readForTimeStates(storage: ShellStorage | null): ForTimeRecords {
  return readBlockRecords(storage, WORKOUT_FOR_TIME_STORAGE_KEY, isForTimeState)
}

export function readForTimeState(storage: ShellStorage | null, blockId: string): ForTimeState | null {
  return readForTimeStates(storage)[blockId] ?? null
}

export function writeForTimeState(storage: ShellStorage | null, blockId: string, state: ForTimeState): void {
  writeBlockRecord(storage, WORKOUT_FOR_TIME_STORAGE_KEY, isForTimeState, blockId, state)
}

export interface PersistedForTime { readonly state: ForTimeState; moveTo(next: ForTimeState): void }

export function usePersistedForTime(
  blockId: string,
  restore: (stored: ForTimeState | null) => ForTimeState,
  storage: ShellStorage | null = defaultShellStorage(),
): PersistedForTime {
  const [state, setState] = useState(() => restore(readForTimeState(storage, blockId)))
  const latest = useRef(storage)
  useEffect(() => { latest.current = storage })
  const moveTo = useCallback((next: ForTimeState) => {
    setState(next)
    writeForTimeState(latest.current, blockId, next)
  }, [blockId])
  return { state, moveTo }
}

// ─────────────────────────────────────────────────────────────────────────────
// AMRAPs (EXE-04c)
// ─────────────────────────────────────────────────────────────────────────────

type AmrapRecords = BlockRecords<AmrapState>

function isAmrapState(value: unknown): value is AmrapState {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    (record.startedAt === null || typeof record.startedAt === 'string') &&
    (record.endedAtSeconds === null ||
      (typeof record.endedAtSeconds === 'number' &&
        Number.isFinite(record.endedAtSeconds) && record.endedAtSeconds >= 0)) &&
    typeof record.roundsCompleted === 'number' &&
    Number.isInteger(record.roundsCompleted) && record.roundsCompleted >= 0 &&
    (record.partialRoundReps === null ||
      (typeof record.partialRoundReps === 'number' &&
        Number.isInteger(record.partialRoundReps) && record.partialRoundReps >= 0))
  )
}

export function readAmrapStates(storage: ShellStorage | null): AmrapRecords {
  return readBlockRecords(storage, WORKOUT_AMRAP_STORAGE_KEY, isAmrapState)
}

export function readAmrapState(storage: ShellStorage | null, blockId: string): AmrapState | null {
  return readAmrapStates(storage)[blockId] ?? null
}

export function writeAmrapState(storage: ShellStorage | null, blockId: string, state: AmrapState): void {
  writeBlockRecord(storage, WORKOUT_AMRAP_STORAGE_KEY, isAmrapState, blockId, state)
}

export interface PersistedAmrap { readonly state: AmrapState; update(next: AmrapState): void }

export function usePersistedAmrap(
  blockId: string,
  restore: (stored: AmrapState | null) => AmrapState,
  storage: ShellStorage | null = defaultShellStorage(),
): PersistedAmrap {
  const [state, setState] = useState(() => restore(readAmrapState(storage, blockId)))
  const latest = useRef(storage)
  useEffect(() => { latest.current = storage })
  const update = useCallback((next: AmrapState) => {
    setState(next)
    writeAmrapState(latest.current, blockId, next)
  }, [blockId])
  return { state, update }
}
