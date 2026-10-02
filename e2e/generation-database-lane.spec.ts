import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { namespaceId } from '../scripts/e2e/namespace.mjs'
import {
  OWNER_MIRROR_SLOT,
  buildLanePlan,
  coverageProblems,
  laneEmail,
  runDatabaseLane,
} from '../scripts/generation-reliability/database-lane.mjs'
import { OWNER_MIRROR_PATH } from '../scripts/generation-reliability/deployed.mjs'
import { loadRetrievalRules } from '../scripts/generation-reliability/rules.mjs'
import { EQUIPMENT, EQUIPMENT_BY_TIER, SECTIONS_BY_GOAL } from '../src/state/onboarding'
import { seededCatalog } from '../src/test/seed-catalog'

import { expect, test } from './fixtures'
import { backend } from './support/backend'

/**
 * GR-05 / REQ-021 — the database lane: Postgres, asked what the fast lane says.
 *
 * The fast lane proves retrieval against the committed seed and a
 * transcription of the SQL. This spec provisions disposable users in the hosted
 * project — one mirroring the owner's saved configuration, one per advertised
 * tier × Goal preset — and calls the real `generation_candidate_sets_for_goal`
 * as each of them, for every focus. Every section of every answer is held to
 * the matrix row it came from. One workout is then accepted through
 * `persist_session`, after an acceptance forced to fail on its last
 * prescription has been shown to leave no row at all.
 *
 * The run, its comparison and its cleanup are `runDatabaseLane`, which
 * `src/test/generation-reliability/database-lane-harness.test.ts` proves
 * against the Supabase double. Cleanup is inside that function's own
 * try/finally rather than in an `afterAll`, so it has happened by the time the
 * first assertion below reads the report — pass or fail.
 *
 * There is no browser and no Edge Function here, so there is no model call and
 * nothing a viewport changes: the lane runs once, on the mobile project.
 */

const LANE_PROJECT = 'mobile'
const LANE_PROJECT_REASON = 'no browser is involved, so the lane runs once, on the mobile project'

/** 21 users and 84 retrievals against a hosted project; far past the 30s default. */
const LANE_TIMEOUT_MS = 10 * 60 * 1000

// Built while the suite is collected, so the tests below are the matrix's rows
// rather than a list somebody remembered to extend.
const plan = buildLanePlan(
  {
    rules: loadRetrievalRules(),
    catalog: seededCatalog(),
    equipmentByTier: EQUIPMENT_BY_TIER,
    sectionsByGoal: SECTIONS_BY_GOAL,
    equipment: EQUIPMENT.map((item) => item.value),
  },
  JSON.parse(readFileSync(resolve(process.cwd(), OWNER_MIRROR_PATH), 'utf8')),
)

test.describe('generation database lane', () => {
  test.skip(!backend.available, backend.reason)
  test.describe.configure({ mode: 'serial' })

  const namespace = namespaceId()
  let report: Awaited<ReturnType<typeof runDatabaseLane>> | null = null

  test.beforeAll(async () => {
    if (test.info().project.name !== LANE_PROJECT) return

    test.setTimeout(LANE_TIMEOUT_MS)
    report = await runDatabaseLane({ client: backend.client(), plan, namespace })
  })

  /** The finished run, or a skip on the projects that do not run it. */
  const finished = () => {
    test.skip(report === null, LANE_PROJECT_REASON)
    return report as NonNullable<typeof report>
  }

  for (const user of plan.users) {
    const rows = plan.rows.filter((row) => row.slot === user.slot)
    const title =
      user.kind === 'owner-mirror'
        ? `the owner's saved configuration resolves every section, per focus`
        : `${user.tier} × ${user.goal} resolves every required section, per focus`

    test(title, () => {
      const run = finished()

      for (const row of rows) {
        const asserted = run.assertions.filter((assertion) => assertion.row === row.id)

        // Per section: a row whose answer was non-empty in aggregate proves
        // nothing about the section that came back empty.
        expect(
          asserted.map((assertion) => assertion.section),
          `${row.id}: sections asserted`,
        ).toEqual(row.sections.map((section) => section.section))
        for (const assertion of asserted) {
          expect(assertion.problems, `${row.id} ${assertion.section}`).toEqual([])
        }
        expect(
          run.problems.filter((problem) => problem.startsWith(`${row.id}:`)),
          row.id,
        ).toEqual([])
      }
    })
  }

  test('every matrix row has an assertion for every section it requires', () => {
    expect(coverageProblems(plan, finished().assertions)).toEqual([])
  })

  test('a workout persists whole, and a forced failure leaves no partial workout', () => {
    const run = finished()

    // The forced failure runs first, so anything left would be a partial workout.
    expect(run.forcedFailure).toEqual({ refused: true, sessionsLeft: 0 })
    expect(run.persisted?.sessions).toBe(1)
    expect(run.persisted?.sections).toBeGreaterThan(0)
    expect(run.persisted?.blocks).toBe(run.persisted?.sections)
    expect(run.persisted?.exercises).toBeGreaterThanOrEqual(run.persisted?.blocks ?? 0)
    expect(run.problems.filter((problem) => problem.startsWith('persistence:'))).toEqual([])
  })

  test('every disposable user and its rows are gone', () => {
    const run = finished()

    expect(run.cleanup.remaining).toEqual({
      users: 0,
      profiles: 0,
      locations: 0,
      workout_sessions: 0,
    })
    expect(run.cleanup.deleted).toContain(laneEmail(namespace, OWNER_MIRROR_SLOT))
    expect(run.problems.filter((problem) => problem.startsWith('cleanup'))).toEqual([])
  })

  test('the run reported nothing else', () => {
    const run = finished()

    expect(run.users).toBe(plan.users.length)
    expect(run.problems).toEqual([])
  })
})
