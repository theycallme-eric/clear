/**
 * GR-05 / REQ-021, REQ-025 — the database lane, proved without a database.
 *
 * `e2e/generation-database-lane.spec.ts` runs `runDatabaseLane` against the
 * hosted project and skips without credentials. Everything that lane does
 * besides asking Postgres — which users it makes, which matrix rows it asks
 * about, how it holds an answer to the fast lane, what it leaves behind — is a
 * sequence of requests, so it is proved here against the Supabase double.
 *
 * The double answers the candidate RPC with `candidates-double.ts`, the
 * retrieval transcribed from the migration, and the lane compares it with
 * `matrix.mjs`, the fast lane. Those are two implementations, so agreement here
 * is a comparison and not a tautology. It is still not Postgres: what this
 * suite proves is the lane's lifecycle and that its assertions bite.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { createAdminClient } from '../../../scripts/e2e/client.mjs'
import { isHarnessEmail } from '../../../scripts/e2e/namespace.mjs'
import { REPO_ROOT } from '../../../scripts/gen-types/schema.mjs'
import {
  FORCED_FAILURE_EXERCISE_ID,
  OWNER_MIRROR_SLOT,
  buildLanePlan,
  compareRow,
  coverageProblems,
  isLaneEmail,
  laneEmail,
  presetStates,
  runDatabaseLane,
} from '../../../scripts/generation-reliability/database-lane.mjs'
import { buildMatrix } from '../../../scripts/generation-reliability/matrix.mjs'
import { loadRetrievalRules } from '../../../scripts/generation-reliability/rules.mjs'
import { Constants } from '../../data/database.types'
import { EQUIPMENT, EQUIPMENT_BY_TIER, SECTIONS_BY_GOAL } from '../../state/onboarding'
import { createCandidatesDouble } from '../candidates-double'
import { seededCatalog } from '../seed-catalog'
import {
  createSupabaseDouble,
  type FakeRow,
  type SupabaseDoubleRequest,
  type SupabaseDoubleRoute,
} from '../supabase-double'
import ownerMirror from './owner-mirror.json'

const ENUMS = Constants.public.Enums
const NAMESPACE = 'unit'
const URL_BASE = 'https://project.supabase.co'
const SPEC_PATH = 'e2e/generation-database-lane.spec.ts'
const HARNESS_PATH = 'scripts/generation-reliability/database-lane.mjs'

const catalog = seededCatalog()
const inputs = {
  rules: loadRetrievalRules(),
  catalog,
  equipmentByTier: EQUIPMENT_BY_TIER,
  sectionsByGoal: SECTIONS_BY_GOAL,
  equipment: EQUIPMENT.map((item) => item.value),
}
const matrix = buildMatrix(inputs)
const plan = buildLanePlan(inputs, ownerMirror)

/** A pre-existing account the lane has no business with. */
const OWNER = { id: 'owner-1', email: 'owner@clear.example' }

interface BackendOptions {
  /** Answers a request before the backend does; `undefined` declines it. */
  fault?: SupabaseDoubleRoute
  /** `false` writes each row as it is built, which is what a missing transaction does. */
  atomic?: boolean
}

/**
 * The double, plus the four things the lane asks for that the lifecycle never
 * does: a session, onboarding, the two RPCs, and a privileged read.
 */
