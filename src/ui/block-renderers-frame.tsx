/**
 * The one card / group / field grammar every structure renderer draws with.
 *
 * `block-renderers.tsx` decides *which* renderer performs a block; this file is
 * what all of them are made of. It is a leaf on purpose — it imports no
 * renderer, so a renderer can compose it without importing the registry that
 * imports the renderer back.
 *
 *   · `BlockPanel` is the block's one card: identity row, the structure's own
 *     content, and the shell's single completion control at the foot. A
 *     countdown is handed to its `timer` slot and drawn beside the card, never
 *     inside it — `TimerDisplay` is already its own frame. A block performed
 *     as a group ends with its one Coaching and notes disclosure (TASK-005,
 *     C16): `GroupExerciseCoaching` in the card's `coaching` slot, with the
 *     rows' own panels stood down through `GroupCoachingContext`.
 *   · `BlockPanel.Group` is a headed group inside that card: a heading and a
 *     rule, never a second card, whatever it is rendered under.
 *   · `BlockPanel.MovementList`, `.MovementItem` and `.Movement` are the
 *     movements: one list, the live one marked by a word and `aria-current`
 *     rather than by colour, each headed one level below the block.
 *   · `BlockPanel.FieldRow` is where a structure's inputs sit: element frames
 *     in a wrapping row, label above each, no frame of its own.
 *   · `BlockPanel.Label`, `.Note` and `.EmptyNote` are its lines of copy.
 *
 * The parts hang off the panel rather than standing as exports of their own
 * because none of them is a surface: each is only ever a piece of one block's
 * card, and is reviewed where that card is.
 *
 * Nothing here reads a clock, a prescription or a seam. The outcome a block
 * records is still the renderer's to observe and `BlockCompletionControl`'s to
 * hand to the shell; `BlockPanel` only guarantees there is exactly one of it.
 */
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react'

import type { BlockOutcome, TimedResultReport } from '../state/block-completion'
import type { BlockProgress } from '../state/workout-progress'
import { BlockCompletionControl } from './block-completion-control'
import { Card, type CardRole } from './card'
import { CardContainmentContext } from './card-context'
import { GroupExerciseCoaching } from './exercise-coaching'
import { coachesAsGroup, GroupCoachingContext } from './group-coaching-context'
import { HeadingSection } from './Heading'
import { MovementList as SharedMovementList } from './refinements/movement'
import { LiveMovement, WorkoutCard } from './refinements/workout-card'
import { useSectionLabel } from './section-label-context'

const STACK_STYLE: CSSProperties = { display: 'flex', flexDirection: 'column' }

const LABEL_STYLE: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-data)',
  fontSize: 'var(--label-xs-size)',
  letterSpacing: 'var(--tracking-data)',
  textTransform: 'uppercase',
  color: 'var(--text-card-label)',
}

const NOTE_STYLE: CSSProperties = { margin: 0 }

const MOVEMENT_STYLE: CSSProperties = { ...STACK_STYLE }

/**
 * B05-04's movement hierarchy is now the shared owner's (TASK-001, G01):
 * `MovementIdentity`, `MovementList` and `MovementGroupHeader` in
 * `src/ui/refinements/movement.tsx`. The block's card and the live slot are
 * `WorkoutCard` and `LiveMovement` (`src/ui/refinements/workout-card.tsx`,
 * TASK-002): Review draws the same card and header, so both contexts lead
 * with the same emphasis and header vocabulary (R30, C07), and only the slot
 * differs — progress here, Swap there (C06).
 */
const FIELD_ROW_STYLE: CSSProperties = {
  flexWrap: 'wrap',
  gap: 'var(--spacing-200)',
  alignItems: 'flex-start',
}

export interface BlockPanelCompletion {
  /** What this structure observed. `{}` when it observed nothing. */
  outcome: BlockOutcome
  /** TASK-015: a timed log's effort and per-movement entries, saved beside the row. */
  timed?: TimedResultReport | null
}

/**
 * No outcome fields: a panel that runs no clock and counts no rounds supplies
 * nothing, because a zero it never observed would be a measurement
 * (DATA_MODEL §8).
 */
const NOTHING_OBSERVED: BlockPanelCompletion = { outcome: {} }

export interface BlockPanelProps {
  readonly block: BlockProgress
  /** The card's role, where the structure's state changes it. */
  role?: CardRole
  /**
   * The structure's countdown. Drawn above the card as its sibling: the
   * shipped timer is its own frame and is not wrapped in another.
   */
  timer?: ReactNode
  /**
   * The block's one completion. The panel draws the control; nobody else
   * does. Omitted, the block observed nothing and says so.
   */
  completion?: BlockPanelCompletion
  children?: ReactNode
}

/**
 * One block, one card: the structure badge and the size of the block, whatever
 * the structure draws, and the completion the shell owns — once, at the foot.
 *
 * The *contents* are the renderer's — the movements, the clock and the
 * per-structure controls. What this carries is the contract they inherit:
 * `reportOutcome` with what was observed, and nothing else. The section's
 * forward action is what saves it (REQ-013).
 */
