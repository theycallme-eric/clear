/**
 * TASK-031 (REQ-031) — the richer timed result, from the athlete's draft to
 * the saved rows: the data provider TASK-015 (entry), TASK-019 (cross-family
 * verification), TASK-026 (History) and TASK-047 (visible save, retry and
 * reload) build on.
 *
 * Three pieces, all pure or transport-injected:
 *
 *   · `timedResultRequest` — one draft (the renderer's recorded outcome, the
 *     optional categorical effort, the notes as typed and each movement's
 *     partial/load text) → the block completion and the per-movement writes,
 *     with every identity decided by the TASK-030 contract
 *     (`partialRoundFor`, `movementActualFromDraft`): the round from the
 *     block's own recorded outcome, never the plan; blank is not recorded and
 *     zero is kept; nothing is filled from targets or `load_value`. A value
 *     the contract refuses is refused here, before anything is sent.
 *   · `saveTimedResult` — the request through the shell's block writers
 *     (`record`, then `correct` on the unique key's 23505, then
 *     `recordMovements`). Every step is idempotent, so a retry of the same
 *     request after any failure — a refused save, a lost answer — converges on
 *     the same rows and never writes a second one.
 *   · `timedSaveSettled` — what the caller keeps: the draft, always, and the
 *     error until a retry succeeds.
 *
 * Where it is wired (TASK-015, REQ-015): only `BlockCompletionProvider`
 * (`src/state/block-completion-provider.tsx`) imports this module. It stays
 * the one path that saves a block: when a timed renderer's report carries an
 * effort or a typed movement entry, the section's forward action builds the
 * draft from that report (`timedDraftFromReport`) and saves it here instead of
 * the bare insert; a report with nothing new takes the insert every renderer
 * made before, byte for byte (`reportedTimedEntries`). No renderer calls
 * `blockResults.correct` / `recordMovements`. MIG-A and MIG-B were applied to
 * the hosted project by the owner's LIVE-PRE-1 (2026-11-10); a project
 * without them still refuses explicitly (`details.migration`) and the draft
 * stays.
 */
import type { Enums } from '../data/database.types'
import {
  movementActualFromDraft,
  movementEntryBlank,
  partialRoundFor,
  type MovementActualDraft,
  type PartialRoundInput,
  type PrescribedColumnsWithEquipment,
  type TimedFamily,
} from '../data/refinement-logging-rules'
import type { BlockCompletion, BlockOutcome, MovementResultWrite, TimedResultReport } from './block-completion'
import { createError, err, ErrorCode, isErr, ok, type AppError, type Result } from './errors'
import type { BlockMovementResultRow, BlockResultRow, WorkoutBlockRow } from './schemas'

// ─────────────────────────────────────────────────────────────────────────────
// The draft
// ─────────────────────────────────────────────────────────────────────────────

/** One movement of the block, as the prescription row states it. */
export type TimedMovement = PrescribedColumnsWithEquipment & { readonly id: string }

/**
 * Everything the athlete has entered for one ended timed block, as entered.
 * Nothing in it is a planned value.
 */
export interface TimedResultDraft {
  readonly blockId: string
  readonly family: TimedFamily
  /**
   * What the block's own state recorded (`amrapOutcome`, `forTimeOutcome`,
   * the ladder's rung, the EMOM's nothing) — counts, elapsed and completion.
   * Its `notes` and `effort` are this draft's own fields below.
   */
  readonly outcome: Omit<BlockOutcome, 'notes' | 'effort'>
  /** The optional categorical effort: a category, or null when unanswered. */
  readonly effort: Enums<'set_effort'> | null
  /** The notes field as typed; whitespace only is no note. */
  readonly notes: string
  /** Each movement's typed partial and load, keyed by `workout_exercises.id`. */
  readonly movements: Readonly<Record<string, MovementActualDraft>>
  /**
   * The `block_movement_results.id` minted for each movement when the draft
   * was made, so every retry sends the same row identity.
   */
  readonly rowIds: Readonly<Record<string, string>>
}

/**
 * A new draft for an ended block. Row ids are minted here, once; the minting
 * is injectable so a test is deterministic.
 */
