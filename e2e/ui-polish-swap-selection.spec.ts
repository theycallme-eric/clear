import type { CDPSession, Locator, Page, Route } from '@playwright/test'

import { reviewHandoff } from '../src/state/review-handoff'
import { makeSessionAcceptance } from '../src/test/factories'
import { fixtureLocation, onboardedProfile } from '../src/test/user-data-double'
import { expect, test } from './fixtures'
import { installDeterministicCapture } from './design-0143/fixtures'

/**
 * TASK-017 / JOURNEY-016 — synthetic long-list proof on the production Review
 * route. React Router's ordinary history-state handoff carries the workout;
 * no production test bridge or extra application route is installed.
 *
 * Every Auth/PostgREST/function request is intercepted. This proves the local
 * or preview UI contract, never backend persistence or the unknown installed
 * iPhone symptom. No model request, real account or forwarded API write is
 * needed. The same cases run against the ordinary public preview target.
 */
const OWNER = '00000000-0000-4000-8000-000000000017'
const AUTH_KEY = 'clear.auth.session'
const LENGTH = 32
const LAST_ID = 'synthetic-hinge-32'
const LAST_NAME = 'Synthetic hinge 32 with a wrapped label'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
}
const ACCEPTANCE = makeSessionAcceptance({
  date: new Date().toISOString().slice(0, 10),
  goal_preset: 'strength',
})
const CANDIDATES = [{
  section: 'primary_lift',
  relaxed: false,
  candidates: Array.from({ length: LENGTH }, (_, index) => {
    const suffix = String(index + 1).padStart(2, '0')
    return {
      exercise_id: `synthetic-hinge-${suffix}`,
      name: index === LENGTH - 1 ? LAST_NAME : `Synthetic hinge ${suffix}`,
      exercise_role: 'compound_lift', can_be_primary: true,
      movement_patterns: ['hinge'], primary_patterns: ['hinge'],
      component_movements: [], muscles: [], usable_equipment: ['barbell'],
    }
  }),
}]

type Viewport = { width: number; height: number }

async function syntheticReview(page: Page) {
  const unexpected: string[] = []
  let candidateReads = 0
  let attemptedWrites = 0
  let functionPosts = 0
  const guard = await installDeterministicCapture(page, { skin: 'clear', reducedMotion: true })
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
      if (name === 'locations') return reply([fixtureLocation({
        id: ACCEPTANCE.location_id!, user_id: OWNER, tier: 'full',
      })])
      if (['workout_sessions', 'load_anchors', 'location_equipment', 'saved_workout_attempts',
        'saved_workouts', 'rest_days'].includes(name)) return reply([])
    }
    if (request.method() === 'POST' && url.pathname.includes('/rpc/')) {
      if (name === 'generation_candidate_sets_for_goal') {
        expect(request.postDataJSON()).toMatchObject({
          p_user_id: OWNER, p_focus: ACCEPTANCE.session_focus,
          p_location_id: ACCEPTANCE.location_id, p_goal: ACCEPTANCE.goal_preset,
        })
        candidateReads += 1
        return reply(CANDIDATES)
      }
      if (name === 'resume_session') return reply(null)
      if (['constraints_in_force', 'anchor_evidence', 'conditioning_history'].includes(name)) return reply([])
    }
    if (request.method() !== 'GET') attemptedWrites += 1
    unexpected.push(`${request.method()} ${url.pathname}`)
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic swap-proof request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ authKey, owner, handoff }) => {
    localStorage.setItem(authKey, JSON.stringify({
      accessToken: 'synthetic-swap-preview-session', refreshToken: 'synthetic-swap-preview-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-swap@example.invalid' },
    }))
    if (location.pathname === '/review') {
      history.replaceState({ usr: handoff, key: 'synthetic-swap-proof', idx: 0 }, '', location.href)
    }
  }, { authKey: AUTH_KEY, owner: OWNER, handoff: reviewHandoff(ACCEPTANCE) })
  return {
    assertReadsOnly() {
      expect(unexpected).toEqual([])
      expect(candidateReads).toBe(3)
      expect(attemptedWrites).toBe(0)
      expect(functionPosts).toBe(0)
      expect(guard.blockedGenerations()).toBe(0)
      // All matched API requests are fulfilled/aborted above; none is forwarded.
    },
  }
}

async function boxInside(target: Locator, viewport: Viewport) {
  await expect(target).toBeVisible()
  const box = await target.boundingBox()
  if (box === null) throw new Error('Swap proof could not read the rendered target')
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1)
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1)
  return box
}

/** Real Chromium touch input; geometry and scroll position are only observed. */
async function touchToEnd(page: Page, cdp: CDPSession, scroller: Locator) {
  const initial = await scroller.evaluate((element) => ({
    top: element.scrollTop, height: element.clientHeight, full: element.scrollHeight,
    overflow: getComputedStyle(element).overflowY,
  }))
  expect(initial.height).toBeGreaterThan(0)
  expect(initial.full).toBeGreaterThan(initial.height)
  expect(initial.overflow).toBe('auto')
  let gestures = 0
  for (; gestures < 12; gestures += 1) {
    const before = await scroller.evaluate((element) => ({
      top: element.scrollTop, remaining: element.scrollHeight - element.clientHeight - element.scrollTop,
    }))
    if (before.remaining <= 1) break
    const box = await scroller.boundingBox()
    if (box === null) throw new Error('Swap list disappeared during the touch gesture')
    await cdp.send('Input.synthesizeScrollGesture', {
      x: box.x + box.width / 2, y: box.y + box.height / 2,
      yDistance: -Math.min(600, before.remaining + 1),
      gestureSourceType: 'touch', preventFling: true, speed: 1500,
    })
    await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(before.top)
  }
  expect(gestures).toBeGreaterThan(0)
  const final = await scroller.evaluate((element) => ({
    top: element.scrollTop, remaining: element.scrollHeight - element.clientHeight - element.scrollTop,
  }))
  expect(final.top).toBeGreaterThan(initial.top)
  expect(final.remaining).toBeLessThanOrEqual(1)
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
}

