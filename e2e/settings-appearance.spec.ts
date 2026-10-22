import type { Page } from '@playwright/test'

import { reset, seed } from '../scripts/e2e/lifecycle.mjs'
import { emailForSlot } from '../scripts/e2e/namespace.mjs'
import { SKINS } from '../src/design-system/skin'

import { expect, test } from './fixtures'
import { REQUIRED_JOURNEYS } from './required-routes'
import { backend } from './support/backend'

/**
 * REQ-010 / U24 — the Settings to appearance journey, walked in a browser.
 *
 * A seeded, onboarded user lands Home with the OS asking for more contrast,
 * opens Settings, finds only explicit skins, picks every one the approved
 * registry ships, and reloads. Four things are asserted that a component test
 * cannot:
 *
 *   * **The document, not the control.** Every choice is read back from
 *     `<html data-skin>` — the attribute the ramps derive from — and from the
 *     stored `clear.skin`, so a picker that ticks an option and applies nothing
 *     fails here.
 *   * **Exactly the registry, no System.** The expected list is `SKINS` from
 *     the export's `skin.js`, compared as the whole list of radios. A missing
 *     skin fails; so does an extra one, the retired System option included.
 *     The chips wrap inside the card at phone width rather than overflowing.
 *   * **The default, and the OS never deciding.** With nothing stored — and
 *     with a legacy stored `system` — the product default is applied and
 *     selected even under `prefers-contrast: more`; flipping that preference
 *     never moves the skin, before or after an explicit choice.
 *   * **Persistence.** The reload leg proves an explicit choice survives a
 *     fresh document, and enhanced contrast is still one explicit choice away.
 *
 * REQ-026 adds the composition and the profile's half of persistence: every
 * section is one 0.14.3 card with its heading inside, and a preference saved
 * under a chosen skin comes back with that skin after the same reload.
 *
 * The session is minted by the harness rather than typed: the OTP screen has
 * its own spec, and this journey starts at Home.
 */

const journey = REQUIRED_JOURNEYS.find((entry) => entry.id === 'settings-appearance')

/** The skin key `skin.js` persists under — the contract, not an app detail. */
const SKIN_KEY = 'clear.skin'

/** `src/data/auth.ts`'s `SESSION_STORAGE_KEY`. */
const SESSION_KEY = 'clear.auth.session'

/** `src/state/appearance.ts`'s `DEFAULT_SKIN` — the existing product default. */
const DEFAULT_SKIN = 'clear'

/** The retired option's accessible name started with this. */
const SYSTEM_LABEL = /^System\b/i

const skinLabel = (skin: string) => new RegExp(`^${skin}\\b`, 'i')

const appliedSkin = (page: Page) =>
  page.evaluate(() => document.documentElement.getAttribute('data-skin'))

const storedSkin = (page: Page) =>
  page.evaluate((key) => window.localStorage.getItem(key), SKIN_KEY)

/** The Settings sections, in order — each one card with this heading inside. */
const SECTION_HEADINGS = [
  'Training',
  'Limitations',
  'Appearance',
  'Places and equipment',
  'Workout formats',
  'Session',
]

const sectionCard = (page: Page, name: string) =>
  page
    .locator('main .clr-card')
    .filter({ has: page.getByRole('heading', { level: 2, name, exact: true }) })

