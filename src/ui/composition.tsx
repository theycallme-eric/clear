/**
 * Small semantic-neutral wrappers for the CSS-only layout patterns.
 *
 * They centralise vocabulary without inventing product behaviour: callers keep
 * their native elements, accessible names and handlers through `as` and the
 * ordinary HTML attributes spread onto the rendered element.
 *
 * Containment: inside a Card the list and metric wrappers are bare rows and
 * readouts, because the card is already the frame. They never add a card.
 */
import { createElement, type ElementType, type HTMLAttributes, type ReactNode } from 'react'

import { EmptyState } from '../design-system/index'

import { useInsideCard } from './card-context'

interface CompositionProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType
  children?: ReactNode
}

function composition(
  defaultElement: ElementType,
  systemClass: string,
  { as, className, ...props }: CompositionProps,
) {
  return createElement(as ?? defaultElement, {
    className: [systemClass, className].filter(Boolean).join(' '),
    ...props,
  })
}

/** Responsive button group: stacked on phones, equal-width row when wider. */
export function ActionRow(props: CompositionProps) {
  return composition('div', 'clr-actions', props)
}

/** A related collection of rows: one closed frame, or the card's when inside one. */
export function ListFrame(props: CompositionProps) {
  const insideCard = useInsideCard()
  return composition(
    'div',
    insideCard ? 'clr-list' : 'clr-list clr-chamfer clr-chamfer--md',
    props,
  )
}

/** A row inside ListFrame; adjacent rows receive the system inset rule. */
export function ListRow(props: CompositionProps) {
  return composition('div', 'clr-list__row', props)
}

/**
 * Factual empty copy where the rows will be. Standalone it is the public
 * EmptyState, which is its own card; inside a card it is plain copy.
 */
export function ListMessage({
  title,
  message,
}: {
  title: ReactNode
  message?: ReactNode
}) {
  const insideCard = useInsideCard()
  if (!insideCard) return <EmptyState title={title} message={message} />
  return (
    <div className="clr-stack clr-stack--tight">
      <p style={{ margin: 0 }}>{title}</p>
      {message === undefined ? null : (
        <p style={{ margin: 0, color: 'var(--text-secondary)' }}>{message}</p>
      )}
    </div>
  )
}

/** Full-width ruled band, typically around a tab rail. */
export function TabBand(props: CompositionProps) {
  return composition('div', 'clr-band', props)
}

/** Responsive grid for terse facts and completed-result readouts. */
export function MetricGrid(props: CompositionProps) {
  return composition('div', 'clr-metric-grid', props)
}

/** One readout within a MetricGrid: a small element frame, unframed inside a card. */
export function MetricFrame(props: CompositionProps) {
  const insideCard = useInsideCard()
  return composition(
    'div',
    insideCard ? 'clr-metric-frame' : 'clr-metric-frame clr-chamfer clr-chamfer--sm',
    props,
  )
}

/** Pinned screen action area with the system's full-width top rule. */
export function PhoneFooter(props: CompositionProps) {
  return composition('footer', 'clr-footer', props)
}
