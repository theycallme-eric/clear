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
 * And the sixth thing the shell owns: **block completion**. Every structure
 * type writes its `block_results` row through this one path, with perceived
 * effort captured once, by the shell's dialog.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createError, err, ErrorCode, ok } from '../state/errors'
import { WORKOUT_SHELL_STORAGE_KEY } from '../state/workout-persistence'
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
  { title: 'Finisher', blocks: [{ structureType: 'amrap', timerSeconds: 480 }] },
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
    expect(sections.getByRole('button', { name: 'Finisher, not started' })).toBeInTheDocument()
  })

  it('walks forward and back across every section', async () => {
    const user = userEvent.setup()
    await shell()

    await user.click(screen.getByRole('button', { name: 'Next section' }))
    expect(screen.getByRole('heading', { name: 'Finisher' })).toBeInTheDocument()
    // The last section: the forward action becomes completion.
    expect(screen.queryByRole('button', { name: 'Next section' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Previous' }))
    expect(screen.getByRole('heading', { name: 'Primary lift' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Previous' }))
    expect(screen.getByRole('heading', { name: 'Warm-up' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
  })

  it('jumps straight to a section from the progress tracker', async () => {
    const user = userEvent.setup()
    await shell()

    await user.click(screen.getByRole('button', { name: 'Finisher, not started' }))

    expect(screen.getByRole('heading', { name: 'Finisher' })).toBeInTheDocument()
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

    await user.click(screen.getByRole('button', { name: 'Finisher, not started' }))
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

    await user.click(screen.getByRole('button', { name: 'Finisher, not started' }))
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

    await user.click(screen.getByRole('button', { name: 'Finisher, not started' }))
    await user.click(screen.getByRole('button', { name: 'Finish workout' }))

    expect(await screen.findByText('4 days')).toBeInTheDocument()
    expect(summary.streakCalls.length).toBeGreaterThan(before)
    expect(router.state.location.pathname).toBe('/summary')
  })

  it('returns Home from the debrief’s Done', async () => {
    const user = userEvent.setup()
    const { summary, router } = await completing()

    await user.click(screen.getByRole('button', { name: 'Finisher, not started' }))
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

    await user.click(screen.getByRole('button', { name: 'Finisher, not started' }))
    await user.click(screen.getByRole('button', { name: 'Finish workout' }))

    expect(await screen.findByText('Request timed out. Try again.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Finisher' })).toBeInTheDocument()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Leaving the app, which is allowed
// ─────────────────────────────────────────────────────────────────────────────

describe('Workout — closing and backgrounding', () => {
  it('remembers the open section across a close', async () => {
    const user = userEvent.setup()
    await shell()

    await user.click(screen.getByRole('button', { name: 'Finisher, not started' }))

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
// Block completion — the shell's write
// ─────────────────────────────────────────────────────────────────────────────

describe('Workout — block completion', () => {
  it('captures perceived effort once, and writes the row itself', async () => {
    const user = userEvent.setup()
    const { double } = await shell()

    // EXE-03's EMOM renderer says what it is completing; the shell's write is
    // the same one every structure goes through.
    await user.click(screen.getByRole('button', { name: 'Complete EMOM' }))

    // The dialog names what was finished, per the master clarity spec.
    const dialog = dialogTitled('EMOM complete')
    await user.click(within(dialog).getByRole('button', { name: 'Record effort' }))

    await waitFor(() =>
      expect(double.recorded()).toEqual([
        { blockId: expect.any(String), outcome: {}, perceivedEffort: 5 },
      ]),
    )
    // Recorded once: the same block cannot be written twice.
    expect(await screen.findByRole('button', { name: 'Block recorded' })).toBeDisabled()
  })

  it('records every structure type through the same path', async () => {
    const user = userEvent.setup()
    const { double } = await shell()

    await user.click(screen.getByRole('button', { name: 'Complete EMOM' }))
    await user.click(
      within(dialogTitled('EMOM complete')).getByRole('button', { name: 'Record effort' }),
    )
    await screen.findByRole('button', { name: 'Block recorded' })

    await user.click(screen.getByRole('button', { name: 'Finisher, not started' }))
    // EXE-04c's renderer names what it is completing; the shell's path is the
    // same one the EMOM above went through, which is this test's whole subject.
    await user.click(screen.getByRole('button', { name: 'Complete AMRAP' }))
    const amrap = dialogTitled('AMRAP complete')
    // A real `<input type="range">`; jsdom does not implement its key
    // behaviour, so the change event the platform would fire is fired here.
    fireEvent.change(within(amrap).getByRole('slider'), { target: { value: '8' } })
    await user.click(within(amrap).getByRole('button', { name: 'Record effort' }))

    await waitFor(() => expect(double.recorded()).toHaveLength(2))
    expect(double.recorded().map((completion) => completion.perceivedEffort)).toEqual([5, 8])
  })

  it('asks the question fresh for every block', async () => {
    const user = userEvent.setup()
    await shell()

    await user.click(screen.getByRole('button', { name: 'Complete EMOM' }))
    const effort = within(dialogTitled('EMOM complete')).getByRole('slider')
    expect(effort).toHaveValue('5')
    expect(effort).toHaveAttribute('aria-valuetext', '5 of 10, moderate')
  })

  it('leaves the block completable when the write fails', async () => {
    const user = userEvent.setup()
    const { double } = await shell({
      blockResults: { record: async () => err(createError(ErrorCode.PERSISTENCE_WRITE_FAILED)) },
    })

    await user.click(screen.getByRole('button', { name: 'Complete EMOM' }))
    await user.click(
      within(dialogTitled('EMOM complete')).getByRole('button', { name: 'Record effort' }),
    )

    expect(await screen.findByText('Could not save. Try again.')).toBeInTheDocument()
    // A performed block must never be lost because one write failed.
    expect(screen.getByRole('button', { name: 'Complete EMOM' })).toBeEnabled()
    expect(double.recorded()).toEqual([])
  })

  it('writes nothing when the effort question is dismissed', async () => {
    const user = userEvent.setup()
    const { double } = await shell()

    await user.click(screen.getByRole('button', { name: 'Complete EMOM' }))
    await user.click(
      within(dialogTitled('EMOM complete')).getByRole('button', { name: 'Not now' }),
    )

    await waitFor(() => expect(isDialogOpen('EMOM complete')).toBe(false))
    expect(double.recorded()).toEqual([])
    expect(screen.getByRole('button', { name: 'Complete EMOM' })).toBeEnabled()
  })
})

describe('Workout — coaching and notes', () => {
  /** One movement per section, so each panel on screen names one card. */
  const COACHED: SectionFixture[] = [
    { title: 'Primary lift', sectionType: 'primary_lift', blocks: [{ exercises: ['not_started'] }] },
    { title: 'Finisher', blocks: [{ exercises: ['not_started'] }] },
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
    await user.click(screen.getByRole('button', { name: /^Finisher/ }))
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
