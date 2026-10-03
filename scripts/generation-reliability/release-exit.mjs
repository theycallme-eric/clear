/**
 * GR-07 / REQ-018, REQ-028 — the owner's UAT results and the release exit
 * checklist.
 *
 * `docs/process/generation-reliability/release-exit.json` holds two things:
 *
 *  * **The owner's results.** The manual inbox check and the sign-in,
 *    generate and review with the real profile are a person's steps. Each is a
 *    date and pass or fail — plus the failed sub-step or a request id — and
 *    nothing else has a field to arrive in. A step nobody has performed is
 *    `not_recorded`, which is never a pass.
 *  * **The exit checklist.** Every release exit criterion names the recorded
 *    results that show it: a committed file and a line in it, a step of the
 *    release checklist whose last recorded run passed, or one of the owner's
 *    steps. `exitFailures` follows every link, so a criterion with no evidence,
 *    a dead link or an unperformed owner step fails by name.
 *
 * The owner performs each step; the owner or operator records their reported result with `npm run gr:exit -- --record …`; nothing here
 * can perform the step for them. `npm run gr:exit -- --check` is the same
 * verdict `src/test/generation-reliability/release-evidence.test.ts` holds.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const EXIT_RECORD_PATH = 'docs/process/generation-reliability/release-exit.json'
export const CHECKLIST_PATH = 'docs/process/generation-reliability/release-checklist.md'

/** The command that records an owner result. */
export const EXIT_COMMAND = 'npm run gr:exit'

/** The owner's manual steps, and the checklist step that describes each. */
export const OWNER_STEPS = Object.freeze([
  Object.freeze({ step: 'inbox_check', checklist: '1.3' }),
  Object.freeze({ step: 'generate_review', checklist: '4.2' }),
])

export const OWNER_RESULTS = Object.freeze(['pass', 'fail', 'not_recorded'])

/** The inbox check's numbered sub-steps, as the checklist numbers them. */
export const INBOX_SUB_STEPS = Object.freeze([1, 2, 3])

/**
 * The release exit criteria. The first ten are the recovery document's, in its
 * order and its words; the last two are the owner's steps REQ-018 and REQ-028
 * add to the release.
 */
export const EXIT_CRITERIA = Object.freeze([
  Object.freeze({
    id: 'section_coverage',
    criterion: 'Every selectable section has reviewed catalog coverage.',
  }),
  Object.freeze({
    id: 'tier_goal_disposition',
    criterion:
      'Every advertised equipment-tier/Goal combination is either supported or explicitly prevented before generation; there are no known-invalid saved states.',
  }),
  Object.freeze({
    id: 'candidates_per_section',
    criterion:
      'Every supported Goal × Focus × tier combination returns non-empty candidates per required section.',
  }),
  Object.freeze({
    id: 'owner_profile_resolution',
    criterion: 'The owner’s current customized profile passes candidate resolution.',
  }),
  Object.freeze({
    id: 'auth_reaches_home',
    criterion:
      'New-user and returning-user authentication both reach a generation-ready Home state.',
  }),
  Object.freeze({
    id: 'journeys',
    criterion:
      'A deterministic browser journey reaches Review and a final deployed integrated journey succeeds.',
  }),
  Object.freeze({
    id: 'deployed_matches_seed',
    criterion: 'The deployed catalog matches the committed seed viability matrix.',
  }),
  Object.freeze({
    id: 'failure_boundary',
    criterion:
      'Failures expose the actual failed boundary and section without leaking sensitive data.',
  }),
  Object.freeze({
    id: 'process_followup',
    criterion:
      'Requirements Builder and Agent Runner follow-up work has a traced task for the process gaps found here.',
  }),
  Object.freeze({
    id: 'ui_unchanged',
    criterion: 'UI/visual work remains unchanged until the explicit release word.',
  }),
  Object.freeze({
    id: 'owner_inbox_check',
    criterion:
      'The owner requests a code with a real address, receives a numeric code, and signs in.',
  }),
  Object.freeze({
    id: 'owner_generate_review',
    criterion:
      'The owner signs in and generates and reviews a workout with the current real profile.',
  }),
])

