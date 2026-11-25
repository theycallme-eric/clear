import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createServer, type AddressInfo } from 'node:net'
import { join, relative, resolve } from 'node:path'
import type { Locator, Page, Route } from '@playwright/test'

import { readE2eEnv } from '../../scripts/e2e/env.mjs'
import { resolveObjectStore } from '../../scripts/refinement/lib/references.mjs'
import { savedSessionRow } from '../../src/dev/gallery-refinement-overview-data'
import {
  ALL_SETS_SAVED,
  CIRCUIT,
  DISTANCE_MOVEMENT,
  ONE_SAVED_SET,
  OTHER_LIFT,
  PRIMARY_LIFT,
  SUPERSET,
  TIMED_MOVEMENT,
  timedBlock,
} from '../../src/dev/gallery-refinement-fixtures'
import {
  CONTRACT_VERSION,
  sessionSnapshotSchema,
  workoutSessionRowSchema,
  type ExerciseSetLogRow,
  type SessionAcceptance,
  type SessionSnapshot,
} from '../../src/state/schemas'
import type { LoggedSet } from '../../src/state/set-logging'
import type { BlockProgress } from '../../src/state/workout-progress'
import { makePrescription, makeWorkoutBlock } from '../../src/test/factories'
import { formatBadgesSnapshot } from '../../src/test/format-badges-fixture'
import { fixtureLocation, onboardedProfile } from '../../src/test/user-data-double'
import { definitionFixture, snapshotFixture, type SectionFixture } from '../../src/test/workout-double'
import { installDeterministicCapture } from '../design-0143/fixtures'
import { expect, test as scanned } from '../fixtures'

/**
 * A3 TASK-114 look check (TASK-AC-EFC60FF1F169): every logging context's real
 * route beside its accepted gallery state (gallery commit bec4454, Round 7),
 * with matched data, at the two approved phone widths, 320 and 390 — the
 * sixteen logging contexts and ladder-long.
 *
 * This task wires no new route: it sweeps the shared Round 7 owners every
 * logging moment opens in (LoggingOverlay, logging-overlay.css, AppDialog) and
 * fixes, there, what the sweep found. So each case opens the context on its
 * route and in its gallery state and reads, from both, what those owners draw:
 *
 *   · the frame: where it sits in the viewport, its width and height, the
 *     dialog's box being the frame, the scroller seated on the ring's inner
 *     edge, its inner-chamfer clip, no scrollbar, no outline, the end gap;
 *   · the header: the title's and the X's boxes in the frame, the title's
 *     size, line box and trim;
 *   · the rhythm: each choice legend's gap, each complete movement group's
 *     space and inner gaps, the ladder's heading and count gaps;
 *   · every visible word of the dialog, line by line;
 *   · an image of the open dialog, kept beside the Runner's evidence store
 *     (outside Git), its SHA-256 in the receipt.
 *
 * Matched data: the route's session carries the gallery scene's own block and
 * saved sets (`sceneFor` in `gallery-refinement-forms.tsx`), in the gallery's
 * unit (lb); Workout feedback and the rest day have no data of their own.
 * Both sides run on Playwright's clock, held between steps and moved alike.
 * A difference no criterion intends fails the case; an intended one is
 * labelled with its criterion ID in the receipt. Synthetic and contained:
 * nothing is saved.
 */
