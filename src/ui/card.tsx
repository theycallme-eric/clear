/**
 * Card — the app's thin semantic composition over the public 0.14.3 Card.
 *
 * The public component owns the frame: one accent bar from
 * `--accent-bar-width`, body/bar/emission paired on one role, the 70% card
 * ground, a corner picked from the card's height and the bottom padding that
 * keeps content clear of the cut. This adapter never sets any of those.
 *
 * It adds two things. The public heading slot is a `span`, so the heading is
 * rendered here as a real `Heading` child at the surrounding outline level
 * (CORE-05). And a card never holds another card: a `Card` rendered inside a
 * card becomes a ruled sub-group, and the list/metric wrappers drop their own
 * frames.
 */
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react'

import {
  Card as PublicCard,
  type CardProps as PublicCardProps,
} from '../design-system/index'

import { CardContainmentContext, useInsideCard } from './card-context'
import { ActionRow } from './composition'
import { Heading } from './Heading'

export type { CardRole } from '../design-system/index'

export interface CardProps
  extends Omit<PublicCardProps, 'heading' | 'meta' | 'cornerSize'> {
  /** The card's label, inside it at the top, as a heading at the current level. */
  heading?: ReactNode
  /** Secondary text on the heading row, right-aligned (e.g. "Week 4"). */
  meta?: ReactNode
}

const HEADING_ROW_STYLE: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  gap: 'var(--spacing-300)',
}

const HEADING_STYLE: CSSProperties = { margin: 0 }

const SUBGROUP_RULE_STYLE: CSSProperties = {
  paddingBottom: 'var(--spacing-100)',
  borderBottom: 'var(--border-width) solid var(--border-region-rule)',
}

function CardHeading({
  heading,
  meta,
  ruled = false,
}: Pick<CardProps, 'heading' | 'meta'> & { ruled?: boolean }) {
  if (!heading && !meta) return null
  return (
    <div style={ruled ? { ...HEADING_ROW_STYLE, ...SUBGROUP_RULE_STYLE } : HEADING_ROW_STYLE}>
      {heading ? (
        <Heading className="label" style={HEADING_STYLE}>
          {heading}
        </Heading>
      ) : null}
      {meta ? (
        <span className="label" style={{ color: 'var(--text-secondary)' }}>
          {meta}
        </span>
      ) : null}
    </div>
  )
}

export function Card({ heading, meta, role, padding, className, children, ...props }: CardProps) {
  const insideCard = useInsideCard()

  if (insideCard) {
    return (
      <div
        className={['clr-stack', 'clr-stack--tight', className].filter(Boolean).join(' ')}
        {...props}
      >
        <CardHeading heading={heading} meta={meta} ruled />
        {children}
      </div>
    )
  }

  return (
    <PublicCard role={role} padding={padding} className={className} {...props} cornerSize="auto">
      <CardContainmentContext.Provider value>
        <CardHeading heading={heading} meta={meta} />
        {children}
      </CardContainmentContext.Provider>
    </PublicCard>
  )
}

/**
 * The action edge of a card. Keeping this composition inside the card makes
 * primary/secondary placement a rule instead of a screen-by-screen spacing
 * decision.
 */
export function CardActions({ className, style, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <ActionRow
      className={className}
      style={style}
      {...props}
    />
  )
}
