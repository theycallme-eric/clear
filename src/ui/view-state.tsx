/**
 * Shared renderers for the CORE-04 four-state contract.
 *
 * `ViewStateSwitch` is the one way a data-driven view maps its `ViewState`
 * onto the screen. The switch is exhaustive over the closed union, so a view
 * that uses it cannot render nothing. Loading, empty, and error are three
 * different screens: loading is a polite `ScanLoader` status region, empty is
 * the screen's own factual `EmptyState`, and error is an alert with the
 * `AppError` message, its requestId when present, and a retry action.
 *
 * Containment: `ScanLoader` and `EmptyState` are cards themselves, and a card
 * never holds another card. Standalone, loading and error render those public
 * components. Inside a `Card` they render the same region as content of that
 * card — the card keeps its heading and frame, and the state adds the scan,
 * one line ending in the cursor, or the failure and its action.
 *
 * Convention: `docs/conventions/state-contract.md`.
 */
import type { CSSProperties, ReactNode } from 'react'

import {
  AlertTriangle,
  Button,
  EmptyState,
  Progress,
  ScanLoader,
} from '../design-system/index'
import type { AppError } from '../state/errors'
import { useSlowThreshold, type ViewState } from '../state/view-state'

import { useInsideCard } from './card-context'
import { useInterfaceLoop } from './motion'

// ─────────────────────────────────────────────────────────────────────────────
// Loading
// ─────────────────────────────────────────────────────────────────────────────

/** Exact slow-threshold copy from the design-system patterns: factual, no apology. */
export const SLOW_LOADING_LABEL = 'Taking longer than usual'

export interface LoadingViewProps {
  /** Says what is happening: "Generating session", "Reading history". */
  label: ReactNode
  /**
   * Decorative boot rows, passed through to ScanLoader. Inside a card the
   * region is one cursor line, so they are not rendered there.
   */
  lines?: ReactNode[]
  /** Supply with `max` only when progress is real. */
  value?: number
  max?: number
  /** Milliseconds before the view admits it is slow. */
  thresholdMs?: number
}

/**
 * The loading state of the contract. Renders a `ScanLoader` (there is no
 * spinner in this system); past the threshold it switches to the honest
 * `slow` status and says so, so a slow operation never appears frozen.
 *
 * Every loading region claims the view's one loop: the first keeps its sweep
 * and the rest are stilled, each still `aria-busy` with its own label.
 */
export function LoadingView({
  label,
  lines,
  value,
  max,
  thresholdMs,
}: LoadingViewProps) {
  const slow = useSlowThreshold(thresholdMs)
  const insideCard = useInsideCard()
  const loop = useInterfaceLoop('busy')
  const shown = slow ? SLOW_LOADING_LABEL : label

  if (insideCard) {
    const determinate = typeof value === 'number' && typeof max === 'number' && max > 0

    return (
      <div
        className="clr-scan clr-stack clr-stack--tight"
        role="status"
        aria-live="polite"
        aria-busy="true"
        {...loop}
      >
        <span className="clr-scan-band" aria-hidden="true" />
        <p className="label clr-cursor" style={{ margin: 0 }}>
          {shown}
        </p>
        {determinate ? (
          <Progress
            value={value}
            max={max}
            aria-label={typeof shown === 'string' ? shown : undefined}
          />
        ) : null}
      </div>
    )
  }

  return (
    <ScanLoader
      label={shown}
      status={slow ? 'slow' : 'ok'}
      lines={lines}
      value={value}
      max={max}
      {...loop}
    />
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Error
// ─────────────────────────────────────────────────────────────────────────────

export interface ErrorViewProps {
  error: AppError
  /** Names what failed: "History didn't load" — never "Oops". */
  title?: ReactNode
  /** The one recovery action's label. */
  actionLabel?: ReactNode
  /** Re-runs the failed operation. Omitting it drops the action entirely. */
  onRetry?: () => void
}

const REQUEST_ID_STYLE: CSSProperties = {
  display: 'block',
  marginTop: 'var(--spacing-200)',
  fontFamily: 'var(--font-data)',
  fontSize: 'var(--label-xs-size)',
  letterSpacing: 'var(--tracking-data)',
}

/**
 * A failed view. Severity carries a glyph, not just colour; the failure
 * glitches once on arrival; the requestId, when present, is shown for support
 * correlation. Standalone the failure frame speaks urgency on both layers
 * (surface and border); inside a card it is that card's content.
 */
export function ErrorView({
  error,
  title = 'Request failed',
  actionLabel = 'Retry',
  onRetry,
}: ErrorViewProps) {
  const insideCard = useInsideCard()

  const icon = (
    <span style={{ color: 'var(--icon-toast-negative)', display: 'flex' }}>
      <AlertTriangle />
    </span>
  )
  const message = (
    <>
      {error.message}
      {error.requestId && <span style={REQUEST_ID_STYLE}>{error.requestId}</span>}
    </>
  )

  return (
    <div role="alert" className="clr-stack clr-stack--tight clr-glitch">
      {insideCard ? (
        <>
          {icon}
          <p style={{ margin: 0 }}>{title}</p>
          <p style={{ margin: 0, color: 'var(--text-secondary)' }}>{message}</p>
        </>
      ) : (
        <EmptyState
          icon={icon}
          title={title}
          message={message}
          style={
            {
              '--surface': 'var(--surface-toast-negative)',
              '--brd': 'var(--border-toast-negative)',
            } as CSSProperties
          }
        />
      )}
      {onRetry === undefined ? null : (
        <Button variant="secondary" onClick={onRetry}>
          {actionLabel}
        </Button>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// The switch
// ─────────────────────────────────────────────────────────────────────────────

export interface ViewStateSwitchProps<T> {
  state: ViewState<T>
  /** Announced while loading: "Reading history". */
  loadingLabel: ReactNode
  /**
   * The screen's own `EmptyState` with screen-specific factual copy and one
   * imperative action. Deliberately not defaulted — "nothing yet" and
   * "nothing matches" are different messages, and only the screen knows which.
   */
  empty: ReactNode
  /** Names what failed for the error screen. */
  errorTitle?: ReactNode
  /** Re-runs the failed operation. */
  onRetry?: () => void
  /** Renders the populated view. */
  children: (data: T) => ReactNode
}

/**
 * Maps a `ViewState` onto exactly one of the four screens. The switch has no
 * default branch: the union is closed, TypeScript proves exhaustiveness, and
 * no state can fall through to a blank render.
 */
export function ViewStateSwitch<T>({
  state,
  loadingLabel,
  empty,
  errorTitle,
  onRetry,
  children,
}: ViewStateSwitchProps<T>) {
  switch (state.status) {
    case 'loading':
      return <LoadingView label={loadingLabel} />
    case 'empty':
      return <>{empty}</>
    case 'error':
      return <ErrorView error={state.error} title={errorTitle} onRetry={onRetry} />
    case 'ready':
      return <>{children(state.data)}</>
  }
}
