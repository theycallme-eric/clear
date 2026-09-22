#!/usr/bin/env node
/**
 * ENV-07 — `npm run e2e:reset`.
 *
 * One command, idempotent, and correct on a project that was never seeded.
 * Deleting the test users is the whole reset: every fixture row hangs off one
 * of them through a cascade, so there is no delete order to get wrong and no
 * partial teardown to leave behind.
 *
 * It resets **this namespace** (`E2E_NAMESPACE`, `local` by default). With
 * `--stale` it also sweeps harness users abandoned by namespaces that no longer
 * run — the residue a cancelled pull-request job leaves, which nothing else
 * knows the addresses of.
 */

import { createAdminClient } from './client.mjs'
import { requireE2eEnv } from './env.mjs'
import { reset, sweepStale } from './lifecycle.mjs'
import { NAMESPACE } from './namespace.mjs'

const env = requireE2eEnv()
const client = createAdminClient(env)

const { deleted } = await reset(client)

process.stdout.write(
  deleted.length === 0
    ? `E2E namespace '${NAMESPACE}' was already clear\n`
    : `E2E namespace '${NAMESPACE}' removed: ${deleted.join(', ')}\n`,
)

if (process.argv.includes('--stale')) {
  const { swept } = await sweepStale(client)

  process.stdout.write(
    swept.length === 0
      ? 'No abandoned harness users to sweep\n'
      : `Swept ${swept.length} abandoned harness user(s): ${swept.join(', ')}\n`,
  )
}
