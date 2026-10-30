import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import type { Locator, Page, Route, TestInfo } from '@playwright/test'

import { readE2eEnv } from '../scripts/e2e/env.mjs'
import { reviewHandoff } from '../src/state/review-handoff'
import type { SessionAcceptance } from '../src/state/schemas'
import {
  makeGenerationOutput,
  makePrescription,
  makeSessionAcceptance,
  makeWorkoutBlock,
} from '../src/test/factories'
import { fixtureLocation, onboardedProfile } from '../src/test/user-data-double'
import { installDeterministicCapture } from './design-0143/fixtures'
import { expect, test as scanned } from './fixtures'

/**
 * UI polish batch 05 — TASK-011 / REQ-010 / JOURNEY-008. The roomy swap
 * selection (B05-05.2) for every `ExerciseSwapControls` invocation in Review.
 *
 * Viewport/overlay/route choice under test: a native modal overlay above the
 * owning Review route (no new route), spanning the screen's content width with
 * the shell's gutters, its list in the public ScrollRegion and the Keep return
 * outside that list.
 *
 * Each case renders the production `/review` route on its own local Vite
 * origin with synthetic, intercepted reads. Nothing is written, no function
 * or model is called. The visual comparison runs one pixel reading — accent
 * row rules, their width, alignment and text hierarchy, plus the return's
 * rule — on the reference's selected right pane, on its rejected left pane
 * (which must fail it) and on each actual capture. None of this is an
 * installed-iPhone result.
 */
const OWNER = '00000000-0000-4000-8000-000000000011'
const AUTH_KEY = 'clear.auth.session'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
}
const PHONE = { width: 390, height: 844 }
const NARROW = { width: 320, height: 568 }
const SHORT = { width: 390, height: 480 }
const LANDSCAPE_SHORT = { width: 390, height: 320 }
const VIEWPORTS = { phone: PHONE, narrow: NARROW, short: SHORT } as const
type ViewportName = keyof typeof VIEWPORTS
const TOLERANCE = 1

/** Air squat warms up; back squat and kb swing are the primary lift: three invocations. */
const ACCEPTANCE = makeSessionAcceptance({ date: new Date().toISOString().slice(0, 10), goal_preset: 'strength' })
const INVOCATIONS = [
  { slotName: 'air squat', section: 'warmup' },
  { slotName: 'back squat', section: 'primary_lift' },
  { slotName: 'kb swing', section: 'primary_lift' },
] as const

const LONG_NAMES = [
  'Synthetic single-arm landmine rotational press to reverse lunge with overhead reach',
  'Synthetic tempo front-foot-elevated split squat with paused isometric bottom hold',
  'Synthetic contralateral loaded suitcase carry into staggered-stance Romanian deadlift',
]
const LONG_LIST = Array.from({ length: 24 }, (_, index) =>
  index % 8 === 5 ? LONG_NAMES[(index / 8) | 0]! : `Synthetic swap option ${String(index + 1).padStart(2, '0')}`)
const SHORT_LIST = ['Synthetic goblet squat', 'Synthetic box squat', 'Synthetic split squat']

/** Valid grouped shapes already exercised by the Task10 Review proof. */
function groupedAcceptance(firstSupersetId = 'kb-swing'): SessionAcceptance {
  const base = makeGenerationOutput()
  return makeSessionAcceptance({
    ...ACCEPTANCE,
    workout: {
      ...base,
      title: 'Synthetic grouped swap selection',
      sections: [base.sections[0]!, {
        section_type: 'accessory', section_title: 'Accessory', section_notes: null,
        blocks: [makeWorkoutBlock({
          structure_type: 'superset', rep_scheme: 'fixed', rounds: 3, round_rest_seconds: 90,
          exercises: [firstSupersetId, 'high-pull'].map((exercise_id, index) => makePrescription({
            exercise_id, equipment: index === 0 ? 'kettlebell' : 'dumbbell', sets: 3,
            target_value: index === 0 ? 10 : 8, load_type: 'absolute', load_value: 16, rest_seconds: 0,
          })),
        })],
      }, {
        section_type: 'conditioning', section_title: 'Conditioning', section_notes: null,
        blocks: [makeWorkoutBlock({
          structure_type: 'circuit', rep_scheme: 'fixed', rounds: 2, round_rest_seconds: 60,
          exercises: ['mountain-climber', 'squat-jump', 'bear-crawl'].map((exercise_id, index) => makePrescription({
            exercise_id, equipment: 'bodyweight', load_type: 'bodyweight', load_value: null,
            sets: 2, rest_seconds: 60,
            ...(index === 2 ? { modality: 'time' as const, target_value: 20 } : { target_value: 12 - index * 2 }),
          })),
        })],
      }],
    },
  })
}

const GROUPED_ACCEPTANCE = groupedAcceptance()
const GROUPED_INVOCATIONS = [
  { list: 'superset, 3 rounds', slotName: 'kb swing', section: 'accessory', equipment: 'KETTLEBELL',
    rest: 'Rest 90s between rounds' },
  { list: 'circuit, 2 rounds', slotName: 'mountain climber', section: 'conditioning', equipment: 'BODYWEIGHT',
    rest: 'Rest 60s between rounds' },
] as const

function groupedCandidateSets(names: readonly string[]) {
  return GROUPED_INVOCATIONS.map(({ section }) => ({
    section, relaxed: false,
    candidates: names.map((name, index) => ({
      exercise_id: `synthetic-${section}-${index + 1}`, name,
      exercise_role: section === 'accessory' ? 'accessory' : 'conditioning', can_be_primary: false,
      movement_patterns: section === 'accessory' ? ['hinge'] : ['conditioning'],
      primary_patterns: section === 'accessory' ? ['hinge'] : ['conditioning'],
      component_movements: [], muscles: [],
      usable_equipment: section === 'accessory' ? ['kettlebell', 'dumbbell'] : ['bodyweight'],
    })),
  }))
}

type CandidateMode =
  | { kind: 'ready'; names: readonly string[] }
  | { kind: 'empty' }
  | { kind: 'error-then-ready'; names: readonly string[] }
  | { kind: 'held'; names: readonly string[] }

function candidateRow(name: string, index: number, section: string) {
  const id = `synthetic-${section}-${index + 1}`
  return section === 'warmup'
    ? { exercise_id: id, name, exercise_role: 'mobility', can_be_primary: false, movement_patterns: ['squat'],
        primary_patterns: ['squat'], component_movements: [], muscles: [], usable_equipment: ['bodyweight'] }
    : { exercise_id: id, name, exercise_role: 'compound_lift', can_be_primary: true, movement_patterns: ['squat'],
        primary_patterns: ['squat'], component_movements: [], muscles: [], usable_equipment: ['barbell'] }
}

function candidateSets(names: readonly string[]) {
  return ['warmup', 'primary_lift'].map((section) => ({
    section, relaxed: false, candidates: names.map((name, index) => candidateRow(name, index, section)),
  }))
}

const IN_USE_ONLY = ACCEPTANCE.workout.sections.map((section) => ({
  section: section.section_type, relaxed: false,
  candidates: section.blocks.flatMap((block) => block.exercises).map((exercise, index) => ({
    ...candidateRow(exercise.exercise_id, index, section.section_type), exercise_id: exercise.exercise_id,
  })),
}))

/** After a pick, Review names the slot from the chosen id, as `exerciseName` does. */
const pickedName = (index: number) => `synthetic primary lift ${index + 1}`

