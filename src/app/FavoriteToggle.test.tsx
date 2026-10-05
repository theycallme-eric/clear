import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { createError, err, ok, ErrorCode } from '../state/errors'
import { favoritesQueryKey } from '../state/favorite-queries'
import type { SavedWorkoutRow } from '../state/schemas'
import { createWarmQueryClient, renderWithProviders, signedIn } from '../test/render'
import { FIXTURE_USER_ID } from '../test/user-data-double'
import {
  createWorkoutDouble,
  reconstructionFixture,
  savedWorkoutFixture,
  type WorkoutDoubleOptions,
} from '../test/workout-double'
import {
  FavoriteToggle,
  SAVE_FAVORITE_FAILED,
  SAVE_FAVORITE_LABEL,
  SAVED_FAVORITE_LABEL,
} from './FavoriteToggle'

/**
 * FAV-01's control on its own, the way both of its screens mount it: Summary
 * with its field label, Session Detail compact inside a footer. The screens'
 * own tests cover it in place; these pin the contract the two share.
 */

const SESSION_ID = 'c0000001-0000-4000-8000-000000000000'
const OTHER_SESSION_ID = 'c0000009-0000-4000-8000-000000000000'

function mountToggle(
  options: { workout?: WorkoutDoubleOptions; compact?: boolean; anonymous?: boolean } = {},
) {
  const intendedAsked: string[] = []
  const double = createWorkoutDouble({
    session: null,
    ...options.workout,
    sessions: {
      asIntendedAtStart: async (sessionId) => {
        intendedAsked.push(sessionId)
        return ok(
          reconstructionFixture({
            sessionId,
            title: 'Full-body conditioning',
            state: 'completed',
            reconstruction: 'intended_at_start',
            sections: [{ title: 'Main', blocks: [{ exercises: ['completed'] }] }],
          }),
        )
      },
      ...options.workout?.sessions,
    },
  })
  const queryClient = createWarmQueryClient()
  const providers = { workout: double.clients, queryClient }
  const view = renderWithProviders(
    <FavoriteToggle sessionId={SESSION_ID} compact={options.compact} />,
    options.anonymous ? providers : signedIn(providers),
  )
  return { ...view, double, queryClient, intendedAsked }
}

function saveButton(): HTMLElement | null {
  return screen.queryByRole('button', { name: SAVE_FAVORITE_LABEL })
}

async function saveOffered(): Promise<HTMLElement> {
  const button = await screen.findByRole('button', { name: SAVE_FAVORITE_LABEL })
  await waitFor(() => expect(button).toBeEnabled())
  return button
}

describe('FavoriteToggle treatment', () => {
  it('offers one secondary button carrying a star and its words', async () => {
    mountToggle()

    const button = await saveOffered()
    expect(button).toHaveClass('clr-btn')
    expect(button).not.toHaveClass('clr-btn--primary')
    // The star is decoration; the label is the name, so colour and glyph are
    // never the only cue.
    expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(button).toHaveAccessibleName(SAVE_FAVORITE_LABEL)
  })

  it('labels itself and stacks for Summary', async () => {
    const { container } = mountToggle()
    await saveOffered()

    expect(screen.getByText('Favorite')).toHaveClass('label')
    expect(container.querySelector('.clr-stack.clr-stack--tight')).not.toBeNull()
  })

  it('drops the label and the wrapper when compact, for Session Detail’s footer', async () => {
    const { container } = mountToggle({ compact: true })
    await saveOffered()

    expect(screen.queryByText('Favorite')).toBeNull()
    expect(container.querySelector('.clr-stack')).toBeNull()
  })

  it('is busy, not blank, while the favorites read is settling', async () => {
    mountToggle({ workout: { favoritesClient: { list: () => new Promise(() => {}) } } })

    const button = await screen.findByRole('button', { name: SAVE_FAVORITE_LABEL })
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button).toBeDisabled()
  })

  it('reports saved as a status with a star and words, not as a button', async () => {
    mountToggle({
      workout: { favorites: [savedWorkoutFixture({ original_session_id: SESSION_ID })] },
    })

    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent(SAVED_FAVORITE_LABEL)
    expect(status.querySelector('svg')).not.toBeNull()
    expect(saveButton()).toBeNull()
  })
})

