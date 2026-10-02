/**
 * REQ-012 — Settings cannot save impossible preferences.
 *
 * `supabase/migrations/20261002000022_settings_viability_guard.sql` evaluates a
 * Goal, section or limitation change against every saved location in the
 * statement that writes it, and refuses one that introduces a failure. This
 * suite holds the task to its four criteria:
 *
 *   * a refused change leaves the stored profile and constraints unchanged, and
 *     Settings shows the previous values;
 *   * the message names the incompatible choice, and the location when a
 *     location is the cause;
 *   * a viable change still persists, as the row the next generation reads;
 *   * nothing visual was added — Settings imports nothing new and the message
 *     arrives through the existing inline-save toast.
 *
 * The limit every migration test here states applies: no SQL is executed. The
 * guard runs through `src/test/settings-viability-double.ts`, a transcription
 * of the migration over `viability-double.ts`'s evaluation of the seeded
 * catalog, and the first block below holds the migration's text to what the
 * double transcribes. The real clients — `user-data.ts`, `constraints.ts` — and
 * the real Settings screen are what is driven against it.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { REPO_ROOT, readSchema } from '../../../scripts/gen-types/schema.mjs'
import { createUserConstraintsClient, type UserConstraintsClient } from '../../data/constraints'
import { Constants, type Tables } from '../../data/database.types'
import { createUserDataClient } from '../../data/user-data'
import {
  SETTINGS_NOT_VIABLE,
  settingsRefusalFailures,
  settingsRefusalFrom,
  type LocatedViabilityFailure,
} from '../../data/viability'
import { constraintsQueryKey } from '../../state/constraint-queries'
import {
  ErrorCode,
  SETTINGS_REFUSAL_KEPT,
  createError,
  ok,
  settingsRefusalMessage,
} from '../../state/errors'
import { EQUIPMENT_BY_TIER, MOVEMENT_PATTERNS, SECTIONS, SECTIONS_BY_GOAL } from '../../state/onboarding'
import { QueryClient } from '../../state/query'
import type { Profile } from '../../state/schemas'
import { locationsQueryKey, profileQueryKey } from '../../state/user-queries'
import { renderApp, signedIn } from '../render'
import {
  createSettingsServer,
  type SettingsServerLocation,
  type SettingsServerOptions,
} from '../settings-viability-double'
import {
  FIXTURE_USER_ID,
  createFakeUserDataClient,
  fixtureLocation,
  onboardedProfile,
} from '../user-data-double'
import { viabilityRows, type ViabilityArgs } from '../viability-double'

const MIGRATION = '20261002000022_settings_viability_guard.sql'
const ENUMS = Constants.public.Enums

type SectionType = (typeof ENUMS.section_type)[number]
type MovementPattern = (typeof ENUMS.movement_pattern)[number]

/** The migration with comments removed and whitespace collapsed. */
const statements = readFileSync(join(REPO_ROOT, 'supabase/migrations', MIGRATION), 'utf8')
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')
  .replace(/\s+/g, ' ')

// ─────────────────────────────────────────────────────────────────────────────
// Fixture
// ─────────────────────────────────────────────────────────────────────────────

const URL = 'https://clear.test'
const TOKEN = 'token'

/** Two saved places: one that can do anything, and one that cannot. */
const GARAGE: SettingsServerLocation = {
  id: '00000000-0000-4000-8000-000000000010',
  name: 'Garage',
  is_default: true,
  equipment: EQUIPMENT_BY_TIER.full,
}
const HOTEL: SettingsServerLocation = {
  id: '00000000-0000-4000-8000-000000000011',
  name: 'Hotel',
  is_default: false,
  equipment: EQUIPMENT_BY_TIER.minimal,
}

const evaluate = (
  sections: readonly SectionType[],
  equipment: readonly string[],
  patterns: readonly MovementPattern[] = [],
) =>
  viabilityRows({
    p_goal: 'strength',
    p_enabled_sections: [...sections],
    p_available_equipment: [...equipment],
    p_excluded_patterns: [...patterns],
  } as ViabilityArgs)

/**
 * A section the minimal place cannot generate and the full one can, found in
 * the seed rather than named: the catalog repair is free to change which.
 */
