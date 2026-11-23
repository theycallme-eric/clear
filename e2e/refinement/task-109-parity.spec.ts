import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createServer, type AddressInfo } from 'node:net'
import { join, relative, resolve } from 'node:path'
import type { Locator, Page, Route } from '@playwright/test'

import { readE2eEnv } from '../../scripts/e2e/env.mjs'
import { resolveObjectStore } from '../../scripts/refinement/lib/references.mjs'
import { preparationAcceptance } from '../../src/dev/gallery-refinement-preparation-data'
import { composedPreparationGuide } from '../../src/state/preparation-guide'
import { reviewHandoff } from '../../src/state/review-handoff'
import { sessionSnapshotSchema, type SessionAcceptance, type SessionReconstruction, type SessionSnapshot } from '../../src/state/schemas'
import { makePrescription, makeWorkoutBlock } from '../../src/test/factories'
import { peerGroupingSnapshot } from '../../src/test/peer-grouping-fixture'
import { fixtureLocation, onboardedProfile } from '../../src/test/user-data-double'
import { installDeterministicCapture } from '../design-0143/fixtures'
import { expect, test as scanned } from '../fixtures'

/**
 * A3 TASK-109 look check (TASK-AC-975923E1E25C): each real route this task
 * wires beside its accepted gallery state (gallery commit bec4454, Round 7),
 * with matched data, at the two approved phone widths, 320 and 390.
 *
 *   · `preparation` — Round 7's PreparationGuide. The gallery state draws the
 *     Warm-up (with its clock), the real For Time card and the Cooldown in
 *     Review order. This task wires the same owner on /review (Warm-up and
 *     Cooldown, no clock), /workout (each guide with its own session clock,
 *     PreparationClockProvider) and /history/:id (no clock), from TASK-034's
 *     reading of the real prescriptions. Each route's guide card is compared
 *     with the gallery's card of the same title, and each route clock with the
 *     gallery's one clock (the Warm-up's), ready.
 *   · `movement-note` — the grouped superset's one Coaching and notes
 *     disclosure (GroupExerciseCoaching) and Round 7's "Movement note" dialog
 *     opened from its first movement's "Add note — …". Compared on /workout's
 *     superset of the same two movements: the disclosure closed, the
 *     disclosure open behind the dialog, and the dialog.
 *   · `cards` — the disclosure at the foot of each live timed card (EMOM,
 *     AMRAP, For Time). Compared on /workout's same three blocks: each
 *     disclosure closed and open.
 *
 * Matched data. The gallery's sample guides (src/dev/gallery-refinement-
 * runtime.tsx) are illustrations: "~4 minutes" and "~3 minutes", three names
 * each in sentence case. The routes draw only real data (TASK-AC-9165CD7E97CC):
 * the synthetic composition prescribes the same three movements per guide, by
 * catalog slug, so each guide states three names on three lines and TASK-034's
 * estimate; the names are the catalog reader's (`exerciseName`, lower case,
 * no apostrophe) and the Cooldown's estimate of three movements is ~4 minutes,
 * not the illustrated three. Those words differ by intent and are labelled with
 * the criterion that intends them (AC-R034-01, AC-R022-01); the boxes are
 * compared with the names and the minutes read as placeholders.
 *
 * Every visible word of each part is read from both sides, and so is the
 * layout: every rendered element's box is measured and compared with its
 * counterpart within `LAYOUT_TOLERANCE_PX`. A difference no criterion intends
 * fails the case; an intended one is labelled with its criterion ID. Each case
 * writes its receipt to `evidence/refinement/task-109/parity/` and its captures
 * into this body's folder of the Runner's evidence store (outside Git),
 * recording each capture's SHA-256 in the receipt. Synthetic and contained:
 * nothing is saved, so nothing is written.
 */
