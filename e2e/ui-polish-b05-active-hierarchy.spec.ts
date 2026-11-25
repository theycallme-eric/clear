import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, } from 'node:fs'
import { basename, resolve } from 'node:path'
import type { Page, } from '@playwright/test'

import { readE2eEnv } from '../scripts/e2e/env.mjs'
import { } from '../src/state/set-observation-mutation'
import { } from '../src/test/user-data-double'
import { expect, test as scanned } from './fixtures'


type Viewport = { width: number; height: number }
const VIEWPORTS: ReadonlyArray<{ name: string; viewport: Viewport }> = [
  { name: 'phone-390', viewport: { width: 390, height: 844 } },
  { name: 'narrow-320', viewport: { width: 320, height: 568 } },
  { name: 'short-390x480', viewport: { width: 390, height: 480 } },
]

// Long names are this spec's own, never the reference's demo movements.
const LUNGE = 'single-arm-kettlebell-overhead-reverse-lunge'
const name = (id: string) => id.replaceAll('-', ' ')

// ─────────────────────────────────────────────────────────────────────────────
// The reference and its regions
// ─────────────────────────────────────────────────────────────────────────────

const REFERENCE_FILE = 'sources/source-07-B05-04-review-grouping.jpg'
const REFERENCE_SHA256 = 'c1ddd3384b41d6b3a5d053633df2d779c1a2c3272e183d68ec933bfb1cb948ac'
const REFERENCE_DIRS = [
  process.env.B05_EVIDENCE_DIR,
  resolve(import.meta.dirname, '..', '..', '.evidence', basename(resolve(import.meta.dirname, '..'))),
].filter((dir): dir is string => dir !== undefined && dir !== '')

function readReference(file: string, sha256: string) {
  const dir = REFERENCE_DIRS.find((candidate) => existsSync(resolve(candidate, file)))
  if (dir === undefined) throw new Error(`B05 reference ${file} is not readable from ${REFERENCE_DIRS.join(', ')}`)
  const bytes = readFileSync(resolve(dir, file))
  const actual = createHash('sha256').update(bytes).digest('hex')
  if (actual !== sha256) throw new Error(`B05 reference ${file} changed: ${actual}`)
  return bytes
}

/**
 * B05-04's selected (right) pane, in the reference's own 2168 × 846 pixels:
 * each movement's three tiers from just above its name to just below its
 * equipment, stopping short of the Swap column on the right and the purple
 * rules between movements. Swap is Review's; an active card has none.
 */
type Region = { x: number; y: number; width: number; height: number }
const REFERENCE_REGIONS: ReadonlyArray<Region & { id: string; description: string }> = [
  { id: '04-selected-1', x: 1462, y: 190, width: 533, height: 148,
    description: 'Selected pane, first movement: MOUNTAIN CLIMBERS / 12 reps / Bodyweight (Swap column excluded)' },
  { id: '04-selected-2', x: 1462, y: 382, width: 533, height: 148,
    description: 'Selected pane, second movement: SQUAT JUMPS / 10 reps / Bodyweight (Swap column excluded)' },
  { id: '04-selected-3', x: 1462, y: 574, width: 533, height: 148,
    description: 'Selected pane, third movement: BEAR CRAWL / 20 sec / Bodyweight (Swap column excluded)' },
]

/**
 * A movement's text, read from pixels: rows of ink banded into lines, each
 * weighed by its mean stroke run times its dense glyph height (both grow with
 * face size and boldness, neither with line length), plus its mean ink
 * brightness. Ink is any pixel well above the region's own background that is
 * not the purple structure stroke. `exclude` blanks one rectangle — the active
 * counter, which stands where Review's Swap stands and is not a tier.
 */
