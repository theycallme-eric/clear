// Guard self-test fixture: every case passes.
import { describe, expect, it } from 'vitest'

describe('guard fixture', () => {
  it('required case passes', () => expect(1 + 1).toBe(2))
  describe('nested', () => {
    it('deep case passes', () => expect('a').toBe('a'))
  })
  it('unrelated case passes', () => expect(true).toBe(true))
})
