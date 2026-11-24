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
import { definitionFixture } from '../../src/test/workout-double'
import { CRT_FIELD_CONFIG } from '../../src/ui/crt-field/config'
import { installDeterministicCapture } from '../design-0143/fixtures'
import { expect, test as scanned } from '../fixtures'

/**
 * A3 TASK-120 look check (TASK-AC-09E6C2AF216F): the effects layer composed
 * with an open log and the deadline warning, on the real `/workout` route
 * beside this task's accepted gallery states (gallery commit bec4454, Round
 * 7), with matched data, at the two approved phone widths, 320 and 390:
 *
 *   · `urgency`: the EMOM minute in its final five seconds ("EMOM · 5
 *     seconds", the gallery's own block) with the movement's note open over
 *     the running warning — Round 7's only log during a run;
 *   · `ladder-long`: the twelve-round ladder run past its cap, its "Log
 *     results" open by itself.
 *
 * This task wires no new route: it sweeps the shared owners every moment
 * opens in (LoggingOverlay, AppDialog) and the effects layer they compose with
 * (the root effects host, the one CRT front glass, the one Echo kernel, the
 * shared warning). So each case reads, from both sides, what those owners
 * draw: the glass (one, the selected preset, in the top layer, never taking
 * input), the warning's one edge (its host and its cover) and the urgent
 * timers, the open dialog (name, native modal, the Balanced backdrop, a
 * filter-free and opaque foreground, no Echo inside it), the frame's place,
 * every visible word of the dialog, and two images — the open dialog and the
 * whole composed viewport — kept beside the Runner's evidence store (outside
 * Git), each SHA-256 in the receipt.
 *
 * Effects move, so every infinite loop (the glass's line drift and grain
 * refresh, the warning's breathe) is held at its own start (currentTime 0)
 * once every finite motion has finished (each animation's `finished`
 * promise), on both sides alike, before anything is read or captured. Both
 * sides run on Playwright's clock, held between steps and moved alike.
 * Synthetic and contained: nothing is saved.
 */
