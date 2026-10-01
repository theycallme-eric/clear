/**
 * GEN-04's acceptance, on the real route tree.
 *
 * Two criteria: the screen is the export's Form Screen template — the standing
 * Goal as context, anchor chips, the intensity slider, the place, the time
 * target and the notes, one full-width primary action — and no payload the
 * CORE-03 request schema would refuse ever reaches the generation client.
 *
 * And REQ-001/REQ-002's: the Goal is the profile's and is never asked here, the
 * profile read has its own loading and error states, and a missing or legacy
 * Goal is a correction state that sends nothing.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { WorkoutClients } from '../data/workout'
import { DELOAD_DECISIONS_STORAGE_KEY } from '../state/deload-decisions'
import { createError, ErrorCode, err, ok, type Result } from '../state/errors'
import {
  INTENSITY_BY_GOAL,
  POWER_REFUSAL,
  REFUSAL_SUMMARY,
} from '../state/generation-form'
import {
  GENERATION_FAILED_LABEL,
  GENERATION_LOADING_TITLE,
} from '../state/generation-loading'
import { QueryClient } from '../state/query'
import { toastQueue, type ToastMessage } from '../state/toasts'
import { SLOW_THRESHOLD_MS } from '../state/view-state'
import { SLOW_LOADING_LABEL } from '../ui/view-state'
import {
  makeGenerationError,
  makeGenerationOutput,
  makeSessionAcceptance,
  makeSessionRow,
} from '../test/factories'
import { createWorkoutDouble } from '../test/workout-double'
import type { HistoryPage } from '../data/history'
import { historyQueryKey } from '../state/history-queries'
import type {
  AnchorEvidenceRow,
  Location,
  Profile,
  WorkoutSessionRow,
} from '../state/schemas'
import { suggestionDay } from '../state/session-suggestion'
import { locationsQueryKey, profileQueryKey } from '../state/user-queries'
import { createFakeGenerationClient } from '../test/generation-double'
import { AppProviders, renderApp, renderWithProviders, signedIn } from '../test/render'
import { createTestRouter } from './router'
import {
  CHANGE_FOCUS_LABEL,
  CHANGE_GOAL_LABEL,
  FIRST_WORKOUT_MESSAGE,
  Generate,
  GOAL_CORRECTION_ACTION,
  GOAL_CORRECTION_TITLE,
  HISTORY_ERROR_MESSAGE,
  HISTORY_LOADING_LABEL,
  HISTORY_RETRY_LABEL,
  LEGACY_GOAL_MESSAGE,
  MANUAL_FOCUS_MESSAGE,
  MISSING_GOAL_MESSAGE,
  OVERRIDE_CANCEL_LABEL,
  OVERRIDE_GROUP_LABEL,
  OVERRIDE_SCOPE,
  RECOVERY_LABEL,
} from './Generate'
import {
  createFakeUserDataClient,
  FIXTURE_USER_ID,
  fixtureLocation,
  onboardedProfile,
} from '../test/user-data-double'

const GYM = fixtureLocation({
  id: '00000000-0000-4000-8000-000000000011',
  name: 'The gym',
  tier: 'full',
  is_default: false,
})

/** The Goals a profile may stand on: onboarding's four. */
const STANDING_GOALS = ['strength', 'hypertrophy', 'conditioning', 'balanced'] as const

/**
 * `history` is the page the shared history query already holds: nothing
 * completed unless a test says otherwise, so the form opens on the manual
 * first-workout choice. `null` leaves it unread, for the tests that are about
 * the read itself.
 */
function warmCache(
  locations: readonly Location[],
  goal: Profile['goal_preset'] = 'strength',
  history: readonly WorkoutSessionRow[] | null = [],
) {
  const cache = new QueryClient()
  cache.setData(profileQueryKey(FIXTURE_USER_ID), onboardedProfile({ goal_preset: goal }))
  cache.setData(locationsQueryKey(FIXTURE_USER_ID), [...locations])
  if (history !== null) {
    cache.setData(historyQueryKey(FIXTURE_USER_ID, 1), {
      sessions: [...history],
      hasMore: false,
    })
  }
  return cache
}

/** A returning athlete on `/generate`, standing on Strength unless a test says otherwise. */
function renderGenerate({
  locations = [fixtureLocation(), GYM],
  workout,
  goal = 'strength',
  history = [],
}: {
  locations?: readonly Location[]
  workout?: WorkoutClients
  goal?: Profile['goal_preset']
  history?: readonly WorkoutSessionRow[] | null
} = {}) {
  const generation = createFakeGenerationClient()
  const rendered = renderApp(
    ['/generate'],
    signedIn({ queryClient: warmCache(locations, goal, history), generation, workout }),
  )

  return { ...rendered, generation, user: userEvent.setup() }
}

const group = (name: string) => screen.getByRole('group', { name })
const chipIn = (name: string, label: string) =>
  within(group(name)).getByRole('button', { name: new RegExp(label, 'i') })
const cta = () => screen.getByRole('button', { name: /generate workout/i })
const slider = () => screen.getByRole('slider')

describe('the screen’s composition (Form Screen template)', () => {
  it('states the goal, then asks the anchor, the intensity, the place, the time and the notes', () => {
    renderGenerate()

    expect(screen.getByRole('heading', { level: 1, name: 'Generate workout' })).toBeInTheDocument()
    expect(screen.getByText('Strength')).toBeInTheDocument()

    const anchors = within(group('Anchor')).getAllByRole('button')
    expect(anchors.map((chip) => chip.textContent)).toEqual([
      'Upper body',
      'Lower body',
      'Full body',
      'Power',
    ])

    expect(slider()).toBeInTheDocument()
    expect(screen.getByLabelText(/place/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/time available/i)).toHaveValue(45)
    expect(screen.getByLabelText(/notes/i)).toHaveValue('')
    expect(cta()).toBeInTheDocument()
  })

  it('prefills the default place rather than the first one listed', () => {
    renderGenerate({ locations: [GYM, fixtureLocation()] })

    expect(screen.getByLabelText(/place/i)).toHaveValue(fixtureLocation().id)
  })
})