const OWNER = '00000000-0000-4000-8000-000000010901'
const PLACE = '00000000-0000-4000-8000-000000010902'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
}
const REPO_ROOT = resolve(import.meta.dirname, '..', '..')
const RECEIPTS = join(REPO_ROOT, 'evidence', 'refinement', 'task-109', 'parity')
/** The Runner body these captures belong to: its own folder in the evidence store. */
const CAPTURE_BODY = 'clear-gallery-adoption-v2-20261120'
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
    if (code !== null) throw new Error(`Synthetic TASK-109 server exited (${code}) before ${origin} was ready`)
    try {
      if ((await fetch(origin)).ok && (await fetch(own)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((settle) => setTimeout(settle, 250))
  }
  throw new Error(`Synthetic TASK-109 origin ${origin} did not start`)
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
          VITE_SUPABASE_URL: 'https://synthetic-task-109.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-task-109-public-placeholder',
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
// The matched composition
// ─────────────────────────────────────────────────────────────────────────────

const bodyweight = { equipment: 'bodyweight', load_type: 'bodyweight' as const, load_value: null }
const prep = (exercise_id: string, session_function: 'prep' | 'recovery' = 'prep') =>
  makePrescription({ exercise_id, ...bodyweight, session_function, sets: 1, target_value: 10, rest_seconds: 30 })

/** The gallery's sample, as the catalog's slugs: three movements per guide. */
const WARM_UP = ['arm-circles', 'scapular-push-ups', 'bench-press-rehearsal']
const COOLDOWN = ['chest-stretch', 'thoracic-rotation', 'childs-pose']

/** The sections the three states' parts are read from, in performed order. */
function parityAcceptance(): SessionAcceptance {
  return preparationAcceptance({
    locationId: PLACE,
    sections: [
      { section_type: 'warmup', section_title: 'Prime the upper body', section_notes: 'Move with control.', blocks: [makeWorkoutBlock({ exercises: WARM_UP.map((slug) => prep(slug)) })] },
      {
        section_type: 'accessory', section_title: 'Accessories', section_notes: null,
        blocks: [makeWorkoutBlock({
          structure_type: 'superset', rounds: 3, round_rest_seconds: 90,
          exercises: [
            makePrescription({ exercise_id: 'one-arm-row', equipment: 'dumbbell', sets: 3, target_value: 10, load_value: 20, rest_seconds: 0 }),
            makePrescription({ exercise_id: 'bicep-curl', equipment: 'dumbbell', sets: 3, target_value: 10, load_value: 12, rest_seconds: 0 }),
          ],
        })],
      },
      {
        section_type: 'conditioning', section_title: 'Conditioning', section_notes: null,
        blocks: [
          makeWorkoutBlock({ structure_type: 'emom', timer_type: 'per_minute', timer_seconds: 600, exercises: [makePrescription({ exercise_id: 'kb-swing', sets: null, target_value: 12, rest_seconds: null, is_interval_exercise: true })] }),
          makeWorkoutBlock({ structure_type: 'amrap', timer_type: 'countdown', timer_seconds: 480, exercises: [makePrescription({ exercise_id: 'burpee', ...bodyweight, sets: null, target_value: 10, rest_seconds: null })] }),
          makeWorkoutBlock({ structure_type: 'for_time', timer_type: 'count_up', timer_seconds: 900, exercises: [makePrescription({ exercise_id: 'wall-ball', equipment: 'medicine-ball', sets: 1, target_value: 40, load_value: 9, rest_seconds: null })] }),
        ],
      },
      { section_type: 'cooldown', section_title: 'Unwind', section_notes: 'Breathe slowly.', blocks: [makeWorkoutBlock({ exercises: COOLDOWN.map((slug) => prep(slug, 'recovery')) })] },
    ],
  })
}

/** The contained synthetic account, answering Review, Workout and History detail. */
async function syntheticApp(page: Page, acceptance: SessionAcceptance) {
  const startedAt = new Date(Date.now() - 60_000).toISOString()
  const running: SessionSnapshot = sessionSnapshotSchema.parse(peerGroupingSnapshot(acceptance, { userId: OWNER, startedAt }))
  const record: SessionReconstruction = {
    reconstruction: 'performed',
    as_of: new Date().toISOString(),
    session: { ...running.session, completed_at: new Date().toISOString() },
    state: 'completed',
    sections: running.sections.map((entry) => ({
      ...entry,
      blocks: entry.blocks.map((held) => ({
        ...held, block_result: null, exercises: held.exercises.map((item) => ({ ...item, movement_result: null })),
      })),
    })),
  }
  const rows = running.sections.flatMap((entry) => entry.blocks).flatMap((held) => held.exercises).map(({ exercise }) => exercise)
  const unexpected: string[] = []
  const writes: string[] = []
  let active = false
  const handler = async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    const name = url.pathname.split('/').at(-1) ?? ''
    const method = request.method()
    const reply = (body: unknown, status = 200) => route.fulfill({ status, headers: CORS, json: body }).catch(() => undefined)
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (url.pathname.startsWith('/functions/v1/')) {
      unexpected.push(`${method} ${url.pathname}`)
      return route.abort('blockedbyclient')
    }
    if (method === 'GET' || method === 'HEAD') {
      if (name === 'profiles') return reply([onboardedProfile({ id: OWNER, goal_preset: 'balanced' })])
      if (name === 'locations') return reply([fixtureLocation({ id: PLACE, user_id: OWNER, tier: 'full', is_default: true })])
      // The library has no entry for any movement, as the gallery's memory library answers.
      if (name === 'exercise_definitions') return reply([])
      if (name === 'workout_exercises') return reply(rows)
      return reply([])
    }
    if (method === 'POST' && url.pathname.includes('/rpc/')) {
      if (name === 'resume_session') return reply(active ? running : null)
      if (name === 'session_snapshot') return reply(running)
      if (name === 'session_as_performed') return reply(record)
      if (['streak_sessions', 'constraints_in_force', 'anchor_evidence', 'conditioning_history',
        'generation_refusal_diagnostics', 'generation_candidate_sets_for_goal', 'generation_candidate_sets'].includes(name)) return reply([])
    }
    // The look check saves nothing: any write is recorded and refused.
    writes.push(`${method} ${url.pathname}`)
    unexpected.push(`${method} ${url.pathname}`)
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic TASK-109 request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ owner, handoff }) => {
    localStorage.setItem('clear.auth.session', JSON.stringify({
      accessToken: 'synthetic-task-109-session', refreshToken: 'synthetic-task-109-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-task-109@example.invalid' },
    }))
    if (location.pathname === '/review') {
      history.replaceState({ usr: handoff, key: 'synthetic-task-109', idx: 0 }, '', location.href)
    }
  }, { owner: OWNER, handoff: reviewHandoff(acceptance) })
  return {
    sessionId: running.session.id,
    setActive(value: boolean) { active = value },
    assertContained() {
      expect(unexpected, 'Every synthetic API request has an explicit disposition').toEqual([])
      expect(writes, 'The look check writes nothing').toEqual([])
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Reading, comparing and keeping (TASK-111's method)
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
    const dir = join(store.dir, CAPTURE_BODY, 'task-109', 'captures')
    return { dir, identity: `store:${CAPTURE_BODY}/task-109/captures` }
  }
  const dir = join(REPO_ROOT, 'test-results', 'task-109-parity')
  return { dir, identity: `repo:${relative(REPO_ROOT, dir)}` }
}

/**
 * The part's image once it holds still: screenshots 100 ms apart until two in
 * a row are byte-identical, so nothing is captured mid-change.
 */
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
  const bytes = await steadyScreenshot(target)
  await test.info().attach(`${name}.png`, { body: bytes, contentType: 'image/png' })
  const { dir, identity } = captureDir()
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${name}.png`), bytes)
  return { file: `${identity}/${name}.png`, sha256: createHash('sha256').update(bytes).digest('hex') }
}

/**
 * The files the accepted gallery (bec4454) owns that this task changes, each
 * named by its criterion. The gallery states draw the live components, so each
 * state shows the change in the same commit; none is visible at rest (the
 * structure added for assistive technology draws no box of its own).
 */
const GALLERY_CHANGES = [
  { file: 'src/ui/preparation-guide.tsx', criteria: ['TASK-AC-2E1486B7B4BF', 'TASK-AC-4BF91CC8AA52', 'AC-R034-02', 'AC-R022-02'], change: 'PreparationGuide also draws TASK-034’s reading in its four states (loading, error with retry, missing, ready); the ready card names its list (“<title> movements”) and states the time with approximateDurationText (identical for the sample); its clock is the session’s (usePreparationClock: the PreparationClockProvider’s, the component’s own in the gallery) with the shared warning from its own deadline and “Final 10 seconds” in the final ten. The gallery’s guide prop is unchanged.' },
  { file: 'src/ui/exercise-coaching.tsx', criteria: ['TASK-AC-82B8F7A4EF0B', 'TASK-AC-C4EE3D4EC8F0'], change: 'GroupExerciseCoaching: each movement’s section is a role=group labelled by its heading (aria-labelledby), the sections and their guidance/note under HeadingSection levels; constants for the accepted label and the note openers. No box moves (gallery states compared at base and at this task: same words, same boxes).' },
  { file: 'src/app/Review.tsx', criteria: ['TASK-AC-2E1486B7B4BF'], change: 'Warm-up and Cooldown drawn in place by PreparationGuide from composedPreparationGuide; the presentation’s sample guides are no longer read.' },
  { file: 'src/app/Workout.tsx', criteria: ['TASK-AC-2E1486B7B4BF', 'TASK-AC-4BF91CC8AA52'], change: 'PreparationClockProvider around the shell; a Warm-up or Cooldown section draws PreparationGuide over persistedPreparationReading with its clock; the presentation’s sample guides are no longer read.' },
  { file: 'src/app/SessionDetail.tsx', criteria: ['TASK-AC-2E1486B7B4BF'], change: 'Warm-up and Cooldown drawn by PreparationGuide over persistedPreparationReading of the record’s rows, its retry re-reading the record; the presentation’s sample guides are no longer read.' },
  { file: 'src/ui/workout-experience-presentation.tsx', criteria: ['TASK-AC-9165CD7E97CC'], change: 'Comment only: `guides` is the gallery’s sample; the routes read TASK-034’s guides directly.' },
] as const

function writeReceipt(name: string, receipt: Record<string, unknown>) {
  mkdirSync(RECEIPTS, { recursive: true })
  writeFileSync(join(RECEIPTS, `${name}.json`), `${JSON.stringify({ schema: 'clear-task-109-parity/v1', task: 'TASK-109', gallery: GALLERY_COMMIT, galleryChanges: GALLERY_CHANGES, ...receipt }, null, 2)}\n`)
}

/** How far, in CSS px, an element's edge or size may sit from its counterpart's. */
const LAYOUT_TOLERANCE_PX = 2

interface Box { readonly key: string; readonly x: number; readonly y: number; readonly width: number; readonly height: number }
interface LayoutDifference {
  readonly key: string
  readonly gallery: Box | null
  readonly route: Box | null
  readonly criterion: string | null
  readonly reason: string | null
}

/**
 * Every rendered element of a part (the part itself first), named by its tag,
 * its `clr-` classes and the words it draws, numbered in document order. The
 * part's data words that differ by intent (the guide's names and minutes, a
 * clock's section title) are read as placeholders, so the same element is
 * found on both sides and its box compared; the words themselves are compared
 * as lines. A heading is `h` whatever its level, and a modal dialog the part
 * holds is measured as its own part.
 */
async function boxesOf(target: Locator, placeholders: readonly (readonly [string, string])[]): Promise<Box[]> {
  return target.evaluate((root, swaps) => {
    const origin = root.getBoundingClientRect()
    const rounded = (value: number) => Math.round(value * 10) / 10
    const neutral = (words: string) => swaps.reduce((text, [from, to]) => text.split(from).join(to), words)
    const seen = new Map<string, number>()
    const boxes: { key: string; x: number; y: number; width: number; height: number }[] = []
    for (const element of [root, ...root.querySelectorAll('*')]) {
      const modal = element.closest(':modal')
      if (modal !== null && modal !== root && root.contains(modal)) continue
      if (element.closest('.clr-focus-brackets') !== null) continue
      const style = getComputedStyle(element)
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') continue
      const rect = element.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) continue
      const classes = [...element.classList].filter((name) => name.startsWith('clr-')).sort().map((name) => `.${name}`).join('')
      const words = neutral((element instanceof HTMLElement ? element.innerText : (element.textContent ?? '')).replace(/\s+/g, ' ').trim()).slice(0, 80)
      const tag = element.tagName.toLowerCase().replace(/^h[1-6]$/, 'h')
      const name = element === root ? '(part)' : `${tag}${classes}|${words}`
      const index = seen.get(name) ?? 0
      seen.set(name, index + 1)
      boxes.push({
        key: `${name}#${index}`,
        x: rounded(rect.left - origin.left),
        y: rounded(rect.top - origin.top),
        width: rounded(rect.width),
        height: rounded(rect.height),
      })
    }
    return boxes
  }, placeholders.map(([from, to]) => [from, to] as [string, string]))
}

