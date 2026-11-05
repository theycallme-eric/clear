// Synthetic Vitest fixture for the required-check guard rehearsals.
import { describe, expect, it } from 'vitest'

describe('fixture suite', () => {
  it('passes required case', () => {
    expect(1 + 1).toBe(2)
  })
  it.skip('skipped case', () => {})
  it('failing case', () => {
    if (process.env.REQUIRED_CHECK_FIXTURE_FAIL === '1') expect.unreachable('synthetic failure')
  })
})
