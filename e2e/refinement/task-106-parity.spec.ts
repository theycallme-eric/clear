import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createServer, type AddressInfo } from 'node:net'
import { join, relative, resolve } from 'node:path'
import type { Locator, Page, Route } from '@playwright/test'

import { readE2eEnv } from '../../scripts/e2e/env.mjs'
import { resolveObjectStore } from '../../scripts/refinement/lib/references.mjs'
import {
  ALL_SETS_SAVED,
  CIRCUIT,
  DISTANCE_MOVEMENT,
  ONE_SAVED_SET,
  OTHER_LIFT,
  PRIMARY_LIFT,
  SUPERSET,
  TIMED_MOVEMENT,
} from '../../src/dev/gallery-refinement-fixtures'
import { exerciseSetLogRowSchema, sessionSnapshotSchema, type ExerciseSetLogRow, type SessionSnapshot } from '../../src/state/schemas'
import type { LoggedSet } from '../../src/state/set-logging'
import { isSetObservationMutation, type SetObservationAck, type SetObservationMutation } from '../../src/state/set-observation-mutation'
import type { BlockProgress } from '../../src/state/workout-progress'
import { fixtureLocation, onboardedProfile } from '../../src/test/user-data-double'
import { definitionFixture, snapshotFixture, type SectionFixture } from '../../src/test/workout-double'
import { installDeterministicCapture } from '../design-0143/fixtures'
import { expect, test as scanned } from '../fixtures'

/**
 * A3 TASK-106 look check (TASK-AC-F3504D32EB11): each real route this task
 * wires beside its accepted gallery state (gallery commit bec4454, Round 7),
 * with matched data, at the two approved phone widths, 320 and 390.
 *
 * The route this task wires is `/workout`'s set logging in Round 7's dialog:
 * a standard block's set (the anchor, another lift, a timed movement, a
 * distance movement, an extra set), a saved set's correction, a superset's
 * round and a circuit's movement entry. Each accepted state mounts the same
 * block (`src/dev/gallery-refinement-fixtures.ts`) on the gallery's memory
 * runtime and presses the same control a person would; the route performs
 * the very same block on a contained synthetic session, with the same saved
 * sets where the state has them and the profile's unit the gallery uses (lb).
 *
 * Both sides are read alike on the browser's own clock (Playwright's, held
 * still between steps so every reading, the running rest's included, is
 * exact):
 *
 *   · `card`: the movement's block card before anything is opened;
 *   · `open`: the dialog the control opens — the entry, its running rest,
 *     its fields and its one Log action (or Cancel / Save correction);
 *   · `saved` (anchor, superset): the same dialog after Log set 1 / Log
 *     round 1 — the confirmation this task wires (TASK-020: the saved result
 *     read back with its effort and sync status, beside the same rest).
 *
 * Every visible word of each moment is read from both sides, and so is the
 * layout: every rendered element's box is measured and compared with its
 * counterpart within `LAYOUT_TOLERANCE_PX` (TASK-103's method). Each card's
 * top is scrolled into view before it is captured. A difference no criterion
 * intends fails the case; an intended one is labelled with its criterion ID.
 * Each case writes its receipt to `evidence/refinement/task-106/parity/` and
 * its captures beside the Runner's evidence store (outside Git), recording
 * each capture's SHA-256 in the receipt. Synthetic and contained: the only
 * write is the saved moment's own set observation, answered here and never
 * forwarded.
 */
