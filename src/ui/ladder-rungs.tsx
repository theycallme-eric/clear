/**
 * EXE-04a — the ladder's rungs, in the two states the quickfix spec insists are
 * different things.
 *
 * **Read-only** is the pattern as *data*: the rungs the block prescribes, shown
 * once, square and neutral-bordered, with nothing to tap. The phone is on the
 * floor during a For Time — a row of cards that looked like buttons would be
 * offering an interaction the spec explicitly does not want mid-block.
 *
 * **Interactive** is the question asked once the cap has been hit: *how far did
 * you get?* Each rung becomes a real radio — one tab stop for the group, arrow
 * keys between rungs, Home/End to the ends — because a hand-rolled set of
 * buttons is how that keyboard contract quietly goes missing. The box is
 * hidden, not the control; the card standing in for it draws the focus ring and
 * the selection.
 *
 * Three rules the spec is explicit about, all visible here:
 *   · **A rung is named by its target, not by its index** — the accessible name
 *     of rung 3 of a pyramid is `6 reps`, and "3" appears only in the sentence
 *     that says how far the user got, because that is what the *row* records.
 *   · **Selection is never colour alone** — the chosen rung carries a tick, and
 *     the row states the choice in words underneath.
 *   · **Reachable at any width** — eleven rungs do not fit a 375px screen, so
 *     the row is an `OverflowRail`: contained horizontal scrolling with edge
 *     cues, and no page-level overflow (ATOMIC.md §11, DS-001).
 */
import { useId, type CSSProperties } from 'react'
import type { ExerciseProgress } from '../state/workout-progress'
import type { Enums } from '../data/database.types'
import { exerciseName } from '../state/prescription'
import { distinctLoadText, equipmentName, loadText } from '../state/review'

import { Check, Chip, OverflowRail } from '../design-system/index'
import {
  ladderPrefixAfterTap,
  ladderProgressionText,
  ladderRoundReadings,
  rungLabel,
  rungNumbers,
  type LadderRung,
} from '../state/ladder'
import './ladder-rungs.css'

/**
 * A3 TASK-105 (F3; TASK-013, C34; real data only): the ordered progress's
 * count in words. Nothing stated (`null`) is not zero — the athlete has not
 * said how far they got, and a count of 0 would claim it — so it reads as not
 * yet marked; an explicit zero reads as zero.
 */
/** A live round's inset: the same token the read-only round tile declares. */
const LIVE_ROUND_INSET: CSSProperties = { padding: 'var(--spacing-200)' }

function roundsCount(completedThrough: number | null, rounds: number): string {
  return completedThrough === null ? 'No rounds marked yet' : `${completedThrough} of ${rounds} rounds completed`
}

/** End-log variant: ordered completion, wrapping week-strip-style element frames.
 * Existing live/read-only and highest-reached radio owners remain unchanged.
 *
 * A3 TASK-105 (F3; TASK-013 C33, C34, AC-R013-01; TASK-048): the ladder's
 * "Rounds completed" in the route's `TimedResultLog`. A tap states the prefix
 * through a rung, and a tap inside the prefix leaves the rungs before it
 * (`ladderPrefixAfterTap`): one contiguous run, never a gap. Each tile carries
 * its rung number (`data-ladder-rung`); a saved result is shown `disabled`.
 */
