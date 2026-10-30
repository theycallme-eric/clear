/**
 * REQ-015 / JOURNEY-009 — the rest countdown's lifecycle in the footer, at the
 * workout-screen boundary.
 *
 * Mounted through the real route tree on a synthetic session from the workout
 * double: no personal data, no backend. The wall clock is the only thing the
 * test moves, and it moves it the way a pocketed phone does — the clock jumps,
 * then the platform says the page is back.
 *
 * What it holds the screen to:
 *
 *   · the session's one rest is shared: the open sheet draws it, and once the
 *     sheet is minimised the footer draws that same countdown, still running,
 *     with Add 30s and Skip rest;
 *   · once there is no countdown — run out or skipped — the footer's temporary
 *     Rest control is gone, never `Rest complete · 00:00`, and the movement's
 *     own Log set still opens the sheet (saved-row Edit is covered by TASK-011);
 *   · expiry, the next round's clock, the prefilled sheet and section
 *     navigation write no movement result — only an explicit Log set does;
 *   · the countdown is read from when Rest started it (REQ-012), not from a
 *     clock the screen starts for itself.
 *
 * Baseline, recorded rather than assumed: on the reviewed base the footer's
 * rest (`FooterRest` → `RestTimerBar`) already draws nothing once the
 * countdown has ended or been skipped. These tests pin that behaviour; none of
 * them was written to fail first.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppProviders, signedIn } from '../test/render'
import {
  createWorkoutDouble,
  snapshotFixture,
  type SectionFixture,
  type WorkoutDouble,
} from '../test/workout-double'
import { routes } from './router'

/** Synthetic: one straight-sets movement with its own rest, then a circuit. */
const SECTIONS: SectionFixture[] = [
  {
    title: 'Strength',
    sectionType: 'primary_lift',
    blocks: [{ exercises: [{ prescription: { exercise_id: 'back-squat', rest_seconds: 90 } }] }],
  },
  {
    title: 'Conditioning',
    sectionType: 'conditioning',
    blocks: [{ structureType: 'circuit', rounds: 3, roundRestSeconds: 30 }],
  },
]

/** The wall clock every reading is taken from, moved by the test. */
let clock = 0

// The shell remembers the open section and the circuit its rounds; each test
// starts from a session nobody has opened yet.
beforeEach(() => {
  window.localStorage.clear()
  clock = Date.now()
  vi.spyOn(Date, 'now').mockImplementation(() => clock)
})

afterEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
})

function advance(seconds: number) {
  clock += seconds * 1000
}

/** What the platform fires when a backgrounded tab comes back. */
function returnToForeground() {
  act(() => {
    window.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('focus'))
  })
}

async function shell(): Promise<WorkoutDouble> {
  const double = createWorkoutDouble({
    session: snapshotFixture({
      sections: SECTIONS,
      startedAt: new Date(Date.now() - 600_000).toISOString(),
    }),
  })
  render(
    <AppProviders {...signedIn({ workout: double.clients })}>
      <RouterProvider
        router={createMemoryRouter(routes, { initialEntries: ['/', '/workout'], initialIndex: 1 })}
      />
    </AppProviders>,
  )
  await screen.findByRole('heading', { level: 1, name: 'Workout' })
  await screen.findByRole('navigation', { name: 'Workout sections' })
  return double
}

/** The movement's card, on the main screen — not the sheet in the footer. */
function movementCard(): HTMLElement {
  const card = screen
    .getAllByRole('heading', { name: /back squat$/ })
    .map((heading) => heading.closest('section'))
    .find((section) => section !== null && within(section).queryByRole('button', { name: 'Rest' }))
  if (card === undefined || card === null) throw new Error('no back squat card')
  return card
}

function restBars(): HTMLElement[] {
  return screen.queryAllByRole('region', { name: 'Rest' })
}

function restTimer(): HTMLElement {
  return within(screen.getByRole('region', { name: 'Rest' })).getByRole('timer', {
    name: 'Time remaining',
  })
}

function sheet(): HTMLElement | null {
  return screen.queryByRole('form', { name: /^(Log|Edit) set \d+ of back squat$/ })
}

/** Opens the sheet from the card, logs one set, and minimises the sheet. */
async function logAndMinimise(user: ReturnType<typeof userEvent.setup>) {
  fireEvent.click(within(movementCard()).getByRole('button', { name: 'Rest' }))
  const form = within(screen.getByRole('form', { name: 'Log set 1 of back squat' }))
  await user.click(form.getByRole('button', { name: 'Log set 1' }))
  await screen.findByRole('form', { name: 'Log set 2 of back squat' })
  await user.click(screen.getByRole('button', { name: 'Minimize' }))
  expect(sheet()).toBeNull()
}

