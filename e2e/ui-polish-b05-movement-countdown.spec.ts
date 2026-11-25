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

// ─────────────────────────────────────────────────────────────────────────────
// The reference and its region
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The approved reference, read every run. A missing or unreadable file fails
 * the proof rather than yielding a capture with no reference behind it.
 */
const REFERENCE_FILE = 'sources/source-09-B05-06-movement-timer.jpg'
const REFERENCE_SHA256 = '489dded0b4d90dd6789e23e352d5ec29cc96aa96a1abd6ee4be14d3f606f8aab'
const REFERENCE_DIRS = [
  process.env.B05_EVIDENCE_DIR,
  resolve(import.meta.dirname, '..', '..', '.evidence', basename(resolve(import.meta.dirname, '..'))),
].filter((dir): dir is string => dir !== undefined && dir !== '')
function reference() {
  const dir = REFERENCE_DIRS.find((candidate) => existsSync(resolve(candidate, REFERENCE_FILE)))
  if (dir === undefined) throw new Error(`B05-06 reference ${REFERENCE_FILE} is not readable from ${REFERENCE_DIRS.join(', ')}`)
  const bytes = readFileSync(resolve(dir, REFERENCE_FILE))
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  if (sha256 !== REFERENCE_SHA256) throw new Error(`B05-06 reference changed: ${sha256}`)
  return { file: REFERENCE_FILE, sha256, bytes }
}

/**
 * B05-06.2/06.3 in the reference's own pixels (2584×1848; the right phone's
 * 390px viewport is ~709px wide). The proposed countdown and its Start/Reset
 * pair, inside marker 3's box from just under its top outline (so the timer's
 * own top stroke is in) to above marker 3's badge. Marker 2's glyph touches
 * only the last ~1.5% of columns, far short of a rule row.
 */
const REF_SCALE = 709 / 390
const REGION_06 = {
  id: '06.2/06.3',
  description: 'Proposed full-width countdown with Start and Reset side by side underneath (marker 3: "timer on top and the two buttons underneath, but inline the card above the log set button")',
  x0: 1189, x1: 1912, y0: 572, y1: 827,
}

type Region = { x0: number; x1: number; y0: number; y1: number }

/**
 * The arrangement in a region, read from its pixels: the framed rows it
 * stacks into (each between a top and a bottom stroke), and for each row its
 * horizontal clusters — runs of inked columns separated by an uninked gutter
 * wider than 4 CSS px. The same measure reads the reference and a capture.
 */
