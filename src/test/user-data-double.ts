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
 *
 * SET-02's writes are backed by a store rather than a canned answer, because
 * what that requirement asks about is what the *next* read says: a location
 * created here is a location `locations()` then lists, and equipment saved here
 * is the list `locationEquipment()` then answers — which is the same list
 * generation resolves its available equipment from (GEN-02a §2).
 */
import { createError, err, ErrorCode, ok, type Result } from '../state/errors'
import { EQUIPMENT_BY_TIER } from '../state/onboarding'
import type {
  Location,
  LocationDraft,
  LocationSetup,
  OnboardingAnswers,
  OnboardingCommit,
  Profile,
  ProfilePreferences,
} from '../state/schemas'
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
  readonly completeOnboarding?: (
    answers: OnboardingAnswers,
  ) => Promise<Result<OnboardingCommit>>
  readonly updatePreferences?: (
    userId: string,
    preferences: ProfilePreferences,
  ) => Promise<Result<Profile>>
  readonly locationEquipment?: (locationId: string) => Promise<Result<string[]>>
  readonly saveLocation?: (draft: LocationDraft) => Promise<Result<LocationSetup>>
  readonly setDefaultLocation?: (locationId: string) => Promise<Result<Location>>
  readonly deleteLocation?: (locationId: string) => Promise<Result<void>>
  /** The `locations` rows the writes below start from. */
  readonly stored?: readonly Location[]
  /** Location id → what it holds, in place of `location_equipment`. */
  readonly equipment?: Readonly<Record<string, readonly string[]>>
}

export interface FakeUserDataClient extends UserDataClient {
  /** Every user id `profile` was asked for, in order. */
  readonly profileCalls: string[]
  readonly locationCalls: string[]
  /** Every payload ONB-01's commit was called with, in order. */
  readonly onboardingCalls: OnboardingAnswers[]
  /** Every preference patch SET-01's hub wrote, in order. */
  readonly preferenceWrites: ProfilePreferences[]
  /** Every draft SET-02's editor saved, in order. */
  readonly locationWrites: LocationDraft[]
  /** Every location id the default was moved to, in order. */
  readonly defaultWrites: string[]
  /** Every location id deleted, in order. */
  readonly locationDeletes: string[]
  /** Every location id whose equipment was read, in order. */
  readonly equipmentReads: string[]
}

/** What the fixture location holds: its tier's preset, as onboarding writes it. */
export const FIXTURE_EQUIPMENT: readonly string[] = EQUIPMENT_BY_TIER.minimal

export function createFakeUserDataClient(
  options: FakeUserDataOptions = {},
): FakeUserDataClient {
  const profileCalls: string[] = []
  const locationCalls: string[] = []
  const onboardingCalls: OnboardingAnswers[] = []
  const preferenceWrites: ProfilePreferences[] = []
  const locationWrites: LocationDraft[] = []
  const defaultWrites: string[] = []
  const locationDeletes: string[] = []
  const equipmentReads: string[] = []

  // The rows SET-02 edits. Seeded with what the other options already imply —
  // one minimal location, holding its tier's preset — so a test that is not
  // about the store never has to describe one.
  const stored: Location[] = [...(options.stored ?? [fixtureLocation()])]
  const equipment = new Map<string, string[]>(
    Object.entries(
      options.equipment ?? { [fixtureLocation().id]: [...FIXTURE_EQUIPMENT] },
    ).map(([id, items]) => [id, [...items]]),
  )
  let created = 0

  return {
    profileCalls,
    locationCalls,
    onboardingCalls,
    preferenceWrites,
    locationWrites,
    defaultWrites,
    locationDeletes,
    equipmentReads,
    async profile(userId) {
      profileCalls.push(userId)
      if (options.profile) return options.profile(userId)
      return ok(onboardedProfile())
    },
    async locations(userId) {
      locationCalls.push(userId)
      if (options.locations) return options.locations(userId)
      return ok(stored.map((location) => ({ ...location })))
    },
    async completeOnboarding(answers) {
      onboardingCalls.push(answers)
      if (options.completeOnboarding) return options.completeOnboarding(answers)
      // The default double commits: it answers with the rows a real
      // transaction would have left behind for exactly these answers, so a
      // test that is not about failure never has to describe one.
      return ok(committedFor(answers))
    },
    async updatePreferences(userId, preferences) {
      preferenceWrites.push(preferences)
      if (options.updatePreferences) return options.updatePreferences(userId, preferences)
      // The default stores: it answers with the row the patch would have left,
      // which is what the next read — and the next generation — would see.
      return ok(onboardedProfile(preferences))
    },

    async locationEquipment(locationId) {
      equipmentReads.push(locationId)
      if (options.locationEquipment) return options.locationEquipment(locationId)
      return ok([...(equipment.get(locationId) ?? [])].sort())
    },

    async saveLocation(draft) {
      locationWrites.push(draft)
      if (options.saveLocation) return options.saveLocation(draft)

      // `save_location`'s own rules, in memory: a draft with no id creates a
      // row, the first location a user has is their default, and the equipment
      // list is replaced rather than merged.
      const existing = stored.find((location) => location.id === draft.id)
      const location: Location =
        existing === undefined
          ? fixtureLocation({
              id: `location-${(created += 1)}`,
              name: draft.name,
              tier: draft.tier,
              is_default: stored.length === 0,
            })
          : { ...existing, name: draft.name, tier: draft.tier }

      if (existing === undefined) stored.push(location)
      else stored[stored.indexOf(existing)] = location

      const items = [...draft.equipment].sort()
      equipment.set(location.id, items)

      return ok({ location: { ...location }, equipment: items } satisfies LocationSetup)
    },

    async setDefaultLocation(locationId) {
      defaultWrites.push(locationId)
      if (options.setDefaultLocation) return options.setDefaultLocation(locationId)

      // Exactly one default, like the index and the deferred trigger together.
      for (const [index, location] of stored.entries()) {
        stored[index] = { ...location, is_default: location.id === locationId }
      }

      const moved = stored.find((location) => location.id === locationId)
      return moved === undefined
        ? err(createError(ErrorCode.PERSISTENCE_WRITE_FAILED, {
            details: { table: 'locations', locationId },
          }))
        : ok({ ...moved })
    },

    async deleteLocation(locationId) {
      locationDeletes.push(locationId)
      if (options.deleteLocation) return options.deleteLocation(locationId)

      const index = stored.findIndex((location) => location.id === locationId)
      if (index !== -1) stored.splice(index, 1)
      // Cascade, as `location_equipment.location_id ... on delete cascade`.
      equipment.delete(locationId)

      return ok(undefined)
    },
  }
}

/** What `complete_onboarding` would return for `answers`, in memory. */
export function committedFor(answers: OnboardingAnswers): OnboardingCommit {
  return {
    profile: onboardedProfile({
      experience_level: answers.experience_level,
      goal_preset: answers.goal_preset,
      enabled_sections: answers.enabled_sections,
    }),
    location: fixtureLocation({
      name: answers.location_name,
      tier: answers.location_tier,
    }),
  }
}
