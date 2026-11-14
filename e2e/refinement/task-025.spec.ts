import { spawn } from 'node:child_process'
import { createServer, type AddressInfo } from 'node:net'
import { resolve } from 'node:path'
import type { Locator, Page, Route } from '@playwright/test'

import { readE2eEnv } from '../../scripts/e2e/env.mjs'
import { notOnboardedProfile } from '../../src/test/user-data-double'
import { installDeterministicCapture } from '../design-0143/fixtures'
import { expect, test as scanned } from '../fixtures'

/**
 * TASK-025 (REQ-025; C52, G17, R24; AC-C52-01, AC-R025-01; JOURNEY-025) — on
 * the real Setup / onboarding equipment screen, Set up CLEAR, the step label
 * and its progress stay pinned together above one shared divider while the
 * equipment content scrolls. Accepted gallery reference
 * eded158cfd928d382c9a9409e2c372270312741d, `/gallery/refinements?state=screens`,
 * which draws the route's own `SetupProgress` and `SetupStepView`.
 *
 * Entry (ENTRY-025): a signed-in athlete who has not set up yet reaches
 * `/onboarding` through the existing auth and onboarding guards; choosing a
 * setup lists more equipment than the phone viewport holds. Action: scroll the
 * equipment choices and operate the step controls. Result, read from the
 * browser at phone widths: the title, the step label and the progress sit in
 * Screen's one pinned head, closed by one full-width divider; the scroller
 * starts at that divider, so equipment content scrolls below it and never
 * under it; the head does not move while the content scrolls; the progress is
 * a named, visible progressbar. Recovery: a failed commit is said, keeps the
 * draft and the pinned head; keyboard focus, touch, reduced motion and a
 * reopen reach all of it.
 *
 * Synthetic and contained: an intercepted session for a fictional user and
 * synthetic reads only. The one write the journey can make — the setup commit
 * — is answered here with a refusal and never forwarded; nothing is stored.
 */
const OWNER = '00000000-0000-4000-8000-000000002501'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
}

const e2e = readE2eEnv()
const SYNTHETIC_ORIGIN_NEEDED = !e2e.usesExternalTarget && (e2e.url === null || e2e.anonKey === null)
const REPO_ROOT = resolve(import.meta.dirname, '..', '..')

function freePort() {
  return new Promise<number>((settle, fail) => {
    const probe = createServer()
    probe.once('error', fail)
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as AddressInfo
      probe.close(() => settle(port))
    })
  })
}

