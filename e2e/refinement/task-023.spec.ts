import { spawn } from 'node:child_process'
import { createServer, type AddressInfo } from 'node:net'
import { resolve } from 'node:path'
import type { Locator, Page, Route } from '@playwright/test'

import { readE2eEnv } from '../../scripts/e2e/env.mjs'
import { PREPARATION_NAMES, preparationAcceptance } from '../../src/dev/gallery-refinement-preparation-data'
import { reviewHandoff } from '../../src/state/review-handoff'
import { sessionSnapshotSchema, type SessionAcceptance, type SessionSnapshot } from '../../src/state/schemas'
import { peerGroupingSnapshot } from '../../src/test/peer-grouping-fixture'
import { fixtureLocation, onboardedProfile } from '../../src/test/user-data-double'
import { installDeterministicCapture } from '../design-0143/fixtures'
import { expect, test as scanned } from '../fixtures'

/**
 * TASK-023 (REQ-023; C50, G15; R05; AC-C50-01; JOURNEY-023) — on the real
 * `/review` route, Regenerate follows all workout content, including the
 * Cooldown, with its behaviour and navigation unchanged. Accepted gallery
 * reference eded158cfd928d382c9a9409e2c372270312741d,
 * `/gallery/refinements?state=preparation`, which draws Review's own
 * `ReviewRegenerateAction` after its Cooldown.
 *
 * Entry: a generated workout with a Warm-up, a worked section and a Cooldown
 * reaches `/review` through the existing hand-off, behind the existing auth
 * guard. Action: read through the whole workout, then choose Regenerate.
 * Result, read from the browser at phone widths: Regenerate is the last item
 * of the scrolling content, below the Cooldown's last movement, with nothing
 * readable after it and Start still pinned in the footer; it asks first,
 * "Keep it" keeps the workout, and confirming runs the existing regeneration
 * (the route's generation run, with its Cancel landing on "Nothing to
 * review"). Recovery: a failed Start keeps the workout with Regenerate still
 * last; a reload keeps the order; with nothing to review there is no
 * Regenerate; keyboard, touch and reduced motion reach all of it.
 *
 * Synthetic and contained: an intercepted session for a fictional user and
 * synthetic reads only. The generation request is held here and never
 * forwarded, so no model is called; Start's session calls are answered here
 * (or refused) and never forwarded. No real account or row exists to mutate.
 */
