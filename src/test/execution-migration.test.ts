import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// DATA-01d. Same approach as the catalog's, the user baseline's and the
// workout domain's tests: the schema lives in a file Postgres reads, not in
// the bundle, so the assertions are made against the shipped artefact.
//
// What this can and cannot prove. `supabase db push --dry-run` proves the CLI
// accepts the migration set against the reused live project; these tests prove
// the migration says what DATA-01d requires it to say — that a log can hold
// reps, time and distance, that every log stamps its own weight unit, that
// null, zero and skipped stay three different observations, that results hang
// off a block rather than a section, and that the foreign key refuses a
// superseded prescription. What they cannot do is execute SQL: the
// off-machine-backup gate in docs/backend/live-inventory.md forbids mutating
// the live project until TASK-072, and there is no local server to run against
// (ENV-04 keeps Docker out of the loop). So "the database refuses the write"
// is proven here as "the constraint that refuses it is declared, and admits
// nothing else", and behaviourally by ENV-07's continuous job once there is a
// database to run it against.
const repoRoot = resolve(import.meta.dirname, '../..')

const EXECUTION_MIGRATION = '20260921000003_execution_domain.sql'
const WORKOUT_MIGRATION = '20260921000002_workout_domain.sql'

const sql = readFileSync(
  resolve(repoRoot, `supabase/migrations/${EXECUTION_MIGRATION}`),
  'utf-8',
)

/**
 * SQL with comments removed. Most of this file is prose about typed absence,
 * and prose naming `structure_results` must not read as declaring it.
 */
const statements = sql
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')

/**
 * The same SQL with string literals blanked, for the questions that have to be
 * asked of the DDL alone — `COMMENT ON` legitimately names what was retired,
 * and legitimately uses the word this domain refuses to store.
 */
const ddl = statements.replace(/'(?:[^']|'')*'/g, "''")

/** The two tables this domain owns. */
const EXECUTION_TABLES = ['exercise_set_logs', 'block_results'] as const

/** Everything between `create table public.<name> (` and the closing `);`. */
const tableBody = (table: string) => {
  const start = statements.search(
    new RegExp(`create table if not exists public\\.${table}\\s*\\(`, 'i'),
  )
  expect(start, `${table} is not created`).toBeGreaterThan(-1)

  const body = statements.slice(start)
  const end = body.indexOf('\n);')
  expect(end, `${table} has no terminator`).toBeGreaterThan(-1)

  return body.slice(body.indexOf('(') + 1, end)
}

/**
 * The column names a table declares, parsed from the body's top-level lines
 * rather than grepped — the assertions that matter most below are negative
 * ones (no `section_id` on a result, no `user_id` anywhere, no column that can
 * hold a skip), and a grep cannot tell a column it failed to find from a
 * column that is not there.
 */
const columnsOf = (table: string) =>
  tableBody(table)
    .split('\n')
    .map((line) => /^ {2}([a-z_]+)\s+\S/.exec(line)?.[1])
    .filter((name): name is string => name !== undefined && name !== 'constraint')

const columns = Object.fromEntries(
  EXECUTION_TABLES.map((table) => [table, columnsOf(table)]),
) as Record<(typeof EXECUTION_TABLES)[number], string[]>

/**
 * A column's whole declaration, whitespace-collapsed. Terminated by a comma at
 * depth zero rather than by the first comma, because `numeric(3, 1)` contains
 * one and truncating there would hide whatever follows the type.
 */
const columnLine = (table: string, column: string) => {
  const body = tableBody(table)
  const at = body.search(new RegExp(`^ {2}${column}\\s`, 'm'))
  if (at === -1) return undefined

  const from = body.slice(at)
  let depth = 0
  for (let i = 0; i < from.length; i += 1) {
    if (from[i] === '(') depth += 1
    if (from[i] === ')') depth -= 1
    if (depth === 0 && (from[i] === ',' || from[i] === '\n')) {
      return from.slice(0, i).replace(/\s+/g, ' ').trim()
    }
  }

  return from.replace(/\s+/g, ' ').trim()
}

