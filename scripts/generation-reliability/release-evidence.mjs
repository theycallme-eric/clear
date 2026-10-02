/**
 * GR-07 / REQ-028 — the deployed UAT matrix and its release evidence record.
 *
 * `e2e/generation-deployed-matrix.spec.ts` walks nine entries on the deployed
 * application with disposable users and no model call. This module is the part
 * of that run with no browser and no network in it, so
 * `src/test/generation-reliability/release-evidence.test.ts` can hold it
 * without a credential:
 *
 *  * **The plan.** Which nine entries, and the saved configuration each is
 *    given. Built from the product's own presets and tiers and the committed
 *    owner-mirror fixture, never a hand-written section list.
 *  * **The verdict.** One row per saved section — candidates resolved,
 *    composed, shown on Review — and an entry passes only when every row does.
 *    An aggregate "something rendered" is not a verdict this module can give.
 *  * **The record.** `docs/process/generation-reliability/release-evidence.json`
 *    is built from an allow-list of enumerated values, counts and a commit. No
 *    address, user id, token, code or origin has a field to arrive in, and
 *    `recordProblems` refuses a record that carries one anyway.
 *  * **The target.** The deployed origin is `E2E_BASE_URL` when it is supplied;
 *    otherwise the newest ready production deployment of this repository is
 *    asked for its public alias, with the same read-only credential the
 *    pre-change snapshot uses. The origin is used and never recorded.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { parseEnvFile } from '../dev-preflight/env.mjs'
import { NAMESPACE_PREFIX, isHarnessEmail } from '../e2e/namespace.mjs'
import { DEPLOYED_REPOSITORY } from './pre-change-snapshot.mjs'

export const EVIDENCE_RECORD_PATH = 'docs/process/generation-reliability/release-evidence.json'

/** The command that writes the record, and the only thing that may. */
export const EVIDENCE_COMMAND =
  'npx playwright test e2e/generation-deployed-matrix.spec.ts --project=mobile'

/** Per-entry results of the run in progress. Under the ignored evidence directory. */
export const RUN_DIR = 'release-evidence/deployed-matrix'

/** Marks this lane's users inside the harness namespace. */
export const UAT_SLUG = 'gr-uat'

/** The nine entries REQ-028 names, in the order it names them. */
export const ENTRY_IDS = Object.freeze([
  'new_user',
  'returning_user',
  'default_preset',
  'customized_profile',
  'minimal_tier',
  'building_tier',
  'skill_power',
  'carries',
  'stability_balance',
])

/** The optional sections the catalog repair filled; each has its own entry. */
export const REPAIRED_OPTIONAL_SECTIONS = Object.freeze([
  'skill_power',
  'carries',
  'stability_balance',
])

/** The walk's steps, in order. A failure is recorded as the step it stopped in. */
export const STEPS = Object.freeze([
  'provision',
  'welcome',
  'sign_in',
  'onboarding',
  'home',
  'saved_state',
  'candidate_resolution',
  'generate',
  'loading',
  'review',
  'sections',
  'cleanup',
])

/** Every entry generates with the same focus, chosen on the Generate screen. */
export const UAT_FOCUS = 'full_body'

const DOORS = ['sign_up', 'sign_in']
const TARGET_SOURCES = ['E2E_BASE_URL', 'newest ready production deployment']

/**
 * @param {string} namespace
 * @param {string} entry
 */
export const uatEmail = (namespace, entry) =>
  `${NAMESPACE_PREFIX}-${namespace}-${UAT_SLUG}-${entry.replaceAll('_', '-')}@example.com`

/** Whether an address is one this lane, in this namespace, may create or delete. */
export const isUatEmail = (/** @type {unknown} */ email, /** @type {string} */ namespace) =>
  isHarnessEmail(email) &&
  String(email).startsWith(`${NAMESPACE_PREFIX}-${namespace}-${UAT_SLUG}-`)

