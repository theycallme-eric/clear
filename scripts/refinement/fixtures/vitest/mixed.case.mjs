// Guard self-test fixture: one pass, one failure, one skip, one todo.
import { describe, expect, it } from 'vitest'

describe('mixed fixture', () => {
  it('passing case', () => expect(1).toBe(1))
  it('failing case', () => expect(1).toBe(2))
  it.skip('skipped case', () => expect(1).toBe(1))
  it.todo('todo case')
})
