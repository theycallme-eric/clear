/**
 * SET-01's acceptance, on the real route tree.
 *
 * The four criteria, in order: every preference persists and is what the next
 * generation reads; section toggles respect the goal's constraints; sign out
 * empties the cache and lands on Welcome; and every choice onboarding collected
 * — except the locations and equipment SET-02 owns — is editable here without
 * the wizard being re-entered.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'

import type { UserConstraint } from '../data/constraints'
import { SKINS } from '../design-system/skin'
import { appearanceLabel, appearanceOptions, DEFAULT_SKIN } from '../state/appearance'
import { startFaviconSync } from './favicon'
import { FORMAT_PREVIEW_TITLE } from './FormatPreview'
import { QueryClient } from '../state/query'
import {
  GOALS,
  EXPERIENCE_LEVELS,
  LIMITATIONS_INTRO,
  LIMITATIONS_NOTE_HELP,
  LIMITATIONS_NOTE_NEEDS_PATTERN,
  LIMITATIONS_NOTE_PLACEHOLDER,
  MOVEMENT_PATTERNS,
  SECTIONS,
} from '../state/onboarding'
import { constraintsQueryKey } from '../state/constraint-queries'
import { createError, ErrorCode, err, ok, type Result } from '../state/errors'
import {
  cameFromSettings,
  FROM_SETTINGS_STATE,
  hasInAppHistory,
  LAST_SECTION_REASON,
  SETTINGS_BACK_LABEL,
  LEGACY_GOAL_REASON,
  LOCKED_SECTIONS_REASON,
  MISSING_GOAL_REASON,
} from '../state/settings'
import { createFakeAuthClient, signedInEvent } from '../test/auth-double'
import {
  constraintWriteError,
  createFakeConstraintsClient,
  type FakeConstraintsClient,
} from '../test/constraints-double'
import { renderApp, signedIn, type ProviderOptions } from '../test/render'
import {
  createFakeUserDataClient,
  fixtureLocation,
  FIXTURE_USER_ID,
  onboardedProfile,
  type FakeUserDataClient,
} from '../test/user-data-double'
import { locationsQueryKey, profileQueryKey } from '../state/user-queries'
import type { Profile } from '../state/schemas'

function warmCache(profile: Profile, constraints: readonly UserConstraint[] = []) {
  const cache = new QueryClient()
  cache.setData(profileQueryKey(FIXTURE_USER_ID), profile)
  cache.setData(locationsQueryKey(FIXTURE_USER_ID), [fixtureLocation()])
  cache.setData(constraintsQueryKey(FIXTURE_USER_ID), constraints)
  return cache
}

interface HubOptions {
  readonly profile?: Profile
  readonly constraints?: readonly UserConstraint[]
  readonly userData?: FakeUserDataClient
  readonly providers?: ProviderOptions
}

function renderSettings({
  profile = onboardedProfile(),
  constraints = [],
  userData = createFakeUserDataClient(),
  providers = {},
}: HubOptions = {}) {
  const cache = warmCache(profile, constraints)
  const constraintsClient = createFakeConstraintsClient({ stored: [...constraints] })

  const rendered = renderApp(
    ['/settings'],
    signedIn({
      queryClient: cache,
      userData,
      constraints: constraintsClient,
      ...providers,
    }),
  )

  return { ...rendered, cache, userData, constraintsClient }
}

/**
 * A reload: a cold constraints cache over the same stored rows, so what shows
 * is what the next visit reads rather than what this one remembered.
 */
function reloadSettings(constraintsClient: FakeConstraintsClient) {
  const cache = new QueryClient()
  cache.setData(profileQueryKey(FIXTURE_USER_ID), onboardedProfile())
  cache.setData(locationsQueryKey(FIXTURE_USER_ID), [fixtureLocation()])
  return renderApp(
    ['/settings'],
    signedIn({ queryClient: cache, constraints: constraintsClient }),
  )
}

function patternConstraint(overrides: Partial<UserConstraint> = {}): UserConstraint {
  return {
    id: 'constraint-1',
    userId: FIXTURE_USER_ID,
    action: 'exclude',
    target: { scope: 'movement_pattern', pattern: 'press' },
    appliesTo: { persistence: 'persistent' },
    note: null,
    createdAt: '2026-09-22T09:00:00.000Z',
    ...overrides,
  }
}

