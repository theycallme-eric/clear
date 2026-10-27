/**
 * REQ-017 / JOURNEY-013 — a circuit's rounds, round clock and round history,
 * at the workout-screen boundary.
 *
 * Mounted through the real route tree on a synthetic session from the workout
 * double: no personal data, no backend. What it holds the screen to:
 *
 *   · compact numbered rows, each with its own accessible logging action and a
 *     concise coaching disclosure; opening logging opens the shared half-sheet,
 *     and none of it is needed to record a round (AC-061);
 *   · an initial Start round 1, then Finish round, with the round's elapsed
 *     clock; the shared rest after a finished round, and the next round's clock
 *     starting when that rest ends — on its own, or from the tap that ends it
 *     early; the clock controls are apart from movement logging (AC-062);
 *   · the round history shows each round's elapsed duration and no wall-clock
 *     start or end, while the stored start and end stay whole (AC-063).
 */
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { readCircuitState, writeCircuitState } from '../state/workout-persistence'
import { AppProviders, signedIn } from '../test/render'
import {
  createWorkoutDouble,
  snapshotFixture,
  type SectionFixture,
  type WorkoutDouble,
} from '../test/workout-double'
import { routes } from './router'

/** Synthetic: three movements, three rounds, thirty seconds' shared rest. */
const SECTIONS: SectionFixture[] = [
  {
    title: 'Conditioning',
    sectionType: 'conditioning',
    blocks: [
      {
        structureType: 'circuit',
        rounds: 3,
        roundRestSeconds: 30,
        exercises: [
          { prescription: { exercise_id: 'kettlebell-swing', order_index: 0, target_value: 15 } },
          { prescription: { exercise_id: 'push-up', order_index: 1, target_value: 10 } },
          { prescription: { exercise_id: 'goblet-squat', order_index: 2, target_value: 12 } },
        ],
      },
    ],
  },
]

const NAMES = ['kettlebell swing', 'push up', 'goblet squat']

let clock = 0

beforeEach(() => {
  window.localStorage.clear()
  clock = Date.parse('2026-10-27T09:00:00.000Z')
  vi.spyOn(Date, 'now').mockImplementation(() => clock)
})

afterEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
})

/** The wall clock moves, then the platform says the page is back. */
function advance(seconds: number) {
  clock += seconds * 1000
  act(() => {
    window.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('focus'))
  })
}

function mount(double: WorkoutDouble) {
  return render(
    <AppProviders {...signedIn({ workout: double.clients })}>
      <RouterProvider
        router={createMemoryRouter(routes, { initialEntries: ['/', '/workout'], initialIndex: 1 })}
      />
    </AppProviders>,
  )
}

async function shell(): Promise<WorkoutDouble> {
  const double = createWorkoutDouble({
    session: snapshotFixture({
      sections: SECTIONS,
      startedAt: new Date(clock - 600_000).toISOString(),
    }),
  })
  mount(double)
  await screen.findByRole('heading', { level: 1, name: 'Workout' })
  await screen.findByRole('list', { name: 'Movements in this circuit' })
  return double
}

function circuitBlockId(double: WorkoutDouble): string {
  const block = double.stored()?.sections[0]?.blocks[0]?.block
  if (block === undefined) throw new Error('the double holds no circuit')
  return block.id
}

/** A pre-clock cache contains the rest stamp and observed count, not invented past timings. */
async function legacyRest(ageSeconds: number) {
  const double = createWorkoutDouble({
    session: snapshotFixture({
      sections: SECTIONS,
      startedAt: new Date(clock - 600_000).toISOString(),
    }),
  })
  const restStartedAt = new Date(clock - ageSeconds * 1000).toISOString()
  writeCircuitState(window.localStorage, circuitBlockId(double), {
    round: 2,
    position: 1,
    restStartedAt,
  })
  const rendered = mount(double)
  await screen.findByRole('list', { name: 'Movements in this circuit' })
  return { double, rendered, restStartedAt }
}

const rows = () =>
  Array.from(
    screen.getByRole('list', { name: 'Movements in this circuit' }).children,
  ) as HTMLElement[]
