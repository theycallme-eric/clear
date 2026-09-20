import { describe, expect, it } from 'vitest'

import { createError, ErrorCode, err, ok } from './errors'
import {
  viewEmpty,
  viewError,
  viewLoading,
  viewReady,
  viewStateFromResult,
} from './view-state'

describe('view-state model (CORE-04)', () => {
  it('constructors produce the four discriminants', () => {
    expect(viewLoading().status).toBe('loading')
    expect(viewEmpty().status).toBe('empty')
    expect(viewReady([1]).status).toBe('ready')

    const error = createError(ErrorCode.PERSISTENCE_READ_FAILED)
    const errored = viewError(error)
    expect(errored.status).toBe('error')
    if (errored.status === 'error') {
      expect(errored.error).toBe(error)
    }
  })

  it('a failed Result becomes the error state carrying the AppError', () => {
    const error = createError(ErrorCode.NETWORK_TIMEOUT, {
      requestId: 'req_test_abc123',
    })
    const state = viewStateFromResult(err(error))

    expect(state).toEqual({ status: 'error', error })
  })

  it('a successful Result with data becomes ready', () => {
    const state = viewStateFromResult(ok(['session-1']))

    expect(state).toEqual({ status: 'ready', data: ['session-1'] })
  })

  it('a successful Result with nothing to show becomes empty, not ready', () => {
    expect(viewStateFromResult(ok([]))).toEqual({ status: 'empty' })
  })

  it('non-array payloads use the caller-supplied emptiness check', () => {
    const state = viewStateFromResult(ok({ sessions: [] }), (data) => {
      return data.sessions.length === 0
    })

    expect(state).toEqual({ status: 'empty' })
  })
})
