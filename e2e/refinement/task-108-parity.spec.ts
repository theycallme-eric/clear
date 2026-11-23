import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createServer, type AddressInfo } from 'node:net'
import { join, relative, resolve } from 'node:path'
import type { Locator, Page, Route } from '@playwright/test'

import { readE2eEnv } from '../../scripts/e2e/env.mjs'
import { resolveObjectStore } from '../../scripts/refinement/lib/references.mjs'
import { timedBlock } from '../../src/dev/gallery-refinement-fixtures'
import { CONTRACT_VERSION, sessionSnapshotSchema, type SessionAcceptance, type SessionSnapshot } from '../../src/state/schemas'
import type { BlockProgress } from '../../src/state/workout-progress'
import { makePrescription, makeWorkoutBlock } from '../../src/test/factories'
import { formatBadgesSnapshot } from '../../src/test/format-badges-fixture'
import { fixtureLocation, onboardedProfile } from '../../src/test/user-data-double'
import { installDeterministicCapture } from '../design-0143/fixtures'
import { expect, test as scanned } from '../fixtures'

/**
 * A3 TASK-108 look check (TASK-AC-244B4516A858): each real route this task
 * wires beside its accepted gallery state (gallery commit bec4454, Round 7),
 * with matched data, at the two approved phone widths, 320 and 390.
 *
 * The route this task wires is `/workout`'s chrome and clocks: each timed
 * block's clock, one whole TimerFrame beside its card, and its countdown
 * warning (TASK-007, TASK-008), and the compact section navigator (TASK-027).
 * Each is read beside the gallery state that draws the same component from
 * the same block (`timedBlock` in `src/dev/gallery-refinement-fixtures.ts`,
 * persisted as a synthetic session in the gallery's unit):
 *
 *   · `cards`: the EMOM, AMRAP and For Time cards before Start and running
 *     twenty seconds in (each clock's frame beside its card);
 *   · `urgency`: the state's own moments — an EMOM minute with ten seconds
 *     left (the low colour) and with five (the breathe and the one edge), and
 *     a For Time race five seconds before its cap — with the page's clock
 *     held, so both sides read the same second;
 *   · `emom`, `amrap`, `for_time`: the card behind its "Log results" dialog
 *     once the attempt has run past its cap (each clock at its end; the
 *     race's "Cap reached" in its outcome colour);
 *   · the compact navigator: the route's `SectionHeader` bar beside the
 *     accepted gallery's own specimen of it
 *     (`/gallery/app?component=SectionHeader`, `GallerySectionHeader`), closed
 *     and open, over matched sections; its width is its host's, so its layout
 *     is compared down the page only.
 *
 * The workout header (title, session clock, menu) has no accepted gallery
 * state (bec4454's refinement states draw none); it is captured on the route
 * at both widths and labelled as such. Every visible word of each moment is
 * read from both sides, and so is the layout: every rendered element's box is
 * measured and compared with its counterpart within `LAYOUT_TOLERANCE_PX`
 * (TASK-103's method, as TASK-116 and TASK-108 keep it). A difference no
 * criterion intends fails the case; an intended one is labelled with its
 * criterion ID. The gallery states draw the live components, so this task's
 * changes to them show on both sides alike; each receipt lists those changes
 * against the accepted gallery (`galleryChanges`), each with its criterion.
 *
 * Captures hold steady run to run (TASK-116's method): reduced motion holds
 * the warning still, the page's clock is held, each part is scrolled into
 * view, the pointer is moved off the controls and a part is captured once two
 * screenshots in a row are identical. Each case writes its receipt to
 * `evidence/refinement/task-108/parity/` and its captures to the Runner's
 * evidence store (outside Git), under this body's folder
 * (`clear-gallery-adoption-v2-20261120/task-108/captures/`), recording each
 * capture's SHA-256 in the receipt. Synthetic and contained: nothing is
 * written to any backend.
 */