const OWNER = '00000000-0000-4000-8000-000000012001'
const PLACE = '00000000-0000-4000-8000-000000012011'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
}
const REPO_ROOT = resolve(import.meta.dirname, '..', '..')
const RECEIPTS = join(REPO_ROOT, 'evidence', 'refinement', 'task-120', 'parity')
const GALLERY = 'bec44545eb982f6dc136a583400f7e314c306d1d'
/** The browser's clock at the start of each case. */
const ENTRY = Date.parse('2026-11-16T09:00:00.000Z')
const NOTE_TITLE = 'Movement note'
const LOG_RESULTS = 'Log results'
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
    if (code !== null) throw new Error(`Synthetic TASK-120 server exited (${code}) before ${origin} was ready`)
    try {
      if ((await fetch(origin)).ok && (await fetch(own)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((settle) => setTimeout(settle, 250))
  }
  throw new Error(`Synthetic TASK-120 origin ${origin} did not start`)
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
          VITE_SUPABASE_URL: 'https://synthetic-task-120.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-task-120-public-placeholder',
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
// Matched data: the gallery's own blocks, persisted as the route's session
// ─────────────────────────────────────────────────────────────────────────────

/** The urgency state's EMOM (`LiveFlow`: `timedBlock('emom')`) and ladder-long's ladder (`sceneFor`: twelve rounds). */
const URGENT_EMOM = timedBlock('emom')
const LONG_LADDER = timedBlock('ladder', { rounds: 12 })

/** A timed block as the route persists it (TASK-117's method), the ladder's timing included. */
function timedSession(block: BlockProgress): SessionSnapshot {
  const persisted = makeWorkoutBlock({
    structure_type: block.structureType,
    rep_scheme: block.repScheme,
    rounds: block.rounds,
    round_rest_seconds: block.roundRestSeconds,
    timer_type: block.timerType,
    timer_seconds: block.timerSeconds,
    ...(block.ladderTiming ? { ladder_timing: block.ladderTiming } : {}),
    exercises: block.exercises.map(({ prescription: p }) => makePrescription({
      exercise_id: p.exercise_id, equipment: p.equipment_used, session_function: 'conditioning', anchor_relationship: 'neutral',
      modality: p.modality, sets: p.sets, target_kind: p.target_kind, target_value: p.target_value, target_min: p.target_min,
      target_max: p.target_max, target_sequence: p.target_sequence, per_side: p.per_side, distance_unit: p.distance_unit,
      rest_seconds: p.rest_seconds, tempo: p.tempo, load_type: p.load_type ?? 'none', load_value: p.load_value,
      is_interval_exercise: p.is_interval_exercise,
    } as Parameters<typeof makePrescription>[0])),
  })
  const acceptance: SessionAcceptance = {
    date: '2026-11-16', location_id: PLACE, session_focus: 'full_body', goal_preset: 'balanced',
    requested_duration_mins: 30, effective_duration_target_mins: 30, computed_duration_mins: null,
    requested_intensity: 5, effective_intensity: 5, adjustment_reason: null, generation_notes: null,
    prompt_version: 'e2e', contract_version: CONTRACT_VERSION, is_deload: false,
    workout: {
      title: 'TASK-120 parity', overview: null, estimated_duration_mins: 30,
      sections: [
        { section_type: 'conditioning', section_title: 'Parity', section_notes: null, blocks: [persisted] },
        { section_type: 'cooldown', section_title: 'Cooldown', section_notes: null,
          blocks: [makeWorkoutBlock({ exercises: [makePrescription({ exercise_id: 'burpee', equipment: 'bodyweight', load_type: 'none', load_value: null, sets: 1, target_value: 1 })] })] },
      ],
    },
  }
  return sessionSnapshotSchema.parse(formatBadgesSnapshot(acceptance, { userId: OWNER, startedAt: new Date(ENTRY - 60_000).toISOString() }))
}

/** The contained synthetic app: reads only; nothing is written. */
async function syntheticApp(page: Page, snapshot: SessionSnapshot) {
  const unexpected: string[] = []
  const exercises = snapshot.sections.flatMap((section) => section.blocks.flatMap((block) => block.exercises.map(({ exercise }) => exercise)))
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
      if (name === 'profiles') return reply([onboardedProfile({ id: OWNER, goal_preset: 'balanced', weight_unit: 'lb' })])
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
      if (['streak_sessions', 'constraints_in_force', 'anchor_evidence', 'conditioning_history', 'set_load_anchors', 'generation_refusal_diagnostics',
        'generation_candidate_sets_for_goal', 'generation_candidate_sets'].includes(name)) return reply([])
    }
    unexpected.push(`${request.method()} ${url.pathname}`)
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic TASK-120 request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ owner }) => {
    localStorage.setItem('clear.auth.session', JSON.stringify({
      accessToken: 'synthetic-task-120-session', refreshToken: 'synthetic-task-120-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-task-120@example.invalid' },
    }))
  }, { owner: OWNER })
  return {
    assertContained() {
      expect(unexpected, 'Every synthetic API request has an explicit disposition').toEqual([])
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Holding the motion, reading the composition, keeping the images
// ─────────────────────────────────────────────────────────────────────────────

const openLog = (page: Page) => page.locator('dialog.clr-logging-overlay[open]')

/** Every running finite motion inside a part has finished: each animation's `finished` promise. */
async function finishedIn(part: Locator) {
  await part.evaluate((node) => Promise.all(node.getAnimations({ subtree: true })
    .filter((animation) => animation.playState === 'running' && Number.isFinite(Number(animation.effect?.getComputedTiming().endTime ?? Infinity)))
    .map((animation) => animation.finished.then(() => undefined, () => undefined))))
}

/** Every running finite motion on the page has finished (the shared Dialog's arrival included). */
async function finishedOnPage(page: Page) {
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter((animation) => animation.playState === 'running' && Number.isFinite(Number(animation.effect?.getComputedTiming().endTime ?? Infinity)))
    .map((animation) => animation.finished.then(() => undefined, () => undefined))))
}

/**
 * Fonts loaded, every finite motion finished, then every infinite loop — the
 * glass's two clocks and the warning's breathe — held at its own start, so
 * both sides and every run paint the same frame.
 */
