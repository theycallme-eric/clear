import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// DATA-01a. The catalog schema lives in a file Postgres reads, not in the
// bundle, so — as ENV-03 does for vercel.json — the assertions are made
// against the shipped artefact itself.
//
// What this can and cannot prove. `supabase db push --dry-run` proves the CLI
// accepts the migration set against the reused live project; these tests prove
// the migration says what DATA-01a requires it to say. Neither executes SQL,
// because the off-machine-backup gate in docs/backend/live-inventory.md
// forbids mutating the live project until TASK-072. Behavioural RLS proof —
// user A cannot touch user B's rows — is ENV-07's continuous job once a
// database exists to prove it against.
const repoRoot = resolve(import.meta.dirname, '../..')
const migrationsDir = resolve(repoRoot, 'supabase/migrations')

const read = (relativePath: string) =>
  readFileSync(resolve(repoRoot, relativePath), 'utf-8')

const CATALOG_MIGRATION = '20260921000000_catalog_domain.sql'
const catalogSql = read(`supabase/migrations/${CATALOG_MIGRATION}`)

/**
 * SQL with comments removed. Half of this file is prose explaining decisions,
 * and prose that mentions `exercise_anchors` must not read as creating it.
 */
const statements = catalogSql
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')

/**
 * The same SQL with string literals blanked as well. `COMMENT ON` legitimately
 * names the structures being retired — explaining where `exercise_anchors`
 * went is the point of the comment — so "is this structure referenced?" has to
 * be asked of the DDL alone.
 */
const ddl = statements.replace(/'(?:[^']|'')*'/g, "''")

const migrationFiles = readdirSync(migrationsDir)
  .filter((name) => name.endsWith('.sql'))
  .sort()

/** The five tables the catalog domain owns. */
const CATALOG_TABLES = [
  'component_pattern_map',
  'focus_pattern_map',
  'exercise_definitions',
  'exercise_muscle_groups',
  'exercise_pattern_weights',
] as const

/** The three derived views clients read through. */
const CATALOG_VIEWS = [
  'exercise_patterns',
  'exercise_pattern_ranked',
  'exercise_catalog',
] as const

const createsTable = (table: string) =>
  new RegExp(`create table (if not exists )?public\\.${table}\\b`, 'i').test(
    statements,
  )

describe('catalog migration — shape (DATA-01a)', () => {
  it('is a single migration for the domain', () => {
    const rebuildMigrations = migrationFiles.filter((name) =>
      /^\d{14}_/.test(name),
    )

    expect(rebuildMigrations).toEqual([CATALOG_MIGRATION])
  })

  it('creates every catalog table', () => {
    for (const table of CATALOG_TABLES) {
      expect(createsTable(table)).toBe(true)
    }
  })

  it('carries component_movements and exercise_role on exercise_definitions', () => {
    expect(statements).toMatch(/component_movements\s+text\[\]\s+not null/i)
    expect(statements).toMatch(
      /exercise_role\s+public\.exercise_role\s+not null/i,
    )
  })

  it('keeps equipment options, the default, and the per-equipment display names', () => {
    expect(statements).toMatch(/equipment_options\s+text\[\]\s+not null/i)
    expect(statements).toMatch(/default_equipment\s+text\s+not null/i)
    expect(statements).toMatch(/equipment_display_names\s+jsonb/i)
    // The default has to be one of the options, enforced rather than trusted.
    expect(statements).toMatch(
      /check \(default_equipment = any \(equipment_options\)\)/i,
    )
  })

  it('leaves regression and progression nullable — a valid null is data', () => {
    for (const column of ['regression', 'progression']) {
      const declaration = new RegExp(
        `${column}\\s+text references public\\.exercise_definitions \\(id\\)`,
        'i',
      )

      expect(statements).toMatch(declaration)
      expect(statements).not.toMatch(
        new RegExp(`${column}\\s+text\\s+not null`, 'i'),
      )
    }
  })

  it('is idempotent, so a failed push can be retried as-is', () => {
    // Every CREATE TABLE guards itself, every view replaces, every seed
    // resolves its own conflict.
    const createTableCount = (statements.match(/create table/gi) ?? []).length
    const guardedCount = (
      statements.match(/create table if not exists/gi) ?? []
    ).length

    expect(createTableCount).toBe(CATALOG_TABLES.length)
    expect(guardedCount).toBe(CATALOG_TABLES.length)

    for (const view of CATALOG_VIEWS) {
      expect(statements).toMatch(
        new RegExp(`create or replace view public\\.${view}\\b`, 'i'),
      )
    }

    const insertCount = (statements.match(/\binsert into\b/gi) ?? []).length
    const conflictCount = (statements.match(/\bon conflict\b/gi) ?? []).length

    expect(insertCount).toBeGreaterThan(0)
    expect(conflictCount).toBe(insertCount)
  })
})

