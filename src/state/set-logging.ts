/**
 * EXE-02 — a logged set, which the shell writes and the renderers do not.
 *
 * This is `block-completion.ts`'s shape applied to the other half of execution,
 * and for the same reason: a set is a row in `exercise_set_logs`, every
 * structure that logs one logs the same row, and a second writer is how "each
 * logged set is a row written at log time" stops being true for one renderer
 * without any behavioural test noticing. So a renderer observes a set and hands
 * it over; the provider mints its id, stamps the unit and writes it.
 *
 * What the vocabulary insists on, because the schema does:
 *
 *   · **Typed absence.** An omitted field is `null` — not recorded — and never
 *     zero. `actual_reps = 0` is a failed attempt and a different row from one
 *     where the field was left alone (DATA_MODEL §8).
 *   · **The modality actually prescribed.** Reps, seconds and distance are
 *     three columns, not one number with a label. A set carries whichever the
 *     prescription asked for, and `prescription.ts` is what decides which.
 *   · **The unit on the row.** `weight_unit` is NOT NULL and is stamped at
 *     write time from the profile in force *then*. A preference changed in
 *     March must not reinterpret what was lifted in January.
 *   · **A client-generated id.** `exercise_set_logs.id` has no server default,
 *     so the id is minted where the set happened and EXE-07's retried flush
 *     collides with the first write instead of inventing a second set.
 *
 * `blockId` travels with an entry and lands in no column: the row is attributed
 * to the block by its prescription's `block_id`, one join away. It is here
 * because the provider must be able to refuse a set for an exercise that is not
 * in a block of this session — attribution checked against the structure the
 * user is actually performing, rather than trusted from a caller.
 */
import { createContext, use } from 'react'

import { Constants, type Enums, type TablesInsert, type TablesUpdate } from '../data/database.types'
import type { Result } from './errors'
import type { ExerciseSetLogRow } from './schemas'

// ─────────────────────────────────────────────────────────────────────────────
// Vocabulary
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One set, as the renderer observed it. Every measurement is optional and
 * omitting one records `null` rather than a zero nobody performed.
 */
export interface PerformedSet {
  /** 1-based, and the set's identity: `(exercise, set_number)` is unique. */
  readonly setNumber: number
  /** Modality `reps`. */
  readonly reps?: number
  /** Modality `time`. */
  readonly durationSeconds?: number
  /** Modality `distance`, in the prescription's own unit. */
  readonly distance?: number
  /** What was on the bar, in the unit stamped on the row. */
  readonly weight?: number
  /** Optional per-set UI choice, resolved once by the provider before queuing. */
  readonly weightUnit?: Enums<'weight_unit'>
  /**
   * A warmup set is performed work that is not a working set. No control sets
   * it any more (REQ-015); it is kept so a set already classified — a queued
   * entry written before the checkbox went — keeps its classification.
   */
  readonly isWarmup?: boolean
  /**
   * How the set felt, as one of three categories (REQ-012). Omitted or `null`
   * is unanswered — never the middle category, never a number on the RPE
   * scale. An entry queued before this field existed simply has no key.
   */
  readonly effort?: Enums<'set_effort'> | null
}

/** A performed set, plus everything the row needs that the renderer is not told. */
export interface SetLogEntry {
  /** Minted where the set happened, so a retry is idempotent (EXE-07). */
  readonly id: string
  /** `workout_exercises.id` — the prescription actually performed. */
  readonly exerciseId: string
  /** The block it was performed in. Attribution, not a column — see above. */
  readonly blockId: string
  /** The prescription's unit, for a distance. Null for every other modality. */
  readonly distanceUnit: Enums<'distance_unit'> | null
  /** Stamped per row at write time, never read back from the profile later. */
  readonly weightUnit: Enums<'weight_unit'>
  readonly performed: Omit<PerformedSet, 'weightUnit'>
}

/**
 * Where a set stands between the user performing it and the database holding
 * it (EXE-07). Three states, because the screen must be able to tell them
 * apart: `logged` is a row the database has, `syncing` is a set written to the
 * durable queue and on its way, and `failed` is one whose write came back
 * refused and is being retried. Only `logged` may be drawn as confirmed.
 */
export type SetSyncStatus = 'logged' | 'syncing' | 'failed'

/**
 * A set as it now stands, whether it was read from the snapshot or written a
 * moment ago. Nullable throughout, because the row is.
 */
export interface LoggedSet {
  readonly setNumber: number
  readonly reps: number | null
  readonly durationSeconds: number | null
  readonly distance: number | null
  readonly distanceUnit: Enums<'distance_unit'> | null
  readonly weight: number | null
  readonly weightUnit: Enums<'weight_unit'>
  readonly isWarmup: boolean
  /** The effort category, or `null` for unanswered — including every older set. */
  readonly effort: Enums<'set_effort'> | null
  /** Whether the database has this set, or only this device does (EXE-07). */
  readonly status: SetSyncStatus
}

// ─────────────────────────────────────────────────────────────────────────────
// The row
// ─────────────────────────────────────────────────────────────────────────────

