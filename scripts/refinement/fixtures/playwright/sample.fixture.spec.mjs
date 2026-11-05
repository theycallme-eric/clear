// Synthetic Playwright fixture for the required-check guard rehearsals.
import { expect, test } from '@playwright/test'

test.describe('fixture suite', () => {
  test('passes required case', () => {
    expect(1 + 1).toBe(2)
  })
  test.skip('skipped case', () => {})
  test('failing case', () => {
    if (process.env.REQUIRED_CHECK_FIXTURE_FAIL === '1') expect(true).toBe(false)
  })
})

test('expected failure case', () => {
  test.fail()
  expect(true).toBe(false)
})