const OWNER = '00000000-0000-4000-8000-000000002301'
const PLACE = '00000000-0000-4000-8000-000000002311'
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
    if (code !== null) throw new Error(`Synthetic TASK-023 server exited (${code}) before ${origin} was ready`)
    try {
      if ((await fetch(origin)).ok && (await fetch(own)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((settle) => setTimeout(settle, 250))
  }
  throw new Error(`Synthetic TASK-023 origin ${origin} did not start`)
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
          VITE_SUPABASE_URL: 'https://synthetic-task-023.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-task-023-public-placeholder',
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
/** The approved mobile scope: the narrow phone and the project's own phone. */
const VIEWPORTS: ReadonlyArray<{ name: string; viewport: Viewport }> = [
  { name: 'phone-320', viewport: { width: 320, height: 568 } },
  { name: 'phone-390', viewport: { width: 390, height: 844 } },
]

const REGENERATE = 'Regenerate'
const START = 'Start workout'
const DISCARD_DIALOG = 'Discard this workout?'
const NO_HANDOFF_FLAG = 'synthetic-task-023-no-handoff'

// ─────────────────────────────────────────────────────────────────────────────
// The synthetic app
// ─────────────────────────────────────────────────────────────────────────────

interface AppOptions {
  readonly reducedMotion?: boolean
  /** Start's first write is refused, so the failure and its recovery are exercised. */
  readonly failFirstStart?: boolean
}

async function syntheticApp(page: Page, acceptance: SessionAcceptance, options: AppOptions = {}) {
  const startedAt = new Date(Date.now() - 60_000).toISOString()
  const prescribed: SessionSnapshot = sessionSnapshotSchema.parse(peerGroupingSnapshot(acceptance, { userId: OWNER }))
  const running: SessionSnapshot = sessionSnapshotSchema.parse(
    peerGroupingSnapshot(acceptance, { userId: OWNER, startedAt }),
  )
  const writes: string[] = []
  const unexpected: string[] = []
  let generations = 0
  let releaseGeneration: () => void = () => undefined
  const generationHeld = new Promise<void>((settle) => { releaseGeneration = settle })
  let failStart = options.failFirstStart === true
  let started = false
  const guard = await installDeterministicCapture(page, { skin: 'clear', reducedMotion: options.reducedMotion ?? true })

  const handler = async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    const name = url.pathname.split('/').at(-1) ?? ''
    const reply = (body: unknown, status = 200) =>
      route.fulfill({ status, headers: CORS, json: body }).catch(() => undefined)
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (url.pathname.startsWith('/functions/v1/')) {
      // Regenerate's existing run: held here, never forwarded, then abandoned.
      if (request.method() === 'POST' && name === 'generate-workout') {
        generations += 1
        await generationHeld
        return route.abort('blockedbyclient').catch(() => undefined)
      }
      unexpected.push(`${request.method()} ${url.pathname}`)
      return route.abort('blockedbyclient')
    }
    if (request.method() === 'GET') {
      if (name === 'profiles') return reply([onboardedProfile({ id: OWNER, goal_preset: 'balanced' })])
      if (name === 'locations') return reply([fixtureLocation({ id: PLACE, user_id: OWNER, tier: 'full', is_default: true })])
      // Every other read is an empty answer: no history, anchors, catalog or favorites.
      return reply([])
    }
    if (request.method() === 'POST' && url.pathname.includes('/rpc/')) {
      if (name === 'resume_session') return reply(started ? running : null)
      if (name === 'session_snapshot') return reply(started ? running : prescribed)
      if (name === 'session_as_performed') return reply(null)
      if (name === 'persist_session') {
        writes.push(name)
        if (failStart) {
          failStart = false
          return reply({ code: 'PGRST000', message: 'Synthetic write refusal.' }, 503)
        }
        return reply(prescribed)
      }
      if (name === 'start_session') {
        writes.push(name)
        started = true
        return reply({ outcome: 'started', state: 'active', session: running.session })
      }
      if (['streak_sessions', 'constraints_in_force', 'anchor_evidence', 'conditioning_history',
        'generation_refusal_diagnostics', 'generation_candidate_sets_for_goal', 'generation_candidate_sets'].includes(name)) return reply([])
    }
    unexpected.push(`${request.method()} ${url.pathname}`)
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic TASK-023 request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ owner, handoff, flag }) => {
    localStorage.setItem('clear.auth.session', JSON.stringify({
      accessToken: 'synthetic-task-023-session', refreshToken: 'synthetic-task-023-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-task-023@example.invalid' },
    }))
    if (location.pathname === '/review') {
      const absent = sessionStorage.getItem(flag) === '1'
      history.replaceState({ usr: absent ? null : handoff, key: 'synthetic-task-023', idx: 0 }, '', location.href)
    }
  }, { owner: OWNER, handoff: reviewHandoff(acceptance), flag: NO_HANDOFF_FLAG })

  return {
    generations: () => generations,
    releaseGeneration: () => releaseGeneration(),
    assertContained(expected: { writes?: readonly string[]; generations?: number } = {}) {
      expect(unexpected, 'Every API request has an explicit synthetic disposition').toEqual([])
      expect(writes, 'Only the expected session calls are attempted; nothing else is written').toEqual([...(expected.writes ?? [])])
      expect(generations, 'Generation runs only through a confirmed Regenerate').toBe(expected.generations ?? 0)
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
  // A screen entering is read once its finite transitions have finished.
  await page.waitForFunction(() => {
    const main = document.querySelector('main')
    return main !== null && main.getAnimations({ subtree: true })
      .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
      .every((animation) => animation.playState !== 'running')
  })
}

async function openReview(page: Page, visit: (path: string) => Promise<void>, acceptance: SessionAcceptance) {
  await visit('/review')
  await expect(page).toHaveURL(/\/review$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(acceptance.workout.title)
  await settle(page)
}

/**
 * Delivered-revision visual evidence: the scrolling content, attached to the
 * case — read in a taller viewport at the same width so the whole list fits.
 */
async function attachCapture(page: Page, name: string) {
  const viewport = page.viewportSize()!
  await page.setViewportSize({ width: viewport.width, height: 2400 })
  try {
    await page.evaluate(() => document.querySelectorAll('.clr-scroll-region__scroller').forEach((scroller) => scroller.scrollTo(0, 0)))
    await settle(page)
    const scroller = page.locator('main .clr-scroll-region__scroller').first()
    const body = await scroller.screenshot({ caret: 'hide' }).catch(() => page.screenshot({ caret: 'hide' }))
    await test.info().attach(`${name}.png`, { body, contentType: 'image/png' })
  } finally {
    await page.setViewportSize(viewport)
    await settle(page)
  }
}

/** The phone screen as the athlete sees it at the end of the list. */
async function attachScreen(page: Page, name: string) {
  await settle(page)
  await test.info().attach(`${name}.png`, { body: await page.screenshot({ caret: 'hide' }), contentType: 'image/png' })
}

async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
}

// ─────────────────────────────────────────────────────────────────────────────
// Reading the order
// ─────────────────────────────────────────────────────────────────────────────

interface Placement {
  /** The section types in the order the list draws them. */
  sections: string[]
  /** Regenerate's row is the content list's final item. */
  lastItem: boolean
  /** The last readable words of the scrolling content are Regenerate's. */
  lastWords: string
  /** Regenerate is the last button in the scrolling content. */
  lastButton: string
  /** Regenerate's top is below the bottom of every section, the Cooldown's last movement included. */
  belowEverySection: boolean
  belowCooldownLastMovement: boolean | null
  /** The pinned Start is outside the scrolling content. */
  startPinned: boolean
}

async function readPlacement(page: Page): Promise<Placement> {
  return page.evaluate(({ regenerateLabel, startLabel }) => {
    const scroller = document.querySelector<HTMLElement>('main .clr-scroll-region__scroller')!
    const buttons = [...scroller.querySelectorAll('button')].filter((button) => button.closest('dialog') === null)
    const regenerate = buttons.find((button) => button.textContent?.trim() === regenerateLabel)!
    const row = regenerate.closest<HTMLElement>('.clr-actions')!
    const walker = document.createTreeWalker(scroller, NodeFilter.SHOW_TEXT)
    let lastWords: Node | null = null
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      if (node.parentElement?.closest('dialog') !== null) continue
      if ((node.textContent ?? '').trim() !== '') lastWords = node
    }
    const top = regenerate.getBoundingClientRect().top
    const sections = [...scroller.querySelectorAll<HTMLElement>('[data-review-section]')]
    const cooldownNames = [...scroller.querySelectorAll<HTMLElement>('[data-preparation-guide="cooldown"] li')]
    const start = [...document.querySelectorAll('main button')].find((button) => button.textContent?.trim() === startLabel)
    return {
      sections: sections.map((section) => section.dataset.reviewSection ?? ''),
      lastItem: row.parentElement?.lastElementChild === row,
      lastWords: lastWords?.textContent?.trim() ?? '',
      lastButton: buttons.at(-1)?.textContent?.trim() ?? '',
      belowEverySection: sections.every((section) => section.getBoundingClientRect().bottom <= top + 0.5),
      belowCooldownLastMovement: cooldownNames.length === 0
        ? null
        : cooldownNames.at(-1)!.getBoundingClientRect().bottom <= top + 0.5,
      startPinned: start !== undefined && start.closest('.clr-scroll-region__foot') !== null && !scroller.contains(start),
    }
  }, { regenerateLabel: REGENERATE, startLabel: START })
}

