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

/** One key, overwritten: the app has one session in progress at a time. */
export const WORKOUT_SHELL_STORAGE_KEY = 'clear.workout-shell'

/** The circuits' key: one record per block id, for the session in progress. */
export const WORKOUT_CIRCUIT_STORAGE_KEY = 'clear.workout-circuits'

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
 * Forgets everything the shell remembered locally — the open section, every
 * circuit's place in its rounds, and every AMRAP's score. Completing and
 * abandoning both call it, and they clear every key, because a session that has
 * ended has no position in it to return to and its scores are in
 * `block_results` by then.
 */
export function clearWorkoutShellState(storage: ShellStorage | null): void {
  if (storage === null) return
  try {
    storage.removeItem(WORKOUT_SHELL_STORAGE_KEY)
    storage.removeItem(WORKOUT_CIRCUIT_STORAGE_KEY)
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
// Circuits (EXE-03)
// ─────────────────────────────────────────────────────────────────────────────

/** Every circuit's place in its rounds, by block id. */
type CircuitRecords = Record<string, CircuitState>

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
  if (storage === null) return {}

  let raw: string | null
  try {
    raw = storage.getItem(WORKOUT_CIRCUIT_STORAGE_KEY)
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

  const records: CircuitRecords = {}
  for (const [blockId, entry] of Object.entries(parsed as Record<string, unknown>)) {
    if (isCircuitState(entry)) records[blockId] = entry
  }
  return records
}

/** One block's stored position, or null — for absent and unusable alike. */
export function readCircuitState(
  storage: ShellStorage | null,
  blockId: string,
): CircuitState | null {
  return readCircuitStates(storage)[blockId] ?? null
}

/**
 * Writes one block's position, leaving the other circuits in the session
 * alone. A session holds a handful of blocks and the whole map is dropped when
 * it ends, so read-modify-write is the right size for the problem.
 */
export function writeCircuitState(
  storage: ShellStorage | null,
  blockId: string,
  state: CircuitState,
): void {
  if (storage === null) return
  try {
    storage.setItem(
      WORKOUT_CIRCUIT_STORAGE_KEY,
      JSON.stringify({ ...readCircuitStates(storage), [blockId]: state }),
    )
  } catch {
    // A full or refused quota costs the round on a refresh, never a logged set.
  }
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
// AMRAPs (EXE-04c)
// ─────────────────────────────────────────────────────────────────────────────

/** Every AMRAP's score so far, by block id. */
type AmrapRecords = Record<string, AmrapState>

function isAmrapState(value: unknown): value is AmrapState {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>

  return (
    (record.startedAt === null || typeof record.startedAt === 'string') &&
    (record.endedAtSeconds === null ||
      (typeof record.endedAtSeconds === 'number' &&
        Number.isFinite(record.endedAtSeconds) &&
        record.endedAtSeconds >= 0)) &&
    typeof record.roundsCompleted === 'number' &&
    Number.isInteger(record.roundsCompleted) &&
    record.roundsCompleted >= 0 &&
    // Null and zero are both accepted and kept apart: no partial round recorded
    // is not the same observation as a partial round of zero reps (DATA-01d).
    (record.partialRoundReps === null ||
      (typeof record.partialRoundReps === 'number' &&
        Number.isInteger(record.partialRoundReps) &&
        record.partialRoundReps >= 0))
  )
}

/** The stored map, with any entry it cannot vouch for dropped. */
export function readAmrapStates(storage: ShellStorage | null): AmrapRecords {
  if (storage === null) return {}

  let raw: string | null
  try {
    raw = storage.getItem(WORKOUT_AMRAP_STORAGE_KEY)
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

  const records: AmrapRecords = {}
  for (const [blockId, entry] of Object.entries(parsed as Record<string, unknown>)) {
    if (isAmrapState(entry)) records[blockId] = entry
  }
  return records
}

/** One block's stored score, or null — for absent and unusable alike. */
export function readAmrapState(
  storage: ShellStorage | null,
  blockId: string,
): AmrapState | null {
  return readAmrapStates(storage)[blockId] ?? null
}

/**
 * Writes one block's score, leaving the other AMRAPs in the session alone. Same
 * shape, and the same reasoning, as `writeCircuitState`.
 */
export function writeAmrapState(
  storage: ShellStorage | null,
  blockId: string,
  state: AmrapState,
): void {
  if (storage === null) return
  try {
    storage.setItem(
      WORKOUT_AMRAP_STORAGE_KEY,
      JSON.stringify({ ...readAmrapStates(storage), [blockId]: state }),
    )
  } catch {
    // A full or refused quota costs the score on a refresh, never a logged set.
  }
}

export interface PersistedAmrap {
  readonly state: AmrapState
  /** Records the score and writes it in the same act. */
  update(next: AmrapState): void
}

/**
 * An AMRAP's score, restored on mount and written on every tap.
 *
 * No `pagehide` listener, for the reason `usePersistedCircuit` needs none: the
 * state changes only when the user taps, and the tap writes it. The one value
 * here that moves on its own — the clock — is not stored at all; `startedAt` is,
 * and the remaining time is derived from it (`amrap.ts`).
 *
 * `restore` runs exactly once, in the initialiser, and is where the caller
 * repairs a record against the block it is being restored into.
 */
export function usePersistedAmrap(
  blockId: string,
  restore: (stored: AmrapState | null) => AmrapState,
  storage: ShellStorage | null = defaultShellStorage(),
): PersistedAmrap {
  const [state, setState] = useState(() => restore(readAmrapState(storage, blockId)))

  // Re-read, never re-restored: restoring twice would undo the taps since mount.
  const latest = useRef(storage)
  useEffect(() => {
    latest.current = storage
  })

  const update = useCallback(
    (next: AmrapState) => {
      setState(next)
      writeAmrapState(latest.current, blockId, next)
    },
    [blockId],
  )

  return { state, update }
}
