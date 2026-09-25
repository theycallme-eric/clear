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
import { describe, expect, it } from 'vitest'

import { createError, ErrorCode, err, ok, type Result } from '../state/errors'
import { INTENSITY_BY_GOAL, REFUSAL_SUMMARY } from '../state/generation-form'
import { QueryClient } from '../state/query'
import type { Location } from '../state/schemas'
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

function renderGenerate(locations: readonly Location[] = [fixtureLocation(), GYM]) {
  const generation = createFakeGenerationClient()
  const rendered = renderApp(
    ['/generate'],
    signedIn({ queryClient: warmCache(locations), generation }),
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
