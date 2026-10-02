/**
 * GR-07 / REQ-027 — `npm run gr:snapshot`.
 *
 *     npm run gr:snapshot -- --out <directory outside the repository>
 *                                  capture the hosted catalog and profiles,
 *                                  and write the manifest
 *     npm run gr:snapshot -- --check
 *                                  hold the committed manifest to its shape
 *                                  and to the committed migration and
 *                                  rollback, reading nothing hosted (CI)
 *
 * Run once, before the repair migration is applied, and only when the
 * deterministic lanes are green. It asks three read-only questions:
 *
 * 1. Which commit is deployed? The newest ready production deployment of this
 *    repository, from the deployment provider.
 * 2. What do the catalog tables and `profiles` hold? Every row goes to the
 *    capture directory, which must be outside the repository; the manifest
 *    keeps a row count and a SHA-256 for each file and nothing a row contained.
 * 3. What matrix does the deployed catalog produce? The whole matrix goes to
 *    the capture directory; the manifest keeps its hash, its summary, its
 *    section × tier rows and how many rows differ from the committed seed's.
 *
 * Then the rollback is rehearsed against the capture without a database: the
 * committed migration is read back from its own text and run over the captured
 * section tags (`applyChanges`, the migration's `update` in JavaScript), the
 * committed rollback is run over the result, and the outcome must be the
 * captured tags, row for row. A capture that already carries the repair is
 * refused: it is not a pre-change capture.
 *
 * Read-only is enforced rather than promised. The hosted project is reached
 * only through `createHostedReader`, which can issue a GET and nothing else,
 * and the deployment read here is a GET too. Nothing is written until every
 * read and the rehearsal have succeeded. A failure is a status code and the
 * name of what was being read — never a body, a key or an address.
 *
 * Exit codes: 0 when the capture and manifest were written, or (under
 * `--check`) when the committed manifest is acceptable; 1 otherwise. A missing
 * credential is 1 and names what is missing.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'

import { parseEnvFile } from '../dev-preflight/env.mjs'
import { REPO_ROOT } from '../gen-types/schema.mjs'
import {
  MIGRATION_PATH,
  ROLLBACK_SQL_PATH,
  applyChanges,
  parseMigration,
  parseRollback,
} from './catalog-repair.mjs'
import {
  ENV_FILES,
  HostedReadError,
  createHostedReader,
  diffMatrices,
  readDeployedCatalog,
} from './deployed.mjs'
import { CLASSIFICATIONS, buildMatrix, serializeMatrix } from './matrix.mjs'

export const MANIFEST_PATH = 'docs/process/generation-reliability/pre-change-snapshot.json'
export const MANIFEST_VERSION = 1

const GENERATED_BY = 'npm run gr:snapshot -- --out <directory outside the repository>'
const NOTES = Object.freeze([
  'Generated from one read-only pass over the hosted project, before the catalog section repair was applied. Do not edit.',
  'The captured rows are outside the repository. Only row counts and SHA-256 hashes of the capture files are recorded here.',
  'rollback.verified records that the committed migration followed by the committed rollback, run over the captured section tags, gave the capture back.',
])

/** The repository whose production deployment is the deployed commit. */
export const DEPLOYED_REPOSITORY = Object.freeze({ org: 'theycallme-eric', repo: 'clear' })
const DEPLOYMENT_SOURCE = 'newest ready production deployment'
const DEPLOYMENTS_URL =
  'https://api.vercel.com/v6/deployments?target=production&state=READY&limit=20'

/** The table the migration and the rollback change. */
const DEFINITIONS = 'exercise_definitions'

/**
 * What is captured: the catalog tables and the profiles, each in primary-key
 * order so a second capture of an unchanged project has the same hashes.
 */
export const CAPTURED_RELATIONS = Object.freeze([
  { relation: DEFINITIONS, order: 'id' },
  { relation: 'exercise_muscle_groups', order: 'exercise_id,muscle_group,role' },
  { relation: 'exercise_pattern_weights', order: 'exercise_id,movement_pattern' },
  { relation: 'profiles', order: 'id' },
])

