import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { ok } from '../state/errors'
import { GENERATION_LOADING_TITLE } from '../state/generation-loading'
import { STEP_TITLES } from '../state/onboarding'
import { QueryClient } from '../state/query'
import { locationsQueryKey, profileQueryKey } from '../state/user-queries'
import { makeGenerationOutput, makeSessionAcceptance } from '../test/factories'
import { createFakeGenerationClient } from '../test/generation-double'
import { renderApp, signedIn } from '../test/render'
import {
  createFakeUserDataClient,
  FIXTURE_USER_ID,
  fixtureLocation,
  notOnboardedProfile,
  onboardedProfile,
} from '../test/user-data-double'
import { ONBOARDING_TITLE } from './Onboarding'

describe('app router', () => {
  it('renders the shell route', () => {
    // Signed in, because AUTH-03 made `/` protected. HOME-01 owns a distinct
    // page heading, so this proves the daily entry point rendered.
    renderApp(['/'], signedIn())

    expect(screen.getByRole('heading', { name: 'Today' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generate workout' })).toBeInTheDocument()
  })

  it('mounts /onboarding behind the onboarding guard, at the quiet atmosphere', async () => {
    const userData = createFakeUserDataClient({
      profile: async () => ok(notOnboardedProfile()),
    })
    renderApp(['/onboarding'], signedIn({ userData, queryClient: new QueryClient() }))

    expect(
      await screen.findByRole('heading', { level: 2, name: STEP_TITLES.location }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: ONBOARDING_TITLE })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Page not found' })).toBeNull()
    expect(document.querySelector('.clr-shell')).toHaveAttribute('data-atmosphere', 'quiet')
  })

  it('mounts /history as a protected route at the quiet atmosphere', async () => {
    const { container } = renderApp(['/history'], signedIn())

    expect(
      await screen.findByRole('heading', { level: 1, name: 'History' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Page not found' })).toBeNull()
    expect(container.querySelector('.clr-shell')).toHaveAttribute(
      'data-atmosphere',
      'quiet',
    )
  })

  it('takes a /generate submit through Loading to /review with the validated workout', async () => {
    const user = userEvent.setup()
    const cache = new QueryClient()
    cache.setData(profileQueryKey(FIXTURE_USER_ID), onboardedProfile())
    cache.setData(locationsQueryKey(FIXTURE_USER_ID), [fixtureLocation()])
    const generation = createFakeGenerationClient()
    const { container } = renderApp(['/generate'], signedIn({ queryClient: cache, generation }))

    await user.click(
      within(screen.getByRole('group', { name: 'Goal' })).getByRole('button', {
        name: /strength/i,
      }),
    )
    await user.click(
      within(screen.getByRole('group', { name: 'Anchor' })).getByRole('button', {
        name: /upper body/i,
      }),
    )
    await user.click(screen.getByRole('button', { name: /generate workout/i }))

    // The Loading screen is the route's screen for the run, at `full`.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(GENERATION_LOADING_TITLE)
    expect(document.documentElement.dataset.atmosphere).toBe('full')

    await act(async () => {
      generation.succeed({
        acceptance: makeSessionAcceptance({
          workout: { ...makeGenerationOutput(), title: 'Routed session' },
        }),
      })
    })

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Routed session' }),
    ).toBeInTheDocument()
    expect(document.documentElement.dataset.atmosphere).not.toBe('full')
    expect(container.querySelector('.clr-shell')).toHaveAttribute(
      'data-atmosphere',
      document.documentElement.dataset.atmosphere,
    )
  })

  it('renders the fallback route', () => {
    renderApp(['/missing'])

    expect(
      screen.getByRole('heading', { name: 'Page not found' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Return to CLEAR' }),
    ).toHaveAttribute('href', '/')
  })
})
