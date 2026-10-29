import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import type { Locator, Page, Route, TestInfo } from '@playwright/test'

import { readE2eEnv } from '../scripts/e2e/env.mjs'
import { sessionSnapshotSchema } from '../src/state/schemas'
import { fixtureLocation, onboardedProfile } from '../src/test/user-data-double'
import { definitionFixture, snapshotFixture } from '../src/test/workout-double'
import { installDeterministicCapture } from './design-0143/fixtures'
import { expect, test as scanned } from './fixtures'

/**
 * UI polish batch 05 — unit-field fit (REQ-006, TASK-006).
 *
 * B05-02.9: Generate's Time available end cap clipped its unit ("M…UTES"),
 * and the owner asked for more room for it. The fit is the app's contract for
 * the public Input `unit` (src/styles/fields.css): the cap is sized by its
 * text and the control gives up the room, so no consumer sets a width.
 *
 * Generate's actual route is rendered at the shown phone width and the
 * narrowest supported one in every skin; the gallery frames the equivalent
 * unit-field variants through the same public Input, including the public
 * Input card's narrow `kg` specimen. Each field is measured in the DOM and in
 * the pixels of its actual capture, and the same pixel measure is taken of the
 * reference's 02.9 region, which shows the defect. Logging's Unit choice is a
 * Select, not an end cap; it keeps its value and behaviour.
 *
 * Data is synthetic and intercepted: no writes, no model calls, no request
 * leaves the local Vite origin. None of this is an installed-iPhone result.
 */
const OWNER = '00000000-0000-4000-8000-000000000006'
const AUTH_KEY = 'clear.auth.session'
const LOCATION_ID = '00000000-0000-4000-8000-000000000061'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
}

type Viewport = { width: number; height: number }
/** The portrait phone B05 was captured on, and the narrowest supported one. */
const VIEWPORTS: ReadonlyArray<{ name: string; viewport: Viewport }> = [
  { name: 'phone-390', viewport: { width: 390, height: 844 } },
  { name: 'narrow-320', viewport: { width: 320, height: 568 } },
]
const SKINS = ['clear', 'vapour', 'signal', 'mono'] as const

const WORKOUT = sessionSnapshotSchema.parse(snapshotFixture({
  userId: OWNER,
  title: 'Synthetic B05 unit-field workout',
  startedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
  session: { location_id: LOCATION_ID, goal_preset: 'strength' },
  sections: [
    { title: 'Strength', sectionType: 'primary_lift', blocks: [{ exercises: [{ prescription: {
      exercise_id: 'back-squat', sets: 3, target_value: 5, rest_seconds: 90,
    } }] }] },
  ],
}))
const WORKOUT_EXERCISES = WORKOUT.sections.flatMap((section) => section.blocks
  .flatMap((block) => block.exercises.map(({ exercise }) => exercise)))

/**
 * The reviewed reference, read every run: a missing or unreadable file fails
 * the proof rather than yielding a capture with no reference behind it.
 */
const REFERENCE_DIR = resolve(import.meta.dirname, '..', '..', '.evidence',
  basename(resolve(import.meta.dirname, '..')), 'sources')
const REFERENCE_FILE = 'sources/source-05-B05-02-generate.jpg'
/**
 * B05-02.9 in the reference's own pixels (1550×1974, the phone 910px wide for
 * a 390px viewport). The scan runs between the cap's left rule (x≈690–692)
 * and the frame's right border (x≈848–850), over MINUTES' rows. Marker 9's
 * white numeral sits mid-cap; only the ink's two extremes are used.
 */
const REFERENCE_REGION = {
  id: '02.9',
  description: 'Time available field, MINUTES end cap (marker 9: "Make more room for minutes here")',
  rule: 692, border: 849, top: 1300, bottom: 1352, scale: 910 / 390,
}
function reference() {
  const bytes = readFileSync(resolve(REFERENCE_DIR, basename(REFERENCE_FILE)))
  return { file: REFERENCE_FILE, sha256: createHash('sha256').update(bytes).digest('hex'), bytes }
}

function sourceIdentity() {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  if (!/^[a-f0-9]{40}$/.test(head)) throw new Error('Unit-field capture requires an actual Git source identity')
  return {
    head,
    dirty: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim() !== '',
  }
}

