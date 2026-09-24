/**
 * EXE-01 — the one path a block is completed through, as a component.
 *
 * `block-completion.ts` is the vocabulary: the outcome a renderer observed, the
 * row that outcome maps to, and the seam (`useBlockCompletion`) the renderers
 * call. This file is the half that *does* something with it, and it is one
 * module rather than code inside the shell for the reason the requirement
 * gives: EMOM, AMRAP, For Time and the ladders must record perceived effort and
 * write `block_results` through a single path, so that path needs to be a thing
 * that can be pointed at, tested on its own, and asserted to be the only one
 * (`src/test/block-completion-ownership.test.ts`).
 *
 * What it owns, and what it deliberately does not:
 *
 *   · **Owns** the effort question — asked once, by the same dialog, whatever
 *     the structure — the `block_results` write, and the record of which blocks
 *     this session has already written. A second completion of the same block
 *     is refused here, so no renderer has to remember it.
 *   · **Does not own** what a block's outcome *is*. A renderer supplies the
 *     fields its structure actually observed and nothing else; an absent field
 *     is `null` in the row rather than a zero nobody measured.
 *   · **Does not own** how a failure is shown. The shell has one error surface
 *     for the session's lifecycle and for this, so the failure is handed up
 *     rather than rendered twice.
 *
 * It lives beside `auth-provider.tsx` for the same reason that one does: this
 * is the React half of a state contract — subscribe, reduce, render — and the
 * dialog it mounts is composed from `src/ui`, not declared here.
 */
import { useCallback, useMemo, useState, type ReactNode } from 'react'

import { BlockEffortDialog } from '../ui/block-effort'
import {
  BlockCompletionContext,
  type BlockCompletionApi,
  type BlockOutcome,
} from './block-completion'
import type { AppError } from './errors'
import { isErr } from './errors'
import type { BlockProgress } from './workout-progress'
import { useWorkoutClients } from './workout-queries'

interface PendingCompletion {
  readonly block: BlockProgress
  readonly outcome: BlockOutcome
}

export interface BlockCompletionProviderProps {
  /**
   * Every block in the session. The completion seam takes an id, and this is
   * what turns that id into the block whose identity the effort question names
   * — and what makes a completion for a block that is not in this session a
   * no-op rather than a row keyed to something the user is not performing.
   */
  blocks: readonly BlockProgress[]
  /** Where a failed write is shown: the shell's one error surface. */
  onFailure: (error: AppError) => void
  children: ReactNode
}

export function BlockCompletionProvider({
  blocks,
  onFailure,
  children,
}: BlockCompletionProviderProps) {
  const { blockResults } = useWorkoutClients()

  const [recorded, setRecorded] = useState<readonly string[]>([])
  const [pending, setPending] = useState<PendingCompletion | null>(null)
  const [saving, setSaving] = useState(false)

  const completion = useMemo<BlockCompletionApi>(
    () => ({
      completeBlock(blockId, outcome) {
        if (recorded.includes(blockId)) return
        const block = blocks.find((candidate) => candidate.blockId === blockId)
        if (block === undefined) return
        setPending({ block, outcome })
      },
      isBlockRecorded(blockId) {
        return recorded.includes(blockId)
      },
    }),
    [blocks, recorded],
  )

  const record = useCallback(
    async (perceivedEffort: number) => {
      if (pending === null) return

      setSaving(true)
      const result = await blockResults.record({
        blockId: pending.block.blockId,
        outcome: pending.outcome,
        perceivedEffort,
      })
      setSaving(false)

      if (isErr(result)) {
        // The block stays completable: a performed block must never be lost
        // because one write failed, and the outcome the renderer observed is
        // still whatever the renderer will hand over on the next attempt.
        setPending(null)
        onFailure(result.error)
        return
      }

      setRecorded((current) => [...current, pending.block.blockId])
      setPending(null)
    },
    [blockResults, onFailure, pending],
  )

  return (
    <BlockCompletionContext value={completion}>
      {children}
      <BlockEffortDialog
        open={pending !== null}
        identity={pending?.block.identity ?? null}
        outcome={pending?.outcome ?? null}
        saving={saving}
        onConfirm={(effort) => void record(effort)}
        onCancel={() => setPending(null)}
      />
    </BlockCompletionContext>
  )
}
