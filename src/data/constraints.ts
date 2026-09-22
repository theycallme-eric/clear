/**
 * DATA-05 — user-authored constraints, stored and read back.
 *
 * The table is `supabase/migrations/20260921000002_user_constraints.sql`; this
 * is the only way `src/` reaches it. Two things it deliberately is not:
 *
 *   * Not the shared Supabase client. DATA-03 owns `gen types` output and a
 *     thin client over the whole schema, and it depends on DATA-01d, which has
 *     not landed. So this module carries its own PostgREST calls and its own
 *     hand-written types for one table. When DATA-03 lands, the transport here
 *     collapses into it — the domain types and the mapping do not.
 *   * Not a parser. `note` is carried through untouched in both directions. No
 *     constraint is ever inferred from free text (DATA_MODEL §5).
 *
 * The domain type is a discriminated union over `scope`, so the database's two
 * target CHECK constraints are also compile-time facts: there is no way to
 * write an equipment constraint that carries an exercise id, and no reader has
 * to handle the row that would be.
 */

import {
  ErrorCode,
  createError,
  err,
  ok,
  type AppError,
  type Result,
} from '../state/errors'

// ─────────────────────────────────────────────────────────────────────────────
// Vocabulary
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `constraint_scope`. Three scopes, every one enforceable against catalog data
 * that exists. There is no `impact` scope — the catalog carries no impact
 * tagging, and DATA-05 does not offer a control that silently does nothing.
 */
export const CONSTRAINT_SCOPES = [
  'exercise',
  'movement_pattern',
  'equipment',
] as const
export type ConstraintScope = (typeof CONSTRAINT_SCOPES)[number]

/**
 * `constraint_action`. Only `exclude` filters. `avoid` and `prefer_not`
 * persist and reach Claude as a deprioritize list; the UI exposes `exclude`
 * alone until a ranking layer consumes the other two.
 */
export const CONSTRAINT_ACTIONS = ['exclude', 'avoid', 'prefer_not'] as const
export type ConstraintAction = (typeof CONSTRAINT_ACTIONS)[number]

/** The actions a user-facing control may currently set (DATA_MODEL §5). */
export const USER_SETTABLE_ACTIONS = ['exclude'] as const satisfies readonly ConstraintAction[]

/** `constraint_persistence`. "This session" or "persistent". */
export const CONSTRAINT_PERSISTENCE = ['session', 'persistent'] as const
export type ConstraintPersistence = (typeof CONSTRAINT_PERSISTENCE)[number]

/** `movement_pattern`, from the catalog domain (DATA-01a §1). */
export const MOVEMENT_PATTERNS = [
  'squat',
  'hinge',
  'press',
  'pull',
  'power',
  'unilateral',
  'conditioning',
] as const
export type MovementPattern = (typeof MOVEMENT_PATTERNS)[number]

// ─────────────────────────────────────────────────────────────────────────────
// Domain type
// ─────────────────────────────────────────────────────────────────────────────

/** Exactly one target, and it is the one the scope names. */
export type ConstraintTarget =
  | { readonly scope: 'exercise'; readonly exerciseId: string }
  | { readonly scope: 'movement_pattern'; readonly pattern: MovementPattern }
  | { readonly scope: 'equipment'; readonly equipmentId: string }

/**
 * How long it lasts. A session-scoped constraint names its session, so
 * "applies forever because nobody recorded which session" is not representable.
 */
export type ConstraintPersistenceSpec =
  | { readonly persistence: 'persistent' }
  | { readonly persistence: 'session'; readonly sessionId: string }

export interface UserConstraint {
  readonly id: string
  readonly userId: string
  readonly action: ConstraintAction
  readonly target: ConstraintTarget
  readonly appliesTo: ConstraintPersistenceSpec
  /** Stored and shown back verbatim. Never parsed. */
  readonly note: string | null
  readonly createdAt: string
}

/** A constraint before the database gives it an id and a creation time. */
export interface NewUserConstraint {
  readonly userId: string
  readonly action: ConstraintAction
  readonly target: ConstraintTarget
  readonly appliesTo: ConstraintPersistenceSpec
  /** Optional, and absent is not the empty string — it is no note at all. */
  readonly note?: string | null
}

/** The row as PostgREST sends and receives it. */
export interface UserConstraintRow {
  id: string
  user_id: string
  scope: ConstraintScope
  action: ConstraintAction
  persistence: ConstraintPersistence
  applies_to_session_id: string | null
  target_exercise_id: string | null
  target_pattern: MovementPattern | null
  target_equipment: string | null
  note: string | null
  created_at: string
}

/** The insert payload: the database supplies `id` and `created_at`. */
export type NewUserConstraintRow = Omit<UserConstraintRow, 'id' | 'created_at'>

