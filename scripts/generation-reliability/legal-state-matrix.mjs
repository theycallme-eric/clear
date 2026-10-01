/**
 * GR-01 — `npm run gr:matrix`.
 *
 *     npm run gr:matrix            regenerate the legal-state matrix
 *     npm run gr:matrix -- --check prove it is current and fully classified,
 *                                  writing nothing (CI)
 *     npm run gr:matrix -- --deployed
 *                                  compare the hosted catalog's matrix with
 *                                  the committed seed's, and record the
 *                                  owner-mirror fixture
 *     npm run gr:matrix -- --deployed --check
 *                                  the same comparison; the committed fixture
 *                                  must be acceptable, and is recorded only
 *                                  if there is none yet
 *
 * Offline by construction unless `--deployed` is given: without it the command
 * opens no connection, reads no credential and calls no model. With it,
 * `deployed.mjs` issues GETs against the hosted project and nothing else, and
 * the output is counts, section names and row identifiers only. The enums and retrieval rules come from
 * `supabase/migrations/` (`rules.mjs`), the catalog from the committed
 * `supabase/seed/` files, and the tier and goal presets from
 * `src/state/onboarding.ts` — the module the onboarding screen itself renders.
 *
 * Those last two are TypeScript, so they are loaded through Vite's module
 * runner rather than restated here: `src/test/seed-catalog.ts` is already the
 * one reader of the seed files, and a second copy of the presets would be the
 * hand-written list this command exists to avoid. No dev server is started and
 * the project's Vite config is not loaded.
 *
 * Exit codes: 0 when the matrix was written, or (under `--check`) when the
 * committed file is byte-identical to this run's and every row is classified;
 * 1 otherwise. Under `--deployed`, 0 only when the two matrices are identical
 * (and, with `--check`, the committed fixture is acceptable); a missing
 * credential is 1 and names what is missing.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { parseEnvFile } from '../dev-preflight/env.mjs'
import { REPO_ROOT } from '../gen-types/schema.mjs'
import {
  ENV_FILES,
  OWNER_MIRROR_PATH,
  createHostedReader,
  diffMatrices,
  missingPrerequisites,
  ownerMirrorProblems,
  readDeployedCatalog,
  readOwnerMirror,
  serializeOwnerMirror,
} from './deployed.mjs'
import { buildMatrix, serializeMatrix, validateMatrix } from './matrix.mjs'
import { loadRetrievalRules } from './rules.mjs'

export const MATRIX_PATH = 'docs/process/generation-reliability/legal-state-matrix.json'

const ONBOARDING_MODULE = 'src/state/onboarding.ts'
const SEED_READER_MODULE = 'src/test/seed-catalog.ts'

/**
 * The matrix inputs that live in TypeScript.
 *
 * @returns {Promise<Pick<import('./matrix.mjs').MatrixInputs,
 *   'catalog' | 'equipmentByTier' | 'sectionsByGoal' | 'equipment'>>}
 */
async function loadVocabularies() {
  const { runnerImport } = await import('vite')
  const load = async (/** @type {string} */ path) =>
    (
      await runnerImport(join(REPO_ROOT, path), {
        configFile: false,
        root: REPO_ROOT,
        logLevel: 'silent',
      })
    ).module

  /** @type {any} */
  const onboarding = await load(ONBOARDING_MODULE)
  /** @type {any} */
  const seed = await load(SEED_READER_MODULE)

  return {
    catalog: seed.seededCatalog(),
    equipmentByTier: onboarding.EQUIPMENT_BY_TIER,
    sectionsByGoal: onboarding.SECTIONS_BY_GOAL,
    equipment: onboarding.EQUIPMENT.map((/** @type {{ value: string }} */ item) => item.value),
  }
}

/**
 * Why the committed text is not acceptable, one sentence each. Separated from
 * `main` so the test can hand it a stale or unclassified file without writing
 * one.
 *
 * @param {string | null} committed  The committed file, or null when absent.
 * @param {string} contents          What this run produces.
 * @param {Record<string, string[]>} enums
 * @returns {string[]}
 */
