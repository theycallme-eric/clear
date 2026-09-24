/**
 * EXE-07 — the durable queue a set is written to before it is written anywhere
 * else, and the rules for getting it out again.
 *
 * Closes D7. EXE-02 wrote each set straight to PostgREST and drew it as logged
 * when a row came back; a dead signal in a basement gym therefore lost work the
 * user physically did, and the screen said nothing useful about it. This module
 * is the half that makes that impossible, and it is deliberately *not* offline
 * support: nothing here caches a workout, reads one, or tries to make the app
 * usable without a network. It is one write path that does not lie.
 *
 * The shape of the guarantee:
 *
 *   · **Local first.** A set is serialised into `localStorage` synchronously,
 *     inside the same tick as the tap, before any request exists. A tab killed
 *     one millisecond later still has the set.
 *   · **Client-minted identity.** `SetLogEntry.id` is already the row's primary
 *     key (EXE-02), so a retried flush of the same entry is the *same* insert.
 *     The database refuses the second one — `PERSISTENCE_CONFLICT` — and that
 *     refusal is proof the set landed, not a failure. No server sequence, no
 *     duplicate set.
 *   · **Nothing is dropped.** An entry leaves the queue when the row is stored,
 *     or when the session snapshot shows it already stored, and for no other
 *     reason. An entry the database will never accept stops being *retried*
 *     (`isPermanent`) but stays queued and stays counted, because a set that
 *     silently vanished is the defect, not the fix.
 *   · **One notice.** The queue counts what is unsynced; the shell states that
 *     count once. Nothing here raises anything per set.
 *
 * No zod, on `workout-persistence.ts`'s reasoning: this record crosses no
 * process boundary, and its only producer is this module's own previous write.
 * The guard is hand-written because that is the honest size of the problem —
 * and it is strict, because a malformed entry read back would be a set the app
 * believes it is holding and can never send.
 */
import { Constants } from '../data/database.types'
import { ErrorCode, type AppError } from './errors'
import type { PerformedSet, SetLogEntry } from './set-logging'

/** One key, one queue: the app writes sets for one session at a time. */
export const SET_LOG_QUEUE_STORAGE_KEY = 'clear.set-log-queue'

/**
 * Failed attempts before the shell says so. One failure is a hiccup and is
 * shown on the set itself; two is a signal that is actually gone, which is the
 * "sustained failure" the requirement wants surfaced — once, with a count.
 */
export const SUSTAINED_SET_LOG_ATTEMPTS = 2

/** Backoff between flush passes: doubling, and capped so a retry still comes. */
export const SET_LOG_RETRY_BASE_MS = 2_000
export const SET_LOG_RETRY_MAX_MS = 30_000

/** One set, written locally and not yet confirmed by the database. */
export interface QueuedSetLog {
  /** The row the flush will insert. Its `id` is this entry's identity too. */
  readonly entry: SetLogEntry
  /** The session it was performed in, so a resume can reconcile it. */
  readonly sessionId: string
  /** When the user logged it — the 6:02 a set is still expected at 6:40. */
  readonly queuedAt: string
  /** Flush attempts that came back with an error. Zero means untried. */
  readonly attempts: number
  /** The last refusal's code, kept so a permanent one stops being retried. */
  readonly lastErrorCode: ErrorCode | null
}

// ─────────────────────────────────────────────────────────────────────────────
// What a retry is worth
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Whether the database has already stored this exact row. A client-minted
 * primary key makes a unique-violation the *success* case of a retry: the id
 * can only collide with the write this queue itself made.
 */
export function isAlreadyStored(error: AppError): boolean {
  return error.code === ErrorCode.PERSISTENCE_CONFLICT
}

/**
 * Whether retrying this entry could ever succeed. A malformed measurement, a
 * prescription that has since been superseded, or an owner check the row will
 * never pass are all facts about the row rather than about the connection —
 * retrying them forever would burn battery and hide a real problem. They stay
 * queued and counted; they simply stop being sent.
 */
