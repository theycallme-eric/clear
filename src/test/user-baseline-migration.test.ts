import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// DATA-01b. Same approach as the catalog's tests: the schema lives in a file
// Postgres reads, not in the bundle, so the assertions are made against the
// shipped artefact.
//
// What this can and cannot prove. `supabase db push --dry-run` proves the CLI
// accepts the migration set against the reused live project; these tests prove
// the migration says what DATA-01b requires it to say — that every user table
// carries RLS, that every policy it declares is owner-scoped on both sides, and
// that no path is left open to anon. What they cannot do is execute SQL: the
// off-machine-backup gate in docs/backend/live-inventory.md forbids mutating
// the live project until TASK-072, and there is no local server to run it
// against (ENV-04 keeps Docker out of the loop). So the two-user behavioural
// proof REQ-010 asks for — user A cannot read or write user B's row — is
// ENV-07's continuous job against a database, and the schema-level proof that
// it *can* pass is here.
const repoRoot = resolve(import.meta.dirname, '../..')

const read = (relativePath: string) =>
  readFileSync(resolve(repoRoot, relativePath), 'utf-8')

const USER_BASELINE_MIGRATION = '20260921000001_user_baseline.sql'
const CATALOG_MIGRATION = '20260921000000_catalog_domain.sql'
const sql = read(`supabase/migrations/${USER_BASELINE_MIGRATION}`)

/**
 * SQL with comments removed. Most of this file is prose explaining what was
 * dropped and why, and prose naming `streak_count` must not read as declaring
 * it.
 */
const statements = sql
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')

/**
 * The same SQL with string literals blanked. `COMMENT ON` legitimately names
 * the columns being retired, so "is this column declared?" has to be asked of
 * the DDL alone.
 */
const ddl = statements.replace(/'(?:[^']|'')*'/g, "''")

/** The three tables this domain owns. Every one of them is user-owned. */
const USER_TABLES = ['profiles', 'locations', 'location_equipment'] as const

const createsTable = (table: string) =>
  new RegExp(`create table (if not exists )?public\\.${table}\\b`, 'i').test(
    statements,
  )

/**
 * Every `CREATE POLICY` in the migration, split into the parts the assertions
 * below ask about. Written as a parse rather than a set of greps because the
 * requirement is about *every* policy — a fourteenth policy added later with a
 * `USING (true)` has to fail these tests, and a grep for the thirteen good ones
 * would not notice it.
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
    body,
  }
})

/** An owner predicate: this row's owner is the caller, and nothing weaker. */
const OWNER_PREDICATE =
  /^(id|user_id) = \(select auth\.uid\(\)\)$|^exists \(\s*select 1 from public\.locations l\s+where l\.id = location_equipment\.location_id\s+and l\.user_id = \(select auth\.uid\(\)\)\s*\)$/

const isOwnerScoped = (predicate: string | undefined) =>
  predicate !== undefined && OWNER_PREDICATE.test(predicate.replace(/\s+/g, ' ').replace(/\( /g, '(').replace(/ \)/g, ')'))

