/**
 * EXE-04b acceptance, as the user meets it:
 *
 *   · both completion paths are reachable, and they are distinct in words, in
 *     glyph and in treatment — not in hue alone;
 *   · `elapsed_seconds` and `completed_under_cap` reach the shell's one write;
 *   · finishing under the cap stops the clock at the finish, not at the cap;
 *   · the urgency treatment appears near the cap and in no other state;
 *   · the clock survives a refresh — here, a remount against the same storage.
 *
 * And the 0.14.3 composition it is drawn with: the shared block frame, the clock
 * as its own timer card beside the block's card and never inside it, and the
 * shipped low state — the stepped `--dur-alert` crossing and the 80% pulse, as
 * the view's one loop, still under reduced motion with nothing it was saying
 * lost.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import type { ReactNode } from 'react'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  BlockCompletionContext,
  type BlockCompletionApi,
  type BlockOutcome,
} from '../state/block-completion'
import type { LadderTiming } from '../state/schemas'
import { readForTimeState, type ShellStorage } from '../state/workout-persistence'
import type { BlockProgress } from '../state/workout-progress'
import { sessionProgress } from '../state/workout-progress'
import { snapshotFixture, type BlockFixture } from '../test/workout-double'
import { BlockSlot } from './block-renderers'
import { ForTimeBlock } from './for-time-block'
import { PRODUCT_PRESENTATION } from './product-presentation'
import { LoadingView } from './view-state'
import { WorkoutExperiencePresentationProvider } from './workout-experience-presentation'

// jsdom applies no stylesheet, so motion is proved as classes, attributes and
// the rule text the classes resolve to.
const MOTION_CSS = readFileSync(
  resolve(import.meta.dirname, '../design-system/css/motion.css'),
  'utf-8',
)
const APP_MOTION_CSS = readFileSync(
  resolve(import.meta.dirname, '../styles/app-motion.css'),
  'utf-8',
)

function reduceMotion(reduced: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: reduced && query === '(prefers-reduced-motion: reduce)',
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList,
  )
}

/** A moment the race can be measured from, and a clock the test moves. */
const START = Date.parse('2026-09-24T10:00:00.000Z')
let clock = START
const now = () => clock

/** An eight-minute cap — `ladder-for-time.md`'s own example. */
const CAP_SECONDS = 480

/** `localStorage`, in memory, so one test cannot see another's clock. */
function fakeStorage(): ShellStorage {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  }
}

function forTimeBlock(fixture: BlockFixture = {}): BlockProgress {
  const snapshot = snapshotFixture({
    sections: [
      {
        blocks: [
          {
            structureType: 'for_time',
            timerSeconds: CAP_SECONDS,
            exercises: ['not_started', 'not_started'],
            ...fixture,
          },
        ],
      },
    ],
  })

  return sessionProgress(snapshot).sections[0]!.blocks[0]!
}

function completionDouble() {
  const reportOutcome = vi.fn<(blockId: string, outcome: BlockOutcome) => void>()
  const api: BlockCompletionApi = { reportOutcome, isBlockRecorded: () => false }
  return { api, reportOutcome }
}

function renderForTime(
  block: BlockProgress,
  storage: ShellStorage,
  api: BlockCompletionApi,
  beside: ReactNode = null,
) {
  return render(
    <BlockCompletionContext value={api}>
      {beside}
      <ForTimeBlock block={block} storage={storage} now={now} />
    </BlockCompletionContext>,
  )
}

/** The readout, by the accessible name it carries in every phase. */
function readout(): HTMLElement {
  return screen.getByRole('timer', { name: 'Block time' })
}

/** The timer card's frame: the one element whose role moves bar, body and emission. */
function timerFrame(): HTMLElement {
  return readout().closest('.clr-card__body') as HTMLElement
}

/** The clock as a whole: the element that owns the pulse and the loop claim. */
function raceClock(): HTMLElement {
  return readout().closest('[data-loop]') as HTMLElement
}

function digits(): HTMLElement {
  return readout().querySelector('[aria-hidden="true"]') as HTMLElement
}

function cards(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.clr-card'))
}

function nestedCards(): HTMLElement[] {
  return cards().filter((card) => card.parentElement?.closest('.clr-card') != null)
}

/**
 * A3 TASK-108 (round-07 decision R7-2): For Time as `/workout` draws it —
 * `BlockSlot` under the product presentation, so Round 7's `TimedWorkoutFlow`
 * with its race clock, one whole `TimerFrame` beside the block's card — over
 * the test's completion seam and clock. A seam that names no session keeps
 * nothing in storage.
 */
function renderRouteForTime(block: BlockProgress, api: BlockCompletionApi, beside: ReactNode = null) {
  window.localStorage.clear()
  vi.spyOn(Date, 'now').mockImplementation(() => clock)
  return render(
    <WorkoutExperiencePresentationProvider value={PRODUCT_PRESENTATION}>
      <BlockCompletionContext value={api}>
        {beside}
        <BlockSlot block={block} />
      </BlockCompletionContext>
    </WorkoutExperiencePresentationProvider>,
  )
}

