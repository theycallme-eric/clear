import { describe, it, expect } from 'vitest'
import {
  ErrorCode,
  generateRequestId,
  createError,
  getErrorMessage,
  ok,
  err,
  isOk,
  isErr,
  unwrap,
  unwrapOr,
  isAppError,
  toAppError,
} from './errors'

describe('ErrorCode', () => {
  it('has all expected categories', () => {
    // Auth
    expect(ErrorCode.AUTH_UNAUTHENTICATED).toBe('AUTH_UNAUTHENTICATED')
    expect(ErrorCode.AUTH_SESSION_EXPIRED).toBe('AUTH_SESSION_EXPIRED')
    expect(ErrorCode.AUTH_UNAUTHORIZED).toBe('AUTH_UNAUTHORIZED')
    expect(ErrorCode.AUTH_INVALID_CREDENTIALS).toBe('AUTH_INVALID_CREDENTIALS')

    // Network
    expect(ErrorCode.NETWORK_OFFLINE).toBe('NETWORK_OFFLINE')
    expect(ErrorCode.NETWORK_TIMEOUT).toBe('NETWORK_TIMEOUT')
    expect(ErrorCode.NETWORK_SERVER_ERROR).toBe('NETWORK_SERVER_ERROR')
    expect(ErrorCode.NETWORK_RATE_LIMITED).toBe('NETWORK_RATE_LIMITED')

    // Validation
    expect(ErrorCode.VALIDATION_REQUIRED_FIELD).toBe('VALIDATION_REQUIRED_FIELD')
    expect(ErrorCode.VALIDATION_INVALID_FORMAT).toBe('VALIDATION_INVALID_FORMAT')
    expect(ErrorCode.VALIDATION_OUT_OF_RANGE).toBe('VALIDATION_OUT_OF_RANGE')
    expect(ErrorCode.VALIDATION_CONSTRAINT).toBe('VALIDATION_CONSTRAINT')

    // Generation
    expect(ErrorCode.GENERATION_FAILED).toBe('GENERATION_FAILED')
    expect(ErrorCode.GENERATION_TIMEOUT).toBe('GENERATION_TIMEOUT')
    expect(ErrorCode.GENERATION_INVALID_PARAMS).toBe('GENERATION_INVALID_PARAMS')
    expect(ErrorCode.GENERATION_MODEL_ERROR).toBe('GENERATION_MODEL_ERROR')

    // Persistence
    expect(ErrorCode.PERSISTENCE_NOT_FOUND).toBe('PERSISTENCE_NOT_FOUND')
    expect(ErrorCode.PERSISTENCE_CONFLICT).toBe('PERSISTENCE_CONFLICT')
    expect(ErrorCode.PERSISTENCE_WRITE_FAILED).toBe('PERSISTENCE_WRITE_FAILED')
    expect(ErrorCode.PERSISTENCE_READ_FAILED).toBe('PERSISTENCE_READ_FAILED')
  })
})

describe('generateRequestId', () => {
  it('generates IDs with correct format', () => {
    const id = generateRequestId()
    expect(id).toMatch(/^req_[a-z0-9]+_[a-z0-9]+$/)
  })

  it('generates unique IDs', () => {
    const ids = new Set<string>()
    for (let i = 0; i < 100; i++) {
      ids.add(generateRequestId())
    }
    expect(ids.size).toBe(100)
  })
})

describe('createError', () => {
  it('creates error with code and message', () => {
    const error = createError(ErrorCode.AUTH_UNAUTHENTICATED)
    expect(error.code).toBe(ErrorCode.AUTH_UNAUTHENTICATED)
    expect(error.message).toBe('Sign in to continue.')
    expect(error.requestId).toBeUndefined()
    expect(error.details).toBeUndefined()
  })

  it('creates error with requestId', () => {
    const requestId = generateRequestId()
    const error = createError(ErrorCode.NETWORK_TIMEOUT, { requestId })
    expect(error.requestId).toBe(requestId)
  })

  it('creates error with details', () => {
    const error = createError(ErrorCode.VALIDATION_REQUIRED_FIELD, {
      details: { field: 'email' },
    })
    expect(error.details).toEqual({ field: 'email' })
  })
})

