/**
 * DATA-03 — `npm run gen:types`.
 *
 *     npm run gen:types            regenerate src/data/database.types.ts
 *     npm run gen:types -- --check prove it is current, writing nothing (CI)
 *
 * Offline by construction: it opens no connection and reads no credential. The
 * schema it types is the one `supabase/migrations/` declares — see the header of
 * `schema.mjs` for why that, and not the live project, is what `gen types` can
 * honestly be run against before the off-machine-backup gate clears.
 *
 * Exit codes: 0 when the types were written, or (under `--check`) when the
 * committed file is byte-identical to what this run produces; 1 on drift or on
 * SQL the reader does not understand.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { emitTypes } from './emit.mjs'
import { REPO_ROOT, migrationFiles, readSchema } from './schema.mjs'

export const TYPES_PATH = 'src/data/database.types.ts'

/**
 * What `npm run gen:types` would write, as a string. Separated from writing so
 * the drift test can compare without touching the working tree.
 *
 * @returns {{ schema: import('./schema.mjs').Schema, contents: string }}
 */
export function build() {
  const schema = readSchema()

  return { schema, contents: emitTypes(schema, migrationFiles()) }
}

/**
 * @param {string[]} argv
 * @returns {number} Process exit code.
 */
export function main(argv) {
  const checkOnly = argv.includes('--check')

  const unknown = argv.filter((argument) => argument !== '--check')
  if (unknown.length > 0) {
    write(`clear gen:types: unknown option ${unknown.join(', ')}`)
    write('usage: npm run gen:types [-- --check]')
    return 1
  }

  let built
  try {
    built = build()
  } catch (error) {
    write('CLEAR gen:types — failed to read the schema')
    write('')
    write(`  ${error instanceof Error ? error.message : String(error)}`)
    write('')
    write('  The migration uses SQL scripts/gen-types/schema.mjs does not read.')
    write('  Teach the reader that form — never drop the column from the types.')
    return 1
  }

  const { schema, contents } = built
  const path = join(REPO_ROOT, TYPES_PATH)

  write('CLEAR generated types')
  write('')
  write(`  ${pad(schema.tables.length)} tables`)
  write(`  ${pad(schema.enums.length)} enums`)
  write(`  ${pad(schema.functions.filter((fn) => fn.returns !== 'trigger').length)} callable functions`)
  write(`  ${pad(schema.views.length)} views, named but not typed`)
  write('')

  if (checkOnly) {
    if (readIfPresent(path) === contents) {
      write(`--check: ${TYPES_PATH} is current. Nothing written.`)
      return 0
    }

    write(`FAILED — ${TYPES_PATH} is not what the migrations produce.`)
    write('')
    write('The committed types and supabase/migrations/ have drifted apart.')
    write('Run `npm run gen:types` and commit the result.')
    return 1
  }

  writeFileSync(path, contents)

  write(`Wrote ${TYPES_PATH}  (${contents.split('\n').length - 1} lines)`)
  write('')
  write('Generated from the migrations, which declare the schema. What the live')
  write('project holds is a different question: applying is TASK-072, behind the')
  write('off-machine-backup gate in docs/backend/live-inventory.md.')

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
  return String(count).padStart(3, ' ')
}

function write(line) {
  process.stdout.write(`${line}\n`)
}

// Only when run as a command, so importing this module in a test is free of
// side effects.
if (process.argv[1]?.endsWith('gen-types.mjs')) {
  process.exit(main(process.argv.slice(2)))
}