/** The reviewed reference, its SHA-256 and the selected regions, in source pixels (2674 × 1776). */
const REFERENCE_DIR = resolve(import.meta.dirname, '..', '..', '.evidence',
  basename(resolve(import.meta.dirname, '..')), 'sources')
const REFERENCE_FILE = 'sources/source-08-B05-05-swap.jpg'
type Box = { x: number; y: number; width: number; height: number }
/** Right pane (05.2, selected) and left pane (05.1, rejected live view). `screen` is the phone's own width. */
const REFERENCE_REGIONS: Record<'selected' | 'rejected', { label: string; screen: Box; list: Box; ret: Box }> = {
  selected: {
    label: '05.2 right pane — phone x 1210–1988; list y 488–1537; return y 1545–1665',
    screen: { x: 1210, y: 0, width: 778, height: 1776 },
    list: { x: 1210, y: 488, width: 778, height: 1049 },
    ret: { x: 1210, y: 1545, width: 778, height: 120 },
  },
  rejected: {
    label: '05.1 left pane — phone x 20–932; list y 227–1578; return y 1600–1710',
    screen: { x: 20, y: 0, width: 912, height: 1776 },
    list: { x: 20, y: 227, width: 912, height: 1351 },
    ret: { x: 20, y: 1600, width: 912, height: 110 },
  },
}
function referenceIdentity() {
  const path = resolve(REFERENCE_DIR, basename(REFERENCE_FILE))
  const available = existsSync(path)
  return {
    file: REFERENCE_FILE,
    sha256: available ? createHash('sha256').update(readFileSync(path)).digest('hex') : null,
    regions: Object.fromEntries(Object.entries(REFERENCE_REGIONS).map(([key, value]) => [key, value.label])),
    path, available,
  }
}

function sourceIdentity() {
  const root = resolve(import.meta.dirname, '..')
  const git = (...args: string[]) => execFileSync('git', args, {
    cwd: root, encoding: 'utf8', timeout: 10_000,
  }).trim()
  const head = git('rev-parse', '--verify', 'HEAD')
  const dirty = git('status', '--porcelain') !== ''
  const swapSource = readFileSync(resolve(root, 'src/ui/exercise-swap.tsx'))
  const swapCss = readFileSync(resolve(root, 'src/ui/exercise-swap.css'))
  expect(head, 'Capture requires this checkout’s actual Git HEAD').toMatch(/^[a-f0-9]{40}$/)
  // Interim evidence may honestly be dirty. A failed Git read cannot certify a capture.
  return {
    head, dirty,
    exerciseSwapTsx: createHash('sha256').update(swapSource).digest('hex'),
    exerciseSwapCss: createHash('sha256').update(swapCss).digest('hex'),
  }
}

/** As the other B05 specs do: a local bundle with non-secret placeholders when no public URL is configured. */
const e2e = readE2eEnv()
const SYNTHETIC_ORIGIN_NEEDED = !e2e.usesExternalTarget && (e2e.url === null || e2e.anonKey === null)

async function waitForOrigin(origin: string, deadline: number) {
  while (Date.now() < deadline) {
    try {
      if ((await fetch(origin)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((settle) => setTimeout(settle, 250))
  }
  throw new Error(`Synthetic swap origin ${origin} did not start`)
}

const PAGE_ORIGINS = new WeakMap<Page, string>()
const isLoopback = (hostname: string) => hostname === 'localhost' || hostname.endsWith('.localhost') ||
  /^127(?:\.\d{1,3}){3}$/.test(hostname) || hostname === '[::1]'

const test = scanned.extend<object, { syntheticOrigin: string | null }>({
  syntheticOrigin: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use, workerInfo) => {
      if (!SYNTHETIC_ORIGIN_NEEDED) return use(null)
      const port = 5490 + workerInfo.parallelIndex
      const origin = `http://localhost:${port}`
      const server = spawn(process.execPath, [
        resolve(import.meta.dirname, '../node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort',
      ], {
        env: {
          ...process.env,
          VITE_SUPABASE_URL: 'https://synthetic-b05-swap.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-b05-swap-public-placeholder',
        },
        stdio: 'ignore',
      })
      const closed = new Promise<void>((settle) => {
        server.once('exit', () => settle())
        server.once('error', () => settle())
      })
      try {
        await waitForOrigin(origin, Date.now() + 90_000)
        await use(origin)
      } finally {
        server.kill()
        await closed
      }
    },
    { scope: 'worker', timeout: 120_000 },
  ],
  baseURL: async ({ baseURL, syntheticOrigin }, use) => use(syntheticOrigin ?? baseURL),
})

async function syntheticReview(page: Page, mode: CandidateMode, skin: 'clear' | 'vapour' = 'vapour',
  options: { acceptance?: SessionAcceptance; candidateSets?: readonly unknown[] } = {}) {
  const acceptance = options.acceptance ?? ACCEPTANCE
  const unexpected: string[] = []
  const blockedOutbound: string[] = []
  let attemptedWrites = 0
  let candidateReads = 0
  let release: () => void = () => {}
  const held = new Promise<void>((settle) => { release = settle })
  const origin = PAGE_ORIGINS.get(page)
  if (origin === undefined) throw new Error('Synthetic swap proof requires its verified local origin')
  const guard = await installDeterministicCapture(page, { skin, reducedMotion: false })
  await page.route('**/*', (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin === origin && ['GET', 'HEAD'].includes(request.method())) return route.continue()
    blockedOutbound.push(`${request.method()} ${url.origin}${url.pathname}`)
    return route.abort('blockedbyclient')
  })
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
      if (name === 'profiles') return reply([onboardedProfile({ id: OWNER, goal_preset: 'strength' })])
      if (name === 'locations') return reply([fixtureLocation({ id: acceptance.location_id!, user_id: OWNER, tier: 'full' })])
      if (['workout_sessions', 'load_anchors', 'location_equipment', 'saved_workout_attempts', 'saved_workouts', 'rest_days'].includes(name)) {
        return reply([])
      }
      unexpected.push(`GET ${url.pathname}`)
      return reply([])
    }
    if (request.method() === 'POST' && url.pathname.includes('/rpc/')) {
      if (name === 'resume_session') return reply(null)
      if (name === 'generation_candidate_sets_for_goal') {
        candidateReads += 1
        // Over-filtered: every candidate is already in the workout, so the slot has nothing else.
        if (mode.kind === 'empty') return reply(IN_USE_ONLY)
        if (mode.kind === 'error-then-ready' && candidateReads === 1) {
          return reply({ code: 'PGRST000', message: 'Synthetic candidate read failure.' }, 503)
        }
        if (mode.kind === 'held') await held
        return reply(options.candidateSets ?? candidateSets(mode.names))
      }
      if (['streak_sessions', 'constraints_in_force', 'anchor_evidence', 'conditioning_history'].includes(name)) {
        return reply([])
      }
    }
    if (request.method() !== 'GET') attemptedWrites += 1
    unexpected.push(`${request.method()} ${url.pathname}`)
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic swap request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ authKey, owner, handoff }) => {
    localStorage.setItem(authKey, JSON.stringify({
      accessToken: 'synthetic-b05-swap-session', refreshToken: 'synthetic-b05-swap-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-b05-swap@example.invalid' },
    }))
    if (location.pathname === '/review') {
      window.history.replaceState({ usr: handoff, key: 'synthetic-swap-proof', idx: 0 }, '', location.href)
    }
  }, { authKey: AUTH_KEY, owner: OWNER, handoff: reviewHandoff(acceptance) })
  return {
    release: () => release(),
    candidateReads: () => candidateReads,
    assertNoWrites() {
      expect(attemptedWrites, unexpected.join(', ')).toBe(0)
      expect(unexpected, 'Every API request must have an explicit synthetic read disposition').toEqual([])
      expect(blockedOutbound, 'No request may leave the exact local read origin/API mocks').toEqual([])
      expect(guard.blockedGenerations()).toBe(0)
    },
  }
}

