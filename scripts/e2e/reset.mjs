#!/usr/bin/env node
/**
 * ENV-07 — `npm run e2e:reset`.
 *
 * One command, idempotent, and correct on a project that was never seeded.
 * Deleting the test users is the whole reset: every fixture row hangs off one
 * of them through a cascade, so there is no delete order to get wrong and no
 * partial teardown to leave behind.
 */

import { createAdminClient } from './client.mjs'
import { requireE2eEnv } from './env.mjs'
import { reset } from './lifecycle.mjs'

const env = requireE2eEnv()
const { deleted } = await reset(createAdminClient(env))

process.stdout.write(
  deleted.length === 0
    ? 'E2E namespace was already clear\n'
    : `E2E namespace removed: ${deleted.join(', ')}\n`,
)
