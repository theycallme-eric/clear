/** The existing Review movement presentation; state and handoffs stay in Review. */

import { distinctLoadText, type ReviewExerciseView } from '../state/review'
import type { LoadOverride, LoadSuggestionView } from '../state/load-suggestions'
import { ExerciseSwapControls } from './exercise-swap'
import { LoadSuggestionButton } from './load-suggestion'
import { MovementIdentity } from './movement-presentation'
import { useWorkoutExperiencePresentation } from './workout-experience-presentation'

/**
 * One prescription, in three tiers: the movement, then what it asks (one
 * round's target inside a counted superset or circuit, the whole prescription
 * otherwise), then the equipment. Every reading is a separate element rather
 * than one assembled sentence: `prescriptionText` already refuses to produce a
 * string anything would want to parse back, and the load and the rest are
 * different facts that a screen reader should be able to stop between. Tempo
 * is not on the row; the section's tempo detail carries it.
 *
 * Inside a superset or circuit the movement's own rest is not shown: the group
 * rests once, after the round, and states that rest once beneath its list —
 * the transition between members is not a rest the athlete takes. A
 * `Bodyweight` load beside `bodyweight` equipment says the same thing twice,
 * so there the equipment line carries it alone.
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
  const presentation = useWorkoutExperiencePresentation()
  const guidance = presentation?.suggestedLoads?.[exercise.exerciseId]
  const load = distinctLoadText(guidance === undefined ? exercise.load : guidance, exercise.equipment)
  const rest = inRounds ? null : exercise.rest
  return (
    <div className="clr-stack clr-stack--tight">
      <MovementIdentity
        name={exercise.name}
        ordinal={ordinal}
        prescription={exercise.roundTarget ?? exercise.prescription}
        load={load}
        equipment={exercise.equipment}
        action={<ExerciseSwapControls slot={exercise.key} exerciseId={exercise.exerciseId} actions="swap" />}
      />
      {rest === null ? null : <p style={{ margin: 0 }}>{rest}</p>}
      {suggestion !== null && (
        <LoadSuggestionButton suggestion={suggestion} override={override} onOpen={onExplain} />
      )}
      <ExerciseSwapControls slot={exercise.key} exerciseId={exercise.exerciseId} actions="undo" />
    </div>
  )
}
