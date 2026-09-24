/**
 * EXE-01 — the perceived-effort capture, once, at block completion.
 *
 * One dialog serves every structure type, which is the requirement's whole
 * point: EMOM, AMRAP, For Time and the ladders record effort through this
 * control rather than each renderer growing its own. It asks one question, it
 * is answerable with one gesture, and it is the last thing between the user and
 * the next block — so it opens with the slider focused and Enter submits.
 *
 * The scale is 1–10 and mirrors `block_results_perceived_effort_range`. The
 * slider is the shipped `IntensitySlider` — a real `<input type="range">`, so
 * arrow keys, Home and End are the platform's — and the spoken value carries
 * the anchor word, because "7" on its own is a number and "7 of 10, hard" is
 * an answer.
 */
import { useEffect, useRef, useState } from 'react'

import { Button, IntensitySlider } from '../design-system/index'
import {
  PERCEIVED_EFFORT_MAX,
  PERCEIVED_EFFORT_MIN,
  type BlockOutcome,
} from '../state/block-completion'
import type { StructureIdentity } from '../state/workout-progress'
import { AppDialog } from './app-dialog'

/** The midpoint: a default that claims nothing, and is one drag from anything. */
export const DEFAULT_PERCEIVED_EFFORT = 5

/** Anchors, so the number is never the only thing announced. */
const EFFORT_WORDS: Readonly<Record<number, string>> = {
  1: 'very easy',
  2: 'easy',
  3: 'easy',
  4: 'moderate',
  5: 'moderate',
  6: 'somewhat hard',
  7: 'hard',
  8: 'hard',
  9: 'very hard',
  10: 'maximal',
}

export function effortValueText(value: number): string {
  return `${value} of ${PERCEIVED_EFFORT_MAX}, ${EFFORT_WORDS[value] ?? 'moderate'}`
}

export interface BlockEffortDialogProps {
  open: boolean
  /** What was just finished, so the question has its subject. */
  identity: StructureIdentity | null
  /** The fields the renderer observed, echoed back as a factual summary. */
  outcome: BlockOutcome | null
  /** True while the `block_results` write is in flight. */
  saving?: boolean
  onConfirm: (perceivedEffort: number) => void
  /** Closing without answering leaves the block unrecorded, and says so. */
  onCancel: () => void
}

export function BlockEffortDialog({
  open,
  identity,
  outcome,
  saving = false,
  onConfirm,
  onCancel,
}: BlockEffortDialogProps) {
  const [effort, setEffort] = useState(DEFAULT_PERCEIVED_EFFORT)
  const sliderRef = useRef<HTMLInputElement>(null)

  // Each opening is its own question: a block that felt like a 9 must not
  // pre-answer the next one, and the midpoint is the honest starting point.
  useEffect(() => {
    if (open) {
      setEffort(DEFAULT_PERCEIVED_EFFORT)
      sliderRef.current?.focus()
    }
  }, [open])

  return (
    <AppDialog
      open={open}
      title={identity === null ? 'How hard was that?' : `${identity.label} complete`}
      onClose={onCancel}
      actions={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={saving}>
            Not now
          </Button>
          <Button variant="primary" loading={saving} onClick={() => onConfirm(effort)}>
            Record effort
          </Button>
        </>
      }
    >
      <div className="clr-stack--tight" style={{ display: 'flex', flexDirection: 'column' }}>
        <p style={{ margin: 0 }}>{outcomeSummary(outcome)}</p>
        <IntensitySlider
          label="Effort"
          min={PERCEIVED_EFFORT_MIN}
          max={PERCEIVED_EFFORT_MAX}
          step={1}
          value={effort}
          valueText={effortValueText(effort)}
          inputRef={sliderRef}
          onChange={setEffort}
        />
      </div>
    </AppDialog>
  )
}

/**
 * What the renderer observed, in numbers and nouns. Absent fields say nothing
 * rather than zero — an AMRAP that recorded no rounds and one that completed
 * none are different facts, and this line must not collapse them.
 */
export function outcomeSummary(outcome: BlockOutcome | null): string {
  if (outcome === null) return 'Rate the effort of the block you just finished.'

  const parts: string[] = []
  if (outcome.roundsCompleted !== undefined) {
    parts.push(`${outcome.roundsCompleted} rounds`)
  }
  if (outcome.partialRoundReps !== undefined) {
    parts.push(`+${outcome.partialRoundReps} reps`)
  }
  if (outcome.minutesCompleted !== undefined) {
    parts.push(`${outcome.minutesCompleted} minutes`)
  }
  if (outcome.highestRung !== undefined) {
    parts.push(`rung ${outcome.highestRung}`)
  }
  if (outcome.elapsedSeconds !== undefined) {
    parts.push(`${outcome.elapsedSeconds} seconds`)
  }
  if (outcome.completedUnderCap === false) {
    parts.push('cap reached')
  }

  return parts.length === 0
    ? 'Rate the effort of the block you just finished.'
    : `Recorded: ${parts.join(' · ')}.`
}
