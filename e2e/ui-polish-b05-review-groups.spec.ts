import { execSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { createServer, type AddressInfo } from 'node:net'
import { basename, resolve } from 'node:path'
import type { Locator, Page, Route, TestInfo } from '@playwright/test'

import { readE2eEnv } from '../scripts/e2e/env.mjs'
import { reviewHandoff } from '../src/state/review-handoff'
import type { SessionAcceptance } from '../src/state/schemas'
import {
  makeGenerationOutput,
  makePrescription,
  makeSessionAcceptance,
  makeWorkoutBlock,
} from '../src/test/factories'
import { fixtureLocation, onboardedProfile } from '../src/test/user-data-double'
import { installDeterministicCapture } from './design-0143/fixtures'
import { expect, test as scanned } from './fixtures'

/**
 * UI polish batch 05 — Review's grouped movement hierarchy (REQ-009, TASK-010).
 *
 * B05-04's selected right pane: in a superset or circuit, each movement's name
 * row leads with Swap at its far end, a separate subordinate prescription row
 * follows, then the equipment; the group's round rest is said once, in the
 * group, rather than a rest and a `Bodyweight` on every movement. The accepted
 * numbered one-round sequence, the structure glyph and the missing final
 * divider stay, and the badge keeps TASK-009's content-hugging frame.
 *
 * Each case renders the production Review route at a phone width, asserts the
 * rendered geometry, then compares the actual capture with the reference: the
 * same pixel analysis runs on the reference's selected region and on the
 * capture, and both must show the same relationships. The left (current)
 * pane is analysed too, as the control the comparison must reject.
 *
 * Data is synthetic: an intercepted session for a fictional user, synthetic
 * reads, and no writes, model calls or real account.
 */
const OWNER = '00000000-0000-4000-8000-000000000010'
const PLACE = '00000000-0000-4000-8000-000000000101'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
}

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

