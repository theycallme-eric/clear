/**
 * EXE-01 — the one path a block is completed through, as a component.
 *
 * `block-completion.ts` is the vocabulary: the outcome a renderer observed, the
 * row that outcome maps to, and the two seams — `useBlockCompletion` for the
 * renderers, `useSectionCompletion` for the shell's forward action. This file
 * is the half that *does* something with them, and it is one module rather than
 * code inside the shell for the reason the requirement gives: every structure
 * must write `block_results` through a single path, so that path needs to be a
 * thing that can be pointed at, tested on its own, and asserted to be the only
 * one (`src/test/block-completion-ownership.test.ts`).
 *
 * What it owns, and what it deliberately does not:
 *
 *   · **Owns** the latest outcome each block has reported, the `block_results`
 *     write, and the record of which blocks this session has already written.
 *     The write happens only when the section's forward action asks for it
 *     (REQ-013): reporting is observation, completion is explicit.
 *   · **Owns** idempotency. A forward action pressed twice answers the save in
 *     flight; a retry writes only the blocks an earlier attempt did not; and a
 *     block whose row already exists — written before a reload, or by an
 *     attempt whose answer was lost — counts as recorded rather than as a
 *     failure, because `block_results.block_id` is unique and the row is there.
 *   · **Owns** saying so at once (TASK-014, AC-R014-03). The moment a block's
 *     row is known to exist — this device's insert answered, a row already
 *     there, or the performed read — `onBlockRecorded` listeners for it are
 *     called in the same act, before `isBlockRecorded` renders and before the
 *     forward action moves on, so a renderer's durable record of the attempt
 *     (the ladder's Undo checkpoint) is closed even if the section is left in
 *     that same render. It is the same fact as `isBlockRecorded`, not a
 *     second writer and not a save receipt per device (TASK-048's).
 *   · **Does not own** what a block's outcome *is*. A renderer supplies the
 *     fields its structure actually observed and nothing else; an absent field
 *     is `null` in the row rather than a zero nobody measured.
 *   · **Does not own** how a failure is shown or what happens next. The forward
 *     action receives the error, keeps the athlete where they are, and offers
 *     the retry.
 *   · **Owns the richer timed save (TASK-015, REQ-015, C37)**, still as this
 *     one path. A timed renderer may report, beside its outcome, the log's
 *     categorical effort and each movement's typed partial and load
 *     (`TimedResultReport`). When that report carries anything, the forward
 *     action saves the block through TASK-031's provider
 *     (`src/state/timed-results.ts`: the row, corrected in place on its unique
 *     key's 23505, then the `block_movement_results` rows, each movement's
 *     round decided by TASK-030's rules from the reported outcome and never
 *     from the plan). Row ids are minted here once per block, so a retry sends
 *     the same identities and converges on the same rows — a refused movement
 *     write leaves the block unrecorded here, so the retry restates the row
 *     and writes the movements once, never twice. A report with no effort and
 *     no typed entry takes the bare insert below, byte for byte as before.
 *   · **Says how a row is known, and keeps it (TASK-048, REQ-032).** The
 *     listeners above are told `saved` when this device's own save of the
 *     block's latest report was answered — the row now holds what it sent —
 *     and `known` when the row was already there (a bare insert's 23505,
 *     which leaves the row as it was) or the performed read found it. The
 *     row itself, with its movements' rows, is kept for the session
 *     (`recordedResult`): a renderer reads a saved result back from it, ahead
 *     of its own local echo, so the saved (or corrected) result stays the
 *     authority. A failed save is told to the block's `onBlockSaveFailed`
 *     listeners, so a renderer's durable draft records it for the retry. A
 *     renderer told `known` that holds a draft whose own richer save failed
 *     (the row landed, a later write did not) may reopen the block in the same
 *     act (`reopenBlock`): it is then outstanding, not recorded, and the
 *     forward action restates the row and writes its movements once.
 *
 * The numeric effort is not asked (E04): every row is written with
 * `perceived_effort` `null` through TASK-029's nullable writer, and nothing
 * defaults it or derives it from the category.
 *
 * It lives beside `auth-provider.tsx` for the same reason that one does: this
 * is the React half of a state contract — subscribe, reduce, render.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import {
  BlockCompletionContext,
  SectionCompletionContext,
  type BlockCompletionApi,
  type BlockOutcome,
  type BlockRecordedSource,
  type RecordedBlockResult,
  type SectionCompletionApi,
  type TimedResultReport,
} from './block-completion'
import type { AppError, Result } from './errors'
import { ErrorCode, isErr, ok } from './errors'
import { reportedTimedEntries, saveTimedResult, timedDraftFromReport, timedResultRequest, type SavedTimedResult } from './timed-results'
import type { BlockMovementResultRow } from './schemas'
import type { BlockProgress } from './workout-progress'
import { useWorkoutClients } from './workout-queries'

/** SQLSTATE PostgREST reports when `block_results.block_id`'s unique index refuses. */
const UNIQUE_VIOLATION = '23505'