export function isPermanent(error: AppError): boolean {
  switch (error.code) {
    case ErrorCode.VALIDATION_REQUIRED_FIELD:
    case ErrorCode.VALIDATION_INVALID_FORMAT:
    case ErrorCode.VALIDATION_OUT_OF_RANGE:
    case ErrorCode.VALIDATION_CONSTRAINT:
    case ErrorCode.PERSISTENCE_NOT_FOUND:
      return true
    default:
      return false
  }
}

/** True for an entry whose last refusal will not change on its own. */
export function isStalled(queued: QueuedSetLog): boolean {
  return (
    queued.lastErrorCode !== null &&
    isPermanent({ code: queued.lastErrorCode, message: '' })
  )
}

/** The entries a flush pass should actually send, in the order they happened. */
export function retryable(queue: readonly QueuedSetLog[]): readonly QueuedSetLog[] {
  return queue.filter((queued) => !isStalled(queued))
}

/** How long to wait before the next pass, from the fewest attempts pending. */
export function retryDelayMs(queue: readonly QueuedSetLog[]): number {
  const pending = retryable(queue)
  if (pending.length === 0) return SET_LOG_RETRY_MAX_MS

  const attempts = Math.min(...pending.map((queued) => queued.attempts))
  const delay = SET_LOG_RETRY_BASE_MS * 2 ** Math.max(0, attempts - 1)
  return Math.min(delay, SET_LOG_RETRY_MAX_MS)
}

/**
 * Whether the shell should state the failure. Sustained means tried and
 * refused more than once, or refused by something a retry cannot fix.
 */
export function hasSustainedFailure(queue: readonly QueuedSetLog[]): boolean {
  return queue.some(
    (queued) => queued.attempts >= SUSTAINED_SET_LOG_ATTEMPTS || isStalled(queued),
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Queue operations — pure, so the provider holds no rules of its own
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Adds a set, or replaces the one already under its id. Replacing rather than
 * appending is what makes enqueueing idempotent: a re-render, a double tap and
 * a restored entry cannot become two rows.
 */
export function enqueued(
  queue: readonly QueuedSetLog[],
  queued: QueuedSetLog,
): readonly QueuedSetLog[] {
  const without = queue.filter((item) => item.entry.id !== queued.entry.id)
  return [...without, queued]
}

/** Drops one entry by set-log id — what a stored row means. */
export function settled(
  queue: readonly QueuedSetLog[],
  id: string,
): readonly QueuedSetLog[] {
  return queue.filter((item) => item.entry.id !== id)
}

/** Records a refusal against one entry, leaving it queued. */
export function attempted(
  queue: readonly QueuedSetLog[],
  id: string,
  error: AppError,
): readonly QueuedSetLog[] {
  return queue.map((item) =>
    item.entry.id === id
      ? { ...item, attempts: item.attempts + 1, lastErrorCode: error.code }
      : item,
  )
}

/**
 * The queue after a session snapshot has been read: every entry the server can
 * already account for is dropped, and the rest stay exactly as they were.
 *
 * Two things count as accounted for, because two things can have happened to a
 * write whose answer never arrived. The row may be there under the id this
 * queue minted — the ordinary case, and the reason the id is minted at all —
 * or the set number may already be recorded against that prescription, which
 * is the same set by the table's own uniqueness rule. Either way the user has
 * the set they performed and is asked for nothing.
 */
export function reconciled(
  queue: readonly QueuedSetLog[],
  stored: readonly { readonly id: string; readonly exerciseId: string; readonly setNumber: number }[],
): readonly QueuedSetLog[] {
  const ids = new Set(stored.map((row) => row.id))
  const numbers = new Set(stored.map((row) => `${row.exerciseId}#${row.setNumber}`))

  return queue.filter(
    (item) =>
      !ids.has(item.entry.id) &&
      !numbers.has(`${item.entry.exerciseId}#${item.entry.performed.setNumber}`),
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Durability
// ─────────────────────────────────────────────────────────────────────────────

/** The subset of `Storage` this module uses; injectable, so a test owns it. */
export interface QueueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/**
 * `localStorage`, or nothing. Safari in private mode throws on access — and an
 * app with no durable queue must still write sets, live, exactly as EXE-02
 * did. Less safe, never less functional.
 */
export function defaultQueueStorage(): QueueStorage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

function isPerformedSet(value: unknown): value is PerformedSet {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>

  return (
    typeof record.setNumber === 'number' &&
    Number.isInteger(record.setNumber) &&
    record.setNumber >= 1 &&
    isOptionalNumber(record.reps) &&
    isOptionalNumber(record.durationSeconds) &&
    isOptionalNumber(record.distance) &&
    isOptionalNumber(record.weight) &&
    isOptionalNumber(record.rpe) &&
    (record.isWarmup === undefined || typeof record.isWarmup === 'boolean')
  )
}

function isOptionalNumber(value: unknown): boolean {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value))
}

function isSetLogEntry(value: unknown): value is SetLogEntry {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>

  return (
    isId(record.id) &&
    isId(record.exerciseId) &&
    isId(record.blockId) &&
    (record.distanceUnit === null ||
      isMember(Constants.public.Enums.distance_unit, record.distanceUnit)) &&
    isMember(Constants.public.Enums.weight_unit, record.weightUnit) &&
    isPerformedSet(record.performed)
  )
}

function isQueuedSetLog(value: unknown): value is QueuedSetLog {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>

  return (
    isSetLogEntry(record.entry) &&
    isId(record.sessionId) &&
    typeof record.queuedAt === 'string' &&
    typeof record.attempts === 'number' &&
    Number.isInteger(record.attempts) &&
    record.attempts >= 0 &&
    (record.lastErrorCode === null || isErrorCode(record.lastErrorCode))
  )
}

function isId(value: unknown): value is string {
  return typeof value === 'string' && value !== ''
}

function isMember<T extends string>(
  values: readonly T[],
  value: unknown,
): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value)
}

