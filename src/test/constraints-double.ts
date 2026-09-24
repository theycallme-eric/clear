/**
 * DATA-05's client as a double, for the tests that read constraints through
 * React rather than through PostgREST (REQ-057's boot check is the first).
 *
 * The default answers an empty set: a user with no constraints is the ordinary
 * case, and it is not an error.
 */
import type {
  UserConstraint,
  UserConstraintsClient,
} from '../data/constraints'
import { createError, err, ErrorCode, ok, type Result } from '../state/errors'

export interface FakeConstraintsOptions {
  /** What `listInForce` answers. Defaults to no constraints. */
  readonly listInForce?: (
    userId: string,
    sessionId?: string | null,
  ) => Promise<Result<UserConstraint[]>>
  /**
   * SET-01's writes, in memory. Seeded rows are what `listInForce` answers
   * unless the resolver above says otherwise, and `add` / `remove` /
   * `setPatternNote` change the same set — so a test can save a limitation and
   * then read back what the next visit would see.
   */
  readonly stored?: readonly UserConstraint[]
  /** Fails every write, for the rollback case. */
  readonly writeError?: () => Result<never>
}

export interface FakeConstraintsClient extends UserConstraintsClient {
  /** Every user id `listInForce` was asked for, in order. */
  readonly inForceCalls: string[]
  /** The set as the writes have left it. */
  readonly rows: () => readonly UserConstraint[]
}

export function createFakeConstraintsClient(
  options: FakeConstraintsOptions = {},
): FakeConstraintsClient {
  const inForceCalls: string[] = []
  let stored: UserConstraint[] = [...(options.stored ?? [])]
  let nextId = stored.length + 1
  const refused = <T>(): Result<T> | null =>
    options.writeError === undefined ? null : options.writeError()

  return {
    inForceCalls,
    rows: () => stored,
    async listInForce(userId, sessionId) {
      inForceCalls.push(userId)
      if (options.listInForce) return options.listInForce(userId, sessionId)
      return ok(stored)
    },
    async list() {
      return ok(stored)
    },
    async add(constraint) {
      const failure = refused<UserConstraint>()
      if (failure !== null) return failure

      const row: UserConstraint = {
        id: `constraint-${nextId++}`,
        userId: constraint.userId,
        action: constraint.action,
        target: constraint.target,
        appliesTo: constraint.appliesTo,
        note: constraint.note ?? null,
        createdAt: '2026-09-22T09:00:00.000Z',
      }
      stored = [...stored, row]
      return ok(row)
    },
    async remove(id) {
      const failure = refused<void>()
      if (failure !== null) return failure

      stored = stored.filter((constraint) => constraint.id !== id)
      return ok(undefined)
    },
    async setPatternNote(userId, note) {
      const failure = refused<UserConstraint[]>()
      if (failure !== null) return failure

      // The same filter the real client's PATCH carries: persistent pattern
      // rows, this user's, and nothing else.
      stored = stored.map((constraint) =>
        constraint.userId === userId &&
        constraint.target.scope === 'movement_pattern' &&
        constraint.appliesTo.persistence === 'persistent'
          ? { ...constraint, note: note === null || note.trim() === '' ? null : note }
          : constraint,
      )
      return ok(stored.filter((constraint) => constraint.note !== null))
    },
  }
}

/** A write that fails, for the "optimistic update rolls back" case (SET-01). */
export function constraintWriteError(): Result<never> {
  return err(createError(ErrorCode.PERSISTENCE_WRITE_FAILED))
}
