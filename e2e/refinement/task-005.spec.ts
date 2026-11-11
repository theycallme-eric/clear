import { spawn } from 'node:child_process'
import { createServer, type AddressInfo } from 'node:net'
import { resolve } from 'node:path'
import type { Locator, Page, Route } from '@playwright/test'

import { readE2eEnv } from '../../scripts/e2e/env.mjs'
import { reviewHandoff } from '../../src/state/review-handoff'
import { sessionSnapshotSchema, type SessionAcceptance, type SessionSnapshot, type WorkoutExerciseRow } from '../../src/state/schemas'
import {
  blankDefinition,
  COACHING_GUIDANCE,
  COACHING_LISTS,
  groupDisclosureName,
  groupedCoachingAcceptance,
  GROUPED_FORMATS,
  GROUPED_MOVEMENTS,
  writtenDefinition,
  type GuidanceAnswer,
} from '../../src/test/grouped-coaching-fixture'
import { peerGroupingSnapshot } from '../../src/test/peer-grouping-fixture'
import { fixtureLocation, onboardedProfile } from '../../src/test/user-data-double'
import { installDeterministicCapture } from '../design-0143/fixtures'
import { expect, test as scanned } from '../fixtures'

/**
 * TASK-005 (REQ-005; C16, G11, G21, R29, R36, R73; JOURNEY-005) — one grouped
 * Coaching and notes disclosure on the real `/review` and `/workout` routes.
 *
 * Entry: a planned workout with a standard lift, a superset and a circuit
 * reaches `/review` through the existing hand-off, behind the existing auth
 * guard; Start persists and starts it. Action: open a grouped block's bottom
 * Coaching and notes disclosure and edit one movement's note. Result, read
 * from the browser at phone widths: one disclosure at the foot of each grouped
 * card, below its movements and actions, with a labelled section per movement;
 * each movement's guidance and note keep their own state — a save writes only
 * that movement's row, a refused save keeps its words and its retry stores
 * them, and close/reopen keeps every draft. Missing coaching, blank guidance,
 * a blank note, loading and a failed read stay distinct. Keyboard, touch and
 * reduced motion reach all of it.
 *
 * Synthetic and contained: an intercepted session for a fictional user, a
 * synthetic catalog and a synthetic note writer. The only writes the app
 * attempts are Start's two session calls and the note PATCHes asked for here,
 * answered by this file and never forwarded; no set is logged, no model is
 * called and no real account or row exists to mutate.
 */
const OWNER = '00000000-0000-4000-8000-000000000501'
const PLACE = '00000000-0000-4000-8000-000000000511'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
}

const e2e = readE2eEnv()
const SYNTHETIC_ORIGIN_NEEDED = !e2e.usesExternalTarget && (e2e.url === null || e2e.anonKey === null)
const REPO_ROOT = resolve(import.meta.dirname, '..', '..')

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

