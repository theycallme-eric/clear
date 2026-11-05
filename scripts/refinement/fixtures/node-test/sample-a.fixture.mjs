// Synthetic Node test fixture for the required-check guard self-tests.
// Not a product test; it is only executed through required-check.test.mjs.
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

describe('fixture suite', () => {
  test('passes required case', () => {
    assert.equal(1 + 1, 2)
  })
  test('skipped case', { skip: 'synthetic skip' }, () => {})
  test('failing case', () => {
    if (process.env.REQUIRED_CHECK_FIXTURE_FAIL === '1') assert.fail('synthetic failure')
  })
})

test('top level case', () => {})
test('todo case', { todo: 'synthetic todo' }, () => {})

test('shared name', () => {})