export const EXIT_NOTES = Object.freeze([
  "ownerUat is written only by the record command from the owner's reported result after the owner performs the step. An operator may record that report, not perform or infer the step. A step that has not been performed is not_recorded, which is not a pass.",
  'An owner result is a date and pass or fail, the failed sub-step of the inbox check, or the request id of a failed generation. No code, address, email content, token or account detail is recorded.',
  'exitCriteria links every release exit criterion to its recorded results: a committed file and a line in it, a release-checklist step whose last recorded run passed, or an owner step.',
])

/**
 * @typedef {object} OwnerResult
 * @property {string} step
 * @property {string} checklist
 * @property {string} result
 * @property {string | null} recordedOn
 * @property {number | null} failedSubStep
 * @property {string | null} requestId
 */

/**
 * @typedef {{ kind: 'file', path: string, anchor: string }
 *   | { kind: 'checklist', section: string }
 *   | { kind: 'owner', step: string }} EvidenceLink
 */

/**
 * @typedef {object} ExitRecord
 * @property {number} version
 * @property {string[]} notes
 * @property {OwnerResult[]} ownerUat
 * @property {{ id: string, criterion: string, evidence: EvidenceLink[] }[]} exitCriteria
 */

/** @returns {OwnerResult[]} */
export const unrecordedOwnerUat = () =>
  OWNER_STEPS.map(({ step, checklist }) => ({
    step,
    checklist,
    result: 'not_recorded',
    recordedOn: null,
    failedSubStep: null,
    requestId: null,
  }))

/**
 * The record with one owner step's result replaced. Throws for a result this
 * record has no way to hold, so nothing else can be written through it.
 *
 * @param {ExitRecord} record
 * @param {object} entry
 * @param {string} entry.step
 * @param {string} entry.result  `pass` or `fail`.
 * @param {number | null} [entry.failedSubStep]
 * @param {string | null} [entry.requestId]
 * @param {Date} [entry.now]
 * @returns {ExitRecord}
 */
export function recordOwnerResult(
  record,
  { step, result, failedSubStep = null, requestId = null, now = new Date() },
) {
  const known = OWNER_STEPS.find((candidate) => candidate.step === step)
  if (known === undefined) {
    throw new Error(`step is not one of ${OWNER_STEPS.map((owner) => owner.step).join(', ')}`)
  }
  if (result !== 'pass' && result !== 'fail') throw new Error('result is not pass or fail')

  const inbox = step === 'inbox_check'
  if (failedSubStep !== null && !(inbox && result === 'fail')) {
    throw new Error('a sub-step is recorded only for a failed inbox check')
  }
  if (inbox && result === 'fail' && !INBOX_SUB_STEPS.includes(Number(failedSubStep))) {
    throw new Error('a failed inbox check names the sub-step that failed: 1, 2 or 3')
  }
  if (requestId !== null && (inbox || result !== 'fail')) {
    throw new Error('a request id is recorded only for a failed generate and review')
  }
  if (!inbox && result === 'fail' && !(typeof requestId === 'string' && REQUEST_ID.test(requestId))) {
    throw new Error('a failed generate and review names its request id')
  }

  return {
    ...record,
    ownerUat: record.ownerUat.map((row) =>
      row.step === step
        ? {
            step,
            checklist: known.checklist,
            result,
            recordedOn: now.toISOString().slice(0, 10),
            failedSubStep: failedSubStep === null ? null : Number(failedSubStep),
            requestId,
          }
        : row,
    ),
  }
}

/** @param {ExitRecord} record */
export const serializeExitRecord = (record) => `${JSON.stringify(record, null, 2)}\n`

const RECORD_KEYS = ['exitCriteria', 'notes', 'ownerUat', 'version']
const OWNER_KEYS = ['checklist', 'failedSubStep', 'recordedOn', 'requestId', 'result', 'step']
const CRITERION_KEYS = ['criterion', 'evidence', 'id']

