/** The existing Review movement presentation; state and handoffs stay in Review. */
import type { CSSProperties } from 'react'

import type { ReviewExerciseView } from '../state/review'
import type { LoadOverride, LoadSuggestionView } from '../state/load-suggestions'
import { ExerciseSwapControls } from './exercise-swap'
import { LoadSuggestionButton } from './load-suggestion'

const STACK_STYLE: CSSProperties = { display: 'flex', flexDirection: 'column' }

/**
 * B05-04: the movement's name row leads. A wrapped name keeps its own column,
 * and Swap stays at the far end of that row rather than under the readings.
 */
const NAME_ROW_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 'var(--spacing-300)',
}

/**
 * The name in the heading ink B05-04 selected, not the action colour: Swap
 * beside it is the only thing on the row that acts.
 */
const NAME_STYLE: CSSProperties = {
  flex: '1 1 0',
  minWidth: 0,
  display: 'flex',
  alignItems: 'baseline',
  margin: 0,
  fontFamily: 'var(--font-display)',
  fontSize: 'var(--heading-h5-size)',
  lineHeight: 'var(--heading-h5-line-height)',
  fontWeight: 'var(--font-weight-bold)',
  textTransform: 'uppercase',
  color: 'var(--ink)',
}

/**
 * The ordinal has its own column, on the name's first baseline, so a long
 * name wraps under itself rather than pushing the whole name below `02`.
 */
const ORDINAL_STYLE: CSSProperties = {
  flex: 'none',
  marginInlineEnd: 'var(--spacing-200)',
}

const NAME_TEXT_STYLE: CSSProperties = { minWidth: 0, overflowWrap: 'anywhere' }

/**
 * Swap's 40px target, centred on the name's first line: the control is taller
 * than that line, so it is pulled up by half the difference. The row's gap
 * below clears the other half.
 */
const SWAP_SLOT_STYLE: CSSProperties = {
  flex: '0 1 auto',
  maxWidth: '50%',
  marginBlock: 'calc((var(--heading-h5-line-height) - var(--control-height)) / 2)',
}

const MOVEMENT_STYLE: CSSProperties = { ...STACK_STYLE, gap: 'var(--spacing-200)' }

const PRESCRIPTION_STYLE: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--spacing-100) var(--spacing-300)',
  margin: 0,
  fontFamily: 'var(--font-data)',
  fontSize: 'var(--label-md-size)',
  lineHeight: 'var(--label-md-line-height)',
  letterSpacing: 'var(--tracking-data)',
  color: 'var(--text-paragraph)',
}

const EQUIPMENT_STYLE: CSSProperties = {
  textTransform: 'capitalize',
}

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
  const repeatsEquipment =
    exercise.load !== null && exercise.load.toLowerCase() === exercise.equipment.toLowerCase()
  const load = inRounds && repeatsEquipment ? null : exercise.load
  const rest = inRounds ? null : exercise.rest
  return (
    <div style={MOVEMENT_STYLE}>
      <div style={NAME_ROW_STYLE}>
        <p style={NAME_STYLE}>
          {ordinal !== null && <span className="clr-text-data-xs" style={ORDINAL_STYLE}>{ordinal} </span>}
          <span style={NAME_TEXT_STYLE}>{exercise.name}</span>
        </p>
        <div style={SWAP_SLOT_STYLE}>
          <ExerciseSwapControls slot={exercise.key} exerciseId={exercise.exerciseId} actions="swap" />
        </div>
      </div>
      <p style={PRESCRIPTION_STYLE}>
        <span>{exercise.roundTarget ?? exercise.prescription}</span>
        {load !== null && <span>{load}</span>}
        {rest !== null && <span>{rest}</span>}
      </p>
      <span className="clr-text-data-xs clr-text-data-xs--quiet" style={EQUIPMENT_STYLE}>{exercise.equipment}</span>
      {suggestion !== null && (
        <LoadSuggestionButton suggestion={suggestion} override={override} onOpen={onExplain} />
      )}
      <ExerciseSwapControls slot={exercise.key} exerciseId={exercise.exerciseId} actions="undo" />
    </div>
  )
}
