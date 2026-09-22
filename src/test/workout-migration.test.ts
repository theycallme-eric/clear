import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// DATA-01c. Same approach as the catalog's and the user baseline's tests: the
// schema lives in a file Postgres reads, not in the bundle, so the assertions
// are made against the shipped artefact.
//
// What this can and cannot prove. `supabase db push --dry-run` proves the CLI
// accepts the migration set against the reused live project; these tests prove
// the migration says what DATA-01c requires it to say — that the block owns
// every structure attribute and no exercise column can contradict it, that the
// target discriminator admits exactly one shape per kind, that lineage cannot
// branch, and that every workout table is owner-scoped. What they cannot do is
// execute SQL: the off-machine-backup gate in docs/backend/live-inventory.md
// forbids mutating the live project until TASK-072, and there is no local
// server to run against (ENV-04 keeps Docker out of the loop). So "the database
// rejects a malformed combination" is proven here as "the CHECK constraint that
// rejects it is declared, and admits nothing else", and behaviourally by
// ENV-07's continuous job once there is a database to run it against.
const repoRoot = resolve(import.meta.dirname, '../..')

const WORKOUT_MIGRATION = '20260921000002_workout_domain.sql'
const USER_BASELINE_MIGRATION = '20260921000001_user_baseline.sql'

const sql = readFileSync(
  resolve(repoRoot, `supabase/migrations/${WORKOUT_MIGRATION}`),
  'utf-8',
)

/**
 * SQL with comments removed. Most of this file is prose explaining what was
 * dropped and why, and prose naming `duration_mins` must not read as declaring
 * it.
 */
const statements = sql
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')

/**
 * The same SQL with string literals blanked, for the questions that have to be
 * asked of the DDL alone — `COMMENT ON` legitimately names what was retired.
 */
const ddl = statements.replace(/'(?:[^']|'')*'/g, "''")

/** The four tables this domain owns. Every one of them is user-owned. */
const WORKOUT_TABLES = [
  'workout_sessions',
  'workout_sections',
  'workout_blocks',
  'workout_exercises',
] as const

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
 * The column names a table declares. Parsed from the body's top-level lines
 * rather than grepped, because the assertion that matters most below is a
 * negative one — no exercise column carries a timer — and a grep cannot tell a
 * column it failed to find from a column that is not there.
 */
const columnsOf = (table: string) =>
  tableBody(table)
    .split('\n')
    .map((line) => /^ {2}([a-z_]+)\s+\S/.exec(line)?.[1])
    .filter((name): name is string => name !== undefined && name !== 'constraint')

const columns = Object.fromEntries(
  WORKOUT_TABLES.map((table) => [table, columnsOf(table)]),
) as Record<(typeof WORKOUT_TABLES)[number], string[]>

/** A named constraint's expression, whitespace-collapsed. */
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

/**
 * Every `CREATE POLICY` in the migration, parsed into the parts the assertions
 * ask about. A parse rather than a set of greps because the requirement is
 * about *every* policy — a nineteenth policy added later with `USING (true)`
 * has to fail these tests, and a grep for the eighteen good ones would not
 * notice it.
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
 * weaker. `workout_sessions` says so directly; everything under it walks up.
 */
const isOwnerScoped = (predicate: string | undefined) => {
  if (predicate === undefined) return false
  const p = collapse(predicate)

  if (p === 'user_id = (select auth.uid())') return true

  return (
    p.startsWith('exists (') &&
    /from public\.workout_(sessions|sections|blocks)\b/.test(p) &&
    /(s|wses)\.user_id = \(select auth\.uid\(\)\)/.test(p)
  )
}