/** The footer never stands in for a finished rest. */
function expectNoFinishedRest() {
  expect(restBars()).toEqual([])
  expect(screen.queryByText(/Rest complete/i)).not.toBeInTheDocument()
  // Only the finished-rest control is forbidden; an unrelated movement or
  // elapsed clock may legitimately show 00:00.
  expect(screen.queryByRole('button', { name: /^Rest complete.*00:00$/i })).not.toBeInTheDocument()
}

/** With no rest running, Rest starts the full prescribed one — not a finished one. */
function expectFreshRest() {
  expect(restBars()).toHaveLength(1)
  expect(restTimer()).toHaveTextContent('01:30')
  expect(screen.queryByText(/Rest complete/i)).not.toBeInTheDocument()
}

/**
 * Logging is reachable from the card itself, without any rest control: the
 * saved row stays on the card and its Log set opens the sheet. Saved-row Edit
 * and durable correction belong to TASK-011; TASK-009 also owns that control's
 * rest-independent reachability. This suite retains its own Log set boundary.
 */
async function expectLoggingReachable(user: ReturnType<typeof userEvent.setup>) {
  const card = within(movementCard())
  expect(card.getByRole('list', { name: 'Logged sets' })).toHaveTextContent('8 reps')
  await user.click(card.getByRole('button', { name: 'Rest' }))
  expect(screen.getByRole('form', { name: 'Log set 2 of back squat' })).toBeInTheDocument()
}

describe('Rest footer — a shared countdown that survives minimise and reopen (AC-054)', () => {
  it('moves the running rest from the sheet to the footer and back, with Add 30s and Skip rest', async () => {
    const user = userEvent.setup()
    await shell()

    fireEvent.click(within(movementCard()).getByRole('button', { name: 'Rest' }))
    await user.click(
      within(screen.getByRole('form', { name: 'Log set 1 of back squat' })).getByRole('button', {
        name: 'Log set 1',
      }),
    )
    // Drawn once, inside the open sheet.
    expect(restBars()).toHaveLength(1)
    expect(restTimer()).toHaveTextContent('01:30')

    advance(20)
    returnToForeground()
    await user.click(screen.getByRole('button', { name: 'Minimize' }))

    // The same rest, still running, now the footer's.
    expect(restBars()).toHaveLength(1)
    expect(restTimer()).toHaveTextContent('01:10')
    const bar = within(restBars()[0])
    expect(bar.getByRole('button', { name: 'Add 30s' })).toBeInTheDocument()
    expect(bar.getByRole('button', { name: 'Skip rest' })).toBeInTheDocument()

    advance(10)
    returnToForeground()
    await user.click(within(movementCard()).getByRole('button', { name: 'Rest' }))

    // Reopened: not restarted, and still one countdown.
    expect(restBars()).toHaveLength(1)
    expect(restTimer()).toHaveTextContent('01:00')

    await user.click(screen.getByRole('button', { name: 'Add 30s' }))
    expect(restTimer()).toHaveTextContent('01:30')
  })

  it('keeps the rest and its control visible after an extension until the countdown genuinely ends', async () => {
    const user = userEvent.setup()
    await shell()
    await logAndMinimise(user)

    advance(80)
    returnToForeground()
    await user.click(screen.getByRole('button', { name: 'Add 30s' }))

    // Past the prescribed 90 seconds, but not past the extended 120.
    advance(20)
    returnToForeground()
    expect(restBars()).toHaveLength(1)
    expect(restTimer()).toHaveTextContent('00:20')

    advance(20)
    returnToForeground()
    expectNoFinishedRest()
  })
})

describe('Rest footer — gone once there is no countdown (AC-055)', () => {
  it('hides the minimised Rest control when the countdown runs out, and leaves logging reachable', async () => {
    const user = userEvent.setup()
    const double = await shell()
    await logAndMinimise(user)
    expect(restBars()).toHaveLength(1)

    advance(90)
    returnToForeground()

    expectNoFinishedRest()
    expect(double.loggedSets()).toHaveLength(1)
    await expectLoggingReachable(user)
    // Rest after expiry starts the next prescribed rest, never a finished one.
    expectFreshRest()
    expect(double.loggedSets()).toHaveLength(1)
  })

  it('hides the minimised Rest control when the rest is skipped, and leaves logging reachable', async () => {
    const user = userEvent.setup()
    const double = await shell()
    await logAndMinimise(user)

    advance(15)
    returnToForeground()
    await user.click(within(restBars()[0]).getByRole('button', { name: 'Skip rest' }))

    expectNoFinishedRest()
    expect(double.loggedSets()).toHaveLength(1)
    await expectLoggingReachable(user)
    expectFreshRest()
    expect(double.loggedSets()).toHaveLength(1)
  })

  it('stays gone on later foreground returns, rather than reappearing at zero', async () => {
    const user = userEvent.setup()
    await shell()
    await logAndMinimise(user)

    advance(300)
    returnToForeground()
    returnToForeground()

    expectNoFinishedRest()
  })
})

