/**
 * ENV-04 — what the preflight says.
 *
 * Kept apart from the checks that produce it, because the wording *is* the
 * requirement: "explains problems in English" is not satisfied by an accurate
 * check with an illegible report. Every function here is pure, so the sentences
 * a developer actually reads are the ones the tests assert on.
 *
 * House rules for this file: name the variable or the service, say where the
 * fix happens, and never print a stack trace. A stack is where a dev morning
 * disappears; the link is where it gets fixed.
 */

import { CREDENTIALS_LOCATION } from './env.mjs'

const HEADING = 'CLEAR dev preflight — not starting'

/**
 * The project's own dashboard page, derived from the URL already configured,
 * so the link resolves to the project that is actually asleep rather than to
 * a project list. An unrecognisable URL falls back to the list, which is still
 * one click from the answer.
 *
 * @param {string} supabaseUrl
 * @returns {string}
 */
export function dashboardUrl(supabaseUrl) {
  const ref = /^https?:\/\/([a-z0-9-]+)\.supabase\.(co|in)\/?$/i.exec(
    supabaseUrl.trim(),
  )?.[1]

  return ref
    ? `https://supabase.com/dashboard/project/${ref}`
    : 'https://supabase.com/dashboard'
}

/**
 * @param {import('./env.mjs').EnvProblem[]} problems
 * @param {string[]} files — the env files that were found, in load order
 * @returns {string}
 */
export function envReport(problems, files) {
  const lines = [HEADING, '']

  for (const problem of problems) {
    lines.push(
      problem.kind === 'missing'
        ? `  ${problem.name} is not set.`
        : `  ${problem.name} still holds the placeholder from .env.example ("${problem.placeholder}").`,
    )
    if (problem.description) lines.push(`      What it is: ${problem.description}`)
    lines.push(`      Where to find it: ${CREDENTIALS_LOCATION}`)
    lines.push('')
  }

  if (files.length === 0) {
    lines.push(
      '  No .env file here yet. `.env.example` is the documented contract —',
      '  copy it and fill in the values above:',
      '',
      '      cp .env.example .env',
    )
  } else {
    lines.push(`  Values are read from ${files.join(', ')}. Edit ${files[0]}.`)
  }

  lines.push('', '  Then run `npm run dev` again.', '')
  return lines.join('\n')
}

/**
 * The paused case, which is the common one: free-tier projects sleep, and the
 * sentence a developer needs is the link that wakes this one.
 *
 * @param {{ url: string, detail: string }} failure
 * @returns {string}
 */
export function unreachableReport({ url, detail }) {
  return [
    HEADING,
    '',
    `  Supabase: project paused or unreachable — resume at ${dashboardUrl(url)}`,
    `      Tried: ${url} · ${detail}`,
    '',
    '  A free-tier project pauses after about a week of inactivity. Open the',
    '  link above, press Restore, and give it a minute. If the project is not',
    '  paused, check VITE_SUPABASE_URL in .env against the dashboard.',
    '',
    '  Then run `npm run dev` again.',
    '',
  ].join('\n')
}

/**
 * Awake, but it does not recognise the key. A different problem from a paused
 * project, so it gets a different sentence — collapsing the two is what sends
 * someone to the status page over a typo.
 *
 * @param {{ url: string, detail: string, name: string }} failure
 * @returns {string}
 */
export function rejectedKeyReport({ url, detail, name }) {
  return [
    HEADING,
    '',
    `  Supabase: the project at ${url} is awake but rejected ${name}.`,
    `      Tried: ${detail}`,
    '',
    '  Copy the anon/public key — never the service-role key — from',
    `  ${CREDENTIALS_LOCATION} into .env.`,
    '',
    '  Then run `npm run dev` again.',
    '',
  ].join('\n')
}

/**
 * @param {string} url
 * @returns {string}
 */
export function readyReport(url) {
  return `CLEAR dev preflight — Supabase reachable at ${url}. Starting Vite.\n`
}
