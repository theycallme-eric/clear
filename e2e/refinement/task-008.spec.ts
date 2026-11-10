import { spawn } from 'node:child_process'
import { createServer, type AddressInfo } from 'node:net'
import { resolve } from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import type { Locator, Page, Route } from '@playwright/test'

import { readE2eEnv } from '../../scripts/e2e/env.mjs'
import { sessionSnapshotSchema, type SessionSnapshot } from '../../src/state/schemas'
import { TIMER_FRAME_LISTS, timerFramesAcceptance, timerFramesSnapshot } from '../../src/test/timer-frames-fixture'
import { fixtureLocation, onboardedProfile } from '../../src/test/user-data-double'
import { installDeterministicCapture } from '../design-0143/fixtures'
import { expect, test as scanned } from '../fixtures'

/**
 * TASK-008 (REQ-008; C22, C23, C24, C61; G06; R120, R125, R126, R133, R135,
 * R144; P05; JOURNEY-008) — the recovered smooth synchronized countdown
 * warning on the real `/workout` route, its open logging sheet and a native
 * dialog, and the accepted gallery state `/gallery/refinements?state=urgency`.
 *
 * Entry (ENTRY-008): a running session, behind the existing auth guard, on its
 * Warm-up — a 30-second timed hold with a 20-second prescribed rest — whose
 * main section holds an EMOM, a capped For Time race and every other format
 * clock (TASK-007's `src/test/timer-frames-fixture.ts`, read-only). Action:
 * advance time through ten and five seconds left, pause and resume, open and
 * close a log and a native dialog in the final five seconds, by touch and by
 * keyboard, and under reduced motion. Result, read from the browser: the
 * timer-low colour at ten seconds; in the final five of a running deadline the
 * timer and one pointer-transparent 70px urgency-a400 vignette over the whole
 * viewport breathe .2/.8/.2 on the same smooth 1.5 s cycle and the same phase,
 * over multiple cycles and numeric ticks, wherever the vignette is portalled;
 * pause and expiry end it; elapsed-only clocks stay neutral; reduced motion is
 * a steady .5; nothing is written.
 *
 * Comparable reference: the accepted gallery eded158c…'s `?state=urgency`
 * (REUSE.md: one deduplicated edge, timer and aura on one document-timeline
 * phase) and P05 (`P05-acceptance-schematic.svg`). The breathe runs on the
 * browser's real document timeline; the app's clocks run on Playwright's clock,
 * so every threshold is crossed exactly while the shared phase is sampled live.
 *
 * Synthetic and contained: an intercepted session for a fictional user.
 * Nothing is written: Rest opens the log and starts the rest without logging a
 * set, the native dialog is dismissed with Keep going, and no block result or
 * session call is made.
 */
const OWNER = '00000000-0000-4000-8000-000000000801'
const PLACE = '00000000-0000-4000-8000-000000000811'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
}
/** The browser's clock at entry; the session has run for one minute. */
const ENTRY = Date.parse('2026-11-09T09:00:00.000Z')

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
    if (code !== null) throw new Error(`Synthetic TASK-008 server exited (${code}) before ${origin} was ready`)
    try {
      if ((await fetch(origin)).ok && (await fetch(own)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((settle) => setTimeout(settle, 250))
  }
  throw new Error(`Synthetic TASK-008 origin ${origin} did not start`)
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
          VITE_SUPABASE_URL: 'https://synthetic-task-008.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-task-008-public-placeholder',
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

const PHONE_390 = { width: 390, height: 844 }
const PHONE_320 = { width: 320, height: 568 }

// ─────────────────────────────────────────────────────────────────────────────
// The synthetic app
// ─────────────────────────────────────────────────────────────────────────────

async function syntheticApp(page: Page, options: { reducedMotion?: boolean } = {}) {
  const acceptance = timerFramesAcceptance({ locationId: PLACE })
  const running: SessionSnapshot = sessionSnapshotSchema.parse(timerFramesSnapshot(acceptance, {
    userId: OWNER,
    startedAt: new Date(ENTRY - 60_000).toISOString(),
  }))
  const writes: string[] = []
  const unexpected: string[] = []
  const guard = await installDeterministicCapture(page, { skin: 'clear', reducedMotion: options.reducedMotion ?? false })
  await page.clock.install({ time: ENTRY })

  const handler = async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    const name = url.pathname.split('/').at(-1) ?? ''
    const reply = (body: unknown, status = 200) =>
      route.fulfill({ status, headers: CORS, json: body }).catch(() => undefined)
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (url.pathname.startsWith('/functions/v1/')) {
      unexpected.push(`${request.method()} ${url.pathname}`)
      return route.abort('blockedbyclient')
    }
    if (request.method() === 'GET') {
      if (name === 'profiles') return reply([onboardedProfile({ id: OWNER, goal_preset: 'balanced' })])
      if (name === 'locations') return reply([fixtureLocation({ id: PLACE, user_id: OWNER, tier: 'full', is_default: true })])
      // Every other read is an empty answer: no history, notes, anchors or favorites.
      return reply([])
    }
    if (request.method() === 'POST' && url.pathname.includes('/rpc/')) {
      if (name === 'resume_session' || name === 'session_snapshot') return reply(running)
      if (name === 'session_as_performed') return reply(null)
      if (['streak_sessions', 'constraints_in_force', 'anchor_evidence', 'conditioning_history',
        'generation_refusal_diagnostics', 'generation_candidate_sets_for_goal', 'generation_candidate_sets'].includes(name)) return reply([])
    }
    // Anything else is a write this journey must never make.
    writes.push(`${request.method()} ${url.pathname}`)
    unexpected.push(`${request.method()} ${url.pathname}`)
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic TASK-008 request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ owner }) => {
    localStorage.setItem('clear.auth.session', JSON.stringify({
      accessToken: 'synthetic-task-008-session', refreshToken: 'synthetic-task-008-refresh',
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-task-008@example.invalid' },
    }))
  }, { owner: OWNER })

  return {
    assertContained() {
      expect(unexpected, 'Every API request has an explicit synthetic disposition').toEqual([])
      expect(writes, 'No set, block result or session call is written').toEqual([])
      expect(guard.blockedGenerations()).toBe(0)
    },
  }
}

