/**
 * Effects TASK-009 (REQ-008) — Visual effects performance, off against on, in
 * a real browser, on the same flows and the same build.
 *
 * The spec builds this workspace once (`vite build` into a temporary folder)
 * and serves that build with `vite preview` on its own port, with synthetic
 * Supabase values. Data is intercepted and read-only: no write, no model call,
 * nothing leaves the origin. Generation requests are held (busy) and then
 * failed with a 503 (error), so those states are controlled previews rather
 * than live generation. Service workers are blocked so every run starts cold.
 *
 * Runs alternate off/on in fresh contexts (off, on, on, off, off, on). Each run
 * records: cold and warm load, tap- and key-to-next-frame on real controls
 * (Anchor chip, Intensity slider, Visual effects checkbox), Event Timing
 * entries, frame pacing idle / scrolling / busy / error / Home, long tasks per
 * phase, navigation timings, Chromium's JS heap and DevTools Performance
 * metrics, and the renderer the browser reports.
 *
 * Nothing is judged. No threshold was set, so none is enforced: the spec fails
 * only when a required identity field or raw-measurement record is missing, or
 * when a run is not what it claims to be (the field absent with effects on,
 * present with effects off, or a write leaving the page). The record lives in
 * `docs/effects/performance.md`; this run's JSON is attached to the report.
 * No shared Playwright configuration is read for anything but the project's
 * device, and none is changed.
 */
import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { arch, cpus, platform, release, tmpdir, totalmem } from 'node:os'
import { join, resolve } from 'node:path'

import type { Browser, CDPSession, Locator, Page, Route } from '@playwright/test'

import { fixtureLocation, onboardedProfile } from '../../src/test/user-data-double'
import { CRT_FIELD_CONFIG, CRT_FIELD_REFERENCE } from '../../src/ui/crt-field/config'
import { PHOSPHOR_ECHO_PRESET, PHOSPHOR_ECHO_PRESET_PROVENANCE } from '../../src/ui/phosphor-echo-preset'
import { expect, test as base } from '../fixtures'

// ---------------------------------------------------------------------------
// This task's own build and origin.
// ---------------------------------------------------------------------------

const ROOT = resolve(import.meta.dirname, '../..')
const VITE = resolve(ROOT, 'node_modules/vite/bin/vite.js')
const SYNTHETIC_ENV = {
  VITE_SUPABASE_URL: 'https://synthetic-performance.supabase.invalid',
  VITE_SUPABASE_ANON_KEY: 'synthetic-performance-public-placeholder',
}

interface Build { origin: string; outDir: string; builtAt: string; assets: Record<string, string> }

async function waitForOrigin(origin: string, deadline: number) {
  while (Date.now() < deadline) {
    try {
      if ((await fetch(origin)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((settle) => setTimeout(settle, 250))
  }
  throw new Error(`performance origin ${origin} did not start`)
}

function sha256(bytes: Buffer | string) {
  return createHash('sha256').update(bytes).digest('hex')
}

const test = base.extend<object, { perfBuild: Build }>({
  perfBuild: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use, workerInfo) => {
      const outDir = mkdtempSync(join(tmpdir(), 'clear-perf-build-'))
      execFileSync(process.execPath, [VITE, 'build', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'error'], {
        cwd: ROOT, env: { ...process.env, ...SYNTHETIC_ENV }, stdio: 'ignore',
      })
      const builtAt = new Date().toISOString()
      const assets: Record<string, string> = { 'index.html': sha256(readFileSync(join(outDir, 'index.html'))) }
      for (const name of readdirSync(join(outDir, 'assets')).filter((n) => /\.(js|css)$/.test(n)).sort()) {
        assets[`assets/${name}`] = sha256(readFileSync(join(outDir, 'assets', name)))
      }
      const port = 5860 + workerInfo.parallelIndex
      const origin = `http://localhost:${port}`
      const server = spawn(process.execPath, [VITE, 'preview', '--outDir', outDir, '--port', String(port), '--strictPort'], {
        cwd: ROOT, env: { ...process.env, ...SYNTHETIC_ENV }, stdio: 'ignore',
      })
      const closed = new Promise<void>((settle) => {
        server.once('exit', () => settle())
        server.once('error', () => settle())
      })
      try {
        await waitForOrigin(origin, Date.now() + 60_000)
        await use({ origin, outDir, builtAt, assets })
      } finally {
        server.kill()
        await closed
        rmSync(outDir, { recursive: true, force: true })
      }
    },
    { scope: 'worker', timeout: 240_000 },
  ],
})

test.use({ serviceWorkers: 'block' })

// ---------------------------------------------------------------------------
// Synthetic, read-only data; generation held, then failed.
// ---------------------------------------------------------------------------

const OWNER = '00000000-0000-4000-8000-000000000091'
const HOME_ID = '00000000-0000-4000-8000-000000000092'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
}

