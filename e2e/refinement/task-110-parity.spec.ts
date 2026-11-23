import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer, type AddressInfo } from 'node:net'
import { join, relative, resolve } from 'node:path'
import type { Locator, Page, Route } from '@playwright/test'

import { readE2eEnv } from '../../scripts/e2e/env.mjs'
import { resolveObjectStore } from '../../scripts/refinement/lib/references.mjs'
import { CIRCUIT, timedBlock } from '../../src/dev/gallery-refinement-fixtures'
import { CONTRACT_VERSION, sessionSnapshotSchema, type SessionAcceptance, type SessionSnapshot } from '../../src/state/schemas'
import type { BlockProgress } from '../../src/state/workout-progress'
import { makePrescription, makeWorkoutBlock } from '../../src/test/factories'
import { formatBadgesSnapshot } from '../../src/test/format-badges-fixture'
import { fixtureLocation, onboardedProfile } from '../../src/test/user-data-double'
import { installDeterministicCapture } from '../design-0143/fixtures'
import { expect, test as scanned } from '../fixtures'

/**
 * A3 TASK-110 look check (TASK-AC-58FFB5625188): each real route this task
 * wires beside its accepted gallery state (gallery commit bec4454, Round 7),
 * with matched data, at the two approved phone widths, 320 and 390.
 *
 * This task wires the format-only badge and the block's prescription line
 * (TASK-003; owner decision 6) and each live timed row's prescribed load
 * through `liveMovementReadings` (TASK-002, TASK-003) on `/workout`, and the
 * circuit's format-only badge with its rounds on the line under it (round-07
 * S2; `BlockPanel detailLine`). Each is read beside the gallery state that
 * draws the same component from the same block:
 *
 *   · `cards`: the EMOM, AMRAP and For Time cards before Start
 *     (`timedBlock` in `src/dev/gallery-refinement-fixtures.ts`, persisted as
 *     a synthetic session in the gallery's unit);
 *   · `circuit-round`: the circuit's card before its first round (`CIRCUIT`),
 *     before the state's driver is pressed.
 *
 * Every visible word of each part is read from both sides, and so is the
 * layout: every rendered element's box is measured and compared with its
 * counterpart within `LAYOUT_TOLERANCE_PX` (TASK-103's method, as TASK-110
 * keeps it). A difference no criterion intends fails the case; an intended
 * one is labelled with its criterion ID. The gallery states draw the live
 * components, so this task's changes to them show on both sides alike; each
 * receipt lists them against the accepted gallery (`galleryChanges`), each
 * with its criterion, and whether it shows in the state compared.
 *
 * Review (`/review`) has no accepted gallery state in bec4454's refinement
 * states and this task changes nothing Review draws; its badges, lines and
 * loads are read on the real route by `e2e/refinement/task-003.spec.ts`.
 *
 * Captures hold steady run to run (TASK-116's method). Each case writes its
 * receipt to `evidence/refinement/task-110/parity/` and its captures to the
 * Runner's evidence store (outside Git), under this body's folder
 * (`clear-gallery-adoption-v2-20261120/task-110/captures/`), recording each
 * capture's SHA-256 in the receipt. Synthetic and contained: nothing is
 * written to any backend.
 */