describe('workout migration — shape (DATA-01c)', () => {
  it('creates the session, its sections, their blocks, and the exercises', () => {
    for (const table of WORKOUT_TABLES) {
      expect(
        new RegExp(
          `create table if not exists public\\.${table}\\b`,
          'i',
        ).test(statements),
      ).toBe(true)
    }
  })

  it('runs after the user baseline, whose profiles and locations it points at', () => {
    expect(WORKOUT_MIGRATION > USER_BASELINE_MIGRATION).toBe(true)
    expect(statements).toMatch(/references public\.profiles \(id\)/i)
    expect(statements).toMatch(/references public\.locations \(id\)/i)
    // And after the catalog, whose exercise_definitions a prescription names.
    expect(statements).toMatch(/references public\.exercise_definitions \(id\)/i)
  })

  it('is idempotent, so a failed push can be retried as-is', () => {
    const created = (statements.match(/create table/gi) ?? []).length
    const guarded = (statements.match(/create table if not exists/gi) ?? [])
      .length

    expect(created).toBe(WORKOUT_TABLES.length)
    expect(guarded).toBe(WORKOUT_TABLES.length)

    for (const drop of statements.match(
      /\bdrop (table|type|view|trigger|function|policy)\b[^;]*/gi,
    ) ?? []) {
      expect(drop).toMatch(/if exists/i)
    }

    for (const index of statements.match(/create (unique )?index[^;]*/gi) ?? []) {
      expect(index).toMatch(/if not exists/i)
    }

    for (const type of [
      'structure_type',
      'timer_contract',
      'rep_scheme',
      'prescription_modality',
      'target_kind',
      'distance_unit',
      'load_guidance',
      'prescription_origin',
      'revision_status',
      'execution_status',
    ]) {
      expect(statements).toMatch(
        new RegExp(
          `if not exists \\(select 1 from pg_type where typname = '${type}'\\)`,
          'i',
        ),
      )
    }
  })

  it('rebuilds the replaced tables rather than leaving the live ones standing', () => {
    // `workout_sessions`, `workout_sections` and `exercises` are Replace
    // (dispositions §1) and already exist on the reused project in their
    // previous shape. Without the drop, `create table if not exists` is a
    // no-op there and every criterion below would be true of this file and
    // false of the database.
    for (const table of ['workout_sections', 'workout_sessions']) {
      const dropAt = statements.indexOf(`drop table if exists public.${table}`)
      const createAt = statements.search(
        new RegExp(`create table if not exists public\\.${table}\\b`, 'i'),
      )

      expect(dropAt).toBeGreaterThan(-1)
      expect(dropAt).toBeLessThan(createAt)
    }

    // It drops what this domain replaces, and nothing another domain owns —
    // `exercise_set_logs`, `structure_results` and `saved_workouts` are
    // DATA-01d's and FAV-01's.
    const dropped = [
      ...statements.matchAll(/drop table if exists public\.(\w+)/gi),
    ].map(([, table]) => table)

    expect(new Set(dropped)).toEqual(
      new Set(['exercises', 'workout_sections', 'workout_sessions']),
    )
  })

  it('does not bring the old prescription table back under its old name', () => {
    expect(ddl).not.toMatch(/create table if not exists public\.exercises\b/i)
    expect(columns.workout_exercises).toContain('exercise_id')
  })
})