const UNEQUIPPED: SectionType = (() => {
  const found = SECTIONS.map((section) => section.value).find(
    (section) =>
      evaluate([section], HOTEL.equipment).some(
        (row) => row.section === section && row.failure_class === 'missing_equipment',
      ) && evaluate([section], GARAGE.equipment).length === 0,
  )
  if (found === undefined) throw new Error('the seed has no section minimal equipment cannot serve')
  return found
})()

/**
 * A saved configuration both places can generate, and a movement pattern whose
 * exclusion empties one of its sections at the minimal place and not at the
 * full one. Found together, in the seed: the Strength preset plus whichever
 * section a pattern exclusion can empty that way.
 */
const { VIABLE_SECTIONS, EMPTYING } = (() => {
  for (const section of ENUMS.section_type) {
    const sections = ENUMS.section_type.filter(
      (candidate) => candidate === section || SECTIONS_BY_GOAL.strength.includes(candidate),
    )
    if (
      evaluate(sections, HOTEL.equipment).length > 0 ||
      evaluate(sections, GARAGE.equipment).length > 0
    ) {
      continue
    }

    const pattern = ENUMS.movement_pattern.find(
      (candidate) =>
        evaluate(sections, HOTEL.equipment, [candidate]).some(
          (row) => row.failure_class === 'athlete_exclusion',
        ) && evaluate(sections, GARAGE.equipment, [candidate]).length === 0,
    )
    if (pattern !== undefined) {
      return { VIABLE_SECTIONS: sections as readonly SectionType[], EMPTYING: pattern }
    }
  }
  throw new Error('no pattern exclusion empties a section at the minimal place only')
})()

const label = (section: SectionType) =>
  SECTIONS.find((option) => option.value === section)?.label ?? section

const profileRow = (overrides: Partial<Profile> = {}) =>
  onboardedProfile({
    goal_preset: 'strength',
    enabled_sections: [...VIABLE_SECTIONS],
    ...overrides,
  }) as Tables<'profiles'>

function server(options: Partial<SettingsServerOptions> = {}) {
  return createSettingsServer({
    url: URL,
    anonKey: 'anon',
    accessToken: TOKEN,
    profile: profileRow(),
    locations: [GARAGE, HOTEL],
    ...options,
  })
}

const session = { getSession: async () => ok({ accessToken: TOKEN }) } as unknown as Parameters<
  typeof createUserDataClient
>[0]['auth']

const userDataOver = (fetch: typeof globalThis.fetch) =>
  createUserDataClient({ auth: session, supabase: { url: URL, anonKey: 'anon', fetch } })

const constraintsOver = (fetch: typeof globalThis.fetch) =>
  createUserConstraintsClient({ url: URL, anonKey: 'anon', accessToken: TOKEN, fetch })

const preferences = (profile: Tables<'profiles'>, sections: readonly SectionType[]) => ({
  experience_level: profile.experience_level,
  goal_preset: profile.goal_preset,
  enabled_sections: [...sections],
})

const exclusion = (userId: string, pattern: MovementPattern) => ({
  userId,
  action: 'exclude' as const,
  target: { scope: 'movement_pattern' as const, pattern },
  appliesTo: { persistence: 'persistent' as const },
})

// ─────────────────────────────────────────────────────────────────────────────
// The migration
// ─────────────────────────────────────────────────────────────────────────────

