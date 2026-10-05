/**
 * EXE-01 acceptance — "closing the tab or backgrounding the phone persists
 * state and surfaces resumption on Home", and the abandon that answers it.
 *
 * The shell is what stops a session being stranded while the user is *in* it.
 * This is the other end of the same promise: the user left the app entirely,
 * came back, and landed on Home. What they find there has to be the session
 * itself — named, timed, and offering the two answers — rather than nothing.
 *
 * Three things this file is answerable for:
 *   · Home surfaces a resumable active session, in all four states;
 *   · abandoning from Home is confirmed first, and the confirm states what
 *     survives it;
 *   · a failed read, a session nobody started, and a failed abandon all leave
 *     the session exactly where it was.
 */
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createError, err, ErrorCode, ok } from '../state/errors'
import { WORKOUT_SHELL_STORAGE_KEY } from '../state/workout-persistence'
import { renderApp, signedIn } from '../test/render'
import {
  createWorkoutDouble,
  FIXTURE_SESSION_ID,
  snapshotFixture,
  type SectionFixture,
  type WorkoutDouble,
  type WorkoutDoubleOptions,
} from '../test/workout-double'

/** Twelve and a half minutes ago, so the elapsed reading is a real one. */
const ELAPSED_SECONDS = 750

/** One finished section, one under way, one untouched. */
const SECTIONS: SectionFixture[] = [
  { title: 'Warm-up', blocks: [{ exercises: ['completed'] }] },
  {
    title: 'Primary lift',
    sectionType: 'primary_lift',
    blocks: [{ exercises: ['completed', 'not_started'] }],
  },
  { title: 'Finisher', blocks: [{ exercises: ['not_started'] }] },
]

const ABANDON_CONFIRM = 'Abandon workout?'

function activeSession() {
  return snapshotFixture({
    sections: SECTIONS,
    startedAt: new Date(Date.now() - ELAPSED_SECONDS * 1000).toISOString(),
  })
}

function home(options: WorkoutDoubleOptions = {}): WorkoutDouble {
  const double = createWorkoutDouble({ session: activeSession(), ...options })
  renderApp(['/'], signedIn({ workout: double.clients }))
  return double
}

function openDialog(title: string): HTMLElement {
  const match = Array.from(document.querySelectorAll('dialog[open]')).find(
    (dialog) => dialog.querySelector('h2')?.textContent === title,
  )
  if (match === undefined) throw new Error(`no open dialog titled "${title}"`)
  return match as HTMLElement
}

function isDialogOpen(title: string): boolean {
  return Array.from(document.querySelectorAll('dialog[open]')).some(
    (dialog) => dialog.querySelector('h2')?.textContent === title,
  )
}

beforeEach(() => window.localStorage.clear())
afterEach(() => window.localStorage.clear())

// ─────────────────────────────────────────────────────────────────────────────
// Surfacing
// ─────────────────────────────────────────────────────────────────────────────