describe('the CTA', () => {
  it('waits for an anchor and for nothing else — the Goal is already the profile’s', async () => {
    const { user } = renderGenerate()

    expect(cta()).toBeDisabled()

    await user.click(chipIn('Anchor', 'Upper body'))
    expect(cta()).toBeEnabled()
  })
})

describe('goal → intensity (v3 delta §2.2)', () => {
  it('clamps the slider to the standing goal’s range and lands on its start', () => {
    renderGenerate({ goal: 'conditioning' })

    expect(slider()).toBeEnabled()
    expect(slider()).toHaveAttribute('min', String(INTENSITY_BY_GOAL.conditioning.min))
    expect(slider()).toHaveAttribute('max', String(INTENSITY_BY_GOAL.conditioning.max))
    expect(slider()).toHaveValue(String(INTENSITY_BY_GOAL.conditioning.start))
  })
})

describe('goal → anchor (v3 delta §2.3)', () => {
  it.each(STANDING_GOALS)('offers Power to a standing %s goal', (goal) => {
    renderGenerate({ goal })

    expect(chipIn('Anchor', 'Power')).toBeEnabled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// REQ-001 — the standing Goal, read from the profile
// ─────────────────────────────────────────────────────────────────────────────

describe('REQ-001 — the standing Goal is context, not a question', () => {
  it('shows the profile’s Goal and a route to Settings, and no Goal choice', async () => {
    const { user } = renderGenerate({ goal: 'strength' })

    expect(screen.getByText('Strength')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Goal' })).not.toBeInTheDocument()
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
    for (const label of ['Hypertrophy', 'Conditioning', 'Balanced', 'Recovery']) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument()
    }

    await user.click(screen.getByRole('link', { name: CHANGE_GOAL_LABEL }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument()
  })

  it('sends the Goal a fresh visit finds on the profile, with no Goal interaction', async () => {
    const { user, generation } = renderGenerate({ goal: 'hypertrophy' })

    expect(screen.getByText('Hypertrophy')).toBeInTheDocument()

    await user.click(chipIn('Anchor', 'Lower body'))
    await user.click(cta())

    expect(generation.calls).toHaveLength(1)
    expect(generation.calls[0]).toMatchObject({
      goal: 'hypertrophy',
      focus: 'lower_body',
      requested_intensity: INTENSITY_BY_GOAL.hypertrophy.start,
    })
  })
})

/**
 * The screen's own profile states. Mounted without the route's guard, which
 * reads the same profile and would answer for it first: what is proved here is
 * that Generate itself never draws a form on a profile it does not have.
 */
describe('REQ-001 — the profile read', () => {
  function renderScreen(profile: (userId: string) => Promise<Result<Profile | null>>) {
    const generation = createFakeGenerationClient()
    const cache = new QueryClient()
    cache.setData(locationsQueryKey(FIXTURE_USER_ID), [fixtureLocation(), GYM])
    const userData = createFakeUserDataClient({ profile })
    renderWithProviders(<Generate />, {
      route: '/generate',
      ...signedIn({ queryClient: cache, generation, userData }),
    })
    return { generation, userData, user: userEvent.setup() }
  }

  it('shows the profile loading, with no Generate CTA', async () => {
    const { generation, userData } = renderScreen(() => new Promise(() => {}))

    await waitFor(() => expect(userData.profileCalls.length).toBeGreaterThan(0))

    expect(screen.getByText(/reading your profile/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /generate workout/i })).not.toBeInTheDocument()
    expect(generation.calls).toEqual([])
  })

  it('shows the failure with a Retry that reads again, and sends nothing', async () => {
    let failing = true
    const { generation, userData, user } = renderScreen(() =>
      Promise.resolve(
        failing
          ? err(createError(ErrorCode.PERSISTENCE_READ_FAILED))
          : ok<Profile | null>(onboardedProfile({ goal_preset: 'strength' })),
      ),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(/your profile didn’t load/i)
    expect(screen.queryByRole('button', { name: /generate workout/i })).not.toBeInTheDocument()
    expect(generation.calls).toEqual([])

    const reads = userData.profileCalls.length
    failing = false
    await user.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('Strength')).toBeInTheDocument()
    expect(userData.profileCalls.length).toBe(reads + 1)
    expect(cta()).toBeInTheDocument()
    expect(generation.calls).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// REQ-002 — a missing or legacy standing Goal is corrected in Settings
// ─────────────────────────────────────────────────────────────────────────────

describe('REQ-002 — the correction state', () => {
  it.each([
    ['no goal', null, MISSING_GOAL_MESSAGE],
    ['the legacy active_recovery goal', 'active_recovery', LEGACY_GOAL_MESSAGE],
  ] as const)('names Settings and sends nothing for a profile with %s', async (_, goal, message) => {
    const { user, generation } = renderGenerate({ goal })

    expect(screen.getByText(GOAL_CORRECTION_TITLE)).toBeInTheDocument()
    expect(screen.getByText(message)).toHaveTextContent(/settings/i)
    expect(screen.queryByRole('button', { name: /generate workout/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Anchor' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: GOAL_CORRECTION_ACTION }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument()
    expect(generation.calls).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// REQ-004 / REQ-005 / REQ-006 — the Focus, as history can or cannot recommend it
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Days are counted back from today rather than pinned to a date: the
 * recommendation is only made from recent history, so a fixture with a
 * written-down date would go stale while the suite kept passing.
 */
function daysAgo(days: number): string {
  const [year, month, date] = suggestionDay().split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, date - days)).toISOString().slice(0, 10)
}

function session(
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
function lowerBodyDue(intensity = 7): WorkoutSessionRow[] {
  const at = { effective_intensity: intensity, requested_intensity: intensity }

  return [
    session(1, 1, at),
    session(2, 3, at),
    session(3, 16, { ...at, session_focus: 'lower_body' }),
  ]
}

/** Generated and never started, and started and given up: neither is completed. */
function nothingCompleted(): WorkoutSessionRow[] {
  return [
    session(1, 1, { started_at: null, completed_at: null }),
    session(2, 2, { completed_at: null, abandoned_at: `${daysAgo(2)}T09:30:00.000Z` }),
  ]
}

const LOWER_BODY_REASON = /^No \w+ in 16 days\.$/
const HISTORY_CLAIM =
  /suggested|recommended|your last \d+ sessions|no \w+ in \d+ days|sessions you’ve logged/i

function expectFourUnselected() {
  const chips = within(group('Anchor')).getAllByRole('button')
  expect(chips.map((chip) => chip.textContent)).toEqual([
    'Upper body',
    'Lower body',
    'Full body',
    'Power',
  ])
  for (const chip of chips) expect(chip).toHaveAttribute('aria-pressed', 'false')
}

describe('REQ-004 — the recommended Focus and its intensity', () => {
  it('opens on the recommended Focus, its reason and the history intensity, ready to generate', async () => {
    const { user, generation } = renderGenerate({ history: lowerBodyDue(7) })

    expect(screen.getByText('Lower body')).toBeInTheDocument()
    expect(screen.getByText(LOWER_BODY_REASON)).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Anchor' })).not.toBeInTheDocument()
    expect(slider()).toHaveValue('7')
    expect(cta()).toBeEnabled()

    // Nothing is asked of the generation client until the athlete presses.
    expect(generation.calls).toEqual([])

    await user.click(cta())

    expect(generation.calls).toHaveLength(1)
    expect(generation.calls[0]).toMatchObject({
      goal: 'strength',
      focus: 'lower_body',
      requested_intensity: 7,
    })
  })

  it.each([
    [10, INTENSITY_BY_GOAL.hypertrophy.max],
    [2, INTENSITY_BY_GOAL.hypertrophy.min],
  ])('clamps a history averaging %i to the standing goal’s range, at %i', async (average, clamped) => {
    const { user, generation } = renderGenerate({
      goal: 'hypertrophy',
      history: lowerBodyDue(average),
    })

    expect(slider()).toHaveValue(String(clamped))

    await user.click(cta())

    expect(generation.calls[0]).toMatchObject({
      goal: 'hypertrophy',
      focus: 'lower_body',
      requested_intensity: clamped,
    })
  })

  it.each(STANDING_GOALS)('starts a %s profile with no recommendation on the goal’s start', (goal) => {
    renderGenerate({ goal })

    expect(slider()).toHaveValue(String(INTENSITY_BY_GOAL[goal].start))
  })

  it('takes no Focus from the URL: the recommendation is today’s history', () => {
    const generation = createFakeGenerationClient()
    renderApp(
      ['/generate?focus=power&intensity=3'],
      signedIn({
        queryClient: warmCache([fixtureLocation(), GYM], 'strength', lowerBodyDue(7)),
        generation,
      }),
    )

    expect(screen.getByText('Lower body')).toBeInTheDocument()
    expect(slider()).toHaveValue('7')
    expect(screen.queryByText(/prefilled/i)).not.toBeInTheDocument()
  })
})

describe('REQ-005 — a manual Focus before the first completed workout, or on stale history', () => {
  it('asks for one of four with nothing selected, and says CLEAR needs a starting workout', async () => {
    const { user } = renderGenerate({ history: [] })

    expectFourUnselected()
    expect(screen.getByText(FIRST_WORKOUT_MESSAGE)).toHaveTextContent(/starting workout/i)
    expect(screen.getByRole('main')).not.toHaveTextContent(HISTORY_CLAIM)
    expect(cta()).toBeDisabled()

    await user.click(chipIn('Anchor', 'Full body'))
    expect(cta()).toBeEnabled()
  })

  it('asks for a manual Focus on history 30 days old, with no history-backed reason', () => {
    renderGenerate({ history: [session(1, 30)] })

    expectFourUnselected()
    expect(screen.getByText(MANUAL_FOCUS_MESSAGE)).toBeInTheDocument()
    expect(screen.queryByText(FIRST_WORKOUT_MESSAGE)).not.toBeInTheDocument()
    expect(screen.getByRole('main')).not.toHaveTextContent(HISTORY_CLAIM)
    expect(cta()).toBeDisabled()
  })

  it('stays in the first-workout state on unstarted and abandoned sessions alone', () => {
    renderGenerate({ history: nothingCompleted() })

    expectFourUnselected()
    expect(screen.getByText(FIRST_WORKOUT_MESSAGE)).toBeInTheDocument()
    expect(cta()).toBeDisabled()
  })

  it('recommends on the next visit once one of them is completed', () => {
    const [unstarted, abandoned] = nothingCompleted()
    renderGenerate({ history: [session(1, 1), abandoned] })

    expect(unstarted.completed_at).toBeNull()
    expect(screen.queryByRole('group', { name: 'Anchor' })).not.toBeInTheDocument()
    expect(screen.queryByText(FIRST_WORKOUT_MESSAGE)).not.toBeInTheDocument()
    expect(screen.getByText(/^Focus:/)).toBeInTheDocument()
    expect(screen.getByText(/^No .+ in the sessions you’ve logged\.$/)).toBeInTheDocument()
    expect(cta()).toBeEnabled()
  })
})

describe('REQ-006 — a history read that fails or is still in flight', () => {
  /** A history read the test answers, on a cache that has not read it. */
  function renderReading(page: () => Promise<Result<HistoryPage>>) {
    const calls = { count: 0 }
    const workout = createWorkoutDouble({
      history: {
        page: () => {
          calls.count += 1
          return page()
        },
      },
    }).clients

    return { ...renderGenerate({ workout, history: null }), calls }
  }

  const readFailure = () => err(createError(ErrorCode.PERSISTENCE_READ_FAILED))
  const retry = () => screen.getByRole('button', { name: HISTORY_RETRY_LABEL })

  it('shows the Focus area loading, and no CTA to press on an unresolved Focus', async () => {
    const { generation, calls } = renderReading(() => new Promise(() => {}))

    await waitFor(() => expect(calls.count).toBeGreaterThan(0))

    // By its text: `role="status"` is not unique on a screen.
    expect(screen.getByText(HISTORY_LOADING_LABEL).closest('[role="status"]')).toHaveAttribute(
      'aria-busy',
      'true',
    )
    expect(screen.queryByRole('group', { name: 'Anchor' })).not.toBeInTheDocument()
    expect(screen.queryByText(FIRST_WORKOUT_MESSAGE)).not.toBeInTheDocument()
    expect(cta()).toBeDisabled()
    expect(generation.calls).toEqual([])
  })

  it('says history could not be read, offers Retry, and is not the first-workout state', async () => {
    renderReading(() => Promise.resolve(readFailure()))

    expect(await screen.findByRole('alert')).toHaveTextContent(HISTORY_ERROR_MESSAGE)
    expect(HISTORY_ERROR_MESSAGE).toMatch(/history could not be read/i)
    expect(retry()).toBeInTheDocument()
    expect(screen.getByRole('main')).not.toHaveTextContent(/starting workout/i)
    expect(screen.getByRole('main')).not.toHaveTextContent(HISTORY_CLAIM)
    expectFourUnselected()
    expect(cta()).toBeDisabled()
  })

  it('lets a Focus be chosen by hand and sends it', async () => {
    const { user, generation } = renderReading(() => Promise.resolve(readFailure()))

    await screen.findByRole('alert')
    await user.click(chipIn('Anchor', 'Power'))
    expect(cta()).toBeEnabled()

    await user.click(cta())

    expect(generation.calls).toHaveLength(1)
    expect(generation.calls[0]).toMatchObject({
      goal: 'strength',
      focus: 'power',
      requested_intensity: INTENSITY_BY_GOAL.strength.start,
    })
  })

  it('reads again on Retry, and shows the recommendation when the read succeeds', async () => {
    let failing = true
    const { user, calls } = renderReading(() =>
      Promise.resolve(
        failing ? readFailure() : ok<HistoryPage>({ sessions: lowerBodyDue(7), hasMore: false }),
      ),
    )

    await screen.findByRole('alert')
    const reads = calls.count
    failing = false
    await user.click(retry())

    expect(await screen.findByText(LOWER_BODY_REASON)).toBeInTheDocument()
    expect(calls.count).toBe(reads + 1)
    expect(screen.getByText('Lower body')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(slider()).toHaveValue('7')
    expect(cta()).toBeEnabled()
  })

  it('keeps a Focus already chosen by hand when Retry succeeds', async () => {
    let failing = true
    const { user, generation, calls } = renderReading(() =>
      Promise.resolve(
        failing ? readFailure() : ok<HistoryPage>({ sessions: lowerBodyDue(7), hasMore: false }),
      ),
    )

    await screen.findByRole('alert')
    await user.click(chipIn('Anchor', 'Power'))
    const reads = calls.count
    failing = false
    await user.click(retry())

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(calls.count).toBe(reads + 1)
    // History now recommends Lower body, so the kept choice is an override of it.
    expect(chipIn(OVERRIDE_GROUP_LABEL, 'Power')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(/^Focus:/)).toHaveTextContent(`Power — ${OVERRIDE_SCOPE}`)
    expect(screen.queryByText(LOWER_BODY_REASON)).not.toBeInTheDocument()

    await user.click(cta())

    expect(generation.calls[0]).toMatchObject({ focus: 'power' })
  })
})

describe('what is sent', () => {
  it('sends the request the user composed, once', async () => {
    const { user, generation } = renderGenerate()

    await user.click(chipIn('Anchor', 'Upper body'))
    await user.selectOptions(screen.getByLabelText(/place/i), GYM.id)
    await user.clear(screen.getByLabelText(/time available/i))
    await user.type(screen.getByLabelText(/time available/i), '30')
    await user.type(screen.getByLabelText(/notes/i), 'Left shoulder is tight.')
    await user.click(cta())

    expect(generation.calls).toEqual([
      {
        goal: 'strength',
        focus: 'upper_body',
        requested_intensity: INTENSITY_BY_GOAL.strength.start,
        requested_duration_mins: 30,
        location_id: GYM.id,
        notes: 'Left shoulder is tight.',
        // OVR-04: no banner fired for this user, and nothing applied one.
        deload: false,
      },
    ])
  })

  it('sends no note rather than an empty one', async () => {
    const { user, generation } = renderGenerate()

    await user.click(chipIn('Anchor', 'Full body'))
    await user.click(cta())

    expect(generation.calls[0]?.notes).toBeNull()
  })

  it('blocks a payload the request schema refuses, and says which field', async () => {
    const { user, generation } = renderGenerate()

await user.click(chipIn('Anchor', 'Upper body'))
    await user.clear(screen.getByLabelText(/time available/i))
    await user.click(cta())

    expect(generation.calls).toEqual([])
    expect(screen.getByRole('alert')).toHaveTextContent(REFUSAL_SUMMARY)
    expect(screen.getByText(/whole number of minutes/i)).toBeInTheDocument()
  })

  it('sends once the refused field is fixed', async () => {
    const { user, generation } = renderGenerate()

await user.click(chipIn('Anchor', 'Upper body'))
    await user.clear(screen.getByLabelText(/time available/i))
    await user.click(cta())
    expect(generation.calls).toEqual([])

    await user.type(screen.getByLabelText(/time available/i), '60')
    await user.click(cta())

    expect(generation.calls).toHaveLength(1)
    expect(generation.calls[0]?.requested_duration_mins).toBe(60)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// REQ-004 — Generate → Loading → Review through the shared host
// ─────────────────────────────────────────────────────────────────────────────

/**
 * JOURNEY-005, end to end on the real route tree: the Loading screen is the
 * whole screen for the run, success lands on Review with the validated
 * workout, a failure is pattern 3, and cancelling hands the form back as the
 * user left it.
 */
describe('REQ-004 — the Loading screen for a Generate run', () => {
  beforeEach(() => {
    toastQueue.clear()
    delete document.documentElement.dataset.atmosphere
  })

  /** Every run here is composed the same way, with edits away from the defaults. */
  async function composeAndSubmit(user: ReturnType<typeof userEvent.setup>) {
await user.click(chipIn('Anchor', 'Upper body'))
    await user.selectOptions(screen.getByLabelText(/place/i), GYM.id)
    await user.clear(screen.getByLabelText(/time available/i))
    await user.type(screen.getByLabelText(/time available/i), '30')
    await user.type(screen.getByLabelText(/notes/i), 'Left shoulder is tight.')
    await user.click(cta())
  }

  /** Toasts still showing or waiting to show — a `leaving` one is on its way out. */
  function liveToasts(): ToastMessage[] {
    const { current, phase, queue } = toastQueue.getState()
    return [...(current !== null && phase === 'visible' ? [current] : []), ...queue]
  }

  it('replaces the whole form with the Loading screen for the run, with no invented progress', async () => {
    const { user, generation } = renderGenerate()

    await composeAndSubmit(user)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(GENERATION_LOADING_TITLE)
    expect(screen.queryByRole('group', { name: 'Goal' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /generate workout/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Generate workout' })).not.toBeInTheDocument()

    await act(async () => {
      generation.reachStage('composing')
    })

    // Still the screen while the call works: it says the stage the call
    // reported, and still no progress it cannot know.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(GENERATION_LOADING_TITLE)
    const region = within(screen.getByRole('main')).getByRole('status')
    expect(region).toHaveTextContent('Composing session')
    expect(region).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(region.querySelector('[aria-valuenow], [aria-valuemax], progress')).toBeNull()
    expect(screen.queryByRole('group', { name: 'Goal' })).not.toBeInTheDocument()
  })

  it('starts one run however often the submit is pressed', async () => {
    const { user, generation } = renderGenerate()

await user.click(chipIn('Anchor', 'Upper body'))
    // Two presses in one tick: the second lands before the form has gone.
    const button = cta()
    fireEvent.click(button)
    fireEvent.click(button)

    expect(generation.calls).toHaveLength(1)
    expect(generation.outstanding).toBe(1)
    expect(screen.queryByRole('button', { name: /generate workout/i })).not.toBeInTheDocument()
  })

  it('lands on Review with the validated workout when the run succeeds', async () => {
    const { user, generation } = renderGenerate()

    await composeAndSubmit(user)
    await act(async () => {
      generation.succeed({
        acceptance: makeSessionAcceptance({
          workout: { ...makeGenerationOutput(), title: 'Upper-body strength, 30 minutes' },
        }),
      })
    })

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Upper-body strength, 30 minutes' }),
    ).toBeInTheDocument()
    expect(screen.queryByText(GENERATION_LOADING_TITLE)).not.toBeInTheDocument()
  })

  it('says the run is slow at the documented threshold, stating the fact only', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const generation = createFakeGenerationClient()
      renderApp(
        ['/generate'],
        signedIn({ queryClient: warmCache([fixtureLocation(), GYM]), generation }),
      )
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

      await user.click(chipIn('Anchor', 'Upper body'))
      await user.click(cta())

      // A margin below the budget, because `shouldAdvanceTime` also lets the
      // test's own wall-clock time through.
      await act(async () => {
        vi.advanceTimersByTime(SLOW_THRESHOLD_MS - 500)
      })
      expect(within(screen.getByRole('main')).getByRole('status')).not.toHaveTextContent(
        SLOW_LOADING_LABEL,
      )

      await act(async () => {
        vi.advanceTimersByTime(500)
      })
      const region = within(screen.getByRole('main')).getByRole('status')
      expect(region).toHaveTextContent(SLOW_LOADING_LABEL)
      expect(region.textContent).not.toMatch(/sorry|apolog|hang tight|oops|!/i)
    } finally {
      vi.useRealTimers()
    }
  })

  it('fails into pattern 3: the loader says so and one negative toast offers one retry', async () => {
    const { user, generation } = renderGenerate()

    await composeAndSubmit(user)
    await act(async () => {
      generation.fail(makeGenerationError({ requestId: 'req_generate_1' }))
    })

    expect(within(screen.getByRole('main')).getByRole('status')).toHaveTextContent(GENERATION_FAILED_LABEL)
    const toasts = liveToasts()
    expect(toasts).toHaveLength(1)
    expect(toasts[0]?.variant).toBe('negative')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('req_generate_1')
    const actions = within(alert)
      .getAllByRole('button')
      .map((button) => button.textContent)
      .filter((label) => label !== '')
    expect(actions).toEqual(['Retry'])
    // Never a dead end: the cancel exit stays beside the failure.
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()

    await user.click(within(alert).getByRole('button', { name: 'Retry' }))
    expect(generation.calls).toHaveLength(2)
    expect(generation.calls[1]).toEqual(generation.calls[0])
    expect(within(screen.getByRole('main')).getByRole('status')).toHaveTextContent(GENERATION_LOADING_TITLE)
  })

  it('cancels back to the form with the draft exactly as the user left it', async () => {
    const { user, generation } = renderGenerate()

    await composeAndSubmit(user)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.getByRole('heading', { level: 1, name: 'Generate workout' })).toBeInTheDocument()
    expect(screen.getByText('Strength')).toBeInTheDocument()
    expect(chipIn('Anchor', 'Upper body')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText(/place/i)).toHaveValue(GYM.id)
    expect(screen.getByLabelText(/time available/i)).toHaveValue(30)
    expect(screen.getByLabelText(/notes/i)).toHaveValue('Left shoulder is tight.')
    expect(cta()).toBeEnabled()

    // And the same request goes out again, not the defaults.
    await user.click(cta())
    expect(generation.calls).toHaveLength(2)
    expect(generation.calls[1]).toEqual(generation.calls[0])
  })

  it('discards the abandoned run’s answer after cancel', async () => {
    const { user, generation } = renderGenerate()

    await composeAndSubmit(user)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await act(async () => {
      generation.succeed({
        acceptance: makeSessionAcceptance({
          workout: { ...makeGenerationOutput(), title: 'Too late' },
        }),
      })
    })

    expect(screen.queryByText('Too late')).not.toBeInTheDocument()
    expect(screen.queryByText(GENERATION_LOADING_TITLE)).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Generate workout' })).toBeInTheDocument()
    expect(screen.getByLabelText(/notes/i)).toHaveValue('Left shoulder is tight.')
  })

  it('discards a failure that arrives after cancel', async () => {
    const { user, generation } = renderGenerate()

    await composeAndSubmit(user)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await act(async () => {
      generation.fail(makeGenerationError())
    })

    expect(liveToasts()).toEqual([])
    expect(screen.getByRole('heading', { level: 1, name: 'Generate workout' })).toBeInTheDocument()
  })

  it('discards the answer when the screen unmounts mid-run', async () => {
    const { user, generation, unmount } = renderGenerate()

    await composeAndSubmit(user)
    unmount()
    await act(async () => {
      generation.succeed({
        acceptance: makeSessionAcceptance({
          workout: { ...makeGenerationOutput(), title: 'Too late' },
        }),
      })
    })

    expect(screen.queryByText('Too late')).not.toBeInTheDocument()
    expect(liveToasts()).toEqual([])
  })

  it('renders at the full atmosphere and gives the form its quiet back when it leaves', async () => {
    const { user } = renderGenerate()

    expect(document.documentElement.dataset.atmosphere).toBe('quiet')

    await composeAndSubmit(user)
    expect(document.documentElement.dataset.atmosphere).toBe('full')
    expect(within(screen.getByRole('main')).getByRole('status').closest('[data-atmosphere]')).toHaveAttribute(
      'data-atmosphere',
      'full',
    )

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(document.documentElement.dataset.atmosphere).toBe('quiet')
  })
})

describe('the four states', () => {
  it('shows its places loading before it shows a form', () => {
    const cache = new QueryClient()
    cache.setData(profileQueryKey(FIXTURE_USER_ID), onboardedProfile())

    renderApp(
      ['/generate'],
      signedIn({
        queryClient: cache,
        userData: createFakeUserDataClient({
          locations: () => new Promise<Result<Location[]>>(() => {}),
        }),
      }),
    )

    expect(screen.getByText(/reading your places/i)).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Goal' })).not.toBeInTheDocument()
  })

  it('shows the failure and a retry when the places do not load', async () => {
    renderApp(
      ['/generate'],
      signedIn({
        queryClient: new QueryClient(),
        userData: createFakeUserDataClient({
          locations: () =>
            Promise.resolve(err(createError(ErrorCode.NETWORK_OFFLINE))),
        }),
      }),
    )

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/didn’t load/i)
    })
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('offers the way to add a place when there is none to generate from', async () => {
    renderApp(
      ['/generate'],
      signedIn({
        queryClient: new QueryClient(),
        userData: createFakeUserDataClient({
          locations: () => Promise.resolve(ok<Location[]>([])),
        }),
      }),
    )

    await waitFor(() => {
      expect(screen.getByText(/no places yet/i)).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /add a place/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /generate workout/i })).not.toBeInTheDocument()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// OVR-04 — the deload suggestion, on the screen that raises it
// ─────────────────────────────────────────────────────────────────────────────

/**
 * §4's acceptance, end to end: *deload suggested on trend; override respected.*
 *
 * The triggers themselves are proved in `src/state/deload.test.ts` against a
 * history built by hand. What is only true here is the part the requirement
 * spends most of its words on — that the suggestion is a suggestion. So the
 * history is wired to fire exactly one trigger (D1, the single-lift stall) and
 * the tests are about what the screen then does and, more importantly, does not
 * do on the user's behalf.
 *
 * Dates are taken from the real clock because the screen reads the real clock:
 * `today` is the user's own day, and a fixture pinned to a written-down date
 * would stop firing the morning after it was written.
 */
describe('OVR-04 — the deload suggestion', () => {
  const STALLED_LIFT = 'back-squat'

  /** `days` before today, as the evidence rows date themselves. */
  function daysAgo(days: number): string {
    return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
  }

  /**
   * D1: three sessions of one lift, flat at RPE 9+. Two working sets each, so
   * the median RPE is the RPE rather than an artefact of a single set.
   */
  function stalledEvidence(): AnchorEvidenceRow[] {
    return [12, 8, 4].flatMap((days, session) =>
      [1, 2].map((setNumber) => ({
        session_id: `s${session}`,
        session_date: daysAgo(days),
        logged_at: `${daysAgo(days)}T10:0${setNumber}:00.000Z`,
        exercise_id: STALLED_LIFT,
        equipment_used: 'barbell',
        set_number: setNumber,
        actual_reps: 5,
        prescribed_reps: 5,
        weight: 100,
        weight_unit: 'lb' as const,
        rpe: 9,
      })),
    )
  }

  function stalling(): WorkoutClients {
    return createWorkoutDouble({ anchorEvidence: stalledEvidence() }).clients
  }

  // Scoped to the banner's own region: `role="status"` is not unique on a
  // screen, and the confirmation dialog quotes the same sentence.
  const banner = () => screen.queryByRole('status', { name: 'Deload suggestion' })
  const reason = () => {
    const region = banner()
    return region === null ? null : within(region).queryByText(/stalled at RPE 9\+/i)
  }
  const applyButton = () => screen.getByRole('button', { name: /apply deload/i })
  const dismissButton = () => screen.getByRole('button', { name: /not today/i })
  // Named too: the screen composes more than one dialog.
  const CONFIRM_TITLE = 'Train hard today?'
  const confirmDialog = () => screen.queryByRole('dialog', { name: CONFIRM_TITLE })

  /** The banner is a query, so every test waits for the read before asserting. */
  async function renderStalled() {
    const rendered = renderGenerate({ workout: stalling() })
    await waitFor(() => expect(reason()).toBeInTheDocument())
    return rendered
  }

  beforeEach(() => {
    // The snooze lives in `localStorage`, and a decision left behind by the
    // previous test would silence the next one.
    localStorage.removeItem(DELOAD_DECISIONS_STORAGE_KEY)
  })

  it('says nothing at all when the history shows no trend', async () => {
    renderGenerate()

    // The form is the thing that loads; the banner is not a state of it.
    await waitFor(() => expect(cta()).toBeInTheDocument())
    expect(screen.queryByText(/deload/i)).not.toBeInTheDocument()
  })

  it('states the specific trend it noticed, not that one may exist', async () => {
    await renderStalled()

    expect(reason()).toHaveTextContent('Your last 3 back squat sessions stalled at RPE 9+.')
    expect(within(banner()!).getByText(/deload suggested/i)).toBeInTheDocument()
    expect(applyButton()).toBeInTheDocument()
    expect(dismissButton()).toBeInTheDocument()
  })

  it('changes nothing until Apply is pressed, and never sends a deload nobody asked for', async () => {
    const { user, generation } = await renderStalled()

await user.click(chipIn('Anchor', 'Upper body'))

    // The suggestion is on the screen and the slider is still where the Goal
    // put it: the app has advised, and done nothing.
    expect(slider()).toHaveValue(String(INTENSITY_BY_GOAL.strength.start))

    await user.click(cta())

    await waitFor(() => expect(generation.calls).toHaveLength(1))
    expect(generation.calls[0].deload).toBe(false)
  })

  it('clamps the intensity and carries the directive once the user applies it', async () => {
    const { user, generation } = await renderStalled()

await user.click(chipIn('Anchor', 'Upper body'))
    await user.click(applyButton())

    expect(slider()).toHaveValue('5')
    await waitFor(() => expect(screen.getByText(/deload applied/i)).toBeInTheDocument())

    await user.click(cta())

    await waitFor(() => expect(generation.calls).toHaveLength(1))
    expect(generation.calls[0].deload).toBe(true)
    expect(generation.calls[0].requested_intensity).toBe(5)
  })

  it('takes Not today for an answer, and remembers it', async () => {
    const { user } = await renderStalled()

    await user.click(dismissButton())

    await waitFor(() => expect(reason()).not.toBeInTheDocument())

    // Recorded rather than merely obeyed: §4 asks for the override to be logged,
    // and the log is what makes the three-session snooze survive a reload.
    const stored = localStorage.getItem(DELOAD_DECISIONS_STORAGE_KEY)
    expect(stored).toContain('dismissed')
    expect(stored).toContain(STALLED_LIFT)
  })

  it('stays dismissed when the screen is opened again', async () => {
    const { user, unmount } = await renderStalled()

    await user.click(dismissButton())
    await waitFor(() => expect(reason()).not.toBeInTheDocument())
    unmount()

    renderGenerate({ workout: stalling() })

    await waitFor(() => expect(cta()).toBeInTheDocument())
    expect(reason()).not.toBeInTheDocument()
  })

  it('confirms a hard intensity once on a flagged day, then honours it', async () => {
    const { user, generation } = await renderStalled()

await user.click(chipIn('Anchor', 'Upper body'))

    // Choosing 9 on a flagged day is a contradiction of the advice, so it costs
    // one question — and the slider does not move until it is answered.
    fireEvent.change(slider(), { target: { value: '9' } })
    expect(await screen.findByRole('dialog', { name: CONFIRM_TITLE })).toBeInTheDocument()
    expect(slider()).toHaveValue(String(INTENSITY_BY_GOAL.strength.start))

    await user.click(screen.getByRole('button', { name: /go hard anyway/i }))

    await waitFor(() => expect(confirmDialog()).not.toBeInTheDocument())
    expect(slider()).toHaveValue('9')

    // Once. A second hard choice is not a second argument.
    fireEvent.change(slider(), { target: { value: '10' } })
    expect(confirmDialog()).not.toBeInTheDocument()
    expect(slider()).toHaveValue('10')

    await user.click(cta())

    await waitFor(() => expect(generation.calls).toHaveLength(1))
    expect(generation.calls[0]).toMatchObject({ requested_intensity: 10, deload: false })
  })

  it('lets the user back out of a hard intensity without changing anything', async () => {
    const { user } = await renderStalled()

await user.click(chipIn('Anchor', 'Upper body'))

    fireEvent.change(slider(), { target: { value: '9' } })
    await user.click(await screen.findByRole('button', { name: /keep it easier/i }))

    await waitFor(() => expect(confirmDialog()).not.toBeInTheDocument())
    expect(slider()).toHaveValue(String(INTENSITY_BY_GOAL.strength.start))
    expect(reason()).toBeInTheDocument()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// REQ-007 / REQ-008 — what is decided for this workout only
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `/generate` on a router the test holds, so the address the draft wrote is
 * read back and a second render from it is the reload the requirement names.
 */
function renderDraft({
  entry = '/generate',
  history = lowerBodyDue(7),
}: {
  entry?: string
  history?: readonly WorkoutSessionRow[]
} = {}) {
  const generation = createFakeGenerationClient()
  const userData = createFakeUserDataClient()
  const router = createTestRouter([entry])
  const rendered = render(
    <AppProviders
      {...signedIn({
        queryClient: warmCache([fixtureLocation(), GYM], 'strength', history),
        generation,
        userData,
      })}
    >
      <RouterProvider router={router} />
    </AppProviders>,
  )
  const url = () => `${router.state.location.pathname}${router.state.location.search}`

  return { ...rendered, generation, userData, url, user: userEvent.setup() }
}

const changeFocus = () => screen.getByRole('button', { name: CHANGE_FOCUS_LABEL })
const recovery = () => screen.getByRole('button', { name: RECOVERY_LABEL })
const focusLine = () => screen.getByText(/^Focus:/)

/** The other three this week and Power 16 days back: Power is stalest. */
function powerDue(): WorkoutSessionRow[] {
  return [
    session(1, 1),
    session(2, 2, { session_focus: 'lower_body' }),
    session(3, 3, { session_focus: 'full_body' }),
    session(4, 16, { session_focus: 'power' }),
  ]
}

describe('REQ-007 — a Focus for this workout only', () => {
  it('reveals the four choices under Change focus, and says whether they are open', async () => {
    const { user } = renderDraft()

    expect(changeFocus()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('group', { name: OVERRIDE_GROUP_LABEL })).not.toBeInTheDocument()

    await user.click(changeFocus())

    expect(changeFocus()).toHaveAttribute('aria-expanded', 'true')
    const choices = within(group(OVERRIDE_GROUP_LABEL)).getAllByRole('button')
    expect(choices.map((chip) => chip.textContent)).toEqual([
      'Upper body',
      'Lower body',
      'Full body',
      'Power',
    ])
  })

  it('marks the chosen Focus as this workout only, writes it to the URL, and sends it', async () => {
    const { user, generation, url } = renderDraft()

    await user.click(changeFocus())
    await user.click(chipIn(OVERRIDE_GROUP_LABEL, 'Upper body'))

    expect(focusLine()).toHaveTextContent('Upper body')
    expect(focusLine()).toHaveTextContent(OVERRIDE_SCOPE)
    expect(url()).toBe('/generate?override=upper_body')

    await user.click(cta())

    expect(generation.calls).toHaveLength(1)
    expect(generation.calls[0]).toMatchObject({ goal: 'strength', focus: 'upper_body' })
  })

  it.each([
    ['cancelling', OVERRIDE_CANCEL_LABEL],
    ['dismissing the choices', CHANGE_FOCUS_LABEL],
  ])('restores the recommendation on %s', async (_, label) => {
    const { user, generation, url } = renderDraft()

    await user.click(changeFocus())
    await user.click(chipIn(OVERRIDE_GROUP_LABEL, 'Upper body'))
    await user.click(screen.getByRole('button', { name: label }))

    expect(focusLine()).toHaveTextContent('Lower body')
    expect(screen.queryByText(new RegExp(OVERRIDE_SCOPE))).not.toBeInTheDocument()
    expect(screen.getByText(LOWER_BODY_REASON)).toBeInTheDocument()
    expect(url()).toBe('/generate')

    await user.click(cta())
    expect(generation.calls[0]).toMatchObject({ focus: 'lower_body' })
  })

  it('restores the override and its marker when the page is reloaded', async () => {
    const first = renderDraft()

    await first.user.click(changeFocus())
    await first.user.click(chipIn(OVERRIDE_GROUP_LABEL, 'Upper body'))
    const reloaded = first.url()
    first.unmount()

    const { user, generation } = renderDraft({ entry: reloaded })

    expect(focusLine()).toHaveTextContent('Upper body')
    expect(focusLine()).toHaveTextContent(OVERRIDE_SCOPE)
    expect(chipIn(OVERRIDE_GROUP_LABEL, 'Upper body')).toHaveAttribute('aria-pressed', 'true')

    await user.click(cta())
    expect(generation.calls[0]).toMatchObject({ focus: 'upper_body' })
  })

  it('does not read a bare Focus prefill as an override', () => {
    renderDraft({ entry: '/generate?focus=power&intensity=8' })

    expect(focusLine()).toHaveTextContent('Lower body')
    expect(screen.queryByText(new RegExp(OVERRIDE_SCOPE))).not.toBeInTheDocument()
    expect(changeFocus()).toHaveAttribute('aria-expanded', 'false')
  })

  it('writes nothing to the profile when generating with an override', async () => {
    const { user, generation, userData } = renderDraft()

    await user.click(changeFocus())
    await user.click(chipIn(OVERRIDE_GROUP_LABEL, 'Upper body'))
    await user.click(cta())

    expect(generation.calls).toHaveLength(1)
    expect(userData.preferenceWrites).toEqual([])
    expect(userData.onboardingCalls).toEqual([])
  })
})

describe('REQ-008 — a Recovery session for this workout only', () => {
  it('sends active_recovery and limits the intensity to 1–3, with the standing Goal still shown', async () => {
    const { user, generation, url } = renderDraft()

    await user.click(recovery())

    expect(recovery()).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Strength')).toBeInTheDocument()
    expect(slider()).toHaveAttribute('min', String(INTENSITY_BY_GOAL.active_recovery.min))
    expect(slider()).toHaveAttribute('max', String(INTENSITY_BY_GOAL.active_recovery.max))
    expect(slider()).toHaveValue(String(INTENSITY_BY_GOAL.active_recovery.max))
    expect(url()).toBe('/generate?recovery=1')

    await user.click(cta())

    expect(generation.calls[0]).toMatchObject({
      goal: 'active_recovery',
      focus: 'lower_body',
      requested_intensity: INTENSITY_BY_GOAL.active_recovery.max,
    })
  })

  it('keeps Power visible and disabled, with the refusal in text', async () => {
    const { user } = renderDraft()

    await user.click(recovery())

    expect(chipIn(OVERRIDE_GROUP_LABEL, 'Power')).toBeDisabled()
    expect(screen.getByText(new RegExp(POWER_REFUSAL))).toBeVisible()
  })

  it('clears a recommended Power rather than substituting it, and waits for another Focus', async () => {
    const { user, generation } = renderDraft({ history: powerDue() })

    expect(focusLine()).toHaveTextContent('Power')

    await user.click(recovery())

    expect(cta()).toBeDisabled()
    expect(chipIn('Anchor', 'Power')).toBeDisabled()
    for (const chip of within(group('Anchor')).getAllByRole('button')) {
      expect(chip).toHaveAttribute('aria-pressed', 'false')
    }
    expect(screen.getByText(new RegExp(POWER_REFUSAL))).toBeVisible()

    await user.click(chipIn('Anchor', 'Full body'))
    expect(cta()).toBeEnabled()

    await user.click(cta())
    expect(generation.calls[0]).toMatchObject({ goal: 'active_recovery', focus: 'full_body' })
  })

  it('keeps Recovery when Loading is cancelled, and restores it from that URL', async () => {
    const first = renderDraft()

    await first.user.click(recovery())
    await first.user.click(cta())
    await first.user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(first.url()).toBe('/generate?recovery=1')
    expect(recovery()).toHaveAttribute('aria-pressed', 'true')
    const reloaded = first.url()
    first.unmount()

    const { user, generation } = renderDraft({ entry: reloaded })

    expect(recovery()).toHaveAttribute('aria-pressed', 'true')
    expect(slider()).toHaveAttribute('max', String(INTENSITY_BY_GOAL.active_recovery.max))
    expect(chipIn(OVERRIDE_GROUP_LABEL, 'Power')).toBeDisabled()

    await user.click(cta())
    expect(generation.calls[0]).toMatchObject({ goal: 'active_recovery' })
  })

  it('returns to the standing Goal when Recovery is switched off', async () => {
    const { user, generation, url } = renderDraft()

    await user.click(recovery())
    await user.click(recovery())

    expect(recovery()).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByText(new RegExp(POWER_REFUSAL))).not.toBeInTheDocument()
    expect(slider()).toHaveAttribute('max', String(INTENSITY_BY_GOAL.strength.max))
    expect(url()).toBe('/generate')

    await user.click(cta())
    expect(generation.calls[0]).toMatchObject({ goal: 'strength', requested_intensity: 7 })
  })

  it('opens a fresh visit on the standing Goal, and never wrote the profile', async () => {
    const first = renderDraft()

    await first.user.click(recovery())
    await first.user.click(cta())
    expect(first.generation.calls[0]).toMatchObject({ goal: 'active_recovery' })
    expect(first.userData.preferenceWrites).toEqual([])
    expect(first.userData.onboardingCalls).toEqual([])
    first.unmount()

    const { user, generation } = renderDraft()

    expect(screen.getByText('Strength')).toBeInTheDocument()
    expect(recovery()).toHaveAttribute('aria-pressed', 'false')

    await user.click(cta())
    expect(generation.calls[0]).toMatchObject({ goal: 'strength' })
  })
})