/** A named constraint's first parenthesised group, whitespace-collapsed. */
const constraintBody = (table: string, name: string) => {
  const body = tableBody(table)
  const at = body.search(new RegExp(`constraint ${name}\\b`, 'i'))
  if (at === -1) return undefined

  const from = body.slice(at)
  const open = from.indexOf('(')

  let depth = 0
  for (let i = open; i < from.length; i += 1) {
    if (from[i] === '(') depth += 1
    if (from[i] === ')') {
      depth -= 1
      if (depth === 0) return from.slice(open, i + 1).replace(/\s+/g, ' ')
    }
  }

  return undefined
}

/** Every `CONSTRAINT <name> CHECK (...)` a table declares, by name. */
const checksOf = (table: string) =>
  [...tableBody(table).matchAll(/constraint (\w+)\s+check\b/gi)].map(
    ([, name]) => ({ name, body: constraintBody(table, name) ?? '' }),
  )

/**
 * Every `CREATE POLICY`, parsed into the parts the assertions ask about. A
 * parse rather than a set of greps because the requirement is about *every*
 * policy — a ninth policy added later with `USING (true)` has to fail these
 * tests, and a grep for the eight good ones would not notice it.
 */
const policies = [
  ...statements.matchAll(
    /create policy (\w+) on public\.(\w+)\s+for (\w+) to ([\w, ]+?)\s*(?=using|with check)((?:.|\n)*?);\s*\n/gi,
  ),
].map(([, name, table, command, roles, body]) => {
  const using = /\busing\s*\(((?:.|\n)*?)\)\s*(?:with check|$)/i.exec(body)
  const withCheck = /\bwith check\s*\(((?:.|\n)*)\)\s*$/i.exec(body)

  return {
    name,
    table,
    command: command.toLowerCase(),
    roles: roles.split(',').map((role) => role.trim()),
    using: using?.[1].trim(),
    withCheck: withCheck?.[1].trim(),
  }
})

const collapse = (predicate: string) => predicate.replace(/\s+/g, ' ').trim()

/**
 * An owner predicate: this row's session belongs to the caller, and nothing
 * weaker. Neither execution table stores an owner, so every one of them walks
 * up to `workout_sessions`.
 */
const isOwnerScoped = (predicate: string | undefined) => {
  if (predicate === undefined) return false
  const p = collapse(predicate)

  return (
    p.startsWith('exists (') &&
    /join public\.workout_sessions s\b/.test(p) &&
    /s\.user_id = \(select auth\.uid\(\)\)/.test(p)
  )
}

/** The column list of a `GRANT <command> (…) ON <table>` statement. */
const grantedColumns = (command: string, table: string) => {
  const match = new RegExp(
    `grant ${command}\\s*\\(([^)]*)\\)\\s*on public\\.${table}\\b`,
    'i',
  ).exec(statements)

  return match?.[1]
    .split(',')
    .map((column) => column.trim())
    .filter((column) => column !== '')
}

/** The columns that hold what the user actually did. */
const ACTUAL_COLUMNS = [
  'actual_reps',
  'actual_duration_seconds',
  'actual_distance',
  'weight',
  'rpe',
] as const

/** Every outcome a timed structure can produce (DATA_MODEL §8). */
const BLOCK_OUTCOMES = [
  'elapsed_seconds',
  'completed_under_cap',
  'rounds_completed',
  'partial_round_reps',
  'minutes_completed',
  'highest_rung',
] as const

