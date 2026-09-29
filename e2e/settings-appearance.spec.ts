import type { Page } from '@playwright/test'

import { reset, seed } from '../scripts/e2e/lifecycle.mjs'
import { emailForSlot } from '../scripts/e2e/namespace.mjs'
import { SKINS } from '../src/design-system/skin'

import { expect, test } from './fixtures'
import { REQUIRED_JOURNEYS } from './required-routes'
import { backend } from './support/backend'

/**
 * REQ-010 — the Settings to appearance journey, walked in a browser.
 *
 * A seeded, onboarded user lands Home, opens Settings, picks every skin the
 * approved registry ships, reloads, and then picks the system option. Three
 * things are asserted that a component test cannot:
 *
 *   * **The document, not the control.** Every choice is read back from
 *     `<html data-skin>` — the attribute the ramps derive from — and from the
 *     stored `clear.skin`, so a picker that ticks an option and applies nothing
 *     fails here.
 *   * **One option per registry entry.** The expected list is `SKINS` from the
 *     export's `skin.js`, plus the system option, compared as the whole list
 *     of radios. A skin missing from the picker fails; so does an extra one.
 *   * **Persistence and its undoing.** The reload leg proves the choice
 *     survives a fresh document. The system leg proves the stored choice is
 *     removed, and that the skin then follows the OS contrast preference again
 *     — `mono` under `prefers-contrast: more`, the app default without it.
 *
 * The session is minted by the harness rather than typed: the OTP screen has
 * its own spec, and this journey starts at Home.
 */

const journey = REQUIRED_JOURNEYS.find((entry) => entry.id === 'settings-appearance')

/** The skin key `skin.js` persists under — the contract, not an app detail. */
const SKIN_KEY = 'clear.skin'

/** `src/data/auth.ts`'s `SESSION_STORAGE_KEY`. */
const SESSION_KEY = 'clear.auth.session'

/** The system option's accessible name starts with this; the skins' with their id. */
const SYSTEM_LABEL = /^System\b/i

const skinLabel = (skin: string) => new RegExp(`^${skin}\\b`, 'i')

const appliedSkin = (page: Page) =>
  page.evaluate(() => document.documentElement.getAttribute('data-skin'))

const storedSkin = (page: Page) =>
  page.evaluate((key) => window.localStorage.getItem(key), SKIN_KEY)

test('the journey walks Home to Settings, and the registry is not empty', () => {
  // Credential-free, so it holds on every lane: the journey this file proves
  // is the one the inventory names, and there are skins to choose between.
  expect(journey?.steps).toEqual(['Home', 'Settings'])
  expect(SKINS.length).toBeGreaterThan(1)
  expect(new Set(SKINS).size).toBe(SKINS.length)
})

