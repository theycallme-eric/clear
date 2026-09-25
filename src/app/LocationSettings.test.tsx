import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { createError, err, ErrorCode, type Result } from '../state/errors'
import { QueryClient } from '../state/query'
import type { Location } from '../state/schemas'
import { locationsQueryKey, profileQueryKey } from '../state/user-queries'
import { renderApp, signedIn } from '../test/render'
import {
  createFakeUserDataClient,
  FIXTURE_USER_ID,
  fixtureLocation,
  onboardedProfile,
} from '../test/user-data-double'

const HOME_ID = '00000000-0000-4000-8000-000000000010'
const OFFICE_ID = '00000000-0000-4000-8000-000000000011'

function renderLocations(locations: readonly Location[]) {
  const cache = new QueryClient()
  cache.setData(profileQueryKey(FIXTURE_USER_ID), onboardedProfile())
  cache.setData(locationsQueryKey(FIXTURE_USER_ID), [...locations])
  const userData = createFakeUserDataClient({ stored: locations })
  const rendered = renderApp(
    ['/settings/locations'],
    signedIn({ queryClient: cache, userData }),
  )
  return { ...rendered, cache, userData }
}

function card(name: string): HTMLElement {
  const heading = screen.getByRole('heading', { name })
  const found = heading.closest('.clr-card')
  if (!(found instanceof HTMLElement)) throw new Error(`No card for ${name}`)
  return found
}

describe('location and equipment settings', () => {
  it('edits a place and makes the saved equipment the next read answers', async () => {
    const user = userEvent.setup()
    const home = fixtureLocation({ id: HOME_ID, name: 'Home', is_default: true })
    const { userData } = renderLocations([home])

    await user.click(within(card('Home')).getByRole('button', { name: 'Edit' }))
    const name = await screen.findByRole('textbox', { name: 'Name' })
    await user.clear(name)
    await user.type(name, 'Garage')
    await user.click(screen.getByRole('checkbox', { name: 'Dumbbells' }))
    await user.click(screen.getByRole('button', { name: 'Save place' }))

    await waitFor(() => expect(userData.locationWrites).toHaveLength(1))
    expect(userData.locationWrites[0]).toMatchObject({
      id: HOME_ID,
      name: 'Garage',
      equipment: expect.arrayContaining(['dumbbells']),
    })
    expect(await screen.findByRole('heading', { name: 'Garage' })).toBeVisible()

    const equipment = await userData.locationEquipment(HOME_ID)
    expect(equipment.ok && equipment.value).toContain('dumbbells')
  })

  it('moves the default optimistically and rolls back a refused write', async () => {
    const user = userEvent.setup()
    const home = fixtureLocation({ id: HOME_ID, name: 'Home', is_default: true })
    const office = fixtureLocation({ id: OFFICE_ID, name: 'Office', is_default: false })
    const pending: { resolve?: (result: Result<Location>) => void } = {}
    const userData = createFakeUserDataClient({
      stored: [home, office],
      setDefaultLocation: () =>
        new Promise<Result<Location>>((resolve) => {
          pending.resolve = resolve
        }),
    })
    const cache = new QueryClient()
    cache.setData(profileQueryKey(FIXTURE_USER_ID), onboardedProfile())
    cache.setData(locationsQueryKey(FIXTURE_USER_ID), [home, office])
    renderApp(
      ['/settings/locations'],
      signedIn({ queryClient: cache, userData }),
    )

    await user.click(
      within(card('Office')).getByRole('button', { name: 'Make default' }),
    )
    expect(within(card('Office')).getByText(/Default for generation/)).toBeVisible()

    const resolve = pending.resolve
    if (resolve === undefined) throw new Error('default write did not start')
    resolve(err(createError(ErrorCode.PERSISTENCE_WRITE_FAILED)))

    await waitFor(() => {
      expect(within(card('Home')).getByText(/Default for generation/)).toBeVisible()
    })
  })

  it('requires reassignment before deleting the default place', async () => {
    const user = userEvent.setup()
    const home = fixtureLocation({ id: HOME_ID, name: 'Home', is_default: true })
    const office = fixtureLocation({ id: OFFICE_ID, name: 'Office', is_default: false })
    const { userData } = renderLocations([home, office])

    await user.click(within(card('Home')).getByRole('button', { name: 'Delete' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /make another one the default first/i,
    )
    expect(userData.locationDeletes).toEqual([])
  })
})