function createLaneBackend(options: BackendOptions = {}) {
  /** Every row a privileged read handed back. */
  const served: FakeRow[] = []
  /** The bearer of every RPC, so "as the user" is checkable. */
  const rpcBearers: string[] = []
  const exerciseIds = new Set(catalog.map((exercise) => exercise.id))
  let sequence = 0
  const nextId = (kind: string) => `${kind}-${++sequence}`

  const callerOf = ({ headers, users }: SupabaseDoubleRequest) => {
    const token = headers.get('Authorization')?.replace(/^Bearer /, '') ?? ''
    return [...users.values()].find((user) => `token:${user.id}` === token)
  }

  const routes: SupabaseDoubleRoute = async (request) => {
    const faulted = await options.fault?.(request)
    if (faulted !== undefined) return faulted

    const { url, method, body, users, tables, rowsIn, respond } = request
    const path = url.pathname
    const add = (table: string, row: FakeRow) => tables.set(table, [...rowsIn(table), row])

    if (path === '/auth/v1/admin/generate_link' && method === 'POST') {
      const { email } = body as { email: string }
      if (!users.has(email)) return respond(404, { msg: 'user not found' })
      return respond(200, { properties: { email_otp: '000000', hashed_token: `hash:${email}` } })
    }

    if (path === '/auth/v1/verify' && method === 'POST') {
      const { token_hash: hash } = body as { token_hash: string }
      const user = users.get(hash.replace(/^hash:/, ''))
      if (user === undefined) return respond(403, { msg: 'invalid token' })
      return respond(200, {
        access_token: `token:${user.id}`,
        refresh_token: `refresh:${user.id}`,
        user: { id: user.id },
      })
    }

    if (path.startsWith('/rest/v1/rpc/') && method === 'POST') {
      const caller = callerOf(request)
      rpcBearers.push(request.headers.get('Authorization') ?? '')
      if (caller === undefined) return respond(401, { message: 'invalid claim' })
      const fn = path.replace('/rest/v1/rpc/', '')

      if (fn === 'complete_onboarding') {
        const args = body as {
          p_location_name: string
          p_location_tier: string
          p_equipment: string[]
          p_goal_preset: string
          p_sections: string[]
        }
        // The signup trigger's profile row, written here because the double's
        // user creation has no trigger.
        const profile = {
          id: caller.id,
          goal_preset: args.p_goal_preset,
          enabled_sections: args.p_sections,
          __owner: caller.id,
        }
        const location = {
          id: nextId('location'),
          user_id: caller.id,
          name: args.p_location_name,
          tier: args.p_location_tier,
          is_default: true,
          __owner: caller.id,
        }
        add('profiles', profile)
        add('locations', location)
        for (const equipment of args.p_equipment) {
          add('location_equipment', {
            location_id: location.id,
            equipment_id: equipment,
            __owner: caller.id,
          })
        }
        return respond(200, { profile, location })
      }

      if (fn === 'generation_candidate_sets_for_goal') {
        const args = body as {
          p_user_id: string
          p_goal: string
          p_focus: string
          p_location_id: string | null
          p_session_id: string | null
          p_floor: number
        }
        const profile = rowsIn('profiles').find((row) => row.id === args.p_user_id)
        // The goal-scoped surface is the profile-scoped one with the request's
        // goal in place of the stored default, so the transcribed retrieval
        // answers it once handed that goal.
        const retrieval = createCandidatesDouble({
          url: URL_BASE,
          anonKey: 'anon',
          users: { caller: caller.id },
          catalog,
          profiles:
            profile === undefined
              ? {}
              : {
                  [args.p_user_id]: {
                    goalPreset: args.p_goal,
                    enabledSections: profile.enabled_sections as string[],
                    locations: rowsIn('locations')
                      .filter((row) => row.user_id === args.p_user_id)
                      .map((row) => ({
                        id: String(row.id),
                        isDefault: row.is_default === true,
                        equipment: rowsIn('location_equipment')
                          .filter((item) => item.location_id === row.id)
                          .map((item) => String(item.equipment_id)),
                      })),
                  },
                },
        })
        return retrieval.fetch(`${URL_BASE}/rest/v1/rpc/generation_candidate_sets`, {
          method: 'POST',
          headers: { apikey: 'anon', Authorization: 'Bearer caller' },
          body: JSON.stringify({
            p_user_id: args.p_user_id,
            p_focus: args.p_focus,
            p_location_id: args.p_location_id,
            p_session_id: args.p_session_id,
            p_floor: args.p_floor,
          }),
        })
      }

      if (fn === 'persist_session') {
        const args = body as {
          p_user_id: string
          p_session: {
            workout: { sections: { blocks: { exercises: { exercise_id: string }[] }[] }[] }
          }
        }
        if (args.p_user_id !== caller.id) {
          return respond(403, { code: '42501', message: 'violates row-level security policy' })
        }

        // Built in local arrays and committed in one step, which is what a
        // transaction gives. `atomic: false` writes as it goes instead.
        const pending: [string, FakeRow][] = []
        const write = (table: string, row: FakeRow) => {
          const owned: FakeRow = { ...row, __owner: caller.id }
          if (options.atomic === false) add(table, owned)
          else pending.push([table, owned])
          return owned
        }

        const session = write('workout_sessions', { id: nextId('session'), user_id: caller.id })
        for (const section of args.p_session.workout.sections) {
          const sectionRow = write('workout_sections', {
            id: nextId('section'),
            session_id: session.id,
          })
          for (const block of section.blocks) {
            const blockRow = write('workout_blocks', {
              id: nextId('block'),
              section_id: sectionRow.id,
            })
            for (const exercise of block.exercises) {
              if (!exerciseIds.has(exercise.exercise_id)) {
                return respond(409, {
                  code: '23503',
                  message: 'violates foreign key constraint on exercise_definitions',
                })
              }
              write('workout_exercises', {
                id: nextId('exercise'),
                block_id: blockRow.id,
                exercise_id: exercise.exercise_id,
              })
            }
          }
        }
        for (const [table, row] of pending) add(table, row)
        return respond(200, { session: { id: session.id } })
      }

      return respond(404, { code: 'PGRST202', message: `no function matches ${fn}` })
    }

    if (path.startsWith('/rest/v1/') && method === 'GET') {
      const table = path.replace('/rest/v1/', '')
      const filters = [...url.searchParams].filter(([name]) => name !== 'select')
      const rows = rowsIn(table).filter((row) =>
        filters.every(([column, filter]) => {
          const wanted = filter.startsWith('in.(')
            ? filter.slice(4, -1).split(',')
            : [filter.replace(/^eq\./, '')]
          return wanted.includes(String(row[column]))
        }),
      )
      served.push(...rows)
      return respond(200, rows)
    }

    return undefined
  }

  const double = createSupabaseDouble({ routes })

  // The owner, with a profile, a location and a workout of their own.
  double.users.set(OWNER.email, {
    ...OWNER,
    email_confirm: true,
    created_at: '2026-01-01T00:00:00Z',
  })
  double.tables.set('profiles', [{ id: OWNER.id, goal_preset: 'balanced', __owner: OWNER.id }])
  double.tables.set('locations', [
    { id: 'owner-location', user_id: OWNER.id, __owner: OWNER.id },
  ])
  double.tables.set('workout_sessions', [
    { id: 'owner-session', user_id: OWNER.id, __owner: OWNER.id },
  ])

  return {
    double,
    served,
    rpcBearers,
    /** Everything stored, as one comparable value. */
    stored: () =>
      Object.fromEntries(
        [...double.tables].filter(([, rows]) => rows.length > 0).map(([table, rows]) => [
          table,
          rows.map((row) => ({ ...row })),
        ]),
      ),
    run: () =>
      runDatabaseLane({
        client: createAdminClient({
          url: URL_BASE,
          serviceRoleKey: 'service-role',
          anonKey: 'anon',
          fetch: double.fetch,
        }),
        plan,
        namespace: NAMESPACE,
      }),
  }
}