test.describe('Settings to appearance', () => {
  test.skip(!backend.available, backend.reason)
  test.describe.configure({ mode: 'serial' })

  let client: ReturnType<typeof backend.client>

  test.beforeAll(async () => {
    client = backend.client()
    const { users } = await seed(client)
    const session = await client.mintSession(emailForSlot('a'))

    // The seed writes a bare profile; Settings is behind the onboarding gate.
    const onboarded = await client.updateAs(
      'profiles',
      { id: `eq.${users.a.id}` },
      { onboarded_at: new Date().toISOString() },
      session.accessToken,
    )
    expect(onboarded.ok, `marking the profile onboarded (status ${onboarded.status})`).toBe(true)
  })

  test.afterAll(async () => {
    if (client) await reset(client)
  })

  test.beforeEach(async ({ page }) => {
    const { accessToken, refreshToken, userId } = await client.mintSession(emailForSlot('a'))
    const stored = JSON.stringify({
      accessToken,
      refreshToken,
      // GoTrue's default access token lasts an hour; the walk takes seconds.
      expiresAt: Date.now() + 50 * 60 * 1000,
      user: { id: userId, email: emailForSlot('a') },
    })

    // Written before any app script runs, and only once: a reload must find
    // the app's own session and skin, not this one written over them.
    await page.addInitScript(
      ({ key, value }) => {
        if (window.localStorage.getItem(key) === null) window.localStorage.setItem(key, value)
      },
      { key: SESSION_KEY, value: stored },
    )
  })

  test('each choice applies to the document, survives a reload, and system clears it', async ({
    page,
    visit,
    checkA11y,
  }) => {
    // Home, the journey's entry.
    await page.emulateMedia({ contrast: 'no-preference' })
    await visit('/')
    await expect(page).toHaveURL(/\/$/)
    expect(await storedSkin(page), 'a stored skin leaked in from elsewhere').toBeNull()

    // Home → Settings, the way a user gets there.
    await page.getByRole('link', { name: /^settings$/i }).first().click()
    await expect(page).toHaveURL(/\/settings$/)
    await expect(page.locator('main h1')).toHaveText(/settings/i)
    await checkA11y()

    const picker = page
      .getByRole('radiogroup')
      .filter({ has: page.getByRole('radio', { name: SYSTEM_LABEL }) })
    await expect(picker).toHaveCount(1)
    const radios = picker.getByRole('radio')

    // One option per registry entry, plus System — as a whole list, in order,
    // so a missing or an extra option fails rather than passing.
    const names = await radios.evaluateAll((nodes) =>
      nodes.map((node) => node.textContent?.trim() ?? ''),
    )
    expect(names, 'the picker does not offer exactly the approved skins').toHaveLength(
      SKINS.length + 1,
    )
    expect(names[0]).toMatch(SYSTEM_LABEL)
    SKINS.forEach((skin, index) => {
      expect(names[index + 1], `no option for the "${skin}" skin`).toMatch(skinLabel(skin))
    })

    // Nothing stored yet, so System is the choice.
    await expect(picker.getByRole('radio', { name: SYSTEM_LABEL })).toHaveAttribute(
      'aria-checked',
      'true',
    )

    // Every skin, read back from the document rather than from the control.
    for (const skin of SKINS) {
      const option = picker.getByRole('radio', { name: skinLabel(skin) })
      await option.click()
      await expect(option).toHaveAttribute('aria-checked', 'true')
      await expect(page.locator('html')).toHaveAttribute('data-skin', skin)
      expect(await storedSkin(page)).toBe(skin)
    }

    // Reload: a choice that is not the default proves persistence, because a
    // fresh document with nothing stored would resolve to something else.
    const chosen =
      SKINS.find((skin) => skin !== 'clear' && skin !== 'mono') ?? SKINS[SKINS.length - 1]
    await picker.getByRole('radio', { name: skinLabel(chosen) }).click()
    await expect(page.locator('html')).toHaveAttribute('data-skin', chosen)

    await page.reload()
    await expect(page.locator('main h1')).toHaveText(/settings/i)
    expect(await appliedSkin(page), 'the choice did not survive the reload').toBe(chosen)
    expect(await storedSkin(page)).toBe(chosen)
    await expect(
      page.getByRole('radio', { name: skinLabel(chosen) }),
      'the picker did not restore the stored choice',
    ).toHaveAttribute('aria-checked', 'true')
    await checkA11y()

    // System: the stored choice is removed, and the skin follows the OS again.
    await page.emulateMedia({ contrast: 'more' })
    await page.getByRole('radio', { name: SYSTEM_LABEL }).click()
    await expect(page.getByRole('radio', { name: SYSTEM_LABEL })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(await storedSkin(page), 'System left a stored skin behind').toBeNull()
    await expect(page.locator('html')).toHaveAttribute('data-skin', 'mono')

    // Following live, not a one-off resolution: the preference flips back.
    await page.emulateMedia({ contrast: 'no-preference' })
    await expect(page.locator('html')).toHaveAttribute('data-skin', 'clear')

    // And a reload with nothing stored stays on System.
    await page.reload()
    await expect(page.locator('main h1')).toHaveText(/settings/i)
    expect(await storedSkin(page)).toBeNull()
    expect(await appliedSkin(page)).toBe('clear')
    await expect(page.getByRole('radio', { name: SYSTEM_LABEL })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  })
})
