import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createServer, type AddressInfo } from 'node:net'
import { join, relative, resolve } from 'node:path'
import type { Locator, Page, Route } from '@playwright/test'

import { readE2eEnv } from '../../scripts/e2e/env.mjs'
import { resolveObjectStore } from '../../scripts/refinement/lib/references.mjs'
import { makeSessionRow } from '../../src/test/factories'
import { fixtureLocation, notOnboardedProfile, onboardedProfile } from '../../src/test/user-data-double'
import { installDeterministicCapture } from '../design-0143/fixtures'
import { expect, test as scanned } from '../fixtures'

/**
 * A3 TASK-113 look check (TASK-AC-426B098BA948): each real route this task
 * re-proves beside its accepted gallery state (gallery commit bec4454,
 * Round 7), with matched data, at the two approved phone widths, 320 and 390.
 *
 *   · `screens` (Setup): `/onboarding` — the real route under the product
 *     presentation, so Round 7's setup head (`clr-setup-header` and
 *     `clr-setup-progress` in Screen's pinned head) — on its equipment step,
 *     with the same equipment ticked as the accepted state (Dumbbells),
 *     beside the accepted state's Setup part. That part is a static
 *     composition in its own sample words (`GalleryGenerateSetupHistory`), so
 *     its elements have no one-for-one counterparts on the route; what both
 *     must draw alike is the pinned hierarchy C52 names, measured from the
 *     drawn boxes: the title, then the step beneath it from the same left
 *     edge, one divider closing the head below the step and spanning it, the
 *     scrolling equipment starting at that divider and nothing in the head
 *     moving while it scrolls, no sticky overlay.
 *   · `errors`: `/summary`'s failed session read — the released `ErrorView`
 *     standalone, with Retry — beside `?state=errors`, the same owner, in each
 *     of the four skins. Both sides draw the one component, so every rendered
 *     element's box is compared one-for-one within `LAYOUT_TOLERANCE_PX`
 *     (named by its tag and `clr-` classes in document order; the words are
 *     compared on their own) and so are the painted roles: frame, accent bar,
 *     emission and glyph.
 *
 * Every visible word is read from both sides; a difference no criterion
 * intends fails the case, and an intended one is labelled with its criterion
 * ID. Each case writes its receipt to `evidence/refinement/task-113/parity/`
 * and its captures beside the Runner's evidence store (outside Git), recording
 * each capture's SHA-256 in the receipt. Synthetic and contained: nothing is
 * written to any backend, and the Setup commit is never sent.
 */
const OWNER = '00000000-0000-4000-8000-000000011301'
const PLACE = '00000000-0000-4000-8000-000000011311'
const SESSION = '00000000-0000-4000-8000-000000011321'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
}
const REPO_ROOT = resolve(import.meta.dirname, '..', '..')
const RECEIPTS = join(REPO_ROOT, 'evidence', 'refinement', 'task-113', 'parity')
const GALLERY_COMMIT = 'bec44545eb982f6dc136a583400f7e314c306d1d'
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
    if (code !== null) throw new Error(`Synthetic TASK-113 server exited (${code}) before ${origin} was ready`)
    try {
      if ((await fetch(origin)).ok && (await fetch(own)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((settle) => setTimeout(settle, 250))
  }
  throw new Error(`Synthetic TASK-113 origin ${origin} did not start`)
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
          VITE_SUPABASE_URL: 'https://synthetic-task-113.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-task-113-public-placeholder',
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
  { name: 'phone-320', viewport: { width: 320, height: 568 } },
  { name: 'phone-390', viewport: { width: 390, height: 844 } },
] as const
const SKINS = ['clear', 'vapour', 'signal', 'mono'] as const
type Skin = (typeof SKINS)[number]

// ─────────────────────────────────────────────────────────────────────────────
// The contained synthetic app
// ─────────────────────────────────────────────────────────────────────────────

const COMPLETED_AT = '2026-11-09T09:31:00.000Z'
const COMPLETED = makeSessionRow({
  id: SESSION, user_id: OWNER, location_id: PLACE, date: '2026-11-09',
  created_at: '2026-11-09T09:00:00.000Z', updated_at: COMPLETED_AT,
  started_at: '2026-11-09T09:00:00.000Z', completed_at: COMPLETED_AT,
  title: 'Synthetic full-body session', session_focus: 'full_body',
  goal_preset: 'balanced', requested_duration_mins: 30, actual_duration_mins: 31,
})

/** Read RPCs the two routes make; each is answered as a read. */
const READ_RPCS = new Set(['resume_session', 'streak_sessions', 'constraints_in_force', 'anchor_evidence', 'conditioning_history', 'session_as_performed'])

interface AppOptions {
  readonly skin: Skin
  /** Not set up yet: the guards send the athlete to /onboarding. */
  readonly onboarded: boolean
  /** Summary's session read (`streak_sessions`, limit 1) fails. */
  readonly sessionFails?: boolean
}

/** Reads only; any write, generation or unexpected request fails the case. */
async function syntheticApp(page: Page, options: AppOptions) {
  const unexpected: string[] = []
  const guard = await installDeterministicCapture(page, { skin: options.skin, reducedMotion: true })
  // Every API answer waits for `release()`, so `visit` scans the steady boot
  // screen rather than a DOM torn while the boot hands over to the route.
  let release: () => void = () => undefined
  const held = new Promise<void>((settle) => { release = settle })
  const handler = async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    const name = url.pathname.split('/').at(-1) ?? ''
    const reply = (body: unknown, status = 200) => route.fulfill({ status, headers: CORS, json: body }).catch(() => undefined)
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    await held
    if (url.pathname.startsWith('/functions/v1/')) {
      unexpected.push(`${request.method()} ${url.pathname}`)
      return route.abort('blockedbyclient')
    }
    if (request.method() === 'GET' || request.method() === 'HEAD') {
      if (name === 'profiles') {
        return reply([options.onboarded
          ? onboardedProfile({ id: OWNER, goal_preset: 'balanced' })
          : notOnboardedProfile({ id: OWNER })])
      }
      if (name === 'locations' && options.onboarded) {
        return reply([fixtureLocation({ id: PLACE, user_id: OWNER, tier: 'full', name: 'Building gym', is_default: true })])
      }
      if (name === 'workout_sessions' && options.onboarded) return reply([COMPLETED])
      return reply([])
    }
    if (request.method() === 'POST' && url.pathname.includes('/rpc/') && READ_RPCS.has(name)) {
      if (name === 'streak_sessions') {
        const body = (request.postDataJSON() ?? {}) as { p_limit?: number }
        if (body.p_limit === 1 && options.sessionFails === true) {
          return reply({ code: 'PGRST000', message: 'Synthetic TASK-113 read failure.' }, 503)
        }
        return reply(options.onboarded ? [{ session_id: SESSION, completed_at: COMPLETED_AT, counts_for_streak: true }] : [])
      }
      if (name === 'resume_session' || name === 'session_as_performed') return reply(null)
      return reply([])
    }
    // Includes complete_onboarding: the Setup commit is never sent here.
    unexpected.push(`${request.method()} ${url.pathname}`)
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic TASK-113 request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ owner }) => {
    localStorage.setItem('clear.auth.session', JSON.stringify({
      accessToken: 'synthetic-task-113-session', refreshToken: 'synthetic-task-113-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-task-113@example.invalid' },
    }))
  }, { owner: OWNER })
  return {
    release,
    assertContained() {
      expect(unexpected, 'Every synthetic API request has an explicit disposition; nothing is written').toEqual([])
      expect(guard.blockedGenerations()).toBe(0)
    },
  }
}