interface IntendedLayout { readonly criterion: string; readonly reason: string; readonly match: RegExp }

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

interface Reading {
  readonly lines: string[]
  readonly boxes: Box[]
  readonly capture: { file: string; sha256: string }
  /** The control holding focus when a dialog is read, by its name. */
  readonly focus: string | null
}

/** The name of the control holding focus inside an open dialog, if any. */
async function focusOf(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const active = document.activeElement
    if (!(active instanceof HTMLElement) || active.closest('dialog[open]') === null) return null
    const labelled = active.getAttribute('aria-label')
    if (labelled !== null) return labelled
    const labels = (active as HTMLInputElement).labels
    if (labels !== undefined && labels !== null && labels.length > 0) return labels[0].textContent?.trim() ?? null
    return active.textContent?.replace(/\s+/g, ' ').trim() ?? null
  })
}

async function read(target: Locator, name: string, placeholders: readonly (readonly [string, string])[], dialog = false): Promise<Reading> {
  await expect(target).toBeVisible()
  if (!dialog) await target.evaluate((element) => element.scrollIntoView({ block: 'center' }))
  await settle(target.page())
  const focus = dialog ? await focusOf(target.page()) : null
  return { lines: await linesOf(target), boxes: await boxesOf(target, placeholders), capture: await keep(target, name), focus }
}