/** Layout flushed and fonts loaded, so geometry is read from the final type. */
async function settle(page: Page) {
  await page.evaluate(async () => {
    void document.body.offsetHeight
    await Promise.all([...document.fonts].map((face) => face.load().catch(() => undefined)))
    await document.fonts.ready
  })
}

/** JOURNEY-008's entry: the running session's `/workout`, on its Warm-up. */
async function openWorkout(page: Page, visit: (path: string) => Promise<void>) {
  await visit('/workout')
  await expect(page).toHaveURL(/\/workout$/)
  await expect(holdRegion(page)).toBeVisible()
  // The browser's clock is held one minute after entry; every reading below is exact.
  await page.clock.pauseAt(ENTRY + 60_000)
  await settle(page)
}

/** Time passes on the browser's own clock, and its interval repaints run. */
async function pass(page: Page, seconds: number) {
  await page.clock.runFor(seconds * 1000)
}

/** A long stretch jumped rather than ticked through; the page re-reads its clocks. */
async function jump(page: Page, seconds: number) {
  await page.clock.fastForward(seconds * 1000)
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
}

/** A touch on a control, brought to the middle of its scroller first. */
async function tap(control: Locator) {
  await control.evaluate((node) => node.scrollIntoView({ block: 'center' }))
  await control.tap()
}

/** Enter on a focused control: the keyboard's way through the journey. */
async function press(page: Page, control: Locator) {
  await control.evaluate((node) => node.scrollIntoView({ block: 'center' }))
  await control.focus()
  await page.keyboard.press('Enter')
}

function holdRegion(page: Page): Locator {
  return page.getByRole('region', { name: 'plank countdown' })
}

function holdCard(page: Page): Locator {
  return page.locator('[data-workout-card="workout"]').filter({ has: holdRegion(page) })
}

function holdTimer(page: Page): Locator {
  return holdRegion(page).getByRole('timer', { name: 'Countdown' })
}

function restTimer(page: Page): Locator {
  return page.getByRole('region', { name: 'Rest' }).getByRole('timer', { name: 'Time remaining' })
}

function sessionClock(page: Page): Locator {
  return page.getByRole('timer', { name: 'Session time' })
}

function edge(page: Page): Locator {
  return page.locator('[data-countdown-edge]')
}

async function readingOf(timer: Locator): Promise<string> {
  return /\d{1,2}:\d{2}(?::\d{2})?/.exec((await timer.textContent()) ?? '')?.[0] ?? ''
}

async function jumpToMain(page: Page, mode: 'touch' | 'keyboard' = 'touch') {
  const act = mode === 'touch' ? tap : (control: Locator) => press(page, control)
  await act(page.getByRole('button', { name: 'All sections' }))
  await act(page.getByRole('button', { name: /^Accessory, / }))
  await expect(page.getByRole('list', { name: TIMER_FRAME_LISTS.ladder })).toHaveCount(2)
  await settle(page)
}

// ─────────────────────────────────────────────────────────────────────────────
// What the warning shows, read from the browser
// ─────────────────────────────────────────────────────────────────────────────

interface Breathe {
  name: string
  startTime: number | null
  currentTime: number | null
  duration: number
  easing: string
  iterations: number
  keyframes: number[]
}

interface WarningProbe {
  viewport: { width: number; height: number }
  edges: {
    host: string
    rect: { left: number; top: number; width: number; height: number }
    ariaHidden: string | null
    pointerEvents: string
    position: string
    zIndex: string
    boxShadow: string
    background: string
    outline: string
    opacity: number
    animation: string
    loop: string | null
    breathes: Breathe[]
    children: number
  }[]
  timers: { label: string; digits: string; low: boolean; urgent: boolean; loop: string | null; opacity: number; animation: string; breathes: Breathe[] }[]
  timeline: number
  pulseMicro: number
}