/** Ready only when the server answering is this checkout's own. */
async function waitForOrigin(origin: string, deadline: number, exited: () => number | null) {
  const own = `${origin}/@fs${resolve(REPO_ROOT, 'package.json')}`
  while (Date.now() < deadline) {
    const code = exited()
    if (code !== null) throw new Error(`Synthetic TASK-025 server exited (${code}) before ${origin} was ready`)
    try {
      if ((await fetch(origin)).ok && (await fetch(own)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((settle) => setTimeout(settle, 250))
  }
  throw new Error(`Synthetic TASK-025 origin ${origin} did not start`)
}

const test = scanned.extend<object, { syntheticOrigin: string | null }>({
  syntheticOrigin: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      if (!SYNTHETIC_ORIGIN_NEEDED) return use(null)
      const port = await freePort()
      const origin = `http://localhost:${port}`
      const server = spawn(process.execPath, [
        resolve(REPO_ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort',
      ], {
        cwd: REPO_ROOT,
        env: {
          ...process.env,
          VITE_SUPABASE_URL: 'https://synthetic-task-025.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-task-025-public-placeholder',
        },
        stdio: 'ignore',
      })
      let exitCode: number | null = null
      server.once('exit', (code) => { exitCode = code ?? -1 })
      try {
        await waitForOrigin(origin, Date.now() + 90_000, () => exitCode)
        await use(origin)
      } finally {
        server.kill()
      }
    },
    { scope: 'worker', timeout: 120_000 },
  ],
  baseURL: async ({ baseURL, syntheticOrigin }, use) => use(syntheticOrigin ?? baseURL),
})

test.describe.configure({ mode: 'default' })

type Viewport = { width: number; height: number }
/** The approved mobile scope: the narrow, short phone and the project's own phone. */
const VIEWPORTS: ReadonlyArray<{ name: string; viewport: Viewport }> = [
  { name: 'phone-320', viewport: { width: 320, height: 568 } },
  { name: 'phone-390', viewport: { width: 390, height: 844 } },
]

const TITLE = 'Set up CLEAR'
const STEP_1 = 'What’s your gym setup?'
const STEP_2 = 'How familiar are you with the gym?'
const CONFIRM = 'Here’s your setup'
const COMMIT_FAILED = 'Your setup didn’t save'
const EQUIPMENT_NAMES = [
  'Bodyweight', 'Resistance bands', 'Foam roller', 'Dumbbells', 'Kettlebells', 'Pull-up bar', 'Barbell',
  'Plyo box', 'Cable machine', 'Rowing machine', 'Assault bike', 'Battle ropes', 'Assisted pull-up / dip',
  'Leg press', 'Leg curl / extension', 'Hack squat',
]

// ─────────────────────────────────────────────────────────────────────────────
// The synthetic app
// ─────────────────────────────────────────────────────────────────────────────

interface AppOptions {
  readonly reducedMotion?: boolean
}

/** The reads the boot check and the guards make, answered here. */
const READ_RPCS = new Set(['resume_session', 'streak_sessions', 'constraints_in_force', 'anchor_evidence', 'conditioning_history'])

async function syntheticApp(page: Page, options: AppOptions = {}) {
  const unexpected: string[] = []
  const commits: Array<Record<string, unknown>> = []
  const guard = await installDeterministicCapture(page, { skin: 'clear', reducedMotion: options.reducedMotion ?? true })

  const handler = async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    const name = url.pathname.split('/').at(-1) ?? ''
    const reply = (body: unknown, status = 200) =>
      route.fulfill({ status, headers: CORS, json: body }).catch(() => undefined)
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (request.method() === 'GET' && url.pathname.startsWith('/rest/v1/')) {
      if (name === 'profiles') return reply([notOnboardedProfile({ id: OWNER })])
      // No places, history, catalog or favorites yet.
      return reply([])
    }
    if (request.method() === 'POST' && url.pathname.includes('/rpc/')) {
      if (READ_RPCS.has(name)) return reply(name === 'resume_session' ? null : [])
      if (name === 'complete_onboarding') {
        // Answered here, never forwarded: the commit fails and nothing is stored.
        commits.push(request.postDataJSON() as Record<string, unknown>)
        return reply({ code: 'PGRST000', message: 'Synthetic TASK-025 server failure.' }, 500)
      }
    }
    unexpected.push(`${request.method()} ${url.pathname}`)
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic TASK-025 request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ owner }) => {
    localStorage.setItem('clear.auth.session', JSON.stringify({
      accessToken: 'synthetic-task-025-session', refreshToken: 'synthetic-task-025-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-task-025@example.invalid' },
    }))
  }, { owner: OWNER })

  return {
    commits: () => commits,
    assertContained(expected: { commits?: number } = {}) {
      expect(unexpected, 'Every API request has an explicit synthetic disposition').toEqual([])
      expect(commits.length, 'The setup commit runs only when Finish setup or Try again is pressed').toBe(expected.commits ?? 0)
      expect(guard.blockedGenerations(), 'No generation reached the model route').toBe(0)
    },
  }
}

async function settle(page: Page) {
  await page.evaluate(async () => {
    void document.body.offsetHeight
    await Promise.all([...document.fonts].map((face) => face.load().catch(() => undefined)))
    await document.fonts.ready
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
  })
  await page.waitForFunction(() => {
    const main = document.querySelector('main')
    return main !== null && main.getAnimations({ subtree: true })
      .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
      .every((animation) => animation.playState !== 'running')
  })
}

/** ENTRY-025: the guard sends a signed-in athlete without a setup to /onboarding. */
async function openSetup(page: Page, visit: (path: string) => Promise<void>) {
  await visit('/')
  await expect(page).toHaveURL((url) => url.pathname === '/onboarding')
  await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(TITLE)
  await expect(page.getByRole('heading', { level: 2, name: STEP_1 })).toBeVisible()
  await settle(page)
}

