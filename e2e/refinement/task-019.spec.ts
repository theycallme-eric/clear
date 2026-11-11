import { spawn } from 'node:child_process'
import { createServer, type AddressInfo } from 'node:net'
import { resolve } from 'node:path'
import type { Locator, Page, Route } from '@playwright/test'

import { readE2eEnv } from '../../scripts/e2e/env.mjs'
import { peerGroupingAcceptance } from '../../src/dev/gallery-refinement-cards-data'
import { savedSessionRow } from '../../src/dev/gallery-refinement-overview-data'
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
import {
  ACTUALS_AMRAP_BLOCK,
  ACTUALS_AMRAP_WORK_LIST,
  ACTUALS_FOR_TIME_BLOCK,
  ACTUALS_FOR_TIME_WORK_LIST,
  ACTUALS_LADDER_BLOCK,
  ACTUALS_LADDER_WORK_LIST,
} from '../../src/test/timed-actuals-fixture'
import { fixtureLocation, onboardedProfile } from '../../src/test/user-data-double'
import { definitionFixture } from '../../src/test/workout-double'
import { installDeterministicCapture } from '../design-0143/fixtures'
import { expect, test as scanned } from '../fixtures'

/**
 * TASK-019 (REQ-019; C45; G07, G10, G12; R43, R46, R61, R64, R82, R100, R115,
 * R116; AC-C45-01, AC-R019-01, AC-R019-02; completion owner of JOURNEY-019) —
 * every logging moment uses the shared focused interaction while keeping its
 * own fields, drafts, timing and data ownership.
 *
 * This is the cross-family proof after the four consumer-family migrations
 * (TASK-043 sets, TASK-044 groups, TASK-045 notes/feedback/rest day, TASK-046
 * timed results). It does not redo them: each family's own spec proves its
 * family. Here the sixteen inventoried moments are driven together, on the
 * real entry points (ENTRY-019: `/workout`, `/summary` and Home's rest-day
 * entry), so the seams between families are executed rather than inferred:
 *
 * - one chrome: every moment opens the same native modal `LoggingOverlay` —
 *   one title, the framed icon-only "Close log" X focused first, the Balanced
 *   backdrop, the screen behind inert — and the chrome reads identically
 *   across families (`expectFocusedLog` returns a signature compared across
 *   moments);
 * - one close: the X and Escape close every moment and return focus to the
 *   control that opened it (or, where that control is replaced, to its
 *   documented successor), and each family's draft meaning survives;
 * - one writer each: the intercepted writes show each moment writing only its
 *   own owner's rows — set observations (`mutate_set_observation`) for sets,
 *   superset rounds and circuit movements; the circuit round on its block
 *   (`block_results` at the section's forward action); notes on the
 *   movement's `workout_exercises` row; feedback on the session's
 *   `workout_sessions` row; the rest day through `mark_rest_day`; the four
 *   timed families on `block_results` and `block_movement_results` through
 *   the section's forward action — and nothing else;
 * - one rest: a log never draws a second rest clock beside the session's one
 *   rest, whichever family opened it;
 * - true clocks: a timed block's clock keeps running (or stays paused) while
 *   another family's log or its own log is open over it;
 * - errors keep drafts: a refused write in every writer family keeps the
 *   entry and its retry writes it once, never fabricating performed work.
 *
 * Synthetic and contained: one intercepted account for a fictional user. Reads
 * answer the fixtures; the writes the journey makes are answered here, never
 * forwarded; no model call, no real row. The accepted gallery states
 * (reference eded158cfd928d382c9a9409e2c372270312741d) are memory-only.
 */