const OWNER = '00000000-0000-4000-8000-000000010690'
const PLACE = '00000000-0000-4000-8000-000000010691'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
}
const REPO_ROOT = resolve(import.meta.dirname, '..', '..')
const RECEIPTS = join(REPO_ROOT, 'evidence', 'refinement', 'task-106', 'parity')
/** The browser's clock at the start of each case. */
const ENTRY = Date.parse('2026-11-16T09:00:00.000Z')
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
    if (code !== null) throw new Error(`Synthetic TASK-106 server exited (${code}) before ${origin} was ready`)
    try {
      if ((await fetch(origin)).ok && (await fetch(own)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((settle) => setTimeout(settle, 250))
  }
  throw new Error(`Synthetic TASK-106 origin ${origin} did not start`)
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
          VITE_SUPABASE_URL: 'https://synthetic-task-106.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-task-106-public-placeholder',
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
// Matched data: the gallery's own blocks and saved sets, persisted as a session
// ─────────────────────────────────────────────────────────────────────────────

type State =
  | 'anchor' | 'other-lift' | 'timed-movement' | 'distance-movement'
  | 'extra-set' | 'set-correction' | 'superset' | 'circuit-movement'

interface StateShape {
  /** The gallery state's own title (`LOGGING_CONTEXTS`): its "Open …" button. */
  readonly label: string
  readonly block: BlockProgress
  /** The section the gallery scene names around the block (`sceneFor`). */
  readonly section: { readonly title: string; readonly type: SectionFixture['sectionType'] }
  readonly seed?: Readonly<Record<string, readonly LoggedSet[]>>
  /** The control the gallery's driver presses, by its accessible name. */
  readonly control: string
  /** The dialog it opens. */
  readonly title: string
  /** After Log, its confirmation (only where the accepted state reaches Save). */
  readonly saved?: { readonly action: string; readonly title: string; readonly tick?: readonly string[] }
}

const STATES: Readonly<Record<State, StateShape>> = {
  anchor: {
    label: 'Anchor / primary lift', block: PRIMARY_LIFT, section: { title: 'Primary lift', type: 'primary_lift' },
    control: 'Rest', title: 'Log set 1', saved: { action: 'Log set 1', title: 'Set 1 logged' },
  },
  'other-lift': {
    label: 'Other lift', block: OTHER_LIFT, section: { title: 'Accessories', type: 'accessory' },
    control: 'Rest', title: 'Log set 1',
  },
  'timed-movement': {
    label: 'Timed movement', block: TIMED_MOVEMENT, section: { title: 'Conditioning', type: 'conditioning' },
    control: 'Rest', title: 'Log set 1',
  },
  'distance-movement': {
    label: 'Distance movement', block: DISTANCE_MOVEMENT, section: { title: 'Conditioning', type: 'conditioning' },
    control: 'Rest', title: 'Log set 1',
  },
  'extra-set': {
    label: 'Extra set', block: PRIMARY_LIFT, section: { title: 'Primary lift', type: 'primary_lift' }, seed: ALL_SETS_SAVED,
    control: 'Rest', title: 'Log set 4',
  },
  'set-correction': {
    label: 'Saved-set correction', block: PRIMARY_LIFT, section: { title: 'Primary lift', type: 'primary_lift' }, seed: ONE_SAVED_SET,
    control: 'Edit set 1', title: 'Edit set 1',
  },
  superset: {
    label: 'Superset round', block: SUPERSET, section: { title: 'Accessories', type: 'accessory' },
    control: 'Rest', title: 'Log round 1',
    saved: { action: 'Log round 1', title: 'Round 1 logged', tick: ['A1 one arm row, set 1', 'A2 bicep curl, set 1'] },
  },
  'circuit-movement': {
    label: 'Circuit movement entry', block: CIRCUIT, section: { title: 'Conditioning', type: 'conditioning' },
    // The gallery's driver presses the first movement's Rest (named for it).
    control: 'Rest for goblet squat', title: 'Log set 1',
  },
}

/** The gallery's own sample unit (`PreviewSetLogging`), so loads and saved weights read alike. */
const GALLERY_UNIT = 'lb' as const

/** The gallery block, as the route's session carries it, with the state's saved sets. */
function routeSession(state: State): SessionSnapshot {
  const { block, section, seed = {} } = STATES[state]
  return sessionSnapshotSchema.parse(snapshotFixture({
    userId: OWNER,
    title: `TASK-106 parity ${state}`,
    startedAt: new Date(ENTRY - 10 * 60_000).toISOString(),
    session: { location_id: PLACE, goal_preset: 'balanced' },
    sections: [{
      title: section.title,
      sectionType: section.type,
      blocks: [{
        structureType: block.structureType,
        rounds: block.rounds,
        roundRestSeconds: block.roundRestSeconds,
        repScheme: block.repScheme,
        timerType: block.timerType,
        timerSeconds: block.timerSeconds,
        exercises: block.exercises.map(({ exerciseId, prescription: p }) => ({
          prescription: {
            exercise_id: p.exercise_id, order_index: p.order_index, equipment_used: p.equipment_used,
            load_type: p.load_type, load_value: p.load_value, modality: p.modality, sets: p.sets,
            target_kind: p.target_kind, target_value: p.target_value, target_min: p.target_min,
            target_max: p.target_max, target_sequence: p.target_sequence, per_side: p.per_side,
            distance_unit: p.distance_unit, rest_seconds: p.rest_seconds, tempo: p.tempo,
            is_interval_exercise: p.is_interval_exercise,
          },
          setLogs: (seed[exerciseId] ?? []).map((set): Partial<ExerciseSetLogRow> => ({
            set_number: set.setNumber, actual_reps: set.reps, actual_duration_seconds: set.durationSeconds,
            actual_distance: set.distance, actual_distance_unit: set.distanceUnit, weight: set.weight,
            weight_unit: set.weightUnit, is_warmup_set: set.isWarmup, effort: set.effort,
          })),
        })),
      }],
    }],
  }))
}

/** The contained synthetic app: reads, and the one set observation a saved moment makes. */
async function syntheticApp(page: Page, snapshot: SessionSnapshot) {
  const unexpected: string[] = []
  const mutations: SetObservationMutation[] = []
  const exercises = snapshot.sections.flatMap((section) => section.blocks
    .flatMap((block) => block.exercises.map(({ exercise }) => exercise)))
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
      if (name === 'workout_exercises') return reply(exercises)
      if (name === 'exercise_definitions') {
        const id = url.searchParams.get('id')?.replace(/^eq\./, '')
        return reply(exercises.filter((exercise) => id === undefined || exercise.exercise_id === id)
          .map((exercise) => definitionFixture({ id: exercise.exercise_id })))
      }
      return reply([])
    }
    if (request.method() === 'POST' && url.pathname.includes('/rpc/')) {
      if (name === 'resume_session' || name === 'session_snapshot') return reply(snapshot)
      if (name === 'session_as_performed') return reply(null)
      if (name === 'mutate_set_observation') {
        const p = request.postDataJSON() as Record<string, unknown> & { p_values: Record<string, unknown> }
        const mutation = {
          observation_id: p.p_observation_id, mutation_id: p.p_mutation_id, revision: p.p_revision,
          expected_revision: p.p_expected_revision, operation: p.p_operation,
          exercise_id: p.p_exercise_id, set_number: p.p_set_number, values: p.p_values,
        }
        if (!isSetObservationMutation(mutation)) {
          unexpected.push(`invalid ${name}`)
          return reply({ outcome: 'invalid' }, 400)
        }
        const row = exerciseSetLogRowSchema.parse({
          id: mutation.observation_id, workout_exercise_id: mutation.exercise_id,
          prescription_revision_status: 'active', set_number: mutation.set_number,
          actual_reps: null, actual_duration_seconds: null, actual_distance: null,
          actual_distance_unit: null, weight: null, weight_unit: GALLERY_UNIT, rpe: null,
          is_warmup_set: false, created_at: new Date(ENTRY).toISOString(), effort: null,
          ...mutation.values, mutation_revision: mutation.revision, last_mutation_id: mutation.mutation_id,
        })
        mutations.push(mutation)
        const ack: SetObservationAck = { outcome: 'applied', mutation,
          head: { revision: mutation.revision, mutation_id: mutation.mutation_id, cleared: false, row } }
        return reply(ack)
      }
      if (['streak_sessions', 'constraints_in_force', 'anchor_evidence', 'conditioning_history', 'set_load_anchors'].includes(name)) return reply([])
    }
    unexpected.push(`${request.method()} ${url.pathname}`)
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic TASK-106 request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ owner }) => {
    localStorage.setItem('clear.auth.session', JSON.stringify({
      accessToken: 'synthetic-task-106-session', refreshToken: 'synthetic-task-106-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-task-106@example.invalid' },
    }))
  }, { owner: OWNER })
  return {
    mutations,
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
    const dir = join(store.dir, 'clear-gallery-adoption-v2-20261116', 'task-106', 'captures')
    return { dir, identity: 'store:clear-gallery-adoption-v2-20261116/task-106/captures' }
  }
  const dir = join(REPO_ROOT, 'test-results', 'task-106-parity')
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
  writeFileSync(join(RECEIPTS, `${name}.json`), `${JSON.stringify({ schema: 'clear-task-106-parity/v1', task: 'TASK-106', gallery: 'bec44545eb982f6dc136a583400f7e314c306d1d', ...receipt }, null, 2)}\n`)
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
 * modal dialog the part holds (measured as its own part), and Foundation's
 * focus-bracket layer, which is decoration that follows whatever has focus.
 */
