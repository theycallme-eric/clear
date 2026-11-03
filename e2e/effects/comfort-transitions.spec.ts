/**
 * Effects TASK-007 (REQ-007, JOURNEY-004) — the comfort end states on actual
 * app screens, in a real browser.
 *
 * One journey, without a reload, from `/generate` through Home and Settings:
 *
 *   1. A hidden tab: the CRT field's line and grain clocks and the atmosphere
 *      blobs stop (no time passes while hidden); visible again, each continues
 *      from where it stopped with no catch-up jump.
 *   2. OS reduced motion turned on mid-session: drift, grain and blobs stop
 *      together, blob shapes and colours stay, the static Echo and the static
 *      glass stay, and no atmosphere scan is drawn; turned off, motion resumes
 *      from the held clocks.
 *   3. Visual effects unchecked in Settings: on Settings, Home and `/generate`
 *      no Echo rear image, no CRT field and no old decorative scanline (the
 *      atmosphere scan, the frame scan, the bundled overlay); the blobs hold
 *      still with their shapes and colours; focus, loading/busy and an error
 *      still work, with and without reduced motion. Checked again: the Echo
 *      and the field return with the same centralized preset identities, the
 *      field's clocks start from their own beginning at the configured cadence
 *      and the blobs continue from their held time — no catch-up jump.
 *
 * Every clock read waits for pending pause/play operations to commit first,
 * so a reading is the committed state, never a frame still in flight.
 *
 * Self-contained: this workspace's own Vite origin with synthetic, intercepted
 * data (no write, no model call, nothing leaves the origin). No shared
 * Playwright configuration and no other spec's harness is read or changed.
 */
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

import type { Locator, Page, Route } from '@playwright/test'

import { fixtureLocation, onboardedProfile } from '../../src/test/user-data-double'
import { CRT_FIELD_CONFIG, crtFieldCustomProperties } from '../../src/ui/crt-field/config'
import { PHOSPHOR_ECHO_PRESET } from '../../src/ui/phosphor-echo-preset'
import { expect, test as base } from '../fixtures'

// ---------------------------------------------------------------------------
// This task's own app origin, with synthetic data.
// ---------------------------------------------------------------------------

async function waitForOrigin(origin: string, deadline: number) {
  while (Date.now() < deadline) {
    try {
      if ((await fetch(origin)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((settle) => setTimeout(settle, 250))
  }
  throw new Error(`comfort-transitions origin ${origin} did not start`)
}

const test = base.extend<object, { comfortOrigin: string }>({
  comfortOrigin: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use, workerInfo) => {
      const port = 5820 + workerInfo.parallelIndex
      const origin = `http://localhost:${port}`
      const server = spawn(process.execPath, [
        resolve(import.meta.dirname, '../../node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort',
      ], {
        env: {
          ...process.env,
          VITE_SUPABASE_URL: 'https://synthetic-comfort.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-comfort-public-placeholder',
        },
        stdio: 'ignore',
      })
      const closed = new Promise<void>((settle) => {
        server.once('exit', () => settle())
        server.once('error', () => settle())
      })
      try {
        await waitForOrigin(origin, Date.now() + 90_000)
        await use(origin)
      } finally {
        server.kill()
        await closed
      }
    },
    { scope: 'worker', timeout: 120_000 },
  ],
  baseURL: async ({ comfortOrigin }, use) => use(comfortOrigin),
})

test.use({ serviceWorkers: 'block' })

const OWNER = '00000000-0000-4000-8000-000000000071'
const HOME_ID = '00000000-0000-4000-8000-000000000072'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
}

/** A signed-in, onboarded athlete; generation requests are held until released. */
async function syntheticApp(page: Page, origin: string) {
  const writes: string[] = []
  const outbound: string[] = []
  const held: Route[] = []

  await page.route('**/*', (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin === origin && ['GET', 'HEAD'].includes(request.method())) return route.continue()
    outbound.push(`${request.method()} ${url.origin}${url.pathname}`)
    return route.abort('blockedbyclient')
  })
  const handler = async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    const name = url.pathname.split('/').at(-1) ?? ''
    const reply = (body: unknown, status = 200) => route.fulfill({ status, headers: CORS, json: body }).catch(() => undefined)
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (url.pathname.startsWith('/functions/v1/') && request.method() === 'POST') {
      held.push(route)
      return
    }
    if (request.method() === 'GET') {
      if (name === 'profiles') return reply([onboardedProfile({ id: OWNER, goal_preset: 'balanced' })])
      if (name === 'locations') {
        return reply([fixtureLocation({ id: HOME_ID, user_id: OWNER, tier: 'full', name: 'Home gym', is_default: true })])
      }
      return reply([])
    }
    if (request.method() === 'POST' && url.pathname.includes('/rpc/')) return reply(name === 'resume_session' ? null : [])
    writes.push(`${request.method()} ${url.pathname}`)
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic write.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ owner }) => {
    if (sessionStorage.getItem('comfort-seeded')) return
    sessionStorage.setItem('comfort-seeded', '1')
    localStorage.setItem('clear.auth.session', JSON.stringify({
      accessToken: 'synthetic-comfort-session', refreshToken: 'synthetic-comfort-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-comfort@example.invalid' },
    }))
    localStorage.setItem('clear.skin', 'clear')
    localStorage.setItem('clear.visual-effects', 'on')
  }, { owner: OWNER })

  return {
    held,
    /** Answer the oldest held generation with a server failure. */
    async failHeld() {
      const route = held.shift()
      expect(route, 'a generation request is held').toBeDefined()
      await route!.fulfill({ status: 503, headers: CORS, json: { error: 'synthetic outage' } })
    },
    assertReadOnly() {
      expect(writes, 'no write').toEqual([])
      expect(outbound, 'nothing leaves the local origin').toEqual([])
    },
  }
}

