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
import { useId } from 'react'

import { Check, OverflowRail } from '../design-system/index'
import { rungLabel, rungNumbers, type LadderRung } from '../state/ladder'
import './ladder-rungs.css'

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