/** Ready only when the server answering is this checkout's own. */
async function waitForOrigin(origin: string, deadline: number, exited: () => number | null) {
  const own = `${origin}/@fs${resolve(REPO_ROOT, 'package.json')}`
  while (Date.now() < deadline) {
    const code = exited()
    if (code !== null) throw new Error(`Synthetic TASK-005 server exited (${code}) before ${origin} was ready`)
    try {
      if ((await fetch(origin)).ok && (await fetch(own)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((settle) => setTimeout(settle, 250))
  }
  throw new Error(`Synthetic TASK-005 origin ${origin} did not start`)
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
          VITE_SUPABASE_URL: 'https://synthetic-task-005.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-task-005-public-placeholder',
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
/** The approved mobile scope: the narrow phone and the project's own phone. */
const VIEWPORTS: ReadonlyArray<{ name: string; viewport: Viewport }> = [
  { name: 'phone-320', viewport: { width: 320, height: 568 } },
  { name: 'phone-390', viewport: { width: 390, height: 844 } },
]

// ─────────────────────────────────────────────────────────────────────────────
// The synthetic app
// ─────────────────────────────────────────────────────────────────────────────

interface AppOptions {
  /** How the catalog answers each slug. */
  answers?: Readonly<Record<string, GuidanceAnswer>>
  /** Movement slugs whose first note write is refused. */
  failFirst?: readonly string[]
  reducedMotion?: boolean
}

interface NoteWrite {
  readonly slug: string
  readonly notes: string | null
  readonly stored: boolean
}

async function syntheticApp(page: Page, acceptance: SessionAcceptance, options: AppOptions = {}) {
  const answers = options.answers ?? COACHING_GUIDANCE
  const startedAt = new Date(Date.now() - 60_000).toISOString()
  const prescribed = sessionSnapshotSchema.parse(peerGroupingSnapshot(acceptance, { userId: OWNER }))
  const running: SessionSnapshot = sessionSnapshotSchema.parse(
    peerGroupingSnapshot(acceptance, { userId: OWNER, startedAt }),
  )
  const rows = new Map<string, WorkoutExerciseRow>(
    running.sections.flatMap((section) => section.blocks)
      .flatMap((block) => block.exercises.map(({ exercise }) => [exercise.id, exercise] as const)),
  )
  const writes: string[] = []
  const notes: NoteWrite[] = []
  const reads: string[] = []
  const unexpected: string[] = []
  const failedOnce = new Set<string>()
  let releaseHeld: () => void = () => {}
  const held = new Promise<void>((settle) => { releaseHeld = settle })
  let started = false
  const guard = await installDeterministicCapture(page, { skin: 'clear', reducedMotion: options.reducedMotion ?? true })

  const handler = async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    const name = url.pathname.split('/').at(-1) ?? ''
    const reply = (body: unknown, status = 200) =>
      route.fulfill({ status, headers: CORS, json: body }).catch(() => undefined)
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (url.pathname.startsWith('/functions/v1/')) {
      unexpected.push(`${request.method()} ${url.pathname}`)
      return route.abort('blockedbyclient')
    }
    if (request.method() === 'GET') {
      if (name === 'profiles') return reply([onboardedProfile({ id: OWNER, goal_preset: 'balanced' })])
      if (name === 'locations') return reply([fixtureLocation({ id: PLACE, user_id: OWNER, tier: 'full', is_default: true })])
      if (name === 'exercise_definitions') {
        const slug = url.searchParams.get('id')?.replace(/^eq\./, '') ?? ''
        reads.push(slug)
        switch (answers[slug] ?? 'absent') {
          case 'written': return reply([writtenDefinition(slug)])
          case 'blank': return reply([blankDefinition(slug)])
          case 'absent': return reply([])
          case 'fails-once':
            if (!failedOnce.has(slug)) {
              failedOnce.add(slug)
              return reply({ code: 'PGRST000', message: 'Synthetic read failure.' }, 503)
            }
            return reply([writtenDefinition(slug)])
          case 'held':
            await held
            return reply([writtenDefinition(slug)])
        }
      }
      if (name === 'workout_exercises') return reply([...rows.values()])
      // Every other read is an empty answer: no history, anchors or favorites.
      return reply([])
    }
    if (request.method() === 'PATCH' && name === 'workout_exercises') {
      const id = url.searchParams.get('id')?.replace(/^eq\./, '') ?? ''
      const row = rows.get(id)
      const body = request.postDataJSON() as { exercise_notes?: string | null }
      expect(Object.keys(body), 'A note write carries the note column and nothing else').toEqual(['exercise_notes'])
      if (row === undefined) {
        unexpected.push(`PATCH workout_exercises ${id}`)
        return reply([])
      }
      const slug = row.exercise_id
      const attempt = notes.filter((write) => write.slug === slug).length + 1
      if ((options.failFirst ?? []).includes(slug) && attempt === 1) {
        notes.push({ slug, notes: body.exercise_notes ?? null, stored: false })
        return reply({ code: 'PGRST000', message: 'Synthetic write failure.' }, 503)
      }
      notes.push({ slug, notes: body.exercise_notes ?? null, stored: true })
      const stored = { ...row, exercise_notes: body.exercise_notes ?? null }
      rows.set(id, stored)
      return reply([stored])
    }
    if (request.method() === 'POST' && url.pathname.includes('/rpc/')) {
      if (name === 'resume_session') return reply(started ? running : null)
      if (name === 'session_snapshot') return reply(started ? running : prescribed)
      if (name === 'session_as_performed') return reply(null)
      if (name === 'persist_session') {
        writes.push(name)
        expect(request.postDataJSON()).toMatchObject({ p_user_id: OWNER, p_session: { workout: { title: acceptance.workout.title } } })
        return reply(prescribed)
      }
      if (name === 'start_session') {
        writes.push(name)
        started = true
        return reply({ outcome: 'started', state: 'active', session: running.session })
      }
      if (['streak_sessions', 'constraints_in_force', 'anchor_evidence', 'conditioning_history',
        'generation_refusal_diagnostics', 'generation_candidate_sets_for_goal', 'generation_candidate_sets'].includes(name)) return reply([])
    }
    unexpected.push(`${request.method()} ${url.pathname}`)
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic TASK-005 request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ owner, handoff }) => {
    localStorage.setItem('clear.auth.session', JSON.stringify({
      accessToken: 'synthetic-task-005-session', refreshToken: 'synthetic-task-005-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-task-005@example.invalid' },
    }))
    if (location.pathname === '/review') {
      history.replaceState({ usr: handoff, key: 'synthetic-task-005', idx: 0 }, '', location.href)
    }
  }, { owner: OWNER, handoff: reviewHandoff(acceptance) })

  return {
    notes: () => [...notes],
    reads: () => [...reads],
    release: () => releaseHeld(),
    assertContained() {
      expect(unexpected, 'Every API request has an explicit synthetic disposition').toEqual([])
      expect(writes, 'Only Start’s session calls are attempted, once each; no set is logged').toEqual(['persist_session', 'start_session'])
      expect(guard.blockedGenerations()).toBe(0)
    },
  }
}

