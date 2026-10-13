import type { Locator, Page } from '@playwright/test'

import { namespaceId } from '../scripts/e2e/namespace.mjs'

import { expect, test } from './fixtures'
import { backend } from './support/backend'

/**
 * SET-02 — a signed-in person can manage the places generation actually reads.
 *
 * The component suite proves each optimistic state in isolation. This walk
 * proves the boundary the component suite cannot: Home links to Settings,
 * Settings links to the editor, every write reaches the live project, and a
 * reload reads the same location and equipment back. It owns one namespaced
 * user and deletes that user (and every row below it) even when the walk fails.
 *
 * It also measures the composition as it renders: every place and the editor
 * is one card with its accent bar and no card inside it, and the pinned
 * actions sit whole inside the footer and the viewport at each step.
 */

const SESSION_STORAGE_KEY = 'clear.auth.session'

/** Sub-pixel layout is not a clipped control. */
const BOX_TOLERANCE = 1

/**
 * The cards of the screen as it stands: exactly these headings, each inside a
 * card that draws its bar, and no card holding another.
 */
async function expectCards(page: Page, headings: string[]) {
  const cards = page.locator('main .clr-card')
  await expect(cards).toHaveCount(headings.length)
  await expect(page.locator('main .clr-card .clr-card')).toHaveCount(0)
  for (const name of headings) {
    const card = cards.filter({
      has: page.getByRole('heading', { level: 2, name, exact: true }),
    })
    await expect(card).toHaveCount(1)
    await expect(card.locator('.clr-card__bar')).toBeVisible()
  }
}

async function boxOf(locator: Locator, what: string) {
  const box = await locator.boundingBox()
  if (box === null) throw new Error(`${what} has no box`)
  return box
}

/**
 * The pinned footer holds exactly these actions, each whole inside the footer
 * and the viewport, and the document does not scroll sideways.
 */
async function expectPinnedActions(page: Page, names: string[]) {
  const footer = page.locator('main .clr-footer')
  await expect(footer.getByRole('button')).toHaveCount(names.length)

  const viewport = page.viewportSize()
  if (viewport === null) throw new Error('the page has no viewport')
  const footerBox = await boxOf(footer, 'the pinned footer')
  expect(
    footerBox.y + footerBox.height,
    'the footer is pinned on screen',
  ).toBeLessThanOrEqual(viewport.height + BOX_TOLERANCE)

  for (const name of names) {
    const action = footer.getByRole('button', { name, exact: true })
    await expect(action).toBeVisible()
    const box = await boxOf(action, name)
    expect(box.x, `${name} starts inside the footer`).toBeGreaterThanOrEqual(
      footerBox.x - BOX_TOLERANCE,
    )
    expect(box.x + box.width, `${name} ends inside the footer`).toBeLessThanOrEqual(
      footerBox.x + footerBox.width + BOX_TOLERANCE,
    )
    expect(box.y, `${name} starts inside the footer`).toBeGreaterThanOrEqual(
      footerBox.y - BOX_TOLERANCE,
    )
    expect(box.y + box.height, `${name} ends inside the footer`).toBeLessThanOrEqual(
      footerBox.y + footerBox.height + BOX_TOLERANCE,
    )
  }

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
    'the document scrolls sideways',
  ).toBe(true)
}

/** Unix milliseconds encoded in the access token. */
function expiryOf(accessToken: string): number {
  const payload = accessToken.split('.')[1] ?? ''
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as {
    exp?: number
  }
  return typeof claims.exp === 'number' ? claims.exp * 1000 : Date.now() + 60 * 60 * 1000
}