async function syntheticApp(page: Page, origin: string, effects: Mode) {
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
  await page.addInitScript(({ owner, effects }) => {
    if (sessionStorage.getItem('perf-seeded')) return
    sessionStorage.setItem('perf-seeded', '1')
    localStorage.setItem('clear.auth.session', JSON.stringify({
      accessToken: 'synthetic-performance-session', refreshToken: 'synthetic-performance-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-performance@example.invalid' },
    }))
    localStorage.setItem('clear.skin', 'clear')
    localStorage.setItem('clear.visual-effects', effects)
  }, { owner: OWNER, effects })

  return {
    held,
    async failHeld() {
      const route = held.shift()
      expect(route, 'a generation request is held').toBeDefined()
      await route!.fulfill({ status: 503, headers: CORS, json: { error: 'synthetic outage' } })
    },
    assertReadOnly() {
      expect(writes, 'no write and no model call').toEqual([])
      expect(outbound, 'nothing leaves the local origin').toEqual([])
    },
  }
}

// ---------------------------------------------------------------------------
// In-page instruments, installed before the app runs on every document.
// ---------------------------------------------------------------------------

function instrument() {
  const w = window as unknown as Record<string, unknown>
  const longTasks: number[] = []
  const events: { name: string; duration: number; processing: number; delay: number }[] = []
  const lcp: number[] = []
  w.__perf = { longTasks, events, lcp, readyAt: null as number | null }
  const observe = (type: string, onEntry: (entry: PerformanceEntry) => void, extra: Record<string, unknown> = {}) => {
    try {
      new PerformanceObserver((list) => list.getEntries().forEach(onEntry)).observe({ type, buffered: true, ...extra })
    } catch {
      // Not supported here: the list stays empty and the record says so.
    }
  }
  observe('longtask', (e) => longTasks.push(Math.round(e.duration * 10) / 10))
  observe('largest-contentful-paint', (e) => lcp.push(Math.round(e.startTime * 10) / 10))
  observe('event', (e) => {
    const t = e as PerformanceEventTiming
    events.push({
      name: t.name, duration: t.duration,
      processing: Math.round((t.processingEnd - t.processingStart) * 10) / 10,
      delay: Math.round((t.processingStart - t.startTime) * 10) / 10,
    })
  }, { durationThreshold: 16 })
  const ready = () => {
    if ((w.__perf as { readyAt: number | null }).readyAt !== null) return true
    if (!document.querySelector('[role="group"][aria-label="Anchor"]')) return false
    ;(w.__perf as { readyAt: number | null }).readyAt = Math.round(performance.now() * 10) / 10
    return true
  }
  const watcher = new MutationObserver(() => {
    if (ready()) watcher.disconnect()
  })
  watcher.observe(document, { childList: true, subtree: true })
}

type Mode = 'off' | 'on'

/** Long tasks and Event Timing entries since the last drain. */
async function drain(page: Page) {
  return page.evaluate(() => {
    const p = (window as unknown as { __perf: { longTasks: number[]; events: { name: string; duration: number; processing: number; delay: number }[] } }).__perf
    const tasks = p.longTasks.splice(0)
    const events = p.events.splice(0)
    return {
      longTasks: { count: tasks.length, totalMs: Math.round(tasks.reduce((s, d) => s + d, 0)), maxMs: tasks.length ? Math.max(...tasks) : 0, durationsMs: tasks },
      eventTiming: events,
    }
  })
}

