import { execFileSync, spawn } from 'node:child_process'
import { createServer, type AddressInfo } from 'node:net'
import { resolve } from 'node:path'
import type { Locator, Page, Route } from '@playwright/test'

import { readE2eEnv } from '../../scripts/e2e/env.mjs'
import { LONG_MOVEMENT_ID, peerGroupingAcceptance } from '../../src/dev/gallery-refinement-cards-data'
import { timedLadderBlock } from '../../src/dev/gallery-refinement-flow-data'
import { savedSessionRow } from '../../src/dev/gallery-refinement-overview-data'
import { reviewHandoff } from '../../src/state/review-handoff'
import {
  exerciseSetLogRowSchema,
  restDayRowSchema,
  sessionSnapshotSchema,
  workoutSessionRowSchema,
  type ExerciseSetLogRow,
  type RestDayRow,
  type SessionAcceptance,
  type SessionSnapshot,
  type WorkoutSessionRow,
} from '../../src/state/schemas'
import { isSetObservationMutation, type SetObservationAck, type SetObservationMutation } from '../../src/state/set-observation-mutation'
import { makePrescription, makeWorkoutBlock } from '../../src/test/factories'
import { FORMAT_EMOM, formatBadgesSnapshot } from '../../src/test/format-badges-fixture'
import { ACTUALS_AMRAP_BLOCK, ACTUALS_AMRAP_WORK_LIST, ACTUALS_FOR_TIME_BLOCK, ACTUALS_FOR_TIME_WORK_LIST } from '../../src/test/timed-actuals-fixture'
import { fixtureLocation, onboardedProfile } from '../../src/test/user-data-double'
import { definitionFixture } from '../../src/test/workout-double'
import { installDeterministicCapture } from '../design-0143/fixtures'
import { expect, test as scanned } from '../fixtures'

/**
 * TASK-041 (#667; REQ-016, REQ-017, REQ-018; completion owner of JOURNEY-016,
 * JOURNEY-017 and JOURNEY-018) — the adopted dialog and form rhythm verified
 * in the actual route consumers.
 */
const OWNER = '00000000-0000-4000-8000-000000004101'
const PLACE = '00000000-0000-4000-8000-000000004111'
const COMPLETED = '00000000-0000-4000-8000-000000004121'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
}
/** The accepted gallery reference every geometry claim is read against. */
const ACCEPTED_REFERENCE = 'eded158cfd928d382c9a9409e2c372270312741d'
const LOG_RESULTS = 'Log results'
const LADDER_LIST = 'Movements in this ladder'
const EMOM_LIST = 'Movements in this EMOM'
const LONG_NAME = LONG_MOVEMENT_ID.replaceAll('-', ' ')

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
    if (code !== null) throw new Error(`Synthetic TASK-041 server exited (${code}) before ${origin} was ready`)
    try {
      if ((await fetch(origin)).ok && (await fetch(own)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((settle) => setTimeout(settle, 250))
  }
  throw new Error(`Synthetic TASK-041 origin ${origin} did not start`)
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
          VITE_SUPABASE_URL: 'https://synthetic-task-041.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-task-041-public-placeholder',
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

// ─────────────────────────────────────────────────────────────────────────────
// One session: every /workout logging consumer, long forms included
// ─────────────────────────────────────────────────────────────────────────────

const bodyweight = { equipment: 'bodyweight', load_type: 'bodyweight' as const, load_value: null }

/** Anchor/primary lift, another lift, a timed movement and a distance movement. */
const STANDARD = makeWorkoutBlock({
  exercises: [
    makePrescription({ exercise_id: 'back-squat', equipment: 'barbell', session_function: 'primary', sets: 2, target_value: 5,
      load_type: 'absolute', load_value: 100, rest_seconds: 90 }),
    makePrescription({ exercise_id: 'romanian-deadlift', equipment: 'barbell', session_function: 'accessory', sets: 3, target_value: 8,
      load_type: 'absolute', load_value: 70, rest_seconds: 60 }),
    makePrescription({ exercise_id: 'plank', ...bodyweight, session_function: 'accessory', modality: 'time', sets: 2, target_value: 30,
      rest_seconds: 30 }),
    makePrescription({ exercise_id: 'farmer-carry', equipment: 'dumbbell', session_function: 'accessory', modality: 'distance',
      distance_unit: 'm', sets: 2, target_value: 40, load_type: 'absolute', load_value: 24, rest_seconds: 45 }),
  ],
})
/** A superset whose loaded movement has the longest catalog name: its note title wraps. */
const SUPERSET = makeWorkoutBlock({
  structure_type: 'superset', rounds: 2, round_rest_seconds: 45,
  exercises: [
    makePrescription({ exercise_id: LONG_MOVEMENT_ID, equipment: 'kettlebell', session_function: 'accessory', sets: 2, target_value: 10,
      load_type: 'absolute', load_value: 16, rest_seconds: 0 }),
    makePrescription({ exercise_id: 'push-up', ...bodyweight, session_function: 'accessory', sets: 2, target_value: 12, rest_seconds: 0 }),
  ],
})
/** A circuit: a loaded kettlebell and a bodyweight movement, its own rest between rounds. */
const CIRCUIT = makeWorkoutBlock({
  structure_type: 'circuit', rounds: 2, round_rest_seconds: 40,
  exercises: [
    makePrescription({ exercise_id: 'kb-swing', equipment: 'kettlebell', session_function: 'accessory', sets: 2, target_value: 15,
      load_type: 'absolute', load_value: 24, rest_seconds: null }),
    makePrescription({ exercise_id: 'mountain-climber', ...bodyweight, session_function: 'conditioning', sets: 2, target_value: 20,
      rest_seconds: null }),
  ],
})
/** The long form R128/R129 named: a twelve-round ladder under one cap. */
const LADDER_12 = timedLadderBlock(12)
const COOLDOWN = makeWorkoutBlock({
  exercises: [makePrescription({ exercise_id: 'childs-pose', ...bodyweight, session_function: 'recovery', sets: 1, target_value: 1,
    rest_seconds: null })],
})

function routeAcceptance(): SessionAcceptance {
  const base = peerGroupingAcceptance({ locationId: PLACE, blocks: [STANDARD, SUPERSET, CIRCUIT] })
  const [section] = base.workout.sections
  return {
    ...base,
    prompt_version: 'gallery-task-041',
    workout: {
      ...base.workout,
      title: 'Synthetic TASK-041 route rhythm workout',
      sections: [
        { ...section, section_type: 'accessory', section_title: 'Sets and groups' },
        { section_type: 'conditioning', section_title: 'Timed', section_notes: null,
          blocks: [FORMAT_EMOM, ACTUALS_AMRAP_BLOCK, ACTUALS_FOR_TIME_BLOCK, LADDER_12] },
        { section_type: 'cooldown', section_title: 'Cooldown', section_notes: null, blocks: [COOLDOWN] },
      ],
    },
  }
}

function routeSession(startedAt: string | null): SessionSnapshot {
  return sessionSnapshotSchema.parse(formatBadgesSnapshot(routeAcceptance(), { userId: OWNER, startedAt }))
}

/** A local calendar day, `daysAgo` days before today, and an evening instant on it. */
function localDay(daysAgo: number) {
  const at = new Date()
  at.setDate(at.getDate() - daysAgo)
  at.setHours(18, 0, 0, 0)
  const pad = (value: number) => String(value).padStart(2, '0')
  return { date: `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`, instant: at.toISOString() }
}

// ─────────────────────────────────────────────────────────────────────────────
// The synthetic app: every original writer, observed, nothing forwarded
// ─────────────────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>
type Skin = 'clear' | 'vapour' | 'signal' | 'mono'
interface Write {
  readonly method: string
  readonly table: string
  readonly filter: string | null
  readonly body: Row | null
}

interface AppOptions {
  readonly skin?: Skin
  readonly reducedMotion?: boolean
  /** `workout` (active session), `review` (the composed workout before Start) or `done` (/summary, Home). */
  readonly at?: 'workout' | 'review' | 'done'
  /** Install the page clock at the real now before the first visit. */
  readonly clock?: boolean
}

async function syntheticApp(page: Page, options: AppOptions = {}) {
  let at = options.at ?? 'workout'
  const unexpected: string[] = []
  const writes: Write[] = []
  const mutations: SetObservationMutation[] = []
  const heads = new Map<string, SetObservationAck['head']>()
  const notes = new Map<string, string | null>()
  const today = localDay(0)
  const yesterday = localDay(1)
  const acceptance = routeAcceptance()
  const prescribed = routeSession(null)
  const running = routeSession(new Date(Date.now() - 10 * 60_000).toISOString())
  const exercises = running.sections.flatMap((section) => section.blocks.flatMap((block) => block.exercises.map(({ exercise }) => exercise)))
  let completed: WorkoutSessionRow = workoutSessionRowSchema.parse(savedSessionRow({
    sessionId: COMPLETED, userId: OWNER, date: yesterday.date, completedAt: yesterday.instant,
  }))
  let marks: RestDayRow[] = []
  const guard = await installDeterministicCapture(page, { skin: options.skin ?? 'clear', reducedMotion: options.reducedMotion ?? false })
  if (options.clock === true) await page.clock.install()
  const filterOf = (url: URL, column: string): string | null => url.searchParams.get(column)?.replace(/^eq\./, '') ?? null

  const handler = async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    const name = url.pathname.split('/').at(-1) ?? ''
    const method = request.method()
    const reply = (body: unknown, status = 200) =>
      route.fulfill({ status, headers: CORS, json: body }).catch(() => undefined)
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (url.pathname.startsWith('/functions/v1/')) {
      unexpected.push(`${method} ${url.pathname}`)
      return route.abort('blockedbyclient')
    }
    if (method === 'GET') {
      if (name === 'profiles') return reply([onboardedProfile({ id: OWNER, goal_preset: 'balanced' })])
      if (name === 'locations') return reply([fixtureLocation({ id: PLACE, user_id: OWNER, tier: 'full', is_default: true })])
      if (name === 'exercise_definitions') {
        const id = filterOf(url, 'id')
        return reply(exercises.filter((exercise) => id === null || exercise.exercise_id === id)
          .map((exercise) => definitionFixture({ id: exercise.exercise_id })))
      }
      if (name === 'workout_exercises') {
        return reply(exercises.map((exercise) => notes.has(exercise.id) ? { ...exercise, exercise_notes: notes.get(exercise.id) } : exercise))
      }
      if (name === 'workout_sessions') return reply([completed])
      if (name === 'rest_days') return reply(marks)
      return reply([])
    }
    const body = request.postData() === null ? null : (request.postDataJSON() as Row | Row[])
    const row = Array.isArray(body) ? body[0] : body
    if (name === 'block_results' && method === 'POST') {
      writes.push({ method, table: name, filter: null, body: row })
      return reply([{ id: `00000000-0000-4000-8000-0000000041${String(writes.length).padStart(2, '0')}`, created_at: new Date().toISOString(),
        effort: null, elapsed_seconds: null, completed_under_cap: null, rounds_completed: null, partial_round_reps: null,
        minutes_completed: null, highest_rung: null, perceived_effort: null, notes: null, ...row }], 201)
    }
    if (method === 'PATCH' && name === 'workout_exercises') {
      const id = filterOf(url, 'id')
      const exercise = exercises.find((entry) => entry.id === id)
      writes.push({ method, table: name, filter: id, body: row })
      if (exercise === undefined) return reply({ code: 'PGRST000', message: 'no row' }, 503)
      notes.set(exercise.id, row?.exercise_notes as string | null)
      return reply([{ ...exercise, exercise_notes: row?.exercise_notes }])
    }
    if (method === 'PATCH' && name === 'workout_sessions') {
      writes.push({ method, table: name, filter: filterOf(url, 'id'), body: row })
      completed = workoutSessionRowSchema.parse({ ...completed, ...row })
      return reply([completed])
    }
    if (method === 'POST' && url.pathname.includes('/rpc/')) {
      if (name === 'resume_session') return reply(at === 'workout' ? running : null)
      if (name === 'session_snapshot') return reply(at === 'review' ? prescribed : running)
      if (name === 'session_as_performed') {
        if (at !== 'workout') return reply(null)
        return reply({
          reconstruction: 'performed', as_of: running.session.started_at, session: running.session, state: running.state,
          sections: running.sections.map((section) => ({
            ...section,
            blocks: section.blocks.map((block) => ({
              ...block, block_result: null,
              exercises: block.exercises.map((entry) => ({ ...entry, movement_result: null })),
            })),
          })),
        })
      }
      if (name === 'streak_sessions') {
        const rows = [{ session_id: completed.id, completed_at: completed.completed_at, counts_for_streak: true }]
        return reply((row as Row | null)?.p_limit === 1 ? rows.slice(0, 1) : rows)
      }
      if (name === 'mutate_set_observation') {
        const p = row as Row & { p_values: Row }
        const mutation = {
          observation_id: p.p_observation_id, mutation_id: p.p_mutation_id, revision: p.p_revision,
          expected_revision: p.p_expected_revision, operation: p.p_operation,
          exercise_id: p.p_exercise_id, set_number: p.p_set_number, values: p.p_values,
        }
        if (!isSetObservationMutation(mutation)) {
          unexpected.push(`invalid ${name}`)
          return reply({ outcome: 'invalid' }, 400)
        }
        const previous = heads.get(mutation.observation_id)
        if (previous?.mutation_id === mutation.mutation_id) return reply({ outcome: 'replayed', mutation, head: previous })
        let logged: ExerciseSetLogRow | null = null
        if (mutation.operation !== 'clear') {
          logged = exerciseSetLogRowSchema.parse({
            id: mutation.observation_id, workout_exercise_id: mutation.exercise_id,
            prescription_revision_status: 'active', set_number: mutation.set_number,
            actual_reps: null, actual_duration_seconds: null, actual_distance: null,
            actual_distance_unit: null, weight: null, weight_unit: 'kg', rpe: null,
            is_warmup_set: false, created_at: new Date().toISOString(), effort: null,
            ...(previous?.row ?? {}), ...mutation.values,
            mutation_revision: mutation.revision, last_mutation_id: mutation.mutation_id,
          })
        }
        const ack: SetObservationAck = { outcome: 'applied', mutation,
          head: { revision: mutation.revision, mutation_id: mutation.mutation_id, cleared: logged === null, row: logged } }
        mutations.push(mutation)
        heads.set(mutation.observation_id, ack.head)
        return reply(ack)
      }
      if (name === 'mark_rest_day') {
        writes.push({ method, table: name, filter: null, body: row })
        const stamp = new Date().toISOString()
        const mark = restDayRowSchema.parse({
          id: '00000000-0000-4000-8000-000000004131', user_id: OWNER, day: row?.p_day, reason: row?.p_reason,
          note: row?.p_note ?? null, created_at: stamp, updated_at: stamp,
        })
        marks = [mark, ...marks.filter((entry) => entry.day !== mark.day)]
        return reply(mark)
      }
      if (['constraints_in_force', 'anchor_evidence', 'conditioning_history', 'generation_refusal_diagnostics',
        'generation_candidate_sets_for_goal', 'generation_candidate_sets'].includes(name)) return reply([])
    }
    unexpected.push(`${method} ${url.pathname}`)
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic TASK-041 request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ owner, handoff }) => {
    localStorage.setItem('clear.auth.session', JSON.stringify({
      accessToken: 'synthetic-task-041-session', refreshToken: 'synthetic-task-041-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-task-041@example.invalid' },
    }))
    if (location.pathname === '/review') {
      history.replaceState({ usr: handoff, key: 'synthetic-task-041', idx: 0 }, '', location.href)
    }
  }, { owner: OWNER, handoff: reviewHandoff(acceptance) })

  const exerciseId = (section: number, catalogId: string): string => {
    const found = running.sections[section].blocks.flatMap((block) => block.exercises)
      .find(({ exercise }) => exercise.exercise_id === catalogId)
    if (found === undefined) throw new Error(`no ${catalogId} in section ${section}`)
    return found.exercise.id
  }
  return {
    writes, mutations, today, exerciseId,
    /** Moves the synthetic account to another entry state before the next visit. */
    goTo(next: 'workout' | 'review' | 'done') { at = next },
    assertContained() {
      expect(unexpected, 'Every API request has an explicit synthetic disposition').toEqual([])
      expect(guard.blockedGenerations()).toBe(0)
    },
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// Reading the screen
// ─────────────────────────────────────────────────────────────────────────────

type Size = { width: number; height: number }
const PHONE_320: Size = { width: 320, height: 568 }
const PHONE_390: Size = { width: 390, height: 844 }
const DESKTOP_1280: Size = { width: 1280, height: 800 }
/** Half a CSS pixel: sub-pixel layout rounding, nothing more. */
const EXACT = 0.5

const content = (page: Page) => page.locator('main#main > .clr-scroll-region > .clr-scroll-region__scroller')
/** The open focused logging dialog (any title). */
const openLog = (page: Page) => page.locator('dialog.clr-accepted-log[open]')
const restBars = (page: Page) => page.getByRole('region', { name: 'Rest', exact: true })
function movement(page: Page, name: string): Locator {
  return content(page).locator('section').filter({ has: page.getByRole('heading', { name, exact: true }) }).last()
}
function cardOf(page: Page, list: string): Locator {
  return content(page).locator('.clr-card').filter({ has: page.getByRole('list', { name: list, exact: true }) }).last()
}
function timedCard(page: Page, list: string): Locator {
  return page.locator('[data-workout-card="workout"]').filter({ has: page.getByRole('list', { name: list, exact: true }) })
}
const timedOpener = (card: Locator) => card.locator('[data-timed-log-opener]').getByRole('button', { name: LOG_RESULTS, exact: true })
const roundClock = (card: Locator) => card.getByRole('group', { name: 'Round clock', exact: true })
/** The stack beside a timed card: its block clock. */
const clockOf = (card: Locator) => card.locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " clr-stack ")][1]').getByRole('timer').first()
/** The removed superset helper, matched by its words (never quoted verbatim: TASK-017's sweep forbids the sentences anywhere). */
const HELPER_WORDS = /tick\s+each\s+movement|blank\s+field\s+is\s+saved/i