/**
 * @typedef {object} UatEntry
 * @property {string} id
 * @property {'sign_up' | 'sign_in'} door  Sign-up walks Onboarding; sign-in must not.
 * @property {string} goal
 * @property {string} tier
 * @property {string[]} equipment
 * @property {string[]} sections  The saved sections, in the schema's order.
 * @property {string} focus
 */

/**
 * The nine entries and the saved configuration each one is given.
 *
 * @param {object} inputs
 * @param {Record<string, readonly string[]>} inputs.sectionsByGoal
 * @param {Record<string, readonly string[]>} inputs.equipmentByTier
 * @param {readonly string[]} inputs.sectionOrder  `section_type`, in enum order.
 * @param {{ goal: string, tier: string, enabledSections: string[], equipment: string[] }} inputs.mirror
 * @returns {UatEntry[]}
 */
export function buildUatPlan({ sectionsByGoal, equipmentByTier, sectionOrder, mirror }) {
  const ordered = (/** @type {readonly string[]} */ sections) =>
    sectionOrder.filter((section) => sections.includes(section))

  /**
   * @param {string} id
   * @param {'sign_up' | 'sign_in'} door
   * @param {string} goal
   * @param {string} tier
   * @param {string[]} [extra]
   * @returns {UatEntry}
   */
  const preset = (id, door, goal, tier, extra = []) => ({
    id,
    door,
    goal,
    tier,
    equipment: [...equipmentByTier[tier]],
    sections: ordered([...sectionsByGoal[goal], ...extra]),
    focus: UAT_FOCUS,
  })

  return [
    // Onboarded in the browser: the walk's own choices write this state.
    preset('new_user', 'sign_up', 'strength', 'full'),
    preset('returning_user', 'sign_in', 'hypertrophy', 'home'),
    preset('default_preset', 'sign_in', 'balanced', 'full'),
    {
      id: 'customized_profile',
      door: 'sign_in',
      goal: mirror.goal,
      tier: mirror.tier,
      equipment: [...mirror.equipment],
      sections: ordered(mirror.enabledSections),
      focus: UAT_FOCUS,
    },
    preset('minimal_tier', 'sign_in', 'strength', 'minimal'),
    preset('building_tier', 'sign_in', 'strength', 'building'),
    // Home is the smallest tier that can fill all three: every carry needs
    // dumbbells or kettlebells, which Minimal does not have.
    ...REPAIRED_OPTIONAL_SECTIONS.map((section) =>
      preset(section, 'sign_in', 'strength', 'home', [section]),
    ),
  ]
}

/**
 * @typedef {object} SectionObservation
 * @property {string} section
 * @property {number} candidates  How many the deployed candidate RPC resolved.
 * @property {boolean} composed   Whether the deterministic composition holds it.
 * @property {boolean} reviewed   Whether Review showed it.
 */

/**
 * One entry's result: a row for every saved section, whatever was observed.
 *
 * A section the walk never reached is a row of zeroes rather than an absence,
 * so a walk that stopped early cannot read as a shorter, passing entry.
 *
 * @param {UatEntry} entry
 * @param {object} observation
 * @param {string | null} observation.failedStep
 * @param {SectionObservation[]} observation.sections
 * @param {string[]} [observation.requestIds]
 * @param {{ usersLeft: number, rowsLeft: number } | null} observation.cleanup
 */
export function buildEntryResult(entry, observation) {
  const sections = entry.sections.map((section) => {
    const seen = observation.sections.find((row) => row.section === section)
    const candidates = Number.isInteger(seen?.candidates) ? Number(seen?.candidates) : 0
    const composed = seen?.composed === true
    const reviewed = seen?.reviewed === true
    return {
      section,
      candidates,
      composed,
      reviewed,
      result: candidates > 0 && composed && reviewed ? 'pass' : 'fail',
    }
  })

  // A cleanup that was never observed is not a clean one.
  const cleanup = observation.cleanup ?? { usersLeft: 1, rowsLeft: 0 }
  const clean = cleanup.usersLeft === 0 && cleanup.rowsLeft === 0
  const passed =
    observation.failedStep === null && clean && sections.every((row) => row.result === 'pass')
  const failedStep =
    observation.failedStep ??
    (sections.some((row) => row.result === 'fail') ? 'sections' : clean ? null : 'cleanup')

  return {
    entry: entry.id,
    door: entry.door,
    goal: entry.goal,
    tier: entry.tier,
    focus: entry.focus,
    result: passed ? 'pass' : 'fail',
    failedStep: passed ? null : failedStep,
    // Request ids are diagnostics for a failure, and are not kept for a pass.
    requestIds: passed ? [] : [...new Set(observation.requestIds ?? [])],
    sections,
    cleanup: { usersLeft: cleanup.usersLeft, rowsLeft: cleanup.rowsLeft },
  }
}

