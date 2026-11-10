/**
 * The compact truthful ladder prescription (TASK-012; REQ-012, C35; R65, R70,
 * R71, R72, R94, R95, R117; V11).
 *
 * Accepted gallery reference eded158cfd928d382c9a9409e2c372270312741d,
 * `/gallery/refinements?state=ladder-4` and `?state=ladder-12`; REUSE.md names
 * this file the owner of the "rep-first wrapping ladder prescription and
 * ordered progress" (C33–C36).
 *
 *   · `LadderPrescription` — the live ladder's prescription: one concise line
 *     per movement for the whole progression (`PUSH UP · 2 → 24 reps · +2 per
 *     round`, `BURPEE · 4 reps`), with its compact equipment and prescribed
 *     load, then every round as a compact tile.
 *   · `LadderRounds` — the round grid alone: `R1`, then each movement's work in
 *     that round in the ×/· notation (`2 × push up`, `4 × burpee`), wrapping
 *     into as many columns as fit. Review draws it under its accepted movement
 *     rows (R65: that layout is kept), and the live prescription draws it under
 *     its summary, so both contexts state a round in the same words.
 *
 * Deliberate consolidation over the reference recipe, recorded in the task
 * note: the reference computed its readings inline from screenshot-shaped
 * data; here every name, sequence, unit, load, round count and cap is read
 * from the block's own columns through `src/state/ladder.ts`
 * (`ladderProgressionText`, `ladderRoundReadings`) and the shared
 * `liveMovementReadings`, so a descending, pyramid, timed or loaded ladder is
 * stated as itself. The rejected "— same every round" suffix and the long
 * per-round list are not drawn (R70, R95).
 *
 * Read-only presentation. No draft, field, storage key or writer (LOGGING-
 * FIELDS.md): a tile is the prescription, not a control. Live check-off of
 * whole rounds (`completedThrough` / `onProgress` in the reference), the
 * rep-first result tiles (`LadderCompletion`) and Undo are TASK-013 and
 * TASK-014; they extend `LadderRounds`' tile rather than drawing a second grid.
 */
import type { Enums } from '../../data/database.types'
import {
  ladderProgressionText,
  ladderRoundReadings,
  type LadderRoundReading,
} from '../../state/ladder'
import type { ExerciseProgress } from '../../state/workout-progress'
import { liveMovementReadings } from './movement-readings'
import './tokens.css'
import './presentation.css'

/** The round grid's accessible name wherever a ladder is performed or reviewed. */
export const LADDER_ROUNDS_LABEL = 'Rounds in this ladder'

/** The movement summary's accessible name. */
export const LADDER_MOVEMENTS_LABEL = 'Movements in this ladder'

/** What a consumer adds to one round: a scheduled start, the live round. */
export interface LadderRoundContext {
  /** `Now` for the live round, `Next` for the one about to start. */
  readonly marker?: 'now' | 'next' | null
  /** `Starts at 01:15` — a schedule's own start for this round. */
  readonly detail?: string | null
}

const MARKER_WORDS: Readonly<Record<'now' | 'next', string>> = { now: 'Now', next: 'Next' }

export interface LadderRoundsProps {
  /** The rounds, as `ladderRoundReadings` reads them from the prescriptions. */
  rounds: readonly LadderRoundReading[]
  /** The grid's accessible name. */
  label?: string
  /** Per-round context the consumer owns (a schedule's start and live round). */
  roundContext?: (round: number) => LadderRoundContext | null
}

/**
 * Every round of the ladder as a compact tile, in order, wrapping into as many
 * columns as fit (R95, R117). Each tile leads with its round, `R1`, then each
 * movement's work in that round in prescribed order. The visible tile is the
 * concise notation; a screen reader is given the same work in words
 * (`Round 1`, `push up, 2 reps`), so `×` is never the only statement of the
 * unit. Nothing in a tile is focusable: it is the prescription, not a control.
 */
export function LadderRounds({ rounds, label = LADDER_ROUNDS_LABEL, roundContext }: LadderRoundsProps) {
  if (rounds.length === 0) return null
  return (
    <ol className="clr-ladder-prescription__grid" aria-label={label}>
      {rounds.map((round) => {
        const context = roundContext?.(round.number) ?? null
        const marker = context?.marker ?? null
        return (
          <li
            key={round.number}
            data-ladder-round={round.number}
            aria-current={marker === 'now' ? 'step' : undefined}
          >
            <div className="clr-chamfer clr-chamfer--sm clr-chamfer--structure clr-ladder-prescription__round">
              {/*
                The round, and a schedule's Now / Next beside it on the same
                line, so every tile's round label stays level with its row's.
              */}
              <span className="clr-ladder-prescription__head">
                <span className="clr-ladder-prescription__label">
                  <span aria-hidden="true">R{round.number}</span>
                  <span className="a11y-hidden">Round {round.number}</span>
                </span>
                {marker !== null && (
                  <span className="clr-ladder-prescription__marker" data-ladder-marker={marker}>
                    {MARKER_WORDS[marker]}
                  </span>
                )}
              </span>
              {context?.detail != null && (
                <span className="clr-ladder-prescription__detail">{context.detail}</span>
              )}
              {round.entries.map((entry) => (
                <span key={entry.movement} className="clr-ladder-prescription__entry" data-ladder-entry="">
                  <span aria-hidden="true">{entry.text}</span>
                  <span className="a11y-hidden">{entry.spoken}</span>
                </span>
              ))}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

export interface LadderPrescriptionProps {
  /** The ladder's movements, in prescribed order — the order they are performed. */
  exercises: readonly ExerciseProgress[]
  /** The explicit timing's round count; the ladder's own rungs when it has none. */
  rounds?: number | null
  /** The profile's unit for a prescribed load; null states the number alone. */
  weightUnit: Enums<'weight_unit'> | null
  /** Per-round context the consumer owns (a schedule's start and live round). */
  roundContext?: (round: number) => LadderRoundContext | null
}

/**
 * The live ladder's prescription (C35): the concise overall progression, one
 * line per movement in prescribed order — its name, compact equipment (R132),
 * the whole progression or the companion's fixed target, and its prescribed
 * load (R31), each read through the same formatters every live movement uses
 * — then every round's work (`LadderRounds`). Said once: no movement line
 * repeats the pattern, and no round repeats the load.
 */
export function LadderPrescription({ exercises, rounds = null, weightUnit, roundContext }: LadderPrescriptionProps) {
  return (
    <div className="clr-ladder-prescription" data-ladder-prescription="">
      <ol className="clr-ladder-prescription__summary" aria-label={LADDER_MOVEMENTS_LABEL}>
        {exercises.map((exercise) => {
          const readings = liveMovementReadings(exercise.prescription, weightUnit)
          return (
            <li key={exercise.exerciseId} data-ladder-movement="">
              <span className="clr-ladder-prescription__name" data-movement-name="">
                {readings.name}
              </span>{' '}
              <span className="clr-ladder-prescription__equipment" data-movement-context="">
                {readings.equipment}
              </span>
              {' · '}
              <span data-ladder-progression="">{ladderProgressionText(exercise.prescription)}</span>
              {readings.load !== null && (
                <>
                  {' · '}
                  <span data-movement-load="">{readings.load}</span>
                </>
              )}
            </li>
          )
        })}
      </ol>
      <LadderRounds rounds={ladderRoundReadings(exercises, rounds)} roundContext={roundContext} />
    </div>
  )
}
