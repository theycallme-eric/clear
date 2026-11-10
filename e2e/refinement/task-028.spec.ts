import { spawn } from 'node:child_process'
import { createServer, type AddressInfo } from 'node:net'
import { resolve } from 'node:path'
import type { Locator, Page, Route } from '@playwright/test'

import { readE2eEnv } from '../../scripts/e2e/env.mjs'
import { createError, ErrorCode } from '../../src/state/errors'
import { makeSessionRow } from '../../src/test/factories'
import { fixtureLocation, onboardedProfile } from '../../src/test/user-data-double'
import { installDeterministicCapture } from '../design-0143/fixtures'
import { expect, test as scanned } from '../fixtures'

/**
 * TASK-028 (REQ-028; C55, G23; R22; AC-C55-01, AC-R028-01; JOURNEY-028) —
 * the released semantic error treatment is a regression invariant. PR611's
 * correction (library pilot c0d5782 / 55843bd, proved by
 * `e2e/library-error-role.spec.ts`) is retained in the one shared owner
 * `src/ui/view-state.tsx#ErrorView`, not reimplemented: the alert root scopes
 * `--border-card` and `--brd` to `--border-toast-negative`, so a standalone
 * failure's frame, accent bar and emission share the error role in every
 * skin, and its glyph paints `--icon-toast-negative`. Accepted gallery
 * reference eded158cfd928d382c9a9409e2c372270312741d,
 * `/gallery/refinements?state=errors`.
 *
 * Entry (ENTRY-028): an existing read fails on an existing application error
 * screen behind the existing auth guard — the boot account check (the
 * account-load failure a fresh browser actually meets, R22) and `/summary`'s
 * session read. Action: view the failure in each skin and retry it. Result,
 * read from the browser: the paints above, and Retry re-runs only the read
 * that failed into the route's next state. Recovery: loading, absent content
 * and actual errors keep their meanings; nothing is written or claimed as
 * done; keyboard, touch and reduced motion reach the same failure.
 *
 * Synthetic and contained: an intercepted session for a fictional user and
 * synthetic reads only, failed or held here and never forwarded; no write, no
 * generation, no user data mutated to capture a reference.
 */
