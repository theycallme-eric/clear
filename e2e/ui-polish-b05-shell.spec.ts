import { execSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { CDPSession, Page, Route, TestInfo } from '@playwright/test'

import { readE2eEnv } from '../scripts/e2e/env.mjs'
import { makeSessionRow } from '../src/test/factories'
import { fixtureLocation, onboardedProfile } from '../src/test/user-data-double'
import { installDeterministicCapture } from './design-0143/fixtures'
import { expect, test as scanned } from './fixtures'

/**
 * UI polish batch 05 — TASK-001 shell diagnostic (REQ-001 header clearance,
 * REQ-002 bottom band). TASK-002 turns this file into its repair proof.
 *
 * Diagnostic phase: every case renders the production shell at an actual
 * routed, guard, boot or crash-fallback boundary, then records its geometry
 * and a viewport capture as attachments. Nothing here edits application CSS
 * or substitutes test padding: Chromium's safe-area override only changes the
 * values CSS env() reads, and a viewport resize is a local layout exercise.
 * None of this is an installed-iPhone, keyboard or resume-on-device result.
 *
 * The assertions pin what the current tree actually does, so the record cannot
 * drift silently: the fixed atmosphere paints the whole emulated viewport, the
 * contained shell reserves max(--spacing-500, inset) above and below, `<main>`
 * ends exactly that far above the viewport bottom, and titles/header controls
 * sit below the top inset and are the top hit-test target at their own
 * points. The crash fallback renders outside both shells, so it receives no
 * safe-area clearance at all and its alert starts inside the top inset.
 * TASK-002 replaces these with the corrected expected geometry.
 *
 * Data is synthetic: an intercepted session for a fictional user, synthetic
 * reads, and no writes, model calls or real account.
 */
const OWNER = '00000000-0000-4000-8000-000000000005'
const AUTH_KEY = 'clear.auth.session'
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
}
const LOCATION_ID = '00000000-0000-4000-8000-000000000051'
const HISTORY = Array.from({ length: 4 }, (_, index) => {
  const day = new Date()
  day.setUTCDate(day.getUTCDate() - index - 1)
  const date = day.toISOString().slice(0, 10)
  return makeSessionRow({
    id: `00000000-0000-4000-8000-00000000006${index}`,
    user_id: OWNER,
    location_id: LOCATION_ID,
    date,
    title: `Synthetic shell history ${index + 1}`,
    goal_preset: 'strength',
    started_at: `${date}T12:00:00.000Z`,
    completed_at: `${date}T12:30:00.000Z`,
    created_at: `${date}T12:00:00.000Z`,
    updated_at: `${date}T12:30:00.000Z`,
  })
})

/**
 * Every Supabase request below is intercepted, but the bundle only issues
 * them when it was served with a public URL and anon key. Where the local
 * harness has neither, this file serves its own dev server with non-secret
 * placeholders on the reserved `.invalid` domain, so the synthetic session
 * renders instead of the signed-out entry. A named external target, or a
 * locally configured one, is used unchanged.
 */
const e2e = readE2eEnv()
const SYNTHETIC_ORIGIN_NEEDED = !e2e.usesExternalTarget && (e2e.url === null || e2e.anonKey === null)