/** As the other B05 specs: serve a bundle with non-secret placeholders when no public URL is configured. */
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
  throw new Error(`Synthetic unit-field origin ${origin} did not start`)
}

const test = scanned.extend<object, { syntheticOrigin: string | null }>({
  syntheticOrigin: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use, workerInfo) => {
      if (!SYNTHETIC_ORIGIN_NEEDED) return use(null)
      const port = 5590 + workerInfo.parallelIndex
      const origin = `http://localhost:${port}`
      const server = spawn(process.execPath, [
        resolve(import.meta.dirname, '../node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort',
      ], {
        env: {
          ...process.env,
          VITE_SUPABASE_URL: 'https://synthetic-b05-unit-fields.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-b05-unit-fields-public-placeholder',
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
  baseURL: async ({ baseURL, syntheticOrigin }, use) => use(syntheticOrigin ?? baseURL),
  checkA11y: async ({ page, checkA11y }, use) => {
    await use(async () => {
      if (new URL(page.url()).pathname === '/dev/gallery/app') {
        // Boot has its own h1. Wait for the lazy gallery route, rather than
        // scanning the transient AppChrome shell after that boot heading.
        await expect(page.getByRole('heading', {
          level: 1, name: 'Component Gallery', exact: true,
        })).toBeVisible()
        await expect(page.getByRole('main')).toBeVisible()
        await expect(page.getByRole('heading', {
          level: 3, name: 'Input', exact: true,
        })).toBeVisible()
      }
      // The standing fixture still performs and asserts the first whole-page
      // scan. No preliminary scan, retry or selector exclusion is used.
      await checkA11y()
    })
  },
})

async function syntheticApp(page: Page, origin: string, mode: { activeWorkout?: boolean } = {}) {
  const unexpected: string[] = []
  let attemptedWrites = 0
  const blockedOutbound: string[] = []
  const guard = await installDeterministicCapture(page, { skin: 'clear', reducedMotion: true })
  // Registered first: the API mocks below take precedence. Everything else
  // must be a read from this exact local Vite origin, never another service.
  await page.route('**/*', (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin === origin && ['GET', 'HEAD'].includes(request.method())) return route.continue()
    blockedOutbound.push(`${request.method()} ${url.origin}${url.pathname}`)
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
      if (name === 'profiles') return reply([onboardedProfile({ id: OWNER, goal_preset: 'balanced' })])
      if (name === 'locations') {
        return reply([fixtureLocation({ id: LOCATION_ID, user_id: OWNER, tier: 'full', name: 'Building gym', is_default: true })])
      }
      if (mode.activeWorkout && name === 'exercise_definitions') {
        const id = url.searchParams.get('id')?.replace(/^eq\./, '')
        return reply(WORKOUT_EXERCISES.filter((exercise) => id === undefined || exercise.exercise_id === id)
          .map((exercise) => definitionFixture({ id: exercise.exercise_id })))
      }
      if (mode.activeWorkout && name === 'workout_exercises') return reply(WORKOUT_EXERCISES)
      if (['workout_sessions', 'load_anchors', 'location_equipment', 'saved_workout_attempts', 'saved_workouts',
        'saved_workout_completions', 'rest_days'].includes(name)) return reply([])
    }
    if (request.method() === 'POST' && url.pathname.includes('/rpc/')) {
      if (name === 'resume_session') return reply(mode.activeWorkout ? WORKOUT : null)
      if (mode.activeWorkout && name === 'session_snapshot') return reply(WORKOUT)
      // A read: the logger's earlier-performance lookup finds no prior session.
      if (mode.activeWorkout && name === 'session_as_performed') return reply(null)
      if (['streak_sessions', 'constraints_in_force', 'anchor_evidence', 'conditioning_history'].includes(name)) {
        return reply([])
      }
    }
    if (request.method() !== 'GET') attemptedWrites += 1
    unexpected.push(`${request.method()} ${url.pathname}`)
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic unit-field request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ authKey, owner }) => {
    localStorage.setItem(authKey, JSON.stringify({
      accessToken: 'synthetic-b05-unit-fields-session', refreshToken: 'synthetic-b05-unit-fields-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-b05-unit-fields@example.invalid' },
    }))
  }, { authKey: AUTH_KEY, owner: OWNER })
  return {
    assertReadOnly() {
      expect(attemptedWrites, unexpected.join(', ')).toBe(0)
      expect(unexpected, 'Every API request must have an explicit synthetic read disposition').toEqual([])
      expect(blockedOutbound, 'No request may leave the exact local read origin/API mocks').toEqual([])
      expect(guard.blockedGenerations()).toBe(0)
    },
  }
}

