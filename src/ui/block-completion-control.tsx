/**
 * EXE-01's completion control, as one component every renderer composes.
 *
 * It exists as its own file rather than as a button inside each renderer for
 * the reason `block-completion-provider.tsx` exists as its own module: the
 * shell writes `block_results` for every structure type, and the surest way to
 * keep that true is for `completeBlock` to have exactly one call site in the
 * presentation layer — the one `src/test/block-completion-ownership.test.ts`
 * names. A renderer supplies the outcome *its* structure observed and composes
 * this; it does not grow a second completion of its own.
 *
 * The outcome is the caller's because an outcome is structure-specific: a
 * standard block observes nothing a clock would have measured and passes `{}`,
 * where an EMOM passes its minutes. An absent field is `null` in the row
 * rather than a zero nobody measured (DATA_MODEL §8).
 */
import { Button } from '../design-system/index'
import { useBlockCompletion, type BlockOutcome } from '../state/block-completion'

export interface BlockCompletionControlProps {
  blockId: string
  /** What this structure observed. `{}` when it observed nothing. */
  outcome: BlockOutcome
  /** The verb for this structure, when "Complete block" is not the words. */
  label?: string
}

export function BlockCompletionControl({
  blockId,
  outcome,
  label = 'Complete block',
}: BlockCompletionControlProps) {
  const { completeBlock, isBlockRecorded } = useBlockCompletion()
  const recorded = isBlockRecorded(blockId)

  return (
    <Button
      variant="secondary"
      size="lg"
      disabled={recorded}
      onClick={() => completeBlock(blockId, outcome)}
    >
      {recorded ? 'Block recorded' : label}
    </Button>
  )
}
