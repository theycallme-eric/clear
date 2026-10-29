import { execSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import type { Locator, Page, Route, TestInfo } from '@playwright/test'

import { readE2eEnv } from '../scripts/e2e/env.mjs'
import type { WorkoutSessionRow } from '../src/state/schemas'
import { makeSessionRow } from '../src/test/factories'
import { fixtureLocation, onboardedProfile } from '../src/test/user-data-double'
import { installDeterministicCapture } from './design-0143/fixtures'
import { expect, test as scanned } from './fixtures'

/**
 * UI polish batch 05 — recent-row status/date alignment (REQ-004, TASK-004).
 *
 * B05-01.5 marks the recent row's status and date as crooked: the date sat
 * below the status word. B05-01.3 is a no-change note: long titles keep their
 * current handling. Both rows render through `history-list.tsx`; History's
 * chronology row is the deliberate variant and stays as it is.
 *
 * Every case renders the production Home or History route at a phone
 * viewport, measures the rendered text boxes, and records a capture plus its
 * identity beside the test output. The pixels are compared with the reference
 * by review; the geometry below is what the review is checked against.
 *
 * Data is synthetic: an intercepted session for a fictional user, synthetic
 * reads, and no writes, model calls or real account.
 */
const OWNER = '00000000-0000-4000-8000-000000000004'
const PLACE = '00000000-0000-4000-8000-000000000041'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
}

/** Same reasoning as the B05 shell spec: placeholders on `.invalid`, never forwarded. */
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
  throw new Error(`Synthetic recent-row origin ${origin} did not start`)
}