function seconds(text: string | null): number {
  const digits = /(\d\d):(\d\d)/.exec(text ?? '')
  if (digits === null) throw new Error(`no clock digits in ${text}`)
  return Number(digits[1]) * 60 + Number(digits[2])
}

async function restRemaining(page: Page): Promise<number> {
  await expect(restBars(page)).toHaveCount(1)
  return seconds(await restBars(page).getByRole('timer', { name: 'Time remaining' }).textContent())
}

/** The shared tokens every geometry claim resolves to, read from the running app. */
interface Tokens {
  viewportGap: number
  blur: number
  labelGap: number
  fieldGap: number
  movementGap: number
  movementFieldGap: number
  countGap: number
  peerGap: number
  tierGap: number
  backdropTint: string
  backdropEdge: string
  /** The Balanced backdrop's two paints, resolved exactly as the token recipe declares them. */
  balancedColor: string
  balancedEdge: string
}

async function readTokens(page: Page): Promise<Tokens> {
  return page.evaluate(() => {
    const length = (value: string) => {
      const probe = document.createElement('div')
      probe.style.cssText = `position:absolute;visibility:hidden;height:${value}`
      document.body.append(probe)
      const px = probe.getBoundingClientRect().height
      probe.remove()
      return px
    }
    const colour = (value: string) => {
      const probe = document.createElement('div')
      probe.style.backgroundColor = value
      document.body.append(probe)
      const resolved = getComputedStyle(probe).backgroundColor
      probe.remove()
      return resolved
    }
    const root = getComputedStyle(document.documentElement)
    return {
      viewportGap: length('var(--logging-viewport-gap)'),
      blur: length('var(--logging-backdrop-blur)'),
      labelGap: length('var(--logging-label-gap)'),
      fieldGap: length('var(--spacing-200)'),
      movementGap: length('var(--logging-movement-gap)'),
      movementFieldGap: length('var(--logging-movement-field-gap)'),
      countGap: length('var(--logging-count-gap)'),
      peerGap: length('var(--movement-peer-gap)'),
      tierGap: length('var(--movement-tier-gap)'),
      backdropTint: root.getPropertyValue('--logging-backdrop-tint').trim(),
      backdropEdge: root.getPropertyValue('--logging-backdrop-edge-tint').trim(),
      balancedColor: colour('color-mix(in srgb, var(--base) var(--logging-backdrop-tint), transparent)'),
      balancedEdge: colour('color-mix(in srgb, var(--base) var(--logging-backdrop-edge-tint), transparent)'),
    }
  })
}

type Box = { top: number; bottom: number; left: number; right: number; width: number; height: number }

/** Everything the dialog/frame/header contract is read from, in one pass. */
async function readFrame(page: Page) {
  return openLog(page).evaluate((dialog) => {
    const box = (node: Element): Box => {
      const rect = node.getBoundingClientRect()
      return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width, height: rect.height }
    }
    const frame = dialog.querySelector<HTMLElement>('[data-logging-frame]')!
    const scroll = dialog.querySelector<HTMLElement>('[data-logging-scroll]')!
    const body = dialog.querySelector<HTMLElement>('.clr-accepted-log__body')!
    const head = dialog.querySelector('[data-logging-head]')!
    const title = head.querySelector('h2')!
    const close = head.querySelector('button')!
    const style = (node: Element, pseudo?: string) => getComputedStyle(node, pseudo)
    const lines = (node: Element) => {
      const range = document.createRange()
      range.selectNodeContents(node)
      return [...new Set([...range.getClientRects()].filter((rect) => rect.width > 0).map((rect) => Math.round(rect.top)))].length
    }
    const outline = (node: Element) => {
      const computed = style(node)
      return computed.outlineStyle === 'none' || parseFloat(computed.outlineWidth) === 0 ? 'none' : `${computed.outlineStyle} ${computed.outlineWidth} ${computed.outlineColor}`
    }
    const probe = document.createElement('span')
    probe.style.backgroundColor = 'var(--brd)'
    frame.append(probe)
    const brd = style(probe).backgroundColor
    probe.remove()
    // Any rule drawn across the form: a border line at least nine tenths of the scroller wide.
    const interiorLines = [...scroll.querySelectorAll<HTMLElement>('*')].filter((node) => {
      const computed = style(node)
      const ruled = ['Top', 'Bottom'].some((side) => parseFloat(computed.getPropertyValue(`border-${side.toLowerCase()}-width`)) > 0
        && computed.getPropertyValue(`border-${side.toLowerCase()}-style`) !== 'none')
      return ruled && node.getBoundingClientRect().width >= scroll.clientWidth * 0.9
    }).map((node) => `${node.tagName}.${node.className}`)
    return {
      viewport: { width: innerWidth, height: innerHeight, visual: visualViewport?.height ?? innerHeight },
      dialog: box(dialog),
      frame: box(frame),
      scroll: box(scroll),
      border: parseFloat(style(frame).paddingBottom),
      scrollPaddingBottom: parseFloat(style(scroll).paddingBottom),
      bodyPaddingBottom: parseFloat(style(body).paddingBottom),
      scrollTop: scroll.scrollTop,
      maxScroll: scroll.scrollHeight - scroll.clientHeight,
      scrollbar: { gutter: scroll.offsetWidth - scroll.clientWidth, width: style(scroll).scrollbarWidth, overflowY: style(scroll).overflowY },
      sideways: { scroll: scroll.scrollWidth - scroll.clientWidth, document: document.documentElement.scrollWidth - innerWidth },
      clip: style(scroll).clipPath,
      interiorLines,
      title: box(title),
      titleText: title.textContent ?? '',
      titleLines: lines(title),
      close: box(close),
      closeText: close.textContent?.trim() ?? '',
      closeName: close.getAttribute('aria-label'),
      outlines: { dialog: outline(dialog), frame: outline(frame), scroll: outline(scroll), body: outline(body) },
      ring: { after: style(frame, '::after').backgroundColor, brd },
      backdrop: { image: style(dialog, '::backdrop').backgroundImage, color: style(dialog, '::backdrop').backgroundColor, filter: style(dialog, '::backdrop').backdropFilter },
      foreground: [dialog, frame, scroll, body].map((node) => ({ filter: style(node).filter, opacity: style(node).opacity, shadow: style(node).boxShadow, backdrop: style(node).backdropFilter })),
      active: document.activeElement === dialog ? 'dialog' : document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent?.trim().slice(0, 40) ?? null,
      activeVisible: document.activeElement?.matches(':focus-visible') ?? false,
    }
  })
}
type Frame = Awaited<ReturnType<typeof readFrame>>

/** Decodes two same-sized PNGs in the page: per row, the largest channel difference between them. */
async function rowDifferences(page: Page, a: Buffer, b: Buffer): Promise<number[]> {
  return page.evaluate(async ({ first, second }) => {
    const pixels = async (png: string) => {
      const image = new Image()
      image.src = `data:image/png;base64,${png}`
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const context = canvas.getContext('2d', { willReadFrequently: true })!
      context.drawImage(image, 0, 0)
      return { width: canvas.width, height: canvas.height, data: context.getImageData(0, 0, canvas.width, canvas.height).data }
    }
    const [one, two] = await Promise.all([pixels(first), pixels(second)])
    const rows: number[] = []
    for (let row = 0; row < one.height; row += 1) {
      let max = 0
      for (let column = 0; column < one.width; column += 1) {
        const offset = (row * one.width + column) * 4
        for (let channel = 0; channel < 3; channel += 1) max = Math.max(max, Math.abs(one.data[offset + channel] - two.data[offset + channel]))
      }
      rows.push(max)
    }
    return rows
  }, { first: a.toString('base64'), second: b.toString('base64') })
}

