/**
 * GR-02 — `npm run gr:dispositions`.
 *
 *     npm run gr:dispositions            regenerate the configuration dispositions
 *     npm run gr:dispositions -- --check prove the committed file is current and
 *                                        that every legal configuration is
 *                                        supported or prevented, writing nothing
 *
 * Offline, like `gr:matrix`, and built on it: the same rules and vocabularies,
 * with the catalog replaced by the seed plus the section-mapping ledger
 * (`projectCatalog`). What it writes is a projection — the seed, the ledger and
 * the database are not changed.
 *
 * Exit codes: 0 when the file was written, or (under `--check`) when the
 * committed file is byte-identical to this run's and no configuration is left
 * without a disposition; 1 otherwise.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { REPO_ROOT } from '../gen-types/schema.mjs'
import {
  DISPOSITIONS_PATH,
  buildDispositions,
  checkDispositions,
  validateDispositions,
} from './dispositions.mjs'
import { loadVocabularies } from './legal-state-matrix.mjs'
import { buildMatrix, serializeMatrix } from './matrix.mjs'
import { loadRetrievalRules } from './rules.mjs'
import { loadLedger, projectCatalog } from './section-ledger.mjs'

/**
 * @param {string[]} argv
 * @returns {Promise<number>} Process exit code.
 */
export async function main(argv) {
  const checkOnly = argv.includes('--check')

  const unknown = argv.filter((argument) => argument !== '--check')
  if (unknown.length > 0) {
    write(`clear gr:dispositions: unknown option ${unknown.join(', ')}`)
    write('usage: npm run gr:dispositions [-- --check]')
    return 1
  }

  let rules
  let matrix
  let dispositions
  try {
    rules = loadRetrievalRules()
    const ledger = loadLedger(REPO_ROOT)
    const vocabularies = await loadVocabularies()
    const catalog = projectCatalog(vocabularies.catalog, ledger)

    matrix = buildMatrix({ rules, ...vocabularies, catalog })
    dispositions = buildDispositions({ matrix, catalog, ledgerRows: ledger.rows.length })
  } catch (error) {
    write('CLEAR configuration dispositions — failed to build')
    write('')
    write(`  ${error instanceof Error ? error.message : String(error)}`)
    return 1
  }

  const contents = serializeMatrix(dispositions)
  const path = join(REPO_ROOT, DISPOSITIONS_PATH)
  const { presets, unconstrainedConfigurations } = dispositions.summary

  write('CLEAR configuration dispositions (seed + ledger)')
  write('')
  write(`  ${pad(dispositions.ledgerRows)} ledger rows applied to ${dispositions.catalogRows} catalog rows`)
  write(`  ${pad(dispositions.configurations.length)} configurations`)
  write(`  ${pad(unconstrainedConfigurations.supported)} unconstrained supported`)
  write(`  ${pad(unconstrainedConfigurations.prevented)} unconstrained prevented`)
  write(`  ${pad(presets.supported)} of ${dispositions.presets.length} onboarding combinations supported`)
  write('')

  // A projection that leaves a configuration without a disposition is a
  // finding whichever mode it was run in, so this is not `--check`'s alone.
  const invalid = validateDispositions(dispositions, matrix, rules.enums)
  if (invalid.length > 0) {
    write('FAILED — a legal configuration is neither supported nor prevented.')
    write('')
    for (const problem of invalid.slice(0, 20)) write(`  ${problem}`)
    if (invalid.length > 20) write(`  … and ${invalid.length - 20} more`)
    return 1
  }

  if (checkOnly) {
    const problems = checkDispositions(readIfPresent(path), contents, matrix, rules.enums)
    if (problems.length === 0) {
      write(`--check: ${DISPOSITIONS_PATH} is current. Nothing written.`)
      return 0
    }

    write('FAILED — the committed dispositions are not acceptable.')
    write('')
    for (const problem of problems.slice(0, 20)) write(`  ${problem}`)
    if (problems.length > 20) write(`  … and ${problems.length - 20} more`)
    write('')
    write('Run `npm run gr:dispositions` and commit the result.')
    return 1
  }

  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, contents)

  write(`Wrote ${DISPOSITIONS_PATH}  (${contents.split('\n').length - 1} lines)`)

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
if (process.argv[1]?.endsWith('configuration-dispositions.mjs')) {
  process.exit(await main(process.argv.slice(2)))
}