// ---------------------------------------------------------------------------
// What the page renders, read in the page once pending animation work commits.
// ---------------------------------------------------------------------------

const LINE_DRIFT = 'clr-crt-line-drift'
const GRAIN_REFRESH = 'clr-crt-grain-refresh'

interface Clock { id: string; time: number; state: string; duration: number }
interface Blob { key: string; time: number; state: string }
interface BlobLook { background: string; width: string; height: string; borderRadius: string; display: string; opacity: string }

interface Effects {
  now: number
  host: { effects: string | null; motion: string | null }
  field: null | {
    count: number
    config: string | null
    motion: string | null
    properties: Record<string, string>
    lines: Clock | null
    grain: Clock | null
  }
  blobs: Blob[]
  blobLooks: BlobLook[]
  /** Where each blob is drawn now; unchanged over time means it is still. */
  blobTransforms: string[]
  atmosphere: { count: number; still: boolean }
  echo: { sources: number; filters: number; blur: number; dx: number; dy: number; slope: number; sourceFilter: string | null }
  oldScans: { atmosphereScan: number; overlay: number; framed: number; framedScanned: number }
}

async function readEffects(page: Page): Promise<Effects> {
  return page.evaluate(async ({ lineId, grainId, propertyNames }) => {
    // Two frames for React and style to land, then every pending pause/play.
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
    await Promise.all(document.getAnimations().map((animation) => animation.ready.catch(() => undefined)))
    const animations = document.getAnimations()
    const now = performance.now()
    const clock = (id: string) => {
      const animation = animations.find((a) => a.id === id)
      return animation
        ? { id, time: Number(animation.currentTime), state: animation.playState, duration: Number(animation.effect?.getTiming().duration) }
        : null
    }
    const blobs = animations.flatMap((animation) => {
      const target = (animation.effect as KeyframeEffect | null)?.target
      if (!(target instanceof Element) || !target.matches('.clr-atmosphere__blob')) return []
      const name = (animation as CSSAnimation).animationName ?? animation.id
      return [{ key: `${target.className}:${name}`, time: Number(animation.currentTime), state: animation.playState }]
    }).sort((a, b) => a.key.localeCompare(b.key))
    const field = document.querySelectorAll<HTMLElement>('.clr-crt-field')
    const host = document.querySelector<HTMLElement>('.clr-effects-host')
    const filter = document.querySelector('filter#clr-phosphor-echo')
    const numberAttr = (selector: string, name: string) => Number(filter?.querySelector(selector)?.getAttribute(name))
    const source = document.querySelector('.clr-echo__source')
    const atmosphere = document.querySelector<HTMLElement>('.clr-atmosphere')
    const framed = [...document.querySelectorAll('.clr-chamfer')].filter((el) => el.closest('[aria-busy="true"]') === null)
    return {
      now,
      host: { effects: host?.dataset.effects ?? null, motion: host?.dataset.motion ?? null },
      field: field.length === 0 ? null : {
        count: field.length,
        config: field[0]!.dataset.crtConfig ?? null,
        motion: field[0]!.dataset.motion ?? null,
        properties: Object.fromEntries(propertyNames.map((name) => [name, field[0]!.style.getPropertyValue(name)])),
        lines: clock(lineId),
        grain: clock(grainId),
      },
      blobs,
      blobLooks: [...document.querySelectorAll('.clr-atmosphere__blob')].map((blob) => {
        const style = getComputedStyle(blob)
        return {
          background: `${style.backgroundColor} | ${style.backgroundImage}`,
          width: style.width, height: style.height, borderRadius: style.borderRadius,
          display: style.display, opacity: style.opacity,
        }
      }),
      blobTransforms: [...document.querySelectorAll('.clr-atmosphere__blob')].map((blob) => getComputedStyle(blob).transform),
      atmosphere: { count: document.querySelectorAll('.clr-atmosphere').length, still: atmosphere?.dataset.static === 'true' },
      echo: {
        sources: document.querySelectorAll('.clr-echo__source').length,
        filters: document.querySelectorAll('filter#clr-phosphor-echo').length,
        blur: numberAttr('feGaussianBlur', 'stdDeviation'),
        dx: numberAttr('feOffset', 'dx'),
        dy: numberAttr('feOffset', 'dy'),
        slope: numberAttr('feFuncA', 'slope'),
        sourceFilter: source ? getComputedStyle(source).filter : null,
      },
      oldScans: {
        atmosphereScan: [...document.querySelectorAll('.clr-atmosphere__scan')].filter((el) => getComputedStyle(el).display !== 'none').length,
        overlay: document.querySelectorAll('.scanlines-overlay').length,
        framed: framed.length,
        framedScanned: framed.filter((el) => getComputedStyle(el, '::before').backgroundImage.includes('repeating-linear-gradient')).length,
      },
    }
  }, { lineId: LINE_DRIFT, grainId: GRAIN_REFRESH, propertyNames: Object.keys(crtFieldCustomProperties()) })
}