/**
 * The record. Entries are placed in the requirement's order; one the run never
 * produced is recorded as a failure at its first step, never left out.
 *
 * @param {object} run
 * @param {UatEntry[]} run.plan
 * @param {(ReturnType<typeof buildEntryResult> | null | undefined)[]} run.results
 * @param {{ source: string, commit: string | null }} run.target
 * @param {{ usersLeft: number, rowsLeft: number }} run.cleanup  The namespace-wide sweep.
 * @param {Date} [run.now]
 */
export function buildRecord({ plan, results, target, cleanup, now = new Date() }) {
  const entries = plan.map(
    (entry) =>
      results.find((result) => result?.entry === entry.id) ??
      buildEntryResult(entry, { failedStep: STEPS[0], sections: [], cleanup: null }),
  )
  const passed =
    entries.every((entry) => entry.result === 'pass') &&
    cleanup.usersLeft === 0 &&
    cleanup.rowsLeft === 0

  return {
    version: 1,
    generatedBy: EVIDENCE_COMMAND,
    notes: [
      'Generated by one run against the deployed application and the hosted project. Do not edit.',
      'Every entry is a disposable user walked to Review in a browser. Generation is answered deterministically from what the deployed candidate RPC resolved for that user, so no model is called.',
      'sections has one row per saved section: candidates is the deployed RPC’s count, composed and reviewed say the section was in the composition and shown on Review. An entry passes only when every row does.',
      'cleanup counts what the run left behind, read as the service role after deletion. No address, user id, token, code or origin is recorded.',
    ],
    recordedOn: now.toISOString().slice(0, 10),
    target: { source: target.source, commit: target.commit },
    composition: 'deterministic',
    entries,
    cleanup: { usersLeft: cleanup.usersLeft, rowsLeft: cleanup.rowsLeft },
    result: passed ? 'pass' : 'fail',
  }
}

/** @param {ReturnType<typeof buildRecord>} record */
export const serializeRecord = (record) => `${JSON.stringify(record, null, 2)}\n`

const RECORD_KEYS = [
  'cleanup',
  'composition',
  'entries',
  'generatedBy',
  'notes',
  'recordedOn',
  'result',
  'target',
  'version',
]
const ENTRY_KEYS = [
  'cleanup',
  'door',
  'entry',
  'failedStep',
  'focus',
  'goal',
  'requestIds',
  'result',
  'sections',
  'tier',
]
const SECTION_KEYS = ['candidates', 'composed', 'result', 'reviewed', 'section']
const CLEANUP_KEYS = ['rowsLeft', 'usersLeft']

/** Anything that reads as an address, a token, a key or an origin. */
const FORBIDDEN = /@|eyJ|sb_secret|sbp_|https?:\/\//

/** A request id: an opaque identifier, and nothing a sentence could hide in. */
const REQUEST_ID = /^[A-Za-z0-9_-]{1,64}$/

