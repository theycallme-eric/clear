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
  LIMITATIONS_INTRO,
  LIMITATIONS_NOTE_HELP,
  LIMITATIONS_NOTE_NEEDS_PATTERN,
  LIMITATIONS_NOTE_PLACEHOLDER,
  ONBOARDING_STEPS,
  onboardingReducer,
  SECTIONS_BY_GOAL,
  sectionTypeLabel,
  STEP_TITLES,
  toAnswers,
  type OnboardingAction,
} from '../state/onboarding'
import { constraintsQueryKey } from '../state/constraint-queries'
import { QueryClient } from '../state/query'
import type { Location, Profile } from '../state/schemas'
import { locationsQueryKey, profileQueryKey } from '../state/user-queries'
import { createFakeConstraintsClient } from '../test/constraints-double'
import { renderApp, signedIn } from '../test/render'
import {
  committedFor,
  createFakeUserDataClient,
  fixtureLocation,
  FIXTURE_USER_ID,
  notOnboardedProfile,
  onboardedProfile,
  type FakeUserDataOptions,
} from '../test/user-data-double'
import {
  COMMIT_FAILED_TITLE,
  COMMITTING_LABEL,
  ONBOARDING_TITLE,
  SECTION_PREVIEW_CAPTION,
  SECTION_PREVIEW_NOTE,
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

/** The goal-derived preview: a list named by its caption. */
function sectionPreview() {
  return screen.getByRole('list', { name: SECTION_PREVIEW_CAPTION })
}

/** The section names the preview shows, in order — the label line of each row. */
function previewedSections() {
  return within(sectionPreview())
    .getAllByRole('listitem')
    .map((item) => item.firstElementChild?.textContent ?? '')
}

/** The same answers, as the reducer receives them — so the expected payload is `toAnswers`'s. */
const ACTIONS: readonly OnboardingAction[] = [
  { type: 'tier', value: 'home' },
  { type: 'equipment', value: 'kettlebells' },
  { type: 'experience', value: 'some' },
  { type: 'goal', value: 'strength' },
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
    // The preview is still the goal's: stepping back changes nothing in it.
    expect(previewedSections()).toEqual(SECTIONS_BY_GOAL.strength.map(sectionTypeLabel))

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
      enabled_sections: ['warmup', 'primary_lift', 'accessory', 'core', 'cooldown'],
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

describe('REQ-004 goal-derived sections, previewed', () => {
  async function toGoals(user: UserEvent) {
    await onStep('location')
    await user.click(screen.getByRole('radio', { name: 'Home gym' }))
    await user.click(next())
    await onStep('experience')
    await user.click(screen.getByRole('radio', { name: 'Some experience' }))
    await user.click(next())
    await onStep('goals')
  }

  it('is information, not a control: nothing in it can be focused or toggled', async () => {
    const { user } = setup()
    await toGoals(user)

    // Before a goal there is nothing to preview.
    expect(screen.queryByRole('list', { name: SECTION_PREVIEW_CAPTION })).not.toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'Strength' }))

    const preview = sectionPreview()
    expect(stepCard()).toContainElement(preview)
    expect(preview.tagName).toBe('UL')
    // Not a group of controls, and no control anywhere inside it.
    expect(screen.queryByRole('group', { name: 'Sections' })).not.toBeInTheDocument()
    expect(within(stepCard()).queryAllByRole('checkbox')).toHaveLength(0)
    expect(
      preview.querySelectorAll('input, button, select, textarea, a[href], [tabindex], [role]'),
    ).toHaveLength(0)
    // And its rows carry no selection state to read as one.
    for (const item of within(preview).getAllByRole('listitem')) {
      expect(item).not.toHaveAttribute('aria-checked')
      expect(item).not.toHaveAttribute('aria-pressed')
      expect(item).not.toHaveAttribute('aria-selected')
    }

    // Tabbing from the goal goes nowhere inside the preview.
    const focused: Element[] = []
    for (let i = 0; i < 8; i += 1) {
      await user.tab()
      if (document.activeElement) focused.push(document.activeElement)
    }
    expect(focused.some((element) => preview.contains(element))).toBe(false)

    // Clicking a row changes nothing about what will be stored.
    await user.click(within(preview).getByText('Core'))
    expect(previewedSections()).toEqual(SECTIONS_BY_GOAL.strength.map(sectionTypeLabel))
  })

  it('lists the goal’s actual sections, follows a goal change, and says one may be left out', async () => {
    const { user, userData } = setup()
    await toGoals(user)

    await user.click(screen.getByRole('radio', { name: 'Strength' }))
    expect(previewedSections()).toEqual(SECTIONS_BY_GOAL.strength.map(sectionTypeLabel))
    expect(within(stepCard()).getByText(SECTION_PREVIEW_NOTE)).toBeInTheDocument()
    expect(SECTION_PREVIEW_NOTE).toMatch(/may leave one out/)

    await user.click(screen.getByRole('radio', { name: 'Conditioning' }))
    expect(previewedSections()).toEqual(SECTIONS_BY_GOAL.conditioning.map(sectionTypeLabel))
    expect(previewedSections()).not.toContain('Primary lift')

    await user.click(screen.getByRole('radio', { name: 'Balanced' }))
    expect(previewedSections()).toEqual(SECTIONS_BY_GOAL.balanced.map(sectionTypeLabel))

    // What the preview showed is exactly the pool committed.
    await user.click(next())
    await onStep('limitations')
    await user.click(next())
    await onStep('confirm')
    await user.click(screen.getByRole('button', { name: 'Finish setup' }))
    expect(await screen.findByRole('heading', { name: 'Today' })).toBeInTheDocument()
    expect(userData.onboardingCalls[0]?.enabled_sections).toEqual([...SECTIONS_BY_GOAL.balanced])
  })

  it('keeps equipment editable beside it', async () => {
    const { user } = setup()

    await onStep('location')
    await user.click(screen.getByRole('radio', { name: 'Home gym' }))
    const kettlebells = screen.getByRole('checkbox', { name: 'Kettlebells' })
    const barbell = screen.getByRole('checkbox', { name: 'Barbell' })
    expect(kettlebells).toBeChecked()
    expect(barbell).not.toBeChecked()
    await user.click(kettlebells)
    await user.click(barbell)
    expect(kettlebells).not.toBeChecked()
    expect(barbell).toBeChecked()
  })

  it('leaves Settings’ section toggles editable', async () => {
    const user = userEvent.setup()
    const userData = createFakeUserDataClient()
    const cache = new QueryClient()
    cache.setData(profileQueryKey(FIXTURE_USER_ID), onboardedProfile())
    cache.setData(locationsQueryKey(FIXTURE_USER_ID), [fixtureLocation()])
    cache.setData(constraintsQueryKey(FIXTURE_USER_ID), [])
    renderApp(
      ['/settings'],
      signedIn({
        queryClient: cache,
        userData,
        constraints: createFakeConstraintsClient({ stored: [] }),
      }),
    )

    const sections = await screen.findByRole('group', { name: 'Sections' })
    const core = within(sections).getByRole('checkbox', { name: 'Core' })
    expect(core).toBeEnabled()
    await user.click(core)

    await waitFor(() => {
      expect(userData.preferenceWrites[0]?.enabled_sections).toContain('core')
    })
  })
})