export function timedResultDraft(
  blockId: string,
  family: TimedFamily,
  outcome: TimedResultDraft['outcome'],
  movements: readonly Pick<TimedMovement, 'id'>[],
  mint: () => string = () => crypto.randomUUID(),
): TimedResultDraft {
  return {
    blockId,
    family,
    outcome,
    effort: null,
    notes: '',
    movements: Object.fromEntries(movements.map(({ id }) => [id, { amount: '', weight: '' }])),
    rowIds: Object.fromEntries(movements.map(({ id }) => [id, mint()])),
  }
}

/**
 * TASK-015: whether a renderer's report carries anything the bare block
 * insert would not — a category, or a typed amount or load. With none, the
 * section save is the one every renderer made before these fields existed.
 */
export function reportedTimedEntries(report: TimedResultReport): boolean {
  return report.effort !== null || Object.values(report.movements).some((entry) => !movementEntryBlank(entry))
}

/**
 * TASK-015: the draft the section's forward action saves, from the block's
 * reported outcome and the timed log's report. The outcome is the renderer's
 * own (its notes travel as the draft's `notes`); the effort and the typed
 * entries are the report's; the row ids are the shell's, minted once per
 * block so a retry sends the same identities.
 */
export function timedDraftFromReport(
  blockId: string,
  outcome: BlockOutcome,
  report: TimedResultReport,
  rowIds: Readonly<Record<string, string>>,
): TimedResultDraft {
  const { notes, effort: _effort, ...observed } = outcome
  void _effort
  return {
    blockId,
    family: report.family,
    outcome: observed,
    effort: report.effort,
    notes: notes ?? '',
    movements: report.movements,
    rowIds,
  }
}

/** What the request is built against: the block's structure and movements. */
export interface TimedResultContext {
  readonly block: Pick<WorkoutBlockRow, 'id' | 'rounds'>
  /** The block's movements, in its order. */
  readonly movements: readonly TimedMovement[]
  /** A ladder's rung count (`ladderRungs(...).length`); required for a ladder. */
  readonly rungCount?: number
  /** Stamped at write time: the athlete's choice, else the profile's unit. */
  readonly weightUnit: Enums<'weight_unit'>
}

export interface TimedResultRequest {
  readonly completion: BlockCompletion
  /** One write per drafted movement, in the block's order. */
  readonly movements: readonly MovementResultWrite[]
  /** The round a partial amount belongs to, or null when none applies. */
  readonly partialRound: number | null
}

function refused(details: Record<string, unknown>): Result<never> {
  return err(createError(ErrorCode.VALIDATION_OUT_OF_RANGE, { details }))
}

function roundInput(draft: TimedResultDraft, context: TimedResultContext): PartialRoundInput | null {
  switch (draft.family) {
    case 'emom':
      return { family: 'emom' }
    case 'amrap':
      return { family: 'amrap', outcome: draft.outcome }
    case 'for_time':
      return { family: 'for_time', outcome: draft.outcome, block: context.block }
    case 'ladder':
      return context.rungCount === undefined ? null : { family: 'ladder', outcome: draft.outcome, rungCount: context.rungCount }
  }
}

/**
 * The draft → the completion and the movement writes, or the field it is
 * refused on (with the movement, when it is one). Pure: the same draft always
 * builds the same request, which is what makes a retry a repeat.
 */
export function timedResultRequest(
  draft: TimedResultDraft,
  context: TimedResultContext,
): Result<TimedResultRequest> {
  if (draft.blockId !== context.block.id) return refused({ field: 'block_id' })
  const input = roundInput(draft, context)
  if (input === null) return refused({ field: 'rung_count' })
  const partialRound = partialRoundFor(input)

  const known = new Set(context.movements.map((movement) => movement.id))
  const stranger = Object.keys(draft.movements).find((id) => !known.has(id))
  if (stranger !== undefined) return refused({ field: 'workout_exercise_id', workoutExerciseId: stranger })

  const movements: MovementResultWrite[] = []
  for (const movement of context.movements) {
    const entry = draft.movements[movement.id]
    if (entry === undefined) continue
    const id = draft.rowIds[movement.id]
    if (id === undefined) return refused({ field: 'id', workoutExerciseId: movement.id })
    const row = movementActualFromDraft(
      { id, workoutExerciseId: movement.id, prescription: movement, partialRound, weightUnit: context.weightUnit, draft: entry },
      draft.family,
    )
    if (isErr(row)) return refused({ ...row.error.details, workoutExerciseId: movement.id })
    movements.push({ workoutExerciseId: movement.id, row: row.value })
  }

  const outcome: BlockOutcome = {
    ...draft.outcome,
    ...(draft.notes.trim() === '' ? {} : { notes: draft.notes }),
    ...(draft.effort === null ? {} : { effort: draft.effort }),
  }
  // The legacy 1–10 number is never asked and never derived from the category.
  return ok({ completion: { blockId: draft.blockId, outcome, perceivedEffort: null }, movements, partialRound })
}

