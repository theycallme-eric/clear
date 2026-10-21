import { describe, expect, it } from 'vitest'

import { fixtureLocation } from '../test/user-data-double'
import {
  BLANK_NAME_REASON,
  DEFAULT_DELETE_REASON,
  DUPLICATE_NAME_REASON,
  deletionRefusal,
  draftFor,
  draftRefusal,
  equipmentOptions,
  NEW_LOCATION_TIER,
  orderedLocations,
  withDefault,
  withEquipment,
  withLocation,
  withoutLocation,
} from './locations'

const HOME_ID = '00000000-0000-4000-8000-000000000010'
const OFFICE_ID = '00000000-0000-4000-8000-000000000011'

describe('location settings rules', () => {
  it('keeps the default first and the rest in name order', () => {
    const rows = [
      fixtureLocation({ id: OFFICE_ID, name: 'Office', is_default: false }),
      fixtureLocation({ id: HOME_ID, name: 'Home', is_default: true }),
      fixtureLocation({ id: '00000000-0000-4000-8000-000000000012', name: 'Club', is_default: false }),
    ]

    expect(orderedLocations(rows).map((row) => row.name)).toEqual([
      'Home',
      'Club',
      'Office',
    ])
  })

  it('opens a new place with nothing ticked — no starter preset outside onboarding', () => {
    const draft = draftFor(null, [])
    expect(draft.equipment).toEqual([])
    // Tier is stored metadata only; it presets nothing.
    expect(draft.tier).toBe(NEW_LOCATION_TIER)
  })

  it('opens a place with exactly its saved equipment, never what its name or tier suggests', () => {
    // Named and tiered like a full gym, holding only a band and a custom sled.
    const gym = fixtureLocation({ id: HOME_ID, name: 'Full gym', tier: 'full' })
    const draft = draftFor(gym, ['custom_sled', 'resistance_bands'])

    expect(draft.equipment).toEqual(['resistance_bands', 'custom_sled'])
    expect(draft.tier).toBe('full')
  })

  it('adds and removes equipment item by item, keeping the stored tier', () => {
    const gym = fixtureLocation({ id: HOME_ID, name: 'Garage', tier: 'home' })
    const added = withEquipment(draftFor(gym, ['bodyweight']), 'dumbbells')
    expect(added.equipment).toEqual(['bodyweight', 'dumbbells'])

    const removed = withEquipment(added, 'bodyweight')
    expect(removed.equipment).toEqual(['dumbbells'])
    expect(removed.tier).toBe('home')
  })

  it('offers no tier editing or tier labels to the Locations screen', async () => {
    const rules: Record<string, unknown> = await import('./locations')
    expect(rules).not.toHaveProperty('withTier')
    expect(rules).not.toHaveProperty('TIERS')
    expect(rules).not.toHaveProperty('tierLabel')
  })

  it('refuses blank and duplicate names before opening a write', () => {
    const rows = [fixtureLocation({ id: HOME_ID, name: 'Home' })]
    expect(draftRefusal({ ...draftFor(null, []), name: '   ' }, rows)).toBe(
      BLANK_NAME_REASON,
    )
    expect(draftRefusal({ ...draftFor(null, []), name: ' home ' }, rows)).toBe(
      DUPLICATE_NAME_REASON,
    )
  })

  it('moves the default atomically in the optimistic list', () => {
    const rows = [
      fixtureLocation({ id: HOME_ID, name: 'Home', is_default: true }),
      fixtureLocation({ id: OFFICE_ID, name: 'Office', is_default: false }),
    ]

    const moved = withDefault(rows, OFFICE_ID)
    expect(moved.filter((row) => row.is_default).map((row) => row.id)).toEqual([
      OFFICE_ID,
    ])
  })

  it('adds, replaces and removes a location without changing another row', () => {
    const home = fixtureLocation({ id: HOME_ID, name: 'Home' })
    const office = fixtureLocation({ id: OFFICE_ID, name: 'Office', is_default: false })
    expect(withLocation([home], office)).toHaveLength(2)
    expect(withLocation([home, office], { ...office, name: 'Work' })[1]?.name).toBe(
      'Work',
    )
    expect(withoutLocation([home, office], OFFICE_ID)).toEqual([home])
  })

  it('requires reassignment before deleting a default when another place exists', () => {
    const home = fixtureLocation({ id: HOME_ID, is_default: true })
    const office = fixtureLocation({ id: OFFICE_ID, is_default: false })
    expect(deletionRefusal([home, office], HOME_ID)).toBe(DEFAULT_DELETE_REASON)
    expect(deletionRefusal([home], HOME_ID)).toBeNull()
    expect(deletionRefusal([home, office], OFFICE_ID)).toBeNull()
  })

  it('keeps unknown equipment visible and removable', () => {
    const options = equipmentOptions(['bodyweight', 'custom_sled'])
    expect(options.at(-1)).toEqual({ value: 'custom_sled', label: 'custom_sled' })
  })
})