describe('U17 ongoing limitations', () => {
  async function toLimitations(user: UserEvent) {
    await onStep('location')
    await user.click(screen.getByRole('radio', { name: 'Home gym' }))
    await user.click(next())
    await onStep('experience')
    await user.click(screen.getByRole('radio', { name: 'Some experience' }))
    await user.click(next())
    await onStep('goals')
    await user.click(screen.getByRole('radio', { name: 'Strength' }))
    await user.click(next())
    return onStep('limitations')
  }

  it('asks about ongoing limitations, in wording that does not expire', async () => {
    const { user } = setup()

    const heading = await toLimitations(user)
    expect(heading).toHaveTextContent('Any ongoing limitations?')
    const card = within(stepCard())
    expect(card.getByText(LIMITATIONS_INTRO)).toBeVisible()
    expect(card.getByLabelText(/Note/)).toHaveAttribute('placeholder', LIMITATIONS_NOTE_PLACEHOLDER)
    expect(stepCard()).not.toHaveTextContent(/few weeks|for now|temporar/i)
  })

  it('says the note travels with a ticked movement, and is context once one is', async () => {
    const { user } = setup()

    await toLimitations(user)
    const note = screen.getByLabelText(/Note/)
    expect(note).toBeEnabled()
    expect(note).toHaveAccessibleDescription(LIMITATIONS_NOTE_NEEDS_PATTERN)

    await user.click(screen.getByRole('checkbox', { name: 'Squatting' }))
    expect(note).toHaveAccessibleDescription(LIMITATIONS_NOTE_HELP)

    await user.click(screen.getByRole('checkbox', { name: 'Squatting' }))
    expect(note).toHaveAccessibleDescription(LIMITATIONS_NOTE_NEEDS_PATTERN)
  })

  it('commits ticks as hard exclusions and infers none from the prose', async () => {
    const { user, userData } = setup()

    await toLimitations(user)
    // The prose names movements that are not ticked; it stays prose.
    await user.click(screen.getByRole('checkbox', { name: 'Squatting' }))
    await user.type(screen.getByLabelText(/Note/), 'No pulling or pressing, ever.')
    await user.click(next())
    await onStep('confirm')
    await user.click(screen.getByRole('button', { name: 'Finish setup' }))

    await waitFor(() => {
      expect(userData.onboardingCalls).toHaveLength(1)
    })
    expect(userData.onboardingCalls[0]).toMatchObject({
      avoid_patterns: ['squat'],
      note: 'No pulling or pressing, ever.',
    })
  })
})