/** The first row whose difference exceeds the threshold, or -1. */
async function firstDifferentRow(page: Page, a: Buffer, b: Buffer, threshold = 48): Promise<number> {
  return (await rowDifferences(page, a, b)).findIndex((max) => max > threshold)
}

/**
 * Where something actually starts being painted: the first row whose core
 * paint changes when only that thing is hidden, in a capture reaching above
 * its box (CSS pixels, Chromium's own rendering). "Core" is at least half the
 * strongest change in that capture, so a soft emission round a glyph or a
 * stroke is not counted, in any skin. The title's letters are made
 * transparent; the X's frame (its bleed) is made fully transparent (opacity,
 * so the X keeps focus) and read in a strip along its left edge, clear of the
 * X glyph, where its top stroke starts. The focus brackets are hidden for both
 * captures. Glyph caps and the X's chamfered stroke both paint outside their
 * layout boxes, so the requirement's "visible title top" is read from paint
 * and compared paint to paint, never against a box.
 */
async function paintTop(page: Page, target: Locator, hide: 'colour' | 'opacity', strip?: number): Promise<number> {
  const box = (await target.boundingBox())!
  const clip = { x: box.x, y: Math.max(0, box.y - 14), width: Math.min(box.width, strip ?? 120), height: 34 }
  const brackets = (visibility: 'hidden' | null) => page.evaluate((value) => {
    const layer = document.querySelector<HTMLElement>('.clr-focus-brackets')
    if (layer === null) return
    if (value === null) layer.style.removeProperty('visibility')
    else layer.style.setProperty('visibility', value, 'important')
  }, visibility)
  await brackets('hidden')
  const painted = await page.screenshot({ clip, caret: 'hide', scale: 'css' })
  await target.evaluate((node, how) => {
    const style = (node as HTMLElement).style
    style.setProperty('transition', 'none', 'important')
    if (how === 'colour') {
      style.setProperty('color', 'transparent', 'important')
      style.setProperty('text-shadow', 'none', 'important')
    } else {
      style.setProperty('opacity', '0', 'important')
    }
  }, hide)
  const bare = await page.screenshot({ clip, caret: 'hide', scale: 'css' })
  await target.evaluate((node) => {
    const style = (node as HTMLElement).style
    for (const property of ['color', 'text-shadow', 'opacity', 'transition']) style.removeProperty(property)
  })
  await brackets(null)
  const rows = await rowDifferences(page, painted, bare)
  const strongest = Math.max(...rows)
  expect(strongest, 'something is painted where it is read').toBeGreaterThan(48)
  return clip.y + rows.findIndex((max) => max >= strongest / 2)
}

/** The title's visible top and the X frame's visible top, read the same way. */
async function visibleTops(page: Page) {
  const head = openLog(page).locator('[data-logging-head]')
  return {
    title: await paintTop(page, head.locator('h2'), 'colour'),
    // The X's framed stroke and emission are painted by the button and the bleed round it.
    x: await paintTop(page, head.locator(':scope > .clr-bleed'), 'opacity', 12),
  }
}

/**
 * C41 / R105 / AC-R016-02: the header — the one title, then the framed,
 * icon-only X named "Close log" with no visible Close word, its frame top on
 * the title's visible top however many lines the title wraps to.
 */
async function expectHeader(page: Page, frame: Frame, label: string) {
  const tops = await visibleTops(page)
  expect(frame.closeName, label).toBe('Close log')
  expect(frame.closeText, `${label}: no visible Close word`).toBe('')
  expect(Math.abs(frame.close.top - frame.title.top), `${label}: the X's box on the title's trimmed box top`).toBeLessThanOrEqual(EXACT)
  expect(Math.abs(tops.x - tops.title), `${label}: the X frame's visible top on the title's visible top (title ${tops.title}, X ${tops.x})`).toBeLessThanOrEqual(1)
  expect(frame.title.right, `${label}: the title never runs under the X`).toBeLessThanOrEqual(frame.close.left + EXACT)
  expect(frame.close.right, `${label}: the X inside the frame`).toBeLessThanOrEqual(frame.scroll.right + EXACT)
  const head = openLog(page).locator('[data-logging-head]')
  await expect(head.getByRole('heading')).toHaveCount(1)
  await expect(head.getByText(/close/i)).toHaveCount(0)
  // The X is the log's only close control (a form's own "Save and close" submit is a save, not a close).
  await expect(openLog(page).getByRole('button', { name: /^close\b/i })).toHaveCount(1)
  await expect(openLog(page).getByText(/^\s*close( log)?\s*$/i)).toHaveCount(0)
  return tops
}

/** C43 / R110 / R127 / AC-R016-01: exactly the Balanced backdrop, and a sharp foreground. */
function expectBalanced(frame: Frame, tokens: Tokens, label: string) {
  expect(tokens.backdropTint, label).toBe('55%')
  expect(tokens.backdropEdge, label).toBe('85%')
  expect(frame.backdrop.filter, `${label}: the small blur only`).toBe(`blur(${tokens.blur}px)`)
  expect(frame.backdrop.color, `${label}: the 55% dim, nothing darker`).toBe(tokens.balancedColor)
  expect(frame.backdrop.image, `${label}: one corner vignette from a clear centre`)
    .toBe(`radial-gradient(rgba(0, 0, 0, 0) 35%, ${tokens.balancedEdge} 100%), none`)
  for (const layer of frame.foreground) {
    expect(layer, `${label}: the dialog, frame and form carry no filter, fade or shadow`)
      .toEqual({ filter: 'none', opacity: '1', shadow: 'none', backdrop: 'none' })
  }
}

/**
 * C44 / C57 / C58 / C59 / P01–P03 / R16 (AC-R018-04): one stationary frame on
 * the visible viewport; the scroller on its inner border with no bottom inset
 * and the chamfer clip; no scrollbar, no sideways overflow, no outline, no
 * interior line; a long form fills the space the viewport leaves and scrolls
 * inside, a short form is as tall as its content and does not scroll.
 */
function expectFrame(frame: Frame, tokens: Tokens, kind: 'long' | 'short', label: string) {
  const near = (actual: number, expected: number, what: string, tolerance = EXACT) =>
    expect(Math.abs(actual - expected), `${label}: ${what} (${actual} vs ${expected})`).toBeLessThanOrEqual(tolerance)
  near(frame.dialog.top, frame.frame.top, 'the dialog is the frame')
  near(frame.dialog.bottom, frame.frame.bottom, 'the dialog is the frame')
  near(frame.scroll.top, frame.frame.top + frame.border, 'scroller on the inner top border')
  near(frame.scroll.bottom, frame.frame.bottom - frame.border, 'scroller on the inner lower border (P01)')
  near(frame.scroll.left, frame.frame.left + frame.border, 'scroller on the inner left border')
  near(frame.scroll.right, frame.frame.right - frame.border, 'scroller on the inner right border')
  expect(frame.scrollPaddingBottom, `${label}: no blank strip above the inner lower border (P01)`).toBe(0)
  expect(frame.clip, `${label}: the inner chamfer clip`).toMatch(/^polygon\(/)
  expect(frame.interiorLines, `${label}: no interior line across the form (P01)`).toEqual([])
  expect(frame.scrollbar, `${label}: no scrollbar chrome (P03)`).toEqual({ gutter: 0, width: 'none', overflowY: 'auto' })
  expect(frame.sideways, `${label}: nothing sideways (P03)`).toEqual({ scroll: 0, document: 0 })
  expect(frame.outlines, `${label}: no automatic container outline (P02)`).toEqual({ dialog: 'none', frame: 'none', scroll: 'none', body: 'none' })
  expect(frame.ring.after, `${label}: the frame keeps its own border, never a focus ring (P02)`).toBe(frame.ring.brd)
  const visible = frame.viewport.visual
  expect(frame.frame.top, `${label}: inside the visible viewport`).toBeGreaterThanOrEqual(tokens.viewportGap / 2 - EXACT)
  expect(frame.frame.bottom, `${label}: inside the visible viewport`).toBeLessThanOrEqual(visible - tokens.viewportGap / 2 + EXACT)
  if (kind === 'long') {
    expect(frame.maxScroll, `${label}: a long form scrolls inside`).toBeGreaterThan(0)
    near(frame.frame.height, visible - tokens.viewportGap, 'a long form takes all the space the viewport leaves (no half-height cap)', 1)
    expect(frame.frame.height, `${label}: far above half the screen`).toBeGreaterThan(visible * 0.75)
  } else {
    expect(frame.maxScroll, `${label}: a short form does not scroll`).toBeLessThanOrEqual(1)
    expect(frame.frame.height, `${label}: a short form is as tall as its content`).toBeLessThan(visible - tokens.viewportGap - 1)
  }
}

/** R100 / AC-R016-03: nothing behind the open log can take focus or a tap. */
async function expectInertBehind(page: Page, label: string) {
  const reached = await page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null
    const open = document.querySelector('dialog.clr-accepted-log[open]')!
    const controls = [...document.querySelectorAll<HTMLElement>(
      'main#main button, main#main input, main#main textarea, main#main select, .clr-workout-footer button')]
      .filter((control) => !open.contains(control))
    const focusable = controls.filter((control) => {
      control.focus()
      return document.activeElement === control
    }).map((control) => control.getAttribute('aria-label') ?? control.textContent ?? control.tagName)
    active?.focus({ preventScroll: true })
    const dialog = document.querySelector('dialog.clr-accepted-log[open]')!
    const hits = controls.filter((control) => {
      const rect = control.getBoundingClientRect()
      if (rect.width === 0 || rect.bottom < 0 || rect.top > innerHeight) return false
      const hit = document.elementFromPoint(rect.left + rect.width / 2, Math.min(Math.max(rect.top + rect.height / 2, 0), innerHeight - 1))
      return hit !== null && !dialog.contains(hit) && hit !== dialog
    }).map((control) => control.getAttribute('aria-label') ?? control.textContent ?? control.tagName)
    return { focusable, hits }
  })
  expect(reached, `${label}: the workout behind is inert`).toEqual({ focusable: [], hits: [] })
}

interface Inspected {
  readonly moment: string
  readonly route: string
  readonly viewport: string
  readonly title: string
  readonly titleLines: number
  readonly titleTop: number
  readonly xFrameTop: number
  readonly closeTop: number
  readonly kind: 'long' | 'short'
  readonly frame: Box
  readonly scrollHeight: number
}

/**
 * One logging moment, open on its real route: the selected dialog (C40), its
 * header (C41), the Balanced backdrop (C43), the frame contract (JOURNEY-018)
 * and an inert screen behind, with delivered-revision image evidence.
 */