/** The gallery: no account, and no account traffic. */
async function galleryVisit(page: Page, skin: Skin) {
  await installDeterministicCapture(page, { skin, reducedMotion: true })
  const requests: string[] = []
  page.on('request', (request) => {
    if (/\/(rest|auth|functions)\/v1\//.test(request.url())) requests.push(`${request.method()} ${request.url()}`)
  })
  return { requests }
}

// ─────────────────────────────────────────────────────────────────────────────
// Reading, comparing and keeping
// ─────────────────────────────────────────────────────────────────────────────

async function settle(page: Page) {
  await page.evaluate(async () => {
    void document.body.offsetHeight
    await Promise.all([...document.fonts].map((face) => face.load().catch(() => undefined)))
    await document.fonts.ready
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
  })
  // Entrance motion and skin transitions finished, so every word and colour is drawn (loops excepted).
  await page.waitForFunction(() => document.getAnimations()
    .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
    .every((animation) => animation.playState !== 'running'))
}

/** The visible words of a part, line by line, read once they hold still. */
async function linesOf(target: Locator): Promise<string[]> {
  const read = async () => (await target.evaluate((element) => (element as HTMLElement).innerText))
    .split('\n').map((line) => line.replace(/\s+/g, ' ').trim()).filter((line) => line !== '')
  let previous = await read()
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await target.page().waitForTimeout(250)
    const next = await read()
    if (JSON.stringify(next) === JSON.stringify(previous)) return next
    previous = next
  }
  return previous
}

interface Difference { readonly side: 'gallery only' | 'route only'; readonly text: string; readonly criterion: string | null; readonly reason: string | null }
interface Intended { readonly criterion: string; readonly reason: string; readonly side: Difference['side']; readonly match: RegExp }

/** Each line only one side shows, labelled with the criterion that intends it, if any. */
function compare(gallery: readonly string[], route: readonly string[], intended: readonly Intended[]): Difference[] {
  const remaining = [...route]
  const differences: Difference[] = []
  for (const line of gallery) {
    const index = remaining.indexOf(line)
    if (index >= 0) remaining.splice(index, 1)
    else differences.push(label('gallery only', line, intended))
  }
  for (const line of remaining) differences.push(label('route only', line, intended))
  return differences
}

function label(side: Difference['side'], text: string, intended: readonly Intended[]): Difference {
  const rule = intended.find((candidate) => candidate.side === side && candidate.match.test(text))
  return { side, text, criterion: rule?.criterion ?? null, reason: rule?.reason ?? null }
}

function expectAllIntended(differences: readonly Difference[], what: string) {
  const unintended = differences.filter((difference) => difference.criterion === null)
  expect(unintended, `${what}: every visible difference is one a criterion intends`).toEqual([])
}

