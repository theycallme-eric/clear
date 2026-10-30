import type { CDPSession, Locator, Page, Route } from '@playwright/test'

import { reviewHandoff } from '../src/state/review-handoff'
import { makeSessionAcceptance, makeSessionRow } from '../src/test/factories'
import { fixtureLocation, onboardedProfile } from '../src/test/user-data-double'
import { installDeterministicCapture } from './design-0143/fixtures'
import { expect, test } from './fixtures'

/**
 * TASK-002 / JOURNEY-002 — local CSS and mobile-browser proof only.
 *
 * Chromium's supported safe-area override changes the values of CSS env(),
 * rather than substituting test padding for the application's own layout.
 * Viewport resizing is a local layout exercise, never an iOS keyboard,
 * status-bar, installation, background/resume or physical-device result.
 *
 * These are ordinary production Home, Generate and Review routes. All API
 * requests are answered synthetically or blocked; no service-role credential,
 * model request, real account or forwarded write is needed. The same explicit
 * cases run against the public preview, with no target-dependent skips.
 */
const OWNER = '00000000-0000-4000-8000-000000000002'
const AUTH_KEY = 'clear.auth.session'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
}
const ACCEPTANCE = makeSessionAcceptance({
  date: new Date().toISOString().slice(0, 10),
  goal_preset: 'strength',
})
const HISTORY = Array.from({ length: 3 }, (_, index) => {
  const day = new Date()
  day.setUTCDate(day.getUTCDate() - index - 1)
  const date = day.toISOString().slice(0, 10)
  return makeSessionRow({
    id: `00000000-0000-4000-8000-00000000002${index}`,
    user_id: OWNER,
    location_id: ACCEPTANCE.location_id,
    date,
    title: `Synthetic viewport history ${index + 1}`,
    goal_preset: 'strength',
    started_at: `${date}T12:00:00.000Z`,
    completed_at: `${date}T12:30:00.000Z`,
    created_at: `${date}T12:00:00.000Z`,
    updated_at: `${date}T12:30:00.000Z`,
  })
})
const CANDIDATES = [{
  section: 'primary_lift',
  relaxed: false,
  candidates: [{
    exercise_id: 'synthetic-pwa-hinge', name: 'Synthetic PWA hinge',
    exercise_role: 'compound_lift', can_be_primary: true,
    movement_patterns: ['hinge'], primary_patterns: ['hinge'],
    component_movements: [], muscles: [], usable_equipment: ['barbell'],
  }],
}]

type Viewport = { width: number; height: number }
type Insets = { top: number; right: number; bottom: number; left: number }
const ZERO: Insets = { top: 0, right: 0, bottom: 0, left: 0 }

async function syntheticApp(page: Page) {
  const unexpected: string[] = []
  let attemptedWrites = 0
  let functionPosts = 0
  let candidateReads = 0
  const guard = await installDeterministicCapture(page, { skin: 'clear', reducedMotion: false })
  // Static documents/assets may load normally. Any unmatched mutation is
  // stopped before dispatch, including an accidental non-Supabase endpoint.
  await page.route('**/*', async (route) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())) return route.continue()
    attemptedWrites += 1
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
      if (name === 'locations') return reply([fixtureLocation({
        id: ACCEPTANCE.location_id!, user_id: OWNER, tier: 'full',
      })])
      if (name === 'workout_sessions') return reply(HISTORY)
      if (['rest_days', 'load_anchors', 'location_equipment', 'saved_workouts',
        'saved_workout_attempts', 'saved_workout_completions'].includes(name)) return reply([])
    }
    if (request.method() === 'POST' && url.pathname.includes('/rpc/')) {
      if (name === 'resume_session') return reply(null)
      if (['streak_sessions', 'constraints_in_force', 'anchor_evidence', 'conditioning_history'].includes(name)) {
        return reply([])
      }
      if (name === 'generation_candidate_sets_for_goal') {
        expect(request.postDataJSON()).toMatchObject({
          p_user_id: OWNER, p_focus: ACCEPTANCE.session_focus,
          p_location_id: ACCEPTANCE.location_id, p_goal: ACCEPTANCE.goal_preset,
        })
        candidateReads += 1
        return reply(CANDIDATES)
      }
    }
    if (request.method() !== 'GET') attemptedWrites += 1
    unexpected.push(`${request.method()} ${url.pathname}`)
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic PWA-proof request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ authKey, owner, handoff }) => {
    localStorage.setItem(authKey, JSON.stringify({
      accessToken: 'synthetic-pwa-preview-session', refreshToken: 'synthetic-pwa-preview-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-pwa@example.invalid' },
    }))
    if (location.pathname === '/review') {
      history.replaceState({ usr: handoff, key: 'synthetic-pwa-proof', idx: 0 }, '', location.href)
    }
  }, { authKey: AUTH_KEY, owner: OWNER, handoff: reviewHandoff(ACCEPTANCE) })
  return {
    assertReadOnly(expectedCandidateReads = 0) {
      expect(unexpected).toEqual([])
      expect(candidateReads).toBe(expectedCandidateReads)
      expect(attemptedWrites).toBe(0)
      expect(functionPosts).toBe(0)
      expect(guard.blockedGenerations()).toBe(0)
    },
  }
}

