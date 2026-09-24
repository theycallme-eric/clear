/**
 * EXE-01 acceptance — "in-app navigation and browser back cannot silently
 * strand an active session", from the other side.
 *
 * `/workout` blocks navigation out; it can do nothing about *arriving*
 * somewhere else with a session already running — a deep link, a bookmark, a
 * restored tab. The requirement's instruction for that case is to prompt to
 * resume or abandon, which is what this dialog does, above every route.
 *
 * "Above every route" has one carve-out, and it is the requirement's own: a
 * route that surfaces the session *in the page* has already asked. Home does
 * (`ResumableSession`), and the shell does. So these cases land on a route
 * that does neither — a deep link to a path that does not exist is still a
 * deep link, and the session behind it still has to be answered for.
 */
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createError, err, ErrorCode } from '../state/errors'
import { WORKOUT_SHELL_STORAGE_KEY } from '../state/workout-persistence'
import { renderApp, signedIn } from '../test/render'
import {
  createWorkoutDouble,
  FIXTURE_SESSION_ID,
  snapshotFixture,
  type WorkoutDouble,
  type WorkoutDoubleOptions,
} from '../test/workout-double'

const PROMPT_TITLE = 'You have a workout in progress'
const ABANDON_CONFIRM = 'Abandon workout?'

/** A route that renders, is reachable by URL, and surfaces no session itself. */
const DEEP_LINK = '/nowhere-in-particular'

function landOn(path: string, options: WorkoutDoubleOptions = {}): WorkoutDouble {
  const double = createWorkoutDouble({ session: snapshotFixture(), ...options })
  renderApp([path], signedIn({ workout: double.clients }))
  return double
}

function dialogTitled(title: string): HTMLElement {
  const dialog = Array.from(document.querySelectorAll('dialog[open]')).find(
    (element) => element.querySelector('h2')?.textContent === title,
  )
  if (dialog === undefined) throw new Error(`no open dialog titled "${title}"`)
  return dialog as HTMLElement
}

function isDialogOpen(title: string): boolean {
  return Array.from(document.querySelectorAll('dialog[open]')).some(
    (element) => element.querySelector('h2')?.textContent === title,
  )
}

function prompt(): HTMLElement {
  return dialogTitled(PROMPT_TITLE)
}

function promptIsOpen(): boolean {
  return isDialogOpen(PROMPT_TITLE)
}

/** Answers the prompt's abandon, and then the confirm it raises. */
async function abandonThroughPrompt(user: ReturnType<typeof userEvent.setup>) {
  await user.click(within(prompt()).getByRole('button', { name: 'Abandon it' }))
  await user.click(
    within(dialogTitled(ABANDON_CONFIRM)).getByRole('button', { name: 'Abandon' }),
  )
}

beforeEach(() => window.localStorage.clear())
afterEach(() => window.localStorage.clear())

