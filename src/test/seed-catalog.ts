/**
 * The seeded catalog, read out of the files the database is actually given.
 *
 * GEN-02a's acceptance is "retrieval tests pass against seeded data", so the
 * fixture is not hand-written: it is `supabase/seed/010_exercise_definitions.sql`
 * and `supabase/seed/020_exercise_muscle_groups.sql` — the artifacts `npm run
 * seed` commits and `npm run seed -- --check` keeps honest — joined to the
 * taxonomy the catalog migration itself inserts. A retrieval test therefore
 * fails when the real library stops supporting a goal preset, which is the
 * failure worth catching; a fixture of six invented exercises could not.
 *
 * The join reproduces `exercise_catalog` (DATA-01a §7): `component_movements`
 * mapped through `component_pattern_map` gives `movement_patterns`, and the
 * muscle seed gives `muscles`. `primary_patterns` comes from
 * `exercise_pattern_weights`, seeded in `030_…`, and is read the same way.
 *
 * Parsing SQL is the cost of this approach and it is bounded: the generated
 * files are one row per line, written by one generator, in one shape.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '../..')

const read = (relativePath: string) => readFileSync(resolve(repoRoot, relativePath), 'utf8')

/** One row of `exercise_catalog`, as candidate retrieval reads it. */
export interface SeededExercise {
  readonly id: string
  readonly name: string
  readonly equipmentOptions: readonly string[]
  readonly sections: readonly string[]
  readonly componentMovements: readonly string[]
  readonly exerciseRole: string
  readonly canBePrimary: boolean
  readonly movementPatterns: readonly string[]
  readonly primaryPatterns: readonly string[]
  readonly muscles: readonly { muscle: string; role: string }[]
}

// ─────────────────────────────────────────────────────────────────────────────
// A very small SQL literal reader
// ─────────────────────────────────────────────────────────────────────────────

type Literal = string | number | boolean | null | Literal[] | Record<string, unknown>

/**
 * The values of one `(…)` row, split at top-level commas. Quoted text and
 * nested brackets are respected, so a name containing a comma stays one value.
 */
function splitValues(row: string): string[] {
  const values: string[] = []
  let depth = 0
  let quoted = false
  let current = ''

  for (let i = 0; i < row.length; i += 1) {
    const character = row[i]

    if (quoted) {
      current += character
      // `''` is an escaped quote and does not end the literal.
      if (character === "'" && row[i + 1] === "'") {
        current += "'"
        i += 1
      } else if (character === "'") {
        quoted = false
      }
      continue
    }

    if (character === "'") {
      quoted = true
      current += character
      continue
    }
    if (character === '(' || character === '[') depth += 1
    if (character === ')' || character === ']') depth -= 1
    if (character === ',' && depth === 0) {
      values.push(current.trim())
      current = ''
      continue
    }

    current += character
  }

  values.push(current.trim())

  return values
}

