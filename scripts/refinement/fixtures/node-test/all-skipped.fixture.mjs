// Synthetic Node test fixture whose every case is skipped.
import { test } from 'node:test'

test('only skipped', { skip: 'synthetic skip' }, () => {})
test('shared name', { skip: 'synthetic skip' }, () => {})