/** `undefined` is not a value the database can hold; `null` is the observation. */
function recorded<T>(value: T | undefined): T | null {
  return value ?? null
}

/**
 * The `exercise_set_logs` insert, from an entry. Pure, so the mapping is
 * testable without a transport, and typed by the generated `Insert` shape so a
 * renamed column fails to compile here rather than 400ing at PostgREST.
 *
 * `prescription_revision_status` is deliberately absent: it is not
 * client-settable (DATA-01d §6), it carries its own default, and that default
 * is what makes the composite foreign key refuse a prescription that has
 * already been swapped out.
 */
export function setLogInsert(entry: SetLogEntry): TablesInsert<'exercise_set_logs'> {
  const { performed } = entry

  return {
    id: entry.id,
    workout_exercise_id: entry.exerciseId,
    set_number: performed.setNumber,
    actual_reps: recorded(performed.reps),
    actual_duration_seconds: recorded(performed.durationSeconds),
    actual_distance: recorded(performed.distance),
    // A distance with no unit is a number, not a measurement. The unit is only
    // written when there is a distance to measure with it.
    actual_distance_unit: performed.distance === undefined ? null : entry.distanceUnit,
    weight: recorded(performed.weight),
    weight_unit: entry.weightUnit,
    // Effort is not collected (REQ-015). The column stays nullable and keeps
    // its historical values; this writer only ever says "not recorded".
    // Restoration: docs/specs/generation/OPTIONAL_FEEDBACK_RESTORATION.md.
    rpe: null,
    is_warmup_set: performed.isWarmup ?? false,
    // REQ-012: the category, in its own column and never in `rpe`. Unanswered
    // is written by omission — the column has no default, so the row stores
    // NULL — which keeps an unanswered set writable against a database the
    // additive migration has not reached yet.
    ...(performed.effort === undefined || performed.effort === null
      ? {}
      : { effort: performed.effort }),
  }
}

/**
 * The `exercise_set_logs` update that corrects one stored set's effort
 * (REQ-012): another category, or `null` to clear it back to unanswered. Only
 * the one column, so a correction cannot disturb the measurements or `rpe`.
 * Correction orchestration is TASK-011's; this is the row it writes.
 */
export function setLogEffortUpdate(
  effort: Enums<'set_effort'> | null,
): TablesUpdate<'exercise_set_logs'> {
  return { effort }
}

/** The field an entry would be refused on, in the database's own vocabulary. */
export interface SetLogViolation {
  readonly field: string
  readonly min?: number
  readonly max?: number
}

/**
 * The CHECK constraints of `exercise_set_logs`, mirrored — so a set that cannot
 * be stored is refused in the caller's vocabulary rather than as a 400 nobody
 * can act on. Every measurement admits zero: a failed attempt is a result.
 */
export function setLogViolation(entry: SetLogEntry): SetLogViolation | null {
  const { performed } = entry

  if (!Number.isInteger(performed.setNumber) || performed.setNumber < 1) {
    return { field: 'set_number', min: 1 }
  }
  if (!isNonNegativeInteger(performed.reps)) return { field: 'actual_reps', min: 0 }
  if (!isNonNegativeInteger(performed.durationSeconds)) {
    return { field: 'actual_duration_seconds', min: 0 }
  }
  if (!isNonNegative(performed.distance)) return { field: 'actual_distance', min: 0 }
  if (performed.distance !== undefined && entry.distanceUnit === null) {
    return { field: 'actual_distance_unit' }
  }
  if (!isNonNegative(performed.weight)) return { field: 'weight', min: 0 }
  if (!isRecordedEffort(performed.effort)) return { field: 'effort' }

  return null
}

/** Unanswered, or exactly one of the enum's categories — never a number. */
export function isRecordedEffort(value: unknown): value is Enums<'set_effort'> | null | undefined {
  return (
    value === undefined ||
    value === null ||
    (typeof value === 'string' &&
      (Constants.public.Enums.set_effort as readonly string[]).includes(value))
  )
}

function isNonNegative(value: number | undefined): boolean {
  return value === undefined || (Number.isFinite(value) && value >= 0)
}

function isNonNegativeInteger(value: number | undefined): boolean {
  return value === undefined || (Number.isInteger(value) && value >= 0)
}

/** A stored row, as the screen reads it back: the database has this one. */
export function loggedSetFromRow(row: ExerciseSetLogRow): LoggedSet {
  return {
    setNumber: row.set_number,
    reps: row.actual_reps,
    durationSeconds: row.actual_duration_seconds,
    distance: row.actual_distance,
    distanceUnit: row.actual_distance_unit,
    weight: row.weight,
    weightUnit: row.weight_unit,
    isWarmup: row.is_warmup_set,
    effort: row.effort,
    status: 'logged',
  }
}

