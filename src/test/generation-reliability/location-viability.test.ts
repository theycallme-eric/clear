/**
 * REQ-013 — a location or equipment change cannot create an impossible
 * configuration.
 *
 * `supabase/migrations/20261002000022_location_viability.sql` makes the three
 * location writes evaluate what they leave against the caller's saved sections
 * and raise when it is not viable. This suite holds that to five things:
 *
 *   * the migration is additive, invoker-rights, and raises after the write, so
 *     the transaction is what restores the previous rows;
 *   * a refused change leaves `locations` and `location_equipment` unchanged;
 *   * an empty equipment list is refused as `missing_equipment`;
 *   * the message names the section and the change responsible, through the
 *     error's own message — the composition every failed save already uses;
 *   * a viable change still persists, and the screen needed no change to roll a
 *     refusal back (REQ-031).
 *
 * The limit every migration test here states applies: no SQL is executed. The
 * writes run through `src/test/location-writes-double.ts`, a transcription of
 * the migration over `viabilityRows`, and the first block below holds the SQL's
 * text to what that transcription does.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { TYPES_PATH, build } from '../../../scripts/gen-types/gen-types.mjs'
import { REPO_ROOT, migrationFiles, readSchema } from '../../../scripts/gen-types/schema.mjs'
import { createUserDataClient } from '../../data/user-data'
import { LOCATION_NOT_VIABLE, locationRefusalFrom, type LocationRefusal } from '../../data/viability'
import { ErrorCode, createError, type AppError, type Result } from '../../state/errors'
import { locationRefusalMessage } from '../../state/locations'
import { EQUIPMENT_BY_TIER } from '../../state/onboarding'
import { QueryClient } from '../../state/query'
import type { Location } from '../../state/schemas'
import { locationsQueryKey, profileQueryKey } from '../../state/user-queries'
import { createFakeAuthClient, signedInEvent } from '../auth-double'
import {
  createLocationWritesDouble,
  type SavedConfiguration,
} from '../location-writes-double'
import { renderApp } from '../render'
import { FIXTURE_USER_ID, fixtureLocation, onboardedProfile } from '../user-data-double'
import { viabilityRows } from '../viability-double'

const MIGRATION = '20261002000022_location_viability.sql'
const LOCATION_WRITES = '20260921000009_location_writes.sql'

const read = (file: string) => readFileSync(join(REPO_ROOT, 'supabase/migrations', file), 'utf8')

/** SQL with comments removed and whitespace collapsed. */
const statementsOf = (file: string) =>
  read(file)
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
    .replace(/\s+/g, ' ')

const statements = statementsOf(MIGRATION)

/** One function's declaration and body, up to its closing `$$;`. */
const declarationOf = (sql: string, name: string) => {
  const start = sql.indexOf(`create or replace function public.${name}(`)
  expect(start, name).toBeGreaterThan(-1)

  return sql.slice(start, sql.indexOf('$$;', start))
}

const USER = '00000000-0000-4000-8000-000000000001'
const HOME = '00000000-0000-4000-8000-000000000010'
const TRAVEL = '00000000-0000-4000-8000-000000000011'

/** Sections the Home preset supports and the Minimal preset does not. */
const SAVED: SavedConfiguration = {
  goalPreset: 'strength',
  enabledSections: ['warmup', 'primary_lift', 'carries', 'cooldown'],
}

const home = fixtureLocation({ id: HOME, user_id: USER, name: 'Home', tier: 'home' })
/** A location saved before the rule existed: Minimal cannot serve carries. */
const travel = fixtureLocation({
  id: TRAVEL,
  user_id: USER,
  name: 'Travel',
  tier: 'minimal',
  is_default: false,
})

function setup(
  overrides: {
    locations?: readonly Location[]
    profile?: SavedConfiguration | null
  } = {},
) {
  const locations = overrides.locations ?? [home, travel]
  const server = createLocationWritesDouble({
    url: 'https://clear.test',
    anonKey: 'anon',
    users: { 'access-token': USER },
    profiles: overrides.profile === null ? {} : { [USER]: overrides.profile ?? SAVED },
    locations,
    equipment: Object.fromEntries(
      locations.map((location) => [location.id, EQUIPMENT_BY_TIER[location.tier]]),
    ),
  })
  const auth = createFakeAuthClient({ settled: signedInEvent() })
  const client = createUserDataClient({
    auth,
    supabase: { url: 'https://clear.test', anonKey: 'anon', fetch: server.fetch },
  })

  return { server, auth, client }
}