/** Captures go beside the Runner's evidence store, outside Git; else into test-results. */
function captureDir(): { dir: string; identity: string } {
  const store = resolveObjectStore({ cwd: REPO_ROOT })
  if (store.problem === undefined && store.dir !== null) {
    const dir = join(store.dir, 'clear-gallery-adoption-v2-20261116', 'task-113', 'captures')
    return { dir, identity: 'store:clear-gallery-adoption-v2-20261116/task-113/captures' }
  }
  const dir = join(REPO_ROOT, 'test-results', 'task-113-parity')
  return { dir, identity: `repo:${relative(REPO_ROOT, dir)}` }
}

async function keep(target: Locator, name: string) {
  const bytes = await target.screenshot({ caret: 'hide', animations: 'disabled' })
  await test.info().attach(`${name}.png`, { body: bytes, contentType: 'image/png' })
  const { dir, identity } = captureDir()
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${name}.png`), bytes)
  return { file: `${identity}/${name}.png`, sha256: createHash('sha256').update(bytes).digest('hex') }
}

function writeReceipt(name: string, receipt: Record<string, unknown>) {
  mkdirSync(RECEIPTS, { recursive: true })
  writeFileSync(join(RECEIPTS, `${name}.json`), `${JSON.stringify({ schema: 'clear-task-113-parity/v1', task: 'TASK-113', gallery: GALLERY_COMMIT, ...receipt }, null, 2)}\n`)
}

/** How far, in CSS px, an edge, a size or a position may sit from its counterpart's. */
const LAYOUT_TOLERANCE_PX = 2

// ─────────────────────────────────────────────────────────────────────────────
// Setup: the pinned head's geometry (C52, R24)
// ─────────────────────────────────────────────────────────────────────────────

/** Where a side keeps its pinned head, title, step line and scrolling content. */
interface SetupParts {
  /** The pinned head: what stays put while the content scrolls. */
  readonly head: string
  readonly title: string
  /** The step line: its label, and the progress bar where there is one. */
  readonly step: string
  readonly scroller: string
}

/** The accepted state's static Setup part: a header (label, step line) over a scrolling body. */
const GALLERY_SETUP_PARTS: SetupParts = {
  head: ':scope > header', title: ':scope > header > p.label', step: ':scope > header > p:not(.label)', scroller: ':scope > div',
}
/** The route's Screen: the region's pinned head (Round 7's setup header and progress) over its scroller. */
const ROUTE_SETUP_PARTS: SetupParts = {
  head: ':scope > .clr-scroll-region > .clr-scroll-region__head',
  title: ':scope > .clr-scroll-region > .clr-scroll-region__head > header.clr-setup-header :is(h1, h2, h3, h4, h5, h6)',
  step: ':scope > .clr-scroll-region > .clr-scroll-region__head > .clr-setup-progress > *',
  scroller: ':scope > .clr-scroll-region > .clr-scroll-region__scroller',
}

interface PartBox { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
interface SetupReading {
  readonly boxes: { readonly part: PartBox; readonly head: PartBox; readonly title: PartBox; readonly step: PartBox; readonly scroller: PartBox; readonly equipment: PartBox | null }
  /** Every element of the head (the head included) that draws a horizontal rule, and where. */
  readonly rules: readonly { readonly element: string; readonly edge: 'top' | 'bottom'; readonly y: number; readonly x: number; readonly width: number }[]
  readonly overflowing: boolean
  readonly scrollTop: number
  /** Sticky or fixed elements inside the scrolling content. */
  readonly overlays: number
  /** Ticked equipment, by its visible name. */
  readonly ticked: readonly string[]
  /** How an equipment choice is drawn: a checkbox row, or a pressed chip. */
  readonly equipmentControl: 'checkbox' | 'chip' | null
  readonly equipmentInScroller: boolean
  readonly equipmentInHead: boolean
}

async function readSetup(part: Locator, parts: SetupParts): Promise<SetupReading> {
  return part.evaluate((root, parts) => {
    const origin = root.getBoundingClientRect()
    const rounded = (value: number) => Math.round(value * 10) / 10
    const boxOf = (element: Element) => {
      const rect = element.getBoundingClientRect()
      return { x: rounded(rect.left - origin.left), y: rounded(rect.top - origin.top), width: rounded(rect.width), height: rounded(rect.height) }
    }
    const one = (selector: string) => {
      const found = root.querySelector(selector)
      if (found === null) throw new Error(`Setup part has no ${selector}`)
      return found
    }
    const head = one(parts.head)
    const title = one(parts.title)
    const stepParts = [...root.querySelectorAll(parts.step)]
    if (stepParts.length === 0) throw new Error(`Setup part has no ${parts.step}`)
    const scroller = one(parts.scroller)
    const stepRect = stepParts.map((element) => element.getBoundingClientRect())
    const step = {
      x: rounded(Math.min(...stepRect.map((rect) => rect.left)) - origin.left),
      y: rounded(Math.min(...stepRect.map((rect) => rect.top)) - origin.top),
      width: rounded(Math.max(...stepRect.map((rect) => rect.right)) - Math.min(...stepRect.map((rect) => rect.left))),
      height: rounded(Math.max(...stepRect.map((rect) => rect.bottom)) - Math.min(...stepRect.map((rect) => rect.top))),
    }
    const name = (element: Element) => element === head ? 'head'
      : `${element.tagName.toLowerCase()}${[...element.classList].map((entry) => `.${entry}`).join('')}`
    const rules = [head, ...head.querySelectorAll('*')].flatMap((element) => {
      const style = getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      const edges: { element: string; edge: 'top' | 'bottom'; y: number; x: number; width: number }[] = []
      if (parseFloat(style.borderTopWidth) > 0 && style.borderTopStyle !== 'none') {
        edges.push({ element: name(element), edge: 'top', y: rounded(rect.top - origin.top), x: rounded(rect.left - origin.left), width: rounded(rect.width) })
      }
      if (parseFloat(style.borderBottomWidth) > 0 && style.borderBottomStyle !== 'none') {
        edges.push({ element: name(element), edge: 'bottom', y: rounded(rect.bottom - origin.top), x: rounded(rect.left - origin.left), width: rounded(rect.width) })
      }
      return edges
    })
    // The equipment group: the group whose own label is "Equipment".
    const equipment = [...root.querySelectorAll('fieldset, [role="group"]')].find((group) => {
      const labelledBy = group.getAttribute('aria-labelledby')
      const named = group.getAttribute('aria-label')
        ?? (labelledBy ? document.getElementById(labelledBy)?.textContent : null)
        ?? group.querySelector(':scope > legend')?.textContent
        ?? ''
      return named.trim().toLowerCase() === 'equipment'
    }) ?? null
    // A ticked choice: a checked checkbox (the route's CheckboxGroup) or a pressed chip (the gallery's ChoiceGroup).
    const ticked = equipment === null ? [] : [...equipment.querySelectorAll<HTMLElement>('input[type="checkbox"], [role="checkbox"], [aria-pressed]')]
      .filter((control) => control instanceof HTMLInputElement ? control.checked
        : control.getAttribute('aria-checked') === 'true' || control.getAttribute('aria-pressed') === 'true')
      .map((control) => ((control instanceof HTMLInputElement ? control.labels?.[0]?.textContent : control.textContent)
        ?? control.getAttribute('aria-label') ?? '').replace(/\s+/g, ' ').trim())
    const overlays = [...scroller.querySelectorAll('*')].filter((element) =>
      ['sticky', 'fixed'].includes(getComputedStyle(element).position)).length
    return {
      boxes: { part: boxOf(root), head: boxOf(head), title: boxOf(title), step, scroller: boxOf(scroller), equipment: equipment ? boxOf(equipment) : null },
      rules,
      overflowing: scroller.scrollHeight > scroller.clientHeight + 1,
      scrollTop: scroller.scrollTop,
      overlays,
      ticked,
      equipmentControl: equipment === null ? null
        : equipment.querySelector('input[type="checkbox"], [role="checkbox"]') !== null ? 'checkbox'
          : equipment.querySelector('[aria-pressed]') !== null ? 'chip' : null,
      equipmentInScroller: equipment !== null && scroller.contains(equipment),
      equipmentInHead: equipment !== null && head.contains(equipment),
    }
  }, parts)
}

async function scrollSetupToEnd(part: Locator, parts: SetupParts) {
  await part.evaluate((root, selector) => {
    const scroller = root.querySelector(selector)!
    scroller.scrollTop = scroller.scrollHeight
    scroller.dispatchEvent(new Event('scroll'))
  }, parts.scroller)
}

/** What C52 asks both sides to draw alike, read from a measurement before and after scrolling. */
function setupFacts(top: SetupReading, scrolled: SetupReading) {
  const t = LAYOUT_TOLERANCE_PX
  const { head, title, step, scroller } = top.boxes
  const rule = top.rules.length === 1 ? top.rules[0]! : null
  const still = (key: 'head' | 'title' | 'step') => Math.abs(top.boxes[key].y - scrolled.boxes[key].y) <= 0.5
  return {
    /** The step line starts below the title's last line… */
    stepBeneathTitle: step.y >= title.y + title.height - t,
    /** …from the title's left edge. */
    stepFromTitleEdge: Math.abs(step.x - title.x) <= t,
    /** One divider, and no second rule anywhere in the head. */
    oneDivider: top.rules.length === 1,
    /** That divider closes the head, beneath the step line. */
    dividerClosesHead: rule !== null && rule.edge === 'bottom' && Math.abs(rule.y - (head.y + head.height)) <= t
      && rule.y >= step.y + step.height - t,
    /** It spans the head, edge to edge. */
    dividerSpansHead: rule !== null && Math.abs(rule.x - head.x) <= t && Math.abs(rule.width - head.width) <= t,
    /** The scrolling content starts at the divider. */
    contentStartsAtDivider: rule !== null && Math.abs(scroller.y - rule.y) <= t,
    /** The equipment is in the scrolling content, never in the head. */
    equipmentScrolls: top.equipmentInScroller && !top.equipmentInHead,
    /** Scrolling moves the content only: the title, the step and the divider stay put. */
    headStill: still('head') && still('title') && still('step'),
    /** No bespoke sticky overlay inside the content. */
    noOverlay: top.overlays === 0 && scrolled.overlays === 0,
  }
}

/** The head's spacing, in CSS px: title to step line, and step line to the divider. */
function gapsOf(reading: SetupReading) {
  const { title, step } = reading.boxes
  const rule = reading.rules.at(-1)
  return {
    titleToStep: Math.round((step.y - (title.y + title.height)) * 10) / 10,
    stepToDivider: rule === undefined ? null : Math.round((rule.y - (step.y + step.height)) * 10) / 10,
  }
}

/**
 * The accepted Setup part is a static composition with its own sample words.
 * Each difference below is one the criteria intend; anything else fails.
 */
const SETUP_INTENDED: readonly Intended[] = [
  { side: 'route only', match: /^Set up CLEAR$/i, criterion: 'AC-C52-01',
    reason: 'The pinned title is the screen’s own h1, Set up CLEAR, in Round 7’s setup header (C52, R24); the gallery part is labelled Setup.' },
  { side: 'gallery only', match: /^Setup$/i, criterion: 'AC-C52-01',
    reason: 'The gallery part’s own label in place of the screen title (the route’s title is Set up CLEAR).' },
  { side: 'gallery only', match: /^Step 1 of 5 · Equipment$/i, criterion: 'TASK-AC-A76ECE156C75',
    reason: 'Every onboarding step stays with its own question: the route’s first step is the setup and its equipment, asked by the step card; the pinned step line is the progress’s own name (Step 1 of 5).' },
  { side: 'route only', match: /^Step 1 of 5$/i, criterion: 'AC-C52-01',
    reason: 'The pinned step label, the named progressbar’s visible label (C52; AC-R025-01: no hidden progress).' },
  { side: 'route only', match: /^What’s your gym setup\?$/i, criterion: 'TASK-AC-A76ECE156C75',
    reason: 'The first onboarding step’s own question, its card heading (every onboarding step stays).' },
  { side: 'gallery only', match: /^(Kettlebell|Bench)$/i, criterion: 'TASK-AC-7B8DC9E87617',
    reason: 'Gallery sample options. The route lists the real Setup equipment catalogue (EQUIPMENT): Kettlebells, and no Bench, which is not a Setup equipment ID (the gallery’s own asset note says so).' },
  { side: 'route only', match: /^(Bodyweight|Resistance bands|Foam roller|Kettlebells|Pull-up bar|Barbell|Plyo box|Cable machine|Rowing machine|Assault bike|Battle ropes|Assisted pull-up \/ dip|Leg press|Leg curl \/ extension|Hack squat)$/i, criterion: 'TASK-AC-7B8DC9E87617',
    reason: 'The real Setup equipment catalogue (EQUIPMENT), every choice the step offers; the gallery part shows a three-item sample.' },
  { side: 'route only', match: /^(Next|Skip)$/i, criterion: 'TASK-AC-A76ECE156C75',
    reason: 'The step control in the pinned footer: the onboarding steps stay reachable.' },
]

/**
 * How the equipment choices are drawn. The accepted part draws its sample as
 * chips; Round 7's Onboarding keeps the shipped checkbox rows (U09: a label
 * and Space each toggle a choice once). Intended, and labelled; any other
 * pairing fails.
 */
const EQUIPMENT_CONTROL_INTENDED = {
  gallery: 'chip', route: 'checkbox', criterion: 'TASK-AC-A76ECE156C75',
  reason: 'Every onboarding step stays with its own controls: Round 7’s Onboarding (gallery-owned) keeps the shipped CheckboxGroup for equipment (U09 checkbox activation); the accepted part composes its three-item sample from chips.',
} as const

/** The first step's tier choices and their descriptions, read from the route's own radios. */
async function tierLines(main: Locator): Promise<string[]> {
  const texts = await main.locator('[role="radiogroup"], fieldset').first()
    .evaluate((group) => (group as HTMLElement).innerText)
  return texts.split('\n').map((line) => line.replace(/\s+/g, ' ').trim()).filter((line) => line !== '')
}

for (const { name, viewport } of VIEWPORTS) {
  test(`TASK-AC-426B098BA948 screens ${name}: /onboarding’s Round 7 setup head beside the accepted Setup part — title and step pinned over one divider above the scrolling equipment, every difference one a criterion intends`, async ({ page, visit }) => {
    test.setTimeout(180_000)
    await page.setViewportSize(viewport)

    // The accepted state's Setup part, on its own memory-only page.
    const gallery = await galleryVisit(page, 'clear')
    await visit('/gallery/refinements?state=screens')
    const galleryPart = page.locator('[data-refinement-state="screens"] .clr-accepted-setup')
    await galleryPart.scrollIntoViewIfNeeded()
    await expect(galleryPart).toBeVisible()
    await settle(page)
    const galleryCard = galleryPart.locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " clr-card ")][1]')
    const galleryLines = await linesOf(galleryPart)
    const galleryTop = await readSetup(galleryPart, GALLERY_SETUP_PARTS)
    const galleryCapture = await keep(galleryCard, `screens-${name}-gallery`)
    await scrollSetupToEnd(galleryPart, GALLERY_SETUP_PARTS)
    await settle(page)
    const galleryScrolled = await readSetup(galleryPart, GALLERY_SETUP_PARTS)
    expect(gallery.requests, 'the gallery reads and writes nothing over the network').toEqual([])

    // The real route: a signed-in athlete not set up yet, sent to /onboarding by the guards.
    const app = await syntheticApp(page, { skin: 'clear', onboarded: false })
    await visit('/')
    app.release()
    await expect(page).toHaveURL((url) => url.pathname === '/onboarding')
    const main = page.locator('main')
    await main.getByRole('radio', { name: /^Home gym/ }).click()
    // Matched data: the accepted part's one ticked equipment, Dumbbells.
    const group = main.getByRole('group', { name: 'Equipment' })
    const preset = await group.evaluate((element) => [...element.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')]
      .filter((input) => input.checked)
      .map((input) => (input.labels?.[0]?.textContent ?? input.getAttribute('aria-label') ?? '').replace(/\s+/g, ' ').trim()))
    for (const equipmentName of preset.filter((entry) => entry !== 'Dumbbells')) {
      await group.getByRole('checkbox', { name: equipmentName, exact: true }).click()
    }
    await expect(group.getByRole('checkbox', { checked: true })).toHaveCount(1)
    await expect(group.getByRole('checkbox', { name: 'Dumbbells', exact: true })).toBeChecked()
    await main.evaluate((element) => {
      const scroller = element.querySelector('.clr-scroll-region__scroller')!
      scroller.scrollTop = 0
    })
    await settle(page)
    const routeLines = (await linesOf(main))
    const routeTop = await readSetup(main, ROUTE_SETUP_PARTS)
    const routeCapture = await keep(page.locator('body'), `screens-${name}-route`)
    await scrollSetupToEnd(main, ROUTE_SETUP_PARTS)
    await settle(page)
    const routeScrolled = await readSetup(main, ROUTE_SETUP_PARTS)
    const routeScrolledCapture = await keep(page.locator('body'), `screens-${name}-route-scrolled`)
    const tiers = await tierLines(main)

    const progress = main.getByRole('progressbar', { name: 'Step 1 of 5' })
    await expect(progress).toBeVisible()
    await expect(progress).toHaveAttribute('aria-valuenow', '1')
    await expect(progress).toHaveAttribute('aria-valuemax', '5')

    // The tier choices' own words are the step's, read from the route itself.
    const tierIntended: Intended[] = tiers.map((line) => ({
      side: 'route only', match: new RegExp(`^${line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'), criterion: 'TASK-AC-A76ECE156C75',
      reason: 'The first step’s setup choice and its description, which the equipment depends on (every onboarding step stays).',
    }))
    const intended = [...SETUP_INTENDED, ...tierIntended]
    const differences = compare(galleryLines, routeLines, intended)
    const facts = { gallery: setupFacts(galleryTop, galleryScrolled), route: setupFacts(routeTop, routeScrolled) }
    const controlDifference = galleryTop.equipmentControl === routeTop.equipmentControl ? null
      : galleryTop.equipmentControl === EQUIPMENT_CONTROL_INTENDED.gallery && routeTop.equipmentControl === EQUIPMENT_CONTROL_INTENDED.route
        ? { criterion: EQUIPMENT_CONTROL_INTENDED.criterion, reason: EQUIPMENT_CONTROL_INTENDED.reason }
        : { criterion: null, reason: null }
    writeReceipt(`screens-${name}`, {
      state: 'screens', part: 'Setup', width: viewport.width, route: '/onboarding',
      captures: { gallery: galleryCapture, route: routeCapture, routeScrolled: routeScrolledCapture },
      lines: { gallery: galleryLines, route: routeLines },
      differences,
      ticked: { gallery: galleryTop.ticked, route: routeTop.ticked },
      equipmentControl: { gallery: galleryTop.equipmentControl, route: routeTop.equipmentControl, difference: controlDifference },
      layout: {
        method: 'pinned head geometry',
        reason: 'The accepted screens state draws Setup as a static composition in its own words (labelled above), so its elements have no one-for-one counterparts on the route; both sides must draw the pinned hierarchy C52 names.',
        tolerancePx: LAYOUT_TOLERANCE_PX,
        facts,
        // Recorded, not compared: the static part's spacing is its own, and the
        // route's is Round 7's setup head (clr-setup-progress's padding).
        gaps: { gallery: gapsOf(galleryTop), route: gapsOf(routeTop) },
        gallery: { top: galleryTop, scrolled: galleryScrolled },
        route: { top: routeTop, scrolled: routeScrolled },
      },
    })
    expectAllIntended(differences, `screens Setup @${name}`)
    expect(routeTop.ticked, 'matched data: the same equipment ticked').toEqual(galleryTop.ticked)
    expect(routeTop.equipmentControl, 'the route draws its equipment choices').not.toBeNull()
    expect(controlDifference?.criterion, `screens Setup @${name}: the equipment controls are alike or differ only as a criterion intends`).not.toBeNull()
    expect(facts.route, `screens Setup layout @${name}: the route draws the accepted pinned head`).toEqual(facts.gallery)
    expect(facts.gallery, `screens Setup layout @${name}: the accepted pinned head, as measured`).toEqual({
      stepBeneathTitle: true, stepFromTitleEdge: true, oneDivider: true, dividerClosesHead: true, dividerSpansHead: true,
      contentStartsAtDivider: true, equipmentScrolls: true, headStill: true, noOverlay: true,
    })
    // The route's equipment overflows the phone and really scrolled under the still head.
    expect(routeTop.overflowing, 'the equipment step overflows the phone').toBe(true)
    expect(routeScrolled.scrollTop, 'the equipment scrolled').toBeGreaterThan(0)
    app.assertContained()
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Errors: the released ErrorView, one-for-one (C55, R22)
// ─────────────────────────────────────────────────────────────────────────────

