/**
 * SET-01's acceptance, on the real route tree.
 *
 * The four criteria, in order: every preference persists and is what the next
 * generation reads; section toggles respect the goal's constraints; sign out
 * empties the cache and lands on Welcome; and every choice onboarding collected
 * — except the locations and equipment SET-02 owns — is editable here without
 * the wizard being re-entered.
 */
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import type { UserConstraint } from '../data/constraints'
import { QueryClient } from '../state/query'
import { GOALS, EXPERIENCE_LEVELS, MOVEMENT_PATTERNS, SECTIONS } from '../state/onboarding'
import { constraintsQueryKey } from '../state/constraint-queries'
import { createError, ErrorCode, err, ok, type Result } from '../state/errors'
import { LAST_SECTION_REASON, LOCKED_SECTIONS_REASON } from '../state/settings'
import { createFakeAuthClient, signedInEvent } from '../test/auth-double'
import { createFakeConstraintsClient } from '../test/constraints-double'
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

    expect(await screen.findByText(/where you train/i)).toBeVisible()
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
    // And the goal it holds is still shown as the answer it is.
    expect(screen.getByRole('radio', { name: 'Active recovery' })).toBeChecked()
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
  it('is linked from Home', async () => {
    const user = userEvent.setup()
    renderApp(['/'], signedIn())

    await user.click(await screen.findByRole('link', { name: 'Settings' }))

    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeVisible()
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