const test = scanned.extend<object, { syntheticOrigin: string | null }>({
  syntheticOrigin: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use, workerInfo) => {
      if (!SYNTHETIC_ORIGIN_NEEDED) return use(null)
      const port = 5390 + workerInfo.parallelIndex
      const origin = `http://localhost:${port}`
      const server = spawn(process.execPath, [
        resolve(import.meta.dirname, '../node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort',
      ], {
        env: {
          ...process.env,
          VITE_SUPABASE_URL: 'https://synthetic-b05-recent-rows.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-b05-recent-rows-public-placeholder',
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
/** The portrait phone B05 was captured on, and the narrowest supported one. */
const VIEWPORTS: ReadonlyArray<{ name: string; viewport: Viewport }> = [
  { name: 'phone-390', viewport: { width: 390, height: 844 } },
  { name: 'narrow-320', viewport: { width: 320, height: 568 } },
]

const REFERENCE_DIR = resolve(import.meta.dirname, '..', '..', '.evidence',
  basename(resolve(import.meta.dirname, '..')), 'sources')
const REFERENCE_FILE = 'sources/source-04-B05-01-home.jpg'
const REFERENCE_PATH = resolve(REFERENCE_DIR, basename(REFERENCE_FILE))
const REFERENCE = {
  file: REFERENCE_FILE,
  sha256: existsSync(REFERENCE_PATH)
    ? createHash('sha256').update(readFileSync(REFERENCE_PATH)).digest('hex')
    : null,
  regions: {
    '01.3': 'Recent workouts card, first row: long two-line title (marker 3)',
    '01.5': 'Recent workouts card, both rows: status glyph + COMPLETED beside the date (marker 5 red line)',
  },
}

function sourceIdentity() {
  try {
    const head = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim()
    const dirty = execSync('git status --porcelain', { encoding: 'utf8' }).trim() !== ''
    return { head, dirty }
  } catch {
    return { head: process.env.GITHUB_SHA ?? 'unknown', dirty: null }
  }
}

function session(index: number, date: string, overrides: Partial<WorkoutSessionRow> = {}) {
  return makeSessionRow({
    id: `00000000-0000-4000-8000-00000000040${index}`,
    user_id: OWNER, location_id: PLACE, date,
    created_at: `${date}T09:00:00.000Z`, updated_at: `${date}T10:00:00.000Z`,
    started_at: `${date}T09:00:00.000Z`, completed_at: `${date}T10:00:00.000Z`,
    goal_preset: 'strength', session_focus: 'upper_body',
    requested_duration_mins: 45, actual_duration_mins: 55,
    requested_intensity: 8, effective_intensity: 8,
    ...overrides,
  })
}

function abandoned(index: number, date: string, started: boolean, overrides: Partial<WorkoutSessionRow> = {}) {
  return session(index, date, {
    completed_at: null, abandoned_at: `${date}T09:20:00.000Z`,
    started_at: started ? `${date}T09:00:00.000Z` : null,
    actual_duration_mins: started ? 18 : null,
    counts_for_streak: false,
    ...overrides,
  })
}

/** B05-01's pictured rows: a long two-line title and a short one, both completed. */
const PICTURED = [
  session(1, '2026-10-24', { title: 'Upper Body Push/Pull Strength & Conditioning Session' }),
  session(2, '2026-10-22', { title: 'Balanced Power Session', session_focus: 'power',
    goal_preset: 'balanced', actual_duration_mins: 43, effective_intensity: 7 }),
  abandoned(3, '2026-10-21', true, { title: 'Lower Body Posterior Chain Hypertrophy & Stability Session',
    session_focus: 'lower_body' }),
]
/** Every result status with long titles and the widest date shapes. */
const STATUSES = [
  abandoned(4, '2026-09-30', false, { title: 'Full Body Metabolic Conditioning Intervals & Core Session',
    session_focus: 'full_body' }),
  abandoned(5, '2026-09-23', true, { title: 'Supersets: Dumbbell Contralateral Unilateral Stabilisation Work' }),
  session(6, '2026-09-16', { title: 'Wednesday Heavy Compound Strength & Accessory Conditioning' }),
]
const SETS = { pictured: PICTURED, statuses: STATUSES } as const

const STATUS_LABEL: Record<string, string> = {
  completed: 'Completed', partial: 'Partial', unstarted: 'Not started',
}

async function syntheticApp(page: Page, rows: readonly WorkoutSessionRow[]) {
  const unexpected: string[] = []
  let attemptedWrites = 0
  const guard = await installDeterministicCapture(page, { skin: 'clear', reducedMotion: true })
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
      if (name === 'locations') return reply([fixtureLocation({ id: PLACE, user_id: OWNER, tier: 'full' })])
      if (name === 'workout_sessions') return reply(rows)
      if (['rest_days', 'load_anchors', 'location_equipment', 'saved_workouts',
        'saved_workout_attempts', 'saved_workout_completions'].includes(name)) return reply([])
    }
    if (request.method() === 'POST' && url.pathname.includes('/rpc/')) {
      if (name === 'resume_session') return reply(null)
      if (name === 'streak_sessions') return reply(rows
        .filter((row) => row.completed_at !== null)
        .map((row) => ({ session_id: row.id, completed_at: row.completed_at,
          counts_for_streak: row.counts_for_streak })))
      if (['constraints_in_force', 'anchor_evidence', 'conditioning_history'].includes(name)) return reply([])
    }
    if (request.method() !== 'GET') attemptedWrites += 1
    unexpected.push(`${request.method()} ${url.pathname}`)
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic recent-row request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ owner }) => {
    localStorage.setItem('clear.auth.session', JSON.stringify({
      accessToken: 'synthetic-b05-recent-rows-session', refreshToken: 'synthetic-b05-recent-rows-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-b05-recent-rows@example.invalid' },
    }))
  }, { owner: OWNER })
  return {
    assertReadOnly() {
      expect(unexpected).toEqual([])
      expect(attemptedWrites).toBe(0)
      expect(guard.blockedGenerations()).toBe(0)
    },
  }
}

/** Rendered text boxes of one recent row: the glyph, the status word and the date. */
async function recentRowGeometry(row: Locator) {
  return row.evaluate((element) => {
    const part = (name: string) => element.querySelector<HTMLElement>(`[data-part="${name}"]`)!
    const textBox = (node: Element) => {
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT)
      const range = document.createRange()
      let first: Text | null = null
      let last: Text | null = null
      for (let current = walker.nextNode(); current !== null; current = walker.nextNode()) {
        if ((current.parentElement?.closest('[aria-hidden="true"]') ?? null) !== null) continue
        if ((current.textContent ?? '').trim() === '') continue
        first ??= current as Text
        last = current as Text
      }
      range.setStart(first!, 0)
      range.setEnd(last!, last!.length)
      const rects = [...range.getClientRects()]
      const rect = range.getBoundingClientRect()
      return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, lines: new Set(rects.map((r) => Math.round(r.top))).size }
    }
    const status = part('status')
    const date = part('date')
    const title = part('title')
    const metadata = part('status-date')
    const metadataBox = metadata.getBoundingClientRect()
    const glyph = status.querySelector('[aria-hidden="true"]')!.getBoundingClientRect()
    const titleStyle = getComputedStyle(title)
    const probe = document.createElement('div')
    probe.style.cssText = 'position:fixed;visibility:hidden;font-size:var(--label-md-size)'
    document.body.append(probe)
    const tokenSize = getComputedStyle(probe).fontSize
    probe.remove()
    return {
      metadata: { left: metadataBox.left, right: metadataBox.right,
        scrollWidth: metadata.scrollWidth, clientWidth: metadata.clientWidth },
      status: textBox(status),
      date: textBox(date),
      glyph: { top: glyph.top, bottom: glyph.bottom, left: glyph.left, height: glyph.height },
      statusFont: getComputedStyle(status).font,
      dateFont: getComputedStyle(date).font,
      title: {
        text: title.textContent,
        box: textBox(title),
        fontSize: titleStyle.fontSize,
        tokenFontSize: tokenSize,
        whiteSpace: titleStyle.whiteSpace,
        textOverflow: titleStyle.textOverflow,
        lineClamp: titleStyle.getPropertyValue('-webkit-line-clamp'),
        overflowsX: title.scrollWidth > title.clientWidth,
        overflowsY: title.scrollHeight > title.clientHeight + 1,
      },
    }
  })
}

