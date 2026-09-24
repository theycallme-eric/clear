import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// SES-01a. The lifecycle is SQL, so its assertions are made against the
// artifact Postgres reads. The companion is `src/data/sessions.test.ts`, which
// runs the client against a double whose rules are transcribed from this
// migration — these tests are what keep that transcription honest.
//
// The limit every migration test here states applies: this cannot execute SQL.
// The off-machine-backup gate in docs/backend/live-inventory.md holds any push
// to the reused project until TASK-072, and ENV-04 keeps Docker out of the
// loop. The behavioural proof against a database is ENV-07's job.
const repoRoot = resolve(import.meta.dirname, '../..')

const read = (relativePath: string) => readFileSync(resolve(repoRoot, relativePath), 'utf-8')

const MIGRATION = '20260921000005_session_lifecycle.sql'
const WORKOUT_MIGRATION = '20260921000002_workout_domain.sql'
const EXECUTION_MIGRATION = '20260921000003_execution_domain.sql'

const sql = read(`supabase/migrations/${MIGRATION}`)

/** SQL with comments removed: most of this file is prose about the lifecycle. */
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

const FUNCTIONS = [
  'session_state',
  'insert_prescription',
  'persist_session',
  'session_snapshot',
  'resume_session',
  'start_session',
  'complete_session',
  'abandon_session',
  'swap_session_exercise',
]