// ─────────────────────────────────────────────────────────────────────────────
// The save
// ─────────────────────────────────────────────────────────────────────────────

/** The block writers the save goes through (`createWorkoutClients().blockResults`). */
export interface TimedResultWriter {
  record(completion: BlockCompletion): Promise<Result<BlockResultRow>>
  correct(completion: BlockCompletion): Promise<Result<BlockResultRow>>
  recordMovements(writes: readonly MovementResultWrite[]): Promise<Result<BlockMovementResultRow[]>>
}

export interface SavedTimedResult {
  readonly block: BlockResultRow
  readonly movements: readonly BlockMovementResultRow[]
  /** True when the block row already existed and was restated. */
  readonly corrected: boolean
}

/** Where a failed save stopped. */
export type TimedSaveStage = 'block' | 'movements'

const UNIQUE_VIOLATION = '23505'

/** The block already has its row: the insert's unique key said so. */
function alreadyRecorded(error: AppError): boolean {
  return error.code === ErrorCode.PERSISTENCE_CONFLICT && error.details?.pgCode === UNIQUE_VIOLATION
}

function stopped(error: AppError, stage: TimedSaveStage): Result<never> {
  return err({ ...error, details: { ...error.details, stage } })
}

/**
 * Saves one timed result: the block row, then its movement rows.
 *
 *   1. Insert the block row. A 23505 means it is already there — a retry after
 *      a lost answer, or a save made before — so it is corrected to exactly
 *      this request's values (never left as the earlier attempt wrote it, and
 *      never inserted twice).
 *   2. Write each movement row (`recordMovements`: insert, restate on 23505,
 *      remove when blank).
 *
 * Any error stops the save and names its stage; nothing is undone and nothing
 * is lost — the caller still holds the draft (`timedSaveSettled`), and the
 * same request sent again converges on the same rows.
 */
export async function saveTimedResult(
  writer: TimedResultWriter,
  request: TimedResultRequest,
): Promise<Result<SavedTimedResult>> {
  let corrected = false
  let block = await writer.record(request.completion)
  if (isErr(block) && alreadyRecorded(block.error)) {
    corrected = true
    block = await writer.correct(request.completion)
  }
  if (isErr(block)) return stopped(block.error, 'block')

  if (request.movements.length === 0) return ok({ block: block.value, movements: [], corrected })
  const movements = await writer.recordMovements(request.movements)
  if (isErr(movements)) return stopped(movements.error, 'movements')

  return ok({ block: block.value, movements: movements.value, corrected })
}

// ─────────────────────────────────────────────────────────────────────────────
// What the caller keeps
// ─────────────────────────────────────────────────────────────────────────────

export interface TimedSaveState {
  /** Kept through every outcome: a failed save never discards an entry. */
  readonly draft: TimedResultDraft
  readonly status: 'editing' | 'saving' | 'failed' | 'saved'
  /** The last failure, until a save succeeds. */
  readonly error: AppError | null
  /** The rows as stored, once saved. */
  readonly saved: SavedTimedResult | null
}

export function timedSaveState(draft: TimedResultDraft): TimedSaveState {
  return { draft, status: 'editing', error: null, saved: null }
}

export function timedSaveStarted(state: TimedSaveState): TimedSaveState {
  return { ...state, status: 'saving' }
}

/** A failure keeps the draft and the error; a success keeps the draft and the rows. */
export function timedSaveSettled(state: TimedSaveState, result: Result<SavedTimedResult>): TimedSaveState {
  return isErr(result)
    ? { draft: state.draft, status: 'failed', error: result.error, saved: state.saved }
    : { draft: state.draft, status: 'saved', error: null, saved: result.value }
}
