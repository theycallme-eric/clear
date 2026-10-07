/**
 * ONB-01 acceptance — the wizard, rendered through the real route tree.
 *
 * The reducer and `toAnswers` have their own tests (`onboarding.test.ts`); what
 * is asserted here is what only a render can show: that the five steps are
 * reachable in order, that stepping back restores what was entered, that the
 * payload committed is `toAnswers(draft)` and nothing assembled beside it, and
 * that committing, commit-failed and the step view are each a real screen.
 */
import { screen, waitFor, within } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { notViableError, type ViabilityFailure } from '../data/viability'
import { createError, ErrorCode, err, ok } from '../state/errors'
import {
  EMPTY_DRAFT,
  ONBOARDING_STEPS,
  onboardingReducer,
  STEP_TITLES,
  toAnswers,
  type OnboardingAction,
} from '../state/onboarding'
import { QueryClient } from '../state/query'
import type { Location, Profile } from '../state/schemas'
import { locationsQueryKey, profileQueryKey } from '../state/user-queries'
import { renderApp, signedIn } from '../test/render'
import {
  committedFor,
  createFakeUserDataClient,
  FIXTURE_USER_ID,
  notOnboardedProfile,
  type FakeUserDataOptions,
} from '../test/user-data-double'
import {
  COMMIT_FAILED_TITLE,
  COMMITTING_LABEL,
  ONBOARDING_TITLE,
} from './Onboarding'

function setup(options: FakeUserDataOptions = {}) {
  const userData = createFakeUserDataClient({
    profile: async () => ok(notOnboardedProfile()),
    locations: async () => ok([]),
    ...options,
  })
  const queryClient = new QueryClient()
  const user = userEvent.setup()
  renderApp(['/onboarding'], signedIn({ userData, queryClient }))
  return { user, userData, queryClient }
}

/** The one card a step is: its heading, its controls and its validation line. */
function stepCard() {
  const cards = screen.getByRole('main').querySelectorAll<HTMLElement>('.clr-card')
  expect(cards).toHaveLength(1)
  return cards[0]!
}

function pinnedFooter() {
  const footer = screen.getByRole('main').querySelector<HTMLElement>('.clr-footer')
  expect(footer).not.toBeNull()
  return footer!
}

/**
 * Arriving on a step is also where its containment is checked, so every real
 * step is: the heading is inside the step's single card, and the action that
 * leaves the step is in the pinned footer rather than inside that card.
 */
async function onStep(step: (typeof ONBOARDING_STEPS)[number]) {
  const heading = await screen.findByRole('heading', { level: 2, name: STEP_TITLES[step] })
  const card = stepCard()
  expect(card).toContainElement(heading)
  expect(
    within(card).queryByRole('button', { name: /^(Next|Skip|Back|Finish setup|Try again)$/ }),
  ).toBeNull()
  expect(
    within(pinnedFooter()).getByRole('button', { name: /^(Next|Skip|Finish setup|Try again)$/ }),
  ).toBeInTheDocument()
  return heading
}

function next() {
  return screen.getByRole('button', { name: /^(Next|Skip)$/ })
}

/** The same answers, as the reducer receives them — so the expected payload is `toAnswers`'s. */
const ACTIONS: readonly OnboardingAction[] = [
  { type: 'tier', value: 'home' },
  { type: 'equipment', value: 'kettlebells' },
  { type: 'experience', value: 'some' },
  { type: 'goal', value: 'strength' },
  { type: 'section', value: 'core' },
  { type: 'pattern', value: 'pull' },
  { type: 'note', value: 'Left shoulder' },
]

const REFUSAL_MESSAGE = 'Pulling leaves Accessory with nothing to generate. Change one of them.'
const NO_ACCESSORY: ViabilityFailure = {
  section: 'accessory',
  failureClass: 'athlete_exclusion',
  incompatibleChoice: {
    kind: 'exclusion',
    exclusions: [{ scope: 'movement_pattern', target: 'pull' }],
  },
  goals: ['strength'],
  focuses: [],
  blocksProposedGoal: true,
}

async function answerEverything(user: UserEvent) {
  await onStep('location')
  await user.click(screen.getByRole('radio', { name: 'Home gym' }))
  await user.click(screen.getByRole('checkbox', { name: 'Kettlebells' }))
  await user.click(next())

  await onStep('experience')
  await user.click(screen.getByRole('radio', { name: 'Some experience' }))
  await user.click(next())

  await onStep('goals')
  await user.click(screen.getByRole('radio', { name: 'Strength' }))
  await user.click(screen.getByRole('checkbox', { name: 'Core' }))
  await user.click(next())

  await onStep('limitations')
  await user.click(screen.getByRole('checkbox', { name: 'Pulling' }))
  await user.type(screen.getByLabelText(/Note/), 'Left shoulder')
  await user.click(next())

  await onStep('confirm')
}

