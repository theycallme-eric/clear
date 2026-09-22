/**
 * DATA-03 — the typed client, exercised.
 *
 * The acceptance criterion is that a sample typed query and a typed RPC call
 * compile *and run*, so these do both against the PostgREST double DATA-05
 * built (`src/test/postgrest-double.ts`): it holds `user_constraints`' own
 * rules and answers `constraints_in_force`, so a round trip here is a round
 * trip through the same request shapes PostgREST accepts.
 *
 * What that proves: the client speaks PostgREST correctly, the generated row
 * type is the row that comes back, and a refusal arrives as a typed error. What
 * it does not prove is that Postgres agrees — the schema is asserted from the
 * migrations in `src/test/*-migration.test.ts`, and executed against a real
 * database by ENV-07.
 *
 * The compile half is not a separate suite: this file is typechecked by
 * `npm run typecheck` and `npm run build`, so every annotation below is an
 * assertion. Where the point *is* the type, it is written as one — a variable
 * with an explicit type, or `@ts-expect-error` on the call that must not
 * compile.
 */
import { describe, expect, it } from 'vitest'

import { ErrorCode } from '../state/errors'
import { createPostgrestDouble } from '../test/postgrest-double'
import {
  CONSTRAINT_ACTIONS,
  CONSTRAINT_PERSISTENCE,
  CONSTRAINT_SCOPES,
  MOVEMENT_PATTERNS,
} from './constraints'
import {
  Constants,
  type FunctionReturns,
  type Tables,
  type TablesInsert,
} from './database.types'
import { configFromEnv, createSupabaseClient } from './supabase'

const URL_ = 'https://project.supabase.co'
const ANON_KEY = 'anon-key'
const TOKEN = 'user-token'
const USER = 'user-1'
const SESSION = 'session-1'

function setup(options: { accessToken?: string | null } = {}) {
  const double = createPostgrestDouble({
    url: URL_,
    anonKey: ANON_KEY,
    users: { [TOKEN]: USER },
  })

  const client = createSupabaseClient({
    url: URL_,
    anonKey: ANON_KEY,
    accessToken: options.accessToken === undefined ? TOKEN : options.accessToken,
    fetch: double.fetch,
  })

  return { client, double }
}

/** Unwraps a result the test asserts is a success, keeping the value typed. */
function expectOk<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  expect(result.ok, JSON.stringify('error' in result ? result.error : null)).toBe(true)
  if (!result.ok) throw new Error('unreachable')

  return result.value
}

function expectError(result: { ok: boolean; error?: { code: string } }): string {
  expect(result.ok).toBe(false)

  return result.error?.code ?? 'no error'
}

/** A row the schema accepts, written against the generated Insert type. */
const persistentExclusion: TablesInsert<'user_constraints'> = {
  user_id: USER,
  scope: 'equipment',
  action: 'exclude',
  persistence: 'persistent',
  target_equipment: 'barbell',
}

describe('a typed table query (DATA-03)', () => {
  it('inserts and reads back rows of the generated row type', async () => {
    const { client } = setup()

    const inserted = expectOk(await client.from('user_constraints').insert(persistentExclusion))

    // The annotation is the assertion: `select` answers this table's rows.
    const rows: Tables<'user_constraints'>[] = expectOk(
      await client.from('user_constraints').select({
        where: { user_id: USER },
        order: [{ column: 'created_at' }, { column: 'id' }],
      }),
    )

    expect(inserted).toHaveLength(1)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      user_id: USER,
      scope: 'equipment',
      action: 'exclude',
      target_equipment: 'barbell',
      target_exercise_id: null,
      target_pattern: null,
    })
  })

  it('sends the filter, the order and the column list PostgREST expects', async () => {
    const { client, double } = setup()

    expectOk(
      await client.from('user_constraints').select({
        columns: ['id', 'scope', 'action'],
        where: { user_id: USER, applies_to_session_id: null },
        order: [{ column: 'created_at', ascending: false }],
        limit: 10,
      }),
    )

    const [request] = double.requests()
    expect(request.method).toBe('GET')
    const query = new URLSearchParams(request.query)
    expect(query.get('select')).toBe('id,scope,action')
    expect(query.get('user_id')).toBe(`eq.${USER}`)
    // A null filter is IS NULL, not `eq.null`, which matches nothing at all.
    expect(query.get('applies_to_session_id')).toBe('is.null')
    expect(query.get('order')).toBe('created_at.desc')
    expect(query.get('limit')).toBe('10')
  })

  it('deletes by a typed filter and treats an absent row as done', async () => {
    const { client } = setup()

    expectOk(await client.from('user_constraints').insert(persistentExclusion))
    const [row] = expectOk(await client.from('user_constraints').select())

    expectOk(await client.from('user_constraints').delete({ id: row.id }))
    expect(expectOk(await client.from('user_constraints').select())).toHaveLength(0)

    // Deleting it again is not an error: changing your mind twice is not a fault.
    expectOk(await client.from('user_constraints').delete({ id: row.id }))
  })

  it('reports a refusal as a typed error, never a thrown string', async () => {
    const { client } = setup()

    // The scope says equipment; the target is an exercise. A CHECK constraint
    // refuses it, and the double transcribes that refusal.
    const refused = await client.from('user_constraints').insert({
      ...persistentExclusion,
      target_equipment: null,
      target_exercise_id: 'back-squat',
    })

    expect(expectError(refused)).toBe(ErrorCode.VALIDATION_CONSTRAINT)
  })

  it('refuses to call at all without an access token', async () => {
    const { client, double } = setup({ accessToken: null })

    const result = await client.from('user_constraints').select()

    expect(expectError(result)).toBe(ErrorCode.AUTH_UNAUTHENTICATED)
    expect(double.requests()).toEqual([])
  })
})

