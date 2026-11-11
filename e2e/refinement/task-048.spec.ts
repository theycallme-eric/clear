import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createServer, type AddressInfo } from 'node:net'
import { resolve } from 'node:path'
import type { BrowserContext, Locator, Page, Request, Route, TestInfo } from '@playwright/test'

import { readE2eEnv } from '../../scripts/e2e/env.mjs'
import { namespaceId } from '../../scripts/e2e/namespace.mjs'
import { sessionAcceptanceSchema, sessionSnapshotSchema, type SessionSnapshot } from '../../src/state/schemas'
import { formatBadgesSnapshot } from '../../src/test/format-badges-fixture'
import {
  MAIN_CAP_SECONDS,
  MAIN_RUNGS,
  MAIN_TIMING_LINE,
  RECOVERY_COOLDOWN_TITLE,
  RECOVERY_SYNTHETIC_CATALOG,
  SECOND_CAP_SECONDS,
  SECOND_RUNGS,
  SECOND_TIMING_LINE,
  ladderRecoveryAcceptance,
  recoveryName,
  type RecoveryCatalog,
} from '../../src/test/ladder-recovery-fixture'
import { fixtureLocation, onboardedProfile } from '../../src/test/user-data-double'
import { installDeterministicCapture } from '../design-0143/fixtures'
import { expect, test as scanned } from '../fixtures'
import { backend } from '../support/backend'

/**
 * TASK-048 (REQ-032; AC-R032-01, AC-R032-02, AC-R032-03; JOURNEY-032,
 * completion owner) — visible ladder recovery and accidental-Finish
 * restoration on the real `/workout` route.
 *
 * Entry (ENTRY-032): a started session whose first section holds two true
 * timed ladders — four rungs (2 → 8) of a loaded and a bodyweight movement
 * inside one 06:00 cap, and three rungs (3 → 9) of the bodyweight movement
 * raced For Time under a 10:00 cap — then a cooldown
 * (`src/test/ladder-recovery-fixture.ts`). A running, paused or accidentally
 * finished ladder has checked progress, a draft (the answer, the rounds, the
 * next round's partial amounts and a load, the categorical effort and the
 * notes) and its original cap. Action: reload, close and reopen the tab, drop
 * and regain the connection, restore the attempt, Undo the accidental Finish
 * where it is still valid, finish and save again — through refused writes.
 *
 * What is proved, from the screen, the durable record the route keeps
 * (`clear.workout-ladders`, TASK-032's owner), the requests the app sent and
 * the rows that hold:
 *
 *   · ordered progress, the whole current draft (effort and notes included)
 *     and the accidental-Finish checkpoint come back after a reload or a
 *     closed tab — never a memory-only reset;
 *   · a paused clock stays at its paused reading however long the tab was
 *     closed; a running one counts the closed time; Undo resumes from the
 *     same start, so the time spent finished counts and none is granted; the
 *     original cap stays the authority — Undo is withdrawn the moment it
 *     would resume at the cap, a cap reached while closed comes back capped
 *     with no Resume, and the cap is never undone;
 *   · a refused save keeps the draft, the progress and Undo, says so in the
 *     log until a save succeeds (across a reload), and the retry writes each
 *     row once; a save whose block row landed while a movement write was
 *     refused is restated after a reload rather than hidden behind "Block
 *     saved";
 *   · a successful save removes Undo at once, and the saved result is what a
 *     saved ladder shows — read back from the saved row after a reload, and
 *     kept while a later block's save fails — never a stale draft or nothing.
 *
 * Two lanes run the two journey bodies:
 *
 *   · **The authorized disposable backend lane** (PRE-001; the namespaced
 *     throwaway-user pattern of `e2e/refinement/task-047.spec.ts` and
 *     `e2e/design-0143/workout-*.spec.ts`): a confirmed user under this run's
 *     namespace, its onboarding, the session persisted through
 *     `persist_session` and started through `start_session`, the app's own
 *     writers against the hosted project, and the saved rows read back with
 *     the service role filtered to this user's own block and movement ids
 *     only. The user is deleted in `finally`, which removes every row it
 *     owns. Faults are injected in the browser only (a refused write is
 *     answered 503 and never forwarded). **A missing backend fails the case;
 *     it is never a skipped proof.**
 *   · **A contained synthetic lane** answering as PostgREST does (unique keys'
 *     23505, PATCH restating, the performed read returning what was written).
 *     It proves the same screens and requests anywhere, but is not backend
 *     proof.
 *
 * One synthetic case drives the clocks deterministically through pre- and
 * post-expiry, a paused ladder closed for hours, a running one closed past its
 * cap, a real tab close and reopen, and a dropped connection. One gallery case
 * checks `?state=ladder-4` / `ladder-12` (eded158c…), which draw the route's
 * own `LadderBlock` over memory: the whole draft kept through close, reopen,
 * Finish and Undo, nothing stored, no network.
 *
 * Every Playwright clock reading is the browser's own fake clock
 * (`page.clock`): held for exact arithmetic, released before reloads, saves
 * and scans, and read against the stored start after a reload.
 */

const e2e = readE2eEnv()
const SYNTHETIC_ORIGIN_NEEDED = !e2e.usesExternalTarget && (e2e.url === null || e2e.anonKey === null)
const REPO_ROOT = resolve(import.meta.dirname, '..', '..')
const SESSION_KEY = 'clear.auth.session'
const LADDER_KEY = 'clear.workout-ladders'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
}
/** The synthetic lane's entry on the browser clock; the session has run one minute. */
const ENTRY = Date.parse('2026-11-11T09:00:00.000Z')