/** The block already has its row: completion is already saved. */
function isAlreadyRecorded(error: AppError): boolean {
  return (
    error.code === ErrorCode.PERSISTENCE_CONFLICT &&
    error.details?.pgCode === UNIQUE_VIOLATION
  )
}

export interface BlockCompletionProviderProps {
  sessionId: string
  /** Confirmed server rows, for the shell's progress projection only. */
  onRecorded?: (blockId: string) => void
  /**
   * Every block in the session. The completion seam takes ids, and a block
   * that is not in this session is skipped rather than written as a row keyed
   * to something the user is not performing.
   */
  blocks: readonly BlockProgress[]
  children: ReactNode
}

export function BlockCompletionProvider({ sessionId, blocks, onRecorded, children }: BlockCompletionProviderProps) {
  const { blockResults, sessions } = useWorkoutClients()

  const [recorded, setRecorded] = useState<ReadonlySet<string>>(() => new Set())
  const [saving, setSaving] = useState(false)

  // Refs rather than state: a save reads them across awaits, and a second
  // forward tap in the same render must see the first one's progress.
  const written = useRef(new Set<string>())
  const outcomes = useRef(new Map<string, BlockOutcome>())
  // TASK-015: the timed logs' latest reports, and the movement row ids minted
  // once per block so every retry addresses the same rows.
  const timedReports = useRef(new Map<string, TimedResultReport>())
  const movementRowIds = useRef(new Map<string, Record<string, string>>())
  const inFlight = useRef<Promise<Result<undefined>> | null>(null)
  // TASK-014: renderers told the moment a block's row is known to exist.
  const recordedListeners = useRef(new Map<string, Set<(source: BlockRecordedSource) => void>>())
  // TASK-048: renderers told when a block's save fails, and the rows known.
  const failedListeners = useRef(new Map<string, Set<() => void>>())
  const recordedRows = useRef(new Map<string, RecordedBlockResult>())
  const latest = useRef({ blocks, blockResults, onRecorded })
  useEffect(() => {
    latest.current = { blocks, blockResults, onRecorded }
  })

  const remember = useCallback((blockId: string, source: BlockRecordedSource, known: RecordedBlockResult | null) => {
    if (written.current.has(blockId)) return
    written.current.add(blockId)
    if (known !== null) recordedRows.current.set(blockId, known)
    // In the same act, before the state below renders and before a forward
    // action moves on: a renderer keeping a durable record closes it now.
    for (const listener of [...(recordedListeners.current.get(blockId) ?? [])]) listener(source)
    // TASK-048: a listener reopened the block (its own richer save failed and
    // was never confirmed): it stays outstanding for the forward action.
    if (!written.current.has(blockId)) return
    setRecorded(new Set(written.current))
    latest.current.onRecorded?.(blockId)
  }, [])

  const onBlockRecorded = useCallback((blockId: string, listener: (source: BlockRecordedSource) => void) => {
    const listeners = recordedListeners.current.get(blockId) ?? new Set<(source: BlockRecordedSource) => void>()
    listeners.add(listener)
    recordedListeners.current.set(blockId, listeners)
    return () => {
      listeners.delete(listener)
      if (listeners.size === 0 && recordedListeners.current.get(blockId) === listeners) {
        recordedListeners.current.delete(blockId)
      }
    }
  }, [])

  // TASK-048: told when the forward action's save of the block fails.
  const onBlockSaveFailed = useCallback((blockId: string, listener: () => void) => {
    const listeners = failedListeners.current.get(blockId) ?? new Set<() => void>()
    listeners.add(listener)
    failedListeners.current.set(blockId, listeners)
    return () => {
      listeners.delete(listener)
      if (listeners.size === 0 && failedListeners.current.get(blockId) === listeners) {
        failedListeners.current.delete(blockId)
      }
    }
  }, [])

  // TASK-048: the block is outstanding again — only from a `known` listener.
  const reopenBlock = useCallback((blockId: string) => {
    if (!written.current.delete(blockId)) return
    recordedRows.current.delete(blockId)
    setRecorded(new Set(written.current))
  }, [])

  useEffect(() => {
    let current = true
    // The existing performed reader includes actual block_results while a
    // session is active. The ordinary resume snapshot does not carry them.
    // Failed/absent reads make no completion claim; an explicit resave can
    // still recover through the existing unique-block idempotency guard.
    void sessions.asPerformed(sessionId).then((result) => {
      if (!current || isErr(result) || result.value?.session.id !== sessionId) return
      const known = new Set(latest.current.blocks.map((block) => block.blockId))
      for (const section of result.value.sections) {
        for (const entry of section.blocks) {
          if (entry.block_result?.block_id === entry.block.id && known.has(entry.block.id)) {
            const movements: Record<string, BlockMovementResultRow> = {}
            for (const exercise of entry.exercises) {
              if (exercise.movement_result !== null) movements[exercise.exercise.id] = exercise.movement_result
            }
            remember(entry.block.id, 'known', { row: entry.block_result, movements })
          }
        }
      }
    }).catch(() => {
      // An unavailable optional read cannot invent completion or prevent a
      // new explicit save through the authoritative writer.
    })
    return () => { current = false }
  }, [remember, sessionId, sessions])

  const reportOutcome = useCallback((blockId: string, outcome: BlockOutcome) => {
    // Kept after the renderer unmounts: going back a section, or on to the
    // next and back, must not lose what this block observed.
    outcomes.current.set(blockId, outcome)
  }, [])

  // TASK-015: kept the same way, so a walk to the next section and back does
  // not lose a typed entry the forward action has not saved yet.
  const reportTimedResult = useCallback((blockId: string, report: TimedResultReport | null) => {
    if (report === null) timedReports.current.delete(blockId)
    else timedReports.current.set(blockId, report)
  }, [])

  /**
   * TASK-015: the richer save for a block whose timed log reported an effort
   * or a typed movement entry — through TASK-031's provider, over the same
   * writers. Pure in what it sends: the same report builds the same request.
   */
  const saveTimed = useCallback(async (blockId: string, outcome: BlockOutcome, report: TimedResultReport): Promise<Result<SavedTimedResult | null>> => {
    const block = latest.current.blocks.find((candidate) => candidate.blockId === blockId)
    if (block === undefined) return ok(null)
    let rowIds = movementRowIds.current.get(blockId)
    if (rowIds === undefined) {
      rowIds = Object.fromEntries(block.exercises.map((exercise) => [exercise.exerciseId, crypto.randomUUID()]))
      movementRowIds.current.set(blockId, rowIds)
    }
    const request = timedResultRequest(timedDraftFromReport(blockId, outcome, report, rowIds), {
      block: { id: blockId, rounds: block.rounds },
      movements: block.exercises.map((exercise) => exercise.prescription),
      ...(report.rungCount === undefined ? {} : { rungCount: report.rungCount }),
      weightUnit: report.weightUnit,
    })
    if (isErr(request)) return request
    return saveTimedResult(latest.current.blockResults, request.value)
  }, [])

  /** TASK-048: a failed save of the block, told to its renderer. */
  const failed = useCallback((blockId: string) => {
    for (const listener of [...(failedListeners.current.get(blockId) ?? [])]) listener()
  }, [])

  const completeSection = useCallback(
    (blockIds: readonly string[]): Promise<Result<undefined>> => {
      if (inFlight.current !== null) return inFlight.current

      const known = new Set(latest.current.blocks.map((block) => block.blockId))
      const outstanding = blockIds.filter(
        (blockId) => known.has(blockId) && !written.current.has(blockId),
      )
      if (outstanding.length === 0) return Promise.resolve(ok(undefined))

      const save = async (): Promise<Result<undefined>> => {
        setSaving(true)
        try {
          // In order, one at a time: a failure stops the save with every
          // earlier block recorded, so the retry resumes rather than repeats.
          for (const blockId of outstanding) {
            const outcome = outcomes.current.get(blockId) ?? {}
            const timed = timedReports.current.get(blockId)
            // TASK-015: a timed log with something new saves through the
            // richer provider; otherwise the insert every renderer made before.
            if (timed !== undefined && reportedTimedEntries(timed)) {
              const result = await saveTimed(blockId, outcome, timed)
              if (isErr(result)) {
                failed(blockId)
                return result
              }
              // The richer save restates a row already there, so the row now
              // holds this report either way.
              remember(blockId, 'saved', result.value === null ? null : savedRows(result.value))
              continue
            }
            const result = await latest.current.blockResults.record({
              blockId,
              outcome,
              perceivedEffort: null,
            })
            if (isErr(result)) {
              if (!isAlreadyRecorded(result.error)) {
                failed(blockId)
                return result
              }
              // The row was already there and is left as it was.
              remember(blockId, 'known', null)
              continue
            }
            remember(blockId, 'saved', { row: result.value, movements: {} })
          }
          return ok(undefined)
        } finally {
          setSaving(false)
        }
      }

      const pending = save()
      inFlight.current = pending
      // Cleared once settled — registered first, so before any caller resumes.
      const settle = () => {
        if (inFlight.current === pending) inFlight.current = null
      }
      void pending.then(settle, settle)
      return pending
    },
    [failed, remember, saveTimed],
  )

  const completion = useMemo<BlockCompletionApi>(
    () => ({
      reportOutcome,
      reportTimedResult,
      isBlockRecorded: (blockId) => recorded.has(blockId),
      sessionId,
      onBlockRecorded,
      onBlockSaveFailed,
      // Read when the recorded set renders: rows are kept before it changes.
      recordedResult: (blockId) => (recorded.has(blockId) ? (recordedRows.current.get(blockId) ?? null) : null),
      reopenBlock,
    }),
    [onBlockRecorded, onBlockSaveFailed, recorded, reopenBlock, reportOutcome, reportTimedResult, sessionId],
  )

  const section = useMemo<SectionCompletionApi>(
    () => ({ completeSection, saving }),
    [completeSection, saving],
  )

  return (
    <BlockCompletionContext value={completion}>
      <SectionCompletionContext value={section}>{children}</SectionCompletionContext>
    </BlockCompletionContext>
  )
}

/** TASK-048: what the richer save stored, as the row a renderer reads back. */
function savedRows(saved: SavedTimedResult): RecordedBlockResult {
  return {
    row: saved.block,
    movements: Object.fromEntries(saved.movements.map((movement) => [movement.workout_exercise_id, movement])),
  }
}
