/**
 * The shared movement hierarchy and peer grouping (TASK-001; REQ-001, G01).
 *
 * Accepted gallery reference eded158cfd928d382c9a9409e2c372270312741d,
 * `/gallery/refinements?state=cards`; REUSE.md names this file the canonical
 * owner of the movement hierarchy, compact equipment and peer grouping.
 *
 *   · `MovementIdentity` — one hierarchy for Review and Workout (R30): the
 *     prominent name with its ordinal and quiet equipment beside it (R132), the
 *     readable prescription with its prescribed load (R31), and the consumer's
 *     own slot for Review's Swap or Workout's `Set X/Y` progress (C01, C06).
 *   · `MovementList` — ordered peers with a separator only between two peers:
 *     no rule after the last, and no inline-start rail (C04, R28, R75).
 *   · `MovementGroupHeader` — the static group header that places the format
 *     badge. It draws no rule or rail of its own.
 *
 * Presentation only. Consumers keep their data, controllers and actions: no
 * field, write or reason is added here (LOGGING-FIELDS.md). There is no
 * last-performance reading in this owner (C02, R02): what was lifted last time
 * stays in its data owners and in the surfaces meant for reviewing progress.
 *
 * Two deliberate consolidations over the reference recipe, both recorded in the
 * task note: the equipment sits beside the name element rather than inside it,
 * so a heading's accessible name stays the movement's name; and a consumer may
 * add a further prescribed reading (`extra`, Review's own rest) and attached
 * content (`children`) without restating the hierarchy.
 */
import type { HTMLAttributes, ReactNode } from 'react'

import { Heading } from '../Heading'
import './tokens.css'
import './presentation.css'

export interface MovementIdentityProps {
  /** The movement's name. Rendered in the heading ink, never the action colour. */
  name: ReactNode
  /** `01`, `A1`, `1.` — the movement's position, where the consumer gives one. */
  ordinal?: ReactNode
  /** The prescription, `3 × 8 reps` or one round's `12 reps`. */
  prescription?: ReactNode
  /** The prescribed load, beside the prescription (R31). Never a performed weight. */
  load?: ReactNode
  /** A further prescribed reading on the same row — Review's own rest. */
  extra?: ReactNode
  /** Compact equipment context, beside the name (R132). */
  equipment?: ReactNode
  /** Review's slot: Swap. */
  action?: ReactNode
  /** Workout's slot: set progress. A label, never a second heading. */
  counter?: ReactNode
  /** The name as a structural heading (Workout), or a paragraph (Review). */
  heading?: boolean
  /** Content attached to this movement, after its readings. */
  children?: ReactNode
}

const present = (node: ReactNode) => node !== undefined && node !== null && node !== false

export function MovementIdentity({
  name,
  ordinal,
  prescription,
  load,
  extra,
  equipment,
  action,
  counter,
  heading = false,
  children,
}: MovementIdentityProps) {
  const Name = heading ? Heading : 'p'
  return (
    <div className="clr-movement-identity" data-movement-identity="">
      <div className="clr-movement-identity__top" data-movement-name-row="">
        <div className="clr-movement-identity__title">
          <Name className="clr-movement-identity__name">
            {present(ordinal) ? (
              <>
                <span className="clr-movement-identity__ordinal" data-movement-ordinal="">{ordinal}</span>{' '}
              </>
            ) : null}
            <span data-movement-name="">{name}</span>
          </Name>
          {present(equipment) ? (
            <span className="clr-movement-identity__equipment" data-movement-context="">{equipment}</span>
          ) : null}
        </div>
        {present(counter) ? <span className="clr-movement-identity__counter">{counter}</span> : null}
        {present(action) ? <div className="clr-movement-identity__action">{action}</div> : null}
      </div>
      {present(prescription) || present(load) || present(extra) ? (
        <p className="clr-movement-identity__prescription" data-movement-detail="">
          {present(prescription) ? <span>{prescription}</span> : null}
          {present(load) ? <span data-movement-load="">{load}</span> : null}
          {present(extra) ? <span>{extra}</span> : null}
        </p>
      ) : null}
      {children}
    </div>
  )
}

export interface MovementListProps extends Omit<HTMLAttributes<HTMLOListElement>, 'className'> {
  /** The list's accessible name — `superset, 3 rounds`, `Movements in this circuit`. */
  label: string
  children?: ReactNode
}

/** Ordered peer rows, with a separator only between two movements. */
export function MovementList({ label, children, ...rest }: MovementListProps) {
  return (
    <ol {...rest} aria-label={label} className="clr-movement-list">
      {children}
    </ol>
  )
}

export interface MovementGroupHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title' | 'className'> {
  /** The group's label, where the context has one. */
  title?: ReactNode
  /** The format badge. */
  badge?: ReactNode
  /** The title as a structural heading. Off where the label is a secondary reading. */
  heading?: boolean
}

/** Shared static group header. Actions and session progress belong to consumers. */
export function MovementGroupHeader({ title, badge, heading = false, ...rest }: MovementGroupHeaderProps) {
  const Title = heading ? Heading : 'span'
  return (
    <div {...rest} className="clr-movement-group-header" data-movement-group-header="">
      {present(title) ? <Title className="clr-movement-group-header__title">{title}</Title> : null}
      {present(badge) ? <div className="clr-movement-group-header__badge">{badge}</div> : null}
    </div>
  )
}
