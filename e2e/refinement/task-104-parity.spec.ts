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
 * A3 TASK-104 look check (TASK-AC-57108F133EA2): each real route this task
 * wires beside its accepted gallery state (gallery commit bec4454, Round 7),
 * with matched data, at the two approved phone widths, 320 and 390.
 *
 * The route this task wires is `/workout`'s timed card — Round 7's
 * `TimedWorkoutFlow` — through its lifecycle: Start, Pause, Resume and Finish
 * (or Finish early), kept across reloads. Each accepted state draws the same
 * flow over the very block the route performs here:
 *
 *   · `emom`, `amrap`, `for_time`: the gallery's timed logging states
 *     (`timedScene` in `src/dev/gallery-refinement-forms.tsx`);
 *   · `ladder-4`, `ladder-12`: the live ladders (`GalleryLadderFlow`).
 *
 * Both sides are driven alike on the browser's own clock (Playwright's, held
 * still between steps so every reading is exact): the card before Start; 30
 * seconds after Start (running); 60 seconds into a Pause (paused: the clock
 * frozen at 30); just after the format's Finish or Finish early, its "Log
 * results" dialog (log); and the ended card once that dialog is closed (ended).
 * Every visible word of each moment is read
 * from both sides, and so is the layout: every rendered element's box is
 * measured and compared with its counterpart within `LAYOUT_TOLERANCE_PX`
 * (TASK-103's method, which caught the inset ladder tiles). A difference no
 * criterion intends fails the case; an intended one is labelled with its
 * criterion ID. Each case writes its receipt to
 * `evidence/refinement/task-104/parity/` and its captures beside the Runner's
 * evidence store (outside Git), recording each capture's SHA-256 in the
 * receipt. Synthetic and contained: nothing is written to any backend.
 *
 * The reload itself has no gallery counterpart (the gallery keeps nothing);
 * it is proved on the route by `src/ui/timed-workout-flow.test.tsx` and
 * `e2e/refinement/task-006.spec.ts`.
 */
const OWNER = '00000000-0000-4000-8000-000000010490'
const PLACE = '00000000-0000-4000-8000-000000010491'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
}
const REPO_ROOT = resolve(import.meta.dirname, '..', '..')
const RECEIPTS = join(REPO_ROOT, 'evidence', 'refinement', 'task-104', 'parity')
/** The browser's clock at the start of each case. */
const ENTRY = Date.parse('2026-11-16T09:00:00.000Z')
/**
 * The fixed instant each side's clock is held at just before Start (timing
 * only; TASK-115 repair 2, owner decision D4 of 2026-11-24). Held at "now plus
 * one second", the route's Start moved with the real time /workout took to
 * load, so its header's session clock (the session started a minute before
 * ENTRY), drawn over the top of every capture taller than the viewport, read
 * 03:06, 03:07 or 03:08: one capture, more than one render. A fixed instant
 * draws the same clock on every run; a load slower than the margin fails at
 * `pauseAt` ("Cannot fast-forward to the past") instead of drawing another time.
 * The gallery's drive ends at 2 min + 91 s, so the route has 89 s to load.
 */