describe('execution migration — shape (DATA-01d)', () => {
  it('creates the set logs, the block results, and the as-performed view', () => {
    for (const table of EXECUTION_TABLES) {
      expect(
        new RegExp(`create table if not exists public\\.${table}\\b`, 'i').test(
          statements,
        ),
      ).toBe(true)
    }

    expect(statements).toMatch(/create view public\.session_performed\b/i)
  })

  it('runs after the workout domain, whose rows everything here hangs from', () => {
    expect(EXECUTION_MIGRATION > WORKOUT_MIGRATION).toBe(true)
    expect(statements).toMatch(/references public\.workout_exercises \(/i)
    expect(statements).toMatch(/references public\.workout_blocks \(id\)/i)
  })

  it('is idempotent, so a failed push can be retried as-is', () => {
    const created = (statements.match(/create table/gi) ?? []).length
    const guarded = (statements.match(/create table if not exists/gi) ?? [])
      .length

    expect(created).toBe(EXECUTION_TABLES.length)
    expect(guarded).toBe(EXECUTION_TABLES.length)

    for (const drop of statements.match(
      /\bdrop (table|type|view|trigger|function|policy)\b[^;]*/gi,
    ) ?? []) {
      expect(drop).toMatch(/if exists/i)
    }

    for (const index of statements.match(/create (unique )?index[^;]*/gi) ?? []) {
      expect(index).toMatch(/if not exists/i)
    }

    // `ALTER TABLE … ADD CONSTRAINT` has no IF NOT EXISTS, so the one this
    // migration adds is guarded by a catalogue lookup instead.
    expect(statements).toMatch(/from pg_constraint c/i)
    expect(statements).toMatch(
      /c\.conname = 'workout_exercises_id_revision_key'/i,
    )

    // The view is dropped before it is created: CREATE OR REPLACE VIEW refuses
    // a change to the column list.
    const dropViewAt = statements.indexOf(
      'drop view if exists public.session_performed',
    )
    const createViewAt = statements.search(
      /create view public\.session_performed\b/i,
    )
    expect(dropViewAt).toBeGreaterThan(-1)
    expect(dropViewAt).toBeLessThan(createViewAt)
  })

  it('retires what this domain replaces, and nothing another domain owns', () => {
    const dropped = [
      ...statements.matchAll(/drop table if exists public\.(\w+)/gi),
    ].map(([, table]) => table)

    expect(new Set(dropped)).toEqual(
      new Set(['structure_results', 'exercise_set_logs']),
    )

    // `saved_workouts` is FAV-01's, and the prescription tables were DATA-01c's.
    expect(dropped).not.toContain('saved_workouts')
    expect(dropped).not.toContain('workout_exercises')

    // The old table is rebuilt, not left standing under its old shape.
    const dropAt = statements.indexOf(
      'drop table if exists public.exercise_set_logs',
    )
    const createAt = statements.search(
      /create table if not exists public\.exercise_set_logs\b/i,
    )
    expect(dropAt).toBeGreaterThan(-1)
    expect(dropAt).toBeLessThan(createAt)

    // The section-keyed results table does not come back under its own name.
    expect(ddl).not.toMatch(
      /create table (if not exists )?public\.structure_results\b/i,
    )

    // The last-set prefill reads the table that was just dropped. Dropped by
    // catalogue lookup, because the live project may hold more than one
    // overload of it.
    expect(statements).toMatch(/p\.proname = 'get_last_set_data'/i)
    expect(statements).toMatch(/drop function if exists/i)
  })
})

describe('execution migration — set logs record more than reps (DATA-01d)', () => {
  it('holds reps, duration and distance, with the distance carrying a unit', () => {
    for (const column of [
      'actual_reps',
      'actual_duration_seconds',
      'actual_distance',
      'actual_distance_unit',
    ]) {
      expect(columns.exercise_set_logs).toContain(column)
    }

    expect(columnLine('exercise_set_logs', 'actual_reps')).toMatch(/\bint\b/i)
    expect(columnLine('exercise_set_logs', 'actual_duration_seconds')).toMatch(
      /\bint\b/i,
    )
    expect(columnLine('exercise_set_logs', 'actual_distance')).toMatch(
      /\bnumeric\b/i,
    )
    expect(columnLine('exercise_set_logs', 'actual_distance_unit')).toMatch(
      /public\.distance_unit/i,
    )

    // A distance without its unit is a number, not a measurement.
    expect(constraintBody('exercise_set_logs', 'distance_has_unit')).toMatch(
      /actual_distance is null or actual_distance_unit is not null/i,
    )
  })

  it('stamps a weight unit on every row, not on the ones that happen to have weight', () => {
    // The spec's illustrative DDL writes this nullable with a CHECK; the
    // requirement says every row. NOT NULL says that and subsumes the CHECK.
    expect(columnLine('exercise_set_logs', 'weight_unit')).toMatch(
      /^weight_unit public\.weight_unit not null$/i,
    )

    // And no default, at write time or otherwise: a default here is exactly
    // the profile-inheritance this column exists to prevent.
    expect(columnLine('exercise_set_logs', 'weight_unit')).not.toMatch(
      /default/i,
    )
    expect(ddl).not.toMatch(/\bprofiles\b/i)
  })
})

describe('execution migration — typed absence (DATA-01d)', () => {
  it('gives no actual column a default, so silence is never written as a number', () => {
    for (const column of ACTUAL_COLUMNS) {
      const line = columnLine('exercise_set_logs', column)

      expect(line, `${column} is not declared`).toBeDefined()
      expect(line, `${column} has a default`).not.toMatch(/default/i)
      expect(line, `${column} is mandatory`).not.toMatch(/not null/i)
    }
  })

  it('lets every measurement be zero, because zero is a result', () => {
    // `actual_reps = 0` is a failed attempt, and a CHECK written `> 0` would
    // make it unstorable — collapsing it into the null that means "not
    // recorded", which is the one thing this table must not do.
    for (const check of [
      'exercise_set_logs_reps_non_negative',
      'exercise_set_logs_duration_non_negative',
      'exercise_set_logs_distance_non_negative',
      'exercise_set_logs_weight_non_negative',
    ]) {
      const body = constraintBody('exercise_set_logs', check)

      expect(body, `${check} is not declared`).toBeDefined()
      expect(body).toMatch(/>= 0/)
      expect(body).not.toMatch(/> 0/)
      expect(body, `${check} must admit null`).toMatch(/is null or/i)
    }

    expect(constraintBody('exercise_set_logs', 'exercise_set_logs_rpe_range'))
      .toMatch(/rpe is null or rpe between 1 and 10/i)
  })

  it('cannot store a skip, because a skip is a status on the exercise', () => {
    // The third state lives in `workout_exercises.execution_status`. A column
    // here could disagree with it, and every set of a skipped exercise would
    // then have to be kept in agreement by whoever wrote last. The view in §5
    // reads that column; this table does not own a copy of it.
    const body = tableBody('exercise_set_logs').replace(
      /'(?:[^']|'')*'/g,
      "''",
    )

    expect(ddl).not.toMatch(/skip/i)
    expect(body).not.toMatch(/execution_status/i)

    for (const column of columns.exercise_set_logs) {
      expect(column).not.toMatch(/skip/i)
    }
  })

  it('numbers sets from one, which is not a measurement and cannot be zero', () => {
    expect(columnLine('exercise_set_logs', 'set_number')).toMatch(
      /^set_number int not null$/i,
    )
    expect(
      constraintBody('exercise_set_logs', 'exercise_set_logs_set_number_positive'),
    ).toMatch(/set_number > 0/i)
  })
})

