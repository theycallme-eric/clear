import { spawn, execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createServer, type AddressInfo } from 'node:net'
import { dirname, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Locator, Page } from '@playwright/test'

import { readE2eEnv } from '../../scripts/e2e/env.mjs'
import { resolveObjectStore } from '../../scripts/refinement/lib/references.mjs'
import { LOGGING_CONTEXTS } from '../../src/dev/gallery-refinement-data'
import { EXTRA_STATES } from '../../src/dev/gallery-refinement-states'
import { installDeterministicCapture } from '../design-0143/fixtures'
import { expect, test as scanned } from '../fixtures'

/**
 * A3 TASK-115 end-of-run comparison (TASK-AC-495C349983AC, AC-GAL-07): every
 * one of the accepted gallery's 26 refinement states (bec4454) beside its real
 * route at the two approved phone widths, 320 and 390, with matched data, for
 * Eric's UAT.
 *
 * Aggregate closure consumes task-owned proof (AC-GAL-07): the matched-data
 * pairs — the gallery state and the real route driven to the same moment over
 * the same data — are the owning tasks' look checks, each taken through that
 * task's own guard at the end of the run (TASK-105, 106, 107, 108, 110, 111,
 * 116 and 117 recaptured by TASK-115 after TASK-114's dialog change; TASK-114
 * and TASK-120 were taken after the last product change). Each state names one
 * primary owner, so no state is left without a pair. Every pair's capture is
 * read from the Runner's evidence store and its SHA-256 checked against the
 * owner's receipt, and every visible difference the owner recorded is carried
 * with its criterion ID; one with none is listed as unintended for UAT.
 *
 * This spec also draws each state again at the delivered revision — the
 * gallery's own page, frozen (reduced motion, the page's fixed clock,
 * animations disabled) and captured whole (`wholePart`, TASK-110's method) —
 * so the page shows the state as it stands at the end of the run beside the
 * owners' pairs. Captures go to the Runner's evidence store (outside Git),
 * under this body's folder (`clear-gallery-adoption-v2-20261120/task-115/
 * captures/`); receipts to `evidence/refinement/task-115/comparison/`. The
 * last case writes `evidence/refinement/task-115/comparison/index.html` and
 * opens it, checking that every image loads. Nothing is written to a backend.
 */
const REPO_ROOT = resolve(import.meta.dirname, '..', '..')
const EVIDENCE = join(REPO_ROOT, 'evidence', 'refinement')
const COMPARISON = join(EVIDENCE, 'task-115', 'comparison')
const RECEIPTS = join(COMPARISON, 'receipts')
const CAPTURE_BODY = 'clear-gallery-adoption-v2-20261120'
const GALLERY = 'bec44545eb982f6dc136a583400f7e314c306d1d'
const ENTRY = new Date('2026-11-14T12:00:00Z')
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

