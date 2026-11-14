import { spawn } from 'node:child_process'
import { createServer, type AddressInfo } from 'node:net'
import { resolve } from 'node:path'
import type { Locator, Page, Route } from '@playwright/test'

import { readE2eEnv } from '../../scripts/e2e/env.mjs'
import type { WorkoutSessionRow } from '../../src/state/schemas'
import { makeSessionRow } from '../../src/test/factories'
import { fixtureLocation, onboardedProfile } from '../../src/test/user-data-double'
import { installDeterministicCapture } from '../design-0143/fixtures'
import { expect, test as scanned } from '../fixtures'

/**
 * TASK-024 (REQ-024; C51, G16; R06, R10, R11, R21, R23, R25; V01/V02;
 * AC-C51-01, AC-R024-01…08; JOURNEY-024; reconciling UAT #286) — on the real
 * `/generate` route, Generate's accepted hierarchy, focus interaction and
 * copy. Accepted gallery reference eded158cfd928d382c9a9409e2c372270312741d,
 * `/gallery/refinements?state=screens`, which draws the route's own
 * `GenerateBack`, `GenerateIntent` and `GenerateContextFields`.
 *
 * Entry (ENTRY-024): a returning athlete whose history recommends a Focus, or
 * a first workout with nothing completed, reaches `/generate` behind the
 * existing auth guard. Action: read Goal and Focus, open the Focus choices,
 * optionally turn on Recovery, and generate. Result, read from the browser at
 * phone widths: Goal and Focus lead the card in the larger summary type; the
 * Focus value is the disclosure (its name and expanded state) for the four
 * focuses, with the one-workout Recovery toggle apart from them; no paired or
 * detached Change focus; Generate title; the framed icon-only Back named Home;
 * MINUTES whole in its unit slot; no Place or Notes helper line; a first
 * workout is a normal session. Recovery: a failed generation is said and
 * keeps the draft; keyboard, touch, reduced motion and a reload reach all of
 * it. (A failed history read cannot be reached in a fresh browser — the boot
 * check reads the same history first — so its Retry and hand-chosen Focus are
 * proved in `src/app/Generate.test.tsx`, REQ-006.)
 *
 * Synthetic and contained: an intercepted session for a fictional user and
 * synthetic reads only. The generation request is answered here — held, or
 * refused — and never forwarded, so no model is called; nothing is written.
 */