/** The field, its unit cap and the unit text as laid out, in CSS px. */
async function unitGeometry(input: Locator) {
  return input.evaluate((element) => {
    const field = element.closest('.clr-field')!
    const unit = field.querySelector<HTMLElement>('.clr-field__unit')!
    const range = document.createRange()
    range.selectNodeContents(unit)
    const box = (rect: DOMRect) => ({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width })
    const unitStyle = getComputedStyle(unit)
    return {
      text: unit.textContent,
      rendered: unitStyle.textTransform === 'uppercase' ? (unit.textContent ?? '').toUpperCase() : unit.textContent,
      lines: new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size,
      field: box(field.getBoundingClientRect()),
      unit: box(unit.getBoundingClientRect()),
      textBox: box(range.getBoundingClientRect()),
      input: box(element.getBoundingClientRect()),
      ruleWidth: parseFloat(unitStyle.borderLeftWidth),
      frameWidth: parseFloat(getComputedStyle(field).getPropertyValue('--border-width')) || parseFloat(unitStyle.borderLeftWidth),
      padding: { left: parseFloat(unitStyle.paddingLeft), right: parseFloat(unitStyle.paddingRight) },
      scrollWidth: unit.scrollWidth,
      clientWidth: unit.clientWidth,
      flex: unitStyle.flex,
      whiteSpace: unitStyle.whiteSpace,
      font: unitStyle.font,
      glyph: field.querySelector('.clr-field__glyph') !== null,
    }
  })
}

/**
 * The unit's ink in a decoded image, decoded by the browser's own canvas: the
 * per-column brightest pixel over the text rows, between the cap's rule and the
 * frame's right border, thresholded part-way from the cap surface to the
 * brightest ink. Returns the first and last ink columns, in image pixels.
 */
async function inkExtent(page: Page, image: Buffer, type: string, scan: { from: number; to: number; top: number; bottom: number; surfaceRow: number }) {
  return page.evaluate(async ({ data, type, scan }) => {
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
    const bitmap = await createImageBitmap(new Blob([bytes], { type }))
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const context = canvas.getContext('2d')!
    context.drawImage(bitmap, 0, 0)
    const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data
    const lum = (x: number, y: number) => {
      const i = (y * bitmap.width + x) * 4
      return 0.2126 * pixels[i]! + 0.7152 * pixels[i + 1]! + 0.0722 * pixels[i + 2]!
    }
    const columns: number[] = []
    for (let x = scan.from; x <= scan.to; x += 1) {
      let brightest = 0
      for (let y = scan.top; y <= scan.bottom; y += 1) brightest = Math.max(brightest, lum(x, y))
      columns.push(brightest)
    }
    const surfaceSamples: number[] = []
    for (let x = scan.from; x <= scan.to; x += 1) surfaceSamples.push(lum(x, scan.surfaceRow))
    surfaceSamples.sort((a, b) => a - b)
    const surface = surfaceSamples[Math.floor(surfaceSamples.length / 2)]!
    const peak = Math.max(...columns)
    const threshold = surface + 0.4 * (peak - surface)
    const ink = columns.map((value, index) => (value > threshold ? scan.from + index : -1)).filter((x) => x >= 0)
    return { width: bitmap.width, surface, peak, threshold, first: ink[0] ?? null, last: ink.at(-1) ?? null }
  }, { data: image.toString('base64'), type, scan })
}

/** B05-02.9 measured the same way, in CSS px at the shown phone width. */
async function referenceFit(page: Page) {
  const ref = reference()
  const region = REFERENCE_REGION
  const ink = await inkExtent(page, ref.bytes, 'image/jpeg', {
    from: region.rule + 2, to: region.border - 2, top: region.top, bottom: region.bottom, surfaceRow: region.top - 6,
  })
  expect(ink.width).toBe(1550)
  expect(ink.first).not.toBeNull()
  return {
    file: ref.file, sha256: ref.sha256, region,
    leftGap: (ink.first! - region.rule) / region.scale,
    rightGap: (region.border - ink.last!) / region.scale,
    inkWidth: (ink.last! - ink.first! + 1) / region.scale,
    ink,
  }
}

