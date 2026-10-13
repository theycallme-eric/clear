import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { createError, err, ErrorCode, ok, type Result } from '../state/errors'
import { BLANK_NAME_REASON, DUPLICATE_NAME_REASON } from '../state/locations'
import { QueryClient } from '../state/query'
import type { Location, LocationSetup } from '../state/schemas'
import { locationsQueryKey, profileQueryKey } from '../state/user-queries'
import { renderApp, renderWithProviders, signedIn } from '../test/render'
import {
  createFakeUserDataClient,
  FIXTURE_USER_ID,
  fixtureLocation,
  onboardedProfile,
  type FakeUserDataOptions,
} from '../test/user-data-double'
import { LocationSettings } from './LocationSettings'

const HOME_ID = '00000000-0000-4000-8000-000000000010'
const OFFICE_ID = '00000000-0000-4000-8000-000000000011'

const home = () => fixtureLocation({ id: HOME_ID, name: 'Home', is_default: true })
const office = () => fixtureLocation({ id: OFFICE_ID, name: 'Office', is_default: false })

function renderLocations(
  locations: readonly Location[],
  options: Omit<FakeUserDataOptions, 'stored'> = {},
) {
  const cache = new QueryClient()
  cache.setData(profileQueryKey(FIXTURE_USER_ID), onboardedProfile())
  cache.setData(locationsQueryKey(FIXTURE_USER_ID), [...locations])
  const userData = createFakeUserDataClient({ ...options, stored: locations })
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

function footer(): HTMLElement {
  const found = screen.getByRole('main').querySelector('.clr-footer')
  if (!(found instanceof HTMLElement)) throw new Error('Nothing is pinned')
  return found
}

function buttonNames(container: HTMLElement): string[] {
  return within(container)
    .queryAllByRole('button')
    .map((button) => button.textContent.trim())
}

describe('location and equipment settings', () => {
  it('edits a place and makes the saved equipment the next read answers', async () => {
    const user = userEvent.setup()
    const { userData } = renderLocations([home()])

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
    const pending: { resolve?: (result: Result<Location>) => void } = {}
    renderLocations([home(), office()], {
      setDefaultLocation: () =>
        new Promise<Result<Location>>((resolve) => {
          pending.resolve = resolve
        }),
    })

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
    const { userData } = renderLocations([home(), office()])

    await user.click(within(card('Home')).getByRole('button', { name: 'Delete' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /make another one the default first/i,
    )
    expect(userData.locationDeletes).toEqual([])
  })
})

describe('the list is headed cards with measured actions', () => {
  it('puts only the title on the atmosphere and each place in one card', () => {
    renderLocations([home(), office()])

    const main = screen.getByRole('main')
    const cards = [card('Home'), card('Office')]
    expect([...main.querySelectorAll('.clr-card')]).toEqual(cards)
    expect(
      screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent),
    ).toEqual(['Home', 'Office'])
    for (const place of cards) {
      expect(place.querySelector('.clr-card__bar')).not.toBeNull()
      expect(place.querySelector('.clr-card')).toBeNull()
      expect(place.querySelector('.clr-list')).toBeNull()
    }

    const title = screen.getByRole('heading', { level: 1, name: 'Places and equipment' })
    expect(title.closest('.clr-card')).toBeNull()
    // No intro line, refusal or save line floats between the title and the cards.
    for (const text of main.querySelectorAll('p')) {
      expect(text.closest('.clr-card')).not.toBeNull()
    }
  })

  it('marks the default with a tick and a sentence, in its card alone', () => {
    renderLocations([home(), office()])

    const marker = within(card('Home')).getByText(/Default for generation/)
    expect(marker.querySelector('svg')).not.toBeNull()
    expect(
      within(card('Home')).getByText(
        'Generation uses this place and the equipment saved with it.',
      ),
    ).toBeVisible()
    expect(within(card('Office')).queryByText(/Default for generation/)).toBeNull()
    expect(within(card('Home')).getByText('Minimal')).toBeVisible()
  })

  it('offers Edit as the quiet action and frames the rest in one action row', () => {
    renderLocations([home(), office()])

    const edit = within(card('Office')).getByRole('button', { name: 'Edit' })
    expect(edit).toHaveClass('clr-text-action')

    const actions = card('Office').querySelector('.clr-actions')
    if (!(actions instanceof HTMLElement)) throw new Error('No action row for Office')
    expect(buttonNames(actions)).toEqual(['Make default', 'Delete'])
    // The row promotes a critical button to its main action. Deleting is not
    // what a place is for; the confirmation carries the severity.
    expect(within(actions).getByRole('button', { name: 'Delete' })).not.toHaveClass(
      'clr-btn--critical',
    )

    expect(buttonNames(card('Home'))).toEqual(['Edit', 'Delete'])
    expect(buttonNames(footer())).toEqual(['Add place'])
  })

  it('says a save happened in the card that made it, and nowhere else', async () => {
    const user = userEvent.setup()
    renderLocations([home(), office()])

    expect(within(screen.getByRole('main')).queryByRole('status')).toBeNull()
    await user.click(within(card('Office')).getByRole('button', { name: 'Make default' }))

    await waitFor(() => {
      expect(within(card('Office')).getByRole('status')).toHaveTextContent('Saved')
    })
    expect(within(card('Home')).queryByRole('status')).toBeNull()
  })

  it('keeps a refusal in the card it is about, with a glyph', async () => {
    const user = userEvent.setup()
    renderLocations([home(), office()])

    await user.click(within(card('Home')).getByRole('button', { name: 'Delete' }))

    const refusal = within(card('Home')).getByRole('alert')
    expect(refusal).toHaveTextContent(
      /^Workouts are generated from this location\. Make another one the default first\.$/,
    )
    expect(refusal.querySelector('svg')).not.toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('deleting a place', () => {
  it('asks first, then removes the place and its card', async () => {
    const user = userEvent.setup()
    const { userData } = renderLocations([home(), office()])

    await user.click(within(card('Office')).getByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete this place?' })
    expect(dialog).toHaveTextContent('Office and its equipment list will be removed.')
    expect(userData.locationDeletes).toEqual([])

    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(userData.locationDeletes).toEqual([OFFICE_ID]))
    expect(screen.queryByRole('heading', { name: 'Office' })).toBeNull()
    expect(card('Home')).toBeVisible()
  })

  it('leaves the place alone when the question is cancelled', async () => {
    const user = userEvent.setup()
    const { userData } = renderLocations([home(), office()])

    await user.click(within(card('Office')).getByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete this place?' })
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(card('Office')).toBeVisible()
    expect(userData.locationDeletes).toEqual([])
  })

  it('puts the card back when the delete is refused', async () => {
    const user = userEvent.setup()
    const pending: { resolve?: (result: Result<void>) => void } = {}
    renderLocations([home(), office()], {
      deleteLocation: () =>
        new Promise<Result<void>>((resolve) => {
          pending.resolve = resolve
        }),
    })

    await user.click(within(card('Office')).getByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete this place?' })
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Office' })).toBeNull()
    })

    const resolve = pending.resolve
    if (resolve === undefined) throw new Error('delete write did not start')
    resolve(err(createError(ErrorCode.PERSISTENCE_WRITE_FAILED)))

    expect(await screen.findByRole('heading', { name: 'Office' })).toBeVisible()
  })
})

describe('the editor is one form card with its actions pinned', () => {
  it('opens a new place beside the list, with Save and Cancel in the footer', async () => {
    const user = userEvent.setup()
    renderLocations([home()])

    await user.click(screen.getByRole('button', { name: 'Add place' }))

    const editor = card('Add place')
    expect(screen.getByRole('heading', { level: 2, name: 'Add place' })).toBeVisible()
    expect(editor.querySelector('.clr-card')).toBeNull()
    const name = within(editor).getByRole('textbox', { name: 'Name' })
    expect(name).toHaveFocus()
    expect(within(editor).getByRole('group', { name: 'Equipment tier' })).toBeVisible()
    expect(within(editor).getByRole('group', { name: 'Equipment' })).toBeVisible()
    // The card holds the fields; what is done with them is pinned.
    expect(within(editor).queryAllByRole('button')).toEqual([])
    expect(buttonNames(footer())).toEqual(['Save place', 'Cancel'])

    const form = editor.querySelector('form')
    if (form === null) throw new Error('The editor is not a form')
    const save = within(footer()).getByRole('button', { name: 'Save place' })
    expect(save).toHaveAttribute('type', 'submit')
    expect(save).toHaveAttribute('form', form.id)

    // The list is still the list, and still one card per place.
    expect(card('Home')).toBeVisible()
    expect(screen.getByRole('main').querySelectorAll('.clr-card')).toHaveLength(2)

    await user.click(within(footer()).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('heading', { name: 'Add place' })).toBeNull()
    expect(buttonNames(footer())).toEqual(['Add place'])
  })

  it('creates the first place from the empty state, as the default', async () => {
    const user = userEvent.setup()
    const { userData } = renderLocations([])

    const main = screen.getByRole('main')
    expect(screen.getByText('No places yet')).toBeVisible()
    expect(main.querySelectorAll('.clr-card')).toHaveLength(1)
    expect(buttonNames(footer())).toEqual(['Add place'])

    await user.click(screen.getByRole('button', { name: 'Add place' }))
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Garage')
    await user.click(screen.getByRole('button', { name: 'Save place' }))

    await waitFor(() => expect(userData.locationWrites).toHaveLength(1))
    expect(userData.locationWrites[0]).toMatchObject({ id: null, name: 'Garage' })
    expect(
      await within(card('Garage')).findByText(/Default for generation/),
    ).toBeVisible()
    expect(screen.queryByText('No places yet')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Save place' })).toBeNull()
  })

  it('refuses a blank name on the field, and moves focus to it', async () => {
    const user = userEvent.setup()
    const { userData } = renderLocations([home()])

    await user.click(screen.getByRole('button', { name: 'Add place' }))
    await user.click(screen.getByRole('checkbox', { name: 'Dumbbells' }))
    await user.click(screen.getByRole('button', { name: 'Save place' }))

    const name = screen.getByRole('textbox', { name: 'Name' })
    expect(name).toHaveAttribute('aria-invalid', 'true')
    expect(name).toHaveAccessibleDescription(BLANK_NAME_REASON)
    expect(name).toHaveFocus()
    expect(userData.locationWrites).toEqual([])
  })

  it('refuses a name already taken inside the editor card', async () => {
    const user = userEvent.setup()
    const { userData } = renderLocations([home()])

    await user.click(screen.getByRole('button', { name: 'Add place' }))
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'home')
    await user.click(screen.getByRole('button', { name: 'Save place' }))

    const refusal = within(card('Add place')).getByRole('alert')
    expect(refusal).toHaveTextContent(DUPLICATE_NAME_REASON)
    expect(refusal.querySelector('svg')).not.toBeNull()
    expect(userData.locationWrites).toEqual([])
  })

  it('holds the equipment loading and error states inside the same card', async () => {
    const user = userEvent.setup()
    let attempts = 0
    let settle: () => void = () => {}
    renderLocations([home()], {
      locationEquipment: () => {
        attempts += 1
        if (attempts > 1) return Promise.resolve(ok(['bodyweight', 'dumbbells']))
        return new Promise<Result<string[]>>((resolve) => {
          settle = () => {
            resolve(err(createError(ErrorCode.PERSISTENCE_READ_FAILED)))
          }
        })
      },
    })

    await user.click(within(card('Home')).getByRole('button', { name: 'Edit' }))

    const editor = card('Edit Home')
    const busy = await within(editor).findByText('Reading Home equipment…')
    expect(busy.closest('[aria-busy="true"]')).not.toBeNull()
    expect(editor.querySelector('.clr-card')).toBeNull()
    // The editor opens below the list, so focus goes to it.
    expect(screen.getByRole('region', { name: 'Edit Home' })).toHaveFocus()
    // Nothing to save yet, so the way out is the only pinned action.
    expect(buttonNames(footer())).toEqual(['Cancel'])

    settle()
    const alert = await within(editor).findByRole('alert')
    expect(alert).toHaveTextContent('This equipment list didn’t load')
    expect(editor.querySelector('.clr-card')).toBeNull()
    expect(buttonNames(footer())).toEqual(['Cancel'])

    await user.click(within(editor).getByRole('button', { name: 'Retry' }))
    expect(await within(editor).findByRole('checkbox', { name: 'Dumbbells' })).toBeChecked()
    expect(buttonNames(footer())).toEqual(['Save place', 'Cancel'])
  })

  it('keeps the editor and puts the list back when the save is refused', async () => {
    const user = userEvent.setup()
    const pending: { resolve?: (result: Result<LocationSetup>) => void } = {}
    const { userData } = renderLocations([home()], {
      saveLocation: () =>
        new Promise<Result<LocationSetup>>((resolve) => {
          pending.resolve = resolve
        }),
    })

    await user.click(within(card('Home')).getByRole('button', { name: 'Edit' }))
    const name = await screen.findByRole('textbox', { name: 'Name' })
    await user.clear(name)
    await user.type(name, 'Garage')
    await user.click(screen.getByRole('button', { name: 'Save place' }))

    // Optimistic: the list answers before the write does, and says it is saving.
    expect(await screen.findByRole('heading', { name: 'Garage' })).toBeVisible()
    expect(within(card('Edit Home')).getByRole('status')).toHaveTextContent('Saving…')
    expect(
      within(footer()).getByRole('button', { name: 'Save place' }),
    ).toHaveAttribute('aria-busy', 'true')

    const resolve = pending.resolve
    if (resolve === undefined) throw new Error('save did not start')
    resolve(err(createError(ErrorCode.PERSISTENCE_WRITE_FAILED)))

    expect(await screen.findByRole('heading', { name: 'Home' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Garage' })).toBeNull()
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Garage')
    expect(
      within(footer()).getByRole('button', { name: 'Save place' }),
    ).not.toHaveAttribute('aria-busy', 'true')
    expect(userData.locationWrites).toHaveLength(1)
  })
})

describe('the screen implements all four states', () => {
  function renderScreen(options: Omit<FakeUserDataOptions, 'stored'>) {
    const userData = createFakeUserDataClient({ ...options, stored: [] })
    return renderWithProviders(
      <LocationSettings />,
      { route: '/settings/locations', ...signedIn({ queryClient: new QueryClient(), userData }) },
    )
  }

  it('shows the scan loader while the places are read, then the list', async () => {
    let settle: () => void = () => {}
    renderScreen({
      locations: () =>
        new Promise<Result<Location[]>>((resolve) => {
          settle = () => {
            resolve(ok([home()]))
          }
        }),
    })

    const busy = await screen.findByText(/reading your places/i)
    expect(busy.closest('[aria-busy="true"]')).not.toBeNull()
    expect(screen.getByRole('main').querySelector('.clr-footer')).toBeNull()

    settle()
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeVisible()
    expect(buttonNames(footer())).toEqual(['Add place'])
  })

  it('shows the failure with Retry pinned, and retrying reaches the list', async () => {
    const user = userEvent.setup()
    let attempts = 0
    renderScreen({
      locations: () => {
        attempts += 1
        return Promise.resolve(
          attempts === 1
            ? err(createError(ErrorCode.PERSISTENCE_READ_FAILED))
            : ok([home()]),
        )
      },
    })

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Your places didn’t load')
    expect(within(alert).queryByRole('button')).toBeNull()
    expect(buttonNames(footer())).toEqual(['Retry'])

    await user.click(within(footer()).getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeVisible()
    expect(attempts).toBe(2)
  })
})