function sourceIdentity() {
  try {
    const head = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim()
    const dirty = execSync('git status --porcelain', { encoding: 'utf8' }).trim() !== ''
    const tree = execSync('git rev-parse HEAD:src/app/Review.tsx', { encoding: 'utf8' }).trim()
    const working = createHash('sha256').update(readFileSync(resolve(REPO_ROOT, 'src/app/Review.tsx'))).digest('hex')
    return { head, dirty, reviewAtHead: tree, reviewWorkingSha256: working }
  } catch {
    return { head: process.env.GITHUB_SHA ?? 'unknown', dirty: null }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Real-shaped compositions. Names and counts are this spec's own, never the
// reference's demo: a superset with a real load and a long name, and a
// bodyweight circuit whose members each carry a rest the group already states.
// ─────────────────────────────────────────────────────────────────────────────

const bodyweight = { equipment: 'bodyweight', load_type: 'bodyweight' as const, load_value: null }
const today = new Date().toISOString().slice(0, 10)

function acceptance(title: string, superset: readonly string[], circuit: readonly string[]): SessionAcceptance {
  const base = makeGenerationOutput()
  return makeSessionAcceptance({
    date: today, location_id: PLACE, goal_preset: 'balanced',
    workout: {
      ...base,
      title,
      sections: [base.sections[0], {
        section_type: 'accessory', section_title: 'Accessory', section_notes: null,
        blocks: [makeWorkoutBlock({
          structure_type: 'superset', rep_scheme: 'fixed', rounds: 3, round_rest_seconds: 90,
          exercises: superset.map((exercise_id, index) => makePrescription({
            exercise_id, equipment: index === 0 ? 'kettlebell' : 'dumbbell', sets: 3,
            target_value: index === 0 ? 10 : 8, load_type: 'absolute', load_value: 16, rest_seconds: 0,
          })),
        })],
      }, {
        section_type: 'conditioning', section_title: 'Conditioning', section_notes: null,
        blocks: [makeWorkoutBlock({
          structure_type: 'circuit', rep_scheme: 'fixed', rounds: 2, round_rest_seconds: 60,
          exercises: circuit.map((exercise_id, index) => makePrescription({
            exercise_id, ...bodyweight, sets: 2, rest_seconds: 60,
            ...(index === circuit.length - 1 ? { modality: 'time' as const, target_value: 20 } : { target_value: 12 - index * 2 }),
          })),
        })],
      }],
    },
  } as Parameters<typeof makeSessionAcceptance>[0])
}

const STATES: Readonly<Record<string, SessionAcceptance>> = {
  // B05-04's shape: short names, three bodyweight stations, two rounds.
  pictured: acceptance('Synthetic grouped review',
    ['kb-swing', 'high-pull'],
    ['mountain-climber', 'squat-jump', 'bear-crawl']),
  // Multiple names that wrap, in both structures, at both widths.
  'multi-line': acceptance('Synthetic long movement names',
    ['single-arm-kettlebell-overhead-reverse-lunge', 'alternating-dumbbell-renegade-row-to-push-up'],
    ['mountain-climber-cross-body-knee-drive', 'squat-jump', 'lateral-bear-crawl-with-shoulder-tap']),
}

/** What each group must read, from the composition rather than from a screenshot. */
const GROUPS = [
  { list: 'superset, 3 rounds', badge: 'SUPERSET · 3 ROUNDS', rest: 'Rest 90s between rounds', members: 2 },
  { list: 'circuit, 2 rounds', badge: 'CIRCUIT · 2 ROUNDS', rest: 'Rest 60s between rounds', members: 3 },
] as const

async function syntheticApp(page: Page, composition: SessionAcceptance) {
  const unexpected: string[] = []
  let attemptedWrites = 0
  let functionPosts = 0
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
      if (request.method() === 'POST') functionPosts += 1
      unexpected.push(`${request.method()} ${url.pathname}`)
      return route.abort('blockedbyclient')
    }
    if (request.method() === 'GET') {
      if (name === 'profiles') return reply([onboardedProfile({ id: OWNER, goal_preset: 'balanced' })])
      if (name === 'locations') return reply([fixtureLocation({ id: PLACE, user_id: OWNER, tier: 'full' })])
      if (['workout_sessions', 'rest_days', 'load_anchors', 'location_equipment', 'saved_workouts',
        'saved_workout_attempts', 'saved_workout_completions', 'exercise_definitions'].includes(name)) return reply([])
    }
    // Reads that travel as POST: answered, never forwarded, never a write.
    if (request.method() === 'POST' && url.pathname.includes('/rpc/')) {
      if (name === 'resume_session') return reply(null)
      if (['streak_sessions', 'constraints_in_force', 'anchor_evidence', 'conditioning_history',
        'generation_candidate_sets_for_goal'].includes(name)) return reply([])
    }
    if (request.method() !== 'GET') attemptedWrites += 1
    unexpected.push(`${request.method()} ${url.pathname}`)
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic review-groups request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ owner, handoff }) => {
    localStorage.setItem('clear.auth.session', JSON.stringify({
      accessToken: 'synthetic-b05-review-groups-session', refreshToken: 'synthetic-b05-review-groups-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-b05-review-groups@example.invalid' },
    }))
    if (location.pathname === '/review') {
      history.replaceState({ usr: handoff, key: 'synthetic-review-groups', idx: 0 }, '', location.href)
    }
  }, { owner: OWNER, handoff: reviewHandoff(composition) })
  return {
    assertReadOnly() {
      expect(unexpected).toEqual([])
      expect(attemptedWrites).toBe(0)
      expect(functionPosts).toBe(0)
      expect(guard.blockedGenerations()).toBe(0)
    },
  }
}

/** Every declared face loaded before anything is measured. */
async function settleFonts(page: Page) {
  await page.evaluate(async () => {
    void document.body.offsetHeight
    await Promise.all([...document.fonts].map((face) => face.load().catch(() => undefined)))
    await document.fonts.ready
    await new Promise((settle) => requestAnimationFrame(() => requestAnimationFrame(settle)))
  })
}