// ─────────────────────────────────────────────────────────────────────────────
// Mapping
// ─────────────────────────────────────────────────────────────────────────────

/** Domain → row. The three target columns, exactly one of them populated. */
export function toRow(constraint: NewUserConstraint): NewUserConstraintRow {
  const { target } = constraint

  return {
    user_id: constraint.userId,
    scope: target.scope,
    action: constraint.action,
    persistence: constraint.appliesTo.persistence,
    applies_to_session_id:
      constraint.appliesTo.persistence === 'session'
        ? constraint.appliesTo.sessionId
        : null,
    target_exercise_id: target.scope === 'exercise' ? target.exerciseId : null,
    target_pattern: target.scope === 'movement_pattern' ? target.pattern : null,
    target_equipment: target.scope === 'equipment' ? target.equipmentId : null,
    note: constraint.note ?? null,
  }
}

/**
 * Row → domain, validating rather than asserting. What arrives over the wire
 * is `unknown`: a row whose scope and target disagree cannot come from this
 * schema, so if one does, the honest answer is a typed error and not a cast.
 */
export function fromRow(row: unknown): Result<UserConstraint> {
  if (typeof row !== 'object' || row === null) return err(malformed({ row }))

  const candidate = row as Partial<UserConstraintRow>
  const { id, user_id, scope, action, persistence, created_at } = candidate

  if (
    typeof id !== 'string' ||
    typeof user_id !== 'string' ||
    typeof created_at !== 'string' ||
    !isOneOf(scope, CONSTRAINT_SCOPES) ||
    !isOneOf(action, CONSTRAINT_ACTIONS) ||
    !isOneOf(persistence, CONSTRAINT_PERSISTENCE)
  ) {
    return err(malformed({ id }))
  }

  const target = targetFromRow(scope, candidate)
  if (target === null) return err(malformed({ id, scope }))

  const appliesTo = persistenceFromRow(persistence, candidate)
  if (appliesTo === null) return err(malformed({ id, persistence }))

  return ok({
    id,
    userId: user_id,
    action,
    target,
    appliesTo,
    note: typeof candidate.note === 'string' ? candidate.note : null,
    createdAt: created_at,
  })
}

function targetFromRow(
  scope: ConstraintScope,
  row: Partial<UserConstraintRow>,
): ConstraintTarget | null {
  switch (scope) {
    case 'exercise':
      return typeof row.target_exercise_id === 'string'
        ? { scope, exerciseId: row.target_exercise_id }
        : null
    case 'movement_pattern':
      return isOneOf(row.target_pattern, MOVEMENT_PATTERNS)
        ? { scope, pattern: row.target_pattern }
        : null
    case 'equipment':
      return typeof row.target_equipment === 'string'
        ? { scope, equipmentId: row.target_equipment }
        : null
  }
}

function persistenceFromRow(
  persistence: ConstraintPersistence,
  row: Partial<UserConstraintRow>,
): ConstraintPersistenceSpec | null {
  if (persistence === 'persistent') return { persistence }

  // The database's `session_scope_has_session` CHECK makes the null impossible;
  // this is the client saying so rather than assuming it.
  return typeof row.applies_to_session_id === 'string'
    ? { persistence, sessionId: row.applies_to_session_id }
    : null
}

function isOneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
}

function malformed(details: Record<string, unknown>): AppError {
  return createError(ErrorCode.PERSISTENCE_READ_FAILED, { details })
}

// ─────────────────────────────────────────────────────────────────────────────
// Client
// ─────────────────────────────────────────────────────────────────────────────

export interface UserConstraintsClientConfig {
  /** The Supabase project URL — `VITE_SUPABASE_URL`. */
  url: string
  /** The public anon key — `VITE_SUPABASE_ANON_KEY`. RLS is the boundary. */
  anonKey: string
  /**
   * The signed-in user's access token. Absent means anonymous, which every
   * policy on this table refuses; the client says so before making the call.
   */
  accessToken?: string | null
  fetch?: typeof globalThis.fetch
}

export interface UserConstraintsClient {
  /** Persists one constraint and returns it as the database stored it. */
  add(constraint: NewUserConstraint): Promise<Result<UserConstraint>>
  /** Every constraint this user has, oldest first. */
  list(userId: string): Promise<Result<UserConstraint[]>>
  /**
   * The constraints in force for one session: persistent always, session-scoped
   * only for its own session. `sessionId` omitted means "no session yet", which
   * is the persistent set alone.
   */
  listInForce(
    userId: string,
    sessionId?: string | null,
  ): Promise<Result<UserConstraint[]>>
  /** Removes one constraint. Changing your mind is the normal case. */
  remove(id: string): Promise<Result<void>>
}

