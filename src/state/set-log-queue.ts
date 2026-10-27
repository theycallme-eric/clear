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
 *   · **Exact mutation identity.** Stable observation and mutation ids plus a
 *     predecessor revision are persisted before dispatch. A durable server
 *     receipt, not a uniqueness conflict or a matching set slot, confirms it.
 *   · **Nothing dispatched is dropped.** Possibly applied work survives reload
 *     and is replayed with the same request. Only unsent work can be superseded
 *     or withdrawn; permanent failures remain visible and counted.
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
import { isSetObservationMutation, setObservationMutation, type SetObservationMutation } from './set-observation-mutation'
import { isRecordedEffort, type PerformedSet, type SetLogEntry } from './set-logging'

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

/**
 * What a queued mutation does to its row (REQ-013). `correct` writes the
 * entry's values over the stored row with that id; `clear` deletes that row.
 * An insert carries no kind, which is also how every entry queued before
 * corrections existed decodes.
 */
export type SetLogMutationKind = 'correct' | 'clear'

/** One set, written locally and not yet confirmed by the database. */
export interface QueuedSetLog {
  /**
   * The row the flush will write. Its `id` is the row's identity, and an
   * insert's own identity too; a correction or a clear addresses the row by it.
   */
  readonly entry: SetLogEntry
  /** Absent for an insert. */
  readonly kind?: SetLogMutationKind
  /**
   * A correction's or a clear's own identity, distinct from the row's, so two
   * corrections of one row are two mutations and the answer to one is never
   * taken for the other. Absent for an insert, whose identity is `entry.id`.
   */
  readonly mutationId?: string
  /**
   * Set, on disk, before the request goes out. A mutation that may have
   * reached the database can no longer be withdrawn or rewritten in place —
   * its answer may simply not have arrived — so what follows it is queued
   * behind it instead.
   */
  readonly dispatched?: boolean
  /** Exact request, persisted before dispatch and immutable thereafter. */
  readonly request?: SetObservationMutation
  /** Server revision read when this mutation was first authored. */
  readonly baseRevision?: number
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

/** A generic uniqueness error never proves which observation was stored. */
export function isAlreadyStored(error: AppError): boolean {
  void error
  return false
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
    case ErrorCode.PERSISTENCE_CONFLICT:
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

/**
 * The entries a flush pass may send now, in order. Retryable, and with nothing
 * queued ahead of them for the same row or the same set slot: a correction
 * waits for its row's insert, a clear for the correction before it, and a set
 * re-entered into a cleared slot for the clear — so the database sees each
 * row's mutations in the order the user made them, and a re-entry can never
 * collide with the row it replaces and be mistaken for that row's success.
 */
export function sendable(queue: readonly QueuedSetLog[]): readonly QueuedSetLog[] {
  const waiting = new Set<string>()
  const ready: QueuedSetLog[] = []

  for (const item of queue) {
    const row = `row:${item.entry.id}`
    const slot = slotOf(item)
    if (!waiting.has(row) && !waiting.has(slot) && !isStalled(item)) ready.push(item)
    waiting.add(row)
    waiting.add(slot)
  }

  return ready
}

/** A mutation's identity: its own id, or for an insert the row it creates. */
export function mutationKey(queued: QueuedSetLog): string {
  return queued.mutationId ?? queued.entry.id
}

export function isInsert(queued: QueuedSetLog): boolean {
  return queued.kind === undefined
}

function slotOf(queued: QueuedSetLog): string {
  return `slot:${queued.entry.exerciseId}#${queued.entry.performed.setNumber}`
}

/** Never sent, and so still this device's alone to rewrite or withdraw. */
function unsent(queued: QueuedSetLog, inFlight: string | null): boolean {
  return queued.dispatched !== true && queued.attempts === 0 && mutationKey(queued) !== inFlight
}

/** How long to wait before the next pass, from the fewest attempts pending. */
export function retryDelayMs(queue: readonly QueuedSetLog[]): number {
  const pending = sendable(queue)
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
  const without = queue.filter((item) => mutationKey(item) !== mutationKey(queued))
  return [...without, queued]
}

/** Drops one mutation by its key — what a stored row, or a stored change, means. */
export function settled(
  queue: readonly QueuedSetLog[],
  key: string,
): readonly QueuedSetLog[] {
  return queue.filter((item) => mutationKey(item) !== key)
}

/** Records a refusal against one mutation, leaving it queued. */
export function attempted(
  queue: readonly QueuedSetLog[],
  key: string,
  error: AppError,
): readonly QueuedSetLog[] {
  return queue.map((item) =>
    mutationKey(item) === key
      ? { ...item, attempts: item.attempts + 1, lastErrorCode: error.code }
      : item,
  )
}

/** Marks one mutation as possibly reaching the database, before it is sent. */
export function dispatched(
  queue: readonly QueuedSetLog[],
  key: string,
): readonly QueuedSetLog[] {
  return queue.map((item) => (mutationKey(item) === key ? { ...item, dispatched: true } : item))
}

/**
 * The queue after a correction of the row `correction.entry.id` (REQ-013).
 *
 * An insert this device has never sent is rewritten in place: the row does
 * not exist anywhere else, so there is nothing to correct but the entry. Once
 * the insert may have landed — dispatched, refused, or in flight — the
 * correction is queued behind it instead, because a delayed answer to that
 * insert (a collision on its id) proves the database holds the values it
 * sent, not the corrected ones. A correction nothing has sent yet is
 * superseded: a correction states the whole observation, so the latest one is
 * the only one worth writing.
 */
export function corrected(
  queue: readonly QueuedSetLog[],
  correction: QueuedSetLog,
  inFlight: string | null,
): readonly QueuedSetLog[] {
  const row = correction.entry.id
  const insert = queue.find((item) => isInsert(item) && item.entry.id === row && unsent(item, inFlight))
  if (insert !== undefined) {
    const legacyRpe = (insert.entry.performed as { readonly rpe?: number }).rpe
    const entry: SetLogEntry = { ...correction.entry, performed: {
      ...correction.entry.performed,
      ...(insert.entry.performed.isWarmup === undefined ? {} : { isWarmup: insert.entry.performed.isWarmup }),
      ...(legacyRpe === undefined ? {} : { rpe: legacyRpe }),
    } }
    return queue.map((item) => (item === insert ? { ...item, entry, request: undefined } : item))
  }

  const without = queue.filter(
    (item) => !(item.kind === 'correct' && item.entry.id === row && unsent(item, inFlight)),
  )
  return [...without, { ...correction, kind: 'correct' }]
}

/**
 * The queue after a confirmed clear of the row `clear.entry.id` (REQ-013).
 *
 * Only mutations never sent can be withdrawn. Possibly dispatched work stays
 * ahead of the clear across reloads; its exact replay settles before the clear
 * and any explicit re-entry into the slot. Other observations stay untouched.
 */
export function cleared(
  queue: readonly QueuedSetLog[],
  clear: QueuedSetLog,
  inFlight: string | null,
): readonly QueuedSetLog[] {
  const row = clear.entry.id
  const neverSent = queue.some(
    (item) => isInsert(item) && item.entry.id === row && unsent(item, inFlight),
  )
  const without = queue.filter((item) => !(item.entry.id === row && unsent(item, inFlight)))

  return neverSent ? without : [...without, { ...clear, kind: 'clear' }]
}

/**
 * A snapshot does not establish an exact mutation receipt. Keep the outbox
 * intact for idempotent replay, even when an id or slot appears in the read.
 */
export function reconciled(
  queue: readonly QueuedSetLog[],
  stored: readonly { readonly id: string; readonly exerciseId: string; readonly setNumber: number }[],
): readonly QueuedSetLog[] {
  // A snapshot can name the same slot, or even an older version of this row.
  // Neither proves an exact mutation. Replay obtains its durable receipt.
  void stored
  return queue
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
    // The provider strips its UI override before queuing. There is exactly
    // one canonical unit, on the outer entry; never accept conflicting copies.
    record.weightUnit === undefined &&
    // An entry queued before effort collection was removed (REQ-015) may still
    // carry `rpe`. Exact legacy bootstrap preserves it rather than silently
    // changing that historical observation.
    isOptionalNumber(record.rpe) &&
    // REQ-012: an entry queued before effort existed has no key and decodes as
    // unanswered. A present value must be a category or `null` — a number
    // here is not effort, and guessing which category it meant would invent one.
    isRecordedEffort(record.effort) &&
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
    // An insert has neither; a correction or a clear has both.
    ((record.kind === undefined && record.mutationId === undefined) ||
      ((record.kind === 'correct' || record.kind === 'clear') && isId(record.mutationId))) &&
    (record.dispatched === undefined || typeof record.dispatched === 'boolean') &&
    (record.baseRevision === undefined || (Number.isSafeInteger(record.baseRevision) && Number(record.baseRevision) >= 0)) &&
    (record.request === undefined || (isSetObservationMutation(record.request)
      && record.request.observation_id === (record.entry as SetLogEntry).id
      && record.request.mutation_id === (record.mutationId ?? (record.entry as SetLogEntry).id)
      && record.request.exercise_id === (record.entry as SetLogEntry).exerciseId
      && record.request.set_number === (record.entry as SetLogEntry).performed.setNumber
      && record.request.operation === (record.kind ?? 'insert'))) &&
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

/** Freeze a canonical request on disk before network dispatch. Legacy queues
 * acquire it once, retaining their old observation and mutation identities. */
export function prepared(
  queue: readonly QueuedSetLog[], key: string, currentRevision: number,
): readonly QueuedSetLog[] {
  const target = queue.find((item) => mutationKey(item) === key)
  if (target === undefined || target.request !== undefined) return queue
  let revision = Math.max(target.baseRevision ?? 0, currentRevision)
  for (const item of queue) {
    if (item === target) break
    if (item.entry.id === target.entry.id && item.request !== undefined) revision = item.request.revision
  }
  const request = setObservationMutation(target.entry, target.kind ?? 'insert', mutationKey(target),
    isInsert(target) ? 0 : revision)
  return queue.map((item) => item === target ? { ...item, request } : item)
}
