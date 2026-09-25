/**
 * GEN-05 — what the generation loading screen says, as a function of what the
 * call is actually doing.
 *
 * Pattern 2 (`docs/design/exports/clear-design-system-0.6.0/docs/patterns.md`)
 * is the acceptance criteria for this screen, and two of its rules are the
 * reason this module exists rather than a `useState` in the component:
 *
 *  * **The status is honest.** `ok`, `slow` and `failed` are ScanLoader's own
 *    three, and here they are a total function of the mutation's state and one
 *    elapsed-time fact. Nothing can set `slow` because a sweep looks better
 *    with it, and `failed` is reachable only from an error the call returned.
 *  * **There is no `value`/`max` anywhere in this file.** Four stages are
 *    observable (`GENERATION_STAGES`), but `composing` holds essentially all of
 *    the latency, so "three of four" is not three quarters of the wait. Pattern
 *    2 calls a fake percentage "a lie a screen reader repeats"; the honest
 *    shape is an indeterminate sweep with a real label, and a view that cannot
 *    express progress cannot fake it.
 *
 * The rows are the same idiom as REQ-057's boot log: one line per stage that
 * genuinely *finished*, in the order the call does them, carried by ScanLoader
 * as decorative `aria-hidden` rows. The stage reached comes from the call
 * itself (`GenerationMutation.stage`) — there is no timer in this path, which
 * `generation-loading.test.ts` asserts against this file's source, because a
 * sequence advanced on a `setTimeout` is exactly what no rendered test would
 * notice.
 *
 * The presentation half is `src/app/GenerationLoading.tsx`.
 */
import { GENERATION_STAGES, type GenerationError, type GenerationStage } from '../data/generation'
import type { GenerationState } from './generation'

// ─────────────────────────────────────────────────────────────────────────────
// Copy
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The screen's own name: its `<h1>` and document title, and the label before
 * the first stage has reported. It is the one sentence that is true for the
 * whole mutation, and it is pattern 2's own example of saying what is
 * happening.
 */
export const GENERATION_LOADING_TITLE = 'Generating session'

/** The one exit, and the only control on the screen while the call is alive. */
export const GENERATION_CANCEL_LABEL = 'Cancel'

/**
 * What the loader says once the call has failed. Terse and factual: the
 * account of *why* is the error's own sentence, carried by the toast beside it.
 */
export const GENERATION_FAILED_LABEL = 'Generation failed'

/** Pattern 3's one recovery action, when repeating the request could work. */
export const GENERATION_RETRY_LABEL = 'Retry'

/**
 * Pattern 3's one action when it could not. `no_candidates` and `exhausted` are
 * §9's terminal failures — offering "Retry" for them would be advice that
 * cannot work, and a toast with no action at all is the dead end the pattern
 * forbids. Changing the request is the thing that is genuinely available.
 */
export const GENERATION_CHANGE_LABEL = 'Change options'

export interface GenerationStageCopy {
  readonly id: GenerationStage
  /** What is happening *now*, announced as the ScanLoader label. */
  readonly label: string
  /** The row the log keeps once this stage has finished. */
  readonly row: string
}

/**
 * One entry per stage, in `GENERATION_STAGES` order — held to that order by a
 * test, so a stage added to the call cannot arrive here unnamed or out of
 * sequence.
 */
export const GENERATION_STAGE_COPY: readonly GenerationStageCopy[] = [
  { id: 'validating', label: 'Checking options', row: 'Options · checked' },
  { id: 'authorizing', label: 'Verifying session', row: 'Session · verified' },
  { id: 'composing', label: 'Composing session', row: 'Request · answered' },
  { id: 'reading', label: 'Reading workout', row: 'Workout · read' },
] as const

// ─────────────────────────────────────────────────────────────────────────────
// The view
// ─────────────────────────────────────────────────────────────────────────────

/** The two states of the mutation this screen is on screen for. */
export type GenerationLoadingState = Extract<
  GenerationState,
  { status: 'pending' | 'error' }
>

export interface GenerationLoadingAction {
  readonly label: string
  /** `retry` repeats the request; `change` leaves for Generate. */
  readonly kind: 'retry' | 'change'
}

export interface GenerationLoadingView {
  /**
   * ScanLoader's own `status`, and never decorative: `slow` means the budget
   * has genuinely passed, `failed` means the call answered with an error.
   */
  readonly status: 'ok' | 'slow' | 'failed'
  /** The stage actually reached. The component announces it unless it is `ok`. */
  readonly label: string
  /** Stages that finished, in order. Decorative; ScanLoader hides them. */
  readonly lines: readonly string[]
  /** The failure a toast carries, and null while the run is alive. */
  readonly error: GenerationError | null
  /** Pattern 3's single action, and only once there is something to recover from. */
  readonly action: GenerationLoadingAction | null
}

/**
 * Pattern 3's single action for a failure, and the one place it is decided.
 * Both the view and the toast the screen raises read it from here, so the label
 * a person sees and the thing pressing it does cannot disagree.
 */
export function generationRecoveryAction(error: GenerationError): GenerationLoadingAction {
  return error.retryable
    ? { label: GENERATION_RETRY_LABEL, kind: 'retry' }
    : { label: GENERATION_CHANGE_LABEL, kind: 'change' }
}

/**
 * The loading screen, derived from the call's state, the stage it reported, and
 * whether the budget has passed — and from nothing else.
 *
 * Failure wins over slow, for REQ-057's reason: a user whose generation has
 * already failed is not told it is taking a while.
 */
export function generationLoadingView(input: {
  readonly state: GenerationLoadingState
  readonly stage: GenerationStage | null
  readonly slow: boolean
}): GenerationLoadingView {
  const { state, stage, slow } = input

  // The stage reported is the one *in progress*, so everything before it is
  // work that finished. A call that has reported nothing yet has finished
  // nothing, and says so with an empty log rather than a row nobody earned.
  const reached = stage === null ? -1 : GENERATION_STAGES.indexOf(stage)
  const lines =
    reached < 0 ? [] : GENERATION_STAGE_COPY.slice(0, reached).map((copy) => copy.row)
  const label = reached < 0 ? GENERATION_LOADING_TITLE : GENERATION_STAGE_COPY[reached].label

  if (state.status === 'error') {
    return {
      status: 'failed',
      label,
      lines,
      error: state.error,
      action: generationRecoveryAction(state.error),
    }
  }

  return { status: slow ? 'slow' : 'ok', label, lines, error: null, action: null }
}