const OWNER = '00000000-0000-4000-8000-000000002401'
const PLACE = '00000000-0000-4000-8000-000000002411'
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
    if (code !== null) throw new Error(`Synthetic TASK-024 server exited (${code}) before ${origin} was ready`)
    try {
      if ((await fetch(origin)).ok && (await fetch(own)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((settle) => setTimeout(settle, 250))
  }
  throw new Error(`Synthetic TASK-024 origin ${origin} did not start`)
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
          VITE_SUPABASE_URL: 'https://synthetic-task-024.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-task-024-public-placeholder',
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

const ANCHORS = ['Upper body', 'Lower body', 'Full body', 'Power']
const FOCUS_GROUP = 'Focus for this workout'
const RECOVERY = 'Recovery session'
const GENERATE = 'Generate workout'
const REMOVED_HELPERS = ['Uses this place’s equipment.', 'Optional, today only. Ongoing limits go in Settings.']
const NOTES_PLACEHOLDER = 'Tight hamstrings today.'

function daysAgo(days: number) {
  const now = new Date()
  now.setUTCDate(now.getUTCDate() - days)
  return now.toISOString().slice(0, 10)
}

/** Completed upper-body history: the recommendation is a lower-body Focus. */
function completed(index: number, daysBack: number): WorkoutSessionRow {
  const date = daysAgo(daysBack)
  return makeSessionRow({
    id: `00000000-0000-4000-8000-00000000240${index}`,
    user_id: OWNER, location_id: PLACE, date,
    created_at: `${date}T09:00:00.000Z`, updated_at: `${date}T09:31:00.000Z`,
    started_at: `${date}T09:00:00.000Z`, completed_at: `${date}T09:31:00.000Z`,
    title: 'Synthetic upper-body strength session', session_focus: 'upper_body',
    goal_preset: 'balanced', requested_duration_mins: 45,
    actual_duration_mins: 31, requested_intensity: 8, effective_intensity: 8,
  })
}
const RETURNING = [completed(1, 1), completed(2, 3)]

// ─────────────────────────────────────────────────────────────────────────────
// The synthetic app
// ─────────────────────────────────────────────────────────────────────────────

interface AppOptions {
  /** The athlete's completed history. */
  readonly history: readonly WorkoutSessionRow[]
  readonly reducedMotion?: boolean
  /** The generation request is refused at once rather than held. */
  readonly failGeneration?: boolean
}

/** The reads the routes on this journey make, answered here; no others are expected. */
const READ_RPCS = new Set([
  'resume_session', 'streak_sessions', 'constraints_in_force', 'anchor_evidence', 'conditioning_history',
])

async function syntheticApp(page: Page, options: AppOptions) {
  const unexpected: string[] = []
  const writes: string[] = []
  const generations: Array<Record<string, unknown>> = []
  let releaseGeneration: () => void = () => undefined
  const generationHeld = new Promise<void>((settle) => { releaseGeneration = settle })
  const guard = await installDeterministicCapture(page, { skin: 'clear', reducedMotion: options.reducedMotion ?? true })

  const handler = async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    const name = url.pathname.split('/').at(-1) ?? ''
    const reply = (body: unknown, status = 200) =>
      route.fulfill({ status, headers: CORS, json: body }).catch(() => undefined)
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (url.pathname.startsWith('/functions/v1/')) {
      if (request.method() === 'POST' && name === 'generate-workout') {
        generations.push(request.postDataJSON() as Record<string, unknown>)
        if (options.failGeneration) {
          return reply({ error: { code: 'GENERATION_FAILED', message: 'Synthetic generation refusal.' } }, 503)
        }
        // Held here, never forwarded, then abandoned.
        await generationHeld
        return route.abort('blockedbyclient').catch(() => undefined)
      }
      unexpected.push(`${request.method()} ${url.pathname}`)
      return route.abort('blockedbyclient')
    }
    if (request.method() === 'GET') {
      if (name === 'profiles') return reply([onboardedProfile({ id: OWNER, goal_preset: 'balanced' })])
      if (name === 'locations') {
        return reply([fixtureLocation({ id: PLACE, user_id: OWNER, tier: 'full', name: 'Building gym', is_default: true })])
      }
      if (name === 'workout_sessions') return reply(options.history)
      // Every other read is an empty answer: no anchors, catalog or favorites.
      return reply([])
    }
    if (request.method() === 'POST' && url.pathname.includes('/rpc/') && READ_RPCS.has(name)) {
      if (name === 'resume_session') return reply(null)
      if (name === 'streak_sessions') {
        return reply(options.history.map((row) => ({
          session_id: row.id, completed_at: row.completed_at, counts_for_streak: row.counts_for_streak,
        })))
      }
      return reply([])
    }
    writes.push(`${request.method()} ${url.pathname}`)
    unexpected.push(`${request.method()} ${url.pathname}`)
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic TASK-024 request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ owner }) => {
    localStorage.setItem('clear.auth.session', JSON.stringify({
      accessToken: 'synthetic-task-024-session', refreshToken: 'synthetic-task-024-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-task-024@example.invalid' },
    }))
  }, { owner: OWNER })

  return {
    generations: () => generations,
    releaseGeneration: () => releaseGeneration(),
    assertContained(expected: { generations?: number } = {}) {
      expect(unexpected, 'Every API request has an explicit synthetic disposition').toEqual([])
      expect(writes, 'Nothing is written').toEqual([])
      expect(generations.length, 'Generation runs only when Generate workout is pressed').toBe(expected.generations ?? 0)
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

async function openGenerate(page: Page, visit: (path: string) => Promise<void>, path = '/generate') {
  await visit(path)
  await expect(page).toHaveURL(/\/generate/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('Generate')
  await expect(page.getByLabel('Time available', { exact: true })).toBeVisible()
  await settle(page)
}

async function attachScreen(page: Page, name: string) {
  await settle(page)
  await test.info().attach(`${name}.png`, { body: await page.screenshot({ caret: 'hide' }), contentType: 'image/png' })
}

async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
}

const focusControl = (scope: Page | Locator) => scope.getByRole('button', { name: /^Focus:/ })
const recoveryChip = (scope: Page | Locator) => scope.getByRole('button', { name: RECOVERY, exact: true })
const generateButton = (page: Page) => page.getByRole('button', { name: GENERATE, exact: true })

// ─────────────────────────────────────────────────────────────────────────────
// Reading the screen
// ─────────────────────────────────────────────────────────────────────────────

interface Reading {
  /** The h1's text and its rendered line count. */
  title: string
  titleLines: number
  /** The header's Back: its name, visible text, frame and glyph. */
  back: { name: string | null; text: string; framed: boolean; glyph: boolean; quiet: boolean }
  /** Goal and Focus facts' computed font size, and the paragraph token's. */
  factSize: number
  paragraphSize: number
  /** Goal/Focus lead the card: the summary precedes every field. */
  summaryFirst: boolean
  /** No paired action group and no "Change focus" button anywhere. */
  pairedActions: number
  changeFocusButtons: number
  /** The MINUTES end cap: whole, and inside its field. */
  unit: { text: string; transform: string; whole: boolean; inside: boolean }
  /** No helper line under Place or Notes; the placeholder is kept. */
  helpers: string[]
  notesPlaceholder: string | null
}

async function readScreen(page: Page): Promise<Reading> {
  return page.evaluate(({ removed }) => {
    const main = document.querySelector('main')!
    const h1 = main.querySelector('h1')!
    const lineHeight = parseFloat(getComputedStyle(h1).lineHeight) || h1.getBoundingClientRect().height
    const back = main.querySelector<HTMLButtonElement>('header button[aria-label="Home"]')
    const card = main.querySelector<HTMLElement>('.clr-card')!
    const goal = card.querySelector<HTMLElement>('[data-intent-fact="goal"]')!
    const summary = goal.closest<HTMLElement>('.clr-intent-summary')!
    const fields = [...card.querySelectorAll<HTMLElement>('input, select, textarea, [role="slider"]')]
    const unit = card.querySelector<HTMLElement>('.clr-field__unit')!
    const field = unit.closest<HTMLElement>('.clr-field')!
    const unitBox = unit.getBoundingClientRect()
    const fieldBox = field.getBoundingClientRect()
    const root = getComputedStyle(document.documentElement)
    return {
      title: h1.textContent?.trim() ?? '',
      titleLines: Math.round(h1.getBoundingClientRect().height / lineHeight),
      back: {
        name: back?.getAttribute('aria-label') ?? null,
        text: back?.textContent?.trim() ?? '',
        framed: back !== null && back.classList.contains('clr-chamfer') && back.classList.contains('clr-btn'),
        glyph: back?.querySelector('svg') !== null,
        quiet: back?.classList.contains('clr-btn--quiet') ?? false,
      },
      factSize: parseFloat(getComputedStyle(goal).fontSize),
      paragraphSize: parseFloat(root.getPropertyValue('--paragraph-md-size')),
      summaryFirst: fields.every((control) =>
        (summary.compareDocumentPosition(control) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0),
      pairedActions: main.querySelectorAll('.clr-action-group--paired-labels').length,
      changeFocusButtons: [...main.querySelectorAll('button')].filter((button) => /change focus/i.test(button.textContent ?? '')).length,
      unit: {
        text: unit.textContent ?? '',
        transform: getComputedStyle(unit).textTransform,
        whole: unit.scrollWidth <= unit.clientWidth + 0.5,
        inside: unitBox.right <= fieldBox.right + 0.5 && unitBox.left >= fieldBox.left - 0.5,
      },
      helpers: removed.filter((helper) => main.textContent?.includes(helper)),
      notesPlaceholder: card.querySelector('textarea')?.getAttribute('placeholder') ?? null,
    }
  }, { removed: REMOVED_HELPERS })
}

function expectAcceptedScreen(reading: Reading, label: string) {
  expect(reading.title, `${label}: the page title`).toBe('Generate')
  expect(reading.titleLines, `${label}: one title line`).toBe(1)
  expect(reading.back, `${label}: framed icon-only Back named Home`).toEqual({
    name: 'Home', text: '', framed: true, glyph: true, quiet: false,
  })
  expect(reading.factSize, `${label}: Goal/Focus larger than paragraph text`).toBeGreaterThan(reading.paragraphSize)
  expect(reading.summaryFirst, `${label}: Goal/Focus lead the card`).toBe(true)
  expect(reading.pairedActions, `${label}: no paired action row`).toBe(0)
  expect(reading.changeFocusButtons, `${label}: no detached Change focus`).toBe(0)
  expect(reading.unit, `${label}: MINUTES whole in its slot`).toEqual({
    text: 'minutes', transform: 'uppercase', whole: true, inside: true,
  })
  expect(reading.helpers, `${label}: no Place or Notes helper line`).toEqual([])
  expect(reading.notesPlaceholder, `${label}: the Notes placeholder is kept`).toBe(NOTES_PLACEHOLDER)
}

/** The Focus choices region the Focus control names, and its parts. */
async function readChoices(page: Page) {
  return page.evaluate(({ focusGroup, recovery }) => {
    const control = [...document.querySelectorAll<HTMLButtonElement>('main button')]
      .find((button) => button.textContent?.startsWith('Focus:'))!
    const region = document.getElementById(control.getAttribute('aria-controls') ?? '')
    const group = region?.querySelector(`[role="group"][aria-label="${focusGroup}"]`) ?? null
    const chip = [...(region?.querySelectorAll('button') ?? [])].find((button) => button.textContent?.trim() === recovery)
    return {
      expanded: control.getAttribute('aria-expanded'),
      focuses: [...(group?.querySelectorAll('button') ?? [])].map((button) => button.textContent?.trim()),
      recoveryInRegion: chip !== undefined,
      recoveryInFocusGroup: chip !== undefined && group !== null && group.contains(chip),
    }
  }, { focusGroup: FOCUS_GROUP, recovery: RECOVERY })
}

// ─────────────────────────────────────────────────────────────────────────────

test.describe('TASK-024 Generate hierarchy, focus interaction and exact copy', () => {
  for (const { name, viewport } of VIEWPORTS) {
    test(`JOURNEY-024 ${name}: a returning athlete reads Goal and Focus, opens the Focus choices, turns on Recovery inside them and generates`, async ({ page, visit, checkA11y }) => {
      test.setTimeout(120_000)
      await page.setViewportSize(viewport)
      const app = await syntheticApp(page, { history: RETURNING })
      await openGenerate(page, visit)

      // Read: the accepted hierarchy and copy, against V02 and ?state=screens.
      expectAcceptedScreen(await readScreen(page), `returning @${name}`)
      const main = page.locator('main')
      await expect(main.locator('[data-intent-fact="goal"]')).toHaveText('Goal: Balanced')
      const focus = focusControl(main)
      await expect(focus).toHaveAccessibleName('Focus: Lower body')
      await expect(focus).toHaveAttribute('aria-expanded', 'false')
      await expect(recoveryChip(main)).toHaveCount(0)
      await noHorizontalOverflow(page)
      await attachScreen(page, `generate-returning-${name}`)

      // Open the Focus choices by touch: four focuses, and Recovery apart from them.
      await focus.tap()
      await expect(focus).toHaveAttribute('aria-expanded', 'true')
      expect(await readChoices(page)).toEqual({
        expanded: 'true', focuses: ANCHORS, recoveryInRegion: true, recoveryInFocusGroup: false,
      })
      await checkA11y()

      // Recovery on: a session mode; the movement focus is unchanged.
      await recoveryChip(main).tap()
      await expect(recoveryChip(main)).toHaveAttribute('aria-pressed', 'true')
      await expect(main.getByRole('group', { name: FOCUS_GROUP }).getByRole('button', { name: /Lower body/ })).toHaveAttribute('aria-pressed', 'true')
      await expect(focus).toHaveAccessibleName('Focus: Lower body')
      await expect(page).toHaveURL(/\/generate\?recovery=1$/)
      await noHorizontalOverflow(page)
      await attachScreen(page, `generate-recovery-${name}`)

      // Generate: the existing run, held here; the request carries both answers.
      await generateButton(page).tap()
      await expect.poll(() => app.generations().length, { timeout: 10_000 }).toBe(1)
      expect(app.generations()[0]).toMatchObject({ goal: 'active_recovery', focus: 'lower_body', location_id: PLACE })
      const cancel = main.getByRole('button', { name: 'Cancel', exact: true })
      await expect(cancel).toBeVisible()
      await cancel.tap()
      // The draft comes back as it was left.
      await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('Generate')
      await expect(recoveryChip(main)).toHaveAttribute('aria-pressed', 'true')
      await expect(page).toHaveURL(/\/generate\?recovery=1$/)
      app.releaseGeneration()
      app.assertContained({ generations: 1 })
    })
  }

  test('JOURNEY-024 first workout phone-390: a normal session — the four Anchors are required, Recovery is offered unselected, and it generates the chosen Focus', async ({ page, visit, checkA11y }) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width: 390, height: 844 })
    const app = await syntheticApp(page, { history: [] })
    await openGenerate(page, visit)

    expectAcceptedScreen(await readScreen(page), 'first workout')
    const main = page.locator('main')
    const anchor = main.getByRole('group', { name: 'Anchor' })
    await expect(anchor.getByRole('button')).toHaveText(ANCHORS)
    for (const chip of await anchor.getByRole('button').all()) await expect(chip).toHaveAttribute('aria-pressed', 'false')
    await expect(focusControl(main)).toHaveCount(0)
    await expect(recoveryChip(main)).toHaveAttribute('aria-pressed', 'false')
    await expect(recoveryChip(main)).toBeEnabled()
    expect(await anchor.evaluate((group) => group.contains(document.querySelector('[data-generate-recovery] button')))).toBe(false)
    await expect(main).not.toContainText(/recommended|suggested/i)
    await expect(generateButton(page)).toBeDisabled()
    await expect(page).toHaveURL(/\/generate$/)
    await attachScreen(page, 'generate-first-phone-390')
    await checkA11y()

    await anchor.getByRole('button', { name: /Full body/ }).tap()
    await expect(generateButton(page)).toBeEnabled()
    await generateButton(page).tap()
    await expect.poll(() => app.generations().length, { timeout: 10_000 }).toBe(1)
    expect(app.generations()[0]).toMatchObject({ goal: 'balanced', focus: 'full_body' })
    await main.getByRole('button', { name: 'Cancel', exact: true }).tap()
    await expect(anchor.getByRole('button', { name: /Full body/ })).toHaveAttribute('aria-pressed', 'true')
    app.releaseGeneration()
    app.assertContained({ generations: 1 })
  })

  test('JOURNEY-024 keyboard, reduced motion and reopen phone-390: the Focus control opens and closes from the keyboard, an override survives a reload, and Back goes Home', async ({ page, visit, checkA11y }) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width: 390, height: 844 })
    const app = await syntheticApp(page, { history: RETURNING, reducedMotion: true })
    await openGenerate(page, visit)
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)

    const main = page.locator('main')
    const focus = focusControl(main)
    // Keyboard: the Back, then the Focus control, are the first stops in reading order.
    await main.getByRole('heading', { level: 1 }).focus()
    await page.keyboard.press('Tab')
    await expect(main.getByRole('button', { name: 'Home', exact: true })).toBeFocused()
    await focus.focus()
    await expect(focus).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(focus).toHaveAttribute('aria-expanded', 'true')
    await page.keyboard.press('Tab')
    const upper = main.getByRole('group', { name: FOCUS_GROUP }).getByRole('button', { name: /Upper body/ })
    await expect(upper).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(focus).toHaveAccessibleName('Focus: Upper body')
    await expect(main.locator('[data-intent-fact="focus"]')).toContainText('this workout only')
    await expect(page).toHaveURL(/\/generate\?override=upper_body$/)
    await checkA11y()

    // Reopen: the override and its open choices come back from the address.
    await page.reload()
    await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('Generate')
    await settle(page)
    await expect(focus).toHaveAccessibleName('Focus: Upper body')
    await expect(focus).toHaveAttribute('aria-expanded', 'true')
    await expect(upper).toHaveAttribute('aria-pressed', 'true')
    expectAcceptedScreen(await readScreen(page), 'reopened')

    // Space closes the choices and returns to the recommendation.
    await focus.focus()
    await page.keyboard.press('Space')
    await expect(focus).toHaveAttribute('aria-expanded', 'false')
    await expect(focus).toHaveAccessibleName('Focus: Lower body')
    await expect(page).toHaveURL(/\/generate$/)

    // Back, from the keyboard, goes Home.
    await main.getByRole('button', { name: 'Home', exact: true }).focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/$/)
    app.assertContained()
  })

  test('JOURNEY-024 recovery phone-320: a failed generation keeps the draft — the override, Recovery inside the choices and a note — with the accepted screen intact', async ({ page, visit, checkA11y }) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width: 320, height: 568 })
    const app = await syntheticApp(page, { history: RETURNING, failGeneration: true })
    await openGenerate(page, visit)

    const main = page.locator('main')
    const focus = focusControl(main)
    await focus.tap()
    const focuses = main.getByRole('group', { name: FOCUS_GROUP })
    await focuses.getByRole('button', { name: /Upper body/ }).tap()
    await recoveryChip(main).tap()
    await main.getByLabel('Notes', { exact: true }).fill('Left shoulder is tight.')
    await expect(page).toHaveURL(/\/generate\?override=upper_body&recovery=1$/)
    await generateButton(page).tap()
    await expect.poll(() => app.generations().length, { timeout: 10_000 }).toBeGreaterThanOrEqual(1)
    expect(app.generations()[0]).toMatchObject({
      goal: 'active_recovery', focus: 'upper_body', notes: 'Left shoulder is tight.',
    })
    // The actual failure keeps its meaning: it is said, with the way back beside it.
    await expect(main.getByRole('status').filter({ hasText: /^Generation failed/ })).toBeVisible({ timeout: 15_000 })
    const toast = page.getByRole('alert').filter({ hasText: 'Server error' })
    await expect(toast.getByRole('button', { name: 'Retry', exact: true })).toBeVisible()
    // The negative toast is dismissed first so the pinned Cancel is reachable by touch.
    await toast.getByRole('button', { name: 'Dismiss', exact: true }).tap()
    await main.getByRole('button', { name: 'Cancel', exact: true }).tap()

    // Nothing was discarded: the same override, Recovery and note.
    await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('Generate')
    await expect(focus).toHaveAccessibleName('Focus: Upper body')
    await expect(main.locator('[data-intent-fact="focus"]')).toContainText('this workout only')
    await expect(focus).toHaveAttribute('aria-expanded', 'true')
    await expect(recoveryChip(main)).toHaveAttribute('aria-pressed', 'true')
    await expect(main.getByLabel('Notes', { exact: true })).toHaveValue('Left shoulder is tight.')
    await expect(page).toHaveURL(/\/generate\?override=upper_body&recovery=1$/)
    await expect(generateButton(page)).toBeEnabled()
    expectAcceptedScreen(await readScreen(page), 'after a failed generation')
    await noHorizontalOverflow(page)
    await attachScreen(page, 'generate-after-failure-phone-320')
    await checkA11y()
    app.assertContained({ generations: app.generations().length })
  })

  test('gallery screens phone-320: the accepted state draws Generate’s own Back, Goal/Focus summary, focus choices with Recovery and fields, with nothing read or written', async ({ page, visit }) => {
    await page.setViewportSize({ width: 320, height: 568 })
    await installDeterministicCapture(page, { skin: 'clear', reducedMotion: true })
    const requests: string[] = []
    page.on('request', (request) => {
      if (/\/(rest|auth|functions)\/v1\//.test(request.url())) requests.push(`${request.method()} ${request.url()}`)
    })
    await visit('/gallery/refinements?state=screens')
    const state = page.locator('[data-refinement-state="screens"]')
    await expect(state.getByRole('heading', { name: 'Generate', exact: true })).toBeVisible()
    const back = state.getByRole('button', { name: 'Home', exact: true })
    await expect(back).toHaveText('')
    await expect(back).toHaveClass(/clr-chamfer/)
    const focus = focusControl(state)
    await expect(focus).toHaveAccessibleName('Focus: Full body')
    await expect(state.locator('[data-intent-fact="goal"]')).toHaveText('Goal: Balanced')
    for (const helper of REMOVED_HELPERS) await expect(state).not.toContainText(helper)
    const unitWhole = await state.locator('.clr-field__unit').evaluate((unit) => unit.scrollWidth <= unit.clientWidth + 0.5)
    expect(unitWhole).toBe(true)
    await noHorizontalOverflow(page)
    await test.info().attach('gallery-screens-phone-320.png', { body: await state.screenshot({ caret: 'hide' }), contentType: 'image/png' })

    await focus.tap()
    await expect(focus).toHaveAttribute('aria-expanded', 'true')
    const focuses = state.getByRole('group', { name: FOCUS_GROUP })
    await expect(focuses.getByRole('button')).toHaveText(ANCHORS)
    await recoveryChip(state).tap()
    await expect(recoveryChip(state)).toHaveAttribute('aria-pressed', 'true')
    await expect(focuses.getByRole('button', { name: /Full body/ })).toHaveAttribute('aria-pressed', 'true')
    await test.info().attach('gallery-screens-recovery-phone-320.png', { body: await state.screenshot({ caret: 'hide' }), contentType: 'image/png' })

    await state.getByRole('radio', { name: 'First workout' }).check()
    await expect(state.getByRole('group', { name: 'Anchor' }).getByRole('button')).toHaveText(ANCHORS)
    await expect(recoveryChip(state)).toHaveAttribute('aria-pressed', 'false')
    await expect(state.getByRole('button', { name: GENERATE, exact: true })).toBeDisabled()
    await expect(page).toHaveURL(/\/gallery\/refinements\?state=screens$/)
    expect(requests, 'the gallery reads and writes nothing over the network').toEqual([])
  })
})
