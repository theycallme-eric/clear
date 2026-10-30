/** Real presentations with in-memory controls; never production data or account clients. */
import { useState } from 'react'

import type { ReviewExerciseView } from '../state/review'
import { ExerciseSwapContext, type ExerciseSwapApi } from '../state/swap-context'
import { BlockPanel } from '../ui/block-renderers-frame'
import { Card } from '../ui/card'
import { ReviewExerciseRow } from '../ui/review-exercise-row'
import { SwapDialog } from '../ui/exercise-swap'

const noop = () => {}

// Related contexts use their real owners. Fixture controllers never query or write.
const SAMPLE_REVIEW_MOVEMENT = {
  key: 'gallery-movement',
  exerciseId: 'back-squat',
  name: 'Back squat',
  prescription: '3 × 8 reps',
  roundTarget: null,
  equipment: 'barbell',
  load: '60 kg',
  rest: 'Rest 90s',
  tempo: null,
} satisfies ReviewExerciseView

function ReviewMovementExample({ inRounds = false }: { inRounds?: boolean }) {
  const [openFor, setOpenFor] = useState<string | null>(null)
  const swap: ExerciseSwapApi = {
    openFor, open: setOpenFor, close: () => setOpenFor(null),
    options: { status: 'empty' }, retry: noop, choose: noop,
    undoTarget: () => null, undo: noop, isBusy: () => false,
  }
  return (
    <ExerciseSwapContext value={swap}>
      <Card heading="Primary work">
        <ReviewExerciseRow
          ordinal={inRounds ? '01' : null}
          inRounds={inRounds}
          exercise={inRounds ? { ...SAMPLE_REVIEW_MOVEMENT, roundTarget: '8 reps' } : SAMPLE_REVIEW_MOVEMENT}
          suggestion={null}
          override={null}
          onExplain={noop}
        />
      </Card>
      <SwapDialog
        open={openFor !== null}
        exerciseId={openFor === null ? null : SAMPLE_REVIEW_MOVEMENT.exerciseId}
        options={swap.options} busy={false}
        onRetry={noop} onChoose={noop} onClose={swap.close}
      />
    </ExerciseSwapContext>
  )
}

export function ReviewMovementStandalone() { return <ReviewMovementExample /> }
export function ReviewMovementInRounds() { return <ReviewMovementExample inRounds /> }

export function LiveMovementIdentity() {
  return (
    <Card heading="Primary work">
      <BlockPanel.Movement
        title={SAMPLE_REVIEW_MOVEMENT.name}
        detail={SAMPLE_REVIEW_MOVEMENT.prescription}
        context={SAMPLE_REVIEW_MOVEMENT.equipment}
        counter="Set 1/3"
      />
    </Card>
  )
}