export const MATRIX_CAPTURE_FILE = 'deployed-matrix.json'
const MATRIX_KINDS = ['sectionTiers', 'cells', 'states', 'constraints']

/** What the capture needs, and where each is expected locally. */
export const PREREQUISITES = Object.freeze([
  { name: 'SUPABASE_URL', file: '.env.runner.local' },
  { name: 'SUPABASE_SERVICE_ROLE_KEY', file: '.env.audit.local' },
  { name: 'VERCEL_TOKEN', file: '.env.runner.local' },
])

/**
 * @param {Record<string, string | undefined>} env
 * @returns {string[]}
 */
export function missingPrerequisites(env) {
  return PREREQUISITES.filter(({ name }) => (env[name] ?? '').trim() === '').map(
    ({ name, file }) => `${name} is not set (the process environment or ${file}).`,
  )
}

/** @param {string} text */
export const sha256 = (text) => createHash('sha256').update(text).digest('hex')

/**
 * A row with its keys in one order at every depth, so a hash is of the values
 * and not of the order the server happened to send them in.
 *
 * @param {unknown} value
 * @returns {unknown}
 */
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, entry]) => [key, canonical(entry)]),
    )
  }
  return value
}

/**
 * A capture file's bytes: one row per line, in the order captured.
 *
 * @param {readonly unknown[]} rows
 */
export const serializeRows = (rows) =>
  rows.map((row) => `${JSON.stringify(canonical(row))}\n`).join('')

// ── The deployed commit ──────────────────────────────────────────────────────

/**
 * The commit the newest ready production deployment of this repository was
 * built from. One GET; the response is reduced to a SHA and a time.
 *
 * @param {{ token: string, fetch?: typeof fetch }} options
 * @returns {Promise<{ sha: string, deployedAt: string }>}
 */
export async function readDeployedCommit({ token, fetch: doFetch = fetch }) {
  const what = 'the production deployment'
  let response
  try {
    response = await doFetch(DEPLOYMENTS_URL, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    })
  } catch {
    throw new HostedReadError(what, 'the request did not complete')
  }
  if (!response.ok) throw new HostedReadError(what, `HTTP ${response.status}`)

  /** @type {any} */
  let body
  try {
    body = await response.json()
  } catch {
    throw new HostedReadError(what, 'the response was not JSON')
  }

  const deployments = (Array.isArray(body?.deployments) ? body.deployments : [])
    .filter(
      (/** @type {any} */ deployment) =>
        deployment?.meta?.githubOrg === DEPLOYED_REPOSITORY.org &&
        deployment?.meta?.githubRepo === DEPLOYED_REPOSITORY.repo,
    )
    .sort((/** @type {any} */ a, /** @type {any} */ b) => Number(b.created) - Number(a.created))

  const [newest] = deployments
  const sha = String(newest?.meta?.githubCommitSha ?? '')
  if (!/^[0-9a-f]{40}$/.test(sha) || !Number.isFinite(Number(newest?.created))) {
    throw new HostedReadError(what, 'no ready production deployment names a full commit')
  }

  return { sha, deployedAt: new Date(Number(newest.created)).toISOString() }
}

// ── The rollback, rehearsed ──────────────────────────────────────────────────

/**
 * @typedef {import('./section-ledger.mjs').Membership} Membership
 */

/**
 * Section tags, in one form, for comparing and hashing.
 *
 * @param {ReadonlyMap<string, Membership>} catalog
 */
const serializeTags = (catalog) =>
  serializeRows(
    [...catalog]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([id, { sections, canBePrimary }]) => ({ id, sections, canBePrimary })),
  )

/**
 * Run the committed migration and then the committed rollback over captured
 * `exercise_definitions` rows, and say whether the capture came back.
 *
 * @param {object} options
 * @param {readonly any[]} options.definitions  Captured rows.
 * @param {string} options.migrationSql
 * @param {string} options.rollbackSql
 * @returns {{ problems: string[], repaired: number, restored: number, sectionTagsSha256: string }}
 */
