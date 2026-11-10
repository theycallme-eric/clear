/**
 * The compact truthful ladder prescription (TASK-012; REQ-012, C35; R65, R70,
 * R71, R72, R94, R95, R117; V11) and its ordered progress (TASK-013; REQ-013,
 * C33, C34, C36; R69, R77, R88, R89, R92, R93, R99, R118, R124).
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
 *   · TASK-013 (C34, R118): while a raced ladder's clock runs or is paused, the
 *     live prescription's round tiles are the ordered live check-off — each
 *     tile a toggle (the shared `Chip`) whose pressed state is the selected
 *     prefix, with the completion count beneath (`LadderCount`). Before Start,
 *     after the attempt ends and on Review the same tiles are read-only (R95:
 *     "keeping prescription display read-only"). One grid, never a second.
 *   · `LadderCompletion` — the end log's rep-first result tiles (C33, R99:
 *     "the rep target should be largest because he counts toward the next set
 *     of reps; round number is useful secondary context"): `R1` small, the
 *     rung's target largest, its unit small, three rows level across every
 *     tile of a row whether a target has one digit or two (R93), wrapping
 *     tiles with no horizontal scroller (R77, R92), no tick glyph (R92), the
 *     selected prefix and its count (C34). The result log composes it
 *     (`TimedResultLog`'s ladder family).
 *
 * Ordered progress is one number, "rounds completed through" — the accepted
 * owner's `completedThrough`, TASK-032's `progress` and the draft's
 * `highestRung` (R89: "selecting a completed ladder rung marks preceding rungs
 * complete, with partial work in the next rung recorded separately … no
 * non-contiguous completion model is needed"). A tap on a tile not yet in the
 * prefix selects through it; a tap on one already in it leaves the rounds
 * before it. `null` is "not stated", which is not zero, and reads differently.
 *
 * Deliberate consolidation over the reference recipe, recorded in the task
 * notes: the reference computed its readings inline from screenshot-shaped
 * data; here every name, sequence, unit, load, round count and cap is read
 * from the block's own columns through `src/state/ladder.ts`
 * (`ladderProgressionText`, `ladderRoundReadings`, `ladderRungs`) and the
 * shared `liveMovementReadings`, so a descending, pyramid, timed or loaded
 * ladder is stated as itself. The rejected "— same every round" suffix and the
 * long per-round list are not drawn (R70, R95).
 *
 * Presentation over a controller it does not own: no draft, storage key or
 * writer here (LOGGING-FIELDS.md). The progress and the answer are the route
 * consumer's — `ladder-block.tsx`, over TASK-032's durable ladder attempt.
 * Quiet Undo (`completionAction`) is TASK-014; per-movement partial and load
 * entry for the next round is TASK-015.
 */
import type { CSSProperties } from 'react'

import { Chip } from '../../design-system/index'
import type { Enums } from '../../data/database.types'
import {
  ladderPrefixAfterTap,
  ladderProgressionText,
  ladderRoundReadings,
  rungLabel,
  rungNumbers,
  type LadderRoundReading,
  type LadderRung,
} from '../../state/ladder'
import type { ExerciseProgress } from '../../state/workout-progress'
import { liveMovementReadings } from './movement-readings'
import './tokens.css'
import './presentation.css'

/** The round grid's accessible name wherever a ladder is performed or reviewed. */
export const LADDER_ROUNDS_LABEL = 'Rounds in this ladder'

/** The movement summary's accessible name. */
export const LADDER_MOVEMENTS_LABEL = 'Movements in this ladder'

/** The end log's rep-first result tiles' question (the accepted owner's legend). */
export const LADDER_COMPLETION_LEGEND = 'Rounds completed'

/** What a consumer adds to one round: a scheduled start, the live round. */
export interface LadderRoundContext {
  /** `Now` for the live round, `Next` for the one about to start. */
  readonly marker?: 'now' | 'next' | null
  /** `Starts at 01:15` — a schedule's own start for this round. */
  readonly detail?: string | null
}

/**
 * TASK-013 (C34, R118): live ordered check-off, offered by the consumer only
 * while the attempt can track it (its clock running or paused).
 */
