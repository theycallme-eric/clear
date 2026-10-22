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
import { LoadingView } from './view-state'

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

  it('turns urgent in the last ten seconds — words, pulse and hue together', async () => {
    const user = userWithTimers()
    renderForTime(forTimeBlock(), fakeStorage(), completionDouble().api)

    await user.click(screen.getByRole('button', { name: 'Start For Time' }))

    await wallClockReaches(START + (CAP_SECONDS - 7) * 1000)

    // The sentence changes, not just the colour — the pulse is disabled under
    // `prefers-reduced-motion`, so the words have to carry it too.
    expect(screen.getByText('Cap in 00:07 — finish now')).toBeInTheDocument()
    expect(timerFrame()).toHaveClass('clr-chamfer--timer-low')
    expect(raceClock()).toHaveClass('clr-pulse-micro')
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

describe('the clock takes the shipped low state and nothing more', () => {
  it('is not low, and claims no loop, while there is time left', async () => {
    reduceMotion(false)
    const user = userWithTimers()
    renderForTime(forTimeBlock(), fakeStorage(), completionDouble().api)

    await user.click(screen.getByRole('button', { name: 'Start For Time' }))
    await wallClockReaches(START + (CAP_SECONDS - 11) * 1000)

    expect(screen.getByText('Cap in 00:11')).toBeInTheDocument()
    expect(raceClock()).toHaveAttribute('data-urgent', 'false')
    expect(raceClock()).toHaveAttribute('data-loop', 'still')
    expect(digits().style.color).toBe('var(--text-timer)')
  })

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

    // The pulse is on the whole timer card and is the view's running loop.
    expect(document.querySelectorAll('.clr-pulse-micro')).toHaveLength(1)
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

  it('stays a labelled timer that is not a live region', async () => {
    const user = userWithTimers()
    renderForTime(forTimeBlock(), fakeStorage(), completionDouble().api)

    await user.click(screen.getByRole('button', { name: 'Start For Time' }))
    await wallClockReaches(START + 383_000)

    expect(readout()).not.toHaveAttribute('aria-live')
    expect(readout().querySelector('[aria-live], [role="status"]')).toBeNull()
    expect(digits()).toHaveAttribute('aria-hidden', 'true')
    // The value a screen reader is given is words, and only when it asks.
    expect(readout().querySelector('.a11y-hidden')).toHaveTextContent(/6 minutes 23 seconds/)
  })

  it('takes the one loop from a loading region beside it, and gives it back', async () => {
    reduceMotion(false)
    const user = userWithTimers()
    renderForTime(
      forTimeBlock(),
      fakeStorage(),
      completionDouble().api,
      <LoadingView label="Reading coaching for the next movement" />,
    )
    const wait = screen
      .getByText('Reading coaching for the next movement')
      .closest('[data-loop]') as HTMLElement

    await user.click(screen.getByRole('button', { name: 'Start For Time' }))

    // A clock with time left has no loop, so the wait keeps its own.
    expect(wait).toHaveAttribute('data-loop', 'run')
    expect(raceClock()).toHaveAttribute('data-loop', 'still')

    await wallClockReaches(START + (CAP_SECONDS - 8) * 1000)

    // Low: the pulse carries more state, so it runs and the wait is stilled —
    // still on screen, still busy, still saying what it is waiting for.
    expect(raceClock()).toHaveAttribute('data-loop', 'run')
    expect(wait).toHaveAttribute('data-loop', 'still')
    expect(wait).toHaveAttribute('aria-busy', 'true')
    expect(wait).toHaveTextContent('Reading coaching for the next movement')
    expect(document.querySelectorAll('[data-loop="run"]')).toHaveLength(1)

    // The cap arrives: nothing is running out, and the wait has its loop back.
    await wallClockReaches(START + CAP_SECONDS * 1000)
    expect(wait).toHaveAttribute('data-loop', 'run')
    expect(document.querySelectorAll('[data-loop="run"]')).toHaveLength(1)
    expect(APP_MOTION_CSS).toMatch(
      /\[data-loop='still'\]\.clr-pulse-micro,[\s\S]*?\{[^}]*animation: none/,
    )
  })

  it('is still under reduced motion and loses nothing it was saying', async () => {
    reduceMotion(true)
    const user = userWithTimers()
    renderForTime(forTimeBlock(), fakeStorage(), completionDouble().api)

    await user.click(screen.getByRole('button', { name: 'Start For Time' }))
    await wallClockReaches(START + (CAP_SECONDS - 7) * 1000)

    expect(raceClock()).toHaveAttribute('data-loop', 'still')
    expect(document.querySelector('[data-loop="run"]')).toBeNull()

    // The reading, the words, the colour role and the controls are all there.
    expect(raceClock()).toHaveAttribute('data-urgent', 'true')
    expect(timerFrame()).toHaveClass('clr-chamfer--timer-low')
    expect(digits().style.color).toBe('var(--text-timer-low)')
    expect(readout()).toHaveTextContent('07:53')
    expect(screen.getByText('Racing the clock')).toBeInTheDocument()
    expect(screen.getByText('Cap in 00:07 — finish now')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Finish' })).toBeEnabled()

    // The shipped rule that makes a reduced pulse static.
    expect(MOTION_CSS).toMatch(
      /prefers-reduced-motion: reduce\) \{[\s\S]*\.clr-pulse-micro[\s\S]*animation: none/,
    )
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

  it.each([
    [3, [21, 15, 9]],
    [5, [10, 8, 6, 4, 2]],
  ])('free-paced, %i rounds: rounds listed, no race clock and nothing inferred from it', (rounds, rungs) => {
    const block = timedLadder({ mode: 'for_time', rounds, interval_seconds: null, cap_seconds: null }, rungs)
    const reportOutcome = renderSlot(block)

    expect(screen.getAllByRole('heading', { name: /^Round \d+$/ })).toHaveLength(rounds)
    expect(screen.getByText(`${rounds} rounds · for time, at your pace · 08:00 cap`)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Start For Time' })).not.toBeInTheDocument()
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
    expect(reportOutcome).toHaveBeenLastCalledWith(block.blockId, {})
  })

  it('a capped window inside For Time states the cap it carries', () => {
    const block = timedLadder(
      { mode: 'capped_window', rounds: 4, interval_seconds: null, cap_seconds: CAP_SECONDS },
      [4, 8, 12, 16],
    )
    renderSlot(block)

    expect(screen.getByText('4 rounds · 08:00 cap on the whole ladder')).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { name: /^Round \d+$/ })).toHaveLength(4)
  })

  it('a For Time block with no ladder timing keeps its race clock', () => {
    renderSlot(forTimeBlock())

    expect(screen.getByRole('button', { name: 'Start For Time' })).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Rounds in this ladder' })).not.toBeInTheDocument()
  })
})