/**
 * A set the durable queue is holding (EXE-07), as the screen reads it. The
 * numbers are the ones the user typed — the row does not exist yet — and the
 * status is what stops the screen drawing it as confirmed. An omitted
 * measurement reads back as `null` here for the same reason it is written as
 * `null`: not recorded is not zero.
 *
 * `logged` is a legitimate status to ask for, in exactly one case: the insert
 * came back as a collision on this entry's own client-minted id, which means
 * the database is holding precisely these values already.
 */
export function loggedSetFromEntry(
  entry: SetLogEntry,
  status: SetSyncStatus,
): LoggedSet {
  const { performed } = entry

  return {
    setNumber: performed.setNumber,
    reps: recorded(performed.reps),
    durationSeconds: recorded(performed.durationSeconds),
    distance: recorded(performed.distance),
    distanceUnit: performed.distance === undefined ? null : entry.distanceUnit,
    weight: recorded(performed.weight),
    weightUnit: entry.weightUnit,
    isWarmup: performed.isWarmup ?? false,
    effort: recorded(performed.effort),
    status,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Prefill
// ─────────────────────────────────────────────────────────────────────────────

/** What the next set's fields start at, when there is something to start from. */
export interface SetPrefill {
  readonly weight: number | null
  /** The observed number's own unit, never the current profile preference. */
  readonly weightUnit: Enums<'weight_unit'>
  readonly reps: number | null
  readonly durationSeconds: number | null
  readonly distance: number | null
}

/**
 * The last thing this exercise was actually performed at — the highest set
 * number already logged, which for a resumed session is the set before the one
 * the user is about to do.
 *
 * A warmup set is not a reference point: prefilling a working set from the
 * empty bar is worse than prefilling nothing, so warmups are skipped unless
 * they are all there is.
 *
 * What it deliberately does not do is reach across sessions. Last week's
 * working weight lives behind a catalog-keyed read of `exercise_set_logs` that
 * no migration currently offers — `get_last_set_data` was dropped as Replace
 * and re-authored by OVR-01 (DATA-01d §1) — so widening the prefill to prior
 * sessions is that issue's, and this function is where it will attach.
 */
export function prefillFrom(sets: readonly LoggedSet[]): SetPrefill | null {
  if (sets.length === 0) return null

  const working = sets.filter((set) => !set.isWarmup)
  const source = [...(working.length === 0 ? sets : working)].sort(
    (left, right) => right.setNumber - left.setNumber,
  )[0]

  if (source === undefined) return null

  return {
    weight: source.weight,
    weightUnit: source.weightUnit,
    reps: source.reps,
    durationSeconds: source.durationSeconds,
    distance: source.distance,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The seam the renderers use
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What the session owes the database, as one fact the shell can state once
 * (EXE-07). It is a count and a flag rather than a list of errors because the
 * requirement is explicit: sustained failure surfaces once, factually, with
 * the number of unsynced sets — never a toast per set.
 */
export interface SetSyncState {
  /** Sets held on this device that the database has not confirmed. */
  readonly unsyncedCount: number
  /**
   * True once a queued set has been refused more than once, or refused by
   * something a retry cannot fix. Below that, a set in the queue is ordinary
   * and says so on its own row without the shell raising anything.
   */
  readonly sustainedFailure: boolean
  /** True while a flush pass is actually in flight. */
  readonly syncing: boolean
}

export interface SetLoggingApi {
  /**
   * The unit every row this session writes is stamped with, so the screen can
   * say which one a number is in. `null` when the profile is unread, which is
   * also when a set cannot be written at all.
   */
  readonly weightUnit: Enums<'weight_unit'> | null
  /**
   * Hands one performed set to the shell, which writes it to the durable queue
   * immediately and flushes it from there (EXE-07). A renderer never sees the
   * row, the unit or the id — which is what keeps `exercise_set_logs` to one
   * writer for every structure type.
   */
  logSet(exerciseId: string, performed: PerformedSet): void
  /**
   * Every set recorded against this prescription, lowest set first — the rows
   * the database holds and the ones still queued alike, each carrying the
   * status that says which it is.
   */
  loggedSets(exerciseId: string): readonly LoggedSet[]
  /** True while this exercise has a set in flight. */
  isSaving(exerciseId: string): boolean
  /** What this session still owes the database. */
  readonly sync: SetSyncState
  /** Flushes the queue now: the one recovery action the notice offers. */
  retrySync(): void
}

export const SetLoggingContext = createContext<SetLoggingApi | null>(null)

/** The section action waits for actual queued observations before continuing. */
export const SetLogFlushContext = createContext<(() => Promise<Result<undefined>>) | null>(null)

export function useFlushSetLogs(): () => Promise<Result<undefined>> {
  const flush = use(SetLogFlushContext)
  if (flush === null) throw new Error('useFlushSetLogs was called outside the workout shell')
  return flush
}

/**
 * The renderers' half of the contract. Throwing outside the shell is the point:
 * a renderer that has escaped it would otherwise silently drop the sets the
 * user performed.
 */
export function useSetLogging(): SetLoggingApi {
  const api = use(SetLoggingContext)
  if (api === null) {
    throw new Error('useSetLogging was called outside the workout shell')
  }
  return api
}