interface Comparison {
  readonly part: string
  readonly gallery: Reading
  readonly route: Reading
  readonly differences: Difference[]
  readonly layout: LayoutDifference[]
}

function compared(part: string, gallery: Reading, route: Reading, intended: readonly Intended[], layout: readonly IntendedLayout[] = []): Comparison {
  return { part, gallery, route, differences: compare(gallery.lines, route.lines, intended), layout: compareLayout(gallery.boxes, route.boxes, layout) }
}

function expectIntended(comparisons: readonly Comparison[], label: string) {
  for (const comparison of comparisons) {
    const unintended = comparison.differences.filter((difference) => difference.criterion === null)
    expect(unintended, `${label} ${comparison.part}: every visible difference is one a criterion intends`).toEqual([])
    expect(comparison.layout.filter((difference) => difference.criterion === null), `${label} ${comparison.part}: every element is drawn where the accepted gallery draws it, within ${LAYOUT_TOLERANCE_PX}px, unless a criterion intends otherwise`).toEqual([])
    expect(comparison.gallery.focus, `${label} ${comparison.part}: focus`).toBe(comparison.route.focus)
  }
}

function receiptOf(comparisons: readonly Comparison[]) {
  return {
    captures: Object.fromEntries(comparisons.flatMap((comparison) => [
      [`gallery-${comparison.part}`, comparison.gallery.capture], [`route-${comparison.part}`, comparison.route.capture]])),
    lines: Object.fromEntries(comparisons.map((comparison) => [comparison.part, { gallery: comparison.gallery.lines, route: comparison.route.lines }])),
    focus: Object.fromEntries(comparisons.filter((comparison) => comparison.gallery.focus !== null || comparison.route.focus !== null)
      .map((comparison) => [comparison.part, { gallery: comparison.gallery.focus, route: comparison.route.focus }])),
    differences: Object.fromEntries(comparisons.map((comparison) => [comparison.part, comparison.differences])),
    layout: {
      method: 'element boxes',
      keys: 'tag, clr- classes and words (data words that differ by intent read as placeholders)',
      tolerancePx: LAYOUT_TOLERANCE_PX,
      measured: Object.fromEntries(comparisons.map((comparison) => [comparison.part, { gallery: comparison.gallery.boxes.length, route: comparison.route.boxes.length }])),
      parts: Object.fromEntries(comparisons.map((comparison) => [comparison.part, {
        gallery: comparison.gallery.boxes.find((box) => box.key === '(part)#0') ?? null,
        route: comparison.route.boxes.find((box) => box.key === '(part)#0') ?? null,
      }])),
      differences: Object.fromEntries(comparisons.map((comparison) => [comparison.part, comparison.layout])),
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The preparation state
// ─────────────────────────────────────────────────────────────────────────────

/** The gallery's illustrated sample (src/dev/gallery-refinement-runtime.tsx), as drawn. */
const SAMPLE = {
  'Warm-up': ['Arm circles', 'Scapular push-ups', 'Bench press rehearsal'],
  Cooldown: ['Chest stretch', 'Thoracic rotation', 'Child’s pose'],
} as const

type Title = keyof typeof SAMPLE

const NAMES_INTENDED = {
  criterion: 'AC-R034-01',
  reason: 'Real data only (TASK-AC-9165CD7E97CC): each route names its guide’s movements with the catalog reader (`exerciseName` over the prescription’s slug, lower case, no apostrophe), from the same three movements the gallery’s illustrated sample lists in sentence case.',
} as const
const MINUTES_INTENDED = {
  criterion: 'AC-R022-01',
  reason: 'The approximate time is TASK-034’s estimate of the actual prescriptions (three one-set movements, ~4 minutes), never the gallery’s illustrated ~3 minutes for the Cooldown.',
} as const
const CLOCK_TITLE_INTENDED = {
  criterion: 'TASK-AC-4BF91CC8AA52',
  reason: 'Each section has its own preparation clock: the live Cooldown’s clock is titled by its section, where the gallery state draws only the Warm-up’s clock.',
} as const

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function guideIntended(title: Title, routeNames: readonly string[], routeMinutes: string): Intended[] {
  const names = (side: Difference['side'], list: readonly string[]) => list.map((name): Intended => ({
    ...NAMES_INTENDED, side, match: new RegExp(`^${escape(name)}$`, 'i'),
  }))
  return [
    ...names('gallery only', SAMPLE[title]),
    ...names('route only', routeNames),
    ...(title === 'Cooldown' ? [
      { ...MINUTES_INTENDED, side: 'gallery only' as const, match: /^~3 minutes$/i },
      { ...MINUTES_INTENDED, side: 'route only' as const, match: new RegExp(`^${escape(routeMinutes)}$`, 'i') },
    ] : []),
  ]
}

function guidePlaceholders(names: readonly string[], minutes: string): (readonly [string, string])[] {
  return [
    ...names.map((name, index) => [name, `NAME-${index + 1}`] as const),
    ...names.map((name, index) => [name.toUpperCase(), `NAME-${index + 1}`] as const),
    [minutes, '~N MINUTES'], [minutes.toUpperCase(), '~N MINUTES'],
  ]
}

const guideCard = (scope: Locator | Page, title: Title) => scope.locator(`[data-preparation-guide="${title}"]`).locator('.clr-card').first()
const clockOf = (scope: Locator | Page, title: Title) => scope.getByRole('region', { name: `${title} timer`, exact: true })

for (const { name, viewport } of VIEWPORTS) {
  test(`TASK-AC-975923E1E25C preparation ${name}: /review, /workout and /history/:id draw Round 7’s Warm-up and Cooldown guides and the Warm-up’s clock as the accepted preparation state does, from the real prescriptions`, async ({ page, visit }) => {
    test.setTimeout(240_000)
    await page.setViewportSize(viewport)
    await installDeterministicCapture(page, { skin: 'clear', reducedMotion: true })
    const acceptance = parityAcceptance()
    const guides = {
      'Warm-up': composedPreparationGuide(acceptance.workout.sections[0])!,
      Cooldown: composedPreparationGuide(acceptance.workout.sections[3])!,
    }
    // Matched to the sample: three names per guide; the Warm-up's estimate is the sample's ~4 minutes.
    expect(guides['Warm-up'].movementCount).toBe(SAMPLE['Warm-up'].length)
    expect(guides.Cooldown.movementCount).toBe(SAMPLE.Cooldown.length)
    expect(guides['Warm-up'].durationText).toBe('~4 minutes')
    const routeNames = (title: Title) => guides[title].movements.map((movement) => movement.name)

    // The accepted state: the shared owner over the gallery's sample.
    await visit('/gallery/refinements?state=preparation')
    const state = page.locator('[data-refinement-state="preparation"]')
    const gallery: Record<string, Reading> = {}
    for (const title of ['Warm-up', 'Cooldown'] as const) {
      gallery[title] = await read(guideCard(state, title), `preparation-${name}-gallery-${title.toLowerCase()}`, guidePlaceholders(SAMPLE[title], title === 'Cooldown' ? '~3 minutes' : '~4 minutes'))
    }
    gallery.clock = await read(clockOf(state, 'Warm-up'), `preparation-${name}-gallery-clock`, [['Warm-up', 'TITLE'], ['WARM-UP', 'TITLE']])

    const app = await syntheticApp(page, acceptance)
    const comparisons: Comparison[] = []
    const compareGuide = async (route: string, title: Title, scope: Page) => {
      const reading = await read(guideCard(scope, title), `preparation-${name}-${route}-${title.toLowerCase()}`, guidePlaceholders(routeNames(title), guides[title].durationText))
      comparisons.push(compared(`${route}-${title.toLowerCase()}`, gallery[title], reading, guideIntended(title, routeNames(title), guides[title].durationText)))
    }

    // /review: the composed workout, each guide in its place, no clock.
    await visit('/review')
    await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(acceptance.workout.title)
    for (const title of ['Warm-up', 'Cooldown'] as const) await compareGuide('review', title, page)
    await expect(page.locator('main').getByRole('timer')).toHaveCount(0)

    // /workout: the running session's rows, each guide with its own clock, ready.
    app.setActive(true)
    await visit('/workout')
    await expect(page.getByRole('navigation', { name: 'Workout sections' })).toBeVisible()
    await compareGuide('workout', 'Warm-up', page)
    comparisons.push(compared('workout-warm-up-clock', gallery.clock,
      await read(clockOf(page, 'Warm-up'), `preparation-${name}-workout-warm-up-clock`, [['Warm-up', 'TITLE'], ['WARM-UP', 'TITLE']]), []))
    await page.getByRole('button', { name: 'All sections' }).click()
    await page.getByRole('button', { name: /^Cooldown, / }).click()
    await expect(clockOf(page, 'Cooldown')).toBeVisible()
    await compareGuide('workout', 'Cooldown', page)
    comparisons.push(compared('workout-cooldown-clock', gallery.clock,
      await read(clockOf(page, 'Cooldown'), `preparation-${name}-workout-cooldown-clock`, [['Cooldown', 'TITLE'], ['COOLDOWN', 'TITLE']]), [
        { ...CLOCK_TITLE_INTENDED, side: 'gallery only', match: /^warm-up$/i },
        { ...CLOCK_TITLE_INTENDED, side: 'route only', match: /^cooldown$/i },
      ], [
        // The clock's label is its section's title: "Cooldown" is wider than "Warm-up".
        { ...CLOCK_TITLE_INTENDED, match: /^p\|TITLE#0$/ },
      ]))

    // /history/:id: the record's own rows, no clock.
    app.setActive(false)
    await visit(`/history/${app.sessionId}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(acceptance.workout.title)
    for (const title of ['Warm-up', 'Cooldown'] as const) await compareGuide('history', title, page)
    await expect(page.locator('main').getByRole('timer')).toHaveCount(0)

    writeReceipt(`preparation-${name}`, {
      state: 'preparation', width: viewport.width, routes: ['/review', '/workout', '/history/:id'],
      drive: 'gallery state as loaded (the sample guides, the Warm-up’s clock ready); /review as handed off; /workout on its Warm-up, then its Cooldown by the section list; /history/:id of the same session as performed',
      parts: {
        card: 'the guide’s own card ([data-preparation-guide] .clr-card), title, approximate time and names',
        clock: 'the preparation clock’s region (“<title> timer”), ready: label, digits, fill and its actions',
      },
      matchedData: {
        gallery: SAMPLE,
        route: { 'Warm-up': { names: routeNames('Warm-up'), time: guides['Warm-up'].durationText }, Cooldown: { names: routeNames('Cooldown'), time: guides.Cooldown.durationText } },
      },
      ...receiptOf(comparisons),
    })
    expectIntended(comparisons, `preparation @${name}`)
    app.assertContained()
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// The grouped disclosure and the movement note
// ─────────────────────────────────────────────────────────────────────────────

const disclosureName = (format: string, names: readonly string[]) => `Coaching and notes — ${format}: ${names.join(', ')}`

/** The disclosure's own part: the block card's child that holds its trigger. */
function disclosureOf(scope: Locator | Page, format: string, names: readonly string[]): Locator {
  const page = 'page' in scope ? scope.page() : scope
  const toggle = page.getByRole('button', { name: disclosureName(format, names), exact: true })
  return scope.locator('.clr-movement-group > *').filter({ has: toggle })
}

const SUPERSET = ['one arm row', 'bicep curl'] as const
const TIMED = [['EMOM', ['kb swing']], ['AMRAP', ['burpee']], ['FOR TIME', ['wall ball']]] as const

for (const { name, viewport } of VIEWPORTS) {
  test(`TASK-AC-975923E1E25C movement-note ${name}: /workout’s grouped superset opens its one Coaching and notes disclosure and the Movement note dialog as the accepted movement-note state does`, async ({ page, visit }) => {
    test.setTimeout(240_000)
    await page.setViewportSize(viewport)
    await installDeterministicCapture(page, { skin: 'clear', reducedMotion: true })
    const acceptance = parityAcceptance()

    // The accepted state: SupersetBlock on the gallery's memory runtime; its driver opens the disclosure, then the first note.
    await visit('/gallery/refinements?state=movement-note')
    const scope = page.locator('[data-refinement-state="movement-note"]')
    const galleryClosed = await read(disclosureOf(scope, 'SUPERSET', SUPERSET), `movement-note-${name}-gallery-closed`, [])
    await scope.getByRole('button', { name: 'Open Movement note', exact: true }).click()
    const galleryDialog = page.getByRole('dialog', { name: 'Movement note', exact: true })
    await expect(galleryDialog).toBeVisible({ timeout: 15_000 })
    await expect(galleryDialog.getByRole('textbox', { name: 'one arm row', exact: true })).toBeVisible()
    const galleryOpen = await read(disclosureOf(scope, 'SUPERSET', SUPERSET), `movement-note-${name}-gallery-open`, [])
    const galleryNote = await read(galleryDialog, `movement-note-${name}-gallery-dialog`, [], true)

    // The real route: the running session's superset, driven the same way.
    const app = await syntheticApp(page, acceptance)
    app.setActive(true)
    await visit('/workout')
    await expect(page.getByRole('navigation', { name: 'Workout sections' })).toBeVisible()
    await page.getByRole('button', { name: 'All sections' }).click()
    await page.getByRole('button', { name: /^Accessor(y|ies), / }).click()
    const toggle = page.getByRole('button', { name: disclosureName('SUPERSET', SUPERSET), exact: true })
    await expect(toggle).toBeVisible()
    const routeClosed = await read(disclosureOf(page, 'SUPERSET', SUPERSET), `movement-note-${name}-route-closed`, [])
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await page.getByRole('button', { name: 'Add note — one arm row', exact: true }).click()
    const routeDialog = page.getByRole('dialog', { name: 'Movement note', exact: true })
    await expect(routeDialog).toBeVisible()
    const routeOpen = await read(disclosureOf(page, 'SUPERSET', SUPERSET), `movement-note-${name}-route-open`, [])
    const routeNote = await read(routeDialog, `movement-note-${name}-route-dialog`, [], true)

    const comparisons = [
      compared('disclosure-closed', galleryClosed, routeClosed, []),
      compared('disclosure-open', galleryOpen, routeOpen, []),
      compared('dialog', galleryNote, routeNote, []),
    ]
    writeReceipt(`movement-note-${name}`, {
      state: 'movement-note', width: viewport.width, route: '/workout',
      drive: 'the superset’s disclosure closed; its trigger; “Add note — one arm row” → Movement note (the gallery’s driver presses the same two controls)',
      parts: {
        'disclosure-closed': 'the grouped Coaching and notes disclosure, the block card’s last part, closed',
        'disclosure-open': 'the same disclosure open behind the dialog: a labelled section per movement, the library’s “no entry” answer, each note’s opener',
        dialog: 'the open Movement note dialog: its title, the field labelled by the movement, Save note',
      },
      ...receiptOf(comparisons),
    })
    expectIntended(comparisons, `movement-note @${name}`)
    app.assertContained()
  })

  test(`TASK-AC-975923E1E25C cards ${name}: /workout’s EMOM, AMRAP and For Time cards each end with the one Coaching and notes disclosure the accepted cards state draws, closed and open`, async ({ page, visit }) => {
    test.setTimeout(240_000)
    await page.setViewportSize(viewport)
    await installDeterministicCapture(page, { skin: 'clear', reducedMotion: true })
    const acceptance = parityAcceptance()

    await visit('/gallery/refinements?state=cards')
    const scope = page.locator('[data-refinement-state="cards"]')
    const gallery: Record<string, Reading> = {}
    for (const [format, names] of TIMED) {
      gallery[`${format}-closed`] = await read(disclosureOf(scope, format, names), `cards-${name}-gallery-${format.toLowerCase().replace(' ', '-')}-closed`, [])
      await scope.getByRole('button', { name: disclosureName(format, names), exact: true }).click()
      await expect(scope.getByRole('region', { name: disclosureName(format, names), exact: true }).getByText('The library has no entry for this movement, so there are no cues or regression.')).toBeVisible()
      gallery[`${format}-open`] = await read(disclosureOf(scope, format, names), `cards-${name}-gallery-${format.toLowerCase().replace(' ', '-')}-open`, [])
    }

    const app = await syntheticApp(page, acceptance)
    app.setActive(true)
    await visit('/workout')
    await expect(page.getByRole('navigation', { name: 'Workout sections' })).toBeVisible()
    await page.getByRole('button', { name: 'All sections' }).click()
    await page.getByRole('button', { name: /^Conditioning, / }).click()
    const comparisons: Comparison[] = []
    for (const [format, names] of TIMED) {
      const toggle = page.getByRole('button', { name: disclosureName(format, names), exact: true })
      await expect(toggle).toBeVisible()
      const closed = await read(disclosureOf(page, format, names), `cards-${name}-route-${format.toLowerCase().replace(' ', '-')}-closed`, [])
      await toggle.click()
      await expect(page.getByRole('region', { name: disclosureName(format, names), exact: true }).getByText('The library has no entry for this movement, so there are no cues or regression.')).toBeVisible()
      const open = await read(disclosureOf(page, format, names), `cards-${name}-route-${format.toLowerCase().replace(' ', '-')}-open`, [])
      comparisons.push(compared(`${format.toLowerCase().replace(' ', '-')}-closed`, gallery[`${format}-closed`], closed, []))
      comparisons.push(compared(`${format.toLowerCase().replace(' ', '-')}-open`, gallery[`${format}-open`], open, []))
    }
    writeReceipt(`cards-${name}`, {
      state: 'cards', width: viewport.width, route: '/workout',
      drive: 'each timed card’s disclosure closed, then its trigger pressed: open, its movement’s labelled section, the library’s “no entry” answer and its note opener',
      parts: { disclosure: 'the grouped Coaching and notes disclosure, the timed card’s last part' },
      ...receiptOf(comparisons),
    })
    expectIntended(comparisons, `cards @${name}`)
    app.assertContained()
  })
}