export function rehearseRollback({ definitions, migrationSql, rollbackSql }) {
  /** @type {Map<string, Membership>} */
  const captured = new Map(
    definitions.map((row) => [
      String(row.id),
      {
        sections: Array.isArray(row.sections) ? row.sections.map(String) : [],
        canBePrimary: row.can_be_primary === true,
      },
    ]),
  )
  const changes = parseMigration(migrationSql)
  const restores = parseRollback(rollbackSql)
  const problems = []

  const { catalog: repaired, updated } = applyChanges(captured, changes)
  const untouched = changes.filter((change) => !updated.includes(change.id))
  if (untouched.length > 0) {
    problems.push(
      `the capture is not pre-change: the migration would change nothing on ${untouched.length} of its ${changes.length} exercises (${untouched.map((change) => change.id).join(', ')}).`,
    )
  }

  // The rollback's `update … where d.id = r.id`: a row it does not name stays.
  const rolledBack = new Map(repaired)
  let restored = 0
  for (const [id, membership] of restores) {
    const current = rolledBack.get(id)
    if (current === undefined) continue
    if (JSON.stringify(current) !== JSON.stringify(membership)) restored += 1
    rolledBack.set(id, membership)
  }

  for (const [id, before] of captured) {
    if (JSON.stringify(rolledBack.get(id)) !== JSON.stringify(before)) {
      problems.push(`the rollback does not give the capture back for "${id}".`)
    }
  }

  return {
    problems,
    repaired: updated.length,
    restored,
    sectionTagsSha256: sha256(serializeTags(captured)),
  }
}

// ── The manifest ─────────────────────────────────────────────────────────────

/** @param {Record<string, any>} matrix */
function matrixRecord(matrix, seed) {
  const differences = diffMatrices(seed, matrix)

  return {
    file: MATRIX_CAPTURE_FILE,
    sha256: sha256(serializeMatrix(matrix)),
    catalogRows: matrix.catalogRows,
    summary: matrix.summary,
    rows: Object.fromEntries(
      MATRIX_KINDS.map((kind) => [
        kind,
        { count: matrix[kind].length, sha256: sha256(serializeRows(matrix[kind])) },
      ]),
    ),
    sectionTiers: matrix.sectionTiers,
    differencesFromCommittedSeed: Object.fromEntries(
      MATRIX_KINDS.map((kind) => [
        kind,
        differences.filter((difference) => difference.kind === kind).length,
      ]),
    ),
  }
}

