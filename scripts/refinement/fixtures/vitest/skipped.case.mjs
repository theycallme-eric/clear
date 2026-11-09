// Guard self-test fixture: nothing executes.
import { it } from 'vitest'

it.skip('only skipped case', () => {})
it.skip('another skipped case', () => {})