const OWNER = '00000000-0000-4000-8000-000000011090'
const PLACE = '00000000-0000-4000-8000-000000011091'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
}
const REPO_ROOT = resolve(import.meta.dirname, '..', '..')
const RECEIPTS = join(REPO_ROOT, 'evidence', 'refinement', 'task-110', 'parity')
/** Captures go to this body's folder in the evidence store. */
const CAPTURE_BODY = 'clear-gallery-adoption-v2-20261120'
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
    if (code !== null) throw new Error(`Synthetic TASK-110 server exited (${code}) before ${origin} was ready`)
    try {
      if ((await fetch(origin)).ok && (await fetch(own)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((settle) => setTimeout(settle, 250))
  }
  throw new Error(`Synthetic TASK-110 origin ${origin} did not start`)
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
          VITE_SUPABASE_URL: 'https://synthetic-task-110.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-task-110-public-placeholder',
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

// ─────────────────────────────────────────────────────────────────────────────
// Matched data: the gallery's own blocks, persisted as a session
// ─────────────────────────────────────────────────────────────────────────────

type Kind = 'emom' | 'amrap' | 'for_time'
const KINDS: readonly Kind[] = ['emom', 'amrap', 'for_time']
/** The blocks the cards and urgency states draw (`LiveFlow`: `timedBlock(kind, { rounds: 4 })`). */
const LIVE_BLOCKS: Readonly<Record<Kind, BlockProgress>> = {
  emom: timedBlock('emom'),
  amrap: timedBlock('amrap'),
  for_time: timedBlock('for_time'),
}
/** The gallery's own sample unit (`PreviewSetLogging`), so the planned loads read alike. */
const GALLERY_UNIT = 'lb' as const
/** The page's clock at entry; held wherever a reading is compared. */
const ENTRY = Date.parse('2026-11-16T09:00:00.000Z')

function persistedBlock(block: BlockProgress) {
  return makeWorkoutBlock({
    structure_type: block.structureType,
    rep_scheme: block.repScheme,
    rounds: block.rounds,
    round_rest_seconds: block.roundRestSeconds,
    timer_type: block.timerType,
    timer_seconds: block.timerSeconds,
    ...(block.ladderTiming ? { ladder_timing: block.ladderTiming } : {}),
    exercises: block.exercises.map(({ prescription: p }) => makePrescription({
      exercise_id: p.exercise_id,
      equipment: p.equipment_used,
      session_function: 'conditioning',
      anchor_relationship: 'neutral',
      modality: p.modality,
      sets: p.sets,
      target_kind: p.target_kind,
      target_value: p.target_value,
      target_min: p.target_min,
      target_max: p.target_max,
      target_sequence: p.target_sequence,
      per_side: p.per_side,
      distance_unit: p.distance_unit,
      rest_seconds: p.rest_seconds,
      tempo: p.tempo,
      load_type: p.load_type ?? 'none',
      load_value: p.load_value,
      is_interval_exercise: p.is_interval_exercise,
      // The gallery row is already one valid prescription; its target fields
      // keep their own discriminant.
    } as Parameters<typeof makePrescription>[0])),
  })
}

type Section = SessionAcceptance['workout']['sections'][number]

const COOLDOWN: Section = {
  section_type: 'cooldown', section_title: 'Cooldown', section_notes: null,
  blocks: [makeWorkoutBlock({ exercises: [makePrescription({ exercise_id: 'burpee', equipment: 'bodyweight', load_type: 'none', load_value: null, sets: 1, target_value: 1 })] })],
}

/** A started session whose sections hold these blocks, as the reads answer it. */
function session(sections: readonly Section[], name: string, mark?: (snapshot: SessionSnapshot) => SessionSnapshot): SessionSnapshot {
  const acceptance: SessionAcceptance = {
    date: '2026-11-16',
    location_id: PLACE,
    session_focus: 'full_body',
    goal_preset: 'balanced',
    requested_duration_mins: 30,
    effective_duration_target_mins: 30,
    computed_duration_mins: null,
    requested_intensity: 5,
    effective_intensity: 5,
    adjustment_reason: null,
    generation_notes: null,
    prompt_version: 'e2e',
    contract_version: CONTRACT_VERSION,
    is_deload: false,
    workout: { title: `TASK-110 parity ${name}`, overview: null, estimated_duration_mins: 30, sections: [...sections] },
  }
  const snapshot = sessionSnapshotSchema.parse(formatBadgesSnapshot(acceptance, { userId: OWNER, startedAt: new Date(ENTRY - 60_000).toISOString() }))
  return mark === undefined ? snapshot : sessionSnapshotSchema.parse(mark(snapshot))
}

/** The conditioning section of the cards and urgency states: their blocks, in their order. */
function liveSession(): SessionSnapshot {
  return session([{ section_type: 'conditioning', section_title: 'Parity', section_notes: null, blocks: KINDS.map((kind) => persistedBlock(LIVE_BLOCKS[kind])) }, COOLDOWN], 'live')
}

/** The circuit-round state's block (`CIRCUIT`, its scene's `CircuitBlock`), persisted as a session. */
function circuitSession(): SessionSnapshot {
  return session([{ section_type: 'conditioning', section_title: 'Conditioning', section_notes: null, blocks: [persistedBlock(CIRCUIT)] }, COOLDOWN], 'circuit')
}

/** The contained synthetic app: reads only; any write fails the case. */
async function syntheticApp(page: Page, snapshot: SessionSnapshot) {
  const unexpected: string[] = []
  const guard = await installDeterministicCapture(page, { skin: 'clear', reducedMotion: true })
  const handler = async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    const name = url.pathname.split('/').at(-1) ?? ''
    const reply = (body: unknown, status = 200) => route.fulfill({ status, headers: CORS, json: body }).catch(() => undefined)
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (url.pathname.startsWith('/functions/v1/')) {
      unexpected.push(`${request.method()} ${url.pathname}`)
      return route.abort('blockedbyclient')
    }
    if (request.method() === 'GET' || request.method() === 'HEAD') {
      if (name === 'profiles') return reply([onboardedProfile({ id: OWNER, goal_preset: 'balanced', weight_unit: GALLERY_UNIT })])
      if (name === 'locations') return reply([fixtureLocation({ id: PLACE, user_id: OWNER, tier: 'full', is_default: true })])
      if (name === 'workout_sessions') return reply([snapshot.session])
      return reply([])
    }
    if (request.method() === 'POST' && url.pathname.includes('/rpc/')) {
      if (name === 'resume_session' || name === 'session_snapshot') return reply(snapshot)
      if (name === 'session_as_performed') {
        return reply({
          reconstruction: 'performed', as_of: snapshot.session.started_at, session: snapshot.session, state: snapshot.state,
          sections: snapshot.sections.map((section) => ({
            ...section,
            blocks: section.blocks.map((block) => ({ ...block, block_result: null, exercises: block.exercises.map((entry) => ({ ...entry, movement_result: null })) })),
          })),
        })
      }
      if (['streak_sessions', 'constraints_in_force', 'anchor_evidence', 'conditioning_history', 'set_load_anchors'].includes(name)) return reply([])
    }
    unexpected.push(`${request.method()} ${url.pathname}`)
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic TASK-110 request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ owner }) => {
    localStorage.setItem('clear.auth.session', JSON.stringify({
      accessToken: 'synthetic-task-110-session', refreshToken: 'synthetic-task-110-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-task-110@example.invalid' },
    }))
  }, { owner: OWNER })
  return {
    assertContained() {
      expect(unexpected, 'Every synthetic API request has an explicit disposition').toEqual([])
      expect(guard.blockedGenerations()).toBe(0)
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Reading, comparing and keeping
// ─────────────────────────────────────────────────────────────────────────────

/** Renders one frame (a screenshot always renders one): pending scroll events and paint land. */
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
  // Entrance and list motion finished, so every word is drawn (loops excepted).
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

/** Captures go beside the Runner's evidence store, outside Git, in this body's folder; else into test-results. */
function captureDir(): { dir: string; identity: string } {
  const store = resolveObjectStore({ cwd: REPO_ROOT })
  if (store.problem === undefined && store.dir !== null) {
    const dir = join(store.dir, CAPTURE_BODY, 'task-110', 'captures')
    return { dir, identity: `store:${CAPTURE_BODY}/task-110/captures` }
  }
  const dir = join(REPO_ROOT, 'test-results', 'task-110-parity')
  return { dir, identity: `repo:${relative(REPO_ROOT, dir)}` }
}

/**
 * Paints an open log's X afresh before its frame is captured (TASK-106's
 * repair): a dialog that opened while its arrival was settling could keep the
 * X's chamfer as first recorded, one corner pixel either way between
 * identical runs. Hiding the X for one rendered frame drops that paint.
 */
async function repaint(target: Locator) {
  const close = target.locator('.clr-logging-overlay__head button[aria-label="Close log"]')
  if (await close.count() !== 1) return
  const page = target.page()
  const focused = await page.evaluateHandle(() => document.activeElement)
  const visibility = await close.evaluate((button) => {
    const style = ((button.closest('.clr-bleed') ?? button) as HTMLElement).style
    const before = style.visibility
    style.visibility = 'hidden'
    return before
  })
  await renderFrame(page)
  await close.evaluate((button, before) => { ((button.closest('.clr-bleed') ?? button) as HTMLElement).style.visibility = before }, visibility)
  await focused.evaluate((element) => {
    if (element instanceof HTMLElement && element.isConnected && element !== document.activeElement) element.focus({ preventScroll: true })
  })
  await focused.dispose()
}

/** The part's image once two screenshots 100 ms apart are identical; a part that never holds still fails the case. */
async function steadyScreenshot(target: Locator): Promise<Buffer> {
  const shot = () => target.screenshot({ caret: 'hide', animations: 'disabled' })
  let previous = await shot()
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await target.page().waitForTimeout(100)
    const next = await shot()
    if (next.equals(previous)) return next
    previous = next
  }
  throw new Error('The captured part never held still for two screenshots in a row.')
}

async function keep(target: Locator, name: string) {
  await target.page().mouse.move(0, 0)
  await repaint(target)
  const bytes = await steadyScreenshot(target)
  await test.info().attach(`${name}.png`, { body: bytes, contentType: 'image/png' })
  const { dir, identity } = captureDir()
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${name}.png`), bytes)
  return { file: `${identity}/${name}.png`, sha256: createHash('sha256').update(bytes).digest('hex') }
}

function writeReceipt(name: string, receipt: Record<string, unknown>) {
  mkdirSync(RECEIPTS, { recursive: true })
  writeFileSync(join(RECEIPTS, `${name}.json`), `${JSON.stringify({ schema: 'clear-task-110-parity/v1', task: 'TASK-110', gallery: 'bec44545eb982f6dc136a583400f7e314c306d1d', ...receipt }, null, 2)}\n`)
}

function expectAllIntended(differences: readonly Difference[], label: string) {
  const unintended = differences.filter((difference) => difference.criterion === null)
  expect(unintended, `${label}: every visible difference is one a criterion intends`).toEqual([])
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout: where each element is drawn, not only what it says
// ─────────────────────────────────────────────────────────────────────────────

/** How far, in CSS px, an element's edge or size may sit from its counterpart's. */
const LAYOUT_TOLERANCE_PX = 2

/** One rendered element's box, in CSS px from its part's top-left corner, scroll included. */
interface Box { readonly key: string; readonly x: number; readonly y: number; readonly width: number; readonly height: number }
interface LayoutDifference {
  readonly key: string
  readonly gallery: Box | null
  readonly route: Box | null
  readonly criterion: string | null
  readonly reason: string | null
}
interface IntendedLayout { readonly criterion: string; readonly reason: string; readonly match: RegExp }

/**
 * Every rendered element of a part (the part itself first), named by its tag,
 * its `clr-` classes and the words it draws and numbered in document order, so
 * the same element is found on both sides whatever wraps the part. A heading
 * is named `h` whatever its level: the level follows the host page's outline
 * (the gallery nests the card one level deeper), not the layout. Elements not
 * drawn (`display: none`, hidden, or no box at all) are left out, and so is a
 * modal dialog the part holds: it is drawn in the top layer against the
 * viewport, not inside the part, and is measured as its own part.
 */
async function boxesOf(target: Locator): Promise<Box[]> {
  return target.evaluate((root) => {
    const origin = root.getBoundingClientRect()
    const rounded = (value: number) => Math.round(value * 10) / 10
    // A scrolled container moves what it holds; measured as drawn unscrolled.
    const scrolled = (element: Element) => {
      let x = 0
      let y = 0
      for (let node = element.parentElement; node !== null && node !== root.parentElement; node = node.parentElement) {
        x += node.scrollLeft
        y += node.scrollTop
      }
      return { x, y }
    }
    const seen = new Map<string, number>()
    const boxes: { key: string; x: number; y: number; width: number; height: number }[] = []
    for (const element of [root, ...root.querySelectorAll('*')]) {
      const modal = element.closest(':modal')
      if (modal !== null && modal !== root && root.contains(modal)) continue
      const style = getComputedStyle(element)
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') continue
      // A disclosure's collapsed region is not drawn (A3 TASK-110: the navigator's closed jump list).
      if (element.closest('.clr-collapsible__region[data-expanded="false"]') !== null && element !== root) continue
      const rect = element.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) continue
      const classes = [...element.classList].filter((name) => name.startsWith('clr-')).sort().map((name) => `.${name}`).join('')
      const words = (element instanceof HTMLElement ? element.innerText : (element.textContent ?? '')).replace(/\s+/g, ' ').trim().slice(0, 80)
      const tag = element.tagName.toLowerCase().replace(/^h[1-6]$/, 'h')
      const name = element === root ? '(part)' : `${tag}${classes}|${words}`
      const index = seen.get(name) ?? 0
      seen.set(name, index + 1)
      const scroll = element === root ? { x: 0, y: 0 } : scrolled(element)
      boxes.push({
        key: `${name}#${index}`,
        x: rounded(rect.left - origin.left + scroll.x),
        y: rounded(rect.top - origin.top + scroll.y),
        width: rounded(rect.width),
        height: rounded(rect.height),
      })
    }
    return boxes
  })
}