async function openReview(page: Page, visit: (path: string) => Promise<unknown>, acceptance = ACCEPTANCE) {
  await visit('/review')
  await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(acceptance.workout.title)
  await page.evaluate(() => document.fonts.ready)
}

async function openSwap(page: Page, slotName: string) {
  // A previous dialog stays modal through its 200ms package exit; wait for native closure.
  await expect(page.locator('dialog[open]')).toHaveCount(0)
  const trigger = page.getByRole('button', { name: `Swap ${slotName}`, exact: true })
  await trigger.scrollIntoViewIfNeeded()
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: `Swap ${slotName}`, exact: true })
  await expect(dialog).toBeVisible()
  // The package's arrival is 200ms; read once the panel has settled. A loader's loop never ends.
  await expect.poll(() => dialog.evaluate((element) => element.getAnimations({ subtree: true })
    .filter((animation) => animation.playState === 'running' &&
      animation.effect?.getComputedTiming().iterations !== Infinity).length)).toBe(0)
  return { dialog, trigger }
}

/** The dialog's rendered composition, read from the DOM at the real viewport. */
async function composition(dialog: Locator) {
  return dialog.evaluate((element) => {
    const box = (node: Element | null) => {
      if (node === null) return null
      const r = node.getBoundingClientRect()
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }
    }
    const panel = element.querySelector(':scope > .clr-bleed > .clr-chamfer')!
    const list = element.querySelector('ul[aria-label="Alternatives"]')
    const scroller = element.querySelector('.clr-scroll-region__scroller')
    const region = element.querySelector('.clr-scroll-region')
    const keep = [...element.querySelectorAll('.clr-actions button')].at(0) ?? null
    const rows = list === null ? [] : [...list.querySelectorAll(':scope > li > .clr-bleed')].map((bleed) => {
      const button = bleed.querySelector('button')!
      const [name, equipment] = [...button.querySelectorAll(':scope > span')]
      const style = (node: Element) => {
        const s = getComputedStyle(node)
        return { size: parseFloat(s.fontSize), weight: Number(s.fontWeight), color: s.color }
      }
      return {
        bleed: box(bleed)!, button: box(button)!, name: { ...box(name)!, ...style(name!), text: name!.textContent },
        equipment: { ...box(equipment)!, ...style(equipment!), text: equipment!.textContent },
        overflowX: button.scrollWidth > button.clientWidth + 1,
      }
    })
    const style = getComputedStyle(element)
    return {
      classes: [...element.classList],
      dialog: box(element)!, panel: box(panel)!, list: box(list), scroller: box(scroller), keep: box(keep),
      keepLabel: keep?.textContent ?? null,
      keepInsideScroller: keep !== null && scroller !== null && scroller.contains(keep),
      titleInsideScroller: scroller !== null && scroller.contains(element.querySelector('h2')),
      padding: { left: parseFloat(style.paddingLeft), right: parseFloat(style.paddingRight) },
      rows,
      region: region === null ? null : {
        clip: getComputedStyle(region).overflow, measured: region.hasAttribute('data-measured'),
        scrollHeight: scroller!.scrollHeight, clientHeight: scroller!.clientHeight,
      },
      text: element.textContent ?? '',
      viewport: { width: window.innerWidth, height: window.innerHeight },
    }
  })
}
type Composition = Awaited<ReturnType<typeof composition>>

/** The roomy frame: the screen's content width with the shell's 16px gutters, never a central column. */
function expectRoomyFrame(state: Composition) {
  const gutter = 16
  expect(state.classes).toContain('clr-swap-dialog')
  expect(state.panel.left).toBeCloseTo(gutter, 0)
  expect(state.viewport.width - state.panel.right).toBeCloseTo(gutter, 0)
  expect(state.panel.width).toBeGreaterThanOrEqual(state.viewport.width - 2 * gutter - TOLERANCE)
  expect(state.panel.top).toBeGreaterThanOrEqual(-TOLERANCE)
  expect(state.panel.bottom).toBeLessThanOrEqual(state.viewport.height + TOLERANCE)
  // The return is reachable and separate from the list.
  expect(state.keep).not.toBeNull()
  expect(state.keepInsideScroller).toBe(false)
  expect(state.titleInsideScroller).toBe(false)
  expect(state.keep!.top).toBeGreaterThanOrEqual(0)
  expect(state.keep!.bottom).toBeLessThanOrEqual(state.viewport.height + TOLERANCE)
  expect(state.keep!.height).toBeGreaterThanOrEqual(40 - TOLERANCE)
  expect(state.keep!.left).toBeLessThanOrEqual(state.panel.left + 32)
  expect(state.keep!.right).toBeGreaterThanOrEqual(state.panel.right - 32)
  // No rejected demo/helper copy.
  expect(state.text).not.toMatch(/Demo candidates|Scroll within this screen/i)
}

/** Full-width rows with the name over a quieter equipment reading. */
function expectRoomyRows(state: Composition) {
  expect(state.list).not.toBeNull()
  expect(state.rows.length).toBeGreaterThan(0)
  for (const row of state.rows) {
    expect(row.bleed.left).toBeCloseTo(state.list!.left, 0)
    expect(row.bleed.right).toBeCloseTo(state.list!.right, 0)
    expect(row.button.width).toBeGreaterThanOrEqual(state.list!.width - 2 * TOLERANCE)
    expect(row.overflowX).toBe(false)
    expect(row.name.left).toBeCloseTo(row.equipment.left, 0)
    expect(row.equipment.top).toBeGreaterThanOrEqual(row.name.bottom - TOLERANCE)
    expect(row.name.right).toBeLessThanOrEqual(row.button.right + TOLERANCE)
    expect(row.name.size).toBeGreaterThan(row.equipment.size)
    expect(row.name.weight).toBeGreaterThan(row.equipment.weight)
    expect(row.name.color).not.toBe(row.equipment.color)
  }
  // The visible list (its scroller) ends above the return; it never runs under it.
  expect(state.scroller!.bottom).toBeLessThanOrEqual(state.keep!.top + TOLERANCE)
  expect(state.scroller!.left).toBeCloseTo(state.list!.left, 0)
  expect(state.scroller!.right).toBeCloseTo(state.list!.right, 0)
}

/** The real grouped row readings, excluding only the movement that a pick replaces. */
async function groupReadings(list: Locator) {
  return list.evaluate((ol) => ({
    badge: ol.parentElement!.firstElementChild!.textContent,
    rest: ol.parentElement!.lastElementChild!.textContent,
    members: [...ol.children].map((item) => {
      const [nameRow, prescription, equipment] = [...item.firstElementChild!.children]
      return {
        ordinal: nameRow!.firstElementChild!.firstElementChild!.textContent,
        prescription: prescription!.textContent,
        equipment: equipment!.textContent,
      }
    }),
  }))
}