const OWNER = '00000000-0000-4000-8000-000000002801'
const PLACE = '00000000-0000-4000-8000-000000002811'
const SESSION = '00000000-0000-4000-8000-000000002821'
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
    if (code !== null) throw new Error(`Synthetic TASK-028 server exited (${code}) before ${origin} was ready`)
    try {
      if ((await fetch(origin)).ok && (await fetch(own)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((settle) => setTimeout(settle, 250))
  }
  throw new Error(`Synthetic TASK-028 origin ${origin} did not start`)
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
          VITE_SUPABASE_URL: 'https://synthetic-task-028.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-task-028-public-placeholder',
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

const SKINS = ['clear', 'vapour', 'signal', 'mono'] as const
type Skin = (typeof SKINS)[number]
const PHONE_390 = { width: 390, height: 844 }
const PHONE_320 = { width: 320, height: 568 }

const BOOT_FAILURE_TITLE = 'System check failed'
const BOOT_PROFILE_MESSAGE = 'Could not read your profile. Your data is intact.'
const SUMMARY_FAILURE_TITLE = 'That session didn’t load'
const SUMMARY_LOADING = 'Reading your session'
const GALLERY_TITLE = 'Released error semantics'
const TIMEOUT_MESSAGE = createError(ErrorCode.NETWORK_TIMEOUT).message
/** `M12 2.5L23 21.5H1L12 2.5Z…` is the AlertTriangle outline in the 0.14.3 icon set. */
const ALERT_TRIANGLE = 'M12 2.5L23 21.5H1L12 2.5Z'

const COMPLETED_AT = '2026-11-09T09:31:00.000Z'
const COMPLETED = makeSessionRow({
  id: SESSION, user_id: OWNER, location_id: PLACE, date: '2026-11-09',
  created_at: '2026-11-09T09:00:00.000Z', updated_at: COMPLETED_AT,
  started_at: '2026-11-09T09:00:00.000Z', completed_at: COMPLETED_AT,
  title: 'Synthetic full-body session', session_focus: 'full_body',
  goal_preset: 'balanced', requested_duration_mins: 30, actual_duration_mins: 31,
})

// ─────────────────────────────────────────────────────────────────────────────
// The synthetic app
// ─────────────────────────────────────────────────────────────────────────────

interface Failures {
  /** The account (profile) read fails while set. */
  profile: boolean
  /** Summary's session read (`streak_sessions`) fails while set. */
  session: boolean
  /** Summary's session read is held, unanswered, while set. */
  holdSession: boolean
}

/** Read RPCs this journey's routes make; each is answered as a read. */
const READ_RPCS = new Set([
  'resume_session', 'streak_sessions', 'constraints_in_force', 'anchor_evidence', 'conditioning_history',
  'session_as_performed',
])

async function syntheticApp(page: Page, options: { skin: Skin; reducedMotion?: boolean } & Partial<Failures>) {
  const failures: Failures = {
    profile: options.profile ?? false,
    session: options.session ?? false,
    holdSession: options.holdSession ?? false,
  }
  const reads = { profile: 0, session: 0 }
  const unexpected: string[] = []
  const writes: string[] = []
  let releaseHeld: () => void = () => undefined
  const guard = await installDeterministicCapture(page, { skin: options.skin, reducedMotion: options.reducedMotion ?? false })

  const handler = async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    const name = url.pathname.split('/').at(-1) ?? ''
    const reply = (body: unknown, status = 200) =>
      route.fulfill({ status, headers: CORS, json: body }).catch(() => undefined)
    const refuse = () => reply({ code: 'PGRST000', message: 'Synthetic TASK-028 read failure.' }, 503)
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (url.pathname.startsWith('/functions/v1/')) {
      unexpected.push(`${request.method()} ${url.pathname}`)
      return route.abort('blockedbyclient')
    }
    if (request.method() === 'GET') {
      if (name === 'profiles') {
        reads.profile += 1
        return failures.profile ? refuse() : reply([onboardedProfile({ id: OWNER, goal_preset: 'balanced' })])
      }
      if (name === 'locations') {
        return reply([fixtureLocation({ id: PLACE, user_id: OWNER, tier: 'full', name: 'Building gym', is_default: true })])
      }
      if (name === 'workout_sessions') return reply([COMPLETED])
      return reply([])
    }
    if (request.method() === 'POST' && url.pathname.includes('/rpc/') && READ_RPCS.has(name)) {
      if (name === 'streak_sessions') {
        const body = (request.postDataJSON() ?? {}) as { p_limit?: number }
        if (body.p_limit === 1) {
          reads.session += 1
          if (failures.holdSession) {
            await new Promise<void>((settle) => { releaseHeld = settle })
          }
          if (failures.session) return refuse()
        }
        return reply([{ session_id: SESSION, completed_at: COMPLETED_AT, counts_for_streak: true }])
      }
      if (name === 'resume_session' || name === 'session_as_performed') return reply(null)
      return reply([])
    }
    writes.push(`${request.method()} ${url.pathname}`)
    unexpected.push(`${request.method()} ${url.pathname}`)
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic TASK-028 request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ owner }) => {
    localStorage.setItem('clear.auth.session', JSON.stringify({
      accessToken: 'synthetic-task-028-session', refreshToken: 'synthetic-task-028-refresh',
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-task-028@example.invalid' },
    }))
  }, { owner: OWNER })

  return {
    failures,
    reads,
    release: () => releaseHeld(),
    assertContained() {
      expect(unexpected, 'Every API request has an explicit synthetic disposition').toEqual([])
      expect(writes, 'Nothing is written; no work is fabricated').toEqual([])
      expect(guard.blockedGenerations(), 'No generation reached the model route').toBe(0)
    },
  }
}

