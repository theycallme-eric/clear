/** The exact, durable request and acknowledgement for one set mutation. */
import type { Enums, Json } from '../data/database.types'
import { createError, err, ErrorCode, ok, type Result } from './errors'
import { parseBoundary, exerciseSetLogRowSchema, type ExerciseSetLogRow } from './schemas'
import { setLogInsert, type SetLogEntry } from './set-logging'

export type SetObservationOperation = 'insert' | 'correct' | 'clear'

export interface SetObservationValues {
  readonly [key: string]: Json | undefined
  readonly actual_reps?: number | null
  readonly actual_duration_seconds?: number | null
  readonly actual_distance?: number | null
  readonly actual_distance_unit?: Enums<'distance_unit'> | null
  readonly weight?: number | null
  readonly weight_unit?: Enums<'weight_unit'>
  readonly effort?: Enums<'set_effort'> | null
  readonly is_warmup_set?: boolean
  readonly rpe?: number | null
}

export interface SetObservationMutation {
  readonly observation_id: string
  readonly mutation_id: string
  readonly revision: number
  readonly expected_revision: number
  readonly operation: SetObservationOperation
  readonly exercise_id: string
  readonly set_number: number
  readonly values: SetObservationValues
}

export interface SetObservationHead {
  readonly revision: number
  readonly mutation_id: string
  readonly cleared: boolean
  readonly row: ExerciseSetLogRow | null
}

export interface SetObservationAck {
  readonly outcome: 'applied' | 'replayed'
  readonly mutation: SetObservationMutation
  readonly head: SetObservationHead
}

/** All measurements are explicit; omitted input is unanswered, never zero. */
export function setObservationMutation(
  entry: SetLogEntry,
  operation: SetObservationOperation = 'insert',
  mutationId = entry.id,
  expectedRevision = 0,
): SetObservationMutation {
  const row = setLogInsert(entry)
  const values: SetObservationValues = operation === 'clear' ? {} : {
    actual_reps: row.actual_reps ?? null,
    actual_duration_seconds: row.actual_duration_seconds ?? null,
    actual_distance: row.actual_distance ?? null,
    actual_distance_unit: row.actual_distance_unit ?? null,
    weight: row.weight ?? null,
    weight_unit: row.weight_unit,
    effort: entry.performed.effort ?? null,
    ...(operation === 'insert' ? {
      is_warmup_set: row.is_warmup_set ?? false,
      // Older outboxes may carry a numeric RPE. Preserve that observation;
      // the current UI never supplies this key, and corrections never write it.
      rpe: (entry.performed as { readonly rpe?: number }).rpe ?? null,
    } : {}),
  }
  return {
    observation_id: entry.id,
    mutation_id: mutationId,
    revision: expectedRevision + 1,
    expected_revision: expectedRevision,
    operation,
    exercise_id: entry.exerciseId,
    set_number: entry.performed.setNumber,
    values,
  }
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** JSON object order is irrelevant; keys, nulls and values are not. */
export function sameSetMutation(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (!object(left) || !object(right)) return false
  const keys = Object.keys(left).sort()
  return JSON.stringify(keys) === JSON.stringify(Object.keys(right).sort())
    && keys.every((key) => sameSetMutation(left[key], right[key]))
}

export function isSetObservationMutation(value: unknown): value is SetObservationMutation {
  if (!object(value) || !object(value.values)) return false
  return typeof value.observation_id === 'string' && value.observation_id !== ''
    && typeof value.mutation_id === 'string' && value.mutation_id !== ''
    && typeof value.exercise_id === 'string' && value.exercise_id !== ''
    && Number.isSafeInteger(value.revision) && Number(value.revision) > 0
    && Number.isSafeInteger(value.expected_revision) && Number(value.expected_revision) >= 0
    && value.revision === Number(value.expected_revision) + 1
    && Number.isSafeInteger(value.set_number) && Number(value.set_number) > 0
    && (value.operation === 'insert' || value.operation === 'correct' || value.operation === 'clear')
}

/** Row metadata comes from the server; old rows are revision zero. */
export function observationRevision(row: ExerciseSetLogRow): number {
  return (row as ExerciseSetLogRow & { mutation_revision?: number }).mutation_revision ?? 0
}

export function observationMutationId(row: ExerciseSetLogRow): string | null {
  return (row as ExerciseSetLogRow & { last_mutation_id?: string | null }).last_mutation_id ?? null
}

/** A current row can confirm values only for the exact mutation it names. */
function matchesValues(row: ExerciseSetLogRow, request: SetObservationMutation): boolean {
  const values = row as unknown as Record<string, unknown>
  return Object.entries(request.values).every(([key, value]) => values[key] === value)
}

/** Missing, mismatched or malformed acknowledgements never settle the outbox. */
export function parseSetObservationAck(value: unknown, request: SetObservationMutation): Result<SetObservationAck> {
  const refusal = (code: ErrorCode = ErrorCode.PERSISTENCE_READ_FAILED) => err(createError(code, {
    details: { operation: 'set-observation-mutation', observationId: request.observation_id },
  }))
  if (!object(value)) return refusal()
  if (value.outcome === 'conflict') return refusal(ErrorCode.PERSISTENCE_CONFLICT)
  if (value.outcome === 'not_found') return refusal(ErrorCode.PERSISTENCE_NOT_FOUND)
  if (value.outcome === 'invalid_transition') return refusal(ErrorCode.VALIDATION_CONSTRAINT)
  if (value.outcome === 'invalid') return refusal(ErrorCode.VALIDATION_INVALID_FORMAT)
  if ((value.outcome !== 'applied' && value.outcome !== 'replayed')
    || !sameSetMutation(value.mutation, request) || !object(value.head)) return refusal()

  const head = value.head
  if (!Number.isSafeInteger(head.revision) || Number(head.revision) < request.revision
    || typeof head.mutation_id !== 'string' || head.mutation_id === ''
    || typeof head.cleared !== 'boolean'
    || (head.revision === request.revision && head.mutation_id !== request.mutation_id)
    || (head.revision !== request.revision && head.mutation_id === request.mutation_id)
    || (value.outcome === 'applied' && head.revision !== request.revision)) return refusal()

  let row: ExerciseSetLogRow | null = null
  if (head.cleared) {
    if (head.row !== null) return refusal()
  } else {
    const parsed = parseBoundary(exerciseSetLogRowSchema, head.row, { code: ErrorCode.PERSISTENCE_READ_FAILED })
    if (!parsed.ok) return parsed
    row = parsed.value
    if (row.id !== request.observation_id || row.workout_exercise_id !== request.exercise_id
      || row.set_number !== request.set_number || observationRevision(row) !== head.revision
      || observationMutationId(row) !== head.mutation_id) return refusal()
  }
  if (head.revision === request.revision
    && (head.cleared !== (request.operation === 'clear') || (row !== null && !matchesValues(row, request)))) return refusal()

  return ok({
    outcome: value.outcome,
    mutation: request,
    head: { revision: Number(head.revision), mutation_id: head.mutation_id, cleared: head.cleared, row },
  })
}
