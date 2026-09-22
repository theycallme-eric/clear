/**
 * DATA-05 — user-authored constraints, stored and read back.
 *
 * The table is `supabase/migrations/20260921000002_user_constraints.sql`; this
 * is the only way `src/` reaches it. Two things it deliberately is not:
 *
 *   * Not the transport. It was, while DATA-03 waited on DATA-01d; now the
 *     PostgREST calls are `supabase.ts`'s and the row type is the generated
 *     one, so a column renamed in a migration fails to compile here. What
 *     stayed is what this module is actually for: the domain type, and the
 *     mapping to and from the row.
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
import type { Enums, Tables, TablesInsert } from './database.types'
import { createSupabaseClient, type SupabaseConfig } from './supabase'

// ─────────────────────────────────────────────────────────────────────────────
// Vocabulary
// ─────────────────────────────────────────────────────────────────────────────
//
// Each type is the generated enum, so the vocabulary cannot drift from the
// database's. The arrays beside them are the runtime form the validators and
// the UI iterate; `satisfies` keeps every member a real value of its enum, and
// `src/data/supabase.test.ts` checks that none is missing.

/**
 * `constraint_scope`. Three scopes, every one enforceable against catalog data
 * that exists. There is no `impact` scope — the catalog carries no impact
 * tagging, and DATA-05 does not offer a control that silently does nothing.
 */
export type ConstraintScope = Enums<'constraint_scope'>
export const CONSTRAINT_SCOPES = [
  'exercise',
  'movement_pattern',
  'equipment',
] as const satisfies readonly ConstraintScope[]

/**
 * `constraint_action`. Only `exclude` filters. `avoid` and `prefer_not`
 * persist and reach Claude as a deprioritize list; the UI exposes `exclude`
 * alone until a ranking layer consumes the other two.
 */
export type ConstraintAction = Enums<'constraint_action'>
export const CONSTRAINT_ACTIONS = [
  'exclude',
  'avoid',
  'prefer_not',
] as const satisfies readonly ConstraintAction[]

/** The actions a user-facing control may currently set (DATA_MODEL §5). */
export const USER_SETTABLE_ACTIONS = ['exclude'] as const satisfies readonly ConstraintAction[]

/** `constraint_persistence`. "This session" or "persistent". */
export type ConstraintPersistence = Enums<'constraint_persistence'>
export const CONSTRAINT_PERSISTENCE = [
  'session',
  'persistent',
] as const satisfies readonly ConstraintPersistence[]

/** `movement_pattern`, from the catalog domain (DATA-01a §1). */
export type MovementPattern = Enums<'movement_pattern'>
export const MOVEMENT_PATTERNS = [
  'squat',
  'hinge',
  'press',
  'pull',
  'power',
  'unilateral',
  'conditioning',
] as const satisfies readonly MovementPattern[]

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

/** The row as PostgREST sends it — the generated one, not a copy of it. */
export type UserConstraintRow = Tables<'user_constraints'>

/** The insert payload: the database supplies `id` and `created_at`. */
export type NewUserConstraintRow = TablesInsert<'user_constraints'>

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

/** The shared client's configuration; this module adds nothing to it. */
export type UserConstraintsClientConfig = SupabaseConfig

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
  const db = createSupabaseClient(config)

  /**
   * Rows → domain, validated one at a time; the first bad row is the answer.
   * The client hands over rows already typed as this table's, and this still
   * checks them: a type is a claim about the schema, not about what arrived.
   */
  const rows = (payload: readonly UserConstraintRow[]): Result<UserConstraint[]> => {
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
      const result = await db.from(TABLE).insert(toRow(constraint))
      if (!result.ok) return result

      const parsed = rows(result.value)
      if (!parsed.ok) return parsed

      const [stored] = parsed.value
      return stored ? ok(stored) : err(malformed({ returned: 0 }))
    },

    async list(userId) {
      const result = await db.from(TABLE).select({
        where: { user_id: userId },
        order: [{ column: 'created_at' }, { column: 'id' }],
      })

      return result.ok ? rows(result.value) : result
    },

    async listInForce(userId, sessionId) {
      // The filter lives in SQL, not here: the same function the eligibility
      // query calls answers this, so the UI and generation cannot disagree
      // about which constraints apply to a session.
      const result = await db.rpc(IN_FORCE_RPC, {
        p_user_id: userId,
        p_session_id: sessionId ?? null,
      })

      return result.ok ? rows(result.value) : result
    },

    async remove(id) {
      return db.from(TABLE).delete({ id })
    },
  }
}