/** One rendered element's box, in CSS px from its part's top-left corner. */
interface Box { readonly key: string; readonly x: number; readonly y: number; readonly width: number; readonly height: number }
interface LayoutDifference { readonly key: string; readonly gallery: Box | null; readonly route: Box | null; readonly criterion: string | null; readonly reason: string | null }
interface IntendedLayout { readonly criterion: string; readonly reason: string; readonly match: RegExp }

/**
 * Every rendered element of a part (the part first), named by its tag and its
 * `clr-` classes and numbered in document order. The words are left out of the
 * name: both sides draw the one ErrorView, and its words are compared apart.
 */
async function structureOf(target: Locator): Promise<Box[]> {
  return target.evaluate((root) => {
    const origin = root.getBoundingClientRect()
    const rounded = (value: number) => Math.round(value * 10) / 10
    const seen = new Map<string, number>()
    const boxes: { key: string; x: number; y: number; width: number; height: number }[] = []
    for (const element of [root, ...root.querySelectorAll('*')]) {
      const style = getComputedStyle(element)
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') continue
      const rect = element.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) continue
      const classes = [...element.classList].filter((name) => name.startsWith('clr-')).sort().map((name) => `.${name}`).join('')
      const name = element === root ? '(part)' : `${element.tagName.toLowerCase()}${classes}`
      const index = seen.get(name) ?? 0
      seen.set(name, index + 1)
      boxes.push({ key: `${name}#${index}`, x: rounded(rect.left - origin.left), y: rounded(rect.top - origin.top), width: rounded(rect.width), height: rounded(rect.height) })
    }
    return boxes
  })
}

