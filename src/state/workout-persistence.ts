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
 * EXE-03 adds the second thing of that kind, for the same reason one level
 * down: an EMOM's clock is not in the rows either. Nothing in `block_results`
 * or in a set log says the user started a 10-minute EMOM ninety seconds ago, so
 * the moment it started — and whether the current minute's work was marked done
 * early — can only be remembered. It is kept under its own key rather than
 * inside the shell record: the two are written by different components at
 * different moments, and one read-modify-write racing the other is how the open
 * section would start losing minutes. Both are dropped together when the
 * session ends. Block ids are per-session, so an EMOM record can only ever be
 * read back by the block that wrote it.
 *
 * No zod here. CORE-03's rule is that every payload crossing a *process*
 * boundary is parsed in `schemas.ts`; this crosses no process, and its own
 * previous write is the only thing that produces it. A hand-written guard is
 * the honest size of the problem.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import type { EmomState } from './emom'

/** One key, overwritten: the app has one session in progress at a time. */
export const WORKOUT_SHELL_STORAGE_KEY = 'clear.workout-shell'

/** The EMOMs' key: one record per block id, for the session in progress. */
export const WORKOUT_EMOM_STORAGE_KEY = 'clear.workout-emom'

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
 * timed block's clock. Completing and abandoning both call it, and both keys go
 * together: a session that has ended has no minute to return to.
 */
export function clearWorkoutShellState(storage: ShellStorage | null): void {
  if (storage === null) return
  try {
    storage.removeItem(WORKOUT_SHELL_STORAGE_KEY)
    storage.removeItem(WORKOUT_EMOM_STORAGE_KEY)
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
// EMOMs (EXE-03)
// ─────────────────────────────────────────────────────────────────────────────

/** Every EMOM's clock, by block id. */
type EmomRecords = Record<string, EmomState>

function isEmomState(value: unknown): value is EmomState {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>

  return (
    (record.startedAt === null || typeof record.startedAt === 'string') &&
    (record.workDoneMinute === null ||
      (typeof record.workDoneMinute === 'number' &&
        Number.isInteger(record.workDoneMinute)))
  )
}

/** The stored map, with any entry it cannot vouch for dropped. */
export function readEmomStates(storage: ShellStorage | null): EmomRecords {
  if (storage === null) return {}

  let raw: string | null
  try {
    raw = storage.getItem(WORKOUT_EMOM_STORAGE_KEY)
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

  const records: EmomRecords = {}
  for (const [blockId, entry] of Object.entries(parsed as Record<string, unknown>)) {
    if (isEmomState(entry)) records[blockId] = entry
  }
  return records
}

/** One block's stored clock, or null — for absent and unusable alike. */
export function readEmomState(
  storage: ShellStorage | null,
  blockId: string,
): EmomState | null {
  return readEmomStates(storage)[blockId] ?? null
}

/**
 * Writes one block's clock, leaving the other timed blocks in the session
 * alone. A session holds a handful of blocks and the whole map is dropped when
 * it ends, so read-modify-write is the right size for the problem.
 */
export function writeEmomState(
  storage: ShellStorage | null,
  blockId: string,
  state: EmomState,
): void {
  if (storage === null) return
  try {
    storage.setItem(
      WORKOUT_EMOM_STORAGE_KEY,
      JSON.stringify({ ...readEmomStates(storage), [blockId]: state }),
    )
  } catch {
    // A full or refused quota costs the clock on a refresh, never a logged set.
  }
}

export interface PersistedEmom {
  readonly state: EmomState
  /** Moves the EMOM and writes it in the same act. */
  update(next: EmomState): void
}

/**
 * An EMOM's clock, restored on mount and written whenever it changes.
 *
 * There is no `pagehide` listener here and there does not need to be: the
 * record changes only when the user starts the block or marks a minute done,
 * and that act writes it. What the section index needs those listeners for — a
 * value that drifts while nobody is pressing anything — has no equivalent here,
 * because the minute the user is in is derived from the stored timestamp rather
 * than stored itself.
 *
 * `restore` runs exactly once, in the initialiser, and is where the caller
 * repairs a record against the block it is being restored into: the shape is
 * the renderer's knowledge, not this module's.
 */
export function usePersistedEmom(
  blockId: string,
  restore: (stored: EmomState | null) => EmomState,
  storage: ShellStorage | null = defaultShellStorage(),
): PersistedEmom {
  const [state, setState] = useState(() => restore(readEmomState(storage, blockId)))

  // The storage handle can only be re-read, never re-restored: restoring twice
  // would put the user back in a minute they have already left.
  const latest = useRef(storage)
  useEffect(() => {
    latest.current = storage
  })

  const update = useCallback(
    (next: EmomState) => {
      setState(next)
      writeEmomState(latest.current, blockId, next)
    },
    [blockId],
  )

  return { state, update }
}
