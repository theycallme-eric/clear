/**
 * Factory functions for domain fixtures. A test that hand-builds a domain
 * object is a bug in this harness: add or extend a factory here instead, so
 * a schema change is one edit, not a hunt through the suite.
 *
 * Every factory returns a valid object and accepts partial overrides.
 */
import { createError, ErrorCode, type AppError } from '../state/errors'

export function makeAppError(overrides: Partial<AppError> = {}): AppError {
  return {
    ...createError(ErrorCode.NETWORK_SERVER_ERROR, {
      requestId: 'req_test_fixture',
    }),
    ...overrides,
  }
}
