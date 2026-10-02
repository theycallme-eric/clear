import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import type { Page } from '@playwright/test'

import { AdminError } from '../scripts/e2e/client.mjs'
import { namespaceId } from '../scripts/e2e/namespace.mjs'
import { OWNER_MIRROR_PATH } from '../scripts/generation-reliability/deployed.mjs'
import {
  EVIDENCE_RECORD_PATH,
  RUN_DIR,
  buildEntryResult,
  buildRecord,
  buildUatPlan,
  isUatEmail,
  readTargetEnv,
  recordFailures,
  recordProblems,
  resolveDeployedTarget,
  serializeRecord,
  uatEmail,
} from '../scripts/generation-reliability/release-evidence.mjs'
import { loadRetrievalRules } from '../scripts/generation-reliability/rules.mjs'
import {
  EQUIPMENT_BY_TIER,
  GOALS,
  SECTIONS,
  SECTIONS_BY_GOAL,
  TIERS,
  labelOf,
} from '../src/state/onboarding'

import { test as base, expect } from './fixtures'
import { REQUIRED_SCREENS } from './required-routes'
import { backend } from './support/backend'

/**
 * GR-07 / REQ-028 / TASK-027 — the deployed UAT matrix.
 *
 * Nine entries, each a disposable user walked on the *deployed* application
 * from Welcome to Review: a new user, a returning user, a default preset, a
 * customized profile (the owner mirror), the Minimal tier, the Building tier,
 * and one entry for each repaired optional section. What is held, per entry:
 *
 *  * **The deployed application.** The origin is `E2E_BASE_URL`, or failing
 *    that the public alias of the newest ready production deployment. It is
 *    never the local dev server: the walk's `baseURL` is replaced with it.
 *  * **The deployed database resolves it.** The real
 *    `generation_candidate_sets_for_goal` is called as the user, for the saved
 *    state read back out of the database, and the composition is built from
 *    what it returned — not from the committed seed.
 *  * **No model.** Every `generate-*` request is answered here and never
 *    continued, so nothing reaches the function that would call the provider.
 *  * **Per section.** Each saved section gets its own row — candidates
 *    resolved, composed, shown on Review — and its own assertion.
 *  * **Nothing left.** The user is deleted whatever the outcome, and the
 *    database is read as the service role to count what remains.
 *
 * Each entry writes its result under the ignored `release-evidence/` as it
 * finishes, so one entry failing cannot erase the others. The last test sweeps
 * the namespace and writes
 * `docs/process/generation-reliability/release-evidence.json`, which holds
 * enumerated values, counts and the deployed commit and nothing else.
 *
 * There is one matrix and one record, so the lane runs once, on the mobile
 * project.
 */

const LANE_PROJECT = 'mobile'
const LANE_PROJECT_REASON = 'the deployed matrix runs once, on the mobile project'

type SectionId = (typeof SECTIONS)[number]['value']

const rules = loadRetrievalRules()

// Built while the suite is collected, so the tests below are the plan's entries.
const plan = buildUatPlan({
  sectionsByGoal: SECTIONS_BY_GOAL,
  equipmentByTier: EQUIPMENT_BY_TIER,
  sectionOrder: rules.enums.section_type,
  mirror: JSON.parse(readFileSync(resolve(process.cwd(), OWNER_MIRROR_PATH), 'utf8')),
})

type Entry = (typeof plan)[number]
type EntryResult = ReturnType<typeof buildEntryResult>
type Target = Awaited<ReturnType<typeof resolveDeployedTarget>>

/** Resolved once per worker; a failed entry restarts the worker and asks again. */
let resolving: Promise<Target> | null = null
const deployedTarget = () => (resolving ??= resolveDeployedTarget({ env: readTargetEnv() }))

const test = base.extend({
  // The application under test is the deployment, whatever the config's default.
  baseURL: async ({ browserName }, use) => {
    void browserName
    await use((await deployedTarget()).origin)
  },
})

const runDir = () => resolve(process.cwd(), RUN_DIR)

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
}

/** The tables a user's saved state and workouts occupy, with the owner column. */
const OWNED_TABLES = [
  ['profiles', 'id'],
  ['locations', 'user_id'],
  ['user_constraints', 'user_id'],
  ['workout_sessions', 'user_id'],
] as const

/** The inventory's route for a screen, so the walk cannot drift from it. */
function routeOf(screen: string): string {
  const entry = REQUIRED_SCREENS.find((candidate) => candidate.screen === screen)
  if (entry?.path == null) throw new Error(`"${screen}" has no required route`)
  return entry.path
}