const pageNow = (page: Page) => page.evaluate(() => performance.now())
const pause = (page: Page, ms: number) => page.waitForTimeout(ms)

/** Hide or show the document as the browser does, returning the page time it happened. */
async function setTabVisibility(page: Page, state: 'hidden' | 'visible'): Promise<number> {
  return page.evaluate((value) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => value })
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => value === 'hidden' })
    const at = performance.now()
    document.dispatchEvent(new Event('visibilitychange'))
    return at
  }, state)
}

/** The centralized preset identities, as the page renders them. */
function expectPresetIdentities(effects: Effects, when: string) {
  expect(effects.field, `${when}: one CRT field`).not.toBeNull()
  expect(effects.field!.count, `${when}: one CRT field`).toBe(1)
  expect(effects.field!.config, `${when}: field configuration id`).toBe(CRT_FIELD_CONFIG.id)
  expect(effects.field!.properties, `${when}: field values`).toEqual(crtFieldCustomProperties())
  expect(effects.field!.lines?.duration, `${when}: line drift cadence`).toBe(CRT_FIELD_CONFIG.lines.driftSecondsPerPeriod * 1000)
  expect(effects.field!.grain?.duration, `${when}: grain refresh cadence`).toBe(
    (CRT_FIELD_CONFIG.grain.frames / CRT_FIELD_CONFIG.grain.refreshHz) * 1000,
  )
  expect(effects.echo.filters, `${when}: one Echo filter`).toBe(1)
  expect(
    { blur: effects.echo.blur, dx: effects.echo.dx, dy: effects.echo.dy, slope: effects.echo.slope },
    `${when}: Echo preset`,
  ).toEqual({ blur: PHOSPHOR_ECHO_PRESET.blur, dx: PHOSPHOR_ECHO_PRESET.x, dy: PHOSPHOR_ECHO_PRESET.y, slope: PHOSPHOR_ECHO_PRESET.opacity })
}