async function waitForOrigin(origin: string, deadline: number) {
  while (Date.now() < deadline) {
    try {
      if ((await fetch(origin)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((settle) => setTimeout(settle, 250))
  }
  throw new Error(`Synthetic shell origin ${origin} did not start`)
}

const test = scanned.extend<object, { syntheticOrigin: string | null }>({
  syntheticOrigin: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use, workerInfo) => {
      if (!SYNTHETIC_ORIGIN_NEEDED) return use(null)
      const port = 5290 + workerInfo.parallelIndex
      const origin = `http://localhost:${port}`
      const server = spawn(process.execPath, [
        resolve(import.meta.dirname, '../node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort',
      ], {
        env: {
          ...process.env,
          VITE_SUPABASE_URL: 'https://synthetic-b05-shell.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-b05-shell-public-placeholder',
        },
        stdio: 'ignore',
      })
      try {
        await waitForOrigin(origin, Date.now() + 90_000)
        await use(origin)
      } finally {
        server.kill()
      }
    },
    { scope: 'worker', timeout: 120_000 },
  ],
  baseURL: async ({ baseURL, syntheticOrigin }, use) => use(syntheticOrigin ?? baseURL),
})

type Viewport = { width: number; height: number }
type Insets = { top: number; right: number; bottom: number; left: number }
type HistoryMode = 'ok' | 'hold' | 'fail'

const ZERO: Insets = { top: 0, right: 0, bottom: 0, left: 0 }
/** A notched portrait phone: the status/indicator geometry B05 was captured on. */
const PHONE = { viewport: { width: 390, height: 844 }, insets: { top: 47, right: 0, bottom: 34, left: 0 } }
const NARROW = { viewport: { width: 320, height: 568 }, insets: { top: 20, right: 0, bottom: 0, left: 0 } }
/** A reduced height standing in for an open keyboard; not an iOS keyboard. */
const SHORT = { viewport: { width: 390, height: 480 }, insets: { top: 47, right: 0, bottom: 0, left: 0 } }

/** The reviewed reference images, identified for the record; never read here. */
const REFERENCES = {
  'B05-01': 'sources/source-04-B05-01-home.jpg (01.1 header, 01.4 bottom)',
  'B05-02': 'sources/source-05-B05-02-generate.jpg (02.8 bottom)',
  'B05-08': 'sources/source-11-B05-08-settings.jpg (08.2 lower boundary)',
} as const

function sourceIdentity() {
  try {
    const head = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim()
    const dirty = execSync('git status --porcelain', { encoding: 'utf8' }).trim() !== ''
    return { head, dirty }
  } catch {
    return { head: process.env.GITHUB_SHA ?? 'unknown', dirty: null }
  }
}

async function syntheticApp(page: Page, options: { signedIn: boolean; history: HistoryMode }) {
  const unexpected: string[] = []
  let attemptedWrites = 0
  let release = () => {}
  const held = new Promise<void>((resolve) => { release = resolve })
  const guard = await installDeterministicCapture(page, { skin: 'clear', reducedMotion: false })
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
    const reply = (body: unknown, status = 200) =>
      route.fulfill({ status, headers: CORS, json: body }).catch(() => undefined)
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (url.pathname.startsWith('/functions/v1/')) {
      unexpected.push(`${request.method()} ${url.pathname}`)
      return route.abort('blockedbyclient')
    }
    if (request.method() === 'GET') {
      if (name === 'profiles') return reply([onboardedProfile({ id: OWNER, goal_preset: 'strength' })])
      if (name === 'locations') return reply([fixtureLocation({ id: LOCATION_ID, user_id: OWNER, tier: 'full' })])
      if (name === 'workout_sessions') {
        if (options.history === 'hold') {
          await held
          return reply({ code: 'PGRST000', message: 'Synthetic held read released.' }, 503)
        }
        if (options.history === 'fail') {
          return reply({ code: 'PGRST000', message: 'Synthetic boot read failure.' }, 503)
        }
        return reply(HISTORY)
      }
      // Any other read is answered empty and recorded, never forwarded.
      unexpected.push(`GET ${url.pathname}`)
      return reply([])
    }
    if (request.method() === 'POST' && url.pathname.includes('/rpc/')) {
      if (name === 'resume_session') return reply(null)
      if (['streak_sessions', 'constraints_in_force', 'anchor_evidence', 'conditioning_history'].includes(name)) {
        return reply([])
      }
    }
    if (request.method() !== 'GET') attemptedWrites += 1
    unexpected.push(`${request.method()} ${url.pathname}`)
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic shell-diagnostic request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ authKey, owner, signedIn, query }) => {
    if (signedIn) {
      localStorage.setItem(authKey, JSON.stringify({
        accessToken: 'synthetic-b05-shell-session', refreshToken: 'synthetic-b05-shell-refresh',
        expiresAt: Date.now() + 60 * 60 * 1000,
        user: { id: owner, email: 'synthetic-b05-shell@example.invalid' },
      }))
    }
    // The crash family's only fault: once armed, the atmosphere's own
    // reduced-motion read throws while rendering, so the real top-level
    // boundary replaces the tree. No stylesheet is altered.
    const original = window.matchMedia.bind(window)
    window.matchMedia = (media: string) => {
      if (media === query && (window as unknown as { __b05Fault?: boolean }).__b05Fault) {
        throw new Error('Synthetic B05 render fault')
      }
      return original(media)
    }
  }, { authKey: AUTH_KEY, owner: OWNER, signedIn: options.signedIn, query: REDUCED_MOTION_QUERY })
  return {
    release,
    unexpected,
    assertNoWrites() {
      expect(attemptedWrites).toBe(0)
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

/** A temporary invisible probe reads env(); it never changes app geometry. */
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

/** Rendered geometry only — boxes, computed values and hit-tests, no props. */
async function geometry(page: Page) {
  return page.evaluate(() => {
    const box = (element: Element | null) => {
      if (element === null) return null
      const rect = element.getBoundingClientRect()
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, bottom: rect.bottom, right: rect.right }
    }
    const length = (css: string) => {
      const probe = document.createElement('div')
      probe.style.cssText = `position:fixed;visibility:hidden;pointer-events:none;top:0;left:0;width:0;height:${css}`
      document.body.append(probe)
      try { return probe.getBoundingClientRect().height } finally { probe.remove() }
    }
    /** Points across the box, including its upper quarter where B05-01.1 marks the cover. */
    const hits = (element: Element) => {
      const rect = element.getBoundingClientRect()
      const points: Array<[number, number]> = [[0.5, 0.5], [0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]
      return points.map(([fx, fy]) => {
        const x = rect.x + rect.width * fx
        const y = rect.y + rect.height * fy
        const hit = document.elementFromPoint(x, y)
        const clear = hit !== null && (element.contains(hit) || hit.contains(element))
        return { x: Math.round(x), y: Math.round(y), clear,
          hit: hit === null ? null : `${hit.tagName.toLowerCase()}${hit.className && typeof hit.className === 'string' ? `.${hit.className.split(' ').join('.')}` : ''}` }
      })
    }
    const shells = [...document.querySelectorAll('.clr-shell--fixed')]
    const content = document.querySelector('.clr-shell--contained > .clr-shell__content')
    const contentStyle = content === null ? null : getComputedStyle(content)
    const header = document.querySelector('.clr-shell__content > header')
    const title = document.querySelector('h1')
    const controls = header === null ? [] : [...header.querySelectorAll('button, a[href]')]
    const main = document.querySelector('.clr-shell__content > main') ?? document.querySelector('#root main')
    const foot = main?.querySelector('.clr-scroll-region__foot') ?? null
    const footControls = foot === null ? [] : [...foot.querySelectorAll('button, a[href]')]
    const atmospheres = [...document.querySelectorAll('.clr-atmosphere')]
    const lowestAtmosphere = atmospheres.reduce((lowest, layer) => Math.max(lowest, layer.getBoundingClientRect().bottom), 0)
    const mainBox = box(main)
    const lastFoot = footControls.at(-1) ?? null
    return {
      path: location.pathname,
      viewport: { width: innerWidth, height: innerHeight },
      visualViewportHeight: window.visualViewport?.height ?? null,
      documentClientHeight: document.documentElement.clientHeight,
      cssHeights: { vh: length('100vh'), dvh: length('100dvh'), svh: length('100svh'), lvh: length('100lvh') },
      spacing500: content === null ? null : parseFloat(getComputedStyle(content).getPropertyValue('--spacing-500')),
      shellCount: shells.length,
      shell: box(shells[0] ?? null),
      contentPadding: contentStyle === null ? null : {
        top: parseFloat(contentStyle.paddingTop), bottom: parseFloat(contentStyle.paddingBottom),
      },
      atmosphereCount: atmospheres.length,
      atmosphere: box(atmospheres[0] ?? null),
      unpaintedBelowAtmosphere: atmospheres.length === 0 ? null : innerHeight - lowestAtmosphere,
      grounds: {
        html: getComputedStyle(document.documentElement).backgroundColor,
        body: getComputedStyle(document.body).backgroundColor,
      },
      header: box(header),
      title: title === null ? null : { text: title.textContent, box: box(title), hits: hits(title) },
      headerControls: controls.map((control) => ({
        name: control.getAttribute('aria-label') ?? control.textContent?.trim() ?? '',
        box: box(control), hits: hits(control),
      })),
      main: mainBox,
      mainPaddingTop: main === null ? null : getComputedStyle(main).paddingTop,
      foot: box(foot),
      footControls: footControls.map((control) => ({ name: control.textContent?.trim() ?? '', box: box(control) })),
      /** Space between the lowest shell content edge and the viewport bottom. */
      bottomGapBelowMain: mainBox === null ? null : innerHeight - mainBox.bottom,
      bottomGapBelowLastFootControl: lastFoot === null ? null : innerHeight - lastFoot.getBoundingClientRect().bottom,
      documentScroll: {
        top: document.scrollingElement?.scrollTop ?? null,
        height: document.scrollingElement?.scrollHeight ?? null,
        client: document.scrollingElement?.clientHeight ?? null,
      },
    }
  })
}

type Geometry = Awaited<ReturnType<typeof geometry>>

/** Capture and measure; both land beside the test's output and in the report. */
async function record(page: Page, testInfo: TestInfo, id: string, context: {
  family: string; consumer: string; state: string; viewport: Viewport; insets: Insets
}) {
  await expect.poll(() => readInsets(page)).toEqual(context.insets)
  await page.evaluate(() => document.fonts.ready)
  const shot = await page.screenshot({ animations: 'disabled' })
  const shotPath = testInfo.outputPath(`${id}.png`)
  writeFileSync(shotPath, shot)
  const measured = await geometry(page)
  const entry = {
    id,
    ...context,
    references: REFERENCES,
    source: sourceIdentity(),
    target: new URL(page.url()).origin,
    syntheticPublicConfig: SYNTHETIC_ORIGIN_NEEDED,
    browser: `${testInfo.project.name} (Chromium emulation, deviceScaleFactor ${testInfo.project.use.deviceScaleFactor ?? 1})`,
    capture: { file: `${id}.png`, sha256: createHash('sha256').update(shot).digest('hex') },
    geometry: measured,
  }
  writeFileSync(testInfo.outputPath(`${id}.json`), JSON.stringify(entry, null, 2))
  await testInfo.attach(`${id}.png`, { path: shotPath, contentType: 'image/png' })
  await testInfo.attach(`${id}.json`, { body: JSON.stringify(entry, null, 2), contentType: 'application/json' })
  return measured
}

/** The contained shell as it currently stands (routed and boot instances). */
function expectContainedShell(measured: Geometry, viewport: Viewport, insets: Insets) {
  expect(measured.viewport).toEqual(viewport)
  expect(measured.shellCount).toBe(1)
  expect(measured.atmosphereCount).toBe(1)
  // Locally the fixed atmosphere reaches the emulated viewport bottom, so an
  // unpainted band like B05's cannot appear here.
  expect(measured.unpaintedBelowAtmosphere).toBeCloseTo(0, 0)
  expect(measured.shell?.height).toBeCloseTo(viewport.height, 0)
  expect(measured.cssHeights.dvh).toBeCloseTo(viewport.height, 0)
  const spacing = measured.spacing500 ?? Number.NaN
  expect(spacing).toBeGreaterThan(0)
  expect(measured.contentPadding?.top).toBeCloseTo(Math.max(spacing, insets.top), 0)
  expect(measured.contentPadding?.bottom).toBeCloseTo(Math.max(spacing, insets.bottom), 0)
  // The shell's bottom padding is the whole gap below <main>: the safe-area
  // inset when one is reported, and --spacing-500 of empty space when not.
  expect(measured.bottomGapBelowMain).toBeCloseTo(Math.max(spacing, insets.bottom), 0)
  expect(measured.documentScroll.top).toBe(0)
  expect(measured.documentScroll.height).toBe(measured.documentScroll.client)
}

/** Title and header controls: below the top inset and hit-testable as themselves. */
function expectClearHead(measured: Geometry, insets: Insets) {
  expect(measured.title).not.toBeNull()
  expect(measured.title?.box?.y ?? -1).toBeGreaterThanOrEqual(insets.top - 1)
  expect(measured.title?.hits.every((hit) => hit.clear)).toBe(true)
  for (const control of measured.headerControls) {
    expect(control.box?.y ?? -1).toBeGreaterThanOrEqual(insets.top - 1)
    expect(control.hits.every((hit) => hit.clear)).toBe(true)
  }
}

async function withInsets<T>(page: Page, insets: Insets, run: (cdp: CDPSession) => Promise<T>) {
  const cdp = await page.context().newCDPSession(page)
  try {
    await setInsets(cdp, insets)
    return await run(cdp)
  } finally {
    await setInsets(cdp, ZERO).catch(() => undefined)
    await cdp.detach().catch(() => undefined)
  }
}

test.use({ timezoneId: 'UTC' })

const ROUTED = [
  { consumer: 'Home', path: '/', header: true, foot: true },
  { consumer: 'Generate', path: '/generate', header: true, foot: true },
  { consumer: 'Settings', path: '/settings', header: true, foot: false },
  { consumer: 'Not found', path: '/b05-shell-diagnostic-unknown', header: false, foot: false },
] as const

for (const { consumer, path, header, foot } of ROUTED) {
  test(`B05 TASK-001 diagnostic: routed ${consumer} records header clearance and bottom geometry`, async ({ page, visit }, testInfo) => {
    test.setTimeout(120_000)
    testInfo.annotations.push({ type: 'proof-mode',
      description: 'Diagnostic baseline: synthetic intercepted session, Chromium CSS env override; not installed-iPhone evidence.' })
    const app = await syntheticApp(page, { signedIn: true, history: 'ok' })
    await page.setViewportSize(PHONE.viewport)
    await withInsets(page, PHONE.insets, async () => {
      await visit(path)
      await expect(page.getByRole('heading', { level: 1 })).not.toHaveAccessibleName('CLEAR')
      await expect(page.locator('.clr-shell__content > header')).toHaveCount(header ? 1 : 0)
      if (foot) await expect(page.locator('main .clr-scroll-region__foot button').first()).toBeVisible()
      if (consumer === 'Settings') await expect(page.getByText('Reading your settings')).toHaveCount(0)
      const measured = await record(page, testInfo, `routed-${consumer.toLowerCase().replace(/\s+/g, '-')}-phone`, {
        family: 'routed', consumer, state: 'populated', ...PHONE,
      })
      expectContainedShell(measured, PHONE.viewport, PHONE.insets)
      expectClearHead(measured, PHONE.insets)
      if (header) expect(measured.headerControls.length).toBeGreaterThan(0)
      if (foot) {
        // Below the last footer action: the PhoneFooter's own padding plus the
        // shell's bottom padding, with nothing else beneath it.
        expect(measured.bottomGapBelowLastFootControl ?? 0).toBeGreaterThan(measured.bottomGapBelowMain ?? 0)
      }
    })
    app.assertNoWrites()
  })
}

test('B05 TASK-001 diagnostic: Home across narrow, short, zero-inset and lifecycle resume geometry', async ({ page, visit }, testInfo) => {
  test.setTimeout(120_000)
  testInfo.annotations.push({ type: 'proof-mode',
    description: 'Viewport resize stands in for keyboard height; CDP page freeze/resume is a Chromium lifecycle, not iOS app resume.' })
  const app = await syntheticApp(page, { signedIn: true, history: 'ok' })
  await page.setViewportSize(PHONE.viewport)
  await withInsets(page, PHONE.insets, async (cdp) => {
    await visit('/')
    await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('Today')
    await expect(page.locator('main .clr-scroll-region__foot button').first()).toBeVisible()
    const before = await record(page, testInfo, 'routed-home-phone-before-resume', {
      family: 'routed', consumer: 'Home', state: 'populated', ...PHONE,
    })
    await cdp.send('Page.setWebLifecycleState', { state: 'frozen' })
    await cdp.send('Page.setWebLifecycleState', { state: 'active' })
    const after = await record(page, testInfo, 'routed-home-phone-after-resume', {
      family: 'routed', consumer: 'Home', state: 'populated, after frozen/active lifecycle', ...PHONE,
    })
    expect(after.main).toEqual(before.main)
    expect(after.header).toEqual(before.header)

    for (const [label, layout] of [['narrow', NARROW], ['short', SHORT]] as const) {
      await setInsets(cdp, layout.insets)
      await page.setViewportSize(layout.viewport)
      const measured = await record(page, testInfo, `routed-home-${label}`, {
        family: 'routed', consumer: 'Home', state: 'populated', ...layout,
      })
      expectContainedShell(measured, layout.viewport, layout.insets)
      expectClearHead(measured, layout.insets)
    }

    await setInsets(cdp, ZERO)
    await page.setViewportSize(PHONE.viewport)
    const flat = await record(page, testInfo, 'routed-home-zero-inset', {
      family: 'routed', consumer: 'Home', state: 'populated', viewport: PHONE.viewport, insets: ZERO,
    })
    expectContainedShell(flat, PHONE.viewport, ZERO)
    expectClearHead(flat, ZERO)
    // With no reported inset the shell still reserves --spacing-500 below <main>.
    expect(flat.bottomGapBelowMain ?? 0).toBeGreaterThan(0)
  })
  app.assertNoWrites()
})

test('B05 TASK-001 diagnostic: signed-out guard lands in the routed shell with its geometry recorded', async ({ page, visit }, testInfo) => {
  test.setTimeout(120_000)
  const app = await syntheticApp(page, { signedIn: false, history: 'ok' })
  await page.setViewportSize(PHONE.viewport)
  await withInsets(page, PHONE.insets, async () => {
    await visit('/')
    await expect(page).not.toHaveURL((url) => url.pathname === '/')
    const measured = await record(page, testInfo, 'guard-signed-out-phone', {
      family: 'guard', consumer: 'signed-out redirect', state: 'populated', ...PHONE,
    })
    expectContainedShell(measured, PHONE.viewport, PHONE.insets)
    expectClearHead(measured, PHONE.insets)
  })
  app.assertNoWrites()
})

for (const mode of ['hold', 'fail'] as const) {
  test(`B05 TASK-001 diagnostic: independent boot shell (${mode === 'hold' ? 'checking' : 'failed'}) geometry`, async ({ page, visit }, testInfo) => {
    test.setTimeout(120_000)
    const app = await syntheticApp(page, { signedIn: true, history: mode })
    await page.setViewportSize(PHONE.viewport)
    try {
      await withInsets(page, PHONE.insets, async () => {
        await visit('/')
        await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('CLEAR')
        if (mode === 'fail') {
          await expect(page.getByText('System check failed').first()).toBeVisible({ timeout: 60_000 })
          await expect(page.locator('main .clr-scroll-region__foot button').first()).toBeVisible()
        } else {
          await expect(page.getByText('System check').first()).toBeVisible()
        }
        const measured = await record(page, testInfo, `boot-${mode === 'hold' ? 'checking' : 'failed'}-phone`, {
          family: 'boot', consumer: 'BootSequence', state: mode === 'hold' ? 'loading' : 'error', ...PHONE,
        })
        expectContainedShell(measured, PHONE.viewport, PHONE.insets)
        expectClearHead(measured, PHONE.insets)
      })
    } finally {
      app.release()
    }
    app.assertNoWrites()
  })
}

test('B05 TASK-001 diagnostic: crash fallback renders outside both shells with no safe-area clearance', async ({ page, visit }, testInfo) => {
  test.setTimeout(120_000)
  testInfo.annotations.push({ type: 'proof-mode',
    description: 'A synthetic thrown render error reaches the real top-level boundary; stylesheets are untouched.' })
  // The fault is armed while boot holds the router back: a render error
  // inside the route tree is caught by the router's own boundary instead,
  // while the boot shell's atmosphere sits directly below ErrorBoundary.
  const app = await syntheticApp(page, { signedIn: true, history: 'hold' })
  await page.setViewportSize(PHONE.viewport)
  try {
    await withInsets(page, PHONE.insets, async () => {
      await visit('/')
      await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('CLEAR')
      await page.evaluate(() => { (window as unknown as { __b05Fault?: boolean }).__b05Fault = true })
      // The preference change makes the atmosphere re-read it, which now throws.
      await page.emulateMedia({ reducedMotion: 'reduce' })
      const alert = page.getByRole('alert').filter({ hasText: 'Display error' })
      await expect(alert).toBeVisible()
      await expect(page.getByRole('button', { name: 'Reload', exact: true })).toBeVisible()
      const measured = await record(page, testInfo, 'crash-fallback-phone', {
        family: 'crash', consumer: 'ErrorBoundary fallback', state: 'error', ...PHONE,
      })
      const alertBox = await alert.boundingBox()
      await testInfo.attach('crash-fallback-alert-box.json', {
        body: JSON.stringify({ alertBox, topInset: PHONE.insets.top,
          startsInsideTopInset: alertBox === null ? null : alertBox.y < PHONE.insets.top }, null, 2),
        contentType: 'application/json',
      })
      expect(measured.shellCount).toBe(0)
      expect(measured.atmosphereCount).toBe(0)
      expect(measured.contentPadding).toBeNull()
      expect(measured.mainPaddingTop).toBe('0px')
      // Reproduced: the fallback's alert begins inside the reported top inset.
      expect(alertBox?.y ?? Number.NaN).toBeLessThan(PHONE.insets.top)
    })
  } finally {
    app.release()
  }
  app.assertNoWrites()
})
