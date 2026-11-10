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
 * TASK-006 (C18) adds no key: Pause is one more optional stamp, `pausedAt`, in
 * each timed record (and the EMOM's Finish early a `finishedAt`), so a paused
 * section comes back paused after a refresh and records written before it
 * parse unchanged.
 *
 * TASK-010 (C29) adds no key either: the athlete's Complete or Incomplete for
 * a finished For Time race is one optional boolean, `workCompleted`, on that
 * race's own record, so a correction survives a refresh (an Incomplete must
 * not come back as the clock's Complete) and older records parse unchanged.
 *
 * TASK-032 (REQ-032) adds a key, `clear.workout-ladders`, because a ladder
 * attempt is more than its clock: the rungs checked off, the result draft, the
 * accidental-Finish checkpoint Undo returns to and the original cap
 * (`ladder-recovery.ts`). Unlike the records above it is not a convenience the
 * rows can reproduce until the block's row is saved — so it is a versioned
 * record carrying its own session, block and attempt identity, a stale or
 * foreign one restores nothing, and another attempt's record is never
 * overwritten. Its clock is the For Time race's shape; a ladder clock written
 * before the key existed (under the For Time key) is adopted, once, on first
 * restore. Its own key, on the circuits' argument: the existing ladder clock
 * writer (`usePersistedForTime`) rewrites the For Time record from its own
 * state, and would drop anything stored beside it. It is dropped with the
 * session like the others, because by then the row is saved or the workout
 * abandoned.
 *
 * No zod here. CORE-03's rule is that every payload crossing a *process*
 * boundary is parsed in `schemas.ts`; this crosses no process, and its own
 * previous write is the only thing that produces it. A hand-written guard is
 * the honest size of the problem.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import { Constants } from '../data/database.types'
import type { AmrapState } from './amrap'
import type { CircuitState, RoundTiming } from './circuit'
import type { EmomState } from './emom'
import type { ForTimeState } from './for-time'
import {
  adoptLegacyLadderClock,
  clampLadderAttempt,
  createLadderAttempt,
  editLadderDraft,
  finishLadderAttempt,
  LADDER_ATTEMPT_VERSION,
  ladderRecorded,
  ladderSaveFailed,
  ladderSaveSucceeded,
  pauseLadderAttempt,
  resumeLadderAttempt,
  startLadderAttempt,
  trackLadderProgress,
  undoLadderFinish,
  type LadderAttempt,
  type LadderDraft,
  type LadderDraftPatch,
  type LadderFinishCheckpoint,
  type LadderSaveState,
} from './ladder-recovery'

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

/** The ladders' key: one versioned attempt per block id, with its identity (TASK-032). */
export const WORKOUT_LADDER_STORAGE_KEY = 'clear.workout-ladders'

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
 * block's position, clock, score or ladder attempt. Completing and abandoning both call it
 * and clear every key because an ended session has nowhere to return to.
 *
 * EXE-07's set-log queue is deliberately *not* one of these keys and must never
 * be added here. Every record above is a convenience the rows can reproduce;
 * that one is work the user performed and the database does not have yet.
 * Clearing it at the end of a session would lose exactly the sets D7 is about.
 */
export function clearWorkoutShellState(storage: ShellStorage | null): void {
  if (storage === null) return
  try {
    storage.removeItem(WORKOUT_SHELL_STORAGE_KEY)
    storage.removeItem(WORKOUT_CIRCUIT_STORAGE_KEY)
    storage.removeItem(WORKOUT_EMOM_STORAGE_KEY)
    storage.removeItem(WORKOUT_FOR_TIME_STORAGE_KEY)
    storage.removeItem(WORKOUT_AMRAP_STORAGE_KEY)
    storage.removeItem(WORKOUT_LADDER_STORAGE_KEY)
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
    (record.restStartedAt === null || typeof record.restStartedAt === 'string') &&
    // REQ-017's round clock and history: absent in a record written before them.
    (record.roundStartedAt === undefined ||
      record.roundStartedAt === null ||
      typeof record.roundStartedAt === 'string') &&
    (record.history === undefined ||
      (Array.isArray(record.history) && record.history.every(isRoundTiming)))
  )
}

function isRoundTiming(value: unknown): value is RoundTiming {
  if (typeof value !== 'object' || value === null) return false
  const timing = value as Record<string, unknown>
  return (
    typeof timing.round === 'number' &&
    Number.isInteger(timing.round) &&
    timing.round >= 1 &&
    typeof timing.startedAt === 'string' &&
    typeof timing.endedAt === 'string'
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

/**
 * TASK-006 (C18): an optional stamp a later build added — Pause's `pausedAt`,
 * EMOM's Finish early `finishedAt`. Absent in a record written before it, so
 * absence is as valid as null or an ISO string.
 */
function isOptionalStamp(value: unknown): boolean {
  return value === undefined || value === null || typeof value === 'string'
}

/** TASK-010 (C29): an optional answer a later build added. Absent in older records. */
function isOptionalAnswer(value: unknown): boolean {
  return value === undefined || value === null || typeof value === 'boolean'
}

type EmomRecords = BlockRecords<EmomState>

function isEmomState(value: unknown): value is EmomState {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    (record.startedAt === null || typeof record.startedAt === 'string') &&
    (record.workDoneMinute === null ||
      (typeof record.workDoneMinute === 'number' && Number.isInteger(record.workDoneMinute))) &&
    isOptionalStamp(record.pausedAt) &&
    isOptionalStamp(record.finishedAt)
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
    (record.finishedAt === null || typeof record.finishedAt === 'string') &&
    isOptionalStamp(record.pausedAt) &&
    isOptionalAnswer(record.workCompleted)
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
    (record.roundsCompleted === null ||
      (typeof record.roundsCompleted === 'number' &&
        Number.isInteger(record.roundsCompleted) && record.roundsCompleted >= 0)) &&
    (record.partialRoundReps === null ||
      (typeof record.partialRoundReps === 'number' &&
        Number.isInteger(record.partialRoundReps) && record.partialRoundReps >= 0)) &&
    isOptionalStamp(record.pausedAt)
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

// ─────────────────────────────────────────────────────────────────────────────
// Ladder attempts (TASK-032)
// ─────────────────────────────────────────────────────────────────────────────

const SET_EFFORTS: readonly unknown[] = Constants.public.Enums.set_effort

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value !== ''
const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0
const isCountOrNull = (value: unknown) => value === null || isCount(value)
const isAnswerOrNull = (value: unknown) => value === null || typeof value === 'boolean'

function isLadderDraft(value: unknown): value is LadderDraft {
  if (typeof value !== 'object' || value === null) return false
  const draft = value as Record<string, unknown>
  const movements = draft.movements
  return (
    isAnswerOrNull(draft.completed) &&
    isCountOrNull(draft.highestRung) &&
    (draft.effort === null || SET_EFFORTS.includes(draft.effort)) &&
    typeof draft.notes === 'string' &&
    typeof movements === 'object' &&
    movements !== null &&
    !Array.isArray(movements) &&
    Object.values(movements).every((entry) => {
      if (typeof entry !== 'object' || entry === null) return false
      const movement = entry as Record<string, unknown>
      return typeof movement.amount === 'string' && typeof movement.weight === 'string'
    })
  )
}

function isLadderCheckpoint(value: unknown): value is LadderFinishCheckpoint {
  if (typeof value !== 'object' || value === null) return false
  const checkpoint = value as Record<string, unknown>
  return (
    (checkpoint.pausedAt === null || typeof checkpoint.pausedAt === 'string') &&
    isCountOrNull(checkpoint.progress) &&
    isAnswerOrNull(checkpoint.completed)
  )
}

function isLadderSaveState(value: unknown): value is LadderSaveState {
  if (typeof value !== 'object' || value === null) return false
  const save = value as Record<string, unknown>
  switch (save.status) {
    case 'unsaved':
      return true
    case 'failed':
      return typeof save.at === 'string'
    case 'saved':
      return typeof save.at === 'string' && (save.source === 'save' || save.source === 'server')
    default:
      return false
  }
}

/**
 * A version-1 ladder attempt, every field accounted for. A record of another
 * version — older or newer — is not one this build can vouch for.
 */
export function isLadderAttempt(value: unknown): value is LadderAttempt {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  const identity = record.identity as Record<string, unknown> | null | undefined
  const cap = record.originalCapSeconds
  return (
    record.version === LADDER_ATTEMPT_VERSION &&
    typeof identity === 'object' &&
    identity !== null &&
    isNonEmptyString(identity.sessionId) &&
    isNonEmptyString(identity.blockId) &&
    isNonEmptyString(identity.attemptId) &&
    (cap === null || (isCount(cap) && cap >= 1)) &&
    isForTimeState(record.clock) &&
    isCountOrNull(record.progress) &&
    (record.draft === null || isLadderDraft(record.draft)) &&
    typeof record.endCarried === 'boolean' &&
    (record.checkpoint === null || isLadderCheckpoint(record.checkpoint)) &&
    isLadderSaveState(record.save)
  )
}

/** Every entry under the ladders' key, as stored — including ones this build cannot read. */
function readRawLadderEntries(storage: ShellStorage | null): Record<string, unknown> {
  if (storage === null) return {}
  try {
    const raw = storage.getItem(WORKOUT_LADDER_STORAGE_KEY)
    if (raw === null) return {}
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

/**
 * This block's attempt in this session, or null: absent, unreadable, written
 * under another block's id, or from another workout.
 */
export function readLadderAttempt(
  storage: ShellStorage | null,
  sessionId: string,
  blockId: string,
): LadderAttempt | null {
  const entry = readRawLadderEntries(storage)[blockId]
  return isLadderAttempt(entry) &&
    entry.identity.blockId === blockId &&
    entry.identity.sessionId === sessionId
    ? entry
    : null
}

/**
 * `written` · `refused` — this block already has another attempt in this
 * session, which is never replaced · `unavailable` — no storage, or it refused
 * the write (the attempt still works in memory; a reload would lose it).
 */
export type LadderWriteResult = 'written' | 'refused' | 'unavailable'

/**
 * Writes one block's attempt, leaving every other entry as stored — even one
 * this build cannot read, which may be a newer build's.
 */
export function writeLadderAttempt(
  storage: ShellStorage | null,
  attempt: LadderAttempt,
): LadderWriteResult {
  if (storage === null) return 'unavailable'
  const { sessionId, blockId, attemptId } = attempt.identity
  const entries = readRawLadderEntries(storage)
  const existing = entries[blockId]
  if (
    isLadderAttempt(existing) &&
    existing.identity.sessionId === sessionId &&
    existing.identity.blockId === blockId &&
    existing.identity.attemptId !== attemptId
  ) {
    return 'refused'
  }
  try {
    storage.setItem(WORKOUT_LADDER_STORAGE_KEY, JSON.stringify({ ...entries, [blockId]: attempt }))
    return 'written'
  } catch {
    return 'unavailable'
  }
}

/**
 * Where a restored attempt came from: `stored` — this key; `legacy-clock` — a
 * ladder clock written under the For Time key before this one existed;
 * `fresh` — nothing usable.
 */
export type LadderRestoreSource = 'stored' | 'legacy-clock' | 'fresh'

/**
 * Why a stored entry was not restored: `other-session` — it belongs to another
 * workout; `unreadable` — malformed, another version, or filed under another
 * block's id. Neither attaches, and neither falls back to the older For Time
 * clock, which would be at least as stale.
 */
export type LadderDiscard = 'other-session' | 'unreadable' | null

export interface LadderRestore {
  readonly attempt: LadderAttempt
  readonly source: LadderRestoreSource
  readonly discarded: LadderDiscard
}

export interface LadderRestoreInput {
  readonly sessionId: string
  readonly blockId: string
  /** The block's cap now: the original cap of an attempt created or adopted here. */
  readonly capSeconds: number | null
  readonly rungCount: number
  readonly mintId: () => string
}

/** This block's attempt as a reload finds it. Pure over the storage it is given. */
export function restoreLadderAttempt(
  storage: ShellStorage | null,
  input: LadderRestoreInput,
): LadderRestore {
  const seed = {
    sessionId: input.sessionId,
    blockId: input.blockId,
    capSeconds: input.capSeconds,
    mintId: input.mintId,
  }
  const fresh = (discarded: LadderDiscard): LadderRestore => ({
    attempt: createLadderAttempt(seed),
    source: 'fresh',
    discarded,
  })

  const entry = readRawLadderEntries(storage)[input.blockId]
  if (entry !== undefined) {
    if (!isLadderAttempt(entry) || entry.identity.blockId !== input.blockId) return fresh('unreadable')
    if (entry.identity.sessionId !== input.sessionId) return fresh('other-session')
    return { attempt: clampLadderAttempt(entry, input.rungCount), source: 'stored', discarded: null }
  }

  const legacy = readForTimeState(storage, input.blockId)
  if (legacy !== null && legacy.startedAt !== null) {
    return {
      attempt: clampLadderAttempt(adoptLegacyLadderClock(seed, legacy), input.rungCount),
      source: 'legacy-clock',
      discarded: null,
    }
  }
  return fresh(null)
}

export interface PersistedLadderOptions {
  readonly sessionId: string
  readonly blockId: string
  /** The cap a raced ladder runs against (`ladderRaceCapSeconds`); stamped once. */
  readonly capSeconds: number | null
  /** `ladderRungs(block.exercises).length`. */
  readonly rungCount: number
  /** The server's word that the block's row exists (`isBlockRecorded`). */
  readonly recorded: boolean
  readonly storage?: ShellStorage | null
  readonly now?: () => number
  readonly mintId?: () => string
}

export interface PersistedLadder {
  readonly attempt: LadderAttempt
  readonly source: LadderRestoreSource
  readonly discarded: LadderDiscard
  /** False once a write did not reach storage: a reload would not find the latest state. */
  readonly durable: boolean
  start(): void
  pause(): void
  resume(): void
  finish(): void
  undoFinish(): void
  /** Live check-off: the rungs completed through. */
  track(through: number): void
  editDraft(patch: LadderDraftPatch): void
  /**
   * The section save that carried this attempt's outcome succeeded. Pass the
   * attempt id captured when the save began: an answer for another attempt
   * changes nothing. Defaults to the current attempt.
   */
  saveSucceeded(attemptId?: string): void
  /** It failed: the draft, progress and checkpoint are kept for the retry. */
  saveFailed(attemptId?: string): void
  /**
   * TASK-014 (AC-R014-03): the server's word that the block's row exists,
   * applied now (`ladderRecorded`) rather than by the `recorded` option on the
   * next render. For a consumer told synchronously (the shell's
   * `onBlockRecorded`) that may unmount in the same render: the record is
   * closed — no Undo, no edit — before a reload can find it open.
   */
  markRecorded(): void
}

interface LadderHookState {
  readonly attempt: LadderAttempt
  readonly source: LadderRestoreSource
  readonly discarded: LadderDiscard
  readonly durable: boolean
}

/**
 * One ladder attempt, restored on mount and written on every change, in the
 * same act, under its identity. Mount one per block (key it by block id).
 *
 * A restored legacy clock is written straight away so its minted attempt id is
 * the one every later reload finds. A change that would replace another
 * attempt's record is refused, and the stored attempt is adopted instead. Once
 * the server reports the block's row, the record is closed as saved and no
 * other action applies.
 */
export function usePersistedLadder({
  sessionId,
  blockId,
  capSeconds,
  rungCount,
  recorded,
  storage = defaultShellStorage(),
  now = Date.now,
  mintId = () => crypto.randomUUID(),
}: PersistedLadderOptions): PersistedLadder {
  const [state, setState] = useState<LadderHookState>(() => ({
    ...restoreLadderAttempt(storage, { sessionId, blockId, capSeconds, rungCount, mintId }),
    durable: true,
  }))

  // The latest values, so actions chain within one tick and stay stable.
  const latest = useRef({ attempt: state.attempt, storage, now, rungCount, recorded })
  useEffect(() => {
    latest.current = { ...latest.current, storage, now, rungCount, recorded }
  })

  const apply = useCallback(
    (step: (attempt: LadderAttempt, at: number, rungs: number) => LadderAttempt, whenRecorded = false) => {
      const current = latest.current
      if (current.recorded && !whenRecorded) return
      const next = step(current.attempt, current.now(), current.rungCount)
      if (next === current.attempt) return

      const written = writeLadderAttempt(current.storage, next)
      if (written === 'refused') {
        const stored = readLadderAttempt(current.storage, next.identity.sessionId, next.identity.blockId)
        if (stored === null) return
        const adopted = clampLadderAttempt(stored, current.rungCount)
        latest.current = { ...current, attempt: adopted }
        setState({ attempt: adopted, source: 'stored', discarded: null, durable: true })
        return
      }
      latest.current = { ...current, attempt: next }
      setState((previous) => ({ ...previous, attempt: next, durable: written === 'written' }))
    },
    [],
  )

  // A legacy clock is adopted once, under a stable attempt id.
  const adopted = state.source === 'legacy-clock' ? state.attempt : null
  useEffect(() => {
    if (adopted === null) return
    const stored = latest.current.storage
    if (readRawLadderEntries(stored)[adopted.identity.blockId] !== undefined) return
    writeLadderAttempt(stored, adopted)
  }, [adopted])

  // The server's row is the authority: close the attempt as saved.
  useEffect(() => {
    if (recorded) apply((attempt, at, rungs) => ladderRecorded(attempt, rungs, at), true)
  }, [apply, recorded])

  return {
    attempt: state.attempt,
    source: state.source,
    discarded: state.discarded,
    durable: state.durable,
    start: useCallback(() => apply((attempt, at) => startLadderAttempt(attempt, at)), [apply]),
    pause: useCallback(() => apply((attempt, at) => pauseLadderAttempt(attempt, at)), [apply]),
    resume: useCallback(() => apply((attempt, at) => resumeLadderAttempt(attempt, at)), [apply]),
    finish: useCallback(() => apply((attempt, at, rungs) => finishLadderAttempt(attempt, rungs, at)), [apply]),
    undoFinish: useCallback(() => apply((attempt, at, rungs) => undoLadderFinish(attempt, rungs, at)), [apply]),
    track: useCallback(
      (through: number) => apply((attempt, at, rungs) => trackLadderProgress(attempt, through, rungs, at)),
      [apply],
    ),
    editDraft: useCallback(
      (patch: LadderDraftPatch) => apply((attempt, at, rungs) => editLadderDraft(attempt, patch, rungs, at)),
      [apply],
    ),
    saveSucceeded: useCallback(
      (attemptId?: string) =>
        apply((attempt, at, rungs) =>
          ladderSaveSucceeded(attempt, attemptId ?? attempt.identity.attemptId, rungs, at),
        ),
      [apply],
    ),
    saveFailed: useCallback(
      (attemptId?: string) =>
        apply((attempt, at) => ladderSaveFailed(attempt, attemptId ?? attempt.identity.attemptId, at)),
      [apply],
    ),
    markRecorded: useCallback(
      () => apply((attempt, at, rungs) => ladderRecorded(attempt, rungs, at), true),
      [apply],
    ),
  }
}
