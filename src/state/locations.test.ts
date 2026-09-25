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
  orderedLocations,
  withDefault,
  withEquipment,
  withLocation,
  withoutLocation,
  withTier,
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

  it('uses a tier as a preset once, then preserves item-by-item edits', () => {
    const minimal = draftFor(null, [])
    const home = withTier(minimal, 'home')
    expect(home.equipment).toContain('dumbbells')

    const customized = withEquipment(home, 'dumbbells')
    expect(withTier(customized, 'home')).toEqual(customized)
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