async function analyse(page: Page, image: Buffer, mime: string, region: Region | null, exclude: Region | null) {
  return page.evaluate(async ({ data, mime, region, exclude }) => {
    const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0))
    const bitmap = await createImageBitmap(new Blob([bytes], { type: mime }))
    const r = region ?? { x: 0, y: 0, width: bitmap.width, height: bitmap.height }
    const canvas = new OffscreenCanvas(r.width, r.height)
    const context = canvas.getContext('2d', { willReadFrequently: true })!
    context.drawImage(bitmap, r.x, r.y, r.width, r.height, 0, 0, r.width, r.height)
    const pixels = context.getImageData(0, 0, r.width, r.height).data
    const { width, height } = r
    const lum = (i: number) => 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2]
    const all: number[] = []
    for (let i = 0; i < pixels.length; i += 16) all.push(lum(i))
    all.sort((a, b) => a - b)
    const background = all[Math.floor(all.length / 2)]
    const excluded = (x: number, y: number) => exclude !== null &&
      x >= exclude.x && x < exclude.x + exclude.width && y >= exclude.y && y < exclude.y + exclude.height
    const rowInk: number[] = []
    const rowBright: number[] = []
    const strokes: { length: number; runs: number }[] = []
    for (let y = 0; y < height; y += 1) {
      let ink = 0
      let bright = 0
      let run = 0
      const stroke = { length: 0, runs: 0 }
      for (let x = 0; x <= width; x += 1) {
        const i = (y * width + x) * 4
        let on = false
        if (x < width && !excluded(x, y)) {
          const [red, green, blue] = [pixels[i], pixels[i + 1], pixels[i + 2]]
          const purple = blue > green + 40 && red > green
          const l = lum(i)
          on = l > background + 60 && !purple
          if (on) bright += l
        }
        if (on) { ink += 1; run += 1 } else if (run > 0) {
          stroke.length += run
          stroke.runs += 1
          run = 0
        }
      }
      rowInk.push(ink)
      rowBright.push(bright)
      strokes.push(stroke)
    }
    const gap = Math.max(2, Math.round(height * 0.012))
    const bands: { top: number; bottom: number }[] = []
    rowInk.forEach((value, y) => {
      if (value <= 2) return
      const last = bands.at(-1)
      if (last && y - last.bottom <= gap) last.bottom = y
      else bands.push({ top: y, bottom: y })
    })
    // A frame's stroke is a rule, not a line of text: its runs span much of the width.
    const isRule = (band: { top: number; bottom: number }) => {
      for (let y = band.top; y <= band.bottom; y += 1) {
        if (strokes[y].runs > 0 && strokes[y].length / strokes[y].runs > width * 0.3) return true
      }
      return false
    }
    const lines = bands.filter((band) => band.bottom - band.top >= gap * 2 && !isRule(band)).map((band) => {
      let length = 0
      let runs = 0
      let peak = 0
      let ink = 0
      let bright = 0
      for (let y = band.top; y <= band.bottom; y += 1) {
        length += strokes[y].length
        runs += strokes[y].runs
        peak = Math.max(peak, rowInk[y])
        ink += rowInk[y]
        bright += rowBright[y]
      }
      let dense = 0
      for (let y = band.top; y <= band.bottom; y += 1) if (rowInk[y] >= peak / 3) dense += 1
      const stroke = length / Math.max(1, runs)
      return {
        top: band.top / height, bottom: band.bottom / height, dense,
        stroke: Math.round(stroke * 100) / 100,
        weight: Math.round(stroke * dense * 100) / 100,
        brightness: Math.round(bright / Math.max(1, ink)),
      }
    })
    return { size: { width, height }, background: Math.round(background), lines }
  }, { data: image.toString('base64'), mime, region, exclude })
}

type Reading = Awaited<ReturnType<typeof analyse>>

/**
 * The B05-04 relationships, normalised by the name line so a reference read
 * at its JPEG scale and a capture read at the device scale are comparable:
 * the name leads (wrapped lines continue at its weight), then exactly two
 * lighter tiers, the prescription above and heavier than the equipment.
 */
function hierarchy(reading: Reading) {
  const [first] = reading.lines
  if (first === undefined) return { nameLines: 0, tiers: 0, nameDominant: false, prescriptionOverEquipment: false, prescriptionRatio: 0, equipmentRatio: 0 }
  const heavy = (line: { weight: number }) => line.weight >= first.weight * 0.8
  const continuation = reading.lines.findIndex((line, index) => index > 0 && !heavy(line))
  const nameLines = continuation === -1 ? reading.lines.length : continuation
  const below = continuation === -1 ? [] : reading.lines.slice(continuation)
  const [prescription, equipment] = below
  return {
    nameLines,
    tiers: below.length,
    nameDominant: below.length > 0 && below.every((line) => !heavy(line)),
    prescriptionOverEquipment: prescription !== undefined && equipment !== undefined &&
      prescription.bottom <= equipment.top && prescription.weight > equipment.weight,
    prescriptionRatio: prescription === undefined ? 0 : Math.round(prescription.weight / first.weight * 1000) / 1000,
    equipmentRatio: equipment === undefined ? 0 : Math.round(equipment.weight / first.weight * 1000) / 1000,
  }
}

type Hierarchy = ReturnType<typeof hierarchy>

