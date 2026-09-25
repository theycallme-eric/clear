import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { Constants } from '../data/database.types'

// SES-01b. The three reconstructions are SQL, so their assertions are made
// against the artifact Postgres reads. The companions are
// `src/data/sessions.test.ts`, which runs the client against a double whose
// rules are transcribed from this migration, and
// `e2e/d6-swap-persistence.spec.ts`, which proves the whole thing against a
// database. These tests are what keep that transcription honest.
//
// The limit every migration test here states applies: this cannot execute SQL.
const repoRoot = resolve(import.meta.dirname, '../..')

const read = (relativePath: string) => readFileSync(resolve(repoRoot, relativePath), 'utf-8')

const MIGRATION = '20260921000009_session_reconstruction.sql'
const LIFECYCLE_MIGRATION = '20260921000005_session_lifecycle.sql'

const sql = read(`supabase/migrations/${MIGRATION}`)

/** SQL with comments removed: most of this file is prose about §7. */
const statements = sql
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')

/** One function's declaration, from its CREATE to the `$$;` that ends it. */
function body(name: string): string {
  const start = statements.indexOf(`create or replace function public.${name}(`)
  expect(start, `${name} is not declared`).toBeGreaterThan(-1)

  return statements.slice(start, statements.indexOf('$$;', start))
}

/** The three named entry points, and the builder they share. */
const NAMED = [
  'session_as_generated',
  'session_as_intended_at_start',
  'session_as_performed',
]
const FUNCTIONS = ['session_reconstruction', ...NAMED]

describe('session reconstruction migration — shape (SES-01b)', () => {
  it('runs after the lifecycle it reconstructs', () => {
    expect(MIGRATION > LIFECYCLE_MIGRATION).toBe(true)
  })

  it('is idempotent: every object is a replace or an if-not-exists', () => {
    for (const name of FUNCTIONS) {
      expect(statements, name).toContain(`create or replace function public.${name}(`)
    }
    expect(statements.match(/create function/gi) ?? []).toEqual([])
    // The enum is created inside a guarded DO block, like every other one.
    expect(statements).toContain("select 1 from pg_type where typname = 'reconstruction_kind'")
  })

  it('adds no table, no column and no index — it only reads', () => {
    expect(statements).not.toMatch(/create table/i)
    expect(statements).not.toMatch(/drop table/i)
    expect(statements).not.toMatch(/add column/i)
    expect(statements).not.toMatch(/create (unique )?index/i)
    // And it writes nothing: a reconstruction that mutated its subject would
    // be a very expensive way to lose the thing it exists to preserve.
    for (const name of FUNCTIONS) {
      const declaration = body(name)
      expect(declaration, name).toMatch(/\bstable\b/i)
      expect(declaration, name).not.toMatch(/\b(insert into|update |delete from)\b/i)
    }
  })

  it('keeps every function invoker-rights and on a pinned search_path', () => {
    for (const name of FUNCTIONS) {
      const declaration = body(name)

      expect(declaration, name).toMatch(/security invoker/i)
      expect(declaration, name).toMatch(/set search_path = ''/i)
      expect(declaration, name).not.toMatch(/security definer/i)
    }
  })

  it('grants execute to authenticated and revokes it from anon', () => {
    for (const name of FUNCTIONS) {
      expect(statements, name).toContain(`revoke all on function public.${name}(`)
      expect(statements, name).toContain(`grant execute on function public.${name}(`)
    }
    expect(statements).toContain('from public, anon')
    expect(statements).toContain('to authenticated, service_role')
  })
})

describe('the vocabulary is closed, and the generated types carry it (SES-01b)', () => {
  it('declares reconstruction_kind with §7s three states and no fourth', () => {
    expect(statements).toContain("'generated', 'intended_at_start', 'performed'")
    expect(Constants.public.Enums.reconstruction_kind).toEqual([
      'generated',
      'intended_at_start',
      'performed',
    ])
  })

  it('has one named function per kind, and no way to ask for a fourth', () => {
    // The builder takes the type, so an unknown kind is refused by the cast
    // rather than answered with an empty session.
    expect(body('session_reconstruction')).toContain('p_kind public.reconstruction_kind')

    for (const kind of Constants.public.Enums.reconstruction_kind) {
      // Every value the type admits has an arm in the CASE…
      expect(body('session_reconstruction'), kind).toContain(`when '${kind}' then`)
      // …and a function named after the question it asks.
      const named = NAMED.find((name) => name.endsWith(kind))
      expect(named, `no named function for ${kind}`).toBeDefined()
      expect(body(named as string)).toContain(`public.session_reconstruction(p_session_id, '${kind}')`)
    }
  })
})