const isObject = (/** @type {unknown} */ value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** @param {unknown} value @param {string[]} keys */
const hasExactly = (value, keys) =>
  isObject(value) &&
  JSON.stringify(Object.keys(/** @type {object} */ (value)).sort()) === JSON.stringify(keys)

/** @param {unknown} value */
const isCount = (value) => Number.isInteger(value) && Number(value) >= 0

/** @param {unknown} value */
const isCleanup = (value) =>
  hasExactly(value, CLEANUP_KEYS) &&
  isCount(/** @type {any} */ (value).usersLeft) &&
  isCount(/** @type {any} */ (value).rowsLeft)

/**
 * Why a record is not an acceptable release evidence record. Empty when it has
 * all nine entries, each with per-section rows that agree with its result, and
 * holds nothing outside the closed vocabulary.
 *
 * This says whether the record is well formed, not whether the release passed:
 * `recordFailures` is the second question.
 *
 * @param {string | null} contents
 * @param {{ sections: readonly string[], goals: readonly string[], tiers: readonly string[],
 *           focuses: readonly string[] }} vocabulary
 * @returns {string[]}
 */
export function recordProblems(contents, vocabulary) {
  if (contents === null) return [`${EVIDENCE_RECORD_PATH} does not exist.`]

  /** @type {any} */
  let record
  try {
    record = JSON.parse(contents)
  } catch {
    return [`${EVIDENCE_RECORD_PATH} is not JSON.`]
  }

  /** @type {string[]} */
  const problems = []
  if (FORBIDDEN.test(contents)) {
    problems.push('the record contains an address, a token, a key or an origin')
  }
  if (!hasExactly(record, RECORD_KEYS)) {
    return [...problems, `the record's fields are not exactly ${RECORD_KEYS.join(', ')}`]
  }

  if (record.version !== 1) problems.push('version is not 1')
  if (record.generatedBy !== EVIDENCE_COMMAND) problems.push('generatedBy is not the command')
  if (record.composition !== 'deterministic') problems.push('composition is not deterministic')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(record.recordedOn))) {
    problems.push('recordedOn is not a date')
  }
  if (!Array.isArray(record.notes) || record.notes.some((/** @type {unknown} */ note) => typeof note !== 'string')) {
    problems.push('notes is not a list of sentences')
  }
  if (
    !hasExactly(record.target, ['commit', 'source']) ||
    !TARGET_SOURCES.includes(record.target.source) ||
    !(record.target.commit === null || /^[0-9a-f]{40}$/.test(String(record.target.commit)))
  ) {
    problems.push('target is not a known source and a full commit')
  }
  if (!isCleanup(record.cleanup)) problems.push('cleanup is not two counts')
  if (!['pass', 'fail'].includes(record.result)) problems.push('result is not pass or fail')

  const entries = Array.isArray(record.entries) ? record.entries : []
  const named = entries.map((/** @type {any} */ entry) => entry?.entry)
  if (JSON.stringify(named) !== JSON.stringify(ENTRY_IDS)) {
    problems.push(`entries are not exactly ${ENTRY_IDS.join(', ')}, in that order`)
  }

  for (const entry of entries) {
    const name = String(entry?.entry)
    if (!hasExactly(entry, ENTRY_KEYS)) {
      problems.push(`${name}: fields are not exactly ${ENTRY_KEYS.join(', ')}`)
      continue
    }
    if (!DOORS.includes(entry.door)) problems.push(`${name}: door is not sign_up or sign_in`)
    if (!vocabulary.goals.includes(entry.goal)) problems.push(`${name}: goal is not a goal preset`)
    if (!vocabulary.tiers.includes(entry.tier)) problems.push(`${name}: tier is not a tier`)
    if (!vocabulary.focuses.includes(entry.focus)) problems.push(`${name}: focus is not a focus`)
    if (!isCleanup(entry.cleanup)) problems.push(`${name}: cleanup is not two counts`)
    if (!(entry.failedStep === null || STEPS.includes(entry.failedStep))) {
      problems.push(`${name}: failedStep is not a step`)
    }
    if (
      !Array.isArray(entry.requestIds) ||
      entry.requestIds.some((/** @type {unknown} */ id) => typeof id !== 'string' || !REQUEST_ID.test(id))
    ) {
      problems.push(`${name}: requestIds is not a list of request ids`)
    }

    const rows = Array.isArray(entry.sections) ? entry.sections : []
    if (rows.length === 0) problems.push(`${name}: no section is asserted`)
    let everyRowPasses = rows.length > 0
    for (const row of rows) {
      const section = String(row?.section)
      if (
        !hasExactly(row, SECTION_KEYS) ||
        !vocabulary.sections.includes(row.section) ||
        !isCount(row.candidates) ||
        typeof row.composed !== 'boolean' ||
        typeof row.reviewed !== 'boolean'
      ) {
        problems.push(`${name} ${section}: not a section row`)
        everyRowPasses = false
        continue
      }
      const passes = row.candidates > 0 && row.composed && row.reviewed
      if (row.result !== (passes ? 'pass' : 'fail')) {
        problems.push(`${name} ${section}: result disagrees with what was observed`)
      }
      if (!passes) everyRowPasses = false
    }
    if (new Set(rows.map((/** @type {any} */ row) => row?.section)).size !== rows.length) {
      problems.push(`${name}: a section is asserted twice`)
    }
    if (
      REPAIRED_OPTIONAL_SECTIONS.includes(name) &&
      !rows.some((/** @type {any} */ row) => row?.section === name)
    ) {
      problems.push(`${name}: the section the entry is named for is not asserted`)
    }

    const clean = isCleanup(entry.cleanup) && entry.cleanup.usersLeft === 0 && entry.cleanup.rowsLeft === 0
    const passes = everyRowPasses && clean && entry.failedStep === null
    if (entry.result !== (passes ? 'pass' : 'fail')) {
      problems.push(`${name}: result disagrees with its sections, step and cleanup`)
    }
    if (entry.result === 'pass' && Array.isArray(entry.requestIds) && entry.requestIds.length > 0) {
      problems.push(`${name}: a passing entry carries request ids`)
    }
  }

  const overall =
    entries.length > 0 &&
    entries.every((/** @type {any} */ entry) => entry?.result === 'pass') &&
    isCleanup(record.cleanup) &&
    record.cleanup.usersLeft === 0 &&
    record.cleanup.rowsLeft === 0
  if (record.result !== (overall ? 'pass' : 'fail')) {
    problems.push('result disagrees with the entries and the cleanup')
  }

  return problems
}