/** One frame: every edge and every timer, read in the same task, so their animation times compare. */
async function probe(page: Page): Promise<WarningProbe> {
  return page.evaluate(() => {
    const breathes = (element: Element) => element.getAnimations()
      .filter((animation) => (animation as CSSAnimation).animationName === 'clr-deadline-breathe')
      .map((animation) => {
        const effect = animation.effect as KeyframeEffect
        const timing = effect.getComputedTiming()
        const tag = animation as Animation & { task008Tag?: string }
        tag.task008Tag ??= `${element.getAttribute('aria-label') ?? 'edge'}-${Math.random().toString(36).slice(2)}`
        return {
          name: tag.task008Tag,
          startTime: animation.startTime === null ? null : Number(animation.startTime),
          currentTime: animation.currentTime === null ? null : Number(animation.currentTime),
          duration: Number(timing.duration),
          easing: String(effect.getTiming().easing ?? ''),
          iterations: Number(timing.iterations),
          keyframes: effect.getKeyframes().map((frame) => Number(frame.opacity)),
        }
      })
    const describeHost = (element: Element) => {
      const parent = element.parentElement
      if (parent === document.body) return 'body'
      if (parent instanceof HTMLDialogElement) return `dialog:${parent.open ? 'open' : 'closed'}:${parent.querySelector('h2')?.textContent ?? ''}`
      return parent?.tagName.toLowerCase() ?? 'none'
    }
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      edges: [...document.querySelectorAll<HTMLElement>('[data-countdown-edge]')].map((node) => {
        const style = getComputedStyle(node)
        const rect = node.getBoundingClientRect()
        return {
          host: describeHost(node),
          rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
          ariaHidden: node.getAttribute('aria-hidden'),
          pointerEvents: style.pointerEvents,
          position: style.position,
          zIndex: style.zIndex,
          boxShadow: style.boxShadow,
          background: style.backgroundColor,
          outline: style.outlineStyle,
          opacity: Number(style.opacity),
          animation: `${style.animationName} ${style.animationDuration} ${style.animationTimingFunction} ${style.animationIterationCount}`,
          loop: node.getAttribute('data-loop'),
          breathes: breathes(node),
          children: node.childElementCount,
        }
      }),
      timers: [...document.querySelectorAll<HTMLElement>('[role="timer"]')]
        .filter((timer) => timer.getClientRects().length > 0)
        .map((timer) => {
          const style = getComputedStyle(timer)
          return {
            label: timer.getAttribute('aria-label') ?? '',
            digits: /\d{1,2}:\d{2}(?::\d{2})?/.exec(timer.textContent ?? '')?.[0] ?? '',
            low: timer.parentElement?.hasAttribute('data-low') ?? false,
            urgent: timer.getAttribute('data-urgent') === 'true',
            loop: timer.getAttribute('data-loop'),
            opacity: Number(style.opacity),
            animation: `${style.animationName} ${style.animationDuration} ${style.animationTimingFunction} ${style.animationIterationCount}`,
            breathes: breathes(timer),
          }
        }),
      timeline: Number(document.timeline.currentTime),
      pulseMicro: document.querySelectorAll('.clr-pulse-micro').length,
    }
  })
}

const BREATHE_ANIMATION = 'clr-deadline-breathe 1.5s ease-in-out infinite'
const OPACITY_TOLERANCE = 0.001

/**
 * C22 / AC-R008-01 / AC-R008-04: exactly one decorative, pointer-transparent,
 * soft 70px urgency-a400 inset vignette over the whole viewport — no hard
 * outline, no fill — on the shared smooth breathe (or still).
 */
function expectOneSoftEdge(frame: WarningProbe, host: string | RegExp, label: string, still = false) {
  expect(frame.edges, `${label}: exactly one edge`).toHaveLength(1)
  const [one] = frame.edges
  if (typeof host === 'string') expect(one.host, `${label}: host`).toBe(host)
  else expect(one.host, `${label}: host`).toMatch(host)
  expect(one.ariaHidden, `${label}: decorative`).toBe('true')
  expect(one.pointerEvents, `${label}: pointer transparent`).toBe('none')
  expect(one.position, `${label}: fixed to the viewport`).toBe('fixed')
  expect(one.rect, `${label}: covers the viewport`).toEqual({ left: 0, top: 0, width: frame.viewport.width, height: frame.viewport.height })
  // A soft 70px inset shadow in urgency-a400 (alpha .4); no spread, so no hard outline.
  expect(one.boxShadow, `${label}: soft vignette`).toMatch(/^(?:rgba?|color)\(.+?(?:0\.4|\/ 0\.4)\)\s+0px 0px 70px 0px inset$/)
  expect(one.background, `${label}: no fill`).toBe('rgba(0, 0, 0, 0)')
  expect(one.outline, `${label}: no outline`).toBe('none')
  expect(one.children, `${label}: draws nothing inside`).toBe(0)
  expect(frame.pulseMicro, `${label}: no stepped micro-pulse anywhere`).toBe(0)
  if (still) {
    expect(one.loop, `${label}: still`).toBe('still')
    expect(one.animation.startsWith('none '), `${label}: no animation`).toBe(true)
    expect(one.opacity, `${label}: steady .5`).toBe(0.5)
    expect(one.breathes, `${label}: no breathe`).toEqual([])
  } else {
    expect(one.loop, `${label}: on the running loop`).toBe('run')
    expect(one.animation, `${label}: the smooth breathe`).toBe(BREATHE_ANIMATION)
    expect(one.breathes, `${label}: one breathe`).toHaveLength(1)
    expect(one.breathes[0]).toMatchObject({ duration: 1500, iterations: Infinity, keyframes: [0.2, 0.8, 0.2] })
  }
}