/** Sub-pixel rounding and anti-aliasing only; the defect measured several CSS px. */
const TOLERANCE = 0.75
/**
 * "Fully visible and comfortably contained", applied to one captured field:
 * one unbroken line inside the cap's padding, nothing scrolled out, the
 * drawn ink as wide as the whole word, and as clear of the frame's right
 * border as of the cap's rule (the package pads both sides alike).
 */
async function assertUnitFits(page: Page, input: Locator, testInfo: TestInfo, id: string) {
  await page.evaluate(() => document.fonts.ready)
  await input.scrollIntoViewIfNeeded()
  const geometry = await unitGeometry(input)
  // The field's bleed wrapper: the drawn frame and its emission.
  const clip = await input.evaluate((element) => {
    // Snapped outward to whole CSS px, so capture pixels map exactly onto layout.
    const rect = element.closest('.clr-bleed')!.getBoundingClientRect()
    const x = Math.floor(rect.left)
    const y = Math.floor(rect.top)
    return { x, y, width: Math.ceil(rect.right) - x, height: Math.ceil(rect.bottom) - y }
  })
  const shot = await page.screenshot({ clip, animations: 'disabled', caret: 'hide' })
  const scale = testInfo.project.use.deviceScaleFactor ?? 1
  const local = (x: number) => Math.round((x - clip.x) * scale)
  const ink = await inkExtent(page, shot, 'image/png', {
    from: local(geometry.unit.left + geometry.ruleWidth) + 1,
    to: local(geometry.field.right - geometry.frameWidth) - 2,
    top: Math.round((geometry.textBox.top - clip.y) * scale),
    bottom: Math.round((geometry.textBox.bottom - clip.y) * scale),
    surfaceRow: Math.round((geometry.unit.top - clip.y) * scale) + Math.round(3 * scale),
  })
  expect(ink.first, JSON.stringify(ink)).not.toBeNull()
  expect(Math.abs(ink.width - clip.width * scale), 'the capture is at the device scale').toBeLessThanOrEqual(1)
  const pixels = {
    scale,
    leftGap: (ink.first! / scale + clip.x) - (geometry.unit.left + geometry.ruleWidth),
    rightGap: (geometry.field.right - geometry.frameWidth) - (ink.last! / scale + clip.x),
    inkWidth: (ink.last! - ink.first! + 1) / scale,
    ink,
  }
  const file = `${id}.png`
  writeFileSync(testInfo.outputPath(file), shot)
  await testInfo.attach(file, { path: testInfo.outputPath(file), contentType: 'image/png' })

  const detail = JSON.stringify({ geometry, pixels })
  // Laid out whole: one line, inside the cap's own padding, nothing scrolled.
  expect(geometry.lines, detail).toBe(1)
  expect(geometry.scrollWidth, detail).toBeLessThanOrEqual(geometry.clientWidth)
  expect(geometry.textBox.left, detail).toBeGreaterThanOrEqual(geometry.unit.left + geometry.padding.left - TOLERANCE)
  expect(geometry.textBox.right, detail).toBeLessThanOrEqual(geometry.unit.right - geometry.padding.right + TOLERANCE)
  expect(geometry.unit.right, detail).toBeLessThanOrEqual(geometry.field.right + TOLERANCE)
  // The cap keeps the package's padding: more room, not a narrower cap.
  expect(geometry.padding.left, detail).toBe(geometry.padding.right)
  expect(geometry.unit.width, detail).toBeGreaterThanOrEqual(geometry.textBox.width + geometry.padding.left + geometry.padding.right + geometry.ruleWidth - TOLERANCE)
  // The control still has room for a value.
  expect(geometry.input.width, detail).toBeGreaterThanOrEqual(48)
  // Drawn whole and comfortably clear of the frame, as the rule side is.
  expect(Math.abs(pixels.inkWidth - geometry.textBox.width), detail).toBeLessThanOrEqual(3)
  expect(pixels.rightGap, detail).toBeGreaterThanOrEqual(geometry.padding.right - 3)
  expect(pixels.rightGap / pixels.leftGap, detail).toBeGreaterThanOrEqual(0.6)
  return { geometry, pixels, capture: { file, sha256: createHash('sha256').update(shot).digest('hex') } }
}

