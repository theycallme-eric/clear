import { describe, expect, it } from 'vitest'

import { reconstructionFixture } from '../test/workout-double'
import { isOutdatedSnapshot } from './favorites'
import { CONTRACT_VERSION, type SessionReconstruction } from './schemas'
import {
  RESTART_FAILED_MESSAGE,
  RESTART_NOT_COMPLETED_MESSAGE,
  RESTART_UNSUPPORTED_MESSAGE,
  restartAcceptance,
  restartEligibility,
  restartFailureMessage,
} from './session-restart'

function intended(
  overrides: { state?: SessionReconstruction['state']; contract?: string; empty?: boolean } = {},
): SessionReconstruction {
  const record = reconstructionFixture({
    title: 'Tuesday pull',
    state: overrides.state ?? 'completed',
    reconstruction: 'intended_at_start',
    sections: overrides.empty === true ? [] : [{ title: 'Main', blocks: [{ exercises: ['completed'] }] }],
  })
  return {
    ...record,
    session: { ...record.session, contract_version: overrides.contract ?? CONTRACT_VERSION },
  }
}

describe('restartEligibility', () => {
  it('offers a completed session recorded under a contract this build reads', () => {
    expect(restartEligibility(intended())).toEqual({ available: true })
  })

  it('explains a session that was not completed', () => {
    expect(restartEligibility(intended({ state: 'abandoned' }))).toEqual({
      available: false,
      reason: 'not_completed',
      message: RESTART_NOT_COMPLETED_MESSAGE,
    })
  })

  it('explains a legacy contract rather than offering a restart that would fail', () => {
    expect(restartEligibility(intended({ contract: '3.0.0' }))).toEqual({
      available: false,
      reason: 'unsupported_contract',
      message: RESTART_UNSUPPORTED_MESSAGE,
    })
  })
})

describe('restartAcceptance', () => {
  it('rebuilds the stored prescription as an acceptance dated today', () => {
    const rebuilt = restartAcceptance(intended(), '2026-09-29')

    expect(rebuilt.ok).toBe(true)
    if (!rebuilt.ok) return
    expect(rebuilt.value.date).toBe('2026-09-29')
    expect(rebuilt.value.workout.title).toBe('Tuesday pull')
    expect(rebuilt.value.workout.sections).toHaveLength(1)
  })

  it('refuses a version it cannot validate by name', () => {
    const rebuilt = restartAcceptance(intended({ contract: '3.0.0' }), '2026-09-29')

    expect(rebuilt.ok).toBe(false)
    if (rebuilt.ok) return
    expect(isOutdatedSnapshot(rebuilt.error)).toBe(true)
    expect(rebuilt.error.details?.snapshot_contract_version).toBe('3.0.0')
    expect(restartFailureMessage(rebuilt.error)).toBe(RESTART_UNSUPPORTED_MESSAGE)
  })

  it('refuses a rebuild that does not validate', () => {
    const rebuilt = restartAcceptance(intended({ empty: true }), '2026-09-29')

    expect(rebuilt.ok).toBe(false)
    if (rebuilt.ok) return
    expect(restartFailureMessage(rebuilt.error)).toBe(RESTART_FAILED_MESSAGE)
  })
})