async function inspect(page: Page, tokens: Tokens, moment: string, title: string, options: { route: string; focusX?: boolean; shot?: boolean }) {
  const dialog = page.getByRole('dialog', { name: title, exact: true })
  await expect(dialog).toBeVisible()
  await expect(openLog(page)).toHaveCount(1)
  expect(await dialog.evaluate((node) => node.matches(':modal')), `${moment}: native modal`).toBe(true)
  const head = dialog.locator('[data-logging-head]')
  await expect(head.getByRole('heading', { name: title, exact: true })).toBeVisible()
  await expect(dialog.getByRole('heading', { name: title, exact: true })).toHaveCount(1)
  if (options.focusX ?? true) await expect(head.getByRole('button', { name: 'Close log', exact: true })).toBeFocused()
  // The selected dialog, never the rising sheet (C40, R110).
  await expect(page.locator('section.clr-set-sheet')).toHaveCount(0)
  await expect(page.locator('.clr-set-sheet-layer[data-open]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Minimi[sz]e$/ })).toHaveCount(0)
  const frame = await readFrame(page)
  const tops = await expectHeader(page, frame, moment)
  expectBalanced(frame, tokens, moment)
  const kind = frame.maxScroll > 1 ? 'long' : 'short'
  expectFrame(frame, tokens, kind, moment)
  await expectInertBehind(page, moment)
  const viewport = `${frame.viewport.width}x${frame.viewport.height}`
  if (options.shot ?? true) await attachShot(page, `${moment}-${viewport}`)
  const reading: Inspected = { moment, route: options.route, viewport, title: frame.titleText, titleLines: frame.titleLines, titleTop: tops.title, xFrameTop: tops.x,
    closeTop: frame.close.top, kind, frame: frame.frame, scrollHeight: frame.maxScroll + frame.scroll.height - 2 * frame.border }
  return { dialog, frame, reading }
}

/** The delivered revision the images were taken from (HEAD plus the working tree it names). */
const DELIVERED = (() => {
  try {
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim()
    const changed = execFileSync('git', ['status', '--porcelain'], { cwd: REPO_ROOT, encoding: 'utf8' }).split('\n').filter(Boolean).length
    return { head, uncommittedPaths: changed }
  } catch {
    return { head: 'unknown', uncommittedPaths: -1 }
  }
})()

/** Delivered-revision image evidence: the full viewport at device pixels, with its reference metadata beside it. */
async function attachShot(page: Page, name: string) {
  const viewport = page.viewportSize()
  await test.info().attach(`${name}.png`, { body: await page.screenshot({ caret: 'hide' }), contentType: 'image/png' })
  await test.info().attach(`${name}.json`, {
    body: JSON.stringify({ reference: ACCEPTED_REFERENCE, delivered: DELIVERED, url: new URL(page.url()).pathname + new URL(page.url()).search,
      viewport, deviceScaleFactor: await page.evaluate(() => devicePixelRatio), capturedAt: 'test-run' }, null, 2),
    contentType: 'application/json',
  })
}

async function attachJson(name: string, body: unknown) {
  await test.info().attach(`${name}.json`, { body: JSON.stringify(body, null, 2), contentType: 'application/json' })
}

/** Close by the X (tap or click) and expect focus back on the opener. */
async function closeByX(page: Page, opener: Locator, how: 'tap' | 'click' = 'tap') {
  const close = openLog(page).getByRole('button', { name: 'Close log', exact: true })
  if (how === 'tap') await close.tap()
  else await close.click()
  await expect(openLog(page)).toHaveCount(0)
  await expect(opener).toBeFocused()
}

/** Close by Escape and expect focus back on the opener. */
async function closeByEscape(page: Page, opener: Locator) {
  await page.keyboard.press('Escape')
  await expect(openLog(page)).toHaveCount(0)
  await expect(opener).toBeFocused()
}

/** Brings an opener to the middle of the screen (past the pinned rest and footer) and taps it. */
async function tapOpen(opener: Locator) {
  await opener.evaluate((node) => node.scrollIntoView({ block: 'center' }))
  await opener.tap()
}

async function expandCoaching(page: Page, name: RegExp) {
  const trigger = content(page).getByRole('button', { name }).first()
  await trigger.evaluate((node) => node.scrollIntoView({ block: 'center' }))
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.tap()
}

// ── JOURNEY-018 scrolling ──

/** The last control of an open log (its Save, Notes or final choice): what a long form must still reach. */
const lastControl = (dialog: Locator) =>
  dialog.locator('[data-logging-scroll] :is(button, input:not([type="hidden"]), textarea, select)').last()

/** Scrolls the open log's region by a real gesture of the named kind. */
async function scrollLog(page: Page, how: 'wheel' | 'touch', distance: number) {
  const box = (await openLog(page).locator('[data-logging-scroll]').boundingBox())!
  const x = Math.round(box.x + box.width / 2)
  const y = Math.round(box.y + box.height / 2)
  if (how === 'wheel') {
    await page.mouse.move(x, y)
    await page.mouse.wheel(0, distance)
  } else {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Input.synthesizeScrollGesture', { x, y, yDistance: -distance, gestureSourceType: 'touch', speed: 2400, repeatCount: 1 })
    await cdp.detach()
  }
  await page.waitForFunction(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(true)))))
}

/**
 * P01 at a middle position: a control cut by the inner lower border, painted
 * right down to it — the scroller's own region, not a strip or foot.
 */
async function cutAtLowerBorder(page: Page) {
  return openLog(page).evaluate((dialog) => {
    const scroll = dialog.querySelector<HTMLElement>('[data-logging-scroll]')!
    const edge = scroll.getBoundingClientRect().bottom
    const controls = [...scroll.querySelectorAll<HTMLElement>('input, textarea, select, button, .clr-check__box, [role="radio"]')]
      .filter((node) => node.getBoundingClientRect().height > 0)
    // Bring a control across the inner lower border: its middle on the edge.
    const target = controls.find((node) => {
      const rect = node.getBoundingClientRect()
      return rect.bottom > edge + 8 && rect.top - edge + rect.height / 2 + scroll.scrollTop <= scroll.scrollHeight - scroll.clientHeight
    }) ?? null
    if (target === null) return null
    const rect = target.getBoundingClientRect()
    scroll.scrollTop += rect.top + rect.height / 2 - edge
    const after = target.getBoundingClientRect()
    const x = after.left + Math.min(4, after.width / 2)
    const hit = document.elementFromPoint(x, edge - 1)
    return {
      control: target.getAttribute('aria-label') ?? target.closest('label, .clr-field, fieldset')?.textContent?.trim().slice(0, 30) ?? target.tagName,
      top: after.top, bottom: after.bottom, edge, scrollTop: scroll.scrollTop,
      paintedToEdge: hit !== null && (hit === target || target.contains(hit) || hit.contains(target) || hit.closest('.clr-bleed, .clr-chamfer, label, .clr-field') === target.closest('.clr-bleed, .clr-chamfer, label, .clr-field')),
      hit: hit === null ? null : `${hit.tagName}.${String(hit.className).slice(0, 40)}`,
    }
  })
}

/**
 * C44 / P01 / P03 through a long log: top, a middle with a control cut at
 * the inner lower border, then the end reached by the named gesture — the
 * frame and dialog never move, only the inside scrolls, and the last control
 * (Notes or Save) is fully visible inside the frame.
 */
async function expectContainedScroll(page: Page, tokens: Tokens, how: 'wheel' | 'touch', last: Locator, label: string) {
  const top = await readFrame(page)
  expectFrame(top, tokens, 'long', `${label} top`)
  const middle = await cutAtLowerBorder(page)
  expect(middle, `${label}: a control reaches the lower border`).not.toBeNull()
  expect(middle!.top, `${label}: ${middle!.control} starts above the inner lower border`).toBeLessThan(middle!.edge)
  expect(middle!.bottom, `${label}: ${middle!.control} continues below it, clipped there`).toBeGreaterThan(middle!.edge)
  expect(middle!.paintedToEdge, `${label}: ${middle!.control} is painted down to the inner lower border (${middle!.hit})`).toBe(true)
  const mid = await readFrame(page)
  expectFrame(mid, tokens, 'long', `${label} middle`)
  expect(mid.frame, `${label}: the frame is stationary`).toEqual(top.frame)
  expect(mid.dialog, `${label}: the dialog is stationary`).toEqual(top.dialog)
  await attachShot(page, `${label}-middle-cut`)
  await scrollLog(page, how, 4000)
  const end = await readFrame(page)
  expectFrame(end, tokens, 'long', `${label} bottom`)
  expect(end.scrollTop, `${label}: the ${how} gesture reached the end`).toBeGreaterThanOrEqual(end.maxScroll - 1)
  expect(end.frame, `${label}: the frame is stationary`).toEqual(top.frame)
  const lastBox = (await last.boundingBox())!
  expect(lastBox.y, `${label}: the last control is inside the frame`).toBeGreaterThanOrEqual(end.scroll.top - EXACT)
  expect(lastBox.y + lastBox.height, `${label}: the last control is above the inner lower border, with the end gap`).toBeLessThanOrEqual(end.scroll.bottom - end.bodyPaddingBottom + 1)
  await attachShot(page, `${label}-bottom`)
  return { top, middle, end }
}

/** The focus brackets: hosted by the open log, drawn round the focused control, and actually painted. */
async function expectBracketsOn(page: Page, control: Locator, label: string) {
  const reading = await control.evaluate((node) => {
    const layer = document.querySelector<HTMLElement>('.clr-focus-brackets')!
    const rect = node.getBoundingClientRect()
    const box = layer.getBoundingClientRect()
    return {
      host: layer.parentElement === document.querySelector('dialog.clr-accepted-log[open]') ? 'open log' : layer.parentElement?.tagName,
      layers: document.querySelectorAll('.clr-focus-brackets').length,
      opacity: getComputedStyle(layer).opacity,
      surrounds: box.left < rect.left && box.top < rect.top && box.right > rect.right && box.bottom > rect.bottom,
      corner: { x: box.left, y: box.top },
    }
  })
  expect({ host: reading.host, layers: reading.layers, opacity: reading.opacity, surrounds: reading.surrounds }, label)
    .toEqual({ host: 'open log', layers: 1, opacity: '1', surrounds: true })
  // Painted, not merely placed: the corner differs with the layer shown and hidden.
  const clip = { x: Math.max(0, reading.corner.x), y: Math.max(0, reading.corner.y), width: 12, height: 12 }
  const shown = await page.screenshot({ clip, scale: 'css' })
  await page.evaluate(() => document.querySelector<HTMLElement>('.clr-focus-brackets')!.style.setProperty('visibility', 'hidden'))
  const hidden = await page.screenshot({ clip, scale: 'css' })
  await page.evaluate(() => document.querySelector<HTMLElement>('.clr-focus-brackets')!.style.removeProperty('visibility'))
  expect(await firstDifferentRow(page, shown, hidden), `${label}: the brackets are painted over the log`).toBeGreaterThanOrEqual(0)
}

/**
 * Keyboard through a long log from the X: every Tab stop stays in the log and
 * is scrolled fully into the frame's view, until the last control.
 */
async function tabToLast(page: Page, last: Locator, label: string) {
  const stops: string[] = []
  const target = await last.elementHandle()
  for (let press = 0; press < 80; press += 1) {
    await page.keyboard.press('Tab')
    const stop = await page.evaluate(() => {
      const dialog = document.querySelector('dialog.clr-accepted-log[open]')!
      const active = document.activeElement as HTMLElement
      const scroll = dialog.querySelector('[data-logging-scroll]')!.getBoundingClientRect()
      const rect = active.getBoundingClientRect()
      return {
        name: active.getAttribute('aria-label') ?? (active as HTMLInputElement).labels?.[0]?.textContent?.trim() ?? active.textContent?.trim().slice(0, 30) ?? active.tagName,
        inside: dialog.contains(active) && active !== dialog,
        inView: rect.top >= scroll.top - 0.5 && rect.bottom <= scroll.bottom + 0.5,
      }
    })
    stops.push(stop.name)
    expect(stop.inside, `${label}: Tab stop ${stops.length} (${stop.name}) stays in the log`).toBe(true)
    expect(stop.inView, `${label}: Tab stop ${stops.length} (${stop.name}) is scrolled into the frame's view`).toBe(true)
    if (await page.evaluate((node) => node === document.activeElement, target)) return stops
  }
  stops.push(`target: ${await page.evaluate((node) => node?.outerHTML.slice(0, 160) ?? 'none', target)}`,
    `active: ${await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 160))}`)
  throw new Error(`${label}: Tab never reached the last control; stops ${stops.join(' | ')}`)
}

// ── JOURNEY-017 rhythm ──

/** Complete movement groups in an open log and the gaps around and inside them. */
async function readGroups(dialog: Locator) {
  return dialog.evaluate((node) => {
    const groups = [...node.querySelectorAll<HTMLElement>('.clr-logging-movement')]
    return groups.map((group, index) => {
      const rect = group.getBoundingClientRect()
      const children = [...group.children].filter((child) => child.getBoundingClientRect().height > 0)
      const inner = children.slice(1).map((child, at) => child.getBoundingClientRect().top - children[at].getBoundingClientRect().bottom)
      const previous = groups[index - 1]
      return {
        label: group.getAttribute('aria-label') ?? group.querySelector('h3, h4, p')?.textContent?.trim() ?? '',
        text: group.textContent ?? '',
        fields: group.querySelectorAll('input, select, textarea').length,
        effort: group.querySelector('[role="radiogroup"], fieldset') !== null,
        inner,
        before: previous === undefined ? null : rect.top - previous.getBoundingClientRect().bottom,
        parentGap: parseFloat(getComputedStyle(group.parentElement!).rowGap) || 0,
      }
    })
  })
}

