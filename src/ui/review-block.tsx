/**
 * One block of the Review briefing (REV-01), drawn with the shared movement
 * owners (TASK-001, G01): `MovementGroupHeader` places the format badge,
 * `MovementList` orders the peers with a separator only between two of them,
 * and each row is `ReviewExerciseRow` over `MovementIdentity`.
 *
 * Extracted unchanged in behaviour from `src/app/Review.tsx` so the accepted
 * gallery state can render the same consumer the route renders. The state and
 * handoffs stay in Review: this file reads the briefing view and the
 * suggestion maps it is given and calls back with a key.
 */
import type { CSSProperties } from 'react'

import { Rest } from '../design-system/index'
import type { LoadOverrides, LoadSuggestions } from '../state/load-suggestions'
import {
  sequenceOrdinal,
  type ReviewBlockView,
  type ReviewExerciseView,
} from '../state/review'
import { MovementGroupHeader, MovementList } from './refinements/movement'
import { ReviewExerciseRow } from './review-exercise-row'
import { StructureBadge } from './workout-chrome'

/** What a section threads down to each prescription row. */
export interface ReviewSuggestionProps {
  suggestions: LoadSuggestions
  overrides: LoadOverrides
  onExplain: (key: string) => void
}

const STACK_STYLE: CSSProperties = { display: 'flex', flexDirection: 'column' }

/**
 * The group's shared rest, in the interaction blue the timer it starts will
 * wear, and with the rest glyph so the colour is never the only cue.
 */
const ROUND_REST_STYLE: CSSProperties = {
  color: 'var(--text-card-header)',
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--spacing-100)',
}

/** The accessible name of a standard block's movement list. */
export const STANDARD_MOVEMENTS_LABEL = 'Movements in this block'

/**
 * One block. A superset, circuit or timed structure is one group, named by its
 * badge (which carries the structure glyph and the round count or clock once),
 * and its movements numbered `01`, `02` in the order they are performed. A
 * superset or circuit is performed as rounds — each movement once, back to
 * back, then again — so its badge is followed by the one-round sequence line
 * and each row states what one round asks of it, never the `4 × 8` that reads
 * as all four sets before the next movement. Its shared rest closes the group,
 * after the round it follows.
 *
 * C04, R28, R75: the group is not framed down its leading edge — no inner
 * grouping rail — and the only rules are the separators between two peers.
 *
 * Necessary `block_notes` stay visible; the derivation removes only the known
 * redundant repeat sentence that the numbered sequence already states.
 * A standard block is a movement done set by set, so it gets no `STANDARD`
 * badge — that badge on every row was metadata that said nothing — unless its
 * rep scheme is one the user needs told.
 */
export function ReviewBlockRows({
  block,
  suggestions,
  overrides,
  onExplain,
}: { block: ReviewBlockView } & ReviewSuggestionProps) {
  const inRounds = block.roundSequence !== null
  const row = (exercise: ReviewExerciseView, ordinal: string | null) => (
    <ReviewExerciseRow
      ordinal={ordinal}
      inRounds={inRounds}
      exercise={exercise}
      suggestion={suggestions.get(exercise.key) ?? null}
      override={overrides.get(exercise.key) ?? null}
      onExplain={() => onExplain(exercise.key)}
    />
  )

  if (!block.grouped) {
    const badged = block.identity.detail !== null || block.identity.repScheme !== null
    return (
      <div className="clr-stack--tight" style={STACK_STYLE} data-review-block="standard">
        {badged && <MovementGroupHeader badge={<StructureBadge identity={block.identity} />} />}
        {block.roundRest !== null && <span className="clr-text-data-xs">{block.roundRest}</span>}
        {block.notes !== null && <p style={{ margin: 0 }}>{block.notes}</p>}
        <MovementList label={STANDARD_MOVEMENTS_LABEL}>
          {block.exercises.map((exercise) => <li key={exercise.key}>{row(exercise, null)}</li>)}
        </MovementList>
      </div>
    )
  }

  const name = [
    block.identity.label.toLowerCase(),
    block.rounds === null ? null : `${block.rounds} ${block.rounds === 1 ? 'round' : 'rounds'}`,
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <div className="clr-stack--tight" style={STACK_STYLE} data-review-block="grouped">
      <MovementGroupHeader badge={<StructureBadge identity={block.identity} />} />
      {inRounds ? (
        <p className="clr-text-data-xs">{block.roundSequence}</p>
      ) : (
        block.roundRest !== null && <span className="clr-text-data-xs">{block.roundRest}</span>
      )}
      {block.notes !== null && <p style={{ margin: 0 }}>{block.notes}</p>}
      <MovementList label={name}>
        {block.exercises.map((exercise, index) => (
          <li key={exercise.key}>{row(exercise, sequenceOrdinal(index))}</li>
        ))}
      </MovementList>
      {inRounds && block.roundRest !== null && (
        <p className="clr-text-data-xs" style={ROUND_REST_STYLE}>
          <Rest size={16} />
          {block.roundRest}
        </p>
      )}
    </div>
  )
}
