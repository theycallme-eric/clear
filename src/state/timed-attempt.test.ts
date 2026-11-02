import { describe, expect, it } from 'vitest'
import { EMPTY_TIMED_ATTEMPT, activeSeconds, moveTimedAttempt, timedAttemptView } from './timed-attempt'

describe('paused section active time', () => {
  it('excludes paused time while a separate wall-clock workout can continue', () => {
    let state = moveTimedAttempt(EMPTY_TIMED_ATTEMPT, 'start', 1000)
    state = moveTimedAttempt(state, 'pause', 11000)
    expect(activeSeconds(state, 71000)).toBe(10)
    expect(timedAttemptView(state, 71000, 60)).toMatchObject({ phase: 'paused', remaining: 50 })
    state = moveTimedAttempt(state, 'resume', 71000)
    expect(timedAttemptView(state, 101000, 60)).toMatchObject({ phase: 'running', elapsed: 40, remaining: 20 })
    expect(timedAttemptView(state, 121000, 60)).toMatchObject({ phase: 'capped', elapsed: 60, remaining: 0 })
    expect((121000 - 1000) / 1000).toBe(120)
  })
  it('freezes a finish during pause at the active time already observed', () => {
    let state = moveTimedAttempt(EMPTY_TIMED_ATTEMPT, 'start', 1000)
    state = moveTimedAttempt(state, 'pause', 11000)
    state = moveTimedAttempt(state, 'finish', 71000)
    expect(timedAttemptView(state, 200000, 60)).toMatchObject({ phase: 'finished', elapsed: 10 })
  })
  it('keeps repeated starts and actions after a finish from resetting the attempt', () => {
    let state = moveTimedAttempt(EMPTY_TIMED_ATTEMPT, 'start', 1000)
    expect(moveTimedAttempt(state, 'start', 5000)).toBe(state)
    state = moveTimedAttempt(state, 'finish', 61000)
    expect(timedAttemptView(state, 100000, 60).phase).toBe('capped')
    expect(moveTimedAttempt(state, 'resume', 100000)).toBe(state)
  })
  it('supports multiple pauses and does not manufacture a cap for an open attempt', () => {
    let state = moveTimedAttempt(EMPTY_TIMED_ATTEMPT, 'start', 0)
    state = moveTimedAttempt(state, 'pause', 5000)
    state = moveTimedAttempt(state, 'resume', 15000)
    state = moveTimedAttempt(state, 'pause', 20000)
    state = moveTimedAttempt(state, 'resume', 30000)
    expect(timedAttemptView(state, 40000, null)).toMatchObject({ phase: 'running', elapsed: 20, remaining: null })
  })
})