async function record(page: Page, testInfo: TestInfo, id: string, entry: Record<string, unknown>) {
  const body = JSON.stringify({
    id, ...entry,
    source: sourceIdentity(),
    target: new URL(page.url()).origin,
    route: new URL(page.url()).pathname,
    skin: await page.locator('html').getAttribute('data-skin'),
    syntheticPublicConfig: SYNTHETIC_ORIGIN_NEEDED,
    browser: `${testInfo.project.name} (Chromium emulation, deviceScaleFactor ${testInfo.project.use.deviceScaleFactor ?? 1})`,
  }, null, 2)
  writeFileSync(testInfo.outputPath(`${id}.json`), body)
  await testInfo.attach(`${id}.json`, { body, contentType: 'application/json' })
}

const originOf = (baseURL: string | undefined) => new URL(baseURL!).origin

test('B05-02.9 reference region shows the clipped MINUTES cap this proof compares against', async ({ page }, testInfo) => {
  await page.setContent('<!doctype html><title>reference</title>')
  const measured = await referenceFit(page)
  // The defect as the owner marked it: the word runs into the frame's border
  // with no gutter, while the rule side keeps the package's padding, and the
  // drawn word is visibly shorter than MINUTES set whole (65.6px, below).
  expect(measured.rightGap, JSON.stringify(measured)).toBeLessThan(3)
  expect(measured.leftGap, JSON.stringify(measured)).toBeGreaterThan(9)
  expect(measured.inkWidth, JSON.stringify(measured)).toBeLessThan(60)
  await testInfo.attach('reference-02.9.json', { body: JSON.stringify(measured, null, 2), contentType: 'application/json' })
})