async function waitForOrigin(origin: string, deadline: number, exited: () => number | null) {
  const own = `${origin}/@fs${resolve(REPO_ROOT, 'package.json')}`
  while (Date.now() < deadline) {
    const code = exited()
    if (code !== null) throw new Error(`Synthetic TASK-115 server exited (${code}) before ${origin} was ready`)
    try {
      if ((await fetch(origin)).ok && (await fetch(own)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((settle) => setTimeout(settle, 250))
  }
  throw new Error(`Synthetic TASK-115 origin ${origin} did not start`)
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
          VITE_SUPABASE_URL: 'https://synthetic-task-115.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-task-115-public-placeholder',
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
test.use({ timezoneId: 'UTC' })

const VIEWPORTS = [
  { name: 'phone-320', width: 320, viewport: { width: 320, height: 568 } },
  { name: 'phone-390', width: 390, viewport: { width: 390, height: 844 } },
] as const

// ─────────────────────────────────────────────────────────────────────────────
// The 26 states and the owners whose matched-data pairs this page consumes
// ─────────────────────────────────────────────────────────────────────────────

const STATES: ReadonlyArray<readonly [string, string]> = [...EXTRA_STATES, ...LOGGING_CONTEXTS]

/** Each state's primary owner: the task whose look check pairs it with its real route. */
const PRIMARY: Record<string, { task: string; receipts: readonly string[] }> = {
  cards: { task: 'TASK-110', receipts: ['cards'] },
  overview: { task: 'TASK-118', receipts: ['overview'] },
  preparation: { task: 'TASK-119', receipts: ['preparation'] },
  screens: { task: 'TASK-119', receipts: ['screens'] },
  'ladder-4': { task: 'TASK-105', receipts: ['ladder-4'] },
  'ladder-12': { task: 'TASK-105', receipts: ['ladder-12'] },
  'ladder-long': { task: 'TASK-114', receipts: ['ladder-long'] },
  urgency: { task: 'TASK-120', receipts: ['urgency'] },
  errors: { task: 'TASK-113', receipts: ['errors-clear', 'errors-vapour', 'errors-signal', 'errors-mono'] },
  assets: { task: 'TASK-118', receipts: ['assets'] },
  ...Object.fromEntries(LOGGING_CONTEXTS.map(([id]) => [id, { task: 'TASK-114', receipts: [id] }])),
}

/**
 * Owners whose pairs are current at the end of the run: recaptured here
 * through their own guards after TASK-114's dialog change, or taken after the
 * last product change (TASK-114, TASK-120). Their other receipts naming a
 * state are shown beside the primary pair.
 */
const END_OF_RUN_OWNERS = ['TASK-105', 'TASK-106', 'TASK-107', 'TASK-108', 'TASK-110', 'TASK-111', 'TASK-114', 'TASK-116', 'TASK-117', 'TASK-120'] as const
const RECAPTURED = new Set(['TASK-105', 'TASK-106', 'TASK-107', 'TASK-108', 'TASK-110', 'TASK-111', 'TASK-116', 'TASK-117'])

interface Capture { readonly file: string; readonly sha256: string }
interface Moment { readonly moment: string; readonly gallery: readonly LabelledCapture[]; readonly route: readonly LabelledCapture[] }
interface LabelledCapture extends Capture { readonly key: string; readonly path: string }
interface Labelled { readonly criterion: string | null; readonly text: string }
interface OwnerPair {
  readonly task: string
  readonly primary: boolean
  readonly receipt: string
  readonly receiptSha256: string
  readonly provenance: string
  readonly route: string
  readonly moments: readonly Moment[]
  readonly differences: readonly Labelled[]
}

const taskDir = (task: string) => task.toLowerCase()

function git(args: readonly string[]): string {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
}

/** Where an owner's receipt was taken: in this worktree (not yet committed) or at the commit that last wrote it. */
function provenance(task: string, path: string): string {
  const rel = relative(REPO_ROOT, path)
  const dirty = git(['status', '--porcelain', '--', rel]) !== ''
  if (dirty) return `${task}'s guard, in this worktree (not yet committed)`
  const commit = git(['log', '-1', '--format=%h', '--', rel])
  const how = RECAPTURED.has(task) ? 'recaptured through its own guard by TASK-115' : 'taken by its own task run'
  return `${how}; receipt bytes as committed at ${commit}`
}

function storeFile(identity: string): string {
  const store = resolveObjectStore({ cwd: REPO_ROOT })
  if (!identity.startsWith('store:')) throw new Error(`capture ${identity} is not in the evidence store`)
  if (store.problem !== undefined || store.dir === null) throw new Error(`the evidence store is not available: ${store.problem}`)
  return join(store.dir, identity.slice('store:'.length))
}

/** Every capture an owner's receipt records, grouped by moment into gallery and route sides. */
function momentsOf(receipt: Record<string, unknown>): Moment[] {
  const captures = (receipt.captures ?? {}) as Record<string, Capture>
  const byMoment = new Map<string, { gallery: LabelledCapture[]; route: LabelledCapture[] }>()
  for (const [key, capture] of Object.entries(captures)) {
    if (typeof capture?.file !== 'string' || typeof capture?.sha256 !== 'string') continue
    const match = /^(gallery|route)[-:]?(.*)$/i.exec(key)
    let side: 'gallery' | 'route'
    let moment: string
    if (match) {
      side = match[1].toLowerCase() === 'gallery' ? 'gallery' : 'route'
      moment = match[2].replace(/^[A-Z]/, (letter) => letter.toLowerCase()) || 'state'
    } else {
      // Owners that compare several routes name each by its route (review:card, setup:equipment).
      side = 'route'
      moment = key.includes(':') ? key.slice(key.indexOf(':') + 1) : key
    }
    const entry = byMoment.get(moment) ?? { gallery: [], route: [] }
    entry[side].push({ key, file: capture.file, sha256: capture.sha256, path: storeFile(capture.file) })
    byMoment.set(moment, entry)
  }
  return [...byMoment.entries()].map(([moment, sides]) => ({ moment, ...sides }))
}

/** Every visible difference the owner recorded, with its criterion; none at all is a criterion-free entry. */
function differencesOf(receipt: unknown): Labelled[] {
  const found: Labelled[] = []
  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(visit)
      return
    }
    if (node === null || typeof node !== 'object') return
    const record = node as Record<string, unknown>
    // A compared row whose two sides read the same is not a difference (TASK-111 and TASK-119 list every row).
    const same = record.same === true || (typeof record.gallery === 'string' && record.gallery === record.route)
    if (('criterion' in record || 'criteria' in record) && !same) {
      const raw = record.criterion ?? record.criteria
      const criterion = Array.isArray(raw) ? raw.join(', ') : typeof raw === 'string' && raw.trim() !== '' ? raw : null
      const words = [record.side, record.text ?? record.change ?? record.key, record.reason]
        .filter((part): part is string => typeof part === 'string' && part !== '')
      found.push({ criterion, text: words.join(' — ') || JSON.stringify(record).slice(0, 200) })
    }
    for (const value of Object.values(record)) visit(value)
  }
  visit(receipt)
  return found
}

function ownerPair(task: string, name: string, width: number, primary: boolean): OwnerPair | null {
  const path = join(EVIDENCE, taskDir(task), 'parity', `${name}-phone-${width}.json`)
  if (!existsSync(path)) return null
  const bytes = readFileSync(path)
  const receipt = JSON.parse(bytes.toString('utf8')) as Record<string, unknown>
  const routes = receipt.route ?? receipt.routes
  return {
    task,
    primary,
    receipt: relative(REPO_ROOT, path),
    receiptSha256: createHash('sha256').update(bytes).digest('hex'),
    provenance: provenance(task, path),
    route: Array.isArray(routes) ? routes.join(', ') : String(routes ?? ''),
    moments: momentsOf(receipt),
    differences: differencesOf(receipt),
  }
}

/** The primary owner's pairs, then every end-of-run owner's other receipts for the same state. */
function pairsFor(id: string, width: number): OwnerPair[] {
  const primary = PRIMARY[id]
  const pairs = primary.receipts.map((name) => ownerPair(primary.task, name, width, true)).filter((pair) => pair !== null)
  for (const task of END_OF_RUN_OWNERS) {
    if (task === primary.task) continue
    const dir = join(EVIDENCE, taskDir(task), 'parity')
    if (!existsSync(dir)) continue
    for (const file of readdirSync(dir).sort()) {
      const match = /^(.*)-phone-(\d+)\.json$/.exec(file)
      if (!match || Number(match[2]) !== width) continue
      const receipt = JSON.parse(readFileSync(join(dir, file), 'utf8')) as { state?: string }
      if (receipt.state !== id) continue
      const pair = ownerPair(task, match[1], width, false)
      if (pair && pair.moments.length > 0) pairs.push(pair)
    }
  }
  return pairs
}

// ─────────────────────────────────────────────────────────────────────────────
// Capture, frozen and whole (TASK-110's wholePart, unchanged in method)
// ─────────────────────────────────────────────────────────────────────────────

async function renderFrame(page: Page) {
  await page.screenshot({ clip: { x: 0, y: 0, width: 1, height: 1 } })
}

async function settle(page: Page) {
  await page.evaluate(async () => {
    void document.body.offsetHeight
    await Promise.all([...document.fonts].map((face) => face.load().catch(() => undefined)))
    await document.fonts.ready
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
  })
  await page.waitForFunction(() => document.getAnimations()
    .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
    .every((animation) => animation.playState !== 'running'))
}

/**
 * The part's image once two screenshots 100 ms apart are identical; a part that never holds still fails the case.
 * A state whose clocks run (urgency, the ladders) draws digits and fills that move with the wall clock between
 * runs; they are masked here so the capture holds run to run — the owners' pairs carry each clock's moment.
 */
async function steadyScreenshot(target: Locator): Promise<Buffer> {
  const moving = [target.locator('[role="timer"]'), target.locator('[role="progressbar"]')]
  const shot = () => target.screenshot({ caret: 'hide', animations: 'disabled', mask: moving })
  let previous = await shot()
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await target.page().waitForTimeout(100)
    const next = await shot()
    if (next.equals(previous)) return next
    previous = next
  }
  throw new Error('The captured part never held still for two screenshots in a row.')
}

async function scrollSettled(page: Page) {
  await page.waitForFunction(() => document.querySelector('.clr-scroll-region[data-scrolling]') === null)
}

async function overrun(target: Locator): Promise<number> {
  return target.evaluate((element) => {
    const box = element.getBoundingClientRect()
    const scroller = element.closest('.clr-scroll-region__scroller')
    const shown = scroller === null ? { top: 0, bottom: window.innerHeight } : scroller.getBoundingClientRect()
    const over = Math.max(shown.top - box.top, box.bottom - shown.bottom)
    return over > 1 ? Math.ceil(over) : 0
  })
}

/** TASK-110's wholePart: a part taller than its scroll region is captured whole on a page made just tall enough. */
async function wholePart(target: Locator): Promise<Buffer> {
  const page = target.page()
  const viewport = page.viewportSize()!
  const extra = await overrun(target)
  if (extra > 0) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height + extra + 64 })
    await target.evaluate((element) => element.scrollIntoView({ block: 'nearest' }))
    await renderFrame(page)
    await settle(page)
    expect(await overrun(target), 'the part fits the taller page').toBe(0)
  }
  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await scrollSettled(page)
      await renderFrame(page)
      const bytes = await steadyScreenshot(target)
      if (await page.evaluate(() => document.querySelector('.clr-scroll-region[data-scrolling]') === null)) return bytes
    }
    throw new Error('A scroll region stayed lit through every capture of the part.')
  } finally {
    if (extra > 0) {
      await page.setViewportSize(viewport)
      await target.evaluate((element) => element.scrollIntoView({ block: 'start' }))
      await renderFrame(page)
      await settle(page)
    }
  }
}

