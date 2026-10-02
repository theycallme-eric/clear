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
 */

const SESSION_STORAGE_KEY = 'clear.auth.session'

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

    await page.getByRole('button', { name: 'Manage places', exact: true }).click()
    await expect(page).toHaveURL(/\/settings\/locations$/)
    await expect(page.locator('main h1')).toHaveAccessibleName('Places and equipment')
    await expect(page.getByRole('heading', { name: originalName })).toBeVisible()
    await checkA11y()

    await page.getByRole('button', { name: 'Add place', exact: true }).click()
    await page.getByRole('textbox', { name: 'Name' }).fill(createdName)
    await page.getByRole('radio', { name: /^Home gym/ }).click()
    await page.getByRole('button', { name: 'Save place', exact: true }).click()

    // The list updates optimistically. Wait for the editor to close so the
    // card below is the committed row with its database id, not its temporary
    // optimistic twin.
    await expect(page.getByRole('button', { name: 'Save place', exact: true })).toHaveCount(0)

    const createdCard = page.locator('.clr-card').filter({
      has: page.getByRole('heading', { name: createdName, exact: true }),
    })
    await expect(createdCard).toBeVisible()
    await createdCard.getByRole('button', { name: 'Edit', exact: true }).click()

    const name = page.getByRole('textbox', { name: 'Name' })
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
    await expect(page.getByRole('dialog', { name: 'Delete this place?' })).toBeVisible()
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
})