describe('the three predicates are DATA_MODEL §7s (SES-01b)', () => {
  const builder = body('session_reconstruction')

  const arm = (kind: string, next: string | null) => {
    const start = builder.indexOf(`when '${kind}' then`)
    expect(start, `${kind} has no arm`).toBeGreaterThan(-1)
    const end = next === null ? builder.indexOf('end', start) : builder.indexOf(`when '${next}' then`, start)
    return builder.slice(start, end)
  }

  it('as generated is origin, not revision status', () => {
    // The whole `case`, so the arm boundaries are read from the same source
    // the database will read.
    const predicates = builder.slice(builder.indexOf('and case p_kind'))

    expect(predicates.slice(0, predicates.indexOf("when 'intended_at_start'"))).toContain(
      "we.origin = 'generated'",
    )
  })

  it('as intended at start is temporal, against the sessions own start', () => {
    const predicates = builder.slice(builder.indexOf('and case p_kind'))
    const intended = predicates.slice(
      predicates.indexOf("when 'intended_at_start' then"),
      predicates.indexOf("when 'performed' then"),
    )

    // §7, both halves: created at or before the start, not yet superseded at
    // it. A session that never started has a null `started_at`, so every
    // comparison is null and nothing qualifies — which is the honest answer.
    expect(intended).toContain('s.started_at is not null')
    expect(intended).toContain('we.created_at <= s.started_at')
    expect(intended).toContain('we.superseded_at > s.started_at')
    // And not the substitution that is right until the first swap after the
    // session started, and silently wrong about history forever after.
    expect(intended).not.toContain('revision_status')
  })

  it('as performed keeps what a bare join to the set logs would drop', () => {
    const predicates = builder.slice(builder.indexOf('and case p_kind'))
    const performed = predicates.slice(predicates.indexOf("when 'performed' then"))

    // Every active prescription, logged or not — which is how a skipped one
    // and a partially-logged one are both visible.
    expect(performed).toContain("we.revision_status = 'active'")
    expect(performed).toContain("we.execution_status <> 'not_started'")
    // Plus the superseded rows that carry evidence: work done before a swap
    // is still work done.
    expect(performed).toContain('from public.exercise_set_logs l')
  })

  it('every arm of the case is one of the declared kinds', () => {
    const declared = new Set<string>(Constants.public.Enums.reconstruction_kind)
    const arms = [...builder.matchAll(/when '([a-z_]+)' then/g)].map((match) => match[1])

    expect(arms.length).toBeGreaterThanOrEqual(declared.size)
    for (const kind of arms) expect(declared, kind).toContain(kind)
    // And the arms are read as a group, so `arm()` above stays usable.
    expect(arm('generated', 'intended_at_start')).toContain("we.origin = 'generated'")
  })
})

describe('one envelope, so the three can be compared (SES-01b)', () => {
  const builder = body('session_reconstruction')

  it('answers which question it answered, and at what instant', () => {
    expect(builder).toContain("'reconstruction', p_kind")
    expect(builder).toContain("'as_of'")
    // Composed at, started at, and finished at — one per kind, in that order.
    expect(builder).toContain('then s.created_at')
    expect(builder).toContain('then s.started_at')
    expect(builder).toContain('coalesce(s.completed_at, s.abandoned_at, now())')
  })

  it('carries the structure, the logs and the block results', () => {
    expect(builder).toContain("'sections'")
    expect(builder).toContain("'blocks'")
    expect(builder).toContain("'block_result'")
    expect(builder).toContain("'set_logs'")
    // Evidence follows the row it was recorded against — which is the whole of
    // D6 and the reason the reconstruction can show it at all.
    expect(builder).toContain('where l.workout_exercise_id = we.id')
  })

  it('orders two revisions of one slot by when each was written', () => {
    // The unique index covers active rows only, so an order_index is shared
    // between a superseded row and the one that replaced it.
    expect(builder).toContain('order by we.order_index, we.created_at')
  })

  it('is the only shape the three answer with', () => {
    // Each named function is a one-line delegation. If one ever grows a query
    // of its own, that is a fourth reconstruction in disguise.
    for (const name of NAMED) {
      const declaration = body(name)
      expect(declaration, name).toContain('select public.session_reconstruction(')
      expect(declaration, name).not.toContain('from public.workout_sessions')
    }
  })
})