describe('getErrorMessage', () => {
  it('returns user-safe messages for all error codes', () => {
    // Every error code must have a non-empty message
    const codes = Object.values(ErrorCode)
    for (const code of codes) {
      const message = getErrorMessage(code)
      expect(message).toBeDefined()
      expect(message.length).toBeGreaterThan(0)
    }
  })

  it('returns specific messages for each category', () => {
    // Auth messages
    expect(getErrorMessage(ErrorCode.AUTH_UNAUTHENTICATED)).toBe('Sign in to continue.')
    expect(getErrorMessage(ErrorCode.AUTH_SESSION_EXPIRED)).toBe('Session expired. Sign in again.')
    expect(getErrorMessage(ErrorCode.AUTH_UNAUTHORIZED)).toBe('Access denied.')
    expect(getErrorMessage(ErrorCode.AUTH_INVALID_CREDENTIALS)).toBe('Invalid email or password.')

    // Network messages
    expect(getErrorMessage(ErrorCode.NETWORK_OFFLINE)).toBe('No connection. Check your network.')
    expect(getErrorMessage(ErrorCode.NETWORK_TIMEOUT)).toBe('Request timed out. Try again.')
    expect(getErrorMessage(ErrorCode.NETWORK_SERVER_ERROR)).toBe('Server error. Try again later.')
    expect(getErrorMessage(ErrorCode.NETWORK_RATE_LIMITED)).toBe('Too many requests. Wait a moment.')

    // Validation messages
    expect(getErrorMessage(ErrorCode.VALIDATION_REQUIRED_FIELD)).toBe('Required field missing.')
    expect(getErrorMessage(ErrorCode.VALIDATION_INVALID_FORMAT)).toBe('Invalid format.')
    expect(getErrorMessage(ErrorCode.VALIDATION_OUT_OF_RANGE)).toBe('Value out of range.')
    expect(getErrorMessage(ErrorCode.VALIDATION_CONSTRAINT)).toBe('Constraint violated.')

    // Generation messages
    expect(getErrorMessage(ErrorCode.GENERATION_FAILED)).toBe('Could not generate workout. Try again.')
    expect(getErrorMessage(ErrorCode.GENERATION_TIMEOUT)).toBe('Generation took too long. Try simpler options.')
    expect(getErrorMessage(ErrorCode.GENERATION_INVALID_PARAMS)).toBe('Invalid generation parameters.')
    expect(getErrorMessage(ErrorCode.GENERATION_MODEL_ERROR)).toBe('Generation service error. Try again.')

    // Persistence messages
    expect(getErrorMessage(ErrorCode.PERSISTENCE_NOT_FOUND)).toBe('Not found.')
    expect(getErrorMessage(ErrorCode.PERSISTENCE_CONFLICT)).toBe('Data conflict. Refresh and try again.')
    expect(getErrorMessage(ErrorCode.PERSISTENCE_WRITE_FAILED)).toBe('Could not save. Try again.')
    expect(getErrorMessage(ErrorCode.PERSISTENCE_READ_FAILED)).toBe('Could not load. Try again.')
  })
})

describe('Result helpers', () => {
  describe('ok', () => {
    it('creates successful result', () => {
      const result = ok(42)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toBe(42)
      }
    })
  })

  describe('err', () => {
    it('creates failed result', () => {
      const error = createError(ErrorCode.NETWORK_OFFLINE)
      const result = err(error)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe(error)
      }
    })
  })

  describe('isOk', () => {
    it('returns true for successful results', () => {
      expect(isOk(ok(42))).toBe(true)
    })

    it('returns false for failed results', () => {
      expect(isOk(err(createError(ErrorCode.NETWORK_OFFLINE)))).toBe(false)
    })
  })

  describe('isErr', () => {
    it('returns true for failed results', () => {
      expect(isErr(err(createError(ErrorCode.NETWORK_OFFLINE)))).toBe(true)
    })

    it('returns false for successful results', () => {
      expect(isErr(ok(42))).toBe(false)
    })
  })

  describe('unwrap', () => {
    it('returns value for successful results', () => {
      expect(unwrap(ok(42))).toBe(42)
    })

    it('throws for failed results', () => {
      const error = createError(ErrorCode.NETWORK_OFFLINE)
      expect(() => unwrap(err(error))).toThrow(error)
    })
  })

  describe('unwrapOr', () => {
    it('returns value for successful results', () => {
      expect(unwrapOr(ok(42), 0)).toBe(42)
    })

    it('returns default for failed results', () => {
      expect(unwrapOr(err(createError(ErrorCode.NETWORK_OFFLINE)), 0)).toBe(0)
    })
  })
})

describe('isAppError', () => {
  it('returns true for AppError objects', () => {
    const error = createError(ErrorCode.AUTH_UNAUTHENTICATED)
    expect(isAppError(error)).toBe(true)
  })

  it('returns false for non-objects', () => {
    expect(isAppError(null)).toBe(false)
    expect(isAppError(undefined)).toBe(false)
    expect(isAppError('string')).toBe(false)
    expect(isAppError(42)).toBe(false)
  })

  it('returns false for objects without required fields', () => {
    expect(isAppError({})).toBe(false)
    expect(isAppError({ code: 'TEST' })).toBe(false)
    expect(isAppError({ message: 'Test' })).toBe(false)
  })
})

describe('toAppError', () => {
  it('returns AppError unchanged', () => {
    const error = createError(ErrorCode.AUTH_UNAUTHENTICATED)
    expect(toAppError(error)).toBe(error)
  })

  it('attaches requestId to existing AppError', () => {
    const error = createError(ErrorCode.AUTH_UNAUTHENTICATED)
    const requestId = generateRequestId()
    const result = toAppError(error, ErrorCode.NETWORK_SERVER_ERROR, requestId)
    expect(result.code).toBe(ErrorCode.AUTH_UNAUTHENTICATED)
    expect(result.requestId).toBe(requestId)
  })

  it('wraps Error instances', () => {
    const error = new Error('Something went wrong')
    const result = toAppError(error)
    expect(result.code).toBe(ErrorCode.NETWORK_SERVER_ERROR)
    expect(result.details).toEqual({ originalMessage: 'Something went wrong' })
  })

  it('wraps string errors', () => {
    const result = toAppError('string error')
    expect(result.code).toBe(ErrorCode.NETWORK_SERVER_ERROR)
    expect(result.details).toEqual({ original: 'string error' })
  })

  it('uses custom fallback code', () => {
    const result = toAppError('error', ErrorCode.PERSISTENCE_READ_FAILED)
    expect(result.code).toBe(ErrorCode.PERSISTENCE_READ_FAILED)
  })
})