async function settle(page: Page) {
  await page.evaluate(async () => {
    void document.body.offsetHeight
    await Promise.all([...document.fonts].map((face) => face.load().catch(() => undefined)))
    await document.fonts.ready
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
  })
  // A screen entering is read once its finite transitions have finished.
  await page.waitForFunction(() => {
    const main = document.querySelector('main')
    return main !== null && main.getAnimations({ subtree: true })
      .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
      .every((animation) => animation.playState !== 'running')
  })
}

async function openReview(page: Page, visit: (path: string) => Promise<void>, acceptance: SessionAcceptance) {
  await visit('/review')
  await expect(page).toHaveURL(/\/review$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(acceptance.workout.title)
  await settle(page)
}

async function startWorkout(page: Page, checkA11y: () => Promise<void>) {
  await page.getByRole('button', { name: 'Start workout' }).click()
  await expect(page).toHaveURL(/\/workout$/)
  await expect(page.getByRole('list', { name: COACHING_LISTS.workout.superset, exact: true })).toBeVisible()
  await settle(page)
  await checkA11y()
}

/**
 * Delivered-revision visual evidence: the scrolling content, attached to the
 * case — read in a taller viewport at the same width so the whole screen fits.
 */
async function attachCapture(page: Page, name: string) {
  const viewport = page.viewportSize()!
  await page.setViewportSize({ width: viewport.width, height: 4000 })
  try {
    await page.evaluate(() => document.querySelectorAll('.clr-scroll-region__scroller').forEach((scroller) => scroller.scrollTo(0, 0)))
    await settle(page)
    const scroller = page.locator('main .clr-scroll-region__scroller').first()
    const body = await scroller.screenshot({ caret: 'hide' }).catch(() => page.screenshot({ caret: 'hide' }))
    await test.info().attach(`${name}.png`, { body, contentType: 'image/png' })
  } finally {
    await page.setViewportSize(viewport)
    await settle(page)
  }
}

/**
 * One card's image. Taller, at the same width, and scrolled to the top, so the
 * whole card is in view and nothing pinned covers it; the layout under test is
 * the width's, and the viewport is restored after.
 */
async function attachCard(page: Page, card: Locator, name: string) {
  const viewport = page.viewportSize()!
  await page.setViewportSize({ width: viewport.width, height: 4000 })
  try {
    await page.evaluate(() => document.querySelectorAll('.clr-scroll-region__scroller').forEach((scroller) => scroller.scrollTo(0, 0)))
    await settle(page)
    await test.info().attach(`${name}.png`, { body: await card.screenshot({ caret: 'hide' }), contentType: 'image/png' })
  } finally {
    await page.setViewportSize(viewport)
    await settle(page)
  }
}

async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
}

// ─────────────────────────────────────────────────────────────────────────────
// Reading the screen
// ─────────────────────────────────────────────────────────────────────────────

type Grouped = keyof typeof GROUPED_MOVEMENTS

function toggleOf(page: Page, block: Grouped): Locator {
  return page.getByRole('button', { name: groupDisclosureName(GROUPED_FORMATS[block], GROUPED_MOVEMENTS[block]), exact: true })
}

function regionOf(page: Page, block: Grouped): Locator {
  return page.getByRole('region', { name: groupDisclosureName(GROUPED_FORMATS[block], GROUPED_MOVEMENTS[block]), exact: true })
}

function sectionOf(region: Locator, name: string): Locator {
  return region.getByRole('group', { name, exact: true })
}

function noteOf(scope: Locator, name: string): Locator {
  return scope.getByRole('textbox', { name: new RegExp(`^Notes — ${name}`) })
}

function saveOf(scope: Locator, name: string): Locator {
  return scope.getByRole('button', { name: `Save note — ${name}`, exact: true })
}

