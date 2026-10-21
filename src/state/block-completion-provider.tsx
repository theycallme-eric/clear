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
 *   · **Does not own** what a block's outcome *is*. A renderer supplies the
 *     fields its structure actually observed and nothing else; an absent field
 *     is `null` in the row rather than a zero nobody measured.
 *   · **Does not own** how a failure is shown or what happens next. The forward
 *     action receives the error, keeps the athlete where they are, and offers
 *     the retry.
 *
 * Effort is not asked (E04): every row is written with `perceived_effort`
 * `null` through TASK-029's nullable writer, and nothing defaults it.
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
} from './block-completion'
import type { AppError, Result } from './errors'
import { ErrorCode, isErr, ok } from './errors'
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
  const inFlight = useRef<Promise<Result<undefined>> | null>(null)
  const latest = useRef({ blocks, blockResults, onRecorded })
  useEffect(() => {
    latest.current = { blocks, blockResults, onRecorded }
  })

  const remember = useCallback((blockId: string) => {
    if (written.current.has(blockId)) return
    written.current.add(blockId)
    setRecorded(new Set(written.current))
    latest.current.onRecorded?.(blockId)
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
            const result = await latest.current.blockResults.record({
              blockId,
              outcome: outcomes.current.get(blockId) ?? {},
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
    [remember],
  )

  const completion = useMemo<BlockCompletionApi>(
    () => ({
      reportOutcome,
      isBlockRecorded: (blockId) => recorded.has(blockId),
    }),
    [recorded, reportOutcome],
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