async function setInsets(cdp: CDPSession, insets: Insets) {
  await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: {
    ...insets, topMax: insets.top, rightMax: insets.right,
    bottomMax: insets.bottom, leftMax: insets.left,
  } })
}

/** A temporary invisible probe observes env(); it never changes app geometry. */
async function readInsets(page: Page) {
  return page.evaluate(() => {
    const probe = document.createElement('div')
    probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;' +
      'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) ' +
      'env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)'
    document.body.append(probe)
    try {
      const style = getComputedStyle(probe)
      return { top: parseFloat(style.paddingTop), right: parseFloat(style.paddingRight),
        bottom: parseFloat(style.paddingBottom), left: parseFloat(style.paddingLeft) }
    } finally { probe.remove() }
  })
}

async function safeBox(target: Locator, viewport: Viewport, insets: Insets) {
  await expect(target).toBeVisible()
  const box = await target.boundingBox()
  if (box === null) throw new Error('PWA proof could not read the rendered control')
  expect(box.x).toBeGreaterThanOrEqual(insets.left - 1)
  expect(box.y).toBeGreaterThanOrEqual(insets.top - 1)
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width - insets.right + 1)
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height - insets.bottom + 1)
  return box
}

async function insideOwner(target: Locator, owner: Locator) {
  const targetBox = await target.boundingBox()
  const ownerBox = await owner.boundingBox()
  if (targetBox === null || ownerBox === null) throw new Error('The control or its scroll owner is missing')
  expect(targetBox.y).toBeGreaterThanOrEqual(ownerBox.y - 1)
  expect(targetBox.y + targetBox.height).toBeLessThanOrEqual(ownerBox.y + ownerBox.height + 1)
}