export function BlockPanel({
  block,
  role,
  timer,
  completion = NOTHING_OBSERVED,
  children,
}: BlockPanelProps) {
  const sectionLabel = useSectionLabel()
  // C16, R29 (TASK-005): a block performed as a group draws its movements'
  // coaching and notes once, at the foot of its card, and its rows draw none.
  // Each movement keeps its own guidance read and note writer inside it.
  const grouped = coachesAsGroup(block)
  const card = (
    // REQ-008: a secondary label, then the compact structure badge, so the
    // badge never competes with the movement heading below it. The same static
    // header Review's cards draw (C07, R37): the badge names the format alone,
    // below the label, with its duration, cap or rounds beside it (C08, C09).
    <WorkoutCard
      context="workout"
      role={role}
      title={
        sectionLabel ??
        `${block.exerciseCount} ${block.exerciseCount === 1 ? 'movement' : 'movements'}`
      }
      structure={block.identity}
      coaching={grouped ? <GroupExerciseCoaching format={block.identity.format} exercises={block.exercises} /> : undefined}
    >
      <GroupCoachingContext value={grouped}>{children}</GroupCoachingContext>
      <BlockCompletionControl blockId={block.blockId} outcome={completion.outcome} timed={completion.timed ?? null} />
    </WorkoutCard>
  )

  return (
    <div className="clr-stack" style={STACK_STYLE}>
      {timer === undefined || timer === null || timer === false ? null : timer}
      {card}
    </div>
  )
}

/** The terse data-face label: a position, a count, a caption over a list. */
function Label({ style, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p style={{ ...LABEL_STYLE, ...style }} {...props} />
}

/** A sentence of body copy inside a block, flush with the stack's rhythm. */
function Note({ style, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p style={{ ...NOTE_STYLE, ...style }} {...props} />
}

/**
 * A block with no active prescriptions left. A real, drawable case rather than
 * an empty view: everything in it was swapped out, and it says so.
 */
function EmptyNote() {
  return (
    <Note>
      Nothing left to perform in this block — every movement in it was swapped out.
    </Note>
  )
}

export interface BlockGroupProps {
  /** The group's label, a heading one level below the block's surroundings. */
  heading: ReactNode
  /** Secondary text on the heading row, right-aligned. */
  meta?: ReactNode
  children?: ReactNode
}

/**
 * A headed group inside a block: heading, rule, content.
 *
 * It is `Card`'s own contained form, pinned — so the group is a ruled sub-group
 * even where a renderer is drawn outside a card, and a block can never grow a
 * card inside its card by composing one.
 */
function Group({ heading, meta, children }: BlockGroupProps) {
  return (
    <HeadingSection>
      <CardContainmentContext.Provider value>
        <Card heading={heading} meta={meta}>
          {children}
        </Card>
      </CardContainmentContext.Provider>
    </HeadingSection>
  )
}

export interface BlockMovementListProps {
  /** The list's accessible name — "Movements in this circuit". */
  label: string
  children?: ReactNode
}

/**
 * The block's movements, in prescribed order. Rows, not cards: the shared
 * `MovementList`, with a separator only between two peers and no rail (C04).
 */
function MovementList({ label, children }: BlockMovementListProps) {
  return <SharedMovementList label={label}>{children}</SharedMovementList>
}

export type BlockMovementMarker = 'now' | 'next' | null

const MARKER_WORDS: Readonly<Record<'now' | 'next', string>> = {
  now: 'Now',
  next: 'Next',
}

export interface BlockMovementItemProps {
  /** Which movement is live, where the structure tracks a position. */
  marker?: BlockMovementMarker
  children?: ReactNode
}

/**
 * One row of the movement list. The live movement carries a word, and
 * `aria-current` is how the same fact reaches a screen reader — colour is
 * never the cue.
 */
function MovementItem({ marker = null, children }: BlockMovementItemProps) {
  return (
    <li
      aria-current={marker === 'now' ? 'step' : undefined}
      className="clr-stack--tight"
      style={STACK_STYLE}
    >
      {marker !== null && <Label>{MARKER_WORDS[marker]}</Label>}
      {children}
    </li>
  )
}

export interface BlockMovementProps {
  /** The movement's name. */
  title: ReactNode
  /** Its position in the block — `A1`, `1.` — where the structure gives one. */
  ordinal?: ReactNode
  /** The prescription as read from its columns — `3 × 8 reps`. */
  detail?: ReactNode
  /** The prescribed load beside it (R31) — a target, never a performed weight. */
  load?: ReactNode
  /**
   * A subordinate readout beside the heading — the logger's `Set 2/3`. A
   * label, never a second heading.
   */
  counter?: ReactNode
  /** Compact equipment context, beside the name (R132). */
  context?: ReactNode
  children?: ReactNode
}

/**
 * One movement: its name as a heading one level below the block with its
 * ordinal and compact equipment beside it, any counter in the live slot, then
 * its prescription and prescribed load — the shared `LiveMovement`. Rest and
 * logging are the renderer's children, below the readings; no Swap (C06).
 */
function Movement({ title, ordinal, detail, load, counter, context, children }: BlockMovementProps) {
  return (
    <HeadingSection className="clr-stack--tight" style={MOVEMENT_STYLE}>
      <LiveMovement
        name={title}
        ordinal={ordinal}
        prescription={detail}
        load={load}
        progress={counter}
        equipment={context}
      >
        {children}
      </LiveMovement>
    </HeadingSection>
  )
}

/**
 * A structure's inputs, side by side until they no longer fit. Each field is
 * its own element frame with its label above; the row adds none.
 */
function FieldRow({ className, style, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={['clr-row', className].filter(Boolean).join(' ')}
      style={{ ...FIELD_ROW_STYLE, ...style }}
      {...props}
    />
  )
}

BlockPanel.Label = Label
BlockPanel.Note = Note
BlockPanel.EmptyNote = EmptyNote
BlockPanel.Group = Group
BlockPanel.MovementList = MovementList
BlockPanel.MovementItem = MovementItem
BlockPanel.Movement = Movement
BlockPanel.FieldRow = FieldRow