function expectRegenerateLast(placement: Placement, acceptance: SessionAcceptance, label: string) {
  expect(placement.sections, `${label}: every section, in composed order`).toEqual(acceptance.workout.sections.map((section) => section.section_type))
  expect(placement.sections.at(-1), `${label}: the Cooldown is the last section`).toBe('cooldown')
  expect(placement.lastItem, `${label}: Regenerate is the list's last item`).toBe(true)
  expect(placement.lastWords, `${label}: nothing readable follows Regenerate`).toBe(REGENERATE)
  expect(placement.lastButton, `${label}: the last control in the scrolling content`).toBe(REGENERATE)
  expect(placement.belowEverySection, `${label}: below every section`).toBe(true)
  expect(placement.belowCooldownLastMovement, `${label}: below the Cooldown's last movement`).toBe(true)
  expect(placement.startPinned, `${label}: Start stays pinned in the footer`).toBe(true)
}

async function scrollToEnd(page: Page) {
  await page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>('main .clr-scroll-region__scroller')!
    scroller.scrollTo(0, scroller.scrollHeight)
  })
  await settle(page)
}

function regenerateOf(scope: Page | Locator): Locator {
  return scope.getByRole('button', { name: REGENERATE, exact: true })
}

// ─────────────────────────────────────────────────────────────────────────────

