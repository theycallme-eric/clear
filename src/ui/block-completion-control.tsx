/**
 * EXE-01's completion control, as one component every renderer composes.
 *
 * It exists as its own file rather than as code inside each renderer for the
 * reason `block-completion-provider.tsx` exists as its own module: the shell
 * writes `block_results` for every structure type, and the surest way to keep
 * that true is for `reportOutcome` to have exactly one call site in the
 * presentation layer — the one `src/test/block-completion-ownership.test.ts`
 * names. A renderer supplies the outcome *its* structure observed and composes
 * this; it does not grow a completion of its own.
 *
 * REQ-013 took the button away. A block is completed by the section's one
 * forward action, so this control is no longer an action: it keeps the shell
 * told what the block has observed, and once the forward action has saved the
 * block, it says so in words.
 *
 * The outcome is the caller's because an outcome is structure-specific: a
 * standard block observes nothing a clock would have measured and passes `{}`,
 * where an EMOM passes its minutes. An absent field is `null` in the row
 * rather than a zero nobody measured (DATA_MODEL §8).
 */
import { useEffect, type CSSProperties } from 'react'

import { Check } from '../design-system/index'
import { useBlockCompletion, type BlockOutcome } from '../state/block-completion'

const SAVED_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--spacing-100)',
  margin: 0,
  fontFamily: 'var(--font-data)',
  fontSize: 'var(--label-xs-size)',
  letterSpacing: 'var(--tracking-data)',
  textTransform: 'uppercase',
  color: 'var(--text-card-label)',
}

export interface BlockCompletionControlProps {
  blockId: string
  /** What this structure observed. `{}` when it observed nothing. */
  outcome: BlockOutcome
}

export function BlockCompletionControl({ blockId, outcome }: BlockCompletionControlProps) {
  const { reportOutcome, isBlockRecorded } = useBlockCompletion()

  // Every change is reported, so the forward action saves what the block
  // observed at the moment it was pressed — never more than that.
  useEffect(() => {
    reportOutcome(blockId, outcome)
  }, [blockId, outcome, reportOutcome])

  if (!isBlockRecorded(blockId)) return null

  return (
    <p style={SAVED_STYLE}>
      <Check aria-hidden="true" />
      Block saved
    </p>
  )
}