/** The route's Start, in the block's own words (`Start FOR TIME`). */
const ROUTE_START = /^Start for time$/i

/** The route's race clock: Round 7's TimerFrame, named by its block (`FOR TIME time`). */
function routeClock(): HTMLElement {
  return screen.getByRole('timer', { name: /^for time time$/i })
}

/** Its frame: the timer card's body, whose role moves bar, body and emission. */
function routeFrame(): HTMLElement {
  return routeClock().closest('.clr-card__body') as HTMLElement
}

/** The cap the race's card states: Round 7's meta line (`8 MIN CAP`). */
function routeCap(): HTMLElement {
  return routeClock().closest('.clr-timed-flow')!.querySelector<HTMLElement>('.clr-timed-meta')!
}

/** The decorative digits: the part of the readout that tumbles. */
function routeDigits(): HTMLElement {
  return [...routeClock().children].find((child) => child.querySelector('.clr-tumble') !== null) as HTMLElement
}

/** The one soft screen-edge aura, wherever it is portalled. */
function edges(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[data-countdown-edge]')]
}

/**
 * Moves the wall clock and lets the card re-read it.
 *
 * The seconds are never accumulated — every reading is `now - startedAt`
 * (`workout-clock.ts`) — so one repaint interval is all that is needed however
 * far the clock has jumped. Which is the property being tested wherever this
 * jumps by more than a tick: a phone that was locked comes back correct rather
 * than behind.
 */
async function wallClockReaches(milliseconds: number): Promise<void> {
  clock = milliseconds
  // Inside `act`, so the loop claim the repaint makes is settled before a read.
  await act(() => vi.advanceTimersByTimeAsync(1000))
}

function userWithTimers() {
  return userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
}