/** The chronology row's own composition, recorded so a change to it is visible. */
async function chronologyRowGeometry(row: Locator) {
  return row.evaluate((element) => {
    const head = element.querySelector<HTMLElement>('[data-part="head"]')
    const context = element.querySelector<HTMLElement>('[data-part="context"]')
    const status = head?.querySelector<HTMLElement>('[data-part="status"]') ?? null
    const box = (node: Element | null) => {
      if (node === null) return null
      const rect = node.getBoundingClientRect()
      return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right }
    }
    return {
      hasHead: head !== null,
      hasStatusDate: element.querySelector('[data-part="status-date"]') !== null,
      headAlignItems: head === null ? null : getComputedStyle(head).alignItems,
      headJustify: head === null ? null : getComputedStyle(head).justifyContent,
      status: status?.textContent ?? null,
      context: context?.textContent ?? null,
      headBox: box(head),
      statusBox: box(status),
      contextBox: box(context),
    }
  })
}

/**
 * One capture per row: a whole card or list can be taller than the inner
 * scroll region, and an element screenshot clips to what that region shows.
 */
async function record(page: Page, rows: readonly Locator[], testInfo: TestInfo, id: string, context: {
  consumer: string; layout: string; state: string; viewport: Viewport
  criteria: Record<string, 'pass' | 'fail'>; measurements: unknown
}) {
  await page.evaluate(() => document.fonts.ready)
  const captures = []
  for (const [index, row] of rows.entries()) {
    await row.scrollIntoViewIfNeeded()
    const shot = await row.screenshot({ animations: 'disabled' })
    const file = `${id}-row${index + 1}.png`
    const shotPath = testInfo.outputPath(file)
    writeFileSync(shotPath, shot)
    await testInfo.attach(file, { path: shotPath, contentType: 'image/png' })
    captures.push({ file, sha256: createHash('sha256').update(shot).digest('hex') })
  }
  const entry = {
    id,
    ...context,
    reference: REFERENCE,
    source: sourceIdentity(),
    target: new URL(page.url()).origin,
    route: new URL(page.url()).pathname,
    skin: await page.locator('html').getAttribute('data-skin'),
    syntheticPublicConfig: SYNTHETIC_ORIGIN_NEEDED,
    browser: `${testInfo.project.name} (Chromium emulation, deviceScaleFactor ${testInfo.project.use.deviceScaleFactor ?? 1})`,
    captures,
  }
  writeFileSync(testInfo.outputPath(`${id}.json`), JSON.stringify(entry, null, 2))
  await testInfo.attach(`${id}.json`, { body: JSON.stringify(entry, null, 2), contentType: 'application/json' })
}

/** Sub-pixel rounding only; the defect measured several CSS px. */
const TOLERANCE = 0.75