/** A gallery visit with no account. */
async function galleryVisit(page: Page, skin: Skin) {
  await installDeterministicCapture(page, { skin, reducedMotion: false })
  const requests: string[] = []
  page.on('request', (request) => {
    if (/\/(rest|auth|functions)\/v1\//.test(request.url())) requests.push(`${request.method()} ${request.url()}`)
  })
  return { requests }
}

/** The applied skin is the requested one and its colour transitions have finished. */
async function settledSkin(page: Page, skin: Skin) {
  await expect(page.locator('html')).toHaveAttribute('data-skin', skin)
  await page.evaluate(async () => {
    await Promise.race([
      Promise.all(document.getAnimations()
        .filter((animation) => animation instanceof CSSTransition)
        .map((animation) => animation.finished.catch(() => undefined))),
      new Promise((settle) => setTimeout(settle, 1_000)),
    ])
    await new Promise((settle) => requestAnimationFrame(() => requestAnimationFrame(settle)))
  })
}

async function attachScreen(page: Page, name: string) {
  await test.info().attach(`${name}.png`, { body: await page.screenshot({ caret: 'hide' }), contentType: 'image/png' })
}

async function attachJson(name: string, body: unknown) {
  await test.info().attach(`${name}.json`, { body: JSON.stringify(body, null, 2), contentType: 'application/json' })
}

// ─────────────────────────────────────────────────────────────────────────────
// Reading the painted roles (the pilot's reading, PR611)
// ─────────────────────────────────────────────────────────────────────────────

interface RoleReading {
  appliedSkin: string | null
  frame: number[]
  bar: number[]
  barTint: number[]
  emission: number[]
  expected: number[]
  ordinary: number[]
  icon: number[] | null
  expectedIcon: number[]
  matches: boolean
  iconMatches: boolean
  distinct: boolean
  fits: boolean
}

/**
 * One standalone alert root's painted roles, every colour normalised through
 * a canvas pixel: frame (body ::after), bar (both inset shadows) and emission
 * (bleed) against `--border-toast-negative`, the glyph against
 * `--icon-toast-negative`, each resolved where the view sits; and the
 * ordinary card role there, which the error role must not be.
 */
function readRoles(alert: Locator): Promise<RoleReading> {
  return alert.evaluate((root, outline) => {
    const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!
    context.globalCompositeOperation = 'copy'
    const pixel = (color: string) => {
      context.fillStyle = 'rgba(0, 0, 0, 0)'
      context.fillStyle = color
      context.fillRect(0, 0, 1, 1)
      return Array.from(context.getImageData(0, 0, 1, 1).data)
    }
    const shadowColor = (shadow: string, index: number) =>
      shadow.split(/,(?![^(]*\))/)[index]!.trim().match(/^[a-z-]+\([^)]*\)|^#[0-9a-f]+|^[a-z]+/i)![0]
    const resolved = (host: Element, value: string) => {
      const probe = document.createElement('span')
      probe.style.color = value
      host.appendChild(probe)
      const color = getComputedStyle(probe).color
      probe.remove()
      return pixel(color)
    }
    const near = (a: number[], b: number[], channels = 4) =>
      a.slice(0, channels).every((value, index) => Math.abs(value - b[index]!) <= 2)

    const body = root.querySelector('.clr-card__body')!
    const bar = root.querySelector('.clr-card__bar')!
    const bleed = root.querySelector('.clr-bleed')!
    const shadow = getComputedStyle(bar).boxShadow
    const frame = pixel(getComputedStyle(body, '::after').backgroundColor)
    const barEdge = pixel(shadowColor(shadow, 0))
    const barTint = pixel(shadowColor(shadow, 1))
    const emission = resolved(bleed, 'var(--bleed)')
    const expected = resolved(root.parentElement!, 'var(--border-toast-negative)')
    const ordinary = resolved(root.parentElement!, 'var(--border-card)')
    const glyph = [...root.querySelectorAll('svg path')].find((path) => path.getAttribute('d')?.startsWith(outline))
    const iconHost = glyph?.closest('svg')?.parentElement
    const icon = iconHost ? pixel(getComputedStyle(iconHost).color) : null
    const expectedIcon = resolved(root.parentElement!, 'var(--icon-toast-negative)')
    const box = root.getBoundingClientRect()
    return {
      appliedSkin: document.documentElement.dataset.skin ?? null,
      frame,
      bar: barEdge,
      barTint,
      emission,
      expected,
      ordinary,
      icon,
      expectedIcon,
      matches: near(frame, expected) && near(barEdge, expected) && near(barTint, expected, 3)
        && near(emission, expected),
      iconMatches: icon !== null && near(icon, expectedIcon),
      distinct: !near(expected, ordinary, 3),
      fits: box.left >= 0 && box.right <= innerWidth && document.documentElement.scrollWidth <= innerWidth,
    }
  }, ALERT_TRIANGLE)
}

/**
 * A contained failure (inside a card): the host card keeps one role of its
 * own on frame, bar and emission, nothing framed is drawn inside the alert,
 * and the glyph still paints the error icon role.
 */
function readContained(alert: Locator) {
  return alert.evaluate((root, outline) => {
    const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!
    context.globalCompositeOperation = 'copy'
    const pixel = (color: string) => {
      context.fillStyle = 'rgba(0, 0, 0, 0)'
      context.fillStyle = color
      context.fillRect(0, 0, 1, 1)
      return Array.from(context.getImageData(0, 0, 1, 1).data)
    }
    const resolved = (host: Element, value: string) => {
      const probe = document.createElement('span')
      probe.style.color = value
      host.appendChild(probe)
      const color = getComputedStyle(probe).color
      probe.remove()
      return pixel(color)
    }
    const near = (a: number[], b: number[]) => a.every((value, index) => Math.abs(value - b[index]!) <= 2)
    const hostBody = root.closest('.clr-card__body')!
    const hostBar = hostBody.parentElement!.querySelector(':scope > .clr-card__bar')!
    const hostBleed = hostBody.closest('.clr-bleed')!
    const frame = pixel(getComputedStyle(hostBody, '::after').backgroundColor)
    const bar = pixel(getComputedStyle(hostBar).boxShadow.split(/,(?![^(]*\))/)[0]!.trim()
      .match(/^[a-z-]+\([^)]*\)|^#[0-9a-f]+|^[a-z]+/i)![0])
    const emission = resolved(hostBleed, 'var(--bleed)')
    const glyph = [...root.querySelectorAll('svg path')].find((path) => path.getAttribute('d')?.startsWith(outline))
    const icon = glyph ? pixel(getComputedStyle(glyph.closest('svg')!.parentElement!).color) : null
    const expectedIcon = resolved(root, 'var(--icon-toast-negative)')
    return {
      nested: root.querySelectorAll('.clr-card, .clr-card__bar, .clr-card__body').length,
      frame, bar, emission, icon, expectedIcon,
      hostConsistent: near(frame, bar) && near(frame, emission),
      iconMatches: icon !== null && near(icon, expectedIcon),
    }
  }, ALERT_TRIANGLE)
}

function motion(alert: Locator) {
  return alert.evaluate((root) => ({
    glitch: root.classList.contains('clr-glitch'),
    name: getComputedStyle(root).animationName,
    count: getComputedStyle(root).animationIterationCount,
  }))
}

/** A view's loading region; the app's always-present announcer is not one. */
const busy = (page: Page) => page.locator('main [role="status"][aria-busy="true"]')

const ROLE_MATCH = { matches: true, iconMatches: true, distinct: true, fits: true }

// ─────────────────────────────────────────────────────────────────────────────

test.describe('TASK-028 released semantic error treatment', () => {
  for (const skin of SKINS) {
    test(`JOURNEY-028 skin ${skin} phone-390 real routes: the boot account-load failure keeps its card's one role with the error glyph and Retry re-reads only the account; /summary's failure paints frame, accent bar, emission and icon in the one error role and Retry re-reads the session into the debrief; nothing written`, async ({ page, visit, checkA11y }) => {
      test.setTimeout(120_000)
      await page.setViewportSize(PHONE_390)
      const app = await syntheticApp(page, { skin, profile: true, session: true })

      // The account-load failure a fresh browser meets: the boot check's own card.
      await visit('/summary')
      const boot = page.getByRole('alert').filter({ hasText: BOOT_FAILURE_TITLE })
      await expect(boot).toBeVisible()
      await expect(boot).toContainText(BOOT_PROFILE_MESSAGE)
      await expect(busy(page)).toHaveCount(0)
      await settledSkin(page, skin)
      const contained = await readContained(boot)
      expect(contained, `boot card (${skin})`).toMatchObject({ nested: 0, hostConsistent: true, iconMatches: true })
      await attachScreen(page, `boot-account-failure-${skin}`)

      const profileReads = app.reads.profile
      app.failures.profile = false
      await page.locator('footer.clr-footer').getByRole('button', { name: 'Retry', exact: true }).tap()

      // The route arrives and its own session read fails: a standalone failure.
      const failure = page.getByRole('alert').filter({ hasText: SUMMARY_FAILURE_TITLE })
      await expect(failure).toBeVisible()
      expect(app.reads.profile, 'Retry re-read the account once').toBe(profileReads + 1)
      await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('Nice work')
      await settledSkin(page, skin)
      const reading = await readRoles(failure)
      expect(reading.appliedSkin).toBe(skin)
      expect(reading, `/summary failure (${skin})`).toMatchObject(ROLE_MATCH)
      await expect(failure.getByText(SUMMARY_FAILURE_TITLE, { exact: true })).toBeVisible()
      await expect(failure.locator(`svg path[d^="${ALERT_TRIANGLE}"]`)).toHaveCount(1)
      await expect(busy(page)).toHaveCount(0)
      await checkA11y()
      await attachScreen(page, `summary-failure-${skin}`)
      await attachJson(`roles-${skin}`, { contained, reading })

      // Retry re-runs only the failed read, into the route's next state.
      const sessionReads = app.reads.session
      app.failures.session = false
      await failure.getByRole('button', { name: 'Retry', exact: true }).tap()
      await expect(page.getByRole('heading', { name: 'Debrief' })).toBeVisible()
      await expect(page.getByRole('alert')).toHaveCount(0)
      expect(app.reads.session).toBe(sessionReads + 1)
      expect(app.reads.profile, 'the account is not read again').toBe(profileReads + 1)
      app.assertContained()
    })
  }

  for (const skin of SKINS) {
    test(`JOURNEY-028 skin ${skin} phone-390 gallery ?state=errors: the accepted released error state paints frame, accent bar, emission and icon in the one error role beside its Retry`, async ({ page, visit }) => {
      await page.setViewportSize(PHONE_390)
      const gallery = await galleryVisit(page, skin)
      await visit('/gallery/refinements?state=errors')
      const state = page.locator('[data-refinement-state="errors"]')
      await expect(state.getByRole('heading', { name: GALLERY_TITLE, exact: true })).toBeVisible()
      const alert = state.getByRole('alert')
      await expect(alert).toHaveCount(1)
      await expect(alert.getByText('Request failed', { exact: true })).toBeVisible()
      await expect(alert.getByText(TIMEOUT_MESSAGE)).toBeVisible()
      await expect(alert.getByRole('button')).toHaveText(['Retry'])
      await settledSkin(page, skin)
      const reading = await readRoles(alert)
      expect(reading.appliedSkin).toBe(skin)
      expect(reading, `gallery errors (${skin})`).toMatchObject(ROLE_MATCH)
      await attachScreen(page, `gallery-errors-${skin}`)
      await attachJson(`gallery-roles-${skin}`, reading)
      expect(gallery.requests, 'The gallery makes no account traffic').toEqual([])
    })
  }

  test('JOURNEY-028 phone-390 meanings: a held read is a busy status and not an alert, its failure is an alert that claims no work, and Retry re-runs only that read', async ({ page, visit }) => {
    test.setTimeout(90_000)
    await page.setViewportSize(PHONE_390)
    const app = await syntheticApp(page, { skin: 'signal', session: true, holdSession: true })
    await visit('/summary')

    // Loading: the polite busy status under its own label; no alert, no debrief.
    const status = page.getByRole('status').filter({ hasText: SUMMARY_LOADING })
    await expect(status).toBeVisible()
    await expect(status).toHaveAttribute('aria-busy', 'true')
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Debrief' })).toHaveCount(0)
    await attachScreen(page, 'summary-loading-signal')

    // Failure: an alert, no longer busy, offering only Retry; no debrief appears.
    app.failures.holdSession = false
    app.release()
    const failure = page.getByRole('alert').filter({ hasText: SUMMARY_FAILURE_TITLE })
    await expect(failure).toBeVisible()
    await expect(busy(page)).toHaveCount(0)
    await expect(failure).not.toHaveAttribute('aria-busy', 'true')
    await expect(failure.getByRole('button')).toHaveText(['Retry'])
    await expect(page.getByRole('heading', { name: 'Debrief' })).toHaveCount(0)
    await settledSkin(page, 'signal')
    expect(await readRoles(failure)).toMatchObject(ROLE_MATCH)

    // A failed retry is the same failure again, read once more, and still claims nothing.
    const before = app.reads.session
    await failure.getByRole('button', { name: 'Retry', exact: true }).tap()
    await expect.poll(() => app.reads.session).toBe(before + 1)
    await expect(page.getByRole('alert').filter({ hasText: SUMMARY_FAILURE_TITLE })).toBeVisible()

    // A recovered read is the route's own next state.
    app.failures.session = false
    await page.getByRole('alert').getByRole('button', { name: 'Retry', exact: true }).tap()
    await expect(page.getByRole('heading', { name: 'Debrief' })).toBeVisible()
    expect(app.reads.session).toBe(before + 2)
    app.assertContained()
  })

  test('JOURNEY-028 phone-320 reduced motion and keyboard: the failure is still, keeps its one error role, copy and Retry, fits the narrow phone, and the keyboard reaches and activates Retry', async ({ page, visit, checkA11y }) => {
    test.setTimeout(90_000)
    await page.setViewportSize(PHONE_320)
    const app = await syntheticApp(page, { skin: 'vapour', session: true, reducedMotion: true })
    await visit('/summary')
    const failure = page.getByRole('alert').filter({ hasText: SUMMARY_FAILURE_TITLE })
    await expect(failure).toBeVisible()
    await settledSkin(page, 'vapour')
    expect(await motion(failure)).toMatchObject({ glitch: true, name: 'none' })
    expect(await readRoles(failure)).toMatchObject(ROLE_MATCH)
    await checkA11y()
    await attachScreen(page, 'summary-failure-reduced-320')

    // Keyboard: Tab reaches Retry; Enter re-runs the read.
    app.failures.session = false
    const retry = failure.getByRole('button', { name: 'Retry', exact: true })
    for (let step = 0; step < 25; step += 1) {
      if (await retry.evaluate((button) => button === document.activeElement)) break
      await page.keyboard.press('Tab')
    }
    await expect(retry).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: 'Debrief' })).toBeVisible()
    app.assertContained()
  })

  test('JOURNEY-028 phone-390 motion: a failure glitches once on arrival, never loops, and the gallery state does the same', async ({ page, visit }) => {
    test.setTimeout(90_000)
    await page.setViewportSize(PHONE_390)
    const app = await syntheticApp(page, { skin: 'clear', session: true })
    await visit('/summary')
    const failure = page.getByRole('alert').filter({ hasText: SUMMARY_FAILURE_TITLE })
    await expect(failure).toBeVisible()
    expect(await motion(failure)).toEqual({ glitch: true, name: 'clr-glitch', count: '1' })
    await expect(page.locator('.clr-glitch--loop')).toHaveCount(0)
    app.assertContained()

    await visit('/gallery/refinements?state=errors')
    const alert = page.locator('[data-refinement-state="errors"]').getByRole('alert')
    await expect(alert).toBeVisible()
    expect(await motion(alert)).toEqual({ glitch: true, name: 'clr-glitch', count: '1' })
  })
})
