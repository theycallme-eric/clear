/**
 * GR-02 / REQ-004 — `npm run gr:repair`.
 *
 *     npm run gr:repair            regenerate the migration and the rollback SQL
 *     npm run gr:repair -- --check prove both are current, writing nothing (CI)
 *
 * Reads the section-mapping ledger and the pre-change capture, both committed.
 * It opens no connection and reads no credential: it writes two files and
 * applies neither. Applying the migration belongs to the reviewed deployment
 * path; the rollback is run by a person, from
 * `docs/backend/catalog-section-repair-rollback.md`.
 *
 * The seed is the third output of the same ledger and has its own command,
 * `npm run seed`.
 *
 * Exit codes: 0 when the files were written, or (under `--check`) when the
 * committed files are byte-identical to this run's; 1 otherwise.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { REPO_ROOT, loadSnapshot } from '../catalog-seed/sources.mjs'
import {
  MIGRATION_PATH,
  ROLLBACK_SQL_PATH,
  renderMigration,
  renderRollback,
} from './catalog-repair.mjs'
import { loadLedger } from './section-ledger.mjs'

/**
 * Everything the command would write, as strings.
 *
 * @returns {{ label: string, contents: string }[]}
 */
export function buildRepair() {
  const ledger = loadLedger(REPO_ROOT)
  const capture = new Map(
    loadSnapshot().definitions.map((row) => [
      row.id,
      { sections: row.sections, canBePrimary: row.canBePrimary },
    ]),
  )

  return [
    { label: MIGRATION_PATH, contents: renderMigration(ledger) },
    { label: ROLLBACK_SQL_PATH, contents: renderRollback(ledger, capture) },
  ]
}

/**
 * @param {string[]} argv
 * @returns {number} Process exit code.
 */
export function main(argv) {
  const checkOnly = argv.includes('--check')

  const unknown = argv.filter((argument) => argument !== '--check')
  if (unknown.length > 0) {
    write(`clear gr:repair: unknown option ${unknown.join(', ')}`)
    write('usage: npm run gr:repair [-- --check]')
    return 1
  }

  let artifacts
  try {
    artifacts = buildRepair()
  } catch (error) {
    write('CLEAR catalog section repair — failed to build')
    write('')
    write(`  ${error instanceof Error ? error.message : String(error)}`)
    return 1
  }

  write('CLEAR catalog section repair')
  write('')

  if (checkOnly) {
    const drifted = artifacts.filter(
      (entry) => readIfPresent(join(REPO_ROOT, entry.label)) !== entry.contents,
    )
    if (drifted.length === 0) {
      write(`--check: ${artifacts.length} files are what the ledger produces. Nothing written.`)
      return 0
    }

    write(`FAILED — ${drifted.length} file(s) differ from what the ledger produces:`)
    for (const entry of drifted) write(`  ${entry.label}`)
    write('')
    write('Run `npm run gr:repair` and commit the result.')
    return 1
  }

  for (const entry of artifacts) {
    const path = join(REPO_ROOT, entry.label)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, entry.contents)
    write(`Wrote ${entry.label}  (${entry.contents.split('\n').length - 1} lines)`)
  }
  write('')
  write('Not applied. Neither file reaches a database from this command.')

  return 0
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

/** @param {string} line */
function write(line) {
  process.stdout.write(`${line}\n`)
}

// Only when run as a command, so importing this module in a test is free of
// side effects.
if (process.argv[1]?.endsWith('catalog-repair-migration.mjs')) {
  process.exit(main(process.argv.slice(2)))
}
