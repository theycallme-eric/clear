/**
 * EXE-04c acceptance, as the user meets it:
 *
 *   · the window comes from `workout_blocks.timer_seconds`, and it counts down;
 *   · a completed round is one tap on the card — no dialog, no other screen, and
 *     it is available while the clock is still running;
 *   · at the cap the card asks for the partial round, and a partial round of zero
 *     reps is a different state from no partial round at all;
 *   · `rounds_completed`, `partial_round_reps` and the elapsed time reach the
 *     shell's completion write, including when the clock is what ended the block;
 *   · the score survives a refresh and a walk to another section and back.
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  BlockCompletionContext,
  type BlockCompletionApi,
  type BlockOutcome,
} from '../state/block-completion'
import type { BlockProgress } from '../state/workout-progress'
import { sessionProgress } from '../state/workout-progress'
import {
  readAmrapState,
  WORKOUT_AMRAP_STORAGE_KEY,
  type ShellStorage,
} from '../state/workout-persistence'
import { snapshotFixture, type BlockFixture } from '../test/workout-double'
import { AmrapBlock } from './amrap-block'

/** A moment the window can be measured from, and a clock the test moves. */
const START = Date.parse('2026-09-24T10:00:00.000Z')
let clock = START
const now = () => clock

/** `localStorage`, in memory, so one test cannot see another's score. */
function fakeStorage(): ShellStorage {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  }
}