/**
 * What a well-formed record says failed: one line per failing section, entry
 * or leftover. Empty when the release evidence demonstrates the whole matrix.
 *
 * @param {ReturnType<typeof buildRecord>} record
 * @returns {string[]}
 */
export function recordFailures(record) {
  const failures = []
  for (const entry of record.entries) {
    for (const row of entry.sections) {
      if (row.result !== 'pass') failures.push(`${entry.entry} ${row.section}: failed`)
    }
    if (entry.result !== 'pass') {
      failures.push(`${entry.entry}: failed at ${entry.failedStep ?? 'an unrecorded step'}`)
    }
  }
  if (record.cleanup.usersLeft > 0) {
    failures.push(`cleanup: ${record.cleanup.usersLeft} disposable user(s) remain`)
  }
  if (record.cleanup.rowsLeft > 0) {
    failures.push(`cleanup: ${record.cleanup.rowsLeft} disposable row(s) remain`)
  }
  return failures
}

// ── The deployed target ──────────────────────────────────────────────────────

const VERCEL_API = 'https://api.vercel.com'

/** Thrown for a target that cannot be resolved; never carries a credential. */
export class DeployedTargetError extends Error {
  /** @param {string} detail */
  constructor(detail) {
    super(`resolving the deployed application failed: ${detail}`)
    this.name = 'DeployedTargetError'
  }
}

/**
 * The two values the target is resolved from: the process environment first,
 * then the ignored runner file, as the rest of the harness reads them.
 *
 * @param {string} [root]
 * @param {Record<string, string | undefined>} [processEnv]
 */
