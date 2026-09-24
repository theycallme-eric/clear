/**
 * DATA-03 — the schema, read from the migrations that declare it.
 *
 * Why the migrations and not the live project. `supabase gen types` asks a
 * running database what it holds, and the database that would answer today
 * still holds the *previous* schema: `docs/backend/live-inventory.md` holds
 * every push behind the off-machine-backup gate until TASK-072, and ENV-04
 * settled that development runs against the hosted project with no local one to
 * reset. Asking it now would generate types for the schema this rebuild
 * replaces, which is worse than no types at all. So the generator reads the
 * same SQL the CLI would apply. `supabase/migrations/` is the source of truth
 * for what the schema is; the live project is the source of truth for what has
 * been *applied*, and those are different questions.
 *
 * What it reads: the five rebuild migrations. The inherited `00001`–`00029`
 * files are no-op history markers (`supabase/migrations/README.md`) and declare
 * nothing.
 *
 * This is a reader for the SQL this repository writes, not a Postgres parser.
 * Anything it does not recognise raises rather than being skipped, so a schema
 * it cannot describe fails the generator instead of silently producing types
 * that are missing a column.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Repository root, resolved from this file so the working directory never
 * matters — and from `process.cwd()` when it cannot be, because Vitest serves
 * this module through Vite, where `import.meta.url` is the dev server's URL
 * rather than a `file:` one. Same resolution, and for the same reason, as
 * `scripts/catalog-seed/sources.mjs`.
 */
export const REPO_ROOT = resolveRepoRoot()
export const MIGRATIONS_DIR = join(REPO_ROOT, 'supabase/migrations')

/** @returns {string} */
function resolveRepoRoot() {
  const candidates = []
  if (import.meta.url.startsWith('file:')) {
    candidates.push(resolve(dirname(fileURLToPath(import.meta.url)), '../..'))
  }
  candidates.push(process.cwd())

  for (const candidate of candidates) {
    try {
      readFileSync(join(candidate, 'package.json'))
      return candidate
    } catch {
      // Try the next one.
    }
  }

  throw new Error(`Cannot locate the repository root; tried: ${candidates.join(', ')}`)
}

/** The rebuild series carries a 14-digit timestamp. The markers are 5 digits. */
const REBUILD_MIGRATION = /^\d{14}_[a-z0-9_]+\.sql$/

/**
 * @typedef {object} Column
 * @property {string} name
 * @property {string} pgType    As written, e.g. `public.section_type[]`.
 * @property {boolean} nullable
 * @property {boolean} hasDefault  Including identity — the database supplies it.
 */

/**
 * @typedef {object} Table
 * @property {string} name
 * @property {Column[]} columns
 */

/**
 * @typedef {object} FunctionArg
 * @property {string} name
 * @property {string} pgType
 * @property {boolean} optional  It has a DEFAULT, so a caller may omit it.
 */

/**
 * @typedef {object} SchemaFunction
 * @property {string} name
 * @property {FunctionArg[]} args
 * @property {string} returns   As written, e.g. `setof public.user_constraints`,
 *                              or `table` when the function declares columns.
 * @property {FunctionArg[]} [columns]  Those columns, for a RETURNS TABLE.
 */

/**
 * @typedef {object} Schema
 * @property {{ name: string, values: string[] }[]} enums
 * @property {Table[]} tables
 * @property {string[]} views
 * @property {SchemaFunction[]} functions
 */

/** Migration file names, in the order the CLI applies them. */
export function migrationFiles() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => REBUILD_MIGRATION.test(name))
    .sort()
}

/**
 * Every statement in `sql`, comments removed.
 *
 * String and dollar-quoted bodies are recognised first, so a `--` inside a
 * comment-on text is text and a `;` inside a `$$ … $$` function body does not
 * end a statement. Dollar-quoted bodies are kept whole: the enums are created
 * inside a `DO $$ … $$` block, so throwing the body away would throw away the
 * vocabulary with it.
 *
 * @param {string} sql
 * @returns {string[]}
 */