async function attach(target: Page | Locator, name: string) {
  await test.info().attach(`${name}.png`, { body: await target.screenshot({ caret: 'hide' }), contentType: 'image/png' })
}

async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
}

// ─────────────────────────────────────────────────────────────────────────────
// Reading the pinned head
// ─────────────────────────────────────────────────────────────────────────────

interface Box { top: number; bottom: number; left: number; right: number }

interface HeadReading {
  /** The heading in the head's header, and the progressbar in its pinned layer. */
  title: string | null
  progress: { name: string | null; now: string | null; max: string | null; hidden: boolean; label: string } | null
  /** Every element of the head that draws a horizontal rule. */
  rules: string[]
  /** The one rule: its width, and the span it draws across. */
  rule: { width: number; left: number; right: number; bottom: number }
  titleBox: Box
  progressBox: Box
  headBottom: number
  scroller: Box & { scrollTop: number; scrollHeight: number; clientHeight: number }
  /** A sticky or fixed element inside the scrolling content. */
  overlays: number
  viewport: number
}

/** `root` holds a `.clr-scroll-region` whose head and scroller are read. */
async function readHead(root: Locator): Promise<HeadReading> {
  return root.evaluate((element) => {
    const region = element.matches('.clr-scroll-region')
      ? element
      : element.querySelector<HTMLElement>(':scope > .clr-scroll-region')!
    const head = region.querySelector<HTMLElement>(':scope > .clr-scroll-region__head')!
    const scroller = region.querySelector<HTMLElement>(':scope > .clr-scroll-region__scroller')!
    const box = (node: Element): Box => {
      const { top, bottom, left, right } = node.getBoundingClientRect()
      return { top, bottom, left, right }
    }
    const title = head.querySelector<HTMLElement>(':scope > header :is(h1, h2, h3, h4, h5, h6)')
    const bar = head.querySelector<HTMLElement>(':scope > .clr-screen__pinned [role="progressbar"]')
    const label = bar?.previousElementSibling?.textContent?.trim() ?? ''
    const draws = (node: Element) => {
      const style = getComputedStyle(node)
      const top = parseFloat(style.borderTopWidth) > 0 && style.borderTopStyle !== 'none'
      const bottom = parseFloat(style.borderBottomWidth) > 0 && style.borderBottomStyle !== 'none'
      return top || bottom
    }
    const rules = [head, ...head.querySelectorAll('*')].filter(draws).map((node) =>
      node === head ? 'head' : `${node.tagName.toLowerCase()}.${[...node.classList].join('.')}`)
    const headBox = head.getBoundingClientRect()
    const overlays = [...scroller.querySelectorAll('*')].filter((node) =>
      ['sticky', 'fixed'].includes(getComputedStyle(node).position)).length
    return {
      title: title?.textContent?.trim() ?? null,
      progress: bar && {
        name: bar.getAttribute('aria-label'),
        now: bar.getAttribute('aria-valuenow'),
        max: bar.getAttribute('aria-valuemax'),
        hidden: bar.closest('[aria-hidden="true"], [hidden], [inert]') !== null ||
          getComputedStyle(bar).visibility === 'hidden' || bar.getBoundingClientRect().height === 0,
        label,
      },
      rules,
      rule: {
        width: parseFloat(getComputedStyle(head).borderBottomWidth),
        left: headBox.left,
        right: headBox.right,
        bottom: headBox.bottom,
      },
      titleBox: title ? box(title) : { top: NaN, bottom: NaN, left: NaN, right: NaN },
      progressBox: bar ? box(bar) : { top: NaN, bottom: NaN, left: NaN, right: NaN },
      headBottom: headBox.bottom,
      scroller: { ...box(scroller), scrollTop: scroller.scrollTop, scrollHeight: scroller.scrollHeight, clientHeight: scroller.clientHeight },
      overlays,
      viewport: document.documentElement.clientWidth,
    }
  })
}