/** The refusal a failed write carries, or a failed assertion. */
function refusalOf(result: Result<unknown>): { error: AppError; refusal: LocationRefusal } {
  if (result.ok) throw new Error('the write was not refused')
  const refusal = result.error.details?.refusal as LocationRefusal | undefined
  if (refusal === undefined) throw new Error(`not a viability refusal: ${result.error.message}`)

  return { error: result.error, refusal }
}

const homeDraft = (equipment: readonly string[], tier: Location['tier'] = 'home') => ({
  id: HOME,
  name: 'Home',
  tier,
  equipment: [...equipment],
})

describe('the fixture', () => {
  it('saves sections the Home preset supports and the Minimal preset does not', () => {
    const rows = (equipment: readonly string[]) =>
      viabilityRows({
        p_goal: 'strength',
        p_enabled_sections: [...SAVED.enabledSections],
        p_available_equipment: [...equipment],
      })

    expect(rows(EQUIPMENT_BY_TIER.home)).toEqual([])
    expect(rows(EQUIPMENT_BY_TIER.minimal).map((row) => row.section)).toEqual(['carries'])
  })
})

describe('the migration — shape', () => {
  it('is the latest migration and only replaces or adds functions', () => {
    expect(migrationFiles().at(-1)).toBe(MIGRATION)

    expect(
      [...statements.matchAll(/create or replace function public\.([a-z_]+)\(/g)].map(
        (match) => match[1],
      ),
    ).toEqual([
      'location_viability_failures',
      'save_location',
      'set_default_location',
      'delete_location',
    ])
    for (const forbidden of [
      /create table/i,
      /create type/i,
      /create policy/i,
      /create trigger/i,
      /alter /i,
      /\bdrop /i,
    ]) {
      expect(statements, String(forbidden)).not.toMatch(forbidden)
    }
  })

  it('is invoker-rights on a pinned search_path, with the owner from auth.uid()', () => {
    for (const name of [
      'location_viability_failures',
      'save_location',
      'set_default_location',
      'delete_location',
    ]) {
      const declaration = declarationOf(statements, name)

      expect(declaration, name).toMatch(/security invoker/)
      expect(declaration, name).toMatch(/set search_path = ''/)
      expect(declaration, name).toContain('(select auth.uid())')
      expect(declaration, name).not.toMatch(/p_user_id/)
    }
    expect(statements).not.toMatch(/security definer/i)
  })

  it('evaluates with generation_viability, against the saved profile and exclusions', () => {
    const declaration = declarationOf(statements, 'location_viability_failures')

    expect(declaration).toContain(
      'cross join lateral public.generation_viability( p.goal_preset, p.enabled_sections,',
    )
    expect(declaration).toContain('where p.id = (select auth.uid())')
    for (const [column, scope] of [
      ['target_exercise_id', 'exercise'],
      ['target_pattern', 'movement_pattern'],
      ['target_equipment', 'equipment'],
    ]) {
      expect(declaration).toContain(
        `select c.${column} from public.constraints_in_force(p.id) c where c.action = 'exclude' and c.scope = '${scope}'`,
      )
    }
    // It states no eligibility rule of its own.
    expect(declaration).not.toMatch(/exercise_catalog|focus_pattern_map/)
  })

  it('raises after each write, so the transaction restores the previous rows', () => {
    const raise = "raise exception 'location_not_viable' using errcode = 'check_violation', detail ="
    const writes = {
      save_location: 'insert into public.location_equipment (location_id, equipment_id)',
      set_default_location: 'update public.locations set is_default = true',
      delete_location: 'delete from public.locations where id = p_location_id',
    }

    for (const [name, write] of Object.entries(writes)) {
      const declaration = declarationOf(statements, name)

      expect(declaration.match(/raise exception 'location_not_viable'/g), name).toHaveLength(1)
      expect(declaration, name).toContain(write)
      expect(declaration.indexOf(raise), name).toBeGreaterThan(declaration.indexOf(write))
      // … and before anything is answered.
      expect(declaration.indexOf(raise), name).toBeLessThan(declaration.lastIndexOf('return '))
      expect(declaration, name).toContain("'failures', v_failures")
      expect(declaration, name).toContain('if jsonb_array_length(v_failures) > 0 then')
    }
    expect(LOCATION_NOT_VIABLE).toBe('location_not_viable')
  })

  it('evaluates the stored equipment, the new default, and the last deletion', () => {
    const save = declarationOf(statements, 'save_location')
    expect(save).toContain(
      'if p_location_id is null or v_equipment is distinct from v_previous then v_failures := public.location_viability_failures(v_equipment);',
    )

    expect(declarationOf(statements, 'set_default_location')).toContain(
      'v_failures := public.location_viability_failures(v_equipment);',
    )

    expect(declarationOf(statements, 'delete_location')).toContain(
      "if not exists ( select 1 from public.locations l where l.user_id = v_user_id ) then v_failures := public.location_viability_failures('{}'::text[]);",
    )
  })

  it('keeps every statement the writes it replaces were made of', () => {
    const original = statementsOf(LOCATION_WRITES)

    for (const name of ['save_location', 'set_default_location']) {
      const before = declarationOf(original, name)
      const after = declarationOf(statements, name)
      const signature = before.slice(0, before.indexOf(' as $$'))

      expect(after.startsWith(signature), name).toBe(true)
      for (const statement of before.slice(before.indexOf(' begin ')).split(';')) {
        // The one statement REQ-013 extends is the declaration block, above.
        if (statement.trim() === '' || statement.trim() === 'end') continue
        expect(after, `${name}: ${statement.trim()}`).toContain(statement.trim())
      }
    }
  })

  it('grants the new functions to signed-in callers only', () => {
    for (const signature of [
      'public\\.location_viability_failures\\(text\\[\\]\\)',
      'public\\.delete_location\\(uuid\\)',
    ]) {
      expect(statements).toMatch(
        new RegExp(`revoke all on function ${signature} from public, anon;`),
      )
      expect(statements).toMatch(
        new RegExp(`grant execute on function ${signature} to authenticated, service_role;`),
      )
    }
  })

  it('is carried by the generated types with no drift', () => {
    const functions = readSchema().functions
    const args = (name: string) =>
      functions.find((fn) => fn.name === name)?.args.map((arg) => [arg.name, arg.pgType])

    expect(args('delete_location')).toEqual([['p_location_id', 'uuid']])
    expect(args('location_viability_failures')).toEqual([['p_equipment', 'text[]']])
    expect(args('save_location')).toEqual([
      ['p_name', 'text'],
      ['p_tier', 'public.equipment_tier'],
      ['p_equipment', 'text[]'],
      ['p_location_id', 'uuid'],
    ])

    const committed = readFileSync(join(REPO_ROOT, TYPES_PATH), 'utf8')
    expect(committed === build().contents, 'stale — run `npm run gen:types`').toBe(true)
    expect(committed).toContain(` *   supabase/migrations/${MIGRATION}`)
  })
})

describe('a refused equipment change', () => {
  it('leaves location_equipment unchanged when an edit empties a section', async () => {
    const { server, client } = setup()
    const before = { locations: server.locations(), equipment: server.equipment(HOME) }

    const result = await client.saveLocation(
      homeDraft(EQUIPMENT_BY_TIER.home.filter((item) => item !== 'dumbbells' && item !== 'kettlebells')),
    )

    const { error, refusal } = refusalOf(result)
    expect(error.code).toBe(ErrorCode.VALIDATION_CONSTRAINT)
    expect(refusal.failures.map((failure) => failure.section)).toEqual(['carries'])
    expect(refusal.failures[0].failureClass).toBe('missing_equipment')
    expect(refusal.change).toEqual({
      kind: 'edit',
      location: 'Home',
      removed: ['dumbbells', 'kettlebells'],
      added: [],
    })

    expect(server.equipment(HOME)).toEqual(before.equipment)
    expect(server.locations()).toEqual(before.locations)
    // And the read the screen and generation share answers the previous list.
    expect(await client.locationEquipment(HOME)).toEqual({ ok: true, value: before.equipment })
  })

  it('refuses a tier preset the same way, and keeps the tier that was stored', async () => {
    const { server, client } = setup()

    const result = await client.saveLocation(homeDraft(EQUIPMENT_BY_TIER.minimal, 'minimal'))

    expect(refusalOf(result).refusal.change.removed).toEqual(['dumbbells', 'kettlebells', 'pullup_bar'])
    expect(server.locations().find((location) => location.id === HOME)?.tier).toBe('home')
    expect(server.equipment(HOME)).toEqual([...EQUIPMENT_BY_TIER.home].sort())
  })

  it('refuses a new location that cannot serve the saved sections, and creates nothing', async () => {
    const { server, client } = setup()

    const result = await client.saveLocation({
      id: null,
      name: 'Hotel',
      tier: 'minimal',
      equipment: [...EQUIPMENT_BY_TIER.minimal],
    })

    expect(refusalOf(result).refusal.change).toMatchObject({ kind: 'add', location: 'Hotel' })
    expect(server.locations().map((location) => location.name)).toEqual(['Home', 'Travel'])
  })

  it('refuses moving the default to a location that cannot, and leaves the default', async () => {
    const { server, client } = setup()

    const result = await client.setDefaultLocation(TRAVEL)

    const { refusal } = refusalOf(result)
    expect(refusal.change).toEqual({ kind: 'default', location: 'Travel', removed: [], added: [] })
    expect(refusal.failures.map((failure) => failure.section)).toEqual(['carries'])
    expect(server.locations().find((location) => location.is_default)?.id).toBe(HOME)
  })

  it('refuses deleting the last location, and deletes nothing', async () => {
    const { server, client } = setup({ locations: [home] })

    const result = await client.deleteLocation(HOME)

    const { refusal } = refusalOf(result)
    expect(refusal.change.kind).toBe('delete')
    expect(refusal.failures.every((failure) => failure.failureClass === 'missing_equipment')).toBe(true)
    expect(server.locations()).toEqual([home])
    expect(server.equipment(HOME)).toEqual([...EQUIPMENT_BY_TIER.home].sort())
  })

  it('is enforced by the write itself: the client sends no check of its own', async () => {
    const { server, client } = setup()

    await client.saveLocation(homeDraft(EQUIPMENT_BY_TIER.minimal, 'minimal'))
    await client.setDefaultLocation(TRAVEL)

    expect(server.requests()).toEqual([
      { method: 'POST', path: '/rpc/save_location' },
      { method: 'POST', path: '/rpc/set_default_location' },
    ])

    // The same request with no client in front of it is refused the same way.
    const response = await server.fetch('https://clear.test/rest/v1/rpc/save_location', {
      method: 'POST',
      headers: { apikey: 'anon', Authorization: 'Bearer access-token' },
      body: JSON.stringify({
        p_name: 'Home',
        p_tier: 'minimal',
        p_equipment: EQUIPMENT_BY_TIER.minimal,
        p_location_id: HOME,
      }),
    })
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: '23514', message: LOCATION_NOT_VIABLE })
  })
})