describe('ONB-01 onboarding wizard', () => {
  it('renders inside Screen: one h1, the screen title, and the first step', async () => {
    setup()

    const step = await onStep('location')
    expect(screen.getByRole('heading', { level: 1, name: ONBOARDING_TITLE })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getAllByRole('main')).toHaveLength(1)
    expect(screen.getByRole('main')).toContainElement(step)
    await waitFor(() => {
      expect(document.title).toBe(`${ONBOARDING_TITLE} · CLEAR`)
    })
  })

  it('walks the five declared steps in order, and says why Next is held', async () => {
    const { user } = setup()

    await onStep('location')
    expect(next()).toBeDisabled()
    const blocked = screen.getByText('Choose the setup closest to yours.')
    expect(stepCard()).toContainElement(blocked)
    // The held action stays reachable in the footer, and a hint is not an alarm.
    expect(pinnedFooter()).toContainElement(next())
    expect(stepCard().querySelector('.clr-chamfer--urgency')).toBeNull()

    await answerEverything(user)

    // Every step was a heading exactly once, in ONBOARDING_STEPS order — the
    // helper awaited each; the last one is the confirm summary.
    expect(ONBOARDING_STEPS).toEqual(['location', 'experience', 'goals', 'limitations', 'confirm'])
    expect(screen.getByText('Step 5 of 5')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Finish setup' })).toBeEnabled()
    // The confirmation is the card's content: one list, no frame of its own.
    const lists = stepCard().querySelectorAll('.clr-list')
    expect(lists).toHaveLength(1)
    expect(lists[0]).not.toHaveClass('clr-chamfer')
  })

  it('keeps a selected group and its dependent group in the same card', async () => {
    const { user } = setup()

    await onStep('location')
    expect(screen.queryByRole('group', { name: 'Equipment' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'Home gym' }))

    const card = stepCard()
    expect(card).toContainElement(screen.getByRole('radio', { name: 'Home gym' }))
    expect(screen.getByRole('radio', { name: 'Home gym' })).toHaveAttribute('aria-checked', 'true')
    expect(card).toContainElement(screen.getByRole('group', { name: 'Equipment' }))
    expect(screen.queryByText('Choose the setup closest to yours.')).not.toBeInTheDocument()
    expect(within(pinnedFooter()).getByRole('button', { name: 'Next' })).toBeEnabled()
  })

  it('keeps every entered value when stepping back', async () => {
    const { user } = setup()

    await answerEverything(user)

    await user.click(screen.getByRole('button', { name: 'Back' }))
    await onStep('limitations')
    expect(screen.getByRole('checkbox', { name: 'Pulling' })).toBeChecked()
    expect(screen.getByLabelText(/Note/)).toHaveValue('Left shoulder')
    expect(
      screen.queryByText('Kept with the movements ticked above. Editable later in Settings.'),
    ).not.toBeInTheDocument()
    const limitations = screen.getByRole('group', { name: 'Work around' })
    expect(limitations.style.border).toBe('0px')
    expect(limitations.style.margin).toBe('0px')
    expect(limitations.style.padding).toBe('0px')

    await user.click(screen.getByRole('button', { name: 'Back' }))
    await onStep('goals')
    expect(screen.getByRole('radio', { name: 'Strength' })).toHaveAttribute('aria-checked', 'true')
    // Core is in the Strength preset and was unticked; the edit survived.
    expect(screen.getByRole('checkbox', { name: 'Core' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Accessory' })).toBeChecked()

    await user.click(screen.getByRole('button', { name: 'Back' }))
    await onStep('experience')
    expect(screen.getByRole('radio', { name: 'Some experience' })).toHaveAttribute(
      'aria-checked',
      'true',
    )

    await user.click(screen.getByRole('button', { name: 'Back' }))
    await onStep('location')
    expect(screen.getByRole('radio', { name: 'Home gym' })).toHaveAttribute('aria-checked', 'true')
    // The equipment edit survived returning to the preset that made it.
    expect(screen.getByRole('checkbox', { name: 'Kettlebells' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Dumbbells' })).toBeChecked()
  })

  it('commits toAnswers(draft) once through completeOnboarding and lands on Home', async () => {
    const { user, userData, queryClient } = setup()

    await answerEverything(user)
    await user.click(screen.getByRole('button', { name: 'Finish setup' }))

    expect(await screen.findByRole('heading', { name: 'Today' })).toBeInTheDocument()

    const draft = ACTIONS.reduce(onboardingReducer, EMPTY_DRAFT)
    const expected = toAnswers(draft)
    expect(expected).not.toBeNull()
    expect(userData.onboardingCalls).toEqual([expected])

    // What lands in `profiles` + `locations` is what the next screens read:
    // Generate's defaults come from these two cache entries.
    const committed = committedFor(expected!)
    const profile = queryClient.getState<Profile | null>(profileQueryKey(FIXTURE_USER_ID))
    const locations = queryClient.getState<Location[]>(locationsQueryKey(FIXTURE_USER_ID))
    expect(profile).toEqual({ status: 'ready', data: committed.profile })
    expect(locations).toEqual({ status: 'ready', data: [committed.location] })
    expect(expected).toMatchObject({
      location_name: 'Home gym',
      location_tier: 'home',
      equipment: ['bodyweight', 'resistance_bands', 'foam_roller', 'dumbbells', 'pullup_bar'],
      experience_level: 'some',
      goal_preset: 'strength',
      enabled_sections: ['warmup', 'primary_lift', 'accessory', 'cooldown'],
      avoid_patterns: ['pull'],
      note: 'Left shoulder',
    })
  })

  it('renders a committing state while the transaction runs', async () => {
    const { user } = setup({ completeOnboarding: () => new Promise(() => {}) })

    await answerEverything(user)
    await user.click(screen.getByRole('button', { name: 'Finish setup' }))

    const waiting = await within(screen.getByRole('main')).findByRole('status')
    expect(waiting).toHaveTextContent(COMMITTING_LABEL)
    expect(screen.getByRole('heading', { level: 1, name: ONBOARDING_TITLE })).toBeInTheDocument()
  })

  it('keeps the draft on a failed commit, stores nothing, and retries the same payload', async () => {
    let attempt = 0
    const { user, userData, queryClient } = setup({
      completeOnboarding: async (answers) => {
        attempt += 1
        return attempt === 1
          ? err(createError(ErrorCode.NETWORK_SERVER_ERROR, { details: { status: 500 } }))
          : ok(committedFor(answers))
      },
    })

    await answerEverything(user)
    await user.click(screen.getByRole('button', { name: 'Finish setup' }))

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText(COMMIT_FAILED_TITLE)).toBeInTheDocument()
    // The failure is the confirm card's content, not a second frame beside it.
    await onStep('confirm')
    expect(stepCard()).toContainElement(alert)
    expect(stepCard().querySelector('.clr-chamfer--urgency')).not.toBeNull()
    // Still on confirm, with the answers on screen.
    expect(screen.getByRole('heading', { level: 2, name: STEP_TITLES.confirm })).toBeInTheDocument()
    expect(screen.getByText('Home gym')).toBeInTheDocument()
    expect(screen.getByText('Strength')).toBeInTheDocument()
    // No partial profile: the cache still says not onboarded.
    expect(
      queryClient.getState<Profile | null>(profileQueryKey(FIXTURE_USER_ID)),
    ).toEqual({ status: 'ready', data: notOnboardedProfile() })
    expect(queryClient.getState<Location[]>(locationsQueryKey(FIXTURE_USER_ID))).toEqual({
      status: 'ready',
      data: [],
    })

    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('heading', { name: 'Today' })).toBeInTheDocument()
    expect(userData.onboardingCalls).toHaveLength(2)
    expect(userData.onboardingCalls[1]).toEqual(userData.onboardingCalls[0])
  })

  it('shows a refused setup in the confirm card, stores nothing, and clears it on an edit', async () => {
    const { user, userData, queryClient } = setup({
      completeOnboarding: async (answers) =>
        answers.avoid_patterns.includes('pull')
          ? err(notViableError([NO_ACCESSORY], REFUSAL_MESSAGE))
          : ok(committedFor(answers)),
    })

    await answerEverything(user)
    await user.click(screen.getByRole('button', { name: 'Finish setup' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(REFUSAL_MESSAGE)
    await onStep('confirm')
    expect(stepCard()).toContainElement(alert)
    // A refusal is not the generic failure, and is not retried as one.
    expect(screen.queryByText(COMMIT_FAILED_TITLE)).not.toBeInTheDocument()
    expect(within(pinnedFooter()).getByRole('button', { name: 'Finish setup' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
    expect(
      queryClient.getState<Profile | null>(profileQueryKey(FIXTURE_USER_ID)),
    ).toEqual({ status: 'ready', data: notOnboardedProfile() })
    expect(queryClient.getState<Location[]>(locationsQueryKey(FIXTURE_USER_ID))).toEqual({
      status: 'ready',
      data: [],
    })

    // Back keeps the other answers; changing the refused one drops the line.
    await user.click(screen.getByRole('button', { name: 'Back' }))
    await onStep('limitations')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByLabelText(/Note/)).toHaveValue('Left shoulder')
    await user.click(screen.getByRole('checkbox', { name: 'Pulling' }))
    await user.click(next())

    await onStep('confirm')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(stepCard().querySelector('.clr-chamfer--urgency')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Finish setup' }))

    expect(await screen.findByRole('heading', { name: 'Today' })).toBeInTheDocument()
    expect(userData.onboardingCalls).toHaveLength(2)
    expect(userData.onboardingCalls[0]?.avoid_patterns).toEqual(['pull'])
    expect(userData.onboardingCalls[1]?.avoid_patterns).toEqual([])
  })
})