export function checkMatrix(committed, contents, enums) {
  if (committed === null) return [`${MATRIX_PATH} does not exist.`]

  const problems = []
  if (committed !== contents) {
    problems.push(`${MATRIX_PATH} is stale: it is not what the seed and schema produce.`)
  }

  try {
    problems.push(...validateMatrix(JSON.parse(committed), enums))
  } catch {
    problems.push(`${MATRIX_PATH} is not valid JSON.`)
  }

  return problems
}

/**
 * The process environment over the local-only files, so CI's secrets and a
 * developer's files are read the same way.
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
 * `--deployed`: the hosted catalog's matrix against the committed seed's, and
 * the owner-mirror fixture. Reads only.
 *
 * @param {object} options
 * @param {boolean} options.checkOnly
 * @param {ReturnType<typeof buildMatrix>} options.matrix  The committed seed's.
 * @param {import('./matrix.mjs').MatrixInputs} options.inputs
 * @param {Record<string, string | undefined>} options.env
 * @param {typeof fetch} [options.fetch]
 * @param {(path: string, contents: string) => void} [options.writeFile]
 * @param {(path: string) => string | null} [options.readFile]
 * @param {(line: string) => void} [options.print]
 * @returns {Promise<number>} Process exit code.
 */
export async function compareDeployed({
  checkOnly,
  matrix,
  inputs,
  env,
  fetch: doFetch,
  writeFile = writeFileSync,
  readFile = readIfPresent,
  print = write,
}) {
  print('')
  print('CLEAR legal-state matrix — deployed catalog against committed seed')
  print('')

  const missing = missingPrerequisites(env)
  if (missing.length > 0) {
    print('FAILED — the deployed comparison was not run: a prerequisite is missing.')
    print('')
    for (const problem of missing) print(`  ${problem}`)
    return 1
  }

  const reader = createHostedReader({
    url: String(env.SUPABASE_URL),
    serviceRoleKey: String(env.SUPABASE_SERVICE_ROLE_KEY),
    fetch: doFetch,
  })

  const path = join(REPO_ROOT, OWNER_MIRROR_PATH)
  const committed = readFile(path)

  let deployed
  let mirror = null
  try {
    deployed = buildMatrix({ ...inputs, catalog: await readDeployedCatalog(reader) })
    // The fixture is read once and committed. `--check` records it only when
    // there is none yet; after that it holds the committed one to its shape
    // rather than reading the owner's profile again.
    if (!checkOnly || committed === null) mirror = await readOwnerMirror(reader)
  } catch (error) {
    print('FAILED — the hosted project could not be read.')
    print('')
    print(`  ${error instanceof Error ? error.message : String(error)}`)
    return 1
  }

  print(`  ${pad(matrix.catalogRows)} committed-seed catalog rows`)
  print(`  ${pad(deployed.catalogRows)} deployed catalog rows`)
  print(`  ${pad(matrix.cells.length)} section × tier × focus cells compared`)
  print(`  ${pad(matrix.states.length)} states compared`)
  print(`  ${pad(matrix.constraints.length)} constraint targets compared`)
  print('')

  const differences = diffMatrices(matrix, deployed)
  if (differences.length > 0 || matrix.catalogRows !== deployed.catalogRows) {
    print(`FAILED — the deployed and committed-seed matrices differ on ${differences.length} rows.`)
    print('')
    for (const { kind, id, reason } of differences) print(`  ${kind}  ${id}  (${reason})`)
    return 1
  }
  print('The deployed and committed-seed matrices are identical.')

  const contents = mirror === null ? committed : serializeOwnerMirror(mirror)
  const problems = ownerMirrorProblems(contents, inputs.rules.enums, inputs.equipment)
  if (problems.length > 0) {
    print('FAILED — the owner-mirror fixture is not acceptable.')
    print('')
    for (const problem of problems) print(`  ${problem}`)
    if (mirror === null) {
      print('')
      print('Run `npm run gr:matrix -- --deployed` and commit the result.')
    }
    return 1
  }

  if (mirror === null) {
    print(`--check: ${OWNER_MIRROR_PATH} is acceptable. Nothing written.`)
    return 0
  }

  writeFile(path, /** @type {string} */ (contents))
  print(
    `Wrote ${OWNER_MIRROR_PATH}  (${mirror.enabledSections.length} sections, ` +
      `${mirror.equipment.length} equipment ids, ${mirror.exclusions.length} exclusion scopes)`,
  )

  return 0
}