/**
 * TASK-045: a movement's note is entered in the shared focused logging
 * dialog. Its section keeps one opener, "Add note — <movement>" (or "Edit
 * note — …" once the field holds words); the dialog "Notes — <movement>"
 * holds the field, Save note and, while open, the note's status.
 */
function openerOf(scope: Locator, name: string): Locator {
  return scope.getByRole('button', { name: new RegExp(`^(Add|Edit) note — ${name}$`) })
}

function noteDialog(scope: Locator, name: string): Locator {
  return scope.page().getByRole('dialog', { name: `Notes — ${name}`, exact: true })
}

/** Opens one movement's note by touch from its own section; answers its dialog. */
async function openNote(scope: Locator, name: string): Promise<Locator> {
  await openerOf(scope, name).tap()
  const dialog = noteDialog(scope, name)
  await expect(dialog).toBeVisible()
  return dialog
}

/** Closes the note's dialog by touch with its X; the draft stays. */
async function closeNote(dialog: Locator) {
  await dialog.getByRole('button', { name: 'Close log', exact: true }).tap()
  await expect(dialog).toBeHidden()
}

type Box = { top: number; bottom: number; left: number; right: number; height: number }

interface DisclosureGeometry {
  isLast: boolean
  inCard: number
  visibleLabel: string
  hiddenQualifierClipped: boolean
  group: Box
  card: Box
  rowsBottom: number
  controlsBottom: number
  regionHeight: number
  sectionHeadings: string[]
  sections: Box[]
  transition: string
  rowDisclosures: number
}

async function readDisclosure(toggle: Locator): Promise<DisclosureGeometry> {
  return toggle.evaluate((button) => {
    const box = (node: Element) => {
      const rect = node.getBoundingClientRect()
      return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, height: rect.height }
    }
    const card = button.closest('[data-workout-card]')!
    const group = button.closest('[data-coaching-group]')!
    const region = group.querySelector('[role="region"]')!
    const hidden = button.querySelector('.a11y-hidden')!
    const hiddenStyle = getComputedStyle(hidden)
    const outside = [...card.querySelectorAll('button')].filter((control) => !group.contains(control))
    const rows = [...card.querySelectorAll('[data-movement-identity]')].filter((row) => !group.contains(row))
    return {
      isLast: card.lastElementChild === group,
      inCard: card.querySelectorAll('[data-coaching-group]').length,
      visibleLabel: [...button.childNodes]
        .filter((node) => !(node instanceof Element && node.classList.contains('a11y-hidden')))
        .map((node) => node.textContent ?? '').join('').trim(),
      hiddenQualifierClipped: hiddenStyle.position === 'absolute' && hiddenStyle.clipPath.includes('inset(50%)'),
      group: box(group),
      card: box(card),
      rowsBottom: Math.max(...rows.map((row) => row.getBoundingClientRect().bottom)),
      controlsBottom: Math.max(...outside.map((control) => control.getBoundingClientRect().bottom)),
      regionHeight: region.getBoundingClientRect().height,
      sectionHeadings: [...group.querySelectorAll('[data-coaching-movement]')]
        .map((section) => section.querySelector('h1, h2, h3, h4, h5, h6')?.textContent ?? ''),
      sections: [...group.querySelectorAll('[data-coaching-movement]')].map(box),
      transition: getComputedStyle(region).transitionDuration,
      rowDisclosures: [...card.querySelectorAll('.clr-collapsible__trigger')].filter((trigger) => !group.contains(trigger)).length,
    }
  })
}

const TOLERANCE = 1

/**
 * C16, R29, R36: one disclosure at the foot of the card — the card's last
 * part, below every movement and every control, inside the card — whose
 * visible label is the accepted words, with a labelled section per movement
 * and no disclosure left in any row.
 */
function expectBottomDisclosure(geometry: DisclosureGeometry, names: readonly string[], label: string) {
  expect(geometry.inCard, `${label}: one disclosure in the card`).toBe(1)
  expect(geometry.isLast, `${label}: the card's last part`).toBe(true)
  expect(geometry.rowDisclosures, `${label}: no disclosure repeated in a row`).toBe(0)
  expect(geometry.group.top, `${label}: below every movement`).toBeGreaterThanOrEqual(geometry.rowsBottom - TOLERANCE)
  expect(geometry.group.top, `${label}: below every control`).toBeGreaterThanOrEqual(geometry.controlsBottom - TOLERANCE)
  expect(geometry.group.bottom, `${label}: inside the card`).toBeLessThanOrEqual(geometry.card.bottom + TOLERANCE)
  expect(geometry.group.left, `${label}: inside the card`).toBeGreaterThanOrEqual(geometry.card.left - TOLERANCE)
  expect(geometry.group.right, `${label}: inside the card`).toBeLessThanOrEqual(geometry.card.right + TOLERANCE)
  expect(geometry.visibleLabel, `${label}: the accepted visible label`).toBe('Coaching and notes')
  expect(geometry.hiddenQualifierClipped, `${label}: the movement names are for assistive technology only`).toBe(true)
  expect(geometry.sectionHeadings, `${label}: a labelled section per movement, in order`).toEqual([...names])
}