/**
 * C61 / AC-R008-02 / P05: every urgent timer and the edge breathe on the same
 * keyframes, duration and easing, pinned to the document timeline's epoch, so
 * at any instant they are at the same point of the same cycle.
 */
function expectOnePhase(frame: WarningProbe, label: string) {
  const urgent = frame.timers.filter((timer) => timer.urgent)
  expect(urgent.length, `${label}: an urgent timer`).toBeGreaterThan(0)
  const [one] = frame.edges
  const all = [...urgent.map((timer) => ({ who: timer.label, ...timer })), { who: 'edge', ...one }]
  for (const part of all) {
    expect(part.loop, `${label}: ${part.who} runs`).toBe('run')
    expect(part.animation, `${label}: ${part.who} breathe`).toBe(BREATHE_ANIMATION)
    expect(part.breathes, `${label}: ${part.who} one breathe`).toHaveLength(1)
    expect(part.breathes[0].startTime, `${label}: ${part.who} on the timeline's epoch`).toBe(0)
    expect(part.breathes[0].currentTime, `${label}: ${part.who} same point of the cycle`).toBe(one.breathes[0].currentTime)
    expect(Math.abs(part.opacity - one.opacity), `${label}: ${part.who} same brightness as the aura`).toBeLessThanOrEqual(OPACITY_TOLERANCE)
    expect(part.opacity).toBeGreaterThanOrEqual(0.2 - OPACITY_TOLERANCE)
    expect(part.opacity).toBeLessThanOrEqual(0.8 + OPACITY_TOLERANCE)
  }
}

function timerNamed(frame: WarningProbe, label: string, index = 0) {
  return frame.timers.filter((timer) => timer.label === label)[index]
}

/**
 * C24: an element at a point, with the decorative edge made hit-testable for
 * the probe only (and restored), so the topmost painted layer is the answer.
 */
async function edgeIsTopmost(page: Page): Promise<boolean[]> {
  return page.evaluate(() => {
    const node = document.querySelector<HTMLElement>('[data-countdown-edge]')
    if (node === null) return []
    const { innerWidth: w, innerHeight: h } = window
    const points = [[2, 2], [w - 3, 2], [2, h - 3], [w - 3, h - 3], [w / 2, h / 2], [w / 2, h * 0.8]]
    node.style.pointerEvents = 'auto'
    try {
      return points.map(([x, y]) => document.elementFromPoint(x, y) === node)
    } finally {
      node.style.pointerEvents = ''
    }
  })
}

async function storageSnapshot(page: Page): Promise<Record<string, string | null>> {
  return page.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)])))
}

async function attach(page: Page, name: string, options: { animations?: 'allow' | 'disabled' } = {}) {
  await settle(page)
  const body = await page.screenshot({ caret: 'hide', animations: options.animations ?? 'allow' })
  await test.info().attach(`${name}.png`, { body, contentType: 'image/png' })
}

async function attachJson(name: string, value: unknown) {
  await test.info().attach(`${name}.json`, { body: JSON.stringify(value, null, 2), contentType: 'application/json' })
}

/**
 * axe over the journey's screen after an interaction: every rule on every node,
 * with one pre-existing finding held to exactly itself — the read-only ladder
 * rung row's `scrollable-region-focusable` (TASK-006's note: TASK-012/013's).
 */
async function checkJourneyA11y(page: Page) {
  const rest = await new AxeBuilder({ page }).disableRules(['scrollable-region-focusable']).analyze()
  expect(rest.violations.map((violation) => ({ id: violation.id, nodes: violation.nodes.map((node) => node.target.join(' ')) }))).toEqual([])
  const scroll = await new AxeBuilder({ page }).withRules(['scrollable-region-focusable']).analyze()
  const flagged = scroll.violations.flatMap((violation) => violation.nodes.map((node) => node.target.join(' ')))
  expect(flagged.every((target) => target === '.clr-rail__scroller'), JSON.stringify(flagged)).toBe(true)
}

// ─────────────────────────────────────────────────────────────────────────────