async function boxesOf(target: Locator): Promise<Box[]> {
  return target.evaluate((root, aliases) => {
    const origin = root.getBoundingClientRect()
    const rounded = (value: number) => Math.round(value * 10) / 10
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
      if (element.closest('.clr-focus-brackets') !== null) continue
      const style = getComputedStyle(element)
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') continue
      const rect = element.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) continue
      const classes = [...element.classList].filter((name) => name.startsWith('clr-')).sort().map((name) => `.${name}`).join('')
      const words = aliases.reduce((text, [source, flags, replacement]) => text.replace(new RegExp(source, flags), replacement),
        (element instanceof HTMLElement ? element.innerText : (element.textContent ?? '')).replace(/\s+/g, ' ').trim()).slice(0, 80)
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
  }, KEY_ALIASES)
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
// Intended differences
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Differences a criterion intends. The route draws the same Round 7 blocks
 * and dialog from the same rows, so the only ones are the gallery's sample
 * values that never reach the product (TASK-AC-EFB0DB480A73: the gallery's
 * suggested load for the farmers carry, where the route states the
 * prescription's own load). The tables stay explicit so a future one is
 * labelled rather than waved through.
 */
const SAMPLE_LOAD = 'TASK-AC-EFB0DB480A73'
const SAMPLE_LOAD_REASON = 'The gallery presentation carries a sample suggested load (“20–25 lb per hand”); the product has none, so the route states the prescription’s own load (real data only).'
const INTENDED: readonly Intended[] = [
  { criterion: SAMPLE_LOAD, reason: SAMPLE_LOAD_REASON, side: 'gallery only', match: /20–25 lb per hand/ },
  { criterion: SAMPLE_LOAD, reason: SAMPLE_LOAD_REASON, side: 'route only', match: /^(farmers carry|1\. farmers carry)?.*\b25 lb\b/ },
]
const LAYOUT_INTENDED: readonly IntendedLayout[] = [
  // The load reading's own box: the gallery's sample guidance is longer than
  // the prescription's own load (both read as "(load)" in the keys).
  { criterion: SAMPLE_LOAD, reason: SAMPLE_LOAD_REASON, match: /^span\|\(load\)#0$/ },
  // The section label's own box: its word is two letters longer in the gallery.
  { criterion: 'TASK-AC-EFB0DB480A73', reason: 'The section label’s own box is as wide as its word: the gallery’s sample “Accessories” against the product’s “Accessory” (real data only).', match: /^h\.clr-movement-group-header__title\|accessory#0$/ },
]

/**
 * The section label above the block. The gallery scene names its accessory
 * blocks with a sample string, "Accessories" (`sceneFor`); the product names
 * every section by its type (`sectionTypeLabel`: "Accessory"), from the
 * session's own row. The words are a labelled text difference; for the layout
 * the two names are read as one, so the label's own box, and every element
 * around it, is still compared one-for-one.
 */
/**
 * Words read as one name in the layout keys, so the elements around them are
 * still compared one-for-one: [pattern, flags, name]. The section label
 * (below) and a movement's load reading (the gallery's sample guidance or the
 * prescription's own load, above).
 */
const KEY_ALIASES: readonly (readonly [string, string, string])[] = [
  ['\\baccessor(?:ies|y)\\b', 'gi', 'accessory'],
  ['20–25 lb per hand|\\b25 lb\\b', 'g', '(load)'],
]
const SECTION_LABEL = 'TASK-AC-EFB0DB480A73'
const SECTION_LABEL_REASON = 'The gallery scene labels its accessory sections with a sample string (“Accessories”); the product labels a section by its type (“Accessory”), from the session row (real data only).'
const TEXT_INTENDED: readonly Intended[] = [
  ...INTENDED,
  { criterion: SECTION_LABEL, reason: SECTION_LABEL_REASON, side: 'gallery only', match: /^accessories$/i },
  { criterion: SECTION_LABEL, reason: SECTION_LABEL_REASON, side: 'route only', match: /^accessory$/i },
]


type Moment = 'card' | 'open' | 'saved'
interface Reading {
  readonly lines: string[]
  readonly boxes: Box[]
  readonly capture: { file: string; sha256: string }
}

const openLog = (page: Page) => page.locator('dialog.clr-logging-overlay[open]')

/**
 * One side, read alike: the card before anything opens; the dialog its
 * control opens; and, where the state reaches Save, its confirmation. The
 * browser's clock is held between steps and moved exactly.
 */
async function drive(page: Page, card: Locator, open: () => Promise<void>, state: State, side: string): Promise<Partial<Record<Moment, Reading>>> {
  const shape = STATES[state]
  const read = async (target: Locator, name: string): Promise<Reading> => {
    await expect(target).toBeVisible()
    await target.evaluate((element) => element.scrollIntoView({ block: 'start' }))
    await settle(page)
    return { lines: await linesOf(target), boxes: await boxesOf(target), capture: await keep(target, name) }
  }
  const readings: Partial<Record<Moment, Reading>> = {}
  await settle(page)
  readings.card = await read(card, `${side}-card`)

  // The control is pressed (the rest it starts, if any, starts now); both
  // sides then read the same half second later.
  await open()
  await page.clock.runFor(500)
  const dialog = page.getByRole('dialog', { name: shape.title, exact: true })
  await expect(dialog).toBeVisible({ timeout: 15_000 })
  await expect(openLog(page)).toHaveCount(1)
  readings.open = await read(openLog(page), `${side}-open`)

  if (shape.saved !== undefined) {
    for (const group of shape.saved.tick ?? []) {
      await openLog(page).getByRole('group', { name: group }).getByRole('checkbox', { name: 'Performed' }).check()
    }
    await openLog(page).getByRole('button', { name: shape.saved.action, exact: true }).click()
    await page.clock.runFor(1_500)
    await expect(page.getByRole('dialog', { name: shape.saved.title, exact: true })).toBeVisible()
    const status = openLog(page).locator('[role="status"].clr-set-sheet__saved')
    await expect(status).toBeVisible()
    await expect(status).toContainText('Saved')
    readings.saved = await read(openLog(page), `${side}-saved`)
  }
  return readings
}

for (const state of Object.keys(STATES) as State[]) {
  const shape = STATES[state]
  for (const { name, viewport } of VIEWPORTS) {
    test(`TASK-AC-F3504D32EB11 ${state} ${name}: /workout’s ${shape.label.toLowerCase()} opens in the same Round 7 dialog as the accepted gallery state, drawn alike`, async ({ page, visit }) => {
      test.setTimeout(240_000)
      await page.setViewportSize(viewport)
      await installDeterministicCapture(page, { skin: 'clear', reducedMotion: true })
      await page.clock.install({ time: ENTRY })

      // The accepted state: the real block on the gallery's memory runtime.
      await visit(`/gallery/refinements?state=${state}`)
      const scope = page.locator(`[data-refinement-state="${state}"]`)
      const galleryCard = scope.locator('[data-gallery-scene] .clr-card').first()
      await expect(galleryCard).toBeVisible()
      await page.clock.pauseAt(ENTRY + 60_000)
      const gallery = await drive(page, galleryCard, async () => {
        await scope.getByRole('button', { name: `Open ${shape.label}`, exact: true }).click()
        // The scene's driver presses the control on its own 40 ms interval:
        // step the held clock tick by tick until it has.
        for (let tick = 0; tick < 100 && await openLog(page).count() === 0; tick += 1) await page.clock.runFor(40)
      }, state, `${state}-${name}-gallery`)
      await page.clock.resume()

      // The real route, over the same block and saved sets, driven the same way.
      const app = await syntheticApp(page, routeSession(state))
      await visit('/workout')
      const routeCard = page.locator('main#main .clr-card').filter({
        has: page.getByRole('heading', { name: shape.block.exercises[0].prescription.exercise_id.replaceAll('-', ' ') }),
      }).first()
      await expect(routeCard).toBeVisible()
      await page.clock.pauseAt(ENTRY + 600_000)
      const route = await drive(page, routeCard, async () => {
        await routeCard.getByRole('button', { name: shape.control, exact: true }).click()
      }, state, `${state}-${name}-route`)
      await page.clock.resume()

      const moments = (['card', 'open', 'saved'] as const).filter((moment) => gallery[moment] !== undefined)
      const differences = Object.fromEntries(moments.map((moment) => [moment, compare(gallery[moment]!.lines, route[moment]!.lines, TEXT_INTENDED)]))
      const layout = Object.fromEntries(moments.map((moment) => [moment,
        compareLayout(gallery[moment]!.boxes, route[moment]!.boxes, LAYOUT_INTENDED)]))
      const part = (boxes: readonly Box[]) => boxes.find((box) => box.key === '(part)#0') ?? null
      writeReceipt(`${state}-${name}`, {
        state, label: shape.label, width: viewport.width, route: '/workout',
        drive: `card; ${shape.control} → ${shape.title}${shape.saved ? `; ${shape.saved.action} → ${shape.saved.title}` : ''} — on the browser clock, held between steps`,
        captures: Object.fromEntries(moments.flatMap((moment) => [[`gallery-${moment}`, gallery[moment]!.capture], [`route-${moment}`, route[moment]!.capture]])),
        lines: {
          gallery: Object.fromEntries(moments.map((moment) => [moment, gallery[moment]!.lines])),
          route: Object.fromEntries(moments.map((moment) => [moment, route[moment]!.lines])),
        },
        differences,
        layout: {
          method: 'element boxes',
          keys: 'tag, clr- classes and words; the section label read as one name (Accessories / Accessory)',
          tolerancePx: LAYOUT_TOLERANCE_PX,
          measured: {
            gallery: Object.fromEntries(moments.map((moment) => [moment, gallery[moment]!.boxes.length])),
            route: Object.fromEntries(moments.map((moment) => [moment, route[moment]!.boxes.length])),
          },
          parts: {
            gallery: Object.fromEntries(moments.map((moment) => [moment, part(gallery[moment]!.boxes)])),
            route: Object.fromEntries(moments.map((moment) => [moment, part(route[moment]!.boxes)])),
          },
          differences: layout,
        },
      })

      // The dialog this task wires, on both sides: its title, the one X and,
      // once saved, the confirmation read back beside the rest.
      for (const [side, reading] of [['gallery', gallery], ['route', route]] as const) {
        expect(reading.open!.lines[0], `${side} open title @${name}`).toMatch(new RegExp(`^${shape.title}$`, 'i'))
        if (shape.saved !== undefined) expect(reading.saved!.lines[0], `${side} saved title @${name}`).toMatch(new RegExp(`^${shape.saved.title}$`, 'i'))
      }
      for (const moment of moments) expectAllIntended(differences[moment], `${state} ${moment} @${name}`)
      for (const moment of moments) expectLayoutIntended(layout[moment], `${state} ${moment} layout @${name}`)
      if (shape.saved !== undefined) expect(app.mutations.length).toBeGreaterThan(0)
      app.assertContained()
    })
  }
}