describe('ActiveSessionPrompt', () => {
  it('asks rather than stranding a session found on another route', async () => {
    landOn(DEEP_LINK)

    await waitFor(() => expect(promptIsOpen()).toBe(true))
    // It names the workout, so the question is about something identifiable.
    expect(within(prompt()).getByText(/Full body is still running/)).toBeInTheDocument()
  })

  it('offers exactly two answers, and no way to leave the question open', async () => {
    landOn(DEEP_LINK)

    await waitFor(() => expect(promptIsOpen()).toBe(true))
    const actions = within(prompt())
      .getAllByRole('button')
      .map((button) => button.textContent)
    expect(actions).toEqual(['Resume workout', 'Abandon it'])
  })

  it('resumes into the focus shell', async () => {
    const user = userEvent.setup()
    landOn(DEEP_LINK)

    await waitFor(() => expect(promptIsOpen()).toBe(true))
    await user.click(within(prompt()).getByRole('button', { name: 'Resume workout' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Workout' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Workout sections' })).toBeInTheDocument()
    await waitFor(() => expect(promptIsOpen()).toBe(false))
  })

  it('confirms before it abandons anything', async () => {
    const user = userEvent.setup()
    const double = landOn(DEEP_LINK)

    await waitFor(() => expect(promptIsOpen()).toBe(true))
    await user.click(within(prompt()).getByRole('button', { name: 'Abandon it' }))

    // The same question the shell asks, in the same words — and nothing has
    // happened yet, which is the point of asking it.
    const confirm = within(dialogTitled(ABANDON_CONFIRM))
    expect(confirm.getByText(/Everything logged so far is kept/)).toBeInTheDocument()
    expect(double.abandoned()).toEqual([])
  })

  it('returns to the open question when the confirm is declined', async () => {
    const user = userEvent.setup()
    const double = landOn(DEEP_LINK)

    await waitFor(() => expect(promptIsOpen()).toBe(true))
    await user.click(within(prompt()).getByRole('button', { name: 'Abandon it' }))
    await user.click(
      within(dialogTitled(ABANDON_CONFIRM)).getByRole('button', { name: 'Keep going' }),
    )

    // Declining the abandon leaves the session running, which is still
    // something the user has to answer for.
    await waitFor(() => expect(promptIsOpen()).toBe(true))
    expect(double.abandoned()).toEqual([])
  })

  it('abandons the session and leaves the user where they were', async () => {
    const user = userEvent.setup()
    const double = landOn(DEEP_LINK)

    await waitFor(() => expect(promptIsOpen()).toBe(true))
    await abandonThroughPrompt(user)

    await waitFor(() => expect(promptIsOpen()).toBe(false))
    expect(double.abandoned()).toEqual([FIXTURE_SESSION_ID])
    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument()
  })

  it('forgets the shell’s section record when it abandons', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem(
      WORKOUT_SHELL_STORAGE_KEY,
      JSON.stringify({
        sessionId: FIXTURE_SESSION_ID,
        sectionIndex: 1,
        updatedAt: '2026-09-24T09:05:00.000Z',
      }),
    )
    landOn(DEEP_LINK)

    await waitFor(() => expect(promptIsOpen()).toBe(true))
    await abandonThroughPrompt(user)

    await waitFor(() =>
      expect(window.localStorage.getItem(WORKOUT_SHELL_STORAGE_KEY)).toBeNull(),
    )
  })

  it('keeps the session and says so when the abandon fails', async () => {
    const user = userEvent.setup()
    landOn(DEEP_LINK, {
      sessions: { abandon: async () => err(createError(ErrorCode.NETWORK_OFFLINE)) },
    })

    await waitFor(() => expect(promptIsOpen()).toBe(true))
    await abandonThroughPrompt(user)

    expect(await screen.findByText('No connection. Check your network.')).toBeInTheDocument()
    // Nothing was discarded, so the question is still open.
    expect(promptIsOpen()).toBe(true)
  })

  it('says nothing about a session the app could not confirm exists', async () => {
    landOn(DEEP_LINK, {
      sessions: { resume: async () => err(createError(ErrorCode.NETWORK_SERVER_ERROR)) },
    })

    await screen.findByRole('heading', { level: 1, name: 'Page not found' })
    // Offering to abandon a session a flaky network could not read is how a
    // workout gets destroyed by silence.
    expect(promptIsOpen()).toBe(false)
  })

  it('says nothing about a session nobody has started', async () => {
    landOn(DEEP_LINK, { session: snapshotFixture({ state: 'prescribed', startedAt: null }) })

    await screen.findByRole('heading', { level: 1, name: 'Page not found' })
    expect(promptIsOpen()).toBe(false)
  })

  it('says nothing when there is no session at all', async () => {
    landOn(DEEP_LINK, { session: null })

    await screen.findByRole('heading', { level: 1, name: 'Page not found' })
    expect(promptIsOpen()).toBe(false)
  })

  it('does not double up on the shell, which is already showing the session', async () => {
    landOn('/workout')

    await screen.findByRole('navigation', { name: 'Workout sections' })
    expect(promptIsOpen()).toBe(false)
  })

  it('does not double up on Home, which surfaces the session in the page', async () => {
    landOn('/')

    // Home's own card is the question there, and it does not block the screen.
    await screen.findByRole('button', { name: 'Resume workout' })
    expect(promptIsOpen()).toBe(false)
  })
})