describe('catalog migration — taxonomy is derived, not re-tagged (DATA-01a)', () => {
  it('declares session_focus and movement_pattern as enums', () => {
    expect(statements).toMatch(
      /create type public\.session_focus as enum \(\s*'upper_body', 'lower_body', 'full_body', 'power'\s*\)/i,
    )
    expect(statements).toMatch(/create type public\.movement_pattern as enum/i)

    for (const pattern of [
      'squat',
      'hinge',
      'press',
      'pull',
      'power',
      'unilateral',
      'conditioning',
    ]) {
      expect(statements).toContain(`'${pattern}'`)
    }
  })

  it('makes component_pattern_map a table, not a CASE expression', () => {
    expect(createsTable('component_pattern_map')).toBe(true)
    // A CASE anywhere in this migration would mean a pattern decision had been
    // compiled into SQL, which is the thing the table exists to prevent.
    expect(statements).not.toMatch(/\bcase\b/i)
  })

  it('derives exercise_patterns from the components and the map alone', () => {
    const view = statements.slice(
      statements.indexOf('create or replace view public.exercise_patterns'),
    )
    const body = view.slice(0, view.indexOf(';'))

    expect(body).toMatch(/unnest\(ed\.component_movements\)/i)
    expect(body).toMatch(/join public\.component_pattern_map/i)
    // No authored pattern column is consulted: derivation is the only input.
    expect(body).not.toMatch(/exercise_pattern_weights/i)
  })

  it('maps focus to patterns as data', () => {
    const seed = statements.slice(
      statements.indexOf('insert into public.focus_pattern_map'),
    )
    const rows = seed.slice(0, seed.indexOf(';'))

    const pairs = [...rows.matchAll(/\('(\w+)',\s*'([\w-]+)'\)/g)].map(
      ([, focus, pattern]) => `${focus}:${pattern}`,
    )

    expect(new Set(pairs)).toEqual(
      new Set([
        'upper_body:press',
        'upper_body:pull',
        'lower_body:squat',
        'lower_body:hinge',
        'lower_body:unilateral',
        'full_body:squat',
        'full_body:hinge',
        'full_body:press',
        'full_body:pull',
        'full_body:unilateral',
        'power:power',
      ]),
    )
  })

  it('seeds exactly the pattern-bearing components, and no quality component', () => {
    const seed = statements.slice(
      statements.indexOf('insert into public.component_pattern_map'),
    )
    const rows = seed.slice(0, seed.indexOf(';'))

    const mapped = Object.fromEntries(
      [...rows.matchAll(/\('([\w-]+)',\s*'(\w+)'\)/g)].map(
        ([, component, pattern]) => [component, pattern],
      ),
    )

    expect(mapped).toEqual({
      'knee-flexion': 'squat',
      'hip-hinge': 'hinge',
      'vertical-press': 'press',
      'horizontal-press': 'press',
      'triple-extension': 'power',
      'horizontal-pull': 'pull',
      'vertical-pull': 'pull',
      'single-leg-stability': 'unilateral',
      'cardio-output': 'conditioning',
    })

    // Quality components describe demands, not patterns. The warmup coverage
    // rule reads them off component_movements directly, so mapping one here
    // would invent a pattern the catalog never claimed.
    for (const quality of [
      'brace',
      'scapular-control',
      'posterior-chain-activation',
      'grip',
      'anti-rotation',
      'landing-mechanics',
      'anti-lateral-flexion',
    ]) {
      expect(rows).not.toContain(quality)
    }
  })

  it('keeps the authored ranking in exercise_pattern_weights for DATA-02', () => {
    expect(createsTable('exercise_pattern_weights')).toBe(true)
    expect(statements).toMatch(/is_primary\s+boolean\s+not null default false/i)

    // Ranked retrieval must still surface an exercise that has no weighting
    // row, so the join is outer and the flag defaults to false.
    const view = statements.slice(
      statements.indexOf(
        'create or replace view public.exercise_pattern_ranked',
      ),
    )
    const body = view.slice(0, view.indexOf(';'))

    expect(body).toMatch(/left join public\.exercise_pattern_weights/i)
    expect(body).toMatch(/coalesce\(w\.is_primary, false\)/i)
  })

  it('does not rebuild what is being retired', () => {
    // exercise_anchors carried three concepts; only its ranking survives, in
    // exercise_pattern_weights. movement_patterns was a parallel table patterns
    // are now derived from, so there is nothing left for it to hold.
    expect(ddl).not.toMatch(/\bexercise_anchors\b/i)
    // `movement_patterns` survives only as a derived column on
    // exercise_catalog; the 27-row table it used to name does not come back.
    expect(ddl).not.toMatch(/create table[^;]*\bmovement_patterns\b/i)
    expect(ddl).not.toMatch(/references public\.movement_patterns\b/i)
    expect(ddl).not.toMatch(/\banchor_type\b/i)
  })
})