export interface LadderRoundsProgress {
  /** Rounds completed through, 0…`rounds`; null when nothing is tracked yet. */
  readonly completedThrough: number | null
  /** The rounds that can be checked off: the ladder's rungs (`ladderRungs`). */
  readonly rounds: number
  /** The rounds completed through after the tap. */
  readonly onProgress: (through: number) => void
}

const MARKER_WORDS: Readonly<Record<'now' | 'next', string>> = { now: 'Now', next: 'Next' }

/**
 * The shared Chip's own look is a compact uppercase label. A live round tile
 * keeps the read-only tile's composition (TASK-012) — its rows, wrapping and
 * the data face — so a running ladder reads the same as a ready one; the Chip
 * supplies the control, its frame, pressed state and selected surface.
 */
const LIVE_TILE_STYLE: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  justifyContent: 'flex-start',
  gap: 'var(--spacing-100)',
  width: '100%',
  minWidth: 0,
  padding: 'var(--spacing-200)',
  fontFamily: 'var(--font-data)',
  fontSize: 'var(--label-xs-size)',
  lineHeight: 'var(--label-xs-line-height)',
  fontWeight: 'var(--font-weight-regular)',
  letterSpacing: 'normal',
  textTransform: 'none',
  textAlign: 'start',
  whiteSpace: 'normal',
}

/** The accepted result tile's frame (reference `LadderCompletion`). */
const RESULT_TILE_STYLE: CSSProperties = {
  width: '100%',
  minWidth: 0,
  minHeight: 'calc(var(--control-height) * 2)',
  padding: 'var(--spacing-200) var(--spacing-100)',
  justifyContent: 'center',
}

export interface LadderRoundsProps {
  /** The rounds, as `ladderRoundReadings` reads them from the prescriptions. */
  rounds: readonly LadderRoundReading[]
  /** The grid's accessible name. */
  label?: string
  /** Per-round context the consumer owns (a schedule's start and live round). */
  roundContext?: (round: number) => LadderRoundContext | null
  /** TASK-013: live ordered check-off; omitted or null, every tile is read-only. */
  progress?: LadderRoundsProgress | null
}

/**
 * Every round of the ladder as a compact tile, in order, wrapping into as many
 * columns as fit (R95, R117). Each tile leads with its round, `R1`, then each
 * movement's work in that round in prescribed order. The visible tile is the
 * concise notation; a screen reader is given the same work in words
 * (`Round 1`, `push up, 2 reps`), so `×` is never the only statement of the
 * unit.
 *
 * Read-only, nothing in a tile is focusable: it is the prescription. With
 * `progress` (TASK-013), each round the ladder can check off is a toggle whose
 * accessible name is that same round in words and whose pressed state says
 * whether it is in the completed prefix — no tick glyph (R92).
 */