const roundClock = () => screen.getByRole('group', { name: 'Round clock' })
const button = (name: string) => screen.getByRole('button', { name })
const roundTimer = (round: number) => screen.getByRole('timer', { name: `Round ${round} time` })
const restTimer = () => screen.queryByRole('timer', { name: 'Time remaining' })

describe('AC-061 — compact numbered rows, optional sheet-based logging', () => {
  it('keeps one compact numbered row per movement, each with logging and a coaching disclosure', async () => {
    await shell()

    expect(rows().map((row) => within(row).getByRole('heading').textContent)).toEqual([
      '1. kettlebell swing',
      '2. push up',
      '3. goblet squat',
    ])
    rows().forEach((row, index) => {
      const name = NAMES[index]!
      const inside = within(row)
      expect(inside.getByRole('button', { name: `Log load and reps for ${name}` })).toHaveAttribute(
        'aria-expanded',
        'false',
      )
      expect(inside.getByRole('button', { name: `Coaching and notes — ${name}` })).toHaveAttribute(
        'aria-expanded',
        'false',
      )
      // Compact: no entry fields and no set form until logging is asked for.
      expect(inside.queryByRole('spinbutton')).toBeNull()
      expect(inside.queryByRole('form')).toBeNull()
    })
  })

  it('opens the shared half-sheet in one tap where logging is opened, outside the row', async () => {
    const user = userEvent.setup()
    const double = await shell()

    await user.click(button('Log load and reps for push up'))

    const form = await screen.findByRole('form', { name: 'Log set 1 of push up' })
    expect(form.closest('.clr-set-sheet')).not.toBeNull()
    // The sheet is the shell's, in its pinned slot — not drawn inside the row.
    expect(rows()[1]!.contains(form)).toBe(false)
    expect(screen.getAllByRole('form', { name: /^Log set/ })).toHaveLength(1)

    await user.click(within(form.closest('section')!).getByRole('button', { name: 'Minimize' }))
    expect(screen.queryByRole('form', { name: /^Log set/ })).toBeNull()
    expect(double.loggedSets()).toEqual([])
  })

  it('logs a movement only when the athlete saves it, and records no round for it', async () => {
    const user = userEvent.setup()
    const double = await shell()

    await user.click(button('Log load and reps for goblet squat'))
    const form = within(await screen.findByRole('form', { name: 'Log set 1 of goblet squat' }))
    await user.clear(form.getByLabelText('Weight'))
    await user.type(form.getByLabelText('Weight'), '20')
    await user.click(form.getByRole('button', { name: 'Log set 1' }))

    await waitFor(() => expect(double.loggedSets()).toHaveLength(1))
    expect(within(roundClock()).getByRole('status')).toHaveTextContent('No rounds recorded')
    expect(screen.queryByRole('timer', { name: /^Round \d time$/ })).toBeNull()
    expect(button('Start round 1')).toBeInTheDocument()
  })

  it('records every round with no movement logged: circuit logging is never compulsory', async () => {
    const user = userEvent.setup()
    const double = await shell()

    await user.click(button('Start round 1'))
    for (const round of [1, 2, 3]) {
      await user.click(button(`Finish round ${round}`))
      if (round < 3) await user.click(button(`Start round ${round + 1}`))
    }

    expect(within(roundClock()).getByRole('status')).toHaveTextContent('3 of 3 rounds recorded')
    expect(double.loggedSets()).toEqual([])
    // No movement was ever asked to be entered on the way.
    expect(screen.queryByRole('form', { name: /^Log set/ })).toBeNull()
  })
})