function compareLayout(gallery: readonly Box[], route: readonly Box[], intended: readonly IntendedLayout[]): LayoutDifference[] {
  const remaining = new Map(route.map((box) => [box.key, box]))
  const differences: LayoutDifference[] = []
  const labelled = (key: string, galleryBox: Box | null, routeBox: Box | null): LayoutDifference => {
    const rule = intended.find((candidate) => candidate.match.test(key))
    return { key, gallery: galleryBox, route: routeBox, criterion: rule?.criterion ?? null, reason: rule?.reason ?? null }
  }
  for (const box of gallery) {
    const counterpart = remaining.get(box.key)
    remaining.delete(box.key)
    if (counterpart === undefined) {
      differences.push(labelled(box.key, box, null))
      continue
    }
    const offset = Math.max(
      Math.abs(box.x - counterpart.x), Math.abs(box.y - counterpart.y),
      Math.abs(box.width - counterpart.width), Math.abs(box.height - counterpart.height),
    )
    if (offset > LAYOUT_TOLERANCE_PX) differences.push(labelled(box.key, box, counterpart))
  }
  for (const box of remaining.values()) differences.push(labelled(box.key, null, box))
  return differences
}

/** `M12 2.5L23 21.5H1L12 2.5Z…` is the AlertTriangle outline in the 0.14.3 icon set. */
const ALERT_TRIANGLE = 'M12 2.5L23 21.5H1L12 2.5Z'

