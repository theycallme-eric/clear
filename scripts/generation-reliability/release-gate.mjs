/**
 * GR-06 / REQ-024, REQ-026 — the release gate and the release evidence.
 *
 * The model-backed journey (`e2e/core-loop.spec.ts`) is the last thing a
 * release proves, never the first thing it finds out with. Two things live
 * here, both as functions of plain values so the unit suite can hold them
 * without a browser, a database or a model:
 *
 *  * **The gate.** Each deterministic lane, when it passes, leaves a record
 *    naming the commit it ran on (`release-lanes.mjs` writes them). The journey
 *    asks for all three before it provisions a user; a lane with no record, a
 *    record for another commit or a record that is not a pass refuses the
 *    journey with that lane's name in the message.
 *  * **The evidence.** Whatever the journey's outcome, one JSON file keeps the
 *    request id, the HTTP status, the typed error code and the failure class.
 *    The file is built from an allow-list, field by field and shape by shape,
 *    so an address, a token, a message or a response body handed to it by
 *    mistake cannot reach the artifact.
 *
 * Nothing in this file reaches the network, and the provider is not named in
 * it.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** Ignored by git, and outside `test-results/`, which every Playwright run empties. */
export const EVIDENCE_DIR = 'release-evidence'

/** The journey's artifact, beside the lane records for the same commit. */
export const EVIDENCE_FILE = 'release-journey.json'

/**
 * The deterministic lanes the release journey waits on, in the order they are
 * run. `name` is what a refusal says; `command` is the whole of the lane.
 *
 * @typedef {object} ReleaseLane
 * @property {string} id
 * @property {string} name
 * @property {'vitest' | 'playwright'} runner
 * @property {string[]} command
 */

/** @type {ReleaseLane[]} */
export const RELEASE_LANES = [
  {
    id: 'fast-contract',
    name: 'fast contract lane',
    runner: 'vitest',
    command: ['npx', 'vitest', 'run', 'src/test/generation-reliability/fast-contract-lane.test.ts'],
  },
  {
    id: 'composition',
    name: 'composition lane',
    runner: 'vitest',
    command: ['npx', 'vitest', 'run', 'src/test/generation-reliability/composition-lane.test.ts'],
  },
  {
    id: 'critical-browser',
    name: 'critical browser lane',
    runner: 'playwright',
    command: [
      'npx',
      'playwright',
      'test',
      'e2e/generation-browser-new-user.spec.ts',
      'e2e/generation-browser-returning-user.spec.ts',
      '--project=mobile',
      '--retries=0',
    ],
  },
]

const COMMIT = /^[0-9a-f]{40}$/

/**
 * The commit in the working directory, and whether the tree still is that
 * commit. A lane that ran over uncommitted changes proved something else.
 *
 * @param {string} root
 */
export function readCommit(root) {
  const git = (/** @type {string[]} */ args) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
  return { commit: git(['rev-parse', 'HEAD']), dirty: git(['status', '--porcelain']) !== '' }
}

/**
 * @param {string} root
 * @param {string} commit
 */
export const evidenceDir = (root, commit) => join(root, EVIDENCE_DIR, commit)

/**
 * @param {string} root
 * @param {string} commit
 * @param {string} lane a `RELEASE_LANES` id
 */
export const laneRecordPath = (root, commit, lane) =>
  join(evidenceDir(root, commit), 'lanes', `${lane}.json`)

/**
 * Record that a lane passed for a commit. Called only after the lane's own
 * command exited successfully.
 *
 * @param {object} options
 * @param {string} options.root
 * @param {string} options.lane
 * @param {string} options.commit
 * @param {Date} [options.now]
 */
export function recordLanePass({ root, lane, commit, now = new Date() }) {
  if (!RELEASE_LANES.some((candidate) => candidate.id === lane)) {
    throw new Error(`"${lane}" is not a release lane`)
  }
  if (!COMMIT.test(commit)) throw new Error(`"${commit}" is not a full commit sha`)

  const path = laneRecordPath(root, commit, lane)
  mkdirSync(join(evidenceDir(root, commit), 'lanes'), { recursive: true })
  writeFileSync(
    path,
    `${JSON.stringify({ lane, commit, status: 'passed', recordedAt: now.toISOString() }, null, 2)}\n`,
  )
  return path
}

/**
 * Every lane's record for a commit, as far as one exists and parses.
 *
 * @param {string} root
 * @param {string} commit
 * @returns {Record<string, unknown>}
 */
export function readLaneRecords(root, commit) {
  /** @type {Record<string, unknown>} */
  const records = {}
  for (const lane of RELEASE_LANES) {
    const path = laneRecordPath(root, commit, lane.id)
    if (!existsSync(path)) continue
    try {
      records[lane.id] = JSON.parse(readFileSync(path, 'utf8'))
    } catch {
      records[lane.id] = null
    }
  }
  return records
}

/**
 * Why a Playwright run does not count as the lane passing, or null. Playwright
 * exits 0 when every test skipped, and both browser-lane specs skip without
 * backend credentials — a skipped lane proved nothing.
 *
 * @param {unknown} stats the JSON reporter's `stats`
 */
export function browserLaneProblem(stats) {
  const { expected, skipped, unexpected, flaky } = /** @type {Record<string, unknown>} */ (
    stats ?? {}
  )
  if (typeof expected !== 'number') return 'the run reported no result'
  if (unexpected !== 0) return `${String(unexpected)} test(s) failed`
  if (flaky !== 0) return `${String(flaky)} test(s) passed only on a retry`
  if (skipped !== 0) return `${String(skipped)} test(s) were skipped`
  if (expected === 0) return 'no test ran'
  return null
}

