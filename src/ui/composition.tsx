/**
 * Small semantic-neutral wrappers for the CSS-only 0.9.7 layout patterns.
 *
 * They centralise vocabulary without inventing product behaviour: callers keep
 * their native elements, accessible names and handlers through `as` and the
 * ordinary HTML attributes spread onto the rendered element.
 */
import { createElement, type ElementType, type HTMLAttributes, type ReactNode } from 'react'

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

/** One closed frame around a related collection of rows. */
export function ListFrame(props: CompositionProps) {
  return composition('div', 'clr-list clr-chamfer clr-chamfer--md', props)
}

/** A row inside ListFrame; adjacent rows receive the system inset rule. */
export function ListRow(props: CompositionProps) {
  return composition('div', 'clr-list__row', props)
}

/** Factual empty/loading copy occupying the same frame as populated rows. */
export function ListMessage({
  title,
  message,
}: {
  title: ReactNode
  message?: ReactNode
}) {
  return (
    <ListFrame>
      <ListRow>
        <div className="clr-stack clr-stack--tight">
          <p style={{ margin: 0 }}>{title}</p>
          {message === undefined ? null : (
            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>{message}</p>
          )}
        </div>
      </ListRow>
    </ListFrame>
  )
}

/** Full-width ruled band, typically around a tab rail. */
export function TabBand(props: CompositionProps) {
  return composition('div', 'clr-band', props)
}

/** Pinned screen action area with the system's full-width top rule. */
export function PhoneFooter(props: CompositionProps) {
  return composition('footer', 'clr-footer', props)
}