describe('Home — a resumable session', () => {
  it('names the session, times it, and says how far it got', async () => {
    home()

    expect(await screen.findByText(/In progress · Full body/)).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 2, name: 'Train today' })).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Generate workout' })).not.toBeInTheDocument()
    // Read from `started_at`, so a tab that was closed for an hour comes back
    // with the hour in it rather than with zero.
    expect(screen.getByRole('timer', { name: 'Session time' })).toHaveTextContent('12:30')
    expect(screen.getByText('1 of 3 sections done')).toBeInTheDocument()
    // Where it picks up: the first section the rows say is unfinished.
    expect(screen.getByText(/Primary lift/)).toBeInTheDocument()
  })

  it('heads the resume card inside one barred card, with the readouts as its content', async () => {
    home()

    await screen.findByText(/In progress · Full body/)
    const heading = screen.getByRole('heading', { level: 2, name: 'Train today' })
    expect(heading).toHaveClass('label')
    const body = heading.closest<HTMLElement>('.clr-card__body')
    expect(body).not.toBeNull()
    const card = body!.closest<HTMLElement>('.clr-card')!
    expect(card.querySelectorAll('.clr-card__bar')).toHaveLength(1)

    // The timer is this card's element frame, not a timer card inside a card.
    const timer = within(card).getByRole('timer', { name: 'Session time' })
    expect(timer).toHaveClass('clr-chamfer', 'clr-chamfer--timer')
    expect(timer).not.toHaveClass('clr-card__body')
    expect(document.querySelectorAll('.clr-card .clr-card')).toHaveLength(0)
    expect(within(card).getByText('1 of 3 sections done')).toBeInTheDocument()
    expect(within(card).getByText(/Picks up at Primary lift/)).toBeInTheDocument()

    // The resume card takes Train Today's place in Home's one arriving set.
    const set = document.querySelector('.clr-boot')
    expect(set).not.toBeNull()
    expect(document.querySelectorAll('.clr-boot')).toHaveLength(1)
    expect(set!.firstElementChild).toContainElement(card)
  })

  it('keeps the two answers in their own treatments', async () => {
    home()

    // Forward and primary: the pinned footer's framed button.
    const resume = await screen.findByRole('button', { name: 'Resume workout' })
    expect(resume).toHaveClass('clr-btn')
    expect(resume.closest('.clr-footer')).not.toBeNull()

    // Destructive, so never the quiet text action: a framed quiet button that
    // only opens the confirm.
    const abandon = screen.getByRole('button', { name: 'Abandon' })
    expect(abandon).toHaveClass('clr-btn')
    expect(abandon).not.toHaveClass('clr-text-action')
    expect(abandon.closest('.clr-card')).not.toBeNull()

    // Nothing the package's worked example shows on its own active card.
    expect(screen.queryByText(/paused \d+ minutes ago/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/movements complete/i)).not.toBeInTheDocument()
  })

  it('resumes into the focus shell', async () => {
    const user = userEvent.setup()
    home()

    await user.click(await screen.findByRole('button', { name: 'Resume workout' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Workout' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Workout sections' })).toBeInTheDocument()
  })

  it('does not double up: Home surfaces the session, so nothing modal asks about it', async () => {
    home()

    await screen.findByText(/In progress · Full body/)
    expect(isDialogOpen('You have a workout in progress')).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Abandoning
// ─────────────────────────────────────────────────────────────────────────────

describe('Home — abandoning from the resumption card', () => {
  it('asks before it ends anything, and says what survives', async () => {
    const user = userEvent.setup()
    const double = home()

    await user.click(await screen.findByRole('button', { name: 'Abandon' }))

    const confirm = within(openDialog(ABANDON_CONFIRM))
    expect(confirm.getByText(/Everything logged so far is kept/)).toBeInTheDocument()
    // Nothing has happened yet — the question is the whole point.
    expect(double.abandoned()).toEqual([])
  })

  it('keeps the session when the confirm is declined', async () => {
    const user = userEvent.setup()
    const double = home()

    await user.click(await screen.findByRole('button', { name: 'Abandon' }))
    await user.click(within(openDialog(ABANDON_CONFIRM)).getByRole('button', { name: 'Keep going' }))

    await waitFor(() => expect(isDialogOpen(ABANDON_CONFIRM)).toBe(false))
    expect(double.abandoned()).toEqual([])
    expect(screen.getByText(/In progress · Full body/)).toBeInTheDocument()
  })

  it('abandons on confirmation and stops offering a session that is over', async () => {
    const user = userEvent.setup()
    const double = home()

    await user.click(await screen.findByRole('button', { name: 'Abandon' }))
    await user.click(within(openDialog(ABANDON_CONFIRM)).getByRole('button', { name: 'Abandon' }))

    // Abandoned is a state, not a delete: the transition is the disposition.
    await waitFor(() => expect(double.abandoned()).toEqual([FIXTURE_SESSION_ID]))
    expect(await screen.findByRole('button', { name: 'Generate workout' })).toBeInTheDocument()
    expect(screen.queryByText('No workout in progress')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Today' })).toBeInTheDocument()
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
    home()

    await user.click(await screen.findByRole('button', { name: 'Abandon' }))
    await user.click(within(openDialog(ABANDON_CONFIRM)).getByRole('button', { name: 'Abandon' }))

    await waitFor(() =>
      expect(window.localStorage.getItem(WORKOUT_SHELL_STORAGE_KEY)).toBeNull(),
    )
  })

  it('keeps the session and says so when the abandon fails', async () => {
    const user = userEvent.setup()
    home({ sessions: { abandon: async () => err(createError(ErrorCode.NETWORK_OFFLINE)) } })

    await user.click(await screen.findByRole('button', { name: 'Abandon' }))
    await user.click(within(openDialog(ABANDON_CONFIRM)).getByRole('button', { name: 'Abandon' }))

    expect(await screen.findByText('No connection. Check your network.')).toBeInTheDocument()
    // Nothing was discarded: the session is still there to resume.
    expect(screen.getByText(/In progress · Full body/)).toBeInTheDocument()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// The four states
// ─────────────────────────────────────────────────────────────────────────────

describe('Home — the resumption card’s four states', () => {
  it('keeps Train Today usable while it checks for an active workout', () => {
    home({ sessions: { resume: () => new Promise(() => {}) } })

    expect(screen.getByRole('button', { name: 'Generate workout' })).toBeInTheDocument()
    expect(screen.queryByText('No workout in progress')).not.toBeInTheDocument()
  })

  it('offers a retry when the read fails, and never offers to abandon', async () => {
    home({ sessions: { resume: async () => err(createError(ErrorCode.NETWORK_SERVER_ERROR)) } })

    expect(await screen.findByText('Couldn’t check for a workout in progress')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    // Offering to end a session the app could not read is how one gets
    // destroyed by a flaky network.
    expect(screen.queryByRole('button', { name: 'Abandon' })).not.toBeInTheDocument()
  })

  it('reads again when the retry is taken', async () => {
    const user = userEvent.setup()
    let attempt = 0
    home({
      sessions: {
        resume: async () => {
          attempt += 1
          return attempt === 1
            ? err(createError(ErrorCode.NETWORK_SERVER_ERROR))
            : ok(activeSession())
        },
      },
    })

    await user.click(await screen.findByRole('button', { name: 'Retry' }))

    expect(await screen.findByText(/In progress · Full body/)).toBeInTheDocument()
  })

  it('renders no empty workout card when there is no active workout', async () => {
    home({ session: null })

    expect(await screen.findByRole('button', { name: 'Generate workout' })).toBeInTheDocument()
    expect(screen.queryByText('No workout in progress')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Resume workout' })).not.toBeInTheDocument()
  })

  it('does not offer to resume a session nobody has started', async () => {
    home({ session: snapshotFixture({ state: 'prescribed', startedAt: null }) })

    // A prescribed session belongs to Review. Resuming it here would start a
    // workout the user never agreed to be in.
    expect(await screen.findByRole('button', { name: 'Generate workout' })).toBeInTheDocument()
    expect(screen.queryByText('No workout in progress')).not.toBeInTheDocument()
  })
})
