import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// DATA-05. Same approach as the catalog's and the baseline's tests: the schema
// lives in a file Postgres reads, not in the bundle, so the assertions are made
// against the shipped artefact.
//
// What this can and cannot prove. It proves the migration says what DATA-05
// requires it to say — three scopes and no fourth, targets that cannot
// disagree with their scope, a session-scoped row that names its session, RLS
// that is owner-only on both sides, and a filter that is written once in SQL
// rather than reimplemented per caller. It cannot execute SQL: the
// off-machine-backup gate in docs/backend/live-inventory.md holds any push to
// the live project until TASK-072, and ENV-04 keeps Docker out of the loop.
// The behavioural proof against a database is ENV-07's continuous job.
const repoRoot = resolve(import.meta.dirname, '../..')

const read = (relativePath: string) =>
  readFileSync(resolve(repoRoot, relativePath), 'utf-8')

const CONSTRAINTS_MIGRATION = '20260921000002_user_constraints.sql'
const USER_BASELINE_MIGRATION = '20260921000001_user_baseline.sql'
const sql = read(`supabase/migrations/${CONSTRAINTS_MIGRATION}`)

/**
 * SQL with comments removed. Most of this file is prose — including the
 * eligibility fragment GEN-01 composes — and prose naming `workout_sessions`
 * must not read as declaring a reference to it.
 */
const statements = sql
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')

/** The same SQL with string literals blanked, for "is this declared?". */
const ddl = statements.replace(/'(?:[^']|'')*'/g, "''")

/** The table body, which is where every CHECK has to be. */
const table = statements
  .slice(statements.indexOf('create table if not exists public.user_constraints'))
  .split(');')[0]

describe('user constraints migration — shape (DATA-05)', () => {
  it('creates the table DATA-01b left out', () => {
    expect(statements).toMatch(
      /create table if not exists public\.user_constraints\b/i,
    )
    expect(CONSTRAINTS_MIGRATION > USER_BASELINE_MIGRATION).toBe(true)
    // It hangs off the profile, which cascades from auth.users.
    expect(table).toMatch(
      /user_id uuid not null references public\.profiles \(id\) on delete cascade/i,
    )
  })

  it('is idempotent, so a failed push can be retried as-is', () => {
    expect((statements.match(/create table/gi) ?? []).length).toBe(1)
    expect((statements.match(/create table if not exists/gi) ?? []).length).toBe(1)

    expect(statements).not.toMatch(/create function/i)
    for (const drop of statements.match(/\bdrop (table|trigger|function|policy)\b[^;]*/gi) ??
      []) {
      expect(drop).toMatch(/if exists/i)
    }
    for (const index of statements.match(/create (unique )?index[^;]*/gi) ?? []) {
      expect(index).toMatch(/if not exists/i)
    }

    for (const type of [
      'constraint_scope',
      'constraint_action',
      'constraint_persistence',
    ]) {
      expect(statements).toMatch(
        new RegExp(
          `if not exists \\(\\s*select 1 from pg_type where typname = '${type}'\\s*\\)`,
          'i',
        ),
      )
    }
  })

  it('drops nothing — this domain has no predecessor to replace', () => {
    expect(statements).not.toMatch(/drop table/i)
  })

  it('carries three scopes, and no impact scope', () => {
    expect(statements).toMatch(
      /create type public\.constraint_scope as enum \(\s*'exercise', 'movement_pattern', 'equipment'\s*\)/i,
    )
    // CLEAR does not model injuries, and nothing in the catalog could enforce
    // an impact exclusion — so the value does not exist to be written.
    expect(ddl).not.toMatch(/\bimpact\b/i)
  })

  it('carries all three actions, hard and soft', () => {
    expect(statements).toMatch(
      /create type public\.constraint_action as enum \(\s*'exclude', 'avoid', 'prefer_not'\s*\)/i,
    )
  })

  it('carries the two durations', () => {
    expect(statements).toMatch(
      /create type public\.constraint_persistence as enum \('session', 'persistent'\)/i,
    )
    expect(table).toMatch(
      /persistence public\.constraint_persistence not null default 'persistent'/i,
    )
  })
})