/** Review, reached the way the product reaches it: Home, then the Generate → Review handoff. */
async function openReview(page: Page, composition: SessionAcceptance,
  visit: (path: string) => Promise<void>, checkA11y: () => Promise<void>) {
  await visit('/')
  await page.evaluate((handoff) => {
    history.pushState({ usr: handoff, key: 'synthetic-review-groups', idx: 1 }, '', '/review')
    dispatchEvent(new PopStateEvent('popstate', { state: history.state }))
  }, reviewHandoff(composition))
  await expect(page).toHaveURL(/\/review$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(composition.workout.title)
  await expect(page.locator('.clr-scroll-region[data-measured]')).toHaveCount(1)
  await settleFonts(page)
  await page.waitForFunction(() => {
    const main = document.querySelector('main')
    return main && main.getAnimations({ subtree: true })
      .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
      .every((animation) => animation.playState !== 'running')
  })
  await checkA11y()
}

async function useSkin(page: Page, skin: 'clear' | 'vapour') {
  await page.evaluate((value) => {
    localStorage.setItem('clear.skin', value)
    document.documentElement.setAttribute('data-skin', value)
  }, skin)
  await expect(page.locator('html')).toHaveAttribute('data-skin', skin)
  await settleFonts(page)
}

/** Sub-pixel rounding only. */
const TOLERANCE = 0.75

/** One group's rendered relationships, read from the DOM's own boxes and styles. */
async function groupGeometry(list: Locator) {
  return list.evaluate((ol) => {
    const box = (node: Element) => {
      const rect = node.getBoundingClientRect()
      return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width, height: rect.height }
    }
    const lines = (node: Element) => {
      const range = document.createRange()
      range.selectNodeContents(node)
      return new Set([...range.getClientRects()].filter((rect) => rect.width > 0).map((rect) => Math.round(rect.top))).size
    }
    const group = ol.parentElement!
    const badge = group.querySelector('.clr-bleed')!
    const frame = badge.firstElementChild!
    const members = [...ol.children].map((item) => {
      const row = item.firstElementChild!
      const [nameRow, prescription, equipment] = [...row.children]
      const name = nameRow.firstElementChild!
      const swap = nameRow.querySelector('button')!
      const style = getComputedStyle(name)
      const [ordinal, words] = [...name.children]
      return {
        text: item.textContent,
        name: { ...box(name), text: words.textContent, lines: lines(words), fontSize: parseFloat(style.fontSize),
          fontWeight: Number(style.fontWeight), lineHeight: parseFloat(style.lineHeight), color: style.color },
        ordinalBox: box(ordinal),
        wordsBox: box(words),
        ordinal: ordinal.textContent,
        swapColor: getComputedStyle(swap).color,
        swap: { ...box(swap), label: swap.getAttribute('aria-label') },
        prescription: { ...box(prescription), text: prescription.textContent,
          fontSize: parseFloat(getComputedStyle(prescription).fontSize) },
        equipment: { ...box(equipment), text: equipment.textContent,
          fontSize: parseFloat(getComputedStyle(equipment).fontSize) },
        rule: parseFloat(getComputedStyle(item).borderBottomWidth),
      }
    })
    return {
      group: box(group),
      list: box(ol),
      children: [...group.children].map((child) => ({ tag: child.tagName, text: child.textContent })),
      badge: { wrapper: box(badge), frame: box(frame), glyph: frame.querySelector('svg') !== null, text: badge.textContent },
      rest: (() => {
        const last = group.lastElementChild!
        return { ...box(last), text: last.textContent, glyph: last.querySelector('svg') !== null }
      })(),
      groupText: group.textContent ?? '',
      members,
    }
  })
}

type Geometry = Awaited<ReturnType<typeof groupGeometry>>

