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
const PHONE: Viewport = { width: 390, height: 844 }
const NARROW: Viewport = { width: 320, height: 568 }
const SHORT: Viewport = { width: 390, height: 480 }

// ─────────────────────────────────────────────────────────────────────────────
// The reference and its regions
// ─────────────────────────────────────────────────────────────────────────────

const REFERENCE_FILE = 'sources/source-10-B05-07-logging-sheet.jpg'
const REFERENCE_SHA256 = 'b7fa59ba908bd27bf86baa29075a1c8e8d308ecb9d72e20618dd1c9025c19f4e'
const REFERENCE_DIRS = [
  process.env.B05_EVIDENCE_DIR,
  resolve(import.meta.dirname, '..', '..', '.evidence', basename(resolve(import.meta.dirname, '..'))),
].filter((dir): dir is string => dir !== undefined && dir !== '')
function readReference() {
  const dir = REFERENCE_DIRS.find((candidate) => existsSync(resolve(candidate, REFERENCE_FILE)))
  if (dir === undefined) throw new Error(`B05-07 reference ${REFERENCE_FILE} is not readable from ${REFERENCE_DIRS.join(', ')}`)
  const bytes = readFileSync(resolve(dir, REFERENCE_FILE))
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  if (sha256 !== REFERENCE_SHA256) throw new Error(`B05-07 reference changed: ${sha256}`)
  return { file: REFERENCE_FILE, sha256, bytes }
}

/**
 * B05-07 in the reference's own pixels (2974×1968). Each phone is ~912px wide
 * for a 390pt screen. The left phone is the card before the sheet opens; the
 * right phone is the opened sheet the owner marked 07.3 and 07.4. No region
 * crosses a red owner marker.
 */
const SCALE = 912 / 390
const REF = {
  /** 07.3 — a row across the left phone's movement card: outer edge, then its accent bar's inner line. */
  cardRow: { id: '07.3-card', description: 'Left phone movement card left edge, row through PRIMARY LIFT/STANDARD', y: 743, x0: 0, x1: 910 },
  /** 07.3/07.4 — a row across the right phone's sheet between its fields and EFFORT (marker 3: "No accent bar"). */
  sheetRow: { id: '07.3-sheet', description: 'Right phone sheet frame row between the field frames and EFFORT', y: 1279, x0: 1417, x1: 2330 },
  /** 07.4 — the same phone's Previous/Next row: the navigation's own gutters. */
  navRow: { id: '07.4-nav', description: 'Right phone Previous/Next row', y: 1695, x0: 1417, x1: 2330 },
  /** 07.4 — a blank part of the sheet surface between title and chevron (marker 4: "doesn't need the lines"). */
  sheetBlank: { id: '07.4-surface', description: 'Right phone sheet surface right of LOG SET 1, left of the chevron', x0: 1695, x1: 2156, y0: 964, y1: 1059 },
  /** 07.4 — a column down the right phone from the sheet's lower edge through the navigation. */
  overlapColumn: { id: '07.4-overlap', description: 'Right phone column from the sheet foot through Previous', x: 1636, y0: 1450, y1: 1760 },
  /** 07.4 — the header behind the open sheet (right) and with none open (left). */
  headerOpen: { id: '07.4-backdrop', description: 'Right phone header band behind the open sheet', x0: 1447, x1: 2012, y0: 112, y1: 208 },
  headerClosed: { id: '07.4-backdrop-before', description: 'Left phone header band, no sheet', x0: 30, x1: 595, y0: 112, y1: 208 },
} as const

type Rect = { x0: number; x1: number; y0: number; y1: number }
type Row = { y: number; x0: number; x1: number }
type Column = { x: number; y0: number; y1: number }
type Stats = { lum: number; stripe: number; grain: number }
type Runs = { start: number; end: number }[]

/**
 * Pixels decoded by the browser's own canvas. A frame line is saturated colour
 * — the purple structure border, a teal action border — so text (white) and
 * the dark surfaces never read as one. `stripe` is the mean step between
 * adjacent rows' mean luminance: scanlines alternate row by row and make it
 * large; a plain surface leaves it near zero. `grain` is the same step along a
 * row: static noise raises it, blur lowers it.
 */