for (const { name: size, viewport } of VIEWPORTS) {
  test.describe(`B05 recent rows @ ${size}`, () => {
    test.use({ viewport })

    for (const [state, rows] of Object.entries(SETS)) {
      test(`Home recents (${state}): status and date share one baseline; long titles keep their handling`, async ({ page, visit }, testInfo) => {
        const app = await syntheticApp(page, rows)
        await visit('/')
        const list = page.getByRole('list', { name: /recent workouts/i })
        const items = list.getByRole('listitem')
        await expect(items).toHaveCount(3)

        // Use the same published skin contract as the standing capture lane:
        // persisted choice plus the root attribute, never altered layout CSS.
        for (const skin of ['clear', 'vapour'] as const) {
          await page.evaluate((value) => {
            localStorage.setItem('clear.skin', value)
            document.documentElement.setAttribute('data-skin', value)
          }, skin)
          await expect(page.locator('html')).toHaveAttribute('data-skin', skin)
          await page.evaluate(() => document.fonts.ready)
          const measured = []
          for (const [index, source] of rows.entries()) {
            const row = items.nth(index)
            const status = source.completed_at !== null ? 'completed'
              : source.started_at !== null ? 'partial' : 'unstarted'
            await row.scrollIntoViewIfNeeded()
            const shown = source.title.replace(/\s+session\s*$/i, '')
            await expect(row).toHaveAttribute('data-status', status)
            await expect(row.locator('[data-part="title"]')).toHaveText(shown)
            await expect(row.locator('[data-part="status"]')).toHaveText(STATUS_LABEL[status])
            const geometry = await recentRowGeometry(row)

            // Both pieces are kept, each whole, in the same type.
            expect(geometry.date.lines).toBe(1)
            expect(geometry.status.lines).toBe(1)
            expect(geometry.statusFont).toBe(geometry.dateFont)
            const wrapped = geometry.date.top >= geometry.status.bottom
            // The same row/baseline is required at every supported phone width.
            expect(wrapped, JSON.stringify(geometry)).toBe(false)
            expect(Math.abs(geometry.status.bottom - geometry.date.bottom), JSON.stringify(geometry)).toBeLessThanOrEqual(TOLERANCE)
            expect(Math.abs(geometry.status.top - geometry.date.top), JSON.stringify(geometry)).toBeLessThanOrEqual(TOLERANCE)
            expect(geometry.date.left).toBeGreaterThan(geometry.status.right)
            expect(geometry.glyph.left).toBeGreaterThanOrEqual(geometry.metadata.left - TOLERANCE)
            expect(geometry.date.right).toBeLessThanOrEqual(geometry.metadata.right + TOLERANCE)
            expect(geometry.metadata.scrollWidth).toBeLessThanOrEqual(geometry.metadata.clientWidth + 1)
            measured.push({ result: status, wrapped, ...geometry })
            // The glyph sits on the word's line, centred on it.
            const glyphCentre = (geometry.glyph.top + geometry.glyph.bottom) / 2
            const textCentre = (geometry.status.top + geometry.status.bottom) / 2
            expect(Math.abs(glyphCentre - textCentre), JSON.stringify(geometry)).toBeLessThanOrEqual(1.5)

            // 01.3: the whole title, wrapping, at its token size — not cut or shrunk.
            expect(geometry.title.text).toBe(shown)
            expect(geometry.title.fontSize).toBe(geometry.title.tokenFontSize)
            expect(geometry.title.whiteSpace).toBe('normal')
            expect(geometry.title.textOverflow).not.toBe('ellipsis')
            expect(['', 'none']).toContain(geometry.title.lineClamp)
            expect(geometry.title.overflowsX).toBe(false)
            expect(geometry.title.overflowsY).toBe(false)
            if (shown.length > 40) expect(geometry.title.box.lines).toBeGreaterThanOrEqual(2)
          }

          await record(page, await items.all(), testInfo, `home-recents-${state}-${size}-${skin}`, {
            consumer: 'Home recent workouts (HistoryList layout="recent")',
            layout: 'recent', state: `returning user, ${state} rows`, viewport,
            criteria: { 'AC-011': 'pass', 'AC-012': 'pass', 'AC-013': 'pass' },
            measurements: measured,
          })
        }
        app.assertReadOnly()
      })
    }

    test('History chronology keeps its deliberate head/context layout', async ({ page, visit }, testInfo) => {
      const app = await syntheticApp(page, [...PICTURED, ...STATUSES])
      await visit('/history')
      const link = page.getByRole('link', { name: PICTURED[0].title, exact: true })
      await expect(link).toBeVisible()
      const list = page.getByRole('list').filter({ has: link })
      const measured = []
      const sessionRows = []
      for (const source of [...PICTURED, ...STATUSES]) {
        const row = list.getByRole('listitem').filter({
          has: page.getByRole('link', { name: source.title, exact: true }),
        })
        sessionRows.push(row)
        const geometry = await chronologyRowGeometry(row)
        measured.push(geometry)
        // The chronology's title+status head and date · focus context remain;
        // the recent row's status/date line is not imposed on it.
        expect(geometry.hasHead).toBe(true)
        expect(geometry.hasStatusDate).toBe(false)
        expect(geometry.headAlignItems).toBe('baseline')
        expect(geometry.headJustify).toBe('space-between')
        expect(geometry.context).toMatch(/^\w{3} \d{1,2} \w{3} \d{4} · /)
        expect(geometry.contextBox!.top).toBeGreaterThanOrEqual(geometry.headBox!.bottom - 1)
      }
      await record(page, sessionRows, testInfo, `history-chronology-${size}`, {
        consumer: 'History chronology (HistoryList layout="chronology")',
        layout: 'chronology', state: 'all six synthetic sessions with rest runs', viewport,
        criteria: { 'AC-012': 'pass' },
        measurements: measured,
      })
      app.assertReadOnly()
    })
  })
}
