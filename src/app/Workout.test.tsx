/**
 * EXE-01 acceptance — the focus shell, end to end through the real route tree.
 *
 * The five criteria this file is answerable for:
 *
 *   · the global timer is correct after backgrounding — here, that the shell
 *     reads it from `started_at` rather than from the moment it mounted
 *     (`workout-clock.test.ts` moves the clock itself);
 *   · navigation covers every section, and progress reflects section status;
 *   · in-app navigation and browser Back cannot silently strand a session;
 *   · closing or backgrounding persists state without trapping the user;
 *   · section headers expose structure identity.
 *
 * Its two exits are REQ-006's: completing lands on `/summary`, the debrief of
 * the session just completed, whose Done returns Home; abandoning lands Home,
 * where the session's remains stay resumable.
 *
 * And the sixth thing the shell owns: **block completion** (REQ-013). The
 * footer's one forward action saves the open section's blocks — what each
 * observed, no effort, no invented count — then continues, or finishes the
 * workout on the last section. A failed save keeps the athlete where they are
 * with their input, and the retry writes each block once.
 *
 * And, from 0.14.3, what the composed route must still be once every renderer
 * and the shared chrome are in it: the timers are self-framed cards never put
 * inside another, the low rest takes the stepped 80% pulse with no glow of its
 * own, a coaching wait beside it yields the view's one loop, and reduced motion
 * keeps every word, digit and colour.
 */
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { BlockCompletion } from '../state/block-completion'
import type { SetLogEntry } from '../state/set-logging'
import { createError, err, ErrorCode, ok } from '../state/errors'
import type { BlockResultRow } from '../state/schemas'
import { WORKOUT_SHELL_STORAGE_KEY } from '../state/workout-persistence'
import { sessionProgress } from '../state/workout-progress'
import { AppProviders, signedIn } from '../test/render'
import {
  completedSession,
  createFakeSummaryClient,
  fixtureStreak,
  type FakeSummaryClient,
} from '../test/summary-double'
import {
  NO_CUES_TEXT,
  NO_REGRESSION_TEXT,
  NOTE_FAILED_TEXT,
  NOTE_SAVED_TEXT,
} from '../ui/exercise-coaching'
import {
  createWorkoutDouble,
  definitionFixture,
  FIXTURE_SESSION_ID,
  snapshotFixture,
  type SectionFixture,
  type WorkoutDouble,
  type WorkoutDoubleOptions,
} from '../test/workout-double'
import { AUTHENTICATED_HOME } from './guards'
import { routes } from './router'
import { SAVE_FAVORITE_LABEL } from './Summary'
import { COMPLETION_ROUTE } from './Workout'

/** Twelve and a half minutes ago, so the timer has something to read. */
const ELAPSED_SECONDS = 750

/** One finished section, one under way, one untouched — three statuses. */
const SECTIONS: SectionFixture[] = [
  { title: 'Warm-up', blocks: [{ exercises: ['completed'] }] },
  {
    title: 'Primary lift',
    sectionType: 'primary_lift',
    blocks: [
      { structureType: 'emom', timerSeconds: 600, exercises: ['completed', 'not_started'] },
    ],
  },
  // A generated title that is not the type's label: the screen must show
  // `Conditioning` and never `Finisher` (REQ-011).
  {
    title: 'Finisher',
    sectionType: 'conditioning',
    blocks: [{ structureType: 'amrap', timerSeconds: 480 }],
  },
]

function activeSession(sections: SectionFixture[] = SECTIONS) {
  return snapshotFixture({
    sections,
    // Read at render time, so the elapsed reading is exact rather than relative
    // to a fixture timestamp that ages with the repository.
    startedAt: new Date(Date.now() - ELAPSED_SECONDS * 1000).toISOString(),
  })
}

interface Mounted {
  double: WorkoutDouble
  router: ReturnType<typeof createMemoryRouter>
}

/**
 * The app at `/workout`, with Home behind it in history — so `navigate(-1)` is
 * the browser's own Back button, which is the case the requirement names.
 */
function mountWorkout(options: WorkoutDoubleOptions = {}): Mounted {
  const double = createWorkoutDouble({ session: activeSession(), ...options })
  const router = createMemoryRouter(routes, {
    initialEntries: ['/', '/workout'],
    initialIndex: 1,
  })

  render(
    <AppProviders {...signedIn({ workout: double.clients })}>
      <RouterProvider router={router} />
    </AppProviders>,
  )

  return { double, router }
}

/** The shell, once the session has hydrated. */
async function shell(options: WorkoutDoubleOptions = {}): Promise<Mounted> {
  const mounted = mountWorkout(options)
  await screen.findByRole('heading', { level: 1, name: 'Workout' })
  await screen.findByRole('navigation', { name: 'Workout sections' })
  return mounted
}

interface Completing extends Mounted {
  summary: FakeSummaryClient
}

/**
 * The whole loop's tail: Home first, so the streak is read and cached the way
 * it is in use, then into the workout. The summary double answers from the
 * workout double's rows — nothing to debrief until `complete` has run, and then
 * the session that was completed, with the streak it extended.
 */
async function completing(): Promise<Completing> {
  const double = createWorkoutDouble({ session: activeSession() })
  const finished = () => double.completed().length > 0
  const summary = createFakeSummaryClient({
    latest: async () =>
      ok(
        finished()
          ? completedSession({ id: FIXTURE_SESSION_ID, title: 'Full body' })
          : null,
      ),
    streak: async () => ok(fixtureStreak({ days: finished() ? 4 : 3 })),
  })
  const router = createMemoryRouter(routes, { initialEntries: ['/'] })

  render(
    <AppProviders {...signedIn({ summary, workout: double.clients })}>
      <RouterProvider router={router} />
    </AppProviders>,
  )

  await screen.findByRole('heading', { name: HOME_HEADING })
  await waitFor(() => expect(summary.streakCalls.length).toBeGreaterThan(0))
  await router.navigate('/workout')
  await screen.findByRole('navigation', { name: 'Workout sections' })

  return { double, router, summary }
}

/**
 * A closed `<dialog>` keeps its markup, so "which dialog is open" is a
 * question about the `open` attribute rather than about what is in the DOM.
 */
function openDialogs(): HTMLDialogElement[] {
  return Array.from(document.querySelectorAll('dialog[open]'))
}

function dialogTitled(title: string): HTMLElement {
  const match = openDialogs().find(
    (dialog) => dialog.querySelector('h2')?.textContent === title,
  )
  if (match === undefined) {
    const open = openDialogs().map((dialog) => dialog.querySelector('h2')?.textContent)
    throw new Error(`no open dialog titled "${title}"; open: ${JSON.stringify(open)}`)
  }
  return match
}

function isDialogOpen(title: string): boolean {
  return openDialogs().some((dialog) => dialog.querySelector('h2')?.textContent === title)
}

/** Home's page heading, which is where both exits land. */
const HOME_HEADING = 'Today'

/** Summary's page heading, which is where completion lands. */
const SUMMARY_HEADING = 'Nice work'

const ABANDON_CONFIRM = 'Abandon workout?'

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  window.localStorage.clear()
})

// ─────────────────────────────────────────────────────────────────────────────
// The four states
// ─────────────────────────────────────────────────────────────────────────────