/** The owner's rows and account, which every run must leave exactly as they were. */
const OWNER_STATE = {
  profiles: [{ id: OWNER.id, goal_preset: 'balanced', __owner: OWNER.id }],
  locations: [{ id: 'owner-location', user_id: OWNER.id, __owner: OWNER.id }],
  workout_sessions: [{ id: 'owner-session', user_id: OWNER.id, __owner: OWNER.id }],
}

function expectOnlyTheOwnerIsLeft(backend: ReturnType<typeof createLaneBackend>) {
  expect([...backend.double.users.keys()]).toEqual([OWNER.email])
  expect(backend.stored()).toEqual(OWNER_STATE)
}

const isCandidateCall = (request: SupabaseDoubleRequest) =>
  request.url.pathname === '/rest/v1/rpc/generation_candidate_sets_for_goal'

describe('the lane inputs', () => {
  it('are generated from the legal-state matrix, one row per goal × focus × tier', () => {
    const states = presetStates(matrix)

    expect(plan.matrixRows).toEqual(states.map((state) => state.id))
    expect(states).toHaveLength(
      ENUMS.goal_preset.length * ENUMS.session_focus.length * ENUMS.equipment_tier.length,
    )

    for (const state of states) {
      const row = plan.rows.find((candidate) => candidate.id === state.id)
      expect(row, state.id).toBeDefined()
      expect(row?.sections.map((section) => section.section), state.id).toEqual(
        state.sections.map((section) => section.section),
      )
    }
    expect(coverageProblems(plan, [])).not.toEqual([])
  })

  it('give every advertised tier × Goal preset its own disposable user', () => {
    for (const tier of ENUMS.equipment_tier) {
      for (const goal of ENUMS.goal_preset) {
        const user = plan.users.find((candidate) => candidate.slot === `${tier}-${goal}`)
        expect(user, `${tier}/${goal}`).toMatchObject({
          kind: 'preset',
          equipment: EQUIPMENT_BY_TIER[tier],
          sections: SECTIONS_BY_GOAL[goal],
        })
        for (const focus of ENUMS.session_focus) {
          expect(
            plan.rows.filter(
              (row) => row.slot === user?.slot && row.goal === goal && row.focus === focus,
            ),
            `${tier}/${goal}/${focus}`,
          ).toHaveLength(1)
        }
      }
    }
  })

  it('mirror the owner’s saved configuration as a customized user, per focus', () => {
    const user = plan.users.find((candidate) => candidate.slot === OWNER_MIRROR_SLOT)

    expect(user).toMatchObject({
      kind: 'owner-mirror',
      goal: ownerMirror.goal,
      tier: ownerMirror.tier,
      equipment: ownerMirror.equipment,
      sections: ownerMirror.enabledSections,
    })
    // Customized: neither the goal's section preset nor the tier's equipment.
    expect(user?.sections).not.toEqual(SECTIONS_BY_GOAL[ownerMirror.goal as 'balanced'])
    expect([...(user?.equipment ?? [])].sort()).not.toEqual(
      [...EQUIPMENT_BY_TIER[ownerMirror.tier as 'building']].sort(),
    )

    const rows = plan.rows.filter((row) => row.slot === OWNER_MIRROR_SLOT)
    expect(rows.map((row) => row.focus)).toEqual(ENUMS.session_focus)
    for (const row of rows) {
      expect(row.sections.map((section) => section.section), row.id).toEqual(
        ownerMirror.enabledSections,
      )
    }
  })

  it('refuse a mirror whose filtering exclusion cannot be reproduced', () => {
    expect(() =>
      buildLanePlan(inputs, {
        ...ownerMirror,
        exclusions: [{ scope: 'exercise', action: 'exclude' }],
      }),
    ).toThrow(/cannot reproduce/)
  })

  it('address only this lane’s namespace', () => {
    for (const user of plan.users) {
      const email = laneEmail(NAMESPACE, user.slot)
      expect(isHarnessEmail(email), email).toBe(true)
      expect(isLaneEmail(email, NAMESPACE), email).toBe(true)
      expect(isLaneEmail(email, 'other'), email).toBe(false)
    }
    expect(isLaneEmail(OWNER.email, NAMESPACE)).toBe(false)
    expect(isLaneEmail(`clear-e2e-${NAMESPACE}-a@example.com`, NAMESPACE)).toBe(false)
  })
})

