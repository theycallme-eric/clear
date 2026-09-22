#!/usr/bin/env node
/**
 * ENV-07 — `npm run e2e:seed`.
 *
 * One command, idempotent, and safe to interrupt: it resets the namespace
 * before it writes, so the state it leaves is the same whether the last run
 * finished or was killed halfway.
 */

import { createAdminClient } from './client.mjs'
import { requireE2eEnv } from './env.mjs'
import { seed } from './lifecycle.mjs'
import { emailForSlot } from './namespace.mjs'

const env = requireE2eEnv()
const { users } = await seed(createAdminClient(env))

process.stdout.write(
  `E2E namespace seeded: ${Object.keys(users)
    .map((slot) => emailForSlot(/** @type {'a' | 'b'} */ (slot)))
    .join(', ')}\n`,
)