describe('FavoriteToggle persistence', () => {
  it('saves the intended-at-start workout in one tap', async () => {
    const user = userEvent.setup()
    const { double, intendedAsked } = mountToggle()

    await user.click(await saveOffered())

    expect(await screen.findByText(SAVED_FAVORITE_LABEL)).toBeInTheDocument()
    expect(saveButton()).toBeNull()
    expect(intendedAsked).toEqual([SESSION_ID])
    expect(double.favorites().map((row) => row.original_session_id)).toEqual([SESSION_ID])
    expect(screen.queryByRole('alert')).toBeNull()
    // One tap: no dialog and no naming step stood between the tap and the row.
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('puts the written row first in the favorites cache, keeping the rest', async () => {
    const user = userEvent.setup()
    const other = savedWorkoutFixture({ original_session_id: OTHER_SESSION_ID })
    const { queryClient } = mountToggle({ workout: { favorites: [other] } })

    await user.click(await saveOffered())
    await screen.findByText(SAVED_FAVORITE_LABEL)

    const cached = queryClient.getState<readonly SavedWorkoutRow[]>(
      favoritesQueryKey(FIXTURE_USER_ID),
    )
    if (cached.status !== 'ready') throw new Error('The favorites cache is not ready')
    expect(cached.data.map((row) => row.original_session_id)).toEqual([
      SESSION_ID,
      OTHER_SESSION_ID,
    ])
  })

  it('knows a saved session from the list, without a reconstruction', async () => {
    const { double, intendedAsked } = mountToggle({
      workout: { favorites: [savedWorkoutFixture({ original_session_id: SESSION_ID })] },
    })

    expect(await screen.findByText(SAVED_FAVORITE_LABEL)).toBeInTheDocument()
    expect(intendedAsked).toEqual([])
    expect(double.favorites()).toHaveLength(1)
  })

  it('still offers to save when the list holds only other sessions', async () => {
    mountToggle({
      workout: { favorites: [savedWorkoutFixture({ original_session_id: OTHER_SESSION_ID })] },
    })

    expect(await saveOffered()).toBeEnabled()
    expect(screen.queryByText(SAVED_FAVORITE_LABEL)).toBeNull()
  })

  it('offers to save when the favorites read failed', async () => {
    mountToggle({
      workout: {
        favoritesClient: {
          list: async () => err(createError(ErrorCode.PERSISTENCE_READ_FAILED)),
        },
      },
    })

    expect(await saveOffered()).toBeEnabled()
    // A read the user did not ask for is not theirs to repair.
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
  })

  it('writes nothing for a visitor with no user', async () => {
    const user = userEvent.setup()
    const { double, intendedAsked } = mountToggle({ anonymous: true })

    await user.click(await screen.findByRole('button', { name: SAVE_FAVORITE_LABEL }))

    expect(intendedAsked).toEqual([])
    expect(double.favorites()).toEqual([])
    expect(screen.queryByText(SAVED_FAVORITE_LABEL)).toBeNull()
  })
})

describe('FavoriteToggle failure and retry', () => {
  it('reports a failed write in place and keeps the same tap as the retry', async () => {
    const user = userEvent.setup()
    let attempts = 0
    const { double } = mountToggle({
      workout: {
        favoritesClient: {
          save: async () => {
            attempts += 1
            return err(createError(ErrorCode.PERSISTENCE_WRITE_FAILED))
          },
        },
      },
    })

    await user.click(await saveOffered())

    expect(await screen.findByRole('alert')).toHaveTextContent(SAVE_FAVORITE_FAILED)
    expect(await saveOffered()).toBeEnabled()
    expect(screen.queryByText(SAVED_FAVORITE_LABEL)).toBeNull()
    expect(double.favorites()).toEqual([])

    await user.click(await saveOffered())
    await waitFor(() => expect(attempts).toBe(2))
  })

  it('reports a failed reconstruction without attempting the write', async () => {
    const user = userEvent.setup()
    let writes = 0
    const { double } = mountToggle({
      workout: {
        sessions: {
          asIntendedAtStart: async () => err(createError(ErrorCode.PERSISTENCE_READ_FAILED)),
        },
        favoritesClient: {
          save: async () => {
            writes += 1
            return err(createError(ErrorCode.PERSISTENCE_WRITE_FAILED))
          },
        },
      },
    })

    await user.click(await saveOffered())

    expect(await screen.findByRole('alert')).toHaveTextContent(SAVE_FAVORITE_FAILED)
    expect(writes).toBe(0)
    expect(double.favorites()).toEqual([])
  })

  it('clears the failure once a retry saves', async () => {
    const user = userEvent.setup()
    let failNext = true
    const { double } = mountToggle({
      workout: {
        sessions: {
          asIntendedAtStart: async (sessionId) => {
            if (failNext) {
              failNext = false
              return err(createError(ErrorCode.PERSISTENCE_READ_FAILED))
            }
            return ok(
              reconstructionFixture({
                sessionId,
                state: 'completed',
                reconstruction: 'intended_at_start',
                sections: [{ title: 'Main', blocks: [{ exercises: ['completed'] }] }],
              }),
            )
          },
        },
      },
    })

    await user.click(await saveOffered())
    expect(await screen.findByRole('alert')).toBeInTheDocument()

    await user.click(await saveOffered())

    expect(await screen.findByText(SAVED_FAVORITE_LABEL)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(double.favorites().map((row) => row.original_session_id)).toEqual([SESSION_ID])
  })
})
