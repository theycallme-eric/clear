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
  type SectionCompletionApi,
  type TimedResultReport,
} from './block-completion'
import type { AppError, Result } from './errors'
import { ErrorCode, isErr, ok } from './errors'
import { reportedTimedEntries, saveTimedResult, timedDraftFromReport, timedResultRequest } from './timed-results'
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
  const recordedListeners = useRef(new Map<string, Set<() => void>>())
  const latest = useRef({ blocks, blockResults, onRecorded })
  useEffect(() => {
    latest.current = { blocks, blockResults, onRecorded }
  })

  const remember = useCallback((blockId: string) => {
    if (written.current.has(blockId)) return
    written.current.add(blockId)
    // In the same act, before the state below renders and before a forward
    // action moves on: a renderer keeping a durable record closes it now.
    for (const listener of [...(recordedListeners.current.get(blockId) ?? [])]) listener()
    setRecorded(new Set(written.current))
    latest.current.onRecorded?.(blockId)
  }, [])

  const onBlockRecorded = useCallback((blockId: string, listener: () => void) => {
    const listeners = recordedListeners.current.get(blockId) ?? new Set<() => void>()
    listeners.add(listener)
    recordedListeners.current.set(blockId, listeners)
    return () => {
      listeners.delete(listener)
      if (listeners.size === 0 && recordedListeners.current.get(blockId) === listeners) {
        recordedListeners.current.delete(blockId)
      }
    }
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
            remember(entry.block.id)
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
  const saveTimed = useCallback(async (blockId: string, outcome: BlockOutcome, report: TimedResultReport): Promise<Result<unknown>> => {
    const block = latest.current.blocks.find((candidate) => candidate.blockId === blockId)
    if (block === undefined) return ok(undefined)
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
            const result = timed !== undefined && reportedTimedEntries(timed)
              ? await saveTimed(blockId, outcome, timed)
              : await latest.current.blockResults.record({
                  blockId,
                  outcome,
                  perceivedEffort: null,
                })
            if (isErr(result) && !isAlreadyRecorded(result.error)) return result

            remember(blockId)
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
    [remember, saveTimed],
  )

  const completion = useMemo<BlockCompletionApi>(
    () => ({
      reportOutcome,
      reportTimedResult,
      isBlockRecorded: (blockId) => recorded.has(blockId),
      sessionId,
      onBlockRecorded,
    }),
    [onBlockRecorded, recorded, reportOutcome, reportTimedResult, sessionId],
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
