/**
 * Review versus Workout: one card, context-specific slots (TASK-002; REQ-002,
 * C03, C06, C07, R30, R37).
 *
 * Accepted gallery reference eded158cfd928d382c9a9409e2c372270312741d,
 * `/gallery/refinements?state=cards`; REUSE.md names this file the owner of
 * "Review versus Workout actions … and format-card composition", composed over
 * the movement owners in `./movement.tsx`.
 *
 *   · `WorkoutCard` — the one card a block is drawn in, in Review and in the
 *     live workout alike (R30): the shared static header (`MovementGroupHeader`:
 *     the section identity, then the structure's format badge below it), then
 *     the block. Review's header title is the section's semantic heading;
 *     there is no toggle, chevron, hit area or collapsed state on it (R37).
 *     Both contexts read the header in the same data label face (C07).
 *     TASK-003 (C08, C09, R51, R59, R65): the card draws the badge itself from
 *     the block's `StructureIdentity` — the format or shape alone, below the
 *     title in every card — and states the duration, cap, rounds and scheme
 *     the badge leaves out as one readable line below it, so no consumer can
 *     put the details back inside the badge or move it beside the title.
 *   · `ReviewMovement` and `LiveMovement` — `MovementIdentity` with each
 *     context's own slot (C06): Review offers Swap beside the name; the live
 *     workout offers set progress there, and its Rest and set logging stay the
 *     live loggers' own actions below the readings. Neither accepts the other's
 *     slot, so Swap cannot reach the workout and a live counter cannot reach
 *     Review. Compact equipment sits beside the name in both (C03, R132).
 *
 * Presentation only. Consumers keep their data, controllers, writes and
 * actions (LOGGING-FIELDS.md): the Review route keeps its swap controller and
 * the workout shell its set, rest and completion owners.
 *
 * Deliberate consolidation over the reference recipe (`RefinementWorkoutCard`),
 * recorded in the task note: the reference composed synthetic movements,
 * actions, a timed meta line and a Coaching and notes disclosure in one place.
 * Here each consumer supplies its own data and actions. The format badge and
 * its details line are composed here from the consumer's identity (TASK-003);
 * the grouped Coaching and notes disclosure, the session header and the
 * preparation cards are not composed by this card.
 */
import type { ReactNode } from 'react'

import { structureDetailText, type StructureIdentity } from '../../state/workout-progress'
import { Card, type CardRole } from '../card'
import { StructureBadge } from '../workout-chrome'
import { MovementGroupHeader, MovementIdentity, type MovementIdentityProps } from './movement'
import './tokens.css'
import './presentation.css'

/** Which context draws the card. It names the context; it changes no data. */
export type WorkoutCardContext = 'review' | 'workout'

export interface WorkoutCardProps {
  context: WorkoutCardContext
  /** The section identity, the header's first line — `Accessory`, or a block's size. */
  title?: ReactNode
  /**
   * The title as the section's semantic heading (Review's static header). The
   * live card's title is a secondary label: the section header above the
   * blocks already heads the section there.
   */
  heading?: boolean
  /**
   * The block's structure, named by the format badge below the title, with
   * its duration, cap, rounds and scheme on the line below the badge. Absent,
   * the card names no structure (Review's plain standard block).
   */
  structure?: StructureIdentity | null
  /** The card's role, where the structure's state changes it. */
  role?: CardRole
  children?: ReactNode
}

/** One block's card, in Review and in the live workout (R30, R37, C07, C08, C09). */
export function WorkoutCard({ context, title, heading = false, structure = null, role, children }: WorkoutCardProps) {
  return (
    <Card role={role}>
      <div className="clr-stack clr-workout-card" data-workout-card={context}>
        <MovementGroupHeader
          data-block-top-row=""
          title={title}
          heading={heading}
          badge={structure === null ? undefined : <StructureBadge identity={structure} formatOnly />}
          meta={structure === null ? undefined : structureDetailText(structure)}
        />
        {children}
      </div>
    </Card>
  )
}

/** The readings both contexts share; each context adds its own slot. */
type MovementReadings = Omit<MovementIdentityProps, 'action' | 'counter' | 'heading'>

export interface ReviewMovementProps extends MovementReadings {
  /** Review's slot: Swap, beside the name (C06). Review has no progress counter. */
  swap?: ReactNode
}

/** A planned movement in Review: the shared hierarchy, with Swap in its slot. */
export function ReviewMovement({ swap, ...readings }: ReviewMovementProps) {
  return <MovementIdentity {...readings} action={swap} />
}

export interface LiveMovementProps extends MovementReadings {
  /** Workout's slot: `Set 2/3`, beside the name (C06). The workout has no Swap. */
  progress?: ReactNode
}

/**
 * A movement in the live workout: the shared hierarchy with its name as a
 * structural heading and set progress in its slot. Rest and logging are the
 * consumer's children, below the readings.
 */
export function LiveMovement({ progress, ...readings }: LiveMovementProps) {
  return <MovementIdentity {...readings} heading counter={progress} />
}