for (const { name: size, viewport } of VIEWPORTS) {
  test.describe(`B05 unit fields @ ${size}`, () => {
    test.use({ viewport })

    test('Generate Time available: MINUTES is whole and comfortably contained in every skin', async ({ page, visit, baseURL }, testInfo) => {
      const app = await syntheticApp(page, originOf(baseURL))
      await visit('/generate')
      const input = page.getByLabel('Time available')
      await expect(input).toHaveValue('45')
      const ref = await referenceFit(page)
      for (const skin of SKINS) {
        await page.evaluate((value) => {
          localStorage.setItem('clear.skin', value)
          document.documentElement.setAttribute('data-skin', value)
        }, skin)
        await expect(page.locator('html')).toHaveAttribute('data-skin', skin)
        const id = `generate-minutes-${size}-${skin}`
        const fit = await assertUnitFits(page, input, testInfo, id)
        expect(fit.geometry.text).toBe('minutes')
        expect(fit.geometry.rendered).toBe('MINUTES')
        // Against the reference region: the gutter the reference lacks is there,
        // and the word is drawn wider than the clipped one.
        expect(fit.pixels.rightGap).toBeGreaterThan(ref.rightGap + 6)
        if (size === 'phone-390' && skin === 'clear') expect(fit.pixels.inkWidth).toBeGreaterThan(ref.inkWidth + 6)
        await record(page, testInfo, id, {
          consumer: 'Generate · Time available (public Input unit="minutes")',
          state: 'populated form, default 45 minutes', viewport,
          reference: { file: ref.file, sha256: ref.sha256, region: ref.region.id, description: ref.region.description,
            measured: { leftGap: ref.leftGap, rightGap: ref.rightGap, inkWidth: ref.inkWidth } },
          capture: fit.capture, geometry: fit.geometry, pixels: fit.pixels,
          criteria: { 'AC-020': 'pass', 'TASK-AC-161AA0A8FBA4': 'pass' },
        })
      }
      app.assertReadOnly()
    })

    test('Gallery unit-field variants and the public Input specimen fit through the same contract', async ({ page, visit, baseURL }, testInfo) => {
      const app = await syntheticApp(page, originOf(baseURL))
      // The real gallery supports component inspection; visit scans the whole
      // rendered page through the unchanged CORE-05 accessibility fixture.
      await visit('/dev/gallery/app?component=Input')
      const entry = page.locator('.clr-dev-gallery__group').filter({
        has: page.getByRole('heading', { name: 'Input', exact: true }),
      })
      await expect(entry).toHaveCount(1)
      const ref = await referenceFit(page)
      const variants = [
        { state: 'unit="kg" invalid, public specimen basis', label: 'Load', unit: 'kg', glyph: true },
        { state: 'unit="minutes"', label: 'Time available', unit: 'minutes', glyph: false },
        { state: 'unit="minutes" invalid', label: 'Time available', unit: 'minutes', glyph: true },
        { state: 'unit="minutes" at the specimen basis', label: 'Time available', unit: 'minutes', glyph: false },
        { state: 'unit="reps" disabled', label: 'Reps', unit: 'reps', glyph: false },
      ]
      for (const variant of variants) {
        const specimen = entry.locator('.clr-dev-gallery__specimen').filter({
          has: page.getByRole('heading', { name: variant.state, exact: true }),
        })
        const input = specimen.getByLabel(variant.label)
        await expect(input).toBeVisible()
        const id = `gallery-${variant.state.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()}-${size}`
        const fit = await assertUnitFits(page, input, testInfo, id)
        expect(fit.geometry.text).toBe(variant.unit)
        expect(fit.geometry.glyph).toBe(variant.glyph)
        await record(page, testInfo, id, {
          consumer: `Gallery · Input ${variant.state}`,
          state: variant.state, viewport,
          reference: { file: ref.file, sha256: ref.sha256, region: ref.region.id, description: ref.region.description,
            measured: { leftGap: ref.leftGap, rightGap: ref.rightGap, inkWidth: ref.inkWidth } },
          capture: fit.capture, geometry: fit.geometry, pixels: fit.pixels,
          criteria: { 'AC-020': 'pass', 'TASK-AC-161AA0A8FBA4': 'pass' },
        })
      }
      app.assertReadOnly()
    })

    test('Logging keeps its separate Unit Select: its value, choices and behaviour', async ({ page, visit, baseURL }, testInfo) => {
      const app = await syntheticApp(page, originOf(baseURL), { activeWorkout: true })
      await visit('/workout')
      const content = page.locator('main#main > .clr-scroll-region > .clr-scroll-region__scroller')
      await content.getByRole('button', { name: /^(log set|rest)/i }).first().click()
      const sheet = page.locator('.clr-set-sheet')
      await expect(sheet).toBeVisible()
      const unit = sheet.getByRole('combobox', { name: 'Unit' })
      await expect(unit).toBeVisible()
      const shape = await unit.evaluate((select: HTMLSelectElement) => ({
        tag: select.tagName,
        value: select.value,
        options: [...select.options].map((option) => ({ value: option.value, disabled: option.disabled })),
        framed: select.closest('.clr-field') !== null,
        endCaps: select.closest('.clr-set-sheet')!.querySelectorAll('.clr-field__unit').length,
      }))
      // A native select in the public field frame (EXC-04), not an Input end cap.
      expect(shape.tag).toBe('SELECT')
      expect(shape.framed).toBe(true)
      expect(shape.endCaps).toBe(0)
      const choices = shape.options.filter((option) => !option.disabled).map((option) => option.value)
      expect(choices).toEqual(expect.arrayContaining(['kg', 'lb']))
      // Its behaviour: choosing a unit selects it, and the other choice still can.
      const next = choices.find((value) => value !== shape.value)!
      await unit.selectOption(next)
      await expect(unit).toHaveValue(next)
      const back = choices.find((value) => value !== next)!
      await unit.selectOption(back)
      await expect(unit).toHaveValue(back)
      await unit.selectOption(next)
      await expect(unit).toHaveValue(next)
      // The sheet's two measurement numbers are unchanged beside it.
      await expect(sheet.getByRole('spinbutton')).toHaveCount(2)
      const shot = await sheet.locator('.clr-set-sheet__measures').first().screenshot({ animations: 'disabled', caret: 'hide' })
      const file = `logging-unit-select-${size}.png`
      writeFileSync(testInfo.outputPath(file), shot)
      await testInfo.attach(file, { path: testInfo.outputPath(file), contentType: 'image/png' })
      await record(page, testInfo, `logging-unit-select-${size}`, {
        consumer: 'Workout logging sheet · Unit Select (src/ui/set-logger.tsx, EXC-04)',
        state: 'active workout, sheet open, unit changed without logging', viewport,
        initial: shape, selected: next,
        capture: { file, sha256: createHash('sha256').update(shot).digest('hex') },
        criteria: { 'AC-020': 'pass' },
      })
      app.assertReadOnly()
    })
  })
}
