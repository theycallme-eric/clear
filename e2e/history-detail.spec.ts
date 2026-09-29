import { randomUUID } from 'node:crypto'

import { namespaceId } from '../scripts/e2e/namespace.mjs'

import { expect, test } from './fixtures'
import { REQUIRED_JOURNEYS, REQUIRED_SCREENS } from './required-routes'
import { backend } from './support/backend'

/**
 * REQ-010 / JOURNEY-017 — History list to Session Detail, in a browser, on the
 * phone.
 *
 * The unit suite proves the list derives rest runs and the detail screen reads
 * a reconstruction. What neither can prove is that a signed-in person on the
 * deployed build reaches a past workout the way the product offers it: Home's
 * `View history`, a filter, a row, the record. This walk does that, and it
 * starts at `/` on purpose — History is reached through Home's link, never by
 * typing its URL, so a History the product stopped linking to fails here.
 *
 * **It owns its data.** Two disposable users, created here and deleted in
 * teardown (auth deletion cascades every row below). The owner gets a completed
 * session with logged sets, a session never started, and a marked rest day in
 * the gap between them — so the list shows both kinds of row it has, and the
 * filter has something to narrow. The second user owns one session whose id the
 * owner asks for directly: the detail screen must answer with its not-found
 * error, never with somebody else's workout.
 *
 * **Signing in without an inbox.** The OTP screen is `auth-otp.spec.ts`'s
 * alone. Here a session is minted by the harness and handed to the app in the
 * shape `src/data/auth.ts` persists, before the first script runs — the same
 * state a person who verified a code is left in.
 */

/** Every step the inventory names for this journey, so the walk cannot drift from it. */
const JOURNEY = REQUIRED_JOURNEYS.find((journey) => journey.id === 'history-detail')

/** `src/data/auth.ts`'s `SESSION_STORAGE_KEY`, restated: nothing in `e2e/` imports `src/`. */
const SESSION_STORAGE_KEY = 'clear.auth.session'

/** The labels this walk drives by, as the screens render them. */
const VIEW_HISTORY = 'View history'
const HISTORY_LIST = 'Workout history'
const HISTORY_FILTER = 'Show'
const NOT_FOUND_TITLE = 'Workout not found'

test.describe('history-detail — the inventory names this walk', () => {
  test('Home, History, Session Detail — each a required screen', () => {
    expect(JOURNEY?.steps).toEqual(['Home', 'History', 'Session Detail'])

    for (const step of JOURNEY?.steps ?? []) {
      const screen = REQUIRED_SCREENS.find((candidate) => candidate.screen === step)
      expect(screen?.journeys, step).toContain('history-detail')
      expect(screen?.pendingOwner, `${step} is not mounted yet`).toBeUndefined()
    }
  })
})