/**
 * U09 — the browser proof (e2e/settings-locations.spec.ts) owns the box tap,
 * which needs real hit testing. Here: both checklists sit in the group that
 * lays each input over its row, and label and Space each toggle exactly once,
 * in both directions, with additions and removals reaching the commit.
 */
describe('U09 checkbox activation', () => {
  it('label and Space each toggle an equipment and a limitation choice once', async () => {
    const { user, userData } = setup()

    await onStep('location')
    await user.click(screen.getByRole('radio', { name: 'Home gym' }))
    const equipment = screen.getByRole('group', { name: 'Equipment' })
    expect(equipment).toHaveClass('clr-checkbox-group')
    const barbell = within(equipment).getByRole('checkbox', { name: 'Barbell' })
    const dumbbells = within(equipment).getByRole('checkbox', { name: 'Dumbbells' })
    expect(barbell).not.toBeChecked()
    expect(dumbbells).toBeChecked()
    await user.click(within(equipment).getByText('Barbell'))
    expect(barbell).toBeChecked()
    await user.click(within(equipment).getByText('Barbell'))
    expect(barbell).not.toBeChecked()
    barbell.focus()
    await user.keyboard(' ')
    expect(barbell).toBeChecked()
    dumbbells.focus()
    await user.keyboard(' ')
    expect(dumbbells).not.toBeChecked()

    await user.click(next())
    await onStep('experience')
    await user.click(screen.getByRole('radio', { name: 'Some experience' }))
    await user.click(next())
    await onStep('goals')
    await user.click(screen.getByRole('radio', { name: 'Balanced' }))
    await user.click(next())
    await onStep('limitations')
    const limitations = screen.getByRole('group', { name: 'Work around' })
    expect(limitations).toHaveClass('clr-checkbox-group')
    const pulling = within(limitations).getByRole('checkbox', { name: 'Pulling' })
    await user.click(within(limitations).getByText('Pulling'))
    expect(pulling).toBeChecked()
    pulling.focus()
    await user.keyboard(' ')
    expect(pulling).not.toBeChecked()
    await user.keyboard(' ')
    expect(pulling).toBeChecked()

    await user.click(next())
    await onStep('confirm')
    await user.click(screen.getByRole('button', { name: 'Finish setup' }))
    await waitFor(() => {
      expect(userData.onboardingCalls).toHaveLength(1)
    })
    const committed = userData.onboardingCalls[0]
    expect(committed?.equipment).toContain('barbell')
    expect(committed?.equipment).not.toContain('dumbbells')
    expect(committed?.avoid_patterns).toEqual(['pull'])
  })
})
