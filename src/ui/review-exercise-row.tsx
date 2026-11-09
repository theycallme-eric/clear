/** The existing Review movement presentation; state and handoffs stay in Review. */
import type { ReviewExerciseView } from '../state/review'
import type { LoadOverride, LoadSuggestionView } from '../state/load-suggestions'
import { ExerciseSwapControls } from './exercise-swap'
import { LoadSuggestionButton } from './load-suggestion'
import { prescribedLoadReading } from './refinements/movement-readings'
import { ReviewMovement } from './refinements/workout-card'

/**
 * One prescription, through the shared hierarchy (TASK-001, G01) in Review's
 * context (`ReviewMovement`, TASK-002): the movement's name leads with its
 * ordinal and compact equipment beside it (R132, C03), Swap sits in Review's
 * own action slot at the far end of the name row and no live progress counter
 * can (C06), and the prescription follows with its prescribed load and —
 * outside a round — its own planned rest (R30, R31). Every reading is a
 * separate element rather than one assembled sentence: the load and the rest
 * are different facts that a screen reader should be able to stop between.
 * Tempo is not on the row; the section's tempo detail carries it.
 *
 * Inside a superset or circuit the movement's own rest is not shown: the group
 * rests once, after the round, and states that rest once beneath its list. A
 * `Bodyweight` load beside `bodyweight` equipment says the same thing twice,
 * so the equipment beside the name carries it alone, in any block
 * (AC-R002-01); any other prescribed load stays.
 *
 * No last-performance reading is added here (C02, R02): the prescribed load is
 * the target this card states. The OVR-01c suggestion keeps its own action
 * below the readings, and the full Undo after a real swap follows it.
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
    <ReviewMovement
      name={exercise.name}
      ordinal={ordinal}
      equipment={exercise.equipment}
      prescription={exercise.roundTarget ?? exercise.prescription}
      load={prescribedLoadReading(exercise.load, exercise.equipment)}
      extra={inRounds ? null : exercise.rest}
      swap={<ExerciseSwapControls slot={exercise.key} exerciseId={exercise.exerciseId} actions="swap" />}
    >
      {suggestion !== null && (
        <LoadSuggestionButton suggestion={suggestion} override={override} onOpen={onExplain} />
      )}
      <ExerciseSwapControls slot={exercise.key} exerciseId={exercise.exerciseId} actions="undo" />
    </ReviewMovement>
  )
}