/** Each element drawn elsewhere, at another size, or on one side only, labelled if a criterion intends it. */
function compareLayout(gallery: readonly Box[], route: readonly Box[], intended: readonly IntendedLayout[], axes: 'both' | 'vertical' = 'both'): LayoutDifference[] {
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
    const offset = axes === 'vertical'
      ? Math.max(Math.abs(box.y - counterpart.y), Math.abs(box.height - counterpart.height))
      : Math.max(
        Math.abs(box.x - counterpart.x), Math.abs(box.y - counterpart.y),
        Math.abs(box.width - counterpart.width), Math.abs(box.height - counterpart.height),
      )
    if (offset > LAYOUT_TOLERANCE_PX) differences.push(labelled(box.key, box, counterpart))
  }
  for (const box of remaining.values()) differences.push(labelled(box.key, null, box))
  return differences
}

function expectLayoutIntended(differences: readonly LayoutDifference[], label: string) {
  const unintended = differences.filter((difference) => difference.criterion === null)
  expect(unintended, `${label}: every element is drawn where the accepted gallery draws it, within ${LAYOUT_TOLERANCE_PX}px, unless a criterion intends otherwise`).toEqual([])
}

// ─────────────────────────────────────────────────────────────────────────────
// The clocks, their warning and the navigator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Differences a criterion intends between the route and the gallery state:
 * none. Both sides draw the same Round 7 components from the same block, and
 * this task's changes to them show on both sides alike; the tables stay
 * explicit so a future one is labelled rather than waved through.
 */
