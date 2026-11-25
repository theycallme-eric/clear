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
]

// ─────────────────────────────────────────────────────────────────────────────
// The reference and its regions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The approved reference, read every run. A missing or unreadable file fails
 * the proof rather than yielding a capture with no reference behind it.
 */
const REFERENCE_FILE = 'sources/source-10-B05-07-logging-sheet.jpg'
const REFERENCE_SHA256 = 'b7fa59ba908bd27bf86baa29075a1c8e8d308ecb9d72e20618dd1c9025c19f4e'
const REFERENCE_DIRS = [
  process.env.B05_EVIDENCE_DIR,
  resolve(import.meta.dirname, '..', '..', '.evidence', basename(resolve(import.meta.dirname, '..'))),
].filter((dir): dir is string => dir !== undefined && dir !== '')
function reference() {
  const dir = REFERENCE_DIRS.find((candidate) => existsSync(resolve(candidate, REFERENCE_FILE)))
  if (dir === undefined) throw new Error(`B05-07 reference ${REFERENCE_FILE} is not readable from ${REFERENCE_DIRS.join(', ')}`)
  const bytes = readFileSync(resolve(dir, REFERENCE_FILE))
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  if (sha256 !== REFERENCE_SHA256) throw new Error(`B05-07 reference changed: ${sha256}`)
  return { file: REFERENCE_FILE, sha256, bytes }
}

/**
 * B05-07 in the reference's own pixels (2974×1968; each phone ~912px wide for
 * a 390px viewport). Both regions avoid the red owner markers.
 *   · 07.1 — the left phone's card entry button, over its label's rows only.
 *   · 07.2 — the right phone's sheet, between the `LOG SET 1` title and the
 *     WEIGHT label, right of marker 2: where a countdown would be drawn.
 */
const SCALE = 912 / 390
const REGION_071 = {
  id: '07.1', description: 'Movement card entry action labelled LOG SET (marker 1: "Change this to either rest or two buttons")',
  x0: 90, x1: 840, y0: 969, y1: 990,
}
const REGION_072 = {
  id: '07.2', description: 'Opened sheet between title and fields (marker 2: "There\'s no rest timer here")',
  x0: 1670, x1: 2171, y0: 1026, y1: 1136,
}

type Region = { x0: number; x1: number; y0: number; y1: number }
type Ink = { bands: { top: number; bottom: number }[]; left: number | null; right: number | null }

/**
 * The bright ink in a region, as horizontal bands and a horizontal extent.
 * Text and frame lines are bright on the dark sheet; the background, its
 * scanlines and the dim atmosphere are not.
 */
async function ink(page: Page, image: Buffer, type: string, region: Region, mergeGap: number): Promise<Ink> {
  return page.evaluate(async ({ data, type, region, mergeGap }) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:${type};base64,${data}`)).blob())
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const context = canvas.getContext('2d')!
    context.drawImage(bitmap, 0, 0)
    const width = region.x1 - region.x0
    const pixels = context.getImageData(region.x0, region.y0, width, region.y1 - region.y0).data
    const bright = (index: number) =>
      0.2126 * pixels[index] + 0.7152 * pixels[index + 1] + 0.0722 * pixels[index + 2] > 150
    const rows: number[] = []
    let left: number | null = null
    let right: number | null = null
    for (let y = 0; y < region.y1 - region.y0; y += 1) {
      let lit = false
      for (let x = 0; x < width; x += 1) {
        if (!bright((y * width + x) * 4)) continue
        lit = true
        left = left === null ? x : Math.min(left, x)
        right = right === null ? x : Math.max(right, x)
      }
      if (lit) rows.push(y)
    }
    const bands: { top: number; bottom: number }[] = []
    for (const y of rows) {
      const last = bands.at(-1)
      if (last !== undefined && y - last.bottom <= mergeGap) last.bottom = y
      else bands.push({ top: y, bottom: y })
    }
    return { bands, left, right }
  }, { data: image.toString('base64'), type, region, mergeGap })
}

async function referenceInk(page: Page) {
  const ref = reference()
  const card = await ink(page, ref.bytes, 'image/jpeg', REGION_071, Math.round(3 * SCALE))
  const sheet = await ink(page, ref.bytes, 'image/jpeg', REGION_072, Math.round(3 * SCALE))
  return {
    file: ref.file, sha256: ref.sha256,
    card: { region: REGION_071, labelWidth: (card.right! - card.left!) / SCALE },
    sheet: { region: REGION_072, bands: sheet.bands.length },
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
  throw new Error(`Synthetic rest/log origin ${origin} did not start`)
}

/** As the other B05 specs: serve a bundle with non-secret placeholders when no public URL is configured. */
const test = scanned.extend<object, { syntheticOrigin: string | null }>({
  syntheticOrigin: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use, workerInfo) => {
      if (!SYNTHETIC_ORIGIN_NEEDED) return use(null)
      const port = 5620 + workerInfo.parallelIndex
      const origin = `http://localhost:${port}`
      const server = spawn(process.execPath, [
        resolve(import.meta.dirname, '../node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort',
      ], {
        env: {
          ...process.env,
          VITE_SUPABASE_URL: 'https://synthetic-b05-rest-log.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-b05-rest-log-public-placeholder',
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
      // Boot and the Workout loading state both expose headings. Scan only
      // after the actual route and its populated movement surface are ready.
      await expect(page.getByRole('heading', { level: 1, name: 'Workout', exact: true })).toBeVisible()
      await expect(content(page).getByRole('heading', { name: 'back squat', exact: true })).toBeVisible()
      await expect(content(page).getByRole('button', { name: 'Rest', exact: true }).first()).toBeVisible()
      await checkA11y()
    })
  },
})

const content = (page: Page) => page.locator('main#main > .clr-scroll-region > .clr-scroll-region__scroller')

// ─────────────────────────────────────────────────────────────────────────────
// The proof
// ─────────────────────────────────────────────────────────────────────────────

test('B05-07.1/07.2 reference regions show the Log set entry and a sheet with no countdown', async ({ page }, testInfo) => {
  await page.setContent('<!doctype html><title>reference</title>')
  const ref = await referenceInk(page)
  // The defect as the owner marked it: a seven-character LOG SET label, and
  // only the context line between the sheet's title and its fields.
  expect(ref.card.labelWidth, JSON.stringify(ref)).toBeGreaterThan(45)
  expect(ref.sheet.bands, JSON.stringify(ref)).toBe(1)
  await testInfo.attach('reference-07.json', { body: JSON.stringify(ref, null, 2), contentType: 'application/json' })
})

for (const { name: size, viewport } of VIEWPORTS) {
  test.describe(`B05 Rest and Log @ ${size}`, () => {
    test.use({ viewport })

    // TASK-115 retired the case 'Rest opens the sheet with the running prescribed rest; Log saves; collapse, reopen, failure, expiry and Edit keep their contracts' (old line 544): superseded by Round 7
    // (D2, Eric, chat, 2026-11-24: "Retire, list for UAT (Recommended)"); evidence/refinement/task-115/test-ledger.json and UAT-LIST.md name it.

    // TASK-115 retired the case 'a superset Rest starts the round rest and Log round saves one combined round; circuit rounds are unchanged' (old line 783): superseded by Round 7
    // (D2, Eric, chat, 2026-11-24: "Retire, list for UAT (Recommended)"); evidence/refinement/task-115/test-ledger.json and UAT-LIST.md name it.
  })
}