export function LadderRounds({ rounds, label = LADDER_ROUNDS_LABEL, roundContext, progress = null }: LadderRoundsProps) {
  if (rounds.length === 0) return null
  return (
    <ol className="clr-ladder-prescription__grid" aria-label={label} data-ladder-tracking={progress === null ? undefined : ''}>
      {rounds.map((round) => {
        const context = roundContext?.(round.number) ?? null
        const marker = context?.marker ?? null
        const content = (
          <>
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
          </>
        )
        const trackable = progress !== null && round.number <= progress.rounds
        const done = trackable && progress.completedThrough !== null && round.number <= progress.completedThrough
        return (
          <li
            key={round.number}
            data-ladder-round={round.number}
            aria-current={marker === 'now' ? 'step' : undefined}
          >
            {trackable ? (
              <Chip
                className="clr-ladder-prescription__round"
                selected={done}
                data-ladder-progress={done ? 'done' : 'open'}
                style={LIVE_TILE_STYLE}
                onClick={() => progress.onProgress(ladderPrefixAfterTap(round.number, progress.completedThrough))}
              >
                {content}
              </Chip>
            ) : (
              <div className="clr-chamfer clr-chamfer--sm clr-chamfer--structure clr-ladder-prescription__round">
                {content}
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}

/**
 * The completion count (C34): `3 of 12 rounds completed`, an explicit zero as
 * `0 of 12`, and nothing stated yet as its own words — unreported progress is
 * never read as zero (R118). A polite status, so each change is announced.
 */
function LadderCount({ completedThrough, total }: { completedThrough: number | null; total: number }) {
  return (
    <p className="clr-ladder-completion__status" role="status" data-ladder-count={completedThrough ?? ''}>
      {completedThrough === null ? 'No rounds marked yet' : `${completedThrough} of ${total} rounds completed`}
    </p>
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
  /** TASK-013: live ordered check-off while the attempt can track it. */
  progress?: LadderRoundsProgress | null
}

/**
 * The live ladder's prescription (C35): the concise overall progression, one
 * line per movement in prescribed order — its name, compact equipment (R132),
 * the whole progression or the companion's fixed target, and its prescribed
 * load (R31), each read through the same formatters every live movement uses
 * — then every round's work (`LadderRounds`). Said once: no movement line
 * repeats the pattern, and no round repeats the load. While the attempt can
 * track progress (TASK-013, C34), the rounds are the live check-off and the
 * count follows them.
 */
export function LadderPrescription({ exercises, rounds = null, weightUnit, roundContext, progress = null }: LadderPrescriptionProps) {
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
      <LadderRounds rounds={ladderRoundReadings(exercises, rounds)} roundContext={roundContext} progress={progress} />
      {progress !== null && <LadderCount completedThrough={progress.completedThrough} total={progress.rounds} />}
    </div>
  )
}

export interface LadderCompletionProps {
  /** The block's rungs, from `target_sequence` (`ladderRungs`). Renders nothing when empty. */
  rungs: readonly LadderRung[]
  /** What the rungs are counted in — `reps`, `sec`, `m` (`ladderUnit`). May be empty. */
  unit: string
  /** Rounds completed through, 0…rungs; null when none is stated. */
  completedThrough: number | null
  /** The rounds completed through after the tap. */
  onChange: (through: number) => void
  /**
   * AC-R013-01: the round any partial work belongs to — the next rung after
   * the stated prefix (`ladderPartialRound`), never a round of its own choosing.
   * Null when there is none (Complete, nothing stated, or the top reached).
   * Entering the partial work itself is TASK-015's.
   */
  partialRound?: number | null
  /** Once the block's result is saved: no correction writer exists, so no choice is offered. */
  disabled?: boolean
}

/**
 * The end log's rep-first result tiles (C33, C34; R77, R88, R92, R93, R99).
 * Each tile is the shared Chip — a real toggle, one per rung, reachable by Tab
 * and operated by Enter, Space or a tap — named `Round 3: 6 reps` so round
 * position and rep target are both said and never confused (R88). The visible
 * rows are the round (secondary), the target (largest) and its unit, each on
 * its own line with no wrap, so a row of tiles stays level whether its
 * targets have one digit or two. The grid wraps into as many columns as fit:
 * four rungs or twelve, never a sideways scroller.
 */
export function LadderCompletion({
  rungs,
  unit,
  completedThrough,
  onChange,
  partialRound = null,
  disabled = false,
}: LadderCompletionProps) {
  if (rungs.length === 0) return null
  return (
    <fieldset className="clr-ladder-completion" data-ladder-completion="" data-rung-emphasis="reps">
      <legend className="label clr-ladder-completion__legend">{LADDER_COMPLETION_LEGEND}</legend>
      <div className="clr-ladder-completion__tiles">
        {rungs.map((rung) => {
          const done = completedThrough !== null && rung.number <= completedThrough
          return (
            <Chip
              key={rung.number}
              className="clr-ladder-completion__tile"
              selected={done}
              disabled={disabled}
              aria-label={`Round ${rung.number}: ${rungLabel(rung, unit)}`}
              data-ladder-rung={rung.number}
              style={RESULT_TILE_STYLE}
              onClick={() => onChange(ladderPrefixAfterTap(rung.number, completedThrough))}
            >
              <span className="clr-ladder-completion__content" aria-hidden="true">
                <span className="clr-ladder-completion__round">R{rung.number}</span>
                <span className="clr-ladder-completion__number">{rungNumbers(rung)}</span>
                <span className="clr-ladder-completion__unit">{unit}</span>
              </span>
            </Chip>
          )
        })}
      </div>
      <LadderCount completedThrough={completedThrough} total={rungs.length} />
      {partialRound !== null && (
        <p className="clr-ladder-completion__partial" data-ladder-partial-round={partialRound}>
          Any partial work belongs to round {partialRound}
        </p>
      )}
    </fieldset>
  )
}