const OWNER = '00000000-0000-4000-8000-000000011401'
const PLACE = '00000000-0000-4000-8000-000000011411'
const COMPLETED = '00000000-0000-4000-8000-000000011421'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
}
const REPO_ROOT = resolve(import.meta.dirname, '..', '..')
const RECEIPTS = join(REPO_ROOT, 'evidence', 'refinement', 'task-114', 'parity')
const GALLERY = 'bec44545eb982f6dc136a583400f7e314c306d1d'
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
    if (code !== null) throw new Error(`Synthetic TASK-114 server exited (${code}) before ${origin} was ready`)
    try {
      if ((await fetch(origin)).ok && (await fetch(own)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((settle) => setTimeout(settle, 250))
  }
  throw new Error(`Synthetic TASK-114 origin ${origin} did not start`)
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
          VITE_SUPABASE_URL: 'https://synthetic-task-114.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-task-114-public-placeholder',
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
// The contexts and their matched data
// ─────────────────────────────────────────────────────────────────────────────

type Context =
  | 'anchor' | 'other-lift' | 'timed-movement' | 'distance-movement' | 'extra-set' | 'set-correction'
  | 'superset' | 'circuit-round' | 'circuit-movement' | 'movement-note' | 'workout-feedback' | 'rest-day'
  | 'emom' | 'amrap' | 'for_time' | 'ladder' | 'ladder-long'

type TimedKind = 'emom' | 'amrap' | 'for_time' | 'ladder'

interface Shape {
  /** The state's own title: its "Open …" button. */
  readonly label: string
  /** The dialog the moment opens. */
  readonly title: string
  readonly route: '/workout' | '/summary' | '/'
  readonly block?: BlockProgress
  readonly section?: { readonly title: string; readonly type: SectionFixture['sectionType'] }
  readonly seed?: Readonly<Record<string, readonly LoggedSet[]>>
  readonly timed?: TimedKind
  /** How the route's own control is pressed (the gallery's driver presses the same one). */
  readonly drive: string
}

const SETS: Shape['section'] = { title: 'Accessories', type: 'accessory' }
const CONTEXTS: Readonly<Record<Context, Shape>> = {
  anchor: { label: 'Anchor / primary lift', title: 'Log set 1', route: '/workout', block: PRIMARY_LIFT, section: { title: 'Primary lift', type: 'primary_lift' }, drive: 'Rest' },
  'other-lift': { label: 'Other lift', title: 'Log set 1', route: '/workout', block: OTHER_LIFT, section: SETS, drive: 'Rest' },
  'timed-movement': { label: 'Timed movement', title: 'Log set 1', route: '/workout', block: TIMED_MOVEMENT, section: { title: 'Conditioning', type: 'conditioning' }, drive: 'Rest' },
  'distance-movement': { label: 'Distance movement', title: 'Log set 1', route: '/workout', block: DISTANCE_MOVEMENT, section: { title: 'Conditioning', type: 'conditioning' }, drive: 'Rest' },
  'extra-set': { label: 'Extra set', title: 'Log set 4', route: '/workout', block: PRIMARY_LIFT, section: { title: 'Primary lift', type: 'primary_lift' }, seed: ALL_SETS_SAVED, drive: 'Rest' },
  'set-correction': { label: 'Saved-set correction', title: 'Edit set 1', route: '/workout', block: PRIMARY_LIFT, section: { title: 'Primary lift', type: 'primary_lift' }, seed: ONE_SAVED_SET, drive: 'Edit set 1' },
  superset: { label: 'Superset round', title: 'Log round 1', route: '/workout', block: SUPERSET, section: SETS, drive: 'Rest' },
  'circuit-round': { label: 'Circuit round / take back', title: 'Round 1 recorded', route: '/workout', block: CIRCUIT, section: { title: 'Conditioning', type: 'conditioning' }, drive: 'Start round 1 → 32.6 s → Finish round 1' },
  'circuit-movement': { label: 'Circuit movement entry', title: 'Log set 1', route: '/workout', block: CIRCUIT, section: { title: 'Conditioning', type: 'conditioning' }, drive: 'Rest for goblet squat' },
  'movement-note': { label: 'Movement note', title: 'Movement note', route: '/workout', block: SUPERSET, section: SETS, drive: 'Coaching and notes → Add note — one arm row' },
  'workout-feedback': { label: 'Workout feedback', title: 'Workout feedback', route: '/summary', drive: 'Log workout feedback' },
  'rest-day': { label: 'Rest day / reason change', title: 'Log rest day', route: '/', drive: 'Mark Rest Day' },
  emom: { label: 'EMOM results', title: 'Log results', route: '/workout', block: timedBlock('emom'), timed: 'emom', drive: 'Start → past the cap (the log opens itself)' },
  amrap: { label: 'AMRAP results', title: 'Log results', route: '/workout', block: timedBlock('amrap', { multi: true }), timed: 'amrap', drive: 'Start → past the cap (the log opens itself)' },
  for_time: { label: 'For Time results', title: 'Log results', route: '/workout', block: timedBlock('for_time', { multi: true }), timed: 'for_time', drive: 'Start → past the cap (the log opens itself)' },
  ladder: { label: 'Ladder results', title: 'Log results', route: '/workout', block: timedBlock('ladder', { rounds: 4 }), timed: 'ladder', drive: 'Start → past the cap (the log opens itself)' },
  'ladder-long': { label: 'Long ladder results', title: 'Log results', route: '/workout', block: timedBlock('ladder', { rounds: 12 }), timed: 'ladder', drive: 'Start → past the cap (the log opens itself)' },
}

/** The gallery's own sample unit (`PreviewSetLogging`), so loads and saved weights read alike. */
const GALLERY_UNIT = 'lb' as const

/** A set-logging block, as the route's session carries it, with the state's saved sets (TASK-106's method). */
function setSession(shape: Shape): SessionSnapshot {
  const { block, section, seed = {} } = shape
  return sessionSnapshotSchema.parse(snapshotFixture({
    userId: OWNER,
    title: 'TASK-114 parity',
    startedAt: new Date(ENTRY - 10 * 60_000).toISOString(),
    session: { location_id: PLACE, goal_preset: 'balanced' },
    sections: [{
      title: section!.title,
      sectionType: section!.type,
      blocks: [{
        structureType: block!.structureType,
        rounds: block!.rounds,
        roundRestSeconds: block!.roundRestSeconds,
        repScheme: block!.repScheme,
        timerType: block!.timerType,
        timerSeconds: block!.timerSeconds,
        exercises: block!.exercises.map(({ exerciseId, prescription: p }) => ({
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
      title: 'TASK-114 parity', overview: null, estimated_duration_mins: 30,
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
async function syntheticApp(page: Page, snapshot: SessionSnapshot, at: 'workout' | 'done') {
  const unexpected: string[] = []
  const exercises = snapshot.sections.flatMap((section) => section.blocks.flatMap((block) => block.exercises.map(({ exercise }) => exercise)))
  const yesterday = new Date(ENTRY - 24 * 60 * 60_000)
  const completed = workoutSessionRowSchema.parse(savedSessionRow({
    sessionId: COMPLETED, userId: OWNER, date: yesterday.toISOString().slice(0, 10), completedAt: yesterday.toISOString(),
  }))
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
      if (name === 'workout_sessions') return reply(at === 'done' ? [completed] : [])
      return reply([])
    }
    if (request.method() === 'POST' && url.pathname.includes('/rpc/')) {
      if (name === 'resume_session') return reply(at === 'workout' ? snapshot : null)
      if (name === 'session_snapshot') return reply(snapshot)
      if (name === 'session_as_performed') return reply(null)
      if (name === 'streak_sessions') return reply(at === 'done' ? [{ session_id: COMPLETED, completed_at: completed.completed_at, counts_for_streak: true }] : [])
      if (['constraints_in_force', 'anchor_evidence', 'conditioning_history', 'set_load_anchors', 'generation_refusal_diagnostics',
        'generation_candidate_sets_for_goal', 'generation_candidate_sets'].includes(name)) return reply([])
    }
    unexpected.push(`${request.method()} ${url.pathname}`)
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic TASK-114 request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ owner }) => {
    localStorage.setItem('clear.auth.session', JSON.stringify({
      accessToken: 'synthetic-task-114-session', refreshToken: 'synthetic-task-114-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-task-114@example.invalid' },
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

const openLog = (page: Page) => page.locator('dialog.clr-logging-overlay[open]')

/** Fonts loaded and every finite motion finished (the shared Dialog's arrival included). */
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

/**
 * The route's page, settled (timing only; TASK-115 repair 4, owner decision D4
 * of 2026-11-24). Held as soon as <main> showed, /summary's content could
 * still be arriving: the control was then scrolled to while the page laid it
 * out, so the scroll offset behind the dialog (seen through its edges and
 * chamfer), the drawn scroll bar and the CRT lines differed by load time, and
 * workout-feedback at 320 drew two or three ways. The case now waits for the
 * control it presses first, then for fonts, entrance motion and every scroll
 * height to hold still across two reads 250 ms apart, before and after the
 * clock is held.
 */
async function settleRoute(page: Page) {
  await settle(page)
  const layout = () => page.evaluate(() => JSON.stringify([
    document.querySelectorAll('*').length,
    ...[...document.querySelectorAll('*')].filter((element) => element.scrollHeight > element.clientHeight + 1)
      .map((element) => [element.scrollHeight, element.clientHeight]),
  ]))
  let previous = await layout()
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await page.waitForTimeout(250)
    const next = await layout()
    if (next === previous) return
    previous = next
  }
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

/**
 * What the shared owners draw, read from the open log: the frame, its header
 * and its scroller (relative to the frame, CSS px, to the hundredth), and the
 * rhythm of what it holds.
 */
async function ownerReading(page: Page) {
  return openLog(page).evaluate((dialog) => {
    const r = (value: number) => Math.round(value * 100) / 100
    const frame = dialog.querySelector<HTMLElement>(':scope > .clr-bleed > .clr-chamfer')!
    const scroll = dialog.querySelector<HTMLElement>('.clr-logging-overlay__scroll')!
    const body = dialog.querySelector<HTMLElement>('.clr-logging-overlay__body')!
    const head = dialog.querySelector<HTMLElement>('.clr-logging-overlay__head')!
    const title = head.querySelector<HTMLElement>('h2')!
    const xFrame = head.querySelector<HTMLElement>(':scope > .clr-bleed')!
    const f = frame.getBoundingClientRect()
    const d = dialog.getBoundingClientRect()
    const inFrame = (node: Element) => {
      const b = node.getBoundingClientRect()
      return { top: r(b.top - f.top), left: r(b.left - f.left), right: r(f.right - b.right), width: r(b.width), height: r(b.height) }
    }
    const style = (node: Element, pseudo?: string) => getComputedStyle(node, pseudo)
    const outline = (node: Element) => style(node).outlineStyle === 'none' || parseFloat(style(node).outlineWidth) === 0 ? 'none' : style(node).outlineStyle
    const legends = [...dialog.querySelectorAll<HTMLElement>('fieldset > legend')].map((legend) => {
      const next = [...legend.parentElement!.children].find((child) => child !== legend && child.getBoundingClientRect().height > 0)
      return { label: legend.textContent?.trim() ?? '', gap: next === undefined ? null : r(next.getBoundingClientRect().top - legend.getBoundingClientRect().bottom) }
    })
    const groups = [...dialog.querySelectorAll<HTMLElement>('.clr-round-movement, .clr-timed-log__group:has(> .clr-timed-log__group-title)')]
    const ladder = dialog.querySelector('.clr-ladder-completion')
    return {
      frame: { top: r(f.top), left: r(f.left), right: r(innerWidth - f.right), width: r(f.width), height: r(f.height) },
      dialogIsFrame: Math.abs(d.top - f.top) <= 0.5 && Math.abs(d.bottom - f.bottom) <= 0.5,
      scroller: {
        ...inFrame(scroll), bottom: r(f.bottom - scroll.getBoundingClientRect().bottom),
        padding: style(scroll).padding, clip: style(scroll).clipPath, scrollbar: style(scroll).scrollbarWidth,
        gutter: scroll.offsetWidth - scroll.clientWidth, overflowY: style(scroll).overflowY,
        sideways: scroll.scrollWidth - scroll.clientWidth, scrolls: scroll.scrollHeight - scroll.clientHeight > 1,
      },
      endGap: style(body).paddingBottom,
      head: inFrame(head),
      title: { ...inFrame(title), size: style(title).fontSize, lineHeight: style(title).lineHeight, trim: style(title).getPropertyValue('text-box-trim'), text: title.textContent },
      x: inFrame(xFrame),
      outlines: [dialog, frame, scroll, body].map(outline),
      ring: style(frame, '::after').backgroundColor,
      backdrop: { image: style(dialog, '::backdrop').backgroundImage, color: style(dialog, '::backdrop').backgroundColor, filter: style(dialog, '::backdrop').backdropFilter },
      legends,
      groups: groups.map((group, index) => ({
        label: group.getAttribute('aria-label') ?? group.querySelector('h3, h4, p')?.textContent?.trim() ?? '',
        before: index === 0 ? null : r(group.getBoundingClientRect().top - groups[index - 1].getBoundingClientRect().bottom),
        ownGap: style(group).rowGap,
      })),
      ladder: ladder === null ? null : {
        heading: r(ladder.querySelector('.clr-ladder-completion__tiles')!.getBoundingClientRect().top - ladder.querySelector('legend')!.getBoundingClientRect().bottom),
        count: r(ladder.querySelector('.clr-ladder-completion__status')!.getBoundingClientRect().top - ladder.querySelector('.clr-ladder-completion__tiles')!.getBoundingClientRect().bottom),
      },
    }
  })
}
type OwnerReading = Awaited<ReturnType<typeof ownerReading>>

/** The body these captures belong to: each Runner body keeps its own evidence-store folder. */
const CAPTURE_BODY = 'clear-gallery-adoption-v2-20261120'

function captureDir(): { dir: string; identity: string } {
  const store = resolveObjectStore({ cwd: REPO_ROOT })
  if (store.problem === undefined && store.dir !== null) {
    return { dir: join(store.dir, CAPTURE_BODY, 'task-114', 'captures'), identity: `store:${CAPTURE_BODY}/task-114/captures` }
  }
  const dir = join(REPO_ROOT, 'test-results', 'task-114-parity')
  return { dir, identity: `repo:${relative(REPO_ROOT, dir)}` }
}

/** Renders one frame: the browser records paint only when a frame is rendered. */
async function renderFrame(page: Page) {
  await page.screenshot({ clip: { x: 0, y: 0, width: 1, height: 1 } })
}

/**
 * Paints the open dialog's X afresh before the dialog is captured (TASK-106's
 * method): a dialog that opened while its arrival was settling could keep one
 * corner pixel of the X's chamfer as first recorded, so the hash changed run to
 * run with no change to the page.
 */
async function repaint(dialog: Locator) {
  const close = dialog.locator('.clr-logging-overlay__head button[aria-label="Close log"]')
  if (await close.count() !== 1) return
  const page = dialog.page()
  const focused = await page.evaluateHandle(() => document.activeElement)
  const before = await close.evaluate((button) => {
    const style = ((button.closest('.clr-bleed') ?? button) as HTMLElement).style
    const value = style.visibility
    style.visibility = 'hidden'
    return value
  })
  await renderFrame(page)
  await close.evaluate((button, value) => { ((button.closest('.clr-bleed') ?? button) as HTMLElement).style.visibility = value }, before)
  await focused.evaluate((element) => {
    if (element instanceof HTMLElement && element.isConnected && element !== document.activeElement) element.focus({ preventScroll: true })
  })
  await focused.dispose()
}

/** The part's image once it holds still: two byte-identical screenshots in a row, with no scroll streak lit. */
async function steadyScreenshot(target: Locator): Promise<Buffer> {
  const page = target.page()
  for (let round = 0; round < 3; round += 1) {
    await page.waitForFunction(() => document.querySelector('.clr-scroll-region[data-scrolling]') === null)
    await renderFrame(page)
    const shot = () => target.screenshot({ caret: 'hide', animations: 'disabled' })
    let previous = await shot()
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await page.waitForTimeout(100)
      const next = await shot()
      if (next.equals(previous)) {
        if (await page.evaluate(() => document.querySelector('.clr-scroll-region[data-scrolling]') === null)) return next
        break
      }
      previous = next
    }
  }
  throw new Error('The open log never held still with no scroll streak lit.')
}

async function keep(dialog: Locator, name: string) {
  await dialog.page().mouse.move(0, 0)
  await repaint(dialog)
  const bytes = await steadyScreenshot(dialog)
  await test.info().attach(`${name}.png`, { body: bytes, contentType: 'image/png' })
  const { dir, identity } = captureDir()
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${name}.png`), bytes)
  return { file: `${identity}/${name}.png`, sha256: createHash('sha256').update(bytes).digest('hex') }
}

interface Difference { readonly what: string; readonly gallery: unknown; readonly route: unknown; readonly criterion: string | null; readonly reason: string | null }
interface Intended { readonly criterion: string; readonly reason: string; readonly match: RegExp }

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

/** Every reading of the shared owners that differs between the sides, by its path. */
function ownerDifferences(gallery: OwnerReading, route: OwnerReading): Array<{ what: string; gallery: unknown; route: unknown }> {
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
 * Differences a criterion intends. Each is data the gallery scene composes for
 * itself, never the shared owners' look: nothing here excuses a frame, header,
 * rhythm or scrolling difference.
 */
const INTENDED: readonly Intended[] = []

function labelled(what: string, gallery: unknown, route: unknown): Difference {
  const rule = INTENDED.find((candidate) => candidate.match.test(what))
  return { what, gallery, route, criterion: rule?.criterion ?? null, reason: rule?.reason ?? null }
}

function writeReceipt(name: string, receipt: Record<string, unknown>) {
  mkdirSync(RECEIPTS, { recursive: true })
  writeFileSync(join(RECEIPTS, `${name}.json`), `${JSON.stringify({ schema: 'clear-task-114-parity/v1', task: 'TASK-114', gallery: GALLERY, ...receipt }, null, 2)}\n`)
}

/** The cap the flow runs past on both sides (`PAST_CAP` in the gallery's driver). */
function capOf(block: BlockProgress): number {
  return block.ladderTiming?.mode === 'capped_window' ? block.ladderTiming.cap_seconds ?? 0 : block.timerSeconds ?? 0
}

/** Steps the held clock until the open log is there (the gallery's driver works on a 40 ms interval). */
async function untilOpen(page: Page, step = 40, limit = 400) {
  for (let tick = 0; tick < limit && await openLog(page).count() === 0; tick += 1) await page.clock.runFor(step)
  await expect(openLog(page)).toHaveCount(1)
}

/** One side's reading of the open log. */
async function read(page: Page, title: string, name: string) {
  const dialog = page.getByRole('dialog', { name: title, exact: true })
  await expect(dialog).toBeVisible({ timeout: 15_000 })
  await expect(openLog(page)).toHaveCount(1)
  await settle(page)
  return { lines: await linesOf(openLog(page)), owner: await ownerReading(page), capture: await keep(openLog(page), name) }
}

// ─────────────────────────────────────────────────────────────────────────────
// The look check
// ─────────────────────────────────────────────────────────────────────────────

for (const context of Object.keys(CONTEXTS) as Context[]) {
  const shape = CONTEXTS[context]
  for (const { name, viewport } of VIEWPORTS) {
    test(`TASK-AC-EFC60FF1F169 ${context} ${name}: ${shape.route}’s ${shape.label.toLowerCase()} opens in the same Round 7 dialog as the accepted gallery state — frame, header, rhythm and scrolling drawn alike`, async ({ page, visit }) => {
      test.setTimeout(240_000)
      await page.setViewportSize(viewport)
      await installDeterministicCapture(page, { skin: 'clear', reducedMotion: true })
      await page.clock.install({ time: ENTRY })

      // The accepted state: the real components on the gallery's memory runtime, its own driver pressing the control.
      await visit(`/gallery/refinements?state=${context}`)
      const scope = page.locator(`[data-refinement-state="${context}"]`)
      await expect(scope).toBeVisible()
      await settle(page)
      await page.clock.pauseAt(ENTRY + 60_000)
      await scope.getByRole('button', { name: `Open ${shape.label}`, exact: true }).click()
      await untilOpen(page)
      await page.clock.runFor(500)
      const gallery = await read(page, shape.title, `${context}-${name}-gallery`)
      await page.clock.resume()

      // The real route, over the same data, its own control pressed the same way.
      const block = shape.block
      const snapshot = shape.timed !== undefined ? timedSession(block!) : setSession(shape.block === undefined ? CONTEXTS.anchor : shape)
      const app = await syntheticApp(page, snapshot, shape.route === '/workout' ? 'workout' : 'done')
      await visit(shape.route)
      const main = page.locator('main#main')
      await expect(main).toBeVisible()
      // The control this side presses first is drawn: the route's data has arrived.
      await expect(shape.timed !== undefined ? main.getByRole('button', { name: /^Start /, exact: false }).first()
        : context === 'circuit-round' ? main.getByRole('button', { name: 'Start round 1', exact: true })
          : context === 'movement-note' ? main.getByRole('button', { name: /^Coaching and notes/ }).first()
            : main.getByRole('button', { name: shape.drive, exact: true }).first()).toBeVisible()
      await settleRoute(page)
      await page.clock.pauseAt(ENTRY + 600_000)
      // What the jump to the held instant set off (timers due, a re-render) finishes before anything is pressed.
      await settleRoute(page)
      if (shape.timed !== undefined) {
        const start = main.getByRole('button', { name: /^Start /, exact: false }).first()
        await start.evaluate((node) => node.scrollIntoView({ block: 'center' }))
        await start.click()
        await page.clock.fastForward((capOf(block!) + 1) * 1000)
        await untilOpen(page, 100, 100)
      } else if (context === 'circuit-round') {
        await main.getByRole('button', { name: 'Start round 1', exact: true }).click()
        await page.clock.runFor(32_000)
        await page.clock.runFor(600)
        await main.getByRole('button', { name: 'Finish round 1', exact: true }).click()
      } else if (context === 'movement-note') {
        await main.getByRole('button', { name: /^Coaching and notes/ }).first().click()
        // The opened coaching laid out before Add note is scrolled to and pressed (timing only, D4).
        await settleRoute(page)
        await main.getByRole('button', { name: /^Add note/ }).first().click()
      } else {
        const control = main.getByRole('button', { name: shape.drive, exact: true }).first()
        await control.evaluate((node) => node.scrollIntoView({ block: 'center' }))
        await control.click()
      }
      await untilOpen(page)
      await page.clock.runFor(500)
      const route = await read(page, shape.title, `${context}-${name}-route`)
      await page.clock.resume()

      const differences: Difference[] = [
        ...wordDifferences(gallery.lines, route.lines).map((line) => labelled(`words · ${line}`, null, null)),
        ...ownerDifferences(gallery.owner, route.owner).map(({ what, gallery: a, route: b }) => labelled(`owner · ${what}`, a, b)),
      ]
      writeReceipt(`${context}-${name}`, {
        state: context, label: shape.label, width: viewport.width, height: viewport.height, route: shape.route,
        drive: `${shape.drive} — on the browser clock, held between steps and moved alike on both sides`,
        captures: { 'gallery-open': gallery.capture, 'route-open': route.capture },
        lines: { gallery: gallery.lines, route: route.lines },
        owner: { gallery: gallery.owner, route: route.owner },
        differences,
      })

      // The shared owners on both sides: the selected dialog, the X on the title, the contained frame.
      for (const [side, reading] of [['gallery', gallery], ['route', route]] as const) {
        expect(reading.owner.title.text, `${side} title @${name}`).toBe(shape.title)
        expect(reading.owner.dialogIsFrame, `${side}: the dialog is the frame`).toBe(true)
        expect(reading.owner.title.top, `${side}: the title starts on the X's frame top`).toBe(reading.owner.x.top)
        expect(reading.owner.scroller.bottom, `${side}: the scroller meets the inner lower border (P01)`).toBeLessThanOrEqual(2.5)
        expect(reading.owner.scroller.scrollbar, `${side}: no scrollbar (P03)`).toBe('none')
        expect(reading.owner.scroller.sideways, `${side}: nothing sideways (P03)`).toBe(0)
        expect(reading.owner.outlines, `${side}: no container outline (P02)`).toEqual(['none', 'none', 'none', 'none'])
      }
      expect(differences.filter((difference) => difference.criterion === null), `${context} @${name}: every difference is one a criterion intends`).toEqual([])
      app.assertContained()
    })
  }
}