describe('catalog migration — read-only to clients (DATA-01a)', () => {
  it('enables row-level security on every catalog table', () => {
    for (const table of CATALOG_TABLES) {
      expect(statements).toMatch(
        new RegExp(
          `alter table public\\.${table}\\s+enable row level security`,
          'i',
        ),
      )
    }
  })

  it('gives authenticated users a select policy and nothing else', () => {
    expect(statements).toMatch(
      /create policy %I on public\.%I for select to authenticated using \(true\)/i,
    )

    // The absence of a write policy is the mechanism, so assert the absence.
    for (const write of ['insert', 'update', 'delete', 'all']) {
      expect(statements).not.toMatch(
        new RegExp(`create policy[^;]*for ${write}\\b`, 'i'),
      )
    }
  })

  it('revokes write privileges as well, so RLS is not the only thing standing', () => {
    expect(statements).toMatch(/revoke all on public\.%I from anon, authenticated/i)
    expect(statements).toMatch(/grant select on public\.%I to authenticated/i)
    expect(statements).toMatch(/grant all on public\.%I to service_role/i)
  })

  it('applies the same posture to the derived views', () => {
    for (const view of CATALOG_VIEWS) {
      expect(statements).toMatch(
        new RegExp(`revoke all on public\\.${view}\\s+from anon, authenticated`, 'i'),
      )
      expect(statements).toMatch(
        new RegExp(`grant select on public\\.${view}\\s+to authenticated`, 'i'),
      )
      // security_invoker keeps the caller's policies in force; without it a
      // view reads with its owner's rights and quietly bypasses the above.
      expect(statements).toMatch(
        new RegExp(
          `create or replace view public\\.${view}\\s*\\n?with \\(security_invoker = on\\)`,
          'i',
        ),
      )
    }
  })

  it('never opens the catalog to anon', () => {
    expect(statements).not.toMatch(/grant [\w, ]*on public\.[\w%]+ to [\w, ]*anon/i)
    expect(statements).not.toMatch(/to anon\b(?![\w, ]*from)/i)
  })

  it('pins search_path on the function it defines', () => {
    expect(statements).toMatch(/set search_path = ''/)
  })
})

describe('inherited migration history (DATA-01a)', () => {
  // The rebuild reuses the live project, whose history already records 29
  // migrations. Without a local file per remote version the Supabase CLI
  // refuses to push at all, and the documented alternative —
  // `supabase migration repair` — deletes rows from the live project, which
  // the off-machine-backup gate forbids until TASK-072.
  const INHERITED = [
    '00001_create_enums',
    '00002_create_profiles',
    '00003_create_locations',
    '00004_create_workout_sessions',
    '00005_create_workout_sections',
    '00006_create_exercise_library',
    '00007_create_exercises',
    '00008_create_rls_policies',
    '00009_seed_exercise_library',
    '00010_expand_exercise_library',
    '00011_consolidate_exercises',
    '00012_add_structure_results',
    '00013_add_section_status',
    '00014_unique_location_names',
    '00015_allow_multiple_workouts_per_day',
    '00016_exercise_anchors_junction',
    '00017_complete_onboarding_rpc',
    '00018_save_workout_rpc',
    '00019_rls_index_optimizations',
    '00020_update_goal_preset_enum',
    '00021_save_workout_add_goal',
    '00022_drop_unique_section_type',
    '00023_save_workout_return_uuids',
    '00024_create_saved_workouts',
    '00025_add_exercise_structure',
    '00026_exercise_muscle_groups',
    '00027_suggest_anchor_rpc',
    '00028_exercise_set_logs',
    '00029_get_last_set_data_rpc',
  ]

  it('matches the versions the live capture recorded as applied', () => {
    const capture = read(
      'docs/backend/capture/inventory-2026-09-18T162244Z.txt',
    )
    const applied = [
      ...capture.matchAll(/^\s(\d{5})\s+\|\s(\w+)\s*$/gm),
    ].map(([, version, name]) => `${version}_${name}`)

    expect(applied).toEqual(INHERITED)
    expect(migrationFiles).toEqual([
      ...INHERITED.map((stem) => `${stem}.sql`),
      CATALOG_MIGRATION,
    ])
  })

  it('records each inherited version as a no-op, never as re-runnable SQL', () => {
    for (const stem of INHERITED) {
      const marker = read(`supabase/migrations/${stem}.sql`)
      const executable = marker
        .split('\n')
        .filter((line) => line.trim() !== '' && !line.trimStart().startsWith('--'))

      expect(executable).toEqual([])
      expect(marker).toContain('supabase/migrations/README.md')
    }
  })

  it('explains itself where someone will look', () => {
    const readme = read('supabase/migrations/README.md')

    expect(readme).toMatch(/no-op/i)
    expect(readme).toMatch(/migration repair/)
    expect(readme).toMatch(/TASK-072/)
  })
})