/** The painted roles of a standalone alert (PR611's reading): RGBA through a canvas pixel. */
function readPaints(alert: Locator) {
  return alert.evaluate((root, outline) => {
    const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!
    context.globalCompositeOperation = 'copy'
    const pixel = (color: string) => {
      context.fillStyle = 'rgba(0, 0, 0, 0)'
      context.fillStyle = color
      context.fillRect(0, 0, 1, 1)
      return Array.from(context.getImageData(0, 0, 1, 1).data)
    }
    const shadowColor = (shadow: string, index: number) =>
      shadow.split(/,(?![^(]*\))/)[index]!.trim().match(/^[a-z-]+\([^)]*\)|^#[0-9a-f]+|^[a-z]+/i)![0]
    const resolved = (host: Element, value: string) => {
      const probe = document.createElement('span')
      probe.style.color = value
      host.appendChild(probe)
      const color = getComputedStyle(probe).color
      probe.remove()
      return pixel(color)
    }
    const body = root.querySelector('.clr-card__body')!
    const bar = root.querySelector('.clr-card__bar')!
    const bleed = root.querySelector('.clr-bleed')!
    const shadow = getComputedStyle(bar).boxShadow
    const glyph = [...root.querySelectorAll('svg path')].find((path) => path.getAttribute('d')?.startsWith(outline))
    const iconHost = glyph?.closest('svg')?.parentElement
    return {
      frame: pixel(getComputedStyle(body, '::after').backgroundColor),
      bar: pixel(shadowColor(shadow, 0)),
      barTint: pixel(shadowColor(shadow, 1)),
      emission: resolved(bleed, 'var(--bleed)'),
      surface: pixel(getComputedStyle(body).backgroundColor),
      icon: iconHost ? pixel(getComputedStyle(iconHost).color) : null,
      errorRole: resolved(root.parentElement!, 'var(--border-toast-negative)'),
      errorIcon: resolved(root.parentElement!, 'var(--icon-toast-negative)'),
    }
  }, ALERT_TRIANGLE)
}