async function frame(page: Page, viewport: Viewport, insets: Insets) {
  await expect.poll(() => readInsets(page)).toEqual(insets)
  const region = page.locator('main.clr-screen > .clr-scroll-region')
  const foot = region.locator(':scope > .clr-scroll-region__foot')
  await expect(foot.locator(':scope > footer.clr-footer')).toHaveCount(1)
  // ResizeObserver publishes the real pinned layer height. Observe that
  // contract before sampling the coupled scroller/foot geometry after resize.
  await expect.poll(() => region.evaluate((element) => {
    const pinned = element.querySelector(':scope > .clr-scroll-region__foot')
    const published = parseFloat(getComputedStyle(element).getPropertyValue('--foot-h'))
    return pinned !== null && element.hasAttribute('data-measured') &&
      Number.isFinite(published) && Math.abs(published - pinned.getBoundingClientRect().height) < 0.5
  })).toBe(true)
  const atmosphere = page.locator('.clr-atmosphere')
  await expect(atmosphere).toHaveCount(1)
  await expect(atmosphere).toHaveCSS('position', 'fixed')
  const geometry = await atmosphere.evaluate((layer) => {
    const rect = layer.getBoundingClientRect()
    const content = document.querySelector('.clr-shell--contained > .clr-shell__content')
    const shell = document.querySelector('.clr-shell--fixed')
    const scan = layer.querySelector('.clr-atmosphere__scan')
    const main = content?.querySelector('main.clr-screen')
    const region = main?.querySelector(':scope > .clr-scroll-region')
    const head = region?.querySelector(':scope > .clr-scroll-region__head')
    const scroller = region?.querySelector(':scope > .clr-scroll-region__scroller')
    const foot = region?.querySelector(':scope > .clr-scroll-region__foot')
    const footer = foot?.querySelector(':scope > footer.clr-footer')
    if (!content || !shell || !scan || !main || !head || !scroller || !foot || !footer) {
      throw new Error('The PWA shell, normal-motion atmosphere or actual screen layers are missing')
    }
    const contentStyle = getComputedStyle(content)
    const scanRect = scan.getBoundingClientRect()
    // Resolve the inherited gap as a CSS length; parsing an unevaluated var()
    // or max() custom-property expression would not measure real clearance.
    const probe = document.createElement('div')
    probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding-bottom:var(--shell-gap-bottom)'
    content.append(probe)
    const bottomGap = parseFloat(getComputedStyle(probe).paddingBottom)
    probe.remove()
    const tier = (element: Element) => {
      const style = getComputedStyle(element)
      return { xs: style.getPropertyValue('--label-xs-size').trim(),
        sm: style.getPropertyValue('--label-sm-size').trim(),
        xsLine: style.getPropertyValue('--label-xs-line-height').trim(),
        smLine: style.getPropertyValue('--label-sm-line-height').trim() }
    }
    return {
      x: rect.x, y: rect.y, width: rect.width, height: rect.height,
      viewport: { width: innerWidth, height: innerHeight },
      scan: { x: scanRect.x, y: scanRect.y, width: scanRect.width, height: scanRect.height,
        image: getComputedStyle(scan).backgroundImage },
      coloredBlobs: [...layer.querySelectorAll('.clr-atmosphere__blob')].map((blob) => getComputedStyle(blob).backgroundColor),
      overlayCount: layer.querySelectorAll('.clr-atmosphere__overlay').length,
      shellHeight: shell.getBoundingClientRect().height,
      paddingTop: parseFloat(contentStyle.paddingTop), paddingBottom: parseFloat(contentStyle.paddingBottom),
      mainBottom: main.getBoundingClientRect().bottom,
      scrollerBottom: scroller.getBoundingClientRect().bottom,
      footTop: foot.getBoundingClientRect().top, footBottom: foot.getBoundingClientRect().bottom,
      footerBottom: footer.getBoundingClientRect().bottom,
      footRemaining: foot.scrollHeight - foot.clientHeight - foot.scrollTop,
      bottomGap, footerPaddingBottom: parseFloat(getComputedStyle(footer).paddingBottom),
      tiers: { root: tier(document.documentElement), head: tier(head), scroller: tier(scroller), foot: tier(foot) },
      shellGround: getComputedStyle(shell).backgroundColor,
      scrollTop: document.scrollingElement?.scrollTop,
      scrollHeight: document.scrollingElement?.scrollHeight,
      clientHeight: document.scrollingElement?.clientHeight,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }
  })
  expect(geometry.viewport).toEqual(viewport)
  expect(geometry.x).toBeCloseTo(0, 0)
  expect(geometry.y).toBeCloseTo(0, 0)
  expect(geometry.width).toBeCloseTo(viewport.width, 0)
  expect(geometry.height).toBeCloseTo(viewport.height, 0)
  expect(geometry.scan.x).toBeCloseTo(0, 0)
  expect(geometry.scan.y).toBeCloseTo(0, 0)
  expect(geometry.scan.width).toBeCloseTo(viewport.width, 0)
  expect(geometry.scan.height).toBeCloseTo(viewport.height, 0)
  expect(geometry.scan.image).toContain('repeating-linear-gradient')
  expect(geometry.coloredBlobs).toHaveLength(3)
  for (const color of geometry.coloredBlobs) expect(color).not.toBe('rgba(0, 0, 0, 0)')
  expect(geometry.overlayCount).toBe(1)
  expect(geometry.shellHeight).toBeCloseTo(viewport.height, 0)
  expect(geometry.paddingTop).toBeGreaterThanOrEqual(insets.top)
  // B05: no shell-owned blank band. The actual final action layer owns
  // max(ordinary gap, safe inset), while main and its foot reach the viewport.
  expect(geometry.paddingBottom).toBe(0)
  expect(geometry.mainBottom).toBeCloseTo(viewport.height, 0)
  expect(geometry.footBottom).toBeCloseTo(viewport.height, 0)
  expect(geometry.scrollerBottom).toBeCloseTo(geometry.footTop, 0)
  expect(Number.isFinite(geometry.bottomGap)).toBe(true)
  expect(geometry.bottomGap).toBeGreaterThan(0)
  expect(geometry.footerPaddingBottom).toBeCloseTo(Math.max(geometry.bottomGap, insets.bottom), 0)
  // A genuinely overflowing foot is allowed to scroll. Only compare its
  // content end once it fits or has reached its real scroll end.
  if (geometry.footRemaining <= 0.5) {
    expect(geometry.footerBottom).toBeCloseTo(geometry.footBottom, 0)
  }
  expect(geometry.tiers.head.xs).toBe(geometry.tiers.root.xs)
  expect(geometry.tiers.head.xsLine).toBe(geometry.tiers.root.xsLine)
  for (const tier of [geometry.tiers.scroller, geometry.tiers.foot]) {
    expect(tier.xs).toBe(tier.sm)
    expect(tier.xsLine).toBe(tier.smLine)
  }
  expect(geometry.shellGround).toBe('rgba(0, 0, 0, 0)')
  expect(geometry.scrollTop).toBe(0)
  expect(geometry.scrollHeight).toBe(geometry.clientHeight)
  expect(geometry.overflowX).toBeLessThanOrEqual(0)
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /viewport-fit=cover/)
  await expect(page.locator('meta[name="apple-mobile-web-app-status-bar-style"]')).toHaveAttribute('content', 'black-translucent')
}

