/**
 * EXE-04b acceptance, as the user meets it:
 *
 *   · both completion paths are reachable, and they are distinct in words, in
 *     glyph and in treatment — not in hue alone;
 *   · `elapsed_seconds` and `completed_under_cap` reach the shell's one write;
 *   · finishing under the cap stops the clock at the finish, not at the cap;
 *   · the urgency treatment appears near the cap and in no other state;
 *   · the clock survives a refresh — here, a remount against the same storage.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  BlockCompletionContext,
  type BlockCompletionApi,
  type BlockOutcome,
} from '../state/block-completion'
import { readForTimeState, type ShellStorage } from '../state/workout-persistence'
import type { BlockProgress } from '../state/workout-progress'
import { sessionProgress } from '../state/workout-progress'
import { snapshotFixture, type BlockFixture } from '../test/workout-double'
import { ForTimeBlock } from './for-time-block'

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
  const completeBlock = vi.fn<(blockId: string, outcome: BlockOutcome) => void>()
  const api: BlockCompletionApi = { completeBlock, isBlockRecorded: () => false }
  return { api, completeBlock }
}

function renderForTime(
  block: BlockProgress,
  storage: ShellStorage,
  api: BlockCompletionApi,
) {
  return render(
    <BlockCompletionContext value={api}>
      <ForTimeBlock block={block} storage={storage} now={now} />
    </BlockCompletionContext>,
  )
}

/** The readout, by the accessible name it carries in every phase. */
function readout(): HTMLElement {
  return screen.getByRole('timer', { name: 'Block time' })
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
  await vi.advanceTimersByTimeAsync(1000)
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

  it('records nothing it did not observe', async () => {
    const user = userWithTimers()
    const block = forTimeBlock()
    const { api, completeBlock } = completionDouble()
    renderForTime(block, fakeStorage(), api)

    await user.click(screen.getByRole('button', { name: 'Record For Time' }))

    // Not a zero: an unobserved elapsed time is an absence (DATA_MODEL §8).
    expect(completeBlock).toHaveBeenCalledExactlyOnceWith(block.blockId, {})
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

    expect(readout().className).toContain('clr-chamfer--timer')
    expect(readout().className).not.toContain('clr-chamfer--timer-low')
    expect(readout().className).not.toContain('pulse-micro')
  })

  it('turns urgent in the last ten seconds — words, pulse and hue together', async () => {
    const user = userWithTimers()
    renderForTime(forTimeBlock(), fakeStorage(), completionDouble().api)

    await user.click(screen.getByRole('button', { name: 'Start For Time' }))

    await wallClockReaches(START + (CAP_SECONDS - 7) * 1000)

    // The sentence changes, not just the colour — the pulse is disabled under
    // `prefers-reduced-motion`, so the words have to carry it too.
    expect(screen.getByText('Cap in 00:07 — finish now')).toBeInTheDocument()
    expect(readout().className).toContain('clr-chamfer--timer-low')
    expect(readout().className).toContain('pulse-micro')
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
    const { api, completeBlock } = completionDouble()
    renderForTime(block, fakeStorage(), api)

    await user.click(screen.getByRole('button', { name: 'Start For Time' }))
    clock = START + 383_000
    await user.click(screen.getByRole('button', { name: 'Finish' }))
    await user.click(screen.getByRole('button', { name: 'Record For Time' }))

    expect(completeBlock).toHaveBeenCalledExactlyOnceWith(block.blockId, {
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

    expect(readout().className).not.toContain('clr-chamfer--timer-low')
    expect(readout().className).not.toContain('pulse-micro')
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
    expect(readout().className).toContain('clr-chamfer--timer-low')
    // The clock has stopped: nothing is running out, so nothing pulses.
    expect(readout().className).not.toContain('pulse-micro')
  })

  it('supplies the cap and the cap-expiry outcome to the shell', async () => {
    const user = userWithTimers()
    const block = forTimeBlock()
    const { api, completeBlock } = completionDouble()
    renderForTime(block, fakeStorage(), api)

    await user.click(screen.getByRole('button', { name: 'Start For Time' }))
    await wallClockReaches(START + 600_000)
    await user.click(screen.getByRole('button', { name: 'Record For Time' }))

    expect(completeBlock).toHaveBeenCalledExactlyOnceWith(block.blockId, {
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
    const { api, completeBlock } = completionDouble()
    renderForTime(block, storage, api)

    expect(screen.getByText('Finished under cap')).toBeInTheDocument()
    expect(readout()).toHaveTextContent('04:10')

    await user.click(screen.getByRole('button', { name: 'Record For Time' }))
    expect(completeBlock).toHaveBeenCalledExactlyOnceWith(block.blockId, {
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
  it('says so, runs no clock, and records nothing it did not observe', async () => {
    const user = userWithTimers()
    const block = forTimeBlock({ exercises: [] })
    const { api, completeBlock } = completionDouble()
    renderForTime(block, fakeStorage(), api)

    expect(
      screen.getByText(/every movement in it was swapped\s+out/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Record For Time' }))
    expect(completeBlock).toHaveBeenCalledExactlyOnceWith(block.blockId, {})
  })
})

describe('a block with no cap', () => {
  it('counts up, states no deadline, and claims nothing about one', async () => {
    const user = userWithTimers()
    const block = forTimeBlock({ timerSeconds: null })
    const { api, completeBlock } = completionDouble()
    renderForTime(block, fakeStorage(), api)

    await user.click(screen.getByRole('button', { name: 'Start For Time' }))
    await wallClockReaches(START + 1_000_000)

    expect(screen.getByText('Racing the clock')).toBeInTheDocument()
    expect(screen.queryByText(/cap/i)).not.toBeInTheDocument()
    expect(readout().className).not.toContain('clr-chamfer--timer-low')

    await user.click(screen.getByRole('button', { name: 'Finish' }))
    await user.click(screen.getByRole('button', { name: 'Record For Time' }))

    expect(completeBlock).toHaveBeenCalledExactlyOnceWith(block.blockId, {
      elapsedSeconds: 1_000,
    })
  })
})