describe('the hub answers every question onboarding asked', () => {
  it('offers the goal, experience, section and pattern vocabularies, not a second list', async () => {
    renderSettings()

    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeVisible()

    for (const goal of GOALS) {
      expect(screen.getByRole('radio', { name: goal.label })).toBeVisible()
    }
    for (const level of EXPERIENCE_LEVELS) {
      expect(screen.getByRole('radio', { name: level.label })).toBeVisible()
    }
    for (const section of SECTIONS) {
      expect(screen.getByRole('checkbox', { name: section.label })).toBeVisible()
    }
    for (const pattern of MOVEMENT_PATTERNS) {
      expect(screen.getByRole('checkbox', { name: pattern.label })).toBeVisible()
    }
    expect(screen.getByLabelText(/note/i)).toBeVisible()
  })

  it('shows what is stored rather than an empty form', async () => {
    renderSettings({
      profile: onboardedProfile({
        goal_preset: 'strength',
        experience_level: 'confident',
        enabled_sections: ['warmup', 'core'],
      }),
      constraints: [patternConstraint({ note: 'Left shoulder' })],
    })

    expect(await screen.findByRole('radio', { name: 'Strength' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Confident' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Warm-up' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Accessory' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Pressing' })).toBeChecked()
    expect(screen.getByLabelText(/note/i)).toHaveValue('Left shoulder')
  })

  it('says where locations and equipment are edited instead of pretending to', async () => {
    renderSettings()

    // U08: the heading is the statement and the action is the way there; no
    // paragraph restates either.
    const card = await sectionCard('Places and equipment')
    expect(within(card).getByRole('button', { name: 'Manage places' })).toBeVisible()
    expect(card.querySelectorAll('p')).toHaveLength(0)
  })
})

/** The card a section is: found by the heading it holds, never by position. */
async function sectionCard(name: string) {
  const heading = await screen.findByRole('heading', { level: 2, name })
  const card = heading.closest<HTMLElement>('.clr-card')
  expect(card, `"${name}" is not headed inside a card`).not.toBeNull()
  // The section is the landmark, named by that same heading.
  expect(screen.getByRole('region', { name })).toContainElement(card)
  return card!
}

describe('each section is one card with its heading inside', () => {
  const SECTION_HEADINGS = [
    'Training',
    'Limitations',
    'Appearance',
    'Places and equipment',
    'Workout formats',
    'Session',
  ]

  it('is six headed cards, with only the title on the atmosphere', async () => {
    renderSettings()

    const cards: HTMLElement[] = []
    for (const name of SECTION_HEADINGS) cards.push(await sectionCard(name))

    const main = screen.getByRole('main')
    expect([...main.querySelectorAll('.clr-card')]).toEqual(cards)
    expect(
      screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent),
    ).toEqual(SECTION_HEADINGS)
    // A card holds content and element frames, never another card or a list frame.
    for (const card of cards) {
      expect(card.querySelector('.clr-card')).toBeNull()
      expect(card.querySelector('.clr-list')).toBeNull()
    }
    const title = screen.getByRole('heading', { level: 1, name: 'Settings' })
    expect(title.closest('.clr-card')).toBeNull()
    // Every change saves itself, so nothing is pinned while the screen is usable.
    expect(main.querySelector('.clr-footer')).toBeNull()
  })

  it('keeps each group, its refusal and its save line in the card that owns it', async () => {
    const user = userEvent.setup()
    renderSettings({
      profile: onboardedProfile({ goal_preset: 'strength', enabled_sections: ['core'] }),
    })

    const training = within(await sectionCard('Training'))
    expect(training.getByRole('group', { name: 'Goal' })).toBeVisible()
    expect(training.getByRole('group', { name: 'Experience' })).toBeVisible()
    expect(training.getByRole('group', { name: 'Sections' })).toBeVisible()
    expect(training.getByRole('status')).toBeInTheDocument()

    await user.click(training.getByRole('checkbox', { name: 'Core' }))
    expect(training.getByRole('alert')).toHaveTextContent(LAST_SECTION_REASON)

    const limitations = within(await sectionCard('Limitations'))
    expect(limitations.getByRole('group', { name: 'Work around' })).toBeVisible()
    expect(limitations.getByLabelText(/note/i)).toBeVisible()
    expect(limitations.getByRole('status')).toBeInTheDocument()
    expect(
      limitations.getByText('Nothing recorded. Tick anything a workout should work around.'),
    ).toBeVisible()

    const appearance = within(await sectionCard('Appearance'))
    expect(
      within(appearance.getByRole('group', { name: 'Skin' })).getAllByRole('radio'),
    ).toHaveLength(SKINS.length)
  })

  it('says a save happened in the card that made it, and nowhere else', async () => {
    const user = userEvent.setup()
    renderSettings()

    const training = within(await sectionCard('Training'))
    await user.click(training.getByRole('radio', { name: 'Confident' }))

    await waitFor(() => {
      expect(training.getByRole('status')).toHaveTextContent('Saved')
    })
    expect(within(await sectionCard('Limitations')).getByRole('status')).not.toHaveTextContent(
      'Saved',
    )
  })

  it('offers the way to places as a quiet action, and sign out as a framed one', async () => {
    const user = userEvent.setup()
    renderSettings()

    const places = within(await sectionCard('Places and equipment'))
    const manage = places.getByRole('button', { name: 'Manage places' })
    expect(manage).toHaveClass('clr-text-action')
    expect(places.getAllByRole('button')).toEqual([manage])

    const session = within(await sectionCard('Session'))
    const signOut = session.getByRole('button', { name: 'Sign out' })
    expect(signOut).not.toHaveClass('clr-text-action')
    expect(session.getAllByRole('button')).toEqual([signOut])

    await user.click(manage)
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Places and equipment' }),
    ).toBeVisible()
  })

  it('links to the read-only format preview, and to nothing else (E06)', async () => {
    const user = userEvent.setup()
    renderSettings()

    const formats = within(await sectionCard('Workout formats'))
    const preview = formats.getByRole('button', { name: 'Preview formats' })
    expect(preview).toHaveClass('clr-text-action')
    expect(formats.getAllByRole('button')).toEqual([preview])
    // The preview, not the developer gallery.
    expect(screen.queryByRole('link', { name: /gallery/i })).toBeNull()
    expect(document.querySelector('a[href^="/dev/"]')).toBeNull()

    await user.click(preview)
    expect(
      await screen.findByRole('heading', { level: 1, name: FORMAT_PREVIEW_TITLE }),
    ).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Settings' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()
  })

  it('holds the limitations loading and error states inside the same card', async () => {
    const user = userEvent.setup()
    let attempts = 0
    let settle: () => void = () => {}
    const constraints = createFakeConstraintsClient({
      listInForce: () => {
        attempts += 1
        if (attempts > 1) return Promise.resolve(ok([]))
        return new Promise<Result<UserConstraint[]>>((resolve) => {
          settle = () => {
            resolve(err(createError(ErrorCode.PERSISTENCE_READ_FAILED)))
          }
        })
      },
    })
    const cache = new QueryClient()
    cache.setData(profileQueryKey(FIXTURE_USER_ID), onboardedProfile())
    cache.setData(locationsQueryKey(FIXTURE_USER_ID), [fixtureLocation()])

    renderApp(['/settings'], signedIn({ queryClient: cache, constraints }))

    const card = await sectionCard('Limitations')
    const busy = await within(card).findByText(/reading your limitations/i)
    expect(busy.closest('[aria-busy="true"]')).not.toBeNull()
    expect(card.querySelector('.clr-card')).toBeNull()

    settle()
    const alert = await within(card).findByRole('alert')
    expect(alert).toHaveTextContent(/limitations didn’t load/i)
    expect(card.querySelector('.clr-card')).toBeNull()
    // The other cards are still the screen; the failure cost one of six.
    expect(screen.getByRole('main').querySelectorAll('.clr-card')).toHaveLength(6)

    await user.click(within(card).getByRole('button', { name: /retry|try again/i }))
    expect(await within(card).findByRole('group', { name: 'Work around' })).toBeVisible()
  })
})