/** The screen is the route *and* its heading. */
async function expectScreen(page: Page, screen: string, heading: string) {
  const path = routeOf(screen)
  await expect(page, `${screen} is served at ${path}`).toHaveURL((url) => url.pathname === path, {
    timeout: 30_000,
  })
  await expect(page.locator('main h1'), `${screen}'s heading`).toHaveAccessibleName(heading, {
    timeout: 30_000,
  })
}

interface CandidateSet {
  section: SectionId
  candidates: { exercise_id: string; usable_equipment: string[] }[]
}

interface GenerationRequestBody {
  goal: string
  date: string
  focus: string
  requested_intensity: number
  requested_duration_mins: number
  location_id: string
  deload?: boolean
}

/**
 * The hosted project limits code verifications per address of origin, and nine
 * users verify close together — more so when the lane is run twice in a row.
 * A 429 is the limiter, not the product: it is waited out, a bounded number of
 * times, and anything else is thrown as it is.
 */
const RATE_LIMIT_RETRIES = 12
const RATE_LIMIT_WAIT_MS = 20_000
const RATE_LIMITED = 429

const pause = () => new Promise<void>((done) => setTimeout(done, RATE_LIMIT_WAIT_MS))

async function patiently<T>(attempt: () => Promise<T>): Promise<T> {
  for (let tries = 0; ; tries += 1) {
    try {
      return await attempt()
    } catch (error) {
      const limited = error instanceof AdminError && error.status === RATE_LIMITED
      if (!limited || tries >= RATE_LIMIT_RETRIES) throw error
      await pause()
    }
  }
}

const titleOf = (entry: Entry) => `UAT ${entry.id.replaceAll('_', ' ')}`

/**
 * The deterministic composition: one block per resolved section, holding that
 * section's first candidate with its first usable equipment.
 */
function compose(entry: Entry, request: GenerationRequestBody, sets: CandidateSet[]) {
  return {
    date: request.date,
    location_id: request.location_id,
    session_focus: request.focus,
    goal_preset: request.goal,
    requested_duration_mins: request.requested_duration_mins,
    effective_duration_target_mins: request.requested_duration_mins,
    computed_duration_mins: null,
    requested_intensity: request.requested_intensity,
    effective_intensity: request.requested_intensity,
    adjustment_reason: null,
    generation_notes: null,
    prompt_version: 'e2e-deterministic',
    contract_version: 'e2e-deterministic',
    is_deload: request.deload ?? false,
    workout: {
      title: titleOf(entry),
      overview: null,
      estimated_duration_mins: request.requested_duration_mins,
      sections: sets.map((set) => {
        const [candidate] = set.candidates
        return {
          section_type: set.section,
          section_title: labelOf(SECTIONS, set.section),
          section_notes: null,
          blocks: [
            {
              structure_type: 'standard',
              rounds: null,
              timer_type: 'none',
              timer_seconds: null,
              round_rest_seconds: null,
              rep_scheme: 'fixed',
              block_notes: null,
              exercises: [
                {
                  exercise_id: candidate.exercise_id,
                  equipment: candidate.usable_equipment[0],
                  session_function: 'accessory',
                  anchor_relationship: 'neutral',
                  modality: 'reps',
                  sets: 2,
                  per_side: false,
                  distance_unit: null,
                  rest_seconds: 60,
                  tempo: null,
                  load_type: 'none',
                  load_value: null,
                  is_interval_exercise: false,
                  target_kind: 'fixed',
                  target_value: 8,
                  target_min: null,
                  target_max: null,
                  target_sequence: null,
                },
              ],
            },
          ],
        }
      }),
    },
  }
}

