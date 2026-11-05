/**
 * REQ-001 (C01, C02, C04) — the one movement hierarchy and peer grouping that
 * Review and the active Workout both draw, adopted from the accepted gallery
 * reference `eded158` (`/gallery/refinements?state=cards`).
 *
 *   · `MovementIdentity` is one movement: its name leads, with the equipment
 *     quiet beside it; the prescription and its load sit one step below. The
 *     ordinal, equipment, counter and action are separate slots, so Review's
 *     Swap and the Workout's `Set 1/3` each keep their own place and a long
 *     name or a multi-digit ordinal wraps without covering either.
 *   · `MovementList` is a block's peers in order, ruled only *between* them —
 *     never after the last one, and with no rail down the group's edge.
 *   · `MovementGroupHeader` is a group's static label and badge row.
 *
 * Presentation only. Actions, progress, history and logging stay with their
 * consumers; nothing here reads a prescription or writes anything. There is
 * deliberately no slot for a last-performance reading (R02): history belongs
 * where progress is reviewed, and the prescribed load is the card's.
 */
import type { ReactNode } from 'react'

import { Heading } from '../Heading'
import './presentation.css'

const present = (node: ReactNode) => node !== undefined && node !== null && node !== false

export interface MovementIdentityProps {
  /** The movement's name. A heading when `heading`, so it can carry the outline. */
  name: ReactNode
  /** `01`, `02` — the movement's place in its group. */
  ordinal?: ReactNode
  /** What the prescription asks — `3 × 5 reps`. */
  prescription?: ReactNode
  /** The prescribed load, beside the prescription — `95 lb`. */
  load?: ReactNode
  /** The prescribed rest, where the movement states its own. */
  rest?: ReactNode
  /** Quiet equipment context, beside the name. */
  equipment?: ReactNode
  /** The consumer's action (Review's Swap), at the far end of the name row. */
  action?: ReactNode
  /** The consumer's progress (Workout's `Set 1/3`), in its own column. */
  counter?: ReactNode
  heading?: boolean
}

export function MovementIdentity({
  name, ordinal, prescription, load, rest, equipment, action, counter, heading = false,
}: MovementIdentityProps) {
  const Name = heading ? Heading : 'p'
  const detailed = present(prescription) || present(load) || present(rest)
  return (
    <div className="clr-movement-identity" data-movement-identity="">
      <div className="clr-movement-identity__top" data-movement-name-row="">
        <div className="clr-movement-identity__title">
          <Name className="clr-movement-identity__name">
            {present(ordinal) && <span className="clr-movement-identity__ordinal clr-text-data-xs">{ordinal} </span>}
            {name}
          </Name>
          {present(equipment) && (
            <span className="clr-movement-identity__equipment" data-movement-context="">{equipment}</span>
          )}
        </div>
        {present(counter) && <span className="clr-movement-identity__counter">{counter}</span>}
        {present(action) && <div className="clr-movement-identity__action">{action}</div>}
      </div>
      {detailed && (
        <p className="clr-movement-identity__prescription" data-movement-detail="">
          {present(prescription) && <span>{prescription}</span>}
          {present(load) && <span data-movement-load="">{load}</span>}
          {present(rest) && <span>{rest}</span>}
        </p>
      )}
    </div>
  )
}

/** Ordered peer rows, with a separator only between movements. */
export function MovementList({ label, children }: { label: string; children?: ReactNode }) {
  return <ol aria-label={label} className="clr-movement-list">{children}</ol>
}

/** Shared static group header. Actions and session progress belong to consumers. */
export function MovementGroupHeader({ title, badge, heading = false }: {
  title: ReactNode
  badge?: ReactNode
  heading?: boolean
}) {
  return (
    <div className="clr-movement-group-header" data-movement-group-header="" data-block-top-row="">
      {heading ? (
        <Heading className="clr-movement-group-header__title">{title}</Heading>
      ) : (
        <span className="clr-movement-group-header__title">{title}</span>
      )}
      {present(badge) && <div className="clr-movement-group-header__badge">{badge}</div>}
    </div>
  )
}

/**
 * The prescribed load, unless it only repeats the equipment beside the name —
 * `Bodyweight` next to `bodyweight` says the same thing twice (R31).
 */
export function distinctLoad(load: string | null, equipment: string): string | null {
  return load !== null && load.toLowerCase() === equipment.toLowerCase() ? null : load
}
