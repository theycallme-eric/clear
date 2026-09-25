import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { Constants } from '../data/database.types'

// OVR-01a. Three of the five acceptance criteria are predicates in SQL, so
// their assertions are made against the artifact Postgres reads. The companions
// are `src/state/anchors.test.ts` for the arithmetic and `src/data/anchors.ts`'s
// tests for the calls; ENV-07's suite is where a database agrees. The limit
// every migration test here states applies: this cannot execute SQL.
const repoRoot = resolve(import.meta.dirname, '../..')

const MIGRATION = '20260921000010_load_anchors.sql'
const EXECUTION_MIGRATION = '20260921000003_execution_domain.sql'

const sql = readFileSync(resolve(repoRoot, `supabase/migrations/${MIGRATION}`), 'utf-8')

/** SQL with comments removed: most of this file is prose about §1. */
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

const FUNCTIONS = ['anchor_evidence', 'set_load_anchors']

describe('load anchors migration — shape (OVR-01a)', () => {
  it('runs after the logs it derives from', () => {
    expect(MIGRATION > EXECUTION_MIGRATION).toBe(true)
  })

  it('is idempotent: every object is a replace or an if-not-exists', () => {
    expect(statements).toContain('create table if not exists public.load_anchors')
    expect(statements).toContain('add column if not exists is_deload')
    expect(statements).toContain("select 1 from pg_type where typname = 'anchor_confidence'")
    for (const name of FUNCTIONS) {
      expect(statements, name).toContain(`create or replace function public.${name}(`)
    }
    expect(statements.match(/create function/gi) ?? []).toEqual([])
  })

  it('keeps both functions invoker-rights and on a pinned search_path', () => {
    for (const name of FUNCTIONS) {
      const declaration = body(name)

      expect(declaration, name).toMatch(/security invoker/i)
      expect(declaration, name).toMatch(/set search_path = ''/i)
      expect(declaration, name).not.toMatch(/security definer/i)
    }
  })

  it('refuses both functions to anon and grants them to a signed-in caller', () => {
    for (const signature of ['anchor_evidence(uuid)', 'set_load_anchors(uuid, jsonb)']) {
      expect(statements).toContain(`revoke all on function public.${signature} from public, anon`)
      expect(statements).toContain(`grant execute on function public.${signature}`)
    }
  })
})

describe('the anchor table is the user’s own (OVR-01a)', () => {
  it('turns row-level security on and writes a policy for all four verbs', () => {
    expect(statements).toContain('alter table public.load_anchors enable row level security')
    for (const verb of ['select', 'insert', 'update', 'delete']) {
      expect(statements, verb).toContain(`create policy load_anchors_${verb}_own`)
    }
    // DELETE is deliberate rather than incidental: recomputation removes an
    // anchor the evidence stopped supporting.
    expect(statements).toContain('grant select, insert, update, delete on public.load_anchors')
    expect(statements).toContain('revoke all on public.load_anchors from anon, authenticated')
  })

  it('keys an anchor by exercise and equipment together', () => {
    expect(statements).toContain('primary key (user_id, exercise_id, equipment_used)')
    expect(statements).toContain('on conflict (user_id, exercise_id, equipment_used) do update')
  })

  it('stores the unit on the row and refuses an anchor of zero', () => {
    expect(statements).toMatch(/unit\s+public\.weight_unit\s+not null/)
    expect(statements).toContain('check (anchor_value > 0)')
    expect(statements).toContain('check (session_count > 0)')
  })

  it('cannot hold a bodyweight anchor even if something tried to write one', () => {
    expect(statements).toContain("check (equipment_used <> 'bodyweight')")
  })

  it('names the confidence vocabulary the generated types carry', () => {
    expect(Constants.public.Enums.anchor_confidence).toEqual(['low', 'medium', 'high'])
  })
})

describe('anchor_evidence excludes what may not move an anchor (OVR-01a)', () => {
  const declaration = body('anchor_evidence')

  it('is a read: stable, and it writes nothing', () => {
    expect(declaration).toMatch(/\bstable\b/i)
    expect(declaration).not.toMatch(/\b(insert into|update |delete from)\b/i)
  })

  it('answers working sets only — a warmup never moves an anchor', () => {
    expect(declaration).toContain('l.is_warmup_set = false')
  })

  it('excludes deload and active-recovery sessions', () => {
    expect(declaration).toContain('s.is_deload = false')
    expect(declaration).toContain("s.goal_preset is distinct from 'active_recovery'")
  })

  it('reads completed sessions only', () => {
    expect(declaration).toContain('s.completed_at is not null')
    expect(declaration).toContain('s.abandoned_at is null')
  })

  it('excludes bodyweight movements entirely — they progress by reps', () => {
    expect(declaration).toContain("we.load_type is distinct from 'bodyweight'")
    expect(declaration).toContain("we.equipment_used <> 'bodyweight'")
    expect(declaration).toContain("we.modality = 'reps'")
  })

  it('computes the prescribed target from the prescription row, never a string', () => {
    // The join is the criterion: `exercise_set_logs` carries no reps_prescribed,
    // so the target comes from the immutable row the log is attached to.
    expect(declaration).toContain('join public.workout_exercises we on we.id = l.workout_exercise_id')
    expect(declaration).toContain('case we.target_kind')
    expect(declaration).toContain('when \'fixed\'    then we.target_value')
    expect(declaration).toContain('when \'range\'    then we.target_min')
    expect(declaration).toContain('when \'sequence\' then we.target_sequence[l.set_number]')
  })

  it('leaves a missing RPE or weight in, because rep completion still counts it', () => {
    expect(declaration).not.toContain('l.rpe is not null')
    expect(declaration).not.toContain('l.weight is not null')
  })
})

describe('set_load_anchors replaces rather than accumulates (OVR-01a)', () => {
  const declaration = body('set_load_anchors')

  it('deletes the anchors the payload no longer contains', () => {
    expect(declaration).toContain('delete from public.load_anchors la')
    expect(declaration).toContain('not exists (')
  })

  it('does it in one statement, so there is no half-written anchor set', () => {
    // One `with`, one `insert`, one `returning`: the delete is a CTE of the
    // same statement rather than a second round trip.
    expect(declaration.match(/insert into public\.load_anchors/g)).toHaveLength(1)
    expect(declaration.match(/\bwith incoming as\b/g)).toHaveLength(1)
  })

  it('reads its payload as typed columns rather than trusting the json', () => {
    expect(declaration).toContain('jsonb_to_recordset')
    expect(declaration).toContain('unit              public.weight_unit')
    expect(declaration).toContain('confidence        public.anchor_confidence')
  })
})
