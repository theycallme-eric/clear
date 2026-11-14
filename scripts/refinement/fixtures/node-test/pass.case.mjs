// Guard self-test fixture: every case passes.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

describe('guard fixture', () => {
  test('required case passes', () => assert.equal(1 + 1, 2))
  test('name with # hash passes', () => assert.ok(true))
})
test('top level case passes', () => assert.ok(true))
