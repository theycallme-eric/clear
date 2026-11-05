/**
 * REQ-040 / TASK-039 — verify a task's definition record for the
 * clear-refinement-20261103 body.
 *
 *   node scripts/refinement/verify-definition-record.mjs --task TASK-0NN [--record <path>]
 *
 * GAL-08 asks every affected task to cite the accepted gallery commit and
 * either the gallery states and shared owners it adopts or an explicit
 * non-gallery disposition. The record, at
 * `evidence/refinement/task-0nn/definition-record.json`, is where a task says
 * which. This checks that it says so completely and consistently with the
 * staged reference:
 *
 *  * the body, task and accepted gallery commit are the pinned ones;
 *  * a `gallery-state` record names states that exist in the staged coverage
 *    map and shared owners; a `non-gallery` record says why;
 *  * the task's own progress record exists and keeps every required part —
 *    the owner-selected replacement for the shared daily journal;
 *  * nothing in it claims Runner, merge, deployment, live-migration or paid
 *    generation authority.
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { BODY, GALLERY_COMMIT, referenceExposure } from './reference.mjs'

export const DEFINITION_SCHEMA = 'clear-refinement-definition-record-v1'
export const DISPOSITIONS = /** @type {const} */ (['gallery-state', 'non-gallery'])

/** The parts a task-owned progress record keeps, as Markdown headings. */
export const PROGRESS_SECTIONS = Object.freeze([
  'Outcome',
  'Changes',
  'Failures and corrections',
  'Verification',
  'Unresolved assumptions',
  'Next action',
])

/** Authority this body never grants a task. Each must be recorded as false. */
export const WITHHELD_AUTHORITY = Object.freeze([
  'runner',
  'selfApproval',
  'productionMerge',
  'deployment',
  'liveMigration',
  'paidGeneration',
])

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** @param {string} root @param {string} task */
export const defaultRecordPath = (root, task) =>
  join(root, 'evidence', 'refinement', task.toLowerCase(), 'definition-record.json')

/** @param {string} root @param {string} task */
export const progressRecordPath = (root, task) => `docs/journal/${BODY}/${task}.md`

/**
 * Which required parts a progress record is missing.
 *
 * @param {string} markdown
 * @param {string} task
 */