export function statements(sql) {
  const found = []
  const dollarTag = /\$[A-Za-z_]*\$/y
  let current = ''
  let i = 0

  while (i < sql.length) {
    const pair = sql[i] + (sql[i + 1] ?? '')

    if (pair === '--') {
      while (i < sql.length && sql[i] !== '\n') i += 1
      current += ' '
      continue
    }

    if (pair === '/*') {
      let depth = 1
      i += 2
      while (i < sql.length && depth > 0) {
        const inner = sql[i] + (sql[i + 1] ?? '')
        if (inner === '/*') {
          depth += 1
          i += 2
        } else if (inner === '*/') {
          depth -= 1
          i += 2
        } else {
          i += 1
        }
      }
      current += ' '
      continue
    }

    if (sql[i] === "'") {
      const start = i
      i += 1
      while (i < sql.length) {
        if (sql[i] === "'") {
          // '' is an escaped quote and not the end of the literal.
          if (sql[i + 1] === "'") {
            i += 2
            continue
          }
          i += 1
          break
        }
        i += 1
      }
      current += sql.slice(start, i)
      continue
    }

    if (sql[i] === '$') {
      dollarTag.lastIndex = i
      const opening = dollarTag.exec(sql)
      if (opening !== null) {
        const tag = opening[0]
        const close = sql.indexOf(tag, i + tag.length)
        if (close === -1) throw new Error(`unterminated ${tag} quoted body`)
        current += sql.slice(i, close + tag.length)
        i = close + tag.length
        continue
      }
    }

    if (sql[i] === ';') {
      found.push(current)
      current = ''
      i += 1
      continue
    }

    current += sql[i]
    i += 1
  }

  found.push(current)

  return found.map((statement) => statement.replace(/\s+/g, ' ').trim()).filter(Boolean)
}

const CREATE_ENUM = /create type public\.([a-z0-9_]+) as enum \(([^)]*)\)/gi
const DROP_TYPE = /^drop type (?:if exists )?public\.([a-z0-9_]+)/i
const CREATE_TABLE = /^create table (?:if not exists )?public\.([a-z0-9_]+) \(/i
const DROP_TABLE = /^drop table (?:if exists )?public\.([a-z0-9_]+)/i
/**
 * A column added to a table a later migration did not author. Every other
 * `alter table` this repository writes — RLS, privileges, a constraint added
 * from inside a DO block — changes nothing a row's TypeScript can see, but a
 * new column does, and a generator that ignored it would type a schema missing
 * the column its own migrations declare (SES-01a's `abandoned_at`).
 */
const ALTER_TABLE_ADD_COLUMN =
  /^alter table (?:if exists )?(?:only )?public\.([a-z0-9_]+) add column (?:if not exists )?(.+)$/i
const CREATE_VIEW = /^create (?:or replace )?view public\.([a-z0-9_]+)/i
const DROP_VIEW = /^drop view (?:if exists )?public\.([a-z0-9_]+)/i
const CREATE_FUNCTION =
  /^create (?:or replace )?function public\.([a-z0-9_]+) ?\(([^)]*)\) returns (.+?) language /i

/**
 * The schema the rebuild migrations declare, applied in order: a table created
 * in one file and dropped in a later one is not in the result, which is what
 * the database would say too.
 *
 * @returns {Schema}
 */
export function readSchema() {
  /** @type {Map<string, string[]>} */
  const enums = new Map()
  /** @type {Map<string, Table>} */
  const tables = new Map()
  /** @type {Set<string>} */
  const views = new Set()
  /** @type {Map<string, SchemaFunction>} */
  const functions = new Map()

  for (const file of migrationFiles()) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')

    for (const statement of statements(sql)) {
      // Enums are created inside a DO block, so they are matched anywhere in
      // the statement rather than only at its head.
      for (const match of statement.matchAll(CREATE_ENUM)) {
        enums.set(match[1], parseEnumValues(match[2]))
      }

      const dropType = DROP_TYPE.exec(statement)
      if (dropType !== null) {
        enums.delete(dropType[1])
        continue
      }

      const createTable = CREATE_TABLE.exec(statement)
      if (createTable !== null) {
        const name = createTable[1]
        const body = balanced(statement, createTable[0].length - 1)
        tables.set(name, { name, columns: parseColumns(name, body) })
        continue
      }

      const dropTable = DROP_TABLE.exec(statement)
      if (dropTable !== null) {
        tables.delete(dropTable[1])
        continue
      }

      const addColumn = ALTER_TABLE_ADD_COLUMN.exec(statement)
      if (addColumn !== null) {
        const [, name, column] = addColumn
        const table = tables.get(name)
        if (table === undefined) {
          throw new Error(`alter table public.${name}: no such table is declared`)
        }
        // One column per statement, which is how this repository writes them.
        // A multi-column ADD would parse the commas as a second column's worth
        // of modifiers, so it raises rather than guessing.
        const [added, ...rest] = parseColumns(name, column)
        if (rest.length > 0) {
          throw new Error(`alter table public.${name}: add one column per statement`)
        }
        if (!table.columns.some((existing) => existing.name === added.name)) {
          table.columns.push(added)
        }
        continue
      }

      const createView = CREATE_VIEW.exec(statement)
      if (createView !== null) {
        views.add(createView[1])
        continue
      }

      const dropView = DROP_VIEW.exec(statement)
      if (dropView !== null) {
        views.delete(dropView[1])
        continue
      }

      const createFunction = CREATE_FUNCTION.exec(statement)
      if (createFunction !== null) {
        const [, name, args, returns] = createFunction
        const declared = returns.trim().toLowerCase()
        // `RETURNS TABLE (…)` declares its own columns, so they are read the
        // same way arguments are: the row a caller receives is as typed as a
        // table's, and GEN-02a's candidate is that row rather than `Json`.
        const table = /^table ?\(/.exec(declared)

        functions.set(name, {
          name,
          args: parseArgs(name, args),
          returns: table === null ? declared : 'table',
          columns:
            table === null
              ? undefined
              : parseArgs(name, balanced(declared, declared.indexOf('('))),
        })
      }
    }
  }

  return {
    enums: [...enums]
      .map(([name, values]) => ({ name, values }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    tables: [...tables.values()].sort((a, b) => a.name.localeCompare(b.name)),
    views: [...views].sort(),
    functions: [...functions.values()].sort((a, b) => a.name.localeCompare(b.name)),
  }
}

/** `'a', 'b'` → `['a', 'b']`. */
function parseEnumValues(source) {
  return [...source.matchAll(/'((?:[^']|'')*)'/g)].map((match) =>
    match[1].replaceAll("''", "'"),
  )
}