export function readTargetEnv(root = process.cwd(), processEnv = process.env) {
  /** @type {Record<string, string>} */
  let file = {}
  try {
    file = parseEnvFile(readFileSync(resolve(root, '.env.runner.local'), 'utf8'))
  } catch (error) {
    if (/** @type {any} */ (error)?.code !== 'ENOENT') throw error
  }

  return {
    E2E_BASE_URL: processEnv.E2E_BASE_URL ?? file.E2E_BASE_URL,
    VERCEL_TOKEN: processEnv.VERCEL_TOKEN ?? file.VERCEL_TOKEN,
  }
}

/**
 * The public alias of a production deployment: a custom domain if there is
 * one, else the shortest `vercel.app` alias, which is the project's own. Branch
 * aliases sit behind Vercel's login and are never chosen.
 *
 * @param {unknown} aliases
 * @returns {string | null}
 */
export function productionAlias(aliases) {
  const names = (Array.isArray(aliases) ? aliases : [])
    .filter((alias) => typeof alias === 'string' && /^[a-z0-9.-]+$/.test(alias))
    .filter((alias) => !alias.includes('-git-'))
    .sort((a, b) => a.length - b.length || a.localeCompare(b))
  return names.find((alias) => !alias.endsWith('.vercel.app')) ?? names[0] ?? null
}

/**
 * Where the deployed application is, and which commit it was built from.
 *
 * `E2E_BASE_URL` wins when supplied. Otherwise two GETs to Vercel: the newest
 * ready production deployment of this repository, then that deployment's
 * aliases. Nothing is written anywhere.
 *
 * @param {object} options
 * @param {Record<string, string | undefined>} options.env
 * @param {typeof globalThis.fetch} [options.fetch]
 * @returns {Promise<{ origin: string, source: string, commit: string | null }>}
 */
export async function resolveDeployedTarget({ env, fetch: doFetch = fetch }) {
  const supplied = (env.E2E_BASE_URL ?? '').trim().replace(/\/+$/, '')
  const token = (env.VERCEL_TOKEN ?? '').trim()

  if (supplied === '' && token === '') {
    throw new DeployedTargetError('neither E2E_BASE_URL nor VERCEL_TOKEN is set')
  }

  /** @param {string} path @param {string} what */
  const read = async (path, what) => {
    let response
    try {
      response = await doFetch(`${VERCEL_API}${path}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      })
    } catch {
      throw new DeployedTargetError(`${what}: the request did not complete`)
    }
    if (!response.ok) throw new DeployedTargetError(`${what}: HTTP ${response.status}`)
    try {
      return /** @type {any} */ (await response.json())
    } catch {
      throw new DeployedTargetError(`${what}: the response was not JSON`)
    }
  }

  /** @type {any} */
  let newest = null
  if (token !== '') {
    try {
      const body = await read(
        '/v6/deployments?target=production&state=READY&limit=20',
        'listing production deployments',
      )
      ;[newest = null] = (Array.isArray(body?.deployments) ? body.deployments : [])
        .filter(
          (/** @type {any} */ deployment) =>
            deployment?.meta?.githubOrg === DEPLOYED_REPOSITORY.org &&
            deployment?.meta?.githubRepo === DEPLOYED_REPOSITORY.repo,
        )
        .sort((/** @type {any} */ a, /** @type {any} */ b) => Number(b.created) - Number(a.created))
    } catch (error) {
      // With the origin supplied, the commit is a detail the record can lack.
      if (supplied === '') throw error
    }
  }

  const sha = String(newest?.meta?.githubCommitSha ?? '')
  const commit = /^[0-9a-f]{40}$/.test(sha) ? sha : null

  if (supplied !== '') return { origin: supplied, source: TARGET_SOURCES[0], commit }

  if (newest === null || commit === null || typeof newest.uid !== 'string') {
    throw new DeployedTargetError('no ready production deployment names a full commit')
  }
  const detail = await read(
    `/v13/deployments/${encodeURIComponent(newest.uid)}`,
    'reading the production deployment',
  )
  const alias = productionAlias(detail?.alias)
  if (alias === null) throw new DeployedTargetError('the production deployment has no alias')

  return { origin: `https://${alias}`, source: TARGET_SOURCES[1], commit }
}
