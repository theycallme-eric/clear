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
}

export function createFakeGenerationClient(): FakeGenerationClient {
  const calls: GenerationInput[] = []
  const waiting: ((answer: Answer) => void)[] = []

  const answer = (value: Answer) => {
    const settle = waiting.shift()
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
    generate(input) {
      calls.push(input)
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
  }
}