async function hold(page: Page) {
  await page.evaluate(async () => {
    void document.body.offsetHeight
    await Promise.all([...document.fonts].map((face) => face.load().catch(() => undefined)))
    await document.fonts.ready
  })
  await finishedOnPage(page)
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) {
      if (Number.isFinite(Number(animation.effect?.getComputedTiming().endTime ?? Infinity))) continue
      animation.pause()
      animation.currentTime = 0
    }
  })
  await renderFrame(page)
}

/** Renders one frame: the browser records paint only when a frame is rendered. */
async function renderFrame(page: Page) {
  await page.screenshot({ clip: { x: 0, y: 0, width: 1, height: 1 } })
}

/** The visible words of the open dialog, line by line. */
async function linesOf(target: Locator): Promise<string[]> {
  return (await target.evaluate((element) => (element as HTMLElement).innerText))
    .split('\n').map((line) => line.replace(/\s+/g, ' ').trim()).filter((line) => line !== '')
}

/** What the effects layer and the shared owners draw with the log open (CSS px, to the hundredth). */
async function composition(page: Page) {
  return page.evaluate(() => {
    const r = (value: number) => Math.round(value * 100) / 100
    const box = (node: Element) => {
      const b = node.getBoundingClientRect()
      return { top: r(b.top), left: r(b.left), width: r(b.width), height: r(b.height) }
    }
    const host = document.querySelector<HTMLElement>('.clr-effects-host')
    const dialogs = [...document.querySelectorAll<HTMLDialogElement>('dialog[open]')]
    const top = dialogs.at(-1) ?? null
    const foregroundEffects: string[] = []
    if (top !== null) {
      const identity = (value: string) => value === 'none' ||
        value.replace(/(?:brightness|saturate|contrast|opacity)\(1\)|(?:blur)\(0px\)|(?:grayscale|sepia|invert)\(0\)|hue-rotate\(0deg\)/g, '').trim() === ''
      for (const node of [top, ...top.querySelectorAll<HTMLElement>('*')]) {
        if (node.hasAttribute('data-countdown-edge')) continue
        const style = getComputedStyle(node)
        // The shipped primary Button's own emission (`.clr-bleed.clr-glow`, one
        // 6 px drop-shadow, no offset) changes none of the dialog's pixels: it is
        // the component's look, not an effect on the foreground (as task-033 reads it).
        const emission = node.classList.contains('clr-glow') && /^drop-shadow\((?:color|rgba?)\([^()]*\) 0px 0px 6px\)$/.test(style.filter)
        if ((!identity(style.filter) && !emission) || style.backdropFilter !== 'none') foregroundEffects.push(`${node.tagName.toLowerCase()} filter=${style.filter} backdrop=${style.backdropFilter}`)
      }
      const title = top.querySelector('.clr-logging-overlay__head h2')
      const frame = top.querySelector(':scope > .clr-bleed > .clr-chamfer')
      for (const leaf of [title, frame]) {
        for (let node: Element | null = leaf; node && node !== top.parentElement; node = node.parentElement) {
          if (Number(getComputedStyle(node).opacity) < 1) foregroundEffects.push(`${node.tagName.toLowerCase()} opacity=${getComputedStyle(node).opacity}`)
        }
      }
    }
    const frame = top?.querySelector(':scope > .clr-bleed > .clr-chamfer') ?? null
    return {
      host: { effects: host?.dataset.effects ?? null, motion: host?.dataset.motion ?? null },
      glass: [...document.querySelectorAll<HTMLElement>('.clr-crt-field')].map((field) => ({
        open: field.matches(':popover-open'),
        config: field.getAttribute('data-crt-config'),
        ariaHidden: field.getAttribute('aria-hidden'),
        pointerEvents: getComputedStyle(field).pointerEvents,
        motion: field.getAttribute('data-motion'),
        rect: box(field),
        clocks: field.getAnimations({ subtree: true }).filter((animation) => animation.id).map((animation) => animation.id).sort(),
      })),
      echo: {
        filters: document.querySelectorAll('filter#clr-phosphor-echo').length,
        inDialog: top === null ? null : top.querySelectorAll('.clr-echo__rear, .clr-echo-text__rear').length,
        beneath: [...document.querySelectorAll('.clr-echo__rear, .clr-echo-text__rear')].filter((rear) => rear.closest('dialog') === null).length > 0,
      },
      edges: [...document.querySelectorAll<HTMLElement>('[data-countdown-edge]')].map((edge) => {
        const parent = edge.parentElement
        return {
          host: parent === document.body ? 'body' : parent instanceof HTMLDialogElement ? `dialog:${parent.open ? 'open' : 'closed'}` : parent?.tagName.toLowerCase() ?? 'none',
          loop: edge.getAttribute('data-loop'),
          rect: box(edge),
          pointerEvents: getComputedStyle(edge).pointerEvents,
          opacity: Number(getComputedStyle(edge).opacity),
        }
      }),
      urgentTimers: [...document.querySelectorAll<HTMLElement>('[role="timer"][data-urgent="true"]')]
        .filter((timer) => timer.getClientRects().length > 0)
        .map((timer) => ({ label: timer.getAttribute('aria-label'), loop: timer.getAttribute('data-loop'), breathe: timer.classList.contains('clr-countdown-breathe'), opacity: Number(getComputedStyle(timer).opacity) })),
      dialog: top === null ? null : {
        name: top.getAttribute('aria-label'),
        modal: top.matches(':modal'),
        backdrop: { filter: getComputedStyle(top, '::backdrop').backdropFilter, image: getComputedStyle(top, '::backdrop').backgroundImage, color: getComputedStyle(top, '::backdrop').backgroundColor },
        frame: frame === null ? null : box(frame),
        ring: frame === null ? null : getComputedStyle(frame, '::after').backgroundColor,
      },
      openDialogs: dialogs.length,
      foregroundEffects,
      scanLayers: [...document.querySelectorAll('.clr-atmosphere__scan, .scanlines-overlay')].filter((node) => getComputedStyle(node).display !== 'none').length,
    }
  })
}
type Composition = Awaited<ReturnType<typeof composition>>