describe('a typed RPC call (DATA-03)', () => {
  it('passes the function its own arguments and returns its own rows', async () => {
    const { client } = setup()

    expectOk(await client.from('user_constraints').insert(persistentExclusion))
    expectOk(
      await client.from('user_constraints').insert({
        ...persistentExclusion,
        target_equipment: 'rower',
        persistence: 'session',
        applies_to_session_id: SESSION,
      }),
    )

    // `constraints_in_force` returns SETOF user_constraints, so the generated
    // return type is that table's rows — the annotation is the assertion.
    const inForce: Tables<'user_constraints'>[] = expectOk(
      await client.rpc('constraints_in_force', {
        p_user_id: USER,
        p_session_id: SESSION,
      }),
    )

    expect(inForce.map((row) => row.target_equipment)).toEqual(['barbell', 'rower'])

    const persistentOnly = expectOk(
      await client.rpc('constraints_in_force', { p_user_id: USER, p_session_id: null }),
    )

    expect(persistentOnly.map((row) => row.target_equipment)).toEqual(['barbell'])
  })

  it('posts the arguments as the body, to the function by name', async () => {
    const { client, double } = setup()

    expectOk(await client.rpc('constraints_in_force', { p_user_id: USER }))

    expect(double.requests()).toEqual([
      { method: 'POST', path: '/rpc/constraints_in_force', query: '' },
    ])
  })
})

describe('what the types refuse to compile (DATA-03)', () => {
  it('rejects a table, a column and an argument the schema does not have', () => {
    const { client } = setup()

    // @ts-expect-error — no such table; a rename in a migration lands here.
    void client.from('user_constraint')
    // @ts-expect-error — `scope` is an enum, and 'impact' was never one of it.
    void client.from('user_constraints').select({ where: { scope: 'impact' } })
    // @ts-expect-error — `equipment_options` is text[], which no eq filter can take.
    void client.from('exercise_definitions').select({ where: { equipment_options: 'barbell' } })
    // @ts-expect-error — the argument is `p_user_id`, and it is required.
    void client.rpc('constraints_in_force', { user_id: USER })
    // @ts-expect-error — `usable_equipment` answers text[]; these are not rows.
    takesRows(placeholder<FunctionReturns<'usable_equipment'>>())

    expect(true).toBe(true)
  })
})

/** Exists to be the thing a wrong return type cannot be passed to. */
function takesRows(rows: Tables<'user_constraints'>[]): void {
  void rows
  // The check happens in the type system; there is nothing to do at runtime.
}

/** A value of the given type that is never read — the check is the type. */
function placeholder<T>(): T {
  return undefined as T
}

describe('the generated vocabulary is the only vocabulary (DATA-03)', () => {
  // A hand-written list that has fallen behind an enum is the drift this
  // requirement exists to prevent, and it is invisible until a value the
  // database accepts is one the UI never offers.
  it('lists every value each enum has', () => {
    const sorted = (values: readonly string[]) => [...values].sort()

    expect(sorted(CONSTRAINT_SCOPES)).toEqual(sorted(Constants.public.Enums.constraint_scope))
    expect(sorted(CONSTRAINT_ACTIONS)).toEqual(sorted(Constants.public.Enums.constraint_action))
    expect(sorted(CONSTRAINT_PERSISTENCE)).toEqual(
      sorted(Constants.public.Enums.constraint_persistence),
    )
    expect(sorted(MOVEMENT_PATTERNS)).toEqual(sorted(Constants.public.Enums.movement_pattern))
  })
})

describe('configuration (DATA-03)', () => {
  it('reads the two documented variables', () => {
    const config = expectOk(
      configFromEnv({
        VITE_SUPABASE_URL: URL_,
        VITE_SUPABASE_ANON_KEY: ANON_KEY,
        VITE_UNRELATED: 'ignored',
      }),
    )

    expect(config).toEqual({ url: URL_, anonKey: ANON_KEY })
  })

  it('names what is missing rather than building a client that cannot work', () => {
    const result = configFromEnv({ VITE_SUPABASE_URL: '' })

    expect(expectError(result)).toBe(ErrorCode.VALIDATION_REQUIRED_FIELD)
    expect(result.ok === false && result.error.details).toEqual({
      missing: ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'],
    })
  })
})