const INTENDED: readonly Intended[] = []
const LAYOUT_INTENDED: readonly IntendedLayout[] = []

/**
 * This task's changes to gallery-owned files, against the accepted bec4454,
 * each with its criterion and the state (if any) that shows it. Both sides
 * draw them alike, so none is a route-versus-gallery difference; each is a
 * difference from the accepted gallery's own drawing, which the gallery
 * states show in the same commit.
 */
const GALLERY_CHANGES = [
  { file: 'src/ui/block-renderers-frame.tsx', criterion: 'TASK-AC-9A47DF868BD4, TASK-AC-2E6734369AC5', states: ['circuit-round'],
    change: 'BlockPanel takes `detailLine`: the badge names the format alone and the block\'s size it leaves out (rounds, scheme) is read once, on a `clr-timed-meta` line directly under the header (the line Review and the timed flow already draw). Only the circuit asks for it.' },
  { file: 'src/ui/circuit-block.tsx', criterion: 'TASK-AC-2E6734369AC5, TASK-AC-9A47DF868BD4', states: ['circuit-round'],
    change: 'The circuit\'s badge is format-only (`CIRCUIT`, was `CIRCUIT · 3 ROUNDS` outside the product presentation) and its prescribed rounds (`3 ROUNDS`) are read on the line under the header; under the product presentation Round 7 had dropped the rounds from the card before a round was recorded. The circuit-round state\'s card gains that one line.' },
  { file: 'src/ui/timed-workout-flow.tsx', criterion: 'TASK-AC-4BEA11242321, AC-R003-03, TASK-AC-9A47DF868BD4', states: ['cards'],
    change: 'Each live row\'s name, compact equipment and prescribed load are `liveMovementReadings` (the load-guidance read model\'s target through `loadText`), drawn exactly as before. The prescription line carries `data-structure-meta` and, for an EMOM with a rest window, `Ns rest at the end of each minute` after its window; the cards state\'s EMOM prescribes no rest, so its line is unchanged.' },
  { file: 'src/ui/ladder-rungs.tsx', criterion: 'TASK-AC-4BEA11242321', states: [],
    change: 'The live ladder\'s summary line reads its name and load through `liveMovementReadings`, drawn exactly as before. Not in a state compared here.' },
  { file: 'src/ui/workout-chrome.tsx', criterion: 'TASK-AC-2E6734369AC5', states: [],
    change: 'SectionHeader\'s full (non-compact) structure list names each block by its format alone (`StructureBadge formatOnly`). The route and the accepted gallery draw the compact navigator, which has no list; the registry\'s full-header specimen holds no blocks, so nothing drawn changes.' },
] as const

