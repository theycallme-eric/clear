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
}

export interface FakeConstraintsClient extends UserConstraintsClient {
  /** Every user id `listInForce` was asked for, in order. */
  readonly inForceCalls: string[]
}

export function createFakeConstraintsClient(
  options: FakeConstraintsOptions = {},
): FakeConstraintsClient {
  const inForceCalls: string[] = []
  const unsupported = <T>(method: string): Promise<Result<T>> =>
    Promise.resolve(
      err(
        createError(ErrorCode.VALIDATION_REQUIRED_FIELD, {
          details: { unsupported: method },
        }),
      ),
    )

  return {
    inForceCalls,
    async listInForce(userId, sessionId) {
      inForceCalls.push(userId)
      if (options.listInForce) return options.listInForce(userId, sessionId)
      return ok([])
    },
    add: () => unsupported('constraints.add'),
    list: () => unsupported('constraints.list'),
    remove: () => unsupported('constraints.remove'),
  }
}
