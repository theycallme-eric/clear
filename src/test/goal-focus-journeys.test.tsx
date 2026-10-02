/**
 * REQ-016 — the six Goal/Focus verification journeys, on the real route tree.
 *
 * One test per journey, each driven through the app router over the same
 * doubles the screen tests use: a profile store that Settings writes to and
 * every read answers from, a history page in the shared cache, a generation
 * client that answers when the test says so, and a sessions client that records
 * what `accept` was handed. The generation double answers the way the backend
 * does — the acceptance restates the request's Goal and Focus — so what `accept`
 * receives is the row the journey would have stored.
 *
 * And REQ-015's guardrail that only a test can hold still: the recovery added
 * no migration. The enums are pinned by `generated-types.test.ts`.
 */
import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  CHANGE_FOCUS_LABEL,
  FIRST_WORKOUT_MESSAGE,
  OVERRIDE_GROUP_LABEL,
  OVERRIDE_SCOPE,
  RECOVERY_LABEL,
} from '../app/Generate'
import { REGENERATE_LABEL, START_LABEL } from '../app/Review'
import { REVIEW_PATH } from '../app/ReviewRoute'
import { createTestRouter } from '../app/router'
import type { GenerationInput } from '../data/generation'
import { ok } from '../state/errors'
import { ANCHORS, INTENSITY_BY_GOAL, POWER_REFUSAL } from '../state/generation-form'
import { historyQueryKey } from '../state/history-queries'
import { QueryClient } from '../state/query'
import type { Profile, SessionAcceptance, WorkoutSessionRow } from '../state/schemas'
import { suggestionDay } from '../state/session-suggestion'
import { toastQueue } from '../state/toasts'
import { locationsQueryKey, profileQueryKey } from '../state/user-queries'
import { makeGenerationError, makeSessionAcceptance, makeSessionRow } from './factories'
import { createFakeGenerationClient, type FakeGenerationClient } from './generation-double'
import { AppProviders, signedIn } from './render'
import {
  createFakeUserDataClient,
  FIXTURE_USER_ID,
  fixtureLocation,
  onboardedProfile,
} from './user-data-double'
import { createWorkoutDouble, snapshotFixture } from './workout-double'

/**
 * Days are counted back from today rather than pinned to a date: the
 * recommendation is only made from recent history, so a fixture with a
 * written-down date would go stale while the suite kept passing.
 */
function daysAgo(days: number): string {
  const [year, month, date] = suggestionDay().split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, date - days)).toISOString().slice(0, 10)
}

function completed(
  index: number,
  daysBack: number,
  overrides: Partial<WorkoutSessionRow> = {},
): WorkoutSessionRow {
  const day = daysAgo(daysBack)

  return makeSessionRow({
    id: `c000000${index}-0000-4000-8000-000000000000`,
    date: day,
    created_at: `${day}T08:00:00.000Z`,
    started_at: `${day}T09:00:00.000Z`,
    completed_at: `${day}T10:00:00.000Z`,
    session_focus: 'upper_body',
    effective_intensity: 7,
    requested_intensity: 7,
    ...overrides,
  })
}

/** Upper body twice this week and lower body 16 days back: Lower body is stalest. */
function lowerBodyDue(): WorkoutSessionRow[] {
  return [completed(1, 1), completed(2, 3), completed(3, 16, { session_focus: 'lower_body' })]
}

const LOWER_BODY_REASON = /^No \w+ in 16 days\.$/
const HISTORY_CLAIM =
  /suggested|recommended|your last \d+ sessions|no \w+ in \d+ days|sessions you’ve logged/i

interface JourneyOptions {
  /** The standing Goal the profile store starts on. */
  goal?: Profile['goal_preset']
  /** The completed sessions the history page holds. */
  history?: readonly WorkoutSessionRow[]
  entry?: string
}

/**
 * One visit to the app. The profile lives in a store both the reads and
 * Settings' write go through, so "Settings is unchanged" and "the new Goal is
 * used" are read back from the same place the next generation reads.
 */
