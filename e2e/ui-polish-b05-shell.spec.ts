import { execSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import type { CDPSession, Page, Route, TestInfo } from '@playwright/test'

import { readE2eEnv } from '../scripts/e2e/env.mjs'
import { makeSessionRow } from '../src/test/factories'
import { fixtureLocation, onboardedProfile } from '../src/test/user-data-double'
import { definitionFixture, snapshotFixture } from '../src/test/workout-double'
import { installDeterministicCapture } from './design-0143/fixtures'
import { expect, test as scanned } from './fixtures'

/**
 * UI polish batch 05 — shell header clearance (REQ-001) and bottom band
 * (REQ-002). TASK-001 reproduced the baseline here; TASK-002's shared repair
 * turns the same cases into the expected result.
 *
 * Every case renders the production shell at an actual routed, guard, boot or
 * crash-fallback boundary, then records its geometry and a viewport capture as
 * attachments. Nothing here edits application CSS or substitutes test padding:
 * Chromium's safe-area override only changes the values CSS env() reads, and a
 * viewport resize is a local layout exercise standing in for a keyboard. None
 * of this is an installed-iPhone, keyboard or resume-on-device result.
 *
 * The repaired geometry, asserted for every shell family:
 * - the fixed atmosphere still paints the whole viewport (blur retained);
 * - the page's top gap starts below the top inset (inset + --spacing-500), so
 *   the title and header controls have page clearance below the top inset and
 *   are the top hit-test target at their own points;
 * - the shell reserves nothing at the bottom: `<main>` reaches the viewport
 *   bottom, and the last layer — the pinned footer, or the scrolling content
 *   without one — ends max(--spacing-300, bottom inset) from it, so the
 *   bottom inset is the action's clearance rather than a strip below it;
 * - the crash fallback renders inside the same contained shell.
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
const WORKOUT = snapshotFixture({
  userId: OWNER,
  title: 'Synthetic B05 shell workout',
  startedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
  session: { location_id: LOCATION_ID, goal_preset: 'strength' },
  sections: [
    { title: 'Strength', sectionType: 'primary_lift', blocks: [{ exercises: [{ prescription: {
      exercise_id: 'back-squat', sets: 3, target_value: 8, rest_seconds: 45,
    } }] }] },
    { title: 'Core', sectionType: 'accessory', blocks: [{ exercises: [{ prescription: {
      exercise_id: 'plank', equipment_used: 'bodyweight', load_type: 'bodyweight', load_value: null,
      modality: 'time', target_value: 30, sets: 2, rest_seconds: 30,
    } }] }] },
  ],
})
const WORKOUT_EXERCISES = WORKOUT.sections.flatMap((section) => section.blocks
  .flatMap((block) => block.exercises.map(({ exercise }) => exercise)))
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

/**
 * The reviewed reference images and the region each case is compared with.
 * The evidence snapshot sits beside this workspace under the same name; where
 * it is reachable the record carries each file's SHA-256, otherwise null. The
 * pixels are not compared automatically: the selected local captures need a
 * visual review, and installed-device status chrome remains outside this proof.
 */
const REFERENCE_DIR = resolve(import.meta.dirname, '..', '..', '.evidence',
  basename(resolve(import.meta.dirname, '..')), 'sources')
const REFERENCE_FILES = {
  'B05-01': { file: 'sources/source-04-B05-01-home.jpg', regions: '01.1 header row (title + corner control); 01.4 bottom band' },
  'B05-02': { file: 'sources/source-05-B05-02-generate.jpg', regions: 'header title; 02.8 bottom band' },
  'B05-08': { file: 'sources/source-11-B05-08-settings.jpg', regions: 'header; 08.2 lower boundary (no footer)' },
} as const
const REFERENCES = Object.fromEntries(Object.entries(REFERENCE_FILES).map(([id, entry]) => {
  const path = resolve(REFERENCE_DIR, basename(entry.file))
  const sha256 = existsSync(path) ? createHash('sha256').update(readFileSync(path)).digest('hex') : null
  return [id, { ...entry, sha256 }]
}))

function sourceIdentity() {
  try {
    const head = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim()
    const dirty = execSync('git status --porcelain', { encoding: 'utf8' }).trim() !== ''
    return { head, dirty }
  } catch {
    return { head: process.env.GITHUB_SHA ?? 'unknown', dirty: null }
  }
}

async function syntheticApp(page: Page, options: {
  signedIn: boolean; history: HistoryMode; profile?: 'onboarded' | 'none'
  activeWorkout?: boolean; skin?: 'clear' | 'vapour'
}) {
  const unexpected: string[] = []
  let attemptedWrites = 0
  let release = () => {}
  const held = new Promise<void>((resolve) => { release = resolve })
  const guard = await installDeterministicCapture(page, { skin: options.skin ?? 'clear', reducedMotion: false })
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
      if (name === 'profiles') {
        return reply(options.profile === 'none' ? [] : [onboardedProfile({ id: OWNER, goal_preset: 'strength' })])
      }
      if (name === 'locations') return reply([fixtureLocation({ id: LOCATION_ID, user_id: OWNER, tier: 'full' })])
      if (options.activeWorkout && name === 'exercise_definitions') {
        const id = url.searchParams.get('id')?.replace(/^eq\./, '')
        return reply(WORKOUT_EXERCISES.filter((exercise) => id === undefined || exercise.exercise_id === id)
          .map((exercise) => definitionFixture({ id: exercise.exercise_id })))
      }
      if (options.activeWorkout && name === 'workout_exercises') return reply(WORKOUT_EXERCISES)
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
      if (name === 'resume_session') return reply(options.activeWorkout ? WORKOUT : null)
      if (options.activeWorkout && name === 'session_snapshot') return reply(WORKOUT)
      if (['streak_sessions', 'constraints_in_force', 'anchor_evidence', 'conditioning_history'].includes(name)) {
        return reply([])
      }
      // Session-detail reads answer as a failed read: its error state is the
      // shell family under test, and no reconstructed session is invented.
      if (['session_snapshot', 'session_as_generated', 'session_as_intended_at_start', 'session_as_performed'].includes(name)) {
        return reply({ code: 'PGRST000', message: 'Synthetic session-detail read failure.' }, 503)
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
      expect(attemptedWrites, unexpected.join(', ')).toBe(0)
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
    const scroller = document.querySelector('main .clr-scroll-region__scroller')
    const screenContent = document.querySelector('main .clr-screen__content')
    const header = document.querySelector('.clr-shell__content > header')
    const title = document.querySelector('h1')
    const allControls = header === null ? [] : [...header.querySelectorAll('button, a[href]')]
    // Closed menu items intentionally have no rendered box. Record that state
    // separately instead of treating a hidden item's 0,0 as header occlusion.
    const controls = allControls.filter((control) => control.getClientRects().length > 0 &&
      getComputedStyle(control).visibility !== 'hidden')
    const main = document.querySelector('.clr-shell__content > main') ?? document.querySelector('#root main')
    const foot = main?.querySelector('.clr-scroll-region__foot') ?? null
    const footControls = foot === null ? [] : [...foot.querySelectorAll('button, a[href]')]
    const atmospheres = [...document.querySelectorAll('.clr-atmosphere')]
    const lowestAtmosphere = atmospheres.reduce((lowest, layer) => Math.max(lowest, layer.getBoundingClientRect().bottom), 0)
    const mainBox = box(main)
    const lastFoot = footControls.at(-1) ?? null
    return {
      path: location.pathname,
      skin: document.documentElement.dataset.skin ?? null,
      viewport: { width: innerWidth, height: innerHeight },
      visualViewportHeight: window.visualViewport?.height ?? null,
      documentClientHeight: document.documentElement.clientHeight,
      cssHeights: { vh: length('100vh'), dvh: length('100dvh'), svh: length('100svh'), lvh: length('100lvh') },
      spacing500: content === null ? null : parseFloat(getComputedStyle(content).getPropertyValue('--spacing-500')),
      spacing300: content === null ? null : parseFloat(getComputedStyle(content).getPropertyValue('--spacing-300')),
      spacing200: content === null ? null : parseFloat(getComputedStyle(content).getPropertyValue('--spacing-200')),
      scroller: box(scroller),
      screenContentPaddingBottom: screenContent === null ? null : parseFloat(getComputedStyle(screenContent).paddingBottom),
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
      hiddenHeaderControls: allControls.filter((control) => !controls.includes(control))
        .map((control) => control.getAttribute('aria-label') ?? control.textContent?.trim() ?? ''),
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
    skin: measured.skin,
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

/** The repaired contained shell, shared by routed, boot and fallback instances. */
function expectContainedShell(measured: Geometry, viewport: Viewport, insets: Insets,
  gap = measured.spacing500 ?? Number.NaN) {
  expect(measured.viewport).toEqual(viewport)
  expect(measured.shellCount).toBe(1)
  expect(measured.atmosphereCount).toBe(1)
  // The retained atmosphere still paints the whole viewport, insets included.
  expect(measured.unpaintedBelowAtmosphere).toBeCloseTo(0, 0)
  expect(measured.atmosphere?.y).toBeCloseTo(0, 0)
  expect(measured.shell?.height).toBeCloseTo(viewport.height, 0)
  expect(measured.cssHeights.dvh).toBeCloseTo(viewport.height, 0)
  expect(gap).toBeGreaterThan(0)
  // The page's top gap starts below the inset rather than inside it.
  expect(measured.contentPadding?.top).toBeCloseTo(insets.top + gap, 0)
  // The shell reserves nothing below: <main> reaches the viewport bottom.
  expect(measured.contentPadding?.bottom).toBeCloseTo(0, 0)
  expect(measured.bottomGapBelowMain).toBeCloseTo(0, 0)
  expect(measured.documentScroll.top).toBe(0)
  expect(measured.documentScroll.height).toBe(measured.documentScroll.client)
}

/** The bottom inset or the last layer's own gap, whichever is larger. */
function lastLayerGap(measured: Geometry, insets: Insets, gap = measured.spacing300 ?? Number.NaN) {
  return Math.max(gap, insets.bottom)
}

/**
 * The screen's last layer ends at the viewport bottom and owns the bottom
 * clearance. With a footer, its last action sits exactly that clearance above
 * the bottom edge; without one, the scroller runs to the edge and its content
 * keeps the same clearance after its last item.
 */
function expectBottomEdge(measured: Geometry, insets: Insets, gap?: number) {
  const clearance = lastLayerGap(measured, insets, gap)
  expect(clearance).toBeGreaterThan(0)
  if (measured.footControls.length > 0) {
    expect(measured.foot?.bottom).toBeCloseTo(measured.viewport.height, 0)
    expect(measured.bottomGapBelowLastFootControl).toBeCloseTo(clearance, 0)
  } else {
    expect(measured.scroller?.bottom).toBeCloseTo(measured.viewport.height, 0)
    expect(measured.screenContentPaddingBottom).toBeCloseTo(clearance, 0)
  }
}

/**
 * Long content: scrolled to its end, the last item clears the bottom inset
 * (no footer) or the footer's top edge, and nothing scrolls the document.
 */
async function expectEndOfContent(page: Page, insets: Insets) {
  const end = await page.evaluate(async () => {
    const scroller = document.querySelector('main .clr-scroll-region__scroller')
    const content = document.querySelector('main .clr-screen__content')
    const foot = document.querySelector('main .clr-scroll-region__foot')
    if (scroller === null || content === null) return null
    scroller.scrollTop = scroller.scrollHeight
    await new Promise((settle) => requestAnimationFrame(() => requestAnimationFrame(settle)))
    const last = content.lastElementChild
    return {
      overflowing: scroller.scrollHeight > scroller.clientHeight + 1,
      lastBottom: last?.getBoundingClientRect().bottom ?? null,
      limit: foot === null ? innerHeight : foot.getBoundingClientRect().top,
      hasFoot: foot !== null,
      documentScrollTop: document.scrollingElement?.scrollTop ?? null,
    }
  })
  expect(end).not.toBeNull()
  expect(end?.documentScrollTop).toBe(0)
  const limit = (end?.limit ?? 0) - (end?.hasFoot ? 0 : insets.bottom)
  expect(end?.lastBottom ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(limit + 0.5)
  return end
}

/**
 * Title and header controls: clear of the top inset by the page's own gap,
 * and hit-testable as themselves at every sampled point, upper quarter
 * included. These local measurements do not establish an installed-device
 * status-area effect; selected captures are reviewed separately.
 */
function expectClearHead(measured: Geometry, insets: Insets, gap = measured.spacing500 ?? Number.NaN) {
  const clearTop = insets.top + gap - 1
  expect(measured.title).not.toBeNull()
  expect(measured.title?.box?.y ?? -1).toBeGreaterThanOrEqual(clearTop)
  expect(measured.title?.hits.every((hit) => hit.clear)).toBe(true)
  if (measured.header !== null) expect(measured.header.y).toBeCloseTo(insets.top + gap, 0)
  for (const control of measured.headerControls) {
    expect(control.box?.y ?? -1).toBeGreaterThanOrEqual(clearTop)
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

/**
 * One representative per routed layout family. `lands` is where the route
 * actually resolves with this synthetic account; `header`/`foot` are what
 * that screen composes, so intentionally absent chrome is asserted absent.
 */
const ROUTED = [
  { consumer: 'Home', path: '/', lands: '/', state: 'populated', header: true, controls: true, foot: true },
  { consumer: 'Generate', path: '/generate', lands: '/generate', state: 'populated', header: true, controls: true, foot: true },
  { consumer: 'Settings', path: '/settings', lands: '/settings', state: 'populated, long, no footer', header: true, controls: true, foot: false },
  { consumer: 'Locations', path: '/settings/locations', lands: '/settings/locations', state: 'populated', header: true, controls: true, foot: null },
  { consumer: 'History', path: '/history', lands: '/history', state: 'populated', header: true, controls: true, foot: null },
  { consumer: 'Session detail', path: `/history/${HISTORY[0].id}`, lands: `/history/${HISTORY[0].id}`, state: 'error (synthetic read failure)', header: true, controls: true, foot: null },
  { consumer: 'Review (pre-start, nothing to review)', path: '/review', lands: '/review', state: 'empty', header: true, controls: null, foot: null },
  { consumer: 'Summary without a completed session', path: '/summary', lands: '/', state: 'guard redirect to Home', header: true, controls: true, foot: true },
  { consumer: 'Workout without an active session', path: '/workout', lands: '/', state: 'guard redirect to Home', header: true, controls: true, foot: true },
  { consumer: 'Not found', path: '/b05-shell-unknown', lands: '/b05-shell-unknown', state: 'short, no header, no footer', header: false, controls: null, foot: false },
] as const

for (const { consumer, path, lands, state, header, controls, foot } of ROUTED) {
  test(`B05 shell: routed ${consumer} clears its header and has no bottom band`, async ({ page, visit }, testInfo) => {
    test.setTimeout(120_000)
    testInfo.annotations.push({ type: 'proof-mode',
      description: 'Synthetic intercepted session, Chromium CSS env override; not installed-iPhone evidence.' })
    const app = await syntheticApp(page, { signedIn: true, history: 'ok' })
    await page.setViewportSize(PHONE.viewport)
    await withInsets(page, PHONE.insets, async () => {
      await visit(path)
      await expect(page.getByRole('heading', { level: 1 })).not.toHaveAccessibleName('CLEAR')
      if (lands !== null) await expect(page).toHaveURL((url) => url.pathname === lands)
      await expect(page.locator('main .clr-scroll-region[data-measured]')).toHaveCount(1)
      await expect(page.locator('[aria-busy="true"], .clr-scan-loader')).toHaveCount(0)
      if (header !== null) await expect(page.locator('.clr-shell__content > header')).toHaveCount(header ? 1 : 0)
      if (foot === true) await expect(page.locator('main .clr-scroll-region__foot button').first()).toBeVisible()
      if (foot === false) await expect(page.locator('main .clr-scroll-region__foot')).toHaveCount(0)
      const landed = new URL(page.url()).pathname
      const measured = await record(page, testInfo, `routed-${consumer.toLowerCase().replace(/[^a-z]+/g, '-').replace(/-$/, '')}-phone`, {
        family: 'routed', consumer: `${consumer} (landed ${landed})`, state, ...PHONE,
      })
      expectContainedShell(measured, PHONE.viewport, PHONE.insets)
      expectClearHead(measured, PHONE.insets)
      expectBottomEdge(measured, PHONE.insets)
      if (controls === true) expect(measured.headerControls.length).toBeGreaterThan(0)
      const end = await expectEndOfContent(page, PHONE.insets)
      if (end?.overflowing) {
        await record(page, testInfo, `routed-${consumer.toLowerCase().replace(/[^a-z]+/g, '-').replace(/-$/, '')}-phone-end`, {
          family: 'routed', consumer: `${consumer} (landed ${landed})`, state: `${state}, scrolled to end`, ...PHONE,
        })
      }
    })
    app.assertNoWrites()
  })
}

test('B05 shell: signed-in account without a profile lands in onboarding with the shared geometry', async ({ page, visit }, testInfo) => {
  test.setTimeout(120_000)
  const app = await syntheticApp(page, { signedIn: true, history: 'ok', profile: 'none' })
  await page.setViewportSize(PHONE.viewport)
  await withInsets(page, PHONE.insets, async () => {
    await visit('/')
    await expect(page.getByRole('heading', { level: 1 })).not.toHaveAccessibleName('CLEAR')
    await expect(page.locator('main .clr-scroll-region[data-measured]')).toHaveCount(1)
    const landed = new URL(page.url()).pathname
    const measured = await record(page, testInfo, 'guard-onboarding-phone', {
      family: 'guard', consumer: `no-profile redirect (landed ${landed})`, state: 'populated', ...PHONE,
    })
    expectContainedShell(measured, PHONE.viewport, PHONE.insets)
    expectClearHead(measured, PHONE.insets)
    expectBottomEdge(measured, PHONE.insets)
  })
  app.assertNoWrites()
})

test('B05 shell: Login keeps its header, footer action and bottom edge', async ({ page, visit }, testInfo) => {
  test.setTimeout(120_000)
  const app = await syntheticApp(page, { signedIn: false, history: 'ok' })
  await page.setViewportSize(PHONE.viewport)
  await withInsets(page, PHONE.insets, async () => {
    await visit('/login')
    await expect(page.locator('main .clr-scroll-region__foot button').first()).toBeVisible()
    const measured = await record(page, testInfo, 'routed-login-phone', {
      family: 'routed', consumer: 'Login', state: 'populated, footer action', ...PHONE,
    })
    expectContainedShell(measured, PHONE.viewport, PHONE.insets)
    expectClearHead(measured, PHONE.insets)
    expectBottomEdge(measured, PHONE.insets)
  })
  app.assertNoWrites()
})

for (const { consumer, path } of [
  { consumer: 'Home', path: '/' },
  { consumer: 'Settings', path: '/settings' },
] as const) {
  test(`B05 shell: ${consumer} across narrow, short (keyboard stand-in), zero-inset and lifecycle resume`, async ({ page, visit }, testInfo) => {
    test.setTimeout(120_000)
    testInfo.annotations.push({ type: 'proof-mode',
      description: 'Viewport resize stands in for keyboard height; CDP page freeze/resume is a Chromium lifecycle, not iOS app resume.' })
    const app = await syntheticApp(page, { signedIn: true, history: 'ok' })
    const slug = consumer.toLowerCase()
    await page.setViewportSize(PHONE.viewport)
    await withInsets(page, PHONE.insets, async (cdp) => {
      await visit(path)
      await expect(page).toHaveURL((url) => url.pathname === path)
      await expect(page.locator('main .clr-scroll-region[data-measured]')).toHaveCount(1)
      await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
      const before = await record(page, testInfo, `routed-${slug}-phone-before-resume`, {
        family: 'routed', consumer, state: 'populated', ...PHONE,
      })
      await cdp.send('Page.setWebLifecycleState', { state: 'frozen' })
      await cdp.send('Page.setWebLifecycleState', { state: 'active' })
      const after = await record(page, testInfo, `routed-${slug}-phone-after-resume`, {
        family: 'routed', consumer, state: 'populated, after frozen/active lifecycle', ...PHONE,
      })
      expect(after.main).toEqual(before.main)
      expect(after.header).toEqual(before.header)
      expect(after.scroller).toEqual(before.scroller)
      expectContainedShell(after, PHONE.viewport, PHONE.insets)
      expectClearHead(after, PHONE.insets)
      expectBottomEdge(after, PHONE.insets)

      // The keyboard stand-in shrinks the phone in place and then restores it,
      // as opening and closing the keyboard does.
      for (const [label, layout] of [['narrow', NARROW], ['short', SHORT], ['restored', PHONE]] as const) {
        await setInsets(cdp, layout.insets)
        await page.setViewportSize(layout.viewport)
        const measured = await record(page, testInfo, `routed-${slug}-${label}`, {
          family: 'routed', consumer, state: label === 'short' ? 'populated, keyboard-height stand-in' : 'populated', ...layout,
        })
        expectContainedShell(measured, layout.viewport, layout.insets)
        expectClearHead(measured, layout.insets)
        expectBottomEdge(measured, layout.insets)
        await expectEndOfContent(page, layout.insets)
      }

      await setInsets(cdp, ZERO)
      const flat = await record(page, testInfo, `routed-${slug}-zero-inset`, {
        family: 'routed', consumer, state: 'populated', viewport: PHONE.viewport, insets: ZERO,
      })
      expectContainedShell(flat, PHONE.viewport, ZERO)
      expectClearHead(flat, ZERO)
      // With no reported inset nothing is reserved below the last layer's own gap.
      expectBottomEdge(flat, ZERO)
    })
    app.assertNoWrites()
  })
}

/** The reviewed phone uses Vapour; capture its actual retained atmosphere too. */
for (const { consumer, path } of [
  { consumer: 'Home', path: '/' },
  { consumer: 'Generate', path: '/generate' },
  { consumer: 'Settings', path: '/settings' },
] as const) {
  test(`B05 shell: Vapour ${consumer} records the selected reference header and bottom regions`, async ({ page, visit }, testInfo) => {
    test.setTimeout(120_000)
    const app = await syntheticApp(page, { signedIn: true, history: 'ok', skin: 'vapour' })
    await page.setViewportSize(PHONE.viewport)
    await withInsets(page, PHONE.insets, async () => {
      await visit(path)
      await expect(page).toHaveURL((url) => url.pathname === path)
      await expect(page.locator('html')).toHaveAttribute('data-skin', 'vapour')
      await expect(page.locator('main .clr-scroll-region[data-measured]')).toHaveCount(1)
      await expect(page.locator('[aria-busy="true"], .clr-scan-loader')).toHaveCount(0)
      const context = { family: 'routed', consumer, state: 'populated, Vapour reference skin', ...PHONE }
      const measured = await record(page, testInfo, `vapour-${consumer.toLowerCase()}-phone`, context)
      expect(measured.skin).toBe('vapour')
      expectContainedShell(measured, PHONE.viewport, PHONE.insets)
      expectClearHead(measured, PHONE.insets)
      expectBottomEdge(measured, PHONE.insets)
      if (consumer === 'Settings') {
        await expectEndOfContent(page, PHONE.insets)
        await record(page, testInfo, 'vapour-settings-phone-end', {
          ...context, state: 'populated, Vapour reference skin, scrolled to end',
        })
      }
    })
    app.assertNoWrites()
  })
}

test('B05 shell: actual active Workout keeps its compact short-window navigation and restores normal geometry', async ({ page, visit }, testInfo) => {
  test.setTimeout(120_000)
  testInfo.annotations.push({ type: 'proof-mode',
    description: 'Synthetic active session on the real Workout route; viewport resize and CDP lifecycle are not installed-iPhone evidence.' })
  const app = await syntheticApp(page, { signedIn: true, history: 'ok', activeWorkout: true })
  await page.setViewportSize(PHONE.viewport)
  await withInsets(page, PHONE.insets, async (cdp) => {
    await visit('/workout')
    await expect(page).toHaveURL((url) => url.pathname === '/workout')
    await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('Workout')
    await expect(page.locator('main .clr-scroll-region__foot > .clr-workout-footer')).toHaveCount(1)
    const navigation = page.getByRole('navigation', { name: 'Workout sections', exact: true })
    const actions = page.getByRole('button', { name: 'Actions', exact: true })
    const previous = navigation.getByRole('button', { name: 'Previous', exact: true })
    const next = navigation.getByRole('button', { name: 'Next section', exact: true })
    await expect(previous).toBeDisabled()
    await expect(next).toBeEnabled()
    await expect(actions).toBeVisible()
    const before = await record(page, testInfo, 'routed-workout-active-phone', {
      family: 'routed', consumer: 'Workout (actual active session)', state: 'populated', ...PHONE,
    })
    expectContainedShell(before, PHONE.viewport, PHONE.insets)
    expectClearHead(before, PHONE.insets)
    expectBottomEdge(before, PHONE.insets)
    for (const [label, layout] of [['narrow', NARROW], ['short', SHORT], ['restored', PHONE]] as const) {
      await setInsets(cdp, layout.insets)
      await page.setViewportSize(layout.viewport)
      const measured = await record(page, testInfo, `routed-workout-active-${label}`, {
        family: 'routed', consumer: 'Workout (actual active session)',
        state: label === 'short' ? 'populated, compact keyboard-height stand-in' : 'populated', ...layout,
      })
      // The existing Workout-only short-window composition narrows page gaps,
      // while retaining the actual safe-area values and full-size navigation.
      const short = label === 'short'
      const topGap = (short ? measured.spacing200 : measured.spacing500) ?? Number.NaN
      const bottomGap = (short ? measured.spacing200 : measured.spacing300) ?? Number.NaN
      expectContainedShell(measured, layout.viewport, layout.insets, topGap)
      expectClearHead(measured, layout.insets, topGap)
      expectBottomEdge(measured, layout.insets, bottomGap)
      await expect(previous).toBeInViewport({ ratio: 1 })
      await expect(next).toBeInViewport({ ratio: 1 })
      await expect(actions).toBeInViewport({ ratio: 1 })
    }
    await cdp.send('Page.setWebLifecycleState', { state: 'frozen' })
    await cdp.send('Page.setWebLifecycleState', { state: 'active' })
    const after = await record(page, testInfo, 'routed-workout-active-after-resume', {
      family: 'routed', consumer: 'Workout (actual active session)',
      state: 'populated, restored after frozen/active lifecycle', ...PHONE,
    })
    expect(after.main).toEqual(before.main)
    expect(after.header).toEqual(before.header)
    expectContainedShell(after, PHONE.viewport, PHONE.insets)
    expectClearHead(after, PHONE.insets)
    expectBottomEdge(after, PHONE.insets)
    await expect(page).toHaveURL((url) => url.pathname === '/workout')
  })
  app.assertNoWrites()
})

test('B05 shell: signed-out guard lands in the routed shell with the shared geometry', async ({ page, visit }, testInfo) => {
  test.setTimeout(120_000)
  const app = await syntheticApp(page, { signedIn: false, history: 'ok' })
  await page.setViewportSize(PHONE.viewport)
  await withInsets(page, PHONE.insets, async () => {
    await visit('/')
    await expect(page).not.toHaveURL((url) => url.pathname === '/')
    const measured = await record(page, testInfo, 'guard-signed-out-phone', {
      family: 'guard', consumer: `signed-out redirect (landed ${new URL(page.url()).pathname})`, state: 'populated', ...PHONE,
    })
    expectContainedShell(measured, PHONE.viewport, PHONE.insets)
    expectClearHead(measured, PHONE.insets)
    expectBottomEdge(measured, PHONE.insets)
  })
  app.assertNoWrites()
})

for (const mode of ['hold', 'fail'] as const) {
  test(`B05 shell: independent boot shell (${mode === 'hold' ? 'checking' : 'failed'}) has the shared geometry`, async ({ page, visit }, testInfo) => {
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
        expectBottomEdge(measured, PHONE.insets)
      })
    } finally {
      app.release()
    }
    app.assertNoWrites()
  })
}

test('B05 shell: crash fallback renders inside the shared contained shell with safe-area clearance', async ({ page, visit }, testInfo) => {
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
      // The fallback is now the same contained shell, with a still atmosphere.
      expectContainedShell(measured, PHONE.viewport, PHONE.insets)
      expectClearHead(measured, PHONE.insets)
      expectBottomEdge(measured, PHONE.insets)
      await expect(page.locator('.clr-atmosphere[data-static="true"]')).toHaveCount(1)
      expect(alertBox?.y ?? Number.NaN).toBeGreaterThanOrEqual(PHONE.insets.top + (measured.spacing500 ?? 0) - 1)
      await expect(page.getByRole('main')).toHaveCount(1)
    })
  } finally {
    app.release()
  }
  app.assertNoWrites()
})
