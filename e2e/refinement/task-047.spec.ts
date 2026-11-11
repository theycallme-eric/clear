import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createServer, type AddressInfo } from 'node:net'
import { resolve } from 'node:path'
import type { Locator, Page, Request, Route, TestInfo } from '@playwright/test'

import { readE2eEnv } from '../../scripts/e2e/env.mjs'
import { namespaceId } from '../../scripts/e2e/namespace.mjs'
import { sessionAcceptanceSchema, sessionSnapshotSchema, type SessionSnapshot } from '../../src/state/schemas'
import { formatBadgesSnapshot } from '../../src/test/format-badges-fixture'
import {
  READBACK_PLANNED_LOAD,
  READBACK_SYNTHETIC_CATALOG,
  READBACK_TITLE,
  READBACK_WORK_LISTS,
  readbackName,
  timedReadbackAcceptance,
  type ReadbackCatalog,
} from '../../src/test/timed-readback-fixture'
import { fixtureLocation, onboardedProfile } from '../../src/test/user-data-double'
import { installDeterministicCapture } from '../design-0143/fixtures'
import { expect, test as scanned } from '../fixtures'
import { backend } from '../support/backend'

/**
 * TASK-047 (REQ-031; AC-R031-01, AC-R031-02, AC-R031-03; JOURNEY-031, completion
 * owner) — visible timed-result persistence and History readback on the real
 * route `/workout` → `/summary` → `/history/:id`.
 *
 * Entry (ENTRY-031): a started session whose first section holds the four timed
 * families — EMOM, AMRAP, a single-pass For Time and a three-rung ladder — each
 * with one loaded and one bodyweight movement, then a cooldown
 * (`src/test/timed-readback-fixture.ts`). Action: end each attempt, enter the
 * per-movement partials and actual loads, the categorical effort and the notes
 * in each block's log, save with the section's forward action, survive an
 * explicit refused write and a write whose answer is lost, retry, finish the
 * workout, then open the saved result in History and reload it.
 *
 * Two lanes run the same journey body:
 *
 *   · **The authorized disposable backend lane** (PRE-001; the existing
 *     namespaced throwaway-user pattern of `e2e/design-0143/workout-*.spec.ts`):
 *     a confirmed user under this run's namespace, its onboarding, the
 *     session persisted through the real `persist_session` and started
 *     through `start_session`, the app's own writers against the hosted
 *     project (MIG-A and MIG-B applied by the owner's LIVE-PRE-1), and the
 *     saved rows read back with the service role filtered to this user's own
 *     block and movement ids only. The user is deleted at the end, which
 *     removes every row it owns. Faults are injected in the browser only: a
 *     refused write is answered 503 and never forwarded; a lost answer is
 *     forwarded (the row is written) and its answer withheld. **A missing
 *     backend fails the case; it is never a skipped proof.**
 *   · **A contained synthetic lane** answering as PostgREST does (the unique
 *     keys' 23505, PATCH restates, the performed read returns what was
 *     written), which proves the same screens and requests anywhere but is
 *     not backend proof.
 *
 * What is proved, in both lanes, from the requests the app sent, the rows that
 * hold, and what Summary and History render:
 *
 *   · every entered value lands on the right block, round and movement — the
 *     AMRAP's partials in the round after its recorded count, the single-pass
 *     For Time's in round 1, the ladder's in the rung after the stated prefix,
 *     the EMOM's loads with no round; the category as `effort` (never a
 *     number), the notes as `notes`;
 *   · an entered 0 is a zero and a blank movement has no row;
 *   · a refused write keeps every entry and the athlete on the section; the
 *     retry writes each row once; a lost answer is restated (23505 → PATCH)
 *     with the values changed since, never duplicated;
 *   · Summary is reached, and History reads back the actual entries — not the
 *     plan's targets or loads — before and after a reload.
 */