function expectNoOldScans(effects: Effects, when: string) {
  expect(effects.oldScans.atmosphereScan, `${when}: no atmosphere scan`).toBe(0)
  expect(effects.oldScans.overlay, `${when}: no scanline overlay`).toBe(0)
  expect(effects.oldScans.framedScanned, `${when}: no frame scan`).toBe(0)
}

/** Every effect clock, by name, for comparing two readings. */
function clockTimes(effects: Effects): Record<string, number> {
  return {
    ...(effects.field?.lines ? { lines: effects.field.lines.time } : {}),
    ...(effects.field?.grain ? { grain: effects.field.grain.time } : {}),
    ...Object.fromEntries(effects.blobs.map((blob) => [blob.key, blob.time])),
  }
}

function expectAllStopped(effects: Effects, when: string) {
  expect(effects.field?.motion, `${when}: field paused`).toBe('paused')
  expect(effects.field?.lines?.state, `${when}: line drift paused`).toBe('paused')
  expect(effects.field?.grain?.state, `${when}: grain refresh paused`).toBe('paused')
  expect(effects.atmosphere.still, `${when}: atmosphere still`).toBe(true)
  // A paused blob clock, or none at all: the OS reduced-motion end state
  // (src/styles/a11y.css) removes the blob animations rather than pausing them.
  for (const blob of effects.blobs) expect(blob.state, `${when}: ${blob.key}`).toBe('paused')
}

/** Allowance for the frame or two between the page's clock reading and the animation's. */
const FRAME_SLACK_MS = 120

/** Two readings over a pause: no clock moved and no blob was drawn anywhere else. */
function expectHeld(first: Effects, second: Effects, when: string) {
  expect(clockTimes(second), `${when}: no effect time passes`).toEqual(clockTimes(first))
  expect(second.blobTransforms, `${when}: the blobs hold still`).toEqual(first.blobTransforms)
}

/**
 * After a resume at `resumedAt`, each clock moved on by no more than the time
 * since the resume: a held clock continued from its held value, and a clock
 * the held state had removed started from its own beginning — no catch-up.
 */
function expectContinued(held: Effects, resumed: Effects, resumedAt: number, when: string) {
  const before = clockTimes(held)
  const after = clockTimes(resumed)
  for (const name of Object.keys(before)) expect(after, `${when}: ${name} still exists`).toHaveProperty([name])
  for (const [name, time] of Object.entries(after)) {
    const moved = time - (before[name] ?? 0)
    expect(moved, `${when}: ${name} never goes back`).toBeGreaterThanOrEqual(0)
    expect(moved, `${when}: ${name} has no catch-up jump`).toBeLessThanOrEqual(resumed.now - resumedAt + FRAME_SLACK_MS)
  }
}

/** Motion is running again: every clock advances, by about the time that passed. */
async function expectRunning(page: Page, when: string) {
  const first = await readEffects(page)
  await pause(page, 400)
  const second = await readEffects(page)
  const elapsed = second.now - first.now
  const a = clockTimes(first)
  for (const [name, time] of Object.entries(clockTimes(second))) {
    const moved = time - a[name]!
    expect(moved, `${when}: ${name} runs`).toBeGreaterThan(0)
    expect(moved, `${when}: ${name} at its own rate`).toBeLessThanOrEqual(elapsed + FRAME_SLACK_MS)
  }
  return second
}

// ---------------------------------------------------------------------------
// Screens and controls.
// ---------------------------------------------------------------------------

/**
 * Focus a control and activate it by keyboard. Used for the pinned foot,
 * where an earlier pass's error toast may still lie over it for the pointer.
 */
async function press(control: Locator) {
  await control.focus()
  await expect(control).toBeFocused()
  await control.page().keyboard.press('Enter')
}

async function onGenerate(page: Page) {
  await expect(page.getByRole('heading', { level: 1, name: 'Generate', exact: true })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Anchor' })).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
}

async function generateToSettings(page: Page) {
  await page.getByRole('button', { name: 'Home' }).click()
  await expect(page).toHaveURL(/\/$/)
  await page.getByRole('button', { name: 'Settings' }).click()
  await expect(page).toHaveURL(/\/settings$/)
  await expect(page.getByRole('checkbox', { name: 'Visual effects' })).toBeVisible()
}

async function settingsToGenerate(page: Page) {
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page).toHaveURL(/\/$/)
  await press(page.getByRole('button', { name: 'Generate workout' }))
  await expect(page).toHaveURL(/\/generate/)
  await onGenerate(page)
}