// ─────────────────────────────────────────────────────────────────────────────
// The pixel reading, applied identically to the reference and to captures
// ─────────────────────────────────────────────────────────────────────────────

type Reading = Awaited<ReturnType<typeof readPixels>>

/**
 * Within `list`: horizontal runs of the action-accent ink are the choices'
 * frame rules. Each top/bottom pair is one choice; its width, leading edge and
 * the two text bands inside it (name, then equipment) are read. Within `ret`:
 * the widest accent rule is the return action. All widths are fractions of the
 * phone's own width, so a 3x reference and a CSS-pixel capture compare.
 */
async function readPixels(page: Page, image: Buffer, mime: string,
  regions: { screen: Box; list: Box; ret: Box }, accent: [number, number, number]) {
  return page.evaluate(async ({ data, mime, regions, accent }) => {
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
    const bitmap = await createImageBitmap(new Blob([bytes], { type: mime }))
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const context = canvas.getContext('2d')!
    context.drawImage(bitmap, 0, 0)
    const all = context.getImageData(0, 0, bitmap.width, bitmap.height)
    const px = (x: number, y: number) => {
      const i = (y * bitmap.width + x) * 4
      return [all.data[i]!, all.data[i + 1]!, all.data[i + 2]!] as const
    }
    const isAccent = (x: number, y: number) => {
      const [r, g, b] = px(x, y)
      return Math.hypot(r - accent[0], g - accent[1], b - accent[2]) < 95
    }
    const lum = (x: number, y: number) => {
      const [r, g, b] = px(x, y)
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    const W = regions.screen.width
    const scale = W / 390
    function rules(box: { x: number; y: number; width: number; height: number }) {
      const found: { y0: number; y1: number; x0: number; x1: number }[] = []
      const maxGap = Math.max(2, Math.round(2 * scale))
      for (let y = Math.round(box.y); y < Math.min(bitmap.height, box.y + box.height); y++) {
        let best = { x0: 0, x1: -1 }
        let start = -1
        let last = -1
        for (let x = Math.round(box.x); x < Math.min(bitmap.width, box.x + box.width); x++) {
          if (!isAccent(x, y)) continue
          if (start < 0 || x - last > maxGap) start = x
          last = x
          if (last - start > best.x1 - best.x0) best = { x0: start, x1: last }
        }
        if (best.x1 - best.x0 < 0.2 * W) continue
        const previous = found.at(-1)
        if (previous !== undefined && y - previous.y1 <= Math.max(3, 3 * scale)) {
          previous.y1 = y
          previous.x0 = Math.min(previous.x0, best.x0)
          previous.x1 = Math.max(previous.x1, best.x1)
        } else {
          found.push({ y0: y, y1: y, ...best })
        }
      }
      return found
    }
    const listRules = rules(regions.list)
    const rows: { x0: number; x1: number; top: number; bottom: number }[] = []
    for (let index = 0; index + 1 < listRules.length;) {
      const top = listRules[index]!
      const bottom = listRules[index + 1]!
      if (bottom.y0 - top.y1 >= 0.08 * W) {
        rows.push({ x0: Math.min(top.x0, bottom.x0), x1: Math.max(top.x1, bottom.x1), top: top.y1, bottom: bottom.y0 })
        index += 2
      } else {
        index += 1
      }
    }
    // Text bands inside each choice: bright, non-accent ink, top to bottom.
    const hierarchy = rows.map((row) => {
      const inset = Math.round(6 * scale)
      const x0 = row.x0 + inset
      const x1 = row.x1 - inset
      let background = 0
      let count = 0
      for (let x = x0; x < x1; x += 3) { background += lum(x, row.top + inset); count += 1 }
      background /= Math.max(1, count)
      const lines: { y0: number; y1: number; values: number[] }[] = []
      for (let y = row.top + inset; y < row.bottom - inset; y++) {
        const values: number[] = []
        for (let x = x0; x < x1; x++) {
          const value = lum(x, y)
          if (value > background + 45) values.push(value)
        }
        const previous = lines.at(-1)
        if (values.length < 2) continue
        if (previous !== undefined && y - previous.y1 <= Math.max(1, Math.round(scale))) {
          previous.y1 = y
          previous.values.push(...values)
        } else {
          lines.push({ y0: y, y1: y, values })
        }
      }
      const bands = lines.filter((line) => line.y1 - line.y0 >= 3 * scale)
      const bright = (values: number[]) => {
        const sorted = [...values].sort((a, b) => b - a)
        const top = sorted.slice(0, Math.max(1, Math.round(sorted.length * 0.3)))
        return top.reduce((sum, value) => sum + value, 0) / top.length
      }
      if (bands.length < 2) return { bands: bands.length, nameBright: null, equipmentBright: null, ratio: null }
      const name = bands[0]!
      const equipment = bands.at(-1)!
      const nameHeight = name.y1 - name.y0 + 1
      const equipmentHeight = equipment.y1 - equipment.y0 + 1
      return {
        bands: bands.length,
        nameBright: bright(name.values), equipmentBright: bright(equipment.values),
        ratio: nameHeight / equipmentHeight,
      }
    })
    const retRules = rules(regions.ret)
    const ret = retRules.reduce<{ x0: number; x1: number } | null>((widest, rule) =>
      widest === null || rule.x1 - rule.x0 > widest.x1 - widest.x0 ? rule : widest, null)
    const widths = rows.map((row) => (row.x1 - row.x0) / W)
    const lefts = rows.map((row) => (row.x0 - regions.screen.x) / W)
    const median = (values: number[]) => {
      const sorted = [...values].sort((a, b) => a - b)
      return sorted.length === 0 ? 0 : sorted[(sorted.length - 1) >> 1]!
    }
    const withText = hierarchy.filter((entry) => entry.nameBright !== null)
    return {
      rows: rows.length,
      widthMedian: median(widths),
      widthSpread: widths.length === 0 ? 1 : Math.max(...widths) - Math.min(...widths),
      leftSpread: lefts.length === 0 ? 1 : Math.max(...lefts) - Math.min(...lefts),
      hierarchyRows: withText.length,
      hierarchyContrast: median(withText.map((entry) => entry.nameBright! - entry.equipmentBright!)),
      hierarchyHeight: median(withText.map((entry) => entry.ratio!)),
      returnWidth: ret === null ? 0 : (ret.x1 - ret.x0) / W,
    }
  }, { data: image.toString('base64'), mime, regions, accent })
}

/** The B05-05.2 verdicts. The selected pane must pass every one; the rejected left pane must not. */
function verdicts(reading: Reading) {
  return {
    fullWidthRows: reading.rows >= 2 && reading.widthMedian >= 0.7,
    equalRows: reading.rows >= 2 && reading.widthSpread <= 0.03,
    sharedLeadingEdge: reading.rows >= 2 && reading.leftSpread <= 0.02,
    // The name's glyphs are taller than the equipment's, and brighter.
    nameOverEquipment: reading.hierarchyRows >= 1 && reading.hierarchyHeight >= 1.08 && reading.hierarchyContrast >= 20,
    roomyReturn: reading.returnWidth >= 0.7,
  }
}

async function referenceReadings(page: Page) {
  const identity = referenceIdentity()
  expect(identity.available, `B05-05 reference must be readable at ${identity.path}`).toBe(true)
  const image = readFileSync(identity.path)
  // The reference's accent: the median of its teal action-rule ink in the selected pane.
  const accent: [number, number, number] = [60, 222, 190]
  const selected = await readPixels(page, image, 'image/jpeg', REFERENCE_REGIONS.selected, accent)
  const rejected = await readPixels(page, image, 'image/jpeg', REFERENCE_REGIONS.rejected, accent)
  return { identity, accent, selected, rejected }
}

/** The capture's own action accent, resolved from the live skin's token. */
async function liveAccent(page: Page): Promise<[number, number, number]> {
  return page.evaluate(() => {
    const probe = document.createElement('div')
    probe.style.backgroundColor = 'var(--border-cta-primary)'
    document.body.append(probe)
    const canvas = new OffscreenCanvas(1, 1)
    const context = canvas.getContext('2d')!
    context.fillStyle = getComputedStyle(probe).backgroundColor
    context.fillRect(0, 0, 1, 1)
    probe.remove()
    const [r, g, b] = context.getImageData(0, 0, 1, 1).data
    return [r!, g!, b!] as [number, number, number]
  })
}

async function capture(page: Page, testInfo: TestInfo, id: string, record: Record<string, unknown>) {
  const png = await page.screenshot({ animations: 'disabled', caret: 'hide', scale: 'css' })
  const viewport = page.viewportSize()!
  expect(png.readUInt32BE(16)).toBe(viewport.width)
  expect(png.readUInt32BE(20)).toBe(viewport.height)
  const sha256 = createHash('sha256').update(png).digest('hex')
  writeFileSync(testInfo.outputPath(`${id}.png`), png)
  const reference = referenceIdentity()
  const entry = {
    id, sha256, viewport, source: sourceIdentity(), route: new URL(page.url()).pathname,
    reference: { file: reference.file, sha256: reference.sha256, regions: reference.regions }, ...record,
  }
  writeFileSync(testInfo.outputPath(`${id}.json`), JSON.stringify(entry, null, 2))
  await testInfo.attach(`${id}.png`, { body: png, contentType: 'image/png' })
  await testInfo.attach(`${id}.json`, { body: JSON.stringify(entry, null, 2), contentType: 'application/json' })
  testInfo.annotations.push({ type: 'capture', description: `${id} ${sha256}` })
  return png
}

/** Compare one actual list capture with the selected pane, reading-for-reading. */
async function compareWithReference(page: Page, testInfo: TestInfo, id: string, state: Composition,
  record: Record<string, unknown>) {
  await capture(page, testInfo, id, record)
  // Read the same frame at device pixels, so glyph heights resolve as finely as the reference's.
  const device = await page.screenshot({ animations: 'disabled', caret: 'hide', scale: 'device' })
  writeFileSync(testInfo.outputPath(`${id}.device.png`), device)
  const k = device.readUInt32BE(16) / state.viewport.width
  const reference = await referenceReadings(page)
  const list = state.scroller!
  const keep = state.keep!
  const regions = {
    screen: { x: 0, y: 0, width: state.viewport.width * k, height: state.viewport.height * k },
    list: { x: 0, y: Math.max(0, list.top) * k, width: state.viewport.width * k,
      height: (Math.min(state.viewport.height, list.bottom) - Math.max(0, list.top)) * k },
    ret: { x: 0, y: Math.max(0, keep.top - 4) * k, width: state.viewport.width * k, height: (keep.height + 8) * k },
  }
  const actual = await readPixels(page, device, 'image/png', regions, await liveAccent(page))
  const expected = verdicts(reference.selected)
  const observed = verdicts(actual)
  const result = {
    id, deviceCapture: { sha256: createHash('sha256').update(device).digest('hex'), scale: k }, reference: { file: reference.identity.file, sha256: reference.identity.sha256,
      selected: reference.selected, rejected: reference.rejected },
    actual, verdicts: { selected: expected, rejected: verdicts(reference.rejected), actual: observed },
    widthDelta: Math.abs(actual.widthMedian - reference.selected.widthMedian),
  }
  writeFileSync(testInfo.outputPath(`${id}.comparison.json`), JSON.stringify(result, null, 2))
  await testInfo.attach(`${id}.comparison.json`, { body: JSON.stringify(result, null, 2), contentType: 'application/json' })
  testInfo.annotations.push({ type: 'pixel-comparison', description: `${id} ${JSON.stringify({ actual: observed, width: actual.widthMedian.toFixed(3), ref: reference.selected.widthMedian.toFixed(3) })}` })
  expect(observed, `${id} must match the B05-05.2 selected pane's readings`).toEqual(expected)
  expect(result.widthDelta, `${id} row width must sit near the selected pane's`).toBeLessThanOrEqual(0.1)
  return result
}

test.use({ timezoneId: 'UTC' })

test.describe('B05 REQ-010 roomy swap selection', () => {
  test.beforeEach(({ browserName, baseURL, page }, testInfo) => {
    const origin = new URL(String(baseURL))
    expect(isLoopback(origin.hostname), 'This synthetic proof may run only on a local target').toBe(true)
    PAGE_ORIGINS.set(page, origin.origin)
    expect(testInfo.project.name).toBe('mobile')
    expect(browserName).toBe('chromium')
    testInfo.annotations.push({ type: 'proof-mode', description:
      'Synthetic intercepted reads on the production /review route in mobile Chromium; no backend write, model or installed-iPhone proof.' })
  })

  test('the pixel reading discriminates: B05-05.2 passes every verdict and the live 05.1 pane does not', async ({ page }, testInfo) => {
    const reference = await referenceReadings(page)
    const selected = verdicts(reference.selected)
    const rejected = verdicts(reference.rejected)
    const record = { reference: { file: reference.identity.file, sha256: reference.identity.sha256,
      regions: reference.identity.regions }, accent: reference.accent, selected: reference.selected,
    rejected: reference.rejected, verdicts: { selected, rejected } }
    writeFileSync(testInfo.outputPath('reference-readings.json'), JSON.stringify(record, null, 2))
    await testInfo.attach('reference-readings.json', { body: JSON.stringify(record, null, 2), contentType: 'application/json' })
    expect(Object.values(selected).every(Boolean), JSON.stringify(record)).toBe(true)
    expect(rejected.fullWidthRows, JSON.stringify(record)).toBe(false)
    expect(rejected.nameOverEquipment, JSON.stringify(record)).toBe(false)
    expect(rejected.roomyReturn, JSON.stringify(record)).toBe(false)
  })

  for (const viewportName of ['phone', 'narrow', 'short'] as ViewportName[]) {
    const viewport = VIEWPORTS[viewportName]

    test(`every Review invocation opens the roomy composition over a long list at ${viewportName} ${viewport.width}x${viewport.height}`, async ({ page, visit }, testInfo) => {
      await page.setViewportSize(viewport)
      const app = await syntheticReview(page, { kind: 'ready', names: LONG_LIST })
      await openReview(page, visit)
      for (const { slotName, section } of INVOCATIONS) {
        const { dialog } = await openSwap(page, slotName)
        await expect(dialog.getByRole('list', { name: 'Alternatives' }).getByRole('button')).toHaveCount(LONG_LIST.length)
        const state = await composition(dialog)
        expectRoomyFrame(state)
        expectRoomyRows(state)
        // The long list scrolls inside its own public region (GLOBAL-03), hard-clipped.
        expect(state.region).not.toBeNull()
        expect(state.region!.clip).toBe('hidden')
        expect(state.region!.measured).toBe(true)
        expect(state.region!.scrollHeight).toBeGreaterThan(state.region!.clientHeight)
        expect(state.keepLabel).toBe(`Keep ${slotName}`)
        const region = dialog.locator('.clr-scroll-region')
        const scroller = region.locator(':scope > .clr-scroll-region__scroller')
        const box = (await scroller.boundingBox())!
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
        await page.mouse.wheel(0, 260)
        await expect(region).toHaveAttribute('data-scrolling', '')
        await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
        await expect(region).not.toHaveAttribute('data-scrolling', '', { timeout: 5_000 })
        await scroller.evaluate((element) => { element.scrollTop = 0 })
        // Capture at rest: the reset's own scroll lights the cue, then it fades again.
        await expect(region).toHaveAttribute('data-scrolling', '')
        await expect(region).not.toHaveAttribute('data-scrolling', '', { timeout: 5_000 })
        await expect.poll(() => region.evaluate((element) => Number(getComputedStyle(
          element.querySelector(':scope > .clr-scroll-region__bar')!).opacity))).toBe(0)
        const id = `swap-long-${viewportName}-${slotName.replaceAll(' ', '-')}`
        await compareWithReference(page, testInfo, id, await composition(dialog), {
          consumer: `ExerciseSwapControls → SwapDialog (${section}, Swap ${slotName})`, state: 'long list, at rest',
          skin: 'vapour', criteria: ['AC-030', 'AC-049', 'AC-065'] })
        await dialog.getByRole('button', { name: `Keep ${slotName}`, exact: true }).click()
        await expect(dialog).toBeHidden()
      }
      app.assertNoWrites()
    })

    test(`short list and long names keep full-width rows at ${viewportName} ${viewport.width}x${viewport.height}`, async ({ page, visit }, testInfo) => {
      await page.setViewportSize(viewport)
      const app = await syntheticReview(page, { kind: 'ready', names: [...SHORT_LIST, ...LONG_NAMES] })
      await openReview(page, visit)
      const { dialog } = await openSwap(page, 'back squat')
      const buttons = dialog.getByRole('list', { name: 'Alternatives' }).getByRole('button')
      await expect(buttons).toHaveCount(SHORT_LIST.length + LONG_NAMES.length)
      const state = await composition(dialog)
      expectRoomyFrame(state)
      expectRoomyRows(state)
      // Long names wrap inside their row, under themselves, without widening it.
      const long = state.rows.filter((row) => LONG_NAMES.includes(row.name.text ?? ''))
      expect(long).toHaveLength(LONG_NAMES.length)
      for (const row of long) expect(row.name.height).toBeGreaterThan(row.equipment.height * 1.5)
      await compareWithReference(page, testInfo, `swap-short-long-names-${viewportName}`, state, {
        consumer: 'ExerciseSwapControls → SwapDialog (primary_lift, Swap back squat)', state: 'short list with long names',
        skin: 'vapour', criteria: ['AC-030', 'AC-049', 'AC-065'] })
      await dialog.getByRole('button', { name: 'Keep back squat', exact: true }).click()
      await expect(dialog).toBeHidden()
      app.assertNoWrites()
    })
  }

  test('a three-choice list fits without scrolling and keeps the roomy rows (phone)', async ({ page, visit }, testInfo) => {
    await page.setViewportSize(PHONE)
    const app = await syntheticReview(page, { kind: 'ready', names: SHORT_LIST })
    await openReview(page, visit)
    const { dialog } = await openSwap(page, 'back squat')
    await expect(dialog.getByRole('list', { name: 'Alternatives' }).getByRole('button')).toHaveCount(3)
    const state = await composition(dialog)
    expectRoomyFrame(state)
    expectRoomyRows(state)
    expect(state.region!.scrollHeight).toBeLessThanOrEqual(state.region!.clientHeight + TOLERANCE)
    await expect(dialog.locator('.clr-scroll-region__head')).toHaveCount(0)
    await expect(dialog.locator('.clr-scroll-region__foot')).toHaveCount(0)
    await compareWithReference(page, testInfo, 'swap-short-phone', state, {
      consumer: 'ExerciseSwapControls → SwapDialog (primary_lift, Swap back squat)', state: 'short list, fitting',
      skin: 'vapour', criteria: ['AC-030', 'AC-049', 'AC-065'] })
    await dialog.getByRole('button', { name: 'Keep back squat', exact: true }).click()
    app.assertNoWrites()
  })

  test('CLEAR skin keeps the same roomy composition (narrow)', async ({ page, visit }, testInfo) => {
    await page.setViewportSize(NARROW)
    const app = await syntheticReview(page, { kind: 'ready', names: LONG_LIST }, 'clear')
    await openReview(page, visit)
    const { dialog } = await openSwap(page, 'back squat')
    await expect(dialog.getByRole('list', { name: 'Alternatives' }).getByRole('button')).toHaveCount(LONG_LIST.length)
    const state = await composition(dialog)
    expectRoomyFrame(state)
    expectRoomyRows(state)
    await compareWithReference(page, testInfo, 'swap-long-narrow-clear', state, {
      consumer: 'ExerciseSwapControls → SwapDialog (primary_lift, Swap back squat)', state: 'long list, at rest',
      skin: 'clear', criteria: ['AC-030', 'AC-049', 'AC-065'] })
    app.assertNoWrites()
  })

  for (const { name, viewport } of [
    { name: 'phone', viewport: PHONE },
    { name: 'narrow', viewport: NARROW },
  ]) {
    test(`Superset and Circuit selections preserve their owning grouped Review at ${name}`, async ({ page, visit, checkA11y }, testInfo) => {
      await page.setViewportSize(viewport)
      const app = await syntheticReview(page, { kind: 'ready', names: LONG_LIST }, 'vapour', {
        acceptance: GROUPED_ACCEPTANCE, candidateSets: groupedCandidateSets(LONG_LIST),
      })
      await openReview(page, visit, GROUPED_ACCEPTANCE)
      const chosenIndex = LONG_LIST.length - 3
      const chosen = LONG_LIST[chosenIndex]!
      expect(LONG_NAMES).toContain(chosen)

      for (const invocation of GROUPED_INVOCATIONS) {
        const group = page.getByRole('list', { name: invocation.list, exact: true })
        const owner = group.locator('xpath=..')
        const first = group.getByRole('listitem').first()
        const other = page.getByRole('list', {
          name: GROUPED_INVOCATIONS.find((entry) => entry.list !== invocation.list)!.list, exact: true,
        })
        const original = first.getByRole('button', { name: `Swap ${invocation.slotName}`, exact: true })
        await expect(original).toBeEnabled()
        const beforeText = await owner.innerText()
        const beforeReadings = await groupReadings(group)
        const otherText = await other.innerText()
        const siblingLabels = await group.getByRole('button', { name: /^Swap / })
          .evaluateAll((buttons) => buttons.slice(1).map((button) => button.getAttribute('aria-label')))
        await expect(owner.getByText(invocation.rest, { exact: true })).toHaveCount(1)

        const { dialog } = await openSwap(page, invocation.slotName)
        await expect(dialog.getByRole('list', { name: 'Alternatives' }).getByRole('button')).toHaveCount(LONG_LIST.length)
        const state = await composition(dialog)
        expectRoomyFrame(state)
        expectRoomyRows(state)
        expect(state.region!.scrollHeight).toBeGreaterThan(state.region!.clientHeight)
        await compareWithReference(page, testInfo, `swap-grouped-${invocation.section}-${name}`, state, {
          consumer: `Review ${invocation.list} → SwapDialog`, state: 'grouped long-list selection',
          skin: 'vapour', criteria: ['AC-030', 'AC-049', 'AC-065'],
        })
        await checkA11y()

        const choice = dialog.getByRole('list', { name: 'Alternatives' })
          .getByRole('button', { name: new RegExp(`^${chosen}\\s*${invocation.equipment}$`) })
        await choice.scrollIntoViewIfNeeded()
        const visible = await composition(dialog)
        const choiceBox = (await choice.boundingBox())!
        expect(choiceBox.y).toBeGreaterThanOrEqual(visible.scroller!.top - TOLERANCE)
        expect(choiceBox.y + choiceBox.height).toBeLessThanOrEqual(visible.scroller!.bottom + TOLERANCE)
        expect(visible.keep!.bottom).toBeLessThanOrEqual(viewport.height + TOLERANCE)
        await choice.click()
        await expect(dialog).toBeHidden()
        await expect(page.locator('dialog[open]')).toHaveCount(0)
        await expect(page).toHaveURL(/\/review$/)
        await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(GROUPED_ACCEPTANCE.workout.title)

        const replacementName = `synthetic ${invocation.section} ${chosenIndex + 1}`
        const replacement = first.getByRole('button', { name: `Swap ${replacementName}`, exact: true })
        const undo = first.getByRole('button', { name: `Undo swap — back to ${invocation.slotName}`, exact: true })
        await expect(replacement).toBeEnabled()
        await expect(replacement).toBeFocused()
        await expect(undo).toBeEnabled()
        await expect(undo).toHaveText('Undo swap')
        await expect(original).toHaveCount(0)
        expect(await groupReadings(group)).toEqual(beforeReadings)
        expect(await group.getByRole('button', { name: /^Swap / })
          .evaluateAll((buttons) => buttons.slice(1).map((button) => button.getAttribute('aria-label')))).toEqual(siblingLabels)
        expect(await other.innerText()).toBe(otherText)
        const toast = page.locator('[data-clear-toast-host]')
        await expect(toast.getByRole('status')).toHaveText(`Swapped in ${chosen}.`)
        await toast.getByRole('button', { name: 'Dismiss', exact: true }).click()
        await expect(toast).toHaveCount(0)
        await first.scrollIntoViewIfNeeded()
        await capture(page, testInfo, `swap-grouped-${invocation.section}-${name}-chosen`, {
          consumer: `Review ${invocation.list}`, state: 'intended member replaced, complete Undo available',
          criteria: ['AC-031', 'AC-049'], readings: await groupReadings(group),
        })

        await undo.click()
        await expect(original).toBeEnabled()
        await expect(original).toBeFocused()
        await expect(undo).toHaveCount(0)
        await expect(replacement).toHaveCount(0)
        expect(await owner.innerText()).toBe(beforeText)
        expect(await groupReadings(group)).toEqual(beforeReadings)
        expect(await other.innerText()).toBe(otherText)
        await checkA11y()
        await capture(page, testInfo, `swap-grouped-${invocation.section}-${name}-restored`, {
          consumer: `Review ${invocation.list}`, state: 'Undo restored original member and all group readings',
          criteria: ['AC-031', 'AC-049'], readings: beforeReadings,
        })
      }
      app.assertNoWrites()
    })
  }

  test('390x320 long current title and long choices keep the full return reachable', async ({ page, visit }, testInfo) => {
    await page.setViewportSize(LANDSCAPE_SHORT)
    const currentId = 'single-arm-kettlebell-overhead-reverse-lunge'
    const currentName = 'single arm kettlebell overhead reverse lunge'
    const acceptance = groupedAcceptance(currentId)
    const app = await syntheticReview(page, { kind: 'ready', names: LONG_LIST }, 'vapour', {
      acceptance, candidateSets: groupedCandidateSets(LONG_LIST),
    })
    await openReview(page, visit, acceptance)
    const group = page.getByRole('list', { name: 'superset, 3 rounds', exact: true })
    const before = await group.locator('xpath=..').innerText()
    const { dialog, trigger } = await openSwap(page, currentName)
    await expect(dialog.getByRole('heading', { name: `Swap ${currentName}`, exact: true })).toBeVisible()
    const choices = dialog.getByRole('list', { name: 'Alternatives' }).getByRole('button')
    await expect(choices).toHaveCount(LONG_LIST.length)
    const state = await composition(dialog)
    expectRoomyFrame(state)
    expectRoomyRows(state)
    expect(state.keepLabel).toBe(`Keep ${currentName}`)
    expect(state.region!.scrollHeight).toBeGreaterThan(state.region!.clientHeight)
    const keep = dialog.getByRole('button', { name: `Keep ${currentName}`, exact: true })
    await expect(keep).toBeInViewport({ ratio: 1 })
    await expect(keep).toHaveText(`Keep ${currentName}`)
    await capture(page, testInfo, 'swap-landscape-long-title-open', {
      consumer: 'Review superset → SwapDialog', state: 'long current title, long choices, full return before scroll',
      criteria: ['AC-030', 'AC-049'], composition: state,
    })
    const last = choices.last()
    await last.scrollIntoViewIfNeeded()
    const scrolled = await composition(dialog)
    const lastBox = (await last.boundingBox())!
    expect(lastBox.y).toBeGreaterThanOrEqual(scrolled.scroller!.top - TOLERANCE)
    expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(scrolled.scroller!.bottom + TOLERANCE)
    expectRoomyFrame(scrolled)
    await expect(keep).toBeInViewport({ ratio: 1 })
    await capture(page, testInfo, 'swap-landscape-long-title-scrolled', {
      consumer: 'Review superset → SwapDialog', state: 'last option reached, full return still separate and reachable',
      criteria: ['AC-030', 'AC-049'], composition: scrolled,
    })
    await keep.click()
    await expect(dialog).toBeHidden()
    await expect(page.locator('dialog[open]')).toHaveCount(0)
    await expect(page).toHaveURL(/\/review$/)
    await expect(trigger).toBeEnabled()
    await expect(trigger).toBeFocused()
    expect(await group.locator('xpath=..').innerText()).toBe(before)
    await expect(page.getByRole('button', { name: /^Undo swap/ })).toHaveCount(0)
    await expect(page.locator('[data-clear-toast-host]')).toHaveCount(0)
    app.assertNoWrites()
  })

  test('selecting the last long-named choice returns to the owning Review with the existing toast', async ({ page, visit }, testInfo) => {
    await page.setViewportSize(NARROW)
    const app = await syntheticReview(page, { kind: 'ready', names: LONG_LIST })
    await openReview(page, visit)
    const { dialog } = await openSwap(page, 'back squat')
    const chosen = LONG_LIST.at(-3)!
    expect(LONG_NAMES).toContain(chosen)
    const choice = dialog.getByRole('list', { name: 'Alternatives' })
      .getByRole('button', { name: new RegExp(`^${chosen}\\s*BARBELL$`) })
    await choice.scrollIntoViewIfNeeded()
    const state = await composition(dialog)
    const box = (await choice.boundingBox())!
    expect(box.y).toBeGreaterThanOrEqual(state.scroller!.top - TOLERANCE)
    expect(box.y + box.height).toBeLessThanOrEqual(state.scroller!.bottom + TOLERANCE)
    await capture(page, testInfo, 'swap-select-narrow-before', {
      consumer: 'SwapDialog (primary_lift, Swap back squat)', state: 'long-named choice scrolled into view', criteria: ['AC-031', 'AC-049'] })
    await choice.click()
    await expect(dialog).toBeHidden()
    await expect(page.locator('dialog[open]')).toHaveCount(0)
    await expect(page).toHaveURL(/\/review$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(ACCEPTANCE.workout.title)
    const toast = page.locator('[data-clear-toast-host]')
    await expect(toast.getByRole('status')).toHaveText(`Swapped in ${chosen}.`)
    const replacement = page.getByRole('button', { name: `Swap ${pickedName(LONG_LIST.length - 3)}`, exact: true })
    await expect(replacement).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Undo swap — back to back squat', exact: true })).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Swap back squat', exact: true })).toHaveCount(0)
    await capture(page, testInfo, 'swap-select-narrow-after', {
      consumer: 'Review after SwapDialog selection', state: 'selection applied, toast shown', criteria: ['AC-031'] })
    app.assertNoWrites()
  })

  test('Keep returns to Review with the original movement unchanged (short)', async ({ page, visit }, testInfo) => {
    await page.setViewportSize(SHORT)
    const app = await syntheticReview(page, { kind: 'ready', names: LONG_LIST })
    await openReview(page, visit)
    const { dialog, trigger } = await openSwap(page, 'kb swing')
    const state = await composition(dialog)
    expectRoomyFrame(state)
    await dialog.getByRole('button', { name: 'Keep kb swing', exact: true }).click()
    await expect(dialog).toBeHidden()
    await expect(page).toHaveURL(/\/review$/)
    await expect(trigger).toBeEnabled()
    await expect(trigger).toBeFocused()
    await expect(page.getByRole('button', { name: /^Undo swap/ })).toHaveCount(0)
    await expect(page.locator('[data-clear-toast-host]')).toHaveCount(0)
    // Escape is the same safe return.
    await openSwap(page, 'kb swing')
    await page.keyboard.press('Escape')
    await expect(page.locator('dialog[open]')).toHaveCount(0)
    await expect(trigger).toBeVisible()
    await capture(page, testInfo, 'swap-cancel-short-after', {
      consumer: 'Review after SwapDialog Keep/Escape', state: 'cancelled, original movement unchanged', criteria: ['AC-031'] })
    app.assertNoWrites()
  })

  for (const viewportName of ['phone', 'narrow'] as ViewportName[]) {
    const viewport = VIEWPORTS[viewportName]

    test(`loading renders the existing LoadingView in the roomy frame at ${viewportName}`, async ({ page, visit }, testInfo) => {
      await page.setViewportSize(viewport)

      // Loading: the read is held until the state has been seen and captured.
      const held = await syntheticReview(page, { kind: 'held', names: SHORT_LIST })
      await openReview(page, visit)
      const { dialog } = await openSwap(page, 'back squat')
      const status = dialog.getByRole('status')
      await expect(status).toHaveAttribute('aria-busy', 'true')
      await expect(status).toContainText('Finding alternatives')
      const loading = await composition(dialog)
      expectRoomyFrame(loading)
      expect(loading.list).toBeNull()
      await capture(page, testInfo, `swap-loading-${viewportName}`, {
        consumer: 'SwapDialog (primary_lift, Swap back squat)', state: 'loading (existing LoadingView)',
        criteria: ['AC-031', 'AC-049', 'AC-065'], composition: loading })
      held.release()
      await expect(dialog.getByRole('list', { name: 'Alternatives' }).getByRole('button')).toHaveCount(3)
      await dialog.getByRole('button', { name: 'Keep back squat', exact: true }).click()
      held.assertNoWrites()
    })

    test(`error renders the existing ErrorView and its retry loads the list at ${viewportName}`, async ({ page, visit }, testInfo) => {
      await page.setViewportSize(viewport)
      const app = await syntheticReview(page, { kind: 'error-then-ready', names: SHORT_LIST })
      await openReview(page, visit)
      const { dialog } = await openSwap(page, 'back squat')
      const alert = dialog.getByRole('alert')
      await expect(alert).toContainText('Alternatives didn’t load')
      const error = await composition(dialog)
      expectRoomyFrame(error)
      await capture(page, testInfo, `swap-error-${viewportName}`, {
        consumer: 'SwapDialog (primary_lift, Swap back squat)', state: 'error (existing ErrorView with retry)',
        criteria: ['AC-031', 'AC-049', 'AC-065'], composition: error })
      await alert.getByRole('button', { name: 'Try again' }).click()
      await expect(dialog.getByRole('list', { name: 'Alternatives' }).getByRole('button')).toHaveCount(3)
      expect(app.candidateReads()).toBe(2)
      expectRoomyRows(await composition(dialog))
      await dialog.getByRole('button', { name: 'Keep back squat', exact: true }).click()
      app.assertNoWrites()
    })

    test(`empty renders the existing EmptyState in the roomy frame at ${viewportName}`, async ({ page, visit }, testInfo) => {
      await page.setViewportSize(viewport)
      const app = await syntheticReview(page, { kind: 'empty' })
      await openReview(page, visit)
      const { dialog } = await openSwap(page, 'air squat')
      await expect(dialog.getByText('Nothing else fits this slot')).toBeVisible()
      const empty = await composition(dialog)
      expectRoomyFrame(empty)
      expect(empty.list).toBeNull()
      await capture(page, testInfo, `swap-empty-${viewportName}`, {
        consumer: 'SwapDialog (warmup, Swap air squat)', state: 'empty (existing EmptyState)',
        criteria: ['AC-031', 'AC-049', 'AC-065'], composition: empty })
      await dialog.getByRole('button', { name: 'Keep air squat', exact: true }).click()
      await expect(dialog).toBeHidden()
      app.assertNoWrites()
    })
  }

  test('the Regenerate confirmation keeps the package dialog, not the selection composition', async ({ page, visit }, testInfo) => {
    await page.setViewportSize(PHONE)
    const app = await syntheticReview(page, { kind: 'ready', names: SHORT_LIST })
    await openReview(page, visit)
    const regenerate = page.getByRole('button', { name: 'Regenerate', exact: true })
    await regenerate.scrollIntoViewIfNeeded()
    await regenerate.click()
    const confirm = page.locator('dialog[open]')
    await expect(confirm).toHaveCount(1)
    const state = await confirm.evaluate((element) => ({
      classes: [...element.classList],
      padding: parseFloat(getComputedStyle(element).paddingLeft),
      alternatives: element.querySelector('ul[aria-label="Alternatives"]') !== null,
      region: element.querySelector('.clr-scroll-region') !== null,
    }))
    expect(state.classes).toContain('clr-dialog')
    expect(state.classes).not.toContain('clr-swap-dialog')
    expect(state.padding).toBe(0)
    expect(state.alternatives).toBe(false)
    expect(state.region).toBe(false)
    await capture(page, testInfo, 'regenerate-confirm-phone', {
      consumer: 'RegenerateConfirmDialog (ConfirmDialog)', state: 'unchanged confirmation dialog', criteria: ['AC-031'] })
    await page.keyboard.press('Escape')
    await expect(page.locator('dialog[open]')).toHaveCount(0)
    app.assertNoWrites()
  })
})
