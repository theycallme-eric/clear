import { createHash, randomUUID } from 'node:crypto'
import type { Page, TestInfo } from '@playwright/test'
import { expect } from '@playwright/test'

import { namespaceId } from '../../scripts/e2e/namespace.mjs'
import { backend } from '../support/backend'
import { isTrustedBrowserEligible } from './trusted-browser-lane'

/**
 * TASK-030 — one disposable, namespaced athlete on the real backend, shared by
 * `optional-feedback.spec.ts` and `workout-formats.spec.ts`.
 *
 * The same posture as TASK-036's lifecycle fixture: genuine auth, rows written
 * through the real RPCs as that athlete, and the user deleted afterwards
 * whatever the outcome. Missing credentials fail trusted/local proof. The
 * public preview lane has no service-role key by design; its ineligible cases
 * are explicitly skipped and never used as acceptance evidence.
 */

const SESSION_KEY = 'clear.auth.session'

export const trustedBrowserEligible = isTrustedBrowserEligible(backend.available, process.env)

export const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'access-control-expose-headers': '*',
}

export type Catalogued = { id: string; default_equipment: string }
export type Persisted = {
  session: { id: string }
  sections: { blocks: { exercises: { exercise: { id: string } }[] }[] }[]
}
type Answer = { ok: boolean; status: number; body: unknown }

/** Never put an admin response body, token or address into an assertion. */
export function must<T>(answer: Answer, operation: string): T {
  expect(answer.ok, `${operation}: HTTP status ${answer.status}`).toBe(true)
  return answer.body as T
}

export const dayAgo = (offset: number) => {
  const value = new Date()
  value.setDate(value.getDate() - offset)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
}

/** One prescription row, contract-shaped; the caller states what differs. */
export function prescription(exercise: Catalogued, overrides: Record<string, unknown> = {}) {
  return {
    exercise_id: exercise.id, equipment: exercise.default_equipment, session_function: 'primary',
    anchor_relationship: 'neutral', modality: 'reps', sets: 2, target_kind: 'fixed', target_value: 8,
    target_min: null, target_max: null, target_sequence: null, per_side: false, distance_unit: null,
    rest_seconds: 10, tempo: null, load_type: 'none', load_value: null, is_interval_exercise: false,
    ...overrides,
  }
}

export interface AthleteSetup {
  readonly goal: 'strength' | 'hypertrophy' | 'conditioning' | 'balanced'
  readonly sections: readonly string[]
  readonly experience: 'new' | 'some' | 'confident'
  readonly locationName: string
  readonly note: string | null
}

export interface Athlete {
  readonly client: ReturnType<typeof backend.client>
  readonly catalog: Catalogued[]
  readonly userId: string
  readonly locationId: string
  readonly token: string
  /** Persist a session payload through the real RPC, as the athlete. */
  persist(payload: Record<string, unknown>): Promise<Persisted>
  start(stored: Persisted): Promise<void>
  complete(stored: Persisted, minutes?: number): Promise<void>
  /** A performed set written as the athlete would have logged it. */
  logSet(workoutExerciseId: string, row: Record<string, unknown>): Promise<void>
  /** Install the athlete's session in the page before navigation. */
  signIn(page: Page): Promise<void>
  dispose(): Promise<void>
}

/** Every completed block has exactly one row; no absent optional result is 0. */
export async function expectUnscoredBlockResults(athlete: Athlete, blockIds: string[]) {
  expect(blockIds.length, 'the session has blocks to verify').toBeGreaterThan(0)
  expect(new Set(blockIds).size, 'the expected block ids are distinct').toBe(blockIds.length)
  const empty = {
    elapsed_seconds: null, rounds_completed: null, partial_round_reps: null,
    minutes_completed: null, highest_rung: null, completed_under_cap: null,
    perceived_effort: null,
  }
  const rows = must<Array<{ block_id: string } & typeof empty>>(
    await athlete.client.selectAsService('block_results', {
      select: 'block_id,' + Object.keys(empty).join(','),
      block_id: `in.(${blockIds.join(',')})`,
    }), 'Block result read')
  expect(rows.map((row) => row.block_id).sort(), 'each completed block is saved exactly once')
    .toEqual([...blockIds].sort())
  for (const row of rows) expect(row).toEqual({ block_id: row.block_id, ...empty })
}