/** rAF intervals over `ms`, optionally scrolling the main scroll region each frame. */
async function pacing(page: Page, ms: number, scroll: boolean) {
  return page.evaluate(async ({ ms, scroll }) => {
    const region = (document.querySelector('main [role="region"], .clr-scroll-region') as HTMLElement | null)
      ?? (document.scrollingElement as HTMLElement | null)
    const intervals: number[] = []
    const scrollable = region ? region.scrollHeight - region.clientHeight : 0
    let last = performance.now()
    const end = last + ms
    await new Promise<void>((done) => {
      const frame = (now: number) => {
        intervals.push(now - last)
        last = now
        if (scroll && region) region.scrollBy(0, Math.sin(now / 200) * 12)
        if (now < end) requestAnimationFrame(frame)
        else done()
      }
      requestAnimationFrame(frame)
    })
    const sorted = [...intervals].sort((a, b) => a - b)
    const pick = (q: number) => Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))]! * 100) / 100
    const mean = intervals.reduce((s, i) => s + i, 0) / intervals.length
    const sd = Math.sqrt(intervals.reduce((s, i) => s + (i - mean) ** 2, 0) / intervals.length)
    return {
      durationMs: ms, frames: intervals.length, fps: Math.round((intervals.length / ms) * 1000 * 10) / 10,
      p50Ms: pick(0.5), p95Ms: pick(0.95), p99Ms: pick(0.99), maxMs: pick(1), stdDevMs: Math.round(sd * 100) / 100,
      over20Ms: intervals.filter((i) => i > 20).length, over33Ms: intervals.filter((i) => i > 33.4).length, over50Ms: intervals.filter((i) => i > 50).length,
      scrollablePx: scroll ? scrollable : undefined,
    }
  }, { ms, scroll })
}

/** Arm a one-shot listener: the next `type` event to the second following frame. */
async function armNextFrame(page: Page, type: 'pointerdown' | 'keydown') {
  await page.evaluate((type) => {
    const w = window as unknown as { __nextFrame: number[] }
    w.__nextFrame = w.__nextFrame ?? []
    document.addEventListener(type, () => {
      const start = performance.now()
      requestAnimationFrame(() => requestAnimationFrame(() => w.__nextFrame.push(Math.round((performance.now() - start) * 100) / 100)))
    }, { once: true, capture: true })
  }, type)
}

async function takeNextFrame(page: Page) {
  await expect.poll(() => page.evaluate(() => (window as unknown as { __nextFrame?: number[] }).__nextFrame?.length ?? 0)).toBeGreaterThan(0)
  return page.evaluate(() => (window as unknown as { __nextFrame: number[] }).__nextFrame.shift()!)
}

async function tapNextFrame(page: Page, control: Locator) {
  await control.scrollIntoViewIfNeeded()
  await settle(page)
  const box = await control.boundingBox()
  expect(box, 'the control is on screen').not.toBeNull()
  await armNextFrame(page, 'pointerdown')
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
  return takeNextFrame(page)
}

async function keyNextFrame(page: Page, key: string) {
  await armNextFrame(page, 'keydown')
  await page.keyboard.press(key)
  return takeNextFrame(page)
}

async function settle(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
  })
}