describe('user constraints migration — a target cannot lie (DATA-05)', () => {
  it('holds exactly one target, checked by the database', () => {
    expect(table).toMatch(
      /check \(\s*num_nonnulls\(target_exercise_id, target_pattern, target_equipment\) = 1\s*\)/i,
    )
  })

  it('makes the populated target the one the scope names', () => {
    const constraint = table.slice(
      table.indexOf('user_constraints_target_matches_scope'),
    )

    for (const [scope, column] of [
      ['exercise', 'target_exercise_id'],
      ['movement_pattern', 'target_pattern'],
      ['equipment', 'target_equipment'],
    ]) {
      expect(constraint).toMatch(
        new RegExp(`scope = '${scope}'\\s*and ${column}\\s*is not null`, 'i'),
      )
    }
  })

  it('takes its vocabulary from the catalog rather than restating it', () => {
    // An exercise id the catalog does not have is not a constraint anyone can
    // act on, so the database refuses it.
    expect(table).toMatch(
      /target_exercise_id text references public\.exercise_definitions \(id\)/i,
    )
    // The pattern is the catalog's enum, not text with a CHECK.
    expect(table).toMatch(/target_pattern\s+public\.movement_pattern/i)
    // Equipment is text because DATA-01a models equipment as ids inside
    // exercise_definitions.equipment_options — there is no table to point at.
    expect(table).toMatch(/target_equipment\s+text/i)
    expect(table).toMatch(/check \(\s*target_equipment is null or btrim\(target_equipment\) <> ''\s*\)/i)
  })

  it('refuses the same exclusion twice', () => {
    expect(statements).toMatch(
      /create unique index if not exists user_constraints_no_duplicates_idx/i,
    )
    // The sentinel is what makes it work: NULLs in a unique index do not
    // collide, so two identical persistent rows would both be allowed.
    expect(statements).toMatch(
      /coalesce\(applies_to_session_id, '00000000-0000-0000-0000-000000000000'::uuid\)/i,
    )
  })
})

describe('user constraints migration — the session leak (DATA-05)', () => {
  it('makes a session-scoped row name its session', () => {
    expect(table).toMatch(
      /check \(\s*persistence = 'persistent' or applies_to_session_id is not null\s*\)/i,
    )
  })

  it('does not reference a table another issue owns', () => {
    // DATA_MODEL §5 declares an FK to workout_sessions. That table is
    // DATA-01c's: it does not exist on an empty project, and the table of that
    // name on the reused project is the previous application's, which DATA-01c
    // drops and rebuilds — an FK declared here would go with it silently. The
    // column ships with its semantics enforced and DATA-01c adds the FK.
    expect(table).toMatch(/applies_to_session_id uuid,/i)
    expect(ddl).not.toMatch(/references public\.workout_sessions/i)
    // And the deferral is stated where a reader of the schema finds it.
    expect(sql).toMatch(
      /comment on column public\.user_constraints\.applies_to_session_id is[\s\S]*?DATA-01c/i,
    )
  })

  it('filters by session in SQL, once, where every caller reads it', () => {
    const fn = statements.slice(
      statements.indexOf('create or replace function public.constraints_in_force'),
    )
    const body = fn.slice(0, fn.indexOf('$$;'))

    expect(body).toMatch(/returns setof public\.user_constraints/i)
    expect(body).toMatch(
      /c\.persistence = 'persistent' or c\.applies_to_session_id = p_session_id/i,
    )
    // Deterministic order: the same constraint set every run.
    expect(body).toMatch(/order by c\.created_at, c\.id/i)
  })

  it('narrows equipment rather than rejecting the exercise', () => {
    const fn = statements.slice(
      statements.indexOf('create or replace function public.usable_equipment'),
    )
    const body = fn.slice(0, fn.indexOf('$$;'))

    expect(body).toMatch(/returns text\[\]/i)
    // Availability and exclusion, and the exclusion is read through the
    // in-force filter — so a session-scoped equipment exclusion expires too.
    expect(body).toMatch(/o\.equipment_id = any \(p_available\)/i)
    expect(body).toMatch(
      /from public\.constraints_in_force\(p_user_id, p_session_id\) c/i,
    )
    expect(body).toMatch(/c\.action = 'exclude'/i)
    expect(body).toMatch(/c\.scope = 'equipment'/i)
    // Sorted, so the candidate handed to Claude is the same on every run.
    expect(body).toMatch(/array_agg\(o\.equipment_id order by o\.equipment_id\)/i)
  })

  it('leaves the soft actions unfiltered', () => {
    // Nothing in the file filters on `avoid` or `prefer_not`: they persist and
    // reach Claude through the same function, as context.
    expect(ddl).not.toMatch(/(where|and)[^;]*action = ''avoid''/i)
    for (const match of statements.match(/action = '(\w+)'/g) ?? []) {
      expect(match).toBe("action = 'exclude'")
    }
  })
})

