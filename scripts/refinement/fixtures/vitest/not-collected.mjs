// Guard self-test fixture: exists, but the fixture config does not collect it.
import { expect, it } from 'vitest'

it('outside include passes', () => expect(1).toBe(1))
