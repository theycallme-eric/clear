/**
 * DATA-03 — the schema as TypeScript.
 *
 * The shape is `supabase gen types typescript`'s: one `Database` type with
 * `Tables` (Row / Insert / Update), `Functions` (Args / Returns) and `Enums`,
 * plus the `Constants` object that carries the enum values at runtime. A
 * consumer that has used generated Supabase types has nothing new to learn, and
 * if the CLI ever does become able to answer for this schema its output drops
 * into the same place.
 *
 * Two deliberate differences, both because this project talks to PostgREST over
 * `fetch` rather than through `supabase-js`:
 *
 *   * no `Relationships` — nothing consumes them, and a join is spelled in the
 *     select string;
 *   * no typed `Views`. A view's columns are a property of the query planner,
 *     not of its SQL text, and there is no database here to ask. The names are
 *     emitted as `ViewName` so that a view added later fails the drift check,
 *     and the consumer that first reads one declares its row.
 *
 * Deterministic: everything is sorted by name and no timestamp is written, so
 * two runs over the same migrations produce byte-identical output. That is what
 * makes `--check` a drift check rather than a diff of two renderings.
 */

/** Postgres scalar → TypeScript. Anything absent raises rather than guessing. */
const SCALARS = {
  bool: 'boolean',
  boolean: 'boolean',
  bigint: 'number',
  int: 'number',
  int2: 'number',
  int4: 'number',
  int8: 'number',
  integer: 'number',
  smallint: 'number',
  decimal: 'number',
  numeric: 'number',
  real: 'number',
  float4: 'number',
  float8: 'number',
  'double precision': 'number',
  json: 'Json',
  jsonb: 'Json',
  bpchar: 'string',
  char: 'string',
  character: 'string',
  'character varying': 'string',
  citext: 'string',
  date: 'string',
  interval: 'string',
  text: 'string',
  time: 'string',
  timestamp: 'string',
  timestamptz: 'string',
  uuid: 'string',
  varchar: 'string',
}

/**
 * @param {string} pgType    As the migration writes it.
 * @param {Set<string>} enums
 * @param {string} context   Named in the error when the type is unknown.
 * @returns {string}
 */
function tsType(pgType, enums, context) {
  if (pgType.endsWith('[]')) {
    return `${tsType(pgType.slice(0, -2), enums, context)}[]`
  }

  // `numeric(3, 1)` and `varchar(40)` are the same TypeScript as their base.
  const base = pgType.replace(/\(.*\)$/, '').trim()
  const unqualified = base.startsWith('public.') ? base.slice('public.'.length) : base

  if (enums.has(unqualified)) return `Database['public']['Enums']['${unqualified}']`
  if (base in SCALARS) return SCALARS[base]

  throw new Error(`${context}: no TypeScript for Postgres type "${pgType}"`)
}

/** A property key, quoted only when it has to be. */
function key(name) {
  return /^[A-Za-z_$][\w$]*$/.test(name) ? name : `'${name}'`
}