describe('a passing run', () => {
  it('provisions every user, asserts every section of every row, and agrees with the fast lane', async () => {
    const backend = createLaneBackend()
    const report = await backend.run()

    expect(report.problems).toEqual([])
    expect(report.users).toBe(plan.users.length)
    expect(report.assertions).toHaveLength(
      plan.rows.reduce((total, row) => total + row.sections.length, 0),
    )
    expect(report.assertions.every((assertion) => assertion.problems.length === 0)).toBe(true)

    for (const user of plan.users) {
      expect(report.cleanup.deleted, user.slot).toContain(laneEmail(NAMESPACE, user.slot))
    }
  })

  it('persists one workout whole, after a forced failure that left nothing', async () => {
    const backend = createLaneBackend()
    const report = await backend.run()

    expect(report.forcedFailure).toEqual({ refused: true, sessionsLeft: 0 })
    expect(report.persisted).toEqual({
      sessions: 1,
      sections: ownerMirror.enabledSections.length,
      blocks: ownerMirror.enabledSections.length,
      exercises: ownerMirror.enabledSections.length * 2,
    })
    expect(report.problems).toEqual([])
  })

  it('deletes everything it created and leaves the owner untouched', async () => {
    const backend = createLaneBackend()
    const report = await backend.run()

    expect(report.cleanup.remaining).toEqual({
      users: 0,
      profiles: 0,
      locations: 0,
      workout_sessions: 0,
    })
    expectOnlyTheOwnerIsLeft(backend)
    // Not one of the owner's rows was handed to the lane by a privileged read.
    expect(backend.served.filter((row) => row.__owner === OWNER.id)).toEqual([])
    expect(backend.double.requests).not.toContain(`DELETE /auth/v1/admin/users/${OWNER.id}`)
  })

  it('calls every RPC as the disposable user and never calls a function', async () => {
    const backend = createLaneBackend()
    await backend.run()

    expect(backend.rpcBearers.length).toBeGreaterThan(plan.rows.length)
    expect(backend.rpcBearers.every((bearer) => bearer.startsWith('Bearer token:user-'))).toBe(
      true,
    )
    expect(backend.double.requests.filter((request) => request.includes('/functions/'))).toEqual(
      [],
    )
  })

  it('replaces a user a cancelled run left behind, and no other namespace’s', async () => {
    const backend = createLaneBackend()
    const stale = laneEmail(NAMESPACE, OWNER_MIRROR_SLOT)
    const foreign = laneEmail('other', OWNER_MIRROR_SLOT)
    for (const [id, email] of [['stale-1', stale], ['foreign-1', foreign]]) {
      backend.double.users.set(email, {
        id,
        email,
        email_confirm: true,
        created_at: '2026-01-01T00:00:00Z',
      })
    }
    backend.double.tables.get('profiles')?.push({ id: 'stale-1', __owner: 'stale-1' })

    const report = await backend.run()

    expect(report.problems).toEqual([])
    expect(backend.double.requests).toContain('DELETE /auth/v1/admin/users/stale-1')
    expect([...backend.double.users.keys()].sort()).toEqual([foreign, OWNER.email].sort())
    expect(backend.stored()).toEqual(OWNER_STATE)
  })
})