function visit({ goal = 'strength', history = lowerBodyDue(), entry = '/generate' }: JourneyOptions = {}) {
  const store = { profile: onboardedProfile({ goal_preset: goal }) }
  const userData = createFakeUserDataClient({
    profile: async () => ok(store.profile),
    async updatePreferences(_userId, preferences) {
      store.profile = { ...store.profile, ...preferences }
      return ok(store.profile)
    },
  })

  const cache = new QueryClient()
  cache.setData(profileQueryKey(FIXTURE_USER_ID), store.profile)
  cache.setData(locationsQueryKey(FIXTURE_USER_ID), [fixtureLocation()])
  cache.setData(historyQueryKey(FIXTURE_USER_ID, 1), { sessions: [...history], hasMore: false })

  const generation = createFakeGenerationClient()
  const accepted: SessionAcceptance[] = []
  const workout = createWorkoutDouble({
    session: null,
    sessions: {
      async accept(_userId, acceptance) {
        accepted.push(acceptance)
        return ok(snapshotFixture({ state: 'prescribed' }))
      },
      async start() {
        return ok({ session: snapshotFixture({ state: 'active' }).session, state: 'active' as const })
      },
    },
  })

  const router = createTestRouter([entry])
  const rendered = render(
    <AppProviders
      {...signedIn({ queryClient: cache, userData, generation, workout: workout.clients })}
    >
      <RouterProvider router={router} />
    </AppProviders>,
  )

  return {
    ...rendered,
    router,
    store,
    userData,
    generation,
    /** Every acceptance the persistence client was handed, in order. */
    accepted,
    user: userEvent.setup(),
  }
}

type Visit = ReturnType<typeof visit>

/** The acceptance the backend answers a request with: the request's own intent. */
function acceptanceFor(input: GenerationInput, title: string): SessionAcceptance {
  return makeSessionAcceptance({
    goal_preset: input.goal,
    session_focus: input.focus,
    requested_intensity: input.requested_intensity,
    effective_intensity: input.requested_intensity,
    requested_duration_mins: input.requested_duration_mins,
    effective_duration_target_mins: input.requested_duration_mins,
    location_id: input.location_id,
    is_deload: input.deload,
    workout: { ...makeSessionAcceptance().workout, title },
  })
}

/** Answers the oldest call in flight with the workout its own request describes. */
async function answer(generation: FakeGenerationClient, title: string) {
  const input = generation.calls[generation.calls.length - generation.outstanding]
  await act(async () => {
    generation.succeed({ acceptance: acceptanceFor(input, title) })
  })
}

const briefing = (title: string) => screen.findByRole('heading', { level: 1, name: title })
const group = (name: string) => screen.getByRole('group', { name })
const chipIn = (name: string, label: string) =>
  within(group(name)).getByRole('button', { name: new RegExp(label, 'i') })
const cta = () => screen.getByRole('button', { name: /generate workout/i })
const slider = () => screen.getByRole('slider')
const focusLine = () => screen.getByText(/^Focus:/)
const recovery = () => screen.getByRole('button', { name: RECOVERY_LABEL })

/** Start on Review: the session is accepted, then begun. */
async function startWorkout({ user, accepted }: Visit, expected: number) {
  await user.click(await screen.findByRole('button', { name: START_LABEL }))
  await waitFor(() => expect(accepted).toHaveLength(expected))
}

async function regenerate({ user }: Visit) {
  await user.click(screen.getByRole('button', { name: REGENERATE_LABEL }))
  const dialog = await screen.findByRole('dialog')
  await user.click(within(dialog).getByRole('button', { name: 'Discard and regenerate' }))
}

async function goTo({ router }: Visit, path: string) {
  await act(async () => {
    await router.navigate(path)
  })
}

function expectNoProfileWrite({ userData, store }: Visit, goal: Profile['goal_preset']) {
  expect(userData.preferenceWrites).toEqual([])
  expect(userData.onboardingCalls).toEqual([])
  expect(store.profile.goal_preset).toBe(goal)
}

beforeEach(() => {
  toastQueue.clear()
})