describe('the guard is enforced by the database', () => {
  it('evaluates every saved location through the shared viability evaluation', () => {
    expect(statements).toContain(
      'create or replace function public.settings_viability_failures(',
    )
    // One evaluation per location the user owns …
    expect(statements).toContain('from public.locations l cross join lateral public.generation_viability(')
    expect(statements).toContain('where l.user_id = p_user_id')
    // … with the equipment and exclusions retrieval itself reads.
    expect(statements).toContain('public.generation_equipment(p_user_id, l.id)')
    expect(statements).toContain("from public.constraints_in_force(p_user_id) c where c.action = 'exclude'")
    expect(statements).toContain('c.id is distinct from p_without_constraint')
  })

  it('is a trigger on both tables Settings writes, so no client can save around it', () => {
    expect(statements).toContain(
      'create trigger profiles_refuse_non_viable_settings after update of goal_preset, enabled_sections on public.profiles for each row',
    )
    expect(statements).toContain(
      'create trigger user_constraints_refuse_non_viable_settings after insert or update of action, persistence, scope, target_exercise_id, target_pattern, target_equipment on public.user_constraints for each row',
    )
    expect(statements.match(/execute function public\.refuse_non_viable_settings\(\)/g)).toHaveLength(2)
  })

  it('refuses by raising, which aborts the statement and stores nothing', () => {
    expect(statements).toContain(
      `raise exception '${SETTINGS_NOT_VIABLE}' using errcode = 'P0001', detail = v_introduced::text`,
    )
    // Only a failure the change introduces is refused.
    expect(statements).toContain('where not exists (')
    expect(statements).toContain('b.location_id = a.location_id')
    expect(statements).toContain('b.section is not distinct from a.section')
    expect(statements).toContain('b.failure_class = a.failure_class')
    expect(statements).toContain('(b.blocks_proposed_goal or not a.blocks_proposed_goal)')
  })

  it('leaves onboarding’s own commit to its own task', () => {
    expect(statements).toContain('if old.onboarded_at is null then return new;')
    expect(statements).toContain('if v_onboarded_at is null or v_onboarded_at = now() then return new;')
    // No trigger on the location tables: those writes are another task's.
    expect(statements).not.toMatch(/create trigger \w+ [^;]* on public\.location/)
  })

  it('is invoker-rights on a pinned search_path, and not callable anonymously', () => {
    expect(statements.match(/security invoker set search_path = ''/g)).toHaveLength(2)
    expect(statements).not.toContain('security definer')
    expect(statements).toContain(
      'revoke all on function public.settings_viability_failures( uuid, public.goal_preset, public.section_type[], uuid) from public, anon;',
    )
    expect(statements).toContain(
      'grant execute on function public.settings_viability_failures( uuid, public.goal_preset, public.section_type[], uuid) to authenticated, service_role;',
    )
  })

  it('is additive: no table, column, policy or existing function is changed', () => {
    expect(statements).not.toMatch(/\b(alter table|drop table|drop function|create policy|drop policy)\b/)
    const created = [...statements.matchAll(/create or replace function public\.([a-z_]+)/g)].map(
      (match) => match[1],
    )
    expect(created).toEqual(['settings_viability_failures', 'refuse_non_viable_settings'])
  })

  it('is carried by the generated types', () => {
    const declared = readSchema().functions.find((fn) => fn.name === 'settings_viability_failures')

    expect(declared?.args.map((arg) => [arg.name, arg.pgType, arg.optional])).toEqual([
      ['p_user_id', 'uuid', false],
      ['p_goal', 'public.goal_preset', false],
      ['p_enabled_sections', 'public.section_type[]', false],
      ['p_without_constraint', 'uuid', true],
    ])
    expect(declared?.columns?.map((column) => column.name)).toEqual([
      'location_id',
      'location_name',
      'section',
      'failure_class',
      'incompatible_choice',
      'goals',
      'focuses',
      'blocks_proposed_goal',
    ])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// A refused change
// ─────────────────────────────────────────────────────────────────────────────

describe('a refused change leaves what was stored', () => {
  it('starts from a configuration every saved location can generate', () => {
    expect(server().failures()).toEqual([])
  })

  it('refuses a section one saved location cannot generate, and stores nothing', async () => {
    const db = server()
    const before = db.profile()

    const result = await userDataOver(db.fetch).updatePreferences(
      before.id,
      preferences(before, [...VIABLE_SECTIONS, UNEQUIPPED]),
    )

    expect(result.ok).toBe(false)
    expect(db.profile()).toEqual(before)
    expect(db.constraints()).toEqual([])
    // One write, refused where it was made: nothing was asked beforehand.
    expect(db.requests()).toEqual([{ method: 'PATCH', path: '/profiles' }])
  })

  it('refuses a limitation that empties a section at a saved location, and stores nothing', async () => {
    const db = server()
    const before = db.profile()

    const result = await constraintsOver(db.fetch).add(exclusion(before.id, EMPTYING))

    expect(result.ok).toBe(false)
    expect(db.constraints()).toEqual([])
    expect(db.profile()).toEqual(before)
  })

  it('refuses a Goal the saved sections cannot generate for', async () => {
    // Active recovery composes from its own fixed sections, so a stored set it
    // never reads is not blocking it — until the Goal changes to one that does.
    const db = server({
      profile: profileRow({
        goal_preset: 'active_recovery',
        enabled_sections: [...VIABLE_SECTIONS, UNEQUIPPED],
      }),
    })
    const before = db.profile()

    const result = await userDataOver(db.fetch).updatePreferences(before.id, {
      ...preferences(before, before.enabled_sections),
      goal_preset: 'strength',
    })

    expect(result.ok).toBe(false)
    expect(db.profile()).toEqual(before)
  })

  it('is refused for a client that writes the table directly', async () => {
    const db = server()
    const before = db.profile()

    const response = await db.fetch(`${URL}/rest/v1/profiles?id=eq.${before.id}`, {
      method: 'PATCH',
      headers: { apikey: 'anon', Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ enabled_sections: [UNEQUIPPED] }),
    })

    expect(response.status).toBe(400)
    expect(((await response.json()) as { message: string }).message).toBe(SETTINGS_NOT_VIABLE)
    expect(db.profile()).toEqual(before)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// The message
// ─────────────────────────────────────────────────────────────────────────────

describe('the refusal names the incompatible choice and the location', () => {
  it('names the section and the place whose equipment cannot serve it', async () => {
    const db = server()
    const before = db.profile()

    const result = await userDataOver(db.fetch).updatePreferences(
      before.id,
      preferences(before, [...VIABLE_SECTIONS, UNEQUIPPED]),
    )
    if (result.ok) throw new Error('expected a refusal')

    const name = UNEQUIPPED.replaceAll('_', ' ')
    expect(result.error.code).toBe(ErrorCode.VALIDATION_CONSTRAINT)
    expect(result.error.message).toBe(
      `${name.charAt(0).toUpperCase()}${name.slice(1)}: nothing can be done with the equipment at Hotel. ${SETTINGS_REFUSAL_KEPT}`,
    )
    // The place that can serve it is not blamed.
    expect(result.error.message).not.toContain('Garage')

    const failures = result.error.details?.failures as LocatedViabilityFailure[]
    expect(failures.map((failure) => [failure.locationName, failure.section, failure.failureClass])).toEqual([
      ['Hotel', UNEQUIPPED, 'missing_equipment'],
    ])
  })

  it('names the limitation, the section it empties and the place', async () => {
    const db = server()

    const result = await constraintsOver(db.fetch).add(exclusion(db.profile().id, EMPTYING))
    if (result.ok) throw new Error('expected a refusal')

    expect(result.error.message).toContain(`working around ${EMPTYING} removes every exercise at Hotel.`)
    expect(result.error.message).not.toContain('Garage')
    expect(result.error.message.endsWith(SETTINGS_REFUSAL_KEPT)).toBe(true)

    const failures = result.error.details?.failures as LocatedViabilityFailure[]
    expect(failures.length).toBeGreaterThan(0)
    for (const failure of failures) {
      expect(failure.incompatibleChoice).toEqual({
        kind: 'exclusion',
        exclusions: [{ scope: 'movement_pattern', target: EMPTYING }],
      })
      // The section named is one the athlete has turned on.
      expect(result.error.message.toLowerCase()).toContain(
        (failure.section ?? '').replaceAll('_', ' '),
      )
    }
  })

  it('names every place a choice fails at, once', () => {
    const failure = (locationName: string): LocatedViabilityFailure => ({
      locationId: locationName,
      locationName,
      section: 'carries',
      failureClass: 'missing_equipment',
      incompatibleChoice: { kind: 'equipment', equipment: ['bodyweight'] },
      goals: ['strength'],
      focuses: ['full_body'],
      blocksProposedGoal: true,
    })

    expect(settingsRefusalMessage([failure('Hotel'), failure('Office')])).toBe(
      `Carries: nothing can be done with the equipment at Hotel, Office. ${SETTINGS_REFUSAL_KEPT}`,
    )
  })

  it('names no place for a catalog gap, which no place causes', () => {
    const message = settingsRefusalMessage([
      {
        locationId: 'a',
        locationName: 'Hotel',
        section: 'mobility',
        failureClass: 'catalog_gap',
        incompatibleChoice: { kind: 'section', section: 'mobility' },
        goals: ['strength'],
        focuses: ['full_body'],
        blocksProposedGoal: true,
      },
    ])

    expect(message).toBe(`Mobility: this selection is not currently supported. ${SETTINGS_REFUSAL_KEPT}`)
  })

  it('still says the change was refused when the detail cannot be read', () => {
    const unreadable = createError(ErrorCode.VALIDATION_CONSTRAINT, {
      details: { status: 400, pgCode: 'P0001', pgMessage: SETTINGS_NOT_VIABLE, pgDetail: 'not json' },
    })

    expect(settingsRefusalFailures(unreadable)).toEqual([])
    expect(settingsRefusalFrom(unreadable).message).toBe(
      `This change cannot generate a workout at one of your places. ${SETTINGS_REFUSAL_KEPT}`,
    )
  })

  it('leaves every other write failure exactly as it was', () => {
    const check = createError(ErrorCode.VALIDATION_CONSTRAINT, {
      details: { status: 400, pgCode: '23514' },
    })
    const raised = createError(ErrorCode.VALIDATION_CONSTRAINT, {
      details: { status: 400, pgCode: 'P0001', pgMessage: 'a location needs a name' },
    })

    expect(settingsRefusalFailures(check)).toBeNull()
    expect(settingsRefusalFrom(check)).toBe(check)
    expect(settingsRefusalFrom(raised)).toBe(raised)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// A viable change
// ─────────────────────────────────────────────────────────────────────────────

describe('a viable change still persists', () => {
  it('stores a section change as the row the next generation reads', async () => {
    const db = server()
    const before = db.profile()
    const next = VIABLE_SECTIONS.filter((section) => section !== 'accessory')

    const result = await userDataOver(db.fetch).updatePreferences(before.id, preferences(before, next))

    expect(result.ok && result.value.enabled_sections).toEqual(next)
    // `generation_sections_for_goal` reads `profiles.enabled_sections`.
    expect(db.profile().enabled_sections).toEqual(next)

    const read = await userDataOver(db.fetch).profile(before.id)
    expect(read.ok && read.value?.enabled_sections).toEqual(next)
  })

  it('stores a Goal change', async () => {
    const db = server()
    const before = db.profile()

    const result = await userDataOver(db.fetch).updatePreferences(before.id, {
      ...preferences(before, before.enabled_sections),
      goal_preset: 'hypertrophy',
    })

    expect(result.ok).toBe(true)
    expect(db.profile().goal_preset).toBe('hypertrophy')
  })

  it('stores a limitation every saved location can still generate under', async () => {
    const db = server({ locations: [GARAGE] })

    const result = await constraintsOver(db.fetch).add(exclusion(db.profile().id, EMPTYING))

    expect(result.ok).toBe(true)
    // `constraints_in_force` is what retrieval excludes by.
    expect(db.constraints().map((row) => row.target_pattern)).toEqual([EMPTYING])
    expect(db.failures()).toEqual([])
  })

  it('keeps a configuration that was already failing editable', async () => {
    // Saved before the guard existed. Refusing every later edit would leave
    // the athlete unable to change anything, including what would fix it.
    const db = server({
      profile: profileRow({ enabled_sections: [...VIABLE_SECTIONS, UNEQUIPPED] }),
    })
    const before = db.profile()
    expect(db.failures().length).toBeGreaterThan(0)

    const client = userDataOver(db.fetch)
    const narrowed = before.enabled_sections.filter((section) => section !== 'accessory')
    expect((await client.updatePreferences(before.id, preferences(before, narrowed))).ok).toBe(true)

    // And the fix itself is a change like any other.
    expect((await client.updatePreferences(before.id, preferences(before, VIABLE_SECTIONS))).ok).toBe(true)
    expect(db.failures()).toEqual([])
  })

  it('does not evaluate an edit that changes neither Goal nor sections', async () => {
    const db = server({
      profile: profileRow({ enabled_sections: [...VIABLE_SECTIONS, UNEQUIPPED] }),
    })
    const before = db.profile()

    const result = await userDataOver(db.fetch).updatePreferences(before.id, {
      ...preferences(before, before.enabled_sections),
      experience_level: 'confident',
    })

    expect(result.ok && result.value.experience_level).toBe('confident')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// The Settings view
// ─────────────────────────────────────────────────────────────────────────────

/** Settings on the real route tree, with both writers going to the guarded server. */
function renderSettings() {
  const db = server()
  const stored = db.profile()
  const real = userDataOver(db.fetch)
  const constraints = constraintsOver(db.fetch)

  const cache = new QueryClient()
  cache.setData(profileQueryKey(FIXTURE_USER_ID), stored as Profile)
  cache.setData(locationsQueryKey(FIXTURE_USER_ID), [fixtureLocation()])
  cache.setData(constraintsQueryKey(FIXTURE_USER_ID), [])

  // The session double signs in a fixture id that is not a uuid; the rows are
  // the profile's, so the writes are addressed to it.
  const constraintsClient: UserConstraintsClient = {
    ...constraints,
    add: (constraint) => constraints.add({ ...constraint, userId: stored.id }),
  }

  renderApp(
    ['/settings'],
    signedIn({
      queryClient: cache,
      userData: createFakeUserDataClient({
        updatePreferences: (_userId, next) => real.updatePreferences(stored.id, next),
      }),
      constraints: constraintsClient,
    }),
  )

  return { db, cache, stored }
}

describe('Settings shows the previous values after a refusal', () => {
  it('unticks the refused section, says why, and leaves the cache as it was', async () => {
    const user = userEvent.setup()
    const { db, cache, stored } = renderSettings()

    const toggle = await screen.findByRole('checkbox', { name: label(UNEQUIPPED) })
    expect(toggle).not.toBeChecked()
    await user.click(toggle)

    expect(await screen.findByText(/nothing can be done with the equipment at Hotel\./)).toBeVisible()
    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: label(UNEQUIPPED) })).not.toBeChecked()
    })
    for (const section of VIABLE_SECTIONS) {
      expect(screen.getByRole('checkbox', { name: label(section) })).toBeChecked()
    }
    expect(screen.getByRole('radio', { name: 'Strength' })).toBeChecked()

    // No optimistic state left behind, and nothing stored.
    const state = cache.getState<Profile>(profileQueryKey(FIXTURE_USER_ID))
    expect(state.status === 'ready' && state.data.enabled_sections).toEqual(stored.enabled_sections)
    expect(db.profile()).toEqual(stored)
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  })

  it('unticks the refused limitation and says which place it fails at', async () => {
    const user = userEvent.setup()
    const { db, cache } = renderSettings()
    const pattern = MOVEMENT_PATTERNS.find((option) => option.value === EMPTYING)
    if (pattern === undefined) throw new Error('the pattern is not offered')

    await user.click(await screen.findByRole('checkbox', { name: pattern.label }))

    expect(await screen.findByText(/removes every exercise at Hotel\./)).toBeVisible()
    expect(screen.getByRole('checkbox', { name: pattern.label })).not.toBeChecked()

    const state = cache.getState(constraintsQueryKey(FIXTURE_USER_ID))
    expect(state.status === 'ready' && state.data).toEqual([])
    expect(db.constraints()).toEqual([])
  })

  it('keeps a viable change, shown and stored', async () => {
    const user = userEvent.setup()
    const { db } = renderSettings()

    await user.click(await screen.findByRole('checkbox', { name: label('accessory') }))

    await waitFor(() => {
      expect(db.profile().enabled_sections).not.toContain('accessory')
    })
    expect(screen.getByRole('checkbox', { name: label('accessory') })).not.toBeChecked()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// REQ-031 — no visual or design-system drift
// ─────────────────────────────────────────────────────────────────────────────

describe('nothing visual changed', () => {
  it('delivers the refusal through the inline save Settings already had', () => {
    const settings = readFileSync(join(REPO_ROOT, 'src/app/Settings.tsx'), 'utf8')
    const inlineSave = readFileSync(join(REPO_ROOT, 'src/ui/inline-save.tsx'), 'utf8')

    expect(settings).toContain("import { SaveStatusLine, useInlineSave } from '../ui/inline-save'")
    expect(inlineSave).toContain('showErrorToast(result.error)')
    // Settings learned nothing about viability: the sentence is the error's.
    expect(settings).not.toMatch(/viability|settingsRefusal/i)
  })
})