describe('a preference persists and is what the next generation reads', () => {
  it('writes the goal and the sections it presets', async () => {
    const user = userEvent.setup()
    const { userData, cache } = renderSettings()

    await user.click(await screen.findByRole('radio', { name: 'Conditioning' }))

    await waitFor(() => {
      expect(userData.preferenceWrites).toHaveLength(1)
    })
    expect(userData.preferenceWrites[0]).toEqual({
      experience_level: 'some',
      goal_preset: 'conditioning',
      enabled_sections: ['warmup', 'conditioning', 'core', 'cooldown'],
    })

    // The cache is the row the rest of the app reads — `generation_candidates`
    // composes from exactly these two columns.
    await waitFor(() => {
      const state = cache.getState<Profile>(profileQueryKey(FIXTURE_USER_ID))
      expect(state.status === 'ready' && state.data.goal_preset).toBe('conditioning')
    })
    expect(await screen.findByText('Saved')).toBeVisible()
  })

  it('writes the experience level on its own', async () => {
    const user = userEvent.setup()
    const { userData } = renderSettings()

    await user.click(await screen.findByRole('radio', { name: 'New to this' }))

    await waitFor(() => {
      expect(userData.preferenceWrites).toEqual([
        {
          experience_level: 'new',
          goal_preset: 'balanced',
          enabled_sections: ['warmup', 'primary_lift', 'cooldown'],
        },
      ])
    })
  })

  it('writes a section toggle', async () => {
    const user = userEvent.setup()
    const { userData } = renderSettings()

    await user.click(await screen.findByRole('checkbox', { name: 'Core' }))

    await waitFor(() => {
      expect(userData.preferenceWrites[0]?.enabled_sections).toEqual([
        'warmup',
        'primary_lift',
        'core',
        'cooldown',
      ])
    })
  })

  it('rolls the optimistic change back when the write fails', async () => {
    const user = userEvent.setup()
    const userData = createFakeUserDataClient({
      updatePreferences: () =>
        Promise.resolve(err(createError(ErrorCode.PERSISTENCE_WRITE_FAILED))),
    })
    const { cache } = renderSettings({ userData })

    await user.click(await screen.findByRole('radio', { name: 'Strength' }))

    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'Balanced' })).toBeChecked()
    })
    const state = cache.getState<Profile>(profileQueryKey(FIXTURE_USER_ID))
    expect(state.status === 'ready' && state.data.goal_preset).toBe('balanced')
    // The screen still stands, so the failure interrupts rather than replaces
    // it: a toast on the root host, not an ErrorView over a working card.
    expect(await screen.findByText('Could not save. Try again.')).toBeVisible()
    expect(screen.getByRole('radio', { name: 'Strength' })).toBeVisible()
  })
})

