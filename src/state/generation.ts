/**
 * GEN-03 — generation as a screen sees it: one call in flight at a time, four
 * states, and no fifth one where content appears from somewhere else.
 *
 * It is a mutation rather than a query, which is why it does not live in
 * `query.ts`: nothing here is keyed, cached or refetched, because generating
 * twice produces two different workouts and a cache that answered the second
 * request with the first one would be inventing content. The shape is the
 * familiar idle → pending → success | error, held in the component that asked.
 *
 * Three rules this exists to keep:
 *
 *  1. **Double submit is impossible.** The guard is a ref, not the rendered
 *     state — two clicks in one tick see the same state and only a ref has
 *     already moved.
 *  2. **A stale answer is dropped.** Cancel and unmount both invalidate the run
 *     in flight, so a workout that arrives after the user left never lands in
 *     a state somebody will render (IA — Loading).
 *  3. **A failure is an error state, never a workout.** The only path to
 *     `success` is a `Result` that said `ok`, carrying the workout the client
 *     re-parsed with CORE-03's schema.
 */
import { createContext, use, useCallback, useEffect, useRef, useState } from 'react'

import type { GenerationClient, GenerationError, GenerationInput } from '../data/generation'
import type { GenerationOutput } from './schemas'

// ─────────────────────────────────────────────────────────────────────────────
// The client, as the tree carries it
// ─────────────────────────────────────────────────────────────────────────────

export const GenerationClientContext = createContext<GenerationClient | null>(null)

export function useGenerationClient(): GenerationClient {
  const client = use(GenerationClientContext)
  if (client === null) {
    throw new Error('useGenerationClient was called outside <GenerationClientContext>')
  }
  return client
}

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every state carries the input it belongs to, which is what makes retry a
 * button rather than a form resubmission: the request that failed is still
 * here, and repeating it does not depend on a screen still holding its fields.
 */
export type GenerationState =
  | { readonly status: 'idle' }
  | { readonly status: 'pending'; readonly input: GenerationInput }
  | {
      readonly status: 'error'
      readonly input: GenerationInput
      readonly error: GenerationError
    }
  | {
      readonly status: 'success'
      readonly input: GenerationInput
      readonly requestId: string
      /** Validated by the function and re-parsed by the client. Review's input. */
      readonly workout: GenerationOutput
    }

const IDLE: GenerationState = { status: 'idle' }

export interface GenerationMutation {
  readonly state: GenerationState
  /** The submit control's disabled state, and nothing more interesting. */
  readonly isPending: boolean
  /** Starts a generation. Ignored while one is in flight. */
  generate(input: GenerationInput): void
  /** Repeats the last request. A no-op when there has not been one. */
  retry(): void
  /** Abandons the call in flight; its answer is dropped when it arrives. */
  cancel(): void
  /** Back to idle, forgetting the last answer. */
  reset(): void
}

/**
 * The mutation. Held by whichever component owns the Generate → Loading →
 * Review journey, because the state *is* that journey: a workout in `success`
 * is what Review renders, and it exists nowhere else.
 */
export function useGeneration(): GenerationMutation {
  const client = useGenerationClient()
  const [state, setState] = useState<GenerationState>(IDLE)

  /** Bumped by every start, cancel and unmount; an older run's answer is dropped. */
  const run = useRef(0)
  /** The in-flight guard. A ref because two clicks in one tick see one state. */
  const inFlight = useRef(false)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const generate = useCallback(
    (input: GenerationInput) => {
      if (inFlight.current) return

      inFlight.current = true
      run.current += 1
      const ticket = run.current
      setState({ status: 'pending', input })

      void client.generate(input).then(
        (result) => {
          if (!mounted.current || run.current !== ticket) return
          inFlight.current = false
          setState(
            result.ok
              ? {
                  status: 'success',
                  input,
                  requestId: result.value.requestId,
                  workout: result.value.workout,
                }
              : { status: 'error', input, error: result.error },
          )
        },
        // The client answers `Result` and does not throw. If one ever does, the
        // screen must not be left pending forever — but inventing a
        // `GenerationError` here would guess at a code, so the run is abandoned
        // and the throw is re-raised where it is visible.
        (reason: unknown) => {
          if (run.current === ticket) {
            inFlight.current = false
            if (mounted.current) setState(IDLE)
          }
          throw reason
        },
      )
    },
    [client],
  )

  const retry = useCallback(() => {
    if (state.status === 'idle') return
    generate(state.input)
  }, [generate, state])

  /**
   * One act under two names, because the two situations are genuinely the same
   * one: invalidate whatever is in flight and go back to idle. Cancelling
   * during the Loading screen and dismissing a finished answer differ in what
   * the user is looking at, not in what has to happen to this state.
   */
  const toIdle = useCallback(() => {
    run.current += 1
    inFlight.current = false
    setState(IDLE)
  }, [])

  return {
    state,
    isPending: state.status === 'pending',
    generate,
    retry,
    cancel: toIdle,
    reset: toIdle,
  }
}