beforeEach(() => {
  clock = START
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('before the clock starts', () => {
  it('states the cap and the work, and offers the one control that starts it', () => {
    renderForTime(forTimeBlock(), fakeStorage(), completionDouble().api)

    expect(screen.getByText('Ready')).toBeInTheDocument()
    expect(screen.getByText('08:00 cap')).toBeInTheDocument()
    expect(readout()).toHaveTextContent('00:00')
    expect(screen.getByRole('button', { name: 'Start For Time' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Finish' })).not.toBeInTheDocument()
    expect(
      screen.getByRole('list', { name: 'Movements in this block' }),
    ).toBeInTheDocument()
  })

  it('records nothing it did not observe', () => {
    const block = forTimeBlock()
    const { api, reportOutcome } = completionDouble()
    renderForTime(block, fakeStorage(), api)

    // Not a zero: an unobserved elapsed time is an absence (DATA_MODEL §8).
    expect(reportOutcome).toHaveBeenLastCalledWith(block.blockId, {})
    // REQ-013: no per-block completion; the section's forward action saves it.
    expect(screen.queryByRole('button', { name: 'Record For Time' })).not.toBeInTheDocument()
  })
})

describe('while the clock runs', () => {
  it('counts up from the tap that started it', async () => {
    const user = userWithTimers()
    renderForTime(forTimeBlock(), fakeStorage(), completionDouble().api)

    await user.click(screen.getByRole('button', { name: 'Start For Time' }))
    expect(screen.getByText('Racing the clock')).toBeInTheDocument()

    await wallClockReaches(START + 125_000)

    expect(readout()).toHaveTextContent('02:05')
    expect(screen.getByText('Cap in 05:55')).toBeInTheDocument()
  })

  it('offers no second start that would discard the time it took', async () => {
    const user = userWithTimers()
    renderForTime(forTimeBlock(), fakeStorage(), completionDouble().api)

    await user.click(screen.getByRole('button', { name: 'Start For Time' }))

    expect(screen.queryByRole('button', { name: 'Start For Time' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Finish' })).toBeInTheDocument()
  })

  it('carries no urgency treatment while there is time left', async () => {
    const user = userWithTimers()
    renderForTime(forTimeBlock(), fakeStorage(), completionDouble().api)

    await user.click(screen.getByRole('button', { name: 'Start For Time' }))

    await wallClockReaches(START + 60_000)

    expect(timerFrame()).toHaveClass('clr-chamfer--timer')
    expect(timerFrame()).not.toHaveClass('clr-chamfer--timer-low')
    expect(document.querySelector('.clr-pulse-micro')).toBeNull()
  })

  // TASK-008 (C23, C24, C61) supersedes "words, pulse and hue together": the
  // colour comes at ten seconds, the breathe and the one edge in the last five.
  // A3 TASK-108 (round-07 R7-2): ported onto the For Time `/workout` draws —
  // Round 7's TimedWorkoutFlow through BlockSlot under the product presentation.
  // The build's "Cap in 00:07 — finish now" is ForTimeBlock's sentence: Round 7
  // says the same seven seconds as its race clock's "Elapsed" 07:53 beside the
  // cap its card states (`8 MIN CAP`), and draws no "— finish now" words — the
  // warning is the colour, the edge and the breathe (updated under Eric's rule
  // of 2026-11-23, "Yes, approve").
  it('turns urgent in the last ten seconds — words and hue together, then the breathe and the edge in the last five', async () => {
    const user = userWithTimers()
    renderRouteForTime(forTimeBlock(), completionDouble().api)

    await user.click(screen.getByRole('button', { name: ROUTE_START }))

    await wallClockReaches(START + (CAP_SECONDS - 7) * 1000)

    // The race says it is still running (its caption, in words), how far in it
    // is and its cap, and takes the low colour; the breathe waits for the last five.
    expect(routeClock()).toHaveTextContent('Elapsed')
    expect(routeClock()).toHaveTextContent('07:53')
    expect(routeCap()).toHaveTextContent(/^8 MIN CAP/)
    expect(routeFrame()).toHaveClass('clr-chamfer--timer-low')
    expect(routeClock()).not.toHaveAttribute('data-urgent')
    expect(edges()).toHaveLength(0)

    await wallClockReaches(START + (CAP_SECONDS - 5) * 1000)
    expect(routeClock()).toHaveAttribute('data-urgent', 'true')
    expect(edges()).toHaveLength(1)
    expect(document.querySelector('.clr-pulse-micro')).toBeNull()
  })
})

describe('the first completion path: finished under the cap', () => {
  it('stops the clock at the finish, not at the cap', async () => {
    const user = userWithTimers()
    renderForTime(forTimeBlock(), fakeStorage(), completionDouble().api)

    await user.click(screen.getByRole('button', { name: 'Start For Time' }))
    clock = START + 383_000
    await user.click(screen.getByRole('button', { name: 'Finish' }))

    expect(screen.getByText('Finished under cap')).toBeInTheDocument()
    expect(readout()).toHaveTextContent('06:23')

    // The clock runs on past the cap; the recorded time does not move.
    await wallClockReaches(START + 900_000)
    expect(readout()).toHaveTextContent('06:23')
    expect(screen.queryByText('Cap reached')).not.toBeInTheDocument()
  })

  it('supplies the elapsed seconds and the under-cap finish to the shell', async () => {
    const user = userWithTimers()
    const block = forTimeBlock()
    const { api, reportOutcome } = completionDouble()
    renderForTime(block, fakeStorage(), api)

    await user.click(screen.getByRole('button', { name: 'Start For Time' }))
    clock = START + 383_000
    await user.click(screen.getByRole('button', { name: 'Finish' }))

    expect(reportOutcome).toHaveBeenLastCalledWith(block.blockId, {
      elapsedSeconds: 383,
      completedUnderCap: true,
    })
  })

  it('wears the finished treatment, and no urgency however close it came', async () => {
    const user = userWithTimers()
    renderForTime(forTimeBlock(), fakeStorage(), completionDouble().api)

    await user.click(screen.getByRole('button', { name: 'Start For Time' }))
    clock = START + (CAP_SECONDS - 1) * 1000
    await user.click(screen.getByRole('button', { name: 'Finish' }))

    expect(timerFrame()).toHaveClass('clr-chamfer--timer')
    expect(timerFrame()).not.toHaveClass('clr-chamfer--timer-low')
    expect(document.querySelector('.clr-pulse-micro')).toBeNull()
  })
})

describe('the second completion path: the cap is reached', () => {
  it('stops at the cap on its own, with no tap and no stamp', async () => {
    const user = userWithTimers()
    renderForTime(forTimeBlock(), fakeStorage(), completionDouble().api)

    await user.click(screen.getByRole('button', { name: 'Start For Time' }))

    // Long enough that a phone could have been locked through it.
    await wallClockReaches(START + 3_600_000)

    expect(screen.getByText('Cap reached')).toBeInTheDocument()
    expect(readout()).toHaveTextContent('08:00')
    expect(screen.queryByRole('button', { name: 'Finish' })).not.toBeInTheDocument()
  })

  it('reads differently from a finish — the words and the treatment both', async () => {
    const user = userWithTimers()
    renderForTime(forTimeBlock(), fakeStorage(), completionDouble().api)

    await user.click(screen.getByRole('button', { name: 'Start For Time' }))
    await wallClockReaches(START + CAP_SECONDS * 1000)

    expect(screen.queryByText('Finished under cap')).not.toBeInTheDocument()
    expect(timerFrame()).toHaveClass('clr-chamfer--timer-low')
    // The clock has stopped: nothing is running out, so nothing pulses.
    expect(document.querySelector('.clr-pulse-micro')).toBeNull()
  })

  it('supplies the cap and the cap-expiry outcome to the shell', async () => {
    const user = userWithTimers()
    const block = forTimeBlock()
    const { api, reportOutcome } = completionDouble()
    renderForTime(block, fakeStorage(), api)

    await user.click(screen.getByRole('button', { name: 'Start For Time' }))
    await wallClockReaches(START + 600_000)

    expect(reportOutcome).toHaveBeenLastCalledWith(block.blockId, {
      elapsedSeconds: CAP_SECONDS,
      completedUnderCap: false,
    })
  })
})

describe('across a refresh', () => {
  it('comes back to the race it was in, elapsed from the wall clock', async () => {
    const user = userWithTimers()
    const storage = fakeStorage()
    const block = forTimeBlock()

    const first = renderForTime(block, storage, completionDouble().api)
    await user.click(screen.getByRole('button', { name: 'Start For Time' }))
    first.unmount()

    expect(readForTimeState(storage, block.blockId)).toEqual({
      startedAt: new Date(START).toISOString(),
      finishedAt: null,
    })

    clock = START + 200_000
    renderForTime(block, storage, completionDouble().api)

    expect(screen.getByText('Racing the clock')).toBeInTheDocument()
    expect(readout()).toHaveTextContent('03:20')
  })

  it('comes back to a finish it already recorded', async () => {
    const user = userWithTimers()
    const storage = fakeStorage()
    const block = forTimeBlock()

    const first = renderForTime(block, storage, completionDouble().api)
    await user.click(screen.getByRole('button', { name: 'Start For Time' }))
    clock = START + 250_000
    await user.click(screen.getByRole('button', { name: 'Finish' }))
    first.unmount()

    clock = START + 900_000
    const { api, reportOutcome } = completionDouble()
    renderForTime(block, storage, api)

    expect(screen.getByText('Finished under cap')).toBeInTheDocument()
    expect(readout()).toHaveTextContent('04:10')

    expect(reportOutcome).toHaveBeenLastCalledWith(block.blockId, {
      elapsedSeconds: 250,
      completedUnderCap: true,
    })
  })

  it('ignores a stored clock it cannot believe', () => {
    const storage = fakeStorage()
    const block = forTimeBlock()
    storage.setItem(
      'clear.workout-for-time',
      JSON.stringify({ [block.blockId]: { startedAt: 'yesterday', finishedAt: null } }),
    )

    renderForTime(block, storage, completionDouble().api)

    expect(screen.getByText('Ready')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start For Time' })).toBeInTheDocument()
  })
})

describe('a block with no movements left', () => {
  it('says so, runs no clock, and records nothing it did not observe', () => {
    const block = forTimeBlock({ exercises: [] })
    const { api, reportOutcome } = completionDouble()
    renderForTime(block, fakeStorage(), api)

    expect(
      screen.getByText(/every movement in it was swapped\s+out/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()

    expect(reportOutcome).toHaveBeenLastCalledWith(block.blockId, {})
  })
})

describe('a block with no cap', () => {
  it('counts up, states no deadline, and claims nothing about one', async () => {
    const user = userWithTimers()
    const block = forTimeBlock({ timerSeconds: null })
    const { api, reportOutcome } = completionDouble()
    renderForTime(block, fakeStorage(), api)

    await user.click(screen.getByRole('button', { name: 'Start For Time' }))
    await wallClockReaches(START + 1_000_000)

    expect(screen.getByText('Racing the clock')).toBeInTheDocument()
    expect(screen.queryByText(/cap/i)).not.toBeInTheDocument()
    expect(timerFrame()).not.toHaveClass('clr-chamfer--timer-low')

    await user.click(screen.getByRole('button', { name: 'Finish' }))

    expect(reportOutcome).toHaveBeenLastCalledWith(block.blockId, {
      elapsedSeconds: 1_000,
    })
  })
})

describe('For Time draws with the shared block frame', () => {
  it('is one block card beside one timer card, with neither inside the other', async () => {
    const user = userWithTimers()
    renderForTime(forTimeBlock(), fakeStorage(), completionDouble().api)

    const timerCard = readout().closest('.clr-card') as HTMLElement
    const blockCard = screen
      .getByRole('list', { name: 'Movements in this block' })
      .closest('.clr-card') as HTMLElement

    expect(cards()).toHaveLength(2)
    expect(timerCard).not.toBe(blockCard)
    expect(nestedCards()).toEqual([])

    // The same two cards in every phase: ready, running, urgent, capped.
    await user.click(screen.getByRole('button', { name: 'Start For Time' }))
    expect(cards()).toHaveLength(2)
    await wallClockReaches(START + (CAP_SECONDS - 5) * 1000)
    expect(cards()).toHaveLength(2)
    await wallClockReaches(START + CAP_SECONDS * 1000)
    expect(cards()).toHaveLength(2)
    expect(nestedCards()).toEqual([])
  })

  it('keeps the clock’s words inside the clock’s own card', async () => {
    const user = userWithTimers()
    renderForTime(forTimeBlock(), fakeStorage(), completionDouble().api)

    const timerCard = within(readout().closest('.clr-card') as HTMLElement)
    expect(timerCard.getByRole('status')).toHaveTextContent('Ready')
    expect(timerCard.getByText('08:00 cap')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Start For Time' }))
    await wallClockReaches(START + 60_000)

    expect(timerCard.getByRole('status')).toHaveTextContent('Racing the clock')
    expect(timerCard.getByText('Cap in 07:00')).toBeInTheDocument()
    // The controls are the block's, not the timer's.
    expect(timerCard.queryByRole('button')).not.toBeInTheDocument()
  })

  it('carries the identity row, the movement rows and exactly one completion', () => {
    renderForTime(forTimeBlock(), fakeStorage(), completionDouble().api)

    const blockCard = screen
      .getByRole('list', { name: 'Movements in this block' })
      .closest('.clr-card') as HTMLElement

    expect(within(blockCard).getByText('2 movements')).toBeInTheDocument()
    expect(within(blockCard).getByText('All of it:')).toBeInTheDocument()

    const rows = within(blockCard).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      // Rows, not cards — and read, not logged.
      expect(row.querySelector('.clr-card')).toBeNull()
      expect(within(row).getByRole('heading')).toBeInTheDocument()
      expect(row.querySelector('input')).toBeNull()
    }

    expect(within(blockCard).queryByRole('button', { name: 'Record For Time' })).toBeNull()
    expect(within(blockCard).getByRole('button', { name: 'Start For Time' })).toBeInTheDocument()
  })

  it('states the two endings with a glyph beside the words, not by hue alone', async () => {
    const user = userWithTimers()
    const finished = renderForTime(forTimeBlock(), fakeStorage(), completionDouble().api)

    await user.click(screen.getByRole('button', { name: 'Start For Time' }))
    clock = START + 383_000
    await user.click(screen.getByRole('button', { name: 'Finish' }))

    expect(screen.getByRole('status')).toHaveTextContent('Finished under cap')
    expect(screen.getByRole('status').querySelector('svg')).not.toBeNull()
    expect(screen.getByText('08:00 cap')).toBeInTheDocument()
    finished.unmount()

    clock = START
    renderForTime(forTimeBlock(), fakeStorage(), completionDouble().api)
    await user.click(screen.getByRole('button', { name: 'Start For Time' }))
    await wallClockReaches(START + CAP_SECONDS * 1000)

    expect(screen.getByRole('status')).toHaveTextContent('Cap reached')
    expect(screen.getByRole('status').querySelector('svg')).not.toBeNull()
    expect(screen.getByRole('status').style.color).toBe('var(--text-timer-low)')
    expect(screen.getByText('08:00 cap')).toBeInTheDocument()
  })

  it('draws the swapped-out block as one card with no clock', () => {
    renderForTime(forTimeBlock({ exercises: [] }), fakeStorage(), completionDouble().api)

    expect(cards()).toHaveLength(1)
    expect(document.querySelector('[data-loop]')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Start For Time' })).not.toBeInTheDocument()
  })
})

// Round 7's base bodies over ForTimeBlock whose own titles the build's TASK-008
// port does not reuse stay as they are (round-07 decision R7-2; A3 TASK-108
// repair round 2). Their same-title siblings are superseded by the ported
// cases below (evidence/refinement/task-108/test-ledger.json).
describe('the clock takes the shipped low state and nothing more', () => {
  it('goes low in the last ten seconds: stepped over --dur-alert, pulsing to 80%, no glow', async () => {
    reduceMotion(false)
    const user = userWithTimers()
    renderForTime(forTimeBlock(), fakeStorage(), completionDouble().api)

    await user.click(screen.getByRole('button', { name: 'Start For Time' }))
    await wallClockReaches(START + (CAP_SECONDS - 10) * 1000)

    // One role change moves bar, body and emission together.
    expect(timerFrame()).toHaveClass('clr-chamfer--timer-low')
    expect(timerFrame()).not.toHaveClass('clr-chamfer--timer')
    expect(nestedCards()).toEqual([])

    // The digits cross over on the frame's schedule, and each one tumbles.
    expect(digits().style.color).toBe('var(--text-timer-low)')
    expect(digits().style.transition).toBe('color var(--dur-alert) var(--step-4)')
    expect(digits().querySelectorAll('.clr-tumble')).toHaveLength(4)

    // Low alone carries no pulse and claims no loop.
    expect(document.querySelectorAll('.clr-pulse-micro')).toHaveLength(0)
    expect(raceClock()).toHaveAttribute('data-urgent', 'false')
    expect(raceClock()).toHaveAttribute('data-loop', 'still')

    // In the final five seconds the pulse is on the whole timer card and is
    // the view's running loop.
    await wallClockReaches(START + (CAP_SECONDS - 4) * 1000)
    expect(document.querySelectorAll('.clr-pulse-micro')).toHaveLength(1)
    expect(raceClock()).toHaveClass('clr-pulse-micro')
    expect(raceClock()).toHaveAttribute('data-urgent', 'true')
    expect(raceClock()).toHaveAttribute('data-loop', 'run')

    // No glow of the timer's own: the extra glow is the primary action's.
    expect(raceClock().querySelector('.clr-glow')).toBeNull()

    // What those classes resolve to in the shipped package.
    expect(MOTION_CSS).toMatch(/--dur-slow:\s*400ms/)
    expect(MOTION_CSS).toMatch(/--dur-alert:\s*var\(--dur-slow\)/)
    expect(MOTION_CSS).toMatch(/--step-4:\s*steps\(4, end\)/)
    expect(
      MOTION_CSS.includes(
        '@keyframes clr-micro-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.8; } }',
      ),
    ).toBe(true)
  })

  it('gives the loop up at the cap and at a finish, keeping the outcome’s colours', async () => {
    reduceMotion(false)
    const user = userWithTimers()
    const capped = renderForTime(forTimeBlock(), fakeStorage(), completionDouble().api)

    await user.click(screen.getByRole('button', { name: 'Start For Time' }))
    await wallClockReaches(START + (CAP_SECONDS - 3) * 1000)
    expect(raceClock()).toHaveAttribute('data-loop', 'run')

    await wallClockReaches(START + CAP_SECONDS * 1000)
    expect(timerFrame()).toHaveClass('clr-chamfer--timer-low')
    expect(digits().style.color).toBe('var(--text-timer-low)')
    expect(raceClock()).toHaveAttribute('data-urgent', 'false')
    expect(raceClock()).toHaveAttribute('data-loop', 'still')
    expect(document.querySelector('[data-loop="run"]')).toBeNull()
    capped.unmount()

    clock = START
    renderForTime(forTimeBlock(), fakeStorage(), completionDouble().api)
    await user.click(screen.getByRole('button', { name: 'Start For Time' }))
    await wallClockReaches(START + (CAP_SECONDS - 3) * 1000)
    expect(raceClock()).toHaveAttribute('data-loop', 'run')

    await user.click(screen.getByRole('button', { name: 'Finish' }))
    expect(timerFrame()).toHaveClass('clr-chamfer--timer')
    expect(digits().style.color).toBe('var(--text-timer)')
    expect(raceClock()).toHaveAttribute('data-loop', 'still')
    expect(document.querySelector('[data-loop="run"]')).toBeNull()
  })
})

// TASK-008 (C22, C23, C24, C61; R126) supersedes "the shipped low state and
// nothing more": the race warns on its cap minus its elapsed time — the low
// colour at ten seconds, the breathe and the one soft screen edge in the last
// five while it runs — with no stepped micro-pulse. A3 TASK-108 (round-07
// R7-2): every case is ported onto the For Time `/workout` draws (Round 7's
// TimedWorkoutFlow through BlockSlot under the product presentation), whose
// race clock is one whole TimerFrame, the app's Card in the timer role.
describe('the clock takes the shared countdown warning', () => {
  it('is not low, and claims no loop, while there is time left', async () => {
    reduceMotion(false)
    const user = userWithTimers()
    renderRouteForTime(forTimeBlock(), completionDouble().api)

    await user.click(screen.getByRole('button', { name: ROUTE_START }))
    await wallClockReaches(START + (CAP_SECONDS - 11) * 1000)

    // Eleven seconds before the cap: the build said "Cap in 00:11"; Round 7
    // says "Elapsed" 07:49 beside its card's `8 MIN CAP` (updated under Eric's
    // rule of 2026-11-23, "Yes, approve").
    expect(routeClock()).toHaveTextContent('Elapsed')
    expect(routeClock()).toHaveTextContent('07:49')
    expect(routeCap()).toHaveTextContent(/^8 MIN CAP/)
    expect(routeClock()).not.toHaveAttribute('data-urgent')
    expect(routeClock()).not.toHaveAttribute('data-loop')
    expect(routeFrame()).toHaveClass('clr-chamfer--timer')
    expect(routeFrame()).not.toHaveClass('clr-chamfer--timer-low')
    expect(routeDigits().style.color).toBe('var(--text-timer)')
  })

  it('goes low in the last ten seconds: stepped over --dur-alert, no stepped pulse, no glow; the breathe and the edge in the last five', async () => {
    reduceMotion(false)
    const user = userWithTimers()
    renderRouteForTime(forTimeBlock(), completionDouble().api)

    await user.click(screen.getByRole('button', { name: ROUTE_START }))
    await wallClockReaches(START + (CAP_SECONDS - 10) * 1000)

    // One role change moves bar, body and emission together.
    expect(routeFrame()).toHaveClass('clr-chamfer--timer-low')
    expect(routeFrame()).not.toHaveClass('clr-chamfer--timer')
    expect(nestedCards()).toEqual([])

    // The digits cross over on the frame's schedule, and each one tumbles.
    expect(routeDigits().style.color).toBe('var(--text-timer-low)')
    expect(routeDigits().style.transition).toBe('color var(--dur-alert) var(--step-4)')
    expect(routeDigits().querySelectorAll('.clr-tumble')).toHaveLength(4)

    // The colour alone at ten: no stepped pulse, no loop, no edge.
    expect(document.querySelectorAll('.clr-pulse-micro')).toHaveLength(0)
    expect(routeClock()).not.toHaveAttribute('data-loop')
    expect(edges()).toHaveLength(0)

    // No glow of the timer's own: the extra glow is the primary action's.
    expect(routeFrame().closest('.clr-card')?.querySelector('.clr-glow') ?? null).toBeNull()

    // The last five: the readout breathes on the view's running loop, with one edge.
    await wallClockReaches(START + (CAP_SECONDS - 5) * 1000)
    expect(routeClock()).toHaveAttribute('data-urgent', 'true')
    expect(routeClock()).toHaveAttribute('data-loop', 'run')
    expect(edges()).toHaveLength(1)

    // What those classes resolve to in the shipped package.
    expect(MOTION_CSS).toMatch(/--dur-slow:\s*400ms/)
    expect(MOTION_CSS).toMatch(/--dur-alert:\s*var\(--dur-slow\)/)
    expect(MOTION_CSS).toMatch(/--step-4:\s*steps\(4, end\)/)
  })

  it('gives the warning up at the cap and at a finish, keeping the outcome’s colours', async () => {
    reduceMotion(false)
    const user = userWithTimers()
    const capped = renderRouteForTime(forTimeBlock(), completionDouble().api)

    await user.click(screen.getByRole('button', { name: ROUTE_START }))
    await wallClockReaches(START + (CAP_SECONDS - 3) * 1000)
    expect(routeClock()).toHaveAttribute('data-loop', 'run')

    await wallClockReaches(START + CAP_SECONDS * 1000)
    // "Cap reached" keeps its own outcome colour; the warning itself is over.
    expect(routeClock()).toHaveTextContent('Cap reached')
    expect(routeFrame()).toHaveClass('clr-chamfer--timer-low')
    expect(routeDigits().style.color).toBe('var(--text-timer-low)')
    expect(routeClock()).not.toHaveAttribute('data-urgent')
    expect(routeClock()).not.toHaveAttribute('data-loop')
    expect(document.querySelector('[data-loop="run"]')).toBeNull()
    expect(edges()).toHaveLength(0)
    capped.unmount()

    clock = START
    renderRouteForTime(forTimeBlock(), completionDouble().api)
    await user.click(screen.getByRole('button', { name: ROUTE_START }))
    await wallClockReaches(START + (CAP_SECONDS - 3) * 1000)
    expect(routeClock()).toHaveAttribute('data-loop', 'run')

    await user.click(screen.getByRole('button', { name: 'Finish' }))
    expect(routeFrame()).toHaveClass('clr-chamfer--timer')
    expect(routeDigits().style.color).toBe('var(--text-timer)')
    expect(routeClock()).not.toHaveAttribute('data-loop')
    expect(document.querySelector('[data-loop="run"]')).toBeNull()
    expect(edges()).toHaveLength(0)
  })

  it('stays a labelled timer that is not a live region', async () => {
    const user = userWithTimers()
    renderRouteForTime(forTimeBlock(), completionDouble().api)

    await user.click(screen.getByRole('button', { name: ROUTE_START }))
    await wallClockReaches(START + 383_000)

    expect(routeClock()).not.toHaveAttribute('aria-live')
    expect(routeClock().querySelector('[aria-live], [role="status"]')).toBeNull()
    expect(routeDigits()).toHaveAttribute('aria-hidden', 'true')
    // The value a screen reader is given is words, and only when it asks.
    expect(routeClock().querySelector('.a11y-hidden')).toHaveTextContent(/6 minutes 23 seconds/)
  })

  it('takes the one loop from a loading region beside it, and gives it back', async () => {
    reduceMotion(false)
    const user = userWithTimers()
    renderRouteForTime(
      forTimeBlock(),
      completionDouble().api,
      <LoadingView label="Reading coaching for the next movement" />,
    )
    const wait = screen
      .getByText('Reading coaching for the next movement')
      .closest('[data-loop]') as HTMLElement

    await user.click(screen.getByRole('button', { name: ROUTE_START }))

    // A clock with time left has no loop, so the wait keeps its own.
    expect(wait).toHaveAttribute('data-loop', 'run')
    expect(routeClock()).not.toHaveAttribute('data-loop')

    // TASK-008: the colour at eight seconds left is no loop of its own.
    await wallClockReaches(START + (CAP_SECONDS - 8) * 1000)
    expect(wait).toHaveAttribute('data-loop', 'run')

    // The last five: the warning carries more state, so it runs and the wait is
    // stilled — still on screen, still busy, still saying what it is waiting for.
    await wallClockReaches(START + (CAP_SECONDS - 4) * 1000)
    expect(routeClock()).toHaveAttribute('data-loop', 'run')
    expect(wait).toHaveAttribute('data-loop', 'still')
    expect(wait).toHaveAttribute('aria-busy', 'true')
    expect(wait).toHaveTextContent('Reading coaching for the next movement')
    expect([...document.querySelectorAll('[data-loop="run"]')].every((node) =>
      node === routeClock() || node.matches('[data-countdown-edge]'))).toBe(true)

    // The cap arrives: nothing is running out, and the wait has its loop back.
    await wallClockReaches(START + CAP_SECONDS * 1000)
    expect(wait).toHaveAttribute('data-loop', 'run')
    expect(document.querySelectorAll('[data-loop="run"]')).toHaveLength(1)
    expect(edges()).toHaveLength(0)
    expect(APP_MOTION_CSS).toMatch(
      /\[data-loop='still'\] \.clr-scan-band,[\s\S]*?\{[^}]*animation: none/,
    )
  })

  it('is still under reduced motion and loses nothing it was saying', async () => {
    reduceMotion(true)
    const user = userWithTimers()
    renderRouteForTime(forTimeBlock(), completionDouble().api)

    await user.click(screen.getByRole('button', { name: ROUTE_START }))
    await wallClockReaches(START + (CAP_SECONDS - 4) * 1000)

    // TASK-008 (C22): the urgent readout and its aura are still, at a steady .5.
    expect(routeClock()).toHaveAttribute('data-loop', 'still')
    expect(edges()[0]).toHaveAttribute('data-loop', 'still')
    expect(document.querySelector('[data-loop="run"]')).toBeNull()

    // The reading, the words, the colour role and the controls are all there:
    // Round 7's race clock says "Elapsed" where ForTimeBlock said "Racing the
    // clock", and the cap is its card's `8 MIN CAP` where ForTimeBlock said
    // "Cap in 00:04 — finish now"; Round 7 draws no "— finish now" words
    // (updated under Eric's rule of 2026-11-23, "Yes, approve").
    expect(routeClock()).toHaveAttribute('data-urgent', 'true')
    expect(routeFrame()).toHaveClass('clr-chamfer--timer-low')
    expect(routeDigits().style.color).toBe('var(--text-timer-low)')
    expect(routeClock()).toHaveTextContent('07:56')
    expect(routeClock()).toHaveTextContent('Elapsed')
    expect(routeCap()).toHaveTextContent(/^8 MIN CAP/)
    expect(screen.getByRole('button', { name: 'Finish' })).toBeEnabled()
  })
})

// REQ-018 / E03 (TASK-033): a For Time block whose ladder carries explicit
// timing is performed as rounds, and its progress is the athlete's to declare.
describe('For Time with explicit ladder timing', () => {
  function timedLadder(timing: LadderTiming, rungs: number[]): BlockProgress {
    const block = forTimeBlock({
      repScheme: 'ladder_down',
      exercises: [
        {
          prescription: {
            exercise_id: 'wall-ball',
            target_kind: 'sequence',
            target_value: null,
            target_sequence: rungs,
          },
        },
      ],
    })
    return { ...block, ladderTiming: timing }
  }

  function renderSlot(block: BlockProgress) {
    const { api, reportOutcome } = completionDouble()
    render(
      <BlockCompletionContext value={api}>
        <BlockSlot block={block} />
      </BlockCompletionContext>,
    )
    return reportOutcome
  }

  /** A3 TASK-108 (R7-2): the same block through the route's dispatch, under the product presentation. */
  function renderRouteSlot(block: BlockProgress) {
    const { api, reportOutcome } = completionDouble()
    renderRouteForTime(block, api)
    return reportOutcome
  }

  it.each([
    [3, [21, 15, 9]],
    [5, [10, 8, 6, 4, 2]],
  ])('free-paced, %i rounds: rounds listed, no race clock and nothing inferred from it', (rounds, rungs) => {
    const block = timedLadder({ mode: 'for_time', rounds, interval_seconds: null, cap_seconds: null }, rungs)
    const reportOutcome = renderRouteSlot(block)

    // TASK-012 (C35, R95): every round is a tile of the compact grid — on
    // Round 7's route, `Prescribed ladder rounds` — under Round 7's meta line,
    // its rounds and the block's cap (A3 TASK-105's reading of the same line).
    expect(within(screen.getByRole('list', { name: 'Prescribed ladder rounds' })).getAllByRole('listitem')).toHaveLength(rounds)
    expect(screen.getByText(`${rounds} rounds · 08:00 cap`)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: ROUTE_START })).not.toBeInTheDocument()
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
    expect(reportOutcome).toHaveBeenLastCalledWith(block.blockId, {})
  })

  it('a capped window inside For Time states the cap it carries', () => {
    const block = timedLadder(
      { mode: 'capped_window', rounds: 4, interval_seconds: null, cap_seconds: CAP_SECONDS },
      [4, 8, 12, 16],
    )
    renderRouteSlot(block)

    // Round 7's meta line states the one cap the ladder carries (A3 TASK-105's reading).
    expect(screen.getByText('4 rounds · 08:00 cap')).toBeInTheDocument()
    // TASK-012 (C35, R95): every round is a tile of the compact grid.
    expect(within(screen.getByRole('list', { name: 'Prescribed ladder rounds' })).getAllByRole('listitem')).toHaveLength(4)
  })

  it('a For Time block with no ladder timing keeps its race clock', () => {
    renderSlot(forTimeBlock())

    expect(screen.getByRole('button', { name: 'Start For Time' })).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Rounds in this ladder' })).not.toBeInTheDocument()
  })
})