describe('Workout — the four states', () => {
  it('waits for the session rather than starting a timer for one it has not got', () => {
    mountWorkout({ sessions: { resume: () => new Promise(() => {}) } })

    expect(screen.getByText('Loading session')).toBeInTheDocument()
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
  })

  it('shows the failure and offers the one recovery action', async () => {
    let attempts = 0
    const user = userEvent.setup()
    mountWorkout({
      sessions: {
        resume: async () => {
          attempts += 1
          return err(createError(ErrorCode.NETWORK_SERVER_ERROR))
        },
      },
    })

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('Your session didn’t load')).toBeInTheDocument()

    await user.click(within(alert).getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(attempts).toBeGreaterThan(1))
  })

  it('sends a visitor with no running session Home rather than rendering an empty shell', async () => {
    mountWorkout({ session: null })

    expect(await screen.findByRole('heading', { name: HOME_HEADING })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Workout sections' })).not.toBeInTheDocument()
  })

  it('is not the shell for a session that has only been prescribed', async () => {
    // A `prescribed` session belongs to Review; the focus mode is about a
    // workout that is actually running.
    mountWorkout({ session: snapshotFixture({ state: 'prescribed', startedAt: null }) })

    expect(await screen.findByRole('heading', { name: HOME_HEADING })).toBeInTheDocument()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// The timer
// ─────────────────────────────────────────────────────────────────────────────

describe('Workout — the global timer', () => {
  it('reads elapsed time from the session, not from the moment the shell mounted', async () => {
    // This is the backgrounding case as the shell meets it: a tab restored
    // twelve minutes in shows 12:30, not 00:00.
    await shell()

    const timer = screen.getByRole('timer', { name: 'Session time' })
    expect(timer).toHaveTextContent('12:30')
    expect(timer).toHaveTextContent('12 minutes 30 seconds')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Navigation and progress
// ─────────────────────────────────────────────────────────────────────────────

describe('Workout — navigation and progress', () => {
  it('opens on the first section that is not finished', async () => {
    await shell()

    expect(screen.getByRole('heading', { name: 'Primary lift' })).toBeInTheDocument()
    expect(screen.getByText('Section 2 / 3 · In progress')).toBeInTheDocument()
  })

  it('reflects each section’s status, derived from the rows', async () => {
    await shell()

    const bar = screen.getByRole('progressbar', { name: 'Section 2 of 3' })
    expect(bar).toHaveAttribute('aria-valuenow', '1')
    expect(bar).toHaveAttribute('aria-valuemax', '3')

    const sections = within(screen.getByRole('list', { name: 'Sections' }))
    expect(sections.getByRole('button', { name: 'Warm-up, complete' })).toBeInTheDocument()
    expect(sections.getByRole('button', { name: 'Primary lift, in progress' })).toHaveAttribute(
      'aria-current',
      'step',
    )
    expect(sections.getByRole('button', { name: 'Conditioning, not started' })).toBeInTheDocument()
  })

  it('labels every section by its type, never by its generated title (REQ-011)', async () => {
    const user = userEvent.setup()
    await shell()

    // The third section's generated title is `Finisher`; its type is conditioning.
    await user.click(screen.getByRole('button', { name: 'Conditioning, not started' }))
    expect(screen.getByRole('heading', { level: 2, name: 'Conditioning' })).toBeInTheDocument()
    expect(screen.queryByText('Finisher')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Finisher/ })).not.toBeInTheDocument()
  })

  it('walks forward and back across every section', async () => {
    const user = userEvent.setup()
    await shell()

    await user.click(screen.getByRole('button', { name: 'Next section' }))
    expect(screen.getByRole('heading', { name: 'Conditioning' })).toBeInTheDocument()
    // The last section: the forward action becomes completion.
    expect(screen.queryByRole('button', { name: 'Next section' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Previous' }))
    expect(screen.getByRole('heading', { name: 'Primary lift' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Previous' }))
    expect(screen.getByRole('heading', { name: 'Warm-up' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
  })

  it('reserves the measured footer for section navigation', async () => {
    await shell()

    const navigation = screen.getByRole('navigation', { name: 'Workout sections' })
    expect(navigation).toHaveClass('clr-actions')
    expect(navigation.closest('.clr-scroll-region__foot')).toBeInTheDocument()
  })

  it('jumps straight to a section from the progress tracker', async () => {
    const user = userEvent.setup()
    await shell()

    await user.click(screen.getByRole('button', { name: 'Conditioning, not started' }))

    expect(screen.getByRole('heading', { name: 'Conditioning' })).toBeInTheDocument()
    expect(screen.getByText('Section 3 / 3 · Not started')).toBeInTheDocument()
  })

  it('states the structure identity of the section’s blocks', async () => {
    const user = userEvent.setup()
    await shell()

    const structures = () =>
      within(screen.getByRole('list', { name: 'Structures in this section' }))
    expect(structures().getByText('EMOM · 10 MIN')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Next section' }))
    expect(structures().getByText('AMRAP · 8 MIN')).toBeInTheDocument()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Focus mode
// ─────────────────────────────────────────────────────────────────────────────

describe('Workout — the focus mode', () => {
  it('offers no in-app way out except completing or abandoning', async () => {
    await shell()

    // No link to History, Settings or Home anywhere in the shell. The only
    // anchor on the page is CORE-05's skip link, which goes into this screen
    // rather than out of it.
    expect(screen.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
      '#main',
    ])
  })

  it('turns browser Back into the abandon confirm rather than leaving', async () => {
    const { double, router } = await shell()

    await router.navigate(-1)

    await waitFor(() => expect(isDialogOpen(ABANDON_CONFIRM)).toBe(true))
    // Still here: nothing was abandoned, and nothing was left behind.
    expect(screen.getByRole('heading', { level: 1, name: 'Workout' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: HOME_HEADING })).not.toBeInTheDocument()
    expect(double.abandoned()).toEqual([])
  })

  it('keeps the session when the confirm is declined, and stays where it was', async () => {
    const user = userEvent.setup()
    const { double, router } = await shell()

    await router.navigate(-1)
    await waitFor(() => expect(isDialogOpen(ABANDON_CONFIRM)).toBe(true))
    await user.click(within(dialogTitled(ABANDON_CONFIRM)).getByRole('button', { name: 'Keep going' }))

    await waitFor(() => expect(isDialogOpen(ABANDON_CONFIRM)).toBe(false))
    expect(screen.getByRole('heading', { name: 'Primary lift' })).toBeInTheDocument()
    expect(double.abandoned()).toEqual([])
    expect(router.state.location.pathname).toBe('/workout')
  })

  it('blocks an in-app navigation the same way it blocks Back', async () => {
    const { router } = await shell()

    await router.navigate('/history')

    await waitFor(() => expect(isDialogOpen(ABANDON_CONFIRM)).toBe(true))
    expect(router.state.location.pathname).toBe('/workout')
  })

  it('abandons through the header control, and lands where the session is resumable', async () => {
    const user = userEvent.setup()
    const { double, router } = await shell()

    await user.click(screen.getByRole('button', { name: 'Abandon' }))
    await waitFor(() => expect(isDialogOpen(ABANDON_CONFIRM)).toBe(true))
    await user.click(within(dialogTitled(ABANDON_CONFIRM)).getByRole('button', { name: 'Abandon' }))

    expect(await screen.findByRole('heading', { name: HOME_HEADING })).toBeInTheDocument()
    // Abandoned is a state, not a delete: the transition is what HOME-01 reads.
    expect(double.abandoned()).toEqual([FIXTURE_SESSION_ID])
    expect(router.state.location.pathname).toBe('/')
    // And the shell's own record is forgotten, so nothing restores a section
    // of a session that has ended.
    expect(window.localStorage.getItem(WORKOUT_SHELL_STORAGE_KEY)).toBeNull()
  })

  it('keeps the session running when the abandon itself fails', async () => {
    const user = userEvent.setup()
    await shell({
      sessions: { abandon: async () => err(createError(ErrorCode.NETWORK_OFFLINE)) },
    })

    await user.click(screen.getByRole('button', { name: 'Abandon' }))
    await user.click(within(dialogTitled(ABANDON_CONFIRM)).getByRole('button', { name: 'Abandon' }))

    expect(await screen.findByText('No connection. Check your network.')).toBeInTheDocument()
    // Nothing discarded, and the workout is still on screen.
    expect(screen.getByRole('heading', { name: 'Primary lift' })).toBeInTheDocument()
  })

  it('completes the session with the time the user actually watched', async () => {
    const user = userEvent.setup()
    const { double } = await shell()

    await user.click(screen.getByRole('button', { name: 'Conditioning, not started' }))
    await user.click(screen.getByRole('button', { name: 'Finish workout' }))

    await screen.findByRole('heading', { level: 1, name: SUMMARY_HEADING })
    expect(double.completed()).toEqual([{ sessionId: FIXTURE_SESSION_ID, minutes: 12 }])
    expect(double.abandoned()).toEqual([])
  })

  it('lands completion on the debrief of the session just completed, not on Home', async () => {
    const user = userEvent.setup()
    const { summary, router } = await completing()

    expect(COMPLETION_ROUTE).toBe('/summary')
    expect(COMPLETION_ROUTE).not.toBe(AUTHENTICATED_HOME)

    await user.click(screen.getByRole('button', { name: 'Conditioning, not started' }))
    await user.click(screen.getByRole('button', { name: 'Finish workout' }))

    expect(await screen.findByText('Full body, done.')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/summary')
    expect(screen.queryByRole('heading', { name: HOME_HEADING })).not.toBeInTheDocument()
    // The debrief's surface, whole: mood, notes, the streak and the favorite.
    expect(screen.getByRole('group', { name: 'How do you feel?' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /Notes/ })).toBeInTheDocument()
    expect(await screen.findByText('4 days')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: SAVE_FAVORITE_LABEL })).toBeInTheDocument()
    // Asked after the completion, so it cannot be an answer cached before it.
    expect(summary.latestCalls).toHaveLength(1)
  })

  it('reads the streak again after completing, rather than the one Home cached', async () => {
    const user = userEvent.setup()
    const { summary, router } = await completing()
    const before = summary.streakCalls.length

    await user.click(screen.getByRole('button', { name: 'Conditioning, not started' }))
    await user.click(screen.getByRole('button', { name: 'Finish workout' }))

    expect(await screen.findByText('4 days')).toBeInTheDocument()
    expect(summary.streakCalls.length).toBeGreaterThan(before)
    expect(router.state.location.pathname).toBe('/summary')
  })

  it('returns Home from the debrief’s Done', async () => {
    const user = userEvent.setup()
    const { summary, router } = await completing()

    await user.click(screen.getByRole('button', { name: 'Conditioning, not started' }))
    await user.click(screen.getByRole('button', { name: 'Finish workout' }))
    await user.click(await screen.findByRole('button', { name: 'Save and close' }))

    expect(await screen.findByRole('heading', { name: HOME_HEADING })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
    expect(summary.saved.map((entry) => entry.sessionId)).toEqual([FIXTURE_SESSION_ID])
  })

  it('keeps the session on screen when completing it fails', async () => {
    const user = userEvent.setup()
    await shell({
      sessions: { complete: async () => err(createError(ErrorCode.NETWORK_TIMEOUT)) },
    })

    await user.click(screen.getByRole('button', { name: 'Conditioning, not started' }))
    await user.click(screen.getByRole('button', { name: 'Finish workout' }))

    expect(await screen.findByText('Request timed out. Try again.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Conditioning' })).toBeInTheDocument()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Leaving the app, which is allowed
// ─────────────────────────────────────────────────────────────────────────────

describe('Workout — closing and backgrounding', () => {
  it('remembers the open section across a close', async () => {
    const user = userEvent.setup()
    await shell()

    await user.click(screen.getByRole('button', { name: 'Conditioning, not started' }))

    const stored: unknown = JSON.parse(
      window.localStorage.getItem(WORKOUT_SHELL_STORAGE_KEY) ?? 'null',
    )
    expect(stored).toMatchObject({ sessionId: FIXTURE_SESSION_ID, sectionIndex: 2 })
  })

  it('reopens on the section the user was looking at', async () => {
    window.localStorage.setItem(
      WORKOUT_SHELL_STORAGE_KEY,
      JSON.stringify({
        sessionId: FIXTURE_SESSION_ID,
        sectionIndex: 0,
        updatedAt: '2026-09-24T09:05:00.000Z',
      }),
    )

    await shell()

    // Where they *were*, not where the rows would have sent them (section 2).
    expect(screen.getByRole('heading', { name: 'Warm-up' })).toBeInTheDocument()
  })

  it('ignores a record left by a different session', async () => {
    window.localStorage.setItem(
      WORKOUT_SHELL_STORAGE_KEY,
      JSON.stringify({
        sessionId: 'a-session-that-ended',
        sectionIndex: 0,
        updatedAt: '2026-09-24T09:05:00.000Z',
      }),
    )

    await shell()

    expect(screen.getByRole('heading', { name: 'Primary lift' })).toBeInTheDocument()
  })

  it('never argues with the platform about leaving', async () => {
    await shell()

    // `beforeunload` is the one API that could stop the user closing the tab,
    // and the requirement is explicit that the trap is not on the user.
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// The forward action — save and continue (REQ-013)
// ─────────────────────────────────────────────────────────────────────────────

describe('Workout — one forward action saves, then continues', () => {
  it('does not turn an untouched circuit counter into an observed zero-round result', async () => {
    const user = userEvent.setup()
    const { double } = await shell({ session: activeSession([
      { sectionType: 'primary_lift', blocks: [{ structureType: 'circuit', rounds: 3,
        exercises: ['not_started', 'not_started'] }] },
      { sectionType: 'cooldown', blocks: [{}] },
    ]) })
    await user.click(screen.getByRole('button', { name: 'Next section' }))
    await screen.findByRole('heading', { name: 'Cooldown' })
    expect(double.recorded()).toHaveLength(1)
    expect(double.recorded()[0]?.outcome).toEqual({})
  })

  it('shows the section just saved as complete without inventing any measured work', async () => {
    const user = userEvent.setup()
    const { double } = await shell()
    await user.click(screen.getByRole('button', { name: 'Next section' }))
    await screen.findByRole('heading', { name: 'Conditioning' })
    expect(screen.getByRole('button', { name: 'Primary lift, complete' })).toBeInTheDocument()
    expect(double.recorded()[0]?.outcome).toEqual({})
  })

  it('keeps the section and entered set when that set has not reached the server', async () => {
    const user = userEvent.setup()
    const log = vi.fn(async () => err(createError(ErrorCode.PERSISTENCE_WRITE_FAILED)))
    const { double } = await shell({
      session: activeSession([
        { sectionType: 'primary_lift', blocks: [{ structureType: 'standard' }] },
        { sectionType: 'cooldown', blocks: [{}] },
      ]),
      setLogs: { log },
    })
    const form = within(screen.getByRole('form', { name: 'Log set 1 of back squat' }))
    await user.type(form.getByLabelText(/^Reps/), '8')
    await user.click(form.getByRole('button', { name: 'Log set 1' }))
    await waitFor(() => expect(log).toHaveBeenCalled())
    await user.click(screen.getByRole('button', { name: 'Next section' }))
    await waitFor(() => expect(isDialogOpen('That didn’t save')).toBe(true))
    expect(screen.getByRole('heading', { name: 'Primary lift' })).toBeInTheDocument()
    expect(double.recorded()).toEqual([])
    expect(double.completed()).toEqual([])
  })

  it('joins the in-flight set save, prevents navigation, and advances only after confirmation', async () => {
    const user = userEvent.setup()
    const persisted = createWorkoutDouble()
    let release: () => void = () => undefined
    const held = new Promise<void>((resolve) => { release = resolve })
    const log = vi.fn(async (entry: SetLogEntry) => {
      await held
      return persisted.clients.setLogs.log(entry)
    })
    const { double } = await shell({
      session: activeSession([
        { sectionType: 'primary_lift', blocks: [{ structureType: 'standard' }] },
        { sectionType: 'cooldown', blocks: [{}] },
      ]),
      setLogs: { log },
    })
    const form = within(screen.getByRole('form', { name: 'Log set 1 of back squat' }))
    await user.type(form.getByLabelText(/^Reps/), '8')
    await user.click(form.getByRole('button', { name: 'Log set 1' }))
    const forward = screen.getByRole('button', { name: 'Next section' })
    act(() => { forward.click(); forward.click() })
    expect(screen.getByRole('heading', { name: 'Primary lift' })).toBeInTheDocument()
    expect(forward).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cooldown, not started' })).toBeDisabled()
    expect(double.recorded()).toEqual([])
    await act(async () => { release(); await held })
    await screen.findByRole('heading', { name: 'Cooldown' })
    expect(log).toHaveBeenCalledTimes(1)
    expect(persisted.loggedSets()).toHaveLength(1)
    expect(persisted.loggedSets()[0]?.performed.reps).toBe(8)
    expect(double.recorded()).toHaveLength(1)
  })

  it('retries a failed entered set with its original identity and saves once before continuing', async () => {
    const user = userEvent.setup()
    const persisted = createWorkoutDouble()
    let refusing = true
    const log = vi.fn(async (entry: SetLogEntry) => refusing
      ? err(createError(ErrorCode.PERSISTENCE_WRITE_FAILED))
      : persisted.clients.setLogs.log(entry))
    const { double } = await shell({
      session: activeSession([
        { sectionType: 'primary_lift', blocks: [{ structureType: 'standard' }] },
        { sectionType: 'cooldown', blocks: [{}] },
      ]),
      setLogs: { log },
    })
    const form = within(screen.getByRole('form', { name: 'Log set 1 of back squat' }))
    await user.type(form.getByLabelText(/^Reps/), '8')
    await user.click(form.getByRole('button', { name: 'Log set 1' }))
    await user.click(screen.getByRole('button', { name: 'Next section' }))
    const failed = await waitFor(() => dialogTitled('That didn’t save'))
    expect(double.recorded()).toEqual([])
    refusing = false
    await user.click(within(failed).getByRole('button', { name: 'Try again' }))
    await screen.findByRole('heading', { name: 'Cooldown' })
    expect(openDialogs()).toEqual([])
    expect(persisted.loggedSets()).toHaveLength(1)
    expect(new Set(log.mock.calls.map(([entry]) => entry.id)).size).toBe(1)
    expect(double.recorded()).toHaveLength(1)
  })

  /** The block ids of a section, in order, as the shell derives them. */
  function blockIdsOf(sections: SectionFixture[], index: number): string[] {
    const section = sessionProgress(activeSession(sections)).sections[index]
    if (section === undefined) throw new Error(`the fixture has no section ${index}`)
    return section.blocks.map((block) => block.blockId)
  }

  /** The AMRAP's live round count, as the athlete reads it. */
  function roundsShown(): string | null {
    return within(screen.getByRole('group', { name: 'Rounds completed' })).getByRole('status')
      .textContent
  }

  /**
   * Runs the Finisher's AMRAP window, then records two rounds after it — the
   * result is entered only once the window has closed (REQ-014).
   */
  async function performTwoRounds(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: 'Start AMRAP' }))
    await user.click(screen.getByRole('button', { name: 'Finish early' }))
    await user.click(screen.getByRole('button', { name: 'Record rounds' }))
    await user.click(screen.getByRole('button', { name: 'Add a completed round' }))
    await user.click(screen.getByRole('button', { name: 'Add a completed round' }))
    expect(roundsShown()).toBe('2')
  }

  /**
   * A `block_results` writer with the table's unique `block_id`: a second row
   * for a block is refused as PostgREST refuses it. The first `failures`
   * writes fail outright, storing nothing.
   */
  function uniqueWriter(failures = 0) {
    const rows: BlockCompletion[] = []
    let remaining = failures
    const record = vi.fn(async (completion: BlockCompletion) => {
      if (remaining > 0) {
        remaining -= 1
        return err(createError(ErrorCode.PERSISTENCE_WRITE_FAILED))
      }
      if (rows.some((row) => row.blockId === completion.blockId)) {
        return err(
          createError(ErrorCode.PERSISTENCE_CONFLICT, { details: { pgCode: '23505' } }),
        )
      }
      rows.push(completion)
      return ok({} as BlockResultRow)
    })
    return { rows, record }
  }

  it('saves the open section’s explicit completion with no effort, then shows the next section', async () => {
    const user = userEvent.setup()
    const { double } = await shell()

    await user.click(screen.getByRole('button', { name: 'Next section' }))

    expect(await screen.findByRole('heading', { name: 'Conditioning' })).toBeInTheDocument()
    expect(double.recorded()).toEqual([
      { blockId: blockIdsOf(SECTIONS, 1)[0], outcome: {}, perceivedEffort: null },
    ])
    // No effort question and no per-block completion: the one action is the footer's.
    expect(openDialogs()).toEqual([])
    expect(screen.queryByRole('button', { name: /^Complete / })).not.toBeInTheDocument()
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
  })

  it('saves every block of a multi-block section in that one action', async () => {
    const MULTI: SectionFixture[] = [
      {
        title: 'Conditioning',
        sectionType: 'conditioning',
        blocks: [
          { structureType: 'emom', timerSeconds: 600 },
          { structureType: 'for_time', timerSeconds: 600 },
        ],
      },
      { title: 'Cooldown', sectionType: 'cooldown', blocks: [{ exercises: ['not_started'] }] },
    ]
    const user = userEvent.setup()
    const { double } = await shell({ session: activeSession(MULTI) })

    await user.click(screen.getByRole('button', { name: 'Next section' }))

    expect(await screen.findByRole('heading', { name: 'Cooldown' })).toBeInTheDocument()
    expect(double.recorded().map((completion) => completion.blockId)).toEqual(
      blockIdsOf(MULTI, 0),
    )
    // Missing counts did not block it, and none was made up.
    expect(double.recorded().map((completion) => completion.outcome)).toEqual([{}, {}])
  })

  it('finishes the workout on the last section with the same save, and never fabricates a count', async () => {
    const user = userEvent.setup()
    const { double } = await shell()

    // Jumped to, never performed: the tap is not an observation.
    await user.click(screen.getByRole('button', { name: 'Conditioning, not started' }))
    await user.click(screen.getByRole('button', { name: 'Finish workout' }))

    await screen.findByRole('heading', { level: 1, name: SUMMARY_HEADING })
    expect(double.recorded()).toEqual([
      { blockId: blockIdsOf(SECTIONS, 2)[0], outcome: {}, perceivedEffort: null },
    ])
    expect(double.completed()).toEqual([{ sessionId: FIXTURE_SESSION_ID, minutes: 12 }])
  })

  it('saves the rounds the athlete entered, as entered', async () => {
    const user = userEvent.setup()
    const { double } = await shell()

    await user.click(screen.getByRole('button', { name: 'Conditioning, not started' }))
    await performTwoRounds(user)
    await user.click(screen.getByRole('button', { name: 'Finish workout' }))

    await screen.findByRole('heading', { level: 1, name: SUMMARY_HEADING })
    expect(double.recorded()).toHaveLength(1)
    expect(double.recorded()[0]?.outcome).toMatchObject({ roundsCompleted: 2 })
    expect(double.recorded()[0]?.perceivedEffort).toBeNull()
  })

  it('keeps the athlete on the section with input preserved when the save fails, and retries once', async () => {
    const user = userEvent.setup()
    const writer = uniqueWriter(1)
    const { double } = await shell({ blockResults: { record: writer.record } })

    await user.click(screen.getByRole('button', { name: 'Conditioning, not started' }))
    await performTwoRounds(user)
    await user.click(screen.getByRole('button', { name: 'Finish workout' }))

    const failed = await waitFor(() => dialogTitled('That didn’t save'))
    expect(within(failed).getByText('Could not save. Try again.')).toBeInTheDocument()
    // Still here, still holding what was entered, and not finished.
    expect(screen.getByRole('heading', { name: 'Conditioning' })).toBeInTheDocument()
    expect(roundsShown()).toBe('2')
    expect(double.completed()).toEqual([])

    await user.click(within(failed).getByRole('button', { name: 'Try again' }))

    await screen.findByRole('heading', { level: 1, name: SUMMARY_HEADING })
    expect(writer.rows).toHaveLength(1)
    expect(writer.rows[0]?.outcome).toMatchObject({ roundsCompleted: 2 })
    expect(double.completed()).toHaveLength(1)
  })

  it('keeps entries through backward navigation after a failed save, and saves each block once', async () => {
    const user = userEvent.setup()
    const writer = uniqueWriter(1)
    await shell({ blockResults: { record: writer.record } })

    await user.click(screen.getByRole('button', { name: 'Conditioning, not started' }))
    await performTwoRounds(user)
    await user.click(screen.getByRole('button', { name: 'Finish workout' }))
    const failed = await waitFor(() => dialogTitled('That didn’t save'))
    await user.click(within(failed).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(isDialogOpen('That didn’t save')).toBe(false))

    // Back a section, then forward through it: that section is saved on the
    // way, and the AMRAP comes back holding what was entered.
    await user.click(screen.getByRole('button', { name: 'Previous' }))
    expect(screen.getByRole('heading', { name: 'Primary lift' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Next section' }))
    expect(await screen.findByRole('heading', { name: 'Conditioning' })).toBeInTheDocument()
    expect(roundsShown()).toBe('2')

    await user.click(screen.getByRole('button', { name: 'Finish workout' }))

    await screen.findByRole('heading', { level: 1, name: SUMMARY_HEADING })
    expect(writer.rows.map((row) => row.blockId)).toEqual([
      blockIdsOf(SECTIONS, 1)[0],
      blockIdsOf(SECTIONS, 2)[0],
    ])
    expect(writer.rows[1]?.outcome).toMatchObject({ roundsCompleted: 2 })
  })

  it('keeps entries across leaving and returning, and a resaved section writes no duplicate', async () => {
    const user = userEvent.setup()
    const writer = uniqueWriter()
    const double = createWorkoutDouble({
      session: activeSession(),
      blockResults: { record: writer.record },
    })
    const mountWith = () =>
      render(
        <AppProviders {...signedIn({ workout: double.clients })}>
          <RouterProvider
            router={createMemoryRouter(routes, {
              initialEntries: ['/', '/workout'],
              initialIndex: 1,
            })}
          />
        </AppProviders>,
      )

    const first = mountWith()
    await screen.findByRole('navigation', { name: 'Workout sections' })
    await user.click(screen.getByRole('button', { name: 'Next section' }))
    await screen.findByRole('heading', { name: 'Conditioning' })
    await performTwoRounds(user)

    // The tab is closed and reopened: nothing held in memory survives.
    first.unmount()
    mountWith()
    await screen.findByRole('navigation', { name: 'Workout sections' })

    expect(screen.getByRole('heading', { name: 'Conditioning' })).toBeInTheDocument()
    expect(roundsShown()).toBe('2')

    // Revisiting a saved section and pressing forward again: its row already
    // exists, so the save holds rather than failing or writing a second one.
    await user.click(screen.getByRole('button', { name: 'Previous' }))
    await user.click(screen.getByRole('button', { name: 'Next section' }))
    expect(await screen.findByRole('heading', { name: 'Conditioning' })).toBeInTheDocument()
    expect(openDialogs()).toEqual([])

    await user.click(screen.getByRole('button', { name: 'Finish workout' }))
    await screen.findByRole('heading', { level: 1, name: SUMMARY_HEADING })
    expect(writer.rows.map((row) => row.blockId)).toEqual([
      blockIdsOf(SECTIONS, 1)[0],
      blockIdsOf(SECTIONS, 2)[0],
    ])
  })

  it('saves nothing on Previous or a jump, marks no skipped section complete, and leaves the clock alone', async () => {
    const user = userEvent.setup()
    const { double } = await shell()

    await user.click(screen.getByRole('button', { name: 'Conditioning, not started' }))
    await user.click(screen.getByRole('button', { name: 'Previous' }))
    await user.click(screen.getByRole('button', { name: 'Warm-up, complete' }))

    expect(double.recorded()).toEqual([])
    const sections = within(screen.getByRole('list', { name: 'Sections' }))
    expect(sections.getByRole('button', { name: 'Conditioning, not started' })).toBeInTheDocument()
    expect(screen.getByRole('timer', { name: 'Session time' })).toHaveTextContent('12:30')
  })
})

describe('Workout — coaching and notes', () => {
  /** One movement per section, so each panel on screen names one card. */
  const COACHED: SectionFixture[] = [
    { title: 'Primary lift', sectionType: 'primary_lift', blocks: [{ exercises: ['not_started'] }] },
    { title: 'Finisher', sectionType: 'conditioning', blocks: [{ exercises: ['not_started'] }] },
  ]
  const PANEL = 'Coaching and notes — back squat'

  function coached(options: WorkoutDoubleOptions = {}) {
    return shell({ session: activeSession(COACHED), ...options })
  }

  it('shows the cues and regression the library authored, in the shell', async () => {
    const user = userEvent.setup()
    await coached({ definitions: { 'back-squat': definitionFixture() } })

    await user.click(screen.getByRole('button', { name: PANEL }))
    const panel = screen.getByRole('region', { name: PANEL })

    expect(await within(panel).findByText('Brace before you descend')).toBeInTheDocument()
    expect(within(panel).getByText('Knees track over the toes')).toBeInTheDocument()
    expect(within(panel).getByText('Goblet squat')).toBeInTheDocument()
  })

  it('shows no legacy overview or section introduction, and keeps cues, labels and work (REQ-010)', async () => {
    const OVERVIEW = 'Squat-led session with unilateral accessory work.'
    const SECTION_NOTE = 'Build to a heavy set of five.'
    const plain = snapshotFixture({
      sections: COACHED,
      session: { overview: OVERVIEW },
      startedAt: new Date(Date.now() - ELAPSED_SECONDS * 1000).toISOString(),
    })
    const legacy = {
      ...plain,
      sections: plain.sections.map((entry) => ({
        ...entry,
        section: { ...entry.section, section_notes: SECTION_NOTE },
      })),
    }
    const user = userEvent.setup()
    await shell({ session: legacy, definitions: { 'back-squat': definitionFixture() } })

    // The section label, the clock and the library's coaching still render;
    // the prose never does.
    expect(screen.getByRole('heading', { name: 'Primary lift' })).toBeInTheDocument()
    expect(screen.getByRole('timer', { name: 'Session time' })).toHaveTextContent('12:30')

    await user.click(screen.getByRole('button', { name: PANEL }))
    const panel = screen.getByRole('region', { name: PANEL })
    expect(await within(panel).findByText('Brace before you descend')).toBeInTheDocument()
    expect(within(panel).getByText('Goblet squat')).toBeInTheDocument()
    expect(document.body).not.toHaveTextContent(OVERVIEW)
    expect(document.body).not.toHaveTextContent(SECTION_NOTE)

    // The next section opens with its own label and work, and still no prose.
    await user.click(screen.getByRole('button', { name: 'Next section' }))
    expect(await screen.findByRole('heading', { name: 'Conditioning' })).toBeInTheDocument()
    expect(document.body).not.toHaveTextContent(SECTION_NOTE)
  })

  it('says a movement with no cues and no regression has none', async () => {
    const user = userEvent.setup()
    await coached({
      definitions: {
        'back-squat': definitionFixture({ coaching_cues: [], regression: null }),
      },
    })

    await user.click(screen.getByRole('button', { name: PANEL }))
    const panel = screen.getByRole('region', { name: PANEL })

    expect(await within(panel).findByText(NO_CUES_TEXT)).toBeInTheDocument()
    expect(within(panel).getByText(NO_REGRESSION_TEXT)).toBeInTheDocument()
  })

  it('keeps set logging working beside a failed library read', async () => {
    const user = userEvent.setup()
    const { double } = await coached({
      exercises: {
        definition: async () => err(createError(ErrorCode.PERSISTENCE_READ_FAILED)),
      },
    })

    await user.click(screen.getByRole('button', { name: PANEL }))
    const panel = screen.getByRole('region', { name: PANEL })
    expect(await within(panel).findByRole('alert')).toHaveTextContent(
      'Coaching for back squat didn’t load',
    )
    // The failure is the panel's: the shell raised no dialog over the set form.
    expect(screen.queryByRole('dialog')).toBeNull()

    const form = within(screen.getByRole('form', { name: 'Log set 1 of back squat' }))
    await user.type(form.getByLabelText(/^Reps/), '8')
    await user.click(form.getByRole('button', { name: 'Log set 1' }))

    await waitFor(() => expect(double.loggedSets()).toHaveLength(1))
  })

  it('persists a note to the exercise row and keeps it across sections', async () => {
    const user = userEvent.setup()
    const { double } = await coached()
    const exerciseId = firstExerciseId(double)

    await user.click(screen.getByRole('button', { name: PANEL }))
    const panel = screen.getByRole('region', { name: PANEL })
    await user.type(
      within(panel).getByRole('textbox', { name: /Notes — back squat/ }),
      'Left knee felt tight',
    )
    await user.click(within(panel).getByRole('button', { name: 'Save note — back squat' }))

    expect(await within(panel).findByText(NOTE_SAVED_TEXT)).toBeInTheDocument()
    expect(double.savedNotes()).toEqual([{ exerciseId, notes: 'Left knee felt tight' }])

    // The card is remounted on the way back; the note it shows is the stored one.
    await user.click(screen.getByRole('button', { name: /^Conditioning/ }))
    await user.click(screen.getByRole('button', { name: /^Primary lift/ }))
    expect(screen.getByRole('textbox', { name: /Notes — back squat/ })).toHaveValue(
      'Left knee felt tight',
    )
  })

  it('reports a failed note write and keeps the typed text', async () => {
    const user = userEvent.setup()
    await coached({
      exercises: {
        saveNotes: async () => err(createError(ErrorCode.PERSISTENCE_WRITE_FAILED)),
      },
    })

    await user.click(screen.getByRole('button', { name: PANEL }))
    const panel = screen.getByRole('region', { name: PANEL })
    const field = within(panel).getByRole('textbox', { name: /Notes — back squat/ })
    await user.type(field, 'Grip slipped')
    await user.click(within(panel).getByRole('button', { name: 'Save note — back squat' }))

    expect(await within(panel).findByText(NOTE_FAILED_TEXT)).toBeInTheDocument()
    expect(within(panel).queryByText(NOTE_SAVED_TEXT)).toBeNull()
    expect(field).toHaveValue('Grip slipped')
  })
})

/** The `workout_exercises.id` of the first movement in the first section. */
function firstExerciseId(double: WorkoutDouble): string {
  const stored = double.stored()
  if (stored === null) throw new Error('The double holds no session')
  return stored.sections[0].blocks[0].exercises[0].exercise.id
}
// ─────────────────────────────────────────────────────────────────────────────
// Rest (EXE-05)
// ─────────────────────────────────────────────────────────────────────────────

describe('Workout — the session’s one rest', () => {
  /**
   * One section, four ways a prescription can speak about rest: its own
   * `rest_seconds`, none at all, and a superset whose rest is the block's and
   * comes after the pair.
   */
  const REST_SECTIONS: SectionFixture[] = [
    {
      title: 'Strength',
      sectionType: 'primary_lift',
      blocks: [
        { exercises: [{ prescription: { exercise_id: 'back-squat', rest_seconds: 90 } }] },
        { exercises: [{ prescription: { exercise_id: 'plank', rest_seconds: null } }] },
        { exercises: [{ prescription: { exercise_id: 'dead-bug', rest_seconds: 0 } }] },
        {
          structureType: 'superset',
          roundRestSeconds: 60,
          exercises: [
            { prescription: { exercise_id: 'bench-press', rest_seconds: 90 } },
            { prescription: { exercise_id: 'barbell-row', rest_seconds: 90 } },
          ],
        },
      ],
    },
  ]

  /** The wall clock every rest reading is taken from, moved by the test. */
  let clock = 0

  beforeEach(() => {
    clock = Date.now()
    vi.spyOn(Date, 'now').mockImplementation(() => clock)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function advance(seconds: number) {
    clock += seconds * 1000
  }

  function restShell() {
    return shell({ session: activeSession(REST_SECTIONS) })
  }

  async function logSet(name: string, setNumber: number) {
    const user = userEvent.setup()
    const form = within(
      screen.getByRole('form', { name: `Log set ${setNumber} of ${name}` }),
    )
    await user.click(form.getByRole('button', { name: `Log set ${setNumber}` }))
  }

  function restBars(): HTMLElement[] {
    return screen.queryAllByRole('region', { name: 'Rest' })
  }

  /** The countdown inside the one bar — scoped, so no renderer's own timer answers. */
  function restTimer(): HTMLElement {
    return within(screen.getByRole('region', { name: 'Rest' })).getByRole('timer', {
      name: 'Time remaining',
    })
  }

  /** What the platform fires when a backgrounded tab comes back. */
  function returnToForeground() {
    act(() => {
      window.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new Event('focus'))
    })
  }

  it('draws no rest bar before any set is logged', async () => {
    await restShell()

    expect(restBars()).toEqual([])
  })

  it('starts the movement’s own rest when a set is logged', async () => {
    await restShell()

    await logSet('back squat', 1)

    const [bar] = restBars()
    expect(restBars()).toHaveLength(1)
    expect(within(bar).getByText('Rest after back squat')).toBeInTheDocument()
    expect(restTimer()).toHaveTextContent('01:30')
    expect(within(bar).getByRole('button', { name: 'Skip rest' })).toBeInTheDocument()
    expect(within(bar).getByRole('button', { name: 'Add 30s' })).toBeInTheDocument()
  })

  it('starts none, and draws no bar, for a prescription with no rest', async () => {
    await restShell()

    await logSet('plank', 1)
    await logSet('dead bug', 1)

    await screen.findByRole('form', { name: 'Log set 2 of dead bug' })
    expect(restBars()).toEqual([])
    expect(screen.queryByText(/Rest: 0|00:00/)).not.toBeInTheDocument()
  })

  it('rests a superset once, after the pair, for the block’s own number', async () => {
    await restShell()

    await logSet('bench press', 1)
    // A1 → A2 has no rest by definition, whatever A1's own column says.
    expect(restBars()).toEqual([])

    await logSet('barbell row', 1)
    expect(restBars()).toHaveLength(1)
    expect(screen.getByText('Rest after barbell row')).toBeInTheDocument()
    expect(restTimer()).toHaveTextContent('01:00')
  })

  it('replaces the running rest when another set is logged, rather than queueing one', async () => {
    await restShell()

    await logSet('back squat', 1)
    advance(40)
    returnToForeground()
    expect(restTimer()).toHaveTextContent('00:50')

    await logSet('barbell row', 1)

    expect(restBars()).toHaveLength(1)
    expect(screen.getByText('Rest after barbell row')).toBeInTheDocument()
    expect(screen.queryByText('Rest after back squat')).not.toBeInTheDocument()
    expect(restTimer()).toHaveTextContent('01:00')

    await logSet('back squat', 2)
    expect(restBars()).toHaveLength(1)
    expect(restTimer()).toHaveTextContent('01:30')
  })

  it('reads the wall clock after backgrounding, and leaves the screen when the rest elapses', async () => {
    await restShell()

    await logSet('back squat', 1)
    advance(75)
    returnToForeground()
    expect(restTimer()).toHaveTextContent('00:15')
    expect(screen.getByText('15 seconds left')).toBeInTheDocument()

    advance(15)
    returnToForeground()
    expect(restBars()).toEqual([])
  })

  it('extends and skips the rest from the bar', async () => {
    const user = userEvent.setup()
    await restShell()

    await logSet('back squat', 1)
    advance(60)
    await user.click(screen.getByRole('button', { name: 'Add 30s' }))
    expect(restTimer()).toHaveTextContent('01:00')

    await user.click(screen.getByRole('button', { name: 'Skip rest' }))
    expect(restBars()).toEqual([])
    // Skipping ends the rest and records nothing: the set is still the set.
    expect(screen.getByRole('form', { name: 'Log set 2 of back squat' })).toBeInTheDocument()
  })

  it('keeps the rest when the user moves between sections, because the session owns it', async () => {
    const user = userEvent.setup()
    await shell({
      session: activeSession([...REST_SECTIONS, { title: 'Finisher', sectionType: 'conditioning', blocks: [{}] }]),
    })

    await logSet('back squat', 1)
    await user.click(screen.getByRole('button', { name: 'Next section' }))

    expect(restBars()).toHaveLength(1)
    expect(restTimer()).toHaveTextContent('01:30')
  })

  it('fires no list or route motion when the bar appears in the tap that logs a set', async () => {
    await restShell()

    await logSet('back squat', 1)

    const [bar] = restBars()
    const animated = [bar, ...Array.from(bar.querySelectorAll('*'))].filter((node) =>
      /route-enter|clr-boot|clr-reveal|clr-scan/.test(node.getAttribute('class') ?? ''),
    )
    expect(animated).toEqual([])
  })

  // ── 0.14.3: timer cards, the low state and the view's one loop ────────────

  /** The rest's own card body, whose role is what the low state changes. */
  function restBody(): HTMLElement {
    const body = restBars()[0]?.querySelector<HTMLElement>('.clr-card__body')
    if (!body) throw new Error('no rest card body')
    return body
  }

  /** Every card the shell draws that sits inside another card — never any. */
  function nestedCards(): Element[] {
    return Array.from(document.querySelectorAll('.clr-card')).filter(
      (card) => card.parentElement?.closest('.clr-card') != null,
    )
  }

  /** Under reduced motion, as the platform reports it. */
  function preferReducedMotion() {
    const original = window.matchMedia
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
      ...original(query),
      matches: query === '(prefers-reduced-motion: reduce)',
    }))
  }

  const COACHING_PANEL = 'Coaching and notes — back squat'

  it('draws the session timer and the rest as two self-framed cards, neither inside another', async () => {
    await restShell()
    await logSet('back squat', 1)

    const session = screen.getByRole('timer', { name: 'Session time' })
    expect(session.closest('.clr-card')).not.toBeNull()
    expect(restTimer().closest('.clr-card')).not.toBe(session.closest('.clr-card'))
    expect(restBody()).toHaveClass('clr-chamfer--timer')
    expect(nestedCards()).toEqual([])
  })

  it('keeps an active rest still and in the timer role until its final ten seconds', async () => {
    await restShell()
    await logSet('back squat', 1)

    const [bar] = restBars()
    expect(bar).toHaveAttribute('data-urgent', 'false')
    expect(bar).not.toHaveClass('clr-pulse-micro')
    expect(bar).toHaveAttribute('data-loop', 'still')
    expect(restBody()).not.toHaveClass('clr-chamfer--timer-low')
    expect(screen.queryByText('Final 10 seconds')).not.toBeInTheDocument()
  })

  it('takes the low state for the final ten seconds, on the rest alone and with no glow', async () => {
    await restShell()
    await logSet('back squat', 1)
    advance(81)
    returnToForeground()

    const [bar] = restBars()
    expect(restTimer()).toHaveTextContent('00:09')
    expect(bar).toHaveAttribute('data-urgent', 'true')
    expect(bar).toHaveClass('clr-pulse-micro')
    expect(bar).toHaveAttribute('data-loop', 'run')
    expect(restBody()).toHaveClass('clr-chamfer--timer-low')
    // The milestone is the one thing that speaks; the timers stay labelled
    // and not live.
    expect(within(bar).getByRole('status')).toHaveTextContent('Final 10 seconds')
    for (const timer of screen.getAllByRole('timer')) {
      expect(timer).not.toHaveAttribute('aria-live')
    }

    // Only the primary action glows: no timer, urgent or not, takes a glow of
    // its own, and the session's own timer takes no low state.
    for (const glow of document.querySelectorAll('.clr-glow')) {
      expect(glow.querySelector('[role="timer"]')).toBeNull()
      expect(glow.firstElementChild?.tagName).toBe('BUTTON')
    }
    expect(bar.querySelector('.clr-glow')).toBeNull()
    const session = screen.getByRole('timer', { name: 'Session time' })
    expect(session).not.toHaveClass('clr-chamfer--timer-low')
    expect(session.closest('.clr-pulse-micro')).toBeNull()
    expect(document.querySelectorAll('.clr-pulse-micro')).toHaveLength(1)
  })

  it.each(['skip', 'expiry'] as const)(
    'hands the one loop back to coaching after urgent rest ends by %s',
    async (ending) => {
      const user = userEvent.setup()
      await shell({
        session: activeSession(REST_SECTIONS),
        exercises: { definition: () => new Promise(() => {}) },
      })
      await logSet('back squat', 1)
      advance(82)
      returnToForeground()

      await user.click(screen.getByRole('button', { name: COACHING_PANEL }))
      const panel = screen.getByRole('region', { name: COACHING_PANEL })
      const wait = within(panel)
        .getAllByRole('status')
        .find((status) => status.textContent?.includes('Reading coaching for back squat'))
      if (!wait) throw new Error('no coaching wait')
      expect(wait).toHaveAttribute('aria-busy', 'true')

      // The low rest outranks the wait; the wait is stilled, not removed.
      expect(restBars()[0]).toHaveAttribute('data-loop', 'run')
      expect(wait).toHaveAttribute('data-loop', 'still')
      expect(document.querySelectorAll('[data-loop="run"]')).toHaveLength(1)

      // The visible wait must regain the loop; a closed dialog owns no hidden claim.
      if (ending === 'skip') {
        await user.click(screen.getByRole('button', { name: 'Skip rest' }))
      } else {
        advance(8)
        returnToForeground()
      }
      expect(restBars()).toEqual([])
      expect(wait).toHaveAttribute('aria-busy', 'true')
      expect(wait).toHaveTextContent('Reading coaching for back squat')
      expect(wait).toHaveAttribute('data-loop', 'run')
      expect(document.querySelectorAll('[data-loop="run"]')).toHaveLength(1)
      expect(document.querySelectorAll('dialog:not([open]) [data-loop="run"]')).toHaveLength(0)
    },
  )

  it('coordinates a low AMRAP window with the low session rest across navigation', async () => {
    const user = userEvent.setup()
    await shell({
      session: activeSession([
        ...REST_SECTIONS,
        {
          title: 'Finisher',
          sectionType: 'conditioning',
          blocks: [{ structureType: 'amrap', timerType: 'countdown', timerSeconds: 480 }],
        },
      ]),
    })
    await user.click(screen.getByRole('button', { name: /^Conditioning,/ }))
    await user.click(screen.getByRole('button', { name: 'Start AMRAP' }))
    advance(420)
    returnToForeground()
    await user.click(screen.getByRole('button', { name: /^Primary lift,/ }))
    await logSet('bench press', 1)
    await logSet('barbell row', 1)
    advance(52)
    returnToForeground()
    await user.click(screen.getByRole('button', { name: /^Conditioning,/ }))

    const lowOwners = Array.from(document.querySelectorAll('[data-urgent="true"]'))
    expect(lowOwners).toHaveLength(2)
    expect(lowOwners.map((owner) => owner.getAttribute('data-loop')).sort()).toEqual(['run', 'still'])
    for (const owner of lowOwners) {
      expect(
        owner.matches('.clr-pulse-micro') || owner.querySelector('.clr-pulse-micro') !== null,
      ).toBe(true)
      expect(owner.querySelector('[role="timer"]')).toHaveTextContent('00:08')
    }
    expect(document.querySelectorAll('[data-loop="run"]')).toHaveLength(1)
    expect(document.querySelectorAll('dialog:not([open]) [data-loop="run"]')).toHaveLength(0)
    expect(restTimer()).toHaveTextContent('00:08')
  })

  it('coordinates a low Circuit round rest with the low session rest across navigation', async () => {
    const user = userEvent.setup()
    await shell({
      session: activeSession([
        ...REST_SECTIONS,
        {
          title: 'Finisher',
          sectionType: 'conditioning',
          blocks: [{
            structureType: 'circuit',
            rounds: 2,
            roundRestSeconds: 90,
            exercises: ['not_started'],
          }],
        },
      ]),
    })
    await user.click(screen.getByRole('button', { name: /^Conditioning,/ }))
    await user.click(screen.getByRole('button', { name: 'Finish round 1' }))
    advance(30)
    returnToForeground()
    await user.click(screen.getByRole('button', { name: /^Primary lift,/ }))
    await logSet('bench press', 1)
    await logSet('barbell row', 1)
    advance(52)
    returnToForeground()
    await user.click(screen.getByRole('button', { name: /^Conditioning,/ }))

    const lowOwners = Array.from(document.querySelectorAll('[data-urgent="true"]'))
    expect(lowOwners).toHaveLength(2)
    expect(lowOwners.map((owner) => owner.getAttribute('data-loop')).sort()).toEqual(['run', 'still'])
    for (const owner of lowOwners) {
      expect(
        owner.matches('.clr-pulse-micro') || owner.querySelector('.clr-pulse-micro') !== null,
      ).toBe(true)
      expect(owner.querySelector('[role="timer"]')).toHaveTextContent('00:08')
    }
    expect(document.querySelectorAll('[data-loop="run"]')).toHaveLength(1)
    expect(document.querySelectorAll('dialog:not([open]) [data-loop="run"]')).toHaveLength(0)
    expect(restTimer()).toHaveTextContent('00:08')
  })

  it('groups coaching inside its own card, with every label inside the group', async () => {
    const user = userEvent.setup()
    await shell({
      session: activeSession(REST_SECTIONS),
      definitions: { 'back-squat': definitionFixture() },
    })
    await logSet('back squat', 1)

    await user.click(screen.getByRole('button', { name: COACHING_PANEL }))
    const panel = screen.getByRole('region', { name: COACHING_PANEL })
    expect(await within(panel).findByText('Cues')).toBeInTheDocument()
    expect(within(panel).getByText('Regression')).toBeInTheDocument()
    expect(within(panel).getByRole('list', { name: 'Coaching cues' })).toBeInTheDocument()
    expect(nestedCards()).toEqual([])
  })

  it('keeps every word, digit and colour of the low state under reduced motion', async () => {
    preferReducedMotion()
    await restShell()
    await logSet('back squat', 1)
    advance(85)
    returnToForeground()

    const [bar] = restBars()
    expect(restTimer()).toHaveTextContent('00:05')
    expect(within(bar).getByRole('status')).toHaveTextContent('Final 10 seconds')
    expect(restBody()).toHaveClass('clr-chamfer--timer-low')
    expect(bar).toHaveAttribute('data-loop', 'still')
    expect(document.querySelectorAll('[data-loop="run"]')).toHaveLength(0)
  })

  it('claims no loop for a section clock that has not been started', async () => {
    await shell({
      session: activeSession([
        {
          title: 'Conditioning',
          sectionType: 'conditioning',
          blocks: [
            {
              structureType: 'emom',
              timerType: 'per_minute',
              timerSeconds: 600,
              exercises: ['not_started', 'not_started'],
            },
          ],
        },
      ]),
    })

    expect(screen.getByRole('button', { name: 'Start EMOM' })).toBeInTheDocument()
    expect(screen.queryByRole('timer', { name: 'Time remaining' })).not.toBeInTheDocument()
    // Nothing on the visible shell is moving: no countdown, no urgency, no loop.
    expect(document.querySelectorAll('[data-loop="run"]')).toHaveLength(0)
    expect(document.querySelector('[data-urgent="true"]')).toBeNull()
    expect(document.querySelector('.clr-chamfer--timer-low')).toBeNull()
  })

  it('leaves global time and the finish untouched by a running rest', async () => {
    const user = userEvent.setup()
    const { double } = await shell({
      session: activeSession([...REST_SECTIONS, { title: 'Finisher', sectionType: 'conditioning', blocks: [{}] }]),
    })

    await logSet('back squat', 1)
    advance(60)
    returnToForeground()
    expect(restTimer()).toHaveTextContent('00:30')
    await waitFor(() =>
      expect(screen.getByRole('timer', { name: 'Session time' })).toHaveTextContent('13:30'),
    )

    await user.click(screen.getByRole('button', { name: 'Next section' }))
    await user.click(screen.getByRole('button', { name: 'Finish workout' }))

    await screen.findByRole('heading', { level: 1, name: SUMMARY_HEADING })
    expect(double.completed()).toEqual([{ sessionId: FIXTURE_SESSION_ID, minutes: 13 }])
    expect(double.loggedSets()).toHaveLength(1)
    expect(restBars()).toEqual([])
  })

  it('abandons from an urgent rest and lands Home with no rest left behind', async () => {
    const user = userEvent.setup()
    const { double } = await restShell()
    await logSet('back squat', 1)
    advance(85)
    returnToForeground()

    await user.click(screen.getByRole('button', { name: 'Abandon' }))
    await waitFor(() => expect(isDialogOpen(ABANDON_CONFIRM)).toBe(true))
    await user.click(within(dialogTitled(ABANDON_CONFIRM)).getByRole('button', { name: 'Abandon' }))

    expect(await screen.findByRole('heading', { name: HOME_HEADING })).toBeInTheDocument()
    expect(double.abandoned()).toEqual([FIXTURE_SESSION_ID])
    expect(restBars()).toEqual([])
    expect(document.querySelectorAll('.clr-pulse-micro')).toHaveLength(0)
  })
})