/** The body these captures belong to: each Runner body keeps its own evidence-store folder. */
const CAPTURE_BODY = 'clear-gallery-adoption-v2-20261120'

function captureDir(): { dir: string; identity: string } {
  const store = resolveObjectStore({ cwd: REPO_ROOT })
  if (store.problem === undefined && store.dir !== null) {
    return { dir: join(store.dir, CAPTURE_BODY, 'task-120', 'captures'), identity: `store:${CAPTURE_BODY}/task-120/captures` }
  }
  const dir = join(REPO_ROOT, 'test-results', 'task-120-parity')
  return { dir, identity: `repo:${relative(REPO_ROOT, dir)}` }
}

async function keep(page: Page, target: Locator | null, name: string) {
  const bytes = target === null
    ? await page.screenshot({ caret: 'hide', animations: 'allow' })
    : await target.screenshot({ caret: 'hide', animations: 'allow' })
  await test.info().attach(`${name}.png`, { body: bytes, contentType: 'image/png' })
  const { dir, identity } = captureDir()
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${name}.png`), bytes)
  return { file: `${identity}/${name}.png`, sha256: createHash('sha256').update(bytes).digest('hex') }
}

interface Difference { readonly what: string; readonly gallery: unknown; readonly route: unknown; readonly criterion: string | null; readonly reason: string | null }

/** Words only one side shows, as `gallery only: …` / `route only: …`. */
function wordDifferences(gallery: readonly string[], route: readonly string[]): string[] {
  const remaining = [...route]
  const only: string[] = []
  for (const line of gallery) {
    const index = remaining.indexOf(line)
    if (index >= 0) remaining.splice(index, 1)
    else only.push(`gallery only: ${line}`)
  }
  return [...only, ...remaining.map((line) => `route only: ${line}`)]
}

/** Every reading that differs between the sides, by its path (boxes within half a pixel). */
function readingDifferences(gallery: unknown, route: unknown): Array<{ what: string; gallery: unknown; route: unknown }> {
  const out: Array<{ what: string; gallery: unknown; route: unknown }> = []
  const walk = (path: string, a: unknown, b: unknown) => {
    if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null && Array.isArray(a) === Array.isArray(b)) {
      const keys = new Set([...Object.keys(a), ...Object.keys(b)])
      for (const key of keys) walk(path === '' ? key : `${path}.${key}`, (a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])
      return
    }
    const near = typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= 0.5
    if (!near && JSON.stringify(a) !== JSON.stringify(b)) out.push({ what: path, gallery: a, route: b })
  }
  walk('', gallery, route)
  return out
}

/**
 * Differences a criterion intends. Each is something the gallery page
 * composes for itself, never the shared owners' or the effects' look.
 */
const INTENDED: readonly { criterion: string; reason: string; match: RegExp }[] = []

function labelled(what: string, gallery: unknown, route: unknown): Difference {
  const rule = INTENDED.find((candidate) => candidate.match.test(what))
  return { what, gallery, route, criterion: rule?.criterion ?? null, reason: rule?.reason ?? null }
}

function writeReceipt(name: string, receipt: Record<string, unknown>) {
  mkdirSync(RECEIPTS, { recursive: true })
  writeFileSync(join(RECEIPTS, `${name}.json`), `${JSON.stringify({ schema: 'clear-task-120-parity/v1', task: 'TASK-120', gallery: GALLERY, ...receipt }, null, 2)}\n`)
}

/** Steps the held clock until the condition holds (the gallery's driver works on a 40 ms interval). */
async function stepUntil(page: Page, ready: () => Promise<boolean>, step = 40, limit = 400) {
  for (let tick = 0; tick < limit && !(await ready()); tick += 1) await page.clock.runFor(step)
  expect(await ready()).toBe(true)
}

/** The movement's note over the running flow: its disclosure opened (motion finished), then its note. */
async function openNote(scope: Locator) {
  const coaching = scope.getByRole('button', { name: /^Coaching and notes/ }).first()
  await coaching.evaluate((node) => node.scrollIntoView({ block: 'center' }))
  if ((await coaching.getAttribute('aria-expanded')) !== 'true') await coaching.click()
  await finishedIn(scope)
  await scope.getByRole('button', { name: 'Add note — kb swing', exact: true }).click()
}

/** One side's reading: the composition, the dialog's words and the two images. */
async function read(page: Page, title: string, name: string) {
  const dialog = page.getByRole('dialog', { name: title, exact: true })
  await expect(dialog).toBeVisible({ timeout: 15_000 })
  await expect(openLog(page)).toHaveCount(1)
  await page.mouse.move(0, 0)
  await hold(page)
  return {
    composition: await composition(page),
    lines: await linesOf(openLog(page)),
    captures: { dialog: await keep(page, openLog(page), `${name}-dialog`), viewport: await keep(page, null, `${name}-viewport`) },
  }
}
type Reading = Awaited<ReturnType<typeof read>>

/** The composition every side must show (TASK-AC-43ADACB01FC9, AC-R033-02). */
function expectComposed(reading: Composition, viewport: { width: number; height: number }, label: string, { urgent }: { urgent: boolean }) {
  expect(reading.host, `${label}: the root effects host`).toEqual({ effects: 'on', motion: 'allowed' })
  expect(reading.glass, `${label}: exactly one CRT front glass, the selected preset in the top layer`).toEqual([{
    open: true, config: CRT_FIELD_CONFIG.id, ariaHidden: 'true', pointerEvents: 'none', motion: 'running',
    rect: { top: 0, left: 0, width: viewport.width, height: viewport.height },
    clocks: ['clr-crt-grain-refresh', 'clr-crt-line-drift'],
  }])
  expect(reading.echo, `${label}: one Echo kernel, none inside the dialog, the background's beneath`).toEqual({ filters: 1, inDialog: 0, beneath: true })
  expect(reading.openDialogs, `${label}: one open dialog`).toBe(1)
  expect(reading.dialog?.modal, `${label}: native modal`).toBe(true)
  expect(reading.dialog?.backdrop.filter, `${label}: Balanced blur`).toBe('blur(4px)')
  expect(reading.dialog?.backdrop.image, `${label}: Balanced vignette`).toMatch(/^radial-gradient\(/)
  expect(reading.foregroundEffects, `${label}: the foreground stays sharp and opaque`).toEqual([])
  expect(reading.scanLayers, `${label}: no retired scan layer`).toBe(0)
  if (urgent) {
    expect(reading.edges, `${label}: one edge, in the dialog's top layer, over the viewport, never taking input`).toEqual([{
      host: 'dialog:open', loop: 'run', rect: { top: 0, left: 0, width: viewport.width, height: viewport.height }, pointerEvents: 'none', opacity: 0.2,
    }])
    expect(reading.urgentTimers, `${label}: the urgent timer breathes with the edge`).toEqual([{ label: 'EMOM time', loop: 'run', breathe: true, opacity: 0.2 }])
  } else {
    expect(reading.edges, `${label}: no deadline, no edge`).toEqual([])
    expect(reading.urgentTimers, `${label}: nothing urgent`).toEqual([])
  }
}

function compareSides(gallery: Reading, route: Reading): Difference[] {
  return [
    ...wordDifferences(gallery.lines, route.lines).map((line) => labelled(`words · ${line}`, null, null)),
    ...readingDifferences(gallery.composition, route.composition).map(({ what, gallery: a, route: b }) => labelled(`composition · ${what}`, a, b)),
  ]
}

// ─────────────────────────────────────────────────────────────────────────────
// The look check
// ─────────────────────────────────────────────────────────────────────────────

for (const { name, viewport } of VIEWPORTS) {
  test(`TASK-AC-09E6C2AF216F urgency ${name}: /workout’s EMOM in its final five seconds with the movement note open composes the glass, the one warning edge and the Balanced dialog as the accepted urgency state does`, async ({ page, visit }) => {
    test.setTimeout(240_000)
    await page.setViewportSize(viewport)
    await installDeterministicCapture(page, { skin: 'clear', reducedMotion: false })
    await page.clock.install({ time: ENTRY })

    // The accepted state: the real flow on the gallery's memory runtime; its
    // driver presses Start and moves the flow's clock to the moment.
    await visit('/gallery/refinements?state=urgency')
    const state = page.locator('[data-refinement-state="urgency"]')
    await expect(state).toBeVisible()
    await page.clock.pauseAt(ENTRY + 60_000)
    await state.getByRole('button', { name: 'EMOM · 5 seconds', exact: true }).click()
    const galleryFlow = state.locator('.clr-timed-flow[data-timed-format="emom"]')
    await stepUntil(page, async () => (await page.locator('[data-countdown-edge]').count()) === 1)
    await expect(galleryFlow.getByRole('timer').first()).toContainText('00:05')
    await openNote(galleryFlow)
    await expect.poll(async () => (await composition(page)).edges[0]?.host).toBe('dialog:open')
    const gallery = await read(page, NOTE_TITLE, `urgency-${name}-gallery`)
    await page.clock.resume()

    // The real route, over the same block: Start, then the clock moved to the same second.
    const app = await syntheticApp(page, timedSession(URGENT_EMOM))
    await visit('/workout')
    const routeFlow = page.locator('main#main .clr-timed-flow[data-timed-format="emom"]')
    await expect(routeFlow).toBeVisible()
    await page.clock.pauseAt(ENTRY + 600_000)
    const start = routeFlow.getByRole('button', { name: 'Start EMOM', exact: true })
    await start.evaluate((node) => node.scrollIntoView({ block: 'center' }))
    await start.click()
    await page.clock.runFor(55_000)
    await stepUntil(page, async () => (await page.locator('[data-countdown-edge]').count()) === 1, 100, 50)
    await expect(routeFlow.getByRole('timer').first()).toContainText('00:05')
    await openNote(routeFlow)
    await expect.poll(async () => (await composition(page)).edges[0]?.host).toBe('dialog:open')
    const route = await read(page, NOTE_TITLE, `urgency-${name}-route`)
    await page.clock.resume()

    const differences = compareSides(gallery, route)
    writeReceipt(`urgency-${name}`, {
      state: 'urgency', width: viewport.width, height: viewport.height, route: '/workout',
      drive: 'EMOM · 5 seconds (Start, 55 s on the held clock), then Coaching and notes → Add note — kb swing; every infinite loop held at its start',
      captures: { 'gallery-dialog': gallery.captures.dialog, 'gallery-viewport': gallery.captures.viewport, 'route-dialog': route.captures.dialog, 'route-viewport': route.captures.viewport },
      lines: { gallery: gallery.lines, route: route.lines },
      composition: { gallery: gallery.composition, route: route.composition },
      differences,
      galleryChanges: [],
    })
    for (const [side, reading] of [['gallery', gallery], ['route', route]] as const) {
      expectComposed(reading.composition, viewport, `${side} @${name}`, { urgent: true })
      expect(reading.composition.dialog?.name, `${side}: the note's fixed title`).toBe(NOTE_TITLE)
    }
    expect(differences.filter((difference) => difference.criterion === null), `urgency @${name}: every difference is one a criterion intends`).toEqual([])
    app.assertContained()
  })

  test(`TASK-AC-09E6C2AF216F ladder-long ${name}: /workout’s twelve-round ladder log, open past its cap, composes the glass and the Balanced dialog as the accepted ladder-long state does`, async ({ page, visit }) => {
    test.setTimeout(240_000)
    await page.setViewportSize(viewport)
    await installDeterministicCapture(page, { skin: 'clear', reducedMotion: false })
    await page.clock.install({ time: ENTRY })

    // The accepted state: its own driver starts the real ladder and runs it past its cap.
    await visit('/gallery/refinements?state=ladder-long')
    const state = page.locator('[data-refinement-state="ladder-long"]')
    await expect(state).toBeVisible()
    await page.clock.pauseAt(ENTRY + 60_000)
    await state.getByRole('button', { name: 'Open Long ladder results', exact: true }).click()
    await stepUntil(page, async () => (await openLog(page).count()) === 1)
    const gallery = await read(page, LOG_RESULTS, `ladder-long-${name}-gallery`)
    await page.clock.resume()

    // The real route, over the same ladder: Start, then past the cap; its log opens itself.
    const app = await syntheticApp(page, timedSession(LONG_LADDER))
    await visit('/workout')
    const routeFlow = page.locator('main#main .clr-timed-flow[data-timed-format="ladder"]')
    await expect(routeFlow).toBeVisible()
    await page.clock.pauseAt(ENTRY + 600_000)
    const start = routeFlow.getByRole('button', { name: 'Start ladder', exact: true })
    await start.evaluate((node) => node.scrollIntoView({ block: 'center' }))
    await start.click()
    await page.clock.fastForward(((LONG_LADDER.ladderTiming?.cap_seconds ?? 0) + 1) * 1000)
    await stepUntil(page, async () => (await openLog(page).count()) === 1, 100, 100)
    const route = await read(page, LOG_RESULTS, `ladder-long-${name}-route`)
    await page.clock.resume()

    const differences = compareSides(gallery, route)
    writeReceipt(`ladder-long-${name}`, {
      state: 'ladder-long', width: viewport.width, height: viewport.height, route: '/workout',
      drive: 'Start ladder → past the cap (the log opens itself), on the held clock; every infinite loop held at its start',
      captures: { 'gallery-dialog': gallery.captures.dialog, 'gallery-viewport': gallery.captures.viewport, 'route-dialog': route.captures.dialog, 'route-viewport': route.captures.viewport },
      lines: { gallery: gallery.lines, route: route.lines },
      composition: { gallery: gallery.composition, route: route.composition },
      differences,
      galleryChanges: [],
    })
    for (const [side, reading] of [['gallery', gallery], ['route', route]] as const) {
      expectComposed(reading.composition, viewport, `${side} @${name}`, { urgent: false })
      expect(reading.composition.dialog?.name, `${side}: the timed log`).toBe(LOG_RESULTS)
    }
    expect(differences.filter((difference) => difference.criterion === null), `ladder-long @${name}: every difference is one a criterion intends`).toEqual([])
    app.assertContained()
  })
}