async function onGenerate(page: Page) {
  await expect(page.getByRole('heading', { level: 1, name: 'Generate', exact: true })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Anchor' })).toBeVisible()
  await settle(page)
}

async function press(control: Locator) {
  await control.focus()
  await expect(control).toBeFocused()
  await control.page().keyboard.press('Enter')
}

/** Wall-clock milliseconds from an action until `ready` holds and two frames painted. */
async function timed(page: Page, action: () => Promise<void>, ready: () => Promise<void>) {
  const start = Date.now()
  await action()
  await ready()
  await settle(page)
  return Date.now() - start
}

async function loadMetrics(page: Page) {
  return page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    const paint = Object.fromEntries(performance.getEntriesByType('paint').map((e) => [e.name, Math.round(e.startTime * 10) / 10]))
    const p = (window as unknown as { __perf: { lcp: number[]; readyAt: number | null } }).__perf
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
    const r = (n: number | undefined) => (n === undefined ? 'unmeasured' : Math.round(n * 10) / 10)
    return {
      responseEndMs: r(nav?.responseEnd),
      domContentLoadedMs: r(nav?.domContentLoadedEventEnd),
      loadEventEndMs: r(nav?.loadEventEnd),
      firstPaintMs: paint['first-paint'] ?? 'unmeasured',
      firstContentfulPaintMs: paint['first-contentful-paint'] ?? 'unmeasured',
      largestContentfulPaintMs: p.lcp.length ? p.lcp.at(-1)! : 'unmeasured',
      generateReadyMs: p.readyAt ?? 'unmeasured',
      resources: resources.length,
      transferBytes: resources.reduce((s, e) => s + e.transferSize, 0),
      fromCacheResources: resources.filter((e) => e.transferSize === 0 && e.decodedBodySize > 0).length,
    }
  })
}

async function memory(page: Page, cdp: CDPSession) {
  // A forced collection first, so off and on compare live heap, not GC timing.
  await cdp.send('HeapProfiler.collectGarbage')
  const heap = await page.evaluate(() => {
    const m = (performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }).memory
    return m ? { usedJSHeapBytes: m.usedJSHeapSize, totalJSHeapBytes: m.totalJSHeapSize } : 'unmeasured'
  })
  const { metrics } = (await cdp.send('Performance.getMetrics')) as { metrics: { name: string; value: number }[] }
  const keep = ['JSHeapUsedSize', 'JSHeapTotalSize', 'Nodes', 'LayoutCount', 'RecalcStyleCount', 'LayoutDuration', 'RecalcStyleDuration', 'ScriptDuration', 'TaskDuration', 'Documents', 'Frames']
  return {
    performanceMemory: heap,
    devtoolsMetrics: Object.fromEntries(metrics.filter((m) => keep.includes(m.name)).map((m) => [m.name, Math.round(m.value * 1000) / 1000])),
  }
}

// ---------------------------------------------------------------------------
// One run: the same flow, one mode, a fresh context.
// ---------------------------------------------------------------------------

