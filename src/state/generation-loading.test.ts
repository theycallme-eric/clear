/**
 * GEN-05 — the loading view as arithmetic, and the three things it must refuse.
 *
 * The rendered half is `src/app/GenerationLoading.test.tsx`. What is here is
 * the part a rendered test cannot see: that the rows are stages that finished,
 * that no code path can produce a progress value, and that nothing in the
 * module advances on a clock.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { GenerationFailure, GENERATION_STAGES, type GenerationInput } from '../data/generation'
import { ErrorCode } from './errors'
import {
  generationLoadingView,
  generationRecoveryAction,
  GENERATION_CHANGE_LABEL,
  GENERATION_LOADING_TITLE,
  GENERATION_RETRY_LABEL,
  GENERATION_STAGE_COPY,
  type GenerationLoadingState,
} from './generation-loading'
import { makeGenerationError } from '../test/factories'

const INPUT: GenerationInput = {
  focus: 'full_body',
  requested_intensity: 6,
  requested_duration_mins: 40,
  location_id: '11111111-2222-4333-8444-555555555555',
  notes: null,
}

const PENDING: GenerationLoadingState = { status: 'pending', input: INPUT }

function failedWith(error = makeGenerationError()): GenerationLoadingState {
  return { status: 'error', input: INPUT, error }
}

describe('the stage copy', () => {
  it('names every stage the call reports, in the order the call reports them', () => {
    expect(GENERATION_STAGE_COPY.map((copy) => copy.id)).toEqual([...GENERATION_STAGES])
  })

  it('says what is happening rather than how far along it is', () => {
    for (const copy of GENERATION_STAGE_COPY) {
      // Pattern 2's content rule: "Generating session", "Reading history" — a
      // statement of the work, never a percentage or a count.
      expect(copy.label).not.toMatch(/\d|%/)
      expect(copy.label).toMatch(/^[A-Z]/)
    }
  })
})

describe('the running view reflects the stage the call reached', () => {
  it('logs nothing and names the whole operation before the first stage lands', () => {
    const view = generationLoadingView({ state: PENDING, stage: null, slow: false })

    expect(view.status).toBe('ok')
    expect(view.label).toBe(GENERATION_LOADING_TITLE)
    expect(view.lines).toEqual([])
  })

  it('announces the stage in progress and logs only the ones that finished', () => {
    const first = generationLoadingView({ state: PENDING, stage: 'validating', slow: false })

    expect(first.label).toBe('Checking options')
    // Nothing has finished yet: the stage reported is the one being done.
    expect(first.lines).toEqual([])

    const third = generationLoadingView({ state: PENDING, stage: 'composing', slow: false })

    expect(third.label).toBe('Composing session')
    expect(third.lines).toEqual(['Options · checked', 'Session · verified'])
  })

  it('keeps the log to work that happened, right up to the last stage', () => {
    const view = generationLoadingView({ state: PENDING, stage: 'reading', slow: false })

    expect(view.label).toBe('Reading workout')
    expect(view.lines).toEqual([
      'Options · checked',
      'Session · verified',
      'Request · answered',
    ])
  })

  it('never offers a recovery action while the call is still alive', () => {
    const view = generationLoadingView({ state: PENDING, stage: 'composing', slow: true })

    expect(view.error).toBeNull()
    expect(view.action).toBeNull()
  })
})

describe('slow is measured, failed is answered', () => {
  it('says slow only when the budget has passed', () => {
    expect(generationLoadingView({ state: PENDING, stage: 'composing', slow: false }).status).toBe(
      'ok',
    )
    expect(generationLoadingView({ state: PENDING, stage: 'composing', slow: true }).status).toBe(
      'slow',
    )
  })

  it('reports a failure rather than slowness when both are true', () => {
    const view = generationLoadingView({ state: failedWith(), stage: 'composing', slow: true })

    expect(view.status).toBe('failed')
  })

  it('carries the failure so one toast can state it, and keeps the log it earned', () => {
    const error = makeGenerationError({ requestId: 'req_failed_7' })
    const view = generationLoadingView({ state: failedWith(error), stage: 'reading', slow: false })

    expect(view.error).toBe(error)
    expect(view.lines).toHaveLength(3)
  })
})

describe('the one recovery action', () => {
  it('offers a retry when repeating the request could answer differently', () => {
    const action = generationRecoveryAction(makeGenerationError())

    expect(action).toEqual({ label: GENERATION_RETRY_LABEL, kind: 'retry' })
  })

  it('offers the request instead when §9 says a retry cannot work', () => {
    const action = generationRecoveryAction(
      makeGenerationError({
        code: ErrorCode.GENERATION_NO_CANDIDATES,
        failure: GenerationFailure.NO_CANDIDATES,
        retryable: false,
      }),
    )

    // Never a dead end, and never advice that cannot work.
    expect(action).toEqual({ label: GENERATION_CHANGE_LABEL, kind: 'change' })
  })

  it('is the same decision the view reports', () => {
    const error = makeGenerationError({ retryable: false })
    const view = generationLoadingView({ state: failedWith(error), stage: null, slow: false })

    expect(view.action).toEqual(generationRecoveryAction(error))
  })
})

describe('what the module refuses to contain', () => {
  // Comments stripped first, exactly as REQ-057's boot scan does it: the prose
  // that explains what this module must not do is how the reasoning stays in
  // the tree, and it is not the thing itself.
  const source = readFileSync(resolve(import.meta.dirname, 'generation-loading.ts'), 'utf-8')
  const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')

  it('has no timer anywhere in it — the sequence is as long as the work is', () => {
    expect(code).not.toMatch(/setTimeout|setInterval|requestAnimationFrame/)
  })

  it('cannot express progress, so nothing can fake it', () => {
    // Pattern 2: pass value/max only when progress is real. A view with no such
    // field is the version of that rule no screen can get wrong.
    const view = generationLoadingView({ state: PENDING, stage: 'composing', slow: false })

    expect(view).not.toHaveProperty('value')
    expect(view).not.toHaveProperty('max')
    expect(code).not.toMatch(/\bmax\b|percent|\bvalue:/)
  })
})