/** Label-to-control gaps: choice legends and labelled timed fields in the open log. */
async function readLabelGaps(dialog: Locator) {
  return dialog.evaluate((node) => {
    const legends = [...node.querySelectorAll<HTMLElement>('fieldset:not(.clr-ladder-completion) > legend')].map((legend) => {
      const next = [...legend.parentElement!.children].find((child) => child !== legend && child.getBoundingClientRect().height > 0)
      return { label: legend.textContent?.trim() ?? '', gap: next === undefined ? null : next.getBoundingClientRect().top - legend.getBoundingClientRect().bottom }
    })
    const fields = [...node.querySelectorAll<HTMLElement>('.clr-timed-field')].map((field) => {
      const [label, control] = [...field.children]
      return { label: label.textContent?.trim() ?? '', gap: control === undefined ? null : control.getBoundingClientRect().top - label.getBoundingClientRect().bottom }
    })
    const ladder = node.querySelector('.clr-ladder-completion')
    const ladderGaps = ladder === null ? null : (() => {
      const legend = ladder.querySelector('legend')!.getBoundingClientRect()
      const tiles = ladder.querySelector('.clr-ladder-completion__tiles')!.getBoundingClientRect()
      const status = ladder.querySelector('.clr-ladder-completion__status')!.getBoundingClientRect()
      const partial = ladder.querySelector('.clr-ladder-completion__partial')?.getBoundingClientRect() ?? null
      return { heading: tiles.top - legend.bottom, count: status.top - tiles.bottom, partial: partial === null ? null : partial.top - status.bottom,
        tiles: ladder.querySelectorAll('.clr-ladder-completion__tile').length, status: ladder.querySelector('.clr-ladder-completion__status')!.textContent }
    })()
    return { legends, fields, ladder: ladderGaps }
  })
}

/**
 * C05 / R111 (AC-C05-01, AC-R017-02): each complete movement group holds its
 * identity, measurements and effort; whole groups sit the movement gap
 * further apart than the form's own gap; nothing inside a group moves apart.
 */
function expectGroups(groups: Awaited<ReturnType<typeof readGroups>>, tokens: Tokens, names: readonly string[] | null, label: string) {
  if (names === null) expect(groups.length, `${label}: complete movement groups`).toBeGreaterThanOrEqual(2)
  else expect(groups.length, `${label}: complete movement groups`).toBe(names.length)
  groups.forEach((group, index) => {
    const name = names?.[index] ?? group.label
    expect(name.length, `${label}: group ${index + 1} is named`).toBeGreaterThan(0)
    if (names !== null) expect(group.text.toLowerCase(), `${label}: group ${index + 1} names its own movement`).toContain(name)
    expect(group.fields, `${label}: ${name} keeps its measurements in its group`).toBeGreaterThan(0)
    for (const gap of group.inner) {
      expect(gap, `${label}: inside ${name} the fields keep their own rhythm`).toBeLessThanOrEqual(tokens.movementFieldGap + EXACT)
    }
    if (group.before !== null) {
      expect(Math.abs(group.before - (group.parentGap + tokens.movementGap)), `${label}: ${name} sits the movement gap further out (${group.before})`).toBeLessThanOrEqual(EXACT)
      expect(group.before, `${label}: between groups wider than any gap inside one`).toBeGreaterThan(Math.max(...groups.flatMap((entry) => entry.inner)))
    }
  })
}

/** C42 / R108 (AC-C42-01, AC-R017-01): every choice legend at the label gap, which is the labelled field's rhythm. */
function expectLabelRhythm(gaps: Awaited<ReturnType<typeof readLabelGaps>>, tokens: Tokens, label: string) {
  expect(tokens.labelGap, `${label}: the label gap is the field rhythm`).toBe(tokens.fieldGap)
  expect(gaps.legends.length + gaps.fields.length, `${label}: labels to read`).toBeGreaterThan(0)
  for (const legend of gaps.legends) {
    expect(Math.abs((legend.gap ?? -1) - tokens.labelGap), `${label}: ${legend.label} sits ${legend.gap}px over its choices`).toBeLessThanOrEqual(EXACT)
  }
  for (const field of gaps.fields) {
    expect(Math.abs((field.gap ?? -1) - tokens.fieldGap), `${label}: ${field.label} sits ${field.gap}px over its control`).toBeLessThanOrEqual(EXACT)
  }
}

/** Card peer grouping (G01 / R111): whole movements further apart than the tiers inside one. */
async function readCardPeers(list: Locator) {
  return list.evaluate((ol) => {
    const items = [...ol.children] as HTMLElement[]
    return items.map((item, index) => {
      const identity = item.querySelector('[data-movement-identity]')!
      const nameRow = identity.querySelector(':scope > [data-movement-name-row]')!.getBoundingClientRect()
      const detail = identity.querySelector(':scope > [data-movement-detail]')!.getBoundingClientRect()
      const previous = items[index - 1]
      const previousEnd = previous === undefined ? null
        : Math.max(...[...previous.children].map((child) => child.getBoundingClientRect().bottom))
      return {
        name: identity.querySelector('[data-movement-name]')?.textContent ?? '',
        tier: detail.top - nameRow.bottom,
        between: previousEnd === null ? null : identity.getBoundingClientRect().top - previousEnd,
      }
    })
  })
}

// ── C43 readability, measured directly (axe cannot decide text over the frame's painted surface) ──

