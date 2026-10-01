/**
 * GR-01 — `npm run gr:matrix`.
 *
 *     npm run gr:matrix            regenerate the legal-state matrix
 *     npm run gr:matrix -- --check prove it is current and fully classified,
 *                                  writing nothing (CI)
 *
 * Offline by construction: it opens no connection, reads no credential and
 * calls no model. The enums and retrieval rules come from
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
 * 1 otherwise.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { REPO_ROOT } from '../gen-types/schema.mjs'
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
 * @param {string[]} argv
 * @returns {Promise<number>} Process exit code.
 */
export async function main(argv) {
  const checkOnly = argv.includes('--check')

  const unknown = argv.filter((argument) => argument !== '--check')
  if (unknown.length > 0) {
    write(`clear gr:matrix: unknown option ${unknown.join(', ')}`)
    write('usage: npm run gr:matrix [-- --check]')
    return 1
  }

  let rules
  let matrix
  try {
    rules = loadRetrievalRules()
    matrix = buildMatrix({ rules, ...(await loadVocabularies()) })
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

  if (checkOnly) {
    const problems = checkMatrix(readIfPresent(path), contents, rules.enums)
    if (problems.length === 0) {
      write(`--check: ${MATRIX_PATH} is current. Nothing written.`)
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