describe('session lifecycle migration — shape (SES-01a)', () => {
  it('runs after the tables it writes', () => {
    expect(MIGRATION > WORKOUT_MIGRATION).toBe(true)
    expect(MIGRATION > EXECUTION_MIGRATION).toBe(true)
  })

  it('is idempotent: every object is a replace or an if-not-exists', () => {
    for (const name of FUNCTIONS) {
      expect(statements, name).toContain(`create or replace function public.${name}(`)
    }
    expect((statements.match(/create function/gi) ?? [])).toEqual([])
    expect(statements).toContain('add column if not exists abandoned_at')
    // Both indexes, and both of them guarded: a retried push is a no-op.
    expect((statements.match(/create (unique )?index/gi) ?? [])).toHaveLength(2)
    expect((statements.match(/create unique index if not exists/gi) ?? [])).toHaveLength(1)
    expect((statements.match(/create index if not exists/gi) ?? [])).toHaveLength(1)
  })

  it('adds no table and drops nothing', () => {
    // The tables are DATA-01c's and DATA-01d's. This migration adds verbs.
    expect(statements).not.toMatch(/create table/i)
    expect(statements).not.toMatch(/drop table/i)
    expect(statements).not.toMatch(/drop column/i)
  })

  it('keeps every function invoker-rights and on a pinned search_path', () => {
    for (const name of FUNCTIONS) {
      const declaration = body(name)

      // SECURITY INVOKER: owner-only RLS still decides what a caller sees and
      // writes, and the explicit user id is not a way around it.
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
    expect(statements).not.toMatch(/to anon/i)
  })
})

describe('abandoning is a state, not a delete (SES-01a)', () => {
  it('adds abandoned_at rather than deleting the row', () => {
    expect(statements).toContain('add column if not exists abandoned_at timestamptz')
    // Nothing in this file removes a session, a section, a block, an exercise
    // or a log. That is the whole distinction.
    expect(statements).not.toMatch(/delete from/i)
  })

  it('refuses a session that is both completed and abandoned', () => {
    expect(statements).toContain('workout_sessions_not_both_completed_and_abandoned')
    expect(statements).toContain('check (completed_at is null or abandoned_at is null)')
  })

  it('lets a session be abandoned before it was ever started', () => {
    // A generated workout the user walked away from is a real thing, so the
    // constraint is against `created_at`, not `started_at`.
    expect(statements).toContain('check (abandoned_at is null or abandoned_at >= created_at)')
  })

  it('reaches abandoned from either non-terminal state', () => {
    expect(body('abandon_session')).toContain("v_state not in ('prescribed', 'active')")
  })
})

describe('exactly one active session per user (SES-01a)', () => {
  it('is a partial unique index, not a check the client makes', () => {
    expect(statements).toContain(
      'create unique index if not exists workout_sessions_one_active_idx',
    )
    expect(statements).toMatch(
      /on public\.workout_sessions \(user_id\)\s+where started_at is not null\s+and completed_at is null\s+and abandoned_at is null/,
    )
  })

  it('answers the concurrent loser with an outcome rather than an exception', () => {
    const declaration = body('start_session')

    // Two callers can pass the pre-check; only one can pass the index. The
    // loser is caught here, so "a typed error, not a race" holds either way.
    expect(declaration).toMatch(/exception\s+when unique_violation then/)
    expect(declaration).toContain("'outcome', 'already_active'")
  })

  it('locks the row it is deciding about', () => {
    for (const name of ['start_session', 'complete_session', 'abandon_session']) {
      expect(body(name), name).toContain('for update')
    }
  })
})

describe('acceptance is one transaction (SES-01a)', () => {
  it('writes all four levels from one function', () => {
    const declaration = body('persist_session')

    expect(declaration).toContain('insert into public.workout_sessions')
    expect(declaration).toContain('insert into public.workout_sections')
    expect(declaration).toContain('insert into public.workout_blocks')
    // Exercises go through the shared prescription insert, so acceptance and a
    // swap cannot drift a column apart.
    expect(declaration).toContain('public.insert_prescription(')
  })

  it('orders every level by its place in the payload', () => {
    const declaration = body('persist_session')

    expect(declaration).toContain('v_section_index := v_section_index + 1')
    expect(declaration).toContain('v_block_index := v_block_index + 1')
    expect(declaration).toContain('v_exercise_index := v_exercise_index + 1')
    // An `order_index` the model supplied could repeat, and a UNIQUE
    // constraint would then abort a workout half-written.
    expect(declaration).not.toMatch(/->> 'order_index'/)
  })

  it('mints a slot per prescription and marks the lineage generated', () => {
    expect(body('persist_session')).toMatch(/gen_random_uuid\(\), null,\s*'generated'/)
  })

  it('raises rather than persisting a payload with no workout in it', () => {
    // A raise inside the function aborts the whole transaction, which is what
    // "a failure leaves nothing behind" is made of.
    expect(body('persist_session')).toContain("jsonb_typeof(v_workout -> 'sections') <> 'array'")
    expect(body('persist_session')).toMatch(/raise exception/)
  })
})

describe('a swap appends and supersedes (SES-01a, defect D6)', () => {
  const declaration = body('swap_session_exercise')

  it('carries the slot forward and points back at its predecessor', () => {
    expect(declaration).toMatch(/v_outgoing\.slot_id,\s*v_outgoing\.id,\s*'revised'/)
  })

  it('supersedes before it inserts', () => {
    // `workout_exercises_active_order_idx` is unique over active rows in a
    // block, so the outgoing row has to stop being active first.
    const supersede = declaration.indexOf("set revision_status = 'superseded'")
    const insert = declaration.indexOf('public.insert_prescription(')

    expect(supersede).toBeGreaterThan(-1)
    expect(insert).toBeGreaterThan(supersede)
  })

  it('never touches execution_status', () => {
    // Collapsing revision and execution would overwrite `completed` with
    // "replaced" on a row that was genuinely performed (DATA_MODEL §7).
    expect(declaration).not.toMatch(/set[^;]*execution_status/i)
  })

  it('refuses only on a terminal session, leaving the after-start question open', () => {
    expect(declaration).toContain("v_state not in ('prescribed', 'active')")
  })
})

describe('completion and resumption (SES-01a)', () => {
  it('writes both halves of a completion', () => {
    const declaration = body('complete_session')

    expect(declaration).toContain('set completed_at = now()')
    expect(declaration).toContain('actual_duration_mins = coalesce(')
    // The caller's own number wins when it has one: only the client knows the
    // workout was interrupted.
    expect(declaration).toContain('p_actual_duration_mins,')
  })

  it('reads a session back with its logged sets, active revisions only', () => {
    const declaration = body('session_snapshot')

    expect(declaration).toContain('from public.exercise_set_logs l')
    expect(declaration).toContain("we.revision_status = 'active'")
    expect(declaration).toContain('order by we.order_index')
  })

  it('resumes neither a completed nor an abandoned session', () => {
    const declaration = body('resume_session')

    expect(declaration).toContain('s.started_at is not null')
    expect(declaration).toContain('s.completed_at is null')
    expect(declaration).toContain('s.abandoned_at is null')
  })

  it('derives state from the three timestamps and stores none of it', () => {
    expect(body('session_state')).toMatch(/when p_abandoned_at is not null then 'abandoned'/)
    // No status column: a stored copy is one more thing that can disagree with
    // the timestamps SES-01b reconstructs from.
    expect(statements).not.toMatch(/add column if not exists status/i)
  })
})
