/** The existing Review movement presentation; state and handoffs stay in Review. */
import type { CSSProperties } from 'react'

import type { ReviewExerciseView } from '../state/review'
import type { LoadOverride, LoadSuggestionView } from '../state/load-suggestions'
import { ExerciseSwapControls } from './exercise-swap'
import { LoadSuggestionButton } from './load-suggestion'
import { distinctLoad, MovementIdentity } from './refinements/movement'

const MOVEMENT_STYLE: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 'var(--spacing-200)' }

/**
 * One prescription, in the shared hierarchy the Workout draws too (REQ-001):
 * the movement leads with its equipment quiet beside it and Swap in its own
 * slot at the far end of that row, then what it asks (one round's target
 * inside a counted superset or circuit, the whole prescription otherwise) with
 * its prescribed load. Every reading is a separate element rather than one
 * assembled sentence: `prescriptionText` already refuses to produce a string
 * anything would want to parse back, and the load and the rest are different
 * facts that a screen reader should be able to stop between. Tempo is not on
 * the row; the section's tempo detail carries it.
 *
 * Inside a superset or circuit the movement's own rest is not shown: the group
 * rests once, after the round, and states that rest once beneath its list —
 * the transition between members is not a rest the athlete takes. A
 * `Bodyweight` load beside `bodyweight` equipment says the same thing twice,
 * so there the equipment carries it alone.
 *
 * There is no last-performance row (R02, C02): the prescribed load is this
 * card's, and the history behind it stays reachable through the suggestion's
 * own explanation.
 */
export function ReviewExerciseRow({
  ordinal,
  inRounds,
  exercise,
  suggestion,
  override,
  onExplain,
}: {
  /** `01`, `02` — the movement's place in its group, or null outside one. */
  ordinal: string | null
  /** A superset or circuit member: the group, not the row, states the rest. */
  inRounds: boolean
  exercise: ReviewExerciseView
  /** Null where there is no anchor — a state, and it renders nothing. */
  suggestion: LoadSuggestionView | null
  override: LoadOverride | null
  onExplain: () => void
}) {
  return (
    <div style={MOVEMENT_STYLE}>
      <MovementIdentity
        name={exercise.name}
        ordinal={ordinal}
        equipment={exercise.equipment}
        prescription={exercise.roundTarget ?? exercise.prescription}
        load={inRounds ? distinctLoad(exercise.load, exercise.equipment) : exercise.load}
        rest={inRounds ? null : exercise.rest}
        action={<ExerciseSwapControls slot={exercise.key} exerciseId={exercise.exerciseId} actions="swap" />}
      />
      {suggestion !== null && (
        <LoadSuggestionButton suggestion={suggestion} override={override} onOpen={onExplain} />
      )}
      <ExerciseSwapControls slot={exercise.key} exerciseId={exercise.exerciseId} actions="undo" />
    </div>
  )
}