type Paints = Awaited<ReturnType<typeof readPaints>>

/** Each painted role that differs between the two sides by more than two levels in any channel. */
function comparePaints(gallery: Paints, route: Paints) {
  const near = (a: readonly number[] | null, b: readonly number[] | null) =>
    a !== null && b !== null && a.every((value, index) => Math.abs(value - b[index]!) <= 2)
  return (Object.keys(gallery) as (keyof Paints)[])
    .filter((role) => !near(gallery[role], route[role]))
    .map((role) => ({ role, gallery: gallery[role], route: route[role] }))
}

const SUMMARY_FAILURE_TITLE = 'That session didn’t load'
/**
 * Both sides draw the one released ErrorView; its words differ only where the
 * route says what it actually met. Anything else fails.
 */
const ERRORS_INTENDED: readonly Intended[] = [
  { side: 'gallery only', match: /^Request failed$/i, criterion: 'AC-R028-01',
    reason: 'The owner’s default title on the gallery sample. A real route names what failed (ErrorView: “never Oops”), here Summary’s session read; the error/retry meaning is kept, not weakened.' },
  { side: 'route only', match: /^That session didn’t load$/i, criterion: 'AC-R028-01',
    reason: 'Summary’s own title for its failed session read, passed to the one shared ErrorView.' },
  { side: 'gallery only', match: /^Request timed out\. Try again\.$/, criterion: 'TASK-AC-7B8DC9E87617',
    reason: 'The gallery’s sample failure (NETWORK_TIMEOUT). Real data only: the route says the failure it actually met — the read answered 503, a server error — and no route read produces a timeout to match.' },
  { side: 'route only', match: /^Server error\. Try again later\.$/, criterion: 'TASK-AC-7B8DC9E87617',
    reason: 'The real failure’s own message (NETWORK_SERVER_ERROR for the 503 the read met).' },
]
/** Layout differences a criterion intends on the error card: none — it is one component. */
const ERRORS_LAYOUT_INTENDED: readonly IntendedLayout[] = []