const OWNER = '00000000-0000-4000-8000-000000001901'
const PLACE = '00000000-0000-4000-8000-000000001911'
const COMPLETED = '00000000-0000-4000-8000-000000001921'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
}
const SQUAT_REST = 90
const PAIR_REST = 45
const CIRCUIT_REST = 40
const LOG_RESULTS = 'Log results'
const EMOM_LIST = 'Movements in this EMOM'
const UNDO_FINISH = 'Undo finish · Resume ladder'

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
    if (code !== null) throw new Error(`Synthetic TASK-019 server exited (${code}) before ${origin} was ready`)
    try {
      if ((await fetch(origin)).ok && (await fetch(own)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((settle) => setTimeout(settle, 250))
  }
  throw new Error(`Synthetic TASK-019 origin ${origin} did not start`)
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
          VITE_SUPABASE_URL: 'https://synthetic-task-019.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-task-019-public-placeholder',
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
// One cross-family session: every /workout moment in two sections
// ─────────────────────────────────────────────────────────────────────────────

const bodyweight = { equipment: 'bodyweight', load_type: 'bodyweight' as const, load_value: null }

/** Anchor/primary lift, another lift, a timed movement and a distance movement. */
const STANDARD = makeWorkoutBlock({
  exercises: [
    makePrescription({ exercise_id: 'back-squat', equipment: 'barbell', session_function: 'primary', sets: 2, target_value: 5,
      load_type: 'absolute', load_value: 100, rest_seconds: SQUAT_REST }),
    makePrescription({ exercise_id: 'romanian-deadlift', equipment: 'barbell', session_function: 'accessory', sets: 3, target_value: 8,
      load_type: 'absolute', load_value: 70, rest_seconds: 60 }),
    makePrescription({ exercise_id: 'plank', ...bodyweight, session_function: 'accessory', modality: 'time', sets: 2, target_value: 30,
      rest_seconds: 30 }),
    makePrescription({ exercise_id: 'farmer-carry', equipment: 'dumbbell', session_function: 'accessory', modality: 'distance',
      distance_unit: 'm', sets: 2, target_value: 40, load_type: 'absolute', load_value: 24, rest_seconds: 45 }),
  ],
})
/** A superset: a loaded lift and a bodyweight partner, one rest after both. */
const SUPERSET = makeWorkoutBlock({
  structure_type: 'superset', rounds: 2, round_rest_seconds: PAIR_REST,
  exercises: [
    makePrescription({ exercise_id: 'bench-press', equipment: 'barbell', session_function: 'accessory', sets: 2, target_value: 8,
      load_type: 'absolute', load_value: 60, rest_seconds: 0 }),
    makePrescription({ exercise_id: 'push-up', ...bodyweight, session_function: 'accessory', sets: 2, target_value: 10, rest_seconds: 0 }),
  ],
})
/** A circuit: a loaded kettlebell and a bodyweight movement, its own rest between rounds. */
const CIRCUIT = makeWorkoutBlock({
  structure_type: 'circuit', rounds: 2, round_rest_seconds: CIRCUIT_REST,
  exercises: [
    makePrescription({ exercise_id: 'kb-swing', equipment: 'kettlebell', session_function: 'accessory', sets: 2, target_value: 15,
      load_type: 'absolute', load_value: 24, rest_seconds: null }),
    makePrescription({ exercise_id: 'mountain-climber', ...bodyweight, session_function: 'conditioning', sets: 2, target_value: 20,
      rest_seconds: null }),
  ],
})
const COOLDOWN = makeWorkoutBlock({
  exercises: [makePrescription({ exercise_id: 'childs-pose', ...bodyweight, session_function: 'recovery', sets: 1, target_value: 1,
    rest_seconds: null })],
})

function crossFamilyAcceptance(): SessionAcceptance {
  const base = peerGroupingAcceptance({ locationId: PLACE, blocks: [STANDARD, SUPERSET, CIRCUIT] })
  const [section] = base.workout.sections
  return {
    ...base,
    prompt_version: 'gallery-task-019',
    workout: {
      ...base.workout,
      title: 'Synthetic TASK-019 cross-family logging workout',
      sections: [
        { ...section, section_type: 'accessory', section_title: 'Sets and groups' },
        { section_type: 'conditioning', section_title: 'Timed', section_notes: null,
          blocks: [FORMAT_EMOM, ACTUALS_AMRAP_BLOCK, ACTUALS_FOR_TIME_BLOCK, ACTUALS_LADDER_BLOCK] },
        { section_type: 'cooldown', section_title: 'Cooldown', section_notes: null, blocks: [COOLDOWN] },
      ],
    },
  }
}

function crossFamilySession(startedAt: string): SessionSnapshot {
  return sessionSnapshotSchema.parse(formatBadgesSnapshot(crossFamilyAcceptance(), { userId: OWNER, startedAt }))
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
// The synthetic app: every original writer, observed
// ─────────────────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>
type Skin = 'clear' | 'vapour' | 'signal' | 'mono'
/** One intercepted write, by its owner's table (or rpc). */
interface Write {
  readonly method: string
  readonly table: string
  /** The row filter of a PATCH (`id`, `block_id`, `workout_exercise_id`), or null. */
  readonly filter: string | null
  readonly body: Row | null
  readonly stored: boolean
}

interface AppOptions {
  readonly skin?: Skin
  readonly reducedMotion?: boolean
  /** The cross-family session is the active one (`/workout`); otherwise `/summary` and Home. */
  readonly active?: boolean
  /** Install the page clock at the real now before the first visit. */
  readonly clock?: boolean
}

const UNIQUE_VIOLATION = { code: '23505', message: 'duplicate key value violates unique constraint', details: null }

async function syntheticApp(page: Page, options: AppOptions = {}) {
  const unexpected: string[] = []
  const writes: Write[] = []
  const attempts: SetObservationMutation[] = []
  const mutations: SetObservationMutation[] = []
  const heads = new Map<string, SetObservationAck['head']>()
  const blockRows = new Map<string, Row>()
  const movementRows = new Map<string, Row>()
  const notes = new Map<string, string | null>()
  const refuse = new Set<string>()
  const today = localDay(0)
  const yesterday = localDay(1)
  let minted = 0
  const mint = () => `00000000-0000-4000-8000-${String(1900 + (minted += 1)).padStart(12, '0')}`
  const running = crossFamilySession(new Date(Date.now() - 10 * 60_000).toISOString())
  const exercises = running.sections.flatMap((section) => section.blocks.flatMap((block) => block.exercises.map(({ exercise }) => exercise)))
  const blockIds = new Set(running.sections.flatMap((section) => section.blocks.map(({ block }) => block.id)))
  let completed: WorkoutSessionRow = workoutSessionRowSchema.parse(savedSessionRow({
    sessionId: COMPLETED, userId: OWNER, date: yesterday.date, completedAt: yesterday.instant,
  }))
  let marks: RestDayRow[] = []
  const guard = await installDeterministicCapture(page, { skin: options.skin ?? 'clear', reducedMotion: options.reducedMotion ?? false })
  if (options.clock === true) await page.clock.install()

  const refused = (table: string) => {
    if (!refuse.has(table)) return false
    refuse.delete(table)
    return true
  }
  const filterOf = (url: URL, column: string): string | null => url.searchParams.get(column)?.replace(/^eq\./, '') ?? null

  const handler = async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    const name = url.pathname.split('/').at(-1) ?? ''
    const method = request.method()
    const reply = (body: unknown, status = 200) =>
      route.fulfill({ status, headers: CORS, json: body }).catch(() => undefined)
    const refuseWith = () => reply({ code: 'PGRST000', message: 'Synthetic TASK-019 refused write.' }, 503)
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
      // Every other read is an empty answer: no anchors, favorites or history beyond this.
      return reply([])
    }
    const body = request.postData() === null ? null : (request.postDataJSON() as Row | Row[])
    const row = Array.isArray(body) ? body[0] : body

    if (name === 'block_results' && method === 'POST') {
      const stored = !refused(name)
      writes.push({ method, table: name, filter: null, body: row, stored })
      if (!stored) return refuseWith()
      const blockId = String(row?.block_id)
      if (!blockIds.has(blockId)) unexpected.push(`block_results for ${blockId}`)
      if (blockRows.has(blockId)) return reply(UNIQUE_VIOLATION, 409)
      const answered = { id: mint(), created_at: new Date().toISOString(), effort: null, elapsed_seconds: null,
        completed_under_cap: null, rounds_completed: null, partial_round_reps: null, minutes_completed: null,
        highest_rung: null, perceived_effort: null, notes: null, ...row }
      blockRows.set(blockId, answered)
      return reply([answered], 201)
    }
    if (name === 'block_results' && method === 'PATCH') {
      const blockId = filterOf(url, 'block_id')
      writes.push({ method, table: name, filter: blockId, body: row, stored: true })
      const stored = blockId === null ? undefined : blockRows.get(blockId)
      if (stored === undefined) return reply([], 200)
      const corrected = { ...stored, ...row }
      blockRows.set(blockId!, corrected)
      return reply([corrected], 200)
    }
    if (name === 'block_movement_results') {
      const exerciseId = method === 'POST' ? String(row?.workout_exercise_id) : filterOf(url, 'workout_exercise_id')
      writes.push({ method, table: name, filter: method === 'POST' ? null : exerciseId, body: row, stored: true })
      if (method === 'POST') {
        if (movementRows.has(exerciseId!)) return reply(UNIQUE_VIOLATION, 409)
        const answered = { prescription_revision_status: 'active', created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(), ...row }
        movementRows.set(exerciseId!, answered)
        return reply([answered], 201)
      }
      if (method === 'PATCH') {
        const stored = exerciseId === null ? undefined : movementRows.get(exerciseId)
        if (stored === undefined) return reply([], 200)
        const restated = { ...stored, ...row }
        movementRows.set(exerciseId!, restated)
        return reply([restated], 200)
      }
    }
    if (method === 'PATCH' && name === 'workout_exercises') {
      const id = filterOf(url, 'id')
      const exercise = exercises.find((entry) => entry.id === id)
      const stored = exercise !== undefined && !refused(name)
      writes.push({ method, table: name, filter: id, body: row, stored })
      if (!stored) return refuseWith()
      notes.set(exercise.id, row?.exercise_notes as string | null)
      return reply([{ ...exercise, exercise_notes: row?.exercise_notes }])
    }
    if (method === 'PATCH' && name === 'workout_sessions') {
      const id = filterOf(url, 'id')
      const stored = id === completed.id && !refused(name)
      writes.push({ method, table: name, filter: id, body: row, stored })
      if (!stored) return refuseWith()
      completed = workoutSessionRowSchema.parse({ ...completed, ...row })
      return reply([completed])
    }
    if (method === 'POST' && url.pathname.includes('/rpc/')) {
      if (name === 'resume_session') return reply(options.active === false ? null : running)
      if (name === 'session_snapshot') return reply(running)
      if (name === 'session_as_performed') {
        if (options.active === false) return reply(null)
        return reply({
          reconstruction: 'performed',
          as_of: running.session.started_at,
          session: running.session,
          state: running.state,
          sections: running.sections.map((section) => ({
            ...section,
            blocks: section.blocks.map((block) => ({
              ...block,
              block_result: blockRows.get(block.block.id) ?? null,
              exercises: block.exercises.map((entry) => ({ ...entry, movement_result: movementRows.get(entry.exercise.id) ?? null })),
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
        attempts.push(mutation)
        const previous = heads.get(mutation.observation_id)
        if (previous?.mutation_id === mutation.mutation_id) return reply({ outcome: 'replayed', mutation, head: previous })
        if (refused(name)) return refuseWith()
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
        const stored = !refused(name)
        writes.push({ method, table: name, filter: null, body: row, stored })
        if (!stored) return refuseWith()
        const at = new Date().toISOString()
        const mark = restDayRowSchema.parse({
          id: '00000000-0000-4000-8000-000000001931', user_id: OWNER, day: row?.p_day, reason: row?.p_reason,
          note: row?.p_note ?? null, created_at: at, updated_at: at,
        })
        marks = [mark, ...marks.filter((entry) => entry.day !== mark.day)]
        return reply(mark)
      }
      if (['constraints_in_force', 'anchor_evidence', 'conditioning_history', 'generation_refusal_diagnostics',
        'generation_candidate_sets_for_goal', 'generation_candidate_sets'].includes(name)) return reply([])
    }
    // Anything else is a write no logging moment owns.
    unexpected.push(`${method} ${url.pathname}`)
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic TASK-019 request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ owner }) => {
    localStorage.setItem('clear.auth.session', JSON.stringify({
      accessToken: 'synthetic-task-019-session', refreshToken: 'synthetic-task-019-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-task-019@example.invalid' },
    }))
  }, { owner: OWNER })

  /** `workout_exercises.id` by section index and catalog id. */
  const exerciseId = (section: number, catalogId: string): string => {
    const found = running.sections[section].blocks.flatMap((block) => block.exercises)
      .find(({ exercise }) => exercise.exercise_id === catalogId)
    if (found === undefined) throw new Error(`no ${catalogId} in section ${section}`)
    return found.exercise.id
  }
  return {
    writes, attempts, mutations, today,
    blockIds: running.sections.map((section) => section.blocks.map(({ block }) => block.id)),
    exerciseId,
    blockRow: (blockId: string) => blockRows.get(blockId) ?? null,
    movementRow: (id: string) => movementRows.get(id) ?? null,
    /** The next write to this table (or rpc) is refused once. */
    refuseNext(table: string) { refuse.add(table) },
    /** Every write except set observations, by table. */
    tables: () => writes.map((write) => write.table),
    assertContained() {
      expect(unexpected, 'Every API request has an explicit synthetic disposition').toEqual([])
      expect(guard.blockedGenerations()).toBe(0)
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Reading the screen
// ─────────────────────────────────────────────────────────────────────────────

const content = (page: Page) => page.locator('main#main > .clr-scroll-region > .clr-scroll-region__scroller')
/** The open focused logging dialog (any title). */
const openLog = (page: Page) => page.locator('dialog.clr-accepted-log[open]')
/** The session's one rest, wherever it is drawn (footer or open log). */
const restBars = (page: Page) => page.getByRole('region', { name: 'Rest', exact: true })
/** Every countdown named as a rest's remaining time on the page. */
const restTimers = (page: Page) => page.getByRole('timer', { name: 'Time remaining', exact: true })

/** One movement's own section, by its heading, on the main screen. */
function movement(page: Page, name: string): Locator {
  return content(page).locator('section').filter({ has: page.getByRole('heading', { name, exact: true }) }).last()
}
/** A grouped or timed card by the list that names its work. */
function cardOf(page: Page, list: string): Locator {
  return content(page).locator('.clr-card').filter({ has: page.getByRole('list', { name: list, exact: true }) }).last()
}
/** A timed card (the live workout card) by its work list. */
function timedCard(page: Page, list: string): Locator {
  return page.locator('[data-workout-card="workout"]').filter({ has: page.getByRole('list', { name: list, exact: true }) })
}
const timedOpener = (card: Locator) => card.locator('[data-timed-log-opener]').getByRole('button', { name: LOG_RESULTS, exact: true })
const roundClock = (card: Locator) => card.getByRole('group', { name: 'Round clock', exact: true })
/** The stack beside a timed card: its block clock. */
const clockOf = (card: Locator) => card.locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " clr-stack ")][1]').getByRole('timer').first()

function seconds(text: string | null): number {
  const digits = /(\d\d):(\d\d)/.exec(text ?? '')
  if (digits === null) throw new Error(`no clock digits in ${text}`)
  return Number(digits[1]) * 60 + Number(digits[2])
}

async function restRemaining(page: Page): Promise<number> {
  await expect(restBars(page)).toHaveCount(1)
  return seconds(await restBars(page).getByRole('timer', { name: 'Time remaining' }).textContent())
}

/** What every moment's chrome must read identically. */
interface Chrome {
  readonly frame: string
  readonly closeClasses: string
  readonly closeSize: string
  readonly backdrop: string
  readonly bleed: boolean
  readonly glyph: boolean
}

/**
 * The selected focused interaction, open over an inert screen: the native
 * modal named by its one title, the framed icon-only "Close log" X in its
 * header, focused first, the Balanced backdrop, no half-sheet, and nothing
 * behind it reachable. Returns the dialog and its chrome signature so one
 * case can compare moments of different families.
 */
async function expectFocusedLog(page: Page, title: string, { focusX = true }: { focusX?: boolean } = {}) {
  const dialog = page.getByRole('dialog', { name: title, exact: true })
  await expect(dialog).toBeVisible()
  await expect(openLog(page)).toHaveCount(1)
  expect(await dialog.evaluate((node) => node.matches(':modal'))).toBe(true)
  const head = dialog.locator('[data-logging-head]')
  await expect(head.getByRole('heading', { name: title, exact: true })).toBeVisible()
  // One title: the header holds one heading, and nothing else in the log
  // repeats it (a timed log's movement groups keep their own lower headings).
  await expect(head.getByRole('heading')).toHaveCount(1)
  await expect(dialog.getByRole('heading', { name: title, exact: true })).toHaveCount(1)
  const close = head.getByRole('button', { name: 'Close log', exact: true })
  await expect(close).toBeVisible()
  if (focusX) await expect(close).toBeFocused()
  expect((await close.textContent())?.trim()).toBe('')
  await expect(dialog.getByRole('button', { name: 'Close log' })).toHaveCount(1)
  await expect(page.getByRole('button', { name: /^Minimi[sz]e$/ })).toHaveCount(0)
  await expect(page.locator('section.clr-set-sheet')).toHaveCount(0)
  await expect(page.locator('.clr-set-sheet-layer[data-open]')).toHaveCount(0)
  const chrome: Chrome = await close.evaluate((node) => {
    const dialogNode = node.closest('dialog')!
    const box = node.getBoundingClientRect()
    return {
      frame: [...dialogNode.classList].sort().join(' '),
      closeClasses: [...node.classList].sort().join(' '),
      closeSize: `${Math.round(box.width)}x${Math.round(box.height)}`,
      backdrop: getComputedStyle(dialogNode, '::backdrop').backdropFilter,
      bleed: node.parentElement?.classList.contains('clr-bleed') ?? false,
      glyph: node.querySelector('svg') !== null,
    }
  })
  expect(chrome.closeClasses).toMatch(/\bclr-chamfer\b/)
  expect(chrome.closeClasses).toMatch(/\bclr-btn\b/)
  expect(chrome.closeClasses).not.toMatch(/\bclr-btn--quiet\b/)
  expect(chrome.bleed && chrome.glyph).toBe(true)
  expect(chrome.backdrop).toMatch(/blur\(/)
  // Inert behind: no control of the screen can take focus while it is open.
  const behind = await page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null
    const controls = [...document.querySelectorAll<HTMLElement>(
      'main#main button, main#main input, main#main textarea, main#main select, .clr-workout-footer button')]
    const reachable = controls.filter((control) => {
      control.focus()
      return document.activeElement === control
    }).map((control) => control.getAttribute('aria-label') ?? control.textContent ?? control.tagName)
    active?.focus()
    return reachable
  })
  expect(behind).toEqual([])
  return { dialog, chrome }
}

/** Close by the X (tap or click) and expect focus back on the opener. */
async function closeByX(page: Page, opener: Locator, how: 'tap' | 'click' = 'click') {
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

/**
 * After a refusal answered in place, keyboard focus is still in the open log
 * — on its title (a programmatic target) when the control that had it went
 * away — never stranded on the inert page; one Tab then reaches a control.
 */
async function expectFocusKept(page: Page, dialog: Locator, title: string) {
  await expect(dialog.getByRole('heading', { name: title, exact: true })).toBeFocused()
  await page.keyboard.press('Tab')
  expect(await dialog.evaluate((node) => node.contains(document.activeElement) && document.activeElement !== node
    && document.activeElement?.matches('button, input, select, textarea'))).toBe(true)
}

/** Reduced motion: nothing in the open log moves or loops beyond a hard cut. */
async function expectHardCut(dialog: Locator) {
  const timings = await dialog.evaluate((node) => node.getAnimations({ subtree: true }).map((animation) => {
    const timing = animation.effect!.getComputedTiming()
    return { duration: Number(timing.duration), iterations: Number(timing.iterations) }
  }))
  for (const timing of timings) {
    expect(timing.duration, JSON.stringify(timings)).toBeLessThanOrEqual(0.01)
    expect(timing.iterations, JSON.stringify(timings)).toBeLessThanOrEqual(1)
  }
}

async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
}

async function attachScreen(page: Page, name: string) {
  await test.info().attach(`${name}.png`, { body: await page.screenshot({ animations: 'disabled', caret: 'hide' }), contentType: 'image/png' })
}

async function chosen(group: Locator): Promise<string[]> {
  return group.getByRole('radio').evaluateAll((radios) =>
    radios.filter((radio) => radio.getAttribute('aria-checked') === 'true').map((radio) => radio.textContent ?? ''))
}

// ─────────────────────────────────────────────────────────────────────────────
// The proof
// ─────────────────────────────────────────────────────────────────────────────

test.describe('TASK-019 every logging moment in the shared focused interaction', () => {
  test('JOURNEY-019 set, group and note moments on one /workout phone-390 touch: anchor, other lift, timed and distance movement, extra set, saved-set correction, superset round, circuit round, circuit movement and movement note open the same focused log, keep their own fields and drafts through close and reopen, write only through their original writers and never draw a second rest', async ({ page, visit, checkA11y }) => {
    test.setTimeout(240_000)
    await page.setViewportSize({ width: 390, height: 844 })
    const app = await syntheticApp(page, { clock: true })
    await visit('/workout')
    await expect(page.getByRole('heading', { level: 1, name: 'Workout', exact: true })).toBeVisible()
    const chromes: Record<string, Chrome> = {}
    const SQUAT = app.exerciseId(0, 'back-squat')

    // ── 1. Anchor / primary lift ──
    const squat = movement(page, 'back squat')
    const squatRest = squat.getByRole('button', { name: 'Rest', exact: true })
    await squatRest.tap()
    let log = await expectFocusedLog(page, 'Log set 1')
    chromes.anchor = log.chrome
    const form = log.dialog.getByRole('form', { name: 'Log set 1 of back squat' })
    await expect(form.getByLabel('Weight')).toBeVisible()
    await expect(form.getByRole('combobox', { name: 'Unit' })).toBeVisible()
    await expect(form.getByLabel('Reps')).toHaveValue('5')
    await expect(form.getByRole('group', { name: 'Effort' })).toBeVisible()
    await expect(form.getByRole('checkbox', { name: 'Performed' })).toHaveCount(0)
    await expect(form.getByLabel(/notes/i)).toHaveCount(0)
    // The session's one rest, in the log; none behind it.
    await expect(restBars(page)).toHaveCount(1)
    await expect(log.dialog.getByRole('region', { name: 'Rest', exact: true })).toBeVisible()
    await noHorizontalOverflow(page)
    await form.getByLabel('Weight').fill('100')
    await form.getByLabel('Reps').fill('4')
    await form.getByRole('radio', { name: 'About right' }).check()
    await closeByX(page, squatRest, 'tap')
    await squatRest.tap()
    log = await expectFocusedLog(page, 'Log set 1')
    await expect(log.dialog.getByLabel('Weight')).toHaveValue('100')
    await expect(log.dialog.getByLabel('Reps')).toHaveValue('4')
    await closeByEscape(page, squatRest)
    expect(app.attempts).toHaveLength(0)
    await squatRest.tap()
    log = await expectFocusedLog(page, 'Log set 1')
    await expect(log.dialog.getByRole('radio', { name: 'About right' })).toBeChecked()
    await log.dialog.getByRole('button', { name: 'Log set 1', exact: true }).tap()
    log = await expectFocusedLog(page, 'Set 1 logged', { focusX: false })
    await expect.poll(() => app.mutations.length).toBe(1)
    expect(app.mutations[0]).toMatchObject({ operation: 'insert', exercise_id: SQUAT, set_number: 1,
      values: { weight: 100, actual_reps: 4, effort: 'about_right' } })
    await expect(log.dialog.locator('.clr-set-log > [role="status"]')).toContainText('Set 1 · 4 reps · 100 kg')
    await expect(log.dialog.locator('.clr-set-log > [role="status"]')).toContainText('Saved')
    await expect(restBars(page)).toHaveCount(1)
    await closeByX(page, squatRest, 'tap')
    await expect(restBars(page)).toHaveCount(1)
    await checkA11y()

    // ── 2. Movement note: another family over the running rest ──
    const running = await restRemaining(page)
    await squat.getByRole('button', { name: 'Coaching and notes — back squat', exact: true }).tap()
    const addNote = squat.getByRole('button', { name: 'Add note — back squat', exact: true })
    await addNote.tap()
    log = await expectFocusedLog(page, 'Notes — back squat')
    chromes.note = log.chrome
    await expect(log.dialog.getByRole('textbox', { name: 'Notes — back squat' })).toHaveValue('')
    await expect(log.dialog.getByLabel('Weight')).toHaveCount(0)
    await expect(log.dialog.getByRole('group', { name: 'Effort' })).toHaveCount(0)
    // The note does not draw or own the rest: still one, behind it, counting.
    await expect(restBars(page)).toHaveCount(1)
    await expect(log.dialog.getByRole('region', { name: 'Rest', exact: true })).toHaveCount(0)
    await page.clock.runFor(3_000)
    expect(await restRemaining(page)).toBeLessThan(running)
    await log.dialog.getByRole('textbox', { name: 'Notes — back squat' }).fill('Brace before the descent')
    const editNote = squat.getByRole('button', { name: 'Edit note — back squat', exact: true })
    await log.dialog.getByRole('button', { name: 'Close log', exact: true }).tap()
    await expect(openLog(page)).toHaveCount(0)
    await expect(editNote).toBeFocused()
    await editNote.tap()
    log = await expectFocusedLog(page, 'Notes — back squat')
    await expect(log.dialog.getByRole('textbox', { name: 'Notes — back squat' })).toHaveValue('Brace before the descent')
    await log.dialog.getByRole('button', { name: 'Save note — back squat', exact: true }).tap()
    await expect(log.dialog.getByRole('status').filter({ hasText: 'Note saved' })).toHaveCount(1)
    await closeByEscape(page, editNote)
    expect(app.writes).toEqual([{ method: 'PATCH', table: 'workout_exercises', filter: SQUAT,
      body: { exercise_notes: 'Brace before the descent' }, stored: true }])
    // A note is not performed work: no set, no block row.
    expect(app.mutations).toHaveLength(1)

    // ── 3. Other lift: its own Rest replaces the rest; still one ──
    const rdl = movement(page, 'romanian deadlift').getByRole('button', { name: 'Rest', exact: true })
    await rdl.tap()
    log = await expectFocusedLog(page, 'Log set 1')
    chromes['other-lift'] = log.chrome
    await expect(log.dialog.getByText(/^romanian deadlift · /)).toBeVisible()
    await expect(restBars(page)).toHaveCount(1)
    await log.dialog.getByLabel('Weight').fill('70')
    await log.dialog.getByRole('combobox', { name: 'Unit' }).selectOption('lb')
    await closeByX(page, rdl, 'tap')
    await rdl.tap()
    log = await expectFocusedLog(page, 'Log set 1')
    await expect(log.dialog.getByLabel('Weight')).toHaveValue('70')
    await expect(log.dialog.getByRole('combobox', { name: 'Unit' })).toHaveValue('lb')
    await log.dialog.getByRole('button', { name: 'Log set 1', exact: true }).tap()
    await expectFocusedLog(page, 'Set 1 logged', { focusX: false })
    await expect.poll(() => app.mutations.length).toBe(2)
    expect(app.mutations[1]).toMatchObject({ operation: 'insert', exercise_id: app.exerciseId(0, 'romanian-deadlift'), set_number: 1,
      values: { weight: 70, weight_unit: 'lb', actual_reps: 8 } })
    await closeByX(page, rdl, 'tap')

    // ── 4. Timed movement: Seconds, no load for the unloaded plank ──
    const plank = movement(page, 'plank').getByRole('button', { name: 'Rest', exact: true })
    await plank.tap()
    log = await expectFocusedLog(page, 'Log set 1')
    chromes['timed-movement'] = log.chrome
    await expect(log.dialog.getByLabel('Seconds')).toHaveValue('30')
    await expect(log.dialog.getByLabel('Weight')).toHaveCount(0)
    await expect(log.dialog.getByLabel('Reps')).toHaveCount(0)
    await log.dialog.getByLabel('Seconds').fill('28')
    await closeByEscape(page, plank)
    await plank.tap()
    log = await expectFocusedLog(page, 'Log set 1')
    await expect(log.dialog.getByLabel('Seconds')).toHaveValue('28')
    await log.dialog.getByRole('button', { name: 'Log set 1', exact: true }).tap()
    await expectFocusedLog(page, 'Set 1 logged', { focusX: false })
    await expect.poll(() => app.mutations.length).toBe(3)
    expect(app.mutations[2]).toMatchObject({ exercise_id: app.exerciseId(0, 'plank'), set_number: 1,
      values: { actual_duration_seconds: 28, actual_reps: null, weight: null } })
    await closeByX(page, plank, 'tap')

    // ── 5. Distance movement: Weight, Unit and Distance ──
    const carry = movement(page, 'farmer carry').getByRole('button', { name: 'Rest', exact: true })
    await carry.tap()
    log = await expectFocusedLog(page, 'Log set 1')
    chromes['distance-movement'] = log.chrome
    await expect(log.dialog.getByLabel('Distance (m)')).toHaveValue('')
    await log.dialog.getByLabel('Weight').fill('24')
    await log.dialog.getByLabel('Distance (m)').fill('35')
    await closeByX(page, carry, 'tap')
    await carry.tap()
    log = await expectFocusedLog(page, 'Log set 1')
    await expect(log.dialog.getByLabel('Distance (m)')).toHaveValue('35')
    await log.dialog.getByRole('button', { name: 'Log set 1', exact: true }).tap()
    await expectFocusedLog(page, 'Set 1 logged', { focusX: false })
    await expect.poll(() => app.mutations.length).toBe(4)
    expect(app.mutations[3]).toMatchObject({ exercise_id: app.exerciseId(0, 'farmer-carry'), set_number: 1,
      values: { actual_distance: 35, actual_distance_unit: 'm', weight: 24, actual_reps: null } })
    await expect(restBars(page)).toHaveCount(1)
    await closeByX(page, carry, 'tap')

    // ── 6. Extra set: the squat's set 2, then Extra set 3 ──
    await squatRest.tap()
    log = await expectFocusedLog(page, 'Log set 2')
    await log.dialog.getByRole('button', { name: 'Log set 2', exact: true }).tap()
    await expectFocusedLog(page, 'Set 2 logged', { focusX: false })
    await expect.poll(() => app.mutations.length).toBe(5)
    await closeByX(page, squatRest, 'tap')
    await expect(squat.getByText('Extra set 3', { exact: true })).toBeVisible()
    await squatRest.tap()
    log = await expectFocusedLog(page, 'Log set 3')
    chromes['extra-set'] = log.chrome
    await log.dialog.getByLabel('Reps').fill('3')
    await closeByEscape(page, squatRest)
    await squatRest.tap()
    log = await expectFocusedLog(page, 'Log set 3')
    await expect(log.dialog.getByLabel('Reps')).toHaveValue('3')
    await log.dialog.getByRole('button', { name: 'Log set 3', exact: true }).tap()
    await expectFocusedLog(page, 'Set 3 logged', { focusX: false })
    await expect.poll(() => app.mutations.length).toBe(6)
    expect(app.mutations[5]).toMatchObject({ operation: 'insert', exercise_id: SQUAT, set_number: 3, values: { actual_reps: 3 } })
    await closeByX(page, squatRest, 'tap')

    // ── 7. Saved-set correction: the same row, corrected ──
    const editSet = squat.getByRole('button', { name: 'Edit set 1' })
    await editSet.tap()
    log = await expectFocusedLog(page, 'Edit set 1')
    chromes['set-correction'] = log.chrome
    await expect(log.dialog.getByLabel('Reps')).toHaveValue('4')
    await expect(log.dialog.getByRole('button', { name: 'Save correction' })).toBeVisible()
    await expect(log.dialog.getByRole('button', { name: 'Clear set 1' })).toBeVisible()
    await log.dialog.getByLabel('Reps').fill('5')
    await closeByX(page, editSet, 'tap')
    await editSet.tap()
    log = await expectFocusedLog(page, 'Edit set 1')
    await expect(log.dialog.getByLabel('Reps')).toHaveValue('5')
    await log.dialog.getByRole('button', { name: 'Save correction' }).tap()
    await expect.poll(() => app.mutations.length).toBe(7)
    expect(app.mutations[6]).toMatchObject({ operation: 'correct', observation_id: app.mutations[0].observation_id, set_number: 1,
      values: { actual_reps: 5, weight: 100 } })
    // The standard logger moves on to its next entry; closing that one
    // returns to the movement's Rest, the entry's own action.
    await expectFocusedLog(page, 'Log set 4', { focusX: false })
    await closeByX(page, squatRest, 'tap')
    await expect(squat.getByRole('list', { name: 'Logged sets' })).toContainText('Set 1 · 5 reps · 100 kg')

    // ── 8. Superset round: the rest already running is the one it shows;
    // the round starts no second clock beside it ──
    const pair = cardOf(page, 'Movements in this superset')
    const pairRest = pair.getByRole('button', { name: 'Rest', exact: true })
    await pairRest.scrollIntoViewIfNeeded()
    await pairRest.tap()
    log = await expectFocusedLog(page, 'Log round 1')
    chromes.superset = log.chrome
    await expect(restBars(page)).toHaveCount(1)
    await expect(restTimers(page)).toHaveCount(1)
    await expect(log.dialog.getByRole('region', { name: 'Rest', exact: true })).toContainText('Rest after back squat')
    const bench = log.dialog.getByRole('group', { name: 'A1 bench press, set 1' })
    const pushUp = log.dialog.getByRole('group', { name: 'A2 push up, set 1' })
    await expect(bench.getByRole('checkbox', { name: 'Performed' })).not.toBeChecked()
    await expect(pushUp.getByLabel('Weight')).toHaveCount(0)
    await bench.getByLabel('Reps').fill('7')
    await expect(bench.getByRole('checkbox', { name: 'Performed' })).toBeChecked()
    await closeByX(page, pairRest, 'tap')
    await pairRest.tap()
    log = await expectFocusedLog(page, 'Log round 1')
    await expect(log.dialog.getByRole('group', { name: 'A1 bench press, set 1' }).getByLabel('Reps')).toHaveValue('7')
    await expect(log.dialog.getByRole('group', { name: 'A2 push up, set 1' }).getByRole('checkbox', { name: 'Performed' })).not.toBeChecked()
    await log.dialog.getByRole('button', { name: 'Log round 1', exact: true }).tap()
    await expectFocusedLog(page, 'Round 1 logged', { focusX: false })
    await expect.poll(() => app.mutations.length).toBe(8)
    expect(app.mutations[7]).toMatchObject({ operation: 'insert', exercise_id: app.exerciseId(0, 'bench-press'), set_number: 1,
      values: { actual_reps: 7 } })
    expect(app.attempts.some((attempt) => attempt.exercise_id === app.exerciseId(0, 'push-up'))).toBe(false)
    await closeByX(page, pairRest, 'tap')
    await expect(restBars(page)).toHaveCount(1)

    // ── 9. Circuit round: Round N recorded with its own rest, Take back ──
    const circuit = cardOf(page, 'Movements in this circuit')
    await roundClock(circuit).scrollIntoViewIfNeeded()
    await roundClock(circuit).getByRole('button', { name: 'Start round 1', exact: true }).tap()
    await page.clock.runFor(30_000)
    const finish = roundClock(circuit).getByRole('button', { name: 'Finish round 1', exact: true })
    await finish.tap()
    log = await expectFocusedLog(page, 'Round 1 recorded')
    chromes['circuit-round'] = log.chrome
    await expect(log.dialog.getByRole('status')).toContainText('round time recorded')
    await expect(log.dialog.getByText('Rest after round 1', { exact: true })).toBeVisible()
    await expect(log.dialog.getByRole('button', { name: 'Take back this round', exact: true })).toBeVisible()
    // Its fields are the round's own: no guessed movement actuals.
    await expect(log.dialog.getByRole('textbox')).toHaveCount(0)
    await expect(log.dialog.getByRole('spinbutton')).toHaveCount(0)
    // C21 keeps the circuit's rest between rounds a distinct clock from the
    // session's one rest between sets (still running from the squat). Each is
    // drawn exactly once: the circuit's in this log (moved off its card), the
    // session's behind it — never a copy of either.
    await expect(log.dialog.getByRole('timer', { name: 'Time remaining', exact: true })).toHaveCount(1)
    await expect(restBars(page)).toHaveCount(1)
    await expect(log.dialog.getByRole('region', { name: 'Rest', exact: true })).toHaveCount(0)
    await expect(restTimers(page)).toHaveCount(2)
    await attachScreen(page, 'circuit-round-over-session-rest-phone-390')
    await page.keyboard.press('Escape')
    await expect(openLog(page)).toHaveCount(0)
    await expect(app.writes.filter((write) => write.table === 'block_results')).toHaveLength(0)

    // ── 10. Circuit movement entry: its own actual entry, no round, no rest ──
    const swingRest = circuit.getByRole('button', { name: 'Rest for kb swing', exact: true })
    await swingRest.tap()
    log = await expectFocusedLog(page, 'Log set 1')
    chromes['circuit-movement'] = log.chrome
    const entry = log.dialog.getByRole('form', { name: 'Log set 1 of kb swing' })
    await expect(entry.getByLabel('Weight')).toBeVisible()
    await expect(entry.getByRole('checkbox', { name: 'Performed' })).toHaveCount(0)
    // No movement rest is invented (none is prescribed): the session's one
    // running rest is the one the log shows, moved in from the footer.
    await expect(restBars(page)).toHaveCount(1)
    await expect(log.dialog.getByRole('region', { name: 'Rest', exact: true })).toContainText('Rest after back squat')
    await entry.getByLabel('Weight').fill('20')
    await entry.getByLabel('Reps').fill('14')
    const entryRest = circuit.getByRole('button', { name: 'Rest', exact: true })
    await log.dialog.getByRole('button', { name: 'Close log', exact: true }).tap()
    await expect(openLog(page)).toHaveCount(0)
    await expect(entryRest).toBeFocused()
    await entryRest.tap()
    log = await expectFocusedLog(page, 'Log set 1')
    await expect(log.dialog.getByLabel('Weight')).toHaveValue('20')
    await expect(log.dialog.getByLabel('Reps')).toHaveValue('14')
    await log.dialog.getByRole('button', { name: 'Log set 1', exact: true }).tap()
    await expectFocusedLog(page, 'Set 1 logged', { focusX: false })
    await expect.poll(() => app.mutations.length).toBe(9)
    expect(app.mutations[8]).toMatchObject({ operation: 'insert', exercise_id: app.exerciseId(0, 'kb-swing'), set_number: 1,
      values: { weight: 20, actual_reps: 14 } })
    await closeByX(page, entryRest, 'tap')

    // ── One chrome across the ten moments ──
    const signatures = new Set(Object.values(chromes).map((chrome) => JSON.stringify(chrome)))
    expect([...signatures], JSON.stringify(chromes, null, 2)).toHaveLength(1)

    // ── Ownership at the section's forward action: each block its own row ──
    await page.getByRole('button', { name: 'Next section', exact: true }).tap()
    await expect.poll(() => app.writes.filter((write) => write.table === 'block_results').length).toBe(3)
    const [standardId, supersetId, circuitId] = app.blockIds[0]
    expect(new Set(app.writes.filter((write) => write.table === 'block_results').map((write) => write.body?.block_id)))
      .toEqual(new Set([standardId, supersetId, circuitId]))
    expect(app.blockRow(circuitId)).toMatchObject({ rounds_completed: 1 })
    // Each set-family write is a set observation; notes the movement row; nothing else.
    expect(new Set(app.tables())).toEqual(new Set(['workout_exercises', 'block_results']))
    expect(app.writes.filter((write) => write.table === 'block_movement_results')).toHaveLength(0)
    app.assertContained()
  })

  test('JOURNEY-019 errors and retry by keyboard phone-320 reduced motion: a refused set, superset round, circuit movement, note and circuit block write each keep their entry and retry it once under the same identity, every moment opens and closes from the keyboard with focus back on its own control, and nothing animates beyond a hard cut', async ({ page, visit, checkA11y }) => {
    test.setTimeout(240_000)
    await page.setViewportSize({ width: 320, height: 568 })
    const app = await syntheticApp(page, { reducedMotion: true, clock: true })
    await visit('/workout')
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)
    const press = async (control: Locator, key = 'Enter') => {
      await control.focus()
      await page.keyboard.press(key)
    }
    /** From the X, one Tab stays inside the open log. */
    const tabStaysInside = async (dialog: Locator) => {
      await page.keyboard.press('Tab')
      expect(await dialog.evaluate((node) => node.contains(document.activeElement) && document.activeElement !== node)).toBe(true)
    }
    const SQUAT = app.exerciseId(0, 'back-squat')

    // ── Anchor: a refused set is held on this device, retried under its own id ──
    const squat = movement(page, 'back squat')
    const squatRest = squat.getByRole('button', { name: 'Rest', exact: true })
    await press(squatRest)
    let log = await expectFocusedLog(page, 'Log set 1')
    await expectHardCut(log.dialog)
    await tabStaysInside(log.dialog)
    await log.dialog.getByLabel('Weight').fill('80')
    await log.dialog.getByLabel('Reps').fill('6')
    app.refuseNext('mutate_set_observation')
    await press(log.dialog.getByLabel('Reps'))
    log = await expectFocusedLog(page, 'Set 1 logged', { focusX: false })
    await expect(log.dialog.getByRole('heading', { name: 'Set 1 logged', exact: true })).toBeFocused()
    const setStatus = log.dialog.locator('.clr-set-log > [role="status"]')
    await expect(setStatus).toContainText('On this device only')
    await expect(setStatus).not.toContainText('Saved')
    expect(app.mutations).toHaveLength(0)
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    await expect(setStatus).toContainText('Saved')
    expect(app.mutations).toHaveLength(1)
    expect(app.attempts).toHaveLength(2)
    expect(app.attempts[1]).toEqual(app.attempts[0])
    expect(app.mutations[0]).toMatchObject({ operation: 'insert', exercise_id: SQUAT, set_number: 1, values: { weight: 80, actual_reps: 6 } })
    await closeByEscape(page, squatRest)

    // ── Correction: Edit opens it; Escape returns focus to that Edit ──
    const editSet = squat.getByRole('button', { name: 'Edit set 1' })
    await press(editSet)
    log = await expectFocusedLog(page, 'Edit set 1')
    await expectHardCut(log.dialog)
    await log.dialog.getByLabel('Reps').fill('5')
    await closeByEscape(page, editSet)
    await page.keyboard.press('Enter')
    log = await expectFocusedLog(page, 'Edit set 1')
    await expect(log.dialog.getByLabel('Reps')).toHaveValue('5')
    await closeByX(page, editSet)
    expect(app.mutations).toHaveLength(1)

    // ── Movement note: a refused write keeps the text; the retry stores it ──
    await press(squat.getByRole('button', { name: 'Coaching and notes — back squat', exact: true }))
    const addNote = squat.getByRole('button', { name: 'Add note — back squat', exact: true })
    await press(addNote)
    log = await expectFocusedLog(page, 'Notes — back squat')
    await expectHardCut(log.dialog)
    await tabStaysInside(log.dialog)
    await log.dialog.getByRole('textbox', { name: 'Notes — back squat' }).fill('Knees out')
    app.refuseNext('workout_exercises')
    await press(log.dialog.getByRole('button', { name: 'Save note — back squat', exact: true }))
    await expect(log.dialog.getByText('Your note didn’t save. It is still in the field — try again.')).toBeVisible()
    await expect(log.dialog.getByRole('textbox', { name: /^Notes — back squat/ })).toHaveValue('Knees out')
    await expectFocusKept(page, log.dialog, 'Notes — back squat')
    const editNote = squat.getByRole('button', { name: 'Edit note — back squat', exact: true })
    await closeByEscape(page, editNote)
    await expect(squat.getByRole('status').filter({ hasText: 'Not saved' })).toHaveCount(1)
    await page.keyboard.press('Enter')
    log = await expectFocusedLog(page, 'Notes — back squat')
    await expect(log.dialog.getByRole('textbox', { name: /^Notes — back squat/ })).toHaveValue('Knees out')
    await press(log.dialog.getByRole('button', { name: 'Save note — back squat', exact: true }))
    await expect(log.dialog.getByRole('status').filter({ hasText: 'Note saved' })).toHaveCount(1)
    await closeByEscape(page, editNote)
    expect(app.writes).toEqual([
      { method: 'PATCH', table: 'workout_exercises', filter: SQUAT, body: { exercise_notes: 'Knees out' }, stored: false },
      { method: 'PATCH', table: 'workout_exercises', filter: SQUAT, body: { exercise_notes: 'Knees out' }, stored: true },
    ])

    // ── Superset round: refused, held, retried; only the Performed movement ──
    const pair = cardOf(page, 'Movements in this superset')
    const pairRest = pair.getByRole('button', { name: 'Rest', exact: true })
    await press(pairRest)
    log = await expectFocusedLog(page, 'Log round 1')
    await expectHardCut(log.dialog)
    await tabStaysInside(log.dialog)
    const bench = log.dialog.getByRole('group', { name: 'A1 bench press, set 1' })
    await bench.getByLabel('Reps').fill('6')
    app.refuseNext('mutate_set_observation')
    await press(log.dialog.getByRole('button', { name: 'Log round 1', exact: true }))
    log = await expectFocusedLog(page, 'Round 1 logged', { focusX: false })
    const roundStatus = log.dialog.locator('.clr-set-log > [role="status"]')
    await expect(roundStatus).toContainText('On this device only')
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    await expect(roundStatus).toContainText('Saved')
    await expect.poll(() => app.mutations.length).toBe(2)
    expect(app.attempts.at(-1)).toEqual(app.attempts.at(-2))
    expect(app.mutations[1]).toMatchObject({ operation: 'insert', exercise_id: app.exerciseId(0, 'bench-press'), set_number: 1,
      values: { actual_reps: 6 } })
    expect(app.attempts.some((attempt) => attempt.exercise_id === app.exerciseId(0, 'push-up'))).toBe(false)
    await closeByEscape(page, pairRest)

    // ── Circuit round: by keyboard; focus returns to the round clock ──
    const circuit = cardOf(page, 'Movements in this circuit')
    await press(roundClock(circuit).getByRole('button', { name: 'Start round 1', exact: true }))
    await page.clock.runFor(20_000)
    await press(roundClock(circuit).getByRole('button', { name: 'Finish round 1', exact: true }))
    log = await expectFocusedLog(page, 'Round 1 recorded')
    await expectHardCut(log.dialog)
    await page.keyboard.press('Escape')
    await expect(openLog(page)).toHaveCount(0)
    expect(await roundClock(circuit).evaluate((node) => node.contains(document.activeElement))).toBe(true)
    await expect(roundClock(circuit).getByRole('status')).toHaveText('1 of 2 rounds recorded')

    // ── Circuit movement: refused, held, retried; a set is not a round ──
    await press(circuit.getByRole('button', { name: 'Rest for kb swing', exact: true }))
    log = await expectFocusedLog(page, 'Log set 1')
    await expectHardCut(log.dialog)
    await log.dialog.getByLabel('Weight').fill('20')
    app.refuseNext('mutate_set_observation')
    await press(log.dialog.getByRole('button', { name: 'Log set 1', exact: true }))
    log = await expectFocusedLog(page, 'Set 1 logged', { focusX: false })
    const entryStatus = log.dialog.locator('.clr-set-log > [role="status"]')
    await expect(entryStatus).toContainText('On this device only')
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    await expect(entryStatus).toContainText('Saved')
    await expect.poll(() => app.mutations.length).toBe(3)
    expect(app.mutations[2]).toMatchObject({ operation: 'insert', exercise_id: app.exerciseId(0, 'kb-swing'), set_number: 1,
      values: { weight: 20 } })
    await closeByEscape(page, circuit.getByRole('button', { name: 'Rest', exact: true }))
    await expect(roundClock(circuit).getByRole('status')).toHaveText('1 of 2 rounds recorded')
    await checkA11y()

    // ── The section's forward action: a refused block write keeps the
    // recorded round and every logged set; the retry writes each block once ──
    app.refuseNext('block_results')
    await press(page.getByRole('button', { name: 'Next section', exact: true }))
    const failed = page.getByRole('dialog', { name: /didn’t save/ })
    await expect(failed).toBeVisible()
    await press(failed.getByRole('button', { name: 'Close', exact: true }))
    await expect(failed).toHaveCount(0)
    await expect(roundClock(circuit).getByRole('status')).toHaveText('1 of 2 rounds recorded')
    await expect(squat.getByRole('list', { name: 'Logged sets' }).getByRole('listitem')).toHaveCount(1)
    await press(page.getByRole('button', { name: 'Next section', exact: true }))
    await expect(page.getByRole('heading', { name: 'Conditioning', exact: true })).toBeVisible()
    const blockWrites = app.writes.filter((write) => write.table === 'block_results')
    expect(blockWrites.filter((write) => !write.stored)).toHaveLength(1)
    const [standardId, supersetId, circuitId] = app.blockIds[0]
    for (const id of [standardId, supersetId, circuitId]) {
      expect(blockWrites.filter((write) => write.stored && write.body?.block_id === id)).toHaveLength(1)
    }
    expect(app.blockRow(circuitId)).toMatchObject({ rounds_completed: 1 })
    // No refusal fabricated performed work: three sets, each written once.
    expect(app.mutations).toHaveLength(3)
    expect(new Set(app.mutations.map((mutation) => mutation.observation_id)).size).toBe(3)
    app.assertContained()
  })

  test('JOURNEY-019 the four timed-result families and their clocks on /workout phone-390 touch: EMOM, AMRAP, For Time and ladder open Log results in the same focused log beside no second rest, the block clock keeps running behind an open note or log and stays paused while paused, Undo finish closes the log, close and reopen keep every entry, and a refused save keeps them for the one forward-action writer', async ({ page, visit, checkA11y }) => {
    test.setTimeout(300_000)
    await page.setViewportSize({ width: 390, height: 844 })
    const app = await syntheticApp(page, { clock: true })
    await visit('/workout')
    const chromes: Record<string, Chrome> = {}

    // The session's one rest is running when the timed section opens.
    const squatRest = movement(page, 'back squat').getByRole('button', { name: 'Rest', exact: true })
    await squatRest.tap()
    await expectFocusedLog(page, 'Log set 1')
    await closeByX(page, squatRest, 'tap')
    await page.getByRole('button', { name: 'Next section', exact: true }).tap()
    await expect(page.getByRole('heading', { name: 'Conditioning', exact: true })).toBeVisible()
    await expect.poll(() => app.writes.filter((write) => write.table === 'block_results').length).toBe(3)
    const [emomId, amrapId, forTimeId, ladderId] = app.blockIds[1]
    const sessionRests = await restBars(page).count()
    expect(sessionRests).toBeLessThanOrEqual(1)

    // ── AMRAP: its clock runs on behind another family's log (a movement
    // note) and stays still behind it while paused ──
    const amrap = timedCard(page, ACTUALS_AMRAP_WORK_LIST)
    await amrap.getByRole('button', { name: 'Start AMRAP', exact: true }).tap()
    await page.clock.runFor(60_000)
    const coaching = amrap.getByRole('button', { name: /^Coaching and notes/ }).first()
    await coaching.scrollIntoViewIfNeeded()
    await coaching.tap()
    const addNote = amrap.getByRole('button', { name: 'Add note — kettlebell swing', exact: true })
    let before = seconds(await clockOf(amrap).textContent())
    await addNote.tap()
    let log = await expectFocusedLog(page, 'Notes — kettlebell swing')
    chromes.note = log.chrome
    await page.clock.runFor(10_000)
    await log.dialog.getByRole('textbox', { name: 'Notes — kettlebell swing' }).fill('Hinge, not squat')
    const editNote = amrap.getByRole('button', { name: 'Edit note — kettlebell swing', exact: true })
    await log.dialog.getByRole('button', { name: 'Close log', exact: true }).tap()
    await expect(openLog(page)).toHaveCount(0)
    await expect(editNote).toBeFocused()
    expect(before - seconds(await clockOf(amrap).textContent())).toBe(10)
    await amrap.getByRole('button', { name: 'Pause', exact: true }).tap()
    before = seconds(await clockOf(amrap).textContent())
    await editNote.tap()
    log = await expectFocusedLog(page, 'Notes — kettlebell swing')
    await expect(log.dialog.getByRole('textbox', { name: 'Notes — kettlebell swing' })).toHaveValue('Hinge, not squat')
    await page.clock.runFor(15_000)
    await log.dialog.getByRole('button', { name: 'Save note — kettlebell swing', exact: true }).tap()
    await expect(log.dialog.getByRole('status').filter({ hasText: 'Note saved' })).toHaveCount(1)
    await closeByEscape(page, editNote)
    expect(seconds(await clockOf(amrap).textContent())).toBe(before)
    await amrap.getByRole('button', { name: 'Resume', exact: true }).tap()
    await page.clock.runFor(20_000)
    await amrap.getByRole('button', { name: 'Finish early', exact: true }).tap()
    const amrapOpener = timedOpener(amrap)
    await amrapOpener.tap()
    log = await expectFocusedLog(page, LOG_RESULTS)
    chromes.amrap = log.chrome
    await expect(log.dialog.locator('form.clr-timed-log')).toHaveAttribute('data-timed-format', 'amrap')
    // No rest of another family is drawn in a timed log.
    await expect(log.dialog.getByRole('region', { name: 'Rest', exact: true })).toHaveCount(0)
    expect(await restBars(page).count()).toBeLessThanOrEqual(1)
    await log.dialog.getByRole('button', { name: 'Increase rounds completed', exact: true }).tap()
    await expect(log.dialog.getByRole('status', { name: 'Rounds completed', exact: true })).toHaveText('1')
    await closeByX(page, amrapOpener, 'tap')
    await amrapOpener.tap()
    log = await expectFocusedLog(page, LOG_RESULTS)
    await expect(log.dialog.getByRole('status', { name: 'Rounds completed', exact: true })).toHaveText('1')
    await closeByEscape(page, amrapOpener)

    // ── For Time: Finish under the cap, corrected to Incomplete with effort ──
    const forTime = timedCard(page, ACTUALS_FOR_TIME_WORK_LIST)
    await forTime.getByRole('button', { name: 'Start For Time', exact: true }).tap()
    await page.clock.runFor(90_000)
    await forTime.getByRole('button', { name: 'Finish', exact: true }).tap()
    const forTimeOpener = timedOpener(forTime)
    await forTimeOpener.tap()
    log = await expectFocusedLog(page, LOG_RESULTS)
    chromes.for_time = log.chrome
    const completion = log.dialog.getByRole('group', { name: 'Work completed', exact: true })
    expect(await chosen(completion)).toEqual(['Complete'])
    await completion.getByRole('radio', { name: 'Incomplete', exact: true }).tap()
    await log.dialog.getByRole('group', { name: 'Effort · optional', exact: true }).getByRole('radio', { name: 'Too hard', exact: true }).tap()
    await closeByX(page, forTimeOpener, 'tap')
    await forTimeOpener.tap()
    log = await expectFocusedLog(page, LOG_RESULTS)
    expect(await chosen(log.dialog.getByRole('group', { name: 'Work completed', exact: true }))).toEqual(['Incomplete'])
    await closeByEscape(page, forTimeOpener)

    // ── Ladder: its race clock runs on behind its own open log; Undo finish
    // closes the log and resumes ──
    const ladder = timedCard(page, ACTUALS_LADDER_WORK_LIST)
    const ladderOpener = timedOpener(ladder)
    await ladder.getByRole('button', { name: 'Start ladder', exact: true }).tap()
    await page.clock.runFor(40_000)
    before = seconds(await clockOf(ladder).textContent())
    await ladderOpener.tap()
    log = await expectFocusedLog(page, LOG_RESULTS)
    chromes.ladder = log.chrome
    await page.clock.runFor(30_000)
    await closeByX(page, ladderOpener, 'tap')
    expect(Math.abs(seconds(await clockOf(ladder).textContent()) - before)).toBe(30)
    await ladder.getByRole('list', { name: ACTUALS_LADDER_WORK_LIST, exact: true }).getByRole('button', { name: /^Round 1\b/ }).tap()
    await ladder.getByRole('button', { name: 'Finish', exact: true }).tap()
    await ladderOpener.tap()
    log = await expectFocusedLog(page, LOG_RESULTS)
    await expect(log.dialog.getByRole('group', { name: 'Rounds completed', exact: true }).getByRole('status')).toHaveText(/^1 of 4 rounds completed/)
    await log.dialog.getByRole('button', { name: UNDO_FINISH, exact: true }).tap()
    await expect(openLog(page)).toHaveCount(0)
    await expect(ladder.getByRole('button', { name: 'Pause', exact: true })).toBeFocused()
    await page.clock.runFor(10_000)
    await ladder.getByRole('button', { name: 'Finish', exact: true }).tap()
    await ladderOpener.tap()
    log = await expectFocusedLog(page, LOG_RESULTS)
    await expect(log.dialog.getByRole('group', { name: 'Rounds completed', exact: true }).getByRole('status')).toHaveText(/^1 of 4 rounds completed/)
    await closeByEscape(page, ladderOpener)

    // ── EMOM: no log while it runs; Log results at the end, counter-free ──
    const emom = timedCard(page, EMOM_LIST)
    await emom.scrollIntoViewIfNeeded()
    await expect(emom.locator('[data-timed-log-opener]')).toHaveCount(0)
    await emom.getByRole('button', { name: 'Start EMOM', exact: true }).tap()
    await page.clock.runFor(10 * 60_000 + 2_000)
    await expect(emom.getByText('COMPLETE', { exact: true })).toBeVisible()
    const emomOpener = timedOpener(emom)
    await emomOpener.tap()
    log = await expectFocusedLog(page, LOG_RESULTS)
    chromes.emom = log.chrome
    const emomNotes = log.dialog.getByRole('textbox', { name: 'Notes · optional', exact: true })
    await expect(log.dialog.locator('input[type="number"], [role="radiogroup"]')).toHaveCount(0)
    await emomNotes.fill('Swings unbroken')
    await closeByX(page, emomOpener, 'tap')
    await emomOpener.tap()
    log = await expectFocusedLog(page, LOG_RESULTS)
    await expect(log.dialog.getByRole('textbox', { name: 'Notes · optional', exact: true })).toHaveValue('Swings unbroken')
    await checkA11y()
    await closeByEscape(page, emomOpener)

    // ── One chrome across the timed families and the note ──
    expect([...new Set(Object.values(chromes).map((chrome) => JSON.stringify(chrome)))], JSON.stringify(chromes, null, 2)).toHaveLength(1)

    // ── The section's forward action is the one writer; a refused write
    // keeps every log's entries ──
    const blockWritesBefore = app.writes.filter((write) => write.table === 'block_results').length
    app.refuseNext('block_results')
    await page.getByRole('button', { name: 'Next section', exact: true }).tap()
    const failed = page.getByRole('dialog', { name: /didn’t save/ })
    await expect(failed).toBeVisible()
    await failed.getByRole('button', { name: 'Close', exact: true }).tap()
    await expect(failed).toHaveCount(0)
    for (const [opener, check] of [
      [amrapOpener, async (dialog: Locator) => expect(dialog.getByRole('status', { name: 'Rounds completed', exact: true })).toHaveText('1')],
      [forTimeOpener, async (dialog: Locator) => expect(await chosen(dialog.getByRole('group', { name: 'Work completed', exact: true }))).toEqual(['Incomplete'])],
      [emomOpener, async (dialog: Locator) => expect(dialog.getByRole('textbox', { name: 'Notes · optional', exact: true })).toHaveValue('Swings unbroken')],
    ] as const) {
      await opener.tap()
      log = await expectFocusedLog(page, LOG_RESULTS)
      await check(log.dialog)
      await closeByX(page, opener, 'tap')
    }
    await page.getByRole('button', { name: 'Next section', exact: true }).tap()
    await expect(page.getByRole('heading', { name: 'Cooldown', exact: true })).toBeVisible()

    const timedWrites = app.writes.filter((write) => write.table === 'block_results').slice(blockWritesBefore)
    expect(timedWrites.filter((write) => !write.stored)).toHaveLength(1)
    for (const id of [emomId, amrapId, forTimeId, ladderId]) {
      expect(timedWrites.filter((write) => write.stored && write.body?.block_id === id)).toHaveLength(1)
    }
    expect(app.blockRow(emomId)).toMatchObject({ notes: 'Swings unbroken', minutes_completed: null })
    expect(app.blockRow(amrapId)).toMatchObject({ rounds_completed: 1 })
    expect(app.blockRow(forTimeId)).toMatchObject({ completed_under_cap: false, effort: 'too_hard' })
    expect(app.blockRow(ladderId)).toMatchObject({ highest_rung: 1 })
    // The note is the movement's own row; no timed log wrote a set or a movement row it was not given.
    expect(app.writes.filter((write) => write.table === 'workout_exercises')).toEqual([
      { method: 'PATCH', table: 'workout_exercises', filter: app.exerciseId(1, 'kettlebell-swing'), body: { exercise_notes: 'Hinge, not squat' }, stored: true },
    ])
    expect(app.attempts).toHaveLength(0)
    expect(app.writes.filter((write) => write.table === 'block_movement_results')).toHaveLength(0)
    app.assertContained()
  })

  test('JOURNEY-019 workout feedback on /summary and rest day on Home phone-320 touch and keyboard reduced motion: each opens the same focused log from its real entry, keeps its own fields, its draft or its existing cancel meaning through close and reopen, keeps the entry through a refused write and saves it once through its original writer on retry', async ({ page, visit, checkA11y }) => {
    test.setTimeout(240_000)
    await page.setViewportSize({ width: 320, height: 568 })
    const app = await syntheticApp(page, { active: false, reducedMotion: true })
    const chromes: Record<string, Chrome> = {}

    // ── Workout feedback: the session's own Feeling and Notes ──
    await visit('/summary')
    await expect(page.getByRole('button', { name: 'Save and close' })).toHaveCount(0)
    const feedback = page.getByRole('button', { name: 'Log workout feedback', exact: true })
    await feedback.tap()
    let log = await expectFocusedLog(page, 'Workout feedback')
    chromes.feedback = log.chrome
    await expectHardCut(log.dialog)
    await expect(log.dialog.getByRole('radio')).toHaveCount(5)
    // Session feeling, distinct from set/block Effort.
    await expect(log.dialog.getByRole('group', { name: 'Effort' })).toHaveCount(0)
    await log.dialog.getByRole('radio', { name: '2, Worn' }).tap()
    await log.dialog.getByRole('textbox', { name: /Notes · optional/ }).fill('Long day.')
    await closeByX(page, feedback, 'tap')
    await feedback.tap()
    log = await expectFocusedLog(page, 'Workout feedback')
    await expect(log.dialog.getByRole('radio', { name: '2, Worn' })).toBeChecked()
    await expect(log.dialog.getByRole('textbox', { name: /Notes · optional/ })).toHaveValue('Long day.')
    await closeByEscape(page, feedback)
    expect(app.writes).toEqual([])
    await page.keyboard.press('Enter')
    log = await expectFocusedLog(page, 'Workout feedback')
    app.refuseNext('workout_sessions')
    await log.dialog.getByRole('button', { name: 'Save and close' }).focus()
    await page.keyboard.press('Enter')
    await expect(log.dialog.getByRole('alert')).toBeVisible()
    await expectFocusKept(page, log.dialog, 'Workout feedback')
    await expect(page).toHaveURL(/\/summary$/)
    await expect(log.dialog.getByRole('radio', { name: '2, Worn' })).toBeChecked()
    await expect(log.dialog.getByRole('textbox', { name: /Notes · optional/ })).toHaveValue('Long day.')
    await checkA11y()
    await log.dialog.getByRole('button', { name: 'Save and close' }).tap()
    await expect(page).toHaveURL(/\/$/)
    expect(app.writes).toEqual([
      { method: 'PATCH', table: 'workout_sessions', filter: COMPLETED, body: { mood: 2, session_notes: 'Long day.' }, stored: false },
      { method: 'PATCH', table: 'workout_sessions', filter: COMPLETED, body: { mood: 2, session_notes: 'Long day.' }, stored: true },
    ])

    // ── Rest day, by keyboard: the existing native Reason, its picker
    // focused first (U25); the X is its existing Cancel ──
    const restDay = page.getByRole('region', { name: 'Rest day', exact: true })
    const mark = restDay.getByRole('button', { name: 'Mark Rest Day', exact: true })
    await mark.focus()
    await page.keyboard.press('Enter')
    log = await expectFocusedLog(page, 'Log rest day', { focusX: false })
    chromes['rest-day'] = log.chrome
    await expectHardCut(log.dialog)
    const picker = log.dialog.getByRole('combobox', { name: 'Reason' })
    await expect(picker).toBeFocused()
    expect(await picker.locator('option').allTextContents()).toEqual(['Rest day', 'Injured', 'Unwell', 'Away'])
    await expect(log.dialog.getByRole('textbox')).toHaveCount(0)
    await picker.selectOption('injury')
    await closeByEscape(page, mark)
    await page.keyboard.press('Enter')
    log = await expectFocusedLog(page, 'Log rest day', { focusX: false })
    await expect(log.dialog.getByRole('combobox', { name: 'Reason' })).toHaveValue('rest')
    await log.dialog.getByRole('combobox', { name: 'Reason' }).selectOption('injury')
    app.refuseNext('mark_rest_day')
    await log.dialog.getByRole('button', { name: 'Save rest day' }).focus()
    await page.keyboard.press('Enter')
    await expect(log.dialog.getByRole('alert')).toHaveText('The rest day wasn’t saved. Try again.')
    await expect(log.dialog.getByRole('combobox', { name: 'Reason' })).toHaveValue('injury')
    await expectFocusKept(page, log.dialog, 'Log rest day')
    await log.dialog.getByRole('button', { name: 'Save rest day' }).focus()
    await page.keyboard.press('Enter')
    await expect(openLog(page)).toHaveCount(0)
    await expect(restDay.getByText('Today: Injured.')).toBeVisible()
    const change = restDay.getByRole('button', { name: 'Change reason', exact: true })
    await expect(change).toBeFocused()

    // ── Reason change: reopened at the saved reason; the X discards ──
    await page.keyboard.press('Enter')
    log = await expectFocusedLog(page, 'Log rest day', { focusX: false })
    await expect(log.dialog.getByRole('combobox', { name: 'Reason' })).toHaveValue('injury')
    await log.dialog.getByRole('combobox', { name: 'Reason' }).selectOption('vacation')
    await closeByX(page, change)
    await page.keyboard.press('Enter')
    log = await expectFocusedLog(page, 'Log rest day', { focusX: false })
    await expect(log.dialog.getByRole('combobox', { name: 'Reason' })).toHaveValue('injury')
    await closeByEscape(page, change)
    expect(app.writes.filter((write) => write.table === 'mark_rest_day')).toEqual([
      { method: 'POST', table: 'mark_rest_day', filter: null, body: { p_day: app.today.date, p_reason: 'injury', p_note: null }, stored: false },
      { method: 'POST', table: 'mark_rest_day', filter: null, body: { p_day: app.today.date, p_reason: 'injury', p_note: null }, stored: true },
    ])
    expect([...new Set(Object.values(chromes).map((chrome) => JSON.stringify(chrome)))], JSON.stringify(chromes, null, 2)).toHaveLength(1)
    expect(app.attempts).toHaveLength(0)
    app.assertContained()
  })

  test('accepted gallery states clear phone-390: all sixteen logging states open the route’s own moment in the one shared focused log with identical chrome, and the X returns focus to the control that opened it, with nothing read or written over the network', async ({ page, visit, checkA11y }) => {
    test.setTimeout(240_000)
    await page.setViewportSize({ width: 390, height: 844 })
    await installDeterministicCapture(page, { skin: 'clear', reducedMotion: true })
    const requests: string[] = []
    page.on('request', (request) => {
      if (/\/(rest|auth|functions)\/v1\//.test(request.url())) requests.push(`${request.method()} ${request.url()}`)
    })
    const states: readonly { id: string; scope: string; open: string; before?: string; title: string; focusX?: boolean }[] = [
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
    ]
    expect(states).toHaveLength(16)
    const chromes: Record<string, Chrome> = {}
    for (const state of states) {
      await visit(`/gallery/refinements?state=${state.id}`)
      const scope = page.locator(state.scope).first()
      if (state.before !== undefined) await scope.getByRole('button', { name: state.before, exact: true }).click()
      const opener = scope.getByRole('button', { name: state.open, exact: true })
      await opener.click()
      const log = await expectFocusedLog(page, state.title, { focusX: state.focusX ?? true })
      chromes[state.id] = log.chrome
      await noHorizontalOverflow(page)
      await checkA11y()
      await attachScreen(page, `gallery-${state.id}-clear-phone-390`)
      await log.dialog.getByRole('button', { name: 'Close log', exact: true }).click()
      await expect(openLog(page)).toHaveCount(0)
      // The X returns focus to the opener — or, where opening replaces it,
      // to its successor: the circuit round's Finish gives way to the round
      // clock's next control, a circuit movement's row entry to its Rest.
      if (state.id === 'circuit-round') {
        expect(await scope.getByRole('group', { name: 'Round clock', exact: true }).evaluate((node) => node.contains(document.activeElement))).toBe(true)
      } else if (state.id === 'circuit-movement') {
        await expect(scope.getByRole('button', { name: 'Rest', exact: true })).toBeFocused()
      } else {
        await expect(opener).toBeFocused()
      }
    }
    expect([...new Set(Object.values(chromes).map((chrome) => JSON.stringify(chrome)))], JSON.stringify(chromes, null, 2)).toHaveLength(1)
    expect(requests, 'the gallery reads and writes nothing over the network').toEqual([])
  })
})