describe('a limitation persists', () => {
  it('adds a persistent pattern exclusion with the note written beside it', async () => {
    const user = userEvent.setup()
    const { constraintsClient } = renderSettings()

    await user.click(await screen.findByRole('checkbox', { name: /Squatting/ }))

    await waitFor(() => {
      expect(constraintsClient.rows()).toHaveLength(1)
    })
    const [stored] = constraintsClient.rows()
    expect(stored).toMatchObject({
      action: 'exclude',
      target: { scope: 'movement_pattern', pattern: 'squat' },
      appliesTo: { persistence: 'persistent' },
    })
  })

  it('removes the exclusion when the pattern is unticked', async () => {
    const user = userEvent.setup()
    const { constraintsClient } = renderSettings({
      constraints: [patternConstraint()],
    })

    await user.click(await screen.findByRole('checkbox', { name: /Pressing/ }))

    await waitFor(() => {
      expect(constraintsClient.rows()).toEqual([])
    })
  })

  it('rewrites the note across the set when the field is left', async () => {
    const user = userEvent.setup()
    const { constraintsClient } = renderSettings({
      constraints: [patternConstraint()],
    })

    const note = await screen.findByLabelText(/note/i)
    await user.click(note)
    await user.type(note, 'Right knee')
    await user.tab()

    await waitFor(() => {
      expect(constraintsClient.rows()[0]?.note).toBe('Right knee')
    })
  })

  it('uses durable ongoing-limitation wording, and calls the note context only', async () => {
    renderSettings({ constraints: [patternConstraint()] })

    const card = within(await sectionCard('Limitations'))
    expect(card.getByText(LIMITATIONS_INTRO)).toBeVisible()
    const note = card.getByLabelText(/note/i)
    expect(note).toHaveAttribute('placeholder', LIMITATIONS_NOTE_PLACEHOLDER)
    expect(note).toHaveAccessibleDescription(LIMITATIONS_NOTE_HELP)
    // U17: nothing in the card frames a limitation as temporary.
    expect(card.getByRole('group', { name: 'Work around' }).closest('.clr-stack')).not.toHaveTextContent(
      /few weeks|for now|temporar/i,
    )
  })

  it('keeps an edit across a reload: the ticks and the note come back as saved', async () => {
    const user = userEvent.setup()
    const { constraintsClient, unmount } = renderSettings()

    await user.click(await screen.findByRole('checkbox', { name: /Squatting/ }))
    await waitFor(() => {
      expect(constraintsClient.rows()).toHaveLength(1)
    })
    const note = screen.getByLabelText(/note/i)
    await user.type(note, 'Left knee, long term')
    await user.tab()
    await waitFor(() => {
      expect(constraintsClient.rows()[0]?.note).toBe('Left knee, long term')
    })

    unmount()
    reloadSettings(constraintsClient)

    expect(await screen.findByRole('checkbox', { name: /Squatting/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /Pressing/ })).not.toBeChecked()
    expect(screen.getByLabelText(/note/i)).toHaveValue('Left knee, long term')
  })

  it('keeps a clear across a reload: an emptied note and unticked patterns stay cleared', async () => {
    const user = userEvent.setup()
    const { constraintsClient, unmount } = renderSettings({
      constraints: [
        patternConstraint({ note: 'Right shoulder' }),
        patternConstraint({
          id: 'constraint-2',
          target: { scope: 'movement_pattern', pattern: 'pull' },
          note: 'Right shoulder',
        }),
      ],
    })

    const note = await screen.findByLabelText(/note/i)
    expect(note).toHaveValue('Right shoulder')
    await user.clear(note)
    await user.tab()
    await waitFor(() => {
      expect(constraintsClient.rows().map((row) => row.note)).toEqual([null, null])
    })

    unmount()
    const reloaded = reloadSettings(constraintsClient)
    expect(await screen.findByRole('checkbox', { name: /Pressing/ })).toBeChecked()
    expect(screen.getByLabelText(/note/i)).toHaveValue('')

    await user.click(screen.getByRole('checkbox', { name: /Pressing/ }))
    await waitFor(() => {
      expect(constraintsClient.rows()).toHaveLength(1)
    })
    await user.click(screen.getByRole('checkbox', { name: /Pulling/ }))
    await waitFor(() => {
      expect(constraintsClient.rows()).toEqual([])
    })

    reloaded.unmount()
    reloadSettings(constraintsClient)
    expect(await screen.findByText(/nothing recorded/i)).toBeVisible()
    const boxes = within(screen.getByRole('group', { name: 'Work around' })).getAllByRole('checkbox')
    expect(boxes).toHaveLength(MOVEMENT_PATTERNS.length)
    for (const box of boxes) expect(box).not.toBeChecked()
  })

  it('clears the note with the last pattern, since the note is stored on those rows', async () => {
    const user = userEvent.setup()
    const { constraintsClient } = renderSettings({
      constraints: [patternConstraint({ note: 'Right shoulder' })],
    })

    await user.click(await screen.findByRole('checkbox', { name: /Pressing/ }))

    await waitFor(() => {
      expect(constraintsClient.rows()).toEqual([])
    })
    expect(screen.getByLabelText(/note/i)).toHaveValue('')
    expect(screen.getByLabelText(/note/i)).toHaveAccessibleDescription(
      LIMITATIONS_NOTE_NEEDS_PATTERN,
    )
  })

  it('does not claim a note saved with nothing ticked, and writes it with the first tick', async () => {
    const user = userEvent.setup()
    const { constraintsClient } = renderSettings()

    const note = await screen.findByLabelText(/note/i)
    expect(note).toHaveAccessibleDescription(LIMITATIONS_NOTE_NEEDS_PATTERN)
    await user.type(note, 'Old ankle injury')
    await user.tab()

    // Nothing to carry it, so nothing written and nothing said to be saved.
    expect(constraintsClient.rows()).toEqual([])
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
    expect(note).toHaveValue('Old ankle injury')

    await user.click(screen.getByRole('checkbox', { name: /Squatting/ }))
    await waitFor(() => {
      expect(constraintsClient.rows()).toHaveLength(1)
    })
    expect(constraintsClient.rows()[0]?.note).toBe('Old ankle injury')
  })

  it('keeps a note edit recoverable when its save fails', async () => {
    const user = userEvent.setup()
    const cache = warmCache(onboardedProfile(), [patternConstraint({ note: 'Right knee' })])
    const constraintsClient = createFakeConstraintsClient({
      stored: [patternConstraint({ note: 'Right knee' })],
      writeError: constraintWriteError,
    })
    renderApp(['/settings'], signedIn({ queryClient: cache, constraints: constraintsClient }))

    const note = await screen.findByLabelText(/note/i)
    await user.clear(note)
    await user.type(note, 'Right knee, both sides now')
    await user.tab()

    expect(await screen.findByText('Could not save. Try again.')).toBeVisible()
    // The stored note is unchanged, and the user's text is still in the field.
    expect(constraintsClient.rows()[0]?.note).toBe('Right knee')
    expect(note).toHaveValue('Right knee, both sides now')
  })

  it('reads its own four states — a failed constraints read costs no preference', async () => {
    const constraints = createFakeConstraintsClient({
      listInForce: () =>
        Promise.resolve(err(createError(ErrorCode.PERSISTENCE_READ_FAILED))),
    })
    // A cache with the profile in it and the constraints not: that read has to
    // run, and fail, while the preferences card is already populated.
    const cache = new QueryClient()
    cache.setData(profileQueryKey(FIXTURE_USER_ID), onboardedProfile())
    cache.setData(locationsQueryKey(FIXTURE_USER_ID), [fixtureLocation()])

    renderApp(['/settings'], signedIn({ queryClient: cache, constraints }))

    expect(await screen.findByText(/limitations didn’t load/i)).toBeVisible()
    // The preferences card is untouched by that failure.
    expect(await screen.findByRole('radio', { name: 'Balanced' })).toBeVisible()
  })
})