function quoted(value) {
  return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`
}

/**
 * The contents of `src/data/database.types.ts`.
 *
 * @param {import('./schema.mjs').Schema} schema
 * @param {string[]} sources Migration file names, for the header.
 * @returns {string}
 */
export function emitTypes(schema, sources) {
  const enums = new Set(schema.enums.map((entry) => entry.name))
  const lines = []
  const write = (line = '') => lines.push(line)

  write('/**')
  write(' * GENERATED FILE — DO NOT EDIT.')
  write(' *')
  write(' * `npm run gen:types` writes this from the migrations that declare the')
  write(' * schema; `npm run gen:types -- --check` fails when the two disagree, and CI')
  write(' * runs that check, so an edit here is reverted by the next run rather than')
  write(' * kept. Change the migration.')
  write(' *')
  write(' * Source (DATA-01a → DATA-01d, DATA-05):')
  for (const source of sources) write(` *   supabase/migrations/${source}`)
  write(' */')
  write()
  write('export type Json =')
  write('  | string')
  write('  | number')
  write('  | boolean')
  write('  | null')
  write('  | { [key: string]: Json | undefined }')
  write('  | Json[]')
  write()
  write('export type Database = {')
  write('  public: {')

  write('    Tables: {')
  for (const table of schema.tables) {
    const context = `${table.name}`
    write(`      ${key(table.name)}: {`)

    write('        Row: {')
    for (const column of table.columns) {
      const type = tsType(column.pgType, enums, `${context}.${column.name}`)
      write(`          ${key(column.name)}: ${type}${column.nullable ? ' | null' : ''}`)
    }
    write('        }')

    write('        Insert: {')
    for (const column of table.columns) {
      const type = tsType(column.pgType, enums, `${context}.${column.name}`)
      // The database supplies a defaulted column, and a nullable one is absent
      // rather than null when the caller has nothing to say.
      const optional = column.hasDefault || column.nullable
      write(
        `          ${key(column.name)}${optional ? '?' : ''}: ${type}${column.nullable ? ' | null' : ''}`,
      )
    }
    write('        }')

    write('        Update: {')
    for (const column of table.columns) {
      const type = tsType(column.pgType, enums, `${context}.${column.name}`)
      write(`          ${key(column.name)}?: ${type}${column.nullable ? ' | null' : ''}`)
    }
    write('        }')

    write('      }')
  }
  write('    }')

  write('    Functions: {')
  for (const fn of schema.functions) {
    // A trigger function is not callable over PostgREST; it has no signature a
    // client could use and is left out rather than typed as something it is not.
    if (fn.returns === 'trigger') continue

    write(`      ${key(fn.name)}: {`)
    if (fn.args.length === 0) {
      write('        Args: Record<string, never>')
    } else {
      write('        Args: {')
      for (const arg of fn.args) {
        const type = tsType(arg.pgType, enums, `${fn.name}(${arg.name})`)
        // A defaulted argument may be omitted, and PostgREST accepts an explicit
        // null for it — which is how `constraints_in_force` is asked for the
        // persistent set alone.
        write(`          ${key(arg.name)}${arg.optional ? '?' : ''}: ${type}${arg.optional ? ' | null' : ''}`)
      }
      write('        }')
    }
    write(`        Returns: ${returnType(fn, enums)}`)
    write('      }')
  }
  write('    }')

  write('    Enums: {')
  for (const entry of schema.enums) {
    write(`      ${key(entry.name)}: ${entry.values.map(quoted).join(' | ')}`)
  }
  write('    }')

  write('    CompositeTypes: {')
  write('      [_ in never]: never')
  write('    }')
  write('  }')
  write('}')
  write()
  write('/**')
  write(' * The schema also declares views. They are named, not typed: a view\'s column')
  write(' * types come from the planner rather than from its SQL text, and this')
  write(' * generator has no database to ask. The issue that first reads one declares')
  write(' * its row; naming them here means a view added later fails the drift check')
  write(' * instead of arriving unnoticed.')
  write(' */')
  write(
    `export type ViewName = ${schema.views.length === 0 ? 'never' : schema.views.map(quoted).join(' | ')}`,
  )
  write()
  write("type PublicSchema = Database['public']")
  write()
  write('export type TableName = keyof PublicSchema[\'Tables\']')
  write('export type FunctionName = keyof PublicSchema[\'Functions\']')
  write('export type EnumName = keyof PublicSchema[\'Enums\']')
  write()
  write("export type Tables<T extends TableName> = PublicSchema['Tables'][T]['Row']")
  write("export type TablesInsert<T extends TableName> = PublicSchema['Tables'][T]['Insert']")
  write("export type TablesUpdate<T extends TableName> = PublicSchema['Tables'][T]['Update']")
  write("export type Enums<T extends EnumName> = PublicSchema['Enums'][T]")
  write("export type FunctionArgs<T extends FunctionName> = PublicSchema['Functions'][T]['Args']")
  write(
    "export type FunctionReturns<T extends FunctionName> = PublicSchema['Functions'][T]['Returns']",
  )
  write()
  write('/** The enum values at runtime, for a select control or a validator. */')
  write('export const Constants = {')
  write('  public: {')
  write('    Enums: {')
  for (const entry of schema.enums) {
    write(`      ${key(entry.name)}: [${entry.values.map(quoted).join(', ')}],`)
  }
  write('    },')
  write('  },')
  write('} as const')
  write()

  return lines.join('\n')
}

function returnType(fn, enums) {
  // `RETURNS TABLE (…)`: the columns are declared in the signature, so the row
  // is written out rather than widened to `Json`. Every column is
  // non-nullable here — a set-returning function declares no NOT NULL, and
  // guessing one from the body is not something this generator can do — so the
  // caller validating the payload (CORE-03) remains the boundary that decides.
  if (fn.returns === 'table') {
    const columns = (fn.columns ?? []).map(
      (column) =>
        `${key(column.name)}: ${tsType(column.pgType, enums, `${fn.name}() returns ${column.name}`)}`,
    )

    return `{ ${columns.join('; ')} }[]`
  }

  const setof = /^setof (?:public\.)?([a-z0-9_]+)$/.exec(fn.returns)
  if (setof !== null) {
    return `Database['public']['Tables'][${quoted(setof[1])}]['Row'][]`
  }

  const table = /^(?:public\.)?([a-z0-9_]+)$/.exec(fn.returns)
  if (table !== null && !(fn.returns in SCALARS) && !enums.has(table[1])) {
    return `Database['public']['Tables'][${quoted(table[1])}]['Row']`
  }

  return tsType(fn.returns, enums, `${fn.name}() returns`)
}