/** Focus, keyboard input, loading/busy and an error with its recovery, on `/generate`. */
async function exerciseFeedback(page: Page, app: Awaited<ReturnType<typeof syntheticApp>>, when: string) {
  const chip = page.getByRole('group', { name: 'Anchor' }).getByRole('button').first()
  await chip.focus()
  await expect(chip, `${when}: focus lands`).toBeFocused()
  const pressed = await chip.getAttribute('aria-pressed')
  await page.keyboard.press('Space')
  await expect(chip, `${when}: keyboard input works`).not.toHaveAttribute('aria-pressed', pressed ?? '')
  if ((await chip.getAttribute('aria-pressed')) !== 'true') await page.keyboard.press('Space')
  await expect(chip).toHaveAttribute('aria-pressed', 'true')

  await press(page.getByRole('button', { name: /generate workout/i }))
  await expect.poll(() => app.held.length, { message: `${when}: one request in flight` }).toBe(1)
  const status = page.getByRole('main').getByRole('status').first()
  await expect(status, `${when}: loading is said`).toBeVisible()
  await expect(status, `${when}: loading is busy`).toHaveAttribute('aria-busy', 'true')

  await app.failHeld()
  const alert = page.getByRole('alert').first()
  await expect(alert, `${when}: the error is said`).toBeVisible()
  await expect(alert.getByRole('button', { name: 'Retry' }), `${when}: the error offers recovery`).toBeVisible()
  await press(page.getByRole('button', { name: 'Cancel' }).first())
  await onGenerate(page)
}

// ---------------------------------------------------------------------------
// The journey.
// ---------------------------------------------------------------------------