for (const skin of SKINS) {
  for (const { name, viewport } of VIEWPORTS) {
    test(`TASK-AC-426B098BA948 errors ${skin} ${name}: /summary’s failed read draws the released ErrorView where and as the accepted errors state does — frame, accent bar, emission, glyph and Retry`, async ({ page, visit }) => {
      test.setTimeout(120_000)
      await page.setViewportSize(viewport)

      const gallery = await galleryVisit(page, skin)
      await visit('/gallery/refinements?state=errors')
      const galleryAlert = page.locator('[data-refinement-state="errors"] [role="alert"]')
      await expect(galleryAlert).toHaveCount(1)
      await expect(galleryAlert.getByRole('button')).toHaveText(['Retry'])
      await expect(page.locator('html')).toHaveAttribute('data-skin', skin)
      await settle(page)
      const galleryLines = await linesOf(galleryAlert)
      const galleryBoxes = await structureOf(galleryAlert)
      const galleryPaints = await readPaints(galleryAlert)
      const galleryCapture = await keep(galleryAlert, `errors-${skin}-${name}-gallery`)
      expect(gallery.requests, 'the gallery reads and writes nothing over the network').toEqual([])

      const app = await syntheticApp(page, { skin, onboarded: true, sessionFails: true })
      await visit('/summary')
      app.release()
      const routeAlert = page.getByRole('alert').filter({ hasText: SUMMARY_FAILURE_TITLE })
      await expect(routeAlert).toBeVisible()
      await expect(routeAlert.getByRole('button')).toHaveText(['Retry'])
      await expect(page.locator('html')).toHaveAttribute('data-skin', skin)
      await settle(page)
      const routeLines = await linesOf(routeAlert)
      const routeBoxes = await structureOf(routeAlert)
      const routePaints = await readPaints(routeAlert)
      const routeCapture = await keep(routeAlert, `errors-${skin}-${name}-route`)

      const differences = compare(galleryLines, routeLines, ERRORS_INTENDED)
      const layout = compareLayout(galleryBoxes, routeBoxes, ERRORS_LAYOUT_INTENDED)
      const paints = comparePaints(galleryPaints, routePaints)
      const part = (boxes: readonly Box[]) => boxes.find((box) => box.key === '(part)#0') ?? null
      writeReceipt(`errors-${skin}-${name}`, {
        state: 'errors', skin, width: viewport.width, route: '/summary',
        captures: { gallery: galleryCapture, route: routeCapture },
        lines: { gallery: galleryLines, route: routeLines },
        differences,
        layout: {
          method: 'element boxes',
          tolerancePx: LAYOUT_TOLERANCE_PX,
          measured: { gallery: galleryBoxes.length, route: routeBoxes.length },
          parts: { gallery: part(galleryBoxes), route: part(routeBoxes) },
          differences: layout,
        },
        paints: { gallery: galleryPaints, route: routePaints, differences: paints },
      })
      expectAllIntended(differences, `errors ${skin} @${name}`)
      expect(layout.filter((difference) => difference.criterion === null),
        `errors ${skin} layout @${name}: every element is drawn where the accepted state draws it, within ${LAYOUT_TOLERANCE_PX}px`).toEqual([])
      expect(paints, `errors ${skin} @${name}: frame, accent bar, emission, surface and glyph paint as the accepted state does`).toEqual([])
      // Both paint the one error role (C55), distinct from nothing else drawn.
      for (const [side, reading] of [['gallery', galleryPaints], ['route', routePaints]] as const) {
        for (const role of ['frame', 'bar', 'emission'] as const) {
          expect(reading[role].slice(0, 3), `${side} ${role} is the error role (${skin})`).toEqual(reading.errorRole.slice(0, 3))
        }
        expect(reading.icon?.slice(0, 3), `${side} glyph is the error icon role (${skin})`).toEqual(reading.errorIcon.slice(0, 3))
      }
      app.assertContained()
    })
  }
}
