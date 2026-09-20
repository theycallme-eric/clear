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
 * Convention: `docs/conventions/state-contract.md`.
 */
import type { CSSProperties, ReactNode } from 'react'

import { AlertTriangle, EmptyState, ScanLoader } from '../design-system/index'
import type { AppError } from '../state/errors'
import { useSlowThreshold, type ViewState } from '../state/view-state'

// ─────────────────────────────────────────────────────────────────────────────
// Loading
// ─────────────────────────────────────────────────────────────────────────────

/** Exact slow-threshold copy from the design-system patterns: factual, no apology. */
export const SLOW_LOADING_LABEL = 'Taking longer than usual'

export interface LoadingViewProps {
  /** Says what is happening: "Generating session", "Reading history". */
  label: ReactNode
  /** Decorative boot rows, passed through to ScanLoader. */
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
 */
export function LoadingView({
  label,
  lines,
  value,
  max,
  thresholdMs,
}: LoadingViewProps) {
  const slow = useSlowThreshold(thresholdMs)

  return (
    <ScanLoader
      label={slow ? SLOW_LOADING_LABEL : label}
      status={slow ? 'slow' : 'ok'}
      lines={lines}
      value={value}
      max={max}
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

/**
 * Whole-screen failure. Severity carries a glyph, not just colour; the
 * failure frame speaks urgency on both layers (surface and border); the
 * requestId, when present, is shown for support correlation.
 */
export function ErrorView({
  error,
  title = 'Request failed',
  actionLabel = 'Retry',
  onRetry,
}: ErrorViewProps) {
  return (
    <div role="alert">
      <EmptyState
        icon={
          <span
            style={{ color: 'var(--icon-toast-negative)', display: 'flex' }}
          >
            <AlertTriangle />
          </span>
        }
        title={title}
        message={
          <>
            {error.message}
            {error.requestId && (
              <span
                style={{
                  display: 'block',
                  marginTop: 'var(--spacing-200)',
                  fontFamily: 'var(--font-data)',
                  fontSize: 'var(--label-xs-size)',
                  letterSpacing: 'var(--tracking-data)',
                }}
              >
                {error.requestId}
              </span>
            )}
          </>
        }
        actionLabel={onRetry ? actionLabel : undefined}
        onAction={onRetry}
        style={
          {
            '--surface': 'var(--surface-toast-negative)',
            '--brd': 'var(--border-toast-negative)',
          } as CSSProperties
        }
      />
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