async function run(browser: Browser, build: Build, mode: Mode, use: Record<string, unknown>) {
  const context = await browser.newContext({
    viewport: use.viewport as { width: number; height: number }, deviceScaleFactor: use.deviceScaleFactor as number,
    isMobile: use.isMobile as boolean, hasTouch: use.hasTouch as boolean, userAgent: use.userAgent as string,
    baseURL: build.origin, reducedMotion: 'no-preference', serviceWorkers: 'block',
  })
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  await cdp.send('Performance.enable')
  await page.addInitScript(instrument)
  const app = await syntheticApp(page, build.origin, mode)
  const record: Record<string, unknown> = { mode }
  const phases: Record<string, unknown> = {}

  // Cold load: a new context has an empty HTTP cache and no service worker.
  await page.goto('/generate', { waitUntil: 'load' })
  await onGenerate(page)
  await expect(page.locator('.clr-crt-field'), `effects ${mode}: the field`).toHaveCount(mode === 'on' ? 1 : 0)
  record.coldLoad = await loadMetrics(page)
  phases.coldLoad = await drain(page)
  record.appViewport = await page.evaluate(() => ({
    devicePixelRatio: window.devicePixelRatio, innerWidth: window.innerWidth, innerHeight: window.innerHeight,
    visualViewportScale: window.visualViewport?.scale ?? 'unmeasured',
  }))
  record.crtFields = await page.locator('.clr-crt-field').count()

  // Warm load: the same document reloaded, HTTP cache warm.
  await page.reload({ waitUntil: 'load' })
  await onGenerate(page)
  record.warmLoad = await loadMetrics(page)
  phases.warmLoad = await drain(page)
  record.echoSourcesOnGenerate = await page.locator('.clr-echo__source').count()

  record.idleGenerate = await pacing(page, 3_000, false)
  phases.idleGenerate = await drain(page)

  // Input: Anchor chip taps and Intensity slider keys, each to the next frame.
  const chips = page.getByRole('group', { name: 'Anchor' }).getByRole('button')
  const taps: number[] = []
  for (let i = 0; i < 6; i++) taps.push(await tapNextFrame(page, chips.nth(i % 2)))
  const first = chips.first()
  if ((await first.getAttribute('aria-pressed')) !== 'true') await first.click()
  await expect(first).toHaveAttribute('aria-pressed', 'true')
  const slider = page.getByRole('slider', { name: 'Intensity' })
  await slider.focus()
  const keys: number[] = []
  for (let i = 0; i < 6; i++) keys.push(await keyNextFrame(page, i % 2 ? 'ArrowLeft' : 'ArrowRight'))
  record.input = { anchorTapToNextFrameMs: taps, intensityKeyToNextFrameMs: keys }
  phases.input = await drain(page)

  record.scrollGenerate = await pacing(page, 3_000, true)
  phases.scrollGenerate = await drain(page)

  // Busy, then error: a held generation request, then a synthetic 503.
  await press(page.getByRole('button', { name: /generate workout/i }))
  await expect.poll(() => app.held.length).toBe(1)
  await expect(page.getByRole('main').getByRole('status').first()).toHaveAttribute('aria-busy', 'true')
  record.busy = await pacing(page, 2_000, false)
  phases.busy = await drain(page)
  await app.failHeld()
  const alert = page.getByRole('alert').first()
  await expect(alert.getByRole('button', { name: 'Retry' })).toBeVisible()
  record.error = await pacing(page, 1_500, false)
  phases.error = await drain(page)
  await press(page.getByRole('button', { name: 'Cancel' }).first())
  await onGenerate(page)

  // Navigation: Generate → Home → Settings, Visual effects off/on, → Home → Generate.
  const navigation: Record<string, number> = {}
  navigation.generateToHomeMs = await timed(page,
    () => page.getByRole('button', { name: 'Home' }).click(),
    () => expect(page).toHaveURL(/\/$/))
  record.idleHome = await pacing(page, 2_000, false)
  phases.idleHome = await drain(page)
  navigation.homeToSettingsMs = await timed(page,
    () => page.getByRole('button', { name: 'Settings' }).click(),
    () => expect(page.getByRole('checkbox', { name: 'Visual effects' })).toBeVisible())
  const toggle = page.getByRole('checkbox', { name: 'Visual effects' })
  await expect(toggle).toBeChecked({ checked: mode === 'on' })
  const flip = await tapNextFrame(page, toggle)
  await expect(page.locator('.clr-crt-field')).toHaveCount(mode === 'on' ? 0 : 1)
  await settle(page)
  const back = await tapNextFrame(page, toggle)
  await expect(page.locator('.clr-crt-field')).toHaveCount(mode === 'on' ? 1 : 0)
  record.visualEffectsToggle = { firstTapToNextFrameMs: flip, restoreTapToNextFrameMs: back, sequence: mode === 'on' ? 'on → off → on' : 'off → on → off' }
  navigation.settingsToHomeMs = await timed(page,
    () => page.getByRole('button', { name: 'Back' }).click(),
    () => expect(page).toHaveURL(/\/$/))
  navigation.homeToGenerateMs = await timed(page,
    () => press(page.getByRole('button', { name: 'Generate workout' })),
    () => onGenerate(page))
  record.navigation = navigation
  phases.navigation = await drain(page)

  await expect(page.locator('.clr-crt-field'), `effects ${mode}: restored`).toHaveCount(mode === 'on' ? 1 : 0)
  record.memory = await memory(page, cdp)
  record.runningAnimations = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length)
  record.phases = phases
  app.assertReadOnly()
  await context.close()
  return record
}

