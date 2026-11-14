// Guard self-test fixture: a pass, a failure and a runtime skip (Playwright
// reports the skipped spec with ok: true).
import { expect, test } from '@playwright/test'

test.describe('mixed fixture', () => {
  test('passing case', () => expect(1).toBe(1))
  test('failing case', () => expect(1).toBe(2))
  test('runtime skipped case', () => {
    test.skip(true, 'no test backend')
  })
})
