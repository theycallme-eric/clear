/**
 * One section of the Review briefing (REV-01), drawn in the same card the live
 * workout draws a block in (TASK-002; R30, R37, C07): `ReviewSection` gives
 * each block its own `WorkoutCard`, headed by the shared static header — the
 * section's name as a semantic heading and the block's format badge below it
 * (TASK-003, C08, C09) — with no toggle, chevron, hit area or collapsed state.
 * The movements are the shared owners (TASK-001, G01): `MovementList` orders
 * the peers with a separator only between two of them, and each row is
 * `ReviewExerciseRow` over `ReviewMovement`, with Swap in its slot (C06).
 *
 * Extracted from `src/app/Review.tsx` so the accepted gallery state renders the
 * same consumer the route renders. The state and handoffs stay in Review: this
 * file reads the briefing view and the suggestion maps it is given and calls
 * back with a key.
 */
import type { CSSProperties } from 'react'

import { Rest } from '../design-system/index'
import type { LoadOverrides, LoadSuggestions } from '../state/load-suggestions'
import {
  sequenceOrdinal,
  type ReviewBlockView,
  type ReviewCadence,
  type ReviewExerciseView,
  type ReviewSectionView,
} from '../state/review'
import { CollapsibleSection } from './collapsible-section'
import { LadderRounds } from './refinements/ladder'
import { MovementList } from './refinements/movement'
import { WorkoutCard } from './refinements/workout-card'
import { ReviewExerciseRow } from './review-exercise-row'

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
 * One block's planned work, under its card's header. A superset, circuit or
 * timed structure is one group, named by the header's format badge (the
 * structure glyph and format alone), with the round count or clock stated once
 * on the header's line below it (TASK-003, C08), and its movements
 * numbered `01`, `02` in the order they are performed. A superset or circuit
 * is performed as rounds — each movement once, back to back, then again — so
 * the header is followed by the one-round sequence line and each row states
 * what one round asks of it, never the `4 × 8` that reads as all four sets
 * before the next movement. Its shared rest closes the group, after the round
 * it follows.
 *
 * C04, R28, R75: the group is not framed down its leading edge — no inner
 * grouping rail — and the only rules are the separators between two peers.
 *
 * Necessary `block_notes` stay visible; the derivation removes only the known
 * redundant repeat sentence that the numbered sequence already states.
 * Planned sets, reps, rounds and rest stay here (R30): Review states the
 * workout as planned. No live progress counter, Rest or log control is drawn.
 */
function ReviewBlockRows({
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
    return (
      <div className="clr-stack--tight" style={STACK_STYLE} data-review-block="standard">
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
      {/*
        TASK-012 (C35, JOURNEY-012): a ladder's rounds, read-only, under its
        accepted movement rows — the same tiles and notation the live ladder
        draws, so the athlete reads every round before starting.
      */}
      {block.ladderRounds !== null && <LadderRounds rounds={block.ladderRounds} />}
      {inRounds && block.roundRest !== null && (
        <p className="clr-text-data-xs" style={ROUND_REST_STYLE}>
          <Rest size={16} />
          {block.roundRest}
        </p>
      )}
    </div>
  )
}

/**
 * The structure the header's badge names. A superset, circuit or timed
 * structure is named by it. A standard block is a movement done set by set, so
 * it gets no `STANDARD` badge — that badge on every row was metadata that said
 * nothing — unless its rep scheme is one the user needs told. The card draws
 * the badge format-only, below the title, and states the rounds, clock, cap or
 * scheme on the line below it (TASK-003; C08, C09).
 */
function reviewStructure(block: ReviewBlockView) {
  const badged = block.grouped || block.identity.detail !== null || block.identity.repScheme !== null
  return badged ? block.identity : null
}

/**
 * One section of the briefing: one `WorkoutCard` per block, as the live
 * workout draws them (R30), each headed by the static header (R37, C07).
 *
 * Always open: this is a screen the user reads before agreeing to it, so the
 * section's content is never behind a disclosure and its header is not a
 * control. The section's name is its semantic heading on the first card; the
 * cards after it in the same section repeat it as the live cards do, as the
 * header's label, so the outline names each section once. The separate,
 * optional tempo detail keeps its own disclosure, after the section's last
 * block.
 */
export function ReviewSection({
  section,
  ...suggestion
}: { section: ReviewSectionView } & ReviewSuggestionProps) {
  const last = section.blocks.length - 1
  return (
    <div className="clr-stack" data-review-section={section.type}>
      {section.blocks.map((block, index) => (
        <WorkoutCard
          key={block.key}
          context="review"
          title={section.title}
          heading={index === 0}
          structure={reviewStructure(block)}
        >
          <ReviewBlockRows block={block} {...suggestion} />
          {index === last && section.cadence.length > 0 && <CadenceDetail cadence={section.cadence} />}
        </WorkoutCard>
      ))}
    </div>
  )
}

/** The optional tempo detail's trigger, and the region it names. */
export const TEMPO_DETAIL_LABEL = 'Tempo'

/**
 * Every prescribed tempo in the section, behind one collapsed disclosure
 * (REQ-011, U33). A `Tempo 3-1-1-0` on each row repeated the same string down
 * the briefing; nothing is dropped by moving it here — each movement that
 * prescribes a cadence is listed with it, in the order it is performed — and a
 * timed prescription (`45 sec`, an EMOM's minutes) stays on its own line,
 * because that is the work rather than a detail of it. It is optional detail,
 * not the section's header, so it stays a disclosure (R37).
 */
function CadenceDetail({ cadence }: { cadence: readonly ReviewCadence[] }) {
  return (
    <CollapsibleSection label={TEMPO_DETAIL_LABEL}>
      <ul style={{ ...STACK_STYLE, listStyle: 'none', margin: 0, padding: 0 }}>
        {cadence.map((entry) => (
          <li key={entry.key} className="clr-row" style={{ gap: 'var(--spacing-200)' }}>
            <span style={{ textTransform: 'capitalize' }}>{entry.name}</span>
            <span className="clr-text-data-xs">{entry.tempo}</span>
          </li>
        ))}
      </ul>
    </CollapsibleSection>
  )
}