test.describe('TASK-008 recovered smooth synchronized countdown warning', () => {
  test('JOURNEY-008 touch phone-390: a running countdown takes the colour at 10 and one soft edge at 5, breathing in phase with its timer over multiple cycles and numeric ticks; pause and expiry end it; elapsed-only clocks stay neutral', async ({ page, visit }) => {
    test.setTimeout(180_000)
    await page.setViewportSize(PHONE_390)
    const app = await syntheticApp(page)
    await openWorkout(page, visit)

    await tap(holdRegion(page).getByRole('button', { name: 'Start' }))
    await pass(page, 19)
    let frame = await probe(page)
    expect(timerNamed(frame, 'Countdown')).toMatchObject({ digits: '00:11', low: false, urgent: false })
    expect(frame.edges).toEqual([])

    // Ten seconds left: the timer-low colour, and nothing more.
    await pass(page, 1)
    frame = await probe(page)
    expect(timerNamed(frame, 'Countdown')).toMatchObject({ digits: '00:10', low: true, urgent: false, loop: null })
    expect(frame.edges).toEqual([])
    await expect(holdTimer(page)).toHaveClass(/clr-chamfer--timer-low/)
    await attach(page, 'hold-colour-10-phone-390')
    await pass(page, 4)
    frame = await probe(page)
    expect(timerNamed(frame, 'Countdown')).toMatchObject({ digits: '00:06', low: true, urgent: false })
    expect(frame.edges).toEqual([])

    // Five seconds left: one soft edge, breathing with the timer.
    const before = await storageSnapshot(page)
    await pass(page, 1)
    frame = await probe(page)
    expect(timerNamed(frame, 'Countdown')).toMatchObject({ digits: '00:05', low: true, urgent: true })
    expectOneSoftEdge(frame, 'body', 'hold at 5')
    expectOnePhase(frame, 'hold at 5')
    expect(timerNamed(frame, 'Session time')).toMatchObject({ low: false, urgent: false, loop: null })
    await expect(holdRegion(page).getByRole('status')).toHaveText('Final 5 seconds')
    await attach(page, 'hold-edge-5-phone-390')

    // Multiple cycles of the real 1.5 s breathe across numeric ticks (05 → 02):
    // the same two animations throughout, always at the same point of the cycle.
    const samples: WarningProbe[] = []
    for (let index = 0; index < 13; index += 1) {
      await page.waitForTimeout(280)
      samples.push(await probe(page))
      if (index % 4 === 3) await pass(page, 1)
    }
    const names = new Set<string>()
    for (const [index, sample] of samples.entries()) {
      expectOneSoftEdge(sample, 'body', `sample ${index}`)
      expectOnePhase(sample, `sample ${index}`)
      names.add(sample.edges[0].breathes[0].name)
      names.add(timerNamed(sample, 'Countdown').breathes[0].name)
    }
    expect(names.size, 'numeric ticks never restart either breathe').toBe(2)
    expect(new Set(samples.map((sample) => timerNamed(sample, 'Countdown').digits))).toEqual(new Set(['00:05', '00:04', '00:03', '00:02']))
    expect(samples.at(-1)!.timeline - samples[0].timeline, 'more than two 1.5 s cycles').toBeGreaterThan(3000)
    const opacities = samples.map((sample) => sample.edges[0].opacity)
    expect(new Set(opacities.map((value) => value.toFixed(3))).size, 'a smooth cycle, not a two-step pulse').toBeGreaterThanOrEqual(6)
    expect(Math.max(...opacities) - Math.min(...opacities), 'brightening and fading').toBeGreaterThan(0.3)
    await attachJson('phase-samples-hold-phone-390', samples.map((sample) => ({
      timeline: sample.timeline,
      digits: timerNamed(sample, 'Countdown').digits,
      edge: sample.edges[0].opacity,
      timer: timerNamed(sample, 'Countdown').opacity,
      edgeCurrentTime: sample.edges[0].breathes[0].currentTime,
      timerCurrentTime: timerNamed(sample, 'Countdown').breathes[0].currentTime,
    })))
    // The warning records nothing: only time passed, and storage is unchanged.
    expect(await storageSnapshot(page)).toEqual(before)

    // Paused at two seconds left: the colour holds, the breathe and the edge stop.
    await tap(holdRegion(page).getByRole('button', { name: 'Pause' }))
    await expect(edge(page)).toHaveCount(0)
    await pass(page, 10)
    frame = await probe(page)
    expect(timerNamed(frame, 'Countdown')).toMatchObject({ digits: '00:02', low: true, urgent: false, loop: null })
    expect(frame.edges).toEqual([])
    expect(timerNamed(frame, 'Countdown').breathes).toEqual([])

    // Resumed: the edge comes back on the same epoch as its timer.
    await tap(holdRegion(page).getByRole('button', { name: 'Start' }))
    await expect(edge(page)).toHaveCount(1)
    frame = await probe(page)
    expectOneSoftEdge(frame, 'body', 'resumed')
    expectOnePhase(frame, 'resumed')

    // Expired: the warning is over; the words say so.
    await pass(page, 3)
    frame = await probe(page)
    expect(timerNamed(frame, 'Countdown')).toMatchObject({ digits: '00:00', low: false, urgent: false })
    expect(frame.edges).toEqual([])
    await expect(holdRegion(page).getByRole('status')).toHaveText('Countdown done')
    expect(timerNamed(frame, 'Session time')).toMatchObject({ low: false, urgent: false })
    await page.clock.resume()
    await checkJourneyA11y(page)
    app.assertContained()
  })

  test('JOURNEY-008 touch phone-390: with the log open and then a native dialog open, one pointer-transparent edge covers the viewport above them, moves into the dialog\'s top layer and back on the same phase, and nothing is written', async ({ page, visit }) => {
    test.setTimeout(180_000)
    await page.setViewportSize(PHONE_390)
    const app = await syntheticApp(page)
    await openWorkout(page, visit)

    // The hold runs; thirteen seconds in, Rest opens the log with its 20-second rest.
    await tap(holdRegion(page).getByRole('button', { name: 'Start' }))
    await pass(page, 13)
    await tap(holdCard(page).getByRole('button', { name: 'Rest', exact: true }))
    const log = page.getByRole('form', { name: /^Log set 1 of plank$/i })
    await expect(log).toBeVisible()
    await pass(page, 10)
    expect([await readingOf(holdTimer(page)), await readingOf(restTimer(page))]).toEqual(['00:07', '00:10'])
    await expect(edge(page)).toHaveCount(0)

    // Both deadlines in their final five: the hold behind the log and the rest in it.
    const before = await storageSnapshot(page)
    await pass(page, 5)
    let frame = await probe(page)
    expect(timerNamed(frame, 'Countdown')).toMatchObject({ digits: '00:02', urgent: true })
    expect(timerNamed(frame, 'Time remaining')).toMatchObject({ digits: '00:05', urgent: true })
    expectOneSoftEdge(frame, 'body', 'open log')
    expectOnePhase(frame, 'open log')
    expect(await edgeIsTopmost(page), 'the edge paints above the open log').toEqual([true, true, true, true, true, true])
    expect(await storageSnapshot(page)).toEqual(before)
    await attach(page, 'log-open-edge-phone-390')
    const bodyEdge = frame.edges[0].breathes[0].name

    // A native dialog opens over everything: the one edge moves into its top layer.
    await tap(page.getByRole('button', { name: 'Actions' }))
    await tap(page.getByRole('button', { name: 'Abandon' }))
    const dialog = page.getByRole('dialog', { name: 'Abandon workout?' })
    await expect(dialog).toBeVisible()
    await expect(edge(page)).toHaveCount(1)
    await expect.poll(async () => (await probe(page)).edges[0]?.host).toBe('dialog:open:Abandon workout?')
    frame = await probe(page)
    expectOneSoftEdge(frame, 'dialog:open:Abandon workout?', 'native dialog')
    expectOnePhase(frame, 'native dialog')
    expect(frame.edges[0].breathes[0].name, 'a new element, pinned to the same epoch').not.toBe(bodyEdge)
    expect(await edgeIsTopmost(page), 'the edge paints above the native dialog').toEqual([true, true, true, true, true, true])
    await attach(page, 'dialog-edge-phone-390')

    // Dismissed: back on the body, still one edge, still the same phase. The
    // dialog's own 200 ms exit runs on the page's clock: one second passes.
    await tap(dialog.getByRole('button', { name: 'Keep going' }))
    await pass(page, 1)
    await expect(dialog).toBeHidden()
    await expect.poll(async () => (await probe(page)).edges[0]?.host).toBe('body')
    frame = await probe(page)
    expect(timerNamed(frame, 'Countdown')).toMatchObject({ digits: '00:01', urgent: true })
    expect(timerNamed(frame, 'Time remaining')).toMatchObject({ digits: '00:04', urgent: true })
    expectOneSoftEdge(frame, 'body', 'dialog closed')
    expectOnePhase(frame, 'dialog closed')

    // The hold runs out: the rest alone owns the one edge, on the same phase.
    await pass(page, 1)
    frame = await probe(page)
    expect(timerNamed(frame, 'Countdown')).toMatchObject({ digits: '00:00', low: false, urgent: false })
    expect(timerNamed(frame, 'Time remaining')).toMatchObject({ digits: '00:03', urgent: true })
    expectOneSoftEdge(frame, 'body', 'rest alone')
    expectOnePhase(frame, 'rest alone')

    // Minimised in the final seconds: the rest moves to the footer, the edge stays one.
    await tap(page.getByRole('button', { name: 'Minimize' }))
    await expect(log).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Rest' })).toHaveCount(1)
    await expect(edge(page)).toHaveCount(1)
    frame = await probe(page)
    expectOneSoftEdge(frame, 'body', 'minimised')
    expectOnePhase(frame, 'minimised')

    // The rest runs out: nothing urgent is left behind, and nothing was written.
    await pass(page, 4)
    await expect(page.getByRole('region', { name: 'Rest' })).toHaveCount(0)
    await expect(edge(page)).toHaveCount(0)
    await expect(page.locator('[data-urgent]')).toHaveCount(0)
    expect(await storageSnapshot(page)).toEqual(before)
    await page.clock.resume()
    await checkJourneyA11y(page)
    app.assertContained()
  })

  test('JOURNEY-008 keyboard phone-390: an EMOM minute and a count-up cap warn on their own remaining time; pause stops the edge, resume brings it back in phase, and the cap ends it', async ({ page, visit }) => {
    test.setTimeout(180_000)
    await page.setViewportSize(PHONE_390)
    const app = await syntheticApp(page)
    await openWorkout(page, visit)
    await jumpToMain(page, 'keyboard')

    const emomCard = page.locator('[data-workout-card="workout"]').filter({ has: page.getByRole('list', { name: TIMER_FRAME_LISTS.emom }) })
    const emomStack = page.locator('main .clr-stack').filter({ has: emomCard }).last()
    const emomTimer = emomStack.getByRole('timer', { name: 'Time remaining' })

    // The EMOM's minute: colour at ten, the edge at five, reset at the boundary.
    await press(page, emomCard.getByRole('button', { name: 'Start EMOM' }))
    await expect(emomCard.getByRole('button', { name: 'Pause' })).toBeFocused()
    await pass(page, 49)
    expect(await readingOf(emomTimer)).toBe('00:11')
    await expect(emomTimer.locator('xpath=..')).not.toHaveAttribute('data-low')
    await pass(page, 1)
    await expect(emomTimer.locator('xpath=..')).toHaveAttribute('data-low', 'true')
    await expect(edge(page)).toHaveCount(0)
    await pass(page, 5)
    expect(await readingOf(emomTimer)).toBe('00:05')
    let frame = await probe(page)
    expectOneSoftEdge(frame, 'body', 'EMOM at 5')
    expectOnePhase(frame, 'EMOM at 5')
    await pass(page, 5)
    expect(await readingOf(emomTimer)).toBe('01:00')
    await expect(edge(page)).toHaveCount(0)
    await expect(emomTimer).not.toHaveAttribute('data-urgent')
    // Held at the top of minute two, so the race is the only deadline below.
    await press(page, emomCard.getByRole('button', { name: 'Pause' }))
    await expect(emomCard.getByRole('button', { name: 'Resume' })).toBeFocused()

    // The For Time race counts up toward its 15:00 cap and warns on the cap.
    const forTimeCard = page.locator('[data-workout-card="workout"]').filter({ has: page.getByRole('list', { name: TIMER_FRAME_LISTS.for_time }).filter({ hasText: /wall ball/i }) })
    const forTimeStack = page.locator('main .clr-stack').filter({ has: forTimeCard }).last()
    const race = forTimeStack.getByRole('timer', { name: 'Block time' })
    await press(page, forTimeCard.getByRole('button', { name: 'Start For Time' }))
    await jump(page, 880)
    await pass(page, 9)
    expect(await readingOf(race)).toBe('14:49')
    await expect(race.locator('xpath=..')).not.toHaveAttribute('data-low')
    await pass(page, 1)
    expect(await readingOf(race)).toBe('14:50')
    await expect(race.locator('xpath=..')).toHaveAttribute('data-low', 'true')
    await expect(forTimeStack.getByText('Cap in 00:10 — finish now')).toBeVisible()
    await expect(edge(page)).toHaveCount(0)
    await pass(page, 5)
    expect(await readingOf(race)).toBe('14:55')
    frame = await probe(page)
    expect(timerNamed(frame, 'Block time')).toMatchObject({ digits: '14:55', urgent: true })
    expectOneSoftEdge(frame, 'body', 'cap at 5')
    expectOnePhase(frame, 'cap at 5')
    // The held EMOM and the elapsed-only session clock stay out of it.
    expect(frame.timers.filter((timer) => timer.urgent).map((timer) => timer.label)).toEqual(['Block time'])
    expect(timerNamed(frame, 'Session time')).toMatchObject({ low: false, urgent: false })
    await attach(page, 'cap-edge-5-phone-390')

    // Paused three seconds before the cap: frozen, coloured, no edge.
    await pass(page, 2)
    await press(page, forTimeCard.getByRole('button', { name: 'Pause' }))
    await pass(page, 60)
    expect(await readingOf(race)).toBe('14:57')
    await expect(race.locator('xpath=..')).toHaveAttribute('data-low', 'true')
    await expect(edge(page)).toHaveCount(0)
    await expect(race).not.toHaveAttribute('data-urgent')

    // Resumed by keyboard: the edge returns, in phase with the race.
    await press(page, forTimeCard.getByRole('button', { name: 'Resume' }))
    await expect(edge(page)).toHaveCount(1)
    await expect(race).toHaveAttribute('data-loop', 'run')
    frame = await probe(page)
    expectOneSoftEdge(frame, 'body', 'cap resumed')
    expectOnePhase(frame, 'cap resumed')

    // The cap ends the warning; "Cap reached" keeps its own outcome colour, still.
    await pass(page, 4)
    await expect(forTimeStack.getByText('Cap reached')).toBeVisible()
    expect(await readingOf(race)).toBe('15:00')
    await expect(edge(page)).toHaveCount(0)
    await expect(race).not.toHaveAttribute('data-urgent')
    await expect(race).toHaveClass(/clr-chamfer--timer-low/)
    await page.clock.resume()
    await checkJourneyA11y(page)
    app.assertContained()
  })

  test('JOURNEY-008 reduced motion phone-320: the urgent timer and the one edge hold a steady .5 with no animation, cover the narrow viewport, and lose no word, digit or colour', async ({ page, visit }) => {
    test.setTimeout(120_000)
    await page.setViewportSize(PHONE_320)
    const app = await syntheticApp(page, { reducedMotion: true })
    await openWorkout(page, visit)

    await tap(holdRegion(page).getByRole('button', { name: 'Start' }))
    await pass(page, 25)
    // Reduced motion collapses every transition to 0.01 ms (a11y.css): read the settled frame.
    await expect.poll(() => holdTimer(page).evaluate((node) => getComputedStyle(node).opacity)).toBe('0.5')
    const frame = await probe(page)
    const hold = timerNamed(frame, 'Countdown')
    expect(hold).toMatchObject({ digits: '00:05', low: true, urgent: true, loop: 'still', opacity: 0.5, breathes: [] })
    expect(hold.animation.startsWith('none ')).toBe(true)
    expectOneSoftEdge(frame, 'body', 'reduced motion', true)
    expect(frame.viewport).toEqual(PHONE_320)
    await expect(holdRegion(page).getByRole('status')).toHaveText('Final 5 seconds')
    await expect(holdTimer(page)).toHaveClass(/clr-chamfer--timer-low/)
    await expect(holdTimer(page)).toContainText('5 seconds left')
    await expect(sessionClock(page)).not.toHaveAttribute('data-urgent')
    expect(await page.evaluate(() => document.getAnimations()
      .filter((animation) => (animation as CSSAnimation).animationName === 'clr-deadline-breathe').length)).toBe(0)
    await attach(page, 'reduced-motion-edge-phone-320')
    await page.clock.resume()
    await checkJourneyA11y(page)
    app.assertContained()
  })

  test('JOURNEY-008 gallery urgency phone-390: the warning through the shared owner — held at 10 and 5, run into its last five, a count-up cap, an open native log with one edge in phase, and the still preview — with no network', async ({ page, visit }) => {
    test.setTimeout(120_000)
    await page.setViewportSize(PHONE_390)
    await installDeterministicCapture(page, { skin: 'clear', reducedMotion: false })
    await page.clock.install({ time: ENTRY })
    const requests: string[] = []
    page.on('request', (request) => {
      if (/\/(rest|auth|functions)\/v1\//.test(request.url())) requests.push(`${request.method()} ${request.url()}`)
    })

    await visit('/gallery/refinements?state=urgency')
    const state = page.locator('[data-refinement-state="urgency"]')
    await expect(state.getByRole('heading', { name: /^Countdown warning and whole timer frames/ })).toBeVisible()
    await page.clock.pauseAt(ENTRY + 10_000)
    const demo = state.locator('[data-gallery-deadline-warning]')
    const cue = demo.getByRole('timer').first()

    // Held at ten and at five: the colour, never the edge.
    await tap(demo.getByRole('button', { name: 'Inspect 10 seconds' }))
    await expect(cue.locator('xpath=..')).toHaveAttribute('data-low', 'true')
    await tap(demo.getByRole('button', { name: 'Inspect 5 seconds' }))
    expect(await readingOf(cue)).toBe('00:05')
    await expect(edge(page)).toHaveCount(0)
    await expect(cue).not.toHaveAttribute('data-urgent')

    // Run: the breathe and the one edge, in phase.
    await tap(demo.getByRole('button', { name: 'Run countdown' }))
    await expect(edge(page)).toHaveCount(1)
    await expect(cue).toHaveAttribute('data-loop', 'run')
    let frame = await probe(page)
    expectOneSoftEdge(frame, 'body', 'gallery running')
    expectOnePhase(frame, 'gallery running')
    await attach(page, 'gallery-urgency-edge-phone-390')

    // The count-up race toward its cap reads the same deadline: cap minus elapsed.
    await tap(demo.getByRole('button', { name: 'Show count-up cap' }))
    await expect(cue).toHaveAccessibleName('Block time')
    expect(await readingOf(cue)).toBe('00:55')
    frame = await probe(page)
    expectOnePhase(frame, 'gallery cap')

    // An open native log over the warning: two timers, one edge in its top layer.
    await tap(demo.getByRole('button', { name: 'Open log over the warning' }))
    const dialog = page.getByRole('dialog', { name: 'Log set' })
    await expect(dialog).toBeVisible()
    await expect.poll(async () => (await probe(page)).edges[0]?.host).toBe('dialog:open:Log set')
    frame = await probe(page)
    expectOneSoftEdge(frame, 'dialog:open:Log set', 'gallery log')
    expectOnePhase(frame, 'gallery log')
    expect(frame.timers.filter((timer) => timer.urgent)).toHaveLength(2)
    expect(await edgeIsTopmost(page)).toEqual([true, true, true, true, true, true])
    await attach(page, 'gallery-urgency-log-phone-390')
    await tap(dialog.getByRole('button', { name: 'Close log' }))
    // The dialog's own 200 ms exit runs on the page's clock.
    await pass(page, 0.5)
    await expect(dialog).toBeHidden()
    await expect.poll(async () => (await probe(page)).edges[0]?.host).toBe('body')

    // The still preview: a steady .5 on the timer and the edge, no animation.
    await tap(demo.getByRole('checkbox', { name: 'Still preview (reduced motion)' }))
    await expect(edge(page)).toHaveAttribute('data-loop', 'still')
    frame = await probe(page)
    expectOneSoftEdge(frame, 'body', 'gallery still', true)
    // The demonstration's own timer: the urgent one (the race specimens above are held).
    expect(frame.timers.filter((timer) => timer.urgent)).toEqual([
      expect.objectContaining({ label: 'Block time', urgent: true, loop: 'still', opacity: 0.5, breathes: [] }),
    ])
    await attach(page, 'gallery-urgency-still-phone-390')
    await tap(demo.getByRole('checkbox', { name: 'Still preview (reduced motion)' }))

    // Pause ends the edge; the elapsed-only session clock never warns.
    await tap(demo.getByRole('button', { name: 'Pause' }))
    await expect(edge(page)).toHaveCount(0)
    await expect(cue.locator('xpath=..')).toHaveAttribute('data-low', 'true')
    frame = await probe(page)
    for (const session of frame.timers.filter((timer) => timer.label === 'Session time')) {
      expect(session).toMatchObject({ low: false, urgent: false })
    }
    expect(requests, 'the gallery reads and writes nothing over the network').toEqual([])
  })
})