describe('AC-062 — Start, Finish, elapsed round clock, shared rest and the next round’s clock', () => {
  it('starts with Start round 1 and no running clock; Start runs it and offers Finish', async () => {
    const user = userEvent.setup()
    await shell()

    expect(button('Start round 1')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Finish round/ })).toBeNull()
    expect(screen.queryByRole('timer', { name: /^Round \d time$/ })).toBeNull()

    await user.click(button('Start round 1'))
    expect(roundTimer(1)).toHaveTextContent('00:00')
    expect(button('Finish round 1')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Start round 1' })).toBeNull()

    advance(75)
    await waitFor(() => expect(roundTimer(1)).toHaveTextContent('01:15'))
    expect(roundTimer(1)).toHaveTextContent('1 minute 15 seconds')
  })

  it('finishes into the shared rest, then starts the next round’s clock when the rest ends', async () => {
    const user = userEvent.setup()
    await shell()

    await user.click(button('Start round 1'))
    advance(40)
    await user.click(button('Finish round 1'))

    // The shared rest, and no round clock running through it.
    expect(restTimer()).toHaveTextContent('00:30')
    expect(screen.getByText('Rest between rounds')).toBeInTheDocument()
    expect(screen.queryByRole('timer', { name: /^Round \d time$/ })).toBeNull()
    expect(button('Start round 2')).toBeInTheDocument()

    // The rest runs out on its own: round 2's clock starts from that moment.
    advance(30)
    await waitFor(() => expect(restTimer()).toBeNull())
    expect(roundTimer(2)).toHaveTextContent('00:00')
    expect(button('Finish round 2')).toBeInTheDocument()

    advance(12)
    await waitFor(() => expect(roundTimer(2)).toHaveTextContent('00:12'))
  })

  it('starts the next round’s clock from the tap that ends the rest early', async () => {
    const user = userEvent.setup()
    await shell()

    await user.click(button('Start round 1'))
    await user.click(button('Finish round 1'))
    advance(10)
    await user.click(button('Start round 2'))

    expect(restTimer()).toBeNull()
    expect(roundTimer(2)).toHaveTextContent('00:00')
    advance(5)
    await waitFor(() => expect(roundTimer(2)).toHaveTextContent('00:05'))
  })

  it('lets a legacy cached rest expire into its clock and retains elapsed time through reload', async () => {
    const user = userEvent.setup()
    const { double, rendered, restStartedAt } = await legacyRest(10)

    expect(restTimer()).toHaveTextContent('00:20')
    expect(screen.queryByRole('timer', { name: /^Round \d time$/ })).toBeNull()
    expect(screen.queryByRole('list', { name: 'Round times' })).toBeNull()
    expect(readCircuitState(window.localStorage, circuitBlockId(double))).toEqual({
      round: 2,
      position: 1,
      restStartedAt,
    })

    advance(20)
    await waitFor(() => expect(roundTimer(2)).toHaveTextContent('00:00'))
    advance(15)
    await waitFor(() => expect(roundTimer(2)).toHaveTextContent('00:15'))
    expect(within(roundClock()).getByRole('status')).toHaveTextContent('1 of 3 rounds recorded')
    expect(double.loggedSets()).toEqual([])

    rendered.unmount()
    mount(double)
    await screen.findByRole('list', { name: 'Movements in this circuit' })
    expect(roundTimer(2)).toHaveTextContent('00:15')
    expect(button('Finish round 2')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Round times' })).toBeNull()

    // Only the subsequently finished round gains a timing: no round 1 start/end is inferred.
    await user.click(button('Finish round 2'))
    expect(readCircuitState(window.localStorage, circuitBlockId(double))?.history).toEqual([
      {
        round: 2,
        startedAt: new Date(Date.parse(restStartedAt) + 30_000).toISOString(),
        endedAt: new Date(clock).toISOString(),
      },
    ])
    expect(double.loggedSets()).toEqual([])
  })

  it('restores a legacy cache after its rest deadline with the elapsed round time intact', async () => {
    const { double, restStartedAt } = await legacyRest(45)

    expect(restTimer()).toBeNull()
    expect(roundTimer(2)).toHaveTextContent('00:15')
    expect(button('Finish round 2')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Start round 2' })).toBeNull()
    expect(within(roundClock()).getByRole('status')).toHaveTextContent('1 of 3 rounds recorded')
    expect(screen.queryByRole('list', { name: 'Round times' })).toBeNull()
    expect(double.loggedSets()).toEqual([])
    expect(readCircuitState(window.localStorage, circuitBlockId(double))).toEqual({
      round: 2,
      position: 1,
      restStartedAt,
    })
  })

  it('stops the clock after the last round', async () => {
    const user = userEvent.setup()
    await shell()

    await user.click(button('Start round 1'))
    for (const round of [1, 2]) {
      await user.click(button(`Finish round ${round}`))
      await user.click(button(`Start round ${round + 1}`))
    }
    await user.click(button('Finish round 3'))

    expect(screen.getByText('Every prescribed round is recorded.')).toBeInTheDocument()
    expect(screen.queryByRole('timer', { name: /^Round \d time$/ })).toBeNull()
    expect(restTimer()).toBeNull()
  })

  it('keeps the clock controls apart from movement-result logging', async () => {
    const user = userEvent.setup()
    const double = await shell()

    await user.click(button('Start round 1'))

    // The round clock holds no logging control, and no row holds a clock control.
    const clockControls = within(roundClock()).getAllByRole('button').map((control) => control.textContent)
    expect(clockControls).toEqual(['Finish round 1'])
    for (const row of rows()) {
      expect(within(row).queryByRole('button', { name: /(Start|Finish) round/ })).toBeNull()
    }

    // Logging a movement neither stops nor restarts the round clock …
    advance(20)
    await user.click(button('Log load and reps for kettlebell swing'))
    const form = within(await screen.findByRole('form', { name: 'Log set 1 of kettlebell swing' }))
    await user.click(form.getByRole('button', { name: 'Log set 1' }))
    await waitFor(() => expect(double.loggedSets()).toHaveLength(1))
    expect(roundTimer(1)).toHaveTextContent('00:20')
    expect(button('Finish round 1')).toBeInTheDocument()

    // … and the clock controls record no movement result.
    await user.click(button('Finish round 1'))
    await user.click(button('Start round 2'))
    expect(double.loggedSets()).toHaveLength(1)
  })
})

describe('AC-063 — round history shows durations, never wall-clock times', () => {
  async function twoRounds(user: ReturnType<typeof userEvent.setup>) {
    await user.click(button('Start round 1'))
    advance(75)
    await user.click(button('Finish round 1'))
    advance(30) // the rest runs out: round 2's clock starts here
    await waitFor(() => expect(restTimer()).toBeNull())
    advance(62)
    await user.click(button('Finish round 2'))
  }

  it('lists each finished round with its elapsed duration and no Start or End time', async () => {
    const user = userEvent.setup()
    await shell()
    await twoRounds(user)

    const history = screen.getByRole('list', { name: 'Round times' })
    const items = within(history).getAllByRole('listitem')
    expect(items.map((item) => item.textContent)).toEqual([
      'Round 101:151 minute 15 seconds',
      'Round 201:021 minute 2 seconds',
    ])
    for (const item of items) {
      expect(item).not.toHaveTextContent(/\b(Start|End)\b/i)
      expect(item).not.toHaveTextContent(/AM|PM/)
      // 09:00 is when this session's first round started; 09:01:15 when it ended.
      expect(item).not.toHaveTextContent(/09:0\d/)
    }
    expect(screen.queryByText(/^(Start|End)(ed)?\b.*\d{1,2}:\d{2}/)).toBeNull()
  })

  it('keeps the stored start and end of every round, across a refresh', async () => {
    const user = userEvent.setup()
    const double = await shell()
    await twoRounds(user)

    const start = Date.parse('2026-10-27T09:00:00.000Z')
    const stored = readCircuitState(window.localStorage, circuitBlockId(double))
    expect(stored?.history).toEqual([
      {
        round: 1,
        startedAt: new Date(start).toISOString(),
        endedAt: new Date(start + 75_000).toISOString(),
      },
      {
        round: 2,
        startedAt: new Date(start + 105_000).toISOString(),
        endedAt: new Date(start + 167_000).toISOString(),
      },
    ])

    // A refresh comes back to the same durations, and the stored times are untouched.
    document.body.innerHTML = ''
    mount(double)
    const history = await screen.findByRole('list', { name: 'Round times' })
    expect(within(history).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Round 101:151 minute 15 seconds',
      'Round 201:021 minute 2 seconds',
    ])
    expect(readCircuitState(window.localStorage, circuitBlockId(double))?.history).toEqual(stored?.history)
  })

  it('shows no history before a round is finished', async () => {
    const user = userEvent.setup()
    await shell()

    expect(screen.queryByRole('list', { name: 'Round times' })).toBeNull()
    await user.click(button('Start round 1'))
    expect(screen.queryByRole('list', { name: 'Round times' })).toBeNull()
  })
})
