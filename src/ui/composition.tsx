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
import {
  Children,
  createElement,
  Fragment,
  isValidElement,
  type ElementType,
  type HTMLAttributes,
  type ReactNode,
} from 'react'

import { EmptyState, OverflowRail } from '../design-system/index'

import { useInsideCard } from './card-context'
import { ForegroundEchoFrame } from './foreground-echo'

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

/**
 * Responsive button group: stacked on phones, equal-width row when wider.
 * REQ-004: on the background — a screen's footer — each action is an outer
 * button surface and echoes; inside a card none does.
 */
export function ActionRow({ children, ...props }: CompositionProps) {
  return composition('div', 'clr-actions', { ...props, children: echoEach(children) })
}

/** Each action its own echo target; a fragment's actions are each one too. */
function echoEach(children: ReactNode): ReactNode {
  return Children.map(children, (child) => {
    if (!isValidElement<{ children?: ReactNode }>(child)) return child
    if (child.type === Fragment) return echoEach(child.props.children)
    return <ForegroundEchoFrame>{child}</ForegroundEchoFrame>
  })
}

/**
 * In-card actions sharing the card's width: equal cells while the labels fit,
 * one full-width row each when they do not.
 * The named `clr-action-group--paired-labels` composition keeps a selected
 * semantic pair in one row, wrapping whole words inside its cells instead.
 */
export function ActionGroup(props: CompositionProps) {
  return composition('div', 'clr-action-group', props)
}

/**
 * A related collection of rows: one closed frame, or the card's when inside
 * one. Either way the rules between rows span the frame's full inner width.
 */
export function ListFrame(props: CompositionProps) {
  const insideCard = useInsideCard()
  if (insideCard) return composition('div', 'clr-list clr-list--in-card', props)
  // REQ-004: the closed frame is on the background; its rows are inside it.
  return (
    <ForegroundEchoFrame>
      {composition('div', 'clr-list clr-chamfer clr-chamfer--md', props)}
    </ForegroundEchoFrame>
  )
}

/** A row inside ListFrame; adjacent rows are separated by a card-width rule. */
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
  if (!insideCard) {
    return (
      <ForegroundEchoFrame>
        <EmptyState title={title} message={message} />
      </ForegroundEchoFrame>
    )
  }
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
  if (insideCard) return composition('div', 'clr-metric-frame', props)
  // REQ-004: the small frame is on the background; its readout is inside it.
  return (
    <ForegroundEchoFrame>
      {composition('div', 'clr-metric-frame clr-chamfer clr-chamfer--sm', props)}
    </ForegroundEchoFrame>
  )
}

/**
 * The compact workout-facts object: one aligned row of glyph-led readings, the
 * terse sibling of `MetricGrid` for a summary read at a glance (B05-03). It is
 * not a restyled metric grid — results and scores keep their readouts. A
 * description list by default. The public rail keeps every reading reachable
 * on the same line when they exceed the available width. Its named information
 * group is one keyboard entry; horizontal keys scroll the containing viewport.
 */
export function SummaryFacts(props: CompositionProps) {
  return (
    <OverflowRail
      className="clr-summary-facts-rail"
      trackProps={{
        tabIndex: 0,
        role: 'group',
        'aria-label': props['aria-label'] ?? 'Workout facts',
        'aria-labelledby': props['aria-labelledby'],
      }}
    >
      {composition('dl', 'clr-summary-facts', props)}
    </OverflowRail>
  )
}

/**
 * One reading in `SummaryFacts`. The term is always present; `termHidden` keeps
 * it for assistive technology only, where the glyph and value already say what
 * the reading is (`45 min`, `Lower body`).
 */
export function SummaryFact({
  glyph,
  term,
  termHidden = false,
  children,
}: {
  glyph?: ReactNode
  term: ReactNode
  termHidden?: boolean
  children: ReactNode
}) {
  return (
    <div className="clr-summary-fact">
      <dt>
        {glyph === undefined ? null : (
          <span aria-hidden="true" className="clr-summary-fact__glyph">
            {glyph}
          </span>
        )}
        <span className={termHidden ? 'a11y-hidden' : undefined}>{term}</span>
      </dt>
      <dd>{children}</dd>
    </div>
  )
}

/** Pinned screen action area with the system's full-width top rule. */
export function PhoneFooter(props: CompositionProps) {
  return composition('footer', 'clr-footer', props)
}