// ---------------------------------------------------------------------------
// Identity.
// ---------------------------------------------------------------------------

function git(args: string[]) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim()
  } catch {
    return 'unavailable'
  }
}

async function environment(browser: Browser, build: Build, use: Record<string, unknown>) {
  const session = await browser.newBrowserCDPSession()
  const version = (await session.send('Browser.getVersion')) as Record<string, string>
  let gpu: unknown = 'unmeasured'
  try {
    const info = (await session.send('SystemInfo.getInfo')) as { gpu: { devices: unknown[]; featureStatus: Record<string, string>; driverBugWorkarounds: string[] } }
    gpu = { devices: info.gpu.devices, featureStatus: info.gpu.featureStatus }
  } catch {
    // Left unmeasured.
  }
  await session.detach()

  // A blank page in its own context, so this probe is never counted against a run.
  const probeContext = await browser.newContext({ viewport: use.viewport as { width: number; height: number }, deviceScaleFactor: use.deviceScaleFactor as number, isMobile: use.isMobile as boolean })
  const probe = await probeContext.newPage()
  const page = await probe.evaluate(() => {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl')
    const ext = gl?.getExtension('WEBGL_debug_renderer_info')
    return {
      devicePixelRatio: window.devicePixelRatio,
      visualViewportScale: window.visualViewport?.scale ?? 'unmeasured',
      innerWidth: window.innerWidth, innerHeight: window.innerHeight,
      userAgent: navigator.userAgent,
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemoryGb: (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 'unmeasured',
      webgl: gl ? {
        vendor: String(ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR)),
        renderer: String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)),
      } : 'unavailable',
      crossOriginIsolated: window.crossOriginIsolated,
    }
  })
  await probeContext.close()

  return {
    browser: { name: 'Chromium (Playwright)', version: browser.version(), product: version.product, revision: version.revision, jsVersion: version.jsVersion, headless: use.headless ?? true },
    os: { platform: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model ?? 'unmeasured', cpuCount: cpus().length, totalMemoryBytes: totalmem() },
    emulation: 'Playwright "mobile" project (Pixel 5 descriptor, isMobile, hasTouch) on a desktop host: mobile emulation, not physical-phone evidence',
    viewport: use.viewport,
    deviceScaleFactor: use.deviceScaleFactor,
    page,
    renderScale: 'page zoom 1; the CRT field has no offscreen raster or render-scale setting — it paints at the device-pixel ratio',
    renderer: { webgl: page.webgl, gpuInfo: gpu },
    app: {
      commit: git(['rev-parse', 'HEAD']),
      uncommittedChanges: git(['status', '--porcelain', '--untracked-files=no']) !== '',
      build: `vite build of this workspace into a temporary folder, served by vite preview (${build.builtAt})`,
      buildAssetsSha256: build.assets,
    },
    effectSettings: {
      echo: { preset: PHOSPHOR_ECHO_PRESET_PROVENANCE.name, source: PHOSPHOR_ECHO_PRESET_PROVENANCE.source, values: PHOSPHOR_ECHO_PRESET },
      crtShippingConfiguration: { module: 'src/ui/crt-field/config.ts', id: CRT_FIELD_CONFIG.id, values: CRT_FIELD_CONFIG },
      crtArchivedReference: { file: CRT_FIELD_REFERENCE.settingsFile, sha256: CRT_FIELD_REFERENCE.settingsSha256, note: 'reference identity only; not measured, not the shipping values' },
    },
  }
}