/** `'a''b'::text`, `array['x', 'y']::text[]`, `'{}'::jsonb`, `true`, `null`. */
function literal(source: string): Literal {
  const value = source.replace(/::[a-z_. \][]+$/i, '').trim()

  if (value === 'null') return null
  if (value === 'true') return true
  if (value === 'false') return false

  if (/^array\[/i.test(value)) {
    const inner = value.slice(value.indexOf('[') + 1, value.lastIndexOf(']')).trim()
    return inner === '' ? [] : splitValues(inner).map((entry) => literal(entry))
  }

  if (value.startsWith("'")) {
    const text = value.slice(1, -1).replaceAll("''", "'")
    // A jsonb literal is quoted text that happens to be JSON.
    if (/^[[{]/.test(text)) return JSON.parse(text) as Record<string, unknown>
    return text
  }

  return Number(value)
}

/** Every `(…)` row of the first `insert into <table> … values` in `sql`. */
function insertedRows(sql: string, table: string): Literal[][] {
  const start = sql.indexOf(`insert into public.${table}`)
  if (start === -1) throw new Error(`no insert into ${table}`)

  const body = sql.slice(sql.indexOf(') values', start) + ') values'.length)
  const rows: Literal[][] = []

  for (const line of body.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    // One row per line, and the rows are contiguous: the first line that is not
    // one is `on conflict …`, which ends the statement.
    if (!trimmed.startsWith('(')) break
    const row = trimmed.slice(1, trimmed.lastIndexOf(')'))
    rows.push(splitValues(row).map((value) => literal(value)))
  }

  if (rows.length === 0) throw new Error(`no rows read from ${table}`)

  return rows
}

const text = (value: Literal): string => String(value)
const texts = (value: Literal): string[] => (value as Literal[]).map(text)

// ─────────────────────────────────────────────────────────────────────────────
// The taxonomy, from the migration that inserts it
// ─────────────────────────────────────────────────────────────────────────────

const CATALOG_MIGRATION = 'supabase/migrations/20260921000000_catalog_domain.sql'

/** `component_pattern_map`: component → movement pattern. */
export function componentPatternMap(): Map<string, string> {
  const sql = read(CATALOG_MIGRATION)

  return new Map(
    insertedRows(sql, 'component_pattern_map').map((row) => [text(row[0]), text(row[1])]),
  )
}

/** `focus_pattern_map`: which patterns a focus admits. */
export function focusPatternMap(): Map<string, string[]> {
  const sql = read(CATALOG_MIGRATION)
  const map = new Map<string, string[]>()

  for (const row of insertedRows(sql, 'focus_pattern_map')) {
    const focus = text(row[0])
    map.set(focus, [...(map.get(focus) ?? []), text(row[1])])
  }

  return map
}

// ─────────────────────────────────────────────────────────────────────────────
// The catalog
// ─────────────────────────────────────────────────────────────────────────────

let cached: SeededExercise[] | null = null

/** `exercise_catalog` as the seed leaves it: 140 rows, patterns derived. */
export function seededCatalog(): SeededExercise[] {
  if (cached !== null) return cached

  const components = componentPatternMap()

  const muscles = new Map<string, { muscle: string; role: string }[]>()
  for (const row of insertedRows(
    read('supabase/seed/020_exercise_muscle_groups.sql'),
    'exercise_muscle_groups',
  )) {
    const id = text(row[0])
    muscles.set(id, [
      ...(muscles.get(id) ?? []),
      { muscle: text(row[1]), role: text(row[2]) },
    ])
  }

  const primaryPatterns = new Map<string, string[]>()
  for (const row of insertedRows(
    read('supabase/seed/030_exercise_pattern_weights.sql'),
    'exercise_pattern_weights',
  )) {
    if (row[2] !== true) continue
    const id = text(row[0])
    primaryPatterns.set(id, [...(primaryPatterns.get(id) ?? []), text(row[1])])
  }

  cached = insertedRows(
    read('supabase/seed/010_exercise_definitions.sql'),
    'exercise_definitions',
  ).map((row) => {
    const [id, name, equipmentOptions, , , , sections, canBePrimary, componentMovements, exerciseRole] =
      row
    const derived = new Set(
      texts(componentMovements)
        .map((component) => components.get(component))
        .filter((pattern): pattern is string => pattern !== undefined),
    )

    return {
      id: text(id),
      name: text(name),
      equipmentOptions: texts(equipmentOptions),
      sections: texts(sections),
      componentMovements: texts(componentMovements),
      exerciseRole: text(exerciseRole),
      canBePrimary: canBePrimary === true,
      movementPatterns: [...derived].sort(),
      // `exercise_pattern_ranked` joins the authored weighting onto the derived
      // patterns, so a weight for a pattern nothing derives cannot surface —
      // 19 of the seeded rows are in exactly that position.
      primaryPatterns: (primaryPatterns.get(text(id)) ?? [])
        .filter((pattern) => derived.has(pattern))
        .sort(),
      muscles: muscles.get(text(id)) ?? [],
    }
  })

  return cached
}