function amrapBlock(fixture: BlockFixture = {}): BlockProgress {
  const snapshot = snapshotFixture({
    sections: [
      {
        blocks: [
          {
            structureType: 'amrap',
            timerSeconds: 480,
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

function renderAmrap(
  block: BlockProgress,
  storage: ShellStorage,
  api: BlockCompletionApi,
) {
  return render(
    <BlockCompletionContext value={api}>
      <AmrapBlock block={block} storage={storage} now={now} />
    </BlockCompletionContext>,
  )
}

/** The count the rounds stepper is showing. */
function rounds(): string {
  return within(screen.getByRole('group', { name: 'Rounds completed' }))
    .getByRole('status')
    .textContent ?? ''
}

async function start(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Start AMRAP' }))
}

async function addRound(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Add a completed round' }))
}

beforeEach(() => {
  clock = START
})

afterEach(() => {
  vi.useRealTimers()
})

describe('what the AMRAP reads from the block', () => {
  it('states the window it prescribes, before it is opened', () => {
    renderAmrap(amrapBlock(), fakeStorage(), completionDouble().api)

    expect(screen.getByText('AMRAP · 8 MIN')).toBeInTheDocument()
    expect(
      screen.getByText('As many rounds as possible in 08:00.'),
    ).toBeInTheDocument()
    // Nothing is counting yet, and nothing is being scored yet either.
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Rounds completed' })).not.toBeInTheDocument()
  })

  it('names the round when two or more movements make one, per the quickfix', () => {
    renderAmrap(amrapBlock(), fakeStorage(), completionDouble().api)

    expect(screen.getByText('Each round:')).toBeInTheDocument()

    const movements = within(
      screen.getByRole('list', { name: 'Movements in this AMRAP' }),
    ).getAllByRole('listitem')
    expect(movements).toHaveLength(2)
    expect(movements[0]?.textContent).toContain('1. back squat')
  })

  it('leaves the label off a single-movement AMRAP, where the round is obvious', () => {
    renderAmrap(
      amrapBlock({ exercises: ['not_started'] }),
      fakeStorage(),
      completionDouble().api,
    )

    expect(screen.queryByText('Each round:')).not.toBeInTheDocument()
    expect(screen.getByText('1. back squat')).toBeInTheDocument()
  })

  it('says so when every movement in it was swapped out', () => {
    renderAmrap(amrapBlock({ exercises: [] }), fakeStorage(), completionDouble().api)

    expect(screen.getByText(/every movement in it was swapped out/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Start AMRAP' })).not.toBeInTheDocument()
  })
})

describe('counting rounds', () => {
  it('increments on the card, with no dialog and no other screen', async () => {
    const user = userEvent.setup()
    renderAmrap(amrapBlock(), fakeStorage(), completionDouble().api)
    await start(user)

    // The countdown is running: the round counter is live *during* the window,
    // which is what makes it the highest-frequency interaction in the app.
    expect(screen.getByRole('timer', { name: 'Time remaining' })).toHaveTextContent('08:00')
    expect(rounds()).toBe('0')

    await addRound(user)
    await addRound(user)
    await addRound(user)

    expect(rounds()).toBe('3')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('takes a round back, and never counts below the first', async () => {
    const user = userEvent.setup()
    renderAmrap(amrapBlock(), fakeStorage(), completionDouble().api)
    await start(user)

    const fewer = screen.getByRole('button', { name: 'Take back a round' })
    expect(fewer).toBeDisabled()

    await addRound(user)
    expect(rounds()).toBe('1')

    await user.click(screen.getByRole('button', { name: 'Take back a round' }))
    expect(rounds()).toBe('0')
    expect(screen.getByRole('button', { name: 'Take back a round' })).toBeDisabled()
  })
})

describe('the window closing', () => {
  it('ends on its own when the block’s seconds have passed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderAmrap(amrapBlock(), fakeStorage(), completionDouble().api)

    await start(user)
    await addRound(user)
    expect(screen.getByRole('timer', { name: 'Time remaining' })).toHaveTextContent('08:00')

    // No tap ended it: the clock did, and the card is asking for the score.
    clock = START + 480_000
    await vi.advanceTimersByTimeAsync(1000)

    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
    expect(screen.getByText('AMRAP complete')).toBeInTheDocument()
    expect(screen.getByText('08:00 on the clock')).toBeInTheDocument()
    // And the count is still there, still one tap, to be corrected at the buzzer.
    expect(rounds()).toBe('1')
  })

  it('shows the elapsed time when the user finishes early, not the cap', async () => {
    const user = userEvent.setup()
    renderAmrap(amrapBlock(), fakeStorage(), completionDouble().api)

    await start(user)
    clock = START + 323_000
    await user.click(screen.getByRole('button', { name: 'Finish early' }))

    expect(screen.getByText('AMRAP complete')).toBeInTheDocument()
    expect(screen.getByText('05:23 on the clock')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Rounds completed' })).toBeInTheDocument()
  })

  it('never expires on its own when the block prescribes no window', async () => {
    const user = userEvent.setup()
    renderAmrap(
      amrapBlock({ timerSeconds: null }),
      fakeStorage(),
      completionDouble().api,
    )

    expect(screen.getByText(/prescribes no window/i)).toBeInTheDocument()
    await start(user)

    // No countdown to show and no cap to be early of; the user ends it.
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Finish' })).toBeInTheDocument()
  })
})

describe('the partial round', () => {
  it('is asked for at the cap and nowhere before it', async () => {
    const user = userEvent.setup()
    renderAmrap(amrapBlock(), fakeStorage(), completionDouble().api)
    await start(user)

    expect(screen.queryByRole('button', { name: 'Partial round' })).not.toBeInTheDocument()

    clock = START + 480_000
    await user.click(screen.getByRole('button', { name: 'Finish early' }))

    expect(screen.getByText('No partial round recorded.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Partial round' })).toBeInTheDocument()
  })

  it('distinguishes a partial round of zero reps from no partial round at all', async () => {
    const user = userEvent.setup()
    renderAmrap(amrapBlock(), fakeStorage(), completionDouble().api)
    await start(user)
    await user.click(screen.getByRole('button', { name: 'Finish early' }))

    await user.click(screen.getByRole('button', { name: 'Partial round' }))

    // Opened, and holding a real zero — the buzzer landed on the boundary. The
    // sentence that said otherwise is gone (DATA-01d).
    const reps = screen.getByRole('group', { name: 'Reps into the next round' })
    expect(within(reps).getByRole('status')).toHaveTextContent('0')
    expect(screen.queryByText('No partial round recorded.')).not.toBeInTheDocument()

    // And it can be given up again, which is absence rather than a zero.
    await user.click(screen.getByRole('button', { name: 'No partial round' }))
    expect(screen.getByText('No partial round recorded.')).toBeInTheDocument()
  })

  it('counts the reps up and down without leaving the card', async () => {
    const user = userEvent.setup()
    renderAmrap(amrapBlock(), fakeStorage(), completionDouble().api)
    await start(user)
    await user.click(screen.getByRole('button', { name: 'Finish early' }))
    await user.click(screen.getByRole('button', { name: 'Partial round' }))

    await user.click(screen.getByRole('button', { name: 'One more rep in the partial round' }))
    await user.click(screen.getByRole('button', { name: 'One more rep in the partial round' }))
    await user.click(screen.getByRole('button', { name: 'One rep fewer in the partial round' }))

    const reps = screen.getByRole('group', { name: 'Reps into the next round' })
    expect(within(reps).getByRole('status')).toHaveTextContent('1')
  })
})

describe('what it supplies to the shell', () => {
  it('sends the score, partial round included, when the clock ended the block', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { api, completeBlock } = completionDouble()
    const block = amrapBlock()
    renderAmrap(block, fakeStorage(), api)

    await start(user)
    await addRound(user)
    await addRound(user)
    await addRound(user)
    await addRound(user)
    await addRound(user)

    clock = START + 480_000
    await vi.advanceTimersByTimeAsync(1000)

    await user.click(screen.getByRole('button', { name: 'Partial round' }))
    for (let rep = 0; rep < 8; rep += 1) {
      await user.click(
        screen.getByRole('button', { name: 'One more rep in the partial round' }),
      )
    }

    await user.click(screen.getByRole('button', { name: 'Complete AMRAP' }))

    // The acceptance criterion, in one assertion: the score including the
    // partial round, persisted at expiry.
    expect(completeBlock).toHaveBeenCalledExactlyOnceWith(block.blockId, {
      elapsedSeconds: 480,
      roundsCompleted: 5,
      partialRoundReps: 8,
    })
  })

  it('omits the partial round when none was recorded', async () => {
    const user = userEvent.setup()
    const { api, completeBlock } = completionDouble()
    const block = amrapBlock()
    renderAmrap(block, fakeStorage(), api)

    await start(user)
    await addRound(user)
    clock = START + 300_000
    await user.click(screen.getByRole('button', { name: 'Finish early' }))
    await user.click(screen.getByRole('button', { name: 'Complete AMRAP' }))

    // No `partialRoundReps` key at all: the column holds null, not a zero that
    // would read as "stopped on the boundary".
    expect(completeBlock).toHaveBeenCalledExactlyOnceWith(block.blockId, {
      elapsedSeconds: 300,
      roundsCompleted: 1,
    })
  })

  it('sends a recorded zero as a zero', async () => {
    const user = userEvent.setup()
    const { api, completeBlock } = completionDouble()
    const block = amrapBlock()
    renderAmrap(block, fakeStorage(), api)

    await start(user)
    await addRound(user)
    clock = START + 300_000
    await user.click(screen.getByRole('button', { name: 'Finish early' }))
    await user.click(screen.getByRole('button', { name: 'Partial round' }))
    await user.click(screen.getByRole('button', { name: 'Complete AMRAP' }))

    expect(completeBlock).toHaveBeenCalledExactlyOnceWith(block.blockId, {
      elapsedSeconds: 300,
      roundsCompleted: 1,
      partialRoundReps: 0,
    })
  })

  it('supplies zero rounds rather than nothing for an AMRAP that managed none', async () => {
    const user = userEvent.setup()
    const { api, completeBlock } = completionDouble()
    const block = amrapBlock()
    renderAmrap(block, fakeStorage(), api)

    await start(user)
    await user.click(screen.getByRole('button', { name: 'Finish early' }))
    await user.click(screen.getByRole('button', { name: 'Complete AMRAP' }))

    expect(completeBlock).toHaveBeenCalledExactlyOnceWith(block.blockId, {
      elapsedSeconds: 0,
      roundsCompleted: 0,
    })
  })

  it('supplies nothing at all for an AMRAP that was never started', async () => {
    const user = userEvent.setup()
    const { api, completeBlock } = completionDouble()
    const block = amrapBlock()
    renderAmrap(block, fakeStorage(), api)

    await user.click(screen.getByRole('button', { name: 'Complete AMRAP' }))

    // Nothing ran, so nothing was observed — not even a zero (DATA_MODEL §8).
    expect(completeBlock).toHaveBeenCalledExactlyOnceWith(block.blockId, {})
  })

  it('supplies no score at all for an AMRAP with nothing to perform', async () => {
    const user = userEvent.setup()
    const { api, completeBlock } = completionDouble()
    const block = amrapBlock({ exercises: [] })
    renderAmrap(block, fakeStorage(), api)

    await user.click(screen.getByRole('button', { name: 'Complete AMRAP' }))

    expect(completeBlock).toHaveBeenCalledExactlyOnceWith(block.blockId, {})
  })
})

describe('surviving a refresh', () => {
  it('comes back to the rounds that were banked, and to the window that is left', async () => {
    const user = userEvent.setup()
    const storage = fakeStorage()
    const block = amrapBlock()
    const first = renderAmrap(block, storage, completionDouble().api)

    await start(user)
    await addRound(user)
    await addRound(user)

    expect(readAmrapState(storage, block.blockId)).toEqual({
      startedAt: '2026-09-24T10:00:00.000Z',
      endedAtSeconds: null,
      roundsCompleted: 2,
      partialRoundReps: null,
    })

    // The refresh: the tree is gone, the storage is not.
    first.unmount()
    clock = START + 180_000
    renderAmrap(block, storage, completionDouble().api)

    expect(rounds()).toBe('2')
    // Five of the eight minutes are left: the window was measured from when it
    // opened, not from when the page came back.
    expect(screen.getByRole('timer', { name: 'Time remaining' })).toHaveTextContent('05:00')
  })

  it('comes back into the completion state when the buzzer went while it was away', async () => {
    const user = userEvent.setup()
    const storage = fakeStorage()
    const block = amrapBlock()
    const first = renderAmrap(block, storage, completionDouble().api)

    await start(user)
    await addRound(user)
    first.unmount()

    clock = START + 600_000
    renderAmrap(block, storage, completionDouble().api)

    // Expiry is derived from the clock, so nothing had to be running for it.
    expect(screen.getByText('AMRAP complete')).toBeInTheDocument()
    expect(screen.getByText('08:00 on the clock')).toBeInTheDocument()
    expect(rounds()).toBe('1')
  })

  it('keeps the partial round it was holding, zero included', async () => {
    const user = userEvent.setup()
    const storage = fakeStorage()
    const block = amrapBlock()
    const first = renderAmrap(block, storage, completionDouble().api)

    await start(user)
    await user.click(screen.getByRole('button', { name: 'Finish early' }))
    await user.click(screen.getByRole('button', { name: 'Partial round' }))
    first.unmount()

    renderAmrap(block, storage, completionDouble().api)

    const reps = screen.getByRole('group', { name: 'Reps into the next round' })
    expect(within(reps).getByRole('status')).toHaveTextContent('0')
  })

  it('starts from the top when the stored record cannot be used', () => {
    const storage = fakeStorage()
    storage.setItem(WORKOUT_AMRAP_STORAGE_KEY, 'not json')

    renderAmrap(amrapBlock(), storage, completionDouble().api)

    expect(screen.getByRole('button', { name: 'Start AMRAP' })).toBeInTheDocument()
  })

  it('cannot log a window longer than a cap that has since been shortened', async () => {
    const user = userEvent.setup()
    const storage = fakeStorage()
    const block = amrapBlock()
    const first = renderAmrap(block, storage, completionDouble().api)

    await start(user)
    clock = START + 400_000
    await user.click(screen.getByRole('button', { name: 'Finish early' }))
    first.unmount()

    const { api, completeBlock } = completionDouble()
    const shortened: BlockProgress = { ...block, timerSeconds: 240 }
    renderAmrap(shortened, storage, api)

    expect(screen.getByText('04:00 on the clock')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Complete AMRAP' }))
    expect(completeBlock).toHaveBeenCalledExactlyOnceWith(block.blockId, {
      elapsedSeconds: 240,
      roundsCompleted: 0,
    })
  })
})
