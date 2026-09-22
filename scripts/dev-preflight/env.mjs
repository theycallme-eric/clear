/**
 * ENV-04 — the environment half of the dev preflight.
 *
 * `.env.example` is the environment contract (ENV-03), so it is also the list
 * checked here: a variable becomes required by being documented, not by being
 * restated in this file. Restating it would let the two drift, and the failure
 * that causes — the app reading a variable nothing told you to set — is exactly
 * the class of problem this preflight exists to remove.
 *
 * The placeholders `.env.example` ships do double duty: they are what a filled
 * value is compared against, which is how "you copied the file but did not fill
 * it in" becomes its own named message rather than an unexplained connection
 * failure later.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * The files Vite itself loads for `npm run dev`, in Vite's own precedence
 * order — later wins. Reading the same set means the preflight sees the values
 * the dev server will see, rather than a second, subtly different environment.
 */
export const ENV_FILES = [
  '.env',
  '.env.local',
  '.env.development',
  '.env.development.local',
]

/** Where both Supabase values are found, for anyone who has neither. */
export const CREDENTIALS_LOCATION =
  'Supabase dashboard → your project → Project Settings → API'

/**
 * A deliberately small `.env` reader: `NAME=value`, one per line, `#` comments,
 * optional `export `, optional surrounding quotes. Vite's own parser accepts
 * more, but anything this does not understand is something `.env.example` does
 * not document either.
 *
 * @param {string} text
 * @returns {Record<string, string>}
 */
export function parseEnvFile(text) {
  /** @type {Record<string, string>} */
  const values = {}

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (line === '' || line.startsWith('#')) continue

    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
    if (!match) continue

    const [, name, rawValue] = match
    values[name] = unquote(rawValue.trim())
  }

  return values
}

/**
 * @param {string} value
 * @returns {string}
 */
function unquote(value) {
  const quoted = /^(['"])([\s\S]*)\1$/.exec(value)
  return quoted ? quoted[2] : value
}

/**
 * The documented contract, read straight out of `.env.example`. The contiguous
 * comment block above each assignment is that variable's description, so the
 * message a developer reads is the sentence the contract already wrote for it.
 *
 * @param {string} root
 * @returns {{ name: string, placeholder: string, description: string }[]}
 */
export function contractVariables(root) {
  const text = readFileSync(resolve(root, '.env.example'), 'utf8')
  /** @type {{ name: string, placeholder: string, description: string }[]} */
  const variables = []
  /** @type {string[]} */
  let comment = []

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()

    if (line === '') {
      comment = []
      continue
    }

    if (line.startsWith('#')) {
      comment.push(line.replace(/^#\s?/, ''))
      continue
    }

    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
    if (!match) continue

    variables.push({
      name: match[1],
      placeholder: unquote(match[2].trim()),
      description: comment.join(' ').trim(),
    })
    comment = []
  }

  return variables
}

/**
 * Every value the dev server will resolve, from the env files plus the real
 * process environment — which wins, as it does in Vite.
 *
 * @param {string} root
 * @param {Record<string, string | undefined>} processEnv
 * @returns {{ values: Record<string, string>, files: string[] }}
 */
export function resolveEnv(root, processEnv) {
  /** @type {Record<string, string>} */
  const values = {}
  /** @type {string[]} */
  const files = []

  for (const file of ENV_FILES) {
    const text = readIfPresent(resolve(root, file))
    if (text === null) continue

    files.push(file)
    Object.assign(values, parseEnvFile(text))
  }

  for (const [name, value] of Object.entries(processEnv)) {
    if (value !== undefined) values[name] = value
  }

  return { values, files }
}

/**
 * @typedef {object} EnvProblem
 * @property {string} name
 * @property {'missing' | 'placeholder'} kind
 * @property {string} description
 * @property {string} placeholder
 */

/**
 * @param {{ root: string, processEnv: Record<string, string | undefined> }} options
 * @returns {{
 *   ok: boolean,
 *   problems: EnvProblem[],
 *   values: Record<string, string>,
 *   files: string[],
 * }}
 */
export function checkEnvironment({ root, processEnv }) {
  const { values, files } = resolveEnv(root, processEnv)
  /** @type {EnvProblem[]} */
  const problems = []

  for (const variable of contractVariables(root)) {
    const value = values[variable.name]

    if (value === undefined || value.trim() === '') {
      problems.push({ ...variable, kind: 'missing' })
      continue
    }

    if (value.trim() === variable.placeholder) {
      problems.push({ ...variable, kind: 'placeholder' })
    }
  }

  return { ok: problems.length === 0, problems, values, files }
}

/**
 * @param {string} path
 * @returns {string | null}
 */
function readIfPresent(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}
