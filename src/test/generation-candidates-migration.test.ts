import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// GEN-02a. Retrieval is SQL, so the assertions are made against the artifact
// Postgres reads. The companion to this file is `src/data/candidates.test.ts`,
// which runs the retrieval against the committed seed through a double whose
// predicates are transcribed from this migration — these tests are what keep
// that transcription honest, clause by clause.
//
// The same limit the other migration tests state applies: this cannot execute
// SQL. The off-machine-backup gate in docs/backend/live-inventory.md holds any
// push to the reused project until TASK-072, and ENV-04 keeps Docker out of the
// loop. The behavioural proof against a database is ENV-07's continuous job.
const repoRoot = resolve(import.meta.dirname, '../..')

const read = (relativePath: string) =>
  readFileSync(resolve(repoRoot, relativePath), 'utf-8')

const MIGRATION = '20260921000004_generation_candidates.sql'
const CONSTRAINTS_MIGRATION = '20260921000002_user_constraints.sql'
const sql = read(`supabase/migrations/${MIGRATION}`)

/** SQL with comments removed: most of this file is prose about the query. */
const statements = sql
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')

/** One function's body, from its CREATE to the `$$;` that ends it. */
function body(name: string): string {
  const start = statements.indexOf(`create or replace function public.${name}(`)
  expect(start, `${name} is not declared`).toBeGreaterThan(-1)

  return statements.slice(start, statements.indexOf('$$;', start))
}

const FUNCTIONS = [
  'generation_sections',
  'generation_equipment',
  'generation_candidates',
  'generation_candidate_sets',
]

describe('generation candidates migration — shape (GEN-02a)', () => {
  it('runs after the domains it reads', () => {
    // Catalog, profiles/locations, and constraints all have to exist first.
    expect(MIGRATION > CONSTRAINTS_MIGRATION).toBe(true)
    expect(MIGRATION > '20260921000000_catalog_domain.sql').toBe(true)
  })

  it('adds no table, no type and no policy — it is four functions', () => {
    expect(statements).not.toMatch(/create table/i)
    expect(statements).not.toMatch(/create type/i)
    expect(statements).not.toMatch(/create policy/i)
    expect(statements).not.toMatch(/alter table/i)

    for (const name of FUNCTIONS) {
      expect(statements).toContain(`create or replace function public.${name}(`)
    }
    // Idempotent: every function is a replace, so a failed push is retried as-is.
    expect((statements.match(/create (or replace )?function/gi) ?? []).length).toBe(
      FUNCTIONS.length,
    )
    expect((statements.match(/create or replace function/gi) ?? []).length).toBe(
      FUNCTIONS.length,
    )
  })

  it('keeps every function invoker-rights, stable, and on a pinned search_path', () => {
    for (const name of FUNCTIONS) {
      const declaration = body(name)

      // SECURITY INVOKER: owner-only RLS below still decides what a caller
      // sees, and the explicit user id is not a way around it.
      expect(declaration, name).toMatch(/security invoker/i)
      expect(declaration, name).toMatch(/\blanguage sql\b/i)
      expect(declaration, name).toMatch(/\bstable\b/i)
      expect(declaration, name).toMatch(/set search_path = ''/i)
      expect(declaration, name).not.toMatch(/security definer/i)
    }
  })

  it('makes no model call, and reaches nothing outside this database', () => {
    // GEN-02a is the half of generation that has no model in it. Retrieval that
    // called out would stop being deterministic, and it would stop being
    // testable without a key.
    for (const forbidden of [/anthropic/i, /\bhttp[s]?:/i, /\bnet\./i, /pg_net/i, /extension/i]) {
      expect(statements).not.toMatch(forbidden)
    }
  })
})

describe('resolved sections (GEN-02a)', () => {
  const declaration = body('generation_sections')

  it('resolves active recovery to warmup, mobility and cooldown only', () => {
    expect(declaration).toMatch(
      /when p\.goal_preset = 'active_recovery'\s*then array\['warmup', 'mobility', 'cooldown'\]::public\.section_type\[\]/i,
    )
  })

  it('overrides the section toggles rather than intersecting with them', () => {
    // An intersection would let a user's toggles remove mobility from a
    // recovery session, which is the one section it cannot do without.
    expect(declaration).not.toMatch(/&&/)
    expect(declaration).toMatch(/else p\.enabled_sections/i)
    expect(declaration).toMatch(/from public\.profiles p\s+where p\.id = p_user_id/i)
  })
})