export function LadderCompletion({ rungs, unit, completedThrough, onChange, emphasis = 'reps', disabled = false }: {
  rungs: readonly LadderRung[]
  unit: string
  completedThrough: number | null
  onChange: (number: number) => void
  emphasis?: 'round' | 'reps'
  /** TASK-048: a saved result keeps its prefix and is no longer offered. */
  disabled?: boolean
}) {
  if (rungs.length === 0) return null
  return <fieldset className="clr-ladder-completion" data-rung-emphasis={emphasis}>
    <legend className="label">Rounds completed</legend>
    <div className="clr-ladder-completion__tiles">
      {rungs.map(rung => {
        const selected = completedThrough !== null && rung.number <= completedThrough
        const target = rungNumbers(rung)
        return <Chip key={rung.number} className="clr-ladder-completion__tile" selected={selected} disabled={disabled}
          data-ladder-rung={rung.number}
          style={{ width: '100%', minHeight: 'calc(var(--control-height) * 2)', padding: 'var(--spacing-200) var(--spacing-100)', justifyContent: 'center' }}
          aria-label={`Round ${rung.number}: ${rungLabel(rung, unit)}`}
          onClick={() => onChange(ladderPrefixAfterTap(rung.number, completedThrough))}>
          <span className="clr-ladder-completion__content" aria-hidden="true">
            <span className="clr-ladder-completion__round">R{emphasis === 'reps' ? rung.number : ''}</span>
            <span className="clr-ladder-completion__number">{emphasis === 'round' ? rung.number : target}</span>
            <span className="clr-ladder-completion__target">{emphasis === 'round' ? `${target} ` : ''}{unit}</span>
          </span>
        </Chip>
      })}
    </div>
    <p className="clr-ladder-completion__status" role="status" aria-live="polite">{roundsCount(completedThrough, rungs.length)}</p>
  </fieldset>
}

export interface LadderRungsProps {
  /** The block's ladder, from `target_sequence`. Renders nothing when empty. */
  rungs: readonly LadderRung[]
  /** What the rungs are counted in — `reps`, `sec`, `m`. May be empty. */
  unit: string
  /** The row's caption, and its accessible name. */
  label: string
  /**
   * The rung reached, by rung number. Rungs below it read as climbed; the rung
   * itself reads as where the user stopped. `null` is "not said", which is the
   * whole row's state during the block.
   */
  reached?: number | null
  /**
   * Offer the rungs as a choice. Omitted, the row is read-only — the pattern,
   * not a control.
   */
  onSelect?: (rungNumber: number) => void
}

type RungState = 'unreached' | 'reached' | 'selected'

function rungState(rung: LadderRung, reached: number | null): RungState {
  if (reached === null) return 'unreached'
  if (rung.number === reached) return 'selected'
  return rung.number < reached ? 'reached' : 'unreached'
}

export function LadderRungs({
  rungs,
  unit,
  label,
  reached = null,
  onSelect,
}: LadderRungsProps) {
  const captionId = useId()
  const group = useId()

  // A ladder with no rungs is a malformed block rather than an empty view: the
  // renderer says so in words, and this draws no empty rail for it.
  if (rungs.length === 0) return null

  const selected = rungs.find((rung) => rung.number === reached) ?? null

  const items = rungs.map((rung) => {
    const state = rungState(rung, reached)
    const name = rungLabel(rung, unit)

    if (onSelect === undefined) {
      return (
        <span key={rung.number} role="listitem" className="clr-rung" data-state={state}>
          <span aria-hidden="true">{rungNumbers(rung)}</span>
          <span className="a11y-hidden">{name}</span>
          {state === 'selected' && <Check size={16} aria-hidden="true" />}
        </span>
      )
    }

    return (
      <label
        key={rung.number}
        className="clr-rung clr-rung--selectable"
        data-state={state}
      >
        <input
          type="radio"
          className="a11y-hidden"
          name={group}
          value={rung.number}
          checked={state === 'selected'}
          // Named by the target it asks for — the number on the floor — rather
          // than by its position, which two rungs of a pyramid would share.
          aria-label={name}
          onChange={() => onSelect(rung.number)}
        />
        <span aria-hidden="true">{rungNumbers(rung)}</span>
        {state === 'selected' && <Check size={16} aria-hidden="true" />}
      </label>
    )
  })

  const rail = (
    <OverflowRail
      gap="var(--spacing-100)"
      // Keeps the chosen rung on screen when the row is wider than the phone.
      activeIndex={selected === null ? undefined : selected.number - 1}
      trackProps={
        onSelect === undefined
          ? { role: 'list', 'aria-labelledby': captionId, className: 'clr-rungs' }
          : { className: 'clr-rungs' }
      }
    >
      {items}
    </OverflowRail>
  )

  const selection =
    selected === null ? null : (
      <p className="clr-rungs__selection">
        Reached rung {selected.number} of {rungs.length} — {rungLabel(selected, unit)}
      </p>
    )

  if (onSelect === undefined) {
    return (
      <div className="clr-stack--tight" style={{ display: 'flex', flexDirection: 'column' }}>
        <p id={captionId} className="clr-rungs__legend">
          {label}
        </p>
        {rail}
        {selection}
      </div>
    )
  }

  return (
    <fieldset
      className="clr-rungs--interactive clr-stack--tight"
      style={{ display: 'flex', flexDirection: 'column' }}
    >
      <legend className="clr-rungs__legend">{label}</legend>
      {rail}
      {selection}
    </fieldset>
  )
}

