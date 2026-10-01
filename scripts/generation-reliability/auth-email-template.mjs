/**
 * REQ-018 — the hosted email boundary, checked as far as automation can
 * truthfully check it (`npm run gr:auth-template -- --check`).
 *
 * Two things are checked, and they are different kinds of claim:
 *
 * 1. The *committed* template renders the numeric one-time code and no
 *    confirmation link. This needs no credential and always runs.
 * 2. The *hosted* template equals the committed one. The only read-only source
 *    for the hosted template is the Supabase Management API, which needs
 *    `SUPABASE_ACCESS_TOKEN`. Neither the service-role key nor the database URL
 *    can read it.
 *
 * The absence case is the important decision. Without the token the hosted
 * comparison is reported as NOT RUN — by name, on its own line — and the
 * command still exits 0 on a sound committed template, so the credential-free
 * lane stays usable. `--require-hosted` turns that absence into a failure; the
 * release checklist uses it, because a release may not rest on a skipped
 * comparison.
 *
 * This file only ever issues one GET. It sends no mail and changes no hosted
 * configuration. It never prints a template body, a token, or an address:
 * drift is reported by naming the field that differs.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { parseEnvFile } from '../dev-preflight/env.mjs'

export const TEMPLATE_PATH = 'supabase/templates/magic-link.html'
export const EXPECTED_SUBJECT = 'Your CLEAR sign-in code'

/** Local-only file the Agent Runner supplies; the process environment wins. */
const ENV_FILE = '.env.runner.local'

const CODE_TOKEN = /{{\s*\.Token\s*}}/
const LINK_TOKENS = [
  [/{{\s*\.ConfirmationURL\s*}}/i, '{{ .ConfirmationURL }}'],
  [/{{\s*\.TokenHash\s*}}/i, '{{ .TokenHash }}'],
  [/<a\b/i, 'an <a> link'],
]

/**
 * What is wrong with a template body as a numeric-code email. Empty means it
 * renders the code and offers no link in its place.
 *
 * @param {string} body
 * @returns {string[]}
 */
export function templateIntentProblems(body) {
  /** @type {string[]} */
  const problems = []

  if (!CODE_TOKEN.test(body)) {
    problems.push('does not render the numeric code token {{ .Token }}')
  }
  for (const [pattern, label] of LINK_TOKENS) {
    if (pattern.test(body)) problems.push(`contains ${label}, which sends a link instead of a code`)
  }

  return problems
}

/**
 * Differences between the hosted Auth config and the committed contract, named
 * by field. The bodies themselves are never included in the result.
 *
 * @param {{ committedBody: string, hosted: Record<string, unknown> }} input
 * @returns {string[]}
 */
export function hostedDrift({ committedBody, hosted }) {
  const hostedBody = String(hosted.mailer_templates_magic_link_content ?? '').trim()
  /** @type {string[]} */
  const drift = []

  if (hosted.mailer_subjects_magic_link !== EXPECTED_SUBJECT) {
    drift.push('hosted subject differs from the committed subject')
  }
  if (hostedBody !== committedBody.trim()) {
    drift.push(`hosted body differs from ${TEMPLATE_PATH}`)
  }
  for (const problem of templateIntentProblems(hostedBody)) {
    drift.push(`hosted body ${problem}`)
  }

  return drift
}

/**
 * Read-only: one GET against the Management API.
 *
 * @param {{ projectRef: string, accessToken: string, fetchImpl?: typeof fetch }} options
 * @returns {Promise<Record<string, unknown>>}
 */
export async function readHostedAuthConfig({ projectRef, accessToken, fetchImpl = fetch }) {
  const response = await fetchImpl(
    `https://api.supabase.com/v1/projects/${projectRef}/config/auth`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  if (!response.ok) {
    throw new Error(`Reading the hosted Auth config failed with ${response.status}`)
  }
  return response.json()
}

/**
 * @param {{
 *   root?: string,
 *   processEnv?: Record<string, string | undefined>,
 *   requireHosted?: boolean,
 *   fetchImpl?: typeof fetch,
 * }} [options]
 * @returns {Promise<{
 *   ok: boolean,
 *   hosted: 'matched' | 'drift' | 'not-run' | 'not-reached',
 *   lines: string[],
 * }>}
 */
export async function checkAuthEmailTemplate({
  root = process.cwd(),
  processEnv = process.env,
  requireHosted = false,
  fetchImpl = fetch,
} = {}) {
  const committedBody = readFileSync(resolve(root, TEMPLATE_PATH), 'utf8')
  const problems = templateIntentProblems(committedBody)

  if (problems.length > 0) {
    return {
      ok: false,
      hosted: 'not-reached',
      lines: [`FAIL committed template ${TEMPLATE_PATH}:`, ...problems.map((p) => `- ${p}`)],
    }
  }

  const lines = [`PASS committed template renders a numeric one-time code: ${TEMPLATE_PATH}`]
  const env = { ...readEnvFile(root), ...definedOnly(processEnv) }
  const accessToken = env.SUPABASE_ACCESS_TOKEN?.trim()
  const projectRef = env.SUPABASE_PROJECT_REF?.trim()

  if (!accessToken || !projectRef) {
    const missing = !accessToken ? 'SUPABASE_ACCESS_TOKEN' : 'SUPABASE_PROJECT_REF'
    lines.push(
      `${requireHosted ? 'FAIL' : 'NOT RUN'} hosted template comparison: ${missing} is not set.`,
      'The hosted template has NOT been compared with the committed one. The Supabase',
      'Management API is its only read-only source; set the token in the process',
      `environment or in ${ENV_FILE} and rerun with --require-hosted before a release.`,
    )
    return { ok: !requireHosted, hosted: 'not-run', lines }
  }

  const hosted = await readHostedAuthConfig({ projectRef, accessToken, fetchImpl })
  const drift = hostedDrift({ committedBody, hosted })

  if (drift.length > 0) {
    lines.push('FAIL hosted template drift:', ...drift.map((d) => `- ${d}`))
    return { ok: false, hosted: 'drift', lines }
  }

  lines.push('PASS hosted template and subject match the committed template')
  return { ok: true, hosted: 'matched', lines }
}

/**
 * @param {string} root
 * @returns {Record<string, string>}
 */
function readEnvFile(root) {
  try {
    return parseEnvFile(readFileSync(resolve(root, ENV_FILE), 'utf8'))
  } catch {
    return {}
  }
}

/**
 * @param {Record<string, string | undefined>} env
 * @returns {Record<string, string>}
 */
function definedOnly(env) {
  /** @type {Record<string, string>} */
  const values = {}
  for (const [name, value] of Object.entries(env)) {
    if (value !== undefined) values[name] = value
  }
  return values
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2)
  if (!args.includes('--check')) {
    console.error('Usage: npm run gr:auth-template -- --check [--require-hosted]')
    process.exit(2)
  }

  try {
    const result = await checkAuthEmailTemplate({ requireHosted: args.includes('--require-hosted') })
    for (const line of result.lines) console.log(line)
    process.exit(result.ok ? 0 : 1)
  } catch (error) {
    // The message only: a status code or a file path, never a response body.
    console.error(`FAIL ${error instanceof Error ? error.message : 'unexpected error'}`)
    process.exit(1)
  }
}
