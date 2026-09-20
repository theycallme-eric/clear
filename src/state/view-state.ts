/**
 * CLEAR View-State Contract (CORE-04)
 *
 * Every data-driven view resolves to exactly one of four states:
 * loading / empty / error / ready. The union is closed and the renderer
 * switches exhaustively, so no view can render nothing.
 *
 * The presentation half of the contract lives in `src/ui/view-state.tsx`;
 * the full convention is `docs/conventions/state-contract.md`.
 */
import { useEffect, useState } from 'react'

import { isErr, type AppError, type Result } from './errors'

// ─────────────────────────────────────────────────────────────────────────────
// The four states
// ─────────────────────────────────────────────────────────────────────────────

export type ViewStatus = 'loading' | 'empty' | 'error' | 'ready'

export type ViewState<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'empty' }
  | { readonly status: 'error'; readonly error: AppError }
  | { readonly status: 'ready'; readonly data: T }

/** The operation is in flight and the view shows progress, never a blank. */
export function viewLoading<T = never>(): ViewState<T> {
  return { status: 'loading' }
}

/** The operation succeeded and there is genuinely nothing to show. */
export function viewEmpty<T = never>(): ViewState<T> {
  return { status: 'empty' }
}

/** The operation failed; the view renders the AppError with a retry. */
export function viewError<T = never>(error: AppError): ViewState<T> {
  return { status: 'error', error }
}

/** The operation succeeded with data to render. */
export function viewReady<T>(data: T): ViewState<T> {
  return { status: 'ready', data }
}

/**
 * Maps an operation `Result` onto the contract. Success resolves to `empty`
 * when `isEmpty` says the payload has nothing to show, otherwise `ready`.
 */
export function viewStateFromResult<T>(
  result: Result<T>,
  isEmpty: (data: T) => boolean = (data) =>
    Array.isArray(data) && data.length === 0,
): ViewState<T> {
  if (isErr(result)) {
    return viewError(result.error)
  }
  return isEmpty(result.value) ? viewEmpty() : viewReady(result.value)
}

// ─────────────────────────────────────────────────────────────────────────────
// Slow threshold
// ─────────────────────────────────────────────────────────────────────────────

/**
 * App-wide default for when a loading view stops pretending everything is
 * normal and says so ("Taking longer than usual"). Override per operation
 * only with a documented reason.
 */
export const SLOW_THRESHOLD_MS = 4000

/**
 * True once the current mount has been waiting longer than `thresholdMs`.
 * Loading views use it to switch ScanLoader to its honest `slow` status.
 */
export function useSlowThreshold(
  thresholdMs: number = SLOW_THRESHOLD_MS,
): boolean {
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    const id = setTimeout(() => setSlow(true), thresholdMs)
    return () => clearTimeout(id)
  }, [thresholdMs])

  return slow
}
