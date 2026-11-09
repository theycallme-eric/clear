// Guard self-test fixture: pass, failure, skip and todo.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

describe('mixed fixture', () => {
  test('passing case', () => assert.ok(true))
  test('failing case', () => assert.equal(1, 2))
  test('skipped case', { skip: 'not now' }, () => {})
  test('todo case', { todo: true }, () => {})
})