test.describe('TASK-023 Review Regenerate follows the entire workout', () => {
  for (const { name, viewport } of VIEWPORTS) {
    test(`JOURNEY-023 ${name}: Review reads the Warm-up, the work and the Cooldown, then Regenerate last; it asks first, Keep it keeps the workout, and confirming runs the existing regeneration`, async ({ page, visit, checkA11y }) => {
      test.setTimeout(120_000)
      await page.setViewportSize(viewport)
      const acceptance = preparationAcceptance({ locationId: PLACE })
      const app = await syntheticApp(page, acceptance)
      await openReview(page, visit, acceptance)

      // Read through the whole workout: the Cooldown and its last movement, then Regenerate.
      expectRegenerateLast(await readPlacement(page), acceptance, `review @${name}`)
      const cooldown = page.locator('[data-preparation-guide="cooldown"]')
      await expect(cooldown.getByRole('listitem')).toHaveText([...PREPARATION_NAMES.cooldown])
      await scrollToEnd(page)
      const regenerate = regenerateOf(page.locator('main'))
      await expect(regenerate).toBeInViewport()
      await expect(regenerate).toBeEnabled()
      await noHorizontalOverflow(page)
      await attachScreen(page, `review-end-${name}`)
      await attachCapture(page, `review-${name}`)

      // Unchanged behaviour: it asks first, and Keep it keeps this workout on /review.
      await regenerate.tap()
      const dialog = page.getByRole('dialog', { name: DISCARD_DIALOG })
      await expect(dialog).toBeVisible()
      await checkA11y()
      await dialog.getByRole('button', { name: 'Keep it', exact: true }).tap()
      await expect(dialog).toBeHidden()
      await expect(page).toHaveURL(/\/review$/)
      await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(acceptance.workout.title)
      expectRegenerateLast(await readPlacement(page), acceptance, `kept @${name}`)
      expect(app.generations()).toBe(0)

      // Confirming discards and runs the existing regeneration, watched from /review.
      await regenerate.tap()
      await dialog.getByRole('button', { name: 'Discard and regenerate', exact: true }).tap()
      await expect.poll(() => app.generations(), { timeout: 10_000 }).toBe(1)
      const cancel = page.locator('main').getByRole('button', { name: 'Cancel', exact: true })
      await expect(cancel).toBeVisible()
      await expect(page).toHaveURL(/\/review$/)
      await cancel.tap()
      // Cancel lands on the discard the confirm promised: nothing to review, never the old workout.
      await expect(page.getByRole('heading', { name: 'Nothing to review' }).first()).toBeVisible()
      await expect(page.getByRole('button', { name: 'Generate workout', exact: true })).toBeVisible()
      await expect(regenerateOf(page)).toHaveCount(0)
      await expect(page.getByRole('button', { name: START, exact: true })).toHaveCount(0)
      app.releaseGeneration()
      app.assertContained({ generations: 1 })
    })
  }

  test('JOURNEY-023 keyboard, reduced motion and reopen phone-390: Regenerate is the next stop after the Cooldown, Escape keeps the workout, and a reload keeps the same order', async ({ page, visit, checkA11y }) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width: 390, height: 844 })
    const acceptance = preparationAcceptance({ locationId: PLACE })
    const app = await syntheticApp(page, acceptance, { reducedMotion: true })
    await openReview(page, visit, acceptance)
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)

    // Keyboard: from the last control of the work, Tab passes the guide-only Cooldown
    // to Regenerate, then leaves the list for the pinned Start.
    const main = page.locator('main')
    await main.getByRole('button', { name: 'Swap bench press' }).focus()
    await page.keyboard.press('Tab')
    await expect(regenerateOf(main)).toBeFocused()
    await expect(regenerateOf(main)).toBeInViewport()
    await page.keyboard.press('Tab')
    await expect(main.getByRole('button', { name: START, exact: true })).toBeFocused()

    // Enter asks; Escape is the safe exit and keeps the workout.
    await regenerateOf(main).focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: DISCARD_DIALOG })
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(page).toHaveURL(/\/review$/)
    expectRegenerateLast(await readPlacement(page), acceptance, 'after Escape')
    await checkA11y()

    // Reopen: the same workout, in the same order, with Regenerate still last.
    await page.reload()
    await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(acceptance.workout.title)
    await settle(page)
    expectRegenerateLast(await readPlacement(page), acceptance, 'reopened')
    app.assertContained()
  })

  test('JOURNEY-023 recovery phone-390: a failed Start keeps the workout with Regenerate still last and enabled, and with nothing to review there is no Regenerate', async ({ page, visit, checkA11y }) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width: 390, height: 844 })
    const acceptance = preparationAcceptance({ locationId: PLACE })
    const app = await syntheticApp(page, acceptance, { failFirstStart: true })
    await openReview(page, visit, acceptance)

    // A refused Start is the route's blocking failure; the workout is still in front of the user.
    await page.getByRole('button', { name: START, exact: true }).tap()
    const failed = page.getByRole('dialog', { name: 'Couldn’t start this workout' })
    await expect(failed).toBeVisible()
    await failed.getByRole('button', { name: 'Close', exact: true }).tap()
    await expect(failed).toBeHidden()
    await expect(page).toHaveURL(/\/review$/)
    expectRegenerateLast(await readPlacement(page), acceptance, 'after a failed Start')
    await expect(regenerateOf(page.locator('main'))).toBeEnabled()
    await checkA11y()

    // Absent content keeps its meaning: nothing to review, and so nothing to regenerate.
    await page.evaluate((flag) => sessionStorage.setItem(flag, '1'), NO_HANDOFF_FLAG)
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Nothing to review' }).first()).toBeVisible()
    await expect(regenerateOf(page)).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Generate workout', exact: true })).toBeVisible()
    await settle(page)
    await checkA11y()
    app.assertContained({ writes: ['persist_session'] })
  })

  test('gallery preparation phone-320: the accepted state draws Review’s own Regenerate after the Cooldown, which only asks, with nothing read or written', async ({ page, visit }) => {
    await page.setViewportSize({ width: 320, height: 568 })
    await installDeterministicCapture(page, { skin: 'clear', reducedMotion: true })
    const requests: string[] = []
    page.on('request', (request) => {
      if (/\/(rest|auth|functions)\/v1\//.test(request.url())) requests.push(`${request.method()} ${request.url()}`)
    })
    await visit('/gallery/refinements?state=preparation')
    const state = page.locator('[data-refinement-state="preparation"]')
    const review = state.locator('[data-gallery-context="review"]')
    const regenerate = regenerateOf(review)
    await expect(regenerate).toBeVisible()
    const order = await review.evaluate((node, label) => {
      const items = [...node.children] as HTMLElement[]
      const last = items.at(-1)!
      const cooldown = node.querySelector('[data-preparation-guide="cooldown"]')!
      const names = [...cooldown.querySelectorAll('li')]
      const button = [...node.querySelectorAll('button')].at(-1)!
      return {
        lastIsRegenerate: last.querySelector('button')?.textContent?.trim() === label,
        lastButton: button.textContent?.trim(),
        belowCooldown: names.at(-1)!.getBoundingClientRect().bottom <= button.getBoundingClientRect().top + 0.5,
      }
    }, REGENERATE)
    expect(order).toEqual({ lastIsRegenerate: true, lastButton: REGENERATE, belowCooldown: true })
    await expect(review.locator('[data-preparation-guide="cooldown"] li')).toHaveText([...PREPARATION_NAMES.cooldown])
    await noHorizontalOverflow(page)
    await test.info().attach('gallery-review-phone-320.png', { body: await state.screenshot({ caret: 'hide' }), contentType: 'image/png' })

    // It asks with Review's own confirmation; the gallery then discards nothing and goes nowhere.
    await regenerate.tap()
    const dialog = page.getByRole('dialog', { name: DISCARD_DIALOG })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Discard and regenerate', exact: true }).tap()
    await expect(dialog).toBeHidden()
    await expect(page).toHaveURL(/\/gallery\/refinements\?state=preparation$/)
    await expect(review.locator('[data-preparation-guide="cooldown"]')).toBeVisible()
    await expect(regenerate).toBeVisible()
    expect(requests, 'the gallery reads and writes nothing over the network').toEqual([])
  })
})