describe('workout migration — blocks own the structure (DATA-01c)', () => {
  it('puts every structure attribute on the block', () => {
    for (const column of [
      'structure_type',
      'rounds',
      'timer_type',
      'timer_seconds',
      'round_rest_seconds',
      'rep_scheme',
    ]) {
      expect(columns.workout_blocks).toContain(column)
    }

    expect(statements).toMatch(
      /structure_type\s+public\.structure_type\s+not null/i,
    )
    expect(statements).toMatch(
      /timer_type\s+public\.timer_contract\s+not null default 'none'/i,
    )
    expect(statements).toMatch(
      /rep_scheme\s+public\.rep_scheme\s+not null default 'fixed'/i,
    )
  })

  it('leaves no exercise column that could disagree with its block', () => {
    // The acceptance criterion, stated as the absence it actually is: three
    // exercises in one circuit cannot disagree about the timer when none of
    // them has one.
    for (const column of [
      'structure_type',
      'rounds',
      'timer_type',
      'timer_seconds',
      'round_rest_seconds',
      'rep_scheme',
      'structure',
    ]) {
      expect(columns.workout_exercises).not.toContain(column)
    }
  })

  it('sits between sections and exercises, in that order', () => {
    expect(tableBody('workout_blocks')).toMatch(
      /section_id uuid not null\s+references public\.workout_sections \(id\) on delete cascade/i,
    )
    expect(tableBody('workout_exercises')).toMatch(
      /block_id uuid not null\s+references public\.workout_blocks \(id\) on delete cascade/i,
    )
    // Nothing hangs an exercise straight off a section any more.
    expect(columns.workout_exercises).not.toContain('section_id')
  })

  it('makes a timed structure carry a clock', () => {
    const check = constraintBody('workout_blocks', 'timed_structures_have_a_clock')

    expect(check).toBeDefined()
    for (const timed of ['emom', 'amrap', 'for_time']) {
      expect(check).toContain(`'${timed}'`)
    }
    expect(check).toMatch(/timer_seconds is not null/i)
  })

  it('makes a fixed-round structure carry its rounds', () => {
    const check = constraintBody(
      'workout_blocks',
      'fixed_round_structures_have_rounds',
    )

    expect(check).toBeDefined()
    expect(check).toMatch(/structure_type <> 'circuit'/i)
    expect(check).toMatch(/rounds is not null/i)
  })
})

