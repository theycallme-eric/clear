/**
 * ENV-07 — what the harness needs from the environment, and what it does when
 * it is not there.
 *
 * Two audiences read the same three variables. A developer running the suite
 * locally has them in `.env.local`; CI has them in secret storage. Neither
 * spelling is privileged, and the server-side names win over the `VITE_` ones
 * because the `VITE_` pair exists to be inlined into a browser bundle and this
 * code never runs in one.
 *
 * The important decision is the *absence* case. A missing service-role key does
 * not fail the run: it removes the backend specs, and the harness says so once,
 * by name. A suite that cannot be run at all without production credentials is
 * a suite nobody runs.
 */

import { resolveEnv } from '../dev-preflight/env.mjs'

/** Server-side name first, browser name second. */
const SOURCES = {
  url: ['SUPABASE_URL', 'VITE_SUPABASE_URL'],
  anonKey: ['SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY'],
  serviceRoleKey: ['SUPABASE_SERVICE_ROLE_KEY'],
}

/**
 * The base URL the suite drives a browser against.
 *
 * Set it and the suite tests that origin and starts nothing — which is how CI
 * runs against the Vercel preview deployment for the pull request. Leave it
 * unset and the suite starts the local dev server, which is how it runs on a
 * laptop.
 */
export const LOCAL_BASE_URL = 'http://localhost:5173'

/**
 * @param {Record<string, string | undefined>} [processEnv]
 * @param {string} [root]
 */
export function readE2eEnv(processEnv = process.env, root = process.cwd()) {
  const { values } = resolveEnv(root, processEnv)

  /** @param {string[]} names */
  const first = (names) => {
    for (const name of names) {
      const value = values[name]
      // A placeholder copied out of `.env.example` is not a value.
      if (value && value.trim() !== '' && !value.includes('your-')) return value
    }
    return null
  }

  const url = first(SOURCES.url)
  const anonKey = first(SOURCES.anonKey)
  const serviceRoleKey = first(SOURCES.serviceRoleKey)

  return {
    url,
    anonKey,
    serviceRoleKey,
    baseURL: first(['E2E_BASE_URL']) ?? LOCAL_BASE_URL,
    /** Whether an external target was named, which is what CI does. */
    usesExternalTarget: first(['E2E_BASE_URL']) !== null,
    /** Whether the privileged specs can run at all. */
    hasBackend: url !== null && anonKey !== null && serviceRoleKey !== null,
    /** The one sentence a skipped backend spec prints. */
    missingReason:
      'Needs SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY; ' +
      'see e2e/README.md',
  }
}

/**
 * The same values, but as a hard requirement — for the two lifecycle commands,
 * which have nothing useful to do without them.
 *
 * @param {Record<string, string | undefined>} [processEnv]
 * @param {string} [root]
 */
export function requireE2eEnv(processEnv = process.env, root = process.cwd()) {
  const env = readE2eEnv(processEnv, root)
  if (env.hasBackend) return env

  const missing = [
    env.url === null && 'SUPABASE_URL (or VITE_SUPABASE_URL)',
    env.anonKey === null && 'SUPABASE_ANON_KEY (or VITE_SUPABASE_ANON_KEY)',
    env.serviceRoleKey === null && 'SUPABASE_SERVICE_ROLE_KEY',
  ].filter(Boolean)

  throw new Error(
    `Missing ${missing.join(', ')}. The service-role key is a secret: keep it ` +
      'in .env.local or CI secret storage, never in .env.example and never ' +
      'under a VITE_ prefix.',
  )
}