describe('comparison with the fast lane', () => {
  const row = plan.rows[0]
  const answer = () =>
    row.sections.map((section) => ({
      section: section.section,
      relaxed: section.relaxed,
      candidates: Array.from({ length: section.count }, (_, index) => ({ exercise_id: index })),
    }))

  it('passes an answer that matches section by section', () => {
    const compared = compareRow(row, answer())

    expect(compared.problems).toEqual([])
    expect(compared.assertions.map((assertion) => assertion.section)).toEqual(
      row.sections.map((section) => section.section),
    )
  })

  it('fails a section that is empty even though the others are not', () => {
    const empty = answer()
    empty[0].candidates = []

    expect(compareRow(row, empty).problems).toEqual([
      `${row.id} ${row.sections[0].section}: the RPC returned no candidates`,
    ])
  })

  it('fails a count, a relaxation flag, a missing section and an extra one', () => {
    const [first] = row.sections
    const miscounted = answer()
    miscounted[0].candidates.pop()
    const flipped = answer()
    flipped[0].relaxed = !first.relaxed

    expect(compareRow(row, miscounted).problems).toEqual([
      `${row.id} ${first.section}: the RPC returned ${first.count - 1} candidates, the fast lane ${first.count}`,
    ])
    expect(compareRow(row, flipped).problems).toEqual([
      `${row.id} ${first.section}: the RPC says relaxed=${String(!first.relaxed)}, the fast lane ${String(first.relaxed)}`,
    ])
    expect(compareRow(row, answer().slice(1)).problems).toEqual([
      `${row.id} ${first.section}: the RPC did not resolve the section`,
    ])
    expect(
      compareRow(row, [...answer(), { section: 'carries', relaxed: false, candidates: [{}] }])
        .problems,
    ).toEqual([`${row.id} carries: resolved by the RPC, not by the fast lane`])
    expect(compareRow(row, null).problems).toHaveLength(row.sections.length)
  })

  it('fails a matrix row with no lane row, and a lane row with an unasserted section', () => {
    const asserted = plan.rows.flatMap((planned) =>
      planned.sections.map((section) => ({ row: planned.id, section: section.section })),
    )
    expect(coverageProblems(plan, asserted)).toEqual([])

    const [dropped] = plan.matrixRows
    expect(
      coverageProblems(
        { ...plan, rows: plan.rows.filter((planned) => planned.id !== dropped) },
        asserted,
      ),
    ).toEqual([`matrix row ${dropped} has no lane row`])

    expect(coverageProblems(plan, asserted.slice(1))).toEqual([
      `${asserted[0].row} ${asserted[0].section}: no assertion was made`,
    ])
  })
})