const UNDO_FINISH = 'Undo finish · Resume ladder'
const SAVE_FAILED = 'Your log didn’t save. Try again.'
const ROUNDS_LIST = 'Rounds in this ladder'

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
    if (code !== null) throw new Error(`Synthetic TASK-048 server exited (${code}) before ${origin} was ready`)
    try {
      if ((await fetch(origin)).ok && (await fetch(own)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((settle) => setTimeout(settle, 250))
  }
  throw new Error(`Synthetic TASK-048 origin ${origin} did not start`)
}

/**
 * The synthetic lane needs an app origin when this checkout has no Supabase
 * URL configured; the backend lane always uses the configured one (and fails
 * at its precondition first when there is none).
 */
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
          VITE_SUPABASE_URL: 'https://synthetic-task-048.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-task-048-public-placeholder',
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

// ─────────────────────────────────────────────────────────────────────────────
// The world a journey runs in: synthetic, or the disposable backend lane
// ─────────────────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>
type Table = 'block_results' | 'block_movement_results'
type LadderName = 'main' | 'second'

interface World {
  readonly lane: 'synthetic' | 'backend'
  readonly sessionId: string
  /** `workout_blocks.id` of each ladder. */
  readonly blocks: Readonly<Record<LadderName, string>>
  /** The main ladder's [loaded, bodyweight] and the second's [bodyweight] `workout_exercises.id`s. */
  readonly exercises: { readonly main: readonly [string, string]; readonly second: readonly [string] }
  readonly names: { readonly loaded: string; readonly bodyweight: string }
  /** The browser clock's start for this world. */
  readonly start: number
  /** The stored `block_results` rows of the two ladders. */
  blockRows(): Promise<Row[]>
  /** The stored `block_movement_results` rows of the two ladders' movements. */
  movementRows(): Promise<Row[]>
  /** Prepares another tab in the same browser context (a closed tab reopened). */
  preparePage(page: Page): Promise<void>
  assertContained(): void
}

const UNIQUE_VIOLATION = { code: '23505', message: 'duplicate key value violates unique constraint', details: null, hint: null }

function filterValue(url: URL, column: string): string | null {
  const value = url.searchParams.get(column)
  return value === null ? null : value.replace(/^eq\./, '')
}

function firstRow(request: Request): Row | null {
  const raw = request.postData()
  if (raw === null) return null
  const parsed = JSON.parse(raw) as Row | Row[]
  return Array.isArray(parsed) ? (parsed[0] ?? null) : parsed
}

/**
 * The contained synthetic lane: the session's own reads, and the two timed
 * result tables answered as PostgREST answers them — `block_id` and
 * `workout_exercise_id` unique (a second insert is 23505), PATCH restating the
 * row addressed by its key, DELETE removing it — with the performed read
 * returning exactly what was written. Routed on the browser context, so a tab
 * closed and reopened talks to the same store. Anything else fails the case.
 */
async function syntheticWorld(page: Page, options: { skin: 'clear' | 'signal'; reducedMotion: boolean }): Promise<World> {
  const owner = '00000000-0000-4000-8000-000000004801'
  const place = '00000000-0000-4000-8000-000000004811'
  const acceptance = ladderRecoveryAcceptance(RECOVERY_SYNTHETIC_CATALOG, { locationId: place })
  const started: SessionSnapshot = sessionSnapshotSchema.parse(formatBadgesSnapshot(acceptance, {
    userId: owner,
    startedAt: new Date(ENTRY - 60_000).toISOString(),
  }))
  const blockRows = new Map<string, Row>()
  const movementRows = new Map<string, Row>()
  const unexpected: string[] = []
  let minted = 0
  const mint = () => `00000000-0000-4000-8000-${String(4800 + (minted += 1)).padStart(12, '0')}`
  const guards: { blockedGenerations(): number }[] = []

  const apply = (request: Request): { status: number; body: unknown } => {
    const url = new URL(request.url())
    const row = firstRow(request)
    const stamp = new Date().toISOString()
    if (url.pathname.endsWith('/rest/v1/block_results')) {
      if (request.method() === 'POST') {
        const blockId = String(row?.block_id)
        if (blockRows.has(blockId)) return { status: 409, body: UNIQUE_VIOLATION }
        const stored = {
          id: mint(), created_at: stamp, elapsed_seconds: null, completed_under_cap: null, rounds_completed: null,
          partial_round_reps: null, minutes_completed: null, highest_rung: null, perceived_effort: null, notes: null,
          effort: null, ...row,
        }
        blockRows.set(blockId, stored)
        return { status: 201, body: [stored] }
      }
      if (request.method() === 'PATCH') {
        const blockId = filterValue(url, 'block_id')
        const stored = blockId === null ? undefined : blockRows.get(blockId)
        if (stored === undefined) return { status: 200, body: [] }
        const corrected = { ...stored, ...row }
        blockRows.set(blockId!, corrected)
        return { status: 200, body: [corrected] }
      }
    }
    if (url.pathname.endsWith('/rest/v1/block_movement_results')) {
      const exerciseId = request.method() === 'POST' ? String(row?.workout_exercise_id) : filterValue(url, 'workout_exercise_id')
      if (request.method() === 'POST') {
        if (movementRows.has(exerciseId!)) return { status: 409, body: UNIQUE_VIOLATION }
        const stored = { prescription_revision_status: 'active', created_at: stamp, updated_at: stamp, ...row }
        movementRows.set(exerciseId!, stored)
        return { status: 201, body: [stored] }
      }
      if (request.method() === 'PATCH') {
        const stored = exerciseId === null ? undefined : movementRows.get(exerciseId)
        if (stored === undefined) return { status: 200, body: [] }
        const restated = { ...stored, ...row, updated_at: stamp }
        movementRows.set(exerciseId!, restated)
        return { status: 200, body: [restated] }
      }
      if (request.method() === 'DELETE') {
        if (exerciseId !== null) movementRows.delete(exerciseId)
        return { status: 204, body: null }
      }
    }
    unexpected.push(`${request.method()} ${url.pathname}`)
    return { status: 503, body: { code: 'PGRST000', message: 'Unexpected synthetic TASK-048 write.' } }
  }

  const reconstruction = () => ({
    reconstruction: 'performed',
    as_of: started.session.started_at,
    session: started.session,
    state: started.state,
    sections: started.sections.map((section) => ({
      ...section,
      blocks: section.blocks.map((block) => ({
        ...block,
        block_result: blockRows.get(block.block.id) ?? null,
        exercises: block.exercises.map((entry) => ({ ...entry, movement_result: movementRows.get(entry.exercise.id) ?? null })),
      })),
    })),
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
    if (request.method() === 'GET' || request.method() === 'HEAD') {
      if (name === 'profiles') return reply([onboardedProfile({ id: owner, goal_preset: 'balanced' })])
      if (name === 'locations') return reply([fixtureLocation({ id: place, user_id: owner, tier: 'full', is_default: true })])
      if (name === 'workout_sessions') return reply([started.session])
      // Every other read is an empty answer: no history, notes, anchors or favorites.
      return reply([])
    }
    if (/\/rest\/v1\/(block_results|block_movement_results)$/.test(url.pathname)) {
      const answer = apply(request)
      return answer.status === 204
        ? route.fulfill({ status: 204, headers: CORS })
        : reply(answer.body, answer.status)
    }
    if (request.method() === 'POST' && url.pathname.includes('/rpc/')) {
      if (name === 'resume_session' || name === 'session_snapshot') return reply(started)
      if (name === 'session_as_performed') return reply(reconstruction())
      if (['streak_sessions', 'constraints_in_force', 'anchor_evidence', 'conditioning_history', 'set_load_anchors',
        'generation_refusal_diagnostics', 'generation_candidate_sets_for_goal', 'generation_candidate_sets'].includes(name)) return reply([])
    }
    unexpected.push(`${request.method()} ${url.pathname}`)
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic TASK-048 request.' }, 503)
  }
  const context = page.context()
  await context.route('**/rest/v1/**', handler)
  await context.route('**/auth/v1/**', handler)
  await context.route('**/functions/v1/**', handler)
  await context.addInitScript(({ key, user }) => {
    localStorage.setItem(key, JSON.stringify({
      accessToken: 'synthetic-task-048-session', refreshToken: 'synthetic-task-048-refresh',
      expiresAt: Date.now() + 6 * 60 * 60 * 1000,
      user: { id: user, email: 'synthetic-task-048@example.invalid' },
    }))
  }, { key: SESSION_KEY, user: owner })

  const preparePage = async (target: Page) => {
    guards.push(await installDeterministicCapture(target, { skin: options.skin, reducedMotion: options.reducedMotion }))
  }
  await preparePage(page)

  const [ladders] = started.sections
  const [main, second] = ladders.blocks
  const ids = (index: number) => ladders.blocks[index].exercises.map((entry) => entry.exercise.id)
  const ladderBlockIds = new Set([main.block.id, second.block.id])
  const ladderExerciseIds = new Set([...ids(0), ...ids(1)])
  return {
    lane: 'synthetic',
    sessionId: started.session.id,
    blocks: { main: main.block.id, second: second.block.id },
    exercises: { main: [ids(0)[0], ids(0)[1]], second: [ids(1)[0]] },
    names: { loaded: recoveryName(RECOVERY_SYNTHETIC_CATALOG.loaded.id), bodyweight: recoveryName(RECOVERY_SYNTHETIC_CATALOG.bodyweight.id) },
    start: ENTRY,
    blockRows: async () => [...blockRows.values()].filter((row) => ladderBlockIds.has(String(row.block_id))),
    movementRows: async () => [...movementRows.values()].filter((row) => ladderExerciseIds.has(String(row.workout_exercise_id))),
    preparePage,
    assertContained() {
      expect(unexpected, 'Every synthetic API request has an explicit disposition').toEqual([])
      for (const guard of guards) expect(guard.blockedGenerations()).toBe(0)
    },
  }
}

type Answer = { ok: boolean; status: number; body: unknown }

/** Never put an admin response body, actor, token or email into an assertion. */
function must<T>(answer: Answer, operation: string): T {
  expect(answer.ok, `${operation}: HTTP status ${answer.status}`).toBe(true)
  return answer.body as T
}

/**
 * The authorized disposable backend lane (PRE-001), following TASK-047's
 * namespaced-user pattern exactly. Returns the world and its cleanup; the
 * cleanup deletes the user, which removes every row it owns. Nothing here
 * reads or writes a row that is not this user's.
 */
async function backendWorld(page: Page, testInfo: TestInfo, options: { skin: 'clear' | 'signal'; reducedMotion: boolean }): Promise<{ world: World; cleanup: () => Promise<void> }> {
  // The explicit precondition. A missing integration credential is a
  // failure, never a skipped proof: the controller's required run must not
  // pass a backend case it could not execute.
  expect(backend.available, `TASK-048 backend lane (PRE-001): ${backend.reason}`).toBe(true)
  testInfo.annotations.push({
    type: 'proof-mode',
    description: 'Trusted namespaced disposable-account integration (PRE-001); real hosted rows written by the app and read back; user deleted after.',
  })
  const guards: { blockedGenerations(): number }[] = []
  const client = backend.client()

  // MIG-A and MIG-B on the hosted project: zero-row reads check the columns
  // and the table exist without reading any athlete's row.
  must(await client.selectAsService('block_results', { select: 'id,effort', limit: '0' }), 'MIG-A boundary read')
  must(await client.selectAsService('block_movement_results', { select: 'id,round_number,weight,weight_unit', limit: '0' }), 'MIG-B boundary read')
  must(await client.selectAsService('workout_blocks', { select: 'id,ladder_timing', limit: '0' }), 'Ladder timing boundary read')

  type Catalogued = { id: string; default_equipment: string }
  const [loaded] = must<Catalogued[]>(await client.selectAsService('exercise_definitions', {
    select: 'id,default_equipment', default_equipment: 'eq.dumbbells', order: 'id.asc', limit: '1',
  }), 'Loaded catalog read')
  const [bodyweight] = must<Catalogued[]>(await client.selectAsService('exercise_definitions', {
    select: 'id,default_equipment', default_equipment: 'eq.bodyweight', order: 'id.asc', limit: '1',
  }), 'Bodyweight catalog read')
  expect(loaded, 'a dumbbell movement in the disposable catalog').toBeDefined()
  expect(bodyweight, 'a bodyweight movement in the disposable catalog').toBeDefined()
  const catalog: RecoveryCatalog = {
    loaded: { id: loaded.id, equipment: loaded.default_equipment },
    bodyweight: { id: bodyweight.id, equipment: bodyweight.default_equipment },
  }

  const suffix = createHash('sha256').update(testInfo.titlePath.join('\0')).digest('hex').slice(0, 10)
  const email = `clear-e2e-${namespaceId()}-${testInfo.project.name}-t048-${suffix}@example.com`
  let userId: string | null = null
  let token: string
  let refreshToken: string
  try {
    const prior = await client.findUserByEmail(email)
    if (prior) await client.deleteUser(prior.id)
    const created = await client.ensureConfirmedUser(email)
    userId = created.id
    const session = await client.mintSession(email)
    token = session.accessToken
    refreshToken = session.refreshToken
  } catch {
    if (userId !== null) await client.deleteUser(userId).catch(() => undefined)
    throw new Error('TASK-048 namespaced fixture authentication failed; no response body retained.')
  }
  if (userId === null) throw new Error('TASK-048 fixture user was not created.')
  const owner = userId
  const cleanup = async () => {
    await client.deleteUser(owner).catch(() => {
      throw new Error('TASK-048 scoped fixture cleanup failed.')
    })
  }

  try {
    must(await client.rpcAs('complete_onboarding', {
      p_location_name: 'TASK-048 gym', p_location_tier: 'full',
      p_equipment: [...new Set(['bodyweight', 'dumbbells', catalog.loaded.equipment, catalog.bodyweight.equipment])],
      p_experience_level: 'some', p_goal_preset: 'balanced',
      p_sections: ['warmup', 'primary_lift', 'cooldown'], p_avoid_patterns: [], p_note: null,
    }, token), 'Fixture onboarding')
    const [location] = must<Array<{ id: string }>>(await client.selectAsService('locations', {
      select: 'id', user_id: `eq.${owner}`, limit: '1',
    }), 'Fixture location read')
    const acceptance = sessionAcceptanceSchema.parse(ladderRecoveryAcceptance(catalog, {
      locationId: location?.id ?? null,
      date: new Date().toISOString().slice(0, 10),
    }))
    const persisted = must<{ session: { id: string } }>(await client.rpcAs('persist_session', {
      p_user_id: owner, p_session: acceptance,
    }, token), 'Fixture persistence')
    const sessionId = persisted.session.id
    const startedAnswer = must<{ outcome: string }>(await client.rpcAs('start_session', { p_session_id: sessionId }, token), 'Fixture start')
    expect(startedAnswer.outcome).toBe('started')

    const sections = must<Array<{ id: string; section_type: string }>>(await client.selectAsService('workout_sections', {
      select: 'id,section_type', session_id: `eq.${sessionId}`,
    }), 'Fixture section read')
    const ladderSection = sections.find((section) => section.section_type === 'conditioning')
    if (ladderSection === undefined) throw new Error('TASK-048 fixture has no conditioning section.')
    const blockRowsRead = must<Array<{ id: string; order_index: number; structure_type: string; ladder_timing: unknown }>>(await client.selectAsService('workout_blocks', {
      select: 'id,order_index,structure_type,ladder_timing', section_id: `eq.${ladderSection.id}`, order: 'order_index.asc',
    }), 'Fixture block read')
    expect(blockRowsRead.map((block) => block.structure_type)).toEqual(['for_time', 'for_time'])
    expect(blockRowsRead.every((block) => block.ladder_timing !== null)).toBe(true)
    const blockIds = blockRowsRead.map((block) => block.id)
    const exerciseRows = must<Array<{ id: string; block_id: string; order_index: number }>>(await client.selectAsService('workout_exercises', {
      select: 'id,block_id,order_index', block_id: `in.(${blockIds.join(',')})`, order: 'order_index.asc',
    }), 'Fixture prescription read')
    const of = (blockId: string) => exerciseRows.filter((row) => row.block_id === blockId).sort((a, b) => a.order_index - b.order_index).map((row) => row.id)
    const mainIds = of(blockIds[0])
    const secondIds = of(blockIds[1])
    expect(mainIds).toHaveLength(2)
    expect(secondIds).toHaveLength(1)
    const exerciseIds = exerciseRows.map((row) => row.id)

    const context: BrowserContext = page.context()
    await context.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), {
      key: SESSION_KEY,
      session: { accessToken: token, refreshToken, expiresAt: Date.now() + 60 * 60 * 1000, user: { id: owner, email } },
    })
    const preparePage = async (target: Page) => {
      guards.push(await installDeterministicCapture(target, { skin: options.skin, reducedMotion: options.reducedMotion }))
    }
    await preparePage(page)

    const world: World = {
      lane: 'backend',
      sessionId,
      blocks: { main: blockIds[0], second: blockIds[1] },
      exercises: { main: [mainIds[0], mainIds[1]], second: [secondIds[0]] },
      names: { loaded: recoveryName(catalog.loaded.id), bodyweight: recoveryName(catalog.bodyweight.id) },
      start: Date.now(),
      blockRows: async () => must<Row[]>(await client.selectAsService('block_results', {
        select: 'id,block_id,elapsed_seconds,completed_under_cap,rounds_completed,partial_round_reps,minutes_completed,highest_rung,perceived_effort,notes,effort',
        block_id: `in.(${blockIds.join(',')})`,
      }), 'Block result read'),
      movementRows: async () => must<Row[]>(await client.selectAsService('block_movement_results', {
        select: 'id,workout_exercise_id,round_number,actual_reps,actual_duration_seconds,actual_distance,actual_distance_unit,weight,weight_unit',
        workout_exercise_id: `in.(${exerciseIds.join(',')})`,
      }), 'Movement result read'),
      preparePage,
      assertContained() {
        for (const guard of guards) expect(guard.blockedGenerations()).toBe(0)
      },
    }
    return { world, cleanup }
  } catch (error) {
    await cleanup()
    throw error
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Faults and the record of what the app sent
// ─────────────────────────────────────────────────────────────────────────────

interface Sent {
  readonly method: string
  readonly table: Table
  readonly key: string | null
  readonly request: Request
}

/** Every write to the two timed tables from this page, in order, exactly as sent. */
function recordWrites(page: Page, sent: Sent[] = []): Sent[] {
  page.on('request', (request) => {
    const url = new URL(request.url())
    const match = /\/rest\/v1\/(block_results|block_movement_results)$/.exec(url.pathname)
    if (match === null || ['GET', 'HEAD', 'OPTIONS'].includes(request.method())) return
    const table = match[1] as Table
    const body = firstRow(request)
    const column = table === 'block_results' ? 'block_id' : 'workout_exercise_id'
    const key = request.method() === 'POST' ? String(body?.[column] ?? '') : filterValue(url, column)
    sent.push({ method: request.method(), table, key, request })
  })
  return sent
}

/** `POST 201`, `POST 503`, `POST 409`, `PATCH 200` … for one key. */
async function trail(sent: readonly Sent[], table: Table, key: string): Promise<string[]> {
  const mine = sent.filter((write) => write.table === table && write.key === key)
  return Promise.all(mine.map(async (write) => {
    const response = await write.request.response().catch(() => null)
    return `${write.method} ${response === null ? 'lost' : response.status()}`
  }))
}

/**
 * Faults injected in the browser, ahead of either lane: a refused write is
 * answered 503 and never forwarded. Each fires once, on the first POST of its
 * key. A dropped connection aborts every API request until it is regained.
 */
async function installFaults(page: Page) {
  const pending: { table: Table; key: string }[] = []
  let offline = false
  await page.route(/\/(rest|auth|functions)\/v1\//, async (route) => {
    const request = route.request()
    if (offline) return route.abort('internetdisconnected')
    const url = new URL(request.url())
    const match = /\/rest\/v1\/(block_results|block_movement_results)$/.exec(url.pathname)
    if (match === null || request.method() !== 'POST') return route.fallback()
    const table = match[1] as Table
    const body = firstRow(request)
    const key = String(body?.[table === 'block_results' ? 'block_id' : 'workout_exercise_id'] ?? '')
    const index = pending.findIndex((fault) => fault.table === table && fault.key === key)
    if (index < 0) return route.fallback()
    pending.splice(index, 1)
    return route.fulfill({ status: 503, headers: CORS, json: { code: 'PGRST000', message: 'Controlled TASK-048 refusal.', details: null, hint: null } })
  })
  return {
    refuse: (table: Table, key: string) => { pending.push({ table, key }) },
    drop: () => { offline = true },
    regain: () => { offline = false },
    spent: () => expect(pending, 'every injected fault fired').toEqual([]),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Clocks
// ─────────────────────────────────────────────────────────────────────────────

/** Holds the browser clock where it is, so readings until `release` are exact arithmetic. */
async function hold(page: Page) {
  const now = await page.evaluate(() => Date.now())
  await page.clock.pauseAt(now + 1000)
}

/** Lets the clock run with real time again (before a reload, a save or a scan). */
async function release(page: Page) {
  await page.clock.resume()
}

async function pass(page: Page, seconds: number) {
  await page.clock.runFor(seconds * 1000)
}

function seconds(reading: string): number {
  const [minutes, rest] = reading.split(':').map(Number)
  return minutes * 60 + rest
}

function reading(totalSeconds: number): string {
  return `${String(Math.floor(totalSeconds / 60)).padStart(2, '0')}:${String(totalSeconds % 60).padStart(2, '0')}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Reading and operating the screen
// ─────────────────────────────────────────────────────────────────────────────

const TIMING_LINES: Readonly<Record<LadderName, string>> = { main: MAIN_TIMING_LINE, second: SECOND_TIMING_LINE }
const RUNGS: Readonly<Record<LadderName, readonly number[]>> = { main: MAIN_RUNGS, second: SECOND_RUNGS }

function cardOf(page: Page, name: LadderName): Locator {
  return page.locator('[data-workout-card="workout"]').filter({ has: page.getByText(TIMING_LINES[name], { exact: true }) })
}

/** The block's clock beside its card: its reading and its phase in words. */
async function clockOf(page: Page, name: LadderName): Promise<{ reading: string; words: string }> {
  const stack = page.locator('main .clr-stack').filter({ has: cardOf(page, name) }).last()
  const clock = stack.locator('.clr-card').filter({ has: page.getByRole('timer') }).first()
  const text = (await clock.getByRole('timer').first().textContent()) ?? ''
  const words = (await clock.getByRole('status').first().textContent()) ?? ''
  return { reading: /\d{2}:\d{2}/.exec(text)?.[0] ?? '', words }
}

async function expectClock(page: Page, name: LadderName, expected: { reading: string; words: string }) {
  await expect.poll(() => clockOf(page, name)).toEqual(expected)
}

interface StoredAttempt {
  identity: { attemptId: string }
  originalCapSeconds: number | null
  clock: { startedAt: string | null; finishedAt: string | null; pausedAt?: string }
  progress: number | null
  draft: { completed: boolean | null; highestRung: number | null; effort: string | null; notes: string; movements: Record<string, { amount: string; weight: string }> } | null
  checkpoint: { pausedAt: string | null; progress: number | null; completed: boolean | null } | null
  save: { status: string; source?: string }
}

async function attemptOf(page: Page, blockId: string): Promise<StoredAttempt> {
  return page.evaluate(({ key, id }) => JSON.parse(localStorage.getItem(key) ?? '{}')[id] as StoredAttempt, { key: LADDER_KEY, id: blockId })
}

/** Running from the stored start: the browser's now less that start, to the tick. */
async function expectRunningFrom(page: Page, name: LadderName, startedAt: string, label: string): Promise<number> {
  const { reading: shown, words } = await clockOf(page, name)
  expect(words, label).toBe('Racing the clock')
  const now = await page.evaluate(() => Date.now())
  const expected = Math.floor((now - Date.parse(startedAt)) / 1000)
  expect(seconds(shown), `${label}: ${shown}`).toBeGreaterThanOrEqual(expected - 1)
  expect(seconds(shown), `${label}: ${shown}`).toBeLessThanOrEqual(expected)
  return seconds(shown)
}

function liveTile(card: Locator, round: number): Locator {
  return card.getByRole('list', { name: ROUNDS_LIST, exact: true }).locator(`:scope > li[data-ladder-round="${round}"]`).getByRole('button')
}

function liveCount(card: Locator): Locator {
  return card.locator('[data-ladder-prescription]').getByRole('status')
}

async function livePressed(card: Locator): Promise<number[]> {
  return card.getByRole('list', { name: ROUNDS_LIST, exact: true }).getByRole('button').evaluateAll((tiles) =>
    tiles.map((tile, index) => (tile.getAttribute('aria-pressed') === 'true' ? index + 1 : 0)).filter((round) => round > 0))
}

async function lifecycle(card: Locator): Promise<string[]> {
  return card.getByRole('button', { name: /^(Start ladder|Pause|Resume|Finish)$/ }).allTextContents()
}

function openerOf(card: Locator): Locator {
  return card.locator('[data-timed-log-opener]').getByRole('button', { name: 'Log results', exact: true })
}

function openLogForm(page: Page): Locator {
  return page.locator('dialog.clr-accepted-log[open] form.clr-timed-log')
}

async function closeLog(page: Page) {
  const open = page.locator('dialog.clr-accepted-log[open]')
  if ((await open.count()) === 0) return
  await open.getByRole('button', { name: 'Close log', exact: true }).click()
  await expect(open).toHaveCount(0)
}

type How = 'tap' | 'keyboard'

async function press(locator: Locator, how: How) {
  if (how === 'tap') await locator.tap()
  else {
    await locator.focus()
    await locator.page().keyboard.press('Enter')
  }
}

async function openLog(card: Locator, how: How): Promise<Locator> {
  const page = card.page()
  await closeLog(page)
  await press(openerOf(card), how)
  await expect(openLogForm(page)).toBeVisible()
  return openLogForm(page)
}

const completionOf = (log: Locator) => log.getByRole('group', { name: 'Work completed', exact: true })
const roundsOf = (log: Locator) => log.getByRole('group', { name: 'Rounds completed', exact: true })
const undoOf = (log: Locator) => log.getByRole('button', { name: UNDO_FINISH, exact: true })
const amountOf = (log: Locator, round: number, name: string) => log.getByRole('spinbutton', { name: `Round ${round} · ${name}`, exact: true })
const weightOf = (log: Locator, name: string) => log.getByRole('spinbutton', { name: `Weight · ${name}`, exact: true })
const notesOf = (log: Locator) => log.getByRole('textbox', { name: 'Notes · optional', exact: true })
const effortOf = (log: Locator) => log.getByRole('group', { name: 'Effort · optional', exact: true })
const failureOf = (log: Locator) => log.getByRole('alert')

async function chosen(group: Locator): Promise<string[]> {
  return group.getByRole('radio').evaluateAll((radios) =>
    radios.filter((radio) => radio.getAttribute('aria-checked') === 'true').map((radio) => radio.textContent ?? ''))
}

async function resultPressed(log: Locator): Promise<number[]> {
  return roundsOf(log).getByRole('button').evaluateAll((tiles) =>
    tiles.map((tile, index) => (tile.getAttribute('aria-pressed') === 'true' ? index + 1 : 0)).filter((round) => round > 0))
}

function resultTile(log: Locator, name: LadderName, round: number): Locator {
  return roundsOf(log).getByRole('button', { name: `Round ${round}: ${RUNGS[name][round - 1]} reps`, exact: true })
}

async function chooseEffort(log: Locator, word: string, how: How) {
  const radio = effortOf(log).getByRole('radio', { name: word, exact: true })
  if (how === 'tap') await radio.tap()
  else {
    await radio.focus()
    await log.page().keyboard.press('Space')
  }
  await expect(radio).toHaveAttribute('aria-checked', 'true')
}

/** The unit a typed load is stated in, as the field shows it. */
async function loadUnit(log: Locator, name: string): Promise<string> {
  const unit = await log.locator('[data-timed-movement]').filter({ has: log.page().getByRole('heading', { name, exact: true }) })
    .locator('.clr-field__unit').last().textContent()
  expect(unit ?? '').toMatch(/^(kg|lb)$/)
  return unit!
}

/** The whole draft as the open log shows it. */
interface ShownDraft {
  answer: string[]
  rounds: number[] | null
  effort: string[]
  notes: string
}

async function shownDraft(log: Locator): Promise<ShownDraft> {
  return {
    answer: await chosen(completionOf(log)),
    rounds: (await roundsOf(log).count()) === 0 ? null : await resultPressed(log),
    effort: await chosen(effortOf(log)),
    // A saved block with no note draws no notes field (TASK-047).
    notes: (await notesOf(log).count()) === 0 ? '' : await notesOf(log).inputValue(),
  }
}

async function forward(page: Page, how: How) {
  await closeLog(page)
  await press(page.getByRole('button', { name: 'Next section', exact: true }), how)
}

/** The forward action's existing failure dialog, dismissed: the athlete stays on the ladders. */
async function expectNotSaved(page: Page, how: How) {
  const dialog = page.getByRole('dialog').filter({ hasText: 'That didn’t save' })
  await expect(dialog).toBeVisible()
  await press(dialog.getByRole('button', { name: 'Close', exact: true }), how)
  await expect(dialog).toHaveCount(0)
  await expect(page.getByText(MAIN_TIMING_LINE, { exact: true })).toBeVisible()
}

async function expectAtCooldown(page: Page) {
  await expect(page.getByRole('heading', { name: RECOVERY_COOLDOWN_TITLE, exact: true })).toBeVisible({ timeout: 30_000 })
}

async function openLadders(page: Page, visit: (path: string) => Promise<void>) {
  await visit('/workout')
  await expect(page).toHaveURL(/\/workout$/)
  await expect(page.getByText(MAIN_TIMING_LINE, { exact: true })).toBeVisible()
  await expect(page.getByText(SECOND_TIMING_LINE, { exact: true })).toBeVisible()
}

/** A reload (the clock released first), landing back on the ladders. */
async function reload(page: Page) {
  await release(page)
  await page.reload()
  const cooldown = page.getByRole('heading', { name: RECOVERY_COOLDOWN_TITLE, exact: true })
  const ladders = page.getByText(MAIN_TIMING_LINE, { exact: true })
  await expect(cooldown.or(ladders)).toBeVisible({ timeout: 30_000 })
  if (await cooldown.isVisible()) {
    await page.getByRole('button', { name: 'Previous', exact: true }).click()
  }
  await expect(ladders).toBeVisible()
}

/** A saved ladder: no Undo, no lifecycle, no live check-off, "Block saved". */
async function expectSavedCard(card: Locator) {
  await expect(card.getByText('Block saved')).toBeVisible()
  expect(await lifecycle(card)).toEqual([])
  await expect(card.getByRole('list', { name: ROUNDS_LIST, exact: true }).getByRole('button')).toHaveCount(0)
}

/** Every field of a saved log is shown and none is offered. */
async function expectSavedLog(log: Locator) {
  await expect(undoOf(log)).toHaveCount(0)
  await expect(failureOf(log)).toHaveCount(0)
  for (const radio of await completionOf(log).getByRole('radio').all()) await expect(radio).toBeDisabled()
  for (const radio of await effortOf(log).getByRole('radio').all()) await expect(radio).toBeDisabled()
  if ((await roundsOf(log).count()) > 0) {
    for (const tile of await roundsOf(log).getByRole('button').all()) await expect(tile).toBeDisabled()
  }
  for (const field of await log.getByRole('spinbutton').all()) await expect(field).toBeDisabled()
  if ((await notesOf(log).count()) > 0) await expect(notesOf(log)).toBeDisabled()
}

const blockColumns = (row: Row | undefined) => row === undefined ? undefined : {
  highest_rung: row.highest_rung,
  effort: row.effort,
  notes: row.notes,
  perceived_effort: row.perceived_effort,
  elapsed_seconds: row.elapsed_seconds,
  completed_under_cap: row.completed_under_cap,
  rounds_completed: row.rounds_completed,
}

const movementColumns = (row: Row | undefined) => row === undefined ? undefined : {
  round_number: row.round_number,
  actual_reps: row.actual_reps,
  actual_duration_seconds: row.actual_duration_seconds,
  actual_distance: row.actual_distance,
  weight: row.weight === null ? null : Number(row.weight),
  weight_unit: row.weight_unit,
}

const NOTES_MAIN = 'Grip slipped on round two; finished round three.'

// ─────────────────────────────────────────────────────────────────────────────
// Journey 1 — running, paused, accidentally finished, refused, reloaded, saved
// ─────────────────────────────────────────────────────────────────────────────

/**
 * AC-R032-01/02/03 on the route: the main ladder is started, checked through
 * 2, given an effort and notes, paused at 01:00 and reloaded (paused,
 * frozen, everything kept); resumed, checked through 3 and finished at 01:30
 * by accident with the next round's partials and a load entered; reloaded
 * (finished, frozen, everything and the Undo kept); undone (running on from
 * the same start, the time spent finished counted, nothing granted, progress
 * and every entry kept, the answer back to before Finish); finished again;
 * its save refused (the draft, progress and Undo kept, the failure said in
 * the log, across a reload); retried (each row once); and the saved result
 * read back — at once, and from the saved row after a reload — with no Undo.
 */
async function journeyRecovery(page: Page, world: World, visit: (path: string) => Promise<void>, how: How) {
  const sent = recordWrites(page)
  const faults = await installFaults(page)
  await page.clock.install({ time: world.start })
  await openLadders(page, visit)
  await hold(page)
  const main = cardOf(page, 'main')
  const { loaded, bodyweight } = world.names
  const [loadedId, bodyweightId] = world.exercises.main

  // Running: started, two rounds checked off in order.
  await press(main.getByRole('button', { name: 'Start ladder', exact: true }), how)
  await pass(page, 40)
  await press(liveTile(main, 1), how)
  await pass(page, 20)
  await press(liveTile(main, 2), how)
  await expect(liveCount(main)).toHaveText('2 of 4 rounds completed')
  await press(main.getByRole('button', { name: 'Pause', exact: true }), how)
  await expectClock(page, 'main', { reading: '01:00', words: 'Paused' })

  // The current draft before Finish: the effort and the notes.
  let log = await openLog(main, how)
  await chooseEffort(log, 'Too hard', how)
  await notesOf(log).fill(NOTES_MAIN)
  await closeLog(page)
  let stored = await attemptOf(page, world.blocks.main)
  expect(stored.originalCapSeconds).toBe(MAIN_CAP_SECONDS)
  expect(stored.progress).toBe(2)
  expect(stored.draft).toMatchObject({ completed: null, effort: 'too_hard', notes: NOTES_MAIN })
  const attemptId = stored.identity.attemptId
  await pass(page, 120)
  await expectClock(page, 'main', { reading: '01:00', words: 'Paused' })

  // Reload while paused: the attempt, its pause, progress and draft come back.
  await reload(page)
  await hold(page)
  await expectClock(page, 'main', { reading: '01:00', words: 'Paused' })
  expect(await lifecycle(main)).toEqual(['Resume', 'Finish'])
  expect(await livePressed(main)).toEqual([1, 2])
  await expect(liveCount(main)).toHaveText('2 of 4 rounds completed')
  log = await openLog(main, how)
  expect(await shownDraft(log)).toEqual({ answer: [], rounds: null, effort: ['Too hard'], notes: NOTES_MAIN })
  await closeLog(page)
  // Paused for ten minutes more: no time passes on the ladder.
  await pass(page, 600)
  await expectClock(page, 'main', { reading: '01:00', words: 'Paused' })
  expect((await attemptOf(page, world.blocks.main)).identity.attemptId).toBe(attemptId)

  // Resumed: 01:00 → 01:30; round 3 checked; the accidental Finish.
  await press(main.getByRole('button', { name: 'Resume', exact: true }), how)
  await pass(page, 30)
  await expectClock(page, 'main', { reading: '01:30', words: 'Racing the clock' })
  await press(liveTile(main, 3), how)
  await press(main.getByRole('button', { name: 'Finish', exact: true }), how)
  await expectClock(page, 'main', { reading: '01:30', words: 'Finished' })
  log = await openLog(main, how)
  expect(await shownDraft(log)).toEqual({ answer: ['Incomplete'], rounds: [1, 2, 3], effort: ['Too hard'], notes: NOTES_MAIN })
  await expect(undoOf(log)).toBeVisible()
  // The next round's partials and the actual load: never the plan's.
  await expect(amountOf(log, 4, loaded)).toHaveValue('')
  await expect(weightOf(log, loaded)).toHaveValue('')
  await amountOf(log, 4, loaded).fill('5')
  await amountOf(log, 4, bodyweight).fill('0')
  await weightOf(log, loaded).fill('18')
  const unit = await loadUnit(log, loaded)
  await closeLog(page)
  stored = await attemptOf(page, world.blocks.main)
  expect(stored.checkpoint).toEqual({ pausedAt: null, progress: 3, completed: null })
  expect(stored.draft?.movements).toEqual({ [loadedId]: { amount: '5', weight: '18' }, [bodyweightId]: { amount: '0', weight: '' } })
  const finishedAt = stored.clock.finishedAt
  expect(finishedAt).not.toBeNull()

  // Reload while finished: frozen at 01:30, the whole draft and the Undo kept.
  await pass(page, 20)
  await reload(page)
  await hold(page)
  await expectClock(page, 'main', { reading: '01:30', words: 'Finished' })
  expect(await lifecycle(main)).toEqual([])
  log = await openLog(main, how)
  expect(await shownDraft(log)).toEqual({ answer: ['Incomplete'], rounds: [1, 2, 3], effort: ['Too hard'], notes: NOTES_MAIN })
  await expect(amountOf(log, 4, loaded)).toHaveValue('5')
  await expect(amountOf(log, 4, bodyweight)).toHaveValue('0')
  await expect(weightOf(log, loaded)).toHaveValue('18')
  await expect(undoOf(log)).toBeVisible()
  await expect(failureOf(log)).toHaveCount(0)

  // Undo: the same attempt running on from the same start. The time spent
  // finished counts and none is granted; the original cap stays.
  const before = await attemptOf(page, world.blocks.main)
  await press(undoOf(log), how)
  await expect(page.locator('dialog.clr-accepted-log[open]')).toHaveCount(0)
  const undone = await attemptOf(page, world.blocks.main)
  expect(undone.clock.startedAt).toBe(before.clock.startedAt)
  expect(undone.clock.finishedAt).toBeNull()
  expect(undone.clock.pausedAt).toBeUndefined()
  expect(undone.originalCapSeconds).toBe(MAIN_CAP_SECONDS)
  expect(undone.identity.attemptId).toBe(attemptId)
  const resumedAt = await expectRunningFrom(page, 'main', undone.clock.startedAt!, 'after Undo')
  expect(resumedAt).toBeGreaterThanOrEqual(90 + 20)
  expect(resumedAt).toBeLessThan(MAIN_CAP_SECONDS)
  expect(await lifecycle(main)).toEqual(['Pause', 'Finish'])
  expect(await livePressed(main)).toEqual([1, 2, 3])
  log = await openLog(main, how)
  // The answer is back to before Finish (none); the entries stay.
  expect(await shownDraft(log)).toEqual({ answer: [], rounds: null, effort: ['Too hard'], notes: NOTES_MAIN })
  await closeLog(page)
  expect(undone.draft?.movements).toEqual({ [loadedId]: { amount: '5', weight: '18' }, [bodyweightId]: { amount: '0', weight: '' } })

  // Finish again at the same round: the entries come back with it.
  await press(main.getByRole('button', { name: 'Finish', exact: true }), how)
  log = await openLog(main, how)
  expect(await shownDraft(log)).toEqual({ answer: ['Incomplete'], rounds: [1, 2, 3], effort: ['Too hard'], notes: NOTES_MAIN })
  await expect(amountOf(log, 4, loaded)).toHaveValue('5')
  await expect(weightOf(log, loaded)).toHaveValue('18')
  await expect(undoOf(log)).toBeVisible()
  await closeLog(page)
  expect(sent).toEqual([])

  // The save is refused: the athlete stays; the draft, progress and Undo are
  // kept; the log says so; nothing is stored.
  await release(page)
  faults.refuse('block_results', world.blocks.main)
  await forward(page, how)
  await expectNotSaved(page, how)
  log = await openLog(main, how)
  await expect(failureOf(log)).toHaveText(SAVE_FAILED)
  expect(await shownDraft(log)).toEqual({ answer: ['Incomplete'], rounds: [1, 2, 3], effort: ['Too hard'], notes: NOTES_MAIN })
  await expect(undoOf(log)).toBeVisible()
  await closeLog(page)
  expect((await attemptOf(page, world.blocks.main)).save.status).toBe('failed')
  expect(await world.blockRows()).toEqual([])

  // Reloaded after the failure: still unsaved, still said, still undoable.
  await reload(page)
  log = await openLog(main, how)
  await expect(failureOf(log)).toHaveText(SAVE_FAILED)
  expect(await shownDraft(log)).toEqual({ answer: ['Incomplete'], rounds: [1, 2, 3], effort: ['Too hard'], notes: NOTES_MAIN })
  await expect(amountOf(log, 4, loaded)).toHaveValue('5')
  await expect(undoOf(log)).toBeVisible()
  await expect(cardOf(page, 'main').getByText('Block saved')).toHaveCount(0)
  await closeLog(page)

  // The retry: each row once; Undo is gone at once.
  await forward(page, how)
  await expectAtCooldown(page)
  faults.spent()
  expect(await trail(sent, 'block_results', world.blocks.main)).toEqual(['POST 503', 'POST 201'])
  expect(await trail(sent, 'block_movement_results', loadedId)).toEqual(['POST 201'])
  expect(await trail(sent, 'block_movement_results', bodyweightId)).toEqual(['POST 201'])
  expect(await trail(sent, 'block_results', world.blocks.second)).toEqual(['POST 201'])
  const savedAttempt = await attemptOf(page, world.blocks.main)
  expect(savedAttempt.save).toMatchObject({ status: 'saved', source: 'save' })
  expect(savedAttempt.checkpoint).toBeNull()
  const rows = await world.blockRows()
  expect(rows).toHaveLength(2)
  expect(blockColumns(rows.find((row) => row.block_id === world.blocks.main))).toEqual({
    highest_rung: 3, effort: 'too_hard', notes: NOTES_MAIN, perceived_effort: null,
    elapsed_seconds: null, completed_under_cap: null, rounds_completed: null,
  })
  expect(blockColumns(rows.find((row) => row.block_id === world.blocks.second))).toMatchObject({ highest_rung: null, effort: null, notes: null })
  const movements = await world.movementRows()
  expect(movements).toHaveLength(2)
  expect(movementColumns(movements.find((row) => row.workout_exercise_id === loadedId))).toEqual({
    round_number: 4, actual_reps: 5, actual_duration_seconds: null, actual_distance: null, weight: 18, weight_unit: unit,
  })
  expect(movementColumns(movements.find((row) => row.workout_exercise_id === bodyweightId))).toMatchObject({
    round_number: 4, actual_reps: 0, weight: null,
  })

  // Back to the saved section: the saved result, not a draft or nothing.
  const writes = sent.length
  await page.getByRole('button', { name: 'Previous', exact: true }).click()
  await expect(page.getByText(MAIN_TIMING_LINE, { exact: true })).toBeVisible()
  await expectSavedCard(cardOf(page, 'main'))
  log = await openLog(cardOf(page, 'main'), how)
  expect(await shownDraft(log)).toEqual({ answer: ['Incomplete'], rounds: [1, 2, 3], effort: ['Too hard'], notes: NOTES_MAIN })
  await expect(amountOf(log, 4, loaded)).toHaveValue('5')
  await expect(amountOf(log, 4, bodyweight)).toHaveValue('0')
  await expect(weightOf(log, loaded)).toHaveValue('18')
  await expectSavedLog(log)
  await closeLog(page)

  // Reloaded: the saved row is read back from the server as the authority.
  await reload(page)
  const reread = cardOf(page, 'main')
  await expectSavedCard(reread)
  log = await openLog(reread, how)
  expect(await shownDraft(log)).toEqual({ answer: ['Incomplete'], rounds: [1, 2, 3], effort: ['Too hard'], notes: NOTES_MAIN })
  await expect(amountOf(log, 4, loaded)).toHaveValue('5')
  await expect(amountOf(log, 4, bodyweight)).toHaveValue('0')
  await expect(weightOf(log, loaded)).toHaveValue('18')
  await expectSavedLog(log)
  await closeLog(page)
  expect(sent.length).toBe(writes)
  expect(await world.blockRows()).toHaveLength(2)
  expect(await world.movementRows()).toHaveLength(2)
  world.assertContained()
}

// ─────────────────────────────────────────────────────────────────────────────
// Journey 2 — a partly refused save, reloaded, restated; a later block refused
// ─────────────────────────────────────────────────────────────────────────────

/**
 * AC-R032-01/03 and the saved result's authority (AC-R032-02): the second
 * ladder finishes through round 1 with a partial for round 2; the main ladder
 * runs every round, finishes Complete with an effort and a load. The main
 * ladder's block row lands while its movement write is refused: the log says
 * so and keeps every entry. A reload finds the row — and the attempt is not
 * hidden behind "Block saved": its own save failed, so the block is reopened
 * with its draft, its Undo and the failure. The retry restates the row once
 * (POST 409 → PATCH) and writes the movement once, while the second ladder's
 * save is refused: the just-saved main ladder shows what it saved, no Undo;
 * the second keeps its draft. The last retry writes it once; a reload reads
 * both back from their rows.
 */
async function journeyPartial(page: Page, world: World, visit: (path: string) => Promise<void>, how: How) {
  const sent = recordWrites(page)
  const faults = await installFaults(page)
  await page.clock.install({ time: world.start })
  await openLadders(page, visit)
  await hold(page)
  const main = cardOf(page, 'main')
  const second = cardOf(page, 'second')
  const { loaded, bodyweight } = world.names
  const [loadedId] = world.exercises.main
  const [secondId] = world.exercises.second

  // The second ladder: round 1 checked, Finish, round 2's partial.
  await press(second.getByRole('button', { name: 'Start ladder', exact: true }), how)
  await pass(page, 30)
  await press(liveTile(second, 1), how)
  await press(second.getByRole('button', { name: 'Finish', exact: true }), how)
  let log = await openLog(second, how)
  expect(await shownDraft(log)).toEqual({ answer: ['Incomplete'], rounds: [1], effort: [], notes: '' })
  await amountOf(log, 2, bodyweight).fill('4')
  await closeLog(page)

  // The main ladder: every round, Finish → Complete; an effort and a load.
  await press(main.getByRole('button', { name: 'Start ladder', exact: true }), how)
  await pass(page, 45)
  await press(liveTile(main, 4), how)
  await expect(liveCount(main)).toHaveText('4 of 4 rounds completed')
  await press(main.getByRole('button', { name: 'Finish', exact: true }), how)
  log = await openLog(main, how)
  expect(await shownDraft(log)).toEqual({ answer: ['Complete'], rounds: [1, 2, 3, 4], effort: [], notes: '' })
  await chooseEffort(log, 'About right', how)
  await expect(log.getByRole('spinbutton', { name: new RegExp(`^Round \\d+ · ${loaded}$`) })).toHaveCount(0)
  await weightOf(log, loaded).fill('20')
  const unit = await loadUnit(log, loaded)
  await closeLog(page)

  // The main ladder's block row lands; its movement write is refused.
  await release(page)
  faults.refuse('block_movement_results', loadedId)
  await forward(page, how)
  await expectNotSaved(page, how)
  expect(await trail(sent, 'block_results', world.blocks.main)).toEqual(['POST 201'])
  expect(await trail(sent, 'block_movement_results', loadedId)).toEqual(['POST 503'])
  expect(await trail(sent, 'block_results', world.blocks.second)).toEqual([])
  log = await openLog(main, how)
  await expect(failureOf(log)).toHaveText(SAVE_FAILED)
  expect(await shownDraft(log)).toEqual({ answer: ['Complete'], rounds: [1, 2, 3, 4], effort: ['About right'], notes: '' })
  await expect(weightOf(log, loaded)).toHaveValue('20')
  await closeLog(page)
  await expect(main.getByText('Block saved')).toHaveCount(0)
  expect((await world.blockRows()).map((row) => row.block_id)).toEqual([world.blocks.main])
  expect(await world.movementRows()).toEqual([])

  // A reload: the server has the block row, but this attempt's own save
  // failed — its draft, Undo and failure are kept, not "Block saved".
  await reload(page)
  await expect(main.getByText('Block saved')).toHaveCount(0)
  log = await openLog(main, how)
  await expect(failureOf(log)).toHaveText(SAVE_FAILED)
  expect(await shownDraft(log)).toEqual({ answer: ['Complete'], rounds: [1, 2, 3, 4], effort: ['About right'], notes: '' })
  await expect(weightOf(log, loaded)).toHaveValue('20')
  await expect(weightOf(log, loaded)).toBeEnabled()
  await expect(undoOf(log)).toBeVisible()
  log = await openLog(second, how)
  expect(await shownDraft(log)).toEqual({ answer: ['Incomplete'], rounds: [1], effort: [], notes: '' })
  await expect(amountOf(log, 2, bodyweight)).toHaveValue('4')
  await closeLog(page)
  expect((await attemptOf(page, world.blocks.main)).save.status).toBe('failed')

  // The retry restates the main row once and writes its movement once; the
  // second ladder's save is refused.
  faults.refuse('block_results', world.blocks.second)
  await forward(page, how)
  await expectNotSaved(page, how)
  expect(await trail(sent, 'block_results', world.blocks.main)).toEqual(['POST 201', 'POST 409', 'PATCH 200'])
  expect(await trail(sent, 'block_movement_results', loadedId)).toEqual(['POST 503', 'POST 201'])
  expect(await trail(sent, 'block_results', world.blocks.second)).toEqual(['POST 503'])

  // The just-saved main ladder shows what it saved, with no Undo, while the
  // later block's save has failed.
  await expectSavedCard(main)
  log = await openLog(main, how)
  expect(await shownDraft(log)).toEqual({ answer: ['Complete'], rounds: [1, 2, 3, 4], effort: ['About right'], notes: '' })
  await expect(weightOf(log, loaded)).toHaveValue('20')
  await expectSavedLog(log)
  // The second keeps its draft and its Undo, and says it did not save.
  log = await openLog(second, how)
  await expect(failureOf(log)).toHaveText(SAVE_FAILED)
  expect(await shownDraft(log)).toEqual({ answer: ['Incomplete'], rounds: [1], effort: [], notes: '' })
  await expect(amountOf(log, 2, bodyweight)).toHaveValue('4')
  await expect(undoOf(log)).toBeVisible()
  await closeLog(page)

  // The last retry writes the second ladder once.
  await forward(page, how)
  await expectAtCooldown(page)
  faults.spent()
  expect(await trail(sent, 'block_results', world.blocks.second)).toEqual(['POST 503', 'POST 201'])
  expect(await trail(sent, 'block_movement_results', secondId)).toEqual(['POST 201'])
  expect(await trail(sent, 'block_results', world.blocks.main)).toEqual(['POST 201', 'POST 409', 'PATCH 200'])
  const rows = await world.blockRows()
  expect(rows).toHaveLength(2)
  expect(blockColumns(rows.find((row) => row.block_id === world.blocks.main))).toMatchObject({ highest_rung: 4, effort: 'about_right', notes: null, perceived_effort: null })
  expect(blockColumns(rows.find((row) => row.block_id === world.blocks.second))).toMatchObject({ highest_rung: 1, effort: null, notes: null })
  const movements = await world.movementRows()
  expect(movements).toHaveLength(2)
  expect(movementColumns(movements.find((row) => row.workout_exercise_id === loadedId))).toEqual({
    round_number: null, actual_reps: null, actual_duration_seconds: null, actual_distance: null, weight: 20, weight_unit: unit,
  })
  expect(movementColumns(movements.find((row) => row.workout_exercise_id === secondId))).toMatchObject({ round_number: 2, actual_reps: 4, weight: null })

  // A reload reads both back from their rows; nothing is written again.
  const writes = sent.length
  await reload(page)
  for (const [name, expected] of [
    ['main', { answer: ['Complete'], rounds: [1, 2, 3, 4], effort: ['About right'], notes: '' }],
    ['second', { answer: ['Incomplete'], rounds: [1], effort: [], notes: '' }],
  ] as const) {
    const card = cardOf(page, name)
    await expectSavedCard(card)
    log = await openLog(card, how)
    expect(await shownDraft(log)).toEqual(expected)
    await expectSavedLog(log)
  }
  await expect(amountOf(log, 2, bodyweight)).toHaveValue('4')
  await closeLog(page)
  expect(sent.length).toBe(writes)
  world.assertContained()
}

// ─────────────────────────────────────────────────────────────────────────────
// The cases
// ─────────────────────────────────────────────────────────────────────────────

test.describe('TASK-048 visible ladder recovery and accidental-Finish restoration', () => {
  test('JOURNEY-032 backend lane touch phone-390: a running and a paused ladder’s ordered progress, whole draft and accidental Finish recover across reloads; Undo resumes from the original start inside the original cap with nothing granted; a refused save keeps the draft and Undo and says so across a reload; the retry writes each row once, Undo is gone, and the saved row is read back after a reload', async ({ page, visit }, testInfo) => {
    test.setTimeout(300_000)
    await page.setViewportSize({ width: 390, height: 844 })
    const { world, cleanup } = await backendWorld(page, testInfo, { skin: 'signal', reducedMotion: false })
    try {
      await journeyRecovery(page, world, visit, 'tap')
    } finally {
      await cleanup()
    }
  })

  test('JOURNEY-032 backend lane keyboard phone-320 reduced motion: a save whose block row landed while its movement write was refused is not hidden behind Block saved after a reload — the draft, Undo and failure are kept and the retry restates the row once; a just-saved ladder shows its saved result while a later block’s save fails; both are read back from their rows after a reload', async ({ page, visit }, testInfo) => {
    test.setTimeout(300_000)
    await page.setViewportSize({ width: 320, height: 568 })
    const { world, cleanup } = await backendWorld(page, testInfo, { skin: 'clear', reducedMotion: true })
    try {
      await journeyPartial(page, world, visit, 'keyboard')
    } finally {
      await cleanup()
    }
  })

  test('JOURNEY-032 synthetic lane touch phone-390: the same running, paused, accidental-Finish, refused-save and readback journey over a contained PostgREST double (not backend proof)', async ({ page, visit }) => {
    test.setTimeout(300_000)
    await page.setViewportSize({ width: 390, height: 844 })
    const world = await syntheticWorld(page, { skin: 'signal', reducedMotion: false })
    await journeyRecovery(page, world, visit, 'tap')
  })

  test('JOURNEY-032 synthetic lane keyboard phone-320 reduced motion: the same partly refused save, reload, restatement and later-block failure journey over a contained PostgREST double (not backend proof)', async ({ page, visit }) => {
    test.setTimeout(300_000)
    await page.setViewportSize({ width: 320, height: 568 })
    const world = await syntheticWorld(page, { skin: 'clear', reducedMotion: true })
    await journeyPartial(page, world, visit, 'keyboard')
  })

  test('AC-R032-02 deterministic clocks phone-390: Undo is offered until undoing would resume at the original cap and withdrawn at it; a paused ladder closed for hours comes back paused and frozen; a running ladder closed past its cap comes back capped with its progress carried and no Resume or Undo; a real tab close and reopen and a dropped then regained connection keep every draft; the retry saves each row once', async ({ page, visit, context }) => {
    test.setTimeout(300_000)
    await page.setViewportSize({ width: 390, height: 844 })
    const world = await syntheticWorld(page, { skin: 'clear', reducedMotion: false })
    const sent: Sent[] = []
    recordWrites(page, sent)
    await page.clock.install({ time: world.start })
    await openLadders(page, visit)
    await hold(page)
    let main = cardOf(page, 'main')
    let second = cardOf(page, 'second')

    // Pre/post-expiry: the main ladder finished ten seconds before its 06:00
    // cap. Undo is offered at 05:59 of the would-be clock and withdrawn at
    // 06:00, with nothing pressed; the Finish keeps its 05:50.
    await main.getByRole('button', { name: 'Start ladder', exact: true }).tap()
    await liveTile(main, 2).tap()
    await page.clock.fastForward((MAIN_CAP_SECONDS - 20) * 1000)
    await pass(page, 10)
    await main.getByRole('button', { name: 'Finish', exact: true }).tap()
    await expectClock(page, 'main', { reading: reading(MAIN_CAP_SECONDS - 10), words: 'Finished' })
    let log = await openLog(main, 'tap')
    await expect(undoOf(log)).toBeVisible()
    await pass(page, 9)
    await expect(undoOf(log)).toBeVisible()
    await pass(page, 1)
    await expect(undoOf(log)).toHaveCount(0)
    await expectClock(page, 'main', { reading: reading(MAIN_CAP_SECONDS - 10), words: 'Finished' })
    // The log stays editable: corrected to round 3.
    expect(await shownDraft(log)).toEqual({ answer: ['Incomplete'], rounds: [1, 2], effort: [], notes: '' })
    await resultTile(log, 'main', 3).tap()
    await notesOf(log).fill('Ran out of time.')
    await closeLog(page)
    expect(await lifecycle(main)).toEqual([])

    // The second ladder: started, round 1, paused at 01:00.
    await second.getByRole('button', { name: 'Start ladder', exact: true }).tap()
    await pass(page, 30)
    await liveTile(second, 1).tap()
    await pass(page, 30)
    await second.getByRole('button', { name: 'Pause', exact: true }).tap()
    await expectClock(page, 'second', { reading: '01:00', words: 'Paused' })
    log = await openLog(second, 'tap')
    await chooseEffort(log, 'Too easy', 'tap')
    await closeLog(page)

    // The tab is closed; two hours later it is opened again. (The fake clock
    // is the browser context's: it runs on while no tab is open, and the
    // reopened tab finds the wall clock two hours on.)
    await release(page)
    const closedAt = await page.evaluate(() => Date.now())
    await page.close()
    let tab = await context.newPage()
    await tab.setViewportSize({ width: 390, height: 844 })
    await world.preparePage(tab)
    recordWrites(tab, sent)
    await tab.clock.setSystemTime(closedAt + 2 * 60 * 60 * 1000)
    await tab.goto('/workout')
    await expect(tab.getByText(MAIN_TIMING_LINE, { exact: true })).toBeVisible({ timeout: 30_000 })
    await hold(tab)
    main = cardOf(tab, 'main')
    second = cardOf(tab, 'second')
    // A paused clock never runs out: still 01:00, its round and effort kept.
    await expectClock(tab, 'second', { reading: '01:00', words: 'Paused' })
    expect(await lifecycle(second)).toEqual(['Resume', 'Finish'])
    expect(await livePressed(second)).toEqual([1])
    log = await openLog(second, 'tap')
    expect(await chosen(effortOf(log))).toEqual(['Too easy'])
    await closeLog(tab)
    // The expired Finish stays frozen, its Undo gone for good, its edit kept.
    await expectClock(tab, 'main', { reading: reading(MAIN_CAP_SECONDS - 10), words: 'Finished' })
    log = await openLog(main, 'tap')
    await expect(undoOf(log)).toHaveCount(0)
    expect(await shownDraft(log)).toEqual({ answer: ['Incomplete'], rounds: [1, 2, 3], effort: [], notes: 'Ran out of time.' })
    await closeLog(tab)

    // Resumed at 01:00; round 2 checked; the tab closed while it runs.
    await second.getByRole('button', { name: 'Resume', exact: true }).tap()
    await pass(tab, 5)
    await liveTile(second, 2).tap()
    const startedSecond = (await attemptOf(tab, world.blocks.second)).clock.startedAt!
    await release(tab)
    const runningAt = await tab.evaluate(() => Date.now())
    await tab.close()
    tab = await context.newPage()
    await tab.setViewportSize({ width: 390, height: 844 })
    await world.preparePage(tab)
    recordWrites(tab, sent)
    // Fifteen minutes later: past the 10:00 cap while closed.
    await tab.clock.setSystemTime(runningAt + 15 * 60 * 1000)
    await tab.goto('/workout')
    await expect(tab.getByText(SECOND_TIMING_LINE, { exact: true })).toBeVisible({ timeout: 30_000 })
    await hold(tab)
    main = cardOf(tab, 'main')
    second = cardOf(tab, 'second')
    // Capped, never resumed: no Pause, Resume or Finish; the progress carried
    // into the log; the cap is never undone; the effort kept.
    await expectClock(tab, 'second', { reading: reading(SECOND_CAP_SECONDS), words: 'Cap reached' })
    expect(await lifecycle(second)).toEqual([])
    expect((await attemptOf(tab, world.blocks.second)).clock.startedAt).toBe(startedSecond)
    log = await openLog(second, 'tap')
    expect(await shownDraft(log)).toEqual({ answer: ['Incomplete'], rounds: [1, 2], effort: ['Too easy'], notes: '' })
    await expect(undoOf(log)).toHaveCount(0)
    await closeLog(tab)
    await pass(tab, 60)
    await expectClock(tab, 'second', { reading: reading(SECOND_CAP_SECONDS), words: 'Cap reached' })

    // The connection drops at the save: the athlete stays, every draft is kept.
    await release(tab)
    const faults = await installFaults(tab)
    faults.drop()
    await forward(tab, 'tap')
    await expectNotSaved(tab, 'tap')
    log = await openLog(main, 'tap')
    await expect(failureOf(log)).toHaveText(SAVE_FAILED)
    expect(await shownDraft(log)).toEqual({ answer: ['Incomplete'], rounds: [1, 2, 3], effort: [], notes: 'Ran out of time.' })
    await closeLog(tab)
    expect(await world.blockRows()).toEqual([])
    // Regained: the retry saves each ladder once, with its draft as kept.
    faults.regain()
    await forward(tab, 'tap')
    await expectAtCooldown(tab)
    // The dropped attempt never reached the store; the later ladder was not
    // attempted until the retry.
    expect(await trail(sent, 'block_results', world.blocks.main)).toEqual(['POST lost', 'POST 201'])
    expect(await trail(sent, 'block_results', world.blocks.second)).toEqual(['POST 201'])
    expect(await trail(sent, 'block_movement_results', world.exercises.second[0])).toEqual([])
    const rows = await world.blockRows()
    expect(blockColumns(rows.find((row) => row.block_id === world.blocks.main))).toMatchObject({ highest_rung: 3, notes: 'Ran out of time.', effort: null })
    expect(blockColumns(rows.find((row) => row.block_id === world.blocks.second))).toMatchObject({ highest_rung: 2, effort: 'too_easy' })
    for (const blockId of [world.blocks.main, world.blocks.second]) {
      expect(await attemptOf(tab, blockId)).toMatchObject({ checkpoint: null, save: { status: 'saved', source: 'save' } })
    }
    world.assertContained()
  })

  test('AC-R032-01 gallery ladder-4 and ladder-12 phone-390: the route’s own LadderBlock keeps the whole draft — rounds, effort and notes — through close and reopen of its log, Finish and Undo, over memory only with nothing stored and no network', async ({ page, visit }) => {
    test.setTimeout(180_000)
    await page.setViewportSize({ width: 390, height: 844 })
    const network: string[] = []
    page.on('request', (request) => {
      if (/\/(rest|auth|functions)\/v1\//.test(request.url())) network.push(`${request.method()} ${request.url()}`)
    })
    await installDeterministicCapture(page, { skin: 'clear', reducedMotion: false })
    for (const state of ['ladder-4', 'ladder-12'] as const) {
      await visit(`/gallery/refinements?state=${state}`)
      const root = page.locator(`[data-refinement-state="${state}"]`)
      const storedBefore = await page.evaluate(() => Object.keys(localStorage).sort())
      await root.getByRole('button', { name: 'Start ladder', exact: true }).tap()
      await liveTile(root, 2).tap()
      await expect(liveCount(root)).toHaveText(new RegExp(`^2 of ${state === 'ladder-4' ? 4 : 12} rounds completed$`))
      // Before Finish: an effort and notes, kept through close and reopen.
      let log = await openLog(root, 'tap')
      await chooseEffort(log, 'Too easy', 'tap')
      await notesOf(log).fill(`Gallery ${state} note.`)
      await closeLog(page)
      log = await openLog(root, 'tap')
      expect(await shownDraft(log)).toEqual({ answer: [], rounds: null, effort: ['Too easy'], notes: `Gallery ${state} note.` })
      await closeLog(page)
      // Finish, then Undo: the draft is kept through both.
      await root.getByRole('button', { name: 'Finish', exact: true }).tap()
      log = await openLog(root, 'tap')
      expect(await shownDraft(log)).toEqual({ answer: ['Incomplete'], rounds: [1, 2], effort: ['Too easy'], notes: `Gallery ${state} note.` })
      await undoOf(log).tap()
      await expect(page.locator('dialog.clr-accepted-log[open]')).toHaveCount(0)
      expect(await lifecycle(root)).toEqual(['Pause', 'Finish'])
      expect(await livePressed(root)).toEqual([1, 2])
      log = await openLog(root, 'tap')
      expect(await shownDraft(log)).toEqual({ answer: [], rounds: null, effort: ['Too easy'], notes: `Gallery ${state} note.` })
      await expect(failureOf(log)).toHaveCount(0)
      await closeLog(page)
      expect(await page.evaluate(() => Object.keys(localStorage).sort())).toEqual(storedBefore)
      expect(await page.evaluate((key) => localStorage.getItem(key), LADDER_KEY)).toBeNull()
    }
    expect(network).toEqual([])
  })
})
