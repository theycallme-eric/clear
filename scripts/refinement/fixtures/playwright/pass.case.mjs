// Guard self-test fixture: every case passes.
import { expect, test } from '@playwright/test'

test.describe('guard fixture', () => {
  test('required case passes', () => expect(1 + 1).toBe(2))
  test('unrelated case passes', () => expect(true).toBe(true))
})
