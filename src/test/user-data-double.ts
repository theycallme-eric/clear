/**
 * AUTH-03's two reads, in memory.
 *
 * Every call is recorded, because most of what this requirement asks for is a
 * statement about *how many* calls happened: one per key, none on a token
 * refresh, and one per retry. A double that only returned data could not
 * answer any of those.
 *
 * Each read has its own resolver and its own log, so a test can fail the
 * profile and leave the locations alone. That is the shape the requirement
 * names — independent queries — and it has to be expressible in the fixture or
 * the test cannot be written.
 */
import { ok, type Result } from '../state/errors'
import type { Location, Profile } from '../state/schemas'
import type { UserDataClient } from '../data/user-data'

/** The user `auth-double.ts` signs in. Both files have to agree on it. */
export const FIXTURE_USER_ID = 'user-1'

const TIMESTAMP = '2026-09-22T09:00:00.000Z'

/** A finished profile: `onboarded_at` set, so the gate lets them through. */
export function onboardedProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    created_at: TIMESTAMP,
    updated_at: TIMESTAMP,
    experience_level: 'some',
    goal_preset: 'balanced',
    enabled_sections: ['warmup', 'primary_lift', 'cooldown'],
    weight_unit: 'kg',
    onboarded_at: TIMESTAMP,
    ...overrides,
  }
}

/** A row that exists but has not finished onboarding — the gate's own case. */
export function notOnboardedProfile(overrides: Partial<Profile> = {}): Profile {
  return onboardedProfile({
    experience_level: null,
    goal_preset: null,
    onboarded_at: null,
    ...overrides,
  })
}

export function fixtureLocation(overrides: Partial<Location> = {}): Location {
  return {
    id: '00000000-0000-4000-8000-000000000010',
    user_id: '00000000-0000-4000-8000-000000000001',
    created_at: TIMESTAMP,
    updated_at: TIMESTAMP,
    name: 'Home',
    tier: 'minimal',
    is_default: true,
    ...overrides,
  }
}

export interface FakeUserDataOptions {
  readonly profile?: (userId: string) => Promise<Result<Profile | null>>
  readonly locations?: (userId: string) => Promise<Result<Location[]>>
}

export interface FakeUserDataClient extends UserDataClient {
  /** Every user id `profile` was asked for, in order. */
  readonly profileCalls: string[]
  readonly locationCalls: string[]
}

export function createFakeUserDataClient(
  options: FakeUserDataOptions = {},
): FakeUserDataClient {
  const profileCalls: string[] = []
  const locationCalls: string[] = []

  return {
    profileCalls,
    locationCalls,
    async profile(userId) {
      profileCalls.push(userId)
      if (options.profile) return options.profile(userId)
      return ok(onboardedProfile())
    },
    async locations(userId) {
      locationCalls.push(userId)
      if (options.locations) return options.locations(userId)
      return ok([fixtureLocation()])
    },
  }
}
