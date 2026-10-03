import { describe, expect, it, vi } from 'vitest'

import {
  assertSingleAttemptDeployment,
  createGenerationBudget,
  MODEL_ROUTE,
} from '../../../e2e/support/generation-budget'
import { GENERATION_SINGLE_ATTEMPT_ACCEPT } from '../../state/schemas'

const ENDPOINT = 'https://fixture.supabase.co/functions/v1/generate-workout'

describe('the browser dispatch guard (offline, no provider)', () => {
  it('reserves only one request before dispatch, even when both ask together', () => {
    const budget = createGenerationBudget(ENDPOINT)
    expect([budget.allow(ENDPOINT), budget.allow(ENDPOINT)]).toEqual([true, false])
    expect(budget.snapshot()).toEqual({ attempted: 2, forwarded: 1, blocked: 1 })
  })

  it.each([
    'https://wrong.supabase.co/functions/v1/generate-workout',
    ENDPOINT.replace('generate-workout', 'generate-section'),
    `${ENDPOINT}?bypass=1`,
  ])('blocks the wrong model endpoint and all later dispatches: %s', (url) => {
    const budget = createGenerationBudget(ENDPOINT)
    expect(MODEL_ROUTE.test(url)).toBe(true)
    expect(budget.allow(url)).toBe(false)
    expect(budget.allow(ENDPOINT)).toBe(false)
    expect(budget.snapshot()).toEqual({ attempted: 2, forwarded: 0, blocked: 2 })
  })

  it('checks the deployment without sending any authentication or personal data', async () => {
    const send = vi.fn(async () => new Response(null, { status: 204, headers: { 'x-generation-attempt-limit': '1' } }))
    await assertSingleAttemptDeployment(ENDPOINT, send as typeof globalThis.fetch)
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0]).toEqual([ENDPOINT, {
      method: 'OPTIONS', headers: { Accept: GENERATION_SINGLE_ATTEMPT_ACCEPT }, redirect: 'error', signal: expect.any(AbortSignal),
    }])
  })

  it.each([
    [204, null],
    [204, '2'],
    [200, '1'],
    [401, '1'],
  ])('refuses an old or unacknowledged deployment (%s, %s)', async (status, budget) => {
    const send = vi.fn(async () => new Response(status === 204 ? null : '{}', {
      status: Number(status), headers: budget === null ? {} : { 'x-generation-attempt-limit': String(budget) },
    }))
    await expect(assertSingleAttemptDeployment(ENDPOINT, send as typeof globalThis.fetch)).rejects.toThrow('No generation is allowed')
    expect(send).toHaveBeenCalledTimes(1)
  })
})
