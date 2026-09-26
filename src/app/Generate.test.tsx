/**
 * GEN-04's acceptance, on the real route tree.
 *
 * Two criteria: the screen is the export's Form Screen template — goal chips
 * first, anchor chips, the intensity slider, the place, the time target and the
 * notes, one full-width primary action — and no payload the CORE-03 request
 * schema would refuse ever reaches the generation client.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import type { WorkoutClients } from '../data/workout'
import { DELOAD_DECISIONS_STORAGE_KEY } from '../state/deload-decisions'
import { createError, ErrorCode, err, ok, type Result } from '../state/errors'
import { INTENSITY_BY_GOAL, REFUSAL_SUMMARY } from '../state/generation-form'
import { QueryClient } from '../state/query'
import { createWorkoutDouble } from '../test/workout-double'
import type { AnchorEvidenceRow, Location } from '../state/schemas'
import { locationsQueryKey, profileQueryKey } from '../state/user-queries'
import { createFakeGenerationClient } from '../test/generation-double'
import { renderApp, signedIn } from '../test/render'
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

function warmCache(locations: readonly Location[]) {
  const cache = new QueryClient()
  cache.setData(profileQueryKey(FIXTURE_USER_ID), onboardedProfile())
  cache.setData(locationsQueryKey(FIXTURE_USER_ID), [...locations])
  return cache
}

function renderGenerate(
  locations: readonly Location[] = [fixtureLocation(), GYM],
  workout?: WorkoutClients,
) {
  const generation = createFakeGenerationClient()
  const rendered = renderApp(
    ['/generate'],
    signedIn({ queryClient: warmCache(locations), generation, workout }),
  )

  return { ...rendered, generation, user: userEvent.setup() }
}

const goalChip = (label: string) => screen.getByRole('button', { name: new RegExp(label, 'i') })
const group = (name: string) => screen.getByRole('group', { name })
const chipIn = (name: string, label: string) =>
  within(group(name)).getByRole('button', { name: new RegExp(label, 'i') })
const cta = () => screen.getByRole('button', { name: /generate workout/i })
const slider = () => screen.getByRole('slider')

describe('the screen’s composition (Form Screen template)', () => {
  it('asks the goal first, then the anchor, the intensity, the place, the time and the notes', () => {
    renderGenerate()

    expect(screen.getByRole('heading', { level: 1, name: 'Generate workout' })).toBeInTheDocument()

    const goals = within(group('Goal')).getAllByRole('button')
    expect(goals.map((chip) => chip.textContent)).toEqual([
      'Strength',
      'Hypertrophy',
      'Conditioning',
      'Balanced',
      'Recovery',
    ])

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
    renderGenerate([GYM, fixtureLocation()])

    expect(screen.getByLabelText(/place/i)).toHaveValue(fixtureLocation().id)
  })

  it('chooses no goal for the user', () => {
    renderGenerate()

    for (const chip of within(group('Goal')).getAllByRole('button')) {
      expect(chip).toHaveAttribute('aria-pressed', 'false')
    }
  })
})

describe('the CTA', () => {
  it('stays disabled until a goal and an anchor are both chosen', async () => {
    const { user } = renderGenerate()

    expect(cta()).toBeDisabled()

    await user.click(goalChip('Strength'))
    expect(cta()).toBeDisabled()

    await user.click(chipIn('Anchor', 'Upper body'))
    expect(cta()).toBeEnabled()
  })
})

describe('goal → intensity (v3 delta §2.2)', () => {
  it('clamps the slider to the chosen goal’s range and lands on its start', async () => {
    const { user } = renderGenerate()

    expect(slider()).toBeDisabled()

    await user.click(goalChip('Conditioning'))

    expect(slider()).toBeEnabled()
    expect(slider()).toHaveAttribute('min', String(INTENSITY_BY_GOAL.conditioning.min))
    expect(slider()).toHaveAttribute('max', String(INTENSITY_BY_GOAL.conditioning.max))
    expect(slider()).toHaveValue(String(INTENSITY_BY_GOAL.conditioning.start))
  })

  it('snaps a chosen intensity into the new goal’s range', async () => {
    const { user } = renderGenerate()

    await user.click(goalChip('Balanced'))
    // A real range input, dragged: jsdom has no pointer geometry, so the drag
    // is the change event it would have produced.
    fireEvent.change(slider(), { target: { value: '10' } })
    expect(slider()).toHaveValue('10')

    await user.click(goalChip('Recovery'))

    expect(slider()).toHaveValue(String(INTENSITY_BY_GOAL.active_recovery.max))
    expect(slider()).toHaveAttribute('max', String(INTENSITY_BY_GOAL.active_recovery.max))
  })
})

describe('goal → anchor (v3 delta §2.3)', () => {
  it('disables Power for Recovery and leaves the anchor blank rather than substituting one', async () => {
    const { user } = renderGenerate()

    await user.click(goalChip('Strength'))
    await user.click(chipIn('Anchor', 'Power'))
    expect(chipIn('Anchor', 'Power')).toHaveAttribute('aria-pressed', 'true')

    await user.click(goalChip('Recovery'))

    expect(chipIn('Anchor', 'Power')).toBeDisabled()
    for (const chip of within(group('Anchor')).getAllByRole('button')) {
      expect(chip).toHaveAttribute('aria-pressed', 'false')
    }
    expect(cta()).toBeDisabled()
    expect(screen.getByText(/Recovery sessions are gentle movement/i)).toBeInTheDocument()
  })

  it('offers Power to every other goal', async () => {
    const { user } = renderGenerate()

    await user.click(goalChip('Hypertrophy'))

    expect(chipIn('Anchor', 'Power')).toBeEnabled()
  })
})

describe('what is sent', () => {
  it('sends the request the user composed, once', async () => {
    const { user, generation } = renderGenerate()

    await user.click(goalChip('Strength'))
    await user.click(chipIn('Anchor', 'Upper body'))
    await user.selectOptions(screen.getByLabelText(/place/i), GYM.id)
    await user.clear(screen.getByLabelText(/time available/i))
    await user.type(screen.getByLabelText(/time available/i), '30')
    await user.type(screen.getByLabelText(/notes/i), 'Left shoulder is tight.')
    await user.click(cta())

    expect(generation.calls).toEqual([
      {
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

    await user.click(goalChip('Balanced'))
    await user.click(chipIn('Anchor', 'Full body'))
    await user.click(cta())

    expect(generation.calls[0]?.notes).toBeNull()
  })

  it('blocks a payload the request schema refuses, and says which field', async () => {
    const { user, generation } = renderGenerate()

    await user.click(goalChip('Strength'))
    await user.click(chipIn('Anchor', 'Upper body'))
    await user.clear(screen.getByLabelText(/time available/i))
    await user.click(cta())

    expect(generation.calls).toEqual([])
    expect(screen.getByRole('alert')).toHaveTextContent(REFUSAL_SUMMARY)
    expect(screen.getByText(/whole number of minutes/i)).toBeInTheDocument()
  })

  it('sends once the refused field is fixed', async () => {
    const { user, generation } = renderGenerate()

    await user.click(goalChip('Strength'))
    await user.click(chipIn('Anchor', 'Upper body'))
    await user.clear(screen.getByLabelText(/time available/i))
    await user.click(cta())
    expect(generation.calls).toEqual([])

    await user.type(screen.getByLabelText(/time available/i), '60')
    await user.click(cta())

    expect(generation.calls).toHaveLength(1)
    expect(generation.calls[0]?.requested_duration_mins).toBe(60)
  })

  it('says the call is in flight and does not start a second one', async () => {
    const { user, generation } = renderGenerate()

    await user.click(goalChip('Strength'))
    await user.click(chipIn('Anchor', 'Upper body'))
    await user.click(cta())

    expect(screen.getByText(/Composing your session/i)).toBeInTheDocument()
    expect(cta()).toBeDisabled()
    expect(generation.calls).toHaveLength(1)
  })

  it('renders a refusal from the function with its request id', async () => {
    const { user, generation } = renderGenerate()

    await user.click(goalChip('Strength'))
    await user.click(chipIn('Anchor', 'Upper body'))
    await user.click(cta())

    generation.fail({
      ...createError(ErrorCode.GENERATION_FAILED, { requestId: 'req_failed_1' }),
      message: 'Generation could not complete.',
      requestId: 'req_failed_1',
      failure: null,
      issues: [],
      retryable: true,
    })

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Generation could not complete.')
    })
    expect(screen.getByText('req_failed_1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
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
    const rendered = renderGenerate([fixtureLocation(), GYM], stalling())
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

    await user.click(goalChip('Strength'))
    await user.click(chipIn('Anchor', 'Upper body'))

    // The suggestion is on the screen and the slider is still where the goal
    // put it: the app has advised, and done nothing.
    expect(slider()).toHaveValue(String(INTENSITY_BY_GOAL.strength.start))

    await user.click(cta())

    await waitFor(() => expect(generation.calls).toHaveLength(1))
    expect(generation.calls[0].deload).toBe(false)
  })

  it('clamps the intensity and carries the directive once the user applies it', async () => {
    const { user, generation } = await renderStalled()

    await user.click(goalChip('Strength'))
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

    renderGenerate([fixtureLocation(), GYM], stalling())

    await waitFor(() => expect(cta()).toBeInTheDocument())
    expect(reason()).not.toBeInTheDocument()
  })

  it('confirms a hard intensity once on a flagged day, then honours it', async () => {
    const { user, generation } = await renderStalled()

    await user.click(goalChip('Strength'))
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

    await user.click(goalChip('Strength'))
    await user.click(chipIn('Anchor', 'Upper body'))

    fireEvent.change(slider(), { target: { value: '9' } })
    await user.click(await screen.findByRole('button', { name: /keep it easier/i }))

    await waitFor(() => expect(confirmDialog()).not.toBeInTheDocument())
    expect(slider()).toHaveValue(String(INTENSITY_BY_GOAL.strength.start))
    expect(reason()).toBeInTheDocument()
  })
})