async function reveal(target: Locator, viewport: Viewport, insets: Insets, owner: Locator) {
  await target.focus()
  await target.scrollIntoViewIfNeeded()
  await safeBox(target, viewport, insets)
  await insideOwner(target, owner)
  const end = await target.evaluate((element) => {
    const foot = element.closest('.clr-scroll-region__foot')
    if (foot === null) return null
    const footer = foot.querySelector(':scope > footer.clr-footer')
    if (!footer || !footer.contains(element)) throw new Error('The revealed action has no actual footer owner')
    const controls = [...footer.querySelectorAll('button, a[href]')].filter((control) => control.getClientRects().length > 0)
    return {
      gap: innerHeight - element.getBoundingClientRect().bottom,
      clearance: parseFloat(getComputedStyle(footer).paddingBottom),
      last: controls.at(-1) === element,
      remaining: foot.scrollHeight - foot.clientHeight - foot.scrollTop,
    }
  })
  if (end !== null) {
    expect(Number.isFinite(end.clearance)).toBe(true)
    expect(end.clearance).toBeGreaterThan(0)
    expect(end.gap).toBeGreaterThanOrEqual(end.clearance - 1)
    if (end.last && end.remaining <= 0.5) expect(end.gap).toBeCloseTo(end.clearance, 0)
  }
}

/** One real, bounded finger drag; scroll geometry is observed, never assigned. */
async function touchScroll(page: Page, cdp: CDPSession, owner: Locator) {
  const before = await owner.evaluate((element) => ({ top: element.scrollTop,
    height: element.clientHeight, full: element.scrollHeight }))
  expect(before.full).toBeGreaterThan(before.height)
  const box = await owner.boundingBox()
  if (box === null) throw new Error('Home scroll owner is missing')
  const x = box.x + box.width / 2
  const startY = box.y + box.height * 0.85
  const distance = Math.min(400, box.height * 0.7)
  expect(await owner.evaluate((element, point) => {
    const hit = document.elementFromPoint(point.x, point.y)
    return hit !== null && element.contains(hit)
  }, { x, y: startY })).toBe(true)
  const point = (y: number) => [{ x, y, id: 1, radiusX: 1, radiusY: 1, force: 1 }]
  let touching = false
  try {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(startY) })
    touching = true
    for (let step = 1; step <= 12; step += 1) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove', touchPoints: point(startY - distance * step / 12),
      })
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    touching = false
  } finally {
    if (touching) await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
  }
  await expect.poll(() => owner.evaluate((element) => element.scrollTop)).toBeGreaterThan(before.top)
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
}

const CASES = [
  { name: 'phone', viewport: { width: 390, height: 844 }, reducedHeight: 420,
    insets: { top: 47, right: 0, bottom: 34, left: 0 } },
  { name: 'narrow phone', viewport: { width: 320, height: 568 }, reducedHeight: 360,
    insets: { top: 32, right: 24, bottom: 24, left: 24 } },
  { name: 'short phone', viewport: { width: 390, height: 320 }, reducedHeight: 280,
    insets: { top: 24, right: 0, bottom: 16, left: 0 } },
  { name: 'landscape phone', viewport: { width: 844, height: 390 }, reducedHeight: 300,
    insets: { top: 0, right: 47, bottom: 21, left: 47 } },
] as const

test.use({ timezoneId: 'UTC' })

