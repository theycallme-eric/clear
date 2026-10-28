import type { Locator, Page, Route } from '@playwright/test'

import type { RestDayRow } from '../src/state/schemas'
import { makeSessionRow } from '../src/test/factories'
import { fixtureLocation, onboardedProfile } from '../src/test/user-data-double'
import { installDeterministicCapture } from './design-0143/fixtures'
import { expect, test } from './fixtures'

/**
 * TASK-004 / JOURNEY-004 — production Home, four skins, intercepted fixtures.
 *
 * Settings and Mark Rest Day/Change reason are the scoped added glow controls.
 * Existing Generate is the rendered reference; this is not a blanket demand
 * that every action glow. The public wrapper owns the unclipped filter.
 *
 * The single rest-day mutation is a deliberately held, synthetic API response,
 * never forwarded to a backend. Its success proves only the browser state
 * transition. There is no model, real-user write or backend-persistence proof.
 * Actual wrapped Home triggers have no disabled/loading branch. Their generic
 * wrapper-only disabled cases remain unit coverage; no browser DOM state is
 * manufactured and no custom app component is mounted to simulate one.
 */
const OWNER = '00000000-0000-4000-8000-000000000004'
const PLACE = 'd0000001-0000-4000-8000-000000000000'
const TODAY = new Date().toISOString().slice(0, 10)
const YESTERDAY = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
const HISTORY = makeSessionRow({
  id: '00000000-0000-4000-8000-000000000040', user_id: OWNER,
  location_id: PLACE, date: YESTERDAY, title: 'Synthetic action glow history',
  created_at: `${YESTERDAY}T09:00:00.000Z`, updated_at: `${YESTERDAY}T09:40:00.000Z`,
  started_at: `${YESTERDAY}T09:00:00.000Z`, completed_at: `${YESTERDAY}T09:40:00.000Z`,
  goal_preset: 'strength',
})
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
}
const SKINS = ['clear', 'vapour', 'signal', 'mono'] as const
type Skin = typeof SKINS[number]