describe('user constraints migration — free text stays text (DATA-05)', () => {
  it('stores the note and never parses it', () => {
    expect(table).toMatch(/note text,/i)

    // No trigger reads it, and nothing in the file inspects its contents. A
    // LIKE, a regex, or a to_tsvector over `note` would be a constraint
    // inferred from prose, which is the thing DATA-05 exists to replace.
    expect(statements).not.toMatch(/create trigger/i)
    expect(ddl).not.toMatch(/note\s*(~|like|ilike|similar to)/i)
    expect(ddl).not.toMatch(/to_tsvector|regexp_\w+|position\(/i)
    expect(sql).toMatch(
      /comment on column public\.user_constraints\.note is[\s\S]*?inferred/i,
    )
  })
})

describe('user constraints migration — owner-only RLS (DATA-05)', () => {
  const policies = [
    ...statements.matchAll(
      /create policy (\w+) on public\.user_constraints\s+for (\w+) to ([\w, ]+?)\s*(?=using|with check)((?:.|\n)*?);\s*\n/gi,
    ),
  ].map(([, name, command, roles, body]) => ({
    name,
    command: command.toLowerCase(),
    roles: roles.split(',').map((role) => role.trim()),
    using: /\busing\s*\(((?:.|\n)*?)\)\s*(?:with check|$)/i.exec(body)?.[1].trim(),
    withCheck: /\bwith check\s*\(((?:.|\n)*)\)\s*$/i.exec(body)?.[1].trim(),
  }))

  const OWNER = 'user_id = (select auth.uid())'

  it('enables row-level security on the table', () => {
    expect(statements).toMatch(
      /alter table public\.user_constraints enable row level security/i,
    )
  })

  it('declares a policy for every command, scoped to the owner on both sides', () => {
    expect(new Set(policies.map((policy) => policy.command))).toEqual(
      // DELETE, unlike profiles: removing a constraint is how a user changes
      // their mind, and the row leaves no hole behind.
      new Set(['select', 'insert', 'update', 'delete']),
    )

    for (const policy of policies) {
      expect(policy.roles).toEqual(['authenticated'])

      if (policy.command === 'insert') {
        expect(policy.using).toBeUndefined()
        expect(policy.withCheck).toBe(OWNER)
      } else if (policy.command === 'update') {
        expect(policy.using).toBe(OWNER)
        expect(policy.withCheck).toBe(OWNER)
      } else {
        expect(policy.using).toBe(OWNER)
        expect(policy.withCheck).toBeUndefined()
      }
    }

    expect(statements).not.toMatch(/using \(true\)/i)
  })

  it('evaluates auth.uid() once per statement, not once per row', () => {
    expect(statements).not.toMatch(/(?<!\(select )auth\.uid\(\)/)
  })

  it('never opens the table to anon', () => {
    expect(statements).toMatch(
      /revoke all on public\.user_constraints from anon, authenticated/i,
    )
    expect(statements).toMatch(
      /grant select, insert, update, delete on public\.user_constraints to authenticated/i,
    )
    expect(statements).toMatch(
      /grant all on public\.user_constraints to service_role/i,
    )
    expect(statements).not.toMatch(/grant [\w, ]*on public\.\w+ to [\w, ]*anon/i)
  })

  it('keeps RLS deciding what the filter functions can see', () => {
    const functions =
      statements.match(/create or replace function[\s\S]*?\$\$;/gi) ?? []

    expect(functions).toHaveLength(2)
    for (const fn of functions) {
      // INVOKER, not DEFINER: passing a user id must not be a way around the
      // policies above.
      expect(fn).toMatch(/security invoker/i)
      expect(fn).toMatch(/set search_path = ''/)
      expect(fn).toMatch(/\bstable\b/i)
    }
    expect(statements).not.toMatch(/security definer/i)
  })
})