/**
 * The accepted state at the base against this tree (the brief's gallery
 * rule): the state's visible lines as the base's own receipts read them
 * (A3 TASK-108's cards receipts and A3 TASK-107's circuit-round receipts, at
 * 9c9db333), diffed with what this run reads from the same state. The one
 * difference this task intends is labelled with its criterion; any other
 * fails the case.
 */
const BASE_RECEIPTS = { cards: 'evidence/refinement/task-108/parity/cards', 'circuit-round': 'evidence/refinement/task-107/parity/circuit-round' } as const
const BASE_INTENDED: readonly { state: keyof typeof BASE_RECEIPTS; line: string; criterion: string; reason: string }[] = [
  { state: 'circuit-round', line: '3 ROUNDS', criterion: 'TASK-AC-2E6734369AC5, TASK-AC-9A47DF868BD4',
    reason: 'The circuit\'s badge names its format alone, and its prescribed rounds are read on the line under the header.' },
]

function againstBase(state: keyof typeof BASE_RECEIPTS, width: number, moments: Readonly<Record<string, readonly string[]>>, baseMoment: (moment: string) => string) {
  const base = JSON.parse(readFileSync(join(REPO_ROOT, `${BASE_RECEIPTS[state]}-phone-${width}.json`), 'utf8')) as { lines: { gallery: Record<string, string[]> } }
  return Object.fromEntries(Object.entries(moments).map(([moment, lines]) => {
    const was = base.lines.gallery[baseMoment(moment)]
    expect(was, `${state} ${moment}: the base receipt reads this moment`).toBeDefined()
    const label = (side: 'base only' | 'tree only', line: string) => {
      const rule = BASE_INTENDED.find((candidate) => candidate.state === state && candidate.line === line && side === 'tree only')
      return { side, line, criterion: rule?.criterion ?? null, reason: rule?.reason ?? null }
    }
    const found = [
      ...was.filter((line) => !lines.includes(line)).map((line) => label('base only', line)),
      ...lines.filter((line) => !was.includes(line)).map((line) => label('tree only', line)),
    ]
    for (const difference of found) expect(difference.criterion, `${state} ${moment} against the base: ${difference.side} "${difference.line}"`).not.toBeNull()
    return [moment, { base: `${BASE_RECEIPTS[state]}-phone-${width}.json#lines.gallery.${baseMoment(moment)}`, differences: found }]
  }))
}