const OWNER = '00000000-0000-4000-8000-000000010890'
const PLACE = '00000000-0000-4000-8000-000000010891'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
}
const REPO_ROOT = resolve(import.meta.dirname, '..', '..')
const RECEIPTS = join(REPO_ROOT, 'evidence', 'refinement', 'task-108', 'parity')
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
    if (code !== null) throw new Error(`Synthetic TASK-108 server exited (${code}) before ${origin} was ready`)
    try {
      if ((await fetch(origin)).ok && (await fetch(own)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((settle) => setTimeout(settle, 250))
  }
  throw new Error(`Synthetic TASK-108 origin ${origin} did not start`)
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
          VITE_SUPABASE_URL: 'https://synthetic-task-108.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-task-108-public-placeholder',
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
/** The blocks the emom, amrap and for_time states draw (`sceneFor` in `gallery-refinement-forms.tsx`). */
const LOG_BLOCKS: Readonly<Record<Kind, BlockProgress>> = {
  emom: timedBlock('emom'),
  amrap: timedBlock('amrap', { multi: true }),
  for_time: timedBlock('for_time', { multi: true }),
}
const OPEN: Readonly<Record<Kind, string>> = {
  emom: 'Open EMOM results', amrap: 'Open AMRAP results', for_time: 'Open For Time results',
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

const WARM_UP: Section = {
  section_type: 'warmup', section_title: 'Warm-up', section_notes: null,
  blocks: [makeWorkoutBlock({ exercises: [makePrescription({ exercise_id: 'air-squat', equipment: 'bodyweight', load_type: 'none', load_value: null, sets: 1, target_value: 10 })] })],
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
    workout: { title: `TASK-108 parity ${name}`, overview: null, estimated_duration_mins: 30, sections: [...sections] },
  }
  const snapshot = sessionSnapshotSchema.parse(formatBadgesSnapshot(acceptance, { userId: OWNER, startedAt: new Date(ENTRY - 60_000).toISOString() }))
  return mark === undefined ? snapshot : sessionSnapshotSchema.parse(mark(snapshot))
}

/** The conditioning section of the cards and urgency states: their blocks, in their order. */
function liveSession(): SessionSnapshot {
  return session([{ section_type: 'conditioning', section_title: 'Parity', section_notes: null, blocks: KINDS.map((kind) => persistedBlock(LIVE_BLOCKS[kind])) }, COOLDOWN], 'live')
}

function logSession(kind: Kind): SessionSnapshot {
  return session([{ section_type: 'conditioning', section_title: 'Parity', section_notes: null, blocks: [persistedBlock(LOG_BLOCKS[kind])] }, COOLDOWN], kind)
}

/**
 * The navigator's sections as the gallery's specimen holds them: a finished
 * Warm-up, a Conditioning section under way (its first movement done) and an
 * untouched Cooldown.
 */
function navigatorSession(): SessionSnapshot {
  return session([WARM_UP, { section_type: 'conditioning', section_title: 'Parity', section_notes: null, blocks: [persistedBlock(LOG_BLOCKS.amrap)] }, COOLDOWN], 'navigator', (snapshot) => {
    const done = (entry: SessionSnapshot['sections'][number]['blocks'][number]['exercises'][number]) => ({ ...entry, exercise: { ...entry.exercise, execution_status: 'completed' as const } })
    const [warmup, conditioning, ...rest] = snapshot.sections
    return {
      ...snapshot,
      sections: [
        { ...warmup, blocks: warmup.blocks.map((block) => ({ ...block, exercises: block.exercises.map(done) })) },
        { ...conditioning, blocks: conditioning.blocks.map((block) => ({ ...block, exercises: block.exercises.map((entry, index) => index === 0 ? done(entry) : entry) })) },
        ...rest,
      ],
    }
  })
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
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic TASK-108 request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ owner }) => {
    localStorage.setItem('clear.auth.session', JSON.stringify({
      accessToken: 'synthetic-task-108-session', refreshToken: 'synthetic-task-108-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-task-108@example.invalid' },
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
    const dir = join(store.dir, CAPTURE_BODY, 'task-108', 'captures')
    return { dir, identity: `store:${CAPTURE_BODY}/task-108/captures` }
  }
  const dir = join(REPO_ROOT, 'test-results', 'task-108-parity')
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
  writeFileSync(join(RECEIPTS, `${name}.json`), `${JSON.stringify({ schema: 'clear-task-108-parity/v1', task: 'TASK-108', gallery: 'bec44545eb982f6dc136a583400f7e314c306d1d', ...receipt }, null, 2)}\n`)
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
      // A disclosure's collapsed region is not drawn (A3 TASK-108: the navigator's closed jump list).
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
 * each with its criterion. Both sides draw them alike, so none is a
 * route-versus-gallery difference; each is a difference from the accepted
 * gallery's own drawing, which the gallery states show in the same commit.
 */
const GALLERY_CHANGES = [
  { file: 'src/ui/countdown-urgency.tsx', criterion: 'AC-R008-02',
    change: 'Every urgent timer and the one aura share one warning loop and one phase: each urgent clock claims the view\'s one urgent loop, every urgent timer breathes while any claim runs (bec4454 stilled a second urgent timer), the first draws the one edge, and each new breathe is pinned to the document timeline\'s epoch. Fed by each clock\'s deadline adapter.' },
  { file: 'src/ui/countdown-urgency.css', criterion: 'AC-R008-01',
    change: 'The urgent timer breathes on the edge\'s own rule — the same keyframes, 1.5 s period and easing (.2/.8/.2), a steady .5 when still or under reduced motion — in place of the shipped four-second stepped micro-pulse on the timer. The urgency state\'s urgent clock breathes with its edge; under reduced motion both hold .5.' },
  { file: 'src/ui/workout-chrome.tsx', criterion: 'TASK-AC-ED9D1944F3CE',
    change: 'TimerFrame carries the breathe on its `role="timer"` element (`clr-countdown-breathe`, `data-urgent`, the warning loop) in place of `clr-pulse-micro` on its wrapper; CountdownBar and RestTimerBar read the rest\'s deadline (`restDeadline`): the low colour, the fill\'s colour and "Final 10 seconds" from ten seconds, the breathe on the rest\'s timer (not the card) and the edge from five.' },
  { file: 'src/ui/workout-chrome.tsx', criterion: 'TASK-AC-A5D62CC0272B',
    change: 'The compact SectionHeader reads "Section N / M · status" to assistive technology, visually hidden, and its visible "N / M" is decoration of the trigger (`aria-hidden`), so the trigger\'s one name is "All sections". Nothing drawn changes.' },
  { file: 'src/ui/timed-workout-flow.tsx', criterion: 'TASK-AC-ED9D1944F3CE',
    change: 'Each format clock\'s warning reads its adapter (EMOM minute, AMRAP window, race cap): held while paused, none once ended. The low colour at ten and the edge at five are as before; the breathe is the change above.' },
  { file: 'src/ui/circuit-block.tsx', criterion: 'TASK-AC-23D0ADE293F8',
    change: 'The circuit\'s round rest is one whole TimerFrame (the app\'s Card in the timer role) fed by `circuitRestDeadline`, in place of the package\'s TimerDisplay whose stepped micro-pulse ran through the last ten seconds. No state compared here draws a circuit; the circuit-round state shows it in the same commit.' },
  { file: 'src/ui/ladder-block.tsx', criterion: 'TASK-AC-23D0ADE293F8',
    change: 'A scheduled ladder\'s interval countdown is one whole TimerFrame fed by `scheduleIntervalDeadline`. No accepted state draws a schedule.' },
  { file: 'src/ui/movement-countdown.tsx', criterion: 'TASK-AC-ED9D1944F3CE',
    change: 'The movement countdown reads `movementCountdownDeadline`; its warning is unchanged but for the breathe above.' },
  { file: 'src/ui/timer-display.tsx', criterion: 'TASK-AC-ED9D1944F3CE',
    change: 'CountdownDisplay takes an optional deadline from its consumer; its drawing is unchanged (the route no longer draws it).' },
  { file: 'src/state/countdown-urgency.ts', criterion: 'TASK-AC-ED9D1944F3CE',
    change: 'The adapters read only the fields of a view they need, so the route\'s flow feeds its attempt through them. Nothing drawn changes.' },
  { file: 'src/app/Workout.tsx', criterion: 'TASK-AC-DCFC4C79B85A',
    change: 'Previous, Next and a jump move focus to the opened section\'s first card with a temporary tabindex, falling back to its heading. Not a gallery state.' },
  { file: 'src/ui/workout-navigation.css', criterion: 'TASK-AC-8E1E91D4F4AA',
    change: 'TASK-007\'s one-row header: the cluster never wraps to a second line; the title gives up width first and, at 23.75rem and below, takes the h3 size on the same line height. No accepted state draws the workout header.' },
] as const

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

/** Every warning on the page: the one edge, and the clocks breathing or low. */
async function warnings(page: Page) {
  return page.evaluate(() => ({
    edges: document.querySelectorAll('[data-countdown-edge]').length,
    breathing: [...document.querySelectorAll('.clr-countdown-breathe[data-urgent="true"]')].map((node) => node.getAttribute('aria-label')),
    low: [...document.querySelectorAll('[role="timer"]')].filter((timer) => (timer.matches('.clr-chamfer') ? timer : timer.closest('.clr-chamfer'))?.classList.contains('clr-chamfer--timer-low')).map((timer) => timer.getAttribute('aria-label')),
    microPulse: document.querySelectorAll('.clr-pulse-micro').length,
  }))
}

/**
 * The page's wall clock, fixed: `Date.now` reads `at` while every timer and
 * frame keeps running (Playwright's `setFixedTime`), so both sides read the
 * same second and a held page still paints.
 */
async function holdAt(page: Page, at: number) {
  await page.clock.setFixedTime(at)
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  // A repaint interval or two (500 ms each) re-reads every clock.
  await page.waitForTimeout(1_100)
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
  test(`TASK-AC-244B4516A858 cards ${name}: /workout’s EMOM, AMRAP and For Time clocks, before Start and running, match the accepted cards state`, async ({ page, visit }) => {
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
    for (const kind of KINDS) await flow(state, kind).getByRole('button', { name: /^Start / }).click()
    await holdAt(page, ENTRY + 20_000)
    for (const kind of KINDS) gallery[`${kind}:running`] = await read(flow(state, kind), `cards-${kind}-${name}-gallery-running`)

    // The real route, over the same blocks, on the same clock.
    const app = await syntheticApp(page, liveSession())
    await page.clock.setFixedTime(ENTRY)
    await visit('/workout')
    const main = page.locator('main')
    await expect(flow(main, 'emom')).toBeVisible()
    const route: Record<string, Reading> = {}
    for (const kind of KINDS) route[`${kind}:ready`] = await read(flow(main, kind), `cards-${kind}-${name}-route-ready`)
    for (const kind of KINDS) await flow(main, kind).getByRole('button', { name: /^Start / }).click()
    await holdAt(page, ENTRY + 20_000)
    for (const kind of KINDS) route[`${kind}:running`] = await read(flow(main, kind), `cards-${kind}-${name}-route-running`)

    const compared = Object.fromEntries(Object.keys(gallery).map((moment) => [moment, compareMoment(gallery[moment], route[moment])]))
    writeReceipt(`cards-${name}`, {
      state: 'cards', width: viewport.width, route: '/workout',
      ...moments(gallery, route),
      differences: Object.fromEntries(Object.entries(compared).map(([moment, found]) => [moment, found.differences])),
      layout: layoutReceipt(gallery, route, compared),
      galleryChanges: GALLERY_CHANGES,
    })
    expectMoments(compared, `cards ${name}`)
    app.assertContained()
  })

  test(`TASK-AC-244B4516A858 urgency ${name}: /workout’s EMOM minute at ten and five seconds and its For Time race five seconds before the cap warn as the accepted urgency state does`, async ({ page, visit }) => {
    test.setTimeout(240_000)
    await page.setViewportSize(viewport)
    const flow = (scope: Locator, kind: Kind) => scope.locator(`.clr-timed-flow[data-timed-format="${kind}"]`)
    const MOMENTS = [
      { id: 'emom-10', button: 'EMOM · 10 seconds', kind: 'emom', at: 50_000 },
      { id: 'emom-5', button: 'EMOM · 5 seconds', kind: 'emom', at: 55_000 },
      { id: 'for-time-5', button: 'For Time · 5 seconds to cap', kind: 'for_time', at: 895_000 },
    ] as const

    // The accepted state: each button restarts the real flow and its driver
    // presses Start and moves the flow's memory clock to the moment. The
    // page's wall clock is fixed, so the moment is read exactly where it is.
    await installDeterministicCapture(page, { skin: 'clear', reducedMotion: true })
    await page.clock.setFixedTime(ENTRY)
    await visit('/gallery/refinements?state=urgency')
    const state = page.locator('[data-refinement-state="urgency"]')
    const gallery: Record<string, Reading> = {}
    const galleryWarnings: Record<string, unknown> = {}
    const READINGS = { 'emom-10': '00:10', 'emom-5': '00:05', 'for-time-5': '14:55' } as const
    for (const moment of MOMENTS) {
      await state.getByRole('button', { name: moment.button }).click()
      await expect(flow(state, moment.kind).getByRole('timer')).toContainText(READINGS[moment.id], { timeout: 15_000 })
      gallery[moment.id] = await read(flow(state, moment.kind), `urgency-${moment.id}-${name}-gallery`)
      galleryWarnings[moment.id] = await warnings(page)
    }

    // The real route, over the same blocks: each clock started and moved to the same second.
    const app = await syntheticApp(page, liveSession())
    await page.clock.setFixedTime(ENTRY)
    await visit('/workout')
    const main = page.locator('main')
    await expect(flow(main, 'emom')).toBeVisible()
    const route: Record<string, Reading> = {}
    const routeWarnings: Record<string, unknown> = {}
    const routeAt = async (moment: (typeof MOMENTS)[number], startedAt: number) => {
      await holdAt(page, startedAt + moment.at)
      await expect(flow(main, moment.kind).getByRole('timer')).toContainText(READINGS[moment.id])
      route[moment.id] = await read(flow(main, moment.kind), `urgency-${moment.id}-${name}-route`)
      routeWarnings[moment.id] = await warnings(page)
    }
    await flow(main, 'emom').getByRole('button', { name: 'Start EMOM' }).click()
    await routeAt(MOMENTS[0], ENTRY)
    await routeAt(MOMENTS[1], ENTRY)
    // Held, so the race is the only deadline running toward its moment.
    await flow(main, 'emom').getByRole('button', { name: 'Pause' }).click()
    const raceStart = ENTRY + MOMENTS[1].at
    await flow(main, 'for_time').getByRole('button', { name: /^Start for time$/i }).click()
    await routeAt(MOMENTS[2], raceStart)

    const compared = Object.fromEntries(Object.keys(gallery).map((moment) => [moment, compareMoment(gallery[moment], route[moment])]))
    writeReceipt(`urgency-${name}`, {
      state: 'urgency', width: viewport.width, route: '/workout',
      ...moments(gallery, route),
      warnings: { gallery: galleryWarnings, route: routeWarnings },
      differences: Object.fromEntries(Object.entries(compared).map(([moment, found]) => [moment, found.differences])),
      layout: layoutReceipt(gallery, route, compared),
      galleryChanges: GALLERY_CHANGES,
    })
    // The warning itself, moment by moment: colour at ten, the breathe and one edge at five, no micro-pulse.
    expect(galleryWarnings['emom-10']).toMatchObject({ edges: 0, breathing: [], low: ['EMOM time'], microPulse: 0 })
    expect(routeWarnings['emom-10']).toMatchObject({ edges: 0, breathing: [], low: ['EMOM time'], microPulse: 0 })
    expect(galleryWarnings['emom-5']).toMatchObject({ edges: 1, breathing: ['EMOM time'], microPulse: 0 })
    expect(routeWarnings['emom-5']).toMatchObject({ edges: 1, breathing: ['EMOM time'], microPulse: 0 })
    expect(galleryWarnings['for-time-5']).toMatchObject({ edges: 1, breathing: ['FOR TIME time'], microPulse: 0 })
    expect(routeWarnings['for-time-5']).toMatchObject({ edges: 1, breathing: ['FOR TIME time'], microPulse: 0 })
    expectMoments(compared, `urgency ${name}`)
    app.assertContained()
  })

  test(`TASK-AC-244B4516A858 emom, amrap and for_time ${name}: each /workout clock at its end, behind its Log results dialog, matches the accepted state`, async ({ page, visit }) => {
    test.setTimeout(360_000)
    await page.setViewportSize(viewport)
    const gallery: Record<string, Reading> = {}
    const route: Record<string, Reading> = {}
    for (const kind of KINDS) {
      // The accepted state's own drive: Start, past the cap, its log open.
      await installDeterministicCapture(page, { skin: 'clear', reducedMotion: true })
      await visit(`/gallery/refinements?state=${kind}`)
      const galleryFlow = page.locator(`[data-refinement-state="${kind}"] .clr-timed-flow`)
      await expect(galleryFlow).toBeVisible()
      await page.getByRole('button', { name: OPEN[kind], exact: true }).click()
      await expect(page.locator('dialog.clr-logging-overlay[open]')).toBeVisible({ timeout: 15_000 })
      gallery[kind] = await read(galleryFlow.locator('[role="timer"]').locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " clr-timed-clock ")][1]'), `${kind}-${name}-gallery-ended`)

      // The real route, over the same block, its clock moved past the same cap.
      const app = await syntheticApp(page, logSession(kind))
      await page.clock.setFixedTime(ENTRY)
      await visit('/workout')
      const routeFlow = page.locator(`.clr-timed-flow[data-timed-format="${kind}"]`)
      await expect(routeFlow).toBeVisible()
      await routeFlow.getByRole('button', { name: /^Start / }).click()
      await holdAt(page, ENTRY + ((LOG_BLOCKS[kind].timerSeconds ?? 0) + 1) * 1000)
      await expect(routeFlow.locator('[role="timer"]')).toContainText(/Time complete|Cap reached/)
      route[kind] = await read(routeFlow.locator('.clr-timed-clock'), `${kind}-${name}-route-ended`)
      app.assertContained()
      await page.unrouteAll({ behavior: 'ignoreErrors' })
      await page.evaluate(() => localStorage.clear())
    }
    const compared = Object.fromEntries(KINDS.map((kind) => [kind, compareMoment(gallery[kind], route[kind])]))
    writeReceipt(`ended-${name}`, {
      states: KINDS, width: viewport.width, route: '/workout',
      ...moments(gallery, route),
      differences: Object.fromEntries(Object.entries(compared).map(([moment, found]) => [moment, found.differences])),
      layout: layoutReceipt(gallery, route, compared),
      galleryChanges: GALLERY_CHANGES,
    })
    expectMoments(compared, `ended ${name}`)
  })

  test(`TASK-AC-244B4516A858 navigator ${name}: /workout’s compact navigator, closed and open, matches the accepted gallery’s SectionHeader specimen; the workout header is captured on the route`, async ({ page, visit }) => {
    test.setTimeout(240_000)
    await page.setViewportSize(viewport)
    const navigator = (scope: Page | Locator) => scope.locator('[data-section-navigation]')
    const toggle = (scope: Page | Locator) => navigator(scope).getByRole('button', { name: 'All sections', exact: true })

    // The real route over matched sections: a finished Warm-up, Conditioning under way, an untouched Cooldown.
    const app = await syntheticApp(page, navigatorSession())
    await installDeterministicCapture(page, { skin: 'clear', reducedMotion: true })
    await page.clock.setFixedTime(ENTRY)
    await visit('/workout')
    await expect(navigator(page)).toBeVisible()
    const width = await navigator(page).evaluate((node) => node.getBoundingClientRect().width)
    const route: Record<string, Reading> = {}
    route.closed = await read(navigator(page), `navigator-${name}-route-closed`)
    await toggle(page).click()
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true')
    route.open = await read(navigator(page), `navigator-${name}-route-open`)
    await toggle(page).click()

    // The header: the route's own, with no accepted gallery state to compare (bec4454 draws none).
    const header = await read(page.locator('header.clr-workout-header'), `header-${name}-route`)
    app.assertContained()

    // The accepted specimen: the route's own SectionHeader over a memory-only
    // position, kept as the catalogue draws it. The catalogue hosts it outside
    // Round 7's workout presentation (`.clr-v4-experience`, which the route's
    // shell wraps it in) and in a narrower card, so for the comparison it is
    // placed in the same presentation context and given the route navigator's
    // width: the same component, in the same context and width, compares like
    // for like.
    await page.unrouteAll({ behavior: 'ignoreErrors' })
    await visit('/gallery/app?component=SectionHeader')
    await expect(navigator(page)).toHaveCount(1)
    const asCatalogued = await read(navigator(page), `navigator-${name}-gallery-catalogue`)
    await navigator(page).evaluate((node, px) => {
      (node as HTMLElement).style.width = `${px}px`
      node.parentElement!.classList.add('clr-v4-experience')
    }, width)
    const gallery: Record<string, Reading> = {}
    gallery.closed = await read(navigator(page), `navigator-${name}-gallery-closed`)
    await toggle(page).click()
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true')
    gallery.open = await read(navigator(page), `navigator-${name}-gallery-open`)

    const compared = Object.fromEntries(Object.keys(gallery).map((moment) => [moment, compareMoment(gallery[moment], route[moment])]))
    writeReceipt(`navigator-${name}`, {
      state: 'gallery/app?component=SectionHeader', width: viewport.width, route: '/workout',
      ...moments(gallery, route),
      header: {
        capture: header.capture, lines: header.lines,
        note: 'Route only: no accepted gallery state (bec4454) draws the workout header. TASK-AC-8E1E91D4F4AA and AC-C20-01 are proved by e2e/refinement/task-007.spec.ts; this capture records it.',
      },
      differences: Object.fromEntries(Object.entries(compared).map(([moment, found]) => [moment, found.differences])),
      layout: { ...layoutReceipt(gallery, route, compared), specimenWidthPx: width },
      specimenContext: {
        note: 'The catalogue specimen is compared inside Round 7’s workout presentation (`.clr-v4-experience`) at the route navigator’s width; as catalogued it sits in a narrower card outside that context (its own 8px inline padding, the jump list wrapping to more rows). The as-catalogued capture is kept beside it.',
        capture: asCatalogued.capture,
        lines: asCatalogued.lines,
      },
      galleryChanges: GALLERY_CHANGES,
    })
    expectMoments(compared, `navigator ${name}`)
  })
}