test('the journey walks Home to Settings, and the registry is not empty', () => {
  // Credential-free, so it holds on every lane: the journey this file proves
  // is the one the inventory names, and there are skins to choose between.
  expect(journey?.steps).toEqual(['Home', 'Settings'])
  expect(SKINS.length).toBeGreaterThan(1)
  expect(new Set(SKINS).size).toBe(SKINS.length)
  // 0.14.3 ships four, and the walk below visits each one of them.
  expect(SKINS).toHaveLength(4)
  expect(SKINS).toContain(DEFAULT_SKIN)
  expect(SKINS).toContain('mono')
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

  test('only explicit skins, the default when unset, persistence, and the OS never deciding', async ({
    page,
    visit,
    checkA11y,
  }, testInfo) => {
    // Home, the journey's entry — with the OS asking for more contrast, which
    // used to select Mono on its own and now must not.
    await page.emulateMedia({ contrast: 'more' })
    await visit('/')
    await expect(page).toHaveURL(/\/$/)
    expect(await storedSkin(page), 'a stored skin leaked in from elsewhere').toBeNull()
    expect(await appliedSkin(page), 'the OS contrast setting picked the skin').toBe(DEFAULT_SKIN)

    // Home → Settings, the way a user gets there.
    await page.locator('header').getByRole('button', { name: 'Settings', exact: true }).click()
    await expect(page).toHaveURL(/\/settings$/)
    await expect(page.locator('main h1')).toHaveText(/settings/i)
    await checkA11y()

    // 0.14.3 containment: every section is one card with its heading inside,
    // and only the screen title sits on the atmosphere.
    const cards = page.locator('main .clr-card')
    await expect(cards).toHaveCount(SECTION_HEADINGS.length)
    for (const [index, name] of SECTION_HEADINGS.entries()) {
      await expect(
        cards.nth(index).getByRole('heading', { level: 2, name, exact: true }),
      ).toBeVisible()
    }
    await expect(page.locator('main .clr-card .clr-card')).toHaveCount(0)
    await page.screenshot({ path: testInfo.outputPath('settings-cards.png') })
    await expect(cards.getByRole('heading', { level: 1 })).toHaveCount(0)
    await expect(
      sectionCard(page, 'Places and equipment').getByRole('button', { name: 'Manage places' }),
    ).toHaveClass(/clr-text-action/)
    const formatsAction = sectionCard(page, 'Workout formats').getByRole('button', {
      name: /^Preview formats(?:\s*›)?$/,
    })
    await expect(formatsAction).toHaveCount(1)
    await expect(formatsAction).toBeVisible()
    await expect(formatsAction).toHaveClass(/clr-text-action/)

    const appearance = sectionCard(page, 'Appearance')
    const picker = appearance.getByRole('radiogroup')
    await expect(picker).toHaveCount(1)
    await expect(page.getByRole('radio', { name: SYSTEM_LABEL })).toHaveCount(0)
    await expect(page.getByText(/follows your contrast/i)).toHaveCount(0)
    const radios = picker.getByRole('radio')

    // Exactly one option per registry entry — as a whole list, in order, so a
    // missing option or an extra one (System included) fails.
    const names = await radios.evaluateAll((nodes) =>
      nodes.map((node) => node.textContent?.trim() ?? ''),
    )
    expect(names, 'the picker does not offer exactly the approved skins').toHaveLength(
      SKINS.length,
    )
    SKINS.forEach((skin, index) => {
      expect(names[index], `no option for the "${skin}" skin`).toMatch(skinLabel(skin))
    })
    // Enhanced contrast stays an explicit, named choice.
    await expect(picker.getByRole('radio', { name: /^mono\b.*enhanced contrast/i })).toBeVisible()

    // Responsive: the chips wrap inside the card instead of running off it.
    const cardBox = await appearance.boundingBox()
    expect(cardBox, 'the Appearance card has no box').not.toBeNull()
    for (const radio of await radios.all()) {
      const box = await radio.boundingBox()
      expect(box, 'a skin option has no box').not.toBeNull()
      if (!cardBox || !box) continue
      expect(box.x, 'a skin option starts outside its card').toBeGreaterThanOrEqual(cardBox.x - 1)
      expect(box.x + box.width, 'a skin option overflows its card').toBeLessThanOrEqual(
        cardBox.x + cardBox.width + 1,
      )
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      'the skin picker made the page scroll sideways',
    ).toBe(true)
    await appearance.screenshot({ path: testInfo.outputPath('appearance-explicit-skins.png') })

    // Unset: the existing product default is the selection, under more contrast.
    await expect(picker.getByRole('radio', { name: skinLabel(DEFAULT_SKIN) })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await expect(picker.locator('[aria-checked="true"]')).toHaveCount(1)

    // Legacy System: the old option stored nothing, but a literal `system` is
    // no skin either — a reload resolves both to the default, not to the OS.
    await page.evaluate((key) => window.localStorage.setItem(key, 'system'), SKIN_KEY)
    await page.reload()
    await expect(page.locator('main h1')).toHaveText(/settings/i)
    expect(await appliedSkin(page), 'a legacy System preference followed the OS').toBe(
      DEFAULT_SKIN,
    )
    await expect(
      page.getByRole('radio', { name: skinLabel(DEFAULT_SKIN) }),
      'a legacy System preference did not resolve to the default',
    ).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByRole('radio', { name: SYSTEM_LABEL })).toHaveCount(0)

    // Flipping the OS preference live moves nothing.
    await page.emulateMedia({ contrast: 'no-preference' })
    await expect(page.locator('html')).toHaveAttribute('data-skin', DEFAULT_SKIN)
    await page.emulateMedia({ contrast: 'more' })
    await expect(page.locator('html')).toHaveAttribute('data-skin', DEFAULT_SKIN)

    // Every skin, read back from the document rather than from the control.
    for (const skin of SKINS) {
      const option = picker.getByRole('radio', { name: skinLabel(skin) })
      await option.click()
      await expect(option).toHaveAttribute('aria-checked', 'true')
      await expect(page.locator('html')).toHaveAttribute('data-skin', skin)
      expect(await storedSkin(page)).toBe(skin)
    }

    // Reload: a choice that is neither the default nor the one the OS used to
    // pick proves persistence, and that more contrast does not override it.
    const chosen =
      SKINS.find((skin) => skin !== DEFAULT_SKIN && skin !== 'mono') ?? SKINS[SKINS.length - 1]
    await picker.getByRole('radio', { name: skinLabel(chosen) }).click()
    await expect(page.locator('html')).toHaveAttribute('data-skin', chosen)

    // A saved preference, changed under that skin: the card that made the
    // save says so, and the same reload has to bring both back.
    const training = sectionCard(page, 'Training')
    const levels = training.getByRole('group', { name: 'Experience' }).getByRole('radio')
    const unchosen = levels.and(page.locator('[aria-checked="false"]')).first()
    const level = (await unchosen.textContent())?.trim() ?? ''
    expect(level, 'no experience level left to choose').not.toBe('')
    await unchosen.click()
    await expect(training.getByRole('status')).toHaveText('Saved')
    await expect(training.getByRole('radio', { name: level, exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    )

    await page.reload()
    await expect(page.locator('main h1')).toHaveText(/settings/i)
    await expect(
      sectionCard(page, 'Training').getByRole('radio', { name: level, exact: true }),
      'the saved preference did not survive the reload',
    ).toHaveAttribute('aria-checked', 'true')
    expect(await appliedSkin(page), 'the choice did not survive the reload').toBe(chosen)
    expect(await storedSkin(page)).toBe(chosen)
    await expect(
      page.getByRole('radio', { name: skinLabel(chosen) }),
      'the picker did not restore the stored choice',
    ).toHaveAttribute('aria-checked', 'true')
    await checkA11y()

    // Enhanced contrast, chosen explicitly, and kept when the OS stops asking.
    const mono = page.getByRole('radio', { name: skinLabel('mono') })
    await mono.click()
    await expect(page.locator('html')).toHaveAttribute('data-skin', 'mono')
    expect(await storedSkin(page)).toBe('mono')
    await page.emulateMedia({ contrast: 'no-preference' })
    await expect(page.locator('html')).toHaveAttribute('data-skin', 'mono')

    await page.reload()
    await expect(page.locator('main h1')).toHaveText(/settings/i)
    expect(await appliedSkin(page)).toBe('mono')
    await expect(page.getByRole('radio', { name: skinLabel('mono') })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await checkA11y()
  })
})