describe('a failed run', () => {
  it('reports the row and section where Postgres disagrees, and still cleans up', async () => {
    const target = plan.rows.find((row) => row.slot !== OWNER_MIRROR_SLOT)!
    let call = 0
    const backend = createLaneBackend({
      fault: (request) => {
        if (!isCandidateCall(request)) return undefined
        const args = request.body as { p_goal: string; p_focus: string; p_location_id: string }
        const location = request.rowsIn('locations').find((row) => row.id === args.p_location_id)
        if (
          args.p_goal !== target.goal ||
          args.p_focus !== target.focus ||
          location?.tier !== target.tier ||
          String(location?.name).endsWith(OWNER_MIRROR_SLOT)
        ) {
          return undefined
        }
        call += 1
        return request.respond(
          200,
          target.sections.map((section, index) => ({
            section: section.section,
            relaxed: section.relaxed,
            candidates: index === 0 ? [] : Array.from({ length: section.count }, () => ({})),
          })),
        )
      },
    })

    const report = await backend.run()

    expect(call).toBe(1)
    expect(report.problems).toEqual([
      `${target.id} ${target.sections[0].section}: the RPC returned no candidates`,
    ])
    expectOnlyTheOwnerIsLeft(backend)
  })

  it('reports an RPC that errors, records no assertion for it, and still cleans up', async () => {
    let failed = false
    const backend = createLaneBackend({
      fault: (request) => {
        if (!isCandidateCall(request) || failed) return undefined
        failed = true
        return request.respond(500, { message: 'boom' })
      },
    })

    const report = await backend.run()
    const [first] = plan.rows

    expect(report.problems).toContain(`${first.id}: the candidate RPC failed with 500`)
    expect(report.problems).toContain(
      `${first.id} ${first.sections[0].section}: no assertion was made`,
    )
    expectOnlyTheOwnerIsLeft(backend)
  })

  it('cleans up when provisioning dies halfway', async () => {
    let onboarded = 0
    const backend = createLaneBackend({
      fault: (request) => {
        if (request.url.pathname !== '/rest/v1/rpc/complete_onboarding') return undefined
        onboarded += 1
        return onboarded === 3 ? request.respond(500, { message: 'boom' }) : undefined
      },
    })

    const report = await backend.run()

    expect(report.users).toBe(3)
    expect(report.problems[0]).toMatch(/^the run stopped: onboarding .* failed with 500: boom$/)
    expect(report.cleanup.deleted).toHaveLength(3)
    expectOnlyTheOwnerIsLeft(backend)
  })

  it('cleans up when a request throws rather than answers', async () => {
    const backend = createLaneBackend({
      fault: (request) => {
        if (request.url.pathname === '/rest/v1/rpc/persist_session') {
          throw new Error('socket hang up')
        }
        return undefined
      },
    })

    const report = await backend.run()

    expect(report.problems).toContain('the run stopped: socket hang up')
    expect(report.persisted).toBeNull()
    expectOnlyTheOwnerIsLeft(backend)
  })

  it('fails when a forced failure leaves a partial workout behind', async () => {
    const backend = createLaneBackend({ atomic: false })
    const report = await backend.run()
    const sections = ownerMirror.enabledSections.length

    expect(report.forcedFailure).toEqual({ refused: true, sessionsLeft: 1 })
    expect(report.problems).toEqual(
      expect.arrayContaining([
        'persistence: the forced failure left 1 row(s) in workout_sessions',
        `persistence: the forced failure left ${sections} row(s) in workout_sections`,
        `persistence: the forced failure left ${sections} row(s) in workout_blocks`,
        `persistence: the forced failure left ${sections * 2 - 1} row(s) in workout_exercises`,
      ]),
    )
    expectOnlyTheOwnerIsLeft(backend)
  })

  it('fails when the forced failure is accepted', async () => {
    const backend = createLaneBackend({
      fault: (request) => {
        const sent = JSON.stringify(request.body ?? null)
        return request.url.pathname === '/rest/v1/rpc/persist_session' &&
          sent.includes(FORCED_FAILURE_EXERCISE_ID)
          ? request.respond(200, { session: { id: 'never-written' } })
          : undefined
      },
    })

    const report = await backend.run()

    expect(report.problems).toEqual(['persistence: the forced failure was accepted'])
    expectOnlyTheOwnerIsLeft(backend)
  })
})

describe('the Playwright spec', () => {
  const spec = readFileSync(join(REPO_ROOT, SPEC_PATH), 'utf8')
  const harness = readFileSync(join(REPO_ROOT, HARNESS_PATH), 'utf8')

  it('is a `.spec.ts` under e2e/, so Playwright collects it', () => {
    const config = readFileSync(join(REPO_ROOT, 'playwright.config.ts'), 'utf8')

    expect(config).toContain("testDir: './e2e'")
    expect(config).toContain('testMatch: /.*\\.spec\\.ts$/')
  })

  it('skips with the missing-credential reason rather than failing', () => {
    expect(spec).toContain('test.skip(!backend.available, backend.reason)')
  })

  it('makes no model call: neither file can invoke an Edge Function', () => {
    for (const source of [spec, harness]) {
      expect(source).not.toMatch(/functionAs|\/functions\/v1|generate-workout|anthropic/i)
    }
  })

  it('runs the same harness this suite proves, on the same fixture', () => {
    expect(spec).toContain("from '../scripts/generation-reliability/database-lane.mjs'")
    expect(spec).toContain('runDatabaseLane(')
    expect(spec).toContain('OWNER_MIRROR_PATH')
  })
})