const HOLD_AT = { gallery: ENTRY + 2 * 60_000, route: ENTRY + 5 * 60_000 } as const
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
    if (code !== null) throw new Error(`Synthetic TASK-104 server exited (${code}) before ${origin} was ready`)
    try {
      if ((await fetch(origin)).ok && (await fetch(own)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((settle) => setTimeout(settle, 250))
  }
  throw new Error(`Synthetic TASK-104 origin ${origin} did not start`)
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
          VITE_SUPABASE_URL: 'https://synthetic-task-104.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-task-104-public-placeholder',
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

type GalleryState = 'emom' | 'amrap' | 'for_time' | 'ladder-4' | 'ladder-12'
type TimedFormat = 'emom' | 'amrap' | 'for_time' | 'ladder'
const STATES: readonly GalleryState[] = ['emom', 'amrap', 'for_time', 'ladder-4', 'ladder-12']
/** The blocks the accepted states draw (`sceneFor` in `gallery-refinement-forms.tsx`; `GalleryLadderFlow`). */
const GALLERY_BLOCKS: Readonly<Record<GalleryState, BlockProgress>> = {
  emom: timedBlock('emom'),
  amrap: timedBlock('amrap', { multi: true }),
  for_time: timedBlock('for_time', { multi: true }),
  'ladder-4': timedBlock('ladder', { rounds: 4 }),
  'ladder-12': timedBlock('ladder', { rounds: 12 }),
}
const FORMAT: Readonly<Record<GalleryState, TimedFormat>> = {
  emom: 'emom', amrap: 'amrap', for_time: 'for_time', 'ladder-4': 'ladder', 'ladder-12': 'ladder',
}
/** The format's own end words (`finishLabel`): a prescribed window is ended early; a race or a ladder is finished. */
const FINISH: Readonly<Record<TimedFormat, string>> = {
  emom: 'Finish early', amrap: 'Finish early', for_time: 'Finish', ladder: 'Finish',
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

function timedSession(state: GalleryState): SessionSnapshot {
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
      title: `TASK-104 parity ${state}`,
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
  return sessionSnapshotSchema.parse(formatBadgesSnapshot(acceptance, { userId: OWNER, startedAt: new Date(ENTRY - 60_000).toISOString() }))
}

/** The contained synthetic app: reads only; any write fails the case. */
async function syntheticApp(page: Page, snapshot: SessionSnapshot) {
  const unexpected: string[] = []
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
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic TASK-104 request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ owner }) => {
    localStorage.setItem('clear.auth.session', JSON.stringify({
      accessToken: 'synthetic-task-104-session', refreshToken: 'synthetic-task-104-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-task-104@example.invalid' },
    }))
  }, { owner: OWNER })
  return {
    assertContained() {
      expect(unexpected, 'Every synthetic API request has an explicit disposition').toEqual([])
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Reading, comparing and keeping
// ─────────────────────────────────────────────────────────────────────────────

/** Fonts loaded and entrance motion finished, so every word is drawn (loops excepted). */
async function settle(page: Page) {
  await page.evaluate(async () => {
    void document.body.offsetHeight
    await Promise.all([...document.fonts].map((face) => face.load().catch(() => undefined)))
    await document.fonts.ready
  })
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

/** Captures go beside the Runner's evidence store, outside Git; else into test-results. */
function captureDir(): { dir: string; identity: string } {
  const store = resolveObjectStore({ cwd: REPO_ROOT })
  if (store.problem === undefined && store.dir !== null) {
    const dir = join(store.dir, 'clear-gallery-adoption-v2-20261116', 'task-104', 'captures')
    return { dir, identity: 'store:clear-gallery-adoption-v2-20261116/task-104/captures' }
  }
  const dir = join(REPO_ROOT, 'test-results', 'task-104-parity')
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
  writeFileSync(join(RECEIPTS, `${name}.json`), `${JSON.stringify({ schema: 'clear-task-104-parity/v1', task: 'TASK-104', gallery: 'bec44545eb982f6dc136a583400f7e314c306d1d', ...receipt }, null, 2)}\n`)
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
// The lifecycle, driven alike on both sides
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Differences a criterion intends on the timed cards. The route draws the same
 * Round 7 component from the same block, so none is expected; the tables stay
 * explicit so a future one is labelled rather than waved through.
 */
const TIMED_INTENDED: readonly Intended[] = []
const TIMED_LAYOUT_INTENDED: readonly IntendedLayout[] = []

type Moment = 'ready' | 'running' | 'paused' | 'ended' | 'log'
interface Reading {
  readonly lines: string[]
  readonly boxes: Box[]
  readonly capture: { file: string; sha256: string }
  /** The section clock's digits as drawn (`TimerDigits` draws each digit apart); null before Start. */
  readonly readout: string | null
}

/** The section clock's readout: the timer's one child whose words are its digits. */
async function readoutOf(card: Locator): Promise<string | null> {
  const timer = card.getByRole('timer')
  if (await timer.count() === 0) return null
  return timer.first().evaluate((element) =>
    [...element.children].map((part) => part.textContent ?? '').find((text) => /^\d{2}:\d{2}$/.test(text)) ?? null)
}

/**
 * One side's lifecycle: the card before Start; 30 seconds after Start; 60
 * seconds into a Pause; just after the format's Finish or Finish early, with
 * its log. The browser's clock is held at the side's fixed `holdAt` before
 * Start, then between steps, and moved exactly.
 */
async function driveLifecycle(page: Page, card: Locator, format: TimedFormat, side: string, holdAt: number): Promise<Record<Moment, Reading>> {
  const read = async (target: Locator, name: string): Promise<Reading> => {
    await expect(target).toBeVisible()
    return { lines: await linesOf(target), boxes: await boxesOf(target), capture: await keep(target, name), readout: await readoutOf(target) }
  }
  await settle(page)
  const ready = await read(card, `${side}-ready`)

  await page.clock.pauseAt(holdAt)
  await card.getByRole('button', { name: /^Start / }).click()
  await page.clock.runFor(30_000)
  await expect(card.locator('[data-timed-actions] button')).toHaveText(['Pause', FINISH[format]])
  const running = await read(card, `${side}-running`)

  await card.getByRole('button', { name: 'Pause', exact: true }).click()
  await page.clock.runFor(60_000)
  await expect(card.locator('[data-timed-actions] button')).toHaveText(['Resume', FINISH[format]])
  const paused = await read(card, `${side}-paused`)

  await card.getByRole('button', { name: FINISH[format], exact: true }).click()
  await page.clock.runFor(1_000)
  const log = page.locator('dialog[open] form.clr-timed-log')
  await expect(log).toBeVisible({ timeout: 15_000 })
  await expect(card.locator('[data-timed-actions]')).toHaveCount(0)
  const logged = { lines: await linesOf(log), boxes: await boxesOf(log), capture: await keep(page.locator('dialog[open]'), `${side}-log`), readout: null }
  // The athlete closes the log with its framed X: the ended card, as left behind.
  await page.locator('dialog[open]').getByRole('button', { name: 'Close log' }).click()
  await expect(page.locator('dialog[open]')).toHaveCount(0)
  const ended = await read(card, `${side}-ended`)
  await page.clock.resume()
  return { ready, running, paused, ended, log: logged }
}

/** What each moment must show on both sides: the lifecycle this task wires. */
const EXPECTED: Readonly<Record<TimedFormat, Readonly<Record<'running' | 'paused' | 'ended', RegExp>>>> = {
  emom: { running: /^Minute 1 of 10$/i, paused: /^Paused$/i, ended: /^Finished early, in minute 1 of 10\. Continue when you are ready\.$/ },
  amrap: { running: /^Remaining$/i, paused: /^Paused$/i, ended: /^Finished$/i },
  for_time: { running: /^Elapsed$/i, paused: /^Paused$/i, ended: /^Finished$/i },
  ladder: { running: /^Elapsed$/i, paused: /^Paused$/i, ended: /^Finished$/i },
}
/** The section clock's readout at each moment: 30 seconds run, then frozen through the 60-second pause. */
const READOUT: Readonly<Record<TimedFormat, Readonly<Record<'running' | 'paused' | 'ended', string>>>> = {
  emom: { running: '00:30', paused: '00:30', ended: '00:00' },
  amrap: { running: '07:30', paused: '07:30', ended: '07:30' },
  for_time: { running: '00:30', paused: '00:30', ended: '00:30' },
  ladder: { running: '00:30', paused: '00:30', ended: '00:30' },
}

for (const state of STATES) {
  const format = FORMAT[state]
  for (const { name, viewport } of VIEWPORTS) {
    test(`TASK-AC-57108F133EA2 ${state} ${name}: /workout’s timed card matches the accepted gallery state through Start, Pause and ${FINISH[format]}, with its Log results dialog`, async ({ page, visit }) => {
      test.setTimeout(240_000)
      await page.setViewportSize(viewport)
      await installDeterministicCapture(page, { skin: 'clear', reducedMotion: true })
      await page.clock.install({ time: ENTRY })

      // The accepted state: the real flow on the gallery's memory runtime.
      await visit(`/gallery/refinements?state=${state}`)
      const galleryCard = page.locator(`[data-refinement-state="${state}"] .clr-timed-flow`)
      await expect(galleryCard).toBeVisible()
      const gallery = await driveLifecycle(page, galleryCard, format, `${state}-${name}-gallery`, HOLD_AT.gallery)
      // Memory only: the gallery keeps nothing under any key.
      expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('clear.workout-')))).toEqual([])

      // The real route, over the same block, driven the same way.
      const app = await syntheticApp(page, timedSession(state))
      await visit('/workout')
      const routeCard = page.locator(`.clr-timed-flow[data-timed-format="${format}"]`)
      await expect(routeCard).toBeVisible()
      const route = await driveLifecycle(page, routeCard, format, `${state}-${name}-route`, HOLD_AT.route)

      const moments = ['ready', 'running', 'paused', 'ended', 'log'] as const
      const differences = Object.fromEntries(moments.map((moment) => [moment, compare(gallery[moment].lines, route[moment].lines, TIMED_INTENDED)]))
      const layout = Object.fromEntries(moments.map((moment) => [moment, compareLayout(gallery[moment].boxes, route[moment].boxes, TIMED_LAYOUT_INTENDED)]))
      const part = (boxes: readonly Box[]) => boxes.find((box) => box.key === '(part)#0') ?? null
      writeReceipt(`${state}-${name}`, {
        state, format, width: viewport.width, route: '/workout',
        drive: 'Start; 30 s; Pause; 60 s; ' + FINISH[format] + '; 1 s — on the browser clock, held between steps',
        captures: Object.fromEntries(moments.flatMap((moment) => [[`gallery-${moment}`, gallery[moment].capture], [`route-${moment}`, route[moment].capture]])),
        lines: {
          gallery: Object.fromEntries(moments.map((moment) => [moment, gallery[moment].lines])),
          route: Object.fromEntries(moments.map((moment) => [moment, route[moment].lines])),
        },
        readouts: {
          gallery: Object.fromEntries(moments.map((moment) => [moment, gallery[moment].readout])),
          route: Object.fromEntries(moments.map((moment) => [moment, route[moment].readout])),
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
      })

      // The lifecycle is the one this task wires, on both sides.
      for (const [side, reading] of [['gallery', gallery], ['route', route]] as const) {
        for (const moment of ['running', 'paused', 'ended'] as const) {
          expect(reading[moment].lines.some((line) => EXPECTED[format][moment].test(line)), `${side} ${moment} @${name}: ${EXPECTED[format][moment]}`).toBe(true)
          expect(reading[moment].readout, `${side} ${moment} readout @${name}`).toBe(READOUT[format][moment])
        }
      }
      for (const moment of moments) expectAllIntended(differences[moment], `${state} ${moment} @${name}`)
      for (const moment of moments) expectLayoutIntended(layout[moment], `${state} ${moment} layout @${name}`)
      // Nothing outside the card is claimed: the route stays contained.
      app.assertContained()
    })
  }
}