test.describe('history-detail — History list to Session Detail on the deployed build', () => {
  test.skip(!backend.available, backend.reason)
  test.describe.configure({ mode: 'serial' })
  // The list places today in the browser's zone and the rows carry their own
  // day; pinning the zone keeps the seeded gap a gap wherever this runs.
  test.use({ timezoneId: 'UTC' })

  let client: ReturnType<typeof backend.client>

  type Actor = { id: string; email: string; token: string; refreshToken: string }
  let owner: Actor | null = null
  let other: Actor | null = null

  const ownerEmail = `clear-e2e-${namespaceId()}-history@example.com`
  const otherEmail = `clear-e2e-${namespaceId()}-history-other@example.com`

  /** Distinct titles, so a row, a heading and a leak are each unambiguous. */
  const TITLES = {
    completed: `History walk — completed (${namespaceId()})`,
    unstarted: `History walk — not started (${namespaceId()})`,
    foreign: `History walk — another user's (${namespaceId()})`,
  }

  const seeded = { completedId: '', unstartedId: '', foreignId: '', restDay: '' }

  const must = <T>(
    response: { ok: boolean; status: number; body: unknown },
    what: string,
  ): T => {
    const body = response.body as Record<string, unknown> | null
    const failure = body?.message ?? body?.msg ?? body?.error_description
    const detail = typeof failure === 'string' ? `: ${failure}` : ''
    expect(response.ok, `${what} (status ${response.status}${detail})`).toBe(true)
    return response.body as T
  }

  /** `YYYY-MM-DD`, `offset` days before today in UTC. */
  const daysAgo = (offset: number) => {
    const day = new Date()
    day.setUTCDate(day.getUTCDate() - offset)
    return day.toISOString().slice(0, 10)
  }

  /** Unix milliseconds the access token stops working at, read from the token itself. */
  const expiryOf = (accessToken: string) => {
    const payload = accessToken.split('.')[1] ?? ''
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as {
      exp?: number
    }
    return typeof claims.exp === 'number' ? claims.exp * 1000 : Date.now() + 60 * 60 * 1000
  }

  /** A fresh, confirmed, onboarded user — any earlier run's leftover deleted first. */
  const onboardedUser = async (email: string, equipment: string[]): Promise<Actor> => {
    const prior = await client.findUserByEmail(email)
    if (prior) await client.deleteUser(prior.id)

    const created = await client.ensureConfirmedUser(email)
    const session = await client.mintSession(email)

    must(
      await client.rpcAs(
        'complete_onboarding',
        {
          p_location_name: 'History walk fixture',
          p_location_tier: 'full',
          p_equipment: equipment,
          p_experience_level: 'some',
          p_goal_preset: 'balanced',
          p_sections: ['warmup', 'primary_lift', 'cooldown'],
          p_avoid_patterns: [],
          p_note: null,
        },
        session.accessToken,
      ),
      `onboarding ${email}`,
    )

    return {
      id: created.id,
      email,
      token: session.accessToken,
      refreshToken: session.refreshToken,
    }
  }

  const prescription = (exercise: { id: string; default_equipment: string }) => ({
    exercise_id: exercise.id,
    equipment: exercise.default_equipment,
    modality: 'reps',
    sets: 2,
    target_kind: 'fixed',
    target_value: 8,
    per_side: false,
    rest_seconds: 90,
    load_type: 'bodyweight',
    is_interval_exercise: false,
  })

  const acceptance = (
    date: string,
    title: string,
    exercise: { id: string; default_equipment: string },
  ) => ({
    date,
    location_id: null,
    session_focus: 'full_body',
    goal_preset: 'balanced',
    requested_duration_mins: 30,
    effective_duration_target_mins: 30,
    computed_duration_mins: null,
    requested_intensity: 5,
    effective_intensity: 5,
    adjustment_reason: null,
    generation_notes: null,
    prompt_version: 'e2e',
    // A current contract makes this completed fixture eligible for the
    // History -> Restart journey below. Legacy incompatibility is exercised
    // separately by the Session Detail component suite.
    contract_version: '4.1.0',
    workout: {
      title,
      overview: null,
      estimated_duration_mins: 30,
      sections: [
        {
          section_type: 'primary_lift',
          section_title: 'Primary',
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
              exercises: [prescription(exercise)],
            },
          ],
        },
      ],
    },
  })

  type Persisted = {
    session: { id: string }
    sections: { blocks: { exercises: { exercise: { id: string } }[] }[] }[]
  }

  const persist = async (actor: Actor, date: string, title: string, exercise: Catalogued) =>
    must<Persisted>(
      await client.rpcAs(
        'persist_session',
        { p_user_id: actor.id, p_session: acceptance(date, title, exercise) },
        actor.token,
      ),
      `persisting "${title}"`,
    )

  type Catalogued = { id: string; default_equipment: string }

  test.beforeAll(async () => {
    client = backend.client()

    const catalog = must<Catalogued[]>(
      await client.selectAsService('exercise_definitions', {
        select: 'id,default_equipment',
        order: 'id.asc',
        limit: '1',
      }),
      'reading the catalog',
    )
    expect(catalog.length, 'the catalog has no exercise to prescribe').toBeGreaterThan(0)
    const [exercise] = catalog
    const equipment = [exercise.default_equipment]

    owner = await onboardedUser(ownerEmail, equipment)
    other = await onboardedUser(otherEmail, equipment)

    // Newest first, as History reads it: yesterday's finished workout, two
    // untrained days (the first of them marked as rest), then one never begun.
    const completed = await persist(owner, daysAgo(1), TITLES.completed, exercise)
    seeded.completedId = completed.session.id
    const performedId = completed.sections[0].blocks[0].exercises[0].exercise.id

    const started = must<{ outcome: string }>(
      await client.rpcAs('start_session', { p_session_id: seeded.completedId }, owner.token),
      'starting the completed session',
    )
    expect(started.outcome).toBe('started')

    for (const setNumber of [1, 2]) {
      must(
        await client.insertAs(
          'exercise_set_logs',
          {
            // Client-minted, as the app mints them (EXE-07).
            id: randomUUID(),
            workout_exercise_id: performedId,
            set_number: setNumber,
            actual_reps: 8,
            weight: 40,
            weight_unit: 'kg',
          },
          owner.token,
        ),
        `logging set ${setNumber}`,
      )
    }

    const finished = must<{ outcome: string }>(
      await client.rpcAs(
        'complete_session',
        { p_session_id: seeded.completedId, p_actual_duration_mins: 30 },
        owner.token,
      ),
      'completing the session',
    )
    expect(finished.outcome).toBe('completed')

    seeded.restDay = daysAgo(2)
    must(
      await client.rpcAs(
        'mark_rest_day',
        { p_day: seeded.restDay, p_reason: 'rest', p_note: null },
        owner.token,
      ),
      'marking the rest day',
    )

    seeded.unstartedId = (await persist(owner, daysAgo(4), TITLES.unstarted, exercise)).session.id
    seeded.foreignId = (await persist(other, daysAgo(1), TITLES.foreign, exercise)).session.id
  })

  test.afterAll(async () => {
    // One delete per user: `auth.users` cascades to the profile, the
    // sessions, their set logs and the rest day.
    for (const actor of [owner, other]) {
      if (client && actor) await client.deleteUser(actor.id)
    }

    if (client) {
      for (const email of [ownerEmail, otherEmail]) {
        expect(await client.findUserByEmail(email), `${email} survived teardown`).toBeNull()
      }
    }
  })

  test.beforeEach(async ({ page }) => {
    const actor = owner
    if (actor === null) throw new Error('the owner was not seeded')

    // Written only when absent, so a token the app refreshes is not overwritten
    // by the stale one on the next navigation.
    await page.addInitScript(
      ({ key, value }) => {
        if (window.localStorage.getItem(key) === null) window.localStorage.setItem(key, value)
      },
      {
        key: SESSION_STORAGE_KEY,
        value: JSON.stringify({
          accessToken: actor.token,
          refreshToken: actor.refreshToken,
          expiresAt: expiryOf(actor.token),
          user: { id: actor.id, email: actor.email },
        }),
      },
    )
  })

  test('Home → View history → filter → a session, its sections and its sets', async ({
    page,
    visit,
    checkA11y,
  }) => {
    // The production entry point: Home, not `/history` typed in.
    await visit('/')
    await page.getByRole('link', { name: VIEW_HISTORY, exact: true }).click()

    await expect(page).toHaveURL(/\/history$/)
    await expect(page.locator('main h1')).toHaveText('History')

    const list = page.getByRole('list', { name: HISTORY_LIST })
    const completedRow = list.getByRole('link', { name: TITLES.completed })
    const unstartedRow = list.getByRole('link', { name: TITLES.unstarted })
    // A rest run is not a link — there is no session behind it — and it reads
    // as a span and a count, whatever the week looked like.
    const restRow = list.getByRole('listitem').filter({ hasText: /· 2 rest days/ })

    // Both kinds of row, before any filter narrows them.
    await expect(completedRow).toBeVisible()
    await expect(unstartedRow).toBeVisible()
    await expect(restRow).toHaveCount(1)
    await expect(restRow.getByRole('link')).toHaveCount(0)
    await checkA11y()

    const filter = page.getByLabel(HISTORY_FILTER)

    await filter.selectOption({ label: 'Rest days' })
    await expect(restRow).toHaveCount(1)
    await expect(list.getByRole('link')).toHaveCount(0)

    await filter.selectOption({ label: 'Completed' })
    await expect(completedRow).toBeVisible()
    await expect(unstartedRow).toHaveCount(0)
    await expect(restRow).toHaveCount(0)
    await checkA11y()

    await completedRow.click()

    await expect(page).toHaveURL(new RegExp(`/history/${seeded.completedId}$`))
    await expect(page.locator('main h1')).toHaveText(TITLES.completed)

    const sections = page.getByRole('region', { name: 'Sections' })
    const disclosure = sections.getByRole('button', { name: 'Primary' })
    await expect(disclosure).toHaveAttribute('aria-expanded', 'true')

    const sets = sections.getByRole('table', { name: /^Sets logged for / })
    await expect(sets).toBeVisible()
    await expect(sets.locator('tbody tr')).toHaveCount(2)
    await expect(sets.locator('tbody th')).toHaveText(['1', '2'])
    await checkA11y()
  })

  test('a compatible completed session restarts into Review without generation', async ({
    page,
    visit,
    checkA11y,
  }) => {
    const generationRequests: string[] = []
    page.on('request', (request) => {
      if (
        request.method() === 'POST' &&
        request.url().includes('/functions/v1/generate-workout')
      ) {
        generationRequests.push(request.url())
      }
    })

    await visit(`/history/${seeded.completedId}`)
    await expect(page.locator('main h1')).toHaveAccessibleName(TITLES.completed)

    await page.getByRole('button', { name: 'Restart', exact: true }).click()

    await expect(page).toHaveURL(/\/review$/)
    await expect(page.locator('main h1')).toHaveAccessibleName(TITLES.completed)
    await expect(page.getByRole('button', { name: 'Start workout', exact: true })).toBeVisible()
    expect(generationRequests, 'Restart called the model-backed generation endpoint').toEqual([])
    await checkA11y()
  })

  test("another user's session id renders the error state, not their workout", async ({
    page,
    visit,
  }) => {
    // Asking for it is the point, so this is the one URL typed in; `visit`
    // still scans the screen it lands on.
    await visit(`/history/${seeded.foreignId}`)

    const alert = page.getByRole('alert')
    // A direct reconstruction can cold-start independently of the list read;
    // wait on the product's resolved state rather than Playwright's five-second
    // assertion default. The loading screen remains visible and honest while
    // RLS resolves the foreign id to the same not-found answer as a missing id.
    await expect(alert).toBeVisible({ timeout: 30_000 })
    await expect(alert).toContainText(NOT_FOUND_TITLE)
    await expect(page.getByText(TITLES.foreign)).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Sections' })).toHaveCount(0)
  })
})