describe('resolved equipment (GEN-02a)', () => {
  const declaration = body('generation_equipment')

  it('reads the explicit list and not the location tier', () => {
    expect(declaration).toMatch(/join public\.location_equipment le/i)
    expect(declaration).not.toMatch(/\btier\b/i)
  })

  it('means the default location when no location is named', () => {
    expect(declaration).toMatch(/p_location_id uuid default null/i)
    expect(declaration).toMatch(/coalesce\(\s*p_location_id/i)
    expect(declaration).toMatch(/d\.is_default/i)
  })

  it('answers the same array every time, and never a null', () => {
    expect(declaration).toMatch(/coalesce\(array_agg\(distinct le\.equipment_id order by le\.equipment_id\), '\{\}'\)/i)
    expect(declaration).toMatch(/where l\.user_id = p_user_id/i)
  })
})

describe('candidate retrieval, one section (GENERATION_CONTRACT §3)', () => {
  const declaration = body('generation_candidates')

  it('joins focus to patterns rather than branching on the focus', () => {
    expect(declaration).toMatch(
      /from public\.focus_pattern_map f\s+where f\.session_focus = p_focus/i,
    )
    expect(declaration).toMatch(
      /ec\.movement_patterns && array\(select fp\.movement_pattern from focus_patterns fp\)/i,
    )
  })

  it('exempts the five roles no focus binds', () => {
    expect(declaration).toMatch(
      /ec\.exercise_role = any \(array\[\s*'conditioning', 'mobility', 'activation', 'cardio', 'stability'\s*\]::public\.exercise_role\[\]\)/i,
    )
  })

  it('filters on section eligibility from the catalog, not from the role', () => {
    expect(declaration).toMatch(/ec\.sections @> array\[p_section\]/i)
  })

  it('intersects equipment with the resolved location', () => {
    expect(declaration).toMatch(/ec\.equipment_options && p_available_equipment/i)
  })

  it("computes usable_equipment per candidate with DATA-05's function", () => {
    // Composed, not reimplemented: the equipment exclusion is written once, in
    // the migration that owns constraints.
    expect(declaration).toMatch(
      /public\.usable_equipment\(\s*p_user_id, ec\.equipment_options, p_available_equipment, p_session_id\s*\) as equipment/i,
    )
    // It is returned as well as tested, so a candidate arrives carrying it.
    expect(declaration).toMatch(/ue\.equipment\b/)
    expect(declaration).toMatch(/cardinality\(ue\.equipment\) > 0/i)
  })

  it('applies the user exclusions through constraints_in_force', () => {
    expect(declaration).toMatch(
      /from public\.constraints_in_force\(p_user_id, p_session_id\) c\s+where c\.action = 'exclude'/i,
    )
    expect(declaration).toMatch(
      /ec\.id <> all \(array\(\s*select e\.target_exercise_id from excluded e where e\.scope = 'exercise'\s*\)\)/i,
    )
    expect(declaration).toMatch(
      /not \(ec\.movement_patterns && array\(\s*select e\.target_pattern from excluded e where e\.scope = 'movement_pattern'\s*\)\)/i,
    )
    // Never a second reader of the table: a session-scoped exclusion has one
    // definition of "in force" and this is not a second one.
    expect(declaration).not.toMatch(/from public\.user_constraints/i)
    // `avoid` and `prefer_not` do not filter — they are GEN-02b's deprioritize
    // list, and nothing here may narrow eligibility with them.
    expect(declaration).not.toMatch(/'avoid'/)
    expect(declaration).not.toMatch(/'prefer_not'/)
  })

  it('relaxes the pattern predicate and nothing else', () => {
    expect(declaration).toMatch(/p_relax_patterns\s+boolean default false/i)
    // The flag appears once, inside the thematic predicate.
    expect((declaration.match(/p_relax_patterns/g) ?? []).length).toBe(2)
    const thematic = declaration.slice(
      declaration.indexOf('where'),
      declaration.indexOf('and ec.sections'),
    )
    expect(thematic).toContain('p_relax_patterns')
  })

  it('retrieves the same list in the same order every time', () => {
    expect(declaration).toMatch(/order by ec\.can_be_primary desc, ec\.id/i)
  })
})

describe('candidate retrieval, one request (GEN-02a)', () => {
  const declaration = body('generation_candidate_sets')

  it('resolves sections and equipment in SQL, in the same call', () => {
    expect(declaration).toMatch(/public\.generation_sections\(p_user_id\)/i)
    expect(declaration).toMatch(
      /public\.generation_equipment\(p_user_id, p_location_id\)/i,
    )
    expect(declaration).toMatch(/unnest\(r\.sections\) with ordinality/i)
  })

  it("applies §3's floor per section and records the relaxation", () => {
    expect(declaration).toMatch(/p_floor\s+integer default 8/i)
    expect(declaration).toMatch(/strict_set\.found < p_floor/i)
    // Both retrievals are the same function, one with the flag set.
    expect(declaration).toMatch(
      /public\.generation_candidates\(\s*p_user_id, p_focus, s\.section, r\.equipment, p_session_id, false\) c/i,
    )
    expect(declaration).toMatch(
      /public\.generation_candidates\(\s*p_user_id, p_focus, s\.section, r\.equipment, p_session_id, true\) c/i,
    )
    expect(declaration).toMatch(/returns table \(\s*section\s+public\.section_type,\s*relaxed\s+boolean,\s*candidates\s+jsonb\s*\)/i)
  })

  it('returns an empty section rather than raising', () => {
    // A raise would cross PostgREST as a 400 carrying a Postgres message, which
    // CORE-01's envelope cannot turn back into `generation.no_candidates`.
    // src/data/candidates.ts names it instead.
    expect(declaration).not.toMatch(/\braise\b/i)
    expect(declaration).toMatch(/coalesce\(\s*jsonb_agg/i)
  })

  it('keeps the returned order the order the sections were resolved in', () => {
    expect(declaration).toMatch(/order by s\.ordinal/i)
  })
})

describe('who may call it (GEN-02a)', () => {
  it('is not callable by an anonymous request', () => {
    // Postgres grants EXECUTE to PUBLIC by default. SECURITY INVOKER means an
    // anonymous caller would see nothing, but "cannot be called" is the
    // stronger statement and the catalog's two-mechanism convention.
    for (const name of FUNCTIONS) {
      expect(statements).toMatch(
        new RegExp(`revoke all on function public\\.${name}\\(`, 'i'),
      )
      expect(statements).toMatch(
        new RegExp(`grant execute on function public\\.${name}\\(`, 'i'),
      )
    }
    expect((statements.match(/from public, anon;/g) ?? []).length).toBe(FUNCTIONS.length)
    expect((statements.match(/to authenticated, service_role;/g) ?? []).length).toBe(
      FUNCTIONS.length,
    )
  })
})