/** Anything that reads as an address, a token, a key or an origin. */
const FORBIDDEN = /@|eyJ|sb_secret|sbp_|https?:\/\//

/** A run of digits long enough to be a one-time code. */
const CODE_LIKE = /(?<![\w-])\d{6,10}(?![\w-])/

/** A user or row identifier. */
const IDENTIFIER = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/

/** A request id: an opaque identifier, and nothing a sentence could hide in. */
const REQUEST_ID = /^[A-Za-z0-9_-]{1,64}$/

/** A path inside the repository. */
const REPO_PATH = /^(?!\/)(?!.*\.\.)[A-Za-z0-9_./-]+$/

const isObject = (/** @type {unknown} */ value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** @param {unknown} value @param {string[]} keys */
const hasExactly = (value, keys) =>
  isObject(value) &&
  JSON.stringify(Object.keys(/** @type {object} */ (value)).sort()) === JSON.stringify(keys)

/** @param {unknown} link */
const isEvidenceLink = (link) => {
  const value = /** @type {any} */ (link)
  if (!isObject(value)) return false
  if (value.kind === 'file') {
    return (
      hasExactly(value, ['anchor', 'kind', 'path']) &&
      typeof value.path === 'string' &&
      REPO_PATH.test(value.path) &&
      typeof value.anchor === 'string' &&
      value.anchor.trim() !== ''
    )
  }
  if (value.kind === 'checklist') {
    return hasExactly(value, ['kind', 'section']) && /^\d+\.\d+$/.test(String(value.section))
  }
  if (value.kind === 'owner') {
    return (
      hasExactly(value, ['kind', 'step']) && OWNER_STEPS.some((owner) => owner.step === value.step)
    )
  }
  return false
}

/**
 * Why a record is not an acceptable release exit record. Empty when it names
 * both owner steps and every exit criterion, in order, and holds nothing
 * outside its closed vocabulary.
 *
 * This says whether the record is well formed, not whether the release may
 * exit: `exitFailures` is the second question.
 *
 * @param {string | null} contents
 * @returns {string[]}
 */
export function exitRecordProblems(contents) {
  if (contents === null) return [`${EXIT_RECORD_PATH} does not exist.`]

  /** @type {any} */
  let record
  try {
    record = JSON.parse(contents)
  } catch {
    return [`${EXIT_RECORD_PATH} is not JSON.`]
  }

  /** @type {string[]} */
  const problems = []
  if (FORBIDDEN.test(contents)) {
    problems.push('the record contains an address, a token, a key or an origin')
  }
  if (CODE_LIKE.test(contents)) problems.push('the record contains what reads as a code')
  if (IDENTIFIER.test(contents)) problems.push('the record contains an identifier')
  if (!hasExactly(record, RECORD_KEYS)) {
    return [...problems, `the record's fields are not exactly ${RECORD_KEYS.join(', ')}`]
  }

  if (record.version !== 1) problems.push('version is not 1')
  if (JSON.stringify(record.notes) !== JSON.stringify(EXIT_NOTES)) {
    problems.push('notes are not the record’s own notes')
  }

  const owner = Array.isArray(record.ownerUat) ? record.ownerUat : []
  const steps = owner.map((/** @type {any} */ row) => row?.step)
  if (JSON.stringify(steps) !== JSON.stringify(OWNER_STEPS.map((known) => known.step))) {
    problems.push(
      `ownerUat is not exactly ${OWNER_STEPS.map((known) => known.step).join(', ')}, in that order`,
    )
  }
  for (const row of owner) {
    const name = String(row?.step)
    if (!hasExactly(row, OWNER_KEYS)) {
      problems.push(`${name}: fields are not exactly ${OWNER_KEYS.join(', ')}`)
      continue
    }
    const known = OWNER_STEPS.find((candidate) => candidate.step === row.step)
    if (known !== undefined && row.checklist !== known.checklist) {
      problems.push(`${name}: checklist is not step ${known.checklist}`)
    }
    if (!OWNER_RESULTS.includes(row.result)) {
      problems.push(`${name}: result is not pass, fail or not_recorded`)
    }
    const dated = /^\d{4}-\d{2}-\d{2}$/.test(String(row.recordedOn))
    if (row.result === 'not_recorded' ? row.recordedOn !== null : !dated) {
      problems.push(`${name}: recordedOn is not the date of a recorded result`)
    }
    const failedInbox = row.step === 'inbox_check' && row.result === 'fail'
    if (failedInbox ? !INBOX_SUB_STEPS.includes(row.failedSubStep) : row.failedSubStep !== null) {
      problems.push(`${name}: failedSubStep is not the sub-step of a failed inbox check`)
    }
    const failedGenerate = row.step === 'generate_review' && row.result === 'fail'
    if (
      failedGenerate
        ? typeof row.requestId !== 'string' || !REQUEST_ID.test(row.requestId)
        : row.requestId !== null
    ) {
      problems.push(`${name}: requestId is not the request id of a failed generate and review`)
    }
  }

  const criteria = Array.isArray(record.exitCriteria) ? record.exitCriteria : []
  const ids = criteria.map((/** @type {any} */ row) => row?.id)
  if (JSON.stringify(ids) !== JSON.stringify(EXIT_CRITERIA.map((known) => known.id))) {
    problems.push(
      `exitCriteria are not exactly ${EXIT_CRITERIA.map((known) => known.id).join(', ')}, in that order`,
    )
  }
  for (const row of criteria) {
    const name = String(row?.id)
    if (!hasExactly(row, CRITERION_KEYS)) {
      problems.push(`${name}: fields are not exactly ${CRITERION_KEYS.join(', ')}`)
      continue
    }
    const known = EXIT_CRITERIA.find((candidate) => candidate.id === row.id)
    if (known !== undefined && row.criterion !== known.criterion) {
      problems.push(`${name}: criterion is not the exit criterion’s own wording`)
    }
    if (!Array.isArray(row.evidence) || !row.evidence.every(isEvidenceLink)) {
      problems.push(`${name}: evidence is not a list of file, checklist or owner links`)
    }
  }

  return problems
}

/**
 * The result cells of the last recorded run under a checklist step, or null
 * when the step is absent or its table has no filled row.
 *
 * @param {string} checklist
 * @param {string} section
 * @returns {string[] | null}
 */
export function lastChecklistRun(checklist, section) {
  return lastChecklistEntry(checklist, section)?.cells ?? null
}

/** Pair the latest dated row with its own table's explicit verdict column. */
function lastChecklistEntry(/** @type {string} */ checklist, /** @type {string} */ section) {
  const lines = checklist.split('\n')
  const start = lines.findIndex((line) => line.startsWith(`### ${section} `))
  if (start === -1) return null

  /** @type {{ cells: string[], resultColumn: number } | null} */
  let last = null
  let resultColumn = -1
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,3} /.test(line)) break
    if (!line.startsWith('|')) {
      resultColumn = -1
      continue
    }
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim())
    // A new table may change column order; never reuse an earlier table's header.
    if (cells[0] === 'Date') resultColumn = cells.findIndex((cell) => /^Result\b/.test(cell))
    if (/^\d{4}-\d{2}-\d{2}$/.test(cells[0] ?? '')) last = { cells, resultColumn }
  }
  return last
}