async function referenceHierarchy(page: Page) {
  const bytes = readReference(REFERENCE_FILE, REFERENCE_SHA256)
  const readings: { region: (typeof REFERENCE_REGIONS)[number]; reading: Reading; hierarchy: Hierarchy }[] = []
  for (const region of REFERENCE_REGIONS) {
    const reading = await analyse(page, bytes, 'image/jpeg', region, null)
    readings.push({ region, reading, hierarchy: hierarchy(reading) })
  }
  // The pictured movements step down alike; their mean is the reference.
  const mean = (pick: (h: Hierarchy) => number) =>
    Math.round(readings.reduce((sum, { hierarchy }) => sum + pick(hierarchy), 0) / readings.length * 1000) / 1000
  const measured: Hierarchy = {
    nameLines: 1,
    tiers: 2,
    nameDominant: readings.every(({ hierarchy }) => hierarchy.nameDominant),
    prescriptionOverEquipment: readings.every(({ hierarchy }) => hierarchy.prescriptionOverEquipment),
    prescriptionRatio: mean((h) => h.prescriptionRatio),
    equipmentRatio: mean((h) => h.equipmentRatio),
  }
  return { file: REFERENCE_FILE, sha256: REFERENCE_SHA256, readings, measured }
}

// ─────────────────────────────────────────────────────────────────────────────
// The synthetic app
// ─────────────────────────────────────────────────────────────────────────────

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
  throw new Error(`Synthetic active-hierarchy origin ${origin} did not start`)
}

/** As the other B05 specs: serve a bundle with non-secret placeholders when no public URL is configured. */
const test = scanned.extend<object, { syntheticOrigin: string | null }>({
  syntheticOrigin: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use, workerInfo) => {
      if (!SYNTHETIC_ORIGIN_NEEDED) return use(null)
      const port = 5680 + workerInfo.parallelIndex
      const origin = `http://localhost:${port}`
      const server = spawn(process.execPath, [
        resolve(import.meta.dirname, '../node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort',
      ], {
        env: {
          ...process.env,
          VITE_SUPABASE_URL: 'https://synthetic-b05-active-hierarchy.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-b05-active-hierarchy-public-placeholder',
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
      // Scan only after the actual route and its populated movement surface are ready.
      await expect(page.getByRole('heading', { level: 1, name: 'Workout', exact: true })).toBeVisible()
      await expect(content(page).getByRole('heading', { name: name(LUNGE), exact: true })).toBeVisible()
      await checkA11y()
    })
  },
})

const content = (page: Page) => page.locator('main#main > .clr-scroll-region > .clr-scroll-region__scroller')

// ─────────────────────────────────────────────────────────────────────────────
// The proof
// ─────────────────────────────────────────────────────────────────────────────

test('B05-04 selected reference regions read as name, then prescription, then lighter equipment', async ({ page }, testInfo) => {
  await page.setContent('<!doctype html><title>reference</title>')
  const ref = await referenceHierarchy(page)
  const detail = JSON.stringify(ref)
  for (const { hierarchy: h } of ref.readings) {
    expect(h.nameLines, detail).toBe(1)
    expect(h.tiers, detail).toBe(2)
    expect(h.nameDominant, detail).toBe(true)
    expect(h.prescriptionOverEquipment, detail).toBe(true)
  }
  await testInfo.attach('reference-04-selected.json', { body: JSON.stringify(ref, null, 2), contentType: 'application/json' })
})

for (const { name: size, viewport } of VIEWPORTS) {
  test.describe(`B05 active movement hierarchy @ ${size}`, () => {
    test.use({ viewport })

    // TASK-115 retired the case 'standard logger cards: selected hierarchy with long names; counter, Rest/Log, saved result, refusal, correction and countdown keep their roles' (old line 920): superseded by Round 7
    // (D2, Eric, chat, 2026-11-24: "Retire, list for UAT (Recommended)"); evidence/refinement/task-115/test-ledger.json and UAT-LIST.md name it.

    // TASK-115 retired the case 'superset logger cards: selected hierarchy, independent counters and countdown; one Rest and an explicit combined Log round' (old line 1022): superseded by Round 7
    // (D2, Eric, chat, 2026-11-24: "Retire, list for UAT (Recommended)"); evidence/refinement/task-115/test-ledger.json and UAT-LIST.md name it.

    // TASK-115 retired the case 'circuit rows: selected hierarchy closed and with the shared logger open; countdown, Rest entry and round clock keep their roles' (old line 1086): superseded by Round 7
    // (D2, Eric, chat, 2026-11-24: "Retire, list for UAT (Recommended)"); evidence/refinement/task-115/test-ledger.json and UAT-LIST.md name it.
  })
}
