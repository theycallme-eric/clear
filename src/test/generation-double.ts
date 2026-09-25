/**
 * A `GenerationClient` whose answers a test controls, one call at a time.
 *
 * Deliberately not auto-resolving: everything GEN-03's state machine claims is
 * about the window while a call is in flight — the second click that must not
 * start a second call, the cancel that must drop the answer still to come — and
 * a double that resolves immediately has no such window to test in.
 */
import type {
  GenerationClient,
  GenerationError,
  GenerationInput,
  GenerationStage,
} from '../data/generation'
import { err, ok, type Result } from '../state/errors'
import type { GenerationOutput, GenerationSuccess } from '../state/schemas'
import { makeGenerationOutput } from './factories'

type Answer = Result<GenerationSuccess, GenerationError>

export interface FakeGenerationClient extends GenerationClient {
  /** Every input handed to `generate`, in order. */
  readonly calls: readonly GenerationInput[]
  /** How many calls have not been answered yet. */
  readonly outstanding: number
  /** Answers the oldest unanswered call with a workout. */
  succeed(options?: { workout?: GenerationOutput; requestId?: string }): void
  /** Answers the oldest unanswered call with a typed error. */
  fail(error: GenerationError): void
  /**
   * Reports a stage on the oldest unanswered call, the way the real client
   * reports one: as the work begins, on a call still in flight. Deliberately
   * driven rather than replayed on a timer — a stage sequence a double invents
   * is exactly the decorative progress GEN-05 must not have.
   */
  reachStage(stage: GenerationStage): void
}

export function createFakeGenerationClient(): FakeGenerationClient {
  const calls: GenerationInput[] = []
  const waiting: ((answer: Answer) => void)[] = []
  const observers: ((stage: GenerationStage) => void)[] = []

  const answer = (value: Answer) => {
    const settle = waiting.shift()
    observers.shift()
    if (settle === undefined) {
      throw new Error('the generation double was answered with nothing in flight')
    }
    settle(value)
  }

  return {
    calls,
    get outstanding() {
      return waiting.length
    },
    generate(input, options = {}) {
      calls.push(input)
      observers.push(options.onStage ?? (() => undefined))
      return new Promise<Answer>((resolve) => waiting.push(resolve))
    },
    succeed(options = {}) {
      answer(
        ok({
          requestId: options.requestId ?? 'req_test_generation',
          workout: options.workout ?? makeGenerationOutput(),
        }),
      )
    },
    fail(error) {
      answer(err(error))
    },
    reachStage(stage) {
      const observer = observers[0]
      if (observer === undefined) {
        throw new Error('the generation double reached a stage with nothing in flight')
      }
      observer(stage)
    },
  }
}