/** The text inside the parenthesis at `open`, respecting nesting. */
function balanced(source, open) {
  let depth = 0

  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '(') depth += 1
    if (source[i] === ')') {
      depth -= 1
      if (depth === 0) return source.slice(open + 1, i)
    }
  }

  throw new Error('unbalanced parenthesis')
}

/**
 * Split on the commas that separate items, not the ones inside `numeric(3, 1)`
 * or a `default array[…]`.
 */
function splitItems(body) {
  const items = []
  let depth = 0
  let current = ''

  for (const char of body) {
    if (char === '(' || char === '[') depth += 1
    if (char === ')' || char === ']') depth -= 1
    if (char === ',' && depth === 0) {
      items.push(current.trim())
      current = ''
      continue
    }
    current += char
  }

  if (current.trim() !== '') items.push(current.trim())

  return items
}

/** Table-level items that are constraints rather than columns. */
const TABLE_CONSTRAINT = /^(constraint|primary|unique|check|foreign|exclude|like)\b/i

/**
 * A type as this repository writes one: `uuid`, `text[]`, `numeric(3, 1)`,
 * `double precision`, `public.section_type[]`.
 */
const COLUMN_TYPE =
  /^([a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)?(?: precision| varying)?(?: ?\([^)]*\))?(?: ?\[ ?\])*)/i

/** `primary key (session_focus, movement_pattern)`, however it is introduced. */
const TABLE_PRIMARY_KEY = /^(?:constraint [a-z0-9_]+ )?primary key \(([^)]*)\)/i

function parseColumns(table, body) {
  const columns = []
  /** Columns a table-level PRIMARY KEY names; NOT NULL follows from it. */
  const keyed = new Set()

  for (const item of splitItems(body)) {
    if (TABLE_CONSTRAINT.test(item)) {
      const primaryKey = TABLE_PRIMARY_KEY.exec(item)
      if (primaryKey !== null) {
        for (const name of primaryKey[1].split(',')) keyed.add(name.trim())
      }
      continue
    }

    const space = item.indexOf(' ')
    if (space === -1) throw new Error(`${table}: cannot read column "${item}"`)

    const name = item.slice(0, space)
    const rest = item.slice(space + 1).trim()
    const type = COLUMN_TYPE.exec(rest)
    if (type === null) throw new Error(`${table}.${name}: cannot read a type from "${rest}"`)

    const modifiers = rest.slice(type[0].length)

    columns.push({
      name,
      pgType: type[1].toLowerCase().replace(/ ?\[ ?\]/g, '[]'),
      // PRIMARY KEY implies NOT NULL and is usually written without it. Reading
      // only the words present would make every `id` nullable in the types and
      // force a null check no row can ever fail.
      nullable: !/\bnot null\b/i.test(modifiers) && !/\bprimary key\b/i.test(modifiers),
      hasDefault:
        /\bdefault\b/i.test(modifiers) || /\bgenerated (always|by default)\b/i.test(modifiers),
    })
  }

  if (columns.length === 0) throw new Error(`${table}: no columns`)

  for (const column of columns) {
    if (keyed.has(column.name)) column.nullable = false
  }

  for (const name of keyed) {
    if (!columns.some((column) => column.name === name)) {
      throw new Error(`${table}: primary key names "${name}", which is not a column`)
    }
  }

  return columns
}

function parseArgs(fn, source) {
  if (source.trim() === '') return []

  return splitItems(source).map((item) => {
    const space = item.indexOf(' ')
    if (space === -1) throw new Error(`${fn}: cannot read argument "${item}"`)

    const name = item.slice(0, space)
    const rest = item.slice(space + 1).trim()
    const type = COLUMN_TYPE.exec(rest)
    if (type === null) throw new Error(`${fn}(${name}): cannot read a type from "${rest}"`)

    return {
      name,
      pgType: type[1].toLowerCase().replace(/ ?\[ ?\]/g, '[]'),
      optional: /\bdefault\b/i.test(rest.slice(type[0].length)),
    }
  })
}