function captureDir(): { dir: string; identity: string } {
  const store = resolveObjectStore({ cwd: REPO_ROOT })
  if (store.problem === undefined && store.dir !== null) {
    return { dir: join(store.dir, CAPTURE_BODY, 'task-115', 'captures'), identity: `store:${CAPTURE_BODY}/task-115/captures` }
  }
  const dir = join(REPO_ROOT, 'test-results', 'task-115-comparison')
  return { dir, identity: `repo:${relative(REPO_ROOT, dir)}` }
}

/**
 * The state as it first draws at the delivered revision, captured whole. A page load is drawn
 * again until two loads in a row give the same bytes (up to four loads), so a stray first paint
 * never becomes the receipt's capture.
 */
async function keep(page: Page, visit: (path: string) => Promise<void>, id: string, title: string, name: string): Promise<LabelledCapture> {
  const draw = async () => {
    await page.clock.setFixedTime(ENTRY)
    await visit(`/gallery/refinements?state=${id}`)
    const state = page.locator(`[data-refinement-state="${id}"]`)
    await expect(state).toBeVisible()
    await expect(state.getByRole('heading').first()).toHaveText(title)
    await page.waitForLoadState('networkidle')
    await settle(page)
    await page.mouse.move(0, 0)
    return wholePart(state)
  }
  let bytes = await draw()
  for (let load = 0; load < 3; load += 1) {
    const again = await draw()
    if (again.equals(bytes)) break
    bytes = again
  }
  const { dir, identity } = captureDir()
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${name}.png`), bytes)
  return { key: 'end-of-run', file: `${identity}/${name}.png`, sha256: createHash('sha256').update(bytes).digest('hex'), path: join(dir, `${name}.png`) }
}

const sha = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex')

function receiptPath(id: string, width: number) {
  return join(RECEIPTS, `${id}-phone-${width}.json`)
}

/** Paths in receipts and on the page are relative to the page, never an owner-machine path. */
const fromPage = (path: string) => relative(COMPARISON, path).split('\\').join('/')

// ─────────────────────────────────────────────────────────────────────────────
// One case per state and width
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The dev server compiles each module on its first request, so every state is
 * opened once before any capture: the first case then draws on a warm server
 * like every later one (a cold first draw of the cards state differed run to run).
 */
test.beforeAll(async ({ browser, syntheticOrigin }) => {
  test.setTimeout(240_000)
  const context = await browser.newContext({ baseURL: syntheticOrigin ?? e2e.baseURL, viewport: { width: 320, height: 568 } })
  const page = await context.newPage()
  for (const [id] of STATES) {
    await page.goto(`/gallery/refinements?state=${id}`)
    await expect(page.locator(`[data-refinement-state="${id}"]`)).toBeVisible({ timeout: 60_000 })
    await page.waitForLoadState('networkidle')
  }
  await context.close()
})

for (const [id, title] of STATES) {
  for (const { name, width, viewport } of VIEWPORTS) {
    test(`TASK-AC-495C349983AC ${id} ${name}: the accepted gallery state beside its real route from its owner’s end-of-run matched-data pair, each capture hash-checked, every visible difference labelled with its criterion or listed as unintended`, async ({ page, visit }) => {
      test.setTimeout(120_000)
      await page.setViewportSize(viewport)

      // The owners' matched-data pairs: present, hash-verified, both sides.
      const pairs = pairsFor(id, width)
      const primary = pairs.filter((pair) => pair.primary)
      expect(primary.length, `${id} ${name}: ${PRIMARY[id].task}'s receipt is present`).toBe(PRIMARY[id].receipts.length)
      for (const pair of pairs) {
        for (const moment of pair.moments) {
          for (const capture of [...moment.gallery, ...moment.route]) {
            expect(existsSync(capture.path), `${pair.task} ${capture.file} is in the evidence store`).toBe(true)
            expect(sha(capture.path), `${pair.task} ${capture.file} matches its receipt`).toBe(capture.sha256)
          }
        }
      }
      for (const pair of primary) {
        expect(pair.moments.some((moment) => moment.gallery.length > 0), `${pair.receipt}: a gallery capture`).toBe(true)
        expect(pair.moments.some((moment) => moment.route.length > 0), `${pair.receipt}: a real-route capture`).toBe(true)
      }
      for (const pair of pairs) {
        const receipt = JSON.parse(readFileSync(join(REPO_ROOT, pair.receipt), 'utf8')) as { gallery?: string }
        if (receipt.gallery !== undefined) expect(receipt.gallery, `${pair.receipt} compares the accepted gallery`).toBe(GALLERY)
      }

      // The state again at the delivered revision, frozen and whole.
      await installDeterministicCapture(page, { skin: 'clear', reducedMotion: true })
      const fresh = await keep(page, visit, id, title, `${id}-${name}-gallery`)

      const differences = pairs.flatMap((pair) => pair.differences.map((difference) => ({ task: pair.task, ...difference })))
      const receipt = {
        schema: 'clear-task-115-comparison/v1',
        task: 'TASK-115',
        gallery: GALLERY,
        state: id,
        title,
        width,
        primaryOwner: PRIMARY[id].task,
        endOfRunGallery: { file: fresh.file, sha256: fresh.sha256, page: fromPage(fresh.path) },
        owners: pairs.map((pair) => ({
          task: pair.task,
          primary: pair.primary,
          receipt: pair.receipt,
          receiptSha256: pair.receiptSha256,
          provenance: pair.provenance,
          route: pair.route,
          moments: pair.moments.map((moment) => ({
            moment: moment.moment,
            gallery: moment.gallery.map((capture) => ({ key: capture.key, file: capture.file, sha256: capture.sha256, page: fromPage(capture.path) })),
            route: moment.route.map((capture) => ({ key: capture.key, file: capture.file, sha256: capture.sha256, page: fromPage(capture.path) })),
          })),
        })),
        labelled: differences.filter((difference) => difference.criterion !== null),
        unintended: differences.filter((difference) => difference.criterion === null),
      }
      mkdirSync(RECEIPTS, { recursive: true })
      writeFileSync(receiptPath(id, width), `${JSON.stringify(receipt, null, 2)}\n`)
    })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The page