/**
 * Which exit criteria have no recorded, passing result behind them: one line
 * per missing criterion, missing evidence, dead link, unpassed checklist step
 * or unperformed owner step. Empty when the release may exit.
 *
 * @param {ExitRecord} record  A record `exitRecordProblems` accepts.
 * @param {(path: string) => string | null} read  A committed file, or null.
 * @returns {string[]}
 */
export function exitFailures(record, read) {
  /** @type {string[]} */
  const failures = []
  const checklist = read(CHECKLIST_PATH)

  for (const { id } of EXIT_CRITERIA) {
    const row = record.exitCriteria.find((candidate) => candidate.id === id)
    if (row === undefined) {
      failures.push(`${id}: the criterion is missing from the checklist`)
      continue
    }
    if (row.evidence.length === 0) {
      failures.push(`${id}: no recorded result is linked`)
      continue
    }

    for (const link of row.evidence) {
      if (link.kind === 'file') {
        const contents = read(link.path)
        if (contents === null) failures.push(`${id}: ${link.path} does not exist`)
        else if (!contents.includes(link.anchor)) {
          failures.push(`${id}: ${link.path} does not contain the linked result`)
        }
      } else if (link.kind === 'checklist') {
        const run = checklist === null ? null : lastChecklistEntry(checklist, link.section)
        if (run === null) {
          failures.push(`${id}: checklist step ${link.section} has no recorded run`)
        } else if (!/^pass\b/.test(run.cells[run.resultColumn] ?? '')) {
          failures.push(`${id}: the last recorded run of checklist step ${link.section} did not pass`)
        }
      } else {
        const owner = record.ownerUat.find((candidate) => candidate.step === link.step)
        if (owner === undefined || owner.result === 'not_recorded') {
          failures.push(`${id}: the owner’s ${link.step} result is not recorded`)
        } else if (owner.result !== 'pass') {
          failures.push(`${id}: the owner’s ${link.step} failed`)
        }
      }
    }
  }

  return failures
}

