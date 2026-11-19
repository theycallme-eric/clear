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
 * A3 TASK-116 look check (TASK-AC-4FE4C4B37830): each real route this task
 * wires beside its accepted gallery state (gallery commit bec4454, Round 7),
 * with matched data, at the two approved phone widths, 320 and 390.
 *
 * The route this task wires is `/workout`'s AMRAP, For Time and ladder — Round
 * 7's `TimedWorkoutFlow` and its one "Log results" dialog, holding
 * `TimedResultLog` with the AMRAP's two framed `QuantitySelector` counts, the
 * For Time's and ladder's "Work completed" row and the existing three-face
 * `SetEffortChoice` — beside `/gallery/refinements?state=<amrap|for_time|ladder>`,
 * drawn from the very block each state uses (`timedBlock` in
 * `src/dev/gallery-refinement-fixtures.ts`) persisted as a synthetic session
 * with the gallery's unit. Four moments, read alike on both sides:
 *
 *   · `ready`: the card before Start;
 *   · `log`: its "Log results" dialog once the attempt has run past its cap
 *     (the gallery's own "Open …" drive; the route's clock moved by the same
 *     amount): the counts blank, Incomplete chosen, no face chosen;
 *   · `answered`: the same dialog after the same taps on both sides — the
 *     AMRAP's rounds up to 3 and its partial round tapped to an explicit 0,
 *     the For Time and the ladder answered Complete — and the face About
 *     right, so the wired counts, answer, face and its named Clear are drawn
 *     (read from the log's top, where it opened);
 *   · `ended`: the card behind the open dialog.
 *
 * Every visible word of each moment is read from both sides, and so is the
 * layout: every rendered element's box is measured and compared with its
 * counterpart within `LAYOUT_TOLERANCE_PX` (TASK-103's method). A difference
 * no criterion intends fails the case; an intended one is labelled with its
 * criterion ID. The gallery state draws the live components, so this task's
 * changes to them show on both sides alike; each receipt lists those changes
 * against the accepted gallery (`galleryChanges`), each with its criterion.
 *
 * Captures hold steady run to run: each card's top is scrolled into view and
 * the route's held clock is run past the scroll streak's timer before it is
 * captured; a dialog is captured as its frame (`dialog[open] > .clr-bleed`),
 * not its padded box, so the backdrop's blur of the page behind is never in
 * the image (TASK-105's repair); its X is painted afresh first (`repaint`,
 * TASK-106's); the pointer is moved off the controls; and a part is captured
 * once two screenshots in a row are identical (`steadyScreenshot`). Each case
 * writes its receipt to `evidence/refinement/task-116/parity/` and its
 * captures beside the Runner's evidence store (outside Git), under this
 * body's folder, recording each capture's SHA-256 in the receipt. Synthetic
 * and contained: nothing is written to any backend.
 *
 * The reload, the failed save and the read-back have no gallery counterpart
 * (the gallery keeps nothing); they are proved on the route by
 * `src/ui/timed-result-log.test.tsx` and `e2e/refinement/task-009.spec.ts` and
 * `task-010.spec.ts`.
 */
const OWNER = '00000000-0000-4000-8000-000000011690'
const PLACE = '00000000-0000-4000-8000-000000011691'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
}
const REPO_ROOT = resolve(import.meta.dirname, '..', '..')
const RECEIPTS = join(REPO_ROOT, 'evidence', 'refinement', 'task-116', 'parity')
/** Captures go to this body's folder in the evidence store. */
const CAPTURE_BODY = 'clear-gallery-adoption-v2-20261118'
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
    if (code !== null) throw new Error(`Synthetic TASK-116 server exited (${code}) before ${origin} was ready`)
    try {
      if ((await fetch(origin)).ok && (await fetch(own)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((settle) => setTimeout(settle, 250))
  }
  throw new Error(`Synthetic TASK-116 origin ${origin} did not start`)
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
          VITE_SUPABASE_URL: 'https://synthetic-task-116.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-task-116-public-placeholder',
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

type TimedState = 'amrap' | 'for_time' | 'ladder'
const TIMED_STATES: readonly TimedState[] = ['amrap', 'for_time', 'ladder']
/** The blocks the accepted states draw (`sceneFor` in `gallery-refinement-forms.tsx`). */
const GALLERY_BLOCKS: Readonly<Record<TimedState, BlockProgress>> = {
  amrap: timedBlock('amrap', { multi: true }),
  for_time: timedBlock('for_time', { multi: true }),
  ladder: timedBlock('ladder', { rounds: 4 }),
}
const OPEN: Readonly<Record<TimedState, string>> = {
  amrap: 'Open AMRAP results', for_time: 'Open For Time results', ladder: 'Open Ladder results',
}
/** The gallery's own sample unit (`PreviewSetLogging`), so the planned loads read alike. */
const GALLERY_UNIT = 'lb' as const

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

function timedSession(state: TimedState): SessionSnapshot {
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
    workout: {
      title: `TASK-116 parity ${state}`,
      overview: null,
      estimated_duration_mins: 30,
      sections: [
        { section_type: 'conditioning', section_title: 'Parity', section_notes: null, blocks: [persistedBlock(GALLERY_BLOCKS[state])] },
        {
          section_type: 'cooldown', section_title: 'Cooldown', section_notes: null,
          blocks: [makeWorkoutBlock({ exercises: [makePrescription({ exercise_id: 'burpee', equipment: 'bodyweight', load_type: 'none', load_value: null, sets: 1, target_value: 1 })] })],
        },
      ],
    },
  }
  return sessionSnapshotSchema.parse(formatBadgesSnapshot(acceptance, { userId: OWNER, startedAt: new Date(Date.now() - 60_000).toISOString() }))
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
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic TASK-116 request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ owner }) => {
    localStorage.setItem('clear.auth.session', JSON.stringify({
      accessToken: 'synthetic-task-116-session', refreshToken: 'synthetic-task-116-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-task-116@example.invalid' },
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
    const dir = join(store.dir, CAPTURE_BODY, 'task-116', 'captures')
    return { dir, identity: `store:${CAPTURE_BODY}/task-116/captures` }
  }
  const dir = join(REPO_ROOT, 'test-results', 'task-116-parity')
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
  writeFileSync(join(RECEIPTS, `${name}.json`), `${JSON.stringify({ schema: 'clear-task-116-parity/v1', task: 'TASK-116', gallery: 'bec44545eb982f6dc136a583400f7e314c306d1d', ...receipt }, null, 2)}\n`)
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

function expectLayoutIntended(differences: readonly LayoutDifference[], label: string) {
  const unintended = differences.filter((difference) => difference.criterion === null)
  expect(unintended, `${label}: every element is drawn where the accepted gallery draws it, within ${LAYOUT_TOLERANCE_PX}px, unless a criterion intends otherwise`).toEqual([])
}

// ─────────────────────────────────────────────────────────────────────────────
// The timed cards and their logs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Differences a criterion intends: none. The route draws the same Round 7
 * components from the same block, and this task's changes to them show on
 * both sides alike; the tables stay explicit so a future one is labelled
 * rather than waved through.
 */
const TIMED_INTENDED: readonly Intended[] = []
const TIMED_LAYOUT_INTENDED: readonly IntendedLayout[] = []

/**
 * This task's changes to gallery-owned files, against the accepted bec4454,
 * each with its criterion. None changes what these accepted states draw
 * before or after the same taps: each state has a cap, so "Work completed" is
 * asked, and a For Time answered Incomplete keeps its amount fields.
 */
const GALLERY_CHANGES = [
  { file: 'src/ui/timed-result-log.tsx', criterion: 'TASK-AC-85F76FF493AB',
    change: '`askCompletion`: a For Time with no cap is not asked "Work completed"; a For Time\'s amounts belong to a race answered Incomplete, never to one nobody answered.' },
  { file: 'src/ui/timed-workout-flow.tsx', criterion: 'AC-R010-01',
    change: 'For Time starts where the race ended and keeps only the athlete\'s answer (`workCompleted`); with no cap nothing is asked or claimed.' },
  { file: 'src/ui/timed-workout-flow.tsx', criterion: 'TASK-AC-8FF68F3F5241',
    change: 'AMRAP and For Time save authority: a refused save is kept on the attempt\'s record and said after a reload; a known row whose richer save failed reopens the block.' },
] as const

const capOf = (state: TimedState) => {
  const block = GALLERY_BLOCKS[state]
  return block.ladderTiming?.mode === 'capped_window' ? block.ladderTiming.cap_seconds ?? 0 : block.timerSeconds ?? 0
}

/** The same taps on both sides, inside the open log. */
async function answer(log: Locator, state: TimedState) {
  if (state === 'amrap') {
    for (let tap = 0; tap < 3; tap += 1) await log.getByRole('button', { name: 'Increase rounds completed', exact: true }).click()
    await log.getByRole('button', { name: 'Increase reps into the next round', exact: true }).click()
    await log.getByRole('button', { name: 'Decrease reps into the next round', exact: true }).click()
    await expect(log.getByRole('group', { name: 'Rounds completed', exact: true }).locator('output')).toHaveText('3')
    await expect(log.getByRole('group', { name: 'Reps into the next round', exact: true }).locator('output')).toHaveText('0')
  } else {
    await log.getByRole('group', { name: 'Work completed', exact: true }).getByRole('radio', { name: 'Complete', exact: true }).click()
    await expect(log.getByRole('group', { name: 'Work completed', exact: true }).getByRole('radio', { name: 'Complete', exact: true })).toHaveAttribute('aria-checked', 'true')
  }
  await log.getByRole('group', { name: 'Effort · optional', exact: true }).getByRole('radio', { name: 'About right', exact: true }).click()
  await expect(log.getByRole('button', { name: 'Clear effort for this section', exact: true })).toBeVisible()
}

/**
 * The answered log is read from its top: the taps scroll the dialog's own
 * content to the last control pressed, so it is put back where the log
 * opened, on both sides alike, and the capture shows the counts or the answer.
 */
async function toLogTop(page: Page) {
  await page.locator('dialog.clr-logging-overlay[open] .clr-logging-overlay__scroll').evaluate((scroller) => { scroller.scrollTop = 0 })
  await renderFrame(page)
}

/** What each side read at one moment. */
interface Reading { readonly lines: string[]; readonly boxes: Box[]; readonly capture: { file: string; sha256: string } | null }

for (const state of TIMED_STATES) {
  for (const { name, viewport } of VIEWPORTS) {
    test(`TASK-AC-4FE4C4B37830 ${state} ${name}: /workout’s timed card and its Log results dialog match the accepted gallery state, before Start, past the cap and answered`, async ({ page, visit }) => {
      test.setTimeout(240_000)
      await page.setViewportSize(viewport)
      const read = async (target: Locator, capture: string | null, frame?: Locator): Promise<Reading> => {
        await expect(target).toBeVisible()
        await settle(page)
        const lines = await linesOf(target)
        const boxes = await boxesOf(target)
        return { lines, boxes, capture: capture === null ? null : await keep(frame ?? target, capture) }
      }
      const logOf = () => page.locator('dialog.clr-logging-overlay[open] form.clr-timed-log')
      const frameOf = () => page.locator('dialog.clr-logging-overlay[open] > .clr-bleed')
      const ensureLog = async (card: Locator) => {
        // Round 7 opens the log as the attempt ends; its "Log results" action opens it otherwise.
        await expect.poll(async () => (await logOf().count()) + (await card.locator('.clr-timed-actions').getByRole('button', { name: 'Log results', exact: true }).count()), { timeout: 15_000 }).toBeGreaterThan(0)
        if (await logOf().count() === 0) await card.locator('.clr-timed-actions').getByRole('button', { name: 'Log results', exact: true }).click()
        await expect(logOf()).toBeVisible({ timeout: 15_000 })
      }

      // The accepted state: the real flow on the gallery's memory runtime.
      await installDeterministicCapture(page, { skin: 'clear', reducedMotion: true })
      await visit(`/gallery/refinements?state=${state}`)
      const galleryCard = page.locator(`[data-refinement-state="${state}"] .clr-timed-flow`)
      await expect(galleryCard).toBeVisible()
      await galleryCard.evaluate((element) => element.scrollIntoView({ block: 'start' }))
      await renderFrame(page)
      await page.waitForTimeout(600)
      const gallery: Record<string, Reading> = {}
      gallery.ready = await read(galleryCard, `${state}-${name}-gallery-ready`)
      await page.getByRole('button', { name: OPEN[state], exact: true }).click()
      await ensureLog(galleryCard)
      gallery.log = await read(logOf(), `${state}-${name}-gallery-log`, frameOf())
      gallery.ended = await read(galleryCard, null)
      await answer(logOf(), state)
      await toLogTop(page)
      gallery.answered = await read(logOf(), `${state}-${name}-gallery-answered`, frameOf())

      // The real route, over the same block, with its clock moved past the same cap.
      await page.clock.install()
      const app = await syntheticApp(page, timedSession(state))
      await visit('/workout')
      const routeCard = page.locator(`.clr-timed-flow[data-timed-format="${state}"]`)
      await expect(routeCard).toBeVisible()
      await routeCard.evaluate((element) => element.scrollIntoView({ block: 'start' }))
      await renderFrame(page)
      // The held clock runs past the scroll streak's own timer, as the gallery's real one did.
      await page.clock.runFor(600)
      const route: Record<string, Reading> = {}
      route.ready = await read(routeCard, `${state}-${name}-route-ready`)
      await routeCard.getByRole('button', { name: /^Start / }).click()
      await page.clock.fastForward((capOf(state) + 1) * 1000)
      await ensureLog(routeCard)
      route.log = await read(logOf(), `${state}-${name}-route-log`, frameOf())
      route.ended = await read(routeCard, null)
      await answer(logOf(), state)
      await toLogTop(page)
      route.answered = await read(logOf(), `${state}-${name}-route-answered`, frameOf())

      const moments = ['ready', 'log', 'answered', 'ended'] as const
      const differences = Object.fromEntries(moments.map((moment) => [moment, compare(gallery[moment].lines, route[moment].lines, TIMED_INTENDED)]))
      const layout = Object.fromEntries(moments.map((moment) => [moment, compareLayout(gallery[moment].boxes, route[moment].boxes, TIMED_LAYOUT_INTENDED)]))
      const part = (boxes: readonly Box[]) => boxes.find((box) => box.key === '(part)#0') ?? null
      writeReceipt(`${state}-${name}`, {
        state, width: viewport.width, route: '/workout',
        captures: Object.fromEntries(['ready', 'log', 'answered'].flatMap((moment) => [
          [`gallery${moment[0].toUpperCase()}${moment.slice(1)}`, gallery[moment].capture],
          [`route${moment[0].toUpperCase()}${moment.slice(1)}`, route[moment].capture],
        ])),
        lines: {
          gallery: Object.fromEntries(moments.map((moment) => [moment, gallery[moment].lines])),
          route: Object.fromEntries(moments.map((moment) => [moment, route[moment].lines])),
        },
        differences,
        layout: {
          method: 'element boxes',
          tolerancePx: LAYOUT_TOLERANCE_PX,
          measured: {
            gallery: Object.fromEntries(moments.map((moment) => [moment, gallery[moment].boxes.length])),
            route: Object.fromEntries(moments.map((moment) => [moment, route[moment].boxes.length])),
          },
          parts: {
            gallery: Object.fromEntries(moments.map((moment) => [moment, part(gallery[moment].boxes)])),
            route: Object.fromEntries(moments.map((moment) => [moment, part(route[moment].boxes)])),
          },
          differences: layout,
        },
        galleryChanges: GALLERY_CHANGES,
      })
      for (const [moment, found] of Object.entries(differences)) expectAllIntended(found, `${state} ${moment} @${name}`)
      for (const [moment, found] of Object.entries(layout)) expectLayoutIntended(found, `${state} ${moment} layout @${name}`)
      // Nothing outside the card is claimed: the route stays contained.
      app.assertContained()
    })
  }
}