export function progressRecordProblems(markdown, task) {
  /** @type {string[]} */
  const problems = []
  if (!markdown.includes(task)) problems.push(`the progress record does not name ${task}`)
  const headings = markdown
    .split(/\r?\n/)
    .filter((line) => /^#{2,4}\s/.test(line))
    .map((line) => line.replace(/^#+\s*/, '').trim().toLowerCase())
  for (const section of PROGRESS_SECTIONS) {
    if (!headings.some((heading) => heading.startsWith(section.toLowerCase()))) {
      problems.push(`the progress record has no "${section}" section`)
    }
  }
  return problems
}

/**
 * Every reason a definition record does not hold. Never throws.
 *
 * @param {object} options
 * @param {unknown} options.record
 * @param {string} options.task
 * @param {string} options.root
 * @param {ReturnType<typeof referenceExposure> | null} [options.exposure]
 */
export function definitionRecordProblems({ record, task, root, exposure }) {
  const r = /** @type {any} */ (record)
  /** @type {string[]} */
  const problems = []
  if (!r || typeof r !== 'object') return ['the definition record is not an object']
  if (r.schema !== DEFINITION_SCHEMA) problems.push(`schema is not "${DEFINITION_SCHEMA}"`)
  if (r.body !== BODY) problems.push(`body is "${String(r.body)}", not "${BODY}"`)
  if (r.task !== task) problems.push(`task is "${String(r.task)}", not "${task}"`)
  if (r.galleryCommit !== GALLERY_COMMIT) problems.push(`galleryCommit is not the accepted gallery ${GALLERY_COMMIT}`)
  if (!Array.isArray(r.requirements) || !r.requirements.every((/** @type {unknown} */ id) => typeof id === 'string' && /^REQ-\d{3}$/.test(id)) || r.requirements.length === 0) {
    problems.push('requirements must list at least one REQ-NNN')
  }

  if (!DISPOSITIONS.includes(r.disposition)) {
    problems.push(`disposition must be one of ${DISPOSITIONS.join(', ')}`)
  } else if (r.disposition === 'gallery-state') {
    const states = Array.isArray(r.galleryStates) ? r.galleryStates : []
    if (states.length === 0) problems.push('a gallery-state record names no gallery state')
    const owners = Array.isArray(r.sharedOwners) ? r.sharedOwners : []
    if (owners.length === 0) problems.push('a gallery-state record names no shared owner')
    if (exposure) {
      for (const state of states) {
        if (!(state in exposure.stateMap)) problems.push(`gallery state "${String(state)}" is not in the accepted coverage map`)
      }
      for (const owner of owners) {
        if (!(owner in exposure.sharedOwners) && !existsSync(resolve(root, String(owner)))) {
          problems.push(`shared owner "${String(owner)}" is neither an accepted gallery owner nor a repository file`)
        }
      }
    }
  } else if (typeof r.nonGalleryReason !== 'string' || r.nonGalleryReason.trim() === '') {
    problems.push('a non-gallery record must say why the gallery does not close it')
  }

  if (!Array.isArray(r.assumptions) || r.assumptions.length === 0) {
    problems.push('assumptions must be listed, even when there is one')
  }

  const authority = r.authority ?? {}
  for (const key of WITHHELD_AUTHORITY) {
    if (authority[key] !== false) problems.push(`authority.${key} must be recorded as false`)
  }

  const progress = typeof r.progressRecord === 'string' ? r.progressRecord : null
  if (progress !== progressRecordPath(root, task)) {
    problems.push(`progressRecord must be the task-owned record ${progressRecordPath(root, task)}`)
  } else if (!existsSync(resolve(root, progress))) {
    problems.push(`the progress record ${progress} does not exist`)
  } else {
    problems.push(...progressRecordProblems(readFileSync(resolve(root, progress), 'utf8'), task))
  }

  if (r.requiredCases !== undefined) {
    const manifest = resolve(root, String(r.requiredCases))
    if (!existsSync(manifest)) problems.push(`requiredCases ${String(r.requiredCases)} does not exist`)
    else {
      try {
        const parsed = JSON.parse(readFileSync(manifest, 'utf8'))
        if (parsed.task !== task) problems.push(`requiredCases belongs to ${String(parsed.task)}`)
      } catch {
        problems.push(`requiredCases ${String(r.requiredCases)} is not JSON`)
      }
    }
  }
  return problems
}

/**
 * @param {object} options
 * @param {string} options.task
 * @param {string} [options.root]
 * @param {string} [options.recordPath]
 */
export function verifyDefinitionRecord({ task, root = REPO_ROOT, recordPath = defaultRecordPath(root, task) }) {
  let record
  try {
    record = JSON.parse(readFileSync(recordPath, 'utf8'))
  } catch {
    return [`no readable definition record at ${recordPath}`]
  }
  let exposure = null
  try {
    exposure = referenceExposure(root)
  } catch {
    return ['the staged gallery reference is unreadable; run the baseline check']
  }
  return definitionRecordProblems({ record, task, root, exposure })
}

/** @param {string[]} argv */
export function main(argv) {
  /** @type {Record<string, string>} */
  const options = {}
  for (let index = 0; index < argv.length; index++) {
    const match = /^--(task|record|root)$/.exec(argv[index])
    if (!match || argv[index + 1] === undefined) {
      process.stderr.write(`unexpected argument "${argv[index]}"\nusage: verify-definition-record.mjs --task TASK-0NN [--record <path>]\n`)
      return 2
    }
    options[match[1]] = argv[++index]
  }
  if (!options.task) {
    process.stderr.write('--task is required\n')
    return 2
  }
  const root = options.root ? resolve(options.root) : REPO_ROOT
  const problems = verifyDefinitionRecord({
    task: options.task,
    root,
    recordPath: options.record ? resolve(options.record) : undefined,
  })
  if (problems.length === 0) {
    process.stdout.write(`definition-record ${options.task}: PASSED\n`)
    return 0
  }
  process.stdout.write(`definition-record ${options.task}: FAILED\n`)
  for (const problem of problems) process.stdout.write(`  - ${problem}\n`)
  return 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2))
}
