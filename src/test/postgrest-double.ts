/**
 * A PostgREST stand-in for `user_constraints` (DATA-05).
 *
 * What it is for. The migration cannot be executed here: the off-machine-backup
 * gate in `docs/backend/live-inventory.md` forbids mutating the live project
 * until TASK-072, and ENV-04 keeps Docker out of the loop, so there is no local
 * Postgres to round-trip against. The behavioural proof against a real database
 * is ENV-07's continuous job.
 *
 * So this double holds the table's rules in the one place a test can execute
 * them: the three CHECK constraints, the duplicate index, owner-only RLS, and
 * the `constraints_in_force` filter — each one transcribed from
 * `supabase/migrations/20260921000002_user_constraints.sql`, which is asserted
 * against separately in `src/test/user-constraints-migration.test.ts`. A test
 * using it proves the client speaks PostgREST correctly and maps rows
 * losslessly; it does not prove Postgres agrees, and nothing here should be
 * read as claiming that.
 *
 * Deterministic on purpose: ids and timestamps come from a counter, so an
 * ordering assertion is about the order and not about the clock.
 */

import type { UserConstraintRow } from '../data/constraints'

export interface PostgrestDoubleOptions {
  /** The project URL the client is configured with. */
  url: string
  /** The anon key the project accepts. Anything else is answered 401. */
  anonKey: string
  /** Access token → the user id it authenticates. */
  users: Record<string, string>
  /** Exercise ids the catalog holds, for the `target_exercise_id` FK. */
  exerciseIds?: readonly string[]
  /** Rows already in the table. */
  rows?: readonly UserConstraintRow[]
}

export interface PostgrestDouble {
  fetch: typeof globalThis.fetch
  /** Everything stored, RLS ignored — the test's view, not a caller's. */
  rows(): UserConstraintRow[]
  /** Every request the double answered, in order. */
  requests(): { method: string; path: string }[]
}

const SCOPE_TARGET: Record<string, keyof UserConstraintRow> = {
  exercise: 'target_exercise_id',
  movement_pattern: 'target_pattern',
  equipment: 'target_equipment',
}