// ─────────────────────────────────────────────────────────────────────────────

const escape = (text: string) => text.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]!)

type Receipt = {
  state: string; title: string; width: number; primaryOwner: string
  endOfRunGallery: { file: string; sha256: string; page: string }
  owners: Array<{ task: string; primary: boolean; receipt: string; provenance: string; route: string
    moments: Array<{ moment: string; gallery: Array<{ key: string; file: string; page: string }>; route: Array<{ key: string; file: string; page: string }> }> }>
  labelled: Array<{ task: string; criterion: string; text: string }>
  unintended: Array<{ task: string; text: string }>
}

function figure(src: string, caption: string, width: number) {
  return `<figure><img src="${escape(src)}" alt="${escape(caption)}" style="width:${width}px"><figcaption>${escape(caption)}</figcaption></figure>`
}

function renderPage(receipts: readonly Receipt[]): string {
  const rows = receipts.map((receipt) => {
    const owners = receipt.owners.map((owner) => {
      const moments = owner.moments.map((moment) => `<div class="moment"><h4>${escape(moment.moment)}</h4><div class="pair">${[
        ...moment.gallery.map((capture) => figure(capture.page, `gallery · ${capture.key}`, receipt.width)),
        ...moment.route.map((capture) => figure(capture.page, `route · ${capture.key}`, receipt.width)),
      ].join('')}</div></div>`).join('')
      return `<section class="owner"><h3>${escape(owner.task)}${owner.primary ? ' (primary)' : ''} · ${escape(owner.route)}</h3><p class="prov">${escape(owner.provenance)} · <code>${escape(owner.receipt)}</code></p>${moments}</section>`
    }).join('')
    const labelled = receipt.labelled.map((difference) => `<li><b>${escape(difference.criterion)}</b> (${escape(difference.task)}): ${escape(difference.text)}</li>`).join('')
    const unintended = receipt.unintended.map((difference) => `<li>${escape(difference.task)}: ${escape(difference.text)}</li>`).join('')
    return `<article id="${escape(receipt.state)}-${receipt.width}" data-state="${escape(receipt.state)}" data-width="${receipt.width}">
<h2>${escape(receipt.title)} <small>?state=${escape(receipt.state)} · ${receipt.width} px · primary owner ${escape(receipt.primaryOwner)}</small></h2>
<div class="pair">${figure(receipt.endOfRunGallery.page, 'gallery state at the end of the run (TASK-115, frozen)', receipt.width)}</div>
${owners}
<h4>Differences labelled with their criterion (${receipt.labelled.length})</h4><ul class="labelled">${labelled}</ul>
<h4>Listed as unintended, for UAT (${receipt.unintended.length})</h4><ul class="unintended">${unintended}</ul>
</article>`
  }).join('\n')
  const index = receipts.map((receipt) => `<a href="#${escape(receipt.state)}-${receipt.width}">${escape(receipt.state)} ${receipt.width}</a>`).join(' · ')
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>A3 end-of-run comparison: 26 gallery states beside their real routes (TASK-115)</title>
<style>body{font:14px/1.4 system-ui,sans-serif;margin:16px;background:#111;color:#eee}a{color:#9cf}article{border-top:1px solid #555;padding:12px 0}.pair{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start}figure{margin:0}img{display:block;border:1px solid #444;height:auto}figcaption{font-size:12px;color:#bbb}.prov{color:#aaa;font-size:12px}h3{margin:8px 0 4px}h4{margin:8px 0 4px}small{color:#aaa;font-weight:normal}</style></head>
<body><h1>A3 end-of-run comparison</h1>
<p>Accepted gallery bec4454 · each of its 26 refinement states beside its real route at 320 and 390 px, with matched data, from each owner’s end-of-run look check. Images are read from the Runner’s evidence store; open this page from a Runner V2 worktree of this project. Every difference is labelled with the criterion that intends it, or listed as unintended for UAT.</p>
<nav>${index}</nav>
${rows}
</body></html>
`
}

test('TASK-AC-495C349983AC comparison page: all 26 accepted gallery states at 320 and 390 beside their real routes, every image loads and every difference is labelled or listed as unintended', async ({ page }) => {
  test.setTimeout(120_000)
  const receipts: Receipt[] = []
  for (const [id] of STATES) {
    for (const { width } of VIEWPORTS) {
      const path = receiptPath(id, width)
      expect(existsSync(path), `${id} ${width}: its case ran and wrote its receipt`).toBe(true)
      receipts.push(JSON.parse(readFileSync(path, 'utf8')) as Receipt)
    }
  }
  expect(new Set(receipts.map((receipt) => receipt.state)).size).toBe(26)
  const html = renderPage(receipts)
  const pagePath = join(COMPARISON, 'index.html')
  mkdirSync(dirname(pagePath), { recursive: true })
  writeFileSync(pagePath, html)
  expect(html).not.toMatch(/\/Users\/|\/home\/|[A-Za-z]:\\\\/)

  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(pathToFileURL(pagePath).href)
  await expect(page.locator('article[data-state]')).toHaveCount(52)
  for (const [id] of STATES) {
    for (const { width } of VIEWPORTS) {
      const article = page.locator(`article[data-state="${id}"][data-width="${width}"]`)
      await expect(article.locator('figcaption', { hasText: /^gallery · / }).first()).toBeAttached()
      await expect(article.locator('figcaption', { hasText: /^route · / }).first()).toBeAttached()
    }
  }
  const images = await page.locator('img').evaluateAll((elements) => elements.map((element) => {
    const image = element as HTMLImageElement
    return { src: image.getAttribute('src'), loaded: image.complete && image.naturalWidth > 0 }
  }))
  expect(images.length).toBeGreaterThan(104)
  await expect.poll(async () => page.locator('img').evaluateAll((elements) => elements.filter((element) => {
    const image = element as HTMLImageElement
    return !(image.complete && image.naturalWidth > 0)
  }).map((element) => element.getAttribute('src'))), { timeout: 60_000 }).toEqual([])
  const labelled = await page.locator('ul.labelled > li').count()
  const unintended = await page.locator('ul.unintended > li').count()
  expect(labelled + unintended).toBe(receipts.reduce((total, receipt) => total + receipt.labelled.length + receipt.unintended.length, 0))
  for (const receipt of receipts) for (const difference of receipt.labelled) expect(difference.criterion).toMatch(/\S/)

  const summary = {
    schema: 'clear-task-115-comparison-page/v1',
    task: 'TASK-115',
    gallery: GALLERY,
    page: 'evidence/refinement/task-115/comparison/index.html',
    pageSha256: createHash('sha256').update(html).digest('hex'),
    states: receipts.length / 2,
    widths: VIEWPORTS.map(({ width }) => width),
    images: images.length,
    labelledDifferences: receipts.reduce((total, receipt) => total + receipt.labelled.length, 0),
    unintendedDifferences: receipts.flatMap((receipt) => receipt.unintended.map((difference) => ({ state: receipt.state, width: receipt.width, ...difference }))),
    primaryOwners: Object.fromEntries(STATES.map(([id]) => [id, PRIMARY[id].task])),
  }
  writeFileSync(join(COMPARISON, 'receipt.json'), `${JSON.stringify(summary, null, 2)}\n`)
})