test.describe('settings locations — live CRUD and generation default', () => {
  test.skip(!backend.available, backend.reason)
  test.describe.configure({ mode: 'serial' })

  let email = ''
  const originalName = `Home base ${namespaceId()}`
  const createdName = `Travel gym ${namespaceId()}`
  const renamedName = `Hotel gym ${namespaceId()}`

  let client: ReturnType<typeof backend.client>
  let actor: {
    id: string
    email: string
    token: string
    refreshToken: string
  } | null = null

  test.beforeAll(async ({ browserName }, testInfo) => {
    void browserName
    email = `clear-e2e-${namespaceId()}-${testInfo.project.name}-locations@example.com`
    client = backend.client()
    const prior = await client.findUserByEmail(email)
    if (prior) await client.deleteUser(prior.id)

    const created = await client.ensureConfirmedUser(email)
    const session = await client.mintSession(email)
    const onboarded = await client.rpcAs(
      'complete_onboarding',
      {
        p_location_name: originalName,
        p_location_tier: 'home',
        p_equipment: ['bodyweight', 'dumbbells'],
        p_experience_level: 'some',
        p_goal_preset: 'balanced',
        p_sections: ['warmup', 'primary_lift', 'cooldown'],
        p_avoid_patterns: [],
        p_note: null,
      },
      session.accessToken,
    )
    expect(onboarded.ok, `onboarding the locations user (status ${onboarded.status})`).toBe(true)

    actor = {
      id: created.id,
      email,
      token: session.accessToken,
      refreshToken: session.refreshToken,
    }
  })

  test.afterAll(async () => {
    if (!client) return
    const provisioned = await client.findUserByEmail(email)
    if (provisioned) await client.deleteUser(provisioned.id)
    expect(await client.findUserByEmail(email), 'the locations user outlived the run').toBeNull()
  })

  test.beforeEach(async ({ page }) => {
    if (actor === null) throw new Error('the locations user was not provisioned')

    await page.addInitScript(
      ({ key, value }) => {
        if (window.localStorage.getItem(key) === null) window.localStorage.setItem(key, value)
      },
      {
        key: SESSION_STORAGE_KEY,
        value: JSON.stringify({
          accessToken: actor.token,
          refreshToken: actor.refreshToken,
          expiresAt: expiryOf(actor.token),
          user: { id: actor.id, email: actor.email },
        }),
      },
    )
  })

  test('Home → Settings → create, edit, default, delete → reload', async ({
    page,
    visit,
    checkA11y,
  }, testInfo) => {
    test.setTimeout(120_000)

    await visit('/')
    await page.getByRole('link', { name: 'Settings', exact: true }).click()
    await expect(page).toHaveURL(/\/settings$/)
    await expect(page.locator('main h1')).toHaveAccessibleName('Settings')

    // Settings offers this as a TextAction, whose drawn chevron is part of the
    // name a browser computes, so the name is matched rather than equalled.
    await page.getByRole('button', { name: 'Manage places' }).click()
    await expect(page).toHaveURL(/\/settings\/locations$/)
    await expect(page.locator('main h1')).toHaveAccessibleName('Places and equipment')
    await expect(page.getByRole('heading', { name: originalName })).toBeVisible()
    await checkA11y()
    await expectCards(page, [originalName])
    await expectPinnedActions(page, ['Add place'])

    await page.getByRole('button', { name: 'Add place', exact: true }).click()
    // The editor is one more card beside the list; its fields are inside it
    // and what is done with them is pinned.
    await expectCards(page, [originalName, 'Add place'])
    const editor = page.locator('main .clr-card').filter({
      has: page.getByRole('heading', { level: 2, name: 'Add place', exact: true }),
    })
    await expect(editor.getByRole('textbox', { name: 'Name' })).toBeFocused()
    await expect(editor.getByRole('button')).toHaveCount(0)
    await expectPinnedActions(page, ['Save place', 'Cancel'])
    await checkA11y()

    await page.getByRole('textbox', { name: 'Name' }).fill(createdName)
    await page.getByRole('radio', { name: /^Home gym/ }).click()
    await expectPinnedActions(page, ['Save place', 'Cancel'])
    await page.getByRole('button', { name: 'Save place', exact: true }).click()

    // The list updates optimistically. Wait for the editor to close so the
    // card below is the committed row with its database id, not its temporary
    // optimistic twin.
    await expect(page.getByRole('button', { name: 'Save place', exact: true })).toHaveCount(0)

    const createdCard = page.locator('.clr-card').filter({
      has: page.getByRole('heading', { name: createdName, exact: true }),
    })
    await expect(createdCard).toBeVisible()
    await expectCards(page, [originalName, createdName])
    await expectPinnedActions(page, ['Add place'])
    await createdCard.getByRole('button', { name: 'Edit', exact: true }).click()

    const name = page.getByRole('textbox', { name: 'Name' })
    await expect(name).toHaveValue(createdName)
    await expectCards(page, [originalName, createdName, `Edit ${createdName}`])
    await expectPinnedActions(page, ['Save place', 'Cancel'])
    await name.fill(renamedName)
    await page.getByRole('button', { name: 'Save place', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Save place', exact: true })).toHaveCount(0)

    const renamedCard = page.locator('.clr-card').filter({
      has: page.getByRole('heading', { name: renamedName, exact: true }),
    })
    await expect(renamedCard).toBeVisible()
    const defaultSaved = page.waitForResponse(
      (response) =>
        response.url().includes('/rest/v1/rpc/set_default_location') &&
        response.request().method() === 'POST',
    )
    await renamedCard.getByRole('button', { name: 'Make default', exact: true }).click()
    expect((await defaultSaved).status(), 'saving the generation default').toBe(200)
    await expect(renamedCard.getByText(/Default for generation/)).toBeVisible()

    const originalCard = page.locator('.clr-card').filter({
      has: page.getByRole('heading', { name: originalName, exact: true }),
    })
    await originalCard.getByRole('button', { name: 'Delete', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Delete this place?' })
    await expect(dialog).toBeVisible()
    const viewport = page.viewportSize()
    if (viewport === null) throw new Error('the page has no viewport')
    for (const action of ['Delete', 'Cancel']) {
      const box = await boxOf(
        dialog.getByRole('button', { name: action, exact: true }),
        `the dialog's ${action}`,
      )
      expect(box.x, `${action} starts on screen`).toBeGreaterThanOrEqual(-BOX_TOLERANCE)
      expect(box.x + box.width, `${action} ends on screen`).toBeLessThanOrEqual(
        viewport.width + BOX_TOLERANCE,
      )
      expect(box.y + box.height, `${action} is above the fold`).toBeLessThanOrEqual(
        viewport.height + BOX_TOLERANCE,
      )
    }
    const deleted = page.waitForResponse(
      (response) =>
        response.url().includes('/rest/v1/rpc/delete_location') &&
        response.request().method() === 'POST',
    )
    await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click()
    expect([200, 204], 'deleting the old location').toContain((await deleted).status())
    await expect(page.getByRole('heading', { name: originalName, exact: true })).toHaveCount(0)
    await checkA11y()

    // A fresh document proves these are database answers, not optimistic cache.
    await page.reload()
    await expect(page.locator('main h1')).toHaveAccessibleName('Places and equipment')
    const reloaded = page.locator('.clr-card').filter({
      has: page.getByRole('heading', { name: renamedName, exact: true }),
    })
    await expect(reloaded.getByText(/Default for generation/)).toBeVisible()
    await expect(page.getByRole('heading', { name: originalName, exact: true })).toHaveCount(0)
    await expectCards(page, [renamedName])
    await expectPinnedActions(page, ['Add place'])
    await checkA11y()
    await page.screenshot({ path: testInfo.outputPath('vibe-d-location-settings.png') })

    const locations = await client.selectAsService('locations', {
      select: 'id,name,tier,is_default',
      user_id: `eq.${actor?.id ?? ''}`,
    })
    expect(locations.ok, 'reading the committed location').toBe(true)
    expect(locations.body).toEqual([
      expect.objectContaining({ name: renamedName, tier: 'home', is_default: true }),
    ])

    const location = (locations.body as Array<{ id: string }>)[0]
    const equipment = await client.selectAsService('location_equipment', {
      select: 'equipment_id',
      location_id: `eq.${location?.id ?? ''}`,
    })
    expect(equipment.ok, 'reading the committed equipment').toBe(true)
    expect(equipment.body).toEqual(
      expect.arrayContaining([
        { equipment_id: 'bodyweight' },
        { equipment_id: 'dumbbells' },
      ]),
    )
  })

  /**
   * Save-time viability, against the live function. Emptying the equipment of
   * the only place leaves every saved section with nothing to compose from, so
   * `save_location` raises after its write and the transaction restores the
   * rows. Nothing is intercepted: the refusal, the sentence and the unchanged
   * rows are the project's own answers. Runs after the walk, on what it left.
   */
  test('a save that would leave nothing to generate from is refused, and nothing changes', async ({
    page,
    visit,
    checkA11y,
  }) => {
    test.setTimeout(60_000)

    const stored = async () => {
      const locations = await client.selectAsService('locations', {
        select: 'id,name,tier,is_default',
        user_id: `eq.${actor?.id ?? ''}`,
      })
      expect(locations.ok, 'reading the stored location').toBe(true)
      const rows = locations.body as Array<{ id: string; name: string }>
      expect(rows.map((row) => row.name)).toEqual([renamedName])
      const equipment = await client.selectAsService('location_equipment', {
        select: 'equipment_id',
        location_id: `eq.${rows[0]?.id ?? ''}`,
        order: 'equipment_id',
      })
      expect(equipment.ok, 'reading the stored equipment').toBe(true)
      return { locations: locations.body, equipment: equipment.body }
    }
    const before = await stored()
    expect(before.equipment).toEqual(
      expect.arrayContaining([{ equipment_id: 'dumbbells' }]),
    )

    await visit('/settings/locations')
    const card = page.locator('main .clr-card').filter({
      has: page.getByRole('heading', { level: 2, name: renamedName, exact: true }),
    })
    await card.getByRole('button', { name: 'Edit', exact: true }).click()
    await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue(renamedName)
    await expect(page.getByRole('checkbox', { name: 'Dumbbells', exact: true })).toBeChecked()

    const ticked = page.getByRole('checkbox', { checked: true })
    for (let left = await ticked.count(); left > 0; left -= 1) {
      await ticked.first().uncheck()
    }
    await expect(ticked).toHaveCount(0)

    const refused = page.waitForResponse(
      (response) =>
        response.url().includes('/rest/v1/rpc/save_location') &&
        response.request().method() === 'POST',
    )
    await page.getByRole('button', { name: 'Save place', exact: true }).click()
    expect((await refused).status(), 'the live viability refusal').toBe(400)

    // The refusal is the failed-save toast, carrying the composed sentence.
    const refusal = page.getByRole('alert')
    await expect(refusal).toContainText('leaves no equipment to train with')
    await expect(refusal).toContainText('Nothing was changed.')

    // The editor is still the editor, with the draft that was refused …
    await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue(renamedName)
    await expect(ticked).toHaveCount(0)
    await expectCards(page, [renamedName, `Edit ${renamedName}`])
    await expectPinnedActions(page, ['Save place', 'Cancel'])
    // … the list is the previous one, and so are the rows.
    await expect(card.getByText(/Default for generation/)).toBeVisible()
    expect(await stored()).toEqual(before)

    // A fresh document reads the equipment that was never replaced.
    await page.reload()
    await expect(page.locator('main h1')).toHaveAccessibleName('Places and equipment')
    await card.getByRole('button', { name: 'Edit', exact: true }).click()
    await expect(page.getByRole('checkbox', { name: 'Dumbbells', exact: true })).toBeChecked()
    await checkA11y()
  })
})