for (const { name, viewport, reducedHeight, insets } of CASES) {
  test(`JOURNEY-002: ${name} keeps Home controls safe with CSS env insets, touch scroll and viewport resize`, async ({ page, visit, checkA11y, browserName }, testInfo) => {
    test.setTimeout(120_000)
    testInfo.annotations.push({ type: 'proof-mode',
      description: 'Synthetic intercepted Home; Chromium CSS env safe-area override and viewport resize only, no installed-iPhone proof.' })
    expect(browserName).toBe('chromium')
    const fixture = await syntheticApp(page)
    await page.setViewportSize(viewport)
    const cdp = await page.context().newCDPSession(page)
    try {
      await setInsets(cdp, insets)
      await visit('/')
      await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('Today')
      const mark = page.getByRole('button', { name: 'Mark Rest Day', exact: true })
      await expect(mark).toBeVisible()
      await page.evaluate(() => document.fonts.ready)
      const scroller = page.locator('main > .clr-scroll-region > .clr-scroll-region__scroller')
      const footer = page.locator('main > .clr-scroll-region > .clr-scroll-region__foot')
      const generate = page.getByRole('button', { name: 'Generate workout', exact: true })
      await expect(scroller).toHaveCount(1)
      await frame(page, viewport, insets)
      await safeBox(page.getByRole('button', { name: 'Settings', exact: true }), viewport, insets)
      await reveal(generate, viewport, insets, footer)
      await touchScroll(page, cdp, scroller)
      await mark.click()
      const reason = page.getByRole('combobox', { name: 'Reason', exact: true })
      await expect(reason).toBeFocused()
      await reason.selectOption('injury')
      await expect(reason).toHaveValue('injury')
      await expect(reason).toBeFocused()
      await checkA11y()

      const reduced = { width: viewport.width, height: reducedHeight }
      await page.setViewportSize(reduced)
      await expect(reason).toBeFocused()
      await expect(reason).toHaveValue('injury')
      await frame(page, reduced, insets)
      await reason.scrollIntoViewIfNeeded()
      await safeBox(reason, reduced, insets)
      await insideOwner(reason, scroller)
      // Keyboard traversal can reveal the pinned action in its own measured
      // layer even when a very short viewport makes that layer scrollable.
      await reveal(generate, reduced, insets, footer)
      const cancel = page.getByRole('button', { name: 'Cancel', exact: true })
      await reveal(cancel, reduced, insets, scroller)
      await cancel.click()
      await expect(mark).toBeFocused()
      await expect(reason).toHaveCount(0)
      await mark.click()
      await expect(reason).toHaveValue('rest')
      await page.keyboard.press('Escape')
      await expect(reason).toHaveCount(0)
      await expect(mark).toBeFocused()

      await page.setViewportSize(viewport)
      await frame(page, viewport, insets)
      // Zero env insets exercise the ordinary-spacing fallback; this is not
      // an assertion about whether any particular iPhone honors cover.
      await setInsets(cdp, ZERO)
      await frame(page, viewport, ZERO)
      await safeBox(page.getByRole('button', { name: 'Settings', exact: true }), viewport, ZERO)
      await reveal(generate, viewport, ZERO, footer)
      await checkA11y()
      fixture.assertReadOnly()
    } finally {
      await setInsets(cdp, ZERO)
      await cdp.detach()
    }
  })
}