test.describe('JOURNEY-004 comfort transitions on actual app screens', () => {
  test('app Reduce motion persists independently, keeps static effects and honors the OS', async ({ page, comfortOrigin }) => {
    const app = await syntheticApp(page, comfortOrigin)
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto('/generate')
    await onGenerate(page)
    await generateToSettings(page)
    const effects = page.getByRole('checkbox', { name: 'Visual effects', exact: true })
    const motion = page.getByRole('checkbox', { name: 'Reduce motion', exact: true })
    await expect(effects).toBeChecked()
    await expect(motion).not.toBeChecked()
    await motion.check()
    await expect(page.locator('.clr-crt-field')).toHaveAttribute('data-motion', 'paused')
    expect(await page.locator('.clr-echo__source').count()).toBeGreaterThan(0)
    expect(await page.evaluate(() => localStorage.getItem('clear.reduce-motion'))).toBe('on')
    await page.reload()
    await expect(motion).toBeChecked()
    await expect(effects).toBeChecked()
    await motion.uncheck()
    await expect(page.locator('.clr-crt-field')).toHaveAttribute('data-motion', 'running')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(motion).toBeChecked()
    await expect(motion).toBeDisabled()
    await expect(page.getByText('Your device’s Reduce motion setting is on.')).toBeVisible()
    expect(await page.evaluate(() => localStorage.getItem('clear.reduce-motion'))).toBe('off')
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await expect(motion).not.toBeChecked()
    await expect(motion).toBeEnabled()
    await motion.check()
    await effects.uncheck()
    await expect(page.locator('.clr-crt-field')).toHaveCount(0)
    await effects.check()
    await expect(motion).toBeChecked()
    await expect(page.locator('.clr-crt-field')).toHaveAttribute('data-motion', 'paused')
    app.assertReadOnly()
  })

  test('hidden tab, reduced motion and Visual effects off/on keep the preset identities and the preserved clock, and off shows no old scanlines', async ({ page, comfortOrigin }, testInfo) => {
    test.setTimeout(180_000)
    const app = await syntheticApp(page, comfortOrigin)
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto('/generate')
    await onGenerate(page)
    // A marker that only survives if the document is never reloaded.
    await page.evaluate(() => { (window as unknown as Record<string, unknown>).__comfortJourney = 'same-document' })
    const sameDocument = () => page.evaluate(() => (window as unknown as Record<string, unknown>).__comfortJourney === 'same-document')

    // ── Effects on, motion allowed: the baseline identities. ──────────────
    await expect(page.locator('.clr-crt-field')).toHaveAttribute('data-motion', 'running')
    const baseline = await expectRunning(page, 'baseline')
    expectPresetIdentities(baseline, 'baseline')
    expectNoOldScans(baseline, 'baseline')
    expect(baseline.echo.sources, 'baseline: Echo on /generate').toBeGreaterThanOrEqual(4)
    expect(baseline.echo.sourceFilter).toContain('#clr-phosphor-echo')
    expect(baseline.atmosphere).toEqual({ count: 1, still: false })
    const looks = baseline.blobLooks
    expect(looks).toHaveLength(3)
    for (const look of looks) {
      expect(look.display).not.toBe('none')
      expect(Number(look.opacity)).toBeGreaterThan(0)
    }
    const record: Record<string, unknown> = { configuration: CRT_FIELD_CONFIG.id, echoPreset: PHOSPHOR_ECHO_PRESET, baseline }

    // ── 1. Hidden tab: nothing moves; visible: continues, no catch-up. ─────
    await setTabVisibility(page, 'hidden')
    await expect(page.locator('.clr-crt-field')).toHaveAttribute('data-motion', 'paused')
    await expect(page.locator('.clr-atmosphere')).toHaveAttribute('data-static', 'true')
    const hidden = await readEffects(page)
    expectAllStopped(hidden, 'hidden')
    await pause(page, 1_500)
    const stillHidden = await readEffects(page)
    expect(hidden.blobs.length, 'hidden: the blob clocks are held, not removed').toBeGreaterThan(0)
    expectHeld(hidden, stillHidden, 'hidden')
    const shownAt = await setTabVisibility(page, 'visible')
    await expect(page.locator('.clr-crt-field')).toHaveAttribute('data-motion', 'running')
    const shown = await readEffects(page)
    expectContinued(stillHidden, shown, shownAt, 'visible again')
    expectPresetIdentities(shown, 'visible again')
    record.hidden = { hidden, stillHidden, shownAt, shown }
    await expectRunning(page, 'visible again')

    // ── 2. OS reduced motion turns on mid-session. ─────────────────────────
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(page.locator('.clr-crt-field')).toHaveAttribute('data-motion', 'paused')
    const reduced = await readEffects(page)
    expectAllStopped(reduced, 'reduced motion')
    await pause(page, 1_000)
    const stillReduced = await readEffects(page)
    expectHeld(reduced, stillReduced, 'reduced motion: drift, grain and blobs stop together')
    expect(stillReduced.blobLooks, 'blob shapes and colours stay').toEqual(looks)
    expect(stillReduced.echo.sources, 'the static Echo stays').toBe(baseline.echo.sources)
    expectPresetIdentities(stillReduced, 'reduced motion')
    expectNoOldScans(stillReduced, 'reduced motion')
    await exerciseFeedback(page, app, 'effects on, reduced motion')
    const resumeAt = await pageNow(page)
    const beforeResume = await readEffects(page)
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await expect(page.locator('.clr-crt-field')).toHaveAttribute('data-motion', 'running')
    expect(resumeAt).toBeLessThanOrEqual(beforeResume.now)
    const motionBack = await readEffects(page)
    expectContinued(beforeResume, motionBack, beforeResume.now, 'reduced motion off')
    record.reducedMotion = { reduced, stillReduced, beforeResume, motionBack }
    await expectRunning(page, 'reduced motion off')
    await exerciseFeedback(page, app, 'effects on, motion allowed')

    // ── 3. Visual effects off in Settings, then the other screens. ─────────
    await generateToSettings(page)
    const box = page.getByRole('checkbox', { name: 'Visual effects' })
    await expect(box).toBeChecked()
    const beforeOff = await readEffects(page)
    await box.uncheck()
    await expect(box).not.toBeChecked()
    await expect(page.locator('.clr-crt-field')).toHaveCount(0)
    const offSettings = await readEffects(page)
    expect(offSettings.host).toEqual({ effects: 'off', motion: 'still' })
    expect(offSettings.field, 'off: no CRT field on Settings').toBeNull()
    expect(offSettings.echo.sources, 'off: no Echo on Settings').toBe(0)
    expectNoOldScans(offSettings, 'off on Settings')
    await expect(box, 'off: the checkbox keeps focus').toBeFocused()

    await page.getByRole('button', { name: 'Back' }).click()
    await expect(page).toHaveURL(/\/$/)
    const offHome = await readEffects(page)
    expect(offHome.field, 'off: no CRT field on Home').toBeNull()
    expect(offHome.echo.sources, 'off: no Echo on Home').toBe(0)
    expectNoOldScans(offHome, 'off on Home')
    await press(page.getByRole('button', { name: 'Generate workout' }))
    await onGenerate(page)
    const off = await readEffects(page)
    expect(off.field, 'off: no CRT field on /generate').toBeNull()
    expect(off.echo.sources, 'off: no Echo rear images on /generate').toBe(0)
    expectNoOldScans(off, 'off on /generate')
    expect(off.oldScans.framed, 'off: framed surfaces are still there').toBeGreaterThan(0)
    expect(off.atmosphere).toEqual({ count: 1, still: true })
    expect(off.blobLooks, 'off: blob shapes and colours stay').toEqual(looks)
    for (const blob of off.blobs) expect(blob.state, `off: ${blob.key}`).toBe('paused')
    await pause(page, 600)
    const stillOff = await readEffects(page)
    expectHeld(off, stillOff, 'off')
    await expect(page.getByRole('button', { name: /generate workout/i })).toBeVisible()
    await exerciseFeedback(page, app, 'effects off, motion allowed')

    // Off with reduced motion too: still usable, still no old scans.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const offReduced = await readEffects(page)
    expect(offReduced.field).toBeNull()
    expectNoOldScans(offReduced, 'off with reduced motion')
    expect(offReduced.blobLooks).toEqual(looks)
    await exerciseFeedback(page, app, 'effects off, reduced motion')
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    record.off = { beforeOff, offSettings, offHome, off, stillOff, offReduced }

    // ── Visual effects on again, without a reload. ─────────────────────────
    const heldBlobs = await readEffects(page)
    await generateToSettings(page)
    const onAt = await pageNow(page)
    await page.getByRole('checkbox', { name: 'Visual effects' }).check()
    await expect(page.locator('.clr-crt-field')).toHaveAttribute('data-motion', 'running')
    const restored = await readEffects(page)
    expectPresetIdentities(restored, 'restored on Settings')
    expectNoOldScans(restored, 'restored on Settings')
    // Both independent clocks retain phase across the off/unmounted period.
    // Allow only the active windows around the UI toggles, never the off time.
    for (const name of ['lines', 'grain'] as const) {
      const moved = restored.field![name]!.time - beforeOff.field![name]!.time
      expect(moved, `restored: ${name} did not restart`).toBeGreaterThanOrEqual(0)
      expect(moved, `restored: ${name} has no catch-up`).toBeLessThanOrEqual(
        offSettings.now - beforeOff.now + restored.now - onAt + FRAME_SLACK_MS,
      )
    }
    for (const blob of restored.blobs) {
      const before = heldBlobs.blobs.find((b) => b.key === blob.key)
      expect(before, blob.key).toBeDefined()
      expect(blob.time - before!.time, `restored: ${blob.key} continues`).toBeGreaterThanOrEqual(0)
      expect(blob.time - before!.time, `restored: ${blob.key} has no catch-up`).toBeLessThanOrEqual(restored.now - onAt + FRAME_SLACK_MS)
    }
    await settingsToGenerate(page)
    const restoredGenerate = await expectRunning(page, 'restored on /generate')
    expectPresetIdentities(restoredGenerate, 'restored on /generate')
    expect(restoredGenerate.echo.sources, 'restored: the Echo returns').toBe(baseline.echo.sources)
    expect(restoredGenerate.echo.sourceFilter).toBe(baseline.echo.sourceFilter)
    expect(restoredGenerate.atmosphere).toEqual({ count: 1, still: false })
    expect(restoredGenerate.blobLooks).toEqual(looks)
    expectNoOldScans(restoredGenerate, 'restored on /generate')
    record.restored = { onAt, restored, restoredGenerate }

    expect(await sameDocument(), 'no reload at any point').toBe(true)
    app.assertReadOnly()
    await testInfo.attach('comfort-transitions.json', {
      body: JSON.stringify(record, null, 2),
      contentType: 'application/json',
    })
  })
})
