/**
 * REQ-004 — the one host a generation is watched from, whichever route
 * started it.
 *
 * GEN-05's screen has no route of its own: while a run a route started is in
 * flight — or has failed and is being answered — it *is* that route's screen,
 * and the route comes back when the run is abandoned. That branch is written
 * here and nowhere else, so every entry into a generation (Generate's submit,
 * Home's Quick Start, Review's regenerate) gets the same four things by
 * rendering this rather than by remembering them:
 *
 *  * **The atmosphere swap.** `GenerationLoading` carries `full` while it is up
 *    and puts the underlying route's level back when it leaves.
 *  * **Cancel and retry, wired to the mutation.** Cancel invalidates the run and
 *    returns to the destination the route names — its own path, so leaving the
 *    Loading screen lands exactly where the user started the run.
 *  * **One toast per failure.** The pattern-3 hand-off is `GenerationLoading`'s,
 *    raised once per error and dismissed when the screen leaves or a retry
 *    replaces the failure.
 *  * **A late answer is discarded.** GEN-03 invalidates the run on cancel and on
 *    unmount, so a workout that arrives afterwards never reaches a state this
 *    host would render; the route's own content is what stays on screen.
 *
 * What the host does *not* do is decide what success means. The route holds the
 * mutation, because the success state is the only place the workout exists, and
 * handing it to Review is the route's transition to make.
 */
import { useCallback, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import type { GenerationMutation } from '../state/generation'
import { GenerationLoading } from './GenerationLoading'

export interface GenerationLoadingHostProps {
  /** The route's own `useGeneration()`; the host never starts a run. */
  readonly generation: GenerationMutation
  /**
   * Where cancel returns to: the route that started the run. When the user is
   * already there, cancelling simply takes the Loading screen down. A target
   * carrying a query string is a draft's own address (REQ-009): it is restored
   * unless the address is already exactly that.
   */
  readonly cancelTo: string
  /** The route's own screen, rendered whenever no run is being watched. */
  readonly children: ReactNode
  /** Overridden by a test, never by a screen. */
  readonly slowThresholdMs?: number
}

export function GenerationLoadingHost({
  generation,
  cancelTo,
  children,
  slowThresholdMs,
}: GenerationLoadingHostProps) {
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  const { state, stage, cancel, retry } = generation

  const leave = useCallback(() => {
    cancel()
    if (pathname !== cancelTo && `${pathname}${search}` !== cancelTo) void navigate(cancelTo)
  }, [cancel, cancelTo, navigate, pathname, search])

  if (state.status === 'pending' || state.status === 'error') {
    return (
      <GenerationLoading
        state={state}
        stage={stage}
        onCancel={leave}
        onRetry={retry}
        slowThresholdMs={slowThresholdMs}
      />
    )
  }

  return <>{children}</>
}