test('JOURNEY-002: a focused Generate text draft survives a reduced viewport and exits Home without a request', async ({ page, visit, checkA11y }, testInfo) => {
  test.setTimeout(120_000)
  testInfo.annotations.push({ type: 'proof-mode',
    description: 'Local viewport resizing with a real focused textarea; no physical keyboard or installed-device claim.' })
  const viewport = { width: 390, height: 844 }
  const reduced = { width: 390, height: 420 }
  const insets = { top: 47, right: 20, bottom: 34, left: 20 }
  const fixture = await syntheticApp(page)
  await page.setViewportSize(viewport)
  const cdp = await page.context().newCDPSession(page)
  try {
    await setInsets(cdp, insets)
    await visit('/')
    await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('Today')
    await page.getByRole('button', { name: 'Generate workout', exact: true }).click()
    await expect(page).toHaveURL((url) => url.pathname === '/generate')
    const notes = page.getByRole('textbox', { name: 'Notes', exact: true })
    const draft = 'Synthetic PWA viewport draft — retain this text.'
    await notes.fill(draft)
    await expect(notes).toBeFocused()
    await page.setViewportSize(reduced)
    await expect(notes).toBeFocused()
    await expect(notes).toHaveValue(draft)
    await frame(page, reduced, insets)
    await notes.scrollIntoViewIfNeeded()
    await safeBox(notes, reduced, insets)
    await insideOwner(notes, page.locator('main > .clr-scroll-region > .clr-scroll-region__scroller'))
    await checkA11y()
    const footer = page.locator('main > .clr-scroll-region > .clr-scroll-region__foot')
    const generate = page.getByRole('button', { name: 'Generate workout', exact: true })
    await reveal(generate, reduced, insets, footer)
    // Restore the original focused-draft precondition before resizing back.
    await notes.focus()
    await expect(notes).toBeFocused()
    await expect(notes).toHaveValue(draft)
    await page.setViewportSize(viewport)
    await expect(notes).toBeFocused()
    await expect(notes).toHaveValue(draft)
    await frame(page, viewport, insets)
    await reveal(generate, viewport, insets, footer)
    const home = page.getByRole('button', { name: 'Home', exact: true })
    await safeBox(home, viewport, insets)
    await home.click()
    await expect(page).toHaveURL((url) => url.pathname === '/')
    await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('Today')
    await frame(page, viewport, insets)
    fixture.assertReadOnly()
  } finally {
    await setInsets(cdp, ZERO)
    await cdp.detach()
  }
})

test('JOURNEY-002: the real swap toast and its dismissal remain inside simulated portrait and landscape safe areas', async ({ page, visit, checkA11y }, testInfo) => {
  test.setTimeout(120_000)
  testInfo.annotations.push({ type: 'proof-mode',
    description: 'Production Review handoff and shared toast with intercepted synthetic reads; CSS env geometry, no device or persistence proof.' })
  const viewport = { width: 320, height: 568 }
  const insets = { top: 47, right: 28, bottom: 34, left: 28 }
  const fixture = await syntheticApp(page)
  await page.setViewportSize(viewport)
  const cdp = await page.context().newCDPSession(page)
  try {
    await setInsets(cdp, insets)
    await visit('/review')
    await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(ACCEPTANCE.workout.title)
    await page.getByRole('button', { name: 'Swap back squat', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Swap back squat', exact: true })
    await expect(dialog).toBeVisible()
    await safeBox(dialog.getByRole('button', { name: 'Keep back squat', exact: true }), viewport, insets)
    const option = dialog.getByRole('button', { name: /^Synthetic PWA hinge\s*BARBELL$/ })
    await safeBox(option, viewport, insets)
    await option.click()
    await expect(page.locator('dialog[open]')).toHaveCount(0)
    const host = page.locator('[data-clear-toast-host]')
    const status = host.getByRole('status')
    const dismiss = host.getByRole('button', { name: 'Dismiss', exact: true })
    await expect(status).toHaveText('Swapped in Synthetic PWA hinge.')
    await expect.poll(() => host.evaluate((element) =>
      element.getAnimations({ subtree: true }).some((animation) => animation.playState === 'running'),
    )).toBe(false)
    expect(await host.evaluate((element) => element.closest('.clr-shell--contained') === null)).toBe(true)
    await safeBox(status, viewport, insets)
    await safeBox(dismiss, viewport, insets)
    await checkA11y()

    const landscape = { width: 568, height: 320 }
    const landscapeInsets = { top: 0, right: 47, bottom: 21, left: 47 }
    await page.setViewportSize(landscape)
    await setInsets(cdp, landscapeInsets)
    await frame(page, landscape, landscapeInsets)
    await safeBox(status, landscape, landscapeInsets)
    const box = await safeBox(dismiss, landscape, landscapeInsets)
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    expect(await dismiss.evaluate((element, target) => {
      const hit = document.elementFromPoint(target.x, target.y)
      return hit !== null && element.contains(hit)
    }, point)).toBe(true)
    await page.touchscreen.tap(point.x, point.y)
    await expect(host).toHaveCount(0)
    await expect(page).toHaveURL((url) => url.pathname === '/review')
    await reveal(page.getByRole('button', { name: 'Start workout', exact: true }), landscape, landscapeInsets,
      page.locator('main > .clr-scroll-region > .clr-scroll-region__foot'))
    await checkA11y()
    fixture.assertReadOnly(1)
  } finally {
    await setInsets(cdp, ZERO)
    await cdp.detach()
  }
})