function contrast(a: readonly number[], b: readonly number[]) {
  const luminance = (rgb: readonly number[]) => {
    const [r, g, bl] = rgb.map((channel) => {
      const c = channel / 255
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl
  }
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
/** WCAG 1.4.3 AA for text below the large-text size. */
const TEXT_CONTRAST = 4.5

/**
 * C43 "sharp readable foreground", in one skin: every piece of text in view
 * in the open log — its title, the movement lines, field labels and choice
 * legends — is painted in its computed colour and reads at AA against what
 * is actually painted behind it (the frame surface, the glass and the
 * backdrop beneath it). Each text's paint is made transparent for one capture
 * of the ground under its own glyph box (TASK-029's method); the weakest
 * pixel decides.
 */
async function expectDialogTextContrast(page: Page, skin: Skin) {
  const targets = await openLog(page).evaluate((dialog) => {
    const scroll = dialog.querySelector('[data-logging-scroll]')!.getBoundingClientRect()
    const nodes = [...dialog.querySelectorAll<HTMLElement>('[data-logging-head] h2, legend, label, p, .clr-set-log > [role="status"]')]
    return nodes.flatMap((node, index) => {
      const own = [...node.childNodes].filter((child) => child.nodeType === Node.TEXT_NODE && (child.textContent ?? '').trim() !== '')
      if (own.length === 0) return []
      const range = document.createRange()
      range.setStartBefore(own[0])
      range.setEndAfter(own[own.length - 1])
      const rect = range.getBoundingClientRect()
      if (rect.width < 2 || rect.top < scroll.top || rect.bottom > scroll.bottom) return []
      node.dataset.task041Text = String(index)
      return [{ index, text: own.map((child) => child.textContent).join(' ').trim().slice(0, 40),
        clip: { x: rect.left, y: rect.top, width: rect.width, height: rect.height } }]
    })
  })
  expect(targets.length, `${skin}: text to read in the open log`).toBeGreaterThan(3)
  const readings: Array<{ text: string; colour: string; minimum: number }> = []
  for (const target of targets) {
    const node = openLog(page).locator(`[data-task041-text="${target.index}"]`)
    const colour = await node.evaluate((element) => getComputedStyle(element).color)
    await node.evaluate((element) => {
      const style = (element as HTMLElement).style
      style.setProperty('transition', 'none', 'important')
      style.setProperty('color', 'transparent', 'important')
      style.setProperty('text-shadow', 'none', 'important')
      void getComputedStyle(element).color
    })
    const ground = await page.screenshot({ clip: target.clip, caret: 'hide', scale: 'css' })
    await node.evaluate((element) => {
      const style = (element as HTMLElement).style
      style.removeProperty('color')
      style.removeProperty('text-shadow')
      style.removeProperty('transition')
      delete (element as HTMLElement).dataset.task041Text
    })
    const pixels = await page.evaluate(async ({ png, paint }) => {
      const image = new Image()
      image.src = `data:image/png;base64,${png}`
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const context = canvas.getContext('2d', { willReadFrequently: true })!
      context.drawImage(image, 0, 0)
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data
      const swatch = document.createElement('canvas')
      swatch.width = swatch.height = 1
      const blend = swatch.getContext('2d', { willReadFrequently: true })!
      const seen = new Map<string, [number[], number[]]>()
      for (let offset = 0; offset < data.length; offset += 4) {
        const key = `${data[offset]},${data[offset + 1]},${data[offset + 2]}`
        if (seen.has(key)) continue
        blend.fillStyle = `rgb(${key})`
        blend.fillRect(0, 0, 1, 1)
        blend.fillStyle = paint
        blend.fillRect(0, 0, 1, 1)
        seen.set(key, [key.split(',').map(Number), [...blend.getImageData(0, 0, 1, 1).data.slice(0, 3)]])
      }
      return [...seen.values()]
    }, { png: ground.toString('base64'), paint: colour })
    const ratios = pixels.map(([back, fore]) => contrast(fore, back)).sort((a, b) => a - b)
    readings.push({ text: target.text, colour, minimum: ratios[0] })
  }
  await attachJson(`dialog-text-contrast-${skin}`, { skin, threshold: TEXT_CONTRAST, readings })
  for (const { text, minimum } of readings) {
    expect(minimum, `${skin}: “${text}” reads at AA contrast in the open log`).toBeGreaterThanOrEqual(TEXT_CONTRAST)
  }
  return readings
}

// ─────────────────────────────────────────────────────────────────────────────
// The proof
// ─────────────────────────────────────────────────────────────────────────────

test.describe('TASK-041 adopted dialog and form rhythm in the actual route consumers', () => {
  test('JOURNEY-016 every /workout logging moment phone-390 touch: anchor, other lift, timed and distance movement, extra set, correction, superset round, circuit round and movement, movement notes, ladder, AMRAP, For Time and EMOM each open the selected dialog with the framed icon-only X on the visible title top, exactly the Balanced backdrop and a sharp stationary frame, over an inert workout whose rest and block clocks keep counting, with drafts and focus kept through X, Escape and reopen', async ({ page, visit, checkA11y }) => {
    test.setTimeout(480_000)
    await page.setViewportSize(PHONE_390)
    const app = await syntheticApp(page, { clock: true })
    await visit('/workout')
    await expect(page.getByRole('heading', { level: 1, name: 'Workout', exact: true })).toBeVisible()
    const tokens = await readTokens(page)
    const readings: Inspected[] = []
    const at = async (moment: string, title: string, options: { focusX?: boolean; shot?: boolean } = {}) => {
      const inspected = await inspect(page, tokens, moment, title, { route: '/workout', ...options })
      readings.push(inspected.reading)
      return inspected
    }

    // ── Anchor / primary lift: the draft, the one rest counting inside the log ──
    const squat = movement(page, 'back squat')
    const squatRest = squat.getByRole('button', { name: 'Rest', exact: true })
    await tapOpen(squatRest)
    let log = await at('anchor', 'Log set 1')
    await log.dialog.getByLabel('Weight').fill('100')
    const counting = await restRemaining(page)
    await page.clock.runFor(5_000)
    expect(await restRemaining(page), 'the rest keeps counting while the log is open').toBe(counting - 5)
    await closeByX(page, squatRest)
    await tapOpen(squatRest)
    log = await at('anchor-reopened', 'Log set 1', { shot: false })
    await expect(log.dialog.getByLabel('Weight')).toHaveValue('100')
    await log.dialog.getByRole('button', { name: 'Log set 1', exact: true }).tap()
    await at('anchor-saved', 'Set 1 logged', { focusX: false, shot: false })
    await expect.poll(() => app.mutations.length).toBe(1)
    await closeByX(page, squatRest)

    // ── Movement note over the running rest: the rest stays behind it, counting ──
    await expandCoaching(page, /^Coaching and notes — back squat$/)
    const addNote = squat.getByRole('button', { name: 'Add note — back squat', exact: true })
    await tapOpen(addNote)
    log = await at('movement-note', 'Notes — back squat')
    await expect(log.dialog.getByRole('region', { name: 'Rest', exact: true })).toHaveCount(0)
    const behind = await restRemaining(page)
    await page.clock.runFor(3_000)
    expect(await restRemaining(page), 'the rest behind the note keeps counting').toBe(behind - 3)
    await log.dialog.getByRole('textbox', { name: 'Notes — back squat' }).fill('Brace first')
    const editNote = squat.getByRole('button', { name: 'Edit note — back squat', exact: true })
    await closeByEscape(page, editNote)
    await tapOpen(editNote)
    log = await at('movement-note-reopened', 'Notes — back squat', { shot: false })
    await expect(log.dialog.getByRole('textbox', { name: 'Notes — back squat' })).toHaveValue('Brace first')
    await closeByX(page, editNote)

    // ── Other lift, timed movement, distance movement ──
    for (const [moment, name] of [['other-lift', 'romanian deadlift'], ['timed-movement', 'plank'], ['distance-movement', 'farmer carry']] as const) {
      const rest = movement(page, name).getByRole('button', { name: 'Rest', exact: true })
      await tapOpen(rest)
      await at(moment, 'Log set 1')
      await closeByX(page, rest)
    }

    // ── Extra set: set 2 logged, then Extra set 3 ──
    await tapOpen(squatRest)
    log = await at('anchor-set-2', 'Log set 2', { shot: false })
    await log.dialog.getByRole('button', { name: 'Log set 2', exact: true }).tap()
    await expect(page.getByRole('dialog', { name: 'Set 2 logged', exact: true })).toBeVisible()
    await closeByX(page, squatRest)
    await expect(squat.getByText('Extra set 3', { exact: true })).toBeVisible()
    await tapOpen(squatRest)
    await at('extra-set', 'Log set 3')
    await closeByEscape(page, squatRest)

    // ── Saved-set correction ──
    const editSet = squat.getByRole('button', { name: 'Edit set 1' })
    await tapOpen(editSet)
    log = await at('set-correction', 'Edit set 1')
    await log.dialog.getByLabel('Reps').fill('4')
    await closeByX(page, editSet)
    await tapOpen(editSet)
    log = await at('set-correction-reopened', 'Edit set 1', { shot: false })
    await expect(log.dialog.getByLabel('Reps')).toHaveValue('4')
    await closeByX(page, editSet)

    // ── Superset round: its draft through Escape ──
    const pairRest = cardOf(page, 'Movements in this superset').getByRole('button', { name: 'Rest', exact: true })
    await tapOpen(pairRest)
    log = await at('superset', 'Log round 1')
    await log.dialog.getByRole('group', { name: `A1 ${LONG_NAME}, set 1` }).getByLabel('Reps').fill('9')
    await closeByEscape(page, pairRest)
    await tapOpen(pairRest)
    log = await at('superset-reopened', 'Log round 1', { shot: false })
    await expect(log.dialog.getByRole('group', { name: `A1 ${LONG_NAME}, set 1` }).getByLabel('Reps')).toHaveValue('9')
    await closeByX(page, pairRest)

    // ── The longest movement note title wraps; the X stays on its first line ──
    await expandCoaching(page, /^Coaching and notes — SUPERSET/)
    const addLong = page.getByRole('button', { name: `Add note — ${LONG_NAME}`, exact: true })
    await tapOpen(addLong)
    log = await at('movement-note-wrapped', `Notes — ${LONG_NAME}`)
    expect(log.frame.titleLines, 'the long note title wraps on a phone').toBeGreaterThan(1)
    await closeByX(page, addLong)

    // ── Circuit round, then circuit movement entry ──
    const circuit = cardOf(page, 'Movements in this circuit')
    const startRound = roundClock(circuit).getByRole('button', { name: 'Start round 1', exact: true })
    await tapOpen(startRound)
    await page.clock.runFor(30_000)
    await tapOpen(roundClock(circuit).getByRole('button', { name: 'Finish round 1', exact: true }))
    await at('circuit-round', 'Round 1 recorded')
    await page.keyboard.press('Escape')
    await expect(openLog(page)).toHaveCount(0)
    await tapOpen(circuit.getByRole('button', { name: 'Rest for kb swing', exact: true }))
    await at('circuit-movement', 'Log set 1')
    await closeByX(page, circuit.getByRole('button', { name: 'Rest', exact: true }))
    await checkA11y()

    // ── The timed section ──
    await page.getByRole('button', { name: 'Next section', exact: true }).tap()
    await expect(page.getByRole('heading', { name: 'Conditioning', exact: true })).toBeVisible()

    // Ladder: its race clock keeps running behind its own open log.
    const ladder = timedCard(page, LADDER_LIST)
    const ladderOpener = timedOpener(ladder)
    await tapOpen(ladder.getByRole('button', { name: 'Start ladder', exact: true }))
    await page.clock.runFor(40_000)
    const race = seconds(await clockOf(ladder).textContent())
    await tapOpen(ladderOpener)
    await at('ladder-running', LOG_RESULTS)
    await page.clock.runFor(10_000)
    await closeByX(page, ladderOpener)
    const ran = Math.abs(seconds(await clockOf(ladder).textContent()) - race)
    // Ten seconds behind the log (whole-second readout: 10, or 11 across a tick boundary).
    expect(ran >= 10 && ran <= 11, `the ladder clock ran on behind its log (${ran}s)`).toBe(true)
    await tapOpen(ladder.getByRole('list', { name: 'Rounds in this ladder', exact: true }).getByRole('button', { name: /^Round 1\b/ }))
    await tapOpen(ladder.getByRole('button', { name: 'Finish', exact: true }))
    await tapOpen(ladderOpener)
    await at('ladder', LOG_RESULTS)
    await closeByEscape(page, ladderOpener)

    // AMRAP, For Time and EMOM, each at its end.
    const amrap = timedCard(page, ACTUALS_AMRAP_WORK_LIST)
    await tapOpen(amrap.getByRole('button', { name: 'Start AMRAP', exact: true }))
    await page.clock.runFor(60_000)
    await tapOpen(amrap.getByRole('button', { name: 'Finish early', exact: true }))
    await tapOpen(timedOpener(amrap))
    log = await at('amrap', LOG_RESULTS)
    await log.dialog.getByRole('button', { name: 'Increase rounds completed', exact: true }).tap()
    await closeByX(page, timedOpener(amrap))
    await tapOpen(timedOpener(amrap))
    log = await at('amrap-reopened', LOG_RESULTS, { shot: false })
    await expect(log.dialog.getByRole('status', { name: 'Rounds completed', exact: true })).toHaveText('1')
    await closeByEscape(page, timedOpener(amrap))

    const forTime = timedCard(page, ACTUALS_FOR_TIME_WORK_LIST)
    await tapOpen(forTime.getByRole('button', { name: 'Start For Time', exact: true }))
    await page.clock.runFor(90_000)
    await tapOpen(forTime.getByRole('button', { name: 'Finish', exact: true }))
    await tapOpen(timedOpener(forTime))
    await at('for_time', LOG_RESULTS)
    await closeByX(page, timedOpener(forTime))

    const emom = timedCard(page, EMOM_LIST)
    await tapOpen(emom.getByRole('button', { name: 'Start EMOM', exact: true }))
    await page.clock.runFor(10 * 60_000 + 2_000)
    await tapOpen(timedOpener(emom))
    await at('emom', LOG_RESULTS)
    await closeByX(page, timedOpener(emom))
    await checkA11y()

    // One header and one frame contract across every moment, recorded beside the images.
    await attachJson('journey-016-workout-phone-390', { reference: ACCEPTED_REFERENCE, delivered: DELIVERED, tokens, readings })
    expect(readings.filter((reading) => Math.abs(reading.xFrameTop - reading.titleTop) > 1), 'every moment’s X on its visible title top').toEqual([])
    app.assertContained()
  })

  test('JOURNEY-016 wrapped titles, Workout feedback on /summary and the rest day on Home phone-320 keyboard reduced motion: a wrapped note title and Workout feedback keep the framed X on the first visible line, every moment opens and closes from the keyboard with visible keyboard focus inside, the rest day keeps its cancel meaning, and nothing is written', async ({ page, visit }) => {
    test.setTimeout(240_000)
    await page.setViewportSize(PHONE_320)
    const app = await syntheticApp(page, { reducedMotion: true })
    await visit('/workout')
    const tokens = await readTokens(page)
    const readings: Inspected[] = []
    const press = async (control: Locator) => {
      await control.evaluate((node) => node.scrollIntoView({ block: 'center' }))
      await control.focus()
      await page.keyboard.press('Enter')
    }

    // ── A five-line note title on /workout ──
    const trigger = content(page).getByRole('button', { name: /^Coaching and notes — SUPERSET/ })
    await press(trigger)
    const addLong = page.getByRole('button', { name: `Add note — ${LONG_NAME}`, exact: true })
    await press(addLong)
    let log = await inspect(page, tokens, 'movement-note-wrapped', `Notes — ${LONG_NAME}`, { route: '/workout' })
    readings.push(log.reading)
    expect(log.frame.titleLines, 'the title wraps over several lines at 320').toBeGreaterThanOrEqual(3)
    expect(log.frame.activeVisible, 'opened by keyboard, the X shows keyboard focus').toBe(true)
    await expectBracketsOn(page, log.dialog.getByRole('button', { name: 'Close log' }), 'wrapped note X')
    await log.dialog.getByRole('textbox', { name: `Notes — ${LONG_NAME}` }).fill('Short steps')
    const editLong = page.getByRole('button', { name: `Edit note — ${LONG_NAME}`, exact: true })
    await closeByEscape(page, editLong)
    await page.keyboard.press('Enter')
    log = await inspect(page, tokens, 'movement-note-wrapped-reopened', `Notes — ${LONG_NAME}`, { route: '/workout', shot: false })
    await expect(log.dialog.getByRole('textbox', { name: `Notes — ${LONG_NAME}` })).toHaveValue('Short steps')
    await closeByEscape(page, editLong)

    // ── Workout feedback on /summary ──
    app.goTo('done')
    await visit('/summary')
    const feedback = page.getByRole('button', { name: 'Log workout feedback', exact: true })
    await press(feedback)
    log = await inspect(page, tokens, 'workout-feedback', 'Workout feedback', { route: '/summary' })
    readings.push(log.reading)
    expect(log.frame.activeVisible).toBe(true)
    await expectBracketsOn(page, log.dialog.getByRole('button', { name: 'Close log' }), 'Workout feedback X')
    await log.dialog.getByRole('radio', { name: '2, Worn' }).check()
    await log.dialog.getByRole('textbox', { name: /Notes · optional/ }).fill('Long day.')
    await closeByEscape(page, feedback)
    await page.keyboard.press('Enter')
    log = await inspect(page, tokens, 'workout-feedback-reopened', 'Workout feedback', { route: '/summary', shot: false })
    await expect(log.dialog.getByRole('radio', { name: '2, Worn' })).toBeChecked()
    await expect(log.dialog.getByRole('textbox', { name: /Notes · optional/ })).toHaveValue('Long day.')
    await closeByEscape(page, feedback)

    // ── Rest day on Home: its picker focused first (U25); X and Escape cancel ──
    await visit('/')
    const mark = page.getByRole('region', { name: 'Rest day', exact: true }).getByRole('button', { name: 'Mark Rest Day', exact: true })
    await press(mark)
    log = await inspect(page, tokens, 'rest-day', 'Log rest day', { route: '/', focusX: false })
    readings.push(log.reading)
    const picker = log.dialog.getByRole('combobox', { name: 'Reason' })
    await expect(picker).toBeFocused()
    await picker.selectOption('injury')
    await closeByEscape(page, mark)
    await page.keyboard.press('Enter')
    log = await inspect(page, tokens, 'rest-day-reopened', 'Log rest day', { route: '/', focusX: false, shot: false })
    await expect(log.dialog.getByRole('combobox', { name: 'Reason' })).toHaveValue('rest')
    await closeByX(page, mark, 'click')

    await attachJson('journey-016-wrapped-phone-320', { reference: ACCEPTED_REFERENCE, delivered: DELIVERED, tokens, readings })
    expect(app.writes, 'opening, closing and reopening writes nothing').toEqual([])
    expect(app.mutations).toEqual([])
    app.assertContained()
  })

  test('JOURNEY-017 rhythm on /review, /workout and the shared logs phone-390: grouped cards keep each movement together and whole movements further apart, the superset round, For Time and AMRAP logs separate complete movement groups by the movement gap only, every choice legend sits at the field gap, the ladder keeps its Rounds completed heading gap and stands its count apart, and the removed helper paragraph is nowhere while performed and unrecorded entries keep their meaning', async ({ page, visit }) => {
    test.setTimeout(360_000)
    await page.setViewportSize(PHONE_390)
    const app = await syntheticApp(page, { at: 'review', clock: true })
    const report: Record<string, unknown> = {}

    // ── /review: the composed workout's grouped cards ──
    await visit('/review')
    await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('Synthetic TASK-041 route rhythm workout')
    const tokens = await readTokens(page)
    const expectPeers = async (context: string, list: string) => {
      const peers = await readCardPeers(page.getByRole('list', { name: list, exact: true }))
      expect(peers.length, `${context} ${list}`).toBeGreaterThanOrEqual(2)
      for (const peer of peers) {
        expect(Math.abs(peer.tier - tokens.tierGap), `${context} ${list}: ${peer.name}'s own tiers stay together`).toBeLessThanOrEqual(EXACT)
        if (peer.between !== null) {
          expect(peer.between, `${context} ${list}: ${peer.name} starts a whole peer gap either side of the separator`).toBeGreaterThanOrEqual(2 * tokens.peerGap)
          expect(peer.between, `${context} ${list}: complete movements further apart than tiers`).toBeGreaterThan(peer.tier)
        }
      }
      report[`${context} ${list}`] = peers
    }
    for (const list of ['Movements in this block', 'superset, 2 rounds', 'circuit, 2 rounds']) await expectPeers('review', list)
    await expect(page.getByText(HELPER_WORDS)).toHaveCount(0)
    await attachShot(page, 'review-grouped-cards')

    // ── /workout: the live cards, then the logs ──
    app.goTo('workout')
    await visit('/workout')
    for (const list of ['Movements in this block', 'Movements in this superset', 'Movements in this circuit']) await expectPeers('workout', list)
    await expect(page.getByText(HELPER_WORDS)).toHaveCount(0)

    // The anchor's set log: the Effort legend at the field gap.
    const squatRest = movement(page, 'back squat').getByRole('button', { name: 'Rest', exact: true })
    await tapOpen(squatRest)
    let dialog = page.getByRole('dialog', { name: 'Log set 1', exact: true })
    let gaps = await readLabelGaps(dialog)
    expectLabelRhythm(gaps, tokens, 'anchor log')
    report['anchor log labels'] = gaps
    report['anchor log Foundation field labels'] = await dialog.evaluate((node) => [...node.querySelectorAll('label')].map((label) => {
      const control = node.querySelector(`#${CSS.escape(label.htmlFor)}`)
      return { label: label.textContent?.trim(), gap: control === null ? null : control.getBoundingClientRect().top - label.getBoundingClientRect().bottom }
    }))
    await closeByX(page, squatRest)

    // The superset round: two complete groups, the helper gone, semantics kept.
    const pairRest = cardOf(page, 'Movements in this superset').getByRole('button', { name: 'Rest', exact: true })
    await tapOpen(pairRest)
    dialog = page.getByRole('dialog', { name: 'Log round 1', exact: true })
    await expect(dialog).toBeVisible()
    const groups = await readGroups(dialog)
    expectGroups(groups, tokens, [LONG_NAME, 'push up'], 'superset round')
    for (const group of groups) {
      expect(group.text, 'each group keeps Performed').toContain('Performed')
      expect(group.effort, 'each group keeps its Effort').toBe(true)
    }
    gaps = await readLabelGaps(dialog)
    expectLabelRhythm(gaps, tokens, 'superset round')
    report['superset round groups'] = groups
    report['superset round labels'] = gaps
    await expect(dialog.getByText(HELPER_WORDS)).toHaveCount(0)
    // No instruction took the helper's place: every paragraph is a movement's own line or the rest's.
    const prose = await dialog.evaluate((node) => [...node.querySelectorAll('p')].map((paragraph) => ({
      text: paragraph.textContent?.trim() ?? '',
      owner: paragraph.closest('.clr-logging-movement') !== null ? 'movement'
        : paragraph.closest('[role="region"], [role="timer"], .clr-countdown, [data-rest]') !== null || /^Rest\b/.test(paragraph.textContent?.trim() ?? '') ? 'rest' : 'form',
    })))
    report['superset round paragraphs'] = prose
    expect(prose.filter((paragraph) => paragraph.owner === 'form'), 'no added paragraph outside the movement groups').toEqual([])
    expect(prose.filter((paragraph) => paragraph.owner === 'movement')).toHaveLength(2)
    await attachShot(page, 'superset-round-groups')
    const lift = dialog.getByRole('group', { name: `A1 ${LONG_NAME}, set 1` })
    const partner = dialog.getByRole('group', { name: 'A2 push up, set 1' })
    await lift.getByLabel('Reps').fill('9')
    await expect(lift.getByRole('checkbox', { name: 'Performed' })).toBeChecked()
    await expect(partner.getByRole('checkbox', { name: 'Performed' })).not.toBeChecked()
    await dialog.getByRole('button', { name: 'Log round 1', exact: true }).tap()
    await expect.poll(() => app.mutations.length).toBe(1)
    expect(app.mutations[0]).toMatchObject({ operation: 'insert', exercise_id: app.exerciseId(0, LONG_MOVEMENT_ID), set_number: 1, values: { actual_reps: 9 } })
    await expect(page.getByRole('dialog', { name: 'Round 1 logged', exact: true })).toBeVisible()
    await closeByX(page, pairRest)
    // A ticked movement with a blank field logs the movement, its blank unrecorded.
    await tapOpen(pairRest)
    dialog = page.getByRole('dialog', { name: 'Log round 2', exact: true })
    await expect(dialog).toBeVisible()
    const partnerTwo = dialog.getByRole('group', { name: 'A2 push up, set 2' })
    await partnerTwo.getByLabel('Reps').fill('')
    await partnerTwo.getByRole('checkbox', { name: 'Performed' }).check()
    await dialog.getByRole('button', { name: 'Log round 2', exact: true }).tap()
    await expect.poll(() => app.mutations.length).toBe(2)
    expect(app.mutations[1]).toMatchObject({ operation: 'insert', exercise_id: app.exerciseId(0, 'push-up'), set_number: 2, values: { actual_reps: null } })
    expect(app.mutations.filter((mutation) => mutation.exercise_id === app.exerciseId(0, LONG_MOVEMENT_ID))).toHaveLength(1)
    await closeByX(page, pairRest)

    // ── Timed logs ──
    await page.getByRole('button', { name: 'Next section', exact: true }).tap()
    await expect(page.getByRole('heading', { name: 'Conditioning', exact: true })).toBeVisible()
    await expect(page.getByText(HELPER_WORDS)).toHaveCount(0)

    const forTime = timedCard(page, ACTUALS_FOR_TIME_WORK_LIST)
    await tapOpen(forTime.getByRole('button', { name: 'Start For Time', exact: true }))
    await page.clock.runFor(90_000)
    await tapOpen(forTime.getByRole('button', { name: 'Finish', exact: true }))
    await tapOpen(timedOpener(forTime))
    dialog = page.getByRole('dialog', { name: LOG_RESULTS, exact: true })
    await dialog.getByRole('group', { name: 'Work completed', exact: true }).getByRole('radio', { name: 'Incomplete', exact: true }).tap()
    const raceGroups = await readGroups(dialog)
    expectGroups(raceGroups, tokens, null, 'For Time incomplete')
    gaps = await readLabelGaps(dialog)
    expectLabelRhythm(gaps, tokens, 'For Time')
    report['for time groups'] = raceGroups
    report['for time labels'] = gaps
    await attachShot(page, 'for-time-groups')
    await closeByX(page, timedOpener(forTime))

    const amrap = timedCard(page, ACTUALS_AMRAP_WORK_LIST)
    await tapOpen(amrap.getByRole('button', { name: 'Start AMRAP', exact: true }))
    await page.clock.runFor(60_000)
    await tapOpen(amrap.getByRole('button', { name: 'Finish early', exact: true }))
    await tapOpen(timedOpener(amrap))
    dialog = page.getByRole('dialog', { name: LOG_RESULTS, exact: true })
    await dialog.getByRole('button', { name: 'Increase rounds completed', exact: true }).tap()
    const amrapGroups = await readGroups(dialog)
    expectGroups(amrapGroups, tokens, null, 'AMRAP')
    gaps = await readLabelGaps(dialog)
    expectLabelRhythm(gaps, tokens, 'AMRAP')
    report['amrap groups'] = amrapGroups
    report['amrap labels'] = gaps
    await closeByX(page, timedOpener(amrap))

    // The twelve-round ladder: the good heading gap kept, the count stood apart.
    const ladder = timedCard(page, LADDER_LIST)
    await tapOpen(ladder.getByRole('button', { name: 'Start ladder', exact: true }))
    await page.clock.runFor(30_000)
    const rounds = ladder.getByRole('list', { name: 'Rounds in this ladder', exact: true })
    for (const round of [1, 2, 3]) await tapOpen(rounds.getByRole('button', { name: new RegExp(`^Round ${round}\\b`) }))
    await tapOpen(ladder.getByRole('button', { name: 'Finish', exact: true }))
    await tapOpen(timedOpener(ladder))
    dialog = page.getByRole('dialog', { name: LOG_RESULTS, exact: true })
    gaps = await readLabelGaps(dialog)
    expectLabelRhythm(gaps, tokens, 'ladder')
    expect(gaps.ladder, 'the ladder log shows its rounds').not.toBeNull()
    expect(gaps.ladder!.tiles).toBe(12)
    expect(gaps.ladder!.status).toMatch(/^3 of 12 rounds completed/)
    expect(Math.abs(gaps.ladder!.heading - tokens.fieldGap), `the good Rounds completed heading gap is kept (${gaps.ladder!.heading})`).toBeLessThanOrEqual(EXACT)
    expect(Math.abs(gaps.ladder!.count - tokens.countGap), `breathing room before the count (${gaps.ladder!.count})`).toBeLessThanOrEqual(EXACT)
    expect(gaps.ladder!.count, 'the count stands further from the tiles than a label from its control').toBeGreaterThan(tokens.labelGap)
    if (gaps.ladder!.partial !== null) expect(Math.abs(gaps.ladder!.partial - tokens.fieldGap)).toBeLessThanOrEqual(EXACT)
    report['ladder labels'] = gaps
    await attachShot(page, 'ladder-12-rhythm')
    await closeByX(page, timedOpener(ladder))

    await attachJson('journey-017-rhythm-phone-390', { reference: ACCEPTED_REFERENCE, delivered: DELIVERED, tokens, report })
    app.assertContained()
  })

  test('JOURNEY-018 long logs on /workout phone-320 touch and wheel reduced motion: the anchor set, superset round and twelve-round ladder scroll only inside one stationary frame that fills the visible viewport, a control is painted down to the inner lower border mid-scroll, touch and wheel reach Save and Notes, no scrollbar or sideways overflow shows, reopen draws no container outline, and a short note stays content-height without scrolling', async ({ page, visit }) => {
    test.setTimeout(300_000)
    await page.setViewportSize(PHONE_320)
    const app = await syntheticApp(page, { reducedMotion: true, clock: true })
    await visit('/workout')
    const tokens = await readTokens(page)
    const report: Record<string, unknown> = {}

    // The anchor's set log is long on a 320 × 568 phone: touch reaches Log set 1.
    const squatRest = movement(page, 'back squat').getByRole('button', { name: 'Rest', exact: true })
    await tapOpen(squatRest)
    let log = await inspect(page, tokens, 'anchor-320', 'Log set 1', { route: '/workout' })
    expect(log.reading.kind).toBe('long')
    report.anchor = await expectContainedScroll(page, tokens, 'touch', log.dialog.getByRole('button', { name: 'Log set 1', exact: true }), 'anchor 320 touch')
    await closeByX(page, squatRest)
    // Reopen by touch: focus on the X without a visible ring, no container outline.
    await tapOpen(squatRest)
    let frame = await readFrame(page)
    expect({ active: frame.active, visible: frame.activeVisible }).toEqual({ active: 'Close log', visible: false })
    expectFrame(frame, tokens, 'long', 'anchor reopened')
    await closeByX(page, squatRest)

    // The superset round: the wheel reaches Log round 1.
    const pairRest = cardOf(page, 'Movements in this superset').getByRole('button', { name: 'Rest', exact: true })
    await tapOpen(pairRest)
    log = await inspect(page, tokens, 'superset-320', 'Log round 1', { route: '/workout' })
    expect(log.reading.kind).toBe('long')
    report.superset = await expectContainedScroll(page, tokens, 'wheel', log.dialog.getByRole('button', { name: 'Log round 1', exact: true }), 'superset 320 wheel')
    // A tap on blank space inside the frame focuses the dialog itself: still no outline (P02).
    const frameBox = (await openLog(page).locator('[data-logging-frame]').boundingBox())!
    await page.touchscreen.tap(frameBox.x + 6, frameBox.y + frameBox.height / 2)
    frame = await readFrame(page)
    expectFrame(frame, tokens, 'long', 'superset after a blank tap')
    expect(frame.activeVisible).toBe(false)
    await closeByX(page, pairRest)

    // A short form: the note is as tall as its content.
    await expandCoaching(page, /^Coaching and notes — back squat$/)
    const addNote = movement(page, 'back squat').getByRole('button', { name: 'Add note — back squat', exact: true })
    await tapOpen(addNote)
    log = await inspect(page, tokens, 'note-320', 'Notes — back squat', { route: '/workout' })
    expect(log.reading.kind, 'an ordinary short form does not scroll').toBe('short')
    await closeByX(page, addNote)

    // The twelve-round ladder (R128, R129): touch reaches its Notes.
    await page.getByRole('button', { name: 'Next section', exact: true }).tap()
    await expect(page.getByRole('heading', { name: 'Conditioning', exact: true })).toBeVisible()
    const ladder = timedCard(page, LADDER_LIST)
    await tapOpen(ladder.getByRole('button', { name: 'Start ladder', exact: true }))
    await page.clock.runFor(20_000)
    await tapOpen(ladder.getByRole('button', { name: 'Finish', exact: true }))
    await tapOpen(timedOpener(ladder))
    log = await inspect(page, tokens, 'ladder-12-320', LOG_RESULTS, { route: '/workout' })
    expect(log.reading.kind).toBe('long')
    report.ladder = await expectContainedScroll(page, tokens, 'touch', lastControl(log.dialog), 'ladder 12 320 touch')
    await closeByX(page, timedOpener(ladder))
    await tapOpen(timedOpener(ladder))
    frame = await readFrame(page)
    expectFrame(frame, tokens, 'long', 'ladder reopened')
    expect(frame.activeVisible).toBe(false)
    await closeByX(page, timedOpener(ladder))

    await attachJson('journey-018-long-phone-320', { reference: ACCEPTED_REFERENCE, delivered: DELIVERED, tokens, report })
    app.assertContained()
  })

  test('JOURNEY-018 keyboard and focus on /workout phone-390 and desktop-1280: opened by keyboard the X and every Tab stop show their focus brackets inside the log while no container is outlined, each stop is scrolled into the frame up to Save, opened by touch nothing is ringed, a shrinking visible viewport (on-screen keyboard) shrinks the frame with Save still reachable, and long and short forms use the available height at both sizes', async ({ page, visit }) => {
    test.setTimeout(300_000)
    const app = await syntheticApp(page, { clock: true })
    const report: Record<string, unknown> = {}
    for (const size of [PHONE_390, DESKTOP_1280]) {
      const at = `${size.width}x${size.height}`
      await page.setViewportSize(size)
      await visit('/workout')
      const tokens = await readTokens(page)
      const pairRest = cardOf(page, 'Movements in this superset').getByRole('button', { name: 'Rest', exact: true })
      await pairRest.evaluate((node) => node.scrollIntoView({ block: 'center' }))
      await pairRest.focus()
      await page.keyboard.press('Enter')
      const log = await inspect(page, tokens, `superset-keyboard-${at}`, 'Log round 1', { route: '/workout' })
      const close = log.dialog.getByRole('button', { name: 'Close log', exact: true })
      expect(log.frame.activeVisible, `${at}: the X shows keyboard focus`).toBe(true)
      await expectBracketsOn(page, close, `${at} X`)
      // Log round stays unavailable until a movement is identified: enter one by keyboard first.
      await log.dialog.getByRole('group', { name: `A1 ${LONG_NAME}, set 1` }).getByLabel('Reps').focus()
      await page.keyboard.type('9')
      await close.focus()
      const save = log.dialog.getByRole('button', { name: 'Log round 1', exact: true })
      await expect(save).toBeEnabled()
      const stops = await tabToLast(page, save, `${at} superset`)
      await expectBracketsOn(page, save, `${at} Log round 1`)
      const end = await readFrame(page)
      expectFrame(end, tokens, log.reading.kind, `${at} after Tab to Save`)
      await attachShot(page, `superset-keyboard-save-${at}`)
      await closeByEscape(page, pairRest)

      // Touch reopen on a freshly loaded screen (no keyboard modality carried over):
      // the X holds focus without a ring; nothing is outlined or bracketed.
      await visit('/workout')
      await tapOpen(pairRest)
      const touched = await readFrame(page)
      expect({ active: touched.active, visible: touched.activeVisible }).toEqual({ active: 'Close log', visible: false })
      expect(await page.evaluate(() => getComputedStyle(document.querySelector('.clr-focus-brackets')!).opacity)).toBe('0')
      expectFrame(touched, tokens, log.reading.kind, `${at} touch reopen`)
      await log.dialog.getByRole('group', { name: `A1 ${LONG_NAME}, set 1` }).getByLabel('Reps').fill('9')

      // The on-screen keyboard: the visible viewport shrinks and the frame follows it.
      // An emulated viewport change does not deliver the visual-viewport resize
      // event a real keyboard sends, so the test delivers it (as the browser
      // would) after shrinking the viewport; the overlay's own listener does the rest.
      const shrunk = { width: size.width, height: Math.round(size.height * 0.55) }
      const keyboardUp = async (to: Size) => {
        await page.setViewportSize(to)
        await expect.poll(() => page.evaluate(() => visualViewport?.height)).toBe(to.height)
        await page.evaluate(() => visualViewport!.dispatchEvent(new Event('resize')))
        await expect.poll(async () => (await readFrame(page)).frame.bottom).toBeLessThanOrEqual(to.height)
      }
      await keyboardUp(shrunk)
      const keyboard = await readFrame(page)
      expectFrame(keyboard, tokens, 'long', `${at} with the keyboard up`)
      await save.focus()
      const saveBox = (await save.boundingBox())!
      const kept = await readFrame(page)
      expect(saveBox.y + saveBox.height, `${at}: Save reachable above the keyboard`).toBeLessThanOrEqual(kept.scroll.bottom + EXACT)
      expect(saveBox.y, `${at}: Save reachable above the keyboard`).toBeGreaterThanOrEqual(kept.scroll.top - EXACT)
      await attachShot(page, `superset-keyboard-up-${at}`)
      await keyboardUp(size)
      await closeByX(page, pairRest)

      // A short form at this size.
      await expandCoaching(page, /^Coaching and notes — back squat$/)
      const addNote = movement(page, 'back squat').getByRole('button', { name: 'Add note — back squat', exact: true })
      await tapOpen(addNote)
      const note = await inspect(page, tokens, `note-${at}`, 'Notes — back squat', { route: '/workout' })
      expect(note.reading.kind).toBe('short')
      await closeByX(page, addNote)
      report[at] = { superset: log.reading, stops, keyboard: keyboard.frame, note: note.reading }
    }
    await attachJson('journey-018-keyboard', { reference: ACCEPTED_REFERENCE, delivered: DELIVERED, report })
    expect(app.mutations).toEqual([])
    app.assertContained()
  })

  test('accepted gallery states clear phone-390: all sixteen logging states, ladder-long with its provider specimen and the route’s own twelve-round ladder, and the urgency demonstration open the one selected dialog with the framed icon-only X on the title’s visible top, the Balanced backdrop and the contained frame, with nothing read or written over the network', async ({ page, visit }) => {
    test.setTimeout(300_000)
    await page.setViewportSize(PHONE_390)
    await installDeterministicCapture(page, { skin: 'clear', reducedMotion: true })
    const requests: string[] = []
    page.on('request', (request) => {
      if (/\/(rest|auth|functions)\/v1\//.test(request.url())) requests.push(`${request.method()} ${request.url()}`)
    })
    const states: readonly { id: string; scope: string; open: string; before?: string; title: string; focusX?: boolean; long?: boolean }[] = [
      { id: 'anchor', scope: '[data-gallery-set-logging="anchor"]', open: 'Rest', title: 'Log set 1' },
      { id: 'other-lift', scope: '[data-gallery-set-logging="other-lift"]', open: 'Rest', title: 'Log set 1' },
      { id: 'timed-movement', scope: '[data-gallery-set-logging="timed-movement"]', open: 'Rest', title: 'Log set 1' },
      { id: 'distance-movement', scope: '[data-gallery-set-logging="distance-movement"]', open: 'Rest', title: 'Log set 1' },
      { id: 'extra-set', scope: '[data-gallery-set-logging="extra-set"]', open: 'Rest', title: 'Log set 4' },
      { id: 'set-correction', scope: '[data-gallery-set-logging="set-correction"]', open: 'Edit set 1', title: 'Edit set 1' },
      { id: 'superset', scope: '[data-gallery-group-logging="superset"]', open: 'Rest', title: 'Log round 1' },
      { id: 'circuit-round', scope: '[data-gallery-circuit-round]', open: 'Finish round 1', title: 'Round 1 recorded' },
      { id: 'circuit-movement', scope: '[data-gallery-group-logging="circuit-movement"]', open: 'Rest for goblet squat', title: 'Log set 1' },
      { id: 'movement-note', scope: '[data-gallery-logging-moment="standard"]', before: 'Coaching and notes — back squat', open: 'Add note — back squat', title: 'Notes — back squat' },
      { id: 'workout-feedback', scope: '[data-gallery-logging-moment="fresh"]', open: 'Log workout feedback', title: 'Workout feedback' },
      { id: 'rest-day', scope: '[data-gallery-logging-moment="unmarked"]', open: 'Mark Rest Day', title: 'Log rest day', focusX: false },
      { id: 'emom', scope: '[data-gallery-emom="complete"]', open: LOG_RESULTS, title: LOG_RESULTS },
      { id: 'amrap', scope: '[data-gallery-amrap="early"]', open: LOG_RESULTS, title: LOG_RESULTS },
      { id: 'for_time', scope: '[data-gallery-race="for-time-cap"]', open: LOG_RESULTS, title: LOG_RESULTS },
      { id: 'ladder', scope: '[data-gallery-race="ladder-finish"]', open: LOG_RESULTS, title: LOG_RESULTS },
      { id: 'ladder-long', scope: '[data-gallery-ladder-long]', open: 'Open long ladder results', title: 'Ladder · 12 rounds', long: true },
      { id: 'ladder-long', scope: '[data-gallery-race="ladder-cap"]', open: LOG_RESULTS, title: LOG_RESULTS },
      { id: 'urgency', scope: '[data-gallery-deadline-warning]', open: 'Open log over the warning', title: 'Log set' },
    ]
    let tokens: Tokens | null = null
    const readings: Inspected[] = []
    for (const state of states) {
      await visit(`/gallery/refinements?state=${state.id}`)
      tokens ??= await readTokens(page)
      const scope = page.locator(state.scope).first()
      if (state.before !== undefined) await scope.getByRole('button', { name: state.before, exact: true }).click()
      const opener = scope.getByRole('button', { name: state.open, exact: true })
      await opener.evaluate((node) => node.scrollIntoView({ block: 'center' }))
      await opener.click()
      const moment = `gallery-${state.id}${state.scope.includes('ladder-cap') ? '-route' : ''}`
      const log = await inspect(page, tokens, moment, state.title, { route: `/gallery/refinements?state=${state.id}`, focusX: state.focusX })
      readings.push(log.reading)
      // R104: no visible Close word or text close button anywhere in the log, the urgency demonstration included.
      await expect(log.dialog.getByText(/^\s*close( log)?\s*$/i)).toHaveCount(0)
      await expect(log.dialog.getByRole('button', { name: /^close\b/i })).toHaveCount(1)
      if (state.long === true) {
        expect(log.reading.kind, `${moment}: the long ladder scrolls inside the frame`).toBe('long')
        await expectContainedScroll(page, tokens, 'wheel', lastControl(log.dialog), `${moment} wheel`)
      }
      await log.dialog.getByRole('button', { name: 'Close log', exact: true }).click()
      await expect(openLog(page)).toHaveCount(0)
      if (state.id === 'circuit-round') {
        expect(await scope.getByRole('group', { name: 'Round clock', exact: true }).evaluate((node) => node.contains(document.activeElement))).toBe(true)
      } else if (state.id === 'circuit-movement') {
        await expect(scope.getByRole('button', { name: 'Rest', exact: true })).toBeFocused()
      } else {
        await expect(opener).toBeFocused()
      }
    }
    await attachJson('gallery-states-clear-phone-390', { reference: ACCEPTED_REFERENCE, delivered: DELIVERED, tokens, readings })
    expect(requests, 'the gallery reads and writes nothing over the network').toEqual([])
  })

  for (const skin of ['clear', 'vapour', 'signal', 'mono'] as const) {
    test(`JOURNEY-016 skin ${skin} /workout phone-390: the superset round opens with the Balanced backdrop in the ${skin} skin and every title, movement line, label and legend in view reads at AA contrast measured against what is painted behind it`, async ({ page, visit }) => {
      test.setTimeout(180_000)
      await page.setViewportSize(PHONE_390)
      const app = await syntheticApp(page, { skin, reducedMotion: true })
      await visit('/workout')
      await expect(page.locator('html')).toHaveAttribute('data-skin', skin)
      const tokens = await readTokens(page)
      const pairRest = cardOf(page, 'Movements in this superset').getByRole('button', { name: 'Rest', exact: true })
      await tapOpen(pairRest)
      await inspect(page, tokens, `superset-${skin}`, 'Log round 1', { route: '/workout' })
      await expectDialogTextContrast(page, skin)
      await closeByX(page, pairRest)
      const squatRest = movement(page, 'back squat').getByRole('button', { name: 'Rest', exact: true })
      await tapOpen(squatRest)
      await inspect(page, tokens, `anchor-${skin}`, 'Log set 1', { route: '/workout', shot: false })
      await expectDialogTextContrast(page, skin)
      await closeByX(page, squatRest)
      app.assertContained()
    })
  }
})
