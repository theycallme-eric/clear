/**
 * REQ-005: the Generate button's glow on another actionable control.
 *
 * `Button variant="primary"` puts its framed button inside the package's
 * `.clr-glow`. This gives a non-primary Button or IconButton the same wrapper,
 * so the glow is the shipped one — no stronger halo, and nothing to re-tint
 * per skin. It wraps one control and never a card: a card is not an action.
 */
import type { ReactElement } from 'react'

import './action-glow.css'

export function ActionGlow({ children }: { children: ReactElement }) {
  return <span className="clr-glow clr-action-glow">{children}</span>
}