const REQUIRED_IDENTITY = [
  'browser.version', 'os.platform', 'os.release', 'viewport', 'deviceScaleFactor', 'page.devicePixelRatio', 'renderScale',
  'renderer.webgl', 'renderer.gpuInfo', 'app.commit', 'app.build', 'app.buildAssetsSha256',
  'effectSettings.echo.preset', 'effectSettings.echo.values', 'effectSettings.crtShippingConfiguration.id',
  'effectSettings.crtShippingConfiguration.values', 'effectSettings.crtArchivedReference.sha256',
] as const
const REQUIRED_RUN = [
  'appViewport.devicePixelRatio', 'coldLoad', 'warmLoad', 'idleGenerate', 'input.anchorTapToNextFrameMs', 'input.intensityKeyToNextFrameMs',
  'scrollGenerate', 'busy', 'error', 'idleHome', 'visualEffectsToggle', 'navigation', 'memory', 'phases.coldLoad.longTasks',
  'phases.scrollGenerate.longTasks', 'phases.input.eventTiming',
] as const

function at(record: unknown, path: string) {
  return path.split('.').reduce<unknown>((value, key) => (value as Record<string, unknown> | undefined)?.[key], record)
}

/** The raw per-run values as Markdown tables, for the performance record. Nothing is averaged away. */
function tables(runs: Record<string, unknown>[]) {
  const cell = (value: unknown) => (value === undefined ? 'unmeasured' : Array.isArray(value) ? value.join(', ') : String(value))
  const table = (title: string, columns: [string, string][]) => [
    `#### ${title}`, '',
    `| Run | Mode | ${columns.map(([name]) => name).join(' | ')} |`,
    `| --- | --- | ${columns.map(() => '---').join(' | ')} |`,
    ...runs.map((r) => `| ${r.index} | ${r.mode} | ${columns.map(([, path]) => cell(at(r, path))).join(' | ')} |`),
    '',
  ]
  const load = (phase: string): [string, string][] => [
    ['response end ms', `${phase}.responseEndMs`], ['DCL ms', `${phase}.domContentLoadedMs`], ['load ms', `${phase}.loadEventEndMs`],
    ['FCP ms', `${phase}.firstContentfulPaintMs`], ['LCP ms', `${phase}.largestContentfulPaintMs`], ['Generate ready ms', `${phase}.generateReadyMs`],
    ['resources', `${phase}.resources`], ['transfer bytes', `${phase}.transferBytes`],
    ['long tasks', `phases.${phase}.longTasks.count`], ['long-task total ms', `phases.${phase}.longTasks.totalMs`], ['long-task max ms', `phases.${phase}.longTasks.maxMs`],
  ]
  const frames = (phase: string): [string, string][] => [
    ['frames', `${phase}.frames`], ['fps', `${phase}.fps`], ['p50 ms', `${phase}.p50Ms`], ['p95 ms', `${phase}.p95Ms`], ['p99 ms', `${phase}.p99Ms`],
    ['max ms', `${phase}.maxMs`], ['sd ms', `${phase}.stdDevMs`], ['>20 ms', `${phase}.over20Ms`], ['>33 ms', `${phase}.over33Ms`], ['>50 ms', `${phase}.over50Ms`],
    ['long tasks', `phases.${phase}.longTasks.count`], ['long-task total ms', `phases.${phase}.longTasks.totalMs`],
  ]
  return [
    ...table('What each run measured', [
      ['CRT fields', 'crtFields'], ['Echo sources on /generate', 'echoSourcesOnGenerate'], ['device-pixel ratio', 'appViewport.devicePixelRatio'],
      ['inner width', 'appViewport.innerWidth'], ['inner height', 'appViewport.innerHeight'], ['visual viewport scale', 'appViewport.visualViewportScale'],
    ]),
    ...table('Cold load (/generate, new context)', load('coldLoad')),
    ...table('Warm load (/generate reloaded)', load('warmLoad')),
    ...table('Frame pacing — idle /generate (3 s)', frames('idleGenerate')),
    ...table('Frame pacing — scrolling /generate (3 s)', frames('scrollGenerate')),
    ...table('Frame pacing — busy, held generation (2 s)', frames('busy')),
    ...table('Frame pacing — error, synthetic 503 (1.5 s)', frames('error')),
    ...table('Frame pacing — idle Home (2 s)', frames('idleHome')),
    ...table('Input to second next frame', [
      ['Anchor taps ms', 'input.anchorTapToNextFrameMs'], ['Intensity keys ms', 'input.intensityKeyToNextFrameMs'],
      ['Visual effects first tap ms', 'visualEffectsToggle.firstTapToNextFrameMs'], ['Visual effects restore tap ms', 'visualEffectsToggle.restoreTapToNextFrameMs'],
      ['input long tasks', 'phases.input.longTasks.count'], ['input long-task total ms', 'phases.input.longTasks.totalMs'],
    ]),
    ...table('Navigation, action to settled screen', [
      ['Generate→Home ms', 'navigation.generateToHomeMs'], ['Home→Settings ms', 'navigation.homeToSettingsMs'],
      ['Settings→Home ms', 'navigation.settingsToHomeMs'], ['Home→Generate ms', 'navigation.homeToGenerateMs'],
      ['long tasks', 'phases.navigation.longTasks.count'], ['long-task total ms', 'phases.navigation.longTasks.totalMs'],
    ]),
    ...table('Memory and rendering work at the end of the flow', [
      ['JS heap used B', 'memory.devtoolsMetrics.JSHeapUsedSize'], ['JS heap total B', 'memory.devtoolsMetrics.JSHeapTotalSize'],
      ['DOM nodes', 'memory.devtoolsMetrics.Nodes'], ['layouts', 'memory.devtoolsMetrics.LayoutCount'], ['style recalcs', 'memory.devtoolsMetrics.RecalcStyleCount'],
      ['layout s', 'memory.devtoolsMetrics.LayoutDuration'], ['recalc s', 'memory.devtoolsMetrics.RecalcStyleDuration'],
      ['script s', 'memory.devtoolsMetrics.ScriptDuration'], ['task s', 'memory.devtoolsMetrics.TaskDuration'], ['running animations', 'runningAnimations'],
    ]),
  ].join('\n')
}

