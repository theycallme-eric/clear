#!/usr/bin/env node
/**
 * ENV-04 — the dev preflight. `npm run dev` runs this, and Vite only starts if
 * it returns 0.
 *
 * Kills D4: sitting down to work used to mean debugging infrastructure. The two
 * things that actually go wrong — a variable nobody told you to set, and a
 * free-tier project that fell asleep — now announce themselves in one sentence
 * each, before the dev server prints a URL that was never going to work.
 *
 * Development runs against the hosted Supabase project, so there is no local
 * container stack in the loop and nothing here starts one.
 */

import { resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { checkEnvironment } from './env.mjs'
import {
  envReport,
  readyReport,
  rejectedKeyReport,
  unreachableReport,
} from './messages.mjs'
import { pingSupabase } from './ping.mjs'

const URL_VAR = 'VITE_SUPABASE_URL'
const KEY_VAR = 'VITE_SUPABASE_ANON_KEY'

const repoRoot = resolve(fileURLToPath(import.meta.url), '../../..')

/**
 * @param {object} [options]
 * @param {string} [options.root]
 * @param {Record<string, string | undefined>} [options.processEnv]
 * @param {typeof globalThis.fetch} [options.fetch]
 * @param {(text: string) => void} [options.write]
 * @param {number} [options.timeoutMs]
 * @returns {Promise<number>} the process exit code
 */
export async function preflight({
  root = repoRoot,
  processEnv = process.env,
  fetch = globalThis.fetch,
  write = (text) => void process.stdout.write(text),
  timeoutMs = undefined,
} = {}) {
  const environment = checkEnvironment({ root, processEnv })

  if (!environment.ok) {
    write(envReport(environment.problems, environment.files))
    return 1
  }

  const url = environment.values[URL_VAR].trim()
  const anonKey = environment.values[KEY_VAR].trim()

  const ping = await pingSupabase({
    url,
    anonKey,
    fetch,
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  })

  if (ping.ok) {
    write(readyReport(url))
    return 0
  }

  write(
    ping.reason === 'rejected'
      ? rejectedKeyReport({ url, detail: ping.detail, name: KEY_VAR })
      : unreachableReport({ url, detail: ping.detail }),
  )
  return 1
}

/**
 * The preflight's whole promise is that a developer reads a sentence, not a
 * trace — so even an unanticipated failure inside it reports as one line.
 */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = await preflight()
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    process.stdout.write(`CLEAR dev preflight — not starting\n\n  ${detail}\n\n`)
    process.exitCode = 1
  }
}
