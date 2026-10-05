/**
 * TextAction — the app's adapter over the design system's quietest action.
 *
 * The public `TextAction` renders a button, or a plain anchor when given an
 * `href`. A plain anchor to an in-app path reloads the document, which drops
 * the session's in-memory state, so in-app navigation needs the router's link
 * instead. This adapter adds exactly that third case: `to` renders a router
 * `Link` wearing the same public class, so the chevron, the 40px target and
 * the focus ring are the design system's by construction, not a copy of them.
 *
 * For appropriate quiet, non-destructive actions only. A primary, a
 * destructive action or an icon-only control keeps its framed `Button` /
 * `IconButton`.
 */
import type { ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router-dom'

import {
  TextAction as PublicTextAction,
  type TextActionProps as PublicTextActionProps,
} from '../design-system/index'

interface RouteTextActionProps extends Omit<LinkProps, 'to' | 'children'> {
  /** An in-app destination: renders the router's link, never a full reload. */
  to: LinkProps['to']
  /** Full width, centred: for under a primary in a footer. */
  block?: boolean
  children?: ReactNode
}

type NativeTextActionProps = PublicTextActionProps & { to?: undefined }

export type TextActionProps = RouteTextActionProps | NativeTextActionProps

export function TextAction(props: TextActionProps) {
  if (props.to === undefined) return <PublicTextAction {...props} />

  const { block = false, className, children, ...rest } = props
  return (
    <Link
      className={['clr-text-action', block ? 'clr-text-action--block' : '', className]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </Link>
  )
}