describe('section toggles respect goal constraints', () => {
  it('refuses to untick the last section, and says why', async () => {
    const user = userEvent.setup()
    const { userData } = renderSettings({
      profile: onboardedProfile({ enabled_sections: ['core'] }),
    })

    await user.click(await screen.findByRole('checkbox', { name: 'Core' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(LAST_SECTION_REASON)
    expect(userData.preferenceWrites).toEqual([])
    expect(screen.getByRole('checkbox', { name: 'Core' })).toBeChecked()
  })

  it('fixes the sections active recovery composes from', async () => {
    renderSettings({
      profile: onboardedProfile({
        goal_preset: 'active_recovery',
        enabled_sections: ['warmup', 'mobility', 'cooldown'],
      }),
    })

    expect(await screen.findByText(LOCKED_SECTIONS_REASON)).toBeVisible()
    for (const section of SECTIONS) {
      expect(screen.getByRole('checkbox', { name: section.label })).toBeDisabled()
    }
    // The goal it holds is not a choice: it is named as needing correction.
    expect(screen.getByText(LEGACY_GOAL_REASON)).toBeVisible()
    expect(screen.queryByRole('radio', { name: /recovery/i })).toBeNull()
  })
})

describe('the standing goal is one of onboarding’s four', () => {
  const FOUR = ['Strength', 'Hypertrophy', 'Conditioning', 'Balanced']
  const LEGACY_SECTIONS = ['warmup', 'mobility', 'cooldown'] as const

  /** The Goal group's own radios, so Experience's are not counted. */
  async function goalRadios() {
    const group = await screen.findByRole('group', { name: 'Goal' })
    return within(group).getAllByRole('radio')
  }

  it('lists exactly the four goals for a strength profile', async () => {
    renderSettings({ profile: onboardedProfile({ goal_preset: 'strength' }) })

    const radios = await goalRadios()
    expect(radios).toHaveLength(FOUR.length)
    FOUR.forEach((label, index) => {
      expect(radios[index]).toHaveAccessibleName(label)
    })
    expect(screen.getByRole('radio', { name: 'Strength' })).toBeChecked()
    expect(screen.queryByText(LEGACY_GOAL_REASON)).toBeNull()
    expect(screen.queryByText(MISSING_GOAL_REASON)).toBeNull()
  })

  it.each([
    ['active_recovery', LEGACY_GOAL_REASON],
    [null, MISSING_GOAL_REASON],
  ] as const)('corrects a %s goal by choosing one of the four', async (stored, reason) => {
    const user = userEvent.setup()
    const { userData, cache } = renderSettings({
      profile: onboardedProfile({
        goal_preset: stored,
        enabled_sections: [...LEGACY_SECTIONS],
      }),
    })

    expect(await screen.findByText(reason)).toBeVisible()
    const radios = await goalRadios()
    expect(radios).toHaveLength(FOUR.length)
    for (const radio of radios) expect(radio).not.toBeChecked()

    await user.click(screen.getByRole('radio', { name: 'Strength' }))

    await waitFor(() => {
      expect(userData.preferenceWrites).toHaveLength(1)
    })
    expect(userData.preferenceWrites[0]?.goal_preset).toBe('strength')
    await waitFor(() => {
      const state = cache.getState<Profile>(profileQueryKey(FIXTURE_USER_ID))
      expect(state.status === 'ready' && state.data.goal_preset).toBe('strength')
    })
    expect(screen.queryByText(reason)).toBeNull()
    expect(screen.queryByText(LOCKED_SECTIONS_REASON)).toBeNull()
    expect(screen.getByRole('radio', { name: 'Strength' })).toBeChecked()
  })

  it('puts the correction back when the write fails', async () => {
    const user = userEvent.setup()
    const userData = createFakeUserDataClient({
      updatePreferences: () =>
        Promise.resolve(err(createError(ErrorCode.PERSISTENCE_WRITE_FAILED))),
    })
    const { cache } = renderSettings({
      userData,
      profile: onboardedProfile({
        goal_preset: 'active_recovery',
        enabled_sections: [...LEGACY_SECTIONS],
      }),
    })

    await user.click(await screen.findByRole('radio', { name: 'Strength' }))

    expect(await screen.findByText('Could not save. Try again.')).toBeVisible()
    await waitFor(() => {
      expect(screen.getByText(LEGACY_GOAL_REASON)).toBeVisible()
    })
    expect(screen.getByRole('radio', { name: 'Strength' })).not.toBeChecked()
    expect(screen.getByText(LOCKED_SECTIONS_REASON)).toBeVisible()
    const state = cache.getState<Profile>(profileQueryKey(FIXTURE_USER_ID))
    expect(state.status === 'ready' && state.data.goal_preset).toBe('active_recovery')
  })
})

describe('sign out', () => {
  it('clears the cache and lands on Welcome', async () => {
    const user = userEvent.setup()
    const auth = createFakeAuthClient({ settled: signedInEvent() })
    const { cache } = renderSettings({ providers: { auth } })

    await user.click(await screen.findByRole('button', { name: /sign out/i }))

    expect(await screen.findByRole('heading', { name: 'CLEAR' })).toBeVisible()
    await waitFor(() => {
      expect(document.title).toBe('Welcome · CLEAR')
    })
    // AUTH-01's port: every entry is back to loading, so the next user reads
    // nothing of this one's.
    expect(cache.getState(profileQueryKey(FIXTURE_USER_ID)).status).toBe('loading')
    expect(cache.getState(constraintsQueryKey(FIXTURE_USER_ID)).status).toBe('loading')
  })
})

describe('the hub is reachable, and onboarding is not re-entered', () => {
  it('opens from Home’s icon-only header control, which is named and focusable', async () => {
    const user = userEvent.setup()
    renderApp(['/'], signedIn())

    // U18: the header holds the wordmark and one framed glyph. The glyph is not
    // a label, so the control carries its name; its text content is empty.
    const header = (await screen.findByRole('heading', { level: 1, name: 'Today' }))
      .ownerDocument.querySelector('header') as HTMLElement
    const control = within(header).getByRole('button', { name: 'Settings' })
    expect(within(header).getAllByRole('button')).toEqual([control])
    expect(within(header).queryAllByRole('link')).toEqual([])
    expect(control).toHaveTextContent(/^$/)
    expect(control.querySelector('svg')).not.toBeNull()

    control.focus()
    expect(control).toHaveFocus()
    await user.keyboard('{Enter}')

    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()
  })

  it('never writes onboarding’s own commit', async () => {
    const user = userEvent.setup()
    const { userData } = renderSettings()

    await user.click(await screen.findByRole('radio', { name: 'Strength' }))
    await waitFor(() => {
      expect(userData.preferenceWrites).toHaveLength(1)
    })

    // Re-answering a question is an edit, never a first run (IA.md §6).
    expect(userData.onboardingCalls).toEqual([])
  })
})

describe('Back stays in the app (E05)', () => {
  const back = () => screen.findByRole('button', { name: SETTINGS_BACK_LABEL })
  const heading = (name: string) => screen.findByRole('heading', { level: 1, name })

  it('returns to the previous in-app screen after normal navigation', async () => {
    const user = userEvent.setup()
    renderApp(['/'], signedIn({ queryClient: warmCache(onboardedProfile()) }))

    await user.click(await screen.findByRole('button', { name: 'Settings' }))
    await heading('Settings')
    await user.click(await back())

    expect(await heading('Today')).toBeVisible()
  })

  it('returns to whichever screen came before, not always Home', async () => {
    const user = userEvent.setup()
    renderApp(['/history', '/settings'], signedIn({ queryClient: warmCache(onboardedProfile()) }))

    await heading('Settings')
    await user.click(await back())

    expect(await screen.findByRole('heading', { level: 1, name: 'History' })).toBeVisible()
  })

  it('goes Home when Settings is the first screen — a direct visit or a PWA launch', async () => {
    const user = userEvent.setup()
    renderSettings()

    await heading('Settings')
    await user.click(await back())

    expect(await heading('Today')).toBeVisible()
  })

  it('Locations still returns to Settings, and Settings’ Back still leads where it did', async () => {
    const user = userEvent.setup()
    renderApp(['/'], signedIn({ queryClient: warmCache(onboardedProfile()) }))

    await user.click(await screen.findByRole('button', { name: 'Settings' }))
    await user.click(await screen.findByRole('button', { name: 'Manage places' }))
    await heading('Places and equipment')
    await user.click(await screen.findByRole('button', { name: 'Settings' }))
    await heading('Settings')

    // Locations went back to the Settings entry rather than stacking another,
    // so Back is not trapped between the two.
    await user.click(await back())
    expect(await heading('Today')).toBeVisible()
  })

  // That Settings' Back then goes Home rests on the browser router's entry
  // index, which the memory router does not keep; e2e/settings-locations.spec.ts
  // proves it in a real browser.
  it('Locations opened directly still returns to Settings', async () => {
    const user = userEvent.setup()
    renderApp(['/settings/locations'], signedIn({ queryClient: warmCache(onboardedProfile()) }))

    await heading('Places and equipment')
    await user.click(await screen.findByRole('button', { name: 'Settings' }))

    expect(await heading('Settings')).toBeVisible()
    expect(await back()).toBeVisible()
  })
})

describe('in-app history is read from the router, not assumed', () => {
  it('trusts the browser router’s entry index when it has one', () => {
    expect(hasInAppHistory('abc123', { idx: 0, key: 'abc123', usr: null })).toBe(false)
    expect(hasInAppHistory('abc123', { idx: 2, key: 'abc123', usr: null })).toBe(true)
  })

  it('falls back to the first entry’s default key without one', () => {
    expect(hasInAppHistory('default', null)).toBe(false)
    expect(hasInAppHistory('default', { idx: 0 })).toBe(false)
    expect(hasInAppHistory('abc123', null)).toBe(true)
    expect(hasInAppHistory('abc123', { idx: 'x', key: 'abc123' })).toBe(true)
  })

  it('ignores an index that belongs to another history than the router’s', () => {
    expect(hasInAppHistory('abc123', { idx: 0 })).toBe(true)
    expect(hasInAppHistory('abc123', { idx: 0, key: 'other' })).toBe(true)
  })

  it('reads Settings’ hand-off to Locations defensively', () => {
    expect(cameFromSettings(FROM_SETTINGS_STATE)).toBe(true)
    expect(cameFromSettings(null)).toBe(false)
    expect(cameFromSettings({ fromSettings: 'yes' })).toBe(false)
  })
})

describe('the screen implements all four states', () => {
  it('shows a loading state while a read is in flight', async () => {
    let settle: () => void = () => {}
    const constraints = createFakeConstraintsClient({
      listInForce: () =>
        new Promise<Result<UserConstraint[]>>((resolve) => {
          settle = () => {
            resolve(ok([]))
          }
        }),
    })
    const cache = new QueryClient()
    cache.setData(profileQueryKey(FIXTURE_USER_ID), onboardedProfile())
    cache.setData(locationsQueryKey(FIXTURE_USER_ID), [fixtureLocation()])

    renderApp(['/settings'], signedIn({ queryClient: cache, constraints }))

    expect(await screen.findByText(/reading your limitations/i)).toBeVisible()
    settle()
    // And it settles into the editor rather than staying busy.
    expect(await screen.findByRole('checkbox', { name: /Squatting/ })).toBeVisible()
  })

  it('shows the error state with a retry that re-runs the read', async () => {
    const user = userEvent.setup()
    let attempts = 0
    const userData = createFakeUserDataClient({
      profile: () => {
        attempts += 1
        return Promise.resolve(
          attempts === 1
            ? err(createError(ErrorCode.PERSISTENCE_READ_FAILED))
            : ok(onboardedProfile()),
        )
      },
    })

    renderApp(['/settings'], signedIn({ queryClient: new QueryClient(), userData }))

    // The guard reads the same profile, so its own error screen is what a
    // failed read produces first; retrying it is what reaches this screen.
    const alert = await screen.findByRole('alert')
    await user.click(within(alert).getByRole('button', { name: /try again/i }))

    expect(await screen.findByRole('radio', { name: 'Balanced' })).toBeVisible()
    expect(attempts).toBeGreaterThan(1)
  })
})

describe('appearance is chosen here, from the registry', () => {
  const STORAGE_KEY = 'clear.skin'
  const iconLink = () =>
    document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  const stopped: Array<() => void> = []

  afterEach(() => {
    for (const stop of stopped.splice(0)) stop()
    document.head.querySelectorAll('link[rel="icon"]').forEach((link) => link.remove())
    document.documentElement.removeAttribute('data-skin')
    localStorage.clear()
  })

  const skinGroup = async () =>
    within(await screen.findByRole('group', { name: 'Skin' }))

  it('offers every skin in SKINS and no System option, nothing more', async () => {
    renderSettings()
    const group = await skinGroup()

    expect(group.getAllByRole('radio')).toHaveLength(SKINS.length)
    for (const option of appearanceOptions()) {
      expect(group.getByRole('radio', { name: option.label })).toBeVisible()
    }
    expect(group.queryByRole('radio', { name: /system/i })).toBeNull()
    expect(document.body.textContent).not.toMatch(/follows your contrast/i)
  })

  it('names Mono enhanced contrast, and nothing accessible', async () => {
    renderSettings()
    const group = await skinGroup()

    expect(group.getByRole('radio', { name: /Mono — enhanced contrast/ })).toBeVisible()
    expect(document.body.textContent?.toLowerCase()).not.toContain('accessible')
  })

  it('arrives on the product default while nothing is stored', async () => {
    renderSettings()
    const group = await skinGroup()

    expect(group.getByRole('radio', { name: appearanceLabel(DEFAULT_SKIN) })).toBeChecked()
    expect(group.getAllByRole('radio', { checked: true })).toHaveLength(1)
  })

  it('arrives on the product default from a legacy System preference', async () => {
    localStorage.setItem(STORAGE_KEY, 'system')
    renderSettings()
    const group = await skinGroup()

    expect(group.getByRole('radio', { name: appearanceLabel(DEFAULT_SKIN) })).toBeChecked()
    expect(group.getAllByRole('radio', { checked: true })).toHaveLength(1)
  })

  it('never lets the OS contrast setting pick the skin', async () => {
    const original = window.matchMedia
    window.matchMedia = ((query: string) =>
      ({
        matches: query.includes('prefers-contrast'),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList) as typeof window.matchMedia

    try {
      renderSettings()
      const group = await skinGroup()

      expect(group.getByRole('radio', { name: appearanceLabel(DEFAULT_SKIN) })).toBeChecked()
      expect(group.getByRole('radio', { name: appearanceLabel('mono') })).not.toBeChecked()
    } finally {
      window.matchMedia = original
    }
  })

  it('arrives on the stored skin', async () => {
    localStorage.setItem(STORAGE_KEY, 'vapour')
    renderSettings()
    const group = await skinGroup()

    expect(group.getByRole('radio', { name: appearanceLabel('vapour') })).toBeChecked()
    expect(group.getAllByRole('radio', { checked: true })).toHaveLength(1)
  })

  it('applies a choice live, stores it, and moves the favicon', async () => {
    const user = userEvent.setup()
    stopped.push(startFaviconSync())
    renderSettings()
    const group = await skinGroup()

    await user.click(group.getByRole('radio', { name: appearanceLabel('signal') }))

    // Live on <html>, which is every screen at once.
    expect(document.documentElement.getAttribute('data-skin')).toBe('signal')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('signal')
    expect(group.getByRole('radio', { name: appearanceLabel('signal') })).toBeChecked()
    await waitFor(() => {
      expect(iconLink()?.getAttribute('href')).toBe('/icons/favicon-signal.svg')
    })
  })

  it('survives a reload: a fresh mount arrives on the choice', async () => {
    const user = userEvent.setup()
    const first = renderSettings()
    await user.click(
      (await skinGroup()).getByRole('radio', { name: appearanceLabel('mono') }),
    )
    first.unmount()

    renderSettings()
    const group = await skinGroup()

    expect(group.getByRole('radio', { name: appearanceLabel('mono') })).toBeChecked()
    expect(document.documentElement.getAttribute('data-skin')).toBe('mono')
  })

  it('writes out no skin id or label — every option comes from the derived list', () => {
    const source = readFileSync(resolve(import.meta.dirname, 'Settings.tsx'), 'utf8')

    for (const option of appearanceOptions()) {
      expect(source).not.toContain(`'${option.value}'`)
      expect(source).not.toContain(`"${option.value}"`)
      expect(source).not.toContain(option.label)
    }
  })
})
