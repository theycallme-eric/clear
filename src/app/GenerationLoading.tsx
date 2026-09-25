/**
 * GEN-05 — the loading screen a generation is watched on.
 *
 * It is `ScanLoader` and a cancel action, and that is deliberately all it is.
 * The design system rescoped this requirement: the sweep, the boot-staggered
 * rows, the polite live region with `aria-busy`, the `aria-hidden` log lines and
 * the reduced-motion static state all ship
 * (`docs/specs/design/ATOMIC.md` §5), so the prototype at
 * `docs/specs/screens/loading-screen-prototype.html` is reference for the copy
 * sequence only and none of its markup or motion is ported. **There is no
 * bespoke loading markup here and no spinner anywhere in the app.**
 *
 * Pattern 2 is the acceptance criteria and three of its rules are structural
 * rather than remembered:
 *
 *  * **The label is a real stage.** `GenerationMutation.stage` is reported by
 *    the call as each stage begins, so the rows below the label are stages that
 *    genuinely finished and the label is the one in progress. Nothing here
 *    advances on a clock.
 *  * **No `value`/`max`.** `generationLoadingView` cannot express progress, so
 *    this screen cannot invent a percentage for a wait whose length nobody
 *    knows.
 *  * **`slow` is measured, `failed` is answered.** The budget is CORE-04's
 *    `SLOW_THRESHOLD_MS` and the copy is CORE-04's own sentence — the fact,
 *    with no apology and no joke.
 *
 * A failure hands off to pattern 3 rather than dying here: the loader states
 * that generation failed, and a negative toast carries the error's own
 * sentence, its request id and **exactly one** action — `Retry` when repeating
 * the request could answer differently, `Change options` when §9 says it could
 * not. The screen keeps its cancel button throughout, so there is no state of
 * this screen with no way out.
 *
 * What cancel does *not* do is stop the model: GEN-03 invalidates the run and
 * drops the answer, and the function it already paid for finishes unobserved.
 * The copy therefore promises to leave, not to abort.
 *
 * Composition and atmosphere are IA.md §4's *Loading*: `ScanLoader` + staged
 * status copy + a cancel `Button`, at `full`. It is the one screen with no route
 * of its own — it renders inside whichever route started the generation — so
 * the level comes from `screenAtmosphere` rather than from a pathname, and it is
 * put back on the way out because the route underneath never stopped being the
 * route.
 */
import { useEffect, useRef, useState } from 'react'

import { Button, ScanLoader } from '../design-system/index'
import type { GenerationStage } from '../data/generation'
import {
  generationLoadingView,
  generationRecoveryAction,
  GENERATION_CANCEL_LABEL,
  GENERATION_FAILED_LABEL,
  GENERATION_LOADING_TITLE,
  type GenerationLoadingState,
} from '../state/generation-loading'
import { showErrorToast, toastQueue } from '../state/toasts'
import { SLOW_THRESHOLD_MS } from '../state/view-state'
import { SLOW_LOADING_LABEL } from '../ui/view-state'
import { screenAtmosphere } from './atmosphere'
import { Screen } from './Screen'

/** IA.md §4 gives the transient Loading screen `full` — it is a brand moment. */
const LOADING_ATMOSPHERE = screenAtmosphere('Loading')

/**
 * True once *this attempt* has been waiting longer than the budget.
 *
 * CORE-04's `useSlowThreshold` measures a mount, which is the right answer for
 * a view that unmounts between attempts. This screen does not: a retry runs
 * from the failed state with the screen still on screen, and a run that has
 * just started is not slow because the one before it was. The budget therefore
 * restarts on the transition into `pending` and nowhere else.
 */
function useSlowAttempt(state: GenerationLoadingState, thresholdMs: number): boolean {
  const [slowAttempt, setSlowAttempt] = useState<GenerationLoadingState | null>(null)

  useEffect(() => {
    if (state.status !== 'pending') return
    const attempt = state
    const id = setTimeout(() => setSlowAttempt(attempt), thresholdMs)
    return () => clearTimeout(id)
  }, [state, thresholdMs])

  return state.status === 'pending' && slowAttempt === state
}

export interface GenerationLoadingProps {
  /**
   * The two states the screen exists for. `success` is Review's and `idle` is
   * Generate's, so a caller cannot leave this screen up over a finished call.
   */
  readonly state: GenerationLoadingState
  /** The stage the call reported, straight off `useGeneration()`. */
  readonly stage: GenerationStage | null
  /** Abandons the run and returns to Generate. Also pattern 3's exit. */
  readonly onCancel: () => void
  /** Repeats the request that failed. Offered only when §9 says it could work. */
  readonly onRetry: () => void
  /** Overridden by a test or the gallery, never by a screen. */
  readonly slowThresholdMs?: number
}

export function GenerationLoading({
  state,
  stage,
  onCancel,
  onRetry,
  slowThresholdMs = SLOW_THRESHOLD_MS,
}: GenerationLoadingProps) {
  const slow = useSlowAttempt(state, slowThresholdMs)
  const view = generationLoadingView({ state, stage, slow })

  // The screen carries the level while it is up and puts the route's own back
  // on the way out. `RootLayout` re-resolves from the pathname whenever that
  // changes, so restoring what was there is what keeps the two from fighting.
  useEffect(() => {
    const root = document.documentElement
    const previous = root.dataset.atmosphere
    root.dataset.atmosphere = LOADING_ATMOSPHERE
    return () => {
      if (previous === undefined) delete root.dataset.atmosphere
      else root.dataset.atmosphere = previous
    }
  }, [])

  // Read at click time rather than closed over, so the toast below depends on
  // the failure alone. A caller passing fresh arrow functions every render must
  // not be able to raise a second toast for one failure.
  const handlers = useRef({ onCancel, onRetry })
  useEffect(() => {
    handlers.current = { onCancel, onRetry }
  }, [onCancel, onRetry])

  // Pattern 3, on the one transition that is a failure. The dependency is the
  // error's identity: one failure, one toast, dismissed when the screen leaves
  // or when a retry replaces it.
  const failure = state.status === 'error' ? state.error : null
  useEffect(() => {
    if (failure === null) return

    const action = generationRecoveryAction(failure)
    const id = showErrorToast(failure, {
      actionLabel: action.label,
      onRetry: () => {
        if (action.kind === 'retry') handlers.current.onRetry()
        else handlers.current.onCancel()
      },
    })

    return () => toastQueue.dismiss(id)
  }, [failure])

  return (
    <div data-atmosphere={LOADING_ATMOSPHERE}>
      <Screen title={GENERATION_LOADING_TITLE}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--spacing-500)',
            alignItems: 'stretch',
          }}
        >
          <ScanLoader
            label={
              view.status === 'failed'
                ? GENERATION_FAILED_LABEL
                : view.status === 'slow'
                  ? SLOW_LOADING_LABEL
                  : view.label
            }
            status={view.status}
            lines={[...view.lines]}
          />
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <Button variant="secondary" onClick={onCancel}>
              {GENERATION_CANCEL_LABEL}
            </Button>
          </div>
        </div>
      </Screen>
    </div>
  )
}