describe('an empty equipment list', () => {
  it('is refused with the missing-equipment class rather than saved', async () => {
    const { server, client } = setup()

    const result = await client.saveLocation(homeDraft([]))

    const { refusal } = refusalOf(result)
    expect(refusal.failures.length).toBeGreaterThan(0)
    for (const failure of refusal.failures) {
      expect(failure.failureClass).toBe('missing_equipment')
      expect(failure.incompatibleChoice).toEqual({ kind: 'equipment', equipment: [] })
    }
    expect(refusal.failures.map((failure) => failure.section)).toEqual(
      expect.arrayContaining([...SAVED.enabledSections]),
    )
    expect(server.equipment(HOME)).toEqual([...EQUIPMENT_BY_TIER.home].sort())
  })

  it('is refused for a new location too', async () => {
    const { server, client } = setup()

    const result = await client.saveLocation({ id: null, name: 'Park', tier: 'minimal', equipment: [] })

    expect(
      refusalOf(result).refusal.failures.every(
        (failure) => failure.failureClass === 'missing_equipment',
      ),
    ).toBe(true)
    expect(server.locations()).toHaveLength(2)
  })
})

describe('the message', () => {
  it('names the section that would become empty and the equipment removed', async () => {
    const { client } = setup()

    const result = await client.saveLocation(
      homeDraft(EQUIPMENT_BY_TIER.home.filter((item) => item !== 'dumbbells' && item !== 'kettlebells')),
    )

    expect(refusalOf(result).error.message).toBe(
      'Removing Dumbbells, Kettlebells from Home leaves Carries with no exercise the remaining equipment can do. Nothing was changed.',
    )
  })

  it('names the change for a new place, a moved default, and a deletion', async () => {
    const { client } = setup()
    const added = await client.saveLocation({
      id: null,
      name: 'Hotel',
      tier: 'minimal',
      equipment: [...EQUIPMENT_BY_TIER.minimal],
    })
    expect(refusalOf(added).error.message).toMatch(
      /^Adding Hotel with this equipment leaves Carries with no exercise/,
    )

    const moved = await client.setDefaultLocation(TRAVEL)
    expect(refusalOf(moved).error.message).toMatch(
      /^Making Travel the default leaves Carries with no exercise/,
    )

    const only = setup({ locations: [home] })
    const deleted = await only.client.deleteLocation(HOME)
    const message = refusalOf(deleted).error.message
    expect(message).toMatch(/^Deleting Home leaves no equipment to train with, so /)
    for (const section of ['Warm-up', 'Primary lift', 'Carries', 'Cooldown']) {
      expect(message).toContain(section)
    }
  })

  it('says an emptied list has no equipment, and names every section it empties', async () => {
    const { client } = setup()

    const { error } = refusalOf(await client.saveLocation(homeDraft([])))

    expect(error.message).toMatch(/^Removing Bodyweight, .* from Home leaves no equipment to train with, so /)
    expect(error.message).toContain('Carries')
    expect(error.message).toMatch(/Nothing was changed\.$/)
  })

  it('names the exclusions when they, not the equipment, empty the section', () => {
    const message = locationRefusalMessage({
      change: { kind: 'edit', location: 'Home', removed: ['barbell'], added: [] },
      failures: [
        {
          section: 'primary_lift',
          failureClass: 'athlete_exclusion',
          incompatibleChoice: {
            kind: 'exclusion',
            exclusions: [{ scope: 'movement_pattern', target: 'squat' }],
          },
          goals: ['strength'],
          focuses: ['lower_body'],
          blocksProposedGoal: true,
        },
      ],
    })

    expect(message).toBe(
      'Removing Barbell from Home leaves Primary lift with only exercises your exclusions remove. Nothing was changed.',
    )
  })

  it('counts the saved exclusions when it evaluates', async () => {
    // Excluding everything the Home preset carries with: the equipment is
    // there, and the exclusions are what empty the section.
    const { client } = setup({
      profile: {
        ...SAVED,
        exclusions: [
          { scope: 'equipment', target: 'dumbbells' },
          { scope: 'equipment', target: 'kettlebells' },
        ],
      },
    })

    const result = await client.saveLocation(homeDraft([...EQUIPMENT_BY_TIER.home, 'barbell']))

    const { error, refusal } = refusalOf(result)
    expect(refusal.failures).toEqual([
      expect.objectContaining({ section: 'carries', failureClass: 'athlete_exclusion' }),
    ])
    expect(error.message).toMatch(/leaves Carries with only exercises your exclusions remove/)
  })

  it('leaves any other failure as it arrived', () => {
    const plain = createError(ErrorCode.VALIDATION_CONSTRAINT, {
      details: { status: 400, pgCode: '23514', pgMessage: 'a location needs a name' },
    })
    expect(locationRefusalFrom(plain)).toBeNull()

    // A refusal whose detail does not parse is not presented as one.
    for (const pgDetail of ['not json', '{}', '{"change":{"kind":"other"},"failures":[]}']) {
      expect(
        locationRefusalFrom(
          createError(ErrorCode.VALIDATION_CONSTRAINT, {
            details: { pgMessage: LOCATION_NOT_VIABLE, pgDetail },
          }),
        ),
        pgDetail,
      ).toBeNull()
    }
  })
})