export function createPostgrestDouble(
  options: PostgrestDoubleOptions,
): PostgrestDouble {
  const base = new URL(`${options.url.replace(/\/+$/, '')}/rest/v1`)
  const table: UserConstraintRow[] = [...(options.rows ?? [])]
  const seen: { method: string; path: string }[] = []
  let sequence = 0

  const fetchImpl: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : String(input))
    const method = init?.method ?? 'GET'
    const path = url.pathname.slice(base.pathname.length)

    seen.push({ method, path })

    const headers = new Headers(init?.headers)
    if (headers.get('apikey') !== options.anonKey) {
      return problem(401, '42501', 'invalid api key')
    }

    const token = headers.get('Authorization')?.replace(/^Bearer /, '') ?? ''
    const caller = options.users[token]
    // No policy matches an unauthenticated request; PostgREST answers 401.
    if (caller === undefined) return problem(401, '42501', 'invalid claim')

    const body = init?.body === undefined ? undefined : JSON.parse(String(init.body))

    if (path === '/user_constraints' && method === 'POST') {
      return insert(body, caller, headers)
    }
    if (path === '/user_constraints' && method === 'GET') {
      return select(url, caller)
    }
    if (path === '/user_constraints' && method === 'DELETE') {
      return remove(url, caller)
    }
    if (path === '/rpc/constraints_in_force' && method === 'POST') {
      return inForce(body, caller)
    }

    return problem(404, 'PGRST202', `no route for ${method} ${path}`)
  }

  function insert(
    payload: unknown,
    caller: string,
    headers: Headers,
  ): Response {
    const row = payload as Partial<UserConstraintRow>

    if (
      typeof row.user_id !== 'string' ||
      row.scope === undefined ||
      row.action === undefined
    ) {
      return problem(
        400,
        '23502',
        'null value in column violates not-null constraint',
      )
    }

    // RLS: the WITH CHECK predicate on user_constraints_insert_own.
    if (row.user_id !== caller) {
      return problem(403, '42501', 'new row violates row-level security policy')
    }

    const targets = [
      row.target_exercise_id,
      row.target_pattern,
      row.target_equipment,
    ].filter((target) => target !== null && target !== undefined)

    if (targets.length !== 1) {
      return check('user_constraints_exactly_one_target')
    }
    const targetColumn = SCOPE_TARGET[row.scope]
    if (targetColumn === undefined || row[targetColumn] === null || row[targetColumn] === undefined) {
      return check('user_constraints_target_matches_scope')
    }
    if (row.target_equipment !== null && row.target_equipment?.trim() === '') {
      return check('user_constraints_target_equipment_not_blank')
    }
    if (row.persistence !== 'persistent' && !row.applies_to_session_id) {
      return check('user_constraints_session_scope_has_session')
    }
    if (
      options.exerciseIds !== undefined &&
      row.target_exercise_id !== null &&
      row.target_exercise_id !== undefined &&
      !options.exerciseIds.includes(row.target_exercise_id)
    ) {
      return problem(
        409,
        '23503',
        'violates foreign key constraint on exercise_definitions',
      )
    }

    const stored: UserConstraintRow = {
      id: `constraint-${++sequence}`,
      user_id: row.user_id,
      scope: row.scope,
      action: row.action,
      persistence: row.persistence ?? 'persistent',
      applies_to_session_id: row.applies_to_session_id ?? null,
      target_exercise_id: row.target_exercise_id ?? null,
      target_pattern: row.target_pattern ?? null,
      target_equipment: row.target_equipment ?? null,
      note: row.note ?? null,
      created_at: `2026-09-21T00:00:${String(sequence).padStart(2, '0')}Z`,
    }

    if (table.some((existing) => duplicates(existing, stored))) {
      return problem(409, '23505', 'duplicate key value violates unique constraint')
    }

    table.push(stored)

    return headers.get('Prefer')?.includes('return=representation')
      ? json(200, [stored])
      : new Response(null, { status: 201 })
  }

  function select(url: URL, caller: string): Response {
    // RLS narrows to the caller first; an explicit user_id filter can only
    // narrow further, exactly as the policy and the query compose in Postgres.
    const wanted = eq(url.searchParams.get('user_id'))
    const visible = table
      .filter((row) => row.user_id === caller)
      .filter((row) => wanted === null || row.user_id === wanted)

    return json(200, ordered(visible, url.searchParams.get('order')))
  }

  function remove(url: URL, caller: string): Response {
    const id = eq(url.searchParams.get('id'))
    const index = table.findIndex(
      (row) => row.id === id && row.user_id === caller,
    )

    if (index >= 0) table.splice(index, 1)

    // No Prefer: return=representation, so PostgREST answers 204 whether or not
    // a row matched — a delete of something already gone is not an error.
    return new Response(null, { status: 204 })
  }

  function inForce(payload: unknown, caller: string): Response {
    const args = payload as { p_user_id?: string; p_session_id?: string | null }
    const sessionId = args.p_session_id ?? null

    const rows = table
      .filter((row) => row.user_id === caller && row.user_id === args.p_user_id)
      .filter(
        (row) =>
          row.persistence === 'persistent' ||
          (sessionId !== null && row.applies_to_session_id === sessionId),
      )

    return json(200, ordered(rows, 'created_at.asc,id.asc'))
  }

  return {
    fetch: fetchImpl,
    rows: () => [...table],
    requests: () => [...seen],
  }
}

/** The expression behind `user_constraints_no_duplicates_idx`. */
function duplicates(a: UserConstraintRow, b: UserConstraintRow): boolean {
  const target = (row: UserConstraintRow) =>
    row.target_exercise_id ?? row.target_pattern ?? row.target_equipment

  return (
    a.user_id === b.user_id &&
    a.scope === b.scope &&
    a.action === b.action &&
    target(a) === target(b) &&
    (a.applies_to_session_id ?? null) === (b.applies_to_session_id ?? null)
  )
}

function ordered(
  rows: readonly UserConstraintRow[],
  order: string | null,
): UserConstraintRow[] {
  if (order === null) return [...rows]

  return [...rows].sort((a, b) =>
    a.created_at === b.created_at
      ? a.id.localeCompare(b.id)
      : a.created_at.localeCompare(b.created_at),
  )
}

function eq(filter: string | null): string | null {
  return filter?.startsWith('eq.') === true ? filter.slice(3) : null
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function check(constraint: string): Response {
  return problem(400, '23514', `violates check constraint "${constraint}"`)
}

function problem(status: number, code: string, message: string): Response {
  return json(status, { code, message })
}
