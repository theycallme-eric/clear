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

  // The route translates in four steps. Separate rect reads can straddle a
  // step and falsely compare yesterday's footer with today's action. Wait on
  // actual finite geometry animations, then sample all rectangles together.
  await expect.poll(() => footer.evaluate((element) => {
    const geometry = ['transform', 'translate', 'scale', 'rotate', 'left', 'right', 'top', 'bottom', 'width', 'height']
    for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
      for (const animation of ancestor.getAnimations()) {
        const effect = animation.effect
        if (!(effect instanceof KeyframeEffect) || !Number.isFinite(effect.getComputedTiming().endTime)) continue
        const movesGeometry = effect.getKeyframes().some((frame) => geometry.some((key) => key in frame))
        if (movesGeometry && (animation.pending || !['finished', 'idle'].includes(animation.playState))) return false
      }
    }
    return true
  }), { message: 'finite footer/route geometry animations reach their actual end state' }).toBe(true)

  const footerHandle = await footer.elementHandle()
  if (footerHandle === null) throw new Error('the pinned footer disappeared')
  const actions = []
  for (const name of names) {
    const action = footer.getByRole('button', { name, exact: true })
    await expect(action).toBeVisible()
    const handle = await action.elementHandle()
    if (handle === null) throw new Error(`${name} disappeared`)
    actions.push({ name, handle })
  }
  const snapshot = await page.evaluate(({ footer, actions }) => {
    const rect = (element: Element) => {
      const { x, y, width, height } = element.getBoundingClientRect()
      return { x, y, width, height }
    }
    return {
      connected: footer.isConnected && actions.every(({ handle }) => handle.isConnected && footer.contains(handle)),
      actionCount: footer.querySelectorAll('button').length,
      footer: rect(footer),
      actions: actions.map(({ name, handle }) => ({ name, box: rect(handle) })),
      noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    }
  }, { footer: footerHandle, actions })
  await Promise.all([footerHandle.dispose(), ...actions.map(({ handle }) => handle.dispose())])
  expect(snapshot.connected, 'the sampled footer and its actions remain connected and contained').toBe(true)
  expect(snapshot.actionCount).toBe(names.length)
  const footerBox = snapshot.footer
  expect(
    footerBox.y + footerBox.height,
    'the footer is pinned on screen',
  ).toBeLessThanOrEqual(viewport.height + BOX_TOLERANCE)

  for (const { name, box } of snapshot.actions) {
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
    snapshot.noHorizontalOverflow,
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

  test('JOURNEY-008 — the header Settings control and every way back stay in the app', async ({
    page,
    visit,
  }) => {
    test.setTimeout(120_000)

    const header = page.locator('header')
    const settingsControl = header.getByRole('button', { name: 'Settings', exact: true })
    const back = header.getByRole('button', { name: 'Back', exact: true })
    const at = async (path: string, heading: string) => {
      await expect(page).toHaveURL((url) => url.pathname === path)
      await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(heading)
    }

    // ENTRY-017, U18: Home's header is the wordmark and one framed glyph that
    // carries its name, reached from the keyboard with a visible focus.
    await visit('/')
    await at('/', 'Today')
    await expect(settingsControl).toBeVisible()
    await expect(settingsControl).toHaveText('')
    await expect(settingsControl.locator('svg')).toHaveCount(1)
    await expect(header.getByRole('button')).toHaveCount(1)
    const ringAtRest = await settingsControl.evaluate(
      (element) => getComputedStyle(element, '::after').backgroundColor,
    )
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    })
    for (let step = 0; step < 6; step += 1) {
      await page.keyboard.press('Tab')
      if (await settingsControl.evaluate((element) => element === document.activeElement)) break
    }
    await expect(settingsControl).toBeFocused()
    expect(await settingsControl.evaluate((element) => element.matches(':focus-visible'))).toBe(true)
    expect(
      await settingsControl.evaluate((element) => getComputedStyle(element, '::after').backgroundColor),
      'the focused control draws the focus ring',
    ).not.toBe(ringAtRest)

    // Normal navigation: Back returns to the screen before.
    await page.keyboard.press('Enter')
    await at('/settings', 'Settings')
    await back.click()
    await at('/', 'Today')

    // Locations returns to that Settings entry, so Back still leads Home.
    await settingsControl.click()
    await at('/settings', 'Settings')
    await page.getByRole('button', { name: 'Manage places' }).click()
    await at('/settings/locations', 'Places and equipment')
    await header.getByRole('button', { name: 'Settings', exact: true }).click()
    await at('/settings', 'Settings')
    await back.click()
    await at('/', 'Today')

    // ENTRY-018: opened directly — a typed URL, a shared link, or the
    // installed PWA's launch — Settings has no in-app screen behind it. The tab
    // does have one (about:blank); Back must not hand the athlete to it.
    const origin = new URL(page.url()).origin
    await visit('/settings')
    await at('/settings', 'Settings')
    await back.click()
    await at('/', 'Today')
    expect(new URL(page.url()).origin).toBe(origin)

    // ENTRY-019: Locations opened directly still returns to Settings, which
    // takes its place — so Settings' Back goes Home rather than out.
    await visit('/settings/locations')
    await at('/settings/locations', 'Places and equipment')
    await header.getByRole('button', { name: 'Settings', exact: true }).click()
    await at('/settings', 'Settings')
    await back.click()
    await at('/', 'Today')
    expect(new URL(page.url()).origin).toBe(origin)
  })

  test('JOURNEY-008 — a fresh launch straight into Settings, as the installed PWA does', async ({
    browser,
  }, testInfo) => {
    if (actor === null) throw new Error('the locations user was not provisioned')
    const baseURL = testInfo.project.use.baseURL
    if (baseURL === undefined) throw new Error('the project has no baseURL')

    // A new context is a new window with nothing in its history but the
    // launch URL — what a standalone PWA window opens with.
    const context = await browser.newContext({ ...testInfo.project.use, baseURL })
    try {
      await context.addInitScript(
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
      const pwa = await context.newPage()
      await pwa.goto('/settings')
      await expect(pwa.getByRole('heading', { level: 1 })).toHaveAccessibleName('Settings')
      await pwa.locator('header').getByRole('button', { name: 'Back', exact: true }).click()
      await expect(pwa).toHaveURL((url) => url.pathname === '/')
      await expect(pwa.getByRole('heading', { level: 1 })).toHaveAccessibleName('Today')

      // Home replaced Settings rather than stacking on it: the window's own
      // back has nowhere in the app to go and nothing re-opens Settings.
      expect(await pwa.evaluate(() => (window.history.state as { idx?: number } | null)?.idx)).toBe(0)
    } finally {
      await context.close()
    }
  })

  test('Home → Settings → create, edit, default, delete → reload', async ({
    page,
    visit,
    checkA11y,
  }, testInfo) => {
    test.setTimeout(120_000)

    await visit('/')
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await expect(page).toHaveURL(/\/settings$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('Settings')

    // Settings offers this as a TextAction, whose drawn chevron is part of the
    // name a browser computes, so the name is matched rather than equalled.
    await page.getByRole('button', { name: 'Manage places' }).click()
    await expect(page).toHaveURL(/\/settings\/locations$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('Places and equipment')
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

    // U15/U23: no tier selection and no starter preset outside onboarding; the
    // editor says what saving does before it is pressed.
    await expect(editor.getByRole('radio')).toHaveCount(0)
    await expect(editor.getByRole('group', { name: 'Equipment tier' })).toHaveCount(0)
    await expect(editor.getByRole('checkbox', { checked: true })).toHaveCount(0)
    await expect(editor.getByText(/^Nothing changes until you save\./)).toBeVisible()

    await page.getByRole('textbox', { name: 'Name' }).fill(createdName)
    for (const item of ['Bodyweight', 'Dumbbells', 'Kettlebells']) {
      await editor.getByRole('checkbox', { name: item, exact: true }).check()
    }
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

    // The name is the identity, Edit leads the framed row, Delete is quiet.
    await expect(createdCard.getByText(/^(Minimal|Home gym|Building gym|Full gym)$/)).toHaveCount(0)
    const createdActions = createdCard.locator('.clr-actions')
    await expect(createdActions.getByRole('button').first()).toHaveAccessibleName('Edit')
    await expect(createdActions.getByRole('button', { name: 'Edit', exact: true })).not.toHaveClass(
      /clr-btn--quiet/,
    )
    await expect(createdActions.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0)
    await expect(createdCard.getByRole('button', { name: 'Delete', exact: true })).toHaveClass(
      /clr-btn--quiet/,
    )
    await createdCard.getByRole('button', { name: 'Edit', exact: true }).click()

    const name = page.getByRole('textbox', { name: 'Name' })
    await expect(name).toHaveValue(createdName)
    await expectCards(page, [originalName, createdName, `Edit ${createdName}`])
    await expectPinnedActions(page, ['Save place', 'Cancel'])
    // Exactly what was ticked came back; removing one is a real removal.
    await expect(page.getByRole('checkbox', { checked: true })).toHaveCount(3)
    await expect(page.getByRole('radio')).toHaveCount(0)
    await page.getByRole('checkbox', { name: 'Kettlebells', exact: true }).uncheck()
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
    await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('Places and equipment')
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
    // Tier stays as the internal metadata a created place is stored with.
    expect(locations.body).toEqual([
      expect.objectContaining({ name: renamedName, tier: 'minimal', is_default: true }),
    ])

    const location = (locations.body as Array<{ id: string }>)[0]
    const equipment = await client.selectAsService('location_equipment', {
      select: 'equipment_id',
      location_id: `eq.${location?.id ?? ''}`,
      order: 'equipment_id',
    })
    expect(equipment.ok, 'reading the committed equipment').toBe(true)
    expect(equipment.body).toEqual([
      { equipment_id: 'bodyweight' },
      { equipment_id: 'dumbbells' },
    ])

    // Candidate retrieval resolves its available equipment from these rows —
    // the addition and the removal both — and not from the tier or the name.
    const available = await client.rpcAs(
      'generation_equipment',
      { p_user_id: actor?.id ?? '', p_location_id: null },
      actor?.token ?? '',
    )
    expect(available.ok, `resolving retrieval equipment (status ${available.status})`).toBe(true)
    expect(available.body).toEqual(['bodyweight', 'dumbbells'])

    // And the editor reads the same set back after the reload.
    await reloaded.getByRole('button', { name: 'Edit', exact: true }).click()
    await expect(page.getByRole('checkbox', { name: 'Dumbbells', exact: true })).toBeChecked()
    await expect(page.getByRole('checkbox', { name: 'Kettlebells', exact: true })).not.toBeChecked()
    await expect(page.getByRole('checkbox', { checked: true })).toHaveCount(2)
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
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
    await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('Places and equipment')
    await card.getByRole('button', { name: 'Edit', exact: true }).click()
    await expect(page.getByRole('checkbox', { name: 'Dumbbells', exact: true })).toBeChecked()
    await checkA11y()
  })
})

/**
 * U09 (TASK-005 diagnosis, TASK-036 repair) — box, label and Space each toggle
 * once on every equipment and limitation checklist, at 390x844 on a touch
 * phone, and what was added and removed is what a reload reads back.
 *
 * The baseline cause, measured by TASK-005: every row is stretched to the
 * stack's width and the design system centres the transparent input on that
 * whole row, so a tap on the drawn box at the row's left edge landed on the
 * aria-hidden `.clr-check__box` — neither the input nor inside its label — and
 * nothing toggled. `CheckboxGroup` now lays the input over the row's box and
 * label. Each tap here first asks the page what is under the finger, so a
 * regression names the element that swallowed it rather than only the state.
 */
type Activation = 'box' | 'label' | 'Space'

/** Every checked choice in a checklist, by its visible label. */
async function checkedNames(group: Locator) {
  return (await group.locator('.clr-check:has(input:checked) label').allTextContents()).sort()
}

/**
 * One activation of one choice, by one path: the state flips, and the input
 * reports exactly one change — a double toggle or a missed press both fail.
 */
async function activateOnce(page: Page, group: Locator, name: string, how: Activation) {
  const checkbox = group.getByRole('checkbox', { name, exact: true })
  const row = group
    .locator('.clr-check')
    .filter({ has: page.getByRole('checkbox', { name, exact: true }) })
  await row.evaluate((element) => element.scrollIntoView({ block: 'center' }))
  const target = await boxOf(checkbox, `the ${name} native touch target`)
  expect(target.width, `${name} preserves the coarse-pointer target width`).toBeGreaterThanOrEqual(44)
  expect(target.height, `${name} preserves the coarse-pointer target height`).toBeGreaterThanOrEqual(44)
  const before = await checkbox.isChecked()
  await checkbox.evaluate((element) => {
    const input = element as HTMLInputElement & { u09Changes?: number }
    if (input.u09Changes === undefined) {
      input.addEventListener('change', () => {
        input.u09Changes = (input.u09Changes ?? 0) + 1
      })
    }
    input.u09Changes = 0
  })

  if (how === 'Space') {
    await checkbox.focus()
    await page.keyboard.press('Space')
  } else {
    const part = how === 'box' ? row.locator('.clr-check__box') : row.locator('label')
    const box = await boxOf(part, `the ${name} ${how}`)
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2
    const hit = await checkbox.evaluate((input, point) => {
      const under = document.elementFromPoint(point.x, point.y)
      return under === input
        ? 'input'
        : `${under?.tagName.toLowerCase() ?? 'nothing'}.${under?.className ?? ''}`
    }, { x, y })
    // Soft, so a miss reports both what was under the finger and the state.
    expect.soft(hit, `a ${how} tap on ${name} lands on its own input`).toBe('input')
    await page.touchscreen.tap(x, y)
  }

  await expect(checkbox, `${how} toggles ${name}`).toBeChecked({ checked: !before })
  expect(
    await checkbox.evaluate((element) => (element as HTMLInputElement & { u09Changes?: number }).u09Changes),
    `${how} toggles ${name} once`,
  ).toBe(1)
}

/**
 * Each path in both directions on one choice, then one addition by the box and
 * one removal by the label. Returns the set the checklist should now hold.
 */
async function exerciseChecklist(
  page: Page,
  group: Locator,
  { probe, add, remove }: { probe: string; add: string; remove: string },
  afterEach: () => Promise<void> = async () => undefined,
) {
  const initial = await checkedNames(group)
  const targets = await group.locator('.clr-check > input').evaluateAll((inputs) =>
    inputs.map((input) => {
      const { top, bottom } = input.getBoundingClientRect()
      return { top, bottom }
    }).sort((a, b) => a.top - b.top),
  )
  for (let i = 1; i < targets.length; i++) {
    expect(targets[i - 1].bottom, 'neighbouring checkbox touch targets do not overlap')
      .toBeLessThanOrEqual(targets[i].top)
  }
  expect(initial, `${add} starts unticked`).not.toContain(add)
  expect(initial, `${remove} starts ticked`).toContain(remove)
  for (const how of ['box', 'label', 'Space'] as const) {
    await activateOnce(page, group, probe, how)
    await afterEach()
    await activateOnce(page, group, probe, how)
    await afterEach()
  }
  expect(await checkedNames(group), 'the round trips left the checklist as it was').toEqual(initial)
  await activateOnce(page, group, add, 'box')
  await afterEach()
  await activateOnce(page, group, remove, 'label')
  await afterEach()
  const expected = [...initial.filter((name) => name !== remove), add].sort()
  expect(await checkedNames(group)).toEqual(expected)
  return expected
}

test.describe('U09 — checkbox activation on the phone', () => {
  test.skip(!backend.available, backend.reason)

  const emails: string[] = []
  let client: ReturnType<typeof backend.client>

  test.afterAll(async () => {
    if (!client) return
    for (const email of emails) {
      const provisioned = await client.findUserByEmail(email)
      if (provisioned) await client.deleteUser(provisioned.id)
      expect(await client.findUserByEmail(email), 'a U09 user outlived the run').toBeNull()
    }
  })

  /** A disposable user signed in on this page; onboarded only when asked. */
  async function signIn(page: Page, purpose: string, project: string, onboarding?: Record<string, unknown>) {
    client = backend.client()
    const email = `clear-e2e-${namespaceId()}-${project}-u09-${purpose}@example.com`
    emails.push(email)
    const prior = await client.findUserByEmail(email)
    if (prior) await client.deleteUser(prior.id)
    const created = await client.ensureConfirmedUser(email)
    const session = await client.mintSession(email)
    if (onboarding !== undefined) {
      const onboarded = await client.rpcAs('complete_onboarding', onboarding, session.accessToken)
      expect(onboarded.ok, `onboarding the U09 user (status ${onboarded.status})`).toBe(true)
    }
    await page.addInitScript(
      ({ key, value }) => {
        if (window.localStorage.getItem(key) === null) window.localStorage.setItem(key, value)
      },
      {
        key: SESSION_STORAGE_KEY,
        value: JSON.stringify({
          accessToken: session.accessToken,
          refreshToken: session.refreshToken,
          expiresAt: expiryOf(session.accessToken),
          user: { id: created.id, email },
        }),
      },
    )
  }

  const savedOnboarding = (placeName: string) => ({
    p_location_name: placeName,
    p_location_tier: 'home',
    p_equipment: ['bodyweight', 'dumbbells'],
    p_experience_level: 'some',
    p_goal_preset: 'balanced',
    p_sections: ['warmup', 'primary_lift', 'cooldown'],
    p_avoid_patterns: ['squat'],
    p_note: null,
  })

  test('ENTRY-014 — saved place equipment: box, label, Space, Save, reload', async ({
    page,
    visit,
  }, testInfo) => {
    test.setTimeout(90_000)
    const placeName = `U09 gym ${namespaceId()}`
    await signIn(page, 'place', testInfo.project.name, savedOnboarding(placeName))

    const editPlace = async () => {
      await page
        .locator('main .clr-card')
        .filter({ has: page.getByRole('heading', { level: 2, name: placeName, exact: true }) })
        .getByRole('button', { name: 'Edit', exact: true })
        .click()
      await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue(placeName)
      return page.getByRole('group', { name: 'Equipment', exact: true })
    }

    await visit('/settings/locations')
    const expected = await exerciseChecklist(page, await editPlace(), {
      probe: 'Kettlebells',
      add: 'Barbell',
      remove: 'Dumbbells',
    })
    const saved = page.waitForResponse(
      (response) =>
        response.url().includes('/rest/v1/rpc/save_location') &&
        response.request().method() === 'POST',
    )
    await page.getByRole('button', { name: 'Save place', exact: true }).click()
    expect((await saved).status(), 'saving the place').toBe(200)
    await expect(page.getByRole('button', { name: 'Save place', exact: true })).toHaveCount(0)

    await page.reload()
    await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('Places and equipment')
    expect(await checkedNames(await editPlace()), 'the reload reads the saved set').toEqual(expected)
  })

  test('ENTRY-014 — Settings limitations: box, label, Space, autosave, reload', async ({
    page,
    visit,
  }, testInfo) => {
    test.setTimeout(90_000)
    await signIn(page, 'limits', testInfo.project.name, savedOnboarding(`U09 limits ${namespaceId()}`))

    await visit('/settings')
    const group = page.getByRole('group', { name: 'Work around', exact: true })
    await expect(group.getByRole('checkbox', { name: 'Squatting', exact: true })).toBeChecked()
    // Every toggle is its own save; each is awaited so the next press acts on
    // a settled row, as a person's next tap would.
    const watch = () =>
      page.waitForResponse(
        (response) =>
          response.url().includes('/rest/v1/user_constraints') &&
          ['POST', 'DELETE'].includes(response.request().method()),
      )
    let pending = watch()
    const settle = async () => {
      expect((await pending).ok(), 'the limitation saved').toBe(true)
      pending = watch()
      // The watch armed after the last toggle never sees a save; that is fine.
      pending.catch(() => undefined)
    }
    const expected = await exerciseChecklist(
      page,
      group,
      { probe: 'Pressing', add: 'Pulling', remove: 'Squatting' },
      settle,
    )

    await page.reload()
    await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('Settings')
    await expect(group.getByRole('checkbox', { name: 'Pulling', exact: true })).toBeChecked()
    expect(await checkedNames(group), 'the reload reads the saved set').toEqual(expected)
  })

  test('ENTRY-013 — onboarding equipment and limitations: box, label, Space, Finish, reload', async ({
    page,
    visit,
  }, testInfo) => {
    test.setTimeout(120_000)
    await signIn(page, 'onboarding', testInfo.project.name)

    await visit('/onboarding')
    await expect(page.getByRole('heading', { name: 'What’s your gym setup?' })).toBeVisible()
    await page.getByRole('radio', { name: /^Home gym/ }).click()
    const equipment = await exerciseChecklist(
      page,
      page.getByRole('group', { name: 'Equipment', exact: true }),
      { probe: 'Barbell', add: 'Plyo box', remove: 'Dumbbells' },
    )
    const next = page.getByRole('button', { name: 'Next', exact: true })
    await next.click()
    await page.getByRole('radio', { name: /^Some experience/ }).click()
    await next.click()
    await page.getByRole('radio', { name: /^Balanced/ }).click()
    await next.click()
    await expect(page.getByRole('heading', { name: 'Any ongoing limitations?' })).toBeVisible()

    // Nothing is ticked yet, so this run's removal is of a choice it ticks.
    const limitations = page.getByRole('group', { name: 'Work around', exact: true })
    await activateOnce(page, limitations, 'Squatting', 'Space')
    const avoided = await exerciseChecklist(page, limitations, {
      probe: 'Pressing',
      add: 'Pulling',
      remove: 'Squatting',
    })

    await page.getByRole('button', { name: 'Next', exact: true }).click()
    const committed = page.waitForResponse(
      (response) =>
        response.url().includes('/rest/v1/rpc/complete_onboarding') &&
        response.request().method() === 'POST',
    )
    await page.getByRole('button', { name: 'Finish setup', exact: true }).click()
    expect((await committed).status(), 'finishing setup').toBe(200)
    await expect(page).toHaveURL((url) => url.pathname === '/')

    // The onboarding commit is read back by the screens that edit it.
    await page.reload()
    await visit('/settings/locations')
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    await expect(page.getByRole('textbox', { name: 'Name' })).not.toHaveValue('')
    await expect
      .poll(() => checkedNames(page.getByRole('group', { name: 'Equipment', exact: true })), {
        message: 'the place holds what onboarding ticked',
      })
      .toEqual(equipment)
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await visit('/settings')
    await expect(limitations.getByRole('checkbox', { name: 'Pulling', exact: true })).toBeChecked()
    expect(await checkedNames(limitations), 'the limitations are what onboarding ticked').toEqual(
      avoided,
    )
  })
})