test.use({ timezoneId: 'UTC' })

for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 390, height: 320 }]) {
  test(`JOURNEY-016: actual touch scroll selects the last synthetic swap and returns to Review at ${viewport.width}x${viewport.height}`, async ({ page, visit, checkA11y, browserName }, testInfo) => {
    test.setTimeout(120_000)
    testInfo.annotations.push({ type: 'proof-mode',
      description: 'Synthetic intercepted API contract on the production Review route; Chromium touch input, no backend or installed-iPhone proof.' })
    expect(browserName).toBe('chromium')
    await page.setViewportSize(viewport)
    const fixture = await syntheticReview(page)
    await visit('/review')
    await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(ACCEPTANCE.workout.title)
    const original = page.getByRole('button', { name: 'Swap back squat', exact: true })
    const start = page.getByRole('button', { name: 'Start workout', exact: true })
    const dialog = page.getByRole('dialog', { name: 'Swap back squat', exact: true })
    const keep = dialog.getByRole('button', { name: 'Keep back squat', exact: true })
    const list = dialog.getByRole('list', { name: 'Alternatives', exact: true })
    const last = list.getByRole('button', { name: new RegExp(`^${LAST_NAME}\\s*BARBELL$`) })
    const host = page.locator('[data-clear-toast-host]')
    const open = async () => {
      await original.click()
      await expect(dialog).toBeVisible()
      await expect(list.getByRole('button')).toHaveCount(LENGTH)
      await page.evaluate(() => document.fonts.ready)
    }
    const unchanged = async () => {
      await expect(page).toHaveURL((url) => url.pathname === '/review')
      await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(ACCEPTANCE.workout.title)
      await expect(original).toBeEnabled()
      await expect(start).toBeEnabled()
      await expect(host).toHaveCount(0)
    }

    await open()
    await boxInside(dialog, viewport)
    await boxInside(keep, viewport)
    await keep.click()
    await expect(page.locator('dialog[open]')).toHaveCount(0)
    await expect(original).toBeFocused()
    await unchanged()

    await open()
    await page.keyboard.press('Escape')
    await expect(page.locator('dialog[open]')).toHaveCount(0)
    await expect(original).toBeFocused()
    await unchanged()

    await open()
    await checkA11y()
    const scroller = dialog.locator('.clr-scroll-region__scroller')
    await expect(scroller).toHaveCount(1)
    await boxInside(dialog, viewport)
    await boxInside(scroller, viewport)
    await boxInside(keep, viewport)
    await expect(last).not.toBeInViewport()
    const cdp = await page.context().newCDPSession(page)
    try { await touchToEnd(page, cdp, scroller) } finally { await cdp.detach() }
    const scrollerBox = await boxInside(scroller, viewport)
    const lastBox = await boxInside(last, viewport)
    expect(lastBox.y).toBeGreaterThanOrEqual(scrollerBox.y - 1)
    expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(scrollerBox.y + scrollerBox.height + 1)
    await boxInside(keep, viewport)
    const labelLines = await last.evaluate((button) => {
      const text = Array.from(button.childNodes).find((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.includes('Synthetic hinge'))
      if (text === undefined) throw new Error('The synthetic alternative label was not found')
      const range = document.createRange()
      range.selectNodeContents(text)
      return range.getClientRects().length
    })
    expect(labelLines).toBeGreaterThan(1)
    const touch = { x: lastBox.x + lastBox.width / 2, y: lastBox.y + lastBox.height / 2 }
    expect(await last.evaluate((button, point) => {
      const hit = document.elementFromPoint(point.x, point.y)
      return hit !== null && button.contains(hit)
    }, touch)).toBe(true)
    await page.touchscreen.tap(touch.x, touch.y)
    await expect(page.locator('dialog[open]')).toHaveCount(0)
    await expect(page).toHaveURL((url) => url.pathname === '/review')
    await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(ACCEPTANCE.workout.title)
    const replacement = page.getByRole('button', { name: `Swap ${LAST_ID.replaceAll('-', ' ')}`, exact: true })
    await expect(replacement).toBeEnabled()
    await expect(replacement).toBeFocused()
    await expect(original).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Undo swap — back to back squat', exact: true })).toBeEnabled()
    await expect(start).toBeEnabled()
    await expect(host).toHaveCount(1)
    await expect(host.getByRole('status')).toHaveText(`Swapped in ${LAST_NAME}.`)
    await host.getByRole('button', { name: 'Dismiss', exact: true }).click()
    await expect(host).toHaveCount(0)
    await boxInside(start, viewport)
    await start.click({ trial: true })
    await checkA11y()
    fixture.assertReadsOnly()
  })
}