/**
 * The gate, as a function of the commit being released and the records found
 * for it. Never throws: every refusal is a value naming its lane.
 *
 * @param {object} options
 * @param {string} options.commit
 * @param {boolean} [options.dirty]
 * @param {Record<string, unknown>} options.records by lane id
 */
export function evaluateReleaseGate({ commit, dirty = false, records }) {
  /** @type {{ lane: string, name: string, reason: string }[]} */
  const refusals = []

  for (const lane of RELEASE_LANES) {
    const record = /** @type {Record<string, unknown> | null | undefined} */ (records[lane.id])
    const reason =
      record === undefined
        ? 'has no recorded run'
        : record === null || typeof record !== 'object' || record.lane !== lane.id
          ? 'has an unreadable record'
          : record.commit !== commit
            ? `last passed for ${String(record.commit).slice(0, 12)}, a different commit`
            : record.status !== 'passed'
              ? `is recorded as ${String(record.status)}`
              : dirty
                ? 'passed for this commit, but the working tree has changed since'
                : null
    if (reason !== null) refusals.push({ lane: lane.id, name: lane.name, reason })
  }

  const message =
    refusals.length === 0
      ? `every deterministic lane has passed for ${commit}`
      : [
          `The release journey will not start for ${commit}.`,
          ...refusals.map(
            (refusal) =>
              `  the ${refusal.name} ${refusal.reason} — npm run gr:lanes -- ${refusal.lane}`,
          ),
          'No user was created and no generation was requested.',
        ].join('\n')

  return { ok: refusals.length === 0, commit, refusals, message }
}

/**
 * The gate against the working directory. Throws the refusal, so a caller
 * that forgets to look at the result still does not proceed.
 *
 * @param {string} [root]
 * @param {typeof readCommit} [commitOf]
 */
export function assertReleaseGate(root = process.cwd(), commitOf = readCommit) {
  const { commit, dirty } = commitOf(root)
  const gate = evaluateReleaseGate({ commit, dirty, records: readLaneRecords(root, commit) })
  if (!gate.ok) throw new Error(gate.message)
  return gate
}

/**
 * Where the journey ended, in the terms a release operator investigates by.
 * Not the eligibility classes of REQ-008: those describe a refusal's cause and
 * are not on the wire; these name the boundary the journey stopped at.
 */
export const JOURNEY_FAILURE_CLASSES = [
  'none',
  'before_request',
  'no_response',
  'refused',
  'server_error',
  'invalid_response',
  'after_response',
]

/**
 * @param {object} observed
 * @param {boolean} observed.passed
 * @param {boolean} observed.requested a generation request left the browser
 * @param {number | null} observed.status
 * @param {boolean} observed.accepted the 200 carried the expected envelope
 */
export function classifyJourney({ passed, requested, status, accepted }) {
  if (passed) return 'none'
  if (!requested) return 'before_request'
  if (status === null) return 'no_response'
  if (status >= 500) return 'server_error'
  if (status !== 200) return 'refused'
  return accepted ? 'after_response' : 'invalid_response'
}

const REQUEST_ID = /^[A-Za-z0-9_-]{1,64}$/
const ERROR_CODE = /^[A-Z][A-Z0-9_]{0,63}$/

/** The artifact's fields, and the only ones. */
export const EVIDENCE_FIELDS = [
  'lane',
  'commit',
  'outcome',
  'requestId',
  'status',
  'code',
  'failureClass',
  'generationRequests',
  'recordedAt',
]

/**
 * The evidence artifact, built from an allow-list. Each field is read by name
 * and kept only in the shape it is defined to have; anything else on the
 * observation — and any value that is not an id, a status or a code — is
 * dropped rather than copied.
 *
 * @param {Record<string, unknown>} observation
 * @param {Date} [now]
 */
export function buildReleaseEvidence(observation, now = new Date()) {
  const passed = observation.passed === true
  const status =
    typeof observation.status === 'number' &&
    Number.isInteger(observation.status) &&
    observation.status >= 100 &&
    observation.status <= 599
      ? observation.status
      : null
  const requests =
    typeof observation.generationRequests === 'number' &&
    Number.isInteger(observation.generationRequests) &&
    observation.generationRequests >= 0
      ? observation.generationRequests
      : 0

  return {
    lane: 'release',
    commit:
      typeof observation.commit === 'string' && COMMIT.test(observation.commit)
        ? observation.commit
        : null,
    outcome: passed ? 'passed' : 'failed',
    requestId:
      typeof observation.requestId === 'string' && REQUEST_ID.test(observation.requestId)
        ? observation.requestId
        : null,
    status,
    code:
      typeof observation.code === 'string' && ERROR_CODE.test(observation.code)
        ? observation.code
        : null,
    failureClass: classifyJourney({
      passed,
      requested: requests > 0,
      status,
      accepted: observation.accepted === true,
    }),
    generationRequests: requests,
    recordedAt: now.toISOString(),
  }
}

/**
 * Write the artifact for a commit and return its path.
 *
 * @param {string} root
 * @param {ReturnType<typeof buildReleaseEvidence>} evidence
 */
export function writeReleaseEvidence(root, evidence) {
  const directory = evidenceDir(root, evidence.commit ?? 'unknown-commit')
  mkdirSync(directory, { recursive: true })
  const path = join(directory, EVIDENCE_FILE)
  writeFileSync(path, `${JSON.stringify(evidence, null, 2)}\n`)
  return path
}