describe('user baseline migration — shape (DATA-01b)', () => {
  it('creates the profile, its locations, and their equipment', () => {
    for (const table of USER_TABLES) {
      expect(createsTable(table)).toBe(true)
    }
  })

  it('runs after the catalog, whose section_type it uses', () => {
    expect(USER_BASELINE_MIGRATION > CATALOG_MIGRATION).toBe(true)
    expect(statements).toMatch(/public\.section_type\[\]/i)
  })

  it('is idempotent, so a failed push can be retried as-is', () => {
    const createTableCount = (statements.match(/create table/gi) ?? []).length
    const guardedCount = (
      statements.match(/create table if not exists/gi) ?? []
    ).length

    expect(createTableCount).toBe(USER_TABLES.length)
    expect(guardedCount).toBe(USER_TABLES.length)

    // Functions replace, every drop guards itself, every index guards itself.
    expect(statements).not.toMatch(/create function/i)
    expect((statements.match(/create or replace function/gi) ?? []).length).toBe(
      2,
    )
    for (const drop of statements.match(/\bdrop (table|trigger|function|policy)\b[^;]*/gi) ??
      []) {
      expect(drop).toMatch(/if exists/i)
    }
    for (const index of statements.match(/create (unique )?index[^;]*/gi) ?? []) {
      expect(index).toMatch(/if not exists/i)
    }

    // The enums are created only where they do not already exist, which is what
    // carries the live project's `goal_preset` values forward untouched.
    for (const type of [
      'weight_unit',
      'experience_level',
      'goal_preset',
      'equipment_tier',
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
    // `profiles` and `locations` are Replace (dispositions §1) and already
    // exist on the reused project in their previous shape. Without the drop,
    // `create table if not exists` is a no-op there and every criterion below
    // would be true of this file and false of the database.
    for (const table of ['profiles', 'locations']) {
      const dropAt = statements.indexOf(`drop table if exists public.${table}`)
      const createAt = statements.search(
        new RegExp(`create table if not exists public\\.${table}\\b`, 'i'),
      )

      expect(dropAt).toBeGreaterThan(-1)
      expect(dropAt).toBeLessThan(createAt)
    }

    // It drops what this domain replaces, and nothing another domain owns.
    const dropped = [
      ...statements.matchAll(/drop table if exists public\.(\w+)/gi),
    ].map(([, table]) => table)

    expect(new Set(dropped)).toEqual(new Set(['profiles', 'locations']))
  })
})

describe('user baseline migration — the profile (DATA-01b)', () => {
  it('puts the weight_unit default on the profile', () => {
    expect(statements).toMatch(
      /create type public\.weight_unit as enum \('lb', 'kg'\)/i,
    )
    expect(statements).toMatch(
      /weight_unit public\.weight_unit not null default 'lb'/i,
    )
  })

  it('never lets the profile default reinterpret recorded history', () => {
    // The unit is stamped per set log at write time (DATA-01d). If this
    // migration joined a log to the profile to resolve a unit, a user changing
    // their default would silently rewrite what they lifted.
    expect(ddl).not.toMatch(/\bexercise_set_logs\b/i)
    expect(ddl).not.toMatch(/create (or replace )?view/i)

    // And the column is a default for new writes, which the comment states
    // where someone reading the schema will find it.
    expect(sql).toMatch(
      /comment on column public\.profiles\.weight_unit is[\s\S]*?reinterpret/i,
    )
  })

  it('carries enabled_sections with a usable default that cannot be emptied', () => {
    expect(statements).toMatch(
      /enabled_sections public\.section_type\[\] not null default array\[/i,
    )
    expect(statements).toMatch(
      /check \(cardinality\(enabled_sections\) > 0\)/i,
    )

    // From the array literal, not from the column name — `section_type[]`
    // closes a bracket of its own before the defaults begin.
    const declaration = statements.slice(
      statements.indexOf('enabled_sections public.section_type[] not null'),
    )
    const literal = declaration.slice(declaration.indexOf('array['))
    const defaults = literal.slice(0, literal.indexOf(']'))

    expect(
      [...defaults.matchAll(/'(\w+)'/g)].map(([, section]) => section),
    ).toEqual([
      'warmup',
      'primary_lift',
      'accessory',
      'core',
      'conditioning',
      'cooldown',
    ])
  })

  it('states absence with NULL rather than a sentinel', () => {
    // An onboarding answer the user has not given is NULL. A NOT NULL default
    // here would make "confident" or "strength" indistinguishable from unasked.
    for (const column of [
      'experience_level public.experience_level',
      'goal_preset      public.goal_preset',
      'onboarded_at timestamptz',
    ]) {
      const declaration = new RegExp(
        `${column.replace(/[.[\]]/g, '\\$&').replace(/\s+/g, '\\s+')}\\s*,`,
        'i',
      )

      expect(statements).toMatch(declaration)
    }

    expect(statements).not.toMatch(/experience_level[^,]*not null/i)
    expect(statements).not.toMatch(/goal_preset[^,]*not null/i)
    expect(statements).not.toMatch(/onboarded_at[^,]*not null/i)
  })

  it('creates the row at signup, whole, and never half-written', () => {
    expect(statements).toMatch(
      /create or replace function public\.create_profile_for_new_user\(\)/i,
    )
    // Defaults only: the insert names the id and nothing else, so there is no
    // state in which a profile exists with some of its columns written.
    expect(statements).toMatch(
      /insert into public\.profiles \(id\)\s*\n\s*values \(new\.id\)\s*\n\s*on conflict \(id\) do nothing/i,
    )
    expect(statements).toMatch(
      /create trigger on_auth_user_created\s+after insert on auth\.users/i,
    )
    // It runs as the auth system, not as the new user, so it must be DEFINER —
    // and a DEFINER function without a pinned search_path is a privilege
    // escalation waiting for a schema on the caller's path.
    expect(statements).toMatch(/security definer\s*\n\s*set search_path = ''/i)
  })

  it('drops the stored derived state instead of rebuilding it', () => {
    for (const column of [
      'streak_count',
      'streak_start_date',
      'streak_status',
      'streak_pause_reason',
      'streak_pause_start',
      'consecutive_rest_days',
      // Duplicated locations.is_default; the two could disagree.
      'default_location_id',
      // Superseded by user_constraints (DATA-05), which stores text and never
      // parses it.
      'limitations',
    ]) {
      expect(ddl).not.toMatch(new RegExp(`\\b${column}\\b`, 'i'))
    }
  })
})

describe('user baseline migration — locations and equipment (DATA-01b)', () => {
  it('carries an equipment tier', () => {
    expect(statements).toMatch(/tier public\.equipment_tier not null/i)
  })

  it('carries an explicit equipment list as rows, not an array column', () => {
    expect(createsTable('location_equipment')).toBe(true)
    expect(statements).toMatch(/primary key \(location_id, equipment_id\)/i)
    expect(statements).toMatch(
      /location_id uuid not null\s*\n?\s*references public\.locations \(id\) on delete cascade/i,
    )
    // The previous schema's `equipment TEXT[]` column does not come back.
    expect(ddl).not.toMatch(/equipment\s+text\[\]/i)
  })

  it('enforces one default per user by constraint, not by convention', () => {
    // At most one, by the index itself rather than by a trigger that
    // un-defaults the others after the fact.
    expect(statements).toMatch(
      /create unique index if not exists locations_one_default_per_user_idx\s*\n\s*on public\.locations \(user_id\) where is_default/i,
    )
    // The previous schema's after-the-fact corrector is gone.
    expect(statements).toMatch(
      /drop function if exists public\.ensure_single_default_location\(\)/i,
    )
    expect(ddl).not.toMatch(/create (or replace )?function public\.ensure_single_default_location/i)

    // And exactly one where the user has any: checked at COMMIT so moving the
    // default between two locations is not a violation in between.
    expect(statements).toMatch(
      /create constraint trigger locations_exactly_one_default[\s\S]*?deferrable initially deferred/i,
    )

    const assertion = statements.slice(
      statements.indexOf('function public.assert_user_has_one_default_location'),
    )
    const body = assertion.slice(0, assertion.indexOf('$$;'))

    expect(body).toMatch(/count\(\*\) filter \(where l\.is_default\)/i)
    expect(body).toMatch(/if total > 0 and defaults <> 1 then/i)
    expect(body).toMatch(/raise exception/i)
    // NEW is unassigned on DELETE and OLD on INSERT; reading the wrong one is
    // an error at runtime, not a null.
    expect(body).toMatch(/tg_op = 'INSERT'/)
    expect(body).toMatch(/tg_op = 'DELETE'/)
  })

  it('keeps location names distinguishable within an account', () => {
    expect(statements).toMatch(/unique \(user_id, name\)/i)
    expect(statements).toMatch(/check \(btrim\(name\) <> ''\)/i)
  })
})

describe('user baseline migration — owner-only RLS (DATA-01b)', () => {
  it('enables row-level security on every user table', () => {
    for (const table of USER_TABLES) {
      expect(statements).toMatch(
        new RegExp(
          `alter table public\\.${table}\\s+enable row level security`,
          'i',
        ),
      )
    }
  })

  it('declares a policy for every command a user is granted', () => {
    const byTable = (table: string) =>
      policies.filter((policy) => policy.table === table).map((p) => p.command)

    expect(new Set(byTable('profiles'))).toEqual(
      // No DELETE: removing the profile row would strand an authenticated user
      // with no profile. Account deletion cascades from auth.users instead.
      new Set(['select', 'insert', 'update']),
    )
    expect(new Set(byTable('locations'))).toEqual(
      new Set(['select', 'insert', 'update', 'delete']),
    )
    expect(new Set(byTable('location_equipment'))).toEqual(
      new Set(['select', 'insert', 'update', 'delete']),
    )
  })

  it('scopes every policy to the owner, on both sides of the check', () => {
    expect(policies.length).toBe(11)

    for (const policy of policies) {
      expect(policy.roles).toEqual(['authenticated'])

      // A read or a delete is decided by USING; an insert by WITH CHECK; an
      // update by both. USING alone on an UPDATE would let a user rewrite
      // their own row into someone else's ownership.
      if (policy.command === 'insert') {
        expect(policy.using).toBeUndefined()
        expect(isOwnerScoped(policy.withCheck)).toBe(true)
      } else if (policy.command === 'update') {
        expect(isOwnerScoped(policy.using)).toBe(true)
        expect(isOwnerScoped(policy.withCheck)).toBe(true)
      } else {
        expect(isOwnerScoped(policy.using)).toBe(true)
        expect(policy.withCheck).toBeUndefined()
      }
    }

    // Stated as an absence too: nothing in this domain is readable because the
    // policy said yes to everyone.
    expect(statements).not.toMatch(/using \(true\)/i)
  })

  it('derives equipment ownership from the location rather than copying it', () => {
    const equipment = policies.filter(
      (policy) => policy.table === 'location_equipment',
    )

    expect(equipment).toHaveLength(4)
    for (const policy of equipment) {
      expect(policy.body).toMatch(
        /exists \(\s*select 1 from public\.locations l\s+where l\.id = location_equipment\.location_id\s+and l\.user_id = \(select auth\.uid\(\)\)\s*\)/i,
      )
    }

    // A denormalized user_id on the equipment row could disagree with the
    // location it hangs off, and then the policy would be enforcing the wrong
    // answer confidently.
    const table = statements.slice(
      statements.indexOf('create table if not exists public.location_equipment'),
    )

    expect(table.slice(0, table.indexOf(');'))).not.toMatch(/user_id/i)
  })

  it('evaluates auth.uid() once per statement, not once per row', () => {
    // The lesson of migration 00019: a bare auth.uid() in a policy is
    // re-evaluated per row and turns a scan into a per-row function call.
    for (const call of statements.match(/auth\.uid\(\)/g) ?? []) {
      expect(call).toBe('auth.uid()')
    }
    expect(statements).not.toMatch(/(?<!\(select )auth\.uid\(\)/)
  })

  it('never opens a user table to anon', () => {
    for (const table of USER_TABLES) {
      expect(statements).toMatch(
        new RegExp(
          `revoke all on public\\.${table}\\s+from anon, authenticated`,
          'i',
        ),
      )
    }

    expect(statements).not.toMatch(/grant [\w, ]*on public\.\w+ to [\w, ]*anon/i)
    // Every policy names its role, so none of them falls back to PUBLIC.
    expect(statements).not.toMatch(/create policy[^;]*for \w+\s+using/i)
  })

  it('grants only the commands that have a policy', () => {
    // RLS and privileges are two independent mechanisms. A DELETE grant on
    // profiles with no DELETE policy would still be refused — but the grant
    // would be a standing invitation to add the policy without thinking.
    expect(statements).toMatch(
      /grant select, insert, update on public\.profiles to authenticated/i,
    )
    expect(statements).not.toMatch(/delete on public\.profiles to authenticated/i)

    for (const table of ['locations', 'location_equipment']) {
      expect(statements).toMatch(
        new RegExp(
          `grant select, insert, update, delete on public\\.${table}\\s+to authenticated`,
          'i',
        ),
      )
    }

    for (const table of USER_TABLES) {
      expect(statements).toMatch(
        new RegExp(`grant all on public\\.${table}\\s+to service_role`, 'i'),
      )
    }
  })

  it('pins search_path on every function it defines', () => {
    const functions =
      statements.match(/create or replace function[\s\S]*?\$\$;/gi) ?? []

    expect(functions).toHaveLength(2)
    for (const fn of functions) {
      expect(fn).toMatch(/set search_path = ''/)
    }
  })
})