/** What each side read at one moment. */
interface Reading { readonly lines: string[]; readonly boxes: Box[]; readonly capture: { file: string; sha256: string } | null }

async function read(target: Locator, capture: string | null): Promise<Reading> {
  await expect(target).toBeVisible()
  await target.evaluate((element) => element.scrollIntoView({ block: 'start' }))
  await renderFrame(target.page())
  await settle(target.page())
  const lines = await linesOf(target)
  const boxes = await boxesOf(target)
  return { lines, boxes, capture: capture === null ? null : await keep(target, capture) }
}

interface Compared { readonly differences: Difference[]; readonly layout: LayoutDifference[] }

function compareMoment(gallery: Reading, route: Reading, axes: 'both' | 'vertical' = 'both'): Compared {
  return { differences: compare(gallery.lines, route.lines, INTENDED), layout: compareLayout(gallery.boxes, route.boxes, LAYOUT_INTENDED, axes) }
}

function expectMoments(compared: Readonly<Record<string, Compared>>, label: string) {
  for (const [moment, found] of Object.entries(compared)) {
    expectAllIntended(found.differences, `${moment} @${label}`)
    expectLayoutIntended(found.layout, `${moment} layout @${label}`)
  }
}

function moments(gallery: Readonly<Record<string, Reading>>, route: Readonly<Record<string, Reading>>) {
  return {
    captures: Object.fromEntries(Object.keys(gallery).flatMap((moment) => [
      [`gallery:${moment}`, gallery[moment].capture], [`route:${moment}`, route[moment].capture],
    ])),
    lines: {
      gallery: Object.fromEntries(Object.entries(gallery).map(([moment, reading]) => [moment, reading.lines])),
      route: Object.fromEntries(Object.entries(route).map(([moment, reading]) => [moment, reading.lines])),
    },
  }
}