describe('workout migration — discriminated prescriptions (DATA-01c)', () => {
  it('discriminates modality × target_kind, with per_side and distance_unit', () => {
    expect(statements).toMatch(
      /modality\s+public\.prescription_modality not null/i,
    )
    expect(statements).toMatch(/target_kind\s+public\.target_kind not null/i)
    expect(statements).toMatch(/per_side\s+boolean not null default false/i)
    expect(statements).toMatch(/distance_unit\s+public\.distance_unit/i)

    expect(statements).toMatch(
      /create type public\.prescription_modality as enum \('reps', 'time', 'distance'\)/i,
    )
    expect(statements).toMatch(
      /create type public\.target_kind as enum \('fixed', 'range', 'sequence'\)/i,
    )
    expect(statements).toMatch(
      /create type public\.distance_unit as enum \('m', 'km', 'ft', 'mi'\)/i,
    )

    // `rounds` is not a modality: the block is what repeats.
    expect(statements).not.toMatch(
      /create type public\.prescription_modality as enum \([^)]*'rounds'/i,
    )
  })

  it('keeps {8,10} as a range and {8,10} as a two-rung sequence apart', () => {
    const shape = constraintBody('workout_exercises', 'target_shape')
    expect(shape).toBeDefined()

    const branch = (kind: string) => {
      const at = shape!.indexOf(`target_kind = '${kind}'`)
      expect(at, `${kind} has no branch`).toBeGreaterThan(-1)
      const rest = shape!.slice(at)
      const next = rest.search(/\bor \(target_kind/)
      return next === -1 ? rest : rest.slice(0, next)
    }

    // A range populates min and max and nothing else…
    const range = branch('range')
    expect(range).toMatch(/target_min is not null/i)
    expect(range).toMatch(/target_max is not null/i)
    expect(range).toMatch(/target_max > target_min/i)
    expect(range).toMatch(/target_value is null/i)
    expect(range).toMatch(/target_sequence is null/i)

    // …a sequence populates the array and nothing else, with more than one
    // rung, because a one-rung ladder is a fixed target wearing a costume.
    const sequence = branch('sequence')
    expect(sequence).toMatch(/target_sequence is not null/i)
    expect(sequence).toMatch(/array_length\(target_sequence, 1\) > 1/i)
    expect(sequence).toMatch(/target_value is null/i)
    expect(sequence).toMatch(/target_min is null/i)
    expect(sequence).toMatch(/target_max is null/i)

    // …and a fixed target is one number.
    const fixed = branch('fixed')
    expect(fixed).toMatch(/target_value is not null/i)
    expect(fixed).toMatch(/target_min is null/i)
    expect(fixed).toMatch(/target_max is null/i)
    expect(fixed).toMatch(/target_sequence is null/i)

    // Every kind is accounted for. A fourth value added to the enum without a
    // branch here would be rejected by the constraint, not silently admitted.
    expect((shape!.match(/target_kind = '/g) ?? []).length).toBe(3)
  })

  it('rejects the malformed combinations the generation contract also rejects', () => {
    const distance = constraintBody('workout_exercises', 'distance_has_unit')
    expect(distance).toMatch(/modality <> 'distance' or distance_unit is not null/i)

    const load = constraintBody('workout_exercises', 'load_value_matches_type')
    expect(load).toMatch(
      /load_type in \('bodyweight', 'prior_session', 'none'\)/i,
    )
    expect(load).toMatch(/load_value is not null/i)
  })
})

describe('workout migration — lineage (DATA-01c)', () => {
  it('threads a slot through its revisions', () => {
    expect(tableBody('workout_exercises')).toMatch(/slot_id\s+uuid not null/i)
    expect(tableBody('workout_exercises')).toMatch(
      /replaces_id\s+uuid references public\.workout_exercises \(id\)/i,
    )
    expect(statements).toMatch(
      /create type public\.prescription_origin as enum \('generated', 'revised'\)/i,
    )
  })

  it('will not let lineage branch', () => {
    expect(constraintBody('workout_exercises', 'one_successor')).toMatch(
      /\(replaces_id\)/i,
    )
    expect(tableBody('workout_exercises')).toMatch(
      /constraint one_successor unique \(replaces_id\)/i,
    )
  })

  it('keeps ordering unique among active rows only', () => {
    // A plain UNIQUE (block_id, order_index) would make a swap impossible: the
    // superseded row and its replacement occupy the same position, which is
    // the point of the slot.
    expect(statements).not.toMatch(
      /constraint \w+ unique \(block_id, order_index\)/i,
    )
    expect(statements).toMatch(
      /create unique index if not exists \w+\s+on public\.workout_exercises \(block_id, order_index\)\s+where revision_status = 'active'/i,
    )
    expect(statements).toMatch(
      /create unique index if not exists \w+\s+on public\.workout_exercises \(slot_id\)\s+where revision_status = 'active'/i,
    )
  })

  it('keeps revision and execution as independent columns', () => {
    expect(columns.workout_exercises).toContain('revision_status')
    expect(columns.workout_exercises).toContain('execution_status')

    expect(statements).toMatch(
      /revision_status\s+public\.revision_status\s+not null default 'active'/i,
    )
    expect(statements).toMatch(
      /execution_status\s+public\.execution_status not null default 'not_started'/i,
    )

    // Two types, neither of which can express the other's states — so marking
    // a completed exercise superseded cannot overwrite the fact that it was
    // performed.
    expect(statements).toMatch(
      /create type public\.revision_status as enum \('active', 'superseded'\)/i,
    )
    expect(statements).toMatch(
      /create type public\.execution_status as enum \(\s*'not_started', 'completed', 'skipped'\s*\)/i,
    )
    expect(statements).not.toMatch(
      /create type public\.execution_status as enum \([^)]*'superseded'/i,
    )
  })

  it('places every superseded row on the timeline', () => {
    const check = constraintBody('workout_exercises', 'superseded_has_timestamp')

    expect(check).toMatch(
      /revision_status = 'active' and superseded_at is null/i,
    )
    expect(check).toMatch(
      /revision_status = 'superseded' and superseded_at is not null/i,
    )
  })

  it('never deletes a prescription row, because the logs point at it', () => {
    const exercisePolicies = policies.filter(
      (policy) => policy.table === 'workout_exercises',
    )

    expect(exercisePolicies.map((policy) => policy.command).sort()).toEqual([
      'insert',
      'select',
      'update',
    ])
    expect(statements).not.toMatch(
      /grant [^;]*delete[^;]* on public\.workout_exercises to authenticated/i,
    )
  })
})

describe('workout migration — the session (DATA-01c)', () => {
  it('gives duration four unambiguous fields', () => {
    for (const column of [
      'requested_duration_mins',
      'effective_duration_target_mins',
      'computed_duration_mins',
      'actual_duration_mins',
    ]) {
      expect(columns.workout_sessions).toContain(column)
    }

    // What was asked for and what was targeted are known at write time; what
    // was computed and what elapsed are not.
    expect(statements).toMatch(/requested_duration_mins\s+int not null/i)
    expect(statements).toMatch(/effective_duration_target_mins int not null/i)
    expect(statements).toMatch(/computed_duration_mins\s+int,/i)
    expect(statements).toMatch(/actual_duration_mins\s+int,/i)

    // And the one overloaded column they replace does not come back.
    expect(columns.workout_sessions).not.toContain('duration_mins')
    expect(columns.workout_sessions).not.toContain('time_target_mins')
  })

  it('records the prompt and contract that produced it', () => {
    expect(statements).toMatch(/prompt_version\s+text not null/i)
    expect(statements).toMatch(/contract_version text not null/i)
  })

  it('carries the timestamp the intended-at-start reconstruction pivots on', () => {
    expect(columns.workout_sessions).toContain('started_at')
    expect(constraintBody(
      'workout_sessions',
      'workout_sessions_completed_after_started',
    )).toMatch(/started_at is not null and completed_at >= started_at/i)
  })

  it('leaves the retired session vocabulary behind', () => {
    // `anchor_type` held three concepts at once; the session-level one is
    // `session_focus`. `mood` was TEXT for a 1–5 rating.
    expect(columns.workout_sessions).toContain('session_focus')
    expect(columns.workout_sessions).not.toContain('anchor')
    expect(ddl).not.toMatch(/anchor_type/i)

    expect(statements).toMatch(/mood\s+smallint/i)
    expect(constraintBody('workout_sessions', 'workout_sessions_mood_range')).toMatch(
      /mood between 1 and 5/i,
    )

    // Streak is derived from these rows, never stored on them.
    for (const column of [
      'streak_count',
      'streak_status',
      'consecutive_rest_days',
    ]) {
      expect(columns.workout_sessions).not.toContain(column)
    }
  })
})

describe('workout migration — row-level security (DATA-01c)', () => {
  it('enables RLS on every table it creates', () => {
    for (const table of WORKOUT_TABLES) {
      expect(statements).toMatch(
        new RegExp(
          `alter table public\\.${table}\\s+enable row level security`,
          'i',
        ),
      )
    }
  })

  it('declares a policy for every command it grants, and no others', () => {
    const declared = new Set(
      policies.map((policy) => `${policy.table}.${policy.command}`),
    )

    for (const table of WORKOUT_TABLES) {
      for (const command of ['select', 'insert', 'update']) {
        expect(declared.has(`${table}.${command}`)).toBe(true)
      }
    }

    // Delete is owner-scoped where it exists, and absent on prescriptions.
    expect(declared.has('workout_sessions.delete')).toBe(true)
    expect(declared.has('workout_exercises.delete')).toBe(false)
  })

  it('scopes every policy to authenticated and to the owner, on both sides', () => {
    expect(policies.length).toBeGreaterThan(0)

    for (const policy of policies) {
      expect(policy.roles, policy.name).toEqual(['authenticated'])

      if (policy.command !== 'insert') {
        expect(isOwnerScoped(policy.using), `${policy.name} USING`).toBe(true)
      }

      // USING alone would let a caller rewrite their own row into someone
      // else's workout.
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
    // A denormalized user_id on a section, block or exercise could disagree
    // with the session it hangs from, and then two rows would answer "who owns
    // this" differently.
    for (const table of [
      'workout_sections',
      'workout_blocks',
      'workout_exercises',
    ] as const) {
      expect(columns[table]).not.toContain('user_id')
    }

    expect(columns.workout_sessions).toContain('user_id')
  })

  it('closes every path an anonymous caller could take', () => {
    for (const table of WORKOUT_TABLES) {
      expect(statements).toMatch(
        new RegExp(
          `revoke all on public\\.${table}\\s+from anon, authenticated`,
          'i',
        ),
      )
      expect(statements).not.toMatch(
        new RegExp(`grant [^;]* on public\\.${table} to [^;]*anon`, 'i'),
      )
    }
  })
})
