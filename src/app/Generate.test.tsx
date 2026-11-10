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
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { WorkoutClients } from '../data/workout'
import { GalleryRefinements } from '../dev/gallery-refinements'
import { DELOAD_DECISIONS_STORAGE_KEY } from '../state/deload-decisions'
import { createError, ErrorCode, err, ok, type Result } from '../state/errors'
import {
  GENERATE_PATH,
  generatePath,
  GENERATION_GOALS,
  INTENSITY_BY_GOAL,
  intentFrom,
  nextWorkoutPath,
  NOTES_MAX_LENGTH,
  POWER_REFUSAL,
  RECOVERY_NOTE,
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
  DURATION_LABEL,
  DURATION_UNIT,
  FIRST_WORKOUT_MESSAGE,
  FOCUS_TERM,
  Generate,
  GENERATE_ACTION_LABEL,
  GENERATE_TITLE,
  GOAL_CORRECTION_ACTION,
  GOAL_CORRECTION_TITLE,
  HISTORY_ERROR_MESSAGE,
  HISTORY_LOADING_LABEL,
  HISTORY_RETRY_LABEL,
  LEGACY_GOAL_MESSAGE,
  HOME_BACK_LABEL,
  MISSING_GOAL_MESSAGE,
  NOTES_PLACEHOLDER,
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

/** Every card in the screen's content. 0.14.3 never leaves a region outside one. */
const cards = () => [
  ...screen.getByRole('main').querySelectorAll<HTMLElement>('.clr-card'),
]

/** The screen's one card: a second one would be a group that escaped it. */
function formCard() {
  expect(cards()).toHaveLength(1)
  return cards()[0]!
}
const slider = () => screen.getByRole('slider')

describe('the screen’s composition (Form Screen template)', () => {
  it('states the goal, then asks the anchor, the intensity, the place, the time and the notes', () => {
    renderGenerate()

    expect(screen.getByRole('heading', { level: 1, name: 'Generate' })).toBeInTheDocument()
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
    expect(screen.getByRole('main').querySelector('.clr-footer')).toContainElement(cta())
  })

  it('holds every group, label and field in one card and keeps the action in the footer', () => {
    renderGenerate()

    const card = formCard()
    expect(card).toContainElement(screen.getByText('Strength'))
    expect(screen.queryByRole('link', { name: 'Change in Settings' })).not.toBeInTheDocument()
    expect(card).toContainElement(screen.getByRole('button', { name: RECOVERY_LABEL }))
    expect(card).toContainElement(group('Anchor'))
    expect(card).toContainElement(screen.getByText(FIRST_WORKOUT_MESSAGE))
    expect(card).toContainElement(slider())
    expect(card).toContainElement(screen.getByLabelText(/place/i))
    expect(card).toContainElement(screen.getByLabelText(/time available/i))
    expect(card).toContainElement(screen.getByLabelText(/notes/i))

    // Only the screen title sits on the atmosphere, and the action is not a
    // field: it is pinned in the measured footer, outside the card.
    expect(card).not.toContainElement(screen.getByRole('heading', { level: 1 }))
    expect(card).not.toContainElement(cta())
    expect(card.querySelector('.clr-chamfer--urgency')).toBeNull()
  })

  it('puts Goal and Focus first on one row, the Focus value its change control, with no paired Recovery action (C51, superseding B05-02.6/02.7)', () => {
    renderGenerate({ history: lowerBodyDue(7) })

    const goal = screen.getByText(/^Goal:/)
    const focus = focusLine()
    expect(focus).toHaveTextContent('Focus: Lower body')
    // Said alike, on one row, at the top of the card.
    expect(focus.parentElement).toBe(goal.parentElement)
    expect(focus.tagName).toBe(goal.tagName)
    expect(goal.parentElement).toHaveClass('clr-intent-summary')
    expect(focus).toContainElement(focusControl())
    expect(formCard().querySelector('[data-generate-intent]')).toContainElement(goal)

    // R10.1 / R25: no detached or paired change action, and Recovery waits inside the choices.
    expect(formCard().querySelector('.clr-action-group--paired-labels')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Change focus' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: RECOVERY_LABEL })).not.toBeInTheDocument()
  })

  it('keeps Recovery beside the Anchor choices when there is no Focus to change', () => {
    renderGenerate()

    expect(screen.queryByRole('button', { name: /^Focus:/ })).not.toBeInTheDocument()
    expect(recovery().closest('.clr-action-group')).toBeNull()
    expect(recovery().closest('[data-generate-focus-choices]')).toContainElement(group('Anchor'))
    expect(group('Anchor')).not.toContainElement(recovery())
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

describe('goal → intensity (v3 delta §2.2, REQ-009 U27)', () => {
  it('offers 1–10 for the standing goal and lands on its start', () => {
    renderGenerate({ goal: 'conditioning' })

    expect(slider()).toBeEnabled()
    expect(slider()).toHaveAttribute('min', '1')
    expect(slider()).toHaveAttribute('max', '10')
    expect(slider()).toHaveValue(String(INTENSITY_BY_GOAL.conditioning.start))
    // B05-02.5: the in-range explanation is gone; the control describes nothing.
    expect(screen.queryByText('Conditioning works at 4 to 10.')).not.toBeInTheDocument()
    expect(slider()).not.toHaveAttribute('aria-describedby')
  })

  it.each(GENERATION_GOALS.map((goal) => goal.value))(
    'offers the same 1–10 choice for %s',
    async (goal) => {
      const recovering = goal === 'active_recovery'
      const { user } = renderGenerate({ goal: recovering ? 'strength' : goal })
      if (recovering) await chooseRecovery(user)

      expect(slider()).toHaveAttribute('min', '1')
      expect(slider()).toHaveAttribute('max', '10')
    },
  )

  it.each([
    ['strength', 1, 'Strength works at 3 to 10, so 1 is composed as 3.'],
    ['hypertrophy', 10, 'Hypertrophy works at 3 to 9, so 10 is composed as 9.'],
    ['conditioning', 2, 'Conditioning works at 4 to 10, so 2 is composed as 4.'],
  ] as const)(
    'sends %s’s chosen %i unchanged and says how the goal reads it',
    async (goal, chosen, note) => {
      const { user, generation } = renderGenerate({ goal })

      fireEvent.change(slider(), { target: { value: String(chosen) } })
      expect(slider()).toHaveValue(String(chosen))
      expect(screen.getByText(note)).toBeVisible()

      await user.click(chipIn('Anchor', 'Upper body'))
      await user.click(cta())

      expect(generation.calls[0]).toMatchObject({ goal, requested_intensity: chosen })
    },
  )

  it('sends an in-range choice unchanged with no range explanation (B05-02.5)', async () => {
    const { user, generation } = renderGenerate({ goal: 'balanced' })

    fireEvent.change(slider(), { target: { value: '1' } })
    expect(slider()).toHaveValue('1')
    expect(screen.queryByText(/works at/)).not.toBeInTheDocument()

    await user.click(chipIn('Anchor', 'Upper body'))
    await user.click(cta())

    expect(generation.calls[0]).toMatchObject({ goal: 'balanced', requested_intensity: 1 })
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
  it('shows the profile’s Goal, no Goal choice and no Settings link (B05-02.3)', () => {
    renderGenerate({ goal: 'strength' })

    expect(screen.getByText('Strength')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Goal' })).not.toBeInTheDocument()
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
    for (const label of ['Hypertrophy', 'Conditioning', 'Balanced', 'Recovery']) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument()
    }

    expect(screen.queryByRole('link', { name: 'Change in Settings' })).not.toBeInTheDocument()
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
  it('opens on the recommended Focus and the history intensity, ready to generate', async () => {
    const { user, generation } = renderGenerate({ history: lowerBodyDue(7) })

    expect(screen.getByText('Lower body')).toBeInTheDocument()
    // B05-02.4: the recommendation's explanation is not shown; the Focus is.
    expect(screen.queryByText(LOWER_BODY_REASON)).not.toBeInTheDocument()
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
  ])('requests a history averaging %i unchanged; hypertrophy composes it at %i', async (average, effective) => {
    const { user, generation } = renderGenerate({
      goal: 'hypertrophy',
      history: lowerBodyDue(average),
    })

    expect(slider()).toHaveValue(String(average))
    expect(
      screen.getByText(`Hypertrophy works at 3 to 9, so ${average} is composed as ${effective}.`),
    ).toBeVisible()

    await user.click(cta())

    expect(generation.calls[0]).toMatchObject({
      goal: 'hypertrophy',
      focus: 'lower_body',
      requested_intensity: average,
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
  it('asks for one of four with nothing selected, and says it is the first workout', async () => {
    const { user } = renderGenerate({ history: [] })

    expectFourUnselected()
    expect(screen.getByText(FIRST_WORKOUT_MESSAGE)).toHaveTextContent(/first workout/i)
    expect(screen.getByRole('main')).not.toHaveTextContent(HISTORY_CLAIM)
    expect(cta()).toBeDisabled()

    await user.click(chipIn('Anchor', 'Full body'))
    expect(cta()).toBeEnabled()
  })

  it('asks for a manual Focus on history 30 days old, with no history-backed reason', () => {
    renderGenerate({ history: [session(1, 30)] })

    expectFourUnselected()
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
    expect(focusControl()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText(/^No .+ in the sessions you’ve logged\.$/)).not.toBeInTheDocument()
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

    // The read is content of the form's card, not a loader card inside it.
    expect(formCard()).toContainElement(screen.getByText(HISTORY_LOADING_LABEL))
  })

  it('says history could not be read, offers Retry, and is not the first-workout state', async () => {
    renderReading(() => Promise.resolve(readFailure()))

    expect(await screen.findByRole('alert')).toHaveTextContent(HISTORY_ERROR_MESSAGE)
    expect(HISTORY_ERROR_MESSAGE).toMatch(/history could not be read/i)
    expect(retry()).toBeInTheDocument()
    expect(screen.getByRole('main')).not.toHaveTextContent(/first workout/i)
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

    expect(await screen.findByText(/^Focus:/)).toHaveTextContent(/^Focus: Lower body$/)
    expect(screen.queryByText(LOWER_BODY_REASON)).not.toBeInTheDocument()
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
    expect(focusLine()).toHaveTextContent(`Power — ${OVERRIDE_SCOPE}`)
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

    // The refusal is the card's state, said inside it — not a line above it.
    const card = formCard()
    expect(card).toContainElement(screen.getByRole('alert'))
    expect(card).toContainElement(screen.getByText(/whole number of minutes/i))
    expect(card.querySelector('.clr-chamfer--urgency')).not.toBeNull()
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
    expect(screen.queryByRole('heading', { name: 'Generate' })).not.toBeInTheDocument()

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

    expect(screen.getByRole('heading', { level: 1, name: 'Generate' })).toBeInTheDocument()
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
    expect(screen.getByRole('heading', { level: 1, name: 'Generate' })).toBeInTheDocument()
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
    expect(screen.getByRole('heading', { level: 1, name: 'Generate' })).toBeInTheDocument()
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

  it('keeps the Full atmosphere through generation and cancel', async () => {
    const { user } = renderGenerate()

    expect(document.documentElement.dataset.atmosphere).toBe('full')

    await composeAndSubmit(user)
    expect(document.documentElement.dataset.atmosphere).toBe('full')
    expect(within(screen.getByRole('main')).getByRole('status').closest('[data-atmosphere]')).toHaveAttribute(
      'data-atmosphere',
      'full',
    )

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(document.documentElement.dataset.atmosphere).toBe('full')
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
    expect(formCard()).toContainElement(screen.getByText(/reading your places/i))
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
    const retry = screen.getByRole('button', { name: /retry/i })
    // The shared error region is the alert, and its card is the screen's one.
    expect(screen.getByRole('alert')).toContainElement(formCard())
    expect(formCard()).toHaveTextContent(/didn’t load/i)
    expect(screen.getByRole('main').querySelector('.clr-footer')).toContainElement(retry)
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
    const add = screen.getByRole('button', { name: /add a place/i })
    expect(screen.queryByRole('button', { name: /generate workout/i })).not.toBeInTheDocument()
    expect(formCard()).toContainElement(screen.getByText(/no places yet/i))
    expect(screen.getByRole('main').querySelector('.clr-footer')).toContainElement(add)
    // U08: one statement — the empty card explains nothing the action does not.
    expect(formCard().textContent?.trim()).toMatch(/^no places yet$/i)
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

    // A sub-group of the form's card, above the intensity it is about.
    expect(formCard()).toContainElement(banner())
    expect(
      banner()!.compareDocumentPosition(slider()) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
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

/** C51 / R25: the Focus value is the change control, named by what it shows. */
const focusControl = () => screen.getByRole('button', { name: new RegExp(`^${FOCUS_TERM}:`) })
const changeFocus = focusControl
const recovery = () => screen.getByRole('button', { name: RECOVERY_LABEL })
/** The Focus fact: its control, and the this-workout-only marker beside it. */
const focusLine = () => focusControl().closest<HTMLElement>('[data-intent-fact="focus"]')!

/** R10.1: Recovery is reached inside the focus choices; open them when closed. */
async function openFocus(user: ReturnType<typeof userEvent.setup>) {
  if (focusControl().getAttribute('aria-expanded') !== 'true') await user.click(focusControl())
}
async function chooseRecovery(user: ReturnType<typeof userEvent.setup>) {
  if (screen.queryByRole('button', { name: /^Focus:/ }) !== null) await openFocus(user)
  await user.click(recovery())
}

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
    ['cancelling', () => screen.getByRole('button', { name: OVERRIDE_CANCEL_LABEL })],
    ['dismissing the choices with the Focus control', focusControl],
  ])('restores the recommendation on %s', async (_, control) => {
    const { user, generation, url } = renderDraft()

    await user.click(changeFocus())
    await user.click(chipIn(OVERRIDE_GROUP_LABEL, 'Upper body'))
    await user.click(control())

    expect(focusLine()).toHaveTextContent('Lower body')
    expect(screen.queryByText(new RegExp(OVERRIDE_SCOPE))).not.toBeInTheDocument()
    expect(screen.queryByText(LOWER_BODY_REASON)).not.toBeInTheDocument()
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
  it('sends active_recovery with the requested intensity unchanged and says it is composed at 1–3', async () => {
    const { user, generation, url } = renderDraft()

    await chooseRecovery(user)

    expect(recovery()).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Strength')).toBeInTheDocument()
    expect(slider()).toHaveAttribute('min', '1')
    expect(slider()).toHaveAttribute('max', '10')
    expect(slider()).toHaveValue('7')
    expect(screen.getByText('Recovery works at 1 to 3, so 7 is composed as 3.')).toBeVisible()
    expect(url()).toBe('/generate?recovery=1')

    await user.click(cta())

    expect(generation.calls[0]).toMatchObject({
      goal: 'active_recovery',
      focus: 'lower_body',
      requested_intensity: 7,
    })
  })

  it('keeps Power visible and disabled, with the refusal in text', async () => {
    const { user } = renderDraft()

    await chooseRecovery(user)

    expect(chipIn(OVERRIDE_GROUP_LABEL, 'Power')).toBeDisabled()
    expect(screen.getByText(new RegExp(POWER_REFUSAL))).toBeVisible()
  })

  it('clears a recommended Power rather than substituting it, and waits for another Focus', async () => {
    const { user, generation } = renderDraft({ history: powerDue() })

    expect(focusLine()).toHaveTextContent('Power')

    await chooseRecovery(user)

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

    await chooseRecovery(first.user)
    await first.user.click(cta())
    await first.user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(first.url()).toBe('/generate?recovery=1')
    expect(recovery()).toHaveAttribute('aria-pressed', 'true')
    const reloaded = first.url()
    first.unmount()

    const { user, generation } = renderDraft({ entry: reloaded })

    expect(recovery()).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(/^Recovery works at 1 to 3/)).toBeVisible()
    expect(chipIn(OVERRIDE_GROUP_LABEL, 'Power')).toBeDisabled()

    await user.click(cta())
    expect(generation.calls[0]).toMatchObject({ goal: 'active_recovery' })
  })

  it('returns to the standing Goal when Recovery is switched off', async () => {
    const { user, generation, url } = renderDraft()

    await chooseRecovery(user)
    await chooseRecovery(user)

    expect(recovery()).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByText(new RegExp(POWER_REFUSAL))).not.toBeInTheDocument()
    expect(screen.queryByText(/works at/)).not.toBeInTheDocument()
    expect(url()).toBe('/generate')

    await user.click(cta())
    expect(generation.calls[0]).toMatchObject({ goal: 'strength', requested_intensity: 7 })
  })

  it('opens a fresh visit on the standing Goal, and never wrote the profile', async () => {
    const first = renderDraft()

    await chooseRecovery(first.user)
    await first.user.click(cta())
    expect(first.generation.calls[0]).toMatchObject({ goal: 'active_recovery' })
    expect(first.userData.preferenceWrites).toEqual([])
    expect(first.userData.onboardingCalls).toEqual([])
    first.unmount()

    const { user, generation } = renderDraft()

    expect(screen.getByText('Strength')).toBeInTheDocument()
    // Closed on a fresh visit; inside the choices, Recovery is off.
    expect(focusControl()).toHaveAttribute('aria-expanded', 'false')
    await openFocus(user)
    expect(recovery()).toHaveAttribute('aria-pressed', 'false')
    await user.click(focusControl())

    await user.click(cta())
    expect(generation.calls[0]).toMatchObject({ goal: 'strength' })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// REQ-009 — one resolved intent across handoff, refresh, cancel and retry
// ─────────────────────────────────────────────────────────────────────────────

describe('REQ-009 — the same Goal and Focus however the draft is reached', () => {
  beforeEach(() => {
    toastQueue.clear()
  })

  /** A Recovery session on an overridden Focus, at an intensity of the athlete's own. */
  async function composeRecoveryOverride(user: ReturnType<typeof userEvent.setup>) {
    await chooseRecovery(user)
    await user.click(chipIn(OVERRIDE_GROUP_LABEL, 'Upper body'))
    fireEvent.change(slider(), { target: { value: '2' } })
  }

  const RECOVERY_OVERRIDE = {
    goal: 'active_recovery',
    focus: 'upper_body',
    requested_intensity: 2,
  }

  it.each([
    ['the Focus history recommends', generatePath({ focus: 'lower_body', intensity: 7 })],
    ['a Focus history no longer recommends', generatePath({ focus: 'power', intensity: 9 })],
  ])('sends from a Home handoff carrying %s what a direct visit sends', async (_, handoff) => {
    const direct = renderDraft()
    await direct.user.click(cta())
    direct.unmount()

    const handedOff = renderDraft({ entry: handoff })
    await handedOff.user.click(cta())

    expect(direct.generation.calls).toHaveLength(1)
    expect(handedOff.generation.calls).toEqual(direct.generation.calls)
    expect(handedOff.generation.calls[0]).toMatchObject({
      goal: 'strength',
      focus: 'lower_body',
      requested_intensity: 7,
    })
  })

  it('cancels from Loading back to the draft with Recovery, the override and the intensity kept', async () => {
    const { user, generation, url } = renderDraft()

    await composeRecoveryOverride(user)
    const drafted = url()
    await user.click(cta())
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.getByRole('heading', { level: 1, name: 'Generate' })).toBeInTheDocument()
    expect(url()).toBe(drafted)
    expect(intentFrom(url().slice(GENERATE_PATH.length))).toEqual({
      override: 'upper_body',
      recovery: true,
    })
    expect(recovery()).toHaveAttribute('aria-pressed', 'true')
    expect(focusLine()).toHaveTextContent('Upper body')
    expect(focusLine()).toHaveTextContent(OVERRIDE_SCOPE)
    expect(slider()).toHaveValue('2')

    // And the same request goes out again.
    await user.click(cta())
    expect(generation.calls).toHaveLength(2)
    expect(generation.calls[0]).toMatchObject(RECOVERY_OVERRIDE)
    expect(generation.calls[1]).toEqual(generation.calls[0])
  })

  it('U20: opens from Home’s next-workout entry with its minutes and place, sending nothing', async () => {
    const handoff = nextWorkoutPath({ durationMins: 35, locationId: GYM.id })
    const { user, generation, url } = renderDraft({ entry: handoff })

    expect(screen.getByLabelText(new RegExp(DURATION_LABEL, 'i'))).toHaveValue(35)
    expect(screen.getByRole('combobox', { name: /Place/ })).toHaveValue(GYM.id)
    expect(focusLine()).toHaveTextContent('Lower body')
    expect(generation.calls).toEqual([])
    expect(url()).toBe(handoff)

    // The Goal, Focus and intensity a direct visit resolves; the carried rest.
    await user.click(cta())
    expect(generation.calls).toEqual([
      expect.objectContaining({
        goal: 'strength',
        focus: 'lower_body',
        requested_intensity: 7,
        requested_duration_mins: 35,
        location_id: GYM.id,
      }),
    ])
  })

  it.each([
    ['a place that is no longer the athlete’s', `${GENERATE_PATH}?minutes=30&place=00000000-0000-4000-8000-0000000000ff`],
    ['no place at all', `${GENERATE_PATH}?minutes=30`],
  ])('U20: a carried request with %s opens on the default place', (_, entry) => {
    renderDraft({ entry })

    expect(screen.getByLabelText(new RegExp(DURATION_LABEL, 'i'))).toHaveValue(30)
    expect(screen.getByRole('combobox', { name: /Place/ })).toHaveValue(fixtureLocation().id)
  })

  it('U20: an unusable carried time is no time, so the standard one opens', () => {
    renderDraft({ entry: `${GENERATE_PATH}?minutes=0` })

    expect(screen.getByLabelText(new RegExp(DURATION_LABEL, 'i'))).toHaveValue(45)
  })

  it('keeps the handoff’s own parameters in the address through cancel', async () => {
    const handoff = generatePath({ focus: 'lower_body', intensity: 7 })
    const { user, url } = renderDraft({ entry: handoff })

    await user.click(cta())
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(url()).toBe(handoff)
    expect(focusLine()).toHaveTextContent('Lower body')
    expect(focusLine()).not.toHaveTextContent(OVERRIDE_SCOPE)
  })

  it('resolves the same request from a refresh of the cancelled draft’s address', async () => {
    const first = renderDraft()

    await composeRecoveryOverride(first.user)
    await first.user.click(cta())
    await first.user.click(screen.getByRole('button', { name: 'Cancel' }))
    const address = first.url()
    first.unmount()

    const reloaded = renderDraft({ entry: address })
    expect(recovery()).toHaveAttribute('aria-pressed', 'true')
    expect(focusLine()).toHaveTextContent('Upper body')
    await reloaded.user.click(cta())

    // The intensity is the draft's and not the address's, so a reload resolves
    // it again from the Goal; Goal and Focus are the ones that were sent.
    const { goal, focus } = first.generation.calls[0] ?? {}
    expect(reloaded.generation.calls).toHaveLength(1)
    expect(reloaded.generation.calls[0]).toMatchObject({ goal, focus })
    expect(goal).toBe('active_recovery')
    expect(focus).toBe('upper_body')
  })

  it('resends the same Goal and Focus on Retry after a typed failure, once', async () => {
    const { user, generation } = renderDraft()

    await composeRecoveryOverride(user)
    await user.click(cta())
    await act(async () => {
      generation.fail(makeGenerationError({ requestId: 'req_generate_9' }))
    })
    const alert = await screen.findByRole('alert')
    const retry = within(alert).getByRole('button', { name: 'Retry' })
    // Two presses in one tick: the second lands while the retry is in flight.
    fireEvent.click(retry)
    fireEvent.click(retry)

    expect(generation.calls).toHaveLength(2)
    expect(generation.outstanding).toBe(1)
    expect(generation.calls[0]).toMatchObject(RECOVERY_OVERRIDE)
    expect(generation.calls[1]).toEqual(generation.calls[0])
  })

  it('starts one run for a Recovery draft however often the submit is pressed', async () => {
    const { user, generation } = renderDraft()

    await composeRecoveryOverride(user)
    const button = cta()
    fireEvent.click(button)
    fireEvent.click(button)

    expect(generation.calls).toHaveLength(1)
    expect(generation.outstanding).toBe(1)
    expect(generation.calls[0]).toMatchObject(RECOVERY_OVERRIDE)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TASK-015 (REQ-009: U26, U28, U29) — the form's copy
// ─────────────────────────────────────────────────────────────────────────────

describe('U26 — the goal, plainly, and first-workout guidance only when needed', () => {
  const goalLine = () => screen.getByText(/^Goal:/)

  it.each(STANDING_GOALS)('states a standing %s goal as its label alone', (goal) => {
    renderGenerate({ goal })

    const option = GENERATION_GOALS.find((candidate) => candidate.value === goal)!
    expect(goalLine()).toHaveTextContent(new RegExp(`^Goal: ${option.label}$`))
    expect(screen.getByRole('main')).not.toHaveTextContent(option.description!)
  })

  it('guides the first request until an anchor is chosen, and again if it is cleared', async () => {
    const { user } = renderGenerate({ history: [] })

    expect(screen.getByText(FIRST_WORKOUT_MESSAGE)).toBeInTheDocument()

    await user.click(chipIn('Anchor', 'Upper body'))
    expect(screen.queryByText(FIRST_WORKOUT_MESSAGE)).not.toBeInTheDocument()

    await user.click(chipIn('Anchor', 'Upper body'))
    expect(screen.getByText(FIRST_WORKOUT_MESSAGE)).toBeInTheDocument()
  })

  it('guides a first request under another goal the same way', () => {
    renderGenerate({ goal: 'conditioning', history: [] })

    expect(goalLine()).toHaveTextContent('Goal: Conditioning')
    expect(screen.getByText(FIRST_WORKOUT_MESSAGE)).toBeInTheDocument()
  })

  it('guides again when Recovery clears a chosen Power on a first request', async () => {
    const { user } = renderGenerate({ history: [] })

    await user.click(chipIn('Anchor', 'Power'))
    expect(screen.queryByText(FIRST_WORKOUT_MESSAGE)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: RECOVERY_LABEL }))
    expect(chipIn('Anchor', 'Power')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText(FIRST_WORKOUT_MESSAGE)).toBeInTheDocument()
  })

  it.each([
    ['recent history (a recommendation)', () => lowerBodyDue(7)],
    ['stale history', () => [session(1, 30)]],
  ])('gives no first-workout guidance on %s', (_, history) => {
    renderGenerate({ history: history() })

    expect(screen.queryByText(FIRST_WORKOUT_MESSAGE)).not.toBeInTheDocument()
    expect(screen.getByRole('main')).not.toHaveTextContent(/first workout/i)
  })
})

describe('U28 — minutes spelled out; R23 — Place and Notes without helper lines', () => {
  const minutes = () => screen.getByLabelText(new RegExp(DURATION_LABEL, 'i'))
  const place = () => screen.getByLabelText(/place/i)
  const notes = () => screen.getByLabelText(/notes/i)

  /** R23 removed exactly these two lines; nothing replaces them. */
  const REMOVED_HELPERS = [
    'Uses this place’s equipment.',
    'Optional, today only. Ongoing limits go in Settings.',
  ]

  /**
   * TASK-024 (AC-R024-07) migrates U28's helper-retention checks to the
   * approved removals: no helper line under Place or Notes, while each keeps
   * its label, control, the Notes placeholder and the minutes unit.
   */
  function expectFieldsWithoutHelpers() {
    for (const helper of REMOVED_HELPERS) {
      expect(screen.queryByText(helper)).not.toBeInTheDocument()
    }
    expect(screen.getByRole('main')).not.toHaveTextContent(/this place’s equipment|Ongoing limits/)
    expect(place()).toBeInTheDocument()
    expect(notes()).toHaveAttribute('placeholder', NOTES_PLACEHOLDER)
    expect(screen.getByText(DURATION_UNIT)).toBeInTheDocument()
  }

  it('says minutes in full beside the time, never min', () => {
    renderGenerate()

    const unit = screen.getByText(DURATION_UNIT)
    expect(DURATION_UNIT).toBe('minutes')
    expect(minutes().getAttribute('aria-describedby')).toContain(unit.id)
    expect(screen.queryByText('min')).not.toBeInTheDocument()
  })

  it('AC-R024-07 removes the Place and Notes helper lines and leaves no description wired to either field', () => {
    renderGenerate()

    expectFieldsWithoutHelpers()
    // The removed helpers took their description wiring with them (R23).
    expect(place()).not.toHaveAttribute('aria-describedby')
    expect(notes()).not.toHaveAttribute('aria-describedby')
    expect(place()).toHaveAccessibleName(/^Place/)
    expect(notes()).toHaveAccessibleName(/^Notes/)
  })

  it('shows no helpers on an empty time and empty notes, with no error before submit', async () => {
    const { user } = renderGenerate()

    await user.clear(minutes())
    expect(minutes()).toHaveValue(null)
    expect(notes()).toHaveValue('')
    expectFieldsWithoutHelpers()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('says the time error on the field, with the unit still there and no helper returning', async () => {
    const { user, generation } = renderGenerate()

    await user.click(chipIn('Anchor', 'Upper body'))
    await user.clear(minutes())
    await user.click(cta())

    expect(generation.calls).toEqual([])
    expect(minutes()).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText(/whole number of minutes/i)).toBeInTheDocument()
    expectFieldsWithoutHelpers()
  })

  it('sends a valid time as the minutes typed, and the chosen place', async () => {
    const { user, generation } = renderGenerate()

    await user.click(chipIn('Anchor', 'Upper body'))
    await user.clear(minutes())
    await user.type(minutes(), '30')
    await user.selectOptions(place(), GYM.id)
    expectFieldsWithoutHelpers()
    await user.click(cta())

    expect(generation.calls[0]).toMatchObject({ requested_duration_mins: 30, location_id: GYM.id })
  })

  it('keeps the notes limit with a note at the length limit, and sends it whole', async () => {
    const { user, generation } = renderGenerate()
    const note = 'Tight hamstrings. '.repeat(200).slice(0, NOTES_MAX_LENGTH)

    await user.click(chipIn('Anchor', 'Upper body'))
    fireEvent.change(notes(), { target: { value: note } })

    expect(notes()).toHaveValue(note)
    expect(notes()).toHaveAttribute('maxlength', String(NOTES_MAX_LENGTH))
    expectFieldsWithoutHelpers()
    await user.click(cta())

    expect(generation.calls[0]?.notes).toHaveLength(NOTES_MAX_LENGTH)
  })
})

describe('U29 — a recovery workout says briefly that it is lighter, and stays recovery', () => {
  it('says it is lighter, and sends the recovery goal, requested intensity and focus unchanged', async () => {
    const { user, generation } = renderDraft()

    await chooseRecovery(user)

    expect(screen.getByText(new RegExp(RECOVERY_NOTE))).toBeVisible()
    expect(RECOVERY_NOTE).toMatch(/lighter/i)
    expect(screen.getByText(/^Goal:/)).toHaveTextContent('Goal: Strength')
    expect(screen.getByText('Recovery works at 1 to 3, so 7 is composed as 3.')).toBeVisible()
    expect(chipIn(OVERRIDE_GROUP_LABEL, 'Power')).toBeDisabled()
    expect(screen.getByText(new RegExp(POWER_REFUSAL))).toBeVisible()

    await user.click(cta())

    expect(generation.calls[0]).toMatchObject({
      goal: 'active_recovery',
      focus: 'lower_body',
      requested_intensity: 7,
    })
  })

  it('says the same on a suggested Recovery opened from its address', async () => {
    const { user, generation } = renderDraft({ entry: '/generate?recovery=1' })

    expect(recovery()).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(new RegExp(RECOVERY_NOTE))).toBeVisible()

    await user.click(cta())
    expect(generation.calls[0]).toMatchObject({ goal: 'active_recovery' })
  })

  it('drops the note when Recovery is switched off', async () => {
    const { user } = renderDraft()

    await chooseRecovery(user)
    await chooseRecovery(user)

    expect(screen.queryByText(new RegExp(RECOVERY_NOTE))).not.toBeInTheDocument()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TASK-024 (REQ-024; C51, G16; R06, R10, R11, R21, R23, R25; UAT #286) —
// Generate hierarchy, focus interaction and exact copy. Accepted gallery
// reference eded158cfd928d382c9a9409e2c372270312741d, ?state=screens.
// ─────────────────────────────────────────────────────────────────────────────

describe('TASK-024 — Generate hierarchy, focus interaction and exact copy', () => {
  const ROOT = resolve(import.meta.dirname, '../..')
  const read = (file: string) => readFileSync(resolve(ROOT, file), 'utf8')
  const ANCHOR_LABELS = ['Upper body', 'Lower body', 'Full body', 'Power']
  const header = () => screen.getByRole('main').querySelector<HTMLElement>('header')!
  const home = () => within(header()).getByRole('button', { name: HOME_BACK_LABEL })
  const summary = () => screen.getByText(/^Goal:/).closest<HTMLElement>('.clr-intent-summary')!
  const choicesRegion = () => document.getElementById(focusControl().getAttribute('aria-controls')!)!

  it('AC-C51-01 keeps Goal and Focus first with an interactive Focus value, Recovery inside its choices, the minutes unit, the Generate title and the icon-only Home back, and no Place or Notes helper', async () => {
    const { user } = renderDraft()

    // Generate title, the framed icon-only Back to Home in the header.
    expect(screen.getByRole('heading', { level: 1, name: GENERATE_TITLE })).toBeInTheDocument()
    expect(home()).toHaveTextContent('')
    // Goal and Focus lead the one card; the Focus value is the control.
    const card = formCard()
    expect(card.querySelector('[data-generate-intent]')).toBe(
      card.querySelector('.clr-stack')!.firstElementChild,
    )
    expect(summary()).toContainElement(focusControl())
    expect(focusControl()).toHaveAccessibleName('Focus: Lower body')
    // Recovery is reached inside the Focus choices.
    expect(screen.queryByRole('button', { name: RECOVERY_LABEL })).not.toBeInTheDocument()
    await user.click(focusControl())
    expect(choicesRegion()).toContainElement(recovery())
    // MINUTES in the Time available unit slot; no Place or Notes helper line.
    expect(screen.getByText(DURATION_UNIT)).toHaveClass('clr-field__unit')
    expect(screen.queryByText('Uses this place’s equipment.')).not.toBeInTheDocument()
    expect(screen.queryByText('Optional, today only. Ongoing limits go in Settings.')).not.toBeInTheDocument()
    expect(screen.getByLabelText(/notes/i)).toHaveAttribute('placeholder', NOTES_PLACEHOLDER)
  })

  it('AC-R024-01 Recovery is its own session toggle inside the focus choices, never a fifth focus value, and no detached or paired change action remains', async () => {
    const { user, generation, url } = renderDraft()

    expect(screen.queryByRole('button', { name: 'Change focus' })).not.toBeInTheDocument()
    expect(formCard().querySelector('.clr-action-group')).toBeNull()

    await user.click(focusControl())
    const focuses = within(group(OVERRIDE_GROUP_LABEL)).getAllByRole('button')
    expect(focuses.map((chip) => chip.textContent)).toEqual(ANCHOR_LABELS)
    // Inside the same disclosure, but apart from the four focuses.
    expect(choicesRegion()).toContainElement(recovery())
    expect(group(OVERRIDE_GROUP_LABEL)).not.toContainElement(recovery())

    await user.click(recovery())

    // Recovery on, and the movement focus is still the recommended one: two
    // separate answers, neither replacing the other.
    expect(recovery()).toHaveAttribute('aria-pressed', 'true')
    expect(chipIn(OVERRIDE_GROUP_LABEL, 'Lower body')).toHaveAttribute('aria-pressed', 'true')
    expect(focusLine()).toHaveTextContent('Focus: Lower body')
    expect(intentFrom(url().slice(GENERATE_PATH.length))).toEqual({ override: null, recovery: true })

    // Closing the choices keeps Recovery, and says so.
    await user.click(focusControl())
    expect(focusControl()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText(new RegExp(RECOVERY_NOTE))).toBeVisible()

    await user.click(cta())
    expect(generation.calls[0]).toMatchObject({ goal: 'active_recovery', focus: 'lower_body' })
  })

  it('AC-R024-02 Goal and Focus share the summary’s larger type, and the Focus value is a keyboard disclosure with its name and expanded state', async () => {
    const { user, url } = renderDraft()

    const goal = screen.getByText(/^Goal:/)
    expect(goal).toHaveClass('clr-intent-summary__fact')
    expect(focusLine()).toHaveClass('clr-intent-summary__fact')
    const css = read('src/ui/refinements/presentation.css')
    expect(css).toMatch(/\.clr-intent-summary \{[^}]*flex-wrap: wrap;/)
    expect(css).toMatch(/\.clr-intent-summary__fact \{[^}]*font-size: var\(--paragraph-lg-size\);/)
    expect(css).toMatch(/\.clr-intent-summary__fact strong \{[^}]*font-weight: var\(--font-weight-bold\);/)
    // The change stays secondary: no frame, no button variant, a chevron cue.
    const control = focusControl()
    expect(control.tagName).toBe('BUTTON')
    expect(control).toHaveAttribute('type', 'button')
    expect(control).not.toHaveClass('clr-btn')
    expect(control.querySelector('.clr-intent-summary__cue svg')).not.toBeNull()

    // Keyboard: Tab reaches it, Enter opens, Space closes.
    control.focus()
    expect(control).toHaveFocus()
    expect(control).toHaveAttribute('aria-expanded', 'false')
    expect(control).not.toHaveAttribute('aria-controls')
    await user.keyboard('{Enter}')
    expect(focusControl()).toHaveAttribute('aria-expanded', 'true')
    expect(choicesRegion()).toContainElement(group(OVERRIDE_GROUP_LABEL))
    await user.tab()
    expect(chipIn(OVERRIDE_GROUP_LABEL, 'Upper body')).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(focusControl()).toHaveAccessibleName('Focus: Upper body')
    expect(focusLine()).toHaveTextContent(OVERRIDE_SCOPE)
    expect(url()).toBe('/generate?override=upper_body')
    focusControl().focus()
    await user.keyboard(' ')
    expect(focusControl()).toHaveAttribute('aria-expanded', 'false')
    expect(focusControl()).toHaveAccessibleName('Focus: Lower body')
    expect(url()).toBe('/generate')
  })

  it('AC-R024-03 the minutes unit is the public Input unit end cap fitted by the shared contract, with nothing Generate-specific sizing it', () => {
    renderGenerate()

    const unit = screen.getByText(DURATION_UNIT)
    expect(unit).toHaveClass('clr-field__unit')
    expect(unit.parentElement).toHaveClass('clr-field')
    expect(unit).not.toHaveAttribute('style')
    expect(screen.getByLabelText(new RegExp(DURATION_LABEL, 'i')).getAttribute('aria-describedby')).toContain(unit.id)
    // The shared correction owns the fit; Generate and its recipe add none.
    expect(read('src/styles/fields.css')).toMatch(/\.clr-field > \.clr-field__unit \{\s*flex: 0 0 auto;\s*white-space: nowrap;\s*\}/)
    expect(read('src/app/Generate.tsx')).not.toMatch(/clr-field__unit|minWidth|min-width/)
    expect(read('src/ui/refinements/presentation.css')).not.toMatch(/clr-field/)
  })

  it('AC-R024-04 the page title is Generate, and the generation action keeps its name', () => {
    renderGenerate()

    expect(GENERATE_TITLE).toBe('Generate')
    expect(screen.getByRole('heading', { level: 1 })).toHaveAccessibleName('Generate')
    expect(screen.queryByRole('heading', { name: /Generate Workout/i })).not.toBeInTheDocument()
    expect(document.title).toMatch(/^Generate · /)
    expect(GENERATE_ACTION_LABEL).toBe('Generate workout')
    expect(cta()).toHaveTextContent('Generate workout')
  })

  it('AC-R024-05 Back is the shared framed icon-only control named Home, and it goes Home', async () => {
    const { user, url } = renderDraft()

    const back = home()
    // Framed (#286): the chamfered button frame, not the unframed quiet treatment.
    expect(back).toHaveClass('clr-chamfer', 'clr-btn')
    expect(back).not.toHaveClass('clr-btn--quiet')
    expect(back).toHaveTextContent('')
    expect(back.querySelector('svg')).not.toBeNull()
    // No arrow-plus-HOME label, quiet or otherwise, anywhere in the header.
    expect(within(header()).queryByText(/^home$/i)).not.toBeInTheDocument()

    await user.click(back)
    await waitFor(() => expect(url()).toBe('/'))
  })

  it('AC-R024-06 a first workout opens as a normal session: Recovery is offered unselected and recommended nowhere, and can still be chosen', async () => {
    const first = renderGenerate({ history: [] })

    expect(recovery()).toHaveAttribute('aria-pressed', 'false')
    expect(recovery()).toBeEnabled()
    expect(screen.queryByText(new RegExp(RECOVERY_NOTE))).not.toBeInTheDocument()
    expect(screen.getByRole('main')).not.toHaveTextContent(/recommended|suggested/i)
    await first.user.click(chipIn('Anchor', 'Full body'))
    await first.user.click(cta())
    expect(first.generation.calls[0]).toMatchObject({ goal: 'strength', focus: 'full_body' })
    first.unmount()

    // Nothing bans it: the athlete may still choose a Recovery first workout.
    const chosen = renderGenerate({ history: [] })
    await chosen.user.click(recovery())
    await chosen.user.click(chipIn('Anchor', 'Full body'))
    expect(recovery()).toHaveAttribute('aria-pressed', 'true')
    await chosen.user.click(cta())
    expect(chosen.generation.calls[0]).toMatchObject({ goal: 'active_recovery', focus: 'full_body' })
  })

  it('AC-R024-08 #286 is kept: a first workout requires one of four Anchors; history shows its Focus collapsed with the choices behind it, a different one for this workout only; the stored Goal; Intensity 1–10', async () => {
    const first = renderGenerate({ goal: 'balanced', history: [] })
    expect(within(group('Anchor')).getAllByRole('button').map((chip) => chip.textContent)).toEqual(ANCHOR_LABELS)
    expect(cta()).toBeDisabled()
    expect(screen.getByText(/^Goal:/)).toHaveTextContent(/^Goal: Balanced$/)
    expect(screen.queryByRole('link', { name: 'Change in Settings' })).not.toBeInTheDocument()
    expect(slider()).toHaveAttribute('min', '1')
    expect(slider()).toHaveAttribute('max', '10')
    await first.user.click(chipIn('Anchor', 'Power'))
    expect(cta()).toBeEnabled()
    first.unmount()

    const returning = renderDraft()
    // Collapsed: the Focus and its control, no choices until asked.
    expect(focusControl()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('group', { name: OVERRIDE_GROUP_LABEL })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Anchor' })).not.toBeInTheDocument()
    expect(screen.queryByText(LOWER_BODY_REASON)).not.toBeInTheDocument()
    expect(screen.getByText(/^Goal:/)).toHaveTextContent(/^Goal: Strength$/)
    await returning.user.click(focusControl())
    await returning.user.click(chipIn(OVERRIDE_GROUP_LABEL, 'Full body'))
    expect(focusLine()).toHaveTextContent(`Focus: Full body — ${OVERRIDE_SCOPE}`)
    expect(slider()).toHaveAttribute('max', '10')
    await returning.user.click(cta())
    expect(returning.generation.calls[0]).toMatchObject({ goal: 'strength', focus: 'full_body', requested_intensity: 7 })
    expect(returning.userData.preferenceWrites).toEqual([])
  })

  it('AC-C51-01 the accepted gallery state ?state=screens draws Generate’s own Back, Goal/Focus summary, focus choices with Recovery and fields, and sends nothing', { timeout: 30_000 }, async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/gallery/refinements?state=screens']}>
        <GalleryRefinements />
      </MemoryRouter>,
    )
    const state = document.querySelector<HTMLElement>('[data-refinement-state="screens"]')!
    expect(state).not.toBeNull()
    const scene = within(state)
    expect(scene.getByRole('heading', { name: GENERATE_TITLE })).toBeInTheDocument()
    expect(scene.getByRole('button', { name: HOME_BACK_LABEL })).toHaveClass('clr-chamfer', 'clr-btn')
    const control = scene.getByRole('button', { name: /^Focus: Full body$/ })
    expect(control.closest('.clr-intent-summary')).toContainElement(scene.getByText(/^Goal:/))
    expect(scene.getByText(/^Goal:/)).toHaveTextContent('Goal: Balanced')
    expect(scene.queryByRole('button', { name: RECOVERY_LABEL })).not.toBeInTheDocument()

    await user.click(control)
    expect(control).toHaveAttribute('aria-expanded', 'true')
    const focuses = scene.getByRole('group', { name: OVERRIDE_GROUP_LABEL })
    expect(within(focuses).getAllByRole('button').map((chip) => chip.textContent)).toEqual(ANCHOR_LABELS)
    const recoveryChip = scene.getByRole('button', { name: RECOVERY_LABEL })
    expect(focuses).not.toContainElement(recoveryChip)
    await user.click(recoveryChip)
    expect(recoveryChip).toHaveAttribute('aria-pressed', 'true')
    expect(within(focuses).getByRole('button', { name: /Full body/ })).toHaveAttribute('aria-pressed', 'true')

    // Fields without helpers, the minutes unit through the public Input.
    expect(scene.getByText(DURATION_UNIT)).toHaveClass('clr-field__unit')
    expect(scene.getByLabelText(/notes/i)).toHaveAttribute('placeholder', NOTES_PLACEHOLDER)
    expect(state).not.toHaveTextContent(/this place’s equipment|Ongoing limits/)
    expect(scene.getByRole('button', { name: GENERATE_ACTION_LABEL })).toBeEnabled()

    // First workout: the required Anchor, Recovery offered unselected.
    await user.click(scene.getByRole('radio', { name: 'First workout' }))
    const anchor = scene.getByRole('group', { name: 'Anchor' })
    expect(within(anchor).getAllByRole('button').map((chip) => chip.textContent)).toEqual(ANCHOR_LABELS)
    expect(scene.getByRole('button', { name: RECOVERY_LABEL })).toHaveAttribute('aria-pressed', 'false')
    expect(scene.getByRole('button', { name: GENERATE_ACTION_LABEL })).toBeDisabled()
  })
})