const TABLE = 'user_constraints'
const IN_FORCE_RPC = 'constraints_in_force'

export function createUserConstraintsClient(
  config: UserConstraintsClientConfig,
): UserConstraintsClient {
  const base = `${config.url.replace(/\/+$/, '')}/rest/v1`
  const fetchImpl = config.fetch ?? globalThis.fetch

  const request = async (
    path: string,
    init: RequestInit & { headers?: Record<string, string> },
  ): Promise<Result<unknown>> => {
    if (!config.accessToken) {
      return err(createError(ErrorCode.AUTH_UNAUTHENTICATED))
    }

    let response: Response
    try {
      response = await fetchImpl(`${base}${path}`, {
        ...init,
        headers: {
          apikey: config.anonKey,
          Authorization: `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json',
          ...init.headers,
        },
      })
    } catch (error) {
      return err(
        createError(ErrorCode.NETWORK_OFFLINE, {
          details: {
            reason: error instanceof Error ? error.message : String(error),
          },
        }),
      )
    }

    if (!response.ok) return err(await transportError(response, init.method))

    // 204 has no body, and `remove` is the caller that asks for one.
    if (response.status === 204) return ok(null)

    try {
      return ok(await response.json())
    } catch {
      return err(malformed({ status: response.status }))
    }
  }

  const rows = (payload: unknown): Result<UserConstraint[]> => {
    if (!Array.isArray(payload)) return err(malformed({ payload: typeof payload }))

    const parsed: UserConstraint[] = []
    for (const row of payload) {
      const result = fromRow(row)
      if (!result.ok) return result
      parsed.push(result.value)
    }

    return ok(parsed)
  }

  return {
    async add(constraint) {
      const result = await request(`/${TABLE}`, {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(toRow(constraint)),
      })
      if (!result.ok) return result

      const parsed = rows(result.value)
      if (!parsed.ok) return parsed

      const [stored] = parsed.value
      return stored ? ok(stored) : err(malformed({ returned: 0 }))
    },

    async list(userId) {
      const query = new URLSearchParams({
        select: '*',
        user_id: `eq.${userId}`,
        order: 'created_at.asc,id.asc',
      })
      const result = await request(`/${TABLE}?${query}`, { method: 'GET' })

      return result.ok ? rows(result.value) : result
    },

    async listInForce(userId, sessionId) {
      // The filter lives in SQL, not here: the same function the eligibility
      // query calls answers this, so the UI and generation cannot disagree
      // about which constraints apply to a session.
      const result = await request(`/rpc/${IN_FORCE_RPC}`, {
        method: 'POST',
        body: JSON.stringify({
          p_user_id: userId,
          p_session_id: sessionId ?? null,
        }),
      })

      return result.ok ? rows(result.value) : result
    },

    async remove(id) {
      const query = new URLSearchParams({ id: `eq.${id}` })
      const result = await request(`/${TABLE}?${query}`, { method: 'DELETE' })

      return result.ok ? ok(undefined) : result
    },
  }
}

/**
 * HTTP status → the error taxonomy. A write refused by RLS is not a network
 * problem and must not read as one: 401/403 on this table means the caller is
 * not the owner, which is `AUTH_UNAUTHORIZED` and never retryable.
 */
async function transportError(
  response: Response,
  method: string | undefined,
): Promise<AppError> {
  const writing = method !== undefined && method !== 'GET'
  const details: Record<string, unknown> = { status: response.status }

  // PostgREST states which constraint refused a row. Useful in a log, never in
  // a user-facing message — `createError` supplies that from the code.
  try {
    const body: unknown = await response.json()
    if (typeof body === 'object' && body !== null && 'code' in body) {
      details.pgCode = (body as { code?: unknown }).code
    }
  } catch {
    // A body that is not JSON tells us nothing the status has not already.
  }

  if (response.status === 401 || response.status === 403) {
    return createError(ErrorCode.AUTH_UNAUTHORIZED, { details })
  }
  if (response.status === 409) {
    return createError(ErrorCode.PERSISTENCE_CONFLICT, { details })
  }
  if (response.status === 429) {
    return createError(ErrorCode.NETWORK_RATE_LIMITED, { details })
  }
  // 400 on this table is a CHECK constraint refusing the row — the scope and
  // the target disagreeing, or a session-scoped row with no session.
  if (response.status === 400 || response.status === 422) {
    return createError(ErrorCode.VALIDATION_CONSTRAINT, { details })
  }
  if (response.status >= 500) {
    return createError(ErrorCode.NETWORK_SERVER_ERROR, { details })
  }

  return createError(
    writing
      ? ErrorCode.PERSISTENCE_WRITE_FAILED
      : ErrorCode.PERSISTENCE_READ_FAILED,
    { details },
  )
}