/** @param {Record<string, unknown>} manifest */
export function serializeManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`
}

/** What must never reach the manifest, whatever field it arrived in. */
const SENSITIVE = [
  [/[^\s"@]+@[^\s"@]+\.[a-z]{2,}/i, 'an email address'],
  [/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, 'a user id'],
  [/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, 'a token'],
  [/\bsb_(secret|publishable)_[A-Za-z0-9_-]+|\bsbp_[A-Za-z0-9]+/, 'a key'],
  [/[a-z][a-z0-9+.-]*:\/\/[^\s"]*/i, 'a connection string or address'],
  [/"(\/|~\/|[A-Za-z]:\\\\)[^"]*"/, 'a local path'],
]

const HASH = /^[0-9a-f]{64}$/
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const count = (/** @type {unknown} */ value) => Number.isInteger(value) && Number(value) >= 0
const keysAre = (/** @type {any} */ value, /** @type {readonly string[]} */ keys) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  JSON.stringify(Object.keys(value)) === JSON.stringify(keys)

/**
 * Why the committed manifest is not acceptable, one sentence each. Every field
 * is a constant of this module, a count, a hash, an instant or an enumerated
 * value, which is what makes "no user data" a property that can be checked
 * rather than asserted. Given the committed migration and rollback, it also
 * holds the recorded rehearsal to those exact files.
 *
 * @param {string | null} committed
 * @param {Record<string, string[]>} enums
 * @param {{ migrationSql: string, rollbackSql: string }} [files]
 * @returns {string[]}
 */
export function manifestProblems(committed, enums, files) {
  if (committed === null) return [`${MANIFEST_PATH} does not exist.`]

  /** @type {any} */
  let manifest
  try {
    manifest = JSON.parse(committed)
  } catch {
    return [`${MANIFEST_PATH} is not valid JSON.`]
  }

  const problems = []
  const fail = (/** @type {string} */ what) => problems.push(`${MANIFEST_PATH} ${what}.`)

  for (const [pattern, label] of SENSITIVE) {
    if (pattern.test(committed)) fail(`contains ${label}`)
  }

  const shapes = [
    [manifest, ['version', 'generatedBy', 'notes', 'capturedAt', 'deployedCommit', 'capture', 'deployedMatrix', 'rollback']],
    [manifest?.deployedCommit, ['sha', 'source', 'deployedAt']],
    [manifest?.capture, ['relations']],
    [manifest?.deployedMatrix, ['file', 'sha256', 'catalogRows', 'summary', 'rows', 'sectionTiers', 'differencesFromCommittedSeed']],
    [manifest?.deployedMatrix?.rows, MATRIX_KINDS],
    [manifest?.deployedMatrix?.differencesFromCommittedSeed, MATRIX_KINDS],
    [manifest?.rollback, ['verified', 'migration', 'migrationSha256', 'script', 'scriptSha256', 'exercisesRepaired', 'exercisesRestored', 'sectionTagsSha256']],
  ]
  if (shapes.some(([value, keys]) => !keysAre(value, /** @type {string[]} */ (keys)))) {
    fail('carries a field the manifest does not define, or lacks one it does')
    return problems
  }

  if (
    manifest.version !== MANIFEST_VERSION ||
    manifest.generatedBy !== GENERATED_BY ||
    JSON.stringify(manifest.notes) !== JSON.stringify(NOTES)
  ) {
    fail('was not written by this command: version, generatedBy or notes differ')
  }
  if (!INSTANT.test(manifest.capturedAt)) fail('capturedAt is not an instant')

  const { deployedCommit, capture, deployedMatrix, rollback } = manifest
  if (!/^[0-9a-f]{40}$/.test(deployedCommit.sha)) fail('deployedCommit.sha is not a full commit SHA')
  if (deployedCommit.source !== DEPLOYMENT_SOURCE || !INSTANT.test(deployedCommit.deployedAt)) {
    fail('deployedCommit does not say where and when it was read')
  }

  const relations = Array.isArray(capture.relations) ? capture.relations : []
  for (const { relation } of CAPTURED_RELATIONS) {
    const entry = relations.find((/** @type {any} */ candidate) => candidate?.relation === relation)
    if (
      !keysAre(entry, ['relation', 'file', 'rows', 'sha256']) ||
      entry.file !== `${relation}.jsonl` ||
      !count(entry.rows) ||
      !HASH.test(entry.sha256)
    ) {
      fail(`capture does not record a row count and hash for ${relation}`)
    }
  }
  if (relations.length !== CAPTURED_RELATIONS.length) {
    fail('capture lists a relation the command does not capture')
  }

  const tallies = (/** @type {any} */ value) =>
    keysAre(value, CLASSIFICATIONS) && Object.values(value).every(count)
  if (
    deployedMatrix.file !== MATRIX_CAPTURE_FILE ||
    !HASH.test(deployedMatrix.sha256) ||
    !count(deployedMatrix.catalogRows) ||
    deployedMatrix.summary === null ||
    typeof deployedMatrix.summary !== 'object' ||
    !Object.entries(deployedMatrix.summary).every(
      ([key, value]) => /^[A-Za-z]+$/.test(key) && (count(value) || tallies(value)),
    ) ||
    MATRIX_KINDS.some(
      (kind) =>
        !keysAre(deployedMatrix.rows[kind], ['count', 'sha256']) ||
        !count(deployedMatrix.rows[kind].count) ||
        !HASH.test(deployedMatrix.rows[kind].sha256) ||
        !count(deployedMatrix.differencesFromCommittedSeed[kind]),
    )
  ) {
    fail('deployedMatrix does not record the matrix as counts and hashes')
  }

  const sectionTiers = Array.isArray(deployedMatrix.sectionTiers) ? deployedMatrix.sectionTiers : []
  if (
    sectionTiers.length !== enums.section_type.length * enums.equipment_tier.length ||
    sectionTiers.length !== deployedMatrix.rows.sectionTiers.count ||
    sectionTiers.some(
      (/** @type {any} */ row) =>
        !keysAre(row, ['id', 'section', 'tier', 'catalogRows', 'candidates', 'classification']) ||
        !enums.section_type.includes(row.section) ||
        !enums.equipment_tier.includes(row.tier) ||
        row.id !== `${row.section}/${row.tier}` ||
        !count(row.catalogRows) ||
        !count(row.candidates) ||
        !CLASSIFICATIONS.includes(row.classification),
    ) ||
    sha256(serializeRows(sectionTiers)) !== deployedMatrix.rows.sectionTiers.sha256
  ) {
    fail('deployedMatrix.sectionTiers is not every section at every tier, as recorded')
  }

  if (rollback.verified !== true) fail('does not record the rollback as verified')
  if (
    rollback.migration !== MIGRATION_PATH ||
    rollback.script !== ROLLBACK_SQL_PATH ||
    !HASH.test(rollback.migrationSha256) ||
    !HASH.test(rollback.scriptSha256) ||
    !HASH.test(rollback.sectionTagsSha256) ||
    !count(rollback.exercisesRepaired) ||
    rollback.exercisesRepaired === 0 ||
    rollback.exercisesRestored !== rollback.exercisesRepaired
  ) {
    fail('rollback does not record which files were rehearsed and what they restored')
  }

  if (files !== undefined) {
    if (rollback.migrationSha256 !== sha256(files.migrationSql)) {
      fail(`rollback was verified against a different ${MIGRATION_PATH}`)
    }
    if (rollback.scriptSha256 !== sha256(files.rollbackSql)) {
      fail(`rollback was verified against a different ${ROLLBACK_SQL_PATH}`)
    }
    if (rollback.exercisesRepaired !== parseMigration(files.migrationSql).length) {
      fail('rollback does not cover every exercise the committed migration changes')
    }
  }

  return problems
}

// ── The capture ──────────────────────────────────────────────────────────────

/**
 * Why `directory` cannot receive a capture; null when it can.
 *
 * @param {string | undefined} directory
 * @param {string} root
 */
export function captureDirectoryProblem(directory, root, exists = existsSync, list = readdirSync) {
  if (directory === undefined || directory.trim() === '') {
    return '--out <directory> is required: where the captured rows are written.'
  }
  const inside = relative(resolve(root), resolve(directory))
  if (inside === '' || (!inside.startsWith('..') && !isAbsolute(inside))) {
    return 'the capture directory is inside the repository; captured rows must stay outside it.'
  }
  if (exists(resolve(directory)) && list(resolve(directory)).length > 0) {
    return 'the capture directory already holds files; a capture is never written over.'
  }
  return null
}

/**
 * One capture: read everything, rehearse the rollback, and only then write.
 *
 * @param {object} options
 * @param {Record<string, string | undefined>} options.env
 * @param {string | undefined} options.outDir
 * @param {import('./matrix.mjs').MatrixInputs} options.inputs
 * @param {ReturnType<typeof buildMatrix>} options.matrix  The committed seed's.
 * @param {string} options.migrationSql
 * @param {string} options.rollbackSql
 * @param {string} [options.root]
 * @param {typeof fetch} [options.fetch]
 * @param {(path: string, contents: string) => void} [options.writeCapture]
 * @param {(path: string, contents: string) => void} [options.writeManifest]
 * @param {(directory: string) => void} [options.makeDirectory]
 * @param {(path: string) => boolean} [options.exists]
 * @param {(path: string) => string[]} [options.list]
 * @param {() => Date} [options.now]
 * @param {(line: string) => void} [options.print]
 * @returns {Promise<number>} Process exit code.
 */
export async function captureSnapshot({
  env,
  outDir,
  inputs,
  matrix,
  migrationSql,
  rollbackSql,
  root = REPO_ROOT,
  fetch: doFetch,
  writeCapture = (path, contents) => writeFileSync(path, contents, { mode: 0o600, flag: 'wx' }),
  writeManifest = writeFileSync,
  makeDirectory = (directory) => mkdirSync(directory, { recursive: true, mode: 0o700 }),
  exists = existsSync,
  list = readdirSync,
  now = () => new Date(),
  print = write,
}) {
  print('CLEAR pre-change snapshot — hosted catalog and profiles, read-only')
  print('')

  const refusals = [...missingPrerequisites(env)]
  const directoryProblem = captureDirectoryProblem(outDir, root, exists, list)
  if (directoryProblem !== null) refusals.push(directoryProblem)
  if (refusals.length > 0) {
    print('FAILED — nothing was read and nothing was written.')
    print('')
    for (const problem of refusals) print(`  ${problem}`)
    return 1
  }
  const directory = resolve(String(outDir))

  const reader = createHostedReader({
    url: String(env.SUPABASE_URL),
    serviceRoleKey: String(env.SUPABASE_SERVICE_ROLE_KEY),
    fetch: doFetch,
  })

  let deployedCommit
  /** @type {{ relation: string, rows: any[] }[]} */
  const captured = []
  let deployed
  try {
    deployedCommit = await readDeployedCommit({ token: String(env.VERCEL_TOKEN), fetch: doFetch })
    for (const { relation, order } of CAPTURED_RELATIONS) {
      captured.push({
        relation,
        rows: await reader.rows(relation, relation, `select=*&order=${order}`),
      })
    }
    deployed = buildMatrix({ ...inputs, catalog: await readDeployedCatalog(reader) })
  } catch (error) {
    print('FAILED — the hosted project could not be read. Nothing was written.')
    print('')
    print(`  ${error instanceof Error ? error.message : String(error)}`)
    return 1
  }

  const definitions = captured.find((entry) => entry.relation === DEFINITIONS)?.rows ?? []
  const rehearsal = rehearseRollback({ definitions, migrationSql, rollbackSql })
  if (rehearsal.problems.length > 0) {
    print('FAILED — the rollback was not verified against this capture. Nothing was written.')
    print('')
    for (const problem of rehearsal.problems) print(`  ${problem}`)
    return 1
  }

  const files = captured.map(({ relation, rows }) => ({
    relation,
    file: `${relation}.jsonl`,
    rows: rows.length,
    contents: serializeRows(rows),
  }))
  const matrixContents = serializeMatrix(deployed)

  const manifest = {
    version: MANIFEST_VERSION,
    generatedBy: GENERATED_BY,
    notes: NOTES,
    capturedAt: now().toISOString(),
    deployedCommit: {
      sha: deployedCommit.sha,
      source: DEPLOYMENT_SOURCE,
      deployedAt: deployedCommit.deployedAt,
    },
    capture: {
      relations: files.map(({ relation, file, rows, contents }) => ({
        relation,
        file,
        rows,
        sha256: sha256(contents),
      })),
    },
    deployedMatrix: matrixRecord(deployed, matrix),
    rollback: {
      verified: true,
      migration: MIGRATION_PATH,
      migrationSha256: sha256(migrationSql),
      script: ROLLBACK_SQL_PATH,
      scriptSha256: sha256(rollbackSql),
      exercisesRepaired: rehearsal.repaired,
      exercisesRestored: rehearsal.restored,
      sectionTagsSha256: rehearsal.sectionTagsSha256,
    },
  }
  const contents = serializeManifest(manifest)

  // The manifest is held to its own rules before a byte is written, so a row
  // value cannot reach the repository through a field added here later.
  const problems = manifestProblems(contents, inputs.rules.enums, { migrationSql, rollbackSql })
  if (problems.length > 0) {
    print('FAILED — the manifest is not acceptable. Nothing was written.')
    print('')
    for (const problem of problems) print(`  ${problem}`)
    return 1
  }

  makeDirectory(directory)
  for (const file of files) writeCapture(join(directory, file.file), file.contents)
  writeCapture(join(directory, MATRIX_CAPTURE_FILE), matrixContents)
  writeManifest(join(root, MANIFEST_PATH), contents)

  print(`  deployed commit  ${deployedCommit.sha}`)
  for (const file of files) print(`  ${pad(file.rows)} rows  ${file.relation}`)
  print(`  ${pad(deployed.catalogRows)} deployed catalog rows in the matrix`)
  for (const kind of MATRIX_KINDS) {
    print(
      `  ${pad(manifest.deployedMatrix.differencesFromCommittedSeed[kind])} ${kind} rows differ from the committed seed`,
    )
  }
  print(
    `  rollback verified: ${rehearsal.repaired} exercises repaired, ${rehearsal.restored} restored to the capture`,
  )
  print('')
  print(`Wrote ${files.length + 1} capture files outside the repository.`)
  print(`Wrote ${MANIFEST_PATH}`)
  print('No write was made to the hosted project.')

  return 0
}

/**
 * The process environment over the local-only files.
 *
 * @returns {Record<string, string | undefined>}
 */
function hostedEnvironment() {
  /** @type {Record<string, string | undefined>} */
  const values = {}
  for (const file of ENV_FILES) {
    const text = readIfPresent(join(REPO_ROOT, file))
    if (text !== null) Object.assign(values, parseEnvFile(text))
  }

  return { ...values, ...process.env }
}

/**
 * @param {string[]} argv
 * @returns {Promise<number>} Process exit code.
 */
export async function main(argv) {
  const checkOnly = argv.includes('--check')
  const outAt = argv.indexOf('--out')
  const outDir = outAt === -1 ? undefined : argv[outAt + 1]

  const unknown = argv.filter(
    (argument, index) => argument !== '--check' && argument !== '--out' && index !== outAt + 1,
  )
  if (unknown.length > 0 || (checkOnly && outAt !== -1)) {
    write('usage: npm run gr:snapshot -- --out <directory outside the repository>')
    write('       npm run gr:snapshot -- --check')
    return 1
  }

  const migrationSql = readFileSync(join(REPO_ROOT, MIGRATION_PATH), 'utf8')
  const rollbackSql = readFileSync(join(REPO_ROOT, ROLLBACK_SQL_PATH), 'utf8')

  // Loaded here rather than imported: the vocabularies come through Vite, and
  // a test of this module should not need it.
  const { loadVocabularies } = await import('./legal-state-matrix.mjs')
  const { loadRetrievalRules } = await import('./rules.mjs')
  const rules = loadRetrievalRules()

  if (checkOnly) {
    const problems = manifestProblems(readIfPresent(join(REPO_ROOT, MANIFEST_PATH)), rules.enums, {
      migrationSql,
      rollbackSql,
    })
    write('CLEAR pre-change snapshot')
    write('')
    if (problems.length === 0) {
      write(`--check: ${MANIFEST_PATH} is acceptable. Nothing read from the hosted project.`)
      return 0
    }
    write('FAILED — the committed manifest is not acceptable.')
    write('')
    for (const problem of problems) write(`  ${problem}`)
    return 1
  }

  const inputs = { rules, ...(await loadVocabularies()) }

  return captureSnapshot({
    env: hostedEnvironment(),
    outDir,
    inputs,
    matrix: buildMatrix(inputs),
    migrationSql,
    rollbackSql,
  })
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

/** @param {number} value */
function pad(value) {
  return String(value).padStart(5, ' ')
}

/** @param {string} line */
function write(line) {
  process.stdout.write(`${line}\n`)
}

// Only when run as a command, so importing this module in a test is free of
// side effects.
if (process.argv[1]?.endsWith('pre-change-snapshot.mjs')) {
  process.exit(await main(process.argv.slice(2)))
}
