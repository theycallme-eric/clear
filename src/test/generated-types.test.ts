/**
 * DATA-03 — the drift check, and the boundary it protects.
 *
 * `src/data/database.types.ts` is generated, and a generated file that has been
 * hand-edited or left behind a migration is worse than a hand-written one:
 * everything downstream keeps compiling against a schema that no longer exists.
 * So the check is not "do the types look right" but "is this file exactly what
 * the generator produces from the migrations in this tree" — the same question
 * `npm run gen:types -- --check` asks, asked here so it is answered by the test
 * job as well as by its own CI step.
 *
 * The second half is the other acceptance criterion: no untyped table access.
 * A module that builds its own PostgREST URL is outside the typed surface no
 * matter how careful it is, so that is checked by reading `src/` rather than by
 * convention.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

import { TYPES_PATH, build } from '../../scripts/gen-types/gen-types.mjs'
import { REPO_ROOT, migrationFiles, statements } from '../../scripts/gen-types/schema.mjs'
import { Constants } from '../data/database.types'

const read = (path: string) => readFileSync(join(REPO_ROOT, path), 'utf8')

describe('the generated types are current (DATA-03)', () => {
  it('is byte-identical to what the generator produces from the migrations', () => {
    const { contents } = build()

    expect(
      read(TYPES_PATH),
      'src/data/database.types.ts has drifted: run `npm run gen:types` and commit the result',
    ).toBe(contents)
  })

  it('carries the enums the rebuild introduced', () => {
    // Named in the requirement itself (REQ-014), so named here: these are the
    // vocabularies the previous schema did not have.
    expect(Constants.public.Enums.session_focus).toEqual([
      'upper_body',
      'lower_body',
      'full_body',
      'power',
    ])
    expect(Constants.public.Enums.movement_pattern).toContain('hinge')
    expect(Constants.public.Enums.target_kind).toEqual(['fixed', 'range', 'sequence'])
    expect(Constants.public.Enums.revision_status).toEqual(['active', 'superseded'])
    expect(Constants.public.Enums.execution_status).toEqual([
      'not_started',
      'completed',
      'skipped',
    ])
    expect(Constants.public.Enums.distance_unit).toEqual(['m', 'km', 'ft', 'mi'])
  })

  it('types every table the migrations leave behind, and no table they drop', () => {
    const { schema } = build()
    const names = schema.tables.map((table) => table.name)

    expect(names).toEqual([
      'block_results',
      'component_pattern_map',
      'exercise_definitions',
      'exercise_muscle_groups',
      'exercise_pattern_weights',
      'exercise_set_logs',
      'focus_pattern_map',
      'load_anchors',
      'location_equipment',
      'locations',
      'profiles',
      'user_constraints',
      'workout_blocks',
      'workout_exercises',
      'workout_sections',
      'workout_sessions',
    ])
    // `exercises` and `structure_results` are dropped by the rebuild (DATA-01c,
    // DATA-01d). A generator that read CREATE without DROP would still type them.
    expect(names).not.toContain('exercises')
    expect(names).not.toContain('structure_results')
  })

  it('reads a NOT NULL that is written as PRIMARY KEY', () => {
    const { schema } = build()
    const profiles = schema.tables.find((table) => table.name === 'profiles')

    // `id uuid primary key references auth.users (id)` never says "not null".
    expect(profiles?.columns.find((column) => column.name === 'id')?.nullable).toBe(false)
  })

  it('leaves a trigger function out and types a callable one', () => {
    const { contents } = build()

    expect(contents).toContain('constraints_in_force')
    expect(contents).toContain('usable_equipment')
    // It returns `trigger`: nothing can call it over PostgREST.
    expect(contents).not.toContain('set_updated_at')
  })

  it('writes out the columns a RETURNS TABLE declares (GEN-02a)', () => {
    const { schema } = build()
    const candidates = schema.functions.find(
      (fn) => fn.name === 'generation_candidates',
    )

    // The alternative is `Json`, and a candidate typed as `Json` would let
    // GEN-02b read a field this schema does not have.
    expect(candidates?.returns).toBe('table')
    expect(candidates?.columns?.map((column) => column.name)).toEqual([
      'exercise_id',
      'name',
      'movement_patterns',
      'primary_patterns',
      'exercise_role',
      'component_movements',
      'muscles',
      'can_be_primary',
      'usable_equipment',
    ])
    expect(build().contents).toContain(
      "movement_patterns: Database['public']['Enums']['movement_pattern'][]",
    )
  })
})

describe('the drift check is wired where it will be run (DATA-03)', () => {
  const packageJson = JSON.parse(read('package.json')) as {
    scripts: Record<string, string>
  }

  it('is a script, and the script is the generator', () => {
    expect(packageJson.scripts['gen:types']).toBe('node scripts/gen-types/gen-types.mjs')
  })

  it('fails CI: the lint job runs it on every pull request', () => {
    expect(read('.github/workflows/ci.yml')).toContain('npm run gen:types -- --check')
  })

  it('is documented in DEVELOPMENT.md, where a developer meets the failure', () => {
    const development = read('DEVELOPMENT.md')

    expect(development).toContain('npm run gen:types')
    expect(development).toContain('npm run gen:types -- --check')
    expect(development).toContain(TYPES_PATH)
  })
})

describe('the SQL reader fails loudly rather than quietly (DATA-03)', () => {
  it('reads every rebuild migration and only those', () => {
    expect(migrationFiles()).toEqual([
      '20260921000000_catalog_domain.sql',
      '20260921000001_user_baseline.sql',
      '20260921000002_user_constraints.sql',
      '20260921000002_workout_domain.sql',
      '20260921000003_execution_domain.sql',
      '20260921000004_generation_candidates.sql',
      '20260921000005_session_lifecycle.sql',
      '20260921000006_streak_sessions.sql',
      '20260921000007_complete_onboarding.sql',
      '20260921000008_location_writes.sql',
      '20260921000009_session_reconstruction.sql',
      '20260921000010_load_anchors.sql',
      '20260921000011_conditioning_history.sql',
    ])
  })

  it('reads a column a later migration adds to an earlier table (SES-01a)', () => {
    const { schema } = build()
    const sessions = schema.tables.find((table) => table.name === 'workout_sessions')

    // `abandoned_at` is declared by ALTER TABLE in 20260921000005, not by the
    // CREATE TABLE in 20260921000002. A reader that only understood CREATE
    // would type a `workout_sessions` row the schema no longer has.
    const abandoned = sessions?.columns.find((column) => column.name === 'abandoned_at')
    expect(abandoned?.pgType).toBe('timestamptz')
    expect(abandoned?.nullable).toBe(true)
  })

  it('does not mistake a comment or a quoted semicolon for SQL', () => {
    const parsed = statements(
      [
        "-- create table public.ghost (id uuid); this is a comment",
        "comment on table public.real is 'one; two; three';",
        'create table public.real (id uuid primary key);',
      ].join('\n'),
    )

    expect(parsed).toEqual([
      "comment on table public.real is 'one; two; three'",
      'create table public.real (id uuid primary key)',
    ])
  })
})

describe('no untyped table access (DATA-03)', () => {
  /** Every app-owned TypeScript file; the vendored design system is not ours. */
  function appSources(): string[] {
    const found: string[] = []

    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry)
        if (statSync(path).isDirectory()) {
          if (entry !== 'design-system') walk(path)
          continue
        }
        if (/\.tsx?$/.test(entry)) found.push(relative(REPO_ROOT, path))
      }
    }

    walk(join(REPO_ROOT, 'src'))

    return found
  }

  /**
   * Runtime modules only. A test may name a PostgREST path — the doubles and
   * the preflight's assertions do — because a test is not the thing that ships.
   */
  const isRuntime = (file: string) =>
    !/\.test\.tsx?$/.test(file) && !file.startsWith('src/test/')

  it('routes every PostgREST call through src/data/supabase.ts', () => {
    // The client owns the transport. A module that composes `/rest/v1/...`
    // itself has left the typed surface — which is how the schema and the code
    // drift apart without either of them being wrong on its own.
    const offenders = appSources()
      .filter(isRuntime)
      .filter((file) => file !== 'src/data/supabase.ts' && read(file).includes('/rest/v1'))

    expect(offenders).toEqual([])
  })

  it('lets no `any` escape the data layer', () => {
    const offenders = appSources()
      .filter((file) => file.startsWith('src/data/'))
      .filter((file) => /(:|<|\bas\s+)\s*any\b/.test(read(file)))

    expect(offenders).toEqual([])
  })
})
