// Guard self-test fixture: exists, but the fixture config does not collect it.
import { expect, test } from '@playwright/test'

test('outside testMatch passes', () => expect(1).toBe(1))