function layoutReceipt(gallery: Readonly<Record<string, Reading>>, route: Readonly<Record<string, Reading>>, compared: Readonly<Record<string, Compared>>, axes: 'both' | 'vertical' = 'both') {
  const part = (boxes: readonly Box[]) => boxes.find((box) => box.key === '(part)#0') ?? null
  return {
    method: axes === 'both' ? 'element boxes' : 'element boxes, down the page (the part\'s width is its host\'s)',
    tolerancePx: LAYOUT_TOLERANCE_PX,
    measured: {
      gallery: Object.fromEntries(Object.entries(gallery).map(([moment, reading]) => [moment, reading.boxes.length])),
      route: Object.fromEntries(Object.entries(route).map(([moment, reading]) => [moment, reading.boxes.length])),
    },
    parts: {
      gallery: Object.fromEntries(Object.entries(gallery).map(([moment, reading]) => [moment, part(reading.boxes)])),
      route: Object.fromEntries(Object.entries(route).map(([moment, reading]) => [moment, part(reading.boxes)])),
    },
    differences: Object.fromEntries(Object.entries(compared).map(([moment, found]) => [moment, found.layout])),
  }
}

for (const { name, viewport } of VIEWPORTS) {
  test(`TASK-AC-58FFB5625188 cards ${name}: /workout’s EMOM, AMRAP and For Time cards before Start — format-only badges, the prescription line and each prescribed load — match the accepted cards state`, async ({ page, visit }) => {
    test.setTimeout(240_000)
    await page.setViewportSize(viewport)
    const flow = (scope: Locator, kind: Kind) => scope.locator(`.clr-timed-flow[data-timed-format="${kind}"]`)

    // The accepted state: the real flows on the gallery's memory runtime, on the page's clock.
    await installDeterministicCapture(page, { skin: 'clear', reducedMotion: true })
    await page.clock.setFixedTime(ENTRY)
    await visit('/gallery/refinements?state=cards')
    const state = page.locator('[data-refinement-state="cards"]')
    const gallery: Record<string, Reading> = {}
    for (const kind of KINDS) gallery[`${kind}:ready`] = await read(flow(state, kind), `cards-${kind}-${name}-gallery-ready`)

    // The real route, over the same blocks, on the same clock.
    const app = await syntheticApp(page, liveSession())
    await page.clock.setFixedTime(ENTRY)
    await visit('/workout')
    const main = page.locator('main')
    await expect(flow(main, 'emom')).toBeVisible()
    const route: Record<string, Reading> = {}
    for (const kind of KINDS) route[`${kind}:ready`] = await read(flow(main, kind), `cards-${kind}-${name}-route-ready`)
    // What this task wires, read on the route: the badge names the format alone,
    // the window or cap is on the prescription line, and each load is the row's.
    for (const [kind, badge, line] of [['emom', 'EMOM', '10 MIN · N+1'], ['amrap', 'AMRAP', '8 MIN · INVERSE'], ['for_time', 'FOR TIME', '15 MIN CAP']] as const) {
      await expect(flow(main, kind).locator('.clr-movement-group-header__badge')).toHaveText(badge)
      await expect(flow(main, kind).locator('[data-structure-meta]')).toHaveText(line)
    }
    await expect(flow(main, 'emom').locator('[data-movement-detail] > span:nth-child(2)')).toHaveText(['24 lb'])
    await expect(flow(main, 'for_time').locator('[data-movement-detail] > span:nth-child(2)')).toHaveText(['9 lb'])

    const compared = Object.fromEntries(Object.keys(gallery).map((moment) => [moment, compareMoment(gallery[moment], route[moment])]))
    writeReceipt(`cards-${name}`, {
      state: 'cards', width: viewport.width, route: '/workout',
      ...moments(gallery, route),
      differences: Object.fromEntries(Object.entries(compared).map(([moment, found]) => [moment, found.differences])),
      layout: layoutReceipt(gallery, route, compared),
      galleryChanges: GALLERY_CHANGES,
      galleryAgainstBase: againstBase('cards', viewport.width, Object.fromEntries(Object.entries(gallery).map(([moment, reading]) => [moment, reading.lines])), (moment) => moment),
    })
    expectMoments(compared, `cards ${name}`)
    app.assertContained()
  })

  test(`TASK-AC-58FFB5625188 circuit-round ${name}: /workout’s circuit card before its first round — the format-only badge and its rounds on the line under it — matches the accepted circuit-round state`, async ({ page, visit }) => {
    test.setTimeout(240_000)
    await page.setViewportSize(viewport)
    const circuitCard = (scope: Locator) => scope.locator('.clr-card').filter({
      has: page.getByRole('list', { name: 'Movements in this circuit', exact: true }),
    }).first()

    // The accepted state, read before its driver is pressed.
    await installDeterministicCapture(page, { skin: 'clear', reducedMotion: true })
    await page.clock.setFixedTime(ENTRY)
    await visit('/gallery/refinements?state=circuit-round')
    const state = page.locator('[data-refinement-state="circuit-round"]')
    const gallery: Record<string, Reading> = { card: await read(circuitCard(state.locator('[data-gallery-scene]')), `circuit-round-${name}-gallery-card`) }

    // The real route, over the same block.
    const app = await syntheticApp(page, circuitSession())
    await page.clock.setFixedTime(ENTRY)
    await visit('/workout')
    const routeCard = circuitCard(page.locator('main'))
    await expect(routeCard).toBeVisible()
    const route: Record<string, Reading> = { card: await read(routeCard, `circuit-round-${name}-route-card`) }
    await expect(routeCard.locator('.clr-movement-group-header__badge')).toHaveText('CIRCUIT')
    await expect(routeCard.locator('[data-structure-meta]')).toHaveText('3 ROUNDS')

    const compared = { card: compareMoment(gallery.card, route.card) }
    writeReceipt(`circuit-round-${name}`, {
      state: 'circuit-round', width: viewport.width, route: '/workout',
      drive: 'card, before the state\'s driver is pressed (route: before Start round 1)',
      ...moments(gallery, route),
      differences: { card: compared.card.differences },
      layout: layoutReceipt(gallery, route, compared),
      galleryChanges: GALLERY_CHANGES,
      galleryAgainstBase: againstBase('circuit-round', viewport.width, { card: gallery.card.lines }, () => 'card'),
    })
    expectMoments(compared, `circuit-round ${name}`)
    app.assertContained()
  })
}
