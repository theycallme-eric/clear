/** Real presentations with in-memory controls; never production data or account clients. */
import { useState } from 'react'

import type { ReviewExerciseView } from '../state/review'
import { ExerciseSwapContext, type ExerciseSwapApi } from '../state/swap-context'
import { BlockPanel } from '../ui/block-renderers-frame'
import { Card } from '../ui/card'
import { MovementGroupHeader, MovementList } from '../ui/refinements/movement'
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
        load={SAMPLE_REVIEW_MOVEMENT.load}
        context={SAMPLE_REVIEW_MOVEMENT.equipment}
        counter="Set 1/3"
      />
    </Card>
  )
}

// REQ-001: the shared peer list as each consumer draws it — Review's rows with
// Swap, the Workout's movements with their counters. Ruled between peers only.
const SAMPLE_PEERS: readonly ReviewExerciseView[] = [
  { ...SAMPLE_REVIEW_MOVEMENT, key: 'gallery-peer-1', exerciseId: 'one-arm-row', name: 'One arm row',
    equipment: 'dumbbell', load: '25 lb', roundTarget: '8–12 reps', rest: null },
  { ...SAMPLE_REVIEW_MOVEMENT, key: 'gallery-peer-2', exerciseId: 'bicep-curl', name: 'Bicep curl',
    equipment: 'dumbbell', load: '25 lb', roundTarget: '8–12 reps', rest: null },
]

export function ReviewPeerGroup() {
  const swap: ExerciseSwapApi = {
    openFor: null, open: noop, close: noop,
    options: { status: 'empty' }, retry: noop, choose: noop,
    undoTarget: () => null, undo: noop, isBusy: () => false,
  }
  return (
    <ExerciseSwapContext value={swap}>
      <Card heading="Accessory">
        <MovementList label="superset, 3 rounds">
          {SAMPLE_PEERS.map((exercise, index) => (
            <li key={exercise.key}>
              <ReviewExerciseRow
                ordinal={String(index + 1).padStart(2, '0')}
                inRounds
                exercise={exercise}
                suggestion={null}
                override={null}
                onExplain={noop}
              />
            </li>
          ))}
        </MovementList>
      </Card>
    </ExerciseSwapContext>
  )
}

export function LivePeerList() {
  return (
    <Card heading="Accessory">
      <BlockPanel.MovementList label="Movements in this superset">
        {SAMPLE_PEERS.map((exercise, index) => (
          <BlockPanel.MovementItem key={exercise.key}>
            <BlockPanel.Movement
              title={`A${index + 1} ${exercise.name}`}
              detail={exercise.roundTarget}
              load={exercise.load}
              context={exercise.equipment}
              counter="Set 1/3"
            />
          </BlockPanel.MovementItem>
        ))}
      </BlockPanel.MovementList>
    </Card>
  )
}

export function GroupHeaderShort() {
  return <MovementGroupHeader title="Primary lift" badge={<span className="label">Standard</span>} />
}

export function GroupHeaderLong() {
  return (
    <MovementGroupHeader
      title="Accessory · a section label long enough to wrap beside its badge"
      badge={<span className="label">Superset · 3 rounds</span>}
    />
  )
}
