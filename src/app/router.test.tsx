import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ok } from '../state/errors'
import { STEP_TITLES } from '../state/onboarding'
import { QueryClient } from '../state/query'
import { renderApp, signedIn } from '../test/render'
import { createFakeUserDataClient, notOnboardedProfile } from '../test/user-data-double'
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