async function measure(page: Page, image: Buffer, type: string, request: {
  stats?: Rect[]; rows?: Row[]; columns?: Column[]
}): Promise<{ stats: Stats[]; rows: Runs[]; columns: Runs[] }> {
  return page.evaluate(async ({ data, type, request }) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:${type};base64,${data}`)).blob())
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const context = canvas.getContext('2d', { willReadFrequently: true })!
    context.drawImage(bitmap, 0, 0)
    const lum = (p: Uint8ClampedArray, i: number) => 0.2126 * p[i] + 0.7152 * p[i + 1] + 0.0722 * p[i + 2]
    const line = (p: Uint8ClampedArray, i: number) => {
      const max = Math.max(p[i], p[i + 1], p[i + 2])
      return max > 130 && max - Math.min(p[i], p[i + 1], p[i + 2]) > 60
    }
    const runsOf = (flags: boolean[], origin: number) => {
      const runs: { start: number; end: number }[] = []
      flags.forEach((on, index) => {
        if (!on) return
        const last = runs.at(-1)
        if (last !== undefined && origin + index - last.end <= 1) last.end = origin + index
        else runs.push({ start: origin + index, end: origin + index })
      })
      return runs
    }
    const stats = (request.stats ?? []).map((r) => {
      const w = Math.round(r.x1 - r.x0)
      const h = Math.round(r.y1 - r.y0)
      const p = context.getImageData(Math.round(r.x0), Math.round(r.y0), w, h).data
      const rowMeans: number[] = []
      let total = 0
      let grain = 0
      for (let y = 0; y < h; y += 1) {
        let sum = 0
        for (let x = 0; x < w; x += 1) {
          const value = lum(p, (y * w + x) * 4)
          sum += value
          if (x > 0) grain += Math.abs(value - lum(p, (y * w + x - 1) * 4))
        }
        rowMeans.push(sum / w)
        total += sum
      }
      let stripe = 0
      for (let y = 1; y < h; y += 1) stripe += Math.abs(rowMeans[y] - rowMeans[y - 1])
      return { lum: total / (w * h), stripe: stripe / Math.max(1, h - 1), grain: grain / Math.max(1, h * (w - 1)) }
    })
    const rows = (request.rows ?? []).map((r) => {
      const w = Math.round(r.x1 - r.x0)
      const p = context.getImageData(Math.round(r.x0), Math.round(r.y), w, 1).data
      return runsOf(Array.from({ length: w }, (_, x) => line(p, x * 4)), Math.round(r.x0))
    })
    const columns = (request.columns ?? []).map((c) => {
      const h = Math.round(c.y1 - c.y0)
      const p = context.getImageData(Math.round(c.x), Math.round(c.y0), 1, h).data
      return runsOf(Array.from({ length: h }, (_, y) => line(p, y * 4)), Math.round(c.y0))
    })
    return { stats, rows, columns }
  }, { data: image.toString('base64'), type, request })
}

/** The reference's own measures, in CSS points of its 390pt phone. */
async function referenceMeasures(page: Page) {
  const ref = readReference()
  const m = await measure(page, ref.bytes, 'image/jpeg', {
    stats: [REF.sheetBlank, REF.headerOpen, REF.headerClosed],
    rows: [REF.cardRow, REF.sheetRow, REF.navRow],
    columns: [REF.overlapColumn],
  })
  const [card, sheet, nav] = m.rows
  const pt = (px: number) => px / SCALE
  // The card's outer edge, then its bar's inner line; the sheet's left edge only.
  const cardBar = card.length >= 2 ? pt(card[1].start - card[0].start) : null
  const sheetLeftLines = sheet.filter((run) => run.start - sheet[0].start < 30 * SCALE).length
  const [sheetSurface, headerOpen, headerClosed] = m.stats
  const column = m.columns[0]
  return {
    file: ref.file, sha256: ref.sha256, regions: REF,
    cardBarWidth: cardBar,
    sheetLeftLines,
    /** Sheet edges against the navigation's edges (reference points): equal gutters. */
    sheetGutterLeft: pt(sheet[0].start - nav[0].start),
    sheetGutterRight: pt(nav.at(-1)!.end - sheet.at(-1)!.end),
    sheetStripe: sheetSurface.stripe,
    headerDim: headerOpen.lum / headerClosed.lum,
    /** The sheet's lower edge, then lines below it (progress, Previous): the sheet ends above the navigation. */
    overlapLines: column.map((run) => pt(run.start - REF.overlapColumn.y0)),
  }
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
  throw new Error(`Synthetic sheet-surface origin ${origin} did not start`)
}

const content = (page: Page) => page.locator('main#main > .clr-scroll-region > .clr-scroll-region__scroller')

/** As the other B05 specs: serve a bundle with non-secret placeholders when no public URL is configured. */
const test = scanned.extend<object, { syntheticOrigin: string | null }>({
  syntheticOrigin: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use, workerInfo) => {
      if (!SYNTHETIC_ORIGIN_NEEDED) return use(null)
      const port = 5640 + workerInfo.parallelIndex
      const origin = `http://localhost:${port}`
      const server = spawn(process.execPath, [
        resolve(import.meta.dirname, '../node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort',
      ], {
        env: {
          ...process.env,
          VITE_SUPABASE_URL: 'https://synthetic-b05-sheet-surface.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-b05-sheet-surface-public-placeholder',
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
      await expect(page.getByRole('heading', { level: 1, name: 'Workout', exact: true })).toBeVisible()
      await expect(content(page).getByRole('button', { name: 'Rest', exact: true }).first()).toBeVisible()
      await checkA11y()
    })
  },
})

// ─────────────────────────────────────────────────────────────────────────────
// The proof
// ─────────────────────────────────────────────────────────────────────────────

test('B05-07.3/07.4 reference regions: no bar on the sheet, striped surface, sheet above navigation, undimmed screen', async ({ page }, testInfo) => {
  await page.setContent('<!doctype html><title>reference</title>')
  const ref = await referenceMeasures(page)
  const body = JSON.stringify(ref, null, 2)
  expect(ref.cardBarWidth, body).not.toBeNull()
  expect(ref.cardBarWidth!, body).toBeGreaterThan(8)
  expect(ref.cardBarWidth!, body).toBeLessThan(16)
  expect(ref.sheetLeftLines, body).toBe(1)
  expect(Math.abs(ref.sheetGutterLeft), body).toBeLessThanOrEqual(3)
  expect(Math.abs(ref.sheetGutterRight), body).toBeLessThanOrEqual(3)
  expect(ref.sheetStripe, body).toBeGreaterThan(0.5)
  expect(ref.headerDim, body).toBeGreaterThan(0.9)
  expect(ref.overlapLines.length, body).toBeGreaterThanOrEqual(2)
  await testInfo.attach('reference-07-3-07-4.json', { body, contentType: 'application/json' })
})

for (const { name: size, viewport } of [
  { name: 'phone-390x844', viewport: PHONE },
  { name: 'narrow-320x568', viewport: NARROW },
  { name: 'short-390x480', viewport: SHORT },
]) {
  test.describe(`B05 sheet surface @ ${size}`, () => {
    test.use({ viewport })

    // TASK-115 retired the case 'new entry, correction and the combined superset round share the guttered, barred, opaque sheet over a clean backdrop; collapse restores navigation' (old line 762): superseded by Round 7
    // (D2, Eric, chat, 2026-11-24: "Retire, list for UAT (Recommended)"); evidence/refinement/task-115/test-ledger.json and UAT-LIST.md name it.
  })
}

test.describe('B05 sheet surface @ keyboard resize and semantics', () => {
  test.use({ viewport: PHONE })

  // TASK-115 retired the case 'a keyboard-like resize keeps the guttered sheet scrolling through its public region; focus, Escape and outside taps keep their semantics' (old line 931): superseded by Round 7
  // (D2, Eric, chat, 2026-11-24: "Retire, list for UAT (Recommended)"); evidence/refinement/task-115/test-ledger.json and UAT-LIST.md name it.

  // TASK-115 retired the case `${mode} retains its draft and explicit save through a focused keyboard-like resize` (old line 1013): superseded by Round 7
  // (D2, Eric, chat, 2026-11-24: "Retire, list for UAT (Recommended)"); evidence/refinement/task-115/test-ledger.json and UAT-LIST.md name it.
})