describe('a viable change', () => {
  it('persists, and is the list the next generation reads', async () => {
    const { server, client } = setup()
    const equipment = [...EQUIPMENT_BY_TIER.home, 'barbell']

    const result = await client.saveLocation(homeDraft(equipment, 'building'))

    expect(result.ok && result.value.equipment).toEqual([...equipment].sort())
    expect(result.ok && result.value.location).toMatchObject({ id: HOME, tier: 'building' })
    expect(server.equipment(HOME)).toEqual([...equipment].sort())
    expect(await client.locationEquipment(HOME)).toEqual({ ok: true, value: [...equipment].sort() })
  })

  it('persists a removal that leaves every saved section served', async () => {
    const { server, client } = setup()
    const equipment = EQUIPMENT_BY_TIER.home.filter((item) => item !== 'pullup_bar')

    const result = await client.saveLocation(homeDraft(equipment))

    expect(result.ok).toBe(true)
    expect(server.equipment(HOME)).not.toContain('pullup_bar')
  })

  it('renames a location without evaluating equipment it did not change', async () => {
    const { server, client } = setup()

    const result = await client.saveLocation({
      id: TRAVEL,
      name: 'Hotel',
      tier: 'minimal',
      equipment: [...EQUIPMENT_BY_TIER.minimal],
    })

    expect(result.ok).toBe(true)
    expect(server.locations().map((location) => location.name)).toEqual(['Home', 'Hotel'])
  })

  it('moves the default to a viable location and deletes one that is not the last', async () => {
    const gym = fixtureLocation({
      id: TRAVEL,
      user_id: USER,
      name: 'Gym',
      tier: 'full',
      is_default: false,
    })
    const { server, client } = setup({ locations: [home, gym] })

    const moved = await client.setDefaultLocation(TRAVEL)
    expect(moved.ok && moved.value).toMatchObject({ id: TRAVEL, is_default: true })

    expect(await client.deleteLocation(HOME)).toEqual({ ok: true, value: undefined })
    expect(server.locations().map((location) => location.name)).toEqual(['Gym'])
    // A location already gone is not an error.
    expect(await client.deleteLocation(HOME)).toEqual({ ok: true, value: undefined })
  })

  it('evaluates nothing for a caller with no saved profile', async () => {
    const { server, client } = setup({ profile: null })

    const result = await client.saveLocation(homeDraft([]))

    expect(result.ok).toBe(true)
    expect(server.equipment(HOME)).toEqual([])
  })
})