const OPTIONS = ['--check', '--deployed']

/**
 * @param {string[]} argv
 * @returns {Promise<number>} Process exit code.
 */
export async function main(argv) {
  const checkOnly = argv.includes('--check')
  const deployed = argv.includes('--deployed')

  const unknown = argv.filter((argument) => !OPTIONS.includes(argument))
  if (unknown.length > 0) {
    write(`clear gr:matrix: unknown option ${unknown.join(', ')}`)
    write('usage: npm run gr:matrix [-- --check] [-- --deployed]')
    return 1
  }

  let rules
  let matrix
  let inputs
  try {
    rules = loadRetrievalRules()
    inputs = { rules, ...(await loadVocabularies()) }
    matrix = buildMatrix(inputs)
  } catch (error) {
    write('CLEAR legal-state matrix — failed to build')
    write('')
    write(`  ${error instanceof Error ? error.message : String(error)}`)
    return 1
  }

  const contents = serializeMatrix(matrix)
  const path = join(REPO_ROOT, MATRIX_PATH)

  write('CLEAR legal-state matrix')
  write('')
  write(`  ${pad(matrix.catalogRows)} catalog rows, floor ${matrix.floor}`)
  write(`  ${pad(matrix.cells.length)} section × tier × focus cells`)
  write(`  ${pad(matrix.states.length)} states listed`)
  write(`  ${pad(matrix.constraints.length)} constraint targets evaluated`)
  write(`  ${pad(matrix.summary.statesFailingBeforeComposition)} listed states fail before composition`)
  write('')

  // A generator that can emit an unclassified row is broken whichever mode it
  // was run in, so this is not `--check`'s alone.
  const invalid = validateMatrix(matrix, rules.enums)
  if (invalid.length > 0) {
    write('FAILED — the generated matrix does not account for every state.')
    write('')
    for (const problem of invalid) write(`  ${problem}`)
    return 1
  }

  // `--deployed` never regenerates the committed matrix: it is the thing the
  // hosted catalog is being held to.
  if (deployed && !checkOnly) {
    return compareDeployed({ checkOnly, matrix, inputs, env: hostedEnvironment() })
  }

  if (checkOnly) {
    const problems = checkMatrix(readIfPresent(path), contents, rules.enums)
    if (problems.length === 0) {
      write(`--check: ${MATRIX_PATH} is current. Nothing written.`)
      if (deployed) return compareDeployed({ checkOnly, matrix, inputs, env: hostedEnvironment() })
      return 0
    }

    write('FAILED — the committed matrix is not acceptable.')
    write('')
    for (const problem of problems.slice(0, 20)) write(`  ${problem}`)
    if (problems.length > 20) write(`  … and ${problems.length - 20} more`)
    write('')
    write('Run `npm run gr:matrix` and commit the result.')
    return 1
  }

  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, contents)

  write(`Wrote ${MATRIX_PATH}  (${contents.split('\n').length - 1} lines)`)

  return 0
}

function readIfPresent(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

function pad(count) {
  return String(count).padStart(5, ' ')
}

function write(line) {
  process.stdout.write(`${line}\n`)
}

// Only when run as a command, so importing this module in a test is free of
// side effects.
if (process.argv[1]?.endsWith('legal-state-matrix.mjs')) {
  process.exit(await main(process.argv.slice(2)))
}
