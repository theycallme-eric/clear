/**
 * ENV-07 — the standing-test disposition register.
 *
 * The RLS matrix is only a standing check if it cannot silently stop covering
 * the schema. A table added next month is the dangerous case: it ships with a
 * policy nobody re-reads, the suite still passes, and the green tick now means
 * "the nine tables we happened to list are safe" rather than "user data is
 * user-owned".
 *
 * So the matrix is derived, not written. Every table the migrations create
 * must appear here with an explicit **disposition** — one of exactly two
 * answers, both of them a decision somebody made on purpose:
 *
 *   * `cross-user` — user-owned. It joins the standing matrix and every run
 *     proves that another user reads none of it and writes none of it.
 *   * `shared-reference` — catalog data every authenticated user may read,
 *     owned by nobody, so there is no cross-user denial to assert. It carries
 *     a `why`, because "this one is fine" is the sentence that needs evidence.
 *
 * `auditSchema` compares this register against the migrations, and the suite
 * fails when they disagree in either direction. Adding a table without saying
 * which of the two it is breaks the build — which is the point. There is no
 * default, and silence is not one of the options.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * @typedef {object} Disposition
 * @property {string} table
 * @property {'cross-user' | 'shared-reference'} standing
 * @property {string} why the sentence justifying that answer
 * @property {string | null} [ownerColumn] cross-user only: the column carrying
 *   the owner, or `null` when ownership is inherited through a parent chain
 * @property {boolean} [seeded] cross-user only: whether the harness can build
 *   a row of it from the schema alone, giving the denial a positive control
 */

/**
 * Every table in `supabase/migrations`, and what the standing suite does about
 * it. Order is dependency order for the user-owned ones, because that is the
 * order the seed writes them in.
 *
 * @type {Disposition[]}
 */
export const TABLE_DISPOSITIONS = [
  {
    table: 'profiles',
    standing: 'cross-user',
    ownerColumn: 'id',
    seeded: true,
    why: 'one row per person, keyed by their auth id',
  },
  {
    table: 'locations',
    standing: 'cross-user',
    ownerColumn: 'user_id',
    seeded: true,
    why: 'where a person trains, and what equipment they have',
  },
  {
    table: 'location_equipment',
    standing: 'cross-user',
    ownerColumn: null,
    seeded: true,
    why: 'inherits ownership from its location',
  },
  {
    table: 'user_constraints',
    standing: 'cross-user',
    ownerColumn: 'user_id',
    seeded: true,
    why: 'injuries and exclusions — the most sensitive rows in the schema',
  },
  {
    table: 'workout_sessions',
    standing: 'cross-user',
    ownerColumn: 'user_id',
    seeded: true,
    why: 'a generated workout, owned by the person who asked for it',
  },
  {
    table: 'workout_sections',
    standing: 'cross-user',
    ownerColumn: null,
    seeded: true,
    why: 'inherits ownership through its session',
  },
  {
    table: 'workout_blocks',
    standing: 'cross-user',
    ownerColumn: null,
    seeded: true,
    why: 'inherits ownership through its section',
  },
  {
    table: 'block_results',
    standing: 'cross-user',
    ownerColumn: null,
    seeded: true,
    why: 'inherits ownership through its block',
  },
  {
    table: 'workout_exercises',
    standing: 'cross-user',
    ownerColumn: null,
    seeded: false,
    why: 'inherits ownership through its block; a row needs a catalog exercise id, which its own task applies',
  },
  {
    table: 'exercise_set_logs',
    standing: 'cross-user',
    ownerColumn: null,
    seeded: false,
    why: 'inherits ownership through its workout exercise; a row needs a catalog exercise id, which its own task applies',
  },

  // The catalog. Shared, read-only to `authenticated`, written by the seeding
  // task with the service role — no `user_id` exists to cross.
  {
    table: 'exercise_definitions',
    standing: 'shared-reference',
    why: 'the exercise library: identical for every user, select-only to authenticated',
  },
  {
    table: 'exercise_muscle_groups',
    standing: 'shared-reference',
    why: 'catalog attribute of an exercise, not of a person',
  },
  {
    table: 'exercise_pattern_weights',
    standing: 'shared-reference',
    why: 'catalog attribute of an exercise, not of a person',
  },
  {
    table: 'component_pattern_map',
    standing: 'shared-reference',
    why: 'generation lookup table, identical for every user',
  },
  {
    table: 'focus_pattern_map',
    standing: 'shared-reference',
    why: 'generation lookup table, identical for every user',
  },
]

/**
 * The user-owned tables, in the shape the RLS matrix drives itself from.
 *
 * @returns {{ table: string, ownerColumn: string | null, seeded: boolean }[]}
 */
export function standingMatrix(dispositions = TABLE_DISPOSITIONS) {
  return dispositions
    .filter((entry) => entry.standing === 'cross-user')
    .map(({ table, ownerColumn = null, seeded = false }) => ({
      table,
      ownerColumn,
      seeded,
    }))
}

/** Where the schema lives, relative to the repository root. */
export const MIGRATIONS_DIR = 'supabase/migrations'

/** `--` to end of line, and `/* … *\/` blocks. Neither creates a table. */
const stripComments = (sql) =>
  sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ')

const CREATE_TABLE = /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(\w+)/gi
const ENABLE_RLS =
  /alter\s+table\s+public\.(\w+)\s+enable\s+row\s+level\s+security/gi

/**
 * What the migrations actually declare: which tables exist in `public`, and
 * which of them have row-level security turned on.
 *
 * Read from the files rather than from a live connection on purpose — this has
 * to be answerable on a pull request with no database, which is where the
 * question "did you say what this new table is?" needs answering.
 *
 * @param {string} [root] repository root
 * @returns {{ tables: string[], rlsEnabled: string[] }}
 */
export function readSchema(root = process.cwd()) {
  const dir = resolve(root, MIGRATIONS_DIR)
  const tables = new Set()
  const rlsEnabled = new Set()

  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith('.sql')) continue
    const sql = stripComments(readFileSync(resolve(dir, file), 'utf-8'))

    for (const [, table] of sql.matchAll(CREATE_TABLE)) tables.add(table)
    for (const [, table] of sql.matchAll(ENABLE_RLS)) {
      tables.add(table)
      rlsEnabled.add(table)
    }
  }

  return { tables: [...tables].sort(), rlsEnabled: [...rlsEnabled].sort() }
}

/**
 * Compare the register with the schema. Every list it returns is a build
 * failure, and each one names a different mistake:
 *
 *   * `undisposed` — a table exists and nobody said what the standing suite
 *     does about it. This is the one that would otherwise go unnoticed.
 *   * `absentFromSchema` — a disposition outlived its table, so the matrix is
 *     asserting against something that no longer exists.
 *   * `unprotected` — a table called user-owned whose migration never enabled
 *     row-level security. The matrix would still pass by accident if the
 *     table were empty; this catches it at the source.
 *
 * @param {{ tables: string[], rlsEnabled: string[] }} schema
 * @param {Disposition[]} [dispositions]
 */
export function auditSchema(schema, dispositions = TABLE_DISPOSITIONS) {
  const disposed = new Map(dispositions.map((entry) => [entry.table, entry]))
  const rls = new Set(schema.rlsEnabled)

  return {
    undisposed: schema.tables.filter((table) => !disposed.has(table)),
    absentFromSchema: [...disposed.keys()].filter(
      (table) => !schema.tables.includes(table),
    ),
    unprotected: [...disposed.values()]
      .filter((entry) => entry.standing === 'cross-user' && !rls.has(entry.table))
      .map((entry) => entry.table),
  }
}
