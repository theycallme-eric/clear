import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, } from 'node:fs'
import { createServer, type AddressInfo } from 'node:net'
import { basename, resolve } from 'node:path'
import type { Page, } from '@playwright/test'

import { readE2eEnv } from '../scripts/e2e/env.mjs'
import {
  
  
  
  
} from '../src/test/factories'
import { } from '../src/test/user-data-double'
import { expect, test as scanned } from './fixtures'

/** Same reasoning as the B05 shell spec: placeholders on `.invalid`, never forwarded. */
const e2e = readE2eEnv()
const SYNTHETIC_ORIGIN_NEEDED = !e2e.usesExternalTarget && (e2e.url === null || e2e.anonKey === null)

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

const REPO_ROOT = resolve(import.meta.dirname, '..')

/** Ready only when the server answering is this checkout's own. */
async function waitForOrigin(origin: string, deadline: number, exited: () => number | null) {
  const own = `${origin}/@fs${resolve(REPO_ROOT, 'package.json')}`
  while (Date.now() < deadline) {
    const code = exited()
    if (code !== null) throw new Error(`Synthetic review-groups server exited (${code}) before ${origin} was ready`)
    try {
      if ((await fetch(origin)).ok && (await fetch(own)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((settle) => setTimeout(settle, 250))
  }
  throw new Error(`Synthetic review-groups origin ${origin} did not start`)
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
          VITE_SUPABASE_URL: 'https://synthetic-b05-review-groups.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-b05-review-groups-public-placeholder',
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

type Viewport = { width: number; height: number }
/** The portrait phone B05 was captured on, and the narrowest supported one. */
const VIEWPORTS: ReadonlyArray<{ name: string; viewport: Viewport }> = [
  { name: 'phone-390', viewport: { width: 390, height: 844 } },
  { name: 'narrow-320', viewport: { width: 320, height: 568 } },
]

const REFERENCE_DIR = resolve(import.meta.dirname, '..', '..', '.evidence',
  basename(resolve(import.meta.dirname, '..')), 'sources')
const REFERENCE_FILE = 'sources/source-07-B05-04-review-grouping.jpg'
const REFERENCE_BYTES = readFileSync(resolve(REFERENCE_DIR, basename(REFERENCE_FILE)))

/**
 * The selected regions, in the reference's own 2168 × 846 pixels: each pane's
 * movement list from its first movement to the group's closing line, inside
 * the group's frame and below the structure badge.
 */
type Region = { x: number; y: number; width: number; height: number }
const SELECTED: Region = { x: 1462, y: 192, width: 660, height: 590 }
const CURRENT: Region = { x: 92, y: 220, width: 580, height: 500 }
const REFERENCE = {
  file: REFERENCE_FILE,
  sha256: createHash('sha256').update(REFERENCE_BYTES).digest('hex'),
  regions: {
    selected: { ...SELECTED, description: 'Right pane (selected): CONDITIONING circuit, three movements — name row with SWAP at its right end, prescription row, equipment row, one "Rest 60 sec between rounds" line closing the group' },
    current: { ...CURRENT, description: 'Left pane (current, control): name + prescription inline, "Bodyweight Bodyweight Rest 60s" on every movement, SWAP under each movement at the left' },
  },
}



/**
 * The same pixel reading of a movement list, for the reference and for a
 * capture. The action colour is the green-blue Swap ink, read in the right
 * half; text is any other pixel well above the dark surface that is not the
 * purple structure rule. Rows of text are banded and weighed by their stroke,
 * so a larger, bolder name line outweighs the lighter lines below it.
 */
async function analyse(page: Page, png: Buffer, mime: string, region: Region | null) {
  return page.evaluate(async ({ data, mime, region }) => {
    const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0))
    const bitmap = await createImageBitmap(new Blob([bytes], { type: mime }))
    const r = region ?? { x: 0, y: 0, width: bitmap.width, height: bitmap.height }
    const canvas = new OffscreenCanvas(r.width, r.height)
    const context = canvas.getContext('2d', { willReadFrequently: true })!
    context.drawImage(bitmap, r.x, r.y, r.width, r.height, 0, 0, r.width, r.height)
    const pixels = context.getImageData(0, 0, r.width, r.height).data
    const { width, height } = r
    const half = Math.round(width * 0.5)
    const quarter = Math.round(width * 0.25)
    const accentRows: number[] = []
    const accentSpans: { left: number; right: number }[] = []
    const textInk: number[] = []
    const strokes: { length: number; runs: number }[] = []
    for (let y = 0; y < height; y += 1) {
      let accent = 0
      let leading = 0
      let left = width
      let right = 0
      let ink = 0
      let run = 0
      const stroke = { length: 0, runs: 0 }
      for (let x = 0; x <= width; x += 1) {
        const i = (y * width + x) * 4
        const [red, green, blue] = x < width ? [pixels[i], pixels[i + 1], pixels[i + 2]] : [0, 0, 0]
        const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue
        const purple = blue > green + 40 && red > green
        const isAccent = green > 140 && green - red > 45 && !purple
        if (isAccent && x < quarter) leading += 1
        if (x >= half && isAccent) {
          accent += 1
          left = Math.min(left, x)
          right = Math.max(right, x)
        }
        // Text: anything bright but the structure rule and the action at the
        // row's end. A tinted reading on the leading side is still text.
        const isInk = luminance > 110 && !purple && !(isAccent && x >= half)
        if (isInk) { ink += 1; run += 1 } else if (run > 0) {
          stroke.length += run
          stroke.runs += 1
          run = 0
        }
      }
      // An action stands apart at the row's end. A line that starts at the
      // leading edge in the same colour (a coloured rest reading) is content.
      accentRows.push(leading === 0 ? accent : 0)
      accentSpans.push({ left, right })
      textInk.push(ink)
      strokes.push(stroke)
    }
    // Bands: runs of rows with signal, joined across gaps narrower than a line's own leading.
    const bands = (series: number[], floor: number, gap: number) => {
      const found: { top: number; bottom: number; mass: number }[] = []
      series.forEach((value, y) => {
        if (value <= floor) return
        const last = found.at(-1)
        if (last && y - last.bottom <= gap) { last.bottom = y; last.mass += value }
        else found.push({ top: y, bottom: y, mass: value })
      })
      return found
    }
    const gap = Math.max(2, Math.round(width * 0.006))
    const swaps = bands(accentRows, 2, gap).filter((band) => band.bottom - band.top >= gap * 2)
    let accentLeft = width
    let accentRight = 0
    for (const swap of swaps) {
      for (let y = swap.top; y <= swap.bottom; y += 1) {
        if (accentRows[y] === 0) continue
        accentLeft = Math.min(accentLeft, accentSpans[y].left)
        accentRight = Math.max(accentRight, accentSpans[y].right)
      }
    }
    // A line's weight is its mean stroke (the run of ink across each stem)
    // times its dense glyph height (rows carrying at least a third of the
    // line's peak ink: cap height for capitals, about x-height for lower
    // case). Both grow with face size and boldness, neither with line length.
    const text = bands(textInk, 2, gap)
      .filter((band) => band.bottom - band.top >= gap * 2)
      .map((band) => {
        let length = 0
        let runs = 0
        let peak = 0
        for (let y = band.top; y <= band.bottom; y += 1) {
          length += strokes[y].length
          runs += strokes[y].runs
          peak = Math.max(peak, textInk[y])
        }
        let dense = 0
        for (let y = band.top; y <= band.bottom; y += 1) if (textInk[y] >= peak / 3) dense += 1
        const stroke = length / Math.max(1, runs)
        return { top: band.top, bottom: band.bottom, stroke: Math.round(stroke * 100) / 100, dense,
          weight: Math.round(stroke * dense * 100) / 100 }
      })
    // Movements, as B05-04 draws them: the text band beside each Swap is the
    // name; what follows it, before the next movement's name, is beneath it.
    const movements = swaps.map((swap, index) => {
      const centre = (swap.top + swap.bottom) / 2
      const name = text.findIndex((band) => band.top - gap <= centre && centre <= band.bottom + gap)
      const end = index + 1 < swaps.length ? swaps[index + 1].top - gap : height
      const below = name === -1 ? [] : text.filter((band, at) => at > name && band.bottom <= end)
      const nameWeight = name === -1 ? 0 : text[name].weight
      // A wrapped name continues on the next bands at the name's weight; the
      // subordinate readings follow it, lighter, and never return to it.
      const heavy = (band: { weight: number }) => band.weight >= nameWeight * 0.8
      const continuation = below.findIndex((band) => !heavy(band))
      const subordinate = continuation === -1 ? [] : below.slice(continuation)
      return {
        swap: { top: swap.top, bottom: swap.bottom },
        nameBand: name === -1 ? null : text[name],
        nameLines: continuation === -1 ? below.length + 1 : continuation + 1,
        weightsBelow: below.map((band) => band.weight),
        subordinateBelow: subordinate.length,
        nameLeads: name !== -1 && subordinate.length > 0 && subordinate.every((band) => !heavy(band)),
      }
    })
    return {
      size: { width, height },
      swapColumns: { left: accentLeft / width, right: accentRight / width },
      swaps: swaps.length,
      textBands: text.length,
      movements,
    }
  }, { data: png.toString('base64'), mime, region })
}

type Reading = Awaited<ReturnType<typeof analyse>>

/** The relationships B05-04's selected pane shows, as one verdict per reading. */
function relationships(reading: Reading, members: number) {
  return {
    oneSwapPerMovement: reading.swaps === members,
    swapAtRight: reading.swapColumns.left >= 0.55 && reading.swapColumns.right >= 0.85,
    swapOnNameRow: reading.movements.every((movement) => movement.nameBand !== null),
    nameDominant: reading.movements.every((movement) => movement.nameLeads),
    prescriptionThenEquipmentBelow: reading.movements.every((movement) => movement.subordinateBelow >= 2),
  }
}

test('B05-04 reference: the selected pane reads as the hierarchy, the current pane does not', async ({ page }, testInfo) => {
  // The reference is decoded in the fresh, blank page: no screen is visited.
  const selected = relationships(await analyse(page, REFERENCE_BYTES, 'image/jpeg', SELECTED), 3)
  const current = relationships(await analyse(page, REFERENCE_BYTES, 'image/jpeg', CURRENT), 3)
  await testInfo.attach('reference-readings.json', {
    body: JSON.stringify({ reference: REFERENCE, selected, current }, null, 2), contentType: 'application/json',
  })
  // The comparison's own calibration: every relationship holds in the
  // selected region, and the current pane fails the Swap placement.
  expect(selected).toEqual({
    oneSwapPerMovement: true, swapAtRight: true, swapOnNameRow: true,
    nameDominant: true, prescriptionThenEquipmentBelow: true,
  })
  expect(current.swapAtRight).toBe(false)
})

for (const { name: size, viewport } of VIEWPORTS) {
  test.describe(`B05 review groups @ ${size}`, () => {
    test.use({ viewport })

    // TASK-115 retired the case `Review (${state}): grouped hierarchy, right-aligned Swap, one group rest` (old line 605): superseded by Round 7
    // (D2, Eric, chat, 2026-11-24: "Retire, list for UAT (Recommended)"); evidence/refinement/task-115/test-ledger.json and UAT-LIST.md name it.
  })
}

test.describe('B05 grouped Review after a real in-memory swap', () => {
  test.use({ viewport: { width: 320, height: 568 } })

  // TASK-115 retired the case 'narrow multi-line name: choose and Undo keep both actions contained and preserve the prescription' (old line 728): superseded by Round 7
  // (D2, Eric, chat, 2026-11-24: "Retire, list for UAT (Recommended)"); evidence/refinement/task-115/test-ledger.json and UAT-LIST.md name it.
})