async function syntheticHome(page: Page, skin: Skin) {
  const unexpected: string[] = []
  let unexpectedWrites = 0
  let functionPosts = 0
  let markCalls = 0
  let pending = false
  let marks: RestDayRow[] = []
  let release = () => {}
  const completion = new Promise<void>((resolve) => { release = resolve })
  const guard = await installDeterministicCapture(page, { skin, reducedMotion: true })
  await page.route('**/*', async (route) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())) return route.continue()
    unexpectedWrites += 1
    unexpected.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`)
    return route.abort('blockedbyclient')
  })
  const handler = async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    const name = url.pathname.split('/').at(-1) ?? ''
    const reply = (body: unknown, status = 200) => route.fulfill({ status, headers: CORS, json: body })
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (url.pathname.startsWith('/functions/v1/')) {
      if (request.method() === 'POST') functionPosts += 1
      unexpected.push(`${request.method()} ${url.pathname}`)
      return route.abort('blockedbyclient')
    }
    if (request.method() === 'GET') {
      if (name === 'profiles') return reply([onboardedProfile({ id: OWNER, goal_preset: 'strength' })])
      if (name === 'locations') return reply([fixtureLocation({ id: PLACE, user_id: OWNER, tier: 'full' })])
      if (name === 'workout_sessions') return reply([HISTORY])
      if (name === 'rest_days') return reply(marks)
      if (['user_constraints', 'load_anchors', 'location_equipment', 'saved_workouts',
        'saved_workout_attempts', 'saved_workout_completions'].includes(name)) return reply([])
    }
    if (request.method() === 'POST' && url.pathname.includes('/rpc/')) {
      if (name === 'resume_session') return reply(null)
      if (name === 'streak_sessions') return reply([{
        session_id: HISTORY.id, completed_at: HISTORY.completed_at,
        counts_for_streak: HISTORY.counts_for_streak,
      }])
      if (['constraints_in_force', 'anchor_evidence', 'conditioning_history'].includes(name)) return reply([])
      if (name === 'mark_rest_day') {
        markCalls += 1
        expect(markCalls).toBe(1)
        expect(request.postDataJSON()).toEqual({ p_day: TODAY, p_reason: 'sick', p_note: null })
        pending = true
        await completion
        // This local fixture row is synthetic; no upstream API is contacted.
        const row: RestDayRow = {
          id: '00000000-0000-4000-8000-000000000041', user_id: OWNER,
          day: TODAY, reason: 'sick', note: null,
          created_at: `${TODAY}T09:00:00.000Z`, updated_at: `${TODAY}T09:00:00.000Z`,
        }
        marks = [row]
        pending = false
        return reply(row)
      }
    }
    if (request.method() !== 'GET') unexpectedWrites += 1
    unexpected.push(`${request.method()} ${url.pathname}`)
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic action-glow request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ owner }) => {
    localStorage.setItem('clear.auth.session', JSON.stringify({
      accessToken: 'synthetic-glow-preview-session', refreshToken: 'synthetic-glow-preview-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-glow@example.invalid' },
    }))
  }, { owner: OWNER })
  return {
    pending: () => pending,
    releaseSave: () => release(),
    assertSyntheticOnly() {
      expect(unexpected).toEqual([])
      expect(unexpectedWrites).toBe(0)
      expect(functionPosts).toBe(0)
      expect(guard.blockedGenerations()).toBe(0)
      expect(markCalls).toBe(1)
      expect(pending).toBe(false)
      expect(marks).toHaveLength(1)
    },
  }
}

async function glowOf(control: Locator) {
  return control.evaluate((element) => {
    const owner = element.closest<HTMLElement>('.clr-glow')
    const bleed = element.parentElement
    if (!owner || !bleed?.classList.contains('clr-bleed')) {
      throw new Error('The actual public control has no unclipped glow/bleed owner')
    }
    const style = getComputedStyle(owner)
    const controlBox = element.getBoundingClientRect()
    const ownerBox = owner.getBoundingClientRect()
    let ancestorGlowCount = 0
    for (let node = element.parentElement; node !== null; node = node.parentElement) {
      if (node.classList.contains('clr-glow')) ancestorGlowCount += 1
    }
    return {
      filter: style.filter,
      spread: style.getPropertyValue('--glow-spread').trim(),
      color: style.getPropertyValue('--glow-color').trim(),
      interaction: style.getPropertyValue('--interaction-a300').trim(),
      clip: style.clipPath,
      controlFilter: getComputedStyle(element).filter,
      ancestorGlowCount,
      buttonCount: owner.querySelectorAll('button').length,
      containsCard: owner.querySelector('.clr-card') !== null,
      primary: element.classList.contains('clr-btn--primary'),
      controlBox: { x: controlBox.x, y: controlBox.y, width: controlBox.width, height: controlBox.height },
      ownerBox: { x: ownerBox.x, y: ownerBox.y, width: ownerBox.width, height: ownerBox.height },
    }
  })
}

async function sameGlow(control: Locator, reference: Awaited<ReturnType<typeof glowOf>>, secondary = true) {
  await expect(control).toBeEnabled()
  const actual = await glowOf(control)
  expect(actual.filter).toBe(reference.filter)
  expect(actual.filter.match(/drop-shadow\(/g)).toHaveLength(1)
  expect(actual.spread).toBe('6px')
  expect(actual.color).toBe(actual.interaction)
  expect(actual.color).toBe(reference.color)
  expect(actual.clip).toBe('none')
  expect(actual.controlFilter).toBe('none')
  expect(actual.ancestorGlowCount).toBe(1)
  expect(actual.buttonCount).toBe(1)
  expect(actual.containsCard).toBe(false)
  if (secondary) expect(actual.primary).toBe(false)
  expect(actual.ownerBox.x).toBeCloseTo(actual.controlBox.x, 0)
  expect(actual.ownerBox.y).toBeCloseTo(actual.controlBox.y, 0)
  expect(actual.ownerBox.width).toBeCloseTo(actual.controlBox.width, 0)
  expect(actual.ownerBox.height).toBeCloseTo(actual.controlBox.height, 0)
}

/** Native keyboard traversal must still reach and visibly frame the control. */
async function keyboardFocus(page: Page, control: Locator) {
  await control.focus()
  await page.keyboard.press('Tab')
  await page.keyboard.press('Shift+Tab')
  await expect(control).toBeFocused()
  expect(await control.evaluate((element) => element.matches(':focus-visible'))).toBe(true)
  await control.scrollIntoViewIfNeeded()
  const brackets = page.locator('.clr-focus-brackets')
  await expect(brackets).toHaveCount(1)
  await expect(brackets).toHaveCSS('opacity', '1')
  // The public brackets follow scrolling/resizing on animation frames.
  await expect.poll(async () => {
    const controlBox = await control.boundingBox()
    const bracketBox = await brackets.boundingBox()
    return controlBox !== null && bracketBox !== null &&
      bracketBox.x < controlBox.x && bracketBox.y < controlBox.y &&
      bracketBox.x + bracketBox.width > controlBox.x + controlBox.width &&
      bracketBox.y + bracketBox.height > controlBox.y + controlBox.height
  }).toBe(true)
}

async function actionBounds(control: Locator, width: number, height: number) {
  await control.scrollIntoViewIfNeeded()
  const geometry = await control.evaluate((element) => {
    const box = element.getBoundingClientRect()
    const owner = element.closest('.clr-scroll-region__scroller, .clr-scroll-region__foot')
    const ownerBox = owner?.getBoundingClientRect()
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
    return {
      x: box.x, y: box.y, right: box.right, bottom: box.bottom,
      ownerTop: ownerBox?.top ?? 0, ownerBottom: ownerBox?.bottom ?? innerHeight,
      hit: hit !== null && element.contains(hit),
    }
  })
  expect(geometry.x).toBeGreaterThanOrEqual(0)
  expect(geometry.right).toBeLessThanOrEqual(width + 1)
  expect(geometry.y).toBeGreaterThanOrEqual(Math.max(0, geometry.ownerTop) - 1)
  expect(geometry.bottom).toBeLessThanOrEqual(Math.min(height, geometry.ownerBottom) + 1)
  expect(geometry.hit).toBe(true)
}

async function noCardActionGlow(page: Page) {
  await expect(page.locator('.clr-card').first()).toBeVisible()
  await expect(page.locator('[data-day-state]')).toHaveCount(7)
  await expect(page.locator('[data-part="metrics"]')).toHaveCount(1)
  const subjects = await page.locator('.clr-card, [data-day-state], [data-part="metrics"]').evaluateAll((elements) =>
    elements.map((element) => ({
      filter: getComputedStyle(element).filter,
      insideGlow: element.closest('.clr-glow') !== null,
    })),
  )
  for (const subject of subjects) {
    expect(subject.filter).toBe('none')
    expect(subject.insideGlow).toBe(false)
  }
}

test.use({ timezoneId: 'UTC' })

for (const skin of SKINS) {
  test(`JOURNEY-004: ${skin} reuses Generate glow on Home controls and preserves focus, navigation and pending save`, async ({ page, visit, checkA11y }, testInfo) => {
    test.setTimeout(120_000)
    testInfo.annotations.push({ type: 'proof-mode',
      description: 'Four-skin production UI with intercepted synthetic reads and one deliberately held synthetic rest-day response; no backend/model/device proof.' })
    await page.setViewportSize({ width: 390, height: 844 })
    const fixture = await syntheticHome(page, skin)
    try {
      await visit('/')
      await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('Today')
      await expect(page.locator('html')).toHaveAttribute('data-skin', skin)
      const settings = page.getByRole('button', { name: 'Settings', exact: true })
      const mark = page.getByRole('button', { name: 'Mark Rest Day', exact: true })
      const generate = page.getByRole('button', { name: 'Generate workout', exact: true })
      await expect(mark).toBeEnabled()
      await expect(page.getByRole('link', { name: HISTORY.title, exact: true })).toBeVisible()
      await page.evaluate(() => document.fonts.ready)
      const reference = await glowOf(generate)
      expect(reference.primary).toBe(true)
      expect(reference.spread).toBe('6px')
      expect(reference.filter).toContain('drop-shadow(')
      expect(reference.color).toBe(reference.interaction)
      await sameGlow(settings, reference)
      await sameGlow(mark, reference)
      for (const control of [settings, mark, generate]) await actionBounds(control, 390, 844)
      await noCardActionGlow(page)

      await keyboardFocus(page, settings)
      await sameGlow(settings, reference)
      await page.keyboard.press('Enter')
      await expect(page).toHaveURL((url) => url.pathname === '/settings')
      await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('Settings')
      await checkA11y()
      const back = page.getByRole('button', { name: 'Back', exact: true })
      await back.focus()
      await page.keyboard.press('Enter')
      await expect(page).toHaveURL((url) => url.pathname === '/')
      await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('Today')
      await expect(page.locator('html')).toHaveAttribute('data-skin', skin)

      // Exercise the same scoped controls on a narrow phone within this skin
      // case, without multiplying a viewport-by-skin test matrix.
      await page.setViewportSize({ width: 320, height: 568 })
      await sameGlow(settings, reference)
      await sameGlow(mark, reference)
      for (const control of [settings, mark, generate]) await actionBounds(control, 320, 568)
      await keyboardFocus(page, settings)
      await actionBounds(settings, 320, 568)
      await keyboardFocus(page, mark)
      await actionBounds(mark, 320, 568)
      await sameGlow(mark, reference)
      await page.keyboard.press('Enter')
      const reason = page.getByRole('combobox', { name: 'Reason', exact: true })
      await expect(reason).toBeFocused()
      await reason.selectOption('injury')
      await page.keyboard.press('Escape')
      await expect(reason).toHaveCount(0)
      await expect(mark).toBeFocused()
      await sameGlow(mark, reference)

      await mark.click()
      await expect(reason).toHaveValue('rest')
      await reason.selectOption('vacation')
      await page.getByRole('button', { name: 'Cancel', exact: true }).click()
      await expect(reason).toHaveCount(0)
      await expect(mark).toBeFocused()

      await mark.click()
      await reason.selectOption('sick')
      const save = page.getByRole('button', { name: 'Save rest day', exact: true })
      const cancel = page.getByRole('button', { name: 'Cancel', exact: true })
      await sameGlow(save, reference, false)
      await save.click()
      await expect.poll(() => fixture.pending()).toBe(true)
      await expect(save).toBeDisabled()
      await expect(save).toHaveAttribute('aria-busy', 'true')
      await expect(cancel).toBeDisabled()
      // Wait for the actual computed disabled state, as for other UI state.
      await expect.poll(async () => (await glowOf(save)).filter).toBe('none')
      await expect(page.getByText('Rest day saved.', { exact: true })).toHaveCount(0)
      fixture.releaseSave()

      const change = page.getByRole('button', { name: 'Change reason', exact: true })
      await expect(change).toBeEnabled()
      await expect(change).toBeFocused()
      await expect(page.getByText('Today: Unwell.', { exact: true })).toBeVisible()
      await expect(page.getByText('Rest day saved.', { exact: true })).toBeVisible()
      await sameGlow(change, reference)
      await keyboardFocus(page, change)
      await page.keyboard.press('Enter')
      await expect(reason).toBeFocused()
      await expect(reason).toHaveValue('sick')
      await page.keyboard.press('Escape')
      await expect(reason).toHaveCount(0)
      await expect(change).toBeFocused()
      await noCardActionGlow(page)
      await checkA11y()
      fixture.assertSyntheticOnly()
    } finally {
      // Release an intercepted request even if an assertion fails; do not
      // leave a browser-owned request waiting during ordinary test cleanup.
      fixture.releaseSave()
    }
  })
}
