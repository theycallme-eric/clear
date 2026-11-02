/**
 * Effects TASK-002 (REQ-001) — the Visual effects checkbox, on the real
 * `/settings` route tree.
 *
 * Checked means on, nothing stored means checked, and a toggle is the device's
 * choice: stored under `clear.visual-effects` beside the skin, read back by a
 * fresh mount, and never written to the account. It is the only effect control
 * Settings offers.
 */
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'

import { createError, ErrorCode, err, ok } from '../state/errors'
import { QueryClient } from '../state/query'
import { locationsQueryKey, profileQueryKey } from '../state/user-queries'
import { createFakeConstraintsClient } from '../test/constraints-double'
import { renderApp, signedIn } from '../test/render'
import {
  createFakeUserDataClient,
  fixtureLocation,
  FIXTURE_USER_ID,
  onboardedProfile,
  type FakeUserDataClient,
} from '../test/user-data-double'

const STORAGE_KEY = 'clear.visual-effects'

function renderSettings(userData: FakeUserDataClient = createFakeUserDataClient()) {
  const cache = new QueryClient()
  cache.setData(profileQueryKey(FIXTURE_USER_ID), onboardedProfile())
  cache.setData(locationsQueryKey(FIXTURE_USER_ID), [fixtureLocation()])
  const rendered = renderApp(
    ['/settings'],
    signedIn({ queryClient: cache, userData, constraints: createFakeConstraintsClient() }),
  )
  return { ...rendered, userData }
}

/** The Appearance card: found by its heading, never by position. */
async function appearanceCard() {
  const heading = await screen.findByRole('heading', { level: 2, name: 'Appearance' })
  const card = heading.closest<HTMLElement>('.clr-card')
  expect(card, 'Appearance is not headed inside a card').not.toBeNull()
  expect(screen.getByRole('region', { name: 'Appearance' })).toContainElement(card)
  return card!
}

const visualEffects = async () =>
  within(await appearanceCard()).getByRole('checkbox', { name: 'Visual effects' })

afterEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-skin')
})

describe('Visual effects is on until the device says otherwise', () => {
  it('is checked in the Appearance card while nothing is stored', async () => {
    renderSettings()

    const box = await visualEffects()
    expect(box).toBeVisible()
    expect(box).toBeChecked()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('ignores an unknown stored value and shows the default', async () => {
    localStorage.setItem(STORAGE_KEY, 'sometimes')
    renderSettings()

    expect(await visualEffects()).toBeChecked()
  })

  it('arrives unchecked from a stored off', async () => {
    localStorage.setItem(STORAGE_KEY, 'off')
    renderSettings()

    expect(await visualEffects()).not.toBeChecked()
  })
})

describe('a toggle is immediate and survives a reload', () => {
  it('unchecks by pointer, and a reload is still unchecked', async () => {
    const user = userEvent.setup()
    const first = renderSettings()

    await user.click(await visualEffects())
    expect(await visualEffects()).not.toBeChecked()
    expect(localStorage.getItem(STORAGE_KEY)).toBe('off')

    first.unmount()
    renderSettings()
    expect(await visualEffects()).not.toBeChecked()
  })

  it('unchecks by keyboard: Tab reaches it and Space operates it', async () => {
    const user = userEvent.setup()
    const first = renderSettings()
    const box = await visualEffects()

    // Reachable in the tab order, not only by a programmatic focus.
    for (let presses = 0; presses < 100 && document.activeElement !== box; presses += 1) {
      await user.tab()
    }
    expect(box).toHaveFocus()

    await user.keyboard(' ')
    expect(await visualEffects()).not.toBeChecked()

    first.unmount()
    renderSettings()
    expect(await visualEffects()).not.toBeChecked()
  })

  it('checks again, and a reload is still checked', async () => {
    const user = userEvent.setup()
    localStorage.setItem(STORAGE_KEY, 'off')
    const first = renderSettings()

    await user.click(await visualEffects())
    expect(await visualEffects()).toBeChecked()
    expect(localStorage.getItem(STORAGE_KEY)).toBe('on')

    first.unmount()
    renderSettings()
    expect(await visualEffects()).toBeChecked()
  })

  it('checks again by keyboard after unchecking', async () => {
    const user = userEvent.setup()
    renderSettings()
    const box = await visualEffects()

    box.focus()
    await user.keyboard(' ')
    expect(box).not.toBeChecked()
    await user.keyboard(' ')
    expect(box).toBeChecked()
    expect(localStorage.getItem(STORAGE_KEY)).toBe('on')
  })
})

describe('the control is the design-system Checkbox in the existing card', () => {
  it('is a native checkbox inside the Checkbox label, in the Appearance card beside the skin', async () => {
    renderSettings()
    const card = await appearanceCard()
    const box = within(card).getByRole('checkbox', { name: 'Visual effects' })

    expect(box.tagName).toBe('INPUT')
    expect(box).toHaveAttribute('type', 'checkbox')
    expect(box.closest('.clr-check')).not.toBeNull()
    expect(card).toContainElement(within(card).getByRole('group', { name: 'Skin' }))
    // Exposed to assistive technology: the role's checked state is the input's.
    expect(screen.getByRole('checkbox', { name: 'Visual effects', checked: true })).toBe(box)
  })
})

describe('the choice is the device’s, not the account’s', () => {
  it('makes no account write and shows no save state', async () => {
    const user = userEvent.setup()
    const { userData } = renderSettings()
    const card = await appearanceCard()

    await user.click(await visualEffects())
    await user.click(await visualEffects())

    expect(userData.preferenceWrites).toEqual([])
    expect(within(card).queryByRole('alert')).toBeNull()
    expect(within(card).queryByRole('status')).toBeNull()
    expect(card.textContent).not.toMatch(/sav(ed|ing)|couldn|didn|failed/i)
    expect(localStorage.getItem(STORAGE_KEY)).toBe('on')
  })
})

describe('Settings offers no other effect controls', () => {
  it('has no Reduce motion checkbox and none of the workbench knobs', async () => {
    renderSettings()
    await appearanceCard()

    expect(screen.queryByRole('checkbox', { name: /reduce motion/i })).toBeNull()
    expect(screen.queryAllByRole('slider')).toHaveLength(0)
    expect(screen.queryAllByRole('spinbutton')).toHaveLength(0)
    const text = (document.body.textContent ?? '').toLowerCase()
    for (const knob of ['reduce motion', 'drift', 'grain', 'feather', 'curvature', 'echo']) {
      expect(text, knob).not.toContain(knob)
    }
    expect(screen.getAllByRole('checkbox', { name: /effect/i })).toHaveLength(1)
  })
})

describe('a profile that fails to load', () => {
  it('shows the existing error and Retry, and the checkbox after a successful retry', async () => {
    const user = userEvent.setup()
    let attempt = 0
    const userData = createFakeUserDataClient({
      profile: async () => {
        attempt += 1
        return attempt === 1
          ? err(createError(ErrorCode.PERSISTENCE_READ_FAILED))
          : ok(onboardedProfile())
      },
    })
    renderApp(
      ['/settings'],
      signedIn({ queryClient: new QueryClient(), userData, constraints: createFakeConstraintsClient() }),
    )

    expect(await screen.findByRole('alert')).toBeVisible()
    expect(screen.queryByRole('checkbox', { name: 'Visual effects' })).toBeNull()

    await user.click(screen.getByRole('button', { name: /retry|try again/i }))

    expect(await visualEffects()).toBeChecked()
    expect(attempt).toBe(2)
  })
})
