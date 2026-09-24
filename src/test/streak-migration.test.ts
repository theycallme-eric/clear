import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { REPO_ROOT, migrationFiles, readSchema } from '../../scripts/gen-types/schema.mjs'

// SES-01c. Two claims are asserted here, and only one of them is about the
// file this migration adds.
//
// The first is ordinary: `streak_sessions(...)` reads what it says it reads,
// in the order and with the bounds `src/data/streak.ts` relies on.
//
// The second is the requirement's own, and it is a negative: **no streak
// column exists anywhere in this schema.** The old app stored six, and they
// drifted. A negative like that cannot be proved by reading the migration that
// was just written — it has to be asked of every migration in the tree, which
// is what the generator's own SQL reader is used for below. A future migration
// that adds `streak_count` back fails this test wherever it is added.

const MIGRATION = '20260921000006_streak_sessions.sql'
const WORKOUT_MIGRATION = '20260921000002_workout_domain.sql'

const read = (path: string) => readFileSync(join(REPO_ROOT, path), 'utf8')

const sql = read(`supabase/migrations/${MIGRATION}`)

/** SQL with the prose removed: most of this file explains itself. */
const statements = sql
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')

/** The function declaration, from its CREATE to the `$$;` that ends it. */
const fn = (() => {
  const start = statements.indexOf('create or replace function public.streak_sessions(')
  expect(start, 'streak_sessions is not declared').toBeGreaterThan(-1)

  return statements.slice(start, statements.indexOf('$$;', start))
})()

/** Everything after the `where`, which is where a filter would have to be. */
const predicate = fn.slice(fn.indexOf('where'))

describe('streak migration — shape (SES-01c)', () => {
  it('is in the series, after the table it reads', () => {
    expect(migrationFiles()).toContain(MIGRATION)
    expect(MIGRATION > WORKOUT_MIGRATION).toBe(true)
  })

  it('is idempotent: a replace and a guarded index, nothing else', () => {
    expect(statements).toContain('create or replace function public.streak_sessions(')
    expect(statements.match(/create function/gi) ?? []).toEqual([])
    expect(statements.match(/create index if not exists/gi) ?? []).toHaveLength(1)
    expect(statements.match(/create (unique )?index/gi) ?? []).toHaveLength(1)
  })

  it('adds no table, no column and no view — it is a read', () => {
    expect(statements).not.toMatch(/create table/i)
    expect(statements).not.toMatch(/add column/i)
    expect(statements).not.toMatch(/create (or replace )?view/i)
    expect(statements).not.toMatch(/drop /i)
  })

  it('writes nothing', () => {
    // A derived number that is stored somewhere on the way past is the exact
    // failure mode this requirement exists to prevent.
    expect(statements).not.toMatch(/\binsert\b/i)
    expect(statements).not.toMatch(/\bupdate\b/i)
    expect(statements).not.toMatch(/\bdelete\b/i)
  })
})

describe('streak_sessions() — the read a streak is derived from (SES-01c)', () => {
  it('runs as the caller, so owner-only RLS is what answers', () => {
    expect(fn).toMatch(/security invoker/i)
    expect(fn).toMatch(/set search_path = ''/i)
    // Stable, not volatile: it is a read, and a read inside one statement
    // should see one snapshot.
    expect(fn).toMatch(/\bstable\b/i)
  })

  it('returns completed sessions for one user, newest first', () => {
    expect(predicate).toMatch(/s\.user_id = p_user_id/i)
    expect(predicate).toMatch(/s\.completed_at is not null/i)
    expect(fn).toMatch(/order by s\.completed_at desc/i)
  })

  it('pages with an exclusive cursor, so no row is read twice', () => {
    expect(predicate).toMatch(/p_before is null or s\.completed_at < p_before/i)
  })

  it('bounds the page rather than trusting the caller', () => {
    expect(fn).toMatch(/limit least\(greatest\(coalesce\(p_limit, 200\), 1\), 1000\)/i)
  })

  it('returns counts_for_streak instead of applying it', () => {
    // Which sessions count is a rule HOME-02 extends, in one place, in
    // TypeScript. Half of it applied here would be a second answer.
    expect(fn).toMatch(/s\.counts_for_streak/i)
    expect(predicate).not.toMatch(/counts_for_streak/i)
  })

  it('counts nothing and buckets no days', () => {
    // No aggregate, and no time zone: the day boundary is the user's, and
    // this database is not told which one that is (REQ-041).
    expect(fn).not.toMatch(/\bcount\s*\(/i)
    expect(fn).not.toMatch(/\bsum\s*\(/i)
    expect(fn).not.toMatch(/group by/i)
    expect(fn).not.toMatch(/at time zone/i)
    expect(fn).not.toMatch(/date_trunc/i)
    expect(fn).not.toMatch(/generate_series/i)
    expect(fn).not.toMatch(/::date/i)
  })

  it('is indexed the way it is read', () => {
    expect(statements).toMatch(
      /create index if not exists workout_sessions_completed_idx\s+on public\.workout_sessions \(user_id, completed_at desc\)\s+where completed_at is not null/i,
    )
  })

  it('cannot be called by an anonymous or public role', () => {
    expect(statements).toMatch(
      /revoke all on function public\.streak_sessions\(uuid, timestamptz, integer\)\s+from public, anon/i,
    )
    expect(statements).toMatch(
      /grant execute on function public\.streak_sessions\(uuid, timestamptz, integer\)\s+to authenticated, service_role/i,
    )
  })
})

describe('no streak is stored anywhere in the schema (SES-01c)', () => {
  const schema = readSchema()

  /** Every column the migration series declares, as `table.column`. */
  const columns = schema.tables.flatMap((table) =>
    table.columns.map((column) => `${table.name}.${column.name}`),
  )

  it('declares no column whose name is a streak', () => {
    // `counts_for_streak` is the one permitted match, and it is not derived
    // state: it is a per-session flag the derivation reads, written once when
    // the session is, and incapable of disagreeing with a count nothing holds.
    const streakish = columns.filter((column) => /streak/i.test(column))

    expect(streakish).toEqual(['workout_sessions.counts_for_streak'])
  })

  it('brings back none of the six columns that drifted', () => {
    // The old `profiles` carried all of these (docs/reference/OLD_APP_SUMMARY).
    for (const retired of [
      'streak_count',
      'streak_status',
      'streak_pause_reason',
      'streak_start_date',
      'streak_pause_start',
      'consecutive_rest_days',
    ]) {
      expect(columns.filter((column) => column.endsWith(`.${retired}`))).toEqual([])
    }
  })

  it('declares no table or view that is a streak by another name', () => {
    expect(schema.tables.map((table) => table.name).filter((name) => /streak/i.test(name)))
      .toEqual([])
    expect(schema.views.filter((name: string) => /streak/i.test(name))).toEqual([])
  })

  it('has exactly one streak function, and it returns sessions', () => {
    const streakFunctions = schema.functions.filter((fun) => /streak/i.test(fun.name))

    expect(streakFunctions.map((fun) => fun.name)).toEqual(['streak_sessions'])
    // Rows, not a number. A function that answered `integer` would be a
    // stored streak with extra steps — recomputed per call, but still the
    // database's answer rather than a derivation anyone can read.
    expect(streakFunctions[0].returns).toBe('table')
    expect(streakFunctions[0].columns?.map((column) => column.name)).toEqual([
      'session_id',
      'completed_at',
      'counts_for_streak',
    ])
  })
})