const e2e = readE2eEnv()
const SYNTHETIC_ORIGIN_NEEDED = !e2e.usesExternalTarget && (e2e.url === null || e2e.anonKey === null)
const REPO_ROOT = resolve(import.meta.dirname, '..', '..')
const SESSION_KEY = 'clear.auth.session'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
}

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
    if (code !== null) throw new Error(`Synthetic TASK-047 server exited (${code}) before ${origin} was ready`)
    try {
      if ((await fetch(origin)).ok && (await fetch(own)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((settle) => setTimeout(settle, 250))
  }
  throw new Error(`Synthetic TASK-047 origin ${origin} did not start`)
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
          VITE_SUPABASE_URL: 'https://synthetic-task-047.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-task-047-public-placeholder',
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
type Family = 'emom' | 'amrap' | 'forTime' | 'ladder'
const FAMILIES: readonly Family[] = ['emom', 'amrap', 'forTime', 'ladder']
type Table = 'block_results' | 'block_movement_results'

interface World {
  readonly lane: 'synthetic' | 'backend'
  readonly sessionId: string
  /** `workout_blocks.id` of each timed block. */
  readonly blocks: Readonly<Record<Family, string>>
  /** Each timed block's `workout_exercises.id`s: [loaded, bodyweight]. */
  readonly exercises: Readonly<Record<Family, readonly [string, string]>>
  readonly names: { readonly loaded: string; readonly bodyweight: string }
  /** The stored `block_results` rows of this session's blocks. */
  blockRows(): Promise<Row[]>
  /** The stored `block_movement_results` rows of this session's movements. */
  movementRows(): Promise<Row[]>
  /** Lets the write reach its store, then withholds the answer from the app. */
  applyThenLose(route: Route): Promise<void>
  /** Anything the journey must not have done. */
  assertContained(): void
}

const UNIQUE_VIOLATION = { code: '23505', message: 'duplicate key value violates unique constraint', details: null, hint: null }

/** Strips PostgREST's `eq.` from a filter value. */
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
 * returning exactly what was written. Anything else fails the case.
 */
async function syntheticWorld(page: Page, options: { skin: 'clear' | 'signal'; reducedMotion: boolean }): Promise<World> {
  const owner = '00000000-0000-4000-8000-000000004701'
  const place = '00000000-0000-4000-8000-000000004711'
  const acceptance = timedReadbackAcceptance(READBACK_SYNTHETIC_CATALOG, { locationId: place })
  const started: SessionSnapshot = sessionSnapshotSchema.parse(formatBadgesSnapshot(acceptance, {
    userId: owner,
    startedAt: new Date(Date.now() - 60_000).toISOString(),
  }))
  let completedAt: string | null = null
  const snapshot = (): SessionSnapshot => completedAt === null ? started : {
    ...started,
    state: 'completed',
    session: { ...started.session, completed_at: completedAt, actual_duration_mins: 12 },
  }
  const blockRows = new Map<string, Row>()
  const movementRows = new Map<string, Row>()
  const unexpected: string[] = []
  let minted = 0
  const mint = () => `00000000-0000-4000-8000-${String(4700 + (minted += 1)).padStart(12, '0')}`
  const guard = await installDeterministicCapture(page, { skin: options.skin, reducedMotion: options.reducedMotion })

  /** Applies one write to the store; the answer PostgREST would give. */
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
    return { status: 503, body: { code: 'PGRST000', message: 'Unexpected synthetic TASK-047 write.' } }
  }

  const reconstruction = () => {
    const current = snapshot()
    return {
      reconstruction: 'performed',
      as_of: current.session.completed_at ?? current.session.started_at,
      session: current.session,
      state: current.state,
      sections: current.sections.map((section) => ({
        ...section,
        blocks: section.blocks.map((block) => ({
          ...block,
          block_result: blockRows.get(block.block.id) ?? null,
          exercises: block.exercises.map((entry) => ({ ...entry, movement_result: movementRows.get(entry.exercise.id) ?? null })),
        })),
      })),
    }
  }

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
      if (name === 'workout_sessions') return reply([snapshot().session])
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
      if (name === 'resume_session' || name === 'session_snapshot') return reply(snapshot())
      if (name === 'session_as_performed') return reply(reconstruction())
      // History's other reading of the same session: the plan as it stood at
      // start, which carries no result of any kind.
      if (name === 'session_as_intended_at_start') {
        const planned = reconstruction()
        return reply({
          ...planned,
          reconstruction: 'intended_at_start',
          sections: planned.sections.map((section) => ({
            ...section,
            blocks: section.blocks.map((block) => ({
              ...block,
              block_result: null,
              exercises: block.exercises.map((entry) => ({ ...entry, movement_result: null })),
            })),
          })),
        })
      }
      if (name === 'complete_session') {
        completedAt = new Date().toISOString()
        return reply({ outcome: 'completed', state: 'completed', session: snapshot().session })
      }
      if (name === 'streak_sessions') {
        return reply(completedAt === null ? [] : [{ session_id: started.session.id, completed_at: completedAt, counts_for_streak: true }])
      }
      if (name === 'record_favorite_completion') return reply({ outcome: 'not_a_favorite' })
      if (['constraints_in_force', 'anchor_evidence', 'conditioning_history', 'set_load_anchors',
        'generation_refusal_diagnostics', 'generation_candidate_sets_for_goal', 'generation_candidate_sets'].includes(name)) return reply([])
    }
    unexpected.push(`${request.method()} ${url.pathname}`)
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic TASK-047 request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ key, user }) => {
    localStorage.setItem(key, JSON.stringify({
      accessToken: 'synthetic-task-047-session', refreshToken: 'synthetic-task-047-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: user, email: 'synthetic-task-047@example.invalid' },
    }))
  }, { key: SESSION_KEY, user: owner })

  const [timedSection] = started.sections
  const blockOf = (index: number) => timedSection.blocks[index]
  const pair = (index: number) => {
    const [loaded, bodyweight] = blockOf(index).exercises.map((entry) => entry.exercise.id)
    return [loaded, bodyweight] as const
  }
  return {
    lane: 'synthetic',
    sessionId: started.session.id,
    blocks: { emom: blockOf(0).block.id, amrap: blockOf(1).block.id, forTime: blockOf(2).block.id, ladder: blockOf(3).block.id },
    exercises: { emom: pair(0), amrap: pair(1), forTime: pair(2), ladder: pair(3) },
    names: { loaded: readbackName(READBACK_SYNTHETIC_CATALOG.loaded.id), bodyweight: readbackName(READBACK_SYNTHETIC_CATALOG.bodyweight.id) },
    // The timed section's four blocks only, as the backend lane reads them.
    blockRows: async () => [...blockRows.values()].filter((row) => timedSection.blocks.some((entry) => entry.block.id === row.block_id)),
    movementRows: async () => [...movementRows.values()],
    applyThenLose: async (route) => {
      apply(route.request())
      await route.abort('failed')
    },
    assertContained() {
      expect(unexpected, 'Every synthetic API request has an explicit disposition').toEqual([])
      expect(guard.blockedGenerations()).toBe(0)
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
 * The authorized disposable backend lane (PRE-001), following the existing
 * namespaced-user pattern exactly. Returns the world and its cleanup; the
 * cleanup deletes the user, which removes every row it owns. Nothing here
 * reads or writes a row that is not this user's.
 */
async function backendWorld(page: Page, testInfo: TestInfo, options: { skin: 'clear' | 'signal'; reducedMotion: boolean }): Promise<{ world: World; cleanup: () => Promise<void> }> {
  // The explicit precondition. A missing integration credential is a
  // failure, never a skipped proof: the controller's required run must not
  // pass a backend case it could not execute.
  expect(backend.available, `TASK-047 backend lane (PRE-001): ${backend.reason}`).toBe(true)
  testInfo.annotations.push({
    type: 'proof-mode',
    description: 'Trusted namespaced disposable-account integration (PRE-001); real hosted rows written by the app and read back; user deleted after.',
  })
  const guard = await installDeterministicCapture(page, { skin: options.skin, reducedMotion: options.reducedMotion })
  const client = backend.client()

  // MIG-A and MIG-B on the hosted project: zero-row reads check the columns
  // and the table exist without reading any athlete's row.
  must(await client.selectAsService('block_results', { select: 'id,effort', limit: '0' }), 'MIG-A boundary read')
  must(await client.selectAsService('block_movement_results', { select: 'id,round_number,weight,weight_unit', limit: '0' }), 'MIG-B boundary read')

  type Catalogued = { id: string; default_equipment: string }
  const [loaded] = must<Catalogued[]>(await client.selectAsService('exercise_definitions', {
    select: 'id,default_equipment', default_equipment: 'eq.dumbbells', order: 'id.asc', limit: '1',
  }), 'Loaded catalog read')
  const [bodyweight] = must<Catalogued[]>(await client.selectAsService('exercise_definitions', {
    select: 'id,default_equipment', default_equipment: 'eq.bodyweight', order: 'id.asc', limit: '1',
  }), 'Bodyweight catalog read')
  expect(loaded, 'a dumbbell movement in the disposable catalog').toBeDefined()
  expect(bodyweight, 'a bodyweight movement in the disposable catalog').toBeDefined()
  const catalog: ReadbackCatalog = {
    loaded: { id: loaded.id, equipment: loaded.default_equipment },
    bodyweight: { id: bodyweight.id, equipment: bodyweight.default_equipment },
  }

  const suffix = createHash('sha256').update(testInfo.titlePath.join('\0')).digest('hex').slice(0, 10)
  const email = `clear-e2e-${namespaceId()}-${testInfo.project.name}-t047-${suffix}@example.com`
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
    throw new Error('TASK-047 namespaced fixture authentication failed; no response body retained.')
  }
  if (userId === null) throw new Error('TASK-047 fixture user was not created.')
  const owner = userId
  const cleanup = async () => {
    await client.deleteUser(owner).catch(() => {
      throw new Error('TASK-047 scoped fixture cleanup failed.')
    })
  }

  try {
    must(await client.rpcAs('complete_onboarding', {
      p_location_name: 'TASK-047 gym', p_location_tier: 'full',
      p_equipment: [...new Set(['bodyweight', 'dumbbells', catalog.loaded.equipment, catalog.bodyweight.equipment])],
      p_experience_level: 'some', p_goal_preset: 'balanced',
      p_sections: ['warmup', 'primary_lift', 'cooldown'], p_avoid_patterns: [], p_note: null,
    }, token), 'Fixture onboarding')
    const [location] = must<Array<{ id: string }>>(await client.selectAsService('locations', {
      select: 'id', user_id: `eq.${owner}`, limit: '1',
    }), 'Fixture location read')
    const acceptance = sessionAcceptanceSchema.parse(timedReadbackAcceptance(catalog, {
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
    const timedSection = sections.find((section) => section.section_type === 'conditioning')
    if (timedSection === undefined) throw new Error('TASK-047 fixture has no conditioning section.')
    const blockRowsRead = must<Array<{ id: string; order_index: number; structure_type: string }>>(await client.selectAsService('workout_blocks', {
      select: 'id,order_index,structure_type', section_id: `eq.${timedSection.id}`, order: 'order_index.asc',
    }), 'Fixture block read')
    expect(blockRowsRead.map((block) => block.structure_type)).toEqual(['emom', 'amrap', 'for_time', 'for_time'])
    const blockIds = blockRowsRead.map((block) => block.id)
    const exerciseRows = must<Array<{ id: string; block_id: string; order_index: number }>>(await client.selectAsService('workout_exercises', {
      select: 'id,block_id,order_index', block_id: `in.(${blockIds.join(',')})`, order: 'order_index.asc',
    }), 'Fixture prescription read')
    const pair = (blockId: string) => {
      const ids = exerciseRows.filter((row) => row.block_id === blockId).sort((a, b) => a.order_index - b.order_index).map((row) => row.id)
      expect(ids).toHaveLength(2)
      return [ids[0], ids[1]] as const
    }
    const exerciseIds = exerciseRows.map((row) => row.id)

    await page.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), {
      key: SESSION_KEY,
      session: { accessToken: token, refreshToken, expiresAt: Date.now() + 60 * 60 * 1000, user: { id: owner, email } },
    })

    const world: World = {
      lane: 'backend',
      sessionId,
      blocks: { emom: blockIds[0], amrap: blockIds[1], forTime: blockIds[2], ladder: blockIds[3] },
      exercises: { emom: pair(blockIds[0]), amrap: pair(blockIds[1]), forTime: pair(blockIds[2]), ladder: pair(blockIds[3]) },
      names: { loaded: readbackName(catalog.loaded.id), bodyweight: readbackName(catalog.bodyweight.id) },
      blockRows: async () => must<Row[]>(await client.selectAsService('block_results', {
        select: 'id,block_id,elapsed_seconds,completed_under_cap,rounds_completed,partial_round_reps,minutes_completed,highest_rung,perceived_effort,notes,effort',
        block_id: `in.(${blockIds.join(',')})`,
      }), 'Block result read'),
      movementRows: async () => must<Row[]>(await client.selectAsService('block_movement_results', {
        select: 'id,workout_exercise_id,round_number,actual_reps,actual_duration_seconds,actual_distance,actual_distance_unit,weight,weight_unit',
        workout_exercise_id: `in.(${exerciseIds.join(',')})`,
      }), 'Movement result read'),
      applyThenLose: async (route) => {
        // Forwarded to the hosted project, so the row is written; the app
        // never receives the answer.
        await route.fetch()
        await route.abort('failed')
      },
      assertContained() {
        expect(guard.blockedGenerations()).toBe(0)
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
  /** The PATCH/DELETE key, or the POSTed row's key. */
  readonly key: string | null
  readonly body: Row | null
  readonly request: Request
}

/** Every write to the two timed tables, in order, exactly as sent. */
function recordWrites(page: Page): Sent[] {
  const sent: Sent[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    const match = /\/rest\/v1\/(block_results|block_movement_results)$/.exec(url.pathname)
    if (match === null || ['GET', 'HEAD', 'OPTIONS'].includes(request.method())) return
    const table = match[1] as Table
    const body = firstRow(request)
    const column = table === 'block_results' ? 'block_id' : 'workout_exercise_id'
    const key = request.method() === 'POST' ? String(body?.[column] ?? '') : filterValue(url, column)
    sent.push({ method: request.method(), table, key, body, request })
  })
  return sent
}

/** `POST 201`, `POST 409`, `POST lost`, `PATCH 200` … for one key. */
async function trail(sent: readonly Sent[], table: Table, key: string): Promise<string[]> {
  const mine = sent.filter((write) => write.table === table && write.key === key)
  return Promise.all(mine.map(async (write) => {
    const response = await write.request.response().catch(() => null)
    return `${write.method} ${response === null ? 'lost' : response.status()}`
  }))
}

interface Fault {
  readonly table: Table
  readonly key: string
  readonly kind: 'refuse' | 'lose'
}

/**
 * Faults injected in the browser, ahead of either lane: a refused write is
 * answered 503 and never forwarded; a lost answer lets the write land and
 * withholds its answer. Each fault fires once, on the first POST of its key.
 */
async function installFaults(page: Page, world: World) {
  const pending: Fault[] = []
  await page.route(/\/rest\/v1\/(block_results|block_movement_results)(\?.*)?$/, async (route) => {
    const request = route.request()
    if (request.method() !== 'POST') return route.fallback()
    const url = new URL(request.url())
    const table = (url.pathname.endsWith('/block_results') ? 'block_results' : 'block_movement_results') as Table
    const body = firstRow(request)
    const key = String(body?.[table === 'block_results' ? 'block_id' : 'workout_exercise_id'] ?? '')
    const index = pending.findIndex((fault) => fault.table === table && fault.key === key)
    if (index < 0) return route.fallback()
    const [fault] = pending.splice(index, 1)
    if (fault.kind === 'refuse') {
      return route.fulfill({ status: 503, headers: CORS, json: { code: 'PGRST000', message: 'Controlled TASK-047 refusal.', details: null, hint: null } })
    }
    return world.applyThenLose(route)
  })
  return {
    refuse: (table: Table, key: string) => { pending.push({ table, key, kind: 'refuse' }) },
    lose: (table: Table, key: string) => { pending.push({ table, key, kind: 'lose' }) },
    spent: () => expect(pending, 'every injected fault fired').toEqual([]),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Reading and operating the screen
// ─────────────────────────────────────────────────────────────────────────────

async function settle(page: Page) {
  await page.evaluate(async () => {
    void document.body.offsetHeight
    await Promise.all([...document.fonts].map((face) => face.load().catch(() => undefined)))
    await document.fonts.ready
  })
}

function cardOf(page: Page, family: Family): Locator {
  return page.locator('[data-workout-card="workout"]').filter({
    has: page.getByRole('list', { name: READBACK_WORK_LISTS[family], exact: true }),
  })
}

function openerOf(card: Locator): Locator {
  return card.locator('[data-timed-log-opener]').getByRole('button', { name: 'Log results', exact: true })
}

/** The open focused dialog's one form. */
function openLogForm(page: Page): Locator {
  return page.locator('dialog.clr-accepted-log[open] form.clr-timed-log')
}

async function closeLog(page: Page) {
  const open = page.locator('dialog.clr-accepted-log[open]')
  if ((await open.count()) === 0) return
  await open.getByRole('button', { name: 'Close log', exact: true }).click()
  await expect(open).toHaveCount(0)
}

async function openLog(card: Locator, how: 'tap' | 'keyboard'): Promise<Locator> {
  const page = card.page()
  await closeLog(page)
  if (how === 'tap') await openerOf(card).tap()
  else {
    await openerOf(card).focus()
    await page.keyboard.press('Enter')
  }
  await expect(openLogForm(page)).toBeVisible()
  return openLogForm(page)
}

async function press(locator: Locator, how: 'tap' | 'keyboard') {
  if (how === 'tap') await locator.tap()
  else {
    await locator.focus()
    await locator.page().keyboard.press('Enter')
  }
}

const amountOf = (log: Locator, name: string) => log.getByRole('spinbutton', { name: new RegExp(`^(?:Round \\d+|Completed) · ${name}$`) })
const weightOf = (log: Locator, name: string) => log.getByRole('spinbutton', { name: `Weight · ${name}`, exact: true })
const notesOf = (log: Locator) => log.getByRole('textbox', { name: 'Notes · optional', exact: true })
const effortOf = (log: Locator) => log.getByRole('group', { name: 'Effort · optional', exact: true })

async function chooseEffort(log: Locator, word: string, how: 'tap' | 'keyboard') {
  const radio = effortOf(log).getByRole('radio', { name: word, exact: true })
  if (how === 'tap') await radio.tap()
  else {
    await radio.focus()
    await log.page().keyboard.press('Space')
  }
  await expect(radio).toHaveAttribute('aria-checked', 'true')
}

async function chosenEffort(log: Locator): Promise<string[]> {
  return effortOf(log).getByRole('radio').evaluateAll((radios) =>
    radios.filter((radio) => radio.getAttribute('aria-checked') === 'true').map((radio) => radio.textContent ?? ''))
}

/** The log's sections in DOM order: movement groups by title, then the closing feedback group's fields. */
async function logOutline(log: Locator) {
  return log.evaluate((form) => [...form.querySelectorAll<HTMLElement>('.clr-timed-log__group')].map((group) => {
    if (group.hasAttribute('data-timed-movement')) return `movement:${group.querySelector('h1, h2, h3, h4, h5, h6')?.textContent ?? ''}`
    const parts: string[] = []
    if (group.querySelector('.clr-set-effort')) parts.push('effort')
    if (group.querySelector('textarea')) parts.push('notes')
    if (group.querySelector('[data-quantity-field]')) parts.push('counts')
    if (group.querySelector('.clr-timed-completion')) parts.push('completion')
    return `group:${parts.join('+')}`
  }))
}

/** The unit a typed load is stated in, as the field shows it. */
async function loadUnit(log: Locator, name: string): Promise<string> {
  const unit = await log.locator('[data-timed-movement]').filter({ has: log.page().getByRole('heading', { name, exact: true }) })
    .locator('.clr-field__unit').last().textContent()
  expect(unit ?? '').toMatch(/^(kg|lb)$/)
  return unit!
}

const blockColumns = (row: Row | undefined) => row === undefined ? undefined : {
  elapsed_seconds_recorded: row.elapsed_seconds !== null,
  completed_under_cap: row.completed_under_cap,
  rounds_completed: row.rounds_completed,
  partial_round_reps: row.partial_round_reps,
  minutes_completed: row.minutes_completed,
  highest_rung: row.highest_rung,
  perceived_effort: row.perceived_effort,
  notes: row.notes,
  effort: row.effort,
}

const movementColumns = (row: Row | undefined) => row === undefined ? undefined : {
  round_number: row.round_number,
  actual_reps: row.actual_reps === null || row.actual_reps === undefined ? null : Number(row.actual_reps),
  actual_duration_seconds: row.actual_duration_seconds ?? null,
  actual_distance: row.actual_distance ?? null,
  weight: row.weight === null || row.weight === undefined ? null : Number(row.weight),
  weight_unit: row.weight_unit,
}

/** Starts and ends a timed block from its card, by its own actions. */
async function runBlock(page: Page, family: Family, how: 'tap' | 'keyboard') {
  const card = cardOf(page, family)
  const start = { emom: 'Start EMOM', amrap: 'Start AMRAP', forTime: 'Start For Time', ladder: 'Start ladder' }[family]
  const finish = family === 'emom' || family === 'amrap' ? 'Finish early' : 'Finish'
  // The workout behind an open log is inert: close it first.
  await closeLog(page)
  await press(card.getByRole('button', { name: start, exact: true }), how)
  await expect(card.getByRole('button', { name: 'Pause', exact: true })).toBeVisible()
  await press(card.getByRole('button', { name: finish, exact: true }), how)
  await expect(openerOf(card)).toBeVisible()
}

async function forward(page: Page, how: 'tap' | 'keyboard') {
  await closeLog(page)
  await press(page.getByRole('button', { name: 'Next section', exact: true }), how)
}

/** The forward action's existing failure dialog, dismissed so the logs can be read. */
async function expectNotSaved(page: Page, how: 'tap' | 'keyboard') {
  const dialog = page.getByRole('dialog').filter({ hasText: 'That didn’t save' })
  await expect(dialog).toBeVisible()
  await press(dialog.getByRole('button', { name: 'Close', exact: true }), how)
  await expect(dialog).toHaveCount(0)
  // Still on the timed section: nothing moved on.
  await expect(page.getByRole('list', { name: READBACK_WORK_LISTS.amrap, exact: true })).toBeVisible()
}

/** Finish the workout from the cooldown, through Summary, to the saved result in History. */
async function finishToHistory(page: Page, world: World, how: 'tap' | 'keyboard', visit: (path: string) => Promise<void>) {
  await expect(page.getByRole('list', { name: READBACK_WORK_LISTS.amrap, exact: true })).toHaveCount(0)
  await press(page.getByRole('button', { name: 'Finish workout', exact: true }), how)
  await expect(page).toHaveURL(/\/summary$/, { timeout: 30_000 })
  await expect(page.getByText(READBACK_TITLE).first()).toBeVisible()
  // History lists the saved workout, its row addressed to the detail route.
  // (Activating a completed row repeats the workout through Review by
  // design, so the saved result is opened at its own address.)
  await visit('/history')
  await expect(page.getByRole('link', { name: new RegExp(READBACK_TITLE) }).first()).toHaveAttribute('href', `/history/${world.sessionId}`)
  await visit(`/history/${world.sessionId}`)
  await expect(page).toHaveURL(new RegExp(`/history/${world.sessionId}$`))
  await expect(page.locator('[data-detail-block]').first()).toBeVisible()
}

/** The History detail's block, by its order in the timed section. */
function detailBlock(page: Page, family: Family): Locator {
  return page.locator('[data-detail-block]').nth(FAMILIES.indexOf(family))
}

function actualOf(page: Page, family: Family, exerciseId: string): Locator {
  return detailBlock(page, family).locator(`[data-movement-actual="${exerciseId}"]`)
}

// ─────────────────────────────────────────────────────────────────────────────
// The journeys, shared by both lanes
// ─────────────────────────────────────────────────────────────────────────────

const NOTES = {
  emom: 'Dropped two reps in minute 2.',
  amrap: 'Grip went in round 3.',
  forTime: 'Stopped two rounds short.',
  ladder: 'Third rung untouched.',
} as const

/**
 * JOURNEY-031, touch at 390 in Signal: every family's entries, a refused
 * movement write with the draft kept, the retry once, Summary, History and a
 * reload.
 */
async function refusedWriteJourney(page: Page, world: World, visit: (path: string) => Promise<void>) {
  const sent = recordWrites(page)
  const faults = await installFaults(page, world)
  const { loaded, bodyweight } = world.names
  await visit('/workout')
  for (const family of FAMILIES) await expect(cardOf(page, family)).toBeVisible()
  await settle(page)

  // EMOM: ended early; the effort, the loaded movement's actual load (no
  // amount: an EMOM has no partial round) and the notes.
  await runBlock(page, 'emom', 'tap')
  let log = await openLog(cardOf(page, 'emom'), 'tap')
  expect(await logOutline(log)).toEqual([`movement:${loaded}`, 'group:effort+notes'])
  await expect(log.getByRole('spinbutton')).toHaveCount(1)
  await expect(weightOf(log, loaded)).toHaveValue('')
  const unit = await loadUnit(log, loaded)
  await weightOf(log, loaded).fill('14')
  await chooseEffort(log, 'Too easy', 'tap')
  await notesOf(log).fill(NOTES.emom)

  // AMRAP: two rounds and five reps into the third; each movement's round-3
  // amount (an explicit 0 for the bodyweight one) and the loaded one's load;
  // the effort and the notes in the closing group.
  await runBlock(page, 'amrap', 'tap')
  log = await openLog(cardOf(page, 'amrap'), 'tap')
  const plusRounds = log.getByRole('button', { name: 'Increase rounds completed', exact: true })
  await plusRounds.tap()
  await plusRounds.tap()
  const plusReps = log.getByRole('button', { name: 'Increase reps into the next round', exact: true })
  for (let reps = 0; reps < 5; reps += 1) await plusReps.tap()
  await expect(amountOf(log, loaded)).toBeVisible()
  expect(await logOutline(log)).toEqual(['group:counts', `movement:${loaded}`, `movement:${bodyweight}`, 'group:effort+notes'])
  await expect(log.getByLabel(`Round 3 · ${loaded}`, { exact: true })).toHaveValue('')
  await amountOf(log, loaded).fill('5')
  await weightOf(log, loaded).fill('18')
  await amountOf(log, bodyweight).fill('0')
  await chooseEffort(log, 'About right', 'tap')
  await notesOf(log).fill(NOTES.amrap)

  // For Time: stopped and answered Incomplete — round 1 of the single pass;
  // the bodyweight movement left blank (unreported).
  await runBlock(page, 'forTime', 'tap')
  log = await openLog(cardOf(page, 'forTime'), 'tap')
  await log.getByRole('group', { name: 'Work completed', exact: true }).getByRole('radio', { name: 'Incomplete', exact: true }).tap()
  await expect(amountOf(log, loaded)).toBeVisible()
  expect(await logOutline(log)).toEqual(['group:completion', `movement:${loaded}`, `movement:${bodyweight}`, 'group:effort+notes'])
  await amountOf(log, loaded).fill('22')
  await weightOf(log, loaded).fill('20')
  await chooseEffort(log, 'Too hard', 'tap')
  await notesOf(log).fill(NOTES.forTime)

  // Ladder: finished, Incomplete through round 1 — the partial belongs to
  // round 2; the bodyweight movement blank; notes only, effort unanswered.
  await runBlock(page, 'ladder', 'tap')
  log = await openLog(cardOf(page, 'ladder'), 'tap')
  await log.getByRole('group', { name: 'Rounds completed', exact: true }).getByRole('button', { name: /^Round 1: / }).tap()
  await expect(amountOf(log, loaded)).toBeVisible()
  await expect(log.getByLabel(`Round 2 · ${loaded}`, { exact: true })).toHaveValue('')
  expect((await logOutline(log)).at(-1)).toBe('group:effort+notes')
  await amountOf(log, loaded).fill('3')
  await weightOf(log, loaded).fill('12')
  await notesOf(log).fill(NOTES.ladder)
  expect(await chosenEffort(log)).toEqual([])
  for (const field of await log.getByRole('spinbutton').all()) {
    await expect(field).not.toHaveValue(String(READBACK_PLANNED_LOAD))
  }

  // AC-R031-03: the first movement write (the EMOM's load) is refused. The
  // athlete stays on the section with the existing dialog; nothing is lost.
  faults.refuse('block_movement_results', world.exercises.emom[0])
  await forward(page, 'tap')
  await expectNotSaved(page, 'tap')
  log = await openLog(cardOf(page, 'emom'), 'tap')
  await expect(weightOf(log, loaded)).toHaveValue('14')
  await expect(weightOf(log, loaded)).toBeEnabled()
  expect(await chosenEffort(log)).toEqual(['Too easy'])
  await expect(notesOf(log)).toHaveValue(NOTES.emom)
  log = await openLog(cardOf(page, 'amrap'), 'tap')
  await expect(amountOf(log, loaded)).toHaveValue('5')
  await expect(amountOf(log, bodyweight)).toHaveValue('0')
  expect(await chosenEffort(log)).toEqual(['About right'])
  await expect(notesOf(log)).toHaveValue(NOTES.amrap)
  log = await openLog(cardOf(page, 'forTime'), 'tap')
  await expect(amountOf(log, loaded)).toHaveValue('22')
  await expect(notesOf(log)).toHaveValue(NOTES.forTime)
  log = await openLog(cardOf(page, 'ladder'), 'tap')
  await expect(amountOf(log, loaded)).toHaveValue('3')
  await expect(notesOf(log)).toHaveValue(NOTES.ladder)
  expect((await world.movementRows()).length, 'the refused write stored no movement row').toBe(0)

  // The retry: the same forward action. Each row once.
  await forward(page, 'tap')
  await expect(page.getByRole('list', { name: READBACK_WORK_LISTS.amrap, exact: true })).toHaveCount(0, { timeout: 30_000 })
  faults.spent()

  // What was sent: the EMOM's row, its 23505 on the retry corrected in place,
  // and its movement row refused once then written once; every other block
  // and movement written once. No movement row for a blank movement.
  expect(await trail(sent, 'block_results', world.blocks.emom)).toEqual(['POST 201', 'POST 409', 'PATCH 200'])
  for (const family of ['amrap', 'forTime', 'ladder'] as const) {
    expect(await trail(sent, 'block_results', world.blocks[family])).toEqual(['POST 201'])
  }
  expect(await trail(sent, 'block_movement_results', world.exercises.emom[0])).toEqual(['POST 503', 'POST 201'])
  for (const exerciseId of [world.exercises.amrap[0], world.exercises.amrap[1], world.exercises.forTime[0], world.exercises.ladder[0]]) {
    expect(await trail(sent, 'block_movement_results', exerciseId)).toEqual(['POST 201'])
  }
  for (const exerciseId of [world.exercises.emom[1], world.exercises.forTime[1], world.exercises.ladder[1]]) {
    expect(await trail(sent, 'block_movement_results', exerciseId)).toEqual([])
  }
  for (const write of sent) expect(JSON.stringify(write.body)).not.toMatch(/"perceived_effort":\d/)

  // AC-R031-01/02: the rows that hold — one per block, one per entered movement.
  const blocks = await world.blockRows()
  expect(blocks).toHaveLength(4)
  const blockRow = (family: Family) => blockColumns(blocks.find((row) => row.block_id === world.blocks[family]))
  expect(blockRow('emom')).toEqual({
    elapsed_seconds_recorded: false, completed_under_cap: null, rounds_completed: null, partial_round_reps: null,
    minutes_completed: null, highest_rung: null, perceived_effort: null, notes: NOTES.emom, effort: 'too_easy',
  })
  expect(blockRow('amrap')).toMatchObject({
    elapsed_seconds_recorded: true, rounds_completed: 2, partial_round_reps: 5, minutes_completed: null,
    perceived_effort: null, notes: NOTES.amrap, effort: 'about_right',
  })
  expect(blockRow('forTime')).toMatchObject({
    elapsed_seconds_recorded: true, completed_under_cap: false, rounds_completed: null, partial_round_reps: null,
    perceived_effort: null, notes: NOTES.forTime, effort: 'too_hard',
  })
  expect(blockRow('ladder')).toMatchObject({ highest_rung: 1, perceived_effort: null, notes: NOTES.ladder, effort: null })
  const movements = await world.movementRows()
  expect(movements).toHaveLength(5)
  const movementRow = (exerciseId: string) => movementColumns(movements.find((row) => row.workout_exercise_id === exerciseId))
  const none = { actual_duration_seconds: null, actual_distance: null }
  expect(movementRow(world.exercises.emom[0])).toEqual({ round_number: null, actual_reps: null, ...none, weight: 14, weight_unit: unit })
  expect(movementRow(world.exercises.amrap[0])).toEqual({ round_number: 3, actual_reps: 5, ...none, weight: 18, weight_unit: unit })
  expect(movementRow(world.exercises.amrap[1])).toEqual({ round_number: 3, actual_reps: 0, ...none, weight: null, weight_unit: unit })
  expect(movementRow(world.exercises.forTime[0])).toEqual({ round_number: 1, actual_reps: 22, ...none, weight: 20, weight_unit: unit })
  expect(movementRow(world.exercises.ladder[0])).toEqual({ round_number: 2, actual_reps: 3, ...none, weight: 12, weight_unit: unit })

  // /summary, then the saved result in History, before and after a reload.
  await finishToHistory(page, world, 'tap', visit)
  for (const reloaded of [false, true]) {
    if (reloaded) {
      await page.reload()
      await expect(page.locator('[data-detail-block]').first()).toBeVisible()
    }
    await expect(detailBlock(page, 'emom').getByRole('img', { name: 'Effort: too easy', exact: true })).toBeVisible()
    await expect(detailBlock(page, 'emom')).toContainText(NOTES.emom)
    await expect(actualOf(page, 'emom', world.exercises.emom[0])).toHaveText(`Actual14 ${unit}`)
    await expect(actualOf(page, 'emom', world.exercises.emom[1])).toHaveCount(0)
    await expect(detailBlock(page, 'amrap').getByRole('img', { name: 'Effort: about right', exact: true })).toBeVisible()
    await expect(detailBlock(page, 'amrap')).toContainText(NOTES.amrap)
    await expect(actualOf(page, 'amrap', world.exercises.amrap[0])).toHaveText(`ActualRound 3 · 5 reps · 18 ${unit}`)
    await expect(actualOf(page, 'amrap', world.exercises.amrap[1])).toHaveText('ActualRound 3 · 0 reps')
    await expect(detailBlock(page, 'forTime').getByRole('img', { name: 'Effort: too hard', exact: true })).toBeVisible()
    await expect(detailBlock(page, 'forTime')).toContainText(NOTES.forTime)
    await expect(actualOf(page, 'forTime', world.exercises.forTime[0])).toHaveText(`ActualRound 1 · 22 reps · 20 ${unit}`)
    await expect(actualOf(page, 'forTime', world.exercises.forTime[1])).toHaveCount(0)
    await expect(detailBlock(page, 'ladder').getByRole('img', { name: /^Effort: / })).toHaveCount(0)
    await expect(detailBlock(page, 'ladder')).toContainText(NOTES.ladder)
    await expect(actualOf(page, 'ladder', world.exercises.ladder[0])).toHaveText(`ActualRung 2 · 3 reps · 12 ${unit}`)
    await expect(actualOf(page, 'ladder', world.exercises.ladder[1])).toHaveCount(0)
    // Never the plan: no actual reads the planned load.
    for (const actual of await page.locator('[data-movement-actual]').all()) {
      await expect(actual).not.toContainText(`${READBACK_PLANNED_LOAD} ${unit}`)
    }
  }
  // Reading never wrote: the same rows, nothing new sent.
  expect(await world.movementRows()).toHaveLength(5)
  expect(await world.blockRows()).toHaveLength(4)
  world.assertContained()
}

/**
 * JOURNEY-031, keyboard at 320 under reduced motion in Clear: a block write
 * whose answer is lost and a movement write whose answer is lost, each
 * corrected on the retry with the values changed since (23505 → PATCH), never
 * duplicated; zero kept and blank unreported; Summary, History and a reload.
 */
async function lostAnswerJourney(page: Page, world: World, visit: (path: string) => Promise<void>) {
  const sent = recordWrites(page)
  const faults = await installFaults(page, world)
  const { loaded, bodyweight } = world.names
  await visit('/workout')
  for (const family of FAMILIES) await expect(cardOf(page, family)).toBeVisible()
  await settle(page)

  // AMRAP by keyboard: one round, so the partial belongs to round 2; the
  // reps into the next round left unreported.
  await runBlock(page, 'amrap', 'keyboard')
  let log = await openLog(cardOf(page, 'amrap'), 'keyboard')
  const plusRounds = log.getByRole('button', { name: 'Increase rounds completed', exact: true })
  await plusRounds.focus()
  await page.keyboard.press('Enter')
  await expect(amountOf(log, loaded)).toBeVisible()
  await amountOf(log, loaded).fill('7')
  await weightOf(log, loaded).fill('20')
  await amountOf(log, bodyweight).fill('0')
  await chooseEffort(log, 'Too hard', 'keyboard')
  await notesOf(log).fill('First pass.')
  const unit = await loadUnit(log, loaded)

  // For Time by keyboard: Incomplete, round 1; a load; the bodyweight
  // movement blank; no effort, no notes.
  await runBlock(page, 'forTime', 'keyboard')
  log = await openLog(cardOf(page, 'forTime'), 'keyboard')
  const incomplete = log.getByRole('group', { name: 'Work completed', exact: true }).getByRole('radio', { name: 'Incomplete', exact: true })
  await incomplete.focus()
  await page.keyboard.press('Space')
  await expect(amountOf(log, loaded)).toBeVisible()
  await amountOf(log, loaded).fill('15')
  await weightOf(log, loaded).fill('14')

  // The AMRAP's row lands but its answer is lost: the athlete is told it did
  // not save and stays, with every entry.
  faults.lose('block_results', world.blocks.amrap)
  faults.lose('block_movement_results', world.exercises.forTime[0])
  await forward(page, 'keyboard')
  await expectNotSaved(page, 'keyboard')
  expect(blockColumns((await world.blockRows()).find((row) => row.block_id === world.blocks.amrap))).toMatchObject({ effort: 'too_hard', notes: 'First pass.' })

  // A correction before the retry: the effort, an amount and the notes.
  log = await openLog(cardOf(page, 'amrap'), 'keyboard')
  await expect(amountOf(log, loaded)).toHaveValue('7')
  await expect(amountOf(log, bodyweight)).toHaveValue('0')
  expect(await chosenEffort(log)).toEqual(['Too hard'])
  await chooseEffort(log, 'About right', 'keyboard')
  await amountOf(log, loaded).fill('6')
  await notesOf(log).fill('Second pass.')

  // Retry 1: the AMRAP's row is restated, not inserted again; its movements
  // land; the For Time's row lands and its loaded movement's answer is lost.
  await forward(page, 'keyboard')
  await expectNotSaved(page, 'keyboard')
  log = await openLog(cardOf(page, 'forTime'), 'keyboard')
  await expect(amountOf(log, loaded)).toHaveValue('15')
  await expect(weightOf(log, loaded)).toHaveValue('14')
  await amountOf(log, loaded).fill('16')

  // Retry 2: the For Time's row and movement restated with the corrected amount.
  await forward(page, 'keyboard')
  await expect(page.getByRole('list', { name: READBACK_WORK_LISTS.amrap, exact: true })).toHaveCount(0, { timeout: 30_000 })
  faults.spent()

  expect(await trail(sent, 'block_results', world.blocks.emom)).toEqual(['POST 201'])
  expect(await trail(sent, 'block_results', world.blocks.amrap)).toEqual(['POST lost', 'POST 409', 'PATCH 200'])
  expect(await trail(sent, 'block_results', world.blocks.forTime)).toEqual(['POST 201', 'POST 409', 'PATCH 200'])
  expect(await trail(sent, 'block_results', world.blocks.ladder)).toEqual(['POST 201'])
  expect(await trail(sent, 'block_movement_results', world.exercises.amrap[0])).toEqual(['POST 201'])
  expect(await trail(sent, 'block_movement_results', world.exercises.amrap[1])).toEqual(['POST 201'])
  expect(await trail(sent, 'block_movement_results', world.exercises.forTime[0])).toEqual(['POST lost', 'POST 409', 'PATCH 200'])
  expect(await trail(sent, 'block_movement_results', world.exercises.forTime[1])).toEqual([])

  const blocks = await world.blockRows()
  expect(blocks).toHaveLength(4)
  const blockRow = (family: Family) => blockColumns(blocks.find((row) => row.block_id === world.blocks[family]))
  expect(blockRow('amrap')).toMatchObject({ rounds_completed: 1, partial_round_reps: null, perceived_effort: null, notes: 'Second pass.', effort: 'about_right' })
  expect(blockRow('forTime')).toMatchObject({ completed_under_cap: false, perceived_effort: null, notes: null, effort: null })
  expect(blockRow('emom')).toEqual({
    elapsed_seconds_recorded: false, completed_under_cap: null, rounds_completed: null, partial_round_reps: null,
    minutes_completed: null, highest_rung: null, perceived_effort: null, notes: null, effort: null,
  })
  expect(blockRow('ladder')).toMatchObject({ highest_rung: null, notes: null, effort: null })
  const movements = await world.movementRows()
  expect(movements).toHaveLength(3)
  const movementRow = (exerciseId: string) => movementColumns(movements.find((row) => row.workout_exercise_id === exerciseId))
  const none = { actual_duration_seconds: null, actual_distance: null }
  expect(movementRow(world.exercises.amrap[0])).toEqual({ round_number: 2, actual_reps: 6, ...none, weight: 20, weight_unit: unit })
  expect(movementRow(world.exercises.amrap[1])).toEqual({ round_number: 2, actual_reps: 0, ...none, weight: null, weight_unit: unit })
  expect(movementRow(world.exercises.forTime[0])).toEqual({ round_number: 1, actual_reps: 16, ...none, weight: 14, weight_unit: unit })

  await finishToHistory(page, world, 'keyboard', visit)
  for (const reloaded of [false, true]) {
    if (reloaded) {
      await page.reload()
      await expect(page.locator('[data-detail-block]').first()).toBeVisible()
    }
    await expect(detailBlock(page, 'amrap').getByRole('img', { name: 'Effort: about right', exact: true })).toBeVisible()
    await expect(detailBlock(page, 'amrap')).toContainText('Second pass.')
    await expect(detailBlock(page, 'amrap')).not.toContainText('First pass.')
    await expect(detailBlock(page, 'amrap').getByText('Partial round', { exact: true })).toHaveCount(0)
    await expect(actualOf(page, 'amrap', world.exercises.amrap[0])).toHaveText(`ActualRound 2 · 6 reps · 20 ${unit}`)
    await expect(actualOf(page, 'amrap', world.exercises.amrap[1])).toHaveText('ActualRound 2 · 0 reps')
    await expect(detailBlock(page, 'forTime').getByRole('img', { name: /^Effort: / })).toHaveCount(0)
    await expect(actualOf(page, 'forTime', world.exercises.forTime[0])).toHaveText(`ActualRound 1 · 16 reps · 14 ${unit}`)
    await expect(actualOf(page, 'forTime', world.exercises.forTime[1])).toHaveCount(0)
    for (const family of ['emom', 'ladder'] as const) {
      await expect(detailBlock(page, family).locator('[data-movement-actual]')).toHaveCount(0)
      await expect(detailBlock(page, family).getByRole('img', { name: /^Effort: / })).toHaveCount(0)
    }
  }
  expect(await world.movementRows()).toHaveLength(3)
  expect(await world.blockRows()).toHaveLength(4)
  world.assertContained()
}

// ─────────────────────────────────────────────────────────────────────────────

test.describe('TASK-047 visible timed-result persistence and History readback', () => {
  test('JOURNEY-031 backend lane touch phone-390 Signal: the four timed families’ partials, loads, categorical effort and notes save through the real writers with block, round and movement identity; a refused movement write keeps every entry and the athlete on the section; the retry writes each row once; Summary is reached and History reads back the actual entries, not the plan, before and after a reload', async ({ page, visit }, testInfo) => {
    test.setTimeout(300_000)
    await page.setViewportSize({ width: 390, height: 844 })
    const { world, cleanup } = await backendWorld(page, testInfo, { skin: 'signal', reducedMotion: false })
    try {
      await refusedWriteJourney(page, world, visit)
    } finally {
      await cleanup()
    }
  })

  test('JOURNEY-031 backend lane keyboard phone-320 reduced motion: a block write and a movement write whose answers are lost are restated on the retry with the values corrected since, never duplicated; an entered zero is kept and a blank movement and an unreported count stay unrecorded; History reads back the corrected entries before and after a reload', async ({ page, visit }, testInfo) => {
    test.setTimeout(300_000)
    await page.setViewportSize({ width: 320, height: 568 })
    const { world, cleanup } = await backendWorld(page, testInfo, { skin: 'clear', reducedMotion: true })
    try {
      await lostAnswerJourney(page, world, visit)
    } finally {
      await cleanup()
    }
  })

  test('JOURNEY-031 synthetic lane touch phone-390 Signal: the same refused-write journey over a contained PostgREST double — every entry kept, one write per row on the retry, the rows’ round and movement identity, History read back before and after a reload (not backend proof)', async ({ page, visit }) => {
    test.setTimeout(180_000)
    await page.setViewportSize({ width: 390, height: 844 })
    const world = await syntheticWorld(page, { skin: 'signal', reducedMotion: false })
    await refusedWriteJourney(page, world, visit)
  })

  test('JOURNEY-031 synthetic lane keyboard phone-320 reduced motion: the same lost-answer journey over a contained PostgREST double — restated on the retry with the corrected values, zero kept, blanks unrecorded, History read back (not backend proof)', async ({ page, visit }) => {
    test.setTimeout(180_000)
    await page.setViewportSize({ width: 320, height: 568 })
    const world = await syntheticWorld(page, { skin: 'clear', reducedMotion: true })
    await lostAnswerJourney(page, world, visit)
  })

  test('AC-R031-01 gallery emom, amrap, for_time and ladder phone-390: each state’s route-owned log draws the accepted closing feedback group — the effort faces and the notes — and the EMOM its loaded movement’s actual load, live over memory only with nothing stored and no network', async ({ page, visit }) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width: 390, height: 844 })
    const network: string[] = []
    page.on('request', (request) => {
      if (/\/(rest|auth|functions)\/v1\//.test(request.url())) network.push(`${request.method()} ${request.url()}`)
    })
    await installDeterministicCapture(page, { skin: 'clear', reducedMotion: false })
    const expected: Record<string, (outline: string[]) => void> = {
      emom: (outline) => {
        expect(outline.at(-1)).toBe('group:effort+notes')
        expect(outline.slice(0, -1).every((part) => part.startsWith('movement:'))).toBe(true)
        expect(outline.length).toBeGreaterThan(1)
      },
      amrap: (outline) => {
        expect(outline[0]).toBe('group:counts')
        expect(outline.at(-1)).toBe('group:effort+notes')
      },
      for_time: (outline) => expect(outline.at(-1)).toBe('group:effort+notes'),
      ladder: (outline) => expect(outline.at(-1)).toBe('group:effort+notes'),
    }
    for (const state of ['emom', 'amrap', 'for_time', 'ladder'] as const) {
      await visit(`/gallery/refinements?state=${state}`)
      const root = page.locator(`[data-refinement-state="${state}"]`)
      const opener = root.locator('[data-timed-log-opener]').getByRole('button', { name: 'Log results', exact: true }).first()
      await expect(opener).toBeVisible()
      const storedBefore = await page.evaluate(() => Object.keys(localStorage).sort())
      await opener.tap()
      const log = openLogForm(page)
      await expect(log).toBeVisible()
      expected[state](await logOutline(log))
      // Live over memory: the effort and a note are taken and kept through close and reopen.
      await chooseEffort(log, 'About right', 'tap')
      await notesOf(log).fill(`Gallery ${state} note.`)
      if (state === 'emom') {
        const load = log.getByRole('spinbutton', { name: /^Weight · / }).first()
        await expect(load).toHaveValue('')
        await load.fill('11')
      }
      await closeLog(page)
      await opener.tap()
      await expect(log).toBeVisible()
      expect(await chosenEffort(log)).toEqual(['About right'])
      await expect(notesOf(log)).toHaveValue(`Gallery ${state} note.`)
      if (state === 'emom') await expect(log.getByRole('spinbutton', { name: /^Weight · / }).first()).toHaveValue('11')
      await closeLog(page)
      expect(await page.evaluate(() => Object.keys(localStorage).sort())).toEqual(storedBefore)
    }
    expect(network).toEqual([])
  })
})
