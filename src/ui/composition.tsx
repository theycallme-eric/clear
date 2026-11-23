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

import {
  Calendar,
  Clock,
  Crosshair,
  EmptyState,
  Gauge,
  Log,
  Target,
} from '../design-system/index'
import type { FactKind } from '../state/review'

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
 * One Overview reading, declared by the view that owns its value (A3 TASK-118,
 * TASK-004: C12, C14). Its `kind` (`FactKind`, `state/review.ts`) picks the
 * glyph, the place in the row and whether the term stays visible; the `term`
 * is the view's own word (`Anchor` in Review, `Focus` in a saved record) and
 * the `value` its own recorded reading. Nothing here derives a value.
 */
export interface SummaryFactReading {
  readonly kind: FactKind
  readonly term: string
  readonly value: ReactNode
}

/**
 * One public system glyph per kind (R33, R74). Status has none: no single
 * glyph is true of completed, abandoned and unstarted alike, so its term says
 * what it is.
 */
const FACT_GLYPHS: Readonly<Record<FactKind, ReactNode>> = {
  duration: <Clock size={16} />,
  focus: <Target size={16} />,
  intensity: <Gauge size={16} />,
  goal: <Crosshair size={16} />,
  movements: <Log size={16} />,
  date: <Calendar size={16} />,
  status: undefined,
}

/**
 * The Overview's order (B05-03): duration, focus and intensity, then the goal
 * and the movement count, then a saved record's own date and status.
 */
const FACT_ORDER: readonly FactKind[] = ['duration', 'focus', 'intensity', 'goal', 'movements', 'date', 'status']

/**
 * Readings whose glyph and value already say what they are (`45 min`, `Upper
 * body`, a day); their term stays for assistive technology. Intensity, the
 * goal, the movement count and a status keep a visible term: `7`, `Strength`,
 * `6` and `Completed` are not readable without one.
 */
const SELF_DESCRIBING_FACTS: ReadonlySet<FactKind> = new Set<FactKind>(['duration', 'focus', 'date'])

/** Marks the kind-driven Overview composition, the one Review and a saved record share. */
const OVERVIEW_FACTS_MARK = { 'data-overview-facts': '' }

/** Compact workout facts: keep each reading whole and wrap onto more rows.
 * All values remain visible; result/score metric grids keep their own roles.
 *
 * `facts` (A3 TASK-118, TASK-004): readings that carry their kind are ordered,
 * glyphed and given their term visibility by that kind, never by their word,
 * so Review's Overview and a saved record's draw one composition (C14), marked
 * `data-overview-facts`. Facts of one kind keep the order they were given; any
 * children follow them.
 */
export function SummaryFacts({
  facts,
  children,
  ...props
}: CompositionProps & { facts?: readonly SummaryFactReading[] }) {
  if (facts === undefined) return composition('dl', 'clr-summary-facts', { ...props, children })
  const ordered = [...facts].sort((a, b) => FACT_ORDER.indexOf(a.kind) - FACT_ORDER.indexOf(b.kind))
  return composition('dl', 'clr-summary-facts', {
    ...OVERVIEW_FACTS_MARK,
    ...props,
    children: (
      <>
        {ordered.map((fact) => (
          <SummaryFact
            key={`${fact.kind}:${fact.term}`}
            glyph={FACT_GLYPHS[fact.kind]}
            term={fact.term}
            termHidden={SELF_DESCRIBING_FACTS.has(fact.kind)}
          >
            {fact.value}
          </SummaryFact>
        ))}
        {children}
      </>
    ),
  })
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
