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
 *     inside it — `TimerDisplay` is already its own frame.
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

import type { BlockOutcome } from '../state/block-completion'
import type { BlockProgress } from '../state/workout-progress'
import { BlockCompletionControl } from './block-completion-control'
import { Card, type CardRole } from './card'
import { CardContainmentContext } from './card-context'
import { Heading, HeadingSection } from './Heading'
import { useSectionLabel } from './section-label-context'
import { StructureBadge } from './workout-chrome'

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

const LIST_STYLE: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--spacing-300)',
}

/**
 * B05-04's selected movement hierarchy, in three tiers (REQ-014). The name is
 * one role whatever level the nesting gives its heading, so a standard,
 * superset and circuit card all lead with the same emphasis; the prescription
 * and the equipment each sit a distinct step below it.
 */
const MOVEMENT_STYLE: CSSProperties = { ...STACK_STYLE, gap: 'var(--spacing-200)' }

const MOVEMENT_NAME_ROW_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 'var(--spacing-300)',
}

const MOVEMENT_NAME_STYLE: CSSProperties = {
  flex: '1 1 0',
  minWidth: 0,
  margin: 0,
  fontFamily: 'var(--font-display)',
  fontSize: 'var(--heading-h3-size)',
  lineHeight: 'var(--heading-h3-line-height)',
  fontWeight: 'var(--font-weight-bold)',
  textTransform: 'uppercase',
  color: 'var(--ink)',
  overflowWrap: 'anywhere',
}

/** The counter keeps its own column: a long name wraps beside it, never over it. */
const MOVEMENT_COUNTER_STYLE: CSSProperties = { ...LABEL_STYLE, flex: 'none' }

const MOVEMENT_DETAIL_STYLE: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-data)',
  fontSize: 'var(--label-md-size)',
  lineHeight: 'var(--label-md-line-height)',
  letterSpacing: 'var(--tracking-data)',
  color: 'var(--text-paragraph)',
}

const MOVEMENT_CONTEXT_STYLE: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-data)',
  fontSize: 'var(--label-xs-size)',
  letterSpacing: 'var(--tracking-data)',
  color: 'var(--text-secondary)',
  textTransform: 'capitalize',
}

const FIELD_ROW_STYLE: CSSProperties = {
  flexWrap: 'wrap',
  gap: 'var(--spacing-200)',
  alignItems: 'flex-start',
}

export interface BlockPanelCompletion {
  /** What this structure observed. `{}` when it observed nothing. */
  outcome: BlockOutcome
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
  const card = (
    <Card role={role}>
      <div className="clr-stack" style={STACK_STYLE}>
        {/*
          REQ-008: a secondary label on the left and the compact structure
          badge on the right, so the badge never competes with the movement
          heading below it.
        */}
        <div className="clr-row" data-block-top-row="" style={{ justifyContent: 'space-between' }}>
          <span style={LABEL_STYLE}>
            {sectionLabel ?? (
              <>
                {block.exerciseCount} {block.exerciseCount === 1 ? 'movement' : 'movements'}
              </>
            )}
          </span>
          <StructureBadge identity={block.identity} />
        </div>
        {children}
        <BlockCompletionControl blockId={block.blockId} outcome={completion.outcome} />
      </div>
    </Card>
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

/** The block's movements, in prescribed order. Rows, not cards. */
function MovementList({ label, children }: BlockMovementListProps) {
  return (
    <ol aria-label={label} style={LIST_STYLE}>
      {children}
    </ol>
  )
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
  /** The movement's name, with its ordinal where the structure gives it one. */
  title: ReactNode
  /** The prescription as read from its columns — `3 × 8 reps`. */
  detail?: ReactNode
  /**
   * A subordinate readout beside the heading — the logger's `Set 2/3`. A
   * label, never a second heading.
   */
  counter?: ReactNode
  /** Equipment context, under the prescription. */
  context?: ReactNode
  children?: ReactNode
}

/**
 * One movement: its name as a heading one level below the block, any counter
 * beside it in the label face, then its prescription in the data face and its
 * equipment context — B05-04's three tiers, the name leading.
 */
function Movement({ title, detail, counter, context, children }: BlockMovementProps) {
  const heading = <Heading style={MOVEMENT_NAME_STYLE}>{title}</Heading>

  return (
    <HeadingSection className="clr-stack--tight" style={MOVEMENT_STYLE}>
      {counter === undefined || counter === null ? heading : (
        <div className="clr-row" data-movement-name-row="" style={MOVEMENT_NAME_ROW_STYLE}>
          {heading}
          <span style={MOVEMENT_COUNTER_STYLE}>{counter}</span>
        </div>
      )}
      {detail === undefined || detail === null ? null : (
        <p data-movement-detail="" style={MOVEMENT_DETAIL_STYLE}>{detail}</p>
      )}
      {context === undefined || context === null ? null : (
        <p data-movement-context="" style={MOVEMENT_CONTEXT_STYLE}>{context}</p>
      )}
      {children}
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