function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && value in ErrorCode
}

/**
 * Every set still owed to the database, oldest first. An entry that cannot be
 * vouched for is dropped rather than half-trusted: a row built from a record
 * this guard does not recognise is a row the insert would refuse forever.
 */
export function readSetLogQueue(storage: QueueStorage | null): readonly QueuedSetLog[] {
  if (storage === null) return []

  let raw: string | null
  try {
    raw = storage.getItem(SET_LOG_QUEUE_STORAGE_KEY)
  } catch {
    return []
  }
  if (raw === null) return []

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []

  return parsed.filter(isQueuedSetLog)
}

/**
 * Replaces the stored queue. Called before the request that would empty it, so
 * the durable copy is never behind what the screen believes.
 *
 * A quota failure is swallowed here and nowhere else: the set is still in
 * memory and still being flushed, so the cost is durability across a reload,
 * not the set. Throwing would lose it outright.
 */
export function writeSetLogQueue(
  storage: QueueStorage | null,
  queue: readonly QueuedSetLog[],
): void {
  if (storage === null) return
  try {
    if (queue.length === 0) {
      storage.removeItem(SET_LOG_QUEUE_STORAGE_KEY)
      return
    }
    storage.setItem(SET_LOG_QUEUE_STORAGE_KEY, JSON.stringify(queue))
  } catch {
    // Nothing to recover: the next pass writes the queue as it then stands.
  }
}

/** A queued set, as it stands the moment the user logs it. */
export function queuedSetLog(
  entry: SetLogEntry,
  sessionId: string,
  queuedAt: string,
): QueuedSetLog {
  return { entry, sessionId, queuedAt, attempts: 0, lastErrorCode: null }
}