/** C52: title and step/progress pinned together, one divider, the content below it. */
function expectPinnedHead(reading: HeadReading, step: number, label: string, frameWidth?: number) {
  expect(reading.title, `${label}: the title is in the head`).toBe(TITLE)
  expect(reading.progress, `${label}: the step label and progress are in the head, named and shown`).toEqual({
    name: `Step ${step} of 5`, now: String(step), max: '5', hidden: false, label: `Step ${step} of 5`,
  })
  expect(reading.progressBox.top, `${label}: the progress sits under the title`).toBeGreaterThanOrEqual(reading.titleBox.bottom - 0.5)
  expect(reading.rules, `${label}: one divider — the head's — and no second rule`).toEqual(['head'])
  expect(reading.rule.width, `${label}: the divider is drawn`).toBeGreaterThan(0)
  expect(reading.progressBox.bottom, `${label}: the divider is below the progress`).toBeLessThanOrEqual(reading.rule.bottom - reading.rule.width + 0.5)
  if (frameWidth !== undefined) {
    expect(reading.rule.right - reading.rule.left, `${label}: the divider spans the frame`).toBeCloseTo(frameWidth, 0)
  }
  expect(Math.abs(reading.scroller.top - reading.headBottom), `${label}: the content starts at the divider`).toBeLessThanOrEqual(0.5)
  expect(reading.overlays, `${label}: no sticky overlay in the content`).toBe(0)
}

/** The head did not move while the content scrolled. */
function expectStill(before: HeadReading, after: HeadReading, label: string) {
  for (const key of ['titleBox', 'progressBox'] as const) {
    expect(Math.abs(before[key].top - after[key].top), `${label}: ${key} stayed pinned`).toBeLessThanOrEqual(0.5)
  }
  expect(Math.abs(before.headBottom - after.headBottom), `${label}: the divider stayed put`).toBeLessThanOrEqual(0.5)
}

/** A control inside the scroller is wholly in its visible box: below the divider, above the foot. */
async function withinScroller(control: Locator, scroller: Locator) {
  const [c, s] = await Promise.all([control.boundingBox(), scroller.boundingBox()])
  expect(c).not.toBeNull()
  expect(s).not.toBeNull()
  return c!.y >= s!.y - 0.5 && c!.y + c!.height <= s!.y + s!.height + 0.5
}

const scrollerOf = (page: Page) => page.getByRole('region', { name: `${TITLE} content` })
const equipment = (scope: Page | Locator, name: string) =>
  scope.getByRole('group', { name: 'Equipment' }).getByRole('checkbox', { name, exact: true })

async function scrollToEnd(scroller: Locator) {
  await scroller.evaluate((element) => {
    element.scrollTop = element.scrollHeight
    element.dispatchEvent(new Event('scroll'))
  })
}

// ─────────────────────────────────────────────────────────────────────────────