test.describe('deployed UAT matrix: nine entries to Review, model-free (REQ-028)', () => {
  test.skip(!backend.available, backend.reason)
  // In order and in one worker, and an entry that fails does not skip the rest:
  // the record needs a result for all nine.
  test.describe.configure({ mode: 'default', retries: 0 })

  const namespace = namespaceId()

  test.beforeEach(({ browserName }, testInfo) => {
    void browserName
    test.skip(testInfo.project.name !== LANE_PROJECT, LANE_PROJECT_REASON)
  })

  test('the deployed application and its commit are resolved', async ({ browserName }) => {
    void browserName
    const target = await deployedTarget()

    expect(target.origin, 'the target is the local dev server').not.toMatch(/localhost|127\.0\.0\.1/)

    // A new run: nothing an earlier one wrote may be read as this one's result.
    rmSync(runDir(), { recursive: true, force: true })
    mkdirSync(runDir(), { recursive: true })
    writeFileSync(
      join(runDir(), 'target.json'),
      JSON.stringify({ source: target.source, commit: target.commit }),
    )
  })

  for (const entry of plan) {
    test(`${entry.id}: reaches Review with every saved section, composed deterministically`, async ({
      page,
      visit,
    }) => {
      // The walk itself takes seconds; the rest is room to wait out the limiter.
      test.setTimeout(600_000)

      const client = backend.client()
      const email = uatEmail(namespace, entry.id)
      const rows: { section: string; candidates: number; composed: boolean; reviewed: boolean }[] = []
      const requestIds: string[] = []
      let step = 'provision'
      let failure: unknown = null
      let userId: string | null = null
      let generationRequests = 0
      // Minted once and used for both the onboarding and the candidate RPC.
      let accessToken: string | null = null

      try {
        // A cancelled prior run may have left this exact address behind. Only
        // it is deleted; auth deletion cascades to everything the user owned.
        const prior = await client.findUserByEmail(email)
        if (prior) await client.deleteUser(prior.id)
        userId = (await client.ensureConfirmedUser(email)).id as string

        // Everyone but the new user is onboarded by the product's own
        // transaction before the walk, so the door leads Home.
        if (entry.door === 'sign_in') {
          accessToken = (await patiently(() => client.mintSession(email))).accessToken as string
          const onboarded = await client.rpcAs(
            'complete_onboarding',
            {
              p_location_name: 'UAT gym',
              p_location_tier: entry.tier,
              p_equipment: entry.equipment,
              p_experience_level: 'some',
              p_goal_preset: entry.goal,
              p_sections: entry.sections,
              p_avoid_patterns: [],
              p_note: null,
            },
            accessToken,
          )
          expect(onboarded.ok, `onboarding the user (status ${onboarded.status})`).toBe(true)
        }

        // ── Deterministic composition, in place of the provider ──────────────
        // Registered before anything loads. Every request to a generation
        // function is answered here; none is continued to the network.
        let resolved: CandidateSet[] | null = null
        let composed: ReturnType<typeof compose> | null = null
        let release!: () => void
        const held = new Promise<void>((done) => {
          release = done
        })
        await page.route('**/functions/v1/generate-*', async (route) => {
          const request = route.request()
          if (request.method() === 'OPTIONS') {
            await route.fulfill({ status: 204, headers: CORS })
            return
          }
          generationRequests += 1
          const requestId = request.headers()['x-request-id']
          if (requestId) requestIds.push(requestId)

          composed = compose(
            entry,
            request.postDataJSON() as GenerationRequestBody,
            (resolved ?? []).filter((set) => set.candidates.length > 0),
          )
          // Held until Loading has been asserted, so the screen cannot be skipped.
          await held
          await route.fulfill({
            status: 200,
            headers: CORS,
            json: { requestId, acceptance: composed },
          })
        })

        const paths: string[] = []
        page.on('framenavigated', (frame) => {
          if (frame === page.mainFrame()) paths.push(new URL(frame.url()).pathname)
        })

        // ── Welcome ──────────────────────────────────────────────────────────
        step = 'welcome'
        await visit(routeOf('Welcome'))
        await expectScreen(page, 'Welcome', 'CLEAR')
        const door = entry.door === 'sign_up' ? 'Create account' : 'Sign in'
        await page.getByRole('button', { name: door, exact: true }).click()

        // ── OTP Login ────────────────────────────────────────────────────────
        step = 'sign_in'
        await expectScreen(page, 'OTP Login', door)

        // Delivery only: `/auth/v1/otp` would mail an undeliverable address.
        // The request still has to be made.
        let deliveryRequested = false
        await page.route('**/auth/v1/otp', async (route) => {
          deliveryRequested = true
          await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
        })

        const emailField = page.getByLabel('Email')
        await expect(emailField).toBeVisible({ timeout: 30_000 })
        await emailField.fill(email)
        await page.getByRole('button', { name: 'Send code', exact: true }).click()
        const code = page.getByLabel('Code')
        await expect(code).toBeFocused()
        expect(deliveryRequested, 'the Login screen never asked for a code').toBe(true)

        for (let tries = 0; ; tries += 1) {
          const { emailOtp } = await client.generateOneTimeCode(email)
          await code.fill(emailOtp)
          const verified = page.waitForResponse(
            (response) =>
              response.url().includes('/auth/v1/verify') && response.request().method() === 'POST',
          )
          await page.getByRole('button', { name: 'Verify', exact: true }).click()
          const status = (await verified).status()
          if (status === RATE_LIMITED && tries < RATE_LIMIT_RETRIES) {
            await pause()
            continue
          }
          expect(status, 'the public verify endpoint refused the code').toBe(200)
          break
        }

        // ── Onboarding (the new user only) ───────────────────────────────────
        if (entry.door === 'sign_up') {
          step = 'onboarding'
          await expectScreen(page, 'Onboarding', 'Set up CLEAR')
          const next = page.getByRole('button', { name: 'Next', exact: true })

          await page.getByRole('radio', { name: new RegExp(`^${labelOf(TIERS, entry.tier)}`) }).click()
          await next.click()
          await page.getByRole('radio', { name: /^Some experience/ }).click()
          await next.click()
          await page.getByRole('radio', { name: new RegExp(`^${labelOf(GOALS, entry.goal)}`) }).click()
          await next.click()
          await page.getByRole('button', { name: 'Skip', exact: true }).click()
          await page.getByRole('button', { name: 'Finish setup', exact: true }).click()
        }

        // ── Home ─────────────────────────────────────────────────────────────
        step = 'home'
        await expectScreen(page, 'Home', 'Today')
        if (entry.door === 'sign_in') {
          expect(paths, 'a returning user was routed to Onboarding').not.toContain(
            routeOf('Onboarding'),
          )
        }

        // ── The saved state, read back rather than presumed ──────────────────
        step = 'saved_state'
        const profile = await client.selectAsService('profiles', {
          select: 'goal_preset,enabled_sections',
          id: `eq.${userId}`,
        })
        expect(profile.ok, 'reading the saved profile').toBe(true)
        const [{ goal_preset: goal, enabled_sections: saved }] = profile.body as {
          goal_preset: string
          enabled_sections: SectionId[]
        }[]
        expect(goal).toBe(entry.goal)
        expect([...saved].sort(), 'the saved sections').toEqual([...entry.sections].sort())

        const locations = await client.selectAsService('locations', {
          select: 'id,tier,location_equipment(equipment_id)',
          user_id: `eq.${userId}`,
        })
        expect(locations.ok, 'reading the saved location').toBe(true)
        const stored = locations.body as {
          id: string
          tier: string
          location_equipment: { equipment_id: string }[]
        }[]
        expect(stored).toHaveLength(1)
        expect(stored[0].tier).toBe(entry.tier)
        expect(stored[0].location_equipment.map((row) => row.equipment_id).sort()).toEqual(
          [...entry.equipment].sort(),
        )

        // ── Candidate resolution, on the deployed database ───────────────────
        step = 'candidate_resolution'
        accessToken ??= (await patiently(() => client.mintSession(email))).accessToken as string
        const answer = await client.rpcAs(
          'generation_candidate_sets_for_goal',
          {
            p_user_id: userId,
            p_goal: entry.goal,
            p_focus: entry.focus,
            p_location_id: stored[0].id,
            p_session_id: null,
            p_floor: rules.floor,
          },
          accessToken,
        )
        expect(answer.ok, `the candidate RPC (status ${answer.status})`).toBe(true)
        const returned = (Array.isArray(answer.body) ? answer.body : []) as CandidateSet[]
        resolved = saved.map((section) => ({
          section,
          candidates: (
            returned.find((set) => set.section === section)?.candidates ?? []
          ).filter((candidate) => candidate.usable_equipment.length > 0),
        }))
        for (const set of resolved) {
          rows.push({
            section: set.section,
            candidates: set.candidates.length,
            composed: false,
            reviewed: false,
          })
        }

        // ── Generate ─────────────────────────────────────────────────────────
        step = 'generate'
        const generate = page.getByRole('button', { name: 'Generate workout', exact: true })
        await expect(generate, 'Home’s Generate action is not available').toBeEnabled({
          timeout: 30_000,
        })
        await generate.click()
        await expectScreen(page, 'Generate', 'Generate workout')
        await expect(
          page.getByText(new RegExp(`^Goal: ${labelOf(GOALS, entry.goal)}`)),
        ).toBeVisible({ timeout: 30_000 })
        const anchor = page.getByRole('group', { name: 'Anchor', exact: true })
        await expect(anchor).toBeVisible({ timeout: 30_000 })
        await anchor.getByRole('button', { name: 'Full body', exact: true }).click()
        await page.getByRole('button', { name: 'Generate workout', exact: true }).click()

        // ── Loading (transient, in place of Generate) ────────────────────────
        step = 'loading'
        await expect(page.locator('main h1'), 'the Loading screen').toHaveAccessibleName(
          'Generating session',
        )
        await expect(page).toHaveURL((url) => url.pathname === routeOf('Generate'))
        release()

        // ── Review ───────────────────────────────────────────────────────────
        step = 'review'
        await expectScreen(page, 'Review', titleOf(entry))
        const composition = composed as ReturnType<typeof compose> | null
        expect(composition?.session_focus, 'the focus generated for').toBe(entry.focus)
        // One press, one request, answered here: nothing reached the provider.
        expect(generationRequests, 'generation was retried or repeated').toBe(1)

        // Section by section, never "something rendered". Observed here and
        // asserted below, so one missing section does not hide the others.
        step = 'sections'
        const composedSections = composition?.workout.sections.map((s) => s.section_type) ?? []
        for (const row of rows) {
          row.composed = composedSections.includes(row.section as SectionId)
          row.reviewed = await expect(
            page.getByText(labelOf(SECTIONS, row.section as SectionId), { exact: true }).first(),
          )
            .toBeVisible({ timeout: 10_000 })
            .then(
              () => true,
              () => false,
            )
        }
      } catch (error) {
        failure = error
      }

      // ── Cleanup, whatever the outcome ──────────────────────────────────────
      let cleanup: { usersLeft: number; rowsLeft: number } | null = null
      try {
        const provisioned = await client.findUserByEmail(email)
        if (provisioned) await client.deleteUser(provisioned.id)
        const ownerId = userId ?? (provisioned?.id as string | undefined) ?? null

        let rowsLeft = 0
        if (ownerId !== null) {
          for (const [table, column] of OWNED_TABLES) {
            const left = await client.selectAsService(table, {
              select: column,
              [column]: `eq.${ownerId}`,
            })
            if (!left.ok) throw new Error(`counting ${table} failed with ${left.status}`)
            rowsLeft += (left.body as unknown[]).length
          }
        }
        cleanup = { usersLeft: (await client.findUserByEmail(email)) ? 1 : 0, rowsLeft }
      } catch (error) {
        failure ??= error
      }

      const result = buildEntryResult(entry, {
        failedStep: failure === null ? null : step,
        sections: rows,
        requestIds,
        cleanup,
      })
      mkdirSync(runDir(), { recursive: true })
      writeFileSync(join(runDir(), `${entry.id}.json`), JSON.stringify(result))

      if (failure !== null) throw failure

      expect(result.sections.map((row) => row.section)).toEqual(entry.sections)
      for (const row of result.sections) {
        expect(row, `${entry.id}: the "${row.section}" section`).toMatchObject({
          composed: true,
          reviewed: true,
          result: 'pass',
        })
        expect(row.candidates, `${entry.id}: candidates for "${row.section}"`).toBeGreaterThan(0)
      }
      expect(result.cleanup, `${entry.id}: left behind`).toEqual({ usersLeft: 0, rowsLeft: 0 })
      expect(result.result).toBe('pass')
    })
  }

  test('no disposable user remains, and the release evidence record is written', async ({
    browserName,
  }, testInfo) => {
    void browserName
    const client = backend.client()

    // The namespace-wide sweep: anything this lane ever addressed, whichever
    // entry made it. A straggler is deleted, and counted only if it survives.
    const mine = (users: { email?: string }[]) =>
      users.filter((user) => isUatEmail(user.email, namespace))
    for (const user of mine(await client.listUsers())) {
      await client.deleteUser((user as { id: string }).id)
    }
    const usersLeft = mine(await client.listUsers()).length

    const read = <T>(name: string): T | null => {
      try {
        return JSON.parse(readFileSync(join(runDir(), name), 'utf8')) as T
      } catch {
        return null
      }
    }
    const results = plan.map((entry) => read<EntryResult>(`${entry.id}.json`))
    const target = read<{ source: string; commit: string | null }>('target.json')
    expect(target, 'the deployed target was never resolved by this run').not.toBeNull()

    const record = buildRecord({
      plan,
      results,
      target: target as NonNullable<typeof target>,
      cleanup: {
        usersLeft,
        rowsLeft: results.reduce((sum, result) => sum + (result?.cleanup.rowsLeft ?? 0), 0),
      },
    })
    const contents = serializeRecord(record)
    const path = resolve(process.cwd(), EVIDENCE_RECORD_PATH)
    writeFileSync(path, contents)
    await testInfo.attach('release-evidence', { path, contentType: 'application/json' })

    expect(
      recordProblems(contents, {
        sections: rules.enums.section_type,
        goals: rules.enums.goal_preset,
        tiers: rules.enums.equipment_tier,
        focuses: rules.enums.session_focus,
      }),
    ).toEqual([])
    expect(usersLeft, 'disposable users left in the namespace').toBe(0)
    expect(recordFailures(record)).toEqual([])
  })
})