describe('the screen', () => {
  function card(name: string): HTMLElement {
    const found = screen.getByRole('heading', { name }).closest('.clr-card')
    if (!(found instanceof HTMLElement)) throw new Error(`No card for ${name}`)
    return found
  }

  it('rolls the optimistic update back and shows the previous equipment', async () => {
    const user = userEvent.setup()
    const { server, auth, client } = setup({ locations: [home] })
    const cache = new QueryClient()
    cache.setData(profileQueryKey(FIXTURE_USER_ID), onboardedProfile())
    cache.setData(locationsQueryKey(FIXTURE_USER_ID), [home])
    renderApp(['/settings/locations'], { auth, queryClient: cache, userData: client })

    await user.click(within(card('Home')).getByRole('button', { name: 'Edit' }))
    expect(await screen.findByRole('checkbox', { name: 'Dumbbells' })).toBeChecked()
    await user.click(screen.getByRole('radio', { name: /^Minimal/ }))
    expect(screen.getByRole('checkbox', { name: 'Dumbbells' })).not.toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Save place' }))

    // The refusal is the existing failed-save toast, carrying the sentence.
    expect(
      await screen.findByText(
        'Removing Dumbbells, Kettlebells, Pull-up bar from Home leaves Carries with no exercise the remaining equipment can do. Nothing was changed.',
      ),
    ).toBeVisible()

    // The list is the previous one again …
    await waitFor(() => {
      expect(within(card('Home')).getByText(/Home gym/)).toBeVisible()
    })
    expect(server.equipment(HOME)).toEqual([...EQUIPMENT_BY_TIER.home].sort())

    // … and so is the equipment the editor opens with.
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(within(card('Home')).getByRole('button', { name: 'Edit' }))
    for (const name of ['Dumbbells', 'Kettlebells', 'Pull-up bar']) {
      expect(await screen.findByRole('checkbox', { name })).toBeChecked()
    }
    expect(screen.getByRole('radio', { name: /^Home gym/ })).toBeChecked()
  })

  it('needed no change to do it: the migration and the data layer are the diff (REQ-031)', () => {
    const screenSource = readFileSync(join(REPO_ROOT, 'src/app/LocationSettings.tsx'), 'utf8')

    // The screen composes nothing new for a refusal; it reports a failed save
    // the way it always has.
    expect(screenSource).not.toMatch(/viability|locationRefusal/i)
    expect(screenSource).toContain('useInlineSave')
  })
})