test.describe('TASK-025 Pinned Setup title, step and progress', () => {
  for (const { name, viewport } of VIEWPORTS) {
    test(`JOURNEY-025 ${name}: Set up CLEAR, the step label and progress stay pinned above one divider while the equipment scrolls and the step controls move on and back`, async ({ page, visit, checkA11y }) => {
      test.setTimeout(120_000)
      await page.setViewportSize(viewport)
      const app = await syntheticApp(page)
      await openSetup(page, visit)
      const main = page.locator('main')
      const scroller = scrollerOf(page)

      // The equipment step with more content than the viewport holds.
      await main.getByRole('radio', { name: /^Home gym/ }).tap()
      await expect(equipment(main, 'Dumbbells')).toBeChecked()
      await settle(page)
      const top = await readHead(main)
      expectPinnedHead(top, 1, `top @${name}`, viewport.width)
      expect(top.scroller.scrollHeight, 'the equipment step overflows the phone').toBeGreaterThan(top.scroller.clientHeight)
      await noHorizontalOverflow(page)
      await attach(page, `setup-equipment-top-${name}`)

      // Scroll the equipment: the content moves under the divider, the head stays.
      await scrollToEnd(scroller)
      await settle(page)
      const end = await readHead(main)
      expect(end.scroller.scrollTop, 'the content scrolled').toBeGreaterThan(0)
      expectPinnedHead(end, 1, `scrolled @${name}`, viewport.width)
      expectStill(top, end, `scrolled @${name}`)
      const first = await equipment(main, 'Bodyweight').boundingBox()
      expect(first === null || first.y + first.height <= end.headBottom + 0.5 || first.y >= end.scroller.top - 0.5,
        'scrolled-past equipment is clipped at the divider, never drawn over the head').toBe(true)

      // Touch the last equipment choice: it is in view below the divider and answers.
      const last = equipment(main, 'Hack squat')
      await last.tap()
      await expect(last).toBeChecked()
      expect(await withinScroller(last, scroller), 'the tapped choice is below the divider and above the footer').toBe(true)
      await attach(page, `setup-equipment-scrolled-${name}`)
      await checkA11y()

      // The step controls: Next moves the pinned step on in place; Back keeps the draft.
      await page.getByRole('button', { name: 'Next', exact: true }).tap()
      await expect(page.getByRole('heading', { level: 2, name: STEP_2 })).toBeVisible()
      await settle(page)
      const second = await readHead(main)
      expectPinnedHead(second, 2, `step 2 @${name}`, viewport.width)
      expect(Math.abs(second.progressBox.top - top.progressBox.top), 'the step label and progress keep their place').toBeLessThanOrEqual(0.5)
      await page.getByRole('button', { name: 'Back', exact: true }).tap()
      await expect(page.getByRole('heading', { level: 2, name: STEP_1 })).toBeVisible()
      expectPinnedHead(await readHead(main), 1, `back @${name}`, viewport.width)
      await expect(main.getByRole('radio', { name: /^Home gym/ })).toBeChecked()
      await expect(equipment(main, 'Hack squat')).toBeChecked()
      app.assertContained()
    })
  }

  test('JOURNEY-025 keyboard, reduced motion and reopen phone-320: every equipment choice takes focus in view below the pinned head, Space answers, and a reopen pins the head again', async ({ page, visit, checkA11y }) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width: 320, height: 568 })
    const app = await syntheticApp(page, { reducedMotion: true })
    await openSetup(page, visit)
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)
    const main = page.locator('main')
    const scroller = scrollerOf(page)

    // Keyboard: choose a setup from the radio group.
    const home = main.getByRole('radio', { name: /^Home gym/ })
    await home.focus()
    await page.keyboard.press('Space')
    await expect(home).toBeChecked()
    const top = await readHead(main)
    expectPinnedHead(top, 1, 'keyboard top', 320)

    // Tab through every equipment choice: each focused one is wholly in view,
    // below the divider and above the pinned footer — never under the head.
    const visited: string[] = []
    for (let press = 0; press < 40 && visited.length < EQUIPMENT_NAMES.length; press += 1) {
      await page.keyboard.press('Tab')
      const focused = await page.evaluate(() => {
        const active = document.activeElement as HTMLInputElement | null
        if (active?.type !== 'checkbox') return null
        return active.labels?.[0]?.textContent?.trim() ?? active.getAttribute('aria-label')
      })
      if (focused === null) continue
      visited.push(focused)
      expect(await withinScroller(page.locator(':focus'), scroller), `${focused} is focused in view below the pinned head`).toBe(true)
      expectStill(top, await readHead(main), `focus on ${focused}`)
    }
    expect(visited).toEqual(EQUIPMENT_NAMES)
    expect((await readHead(main)).scroller.scrollTop, 'focus scrolled the content, not the head').toBeGreaterThan(0)

    // Space answers the focused choice; Tab leaves the content for the step control.
    await page.keyboard.press('Space')
    await expect(equipment(main, 'Hack squat')).toBeChecked()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeFocused()
    await attach(page, 'setup-keyboard-phone-320')
    await checkA11y()

    // Reopen: the setup starts again at step 1, with the same pinned head.
    await page.reload()
    await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(TITLE)
    await settle(page)
    expectPinnedHead(await readHead(main), 1, 'reopened', 320)
    app.assertContained()
  })

  test('JOURNEY-025 recovery phone-320: a failed setup commit is said, keeps every answer and the pinned head, and a retry sends the same draft', async ({ page, visit, checkA11y }) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width: 320, height: 568 })
    const app = await syntheticApp(page)
    await openSetup(page, visit)
    const main = page.locator('main')
    const next = page.getByRole('button', { name: /^(Next|Skip)$/ })

    await main.getByRole('radio', { name: /^Home gym/ }).tap()
    await equipment(main, 'Barbell').tap()
    await next.tap()
    await main.getByRole('radio', { name: /^Some experience/ }).tap()
    await next.tap()
    await main.getByRole('radio', { name: /^Balanced/ }).tap()
    await next.tap()
    await next.tap()
    await expect(page.getByRole('heading', { level: 2, name: CONFIRM })).toBeVisible()
    await settle(page)
    expectPinnedHead(await readHead(main), 5, 'confirm', 320)

    await page.getByRole('button', { name: 'Finish setup', exact: true }).tap()
    await expect.poll(() => app.commits().length, { timeout: 10_000 }).toBe(1)
    await expect(main.getByText(COMMIT_FAILED)).toBeVisible({ timeout: 15_000 })
    const retry = page.getByRole('button', { name: 'Try again', exact: true })
    await expect(retry).toBeVisible()
    await settle(page)
    // The failure keeps its meaning and the head keeps its place.
    expectPinnedHead(await readHead(main), 5, 'after a failed commit', 320)
    const card = main.locator('.clr-card')
    await expect(card).toContainText('Home gym')
    await expect(card).toContainText('Barbell')
    await expect(card).toContainText('Balanced')
    await attach(page, 'setup-commit-failed-phone-320')
    await checkA11y()

    // Retry sends the same draft; still refused, still nothing discarded.
    await retry.tap()
    await expect.poll(() => app.commits().length, { timeout: 10_000 }).toBe(2)
    expect(app.commits()[1]).toEqual(app.commits()[0])
    await expect(main.getByText(COMMIT_FAILED)).toBeVisible({ timeout: 15_000 })
    await expect(card).toContainText('Barbell')
    expectPinnedHead(await readHead(main), 5, 'after a retry', 320)
    app.assertContained({ commits: 2 })
  })

  test('gallery screens phone-320: the accepted state draws Setup’s own pinned title, step and progress over one divider, the equipment scrolling beneath, with nothing read or written', async ({ page, visit }) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width: 320, height: 568 })
    await installDeterministicCapture(page, { skin: 'clear', reducedMotion: true })
    const requests: string[] = []
    page.on('request', (request) => {
      if (/\/(rest|auth|functions)\/v1\//.test(request.url())) requests.push(`${request.method()} ${request.url()}`)
    })
    await visit('/gallery/refinements?state=screens')
    const state = page.locator('[data-refinement-state="screens"]')
    const setup = state.locator('[data-gallery-setup]')
    await setup.scrollIntoViewIfNeeded()
    await expect(setup.getByRole('heading', { name: TITLE, exact: true })).toBeVisible()
    await expect(setup.getByRole('heading', { name: STEP_1, exact: true })).toBeAttached()
    await settle(page)

    const frameWidth = (await setup.boundingBox())!.width
    const top = await readHead(setup)
    expectPinnedHead(top, 1, 'gallery top', frameWidth)
    expect(top.scroller.scrollHeight, 'the equipment overflows the frame').toBeGreaterThan(top.scroller.clientHeight)
    await attach(setup, 'gallery-setup-top-phone-320')

    const scroller = setup.getByRole('region', { name: `${TITLE} content` })
    await scrollToEnd(scroller)
    await settle(page)
    const end = await readHead(setup)
    expect(end.scroller.scrollTop).toBeGreaterThan(0)
    expectStill(top, end, 'gallery scrolled')
    const last = equipment(setup, 'Hack squat')
    await last.tap()
    await expect(last).toBeChecked()
    expect(await withinScroller(last, scroller)).toBe(true)
    await attach(setup, 'gallery-setup-scrolled-phone-320')
    await noHorizontalOverflow(page)
    await expect(page).toHaveURL(/\/gallery\/refinements\?state=screens$/)
    expect(requests, 'the gallery reads and writes nothing over the network').toEqual([])
  })
})