test.describe('Visual effects performance — the same flows and build, off and on', () => {
  test('records identity and raw measurements for every run, judging nothing', async ({ browser, perfBuild }, testInfo) => {
    test.setTimeout(420_000)
    const use = testInfo.project.use as unknown as Record<string, unknown>
    const identity = await environment(browser, perfBuild, use)
    const order: Mode[] = ['off', 'on', 'on', 'off', 'off', 'on']
    const runs: Record<string, unknown>[] = []
    for (const [index, mode] of order.entries()) runs.push({ index, ...(await run(browser, perfBuild, mode, use)) })

    const body = {
      title: 'Visual effects performance — raw record',
      recordedAt: new Date().toISOString(),
      thresholds: 'none: no pass, latency or budget threshold was set, so none is enforced',
      order,
      identity,
      runs,
    }
    const text = JSON.stringify(body, null, 2)
    writeFileSync(testInfo.outputPath('visual-effects-performance.json'), text)
    await testInfo.attach('visual-effects-performance.json', { body: text, contentType: 'application/json' })
    const { gpuInfo, ...renderer } = identity.renderer
    const summary = [
      '```json',
      JSON.stringify({ ...identity, renderer: { ...renderer, gpuDevices: (gpuInfo as { devices?: unknown }).devices ?? gpuInfo, featureStatus: (gpuInfo as { featureStatus?: unknown }).featureStatus } }, null, 2),
      '```', '', tables(runs),
    ].join('\n')
    writeFileSync(testInfo.outputPath('visual-effects-performance.md'), summary)
    await testInfo.attach('visual-effects-performance.md', { body: summary, contentType: 'text/markdown' })

    // Only presence is required: a missing identity field or raw record fails the run.
    for (const path of REQUIRED_IDENTITY) expect(at(identity, path), `identity: ${path}`).toBeDefined()
    for (const mode of ['off', 'on'] as const) {
      const ofMode = runs.filter((r) => r.mode === mode)
      expect(ofMode.length, `${mode} runs`).toBe(3)
      for (const record of ofMode) for (const path of REQUIRED_RUN) expect(at(record, path), `${mode} run: ${path}`).toBeDefined()
    }
  })
})