/**
 * Compact prescription; an optional ordered progress action checks off whole rounds.
 *
 * A3 TASK-105 (F3; TASK-012 C35, R70–R72, R94, R95; TASK-013 C34, AC-R013-01):
 * every reading is the shared one in `state/ladder.ts` — each movement's whole
 * progression or fixed target (`ladderProgressionText`) and each round's work
 * (`ladderRoundReadings`), the same readings Review's `ladderRounds` holds — so
 * every name, sequence, unit and round count is the block's own data. A
 * read-only round is said to a screen reader in words (`Round 3`, `push up, 6
 * reps`), never as `×` alone. While the ladder runs or is paused, each round is
 * a toggle of the ordered check-off, named by Round 7's `Complete round 3`: a
 * tap selects every round through it, and a tap inside
 * the selection leaves only the rounds before it (`ladderPrefixAfterTap`) —
 * one contiguous run, never a gap — with the count beneath it. `rounds` is the
 * explicit timing's own count, when the block has one.
 */
export function LadderPrescription({ exercises, weightUnit, completedThrough = null, onProgress, rounds = null }: {
  exercises: readonly ExerciseProgress[]; weightUnit: Enums<'weight_unit'> | null
  completedThrough?: number | null; onProgress?: (rung: number) => void
  rounds?: number | null
}) {
  const readings = ladderRoundReadings(exercises, rounds)
  const spokenId = useId()
  return <div className="clr-ladder-prescription" data-ladder-prescription="">
    <div className="clr-ladder-prescription__summary">
      {exercises.map(exercise => {
        const p = exercise.prescription
        const load = p.load_type === null ? null : distinctLoadText(loadText(p.load_type, p.load_value, weightUnit), equipmentName(p.equipment_used))
        return <p key={exercise.exerciseId} data-ladder-movement=""><strong>{exerciseName(p.exercise_id)}</strong> · {ladderProgressionText(p)}
          {load ? <> · <span data-movement-load="">{load}</span></> : null}</p>
      })}
    </div>
    {readings.length > 0 && <ol className="clr-ladder-prescription__grid" aria-label="Prescribed ladder rounds">
      {readings.map(round => {
        const spoken = (movement: number) => `${spokenId}-${round.number}-${movement}`
        const content = <><span className="label"><span aria-hidden="true">R{round.number}</span><span className="a11y-hidden">Round {round.number}</span></span>
          {round.entries.map(entry => <span key={entry.movement} data-ladder-entry="">
            <span aria-hidden="true">{entry.text}</span><span className="a11y-hidden" id={spoken(entry.movement)}>{entry.spoken}</span>
          </span>)}</>
        return <li key={round.number} data-ladder-round={round.number}>
          {onProgress ? <Chip selected={round.number <= (completedThrough ?? 0)} className="clr-ladder-prescription__round"
            // JOURNEY-012 (readable wrapping): the tile's own inset, as the
            // read-only round declares it (`.clr-ladder-prescription__round`);
            // the Chip's wider inline inset broke a word like BURPEE mid-word
            // in a three-column grid at 390.
            style={LIVE_ROUND_INSET}
            aria-label={`Complete round ${round.number}`} aria-describedby={round.entries.map(entry => spoken(entry.movement)).join(' ') || undefined}
            onClick={() => onProgress(ladderPrefixAfterTap(round.number, completedThrough))}>{content}</Chip>
            : <div className="clr-chamfer clr-chamfer--sm clr-chamfer--structure clr-ladder-prescription__round">{content}</div>}
        </li>
      })}
    </ol>}
    {onProgress && readings.length > 0 && <p className="clr-ladder-completion__status" role="status">{roundsCount(completedThrough, readings.length)}</p>}
  </div>
}