function overlaps(a: { top: number; bottom: number; left: number; right: number },
  b: { top: number; bottom: number; left: number; right: number }) {
  return a.left < b.right - TOLERANCE && b.left < a.right - TOLERANCE &&
    a.top < b.bottom - TOLERANCE && b.top < a.bottom - TOLERANCE
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

async function record(page: Page, testInfo: TestInfo, id: string, context: Record<string, unknown>,
  captures: { part: string; png: Buffer }[]) {
  const files = []
  for (const { part, png } of captures) {
    const file = `${id}-${part}.png`
    const shotPath = testInfo.outputPath(file)
    writeFileSync(shotPath, png)
    await testInfo.attach(file, { path: shotPath, contentType: 'image/png' })
    files.push({ part, file, sha256: createHash('sha256').update(png).digest('hex') })
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
    captures: files,
  }
  writeFileSync(testInfo.outputPath(`${id}.json`), JSON.stringify(entry, null, 2))
  await testInfo.attach(`${id}.json`, { body: JSON.stringify(entry, null, 2), contentType: 'application/json' })
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

    for (const [state, composition] of Object.entries(STATES)) {
      test(`Review (${state}): grouped hierarchy, right-aligned Swap, one group rest`, async ({ page, visit, checkA11y }, testInfo) => {
        const app = await syntheticApp(page, composition)
        await openReview(page, composition, visit, checkA11y)
        const referenceReading = await analyse(page, REFERENCE_BYTES, 'image/jpeg', SELECTED)
        const reference = relationships(referenceReading, 3)

        // Vapour is the skin B05-04 was captured in; CLEAR is the default.
        for (const skin of ['vapour', 'clear'] as const) {
        await useSkin(page, skin)
        for (const spec of GROUPS) {
          const list = page.getByRole('list', { name: spec.list })
          await list.scrollIntoViewIfNeeded()
          await settleFonts(page)
          const geometry: Geometry = await groupGeometry(list)
          const where = `${state} ${spec.list} @ ${size} ${skin}`
          expect(geometry.members, where).toHaveLength(spec.members)

          // Preserved: the glyph-led badge, hugging its label (TASK-009), then
          // the numbered one-round sequence above the list.
          expect(geometry.badge.text).toBe(spec.badge)
          expect(geometry.badge.glyph).toBe(true)
          expect(Math.abs(geometry.badge.wrapper.width - geometry.badge.frame.width), where).toBeLessThanOrEqual(1)
          expect(geometry.badge.wrapper.width, where).toBeLessThan(geometry.group.width - 20)
          const sequence = `One round: ${Array.from({ length: spec.members }, (_, i) => String(i + 1).padStart(2, '0')).join(' → ')}`
          expect(geometry.children[1].text).toBe(sequence)

          // AC-028: the round rest once, closing the group, with its glyph;
          // no movement repeats a rest or a `Bodyweight` beside its equipment.
          expect(geometry.rest.text).toBe(spec.rest)
          expect(geometry.rest.glyph).toBe(true)
          expect(geometry.rest.top).toBeGreaterThanOrEqual(geometry.list.bottom - TOLERANCE)
          expect(geometry.groupText.match(/Rest \d+s/g), where).toHaveLength(1)

          const swapRights = geometry.members.map((member) => member.swap.right)
          geometry.members.forEach((member, index) => {
            const label = `${where} #${index + 1} ${member.name.text}`
            // AC-029: numbered, ruled between movements and never after the last.
            expect(member.ordinal, label).toBe(`${String(index + 1).padStart(2, '0')} `)
            expect(member.rule > 0, label).toBe(index < geometry.members.length - 1)
            expect(member.text?.match(/bodyweight/gi)?.length ?? 0, label).toBeLessThanOrEqual(1)
            expect(member.text, label).not.toMatch(/Rest \d+s/)

            // AC-027: name row dominant; a separate, smaller prescription row
            // below it, then equipment; Swap on the name row, at the right.
            expect(member.name.fontSize, label).toBeGreaterThan(member.prescription.fontSize)
            expect(member.prescription.fontSize, label).toBeGreaterThan(member.equipment.fontSize)
            expect(member.name.fontWeight, label).toBeGreaterThanOrEqual(600)
            expect(member.name.color, label).not.toBe(member.swapColor)
            // The ordinal keeps its own column: a wrapped name stays beside it.
            expect(member.wordsBox.left, label).toBeGreaterThanOrEqual(member.ordinalBox.right - TOLERANCE)
            expect(Math.abs(member.wordsBox.top - member.name.top), label).toBeLessThanOrEqual(TOLERANCE)
            expect(member.prescription.top, label).toBeGreaterThanOrEqual(Math.max(member.name.bottom, member.swap.bottom) - TOLERANCE)
            expect(member.equipment.top, label).toBeGreaterThanOrEqual(member.prescription.bottom - TOLERANCE)
            expect(member.swap.left, label).toBeGreaterThanOrEqual(member.name.right - TOLERANCE)
            expect(member.swap.right, label).toBeLessThanOrEqual(geometry.list.right + TOLERANCE)
            expect(geometry.list.right - member.swap.right, label).toBeLessThanOrEqual(8)
            const firstLine = member.name.top + member.name.lineHeight / 2
            expect(Math.abs((member.swap.top + member.swap.bottom) / 2 - firstLine), label).toBeLessThanOrEqual(2)
            for (const [a, b] of [[member.name, member.swap], [member.name, member.prescription],
              [member.swap, member.prescription], [member.prescription, member.equipment]] as const) {
              expect(overlaps(a, b), label).toBe(false)
            }
          })
          expect(Math.max(...swapRights) - Math.min(...swapRights), where).toBeLessThanOrEqual(TOLERANCE)
          if (state === 'multi-line') {
            expect(geometry.members.some((member) => member.name.lines >= 2), where).toBe(true)
          }

          // AC-064: the actual capture, read the way the reference was read.
          // A tall group is wider than nothing but taller than a phone: it is
          // captured whole in a taller window of the same width, so every line
          // wraps exactly as measured above and nothing sits under the footer.
          await page.setViewportSize({ width: viewport.width, height: 2400 })
          await list.evaluate((element) => element.parentElement!.scrollIntoView({ block: 'start' }))
          await settleFonts(page)
          const listBox = (await list.boundingBox())!
          const restBox = (await list.locator('xpath=..').locator(':scope > :last-child').boundingBox())!
          const clip = { x: listBox.x, y: listBox.y, width: listBox.width,
            height: restBox.y + restBox.height - listBox.y }
          await page.mouse.move(0, 0)
          const png = await page.screenshot({ clip, animations: 'disabled' })
          const group = await list.locator('xpath=..').screenshot({ animations: 'disabled' })
          await page.setViewportSize(viewport)
          const reading = await analyse(page, png, 'image/png', null)
          const implementation = relationships(reading, spec.members)
          if (state === 'multi-line') {
            expect(reading.movements.some((movement) => movement.nameLines >= 2), `${where}: wrapped name in pixels`).toBe(true)
          }
          const criteria = {
            'AC-027 hierarchy': implementation.nameDominant && implementation.prescriptionThenEquipmentBelow &&
              implementation.swapOnNameRow && implementation.swapAtRight ? 'pass' : 'fail',
            'AC-028 one group rest': 'pass',
            'AC-029 numbered/glyph/final divider/real behavior': 'pass',
            'AC-064 reference comparison': JSON.stringify(implementation) === JSON.stringify(reference) ? 'pass' : 'fail',
          }
          await record(page, testInfo, `${state}-${spec.list.split(',')[0]}-${size}-${skin}`, {
            consumer: 'Review (ENTRY-010) grouped ReviewExerciseRow',
            state, structure: spec.list, viewport, skin,
            referenceRelationships: reference, implementationRelationships: implementation,
            referenceReading, implementationReading: reading,
            measurements: geometry, criteria,
          }, [{ part: 'list', png }, { part: 'group', png: group }])
          expect(implementation, `${where}: capture against B05-04 selected pane`).toEqual(reference)
        }
        }

        // Swap behaviour unchanged: the right-aligned action still opens the
        // movement's real alternatives (a synthetic, empty candidate read).
        const swap = page.getByRole('list', { name: 'circuit, 2 rounds' }).getByRole('button', { name: /^Swap / }).first()
        await swap.click()
        const dialog = page.getByRole('dialog')
        await expect(dialog).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(dialog).toBeHidden()
        app.assertReadOnly()
      })
    }
  })
}