describe('REQ-016 — the six Goal/Focus journeys', () => {
  it('journey 1: a saved Goal and enough history generate on the recommended Focus, and the accepted session stores them', async () => {
    const journey = visit({ goal: 'strength' })
    const { user, generation, accepted } = journey

    expect(screen.getByText('Strength')).toBeInTheDocument()
    expect(focusLine()).toHaveTextContent('Lower body')
    expect(screen.getByText(LOWER_BODY_REASON)).toBeInTheDocument()
    // Neither the Goal nor the Focus is a question.
    expect(screen.queryByRole('group', { name: 'Goal' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Anchor' })).not.toBeInTheDocument()

    // Only the time and the intensity are adjusted.
    fireEvent.change(slider(), { target: { value: '8' } })
    await user.clear(screen.getByLabelText(/time available/i))
    await user.type(screen.getByLabelText(/time available/i), '30')
    await user.click(cta())

    expect(generation.calls).toHaveLength(1)
    expect(generation.calls[0]).toMatchObject({
      goal: 'strength',
      focus: 'lower_body',
      requested_intensity: 8,
      requested_duration_mins: 30,
    })

    await answer(generation, 'Journey one')
    await briefing('Journey one')
    await startWorkout(journey, 1)

    expect(accepted[0]).toMatchObject({
      goal_preset: 'strength',
      session_focus: 'lower_body',
      requested_intensity: 8,
      requested_duration_mins: 30,
    })
    expect(generation.calls).toHaveLength(1)
  })

  it('journey 2: Change focus overrides the request and the stored session, and leaves Settings alone', async () => {
    const journey = visit({ goal: 'strength' })
    const { user, generation, accepted } = journey

    expect(focusLine()).toHaveTextContent('Lower body')

    await user.click(screen.getByRole('button', { name: CHANGE_FOCUS_LABEL }))
    await user.click(chipIn(OVERRIDE_GROUP_LABEL, 'Upper body'))

    expect(focusLine()).toHaveTextContent('Upper body')
    expect(focusLine()).toHaveTextContent(OVERRIDE_SCOPE)

    await user.click(cta())

    expect(generation.calls).toHaveLength(1)
    expect(generation.calls[0]).toMatchObject({ goal: 'strength', focus: 'upper_body' })

    await answer(generation, 'Journey two')
    await briefing('Journey two')
    await startWorkout(journey, 1)

    expect(accepted[0]).toMatchObject({ goal_preset: 'strength', session_focus: 'upper_body' })
    expectNoProfileWrite(journey, 'strength')

    // And Settings still shows the Goal it showed before.
    await goTo(journey, '/settings')
    expect(await screen.findByRole('radio', { name: 'Strength' })).toBeChecked()
    expectNoProfileWrite(journey, 'strength')
  })

  it('journey 3: a Goal changed in Settings is the Goal Generate uses, with no Goal question', async () => {
    const journey = visit({ goal: 'strength', entry: '/settings' })
    const { user, generation, accepted, userData, store } = journey

    await user.click(await screen.findByRole('radio', { name: 'Conditioning' }))
    await waitFor(() => expect(userData.preferenceWrites).toHaveLength(1))
    expect(userData.preferenceWrites[0]?.goal_preset).toBe('conditioning')
    await waitFor(() => expect(store.profile.goal_preset).toBe('conditioning'))

    await goTo(journey, '/generate')

    expect(await screen.findByRole('heading', { level: 1, name: 'Generate workout' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Conditioning')).toBeInTheDocument())
    expect(screen.queryByText('Strength')).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Goal' })).not.toBeInTheDocument()
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()

    await user.click(cta())

    expect(generation.calls).toHaveLength(1)
    expect(generation.calls[0]).toMatchObject({ goal: 'conditioning', focus: 'lower_body' })
    const sent = generation.calls[0].requested_intensity
    expect(sent).toBeGreaterThanOrEqual(INTENSITY_BY_GOAL.conditioning.min)
    expect(sent).toBeLessThanOrEqual(INTENSITY_BY_GOAL.conditioning.max)

    await answer(generation, 'Journey three')
    await briefing('Journey three')
    await startWorkout(journey, 1)

    expect(accepted[0]).toMatchObject({ goal_preset: 'conditioning', session_focus: 'lower_body' })
    // The one write was Settings'; generating wrote nothing more.
    expect(userData.preferenceWrites).toHaveLength(1)
  })

  it('journey 4: a first workout takes a manual Focus with no invented reason, and the next visit is recommended', async () => {
    const first = visit({ goal: 'strength', history: [] })

    const chips = within(group('Anchor')).getAllByRole('button')
    expect(chips.map((chip) => chip.textContent)).toEqual(ANCHORS.map((anchor) => anchor.label))
    for (const chip of chips) expect(chip).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText(FIRST_WORKOUT_MESSAGE)).toBeInTheDocument()
    expect(screen.getByRole('main')).not.toHaveTextContent(HISTORY_CLAIM)
    expect(cta()).toBeDisabled()
    expect(first.generation.calls).toEqual([])

    await first.user.click(chipIn('Anchor', 'Full body'))
    expect(screen.getByRole('main')).not.toHaveTextContent(HISTORY_CLAIM)
    await first.user.click(cta())

    expect(first.generation.calls).toHaveLength(1)
    expect(first.generation.calls[0]).toMatchObject({ goal: 'strength', focus: 'full_body' })

    await answer(first.generation, 'Journey four')
    await briefing('Journey four')
    await startWorkout(first, 1)

    const [stored] = first.accepted
    expect(stored).toMatchObject({ goal_preset: 'strength', session_focus: 'full_body' })
    first.unmount()

    // That session, completed, is the history the next visit reads.
    const next = visit({
      goal: 'strength',
      history: [
        completed(1, 1, {
          goal_preset: stored.goal_preset,
          session_focus: stored.session_focus,
          requested_intensity: stored.requested_intensity,
          effective_intensity: stored.effective_intensity,
        }),
      ],
    })

    expect(screen.queryByRole('group', { name: 'Anchor' })).not.toBeInTheDocument()
    expect(screen.queryByText(FIRST_WORKOUT_MESSAGE)).not.toBeInTheDocument()
    // Now the explanation is history's own, and there is history behind it.
    expect(screen.getByText(/^No .+ in (\d+ days?|the sessions you’ve logged)\.$/)).toBeInTheDocument()
    expect(cta()).toBeEnabled()
    const shown = focusLine().textContent

    await next.user.click(cta())

    expect(next.generation.calls).toHaveLength(1)
    const recommended = ANCHORS.find((anchor) => anchor.value === next.generation.calls[0].focus)
    expect(recommended).toBeDefined()
    // The recommendation is something not yet trained, and it is the one shown.
    expect(recommended?.value).not.toBe('full_body')
    expect(shown).toContain(recommended?.label)
    expect(next.generation.calls[0]).toMatchObject({ goal: 'strength' })
  })

  it('journey 5: cancel, retry and regenerate keep the resolved Goal and Focus, one call per generation', async () => {
    const journey = visit({ goal: 'strength' })
    const { user, generation, accepted, router } = journey
    const INTENT = { goal: 'strength', focus: 'upper_body' }

    await user.click(screen.getByRole('button', { name: CHANGE_FOCUS_LABEL }))
    await user.click(chipIn(OVERRIDE_GROUP_LABEL, 'Upper body'))

    // Generation one: two presses in one tick are one call.
    const submit = cta()
    fireEvent.click(submit)
    fireEvent.click(submit)
    expect(generation.calls).toHaveLength(1)
    expect(generation.calls[0]).toMatchObject(INTENT)

    // Cancel: back on the draft as it was, and the abandoned answer goes nowhere.
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(focusLine()).toHaveTextContent('Upper body')
    expect(focusLine()).toHaveTextContent(OVERRIDE_SCOPE)
    await answer(generation, 'Abandoned')
    expect(screen.queryByText('Abandoned')).not.toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/generate')
    expect(generation.calls).toHaveLength(1)

    // Generation two, from the cancelled draft: the same request.
    await user.click(cta())
    expect(generation.calls).toHaveLength(2)
    expect(generation.calls[1]).toEqual(generation.calls[0])

    // It fails, and Retry — however often pressed — is generation three, once.
    await act(async () => {
      generation.fail(makeGenerationError({ requestId: 'req_journey_5' }))
    })
    const retry = within(await screen.findByRole('alert')).getByRole('button', { name: 'Retry' })
    fireEvent.click(retry)
    fireEvent.click(retry)
    expect(generation.calls).toHaveLength(3)
    expect(generation.outstanding).toBe(1)
    expect(generation.calls[2]).toEqual(generation.calls[0])

    await answer(generation, 'Journey five')
    await briefing('Journey five')
    expect(router.state.location.pathname).toBe(REVIEW_PATH)
    expect(generation.calls).toHaveLength(3)

    // Regenerate from Review is generation four, on the accepted Goal and Focus.
    await regenerate(journey)
    expect(generation.calls).toHaveLength(4)
    expect(generation.outstanding).toBe(1)
    expect(generation.calls[3]).toMatchObject({
      ...INTENT,
      requested_intensity: generation.calls[0].requested_intensity,
      requested_duration_mins: generation.calls[0].requested_duration_mins,
    })

    await answer(generation, 'Journey five again')
    await briefing('Journey five again')
    await startWorkout(journey, 1)

    expect(accepted[0]).toMatchObject({ goal_preset: 'strength', session_focus: 'upper_body' })
    expect(generation.calls).toHaveLength(4)
    expect(generation.outstanding).toBe(0)
    expectNoProfileWrite(journey, 'strength')
  })

  it('journey 6: a Recovery session generates and regenerates as active_recovery without Power, and a fresh visit is the standing Goal', async () => {
    const journey = visit({ goal: 'hypertrophy' })
    const { user, generation, accepted } = journey
    const RECOVERY = { goal: 'active_recovery', focus: 'lower_body' }

    await user.click(recovery())

    expect(recovery()).toHaveAttribute('aria-pressed', 'true')
    // The standing Goal is still the one shown.
    expect(screen.getByText('Hypertrophy')).toBeInTheDocument()
    expect(chipIn(OVERRIDE_GROUP_LABEL, 'Power')).toBeDisabled()
    expect(screen.getByText(new RegExp(POWER_REFUSAL))).toBeVisible()

    // Pressing the disabled Power changes nothing.
    fireEvent.click(chipIn(OVERRIDE_GROUP_LABEL, 'Power'))
    expect(focusLine()).toHaveTextContent('Lower body')

    await user.click(cta())

    expect(generation.calls).toHaveLength(1)
    expect(generation.calls[0]).toMatchObject(RECOVERY)
    const sent = generation.calls[0].requested_intensity
    expect(sent).toBeGreaterThanOrEqual(INTENSITY_BY_GOAL.active_recovery.min)
    expect(sent).toBeLessThanOrEqual(INTENSITY_BY_GOAL.active_recovery.max)

    await answer(generation, 'Journey six')
    await briefing('Journey six')

    await regenerate(journey)
    expect(generation.calls).toHaveLength(2)
    expect(generation.calls[1]).toMatchObject({ ...RECOVERY, requested_intensity: sent })

    await answer(generation, 'Journey six again')
    await briefing('Journey six again')
    await startWorkout(journey, 1)

    expect(accepted[0]).toMatchObject({
      goal_preset: 'active_recovery',
      session_focus: 'lower_body',
    })
    expectNoProfileWrite(journey, 'hypertrophy')
    journey.unmount()

    // A fresh Generate, on the profile the Recovery session left as it found it.
    const fresh = visit({ goal: journey.store.profile.goal_preset })

    expect(screen.getByText('Hypertrophy')).toBeInTheDocument()
    expect(recovery()).toHaveAttribute('aria-pressed', 'false')

    await fresh.user.click(cta())

    expect(fresh.generation.calls).toHaveLength(1)
    expect(fresh.generation.calls[0]).toMatchObject({ goal: 'hypertrophy', focus: 'lower_body' })
    expectNoProfileWrite(fresh, 'hypertrophy')
  })
})

describe('REQ-015 — the recovery stayed inside its scope', () => {
  it('added no migration: the newest of its time is the one the recovery inspected', () => {
    const migrations = readdirSync(resolve(process.cwd(), 'supabase/migrations'))
      .filter((file) => file.endsWith('.sql'))
      .sort()

    // Everything after it belongs to a later, separate piece of work — the
    // generation-reliability catalog repair (GR-02), refusal diagnostics
    // (GR-04), save-time viability evaluation (REQ-010), the Settings
    // viability guard (REQ-012), and the onboarding commit that asks it
    // (REQ-011) — each is named here so a migration nobody
    // accounted for still fails.
    const inspected = migrations.indexOf('20260927000018_generation_goal_scope.sql')
    expect(inspected).toBeGreaterThan(-1)
    expect(migrations.slice(inspected + 1)).toEqual([
      '20261001000019_catalog_section_repair.sql',
      '20261001000020_generation_refusal_diagnostics.sql',
      '20261001000021_generation_viability.sql',
      '20261002000022_settings_viability_guard.sql',
      '20261002000023_onboarding_viability.sql',
    ])
  })
})
