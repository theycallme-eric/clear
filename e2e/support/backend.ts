import { createAdminClient } from '../../scripts/e2e/client.mjs'
import { readE2eEnv } from '../../scripts/e2e/env.mjs'

/**
 * ENV-07 — the one place a spec asks "is there a database to talk to?".
 *
 * The answer is read once, at module load, so `test.skip` can be decided while
 * the suite is being collected rather than after a browser has been started.
 * `client()` narrows the three credentials in one place, which is why no spec
 * needs a non-null assertion to use them.
 */

const env = readE2eEnv()

export const backend = {
  /** Whether the privileged specs can run at all. */
  available: env.hasBackend,
  /** The sentence a skipped spec prints instead of failing. */
  reason: env.missingReason,

  /** Only ever called from a spec that `available` did not skip. */
  client() {
    const { url, anonKey, serviceRoleKey } = env

    if (url === null || anonKey === null || serviceRoleKey === null) {
      throw new Error(env.missingReason)
    }

    return createAdminClient({ url, anonKey, serviceRoleKey })
  },
}
