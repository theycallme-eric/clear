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
 * EXE-03 adds the second thing of that kind, and it is the same argument one
 * level down: a circuit's current round and position are not in the rows
 * either. Two rounds of the same movement are two set logs whichever order
 * they happened in, so "round three, movement two, resting" can only be
 * remembered. It is kept under its own key rather than inside the shell record
 * — the two are written by different components at different moments, and one
 * read-modify-write racing the other is how the open section would start
 * losing rounds — and both are dropped together when the session ends. Block
 * ids are per-session, so a circuit record can only ever be read back by the
 * block that wrote it.
 *
 * EXE-04b adds the third, under a third key, by the same argument one structure
 * across: a For Time block's clock. When the user *started racing* is not in the
 * rows either — the session's `started_at` is the whole workout, not this block —
 * and it has to survive a refresh, because the elapsed time is the score.
 *
 * No zod here. CORE-03's rule is that every payload crossing a *process*
 * boundary is parsed in `schemas.ts`; this crosses no process, and its own
 * previous write is the only thing that produces it. A hand-written guard is
 * the honest size of the problem.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import type { CircuitState } from './circuit'
import type { ForTimeState } from './for-time'

/** One key, overwritten: the app has one session in progress at a time. */
export const WORKOUT_SHELL_STORAGE_KEY = 'clear.workout-shell'

/** The circuits' key: one record per block id, for the session in progress. */
export const WORKOUT_CIRCUIT_STORAGE_KEY = 'clear.workout-circuits'

/** The For Time blocks' key: one clock per block id (EXE-04b). */
export const WORKOUT_FOR_TIME_STORAGE_KEY = 'clear.workout-for-time'

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
 * Forgets everything the shell remembered locally — the open section, every
 * circuit's place in its rounds, and every For Time clock. Completing and
 * abandoning both call it, and they clear every key, because a session that has
 * ended has no position in it to return to.
 */
export function clearWorkoutShellState(storage: ShellStorage | null): void {
  if (storage === null) return
  try {
    storage.removeItem(WORKOUT_SHELL_STORAGE_KEY)
    storage.removeItem(WORKOUT_CIRCUIT_STORAGE_KEY)
    storage.removeItem(WORKOUT_FOR_TIME_STORAGE_KEY)
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

/** Writes one block's position, leaving the other circuits in the session alone. */
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

/**
 * A circuit's position, restored on mount and written on every tap.
 *
 * There is no `pagehide` listener here and there does not need to be: the
 * state changes only when the user taps, and the tap writes it. What the
 * section index needs those listeners for — a value that drifts while nobody
 * is pressing anything — has no equivalent in a circuit.
 *
 * `restore` runs exactly once, in the initialiser, and is where the caller
 * repairs a record against the block it is being restored into: the shape is
 * the renderer's knowledge, not this module's.
 */
export function usePersistedCircuit(
  blockId: string,
  restore: (stored: CircuitState | null) => CircuitState,
  storage: ShellStorage | null = defaultShellStorage(),
): PersistedCircuit {
  const [state, setState] = useState(() => restore(readCircuitState(storage, blockId)))

  // The storage handle can only be re-read, never re-restored: restoring twice
  // would put the user back where they were two taps ago.
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
// For Time (EXE-04b)
// ─────────────────────────────────────────────────────────────────────────────

/** Every For Time block's clock, by block id. */
type ForTimeRecords = BlockRecords<ForTimeState>

function isForTimeState(value: unknown): value is ForTimeState {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>

  // Only the shape is checked here. Whether the stamps are *readable* — and
  // whether the finish is after the start — is `clampForTimeState`'s, which is
  // where the restoring renderer repairs the record it is given.
  return (
    (record.startedAt === null || typeof record.startedAt === 'string') &&
    (record.finishedAt === null || typeof record.finishedAt === 'string')
  )
}

/** The stored map, with any entry it cannot vouch for dropped. */
export function readForTimeStates(storage: ShellStorage | null): ForTimeRecords {
  return readBlockRecords(storage, WORKOUT_FOR_TIME_STORAGE_KEY, isForTimeState)
}

/** One block's stored clock, or null — for absent and unusable alike. */
export function readForTimeState(
  storage: ShellStorage | null,
  blockId: string,
): ForTimeState | null {
  return readForTimeStates(storage)[blockId] ?? null
}

/** Writes one block's clock, leaving the other blocks in the session alone. */
export function writeForTimeState(
  storage: ShellStorage | null,
  blockId: string,
  state: ForTimeState,
): void {
  writeBlockRecord(storage, WORKOUT_FOR_TIME_STORAGE_KEY, isForTimeState, blockId, state)
}

export interface PersistedForTime {
  readonly state: ForTimeState
  /** Moves the clock and writes it in the same act. */
  moveTo(next: ForTimeState): void
}

/**
 * A For Time block's clock, restored on mount and written on every tap.
 *
 * Like the circuit's position and unlike the open section, it changes only when
 * the user presses something, and the press writes it — so there are no
 * `visibilitychange` or `pagehide` listeners here either. Nothing accumulates in
 * between: the two stamps are the whole state, and the seconds between them are
 * read from the wall clock every time they are needed.
 */
export function usePersistedForTime(
  blockId: string,
  restore: (stored: ForTimeState | null) => ForTimeState,
  storage: ShellStorage | null = defaultShellStorage(),
): PersistedForTime {
  const [state, setState] = useState(() => restore(readForTimeState(storage, blockId)))

  const latest = useRef(storage)
  useEffect(() => {
    latest.current = storage
  })

  const moveTo = useCallback(
    (next: ForTimeState) => {
      setState(next)
      writeForTimeState(latest.current, blockId, next)
    },
    [blockId],
  )

  return { state, moveTo }
}