describe('execution migration — performed-row attribution (DATA-01d)', () => {
  it('references the exercise actually performed through a composite key', () => {
    const body = tableBody('exercise_set_logs').replace(/\s+/g, ' ')

    expect(body).toMatch(
      /foreign key \(workout_exercise_id, prescription_revision_status\) references public\.workout_exercises \(id, revision_status\)/i,
    )

    // A single-column reference is what defect D6 looks like written as a
    // foreign key: it would accept any prescription row, superseded included.
    expect(body).not.toMatch(/references public\.workout_exercises \(id\)/i)
  })

  it('adds the referenced key the composite foreign key needs', () => {
    expect(statements).toMatch(
      /alter table public\.workout_exercises\s+add constraint workout_exercises_id_revision_key\s+unique \(id, revision_status\)/i,
    )
  })

  it('makes the active-only default unreachable from a client', () => {
    // The column always takes its default on insert, so the foreign key can
    // only resolve against a prescription that is active right now. If a
    // caller could set it, it could name 'superseded' and the foreign key
    // would oblige — the missing grant is what makes "impossible" literal.
    expect(
      columnLine('exercise_set_logs', 'prescription_revision_status'),
    ).toMatch(
      /^prescription_revision_status public\.revision_status not null default 'active'$/i,
    )

    const insertable = grantedColumns('insert', 'exercise_set_logs')
    const updatable = grantedColumns('update', 'exercise_set_logs')

    expect(insertable).toBeDefined()
    expect(updatable).toBeDefined()
    expect(insertable).not.toContain('prescription_revision_status')
    expect(updatable).not.toContain('prescription_revision_status')

    // …and the rest of the row is writable, or the grant list is a bug rather
    // than a boundary.
    for (const column of [
      'id',
      'workout_exercise_id',
      'set_number',
      'weight_unit',
      ...ACTUAL_COLUMNS,
    ]) {
      expect(insertable, `${column} is not insertable`).toContain(column)
    }

    // A blanket grant would bypass the column list entirely.
    expect(statements).not.toMatch(
      /grant [^;(]*\b(insert|all)\b[^;(]*on public\.exercise_set_logs to [^;]*authenticated/i,
    )
  })

  it('keeps a superseded prescription attached to the sets it was performed for', () => {
    // DATA_MODEL §7: a superseded row keeps its own execution status, so
    // superseding an exercise that was already logged against has to remain
    // possible. ON UPDATE CASCADE carries the stamp forward instead of
    // refusing the swap.
    const body = tableBody('exercise_set_logs').replace(/\s+/g, ' ')

    expect(body).toMatch(/on update cascade/i)
    expect(body).toMatch(/on delete cascade/i)
  })

  it('carries a client-generated id, so a retried flush is not a second set', () => {
    // EXE-07 flushes a durable local queue and may flush twice. The id is
    // minted where the set happened; a server default would let a caller omit
    // it and lose that property on the retry that matters.
    expect(columnLine('exercise_set_logs', 'id')).toMatch(
      /^id uuid primary key$/i,
    )
    expect(columnLine('exercise_set_logs', 'id')).not.toMatch(
      /gen_random_uuid/i,
    )

    // And a second, independent guarantee of the same thing.
    expect(
      constraintBody('exercise_set_logs', 'exercise_set_logs_set_number_unique'),
    ).toMatch(/\(workout_exercise_id, set_number\)/i)
  })
})

describe('execution migration — results hang off a block (DATA-01d)', () => {
  it('is keyed to the block, once, and never to a section', () => {
    expect(tableBody('block_results')).toMatch(
      /block_id uuid not null unique\s+references public\.workout_blocks \(id\) on delete cascade/i,
    )

    // The inherited defect: `structure_results` was keyed to `section_id`, so
    // a conditioning section holding an EMOM *and* an AMRAP could record one
    // of them and silently drop the other.
    expect(columns.block_results).not.toContain('section_id')
    expect(columns.block_results).not.toContain('session_id')
  })

  it('holds every timed outcome, and perceived effort', () => {
    for (const column of BLOCK_OUTCOMES) {
      expect(columns.block_results, `${column} is missing`).toContain(column)
    }

    expect(columns.block_results).toContain('perceived_effort')
    expect(columnLine('block_results', 'perceived_effort')).toMatch(
      /\bsmallint\b/i,
    )
    expect(
      constraintBody('block_results', 'block_results_perceived_effort_range'),
    ).toMatch(/perceived_effort between 1 and 10/i)

    expect(columnLine('block_results', 'completed_under_cap')).toMatch(
      /\bboolean\b/i,
    )
  })

  it('bounds the outcomes without inventing rules about which absences are legal', () => {
    // Typed absence applies here too: "they beat the cap but the elapsed time
    // was never recorded" is a real state, so no CHECK may require one outcome
    // column because another is populated.
    for (const check of checksOf('block_results')) {
      const named = BLOCK_OUTCOMES.filter((outcome) =>
        new RegExp(`\\b${outcome}\\b`).test(check.body),
      )

      expect(named.length, `${check.name} pairs ${named.join(' with ')}`)
        .toBeLessThan(2)
    }

    // Zero rounds completed in an AMRAP is a hard, informative outcome.
    for (const check of [
      'block_results_elapsed_non_negative',
      'block_results_rounds_non_negative',
      'block_results_partial_reps_non_negative',
      'block_results_minutes_non_negative',
    ]) {
      expect(constraintBody('block_results', check)).toMatch(/>= 0/)
    }

    for (const column of BLOCK_OUTCOMES) {
      expect(columnLine('block_results', column)).not.toMatch(/not null/i)
      expect(columnLine('block_results', column)).not.toMatch(/default/i)
    }
  })
})

describe('execution migration — the as-performed view (DATA-01d)', () => {
  const view = (() => {
    const at = statements.search(/create view public\.session_performed\b/i)
    return statements.slice(at, statements.indexOf(';', at))
  })()

  it('reads with the calling user’s rights, not the view owner’s', () => {
    expect(view).toMatch(/with \(security_invoker = on\)/i)
  })

  it('shows every active exercise, logged or not', () => {
    // Set logs alone miss skipped exercises, block outcomes, and completed
    // exercises with only some fields filled in.
    expect(view).toMatch(
      /join public\.workout_exercises we on we\.block_id\s+= wb\.id\s+and we\.revision_status = 'active'/i,
    )
    expect(view).toMatch(/left join public\.block_results br on br\.block_id = wb\.id/i)
    expect(view).toMatch(/we\.execution_status/i)
    expect(view).toMatch(/array\(\s*select to_jsonb\(l\)/i)
    expect(view).toMatch(/order by l\.set_number/i)

    for (const outcome of BLOCK_OUTCOMES) {
      expect(view, `${outcome} is not exposed`).toMatch(
        new RegExp(`br\\.${outcome}\\b`),
      )
    }
    expect(view).toMatch(/br\.perceived_effort/i)
  })

  it('is read-only to a client', () => {
    expect(statements).toMatch(
      /grant select on public\.session_performed to authenticated/i,
    )
    expect(statements).not.toMatch(
      /grant [^;]*\b(insert|update|delete|all)\b[^;]* on public\.session_performed/i,
    )
  })
})

describe('execution migration — row-level security (DATA-01d)', () => {
  it('enables RLS on every table it creates', () => {
    for (const table of EXECUTION_TABLES) {
      expect(statements).toMatch(
        new RegExp(
          `alter table public\\.${table}\\s+enable row level security`,
          'i',
        ),
      )
    }
  })

  it('declares a policy for every command it grants', () => {
    const declared = new Set(
      policies.map((policy) => `${policy.table}.${policy.command}`),
    )

    for (const table of EXECUTION_TABLES) {
      for (const command of ['select', 'insert', 'update', 'delete']) {
        expect(declared.has(`${table}.${command}`), `${table}.${command}`).toBe(
          true,
        )
      }
    }
  })

  it('scopes every policy to authenticated and to the owner, on both sides', () => {
    expect(policies.length).toBe(8)

    for (const policy of policies) {
      expect(policy.roles, policy.name).toEqual(['authenticated'])

      if (policy.command !== 'insert') {
        expect(isOwnerScoped(policy.using), `${policy.name} USING`).toBe(true)
      }

      // USING alone would let a caller move their own log onto someone else's
      // workout.
      if (policy.command === 'insert' || policy.command === 'update') {
        expect(
          isOwnerScoped(policy.withCheck),
          `${policy.name} WITH CHECK`,
        ).toBe(true)
      }
    }
  })

  it('never widens a predicate to true', () => {
    for (const policy of policies) {
      expect(collapse(policy.using ?? ''), policy.name).not.toBe('true')
      expect(collapse(policy.withCheck ?? ''), policy.name).not.toBe('true')
    }
  })

  it('inherits ownership instead of copying it', () => {
    for (const table of EXECUTION_TABLES) {
      expect(columns[table]).not.toContain('user_id')
    }
  })

  it('closes every path an anonymous caller could take', () => {
    for (const object of [...EXECUTION_TABLES, 'session_performed']) {
      expect(statements).toMatch(
        new RegExp(
          `revoke all on public\\.${object}\\s+from anon, authenticated`,
          'i',
        ),
      )
      expect(statements).not.toMatch(
        new RegExp(`grant [^;]* on public\\.${object} to [^;]*anon`, 'i'),
      )
    }
  })
})