// ─────────────────────────────────────────────────────────────────────────────

test.describe('TASK-005 one grouped coaching and notes disclosure', () => {
  for (const { name, viewport } of VIEWPORTS) {
    test(`JOURNEY-005 ${name}: Review then Workout — one bottom disclosure per grouped block, and each movement's note saves and fails on its own`, async ({ page, visit, checkA11y }) => {
      await page.setViewportSize(viewport)
      const acceptance = groupedCoachingAcceptance({ locationId: PLACE })
      const app = await syntheticApp(page, acceptance, { failFirst: ['goblet-squat'] })
      await openReview(page, visit, acceptance)

      // Review: the grouped blocks, planned. Before Start there is no row for a
      // note, so Review offers no disclosure and no field.
      for (const list of Object.values(COACHING_LISTS.review)) {
        await expect(page.getByRole('list', { name: list, exact: true })).toBeVisible()
      }
      await expect(page.locator('main').getByRole('button', { name: /^Coaching and notes/ })).toHaveCount(0)
      await expect(page.locator('main').getByRole('textbox', { name: /^Notes — / })).toHaveCount(0)
      await expect(page.locator('main').getByRole('button', { name: /^(Add|Edit) note — / })).toHaveCount(0)
      await noHorizontalOverflow(page)
      await attachCapture(page, `review-${name}`)

      await startWorkout(page, checkA11y)
      // Closed until asked for: nothing read, nothing written.
      expect(app.reads()).toEqual([])
      for (const [structure, names] of Object.entries(GROUPED_MOVEMENTS)) {
        const toggle = toggleOf(page, structure as Grouped)
        await expect(toggle).toHaveAttribute('aria-expanded', 'false')
        const closed = await readDisclosure(toggle)
        expectBottomDisclosure(closed, names, `${structure} closed @${name}`)
        expect(closed.regionHeight, `${structure}: collapsed`).toBeLessThanOrEqual(TOLERANCE)
      }
      // The standard lift keeps its own disclosure, in its row.
      const standard = page.getByRole('list', { name: COACHING_LISTS.workout.standard, exact: true })
      await expect(standard.getByRole('button', { name: 'Coaching and notes — back squat', exact: true })).toBeVisible()
      await noHorizontalOverflow(page)
      await attachCapture(page, `workout-closed-${name}`)

      // Open the superset's disclosure by touch and edit one movement's note.
      const superset = GROUPED_MOVEMENTS.superset
      await toggleOf(page, 'superset').tap()
      await expect(toggleOf(page, 'superset')).toHaveAttribute('aria-expanded', 'true')
      const supersetRegion = regionOf(page, 'superset')
      const bench = sectionOf(supersetRegion, 'dumbbell bench press')
      const row = sectionOf(supersetRegion, 'chest supported row')
      await expect(bench.getByText('Cue for dumbbell bench press')).toBeVisible()
      await expect(row.getByText('The library has no entry for this movement, so there are no cues or regression.')).toBeVisible()
      const open = await readDisclosure(toggleOf(page, 'superset'))
      expectBottomDisclosure(open, superset, `superset open @${name}`)
      // Sections stack inside the disclosure, one after the other.
      expect(open.sections[1].top).toBeGreaterThanOrEqual(open.sections[0].bottom - TOLERANCE)

      let dialog = await openNote(row, 'chest supported row')
      await noteOf(dialog, 'chest supported row').fill('Chest stays on the pad')
      await closeNote(dialog)
      dialog = await openNote(bench, 'dumbbell bench press')
      await noteOf(dialog, 'dumbbell bench press').fill('Pause at the bottom')
      await saveOf(dialog, 'dumbbell bench press').tap()
      await expect(dialog.getByText('Note saved')).toBeVisible()
      await closeNote(dialog)
      await expect(bench.getByText('Note saved')).toBeVisible()
      expect(app.notes()).toEqual([{ slug: 'dumbbell-bench-press', notes: 'Pause at the bottom', stored: true }])
      await expect(row.getByText('Note saved')).toHaveCount(0)
      dialog = await openNote(row, 'chest supported row')
      await expect(noteOf(dialog, 'chest supported row')).toHaveValue('Chest stays on the pad')
      await closeNote(dialog)

      // The circuit: a refused save is its own movement's, and its retry stores it.
      await toggleOf(page, 'circuit').tap()
      const circuitRegion = regionOf(page, 'circuit')
      const goblet = sectionOf(circuitRegion, 'goblet squat')
      const swing = sectionOf(circuitRegion, 'kb swing')
      dialog = await openNote(goblet, 'goblet squat')
      await noteOf(dialog, 'goblet squat').fill('Heels down')
      await saveOf(dialog, 'goblet squat').tap()
      await expect(dialog.getByText('Your note didn’t save. It is still in the field — try again.')).toBeVisible()
      await expect(noteOf(dialog, 'goblet squat')).toHaveValue('Heels down')
      await expect(noteOf(dialog, 'goblet squat')).toHaveAttribute('aria-invalid', 'true')
      await checkA11y()
      await closeNote(dialog)
      await expect(goblet.getByText('Not saved')).toBeVisible()
      await expect(swing.getByText('Not saved')).toHaveCount(0)
      await expect(bench.getByText('Note saved')).toBeVisible()
      await checkA11y()
      await noHorizontalOverflow(page)
      await attachCard(page, page.locator('[data-workout-card="workout"]').filter({ has: supersetRegion }), `superset-open-${name}`)
      await attachCard(page, page.locator('[data-workout-card="workout"]').filter({ has: circuitRegion }), `circuit-failed-save-${name}`)

      dialog = await openNote(goblet, 'goblet squat')
      await saveOf(dialog, 'goblet squat').tap()
      await expect(dialog.getByText('Note saved')).toBeVisible()
      await expect(dialog.getByText('Your note didn’t save. It is still in the field — try again.')).toHaveCount(0)
      await closeNote(dialog)
      await expect(goblet.getByText('Note saved')).toBeVisible()
      expect(app.notes()).toEqual([
        { slug: 'dumbbell-bench-press', notes: 'Pause at the bottom', stored: true },
        { slug: 'goblet-squat', notes: 'Heels down', stored: false },
        { slug: 'goblet-squat', notes: 'Heels down', stored: true },
      ])

      // Close and reopen by touch: every draft is still there, saved or not.
      await toggleOf(page, 'superset').tap()
      await expect(toggleOf(page, 'superset')).toHaveAttribute('aria-expanded', 'false')
      await toggleOf(page, 'superset').tap()
      dialog = await openNote(bench, 'dumbbell bench press')
      await expect(noteOf(dialog, 'dumbbell bench press')).toHaveValue('Pause at the bottom')
      await closeNote(dialog)
      dialog = await openNote(row, 'chest supported row')
      await expect(noteOf(dialog, 'chest supported row')).toHaveValue('Chest stays on the pad')
      await closeNote(dialog)
      await attachCapture(page, `workout-open-${name}`)
      app.assertContained()
    })
  }

  test('AC-R005-02 phone-390: written, blank, no entry, loading and failed guidance stay distinct per movement, and a retry recovers only its own', async ({ page, visit, checkA11y }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const acceptance = groupedCoachingAcceptance({ locationId: PLACE })
    const app = await syntheticApp(page, acceptance, {
      answers: { ...COACHING_GUIDANCE, 'dumbbell-bench-press': 'held', 'kb-swing': 'absent' },
    })
    await openReview(page, visit, acceptance)
    await startWorkout(page, checkA11y)

    await toggleOf(page, 'superset').tap()
    await toggleOf(page, 'circuit').tap()
    const supersetRegion = regionOf(page, 'superset')
    const circuitRegion = regionOf(page, 'circuit')
    const bench = sectionOf(supersetRegion, 'dumbbell bench press')
    const row = sectionOf(supersetRegion, 'chest supported row')
    const swing = sectionOf(circuitRegion, 'kb swing')
    const climber = sectionOf(circuitRegion, 'mountain climber')
    const goblet = sectionOf(circuitRegion, 'goblet squat')
    const NO_ENTRY = 'The library has no entry for this movement, so there are no cues or regression.'

    // Loading: busy in its own section, its note usable beside it.
    await expect(bench.getByRole('status').filter({ hasText: 'Reading coaching for dumbbell bench press' })).toHaveAttribute('aria-busy', 'true')
    await expect(openerOf(bench, 'dumbbell bench press')).toBeEnabled()
    // No entry, repeated per movement as the library says it — not hidden or replaced.
    await expect(row.getByText(NO_ENTRY)).toBeVisible()
    await expect(swing.getByText(NO_ENTRY)).toBeVisible()
    await expect(page.getByText(NO_ENTRY, { exact: true })).toHaveCount(2)
    // Blank guidance: said as answers, attributed to the library.
    await expect(climber.getByText('No coaching cues are written for this movement.')).toBeVisible()
    await expect(climber.getByText('No regression is written for this movement.')).toBeVisible()
    await expect(climber.getByText(NO_ENTRY)).toHaveCount(0)
    // A failed read: its own alert and retry.
    const alert = goblet.getByRole('alert')
    await expect(alert).toContainText('Coaching for goblet squat didn’t load')
    await expect(page.getByRole('alert')).toHaveCount(1)
    // A blank note is its own state: present, empty, usable, claiming nothing.
    for (const [scope, movement] of [[bench, 'dumbbell bench press'], [row, 'chest supported row'], [swing, 'kb swing'], [climber, 'mountain climber'], [goblet, 'goblet squat']] as const) {
      await expect(openerOf(scope, movement)).toHaveText(new RegExp(`^Add note — ${movement}$`, 'i'))
      await expect(openerOf(scope, movement)).toBeEnabled()
      await expect(scope.getByText(/^(Note saved|Not saved|Saving…)$/)).toHaveCount(0)
    }
    await checkA11y()
    await attachCard(page, page.locator('[data-workout-card="workout"]').filter({ has: circuitRegion }), 'circuit-guidance-states-phone-390')

    // Retry reads only the failed movement again, and recovers only it.
    const before = app.reads().length
    await alert.getByRole('button', { name: 'Try again' }).tap()
    await expect(goblet.getByText('Cue for goblet squat')).toBeVisible()
    expect(app.reads().slice(before)).toEqual(['goblet-squat'])
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(bench.getByRole('status').filter({ hasText: 'Reading coaching for dumbbell bench press' })).toBeVisible()

    // The held read answers, and only its own section changes.
    app.release()
    await expect(bench.getByText('Cue for dumbbell bench press')).toBeVisible()
    await expect(row.getByText(NO_ENTRY)).toBeVisible()
    expect(app.notes()).toEqual([])
    app.assertContained()
  })

  test('JOURNEY-005 keyboard and reduced motion phone-390: the disclosure opens and closes from the keyboard, drafts survive, and a refused save keeps its words until its retry stores them', async ({ page, visit, checkA11y }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const acceptance = groupedCoachingAcceptance({ locationId: PLACE })
    const app = await syntheticApp(page, acceptance, { failFirst: ['kb-swing'], reducedMotion: true })
    await openReview(page, visit, acceptance)
    await startWorkout(page, checkA11y)
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)

    const circuit = GROUPED_MOVEMENTS.circuit
    const toggle = toggleOf(page, 'circuit')
    await toggle.focus()
    await page.keyboard.press('Enter')
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    // Reduced motion: the disclosure is open at once — the app's reduced-motion
    // guarantee (a11y.css) leaves at most a 0.01ms transition, a hard cut.
    const geometry = await readDisclosure(toggle)
    const seconds = (duration: string) => parseFloat(duration) / (duration.trim().endsWith('ms') ? 1000 : 1)
    expect(geometry.transition.split(',').every((duration) => seconds(duration) <= 0.00001), geometry.transition).toBe(true)
    expect(geometry.regionHeight).toBeGreaterThan(0)
    expectBottomDisclosure(geometry, circuit, 'circuit keyboard')

    // Tab from the disclosure to the first movement's note opener, open it,
    // type, and save from the keyboard (TASK-045: the note's dialog).
    const region = regionOf(page, 'circuit')
    const swing = sectionOf(region, 'kb swing')
    const opener = openerOf(swing, 'kb swing')
    for (let step = 0; step < 12 && !(await opener.evaluate((node) => node === document.activeElement)); step += 1) {
      await page.keyboard.press('Tab')
    }
    await expect(opener).toBeFocused()
    await page.keyboard.press('Enter')
    let dialog = noteDialog(swing, 'kb swing')
    await expect(dialog).toBeVisible()
    const field = noteOf(dialog, 'kb swing')
    for (let step = 0; step < 4 && !(await field.evaluate((node) => node === document.activeElement)); step += 1) {
      await page.keyboard.press('Tab')
    }
    await expect(field).toBeFocused()
    await page.keyboard.type('Bell felt heavy in round two')
    await page.keyboard.press('Tab')
    await expect(saveOf(dialog, 'kb swing')).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(dialog.getByText('Your note didn’t save. It is still in the field — try again.')).toBeVisible()
    await expect(field).toHaveValue('Bell felt heavy in round two')
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(openerOf(swing, 'kb swing')).toBeFocused()

    // Another movement's draft, then close and reopen from the keyboard.
    const climber = sectionOf(region, 'mountain climber')
    await openerOf(climber, 'mountain climber').focus()
    await page.keyboard.press('Enter')
    const climberDialog = noteDialog(climber, 'mountain climber')
    await expect(climberDialog).toBeVisible()
    await noteOf(climberDialog, 'mountain climber').focus()
    await page.keyboard.type('Knees to chest')
    await page.keyboard.press('Escape')
    await expect(climberDialog).toBeHidden()
    await toggle.focus()
    await page.keyboard.press('Space')
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await page.keyboard.press('Enter')
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(swing.getByText('Not saved')).toBeVisible()
    await openerOf(climber, 'mountain climber').focus()
    await page.keyboard.press('Enter')
    await expect(noteOf(climberDialog, 'mountain climber')).toHaveValue('Knees to chest')
    await page.keyboard.press('Escape')
    await expect(climberDialog).toBeHidden()
    await openerOf(swing, 'kb swing').focus()
    await page.keyboard.press('Enter')
    dialog = noteDialog(swing, 'kb swing')
    await expect(field).toHaveValue('Bell felt heavy in round two')
    await expect(dialog.getByText('Your note didn’t save. It is still in the field — try again.')).toBeVisible()

    // Its retry stores it; the partner's draft stays unsaved.
    await saveOf(dialog, 'kb swing').focus()
    await page.keyboard.press('Enter')
    await expect(dialog.getByText('Note saved')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(swing.getByText('Note saved')).toBeVisible()
    await expect(climber.getByText(/^(Note saved|Not saved)$/)).toHaveCount(0)
    expect(app.notes()).toEqual([
      { slug: 'kb-swing', notes: 'Bell felt heavy in round two', stored: false },
      { slug: 'kb-swing', notes: 'Bell felt heavy in round two', stored: true },
    ])
    // A note is not performed work: the circuit has recorded no round.
    await expect(page.getByRole('button', { name: 'Start round 1' })).toBeVisible()
    await checkA11y()
    app.assertContained()
  })

  test('gallery cards phone-320: the accepted state draws the actual disclosure at the foot of each grouped live card', async ({ page, visit }) => {
    await page.setViewportSize({ width: 320, height: 568 })
    await installDeterministicCapture(page, { skin: 'clear', reducedMotion: true })
    const requests: string[] = []
    page.on('request', (request) => {
      if (/\/(rest|auth|functions)\/v1\//.test(request.url())) requests.push(`${request.method()} ${request.url()}`)
    })
    await visit('/gallery/refinements?state=cards')
    const state = page.locator('[data-refinement-state="cards"]')
    const review = state.locator('[data-gallery-context="review"]')
    const workout = state.locator('[data-gallery-context="workout"]')
    await expect(workout.locator('[data-workout-card="workout"]')).toHaveCount(3)

    await expect(review.getByRole('button', { name: /^Coaching and notes/ })).toHaveCount(0)
    const supersetNames = ['single arm kettlebell overhead reverse lunge to knee drive', 'push up']
    const circuitNames = ['kb swing', 'mountain climber', 'plank']
    for (const [format, names] of [['SUPERSET', supersetNames], ['CIRCUIT', circuitNames]] as const) {
      expectBottomDisclosure(await readDisclosure(workout.getByRole('button', { name: groupDisclosureName(format, names), exact: true })), names, `gallery ${names[0]}`)
    }
    await workout.getByRole('button', { name: groupDisclosureName('CIRCUIT', circuitNames), exact: true }).tap()
    const region = workout.getByRole('region', { name: groupDisclosureName('CIRCUIT', circuitNames), exact: true })
    await expect(sectionOf(region, 'kb swing').getByText('Hinge at the hips, not the knees')).toBeVisible()
    await expect(sectionOf(region, 'plank').getByText('No coaching cues are written for this movement.')).toBeVisible()
    await expect(sectionOf(region, 'mountain climber').getByText('The library has no entry for this movement, so there are no cues or regression.')).toBeVisible()
    await noHorizontalOverflow(page)
    await attachCard(page, workout.locator('[data-workout-card="workout"]').nth(2), 'gallery-cards-circuit-open-phone-320')
    expect(requests, 'the gallery reads and writes nothing over the network').toEqual([])
  })
})