describe('Rest footer — nothing is recorded but an explicit Log set (AC-056)', () => {
  it('records no result on expiry, on the prefilled sheet, or on reopening it', async () => {
    const user = userEvent.setup()
    const double = await shell()

    // Prefill: the sheet opens with the prescription filled, and writes nothing.
    fireEvent.click(within(movementCard()).getByRole('button', { name: 'Rest' }))
    expect(double.loggedSets()).toEqual([])

    await user.click(
      within(screen.getByRole('form', { name: 'Log set 1 of back squat' })).getByRole('button', {
        name: 'Log set 1',
      }),
    )
    expect(double.loggedSets()).toHaveLength(1)

    // Expiry with the prefilled set-2 sheet open records no set 2.
    advance(90)
    returnToForeground()
    expectNoFinishedRest()
    expect(screen.getByRole('form', { name: 'Log set 2 of back squat' })).toBeInTheDocument()
    expect(double.loggedSets()).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Minimize' }))
    await user.click(within(movementCard()).getByRole('button', { name: 'Rest' }))
    expect(double.loggedSets()).toHaveLength(1)
  })

  it('records no movement result when the next round’s clock starts or its rest runs out', async () => {
    const user = userEvent.setup()
    const double = await shell()
    await user.click(screen.getByRole('button', { name: 'Next section' }))
    await screen.findByRole('button', { name: 'Start round 1' })
    const afterAdvance = double.loggedSets().length

    // An explicit round record starts the circuit's shared rest.
    await user.click(screen.getByRole('button', { name: 'Start round 1' }))
    await user.click(screen.getByRole('button', { name: 'Finish round 1' }))
    expect(screen.getByText('1 of 3 rounds recorded')).toBeInTheDocument()

    // Starting the next round's clock early records nothing more.
    await user.click(screen.getByRole('button', { name: 'Start round 2' }))
    expect(screen.getByText('1 of 3 rounds recorded')).toBeInTheDocument()

    // A second rest, left to run out: the clock ends it, and records nothing.
    await user.click(screen.getByRole('button', { name: 'Finish round 2' }))
    advance(30)
    returnToForeground()
    await screen.findByRole('button', { name: 'Finish round 3' })
    expect(screen.getByText('2 of 3 rounds recorded')).toBeInTheDocument()

    expect(double.loggedSets()).toHaveLength(afterAdvance)
    expectNoFinishedRest()
  })

  it('writes no set when sections advance or are revisited, with or without a running rest', async () => {
    const user = userEvent.setup()
    const double = await shell()
    await logAndMinimise(user)
    expect(double.loggedSets()).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Next section' }))
    await screen.findByRole('button', { name: 'Start round 1' })
    // The shared rest follows the athlete across the section boundary.
    expect(restBars()).toHaveLength(1)

    advance(90)
    returnToForeground()
    await user.click(screen.getByRole('button', { name: 'Previous' }))
    await waitFor(() => expect(within(movementCard()).getByRole('button', { name: 'Rest' })).toBeInTheDocument())

    expectNoFinishedRest()
    expect(double.loggedSets()).toHaveLength(1)
    // The block completion the forward action saves carries no invented work.
    expect(double.recorded()[0]?.outcome).toEqual({})
  })
})

describe('Rest footer — the real timer lifecycle (AC-057)', () => {
  it('starts no rest on mount: the countdown begins only from the Rest action', async () => {
    await shell()

    advance(120)
    returnToForeground()

    expect(restBars()).toEqual([])
  })

  it('reads the wall clock from the logged set across backgrounding, not a clock of its own', async () => {
    const user = userEvent.setup()
    await shell()
    await logAndMinimise(user)

    // Backgrounded with no ticks at all: the first paint back is already right.
    advance(61)
    returnToForeground()
    expect(restTimer()).toHaveTextContent('00:29')

    advance(29)
    returnToForeground()
    expectNoFinishedRest()
  })
})