// ── The command ──────────────────────────────────────────────────────────────

const USAGE = [
  `${EXIT_COMMAND} -- --check`,
  `${EXIT_COMMAND} -- --record inbox_check pass`,
  `${EXIT_COMMAND} -- --record inbox_check fail --sub-step <1|2|3>`,
  `${EXIT_COMMAND} -- --record generate_review pass`,
  `${EXIT_COMMAND} -- --record generate_review fail --request-id <id>`,
].join('\n')

/** @param {string} root */
const reader = (root) => (/** @type {string} */ path) => {
  try {
    return readFileSync(resolve(root, path), 'utf8')
  } catch (error) {
    if (/** @type {any} */ (error)?.code === 'ENOENT') return null
    throw error
  }
}

/** @param {string[]} args @param {string} flag */
const valueOf = (args, flag) => {
  const index = args.indexOf(flag)
  return index === -1 ? null : (args[index + 1] ?? '')
}

/**
 * @param {string[]} args
 * @param {string} [root]
 * @returns {number} The exit status.
 */
export function main(args, root = process.cwd()) {
  const read = reader(root)
  const contents = read(EXIT_RECORD_PATH)
  const problems = exitRecordProblems(contents)

  if (args.includes('--record')) {
    if (problems.length > 0) {
      console.error(problems.join('\n'))
      return 1
    }
    const at = args.indexOf('--record')
    const subStep = valueOf(args, '--sub-step')
    try {
      const next = recordOwnerResult(JSON.parse(/** @type {string} */ (contents)), {
        step: args[at + 1] ?? '',
        result: args[at + 2] ?? '',
        failedSubStep: subStep === null ? null : Number(subStep),
        requestId: valueOf(args, '--request-id'),
      })
      const serialized = serializeExitRecord(next)
      const nextProblems = exitRecordProblems(serialized)
      if (nextProblems.length > 0) throw new Error(nextProblems.join('\n'))
      writeFileSync(resolve(root, EXIT_RECORD_PATH), serialized)
    } catch (error) {
      console.error(`${/** @type {Error} */ (error).message}\n\n${USAGE}`)
      return 1
    }
    console.log(`RECORDED ${args[at + 1]} ${args[at + 2]} in ${EXIT_RECORD_PATH}`)
    return 0
  }

  if (args.includes('--check')) {
    const failures =
      problems.length > 0 ? problems : exitFailures(JSON.parse(/** @type {string} */ (contents)), read)
    if (failures.length > 0) {
      console.error(`FAIL release exit checklist\n${failures.join('\n')}`)
      return 1
    }
    console.log('PASS every release exit criterion links to a recorded, passing result')
    return 0
  }

  console.error(USAGE)
  return 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2))
}