/** Create, onboard and sign in one namespaced athlete; delete it on `dispose`. */
export async function createAthlete(testInfo: TestInfo, tag: string, setup: AthleteSetup): Promise<Athlete> {
  expect(backend.available, backend.reason).toBe(true)
  const client = backend.client()
  const catalog = must<Catalogued[]>(await client.selectAsService('exercise_definitions', {
    select: 'id,default_equipment', default_equipment: 'neq.bodyweight', order: 'id.asc', limit: '2',
  }), 'Fixture catalog read')
  expect(catalog).toHaveLength(2)

  const suffix = createHash('sha256').update(testInfo.titlePath.join('\0')).digest('hex').slice(0, 10)
  const email = `clear-e2e-${namespaceId()}-${testInfo.project.name}-${tag}-${suffix}@example.com`
  const prior = await client.findUserByEmail(email)
  if (prior) await client.deleteUser(prior.id)

  let userId: string | null = null
  try {
    const owner: string = (await client.ensureConfirmedUser(email)).id
    userId = owner
    const session = await client.mintSession(email)
    const token = session.accessToken
    must(await client.rpcAs('complete_onboarding', {
      p_location_name: setup.locationName, p_location_tier: 'full',
      p_equipment: [...new Set(['bodyweight', 'dumbbells', ...catalog.map((e) => e.default_equipment)])],
      p_experience_level: setup.experience, p_goal_preset: setup.goal,
      p_sections: setup.sections, p_avoid_patterns: [], p_note: setup.note,
    }, token), 'Fixture onboarding')
    const [location] = must<Array<{ id: string }>>(await client.selectAsService('locations', {
      select: 'id', user_id: `eq.${owner}`, limit: '1',
    }), 'Fixture location read')
    expect(location?.id, 'onboarding saved no location').toBeTruthy()

    const athlete: Athlete = {
      client, catalog, userId: owner, locationId: location.id, token,
      persist: async (payload) => must<Persisted>(await client.rpcAs('persist_session', {
        p_user_id: owner, p_session: payload,
      }, token), 'Fixture persistence'),
      async start(stored) {
        const started = must<{ outcome: string }>(await client.rpcAs('start_session', {
          p_session_id: stored.session.id }, token), 'Fixture start')
        expect(started.outcome).toBe('started')
      },
      async complete(stored, minutes = 30) {
        const done = must<{ outcome: string }>(await client.rpcAs('complete_session', {
          p_session_id: stored.session.id, p_actual_duration_mins: minutes }, token), 'Fixture completion')
        expect(done.outcome).toBe('completed')
      },
      async logSet(workoutExerciseId, row) {
        must(await client.insertAs('exercise_set_logs', {
          id: randomUUID(), workout_exercise_id: workoutExerciseId, ...row,
        }, token), 'Fixture performed-set write')
      },
      async signIn(page) {
        await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
          key: SESSION_KEY, value: { accessToken: token, refreshToken: session.refreshToken,
            expiresAt: Date.now() + 60 * 60 * 1000, user: { id: owner, email } },
        })
      },
      async dispose() {
        await client.deleteUser(owner)
        expect(await client.findUserByEmail(email), 'the namespaced user outlived the run').toBeFalsy()
      },
    }
    return athlete
  } catch (error) {
    if (userId !== null) await client.deleteUser(userId).catch(() => undefined)
    // An assertion failure carries only a status; anything else is reduced to
    // a sentence so no admin response body reaches the report.
    if (error instanceof Error && /HTTP status \d+/.test(error.message)) throw error
    // The cause is deliberately not attached: it may carry an admin response body.
    // eslint-disable-next-line preserve-caught-error
    throw new Error(`TASK-030 ${tag} fixture setup failed; no response body retained.`)
  }
}
