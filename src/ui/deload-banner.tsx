/**
 * OVR-04 — the deload banner, above the intensity selector (IA §4, Generate).
 *
 * One line saying what the app noticed, and two answers. It is deliberately not
 * a dialog: a suggestion that blocked the screen would be a decision demanded
 * rather than offered, and §4's whole point is that the user is entitled to
 * ignore this. `role="status"` and not `role="alert"` for the same reason —
 * nothing here is urgent, and nothing here has gone wrong.
 *
 * Severity is carried by a glyph and a sentence before it is carried by a hue
 * (`set-sync-notice.tsx` sets the precedent), and the reason is the specific one
 * that fired: "your last 3 back squat sessions stalled at RPE 9+", never "you
 * may need a deload". A banner that cannot say why is a banner nobody can judge.
 */
import type { CSSProperties } from 'react'

import { Button, Gauge } from '../design-system/index'
import {
  DELOAD_INTENSITY_MAX,
  DELOAD_RPE_CAP,
  type DeloadSuggestion,
} from '../state/deload'

/** §4: "If the same trigger fires after the snooze, the banner returns with the count." */
export function suggestedAgo(sessions: number | null): string | null {
  if (sessions === null) return null
  if (sessions === 0) return 'Suggested before your last session.'
  return sessions === 1 ? 'Suggested 1 session ago.' : `Suggested ${sessions} sessions ago.`
}

/** What Apply will do, in the terms §4 states it. */
export const DELOAD_TERMS =
  `Same movements, lighter: intensity capped at ${DELOAD_INTENSITY_MAX}, ` +
  `fewer working sets, RPE ${DELOAD_RPE_CAP} ceiling.`

export interface DeloadBannerProps {
  readonly suggestion: DeloadSuggestion
  /** True once the user has applied it — the banner then states what it did. */
  readonly applied: boolean
  onApply(): void
  onDismiss(): void
}

export function DeloadBanner({ suggestion, applied, onApply, onDismiss }: DeloadBannerProps) {
  const ago = suggestedAgo(suggestion.dismissedSessionsAgo)

  return (
    <div
      role="status"
      // Named, because `role="status"` is not unique on a screen (AppChrome
      // owns the app's own live region) and an unnamed one is announced as an
      // anonymous update rather than as the thing the app noticed.
      aria-label="Deload suggestion"
      className="clr-chamfer clr-chamfer--md clr-stack--tight"
      style={
        {
          display: 'flex',
          flexDirection: 'column',
          padding: 'var(--spacing-400)',
          '--surface': 'var(--surface-toast-info)',
          '--brd': 'var(--border-toast-info)',
        } as CSSProperties
      }
    >
      <p
        style={{
          margin: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--spacing-200)',
          fontFamily: 'var(--font-data)',
          letterSpacing: 'var(--tracking-data)',
          color: 'var(--icon-toast-info)',
        }}
      >
        <span aria-hidden="true" style={{ display: 'flex' }}>
          <Gauge />
        </span>
        {applied ? 'Deload applied' : 'Deload suggested'}
      </p>

      <p style={{ margin: 0 }}>{suggestion.reason}</p>
      {ago !== null && !applied && <p style={{ margin: 0 }}>{ago}</p>}

      {applied ? (
        <p style={{ margin: 0 }}>{DELOAD_TERMS} Change the intensity if you disagree.</p>
      ) : (
        <div className="clr-row" style={{ gap: 'var(--spacing-200)', flexWrap: 'wrap' }}>
          <Button variant="secondary" onClick={onApply}>
            Apply deload
          </Button>
          <Button variant="quiet" onClick={onDismiss}>
            Not today
          </Button>
        </div>
      )}
    </div>
  )
}