async function arrangement(page: Page, image: Buffer, type: string, region: Region, scale: number) {
  const mergeGap = Math.round(4 * scale)
  const gutter = Math.round(4 * scale)
  const step = Math.max(1, Math.round(scale))
  return page.evaluate(async ({ data, type, region, mergeGap, gutter, step }) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:${type};base64,${data}`)).blob())
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const context = canvas.getContext('2d')!
    context.drawImage(bitmap, 0, 0)
    const width = region.x1 - region.x0
    const height = region.y1 - region.y0
    const pixels = context.getImageData(region.x0, region.y0, width, height).data
    const luminance = (x: number, y: number) => {
      const index = (Math.min(y, height - 1) * width + Math.min(x, width - 1)) * 4
      return 0.2126 * pixels[index] + 0.7152 * pixels[index + 1] + 0.0722 * pixels[index + 2]
    }
    // Ink is a hard edge — a stroke or a glyph — measured across one CSS
    // pixel. The shipped emission halo and the urgency surface fade smoothly
    // and are not ink.
    const lit = (x: number, y: number) => {
      const here = luminance(x, y)
      // 25 keeps the crimson timer-low stroke and drops the faint scanlines.
      return Math.abs(here - luminance(x + step, y)) > 25 || Math.abs(here - luminance(x, y + step)) > 25
    }
    // A frame's top or bottom stroke is a rule: a row lit across most of the
    // width. The urgency cue (a soft vignette since TASK-008), digits and
    // labels never are.
    const ruleRow = (y: number) => {
      let count = 0
      for (let x = 0; x < width; x += 1) if (lit(x, y)) count += 1
      return count >= width * 0.6
    }
    const rules: { top: number; bottom: number }[] = []
    for (let y = 0; y < height; y += 1) {
      if (!ruleRow(y)) continue
      const last = rules.at(-1)
      if (last !== undefined && y - last.bottom <= mergeGap) last.bottom = y
      else rules.push({ top: y, bottom: y })
    }
    // Each framed row is the band from one rule to the next: top stroke to
    // bottom stroke, then the next row's.
    const blocks: { top: number; bottom: number }[] = []
    for (let index = 0; index + 1 < rules.length; index += 2) {
      blocks.push({ top: rules[index].top, bottom: rules[index + 1].bottom })
    }
    return blocks.map((block) => {
      const columns: boolean[] = []
      for (let x = 0; x < width; x += 1) {
        let on = false
        for (let y = block.top; y <= block.bottom && !on; y += 1) on = lit(x, y)
        columns.push(on)
      }
      const clusters: { left: number; right: number }[] = []
      for (let x = 0; x < width; x += 1) {
        if (!columns[x]) continue
        const last = clusters.at(-1)
        if (last !== undefined && x - last.right <= gutter) last.right = x
        else clusters.push({ left: x, right: x })
      }
      return {
        top: block.top / height, bottom: block.bottom / height, height: block.bottom - block.top + 1,
        clusters: clusters.map(({ left, right }) => ({ left: left / width, right: right / width })),
      }
    })
  }, { data: image.toString('base64'), type, region, mergeGap, gutter, step })
}

type Blocks = Awaited<ReturnType<typeof arrangement>>

/**
 * The B05-06 composition as numbers: a framed timer row spanning the width,
 * then — below it — a framed row that splits into two side-by-side halves
 * around the centre.
 */
function composition(major: Blocks) {
  const [timer, pair] = major
  const halves = pair?.clusters.filter((cluster) => cluster.right - cluster.left > 0.1) ?? []
  return {
    blocks: major.length,
    timerSpan: timer === undefined ? 0 : Math.max(...timer.clusters.map((c) => c.right)) - Math.min(...timer.clusters.map((c) => c.left)),
    timerAbovePair: timer !== undefined && pair !== undefined && timer.bottom < pair.top,
    timerToPairHeight: timer === undefined || pair === undefined ? 0 : timer.height / pair.height,
    pairHalves: halves.length,
    leftHalf: halves[0] ?? null,
    rightHalf: halves[1] ?? null,
  }
}

async function referenceComposition(page: Page) {
  const ref = reference()
  const blocks = await arrangement(page, ref.bytes, 'image/jpeg', REGION_06, REF_SCALE)
  return { file: ref.file, sha256: ref.sha256, region: REGION_06, blocks, measured: composition(blocks) }
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
  throw new Error(`Synthetic movement-countdown origin ${origin} did not start`)
}

/** As the other B05 specs: serve a bundle with non-secret placeholders when no public URL is configured. */
const test = scanned.extend<object, { syntheticOrigin: string | null }>({
  syntheticOrigin: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use, workerInfo) => {
      if (!SYNTHETIC_ORIGIN_NEEDED) return use(null)
      const port = 5660 + workerInfo.parallelIndex
      const origin = `http://localhost:${port}`
      const server = spawn(process.execPath, [
        resolve(import.meta.dirname, '../node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort',
      ], {
        env: {
          ...process.env,
          VITE_SUPABASE_URL: 'https://synthetic-b05-movement-countdown.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-b05-movement-countdown-public-placeholder',
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
      await expect(content(page).getByRole('heading', { name: 'hollow body hold', exact: true })).toBeVisible()
      await expect(content(page).getByRole('region', { name: 'hollow body hold countdown' })).toBeVisible()
      await checkA11y()
    })
  },
})

const content = (page: Page) => page.locator('main#main > .clr-scroll-region > .clr-scroll-region__scroller')


// ─────────────────────────────────────────────────────────────────────────────
// The proof
// ─────────────────────────────────────────────────────────────────────────────

test('B05-06.2/06.3 reference region is a full-width countdown above a side-by-side pair', async ({ page }, testInfo) => {
  await page.setContent('<!doctype html><title>reference</title>')
  const ref = await referenceComposition(page)
  const detail = JSON.stringify(ref)
  expect(ref.measured.blocks, detail).toBeGreaterThanOrEqual(2)
  expect(ref.measured.timerAbovePair, detail).toBe(true)
  expect(ref.measured.timerToPairHeight, detail).toBeGreaterThan(1)
  expect(ref.measured.timerSpan, detail).toBeGreaterThan(0.9)
  expect(ref.measured.pairHalves, detail).toBe(2)
  await testInfo.attach('reference-06.json', { body: JSON.stringify(ref, null, 2), contentType: 'application/json' })
})

for (const { name: size, viewport } of VIEWPORTS) {
  test.describe(`B05 movement countdown @ ${size}`, () => {
    test.use({ viewport })

    // TASK-115 retired the case 'logger card: full-width countdown above its pair, above Rest, through every state; distinct clocks; nothing logged' (old line 637): superseded by Round 7
    // (D2, Eric, chat, 2026-11-24: "Retire, list for UAT (Recommended)"); evidence/refinement/task-115/test-ledger.json and UAT-LIST.md name it.

    // TASK-115 retired the case 'circuit row: the one clock sits in the owning card above Rest and keeps its deadline through load entry; round and AMRAP clocks stay theirs' (old line 766): superseded by Round 7
    // (D2, Eric, chat, 2026-11-24: "Retire, list for UAT (Recommended)"); evidence/refinement/task-115/test-ledger.json and UAT-LIST.md name it.

    // TASK-115 retired the case 'superset movement: own-card countdown stays distinct from block rest, retains deadline and drafts, and rearms only after explicit combined logging' (old line 872): superseded by Round 7
    // (D2, Eric, chat, 2026-11-24: "Retire, list for UAT (Recommended)"); evidence/refinement/task-115/test-ledger.json and UAT-LIST.md name it.
  })
}
